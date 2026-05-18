-- Backfill missing notifications for gig applications that were already marked fired.
-- Idempotent: skips recipients that already have a gig_application_fired notification for the application.

with fired_applications as (
  select
    ga.id as application_id,
    ga.gig_id,
    ga.applicant_id,
    ga.submitted_by_user_id,
    ga.group_id,
    ga.production_team_id,
    ga.production_roster_id,
    coalesce(g.name, 'this gig') as gig_name,
    ga.updated_at
  from public.gig_applications ga
  left join public.gigs g on g.id = ga.gig_id
  where ga.status = 'fired'
),
recipient_rows as (
  select
    fa.*,
    fa.applicant_id as user_id,
    'applicant'::text as viewer_access
  from fired_applications fa
  where fa.applicant_id is not null

  union

  select
    fa.*,
    fa.submitted_by_user_id as user_id,
    'submitter'::text as viewer_access
  from fired_applications fa
  where fa.submitted_by_user_id is not null

  union

  select
    fa.*,
    gm.user_id,
    'group_member'::text as viewer_access
  from fired_applications fa
  join public.group_members gm on gm.group_id = fa.group_id
  where fa.group_id is not null
),
deduped_recipients as (
  select distinct on (application_id, user_id)
    application_id,
    gig_id,
    group_id,
    production_team_id,
    production_roster_id,
    user_id,
    viewer_access,
    gig_name,
    updated_at
  from recipient_rows
  where user_id is not null
  order by application_id, user_id, viewer_access
)
insert into public.notifications (
  user_id,
  type,
  title,
  message,
  meta,
  created_at
)
select
  dr.user_id,
  'error',
  'Removed from Gig',
  format('Your contract for "%s" has been ended by the venue.', dr.gig_name),
  jsonb_strip_nulls(jsonb_build_object(
    'route', '/bookings',
    'route_params', jsonb_build_object('tab', 'History'),
    'application_id', dr.application_id,
    'gig_application_id', dr.application_id,
    'gig_id', dr.gig_id,
    'group_id', dr.group_id,
    'production_team_id', dr.production_team_id,
    'production_roster_id', dr.production_roster_id,
    'status', 'fired',
    'event_type', 'gig_application_fired',
    'viewer_access', dr.viewer_access,
    'backfilled', true
  )),
  coalesce(dr.updated_at, timezone('utc'::text, now()))
from deduped_recipients dr
where not exists (
  select 1
  from public.notifications n
  where n.user_id = dr.user_id
    and n.meta ->> 'application_id' = dr.application_id::text
    and n.meta ->> 'event_type' = 'gig_application_fired'
);
