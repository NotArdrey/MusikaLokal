-- Gig applicant counts, organizer-only recommendation audit data, and explicit
-- performer consent for public featuring.

alter table public.gig_applications
  add column if not exists feature_consent_status text not null default 'not_requested',
  add column if not exists show_on_gig_page boolean not null default false,
  add column if not exists feature_consent_requested_at timestamptz,
  add column if not exists feature_consent_responded_at timestamptz;

alter table public.gig_applications
  drop constraint if exists gig_applications_feature_consent_status_check;

alter table public.gig_applications
  add constraint gig_applications_feature_consent_status_check
  check (feature_consent_status = any (array[
    'not_requested'::text,
    'pending'::text,
    'accepted'::text,
    'declined'::text,
    'revoked'::text
  ]));

alter table public.gig_applications
  alter column show_on_profile set default false;

comment on column public.gig_applications.feature_consent_status is
  'Per-application performer decision for public gig/profile featuring. Acceptance is independent from this status.';
comment on column public.gig_applications.show_on_gig_page is
  'True only when the performer explicitly permits public display on the gig details page.';
comment on column public.gig_applications.show_on_profile is
  'True only when the performer explicitly permits this accepted gig on their public profile.';

-- Existing accepted applications need an explicit response before remaining public.
update public.gig_applications
set
  feature_consent_status = 'pending',
  show_on_gig_page = false,
  show_on_profile = false,
  feature_consent_requested_at = coalesce(feature_consent_requested_at, now()),
  feature_consent_responded_at = null
where status in ('accepted', 'approved');

create or replace function public.prepare_gig_feature_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('accepted', 'approved')
     and (tg_op = 'INSERT' or old.status not in ('accepted', 'approved')) then
    new.feature_consent_status := 'pending';
    new.show_on_gig_page := false;
    new.show_on_profile := false;
    new.feature_consent_requested_at := now();
    new.feature_consent_responded_at := null;
  elsif tg_op = 'UPDATE'
        and old.status in ('accepted', 'approved')
        and new.status not in ('accepted', 'approved') then
    new.feature_consent_status := 'revoked';
    new.show_on_gig_page := false;
    new.show_on_profile := false;
    new.feature_consent_responded_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_gig_feature_consent on public.gig_applications;
create trigger trg_prepare_gig_feature_consent
before insert or update of status on public.gig_applications
for each row execute function public.prepare_gig_feature_consent();

create index if not exists idx_gig_applications_gig_countable
  on public.gig_applications (gig_id, status)
  where status in ('pending', 'accepted', 'approved', 'rejected', 'declined');

create index if not exists idx_gig_applications_public_featured
  on public.gig_applications (gig_id, feature_consent_responded_at desc)
  where status in ('accepted', 'approved')
    and feature_consent_status = 'accepted'
    and show_on_gig_page = true;

create table if not exists public.gig_application_recommendations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.gig_applications(id) on delete cascade,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  score smallint not null check (score between 0 and 100),
  is_verified boolean not null default false,
  is_eligible boolean not null default false,
  recommendation_status text not null check (
    recommendation_status in ('recommended', 'possible_match', 'not_eligible')
  ),
  matched_criteria jsonb not null default '[]'::jsonb,
  missing_criteria jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  criteria_snapshot jsonb not null default '{}'::jsonb,
  model_provider text not null default 'rules',
  model_version text not null default 'gig-fit-v1',
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gig_application_recommendations_gig_score
  on public.gig_application_recommendations (gig_id, is_eligible desc, score desc, generated_at desc);

alter table public.gig_application_recommendations enable row level security;

revoke all on table public.gig_application_recommendations from anon, authenticated;
grant select on table public.gig_application_recommendations to authenticated;

drop policy if exists "Gig managers can view application recommendations"
  on public.gig_application_recommendations;
create policy "Gig managers can view application recommendations"
on public.gig_application_recommendations
for select
to authenticated
using (
  exists (
    select 1
    from public.gigs g
    where g.id = gig_application_recommendations.gig_id
      and g.organizer_id = auth.uid()
  )
  or exists (
    select 1
    from public.staff_listing_access sla
    where sla.gig_id = gig_application_recommendations.gig_id
      and sla.staff_user_id = auth.uid()
      and sla.entity_type = 'venue'
      and sla.access_level <= 2
      and sla.revoked_at is null
  )
);

create or replace function public.get_visible_gig_application_counts(p_gig_ids uuid[])
returns table (gig_id uuid, applicant_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_role text;
begin
  if auth.uid() is null or coalesce(array_length(p_gig_ids, 1), 0) = 0 then
    return;
  end if;

  select lower(trim(p.role))
  into viewer_role
  from public.profiles p
  where p.id = auth.uid();

  if viewer_role is null or viewer_role = 'fan' then
    return;
  end if;

  return query
  select ga.gig_id, count(*)::bigint
  from public.gig_applications ga
  where ga.gig_id = any (p_gig_ids)
    and ga.status in ('pending', 'accepted', 'approved', 'rejected', 'declined')
    and (ga.leader_approval_status is null or ga.leader_approval_status = 'approved')
  group by ga.gig_id;
end;
$$;

revoke all on function public.get_visible_gig_application_counts(uuid[]) from public, anon;
grant execute on function public.get_visible_gig_application_counts(uuid[]) to authenticated;

create or replace function public.get_gig_featured_performers(p_gig_id uuid)
returns table (
  application_id uuid,
  gig_id uuid,
  display_name text,
  avatar_url text,
  entity_type text,
  profile_id uuid,
  group_id uuid,
  consented_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    ga.id as application_id,
    ga.gig_id,
    coalesce(
      direct_group.name,
      roster_group.name,
      roster_profile.full_name,
      nullif(ga.performer_snapshot ->> 'display_name', ''),
      applicant.full_name,
      'Featured performer'
    ) as display_name,
    coalesce(
      media.media_url,
      roster_profile.avatar_url,
      nullif(ga.performer_snapshot ->> 'avatar_url', ''),
      applicant.avatar_url
    ) as avatar_url,
    case
      when coalesce(ga.group_id, roster.group_id) is not null then 'group'
      else 'musician'
    end as entity_type,
    case
      when coalesce(ga.group_id, roster.group_id) is null
        then coalesce(roster.profile_id, ga.applicant_id)
      else null
    end as profile_id,
    coalesce(ga.group_id, roster.group_id) as group_id,
    ga.feature_consent_responded_at as consented_at
  from public.gig_applications ga
  left join public.profiles applicant on applicant.id = ga.applicant_id
  left join public.groups direct_group on direct_group.id = ga.group_id
  left join public.production_team_roster roster on roster.id = ga.production_roster_id
  left join public.profiles roster_profile on roster_profile.id = roster.profile_id
  left join public.groups roster_group on roster_group.id = roster.group_id
  left join lateral (
    select gm.media_url
    from public.group_media gm
    where gm.group_id = coalesce(ga.group_id, roster.group_id)
    order by gm.sort_order asc, gm.created_at asc
    limit 1
  ) media on true
  where ga.gig_id = p_gig_id
    and ga.status in ('accepted', 'approved')
    and ga.feature_consent_status = 'accepted'
    and ga.show_on_gig_page = true
  order by ga.feature_consent_responded_at asc nulls last, ga.created_at asc;
$$;

revoke all on function public.get_gig_featured_performers(uuid) from public;
grant execute on function public.get_gig_featured_performers(uuid) to anon, authenticated;
