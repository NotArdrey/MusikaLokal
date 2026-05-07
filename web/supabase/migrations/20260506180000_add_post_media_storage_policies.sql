-- Storage RLS policies for the post-media bucket
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'post_media_authenticated_insert') then
    create policy post_media_authenticated_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'post_media_public_select') then
    create policy post_media_public_select on storage.objects
      for select to public
      using (bucket_id = 'post-media');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'post_media_owner_delete') then
    create policy post_media_owner_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
