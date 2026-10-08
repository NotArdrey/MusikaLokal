-- The project global upload limit was 50 MiB before APK hosting. Preserve the
-- effective limits of existing buckets before raising the global limit to 128 MiB.
update storage.buckets
set file_size_limit = 52428800
where id <> 'android-releases'
  and (file_size_limit is null or file_size_limit > 52428800);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('android-releases', 'android-releases', true, 134217728,
        array['application/vnd.android.package-archive'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public URLs serve installers without sign-in. Client API roles cannot list,
-- upload, replace, or delete releases, even if another permissive policy is added.
drop policy if exists "Android releases require service credentials" on storage.objects;
create policy "Android releases require service credentials"
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'android-releases')
with check (bucket_id <> 'android-releases');
