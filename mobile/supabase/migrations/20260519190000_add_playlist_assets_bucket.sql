-- Storage bucket and policies for playlist cover art, teaser clips, and track previews.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'playlist-assets',
  'playlist-assets',
  true,
  52428800,
  array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'audio/mpeg',
    'audio/mp3',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
on conflict (id) do update
set
  public = true,
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

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'playlist_assets_owner_insert'
  ) then
    create policy playlist_assets_owner_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'playlist-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'playlist_assets_public_select'
  ) then
    create policy playlist_assets_public_select on storage.objects
      for select to public
      using (bucket_id = 'playlist-assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'playlist_assets_owner_update'
  ) then
    create policy playlist_assets_owner_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'playlist-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'playlist-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'playlist_assets_owner_delete'
  ) then
    create policy playlist_assets_owner_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'playlist-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;
