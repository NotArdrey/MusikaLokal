-- Add musician signup video proof review support.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'musician-verification-videos',
  'musician-verification-videos',
  false,
  52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.musician_verification_uploads (
  id uuid primary key default gen_random_uuid(),
  email_hash text,
  signup_role text not null default 'musician',
  bucket_id text not null default 'musician-verification-videos',
  object_path text not null unique,
  original_name text,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'PENDING',
  expires_at timestamptz not null default (now() + interval '24 hours'),
  user_id uuid references public.profiles(id) on delete set null,
  manual_review_id uuid references public.manual_identity_reviews(id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint musician_verification_uploads_role_check check (signup_role = 'musician'),
  constraint musician_verification_uploads_status_check check (status in ('PENDING', 'CONSUMED', 'EXPIRED')),
  constraint musician_verification_uploads_bucket_check check (bucket_id = 'musician-verification-videos'),
  constraint musician_verification_uploads_size_check check (size_bytes > 0 and size_bytes <= 52428800),
  constraint musician_verification_uploads_mime_check check (mime_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'))
);

alter table public.musician_verification_uploads enable row level security;

drop policy if exists musician_verification_uploads_service_manage on public.musician_verification_uploads;
create policy musician_verification_uploads_service_manage
on public.musician_verification_uploads
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on public.musician_verification_uploads from public, anon, authenticated;
grant select, insert, update, delete on public.musician_verification_uploads to service_role;

create index if not exists idx_musician_verification_uploads_email_hash
  on public.musician_verification_uploads (email_hash, created_at desc);

create index if not exists idx_musician_verification_uploads_pending_expiry
  on public.musician_verification_uploads (status, expires_at);

create index if not exists idx_musician_verification_uploads_user_id
  on public.musician_verification_uploads (user_id);

alter table public.manual_identity_reviews
  add column if not exists music_video_path text,
  add column if not exists music_video_original_name text,
  add column if not exists music_video_mime_type text,
  add column if not exists music_video_size_bytes bigint,
  add column if not exists music_video_uploaded_at timestamptz;

alter table public.manual_identity_reviews
  drop constraint if exists manual_identity_reviews_source_check;

alter table public.manual_identity_reviews
  add constraint manual_identity_reviews_source_check
  check (source = any (array[
    'MANUAL_UPLOAD'::text,
    'DIDIT_PENDING'::text,
    'DIDIT_DUPLICATE'::text,
    'MUSICIAN_VIDEO'::text
  ]));

alter table public.manual_identity_reviews
  drop constraint if exists manual_identity_reviews_music_video_size_check;

alter table public.manual_identity_reviews
  add constraint manual_identity_reviews_music_video_size_check
  check (music_video_size_bytes is null or (music_video_size_bytes > 0 and music_video_size_bytes <= 52428800));

alter table public.manual_identity_reviews
  drop constraint if exists manual_identity_reviews_music_video_mime_check;

alter table public.manual_identity_reviews
  add constraint manual_identity_reviews_music_video_mime_check
  check (music_video_mime_type is null or music_video_mime_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'));

alter table public.registration_attempts
  drop constraint if exists registration_attempts_action_check;

alter table public.registration_attempts
  add constraint registration_attempts_action_check
  check (action = any (array[
    'create_didit_session'::text,
    'create_unverified_user'::text,
    'manual_identity_review'::text,
    'musician_video_upload'::text,
    'resend_confirmation_email'::text
  ]));

comment on table public.musician_verification_uploads is
  'Tracks pre-auth musician signup music-video proof uploads before admin review.';

comment on column public.manual_identity_reviews.music_video_path is
  'Private storage object path in musician-verification-videos for musician signup proof.';
