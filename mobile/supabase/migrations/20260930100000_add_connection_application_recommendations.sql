-- Bring group and production-team applicant matching onto the same persisted,
-- organizer-controlled recommendation pattern used by gig applications.

alter table public.groups
  add column if not exists ai_recommendation_settings jsonb not null default
  '{"enabled":true,"location_radius_km":null,"criteria":{"genres":"required","instruments":"ignore","location":"ignore","portfolio":"required"},"required_genres":[],"required_instruments":[]}'::jsonb;

alter table public.production_teams
  add column if not exists ai_recommendation_settings jsonb not null default
  '{"enabled":true,"location_radius_km":null,"criteria":{"genres":"ignore","instruments":"ignore","location":"ignore","portfolio":"required"},"required_genres":[],"required_instruments":[]}'::jsonb;

alter table public.groups
  drop constraint if exists groups_ai_recommendation_settings_object_check;
alter table public.groups
  add constraint groups_ai_recommendation_settings_object_check
  check (jsonb_typeof(ai_recommendation_settings) = 'object');

alter table public.production_teams
  drop constraint if exists production_teams_ai_recommendation_settings_object_check;
alter table public.production_teams
  add constraint production_teams_ai_recommendation_settings_object_check
  check (jsonb_typeof(ai_recommendation_settings) = 'object');

create table if not exists public.connection_application_recommendations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.booking_requests(id) on delete cascade,
  target_type text not null check (target_type in ('group', 'production_team')),
  target_id uuid not null,
  score smallint check (score is null or score between 0 and 100),
  is_verified boolean not null default false,
  is_eligible boolean not null default false,
  recommendation_status text not null check (
    recommendation_status in ('recommended', 'needs_review', 'not_eligible', 'insufficient_data')
  ),
  matched_criteria jsonb not null default '[]'::jsonb,
  missing_criteria jsonb not null default '[]'::jsonb,
  explanation text not null default '',
  criteria_snapshot jsonb not null default '{}'::jsonb,
  model_provider text not null default 'rules',
  model_version text not null default 'connection-fit-v2-server',
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connection_application_recommendations_target_score
  on public.connection_application_recommendations
  (target_type, target_id, is_eligible desc, score desc nulls last, generated_at desc);

alter table public.connection_application_recommendations enable row level security;

revoke all on table public.connection_application_recommendations from anon, authenticated;
grant select on table public.connection_application_recommendations to authenticated;

drop policy if exists "Connection managers can view application recommendations"
  on public.connection_application_recommendations;
create policy "Connection managers can view application recommendations"
on public.connection_application_recommendations
for select
to authenticated
using (
  (
    target_type = 'group'
    and exists (
      select 1
      from public.groups g
      where g.id = connection_application_recommendations.target_id
        and g.owner_id = auth.uid()
    )
  )
  or
  (
    target_type = 'production_team'
    and (
      exists (
        select 1
        from public.production_teams pt
        where pt.id = connection_application_recommendations.target_id
          and pt.owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.production_team_members ptm
        where ptm.team_id = connection_application_recommendations.target_id
          and ptm.user_id = auth.uid()
          and ptm.role in ('owner', 'manager')
      )
      or exists (
        select 1
        from public.staff_listing_access sla
        where sla.production_team_id = connection_application_recommendations.target_id
          and sla.staff_user_id = auth.uid()
          and sla.entity_type = 'production'
          and sla.access_level <= 2
          and sla.revoked_at is null
      )
    )
  )
);

comment on column public.groups.ai_recommendation_settings is
  'Owner-configured advisory criteria for group member applications.';
comment on column public.production_teams.ai_recommendation_settings is
  'Manager-configured advisory criteria for production-team applications.';
comment on table public.connection_application_recommendations is
  'Persisted advisory match results for group and production-team applications. Final decisions remain manual.';
