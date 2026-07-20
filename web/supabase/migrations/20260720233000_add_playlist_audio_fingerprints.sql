-- Internal same-recording matching for playlist audio and gig performance videos.
-- ACRCloud stores the actual fingerprint; this table is the authoritative,
-- user-scoped link from an ACRCloud custom-file match back to a playlist item.

create table if not exists public.playlist_audio_fingerprints (
  id uuid primary key default gen_random_uuid(),
  playlist_item_id uuid not null unique references public.playlist_items(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'acrcloud_custom',
  provider_bucket_id text,
  provider_file_id text,
  provider_acrid text,
  status text not null default 'processing',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint playlist_audio_fingerprints_provider_check
    check (provider in ('acrcloud_custom')),
  constraint playlist_audio_fingerprints_status_check
    check (status in ('processing', 'ready', 'error'))
);

create unique index if not exists idx_playlist_audio_fingerprints_provider_acrid
  on public.playlist_audio_fingerprints (provider, provider_acrid)
  where provider_acrid is not null;

create index if not exists idx_playlist_audio_fingerprints_owner
  on public.playlist_audio_fingerprints (owner_user_id, status, updated_at desc);

alter table public.playlist_audio_fingerprints enable row level security;

drop policy if exists playlist_audio_fingerprints_select_own on public.playlist_audio_fingerprints;
create policy playlist_audio_fingerprints_select_own
  on public.playlist_audio_fingerprints
  for select
  using (
    owner_user_id = auth.uid()
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'admin'
    )
  );

grant select on public.playlist_audio_fingerprints to authenticated;
grant all on public.playlist_audio_fingerprints to service_role;

comment on table public.playlist_audio_fingerprints is
  'Maps private ACRCloud custom-content fingerprints to user-owned playlist items for same-recording evidence.';
comment on column public.playlist_audio_fingerprints.provider_acrid is
  'ACRCloud custom-file ACRID returned by the custom recognition project; not a copyright ownership identifier.';
comment on column public.playlist_audio_fingerprints.status is
  'Provider indexing state. A match is trusted only after ACRCloud returns the provider ACRID during identification.';
