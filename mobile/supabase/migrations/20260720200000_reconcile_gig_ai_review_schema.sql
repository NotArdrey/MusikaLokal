-- Reconcile the consent-gated review worker with installations that already had
-- the legacy gig_application_ai_reviews table before 20260719010000.

alter table public.gig_application_ai_reviews
  add column if not exists consented_at timestamptz,
  add column if not exists source_summary jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists overall_summary text not null default '',
  add column if not exists limitations jsonb not null default '[]'::jsonb,
  add column if not exists model_provider text not null default 'groq',
  add column if not exists model_version text not null default '',
  add column if not exists queued_at timestamptz not null default now(),
  add column if not exists started_at timestamptz;

alter table public.gig_application_ai_reviews
  drop constraint if exists gig_application_ai_reviews_status_check;

alter table public.gig_application_ai_reviews
  add constraint gig_application_ai_reviews_status_check check (
    status in (
      'pending', 'running', 'skipped',
      'queued', 'processing', 'completed', 'partial', 'failed', 'consent_revoked'
    )
  );

create unique index if not exists gig_application_ai_reviews_application_id_key
  on public.gig_application_ai_reviews (application_id);

create index if not exists idx_gig_application_ai_reviews_gig_status
  on public.gig_application_ai_reviews (gig_id, status, updated_at desc);

comment on column public.gig_application_ai_reviews.source_summary is
  'Structured advisory source-processing results, including CV classification and face-review counts.';
