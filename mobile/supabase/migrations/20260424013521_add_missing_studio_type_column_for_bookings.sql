-- Catch-up migration: bookings queries still select studios.studio_type in some paths.
-- Keep it nullable and backfill a safe default to avoid PostgREST 400 errors.

alter table public.studios
  add column if not exists studio_type text;

update public.studios
set studio_type = coalesce(studio_type, 'recording')
where studio_type is null;
