-- Collect an individual CV from every linked member before a duo or band
-- application becomes visible to the gig organizer.

begin;

alter table public.gig_applications
  add column if not exists member_cv_status text not null default 'not_required',
  add column if not exists member_cv_required_count integer not null default 0,
  add column if not exists member_cv_submitted_count integer not null default 0,
  add column if not exists member_cv_completed_at timestamptz;

alter table public.gig_applications
  drop constraint if exists gig_applications_member_cv_status_check;

alter table public.gig_applications
  add constraint gig_applications_member_cv_status_check
  check (member_cv_status in ('not_required', 'collecting', 'ready', 'complete'));

alter table public.gig_applications
  drop constraint if exists gig_applications_member_cv_counts_check;

alter table public.gig_applications
  add constraint gig_applications_member_cv_counts_check
  check (
    member_cv_required_count >= 0
    and member_cv_submitted_count >= 0
    and member_cv_submitted_count <= member_cv_required_count
  );

create table if not exists public.gig_application_members (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.gig_applications(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  group_member_id uuid references public.group_members(id) on delete set null,
  roster_member_id uuid references public.group_roster_members(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  member_name_snapshot text not null,
  role_snapshot text,
  instrument_snapshot text,
  cv_storage_bucket text,
  cv_storage_path text,
  cv_filename text,
  cv_status text not null default 'pending'
    check (cv_status in ('pending', 'submitted')),
  ai_review_consent boolean not null default false,
  cv_submitted_at timestamptz,
  ai_review_status text not null default 'not_requested'
    check (ai_review_status in ('not_requested', 'queued', 'processing', 'completed', 'partial', 'failed', 'skipped')),
  ai_review_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, user_id)
);

create index if not exists idx_gig_application_members_user_pending
  on public.gig_application_members(user_id, cv_status, created_at desc);

create index if not exists idx_gig_application_members_application
  on public.gig_application_members(application_id, cv_status);

alter table public.gig_application_members enable row level security;

drop policy if exists "Members can view their own application CV task" on public.gig_application_members;
create policy "Members can view their own application CV task"
  on public.gig_application_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- CV files use a private bucket. The Edge Function issues short-lived signed
-- URLs only after the application is complete and the caller is authorized.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-cvs',
  'application-cvs',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/rtf',
    'text/rtf',
    'text/plain',
    'text/markdown',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members can upload their own application CVs" on storage.objects;
create policy "Members can upload their own application CVs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'application-cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Members can read their own application CVs" on storage.objects;
create policy "Members can read their own application CVs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'application-cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Members can delete their own application CVs" on storage.objects;
create policy "Members can delete their own application CVs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'application-cvs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Incomplete applications remain available to their applicant and group
-- participants, but not to the organizer or venue staff.
drop policy if exists "Gig organizers can view applications" on public.gig_applications;
create policy "Gig organizers can view applications"
  on public.gig_applications
  for select
  to authenticated
  using (
    member_cv_status in ('not_required', 'complete')
    and exists (
      select 1 from public.gigs
      where gigs.id = gig_applications.gig_id
        and gigs.organizer_id = auth.uid()
    )
  );

drop policy if exists "Gig organizers can update applications" on public.gig_applications;
create policy "Gig organizers can update applications"
  on public.gig_applications
  for update
  to authenticated
  using (
    member_cv_status in ('not_required', 'complete')
    and exists (
      select 1 from public.gigs
      where gigs.id = gig_applications.gig_id
        and gigs.organizer_id = auth.uid()
    )
  )
  with check (
    member_cv_status in ('not_required', 'complete')
    and exists (
      select 1 from public.gigs
      where gigs.id = gig_applications.gig_id
        and gigs.organizer_id = auth.uid()
    )
  );

drop policy if exists staff_can_read_assigned_gig_applications on public.gig_applications;
create policy staff_can_read_assigned_gig_applications
  on public.gig_applications
  for select
  to authenticated
  using (
    member_cv_status in ('not_required', 'complete')
    and (
      public.staff_can_read_gig(auth.uid(), gig_id)
      or (
        production_team_id is not null
        and public.staff_can_read_production(auth.uid(), production_team_id)
      )
    )
  );

drop policy if exists staff_can_manage_assigned_gig_applications on public.gig_applications;
create policy staff_can_manage_assigned_gig_applications
  on public.gig_applications
  for update
  to authenticated
  using (
    member_cv_status in ('not_required', 'complete')
    and (
      public.staff_can_manage_gig_applications(auth.uid(), gig_id)
      or (
        production_team_id is not null
        and public.staff_can_manage_production_applications(auth.uid(), production_team_id)
      )
    )
  )
  with check (
    member_cv_status in ('not_required', 'complete')
    and (
      public.staff_can_manage_gig_applications(auth.uid(), gig_id)
      or (
        production_team_id is not null
        and public.staff_can_manage_production_applications(auth.uid(), production_team_id)
      )
    )
  );

comment on table public.gig_application_members is
  'Immutable roster snapshots and member-owned CV submissions for duo and band gig applications.';

comment on column public.gig_applications.member_cv_status is
  'not_required for solo/legacy applications; collecting while members upload; ready for leader submission; complete once organizer-visible.';

commit;
