-- Separate, consent-gated registered-member presence verification.
-- This data never changes the deterministic gig-match score or application status.

begin;

alter table public.gig_applications
  add column if not exists member_verification_consent boolean not null default false,
  add column if not exists member_verification_consented_at timestamptz;

alter table public.gig_application_members
  add column if not exists member_verification_consent boolean not null default false,
  add column if not exists member_verification_consented_at timestamptz;

create or replace function public.normalize_member_verification_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.member_verification_consent then
    if tg_op = 'INSERT' or not coalesce(old.member_verification_consent, false) then
      new.member_verification_consented_at := now();
    else
      new.member_verification_consented_at := coalesce(old.member_verification_consented_at, now());
    end if;
  else
    new.member_verification_consented_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_application_member_verification_consent
  on public.gig_applications;
create trigger trg_normalize_application_member_verification_consent
before insert or update of member_verification_consent, member_verification_consented_at
on public.gig_applications
for each row execute function public.normalize_member_verification_consent();

drop trigger if exists trg_normalize_roster_member_verification_consent
  on public.gig_application_members;
create trigger trg_normalize_roster_member_verification_consent
before insert or update of member_verification_consent, member_verification_consented_at
on public.gig_application_members
for each row execute function public.normalize_member_verification_consent();

comment on column public.gig_applications.member_verification_consent is
  'Separate consent to compare registered reference/profile photos with faces in the submitted performance video. Independent of AI portfolio review consent.';
comment on column public.gig_application_members.member_verification_consent is
  'Per-roster-member consent for registered-member presence verification in a group application.';

create table if not exists public.member_verification_reference_faces (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'aws_rekognition' check (provider = 'aws_rekognition'),
  collection_id text not null,
  face_id text,
  external_image_id text not null,
  reference_image_hash text not null,
  status text not null check (status in ('indexed', 'reference_unusable', 'needs_review', 'failed', 'deleted')),
  detected_face_count integer not null default 0 check (detected_face_count >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  indexed_at timestamptz,
  deleted_at timestamptz,
  unique (member_id, collection_id),
  unique (collection_id, face_id)
);

create table if not exists public.gig_application_member_verifications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.gig_applications(id) on delete cascade,
  status text not null default 'not_requested' check (
    status in ('not_requested', 'queued', 'processing', 'completed', 'failed', 'consent_revoked')
  ),
  result text check (
    result is null or result in ('verified', 'partially_verified', 'needs_review', 'unavailable', 'no_reference', 'no_video')
  ),
  expected_member_count integer not null default 0 check (expected_member_count >= 0),
  verified_member_count integer not null default 0 check (
    verified_member_count >= 0 and verified_member_count <= expected_member_count
  ),
  roster_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(roster_snapshot) = 'array'),
  video_version text,
  roster_version text,
  client_request_token text unique,
  aws_job_id text,
  aws_collection_id text,
  video_object_key text,
  configured_face_match_threshold numeric check (
    configured_face_match_threshold is null
    or configured_face_match_threshold between 0 and 100
  ),
  additional_people_detected boolean not null default false,
  poll_attempt_count integer not null default 0 check (poll_attempt_count >= 0),
  next_poll_at timestamptz,
  error_code text,
  error_message text,
  consented_at timestamptz,
  queued_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gig_application_member_verification_results (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.gig_application_member_verifications(id) on delete cascade,
  application_id uuid not null references public.gig_applications(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  reference_face_id uuid references public.member_verification_reference_faces(id) on delete set null,
  status text not null check (status in ('verified', 'needs_review', 'no_reference', 'reference_unusable', 'consent_missing')),
  best_similarity numeric check (best_similarity is null or best_similarity between 0 and 100),
  match_count integer not null default 0 check (match_count >= 0),
  first_match_timestamp_ms bigint check (first_match_timestamp_ms is null or first_match_timestamp_ms >= 0),
  best_match_timestamp_ms bigint check (best_match_timestamp_ms is null or best_match_timestamp_ms >= 0),
  matched_person_indexes integer[] not null default '{}'::integer[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (verification_id, member_id)
);

create index if not exists idx_member_verification_reference_faces_member
  on public.member_verification_reference_faces (member_id, status, updated_at desc);
create index if not exists idx_gig_member_verifications_status_poll
  on public.gig_application_member_verifications (status, next_poll_at)
  where status in ('queued', 'processing');
create index if not exists idx_gig_member_verification_results_application
  on public.gig_application_member_verification_results (application_id, status);

alter table public.member_verification_reference_faces enable row level security;
alter table public.gig_application_member_verifications enable row level security;
alter table public.gig_application_member_verification_results enable row level security;

revoke all on table public.member_verification_reference_faces from anon, authenticated;
revoke all on table public.gig_application_member_verifications from anon, authenticated;
revoke all on table public.gig_application_member_verification_results from anon, authenticated;

comment on table public.member_verification_reference_faces is
  'Rekognition face-vector references keyed by registered member and source-image hash. Original images and raw vectors are not stored here.';
comment on table public.gig_application_member_verifications is
  'Application-level asynchronous member-presence verification. It is separate from AI evidence and deterministic match scoring.';
comment on table public.gig_application_member_verification_results is
  'Minimal per-roster-member presence result: status, similarity, match count, and timestamps only.';

commit;

