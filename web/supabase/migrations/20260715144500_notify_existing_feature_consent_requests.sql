-- Notify performers whose accepted applications were moved to explicit private-by-default consent.

with accepted_applications as (
  select
    ga.id as application_id,
    ga.gig_id,
    coalesce(g.name, 'the gig') as gig_name,
    coalesce(ga.group_id, roster.group_id) as visible_group_id,
    coalesce(roster.profile_id, ga.applicant_id) as visible_profile_id
  from public.gig_applications ga
  join public.gigs g on g.id = ga.gig_id
  left join public.production_team_roster roster on roster.id = ga.production_roster_id
  where ga.status in ('accepted', 'approved')
    and ga.feature_consent_status = 'pending'
), consent_recipients as (
  select application_id, gig_id, gig_name, visible_profile_id as user_id
  from accepted_applications
  where visible_group_id is null

  union

  select accepted.application_id, accepted.gig_id, accepted.gig_name, groups.owner_id
  from accepted_applications accepted
  join public.groups groups on groups.id = accepted.visible_group_id
  where groups.owner_id is not null

  union

  select accepted.application_id, accepted.gig_id, accepted.gig_name, members.user_id
  from accepted_applications accepted
  join public.group_members members on members.group_id = accepted.visible_group_id
  where members.role in ('owner', 'admin')
)
insert into public.notifications (user_id, type, title, message, meta)
select distinct
  recipients.user_id,
  'info',
  'Featuring permission requested',
  format(
    'You were accepted for "%s". Choose whether you want to be featured on the gig page or your public profile.',
    recipients.gig_name
  ),
  jsonb_build_object(
    'route', '/gig_feature_consent',
    'route_params', jsonb_build_object('applicationId', recipients.application_id),
    'event_type', 'gig_feature_consent_requested',
    'application_id', recipients.application_id,
    'gig_id', recipients.gig_id,
    'consent_status', 'pending'
  )
from consent_recipients recipients
where recipients.user_id is not null
  and exists (select 1 from public.profiles profile where profile.id = recipients.user_id)
  and not exists (
    select 1
    from public.notifications notification
    where notification.user_id = recipients.user_id
      and notification.meta ->> 'event_type' = 'gig_feature_consent_requested'
      and notification.meta ->> 'application_id' = recipients.application_id::text
  );
