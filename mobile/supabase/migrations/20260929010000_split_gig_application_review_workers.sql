-- Persist CV and performance-video review work independently so either result
-- can be saved and displayed without waiting for the other worker.

alter table public.gig_application_ai_reviews
  add column if not exists cv_status text not null default 'not_queued',
  add column if not exists video_status text not null default 'not_queued',
  add column if not exists cv_result jsonb not null default '{}'::jsonb,
  add column if not exists video_result jsonb not null default '{}'::jsonb,
  add column if not exists cv_started_at timestamptz,
  add column if not exists cv_completed_at timestamptz,
  add column if not exists video_started_at timestamptz,
  add column if not exists video_completed_at timestamptz;

alter table public.gig_application_ai_reviews
  drop constraint if exists gig_application_ai_reviews_cv_status_check,
  drop constraint if exists gig_application_ai_reviews_video_status_check;

alter table public.gig_application_ai_reviews
  add constraint gig_application_ai_reviews_cv_status_check check (
    cv_status in (
      'not_queued', 'queued', 'processing', 'completed', 'failed',
      'no_media', 'consent_revoked'
    )
  ),
  add constraint gig_application_ai_reviews_video_status_check check (
    video_status in (
      'not_queued', 'queued', 'processing', 'completed', 'failed',
      'no_media', 'consent_revoked'
    )
  );

create index if not exists idx_gig_application_ai_reviews_cv_queue
  on public.gig_application_ai_reviews (cv_status, queued_at)
  where cv_status in ('queued', 'processing');

create index if not exists idx_gig_application_ai_reviews_video_queue
  on public.gig_application_ai_reviews (video_status, queued_at)
  where video_status in ('queued', 'processing');

update public.gig_application_ai_reviews
set
  cv_status = 'queued',
  video_status = 'queued',
  cv_result = '{}'::jsonb,
  video_result = '{}'::jsonb,
  cv_started_at = null,
  cv_completed_at = null,
  video_started_at = null,
  video_completed_at = null
where status in ('queued', 'processing');

comment on column public.gig_application_ai_reviews.cv_status is
  'Independent lifecycle for the CV evidence worker.';
comment on column public.gig_application_ai_reviews.video_status is
  'Independent lifecycle for the performance-video evidence worker.';
comment on column public.gig_application_ai_reviews.cv_result is
  'CV-only advisory evidence persisted before video processing completes.';
comment on column public.gig_application_ai_reviews.video_result is
  'Performance-video-only advisory evidence persisted independently of the CV.';
