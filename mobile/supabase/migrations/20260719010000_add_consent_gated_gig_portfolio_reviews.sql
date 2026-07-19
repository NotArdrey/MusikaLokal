-- Consent-gated, advisory AI evidence review for gig application attachments.
-- These records never participate in application status, eligibility, or score changes.

alter table public.gig_applications
  add column if not exists ai_portfolio_review_consent boolean not null default false,
  add column if not exists ai_portfolio_review_consented_at timestamptz,
  add column if not exists ai_review_frame_url text;

comment on column public.gig_applications.ai_portfolio_review_consent is
  'Explicit applicant consent to send application CV text, video audio, and representative portfolio images to the configured AI provider for advisory evidence review.';
comment on column public.gig_applications.ai_portfolio_review_consented_at is
  'Time at which the applicant granted AI portfolio review consent for this application.';
comment on column public.gig_applications.ai_review_frame_url is
  'A client-generated representative frame from the submitted performance video. It is reviewed only when AI portfolio review consent is true.';

create or replace function public.normalize_gig_ai_review_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.ai_portfolio_review_consent then
    if tg_op = 'INSERT' then
      new.ai_portfolio_review_consented_at := now();
    elsif not coalesce(old.ai_portfolio_review_consent, false) then
      new.ai_portfolio_review_consented_at := now();
    else
      new.ai_portfolio_review_consented_at := coalesce(old.ai_portfolio_review_consented_at, now());
    end if;
  else
    new.ai_portfolio_review_consented_at := null;
    new.ai_review_frame_url := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_gig_ai_review_consent on public.gig_applications;
create trigger trg_normalize_gig_ai_review_consent
before insert or update of ai_portfolio_review_consent, ai_portfolio_review_consented_at, ai_review_frame_url
on public.gig_applications
for each row execute function public.normalize_gig_ai_review_consent();

create table if not exists public.gig_application_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.gig_applications(id) on delete cascade,
  gig_id uuid not null references public.gigs(id) on delete cascade,
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'completed', 'partial', 'failed', 'consent_revoked')
  ),
  consented_at timestamptz not null,
  source_summary jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  overall_summary text not null default '',
  limitations jsonb not null default '[]'::jsonb,
  model_provider text not null default 'groq',
  model_version text not null default '',
  error_message text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.gig_application_ai_reviews is
  'Advisory evidence extracted from consented application media. This table must not be used to accept/reject applicants or alter deterministic recommendation scores.';

create index if not exists idx_gig_application_ai_reviews_gig_status
  on public.gig_application_ai_reviews (gig_id, status, updated_at desc);

alter table public.gig_application_ai_reviews enable row level security;

revoke all on table public.gig_application_ai_reviews from anon, authenticated;
grant select on table public.gig_application_ai_reviews to authenticated;

drop policy if exists "Applicants and gig managers can view AI portfolio reviews"
  on public.gig_application_ai_reviews;
create policy "Applicants and gig managers can view AI portfolio reviews"
on public.gig_application_ai_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.gig_applications ga
    where ga.id = gig_application_ai_reviews.application_id
      and (ga.applicant_id = auth.uid() or ga.submitted_by_user_id = auth.uid())
  )
  or exists (
    select 1
    from public.gigs g
    where g.id = gig_application_ai_reviews.gig_id
      and g.organizer_id = auth.uid()
  )
  or exists (
    select 1
    from public.staff_listing_access sla
    where sla.gig_id = gig_application_ai_reviews.gig_id
      and sla.staff_user_id = auth.uid()
      and sla.entity_type = 'venue'
      and sla.access_level <= 2
      and sla.revoked_at is null
  )
);
