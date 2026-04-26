-- Manual identity review queue for unsupported IDs during signup.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'identity-manual',
  'identity-manual',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.manual_identity_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_by_email text not null,
  document_type text not null,
  document_type_key text,
  document_country text not null default 'PHL',
  source text not null default 'MANUAL_UPLOAD' check (source in ('MANUAL_UPLOAD', 'DIDIT_PENDING')),
  status text not null default 'PENDING_REVIEW' check (status in ('PENDING_REVIEW', 'APPROVED', 'DECLINED')),
  front_image_path text,
  back_image_path text,
  selfie_image_path text,
  review_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  decision_email_sent_at timestamptz,
  expected_decision_by timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_manual_identity_reviews_status_created
  on public.manual_identity_reviews (status, created_at desc);

create index if not exists idx_manual_identity_reviews_user_status
  on public.manual_identity_reviews (user_id, status, created_at desc);

create unique index if not exists idx_manual_identity_reviews_pending_manual_unique
  on public.manual_identity_reviews (user_id)
  where (status = 'PENDING_REVIEW' and source = 'MANUAL_UPLOAD');

alter table public.manual_identity_reviews enable row level security;

drop policy if exists manual_identity_reviews_select_own on public.manual_identity_reviews;
create policy manual_identity_reviews_select_own
on public.manual_identity_reviews
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists manual_identity_reviews_insert_own on public.manual_identity_reviews;
create policy manual_identity_reviews_insert_own
on public.manual_identity_reviews
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists manual_identity_reviews_update_own_pending on public.manual_identity_reviews;
create policy manual_identity_reviews_update_own_pending
on public.manual_identity_reviews
for update
to authenticated
using (auth.uid() = user_id and status = 'PENDING_REVIEW')
with check (auth.uid() = user_id and status = 'PENDING_REVIEW');

create or replace function public.set_manual_identity_reviews_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_manual_identity_reviews_updated_at on public.manual_identity_reviews;
create trigger trg_manual_identity_reviews_updated_at
before update on public.manual_identity_reviews
for each row
execute function public.set_manual_identity_reviews_updated_at();
