-- Store only a face-cropped identity portrait for short-lived reviewer previews.
-- Full identity documents remain in their existing private identity systems.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-verification-portraits',
  'member-verification-portraits',
  false,
  1048576,
  array['image/jpeg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.member_verification_reference_faces
  add column if not exists preview_storage_path text;

comment on column public.member_verification_reference_faces.preview_storage_path is
  'Private Storage path for a face-cropped ID-holder portrait. Access is provided only through short-lived server-created signed URLs.';

commit;
