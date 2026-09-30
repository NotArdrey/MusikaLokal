-- Freeze every registered member represented by a connection application so
-- registered-photo-to-video verification can evaluate the full applicant roster.

begin;

create table if not exists public.connection_application_members (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  group_member_id uuid references public.group_members(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_name_snapshot text not null,
  role_snapshot text,
  member_verification_consent boolean not null default true,
  member_verification_consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_request_id, user_id),
  check (member_verification_consent = true),
  check (member_verification_consented_at is not null)
);

create index if not exists idx_connection_application_members_request
  on public.connection_application_members (booking_request_id, created_at);
create index if not exists idx_connection_application_members_user
  on public.connection_application_members (user_id, created_at desc);

alter table public.connection_application_members enable row level security;
revoke all on table public.connection_application_members from anon, authenticated;

comment on table public.connection_application_members is
  'Frozen registered-member roster represented by a group-based connection application. Access is service-role only.';
comment on column public.connection_application_members.member_verification_consent is
  'Application-time attestation that the represented registered member is included in registered-photo-to-video verification.';

commit;

