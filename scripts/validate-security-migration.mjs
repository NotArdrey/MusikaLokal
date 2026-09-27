import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();

const bootstrap = `
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('role', coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role'))
$$;

create table public.profiles (
  id uuid primary key,
  role text not null,
  is_verified boolean default false,
  verification_status text default 'PENDING'
);
create table public.profile_roles (
  profile_id uuid not null,
  role text not null,
  status text not null default 'ACTIVE',
  source text not null default 'LEGACY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  primary key (profile_id, role),
  constraint profile_roles_status_check check (status in ('ACTIVE', 'PENDING_REVIEW', 'DECLINED'))
);
create table public.studios (id uuid primary key, owner_id uuid);
create table public.gigs (id uuid primary key, organizer_id uuid, status text);
create table public.production_teams (id uuid primary key, owner_id uuid);
create table public.staff_listing_access (
  id uuid primary key,
  staff_user_id uuid not null,
  entity_type text not null,
  studio_id uuid,
  gig_id uuid,
  production_team_id uuid,
  access_level smallint not null,
  can_manage_marketplace boolean not null default false,
  revoked_at timestamptz,
  updated_at timestamptz default now()
);
create table public.groups (id uuid primary key, owner_id uuid);
create table public.group_members (id uuid primary key, group_id uuid, user_id uuid);
create table public.production_team_roster (
  id uuid primary key,
  team_id uuid,
  profile_id uuid,
  group_id uuid
);
create table public.studio_bookings (
  id uuid primary key,
  user_id uuid,
  studio_id uuid,
  booking_date date,
  start_time time,
  end_time time,
  status text,
  relocation_proposed_date date,
  relocation_proposed_start_time time,
  relocation_proposed_end_time time
);
create table public.gig_applications (
  id uuid primary key,
  applicant_id uuid,
  submitted_by_user_id uuid,
  group_id uuid,
  gig_id uuid,
  production_team_id uuid,
  production_roster_id uuid,
  status text,
  leader_approval_status text,
  slot_type text,
  cancellation_reason text,
  rejected_at timestamptz,
  fired_at timestamptz,
  fired_by_user_id uuid,
  feature_consent_status text,
  show_on_gig_page boolean default false,
  show_on_profile boolean default false,
  feature_consent_responded_at timestamptz,
  acceptance_announcement_status text default 'not_available',
  acceptance_announcement_prompted_at timestamptz,
  acceptance_announcement_dismissed_at timestamptz,
  updated_at timestamptz default now()
);
create table public.gig_requirements (
  gig_id uuid,
  requirement_key text,
  requirement_value jsonb
);
create table public.reviews (
  id uuid primary key,
  author_id uuid not null,
  rating integer not null,
  content text,
  studio_id uuid,
  gig_id uuid,
  group_id uuid,
  user_id uuid,
  studio_booking_id uuid,
  gig_application_id uuid
);
create table public.audit_events (
  id uuid default gen_random_uuid() primary key,
  actor_user_id uuid,
  target_user_id uuid,
  actor_role text,
  action text not null,
  entity_table text not null,
  entity_id text not null,
  source text not null,
  metadata jsonb not null default '{}'::jsonb
);

create function public.staff_can_manage_studio_bookings(uuid, uuid)
returns boolean language sql stable as $$ select false $$;
create function public.staff_can_manage_gig_applications(uuid, uuid)
returns boolean language sql stable as $$ select false $$;

insert into public.profiles (id, role, is_verified, verification_status) values
  ('00000000-0000-0000-0000-000000000001', 'staff', true, 'APPROVED'),
  ('00000000-0000-0000-0000-000000000002', 'musician', true, 'APPROVED'),
  ('00000000-0000-0000-0000-000000000003', 'studio-owner', false, 'PENDING_REVIEW');

insert into public.profile_roles (profile_id, role, status) values
  ('00000000-0000-0000-0000-000000000002', 'musician', 'PENDING_REVIEW');
`;

try {
  await db.exec(bootstrap);
  const migration = await readFile(
    new URL("../web/supabase/migrations/20260927010000_harden_cross_role_authorization.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);

  const approvedRoles = await db.query(`
    select profile_id::text, role, status
    from public.profile_roles
    where profile_id in (
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid
    )
    order by profile_id
  `);
  if (
    approvedRoles.rows.length !== 2 ||
    approvedRoles.rows.some((row) => row.status !== "ACTIVE")
  ) {
    throw new Error("Approved legacy roles were not activated by the migration backfill.");
  }

  const pendingOwner = await db.query(`
    select count(*)::integer as count
    from public.profile_roles
    where profile_id = '00000000-0000-0000-0000-000000000003'::uuid
  `);
  if (pendingOwner.rows[0]?.count !== 0) {
    throw new Error("The migration backfill activated an unverified legacy role.");
  }

  console.log("Security migration parsed and executed against the local PostgreSQL harness.");
} finally {
  await db.close();
}
