-- Allow screened playlist MP3 uploads in the shared documents bucket.
-- Preserve an unrestricted bucket (allowed_mime_types is null) if an environment
-- has intentionally disabled MIME filtering.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'documents',
  'documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'audio/mpeg',
    'audio/mp3'
  ]::text[]
)
on conflict (id) do update
set
  file_size_limit = greatest(
    coalesce(storage.buckets.file_size_limit, 0),
    excluded.file_size_limit
  ),
  allowed_mime_types = case
    when storage.buckets.allowed_mime_types is null then null
    else (
      select array_agg(distinct mime_type order by mime_type)
      from unnest(storage.buckets.allowed_mime_types || excluded.allowed_mime_types) as t(mime_type)
    )
  end;
