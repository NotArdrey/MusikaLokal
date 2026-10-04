create table if not exists public.connection_application_genre_reviews (
  application_id uuid primary key references public.booking_requests(id) on delete cascade,
  cache_key text not null,
  required_genres jsonb not null default '[]'::jsonb,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed')),
  result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.connection_application_genre_reviews enable row level security;
revoke all on public.connection_application_genre_reviews from anon, authenticated;
grant all on public.connection_application_genre_reviews to service_role;

comment on table public.connection_application_genre_reviews is
  'Internal cached CV and performance video genre evidence. Exposed only through authorized applicant review handlers.';
