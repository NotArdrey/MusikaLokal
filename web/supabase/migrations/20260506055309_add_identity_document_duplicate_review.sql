-- Role-scoped identity document duplicate review.
-- Stores salted fingerprints only; raw ID numbers stay out of the database.

create table if not exists public.identity_document_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  document_fingerprint text not null,
  document_type text,
  document_type_key text,
  document_country text not null default 'PHL',
  source text not null default 'DIDIT'
    check (source in ('DIDIT', 'MANUAL_UPLOAD', 'DIDIT_PENDING', 'DIDIT_DUPLICATE')),
  status text not null default 'APPROVED'
    check (status in ('APPROVED', 'PENDING_REVIEW', 'DECLINED', 'REVOKED')),
  didit_session_id text,
  manual_review_id uuid references public.manual_identity_reviews(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists idx_identity_document_claims_user_fingerprint_role
  on public.identity_document_claims (user_id, document_fingerprint, role);

create index if not exists idx_identity_document_claims_duplicate_lookup
  on public.identity_document_claims (document_fingerprint, role, status);

create index if not exists idx_identity_document_claims_user_status
  on public.identity_document_claims (user_id, status);

alter table public.identity_document_claims enable row level security;

drop policy if exists identity_document_claims_service_manage on public.identity_document_claims;
create policy identity_document_claims_service_manage
on public.identity_document_claims
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table public.manual_identity_reviews
  add column if not exists submitted_role text,
  add column if not exists didit_session_id text,
  add column if not exists document_fingerprint text,
  add column if not exists duplicate_reason text,
  add column if not exists duplicate_match_count integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.manual_identity_reviews
  drop constraint if exists manual_identity_reviews_source_check;

alter table public.manual_identity_reviews
  add constraint manual_identity_reviews_source_check
  check (source in ('MANUAL_UPLOAD', 'DIDIT_PENDING', 'DIDIT_DUPLICATE'));

create index if not exists idx_manual_identity_reviews_document_fingerprint
  on public.manual_identity_reviews (document_fingerprint)
  where document_fingerprint is not null;

create unique index if not exists idx_manual_identity_reviews_pending_user_source_unique
  on public.manual_identity_reviews (user_id, source)
  where status = 'PENDING_REVIEW';

create index if not exists idx_verification_sessions_email_status
  on public.verification_sessions ((verification_data->>'email'), status)
  where verification_data ? 'email';

create index if not exists idx_verification_sessions_user_ref
  on public.verification_sessions ((verification_data->>'user_ref'))
  where verification_data ? 'user_ref';
