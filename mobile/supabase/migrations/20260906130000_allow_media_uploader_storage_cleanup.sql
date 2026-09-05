BEGIN;

-- Storage API uploads record the uploader in owner_id. Listing paths can start
-- with a gig/studio/group ID, so folder names are not proof of file ownership.
CREATE POLICY media_uploader_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('avatars', 'portfolio', 'listings', 'documents')
    AND owner_id = (SELECT auth.uid()::text)
  );

-- Avatar, portfolio, document and feed uploads use upsert when retrying uploads.
-- Only the original uploader may overwrite an existing object.
CREATE POLICY media_uploader_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('avatars', 'portfolio', 'listings', 'documents', 'post-media')
    AND owner_id = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id IN ('avatars', 'portfolio', 'listings', 'documents', 'post-media')
    AND owner_id = (SELECT auth.uid()::text)
  );

COMMIT;
