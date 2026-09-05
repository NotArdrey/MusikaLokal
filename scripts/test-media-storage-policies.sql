-- Evaluates the installed policy expressions without changing storage objects.
-- Run in a transaction and ROLLBACK afterwards to reset test JWT settings.
DO $test$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_policy record;
  v_expression text;
  v_bucket text;
  v_allowed boolean;
BEGIN
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname IN ('media_uploader_delete', 'media_uploader_update')) = 2,
    'Uploader policies missing';

  FOR v_policy IN SELECT * FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname IN ('media_uploader_delete', 'media_uploader_update')
  LOOP
    ASSERT v_policy.roles = ARRAY['authenticated']::name[], 'Policy grants anonymous access';
    FOREACH v_expression IN ARRAY array_remove(ARRAY[v_policy.qual, v_policy.with_check], NULL)
    LOOP
      FOREACH v_bucket IN ARRAY ARRAY['avatars', 'portfolio', 'listings', 'documents', 'post-media', 'identity-manual']
      LOOP
        PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
        EXECUTE format('SELECT coalesce((%s), false) FROM (SELECT $1::text AS bucket_id, $2::text AS owner_id) objects', v_expression)
          INTO v_allowed USING v_bucket, v_owner::text;
        ASSERT v_allowed = (v_bucket IN ('avatars', 'portfolio', 'listings', 'documents')
          OR (v_bucket = 'post-media' AND v_policy.cmd = 'UPDATE')), 'Wrong owner/bucket permissions';

        EXECUTE format('SELECT coalesce((%s), false) FROM (SELECT $1::text AS bucket_id, $2::text AS owner_id) objects', v_expression)
          INTO v_allowed USING v_bucket, v_other::text;
        ASSERT NOT v_allowed, 'Uploader can change another user''s file';

        EXECUTE format('SELECT coalesce((%s), false) FROM (SELECT $1::text AS bucket_id, $2::text AS owner_id) objects', v_expression)
          INTO v_allowed USING v_bucket, NULL::text;
        ASSERT NOT v_allowed, 'Uploader can change an unowned/service file';

        PERFORM set_config('request.jwt.claim.sub', '', true);
        EXECUTE format('SELECT coalesce((%s), false) FROM (SELECT $1::text AS bucket_id, $2::text AS owner_id) objects', v_expression)
          INTO v_allowed USING v_bucket, v_owner::text;
        ASSERT NOT v_allowed, 'Anonymous caller can change a file';
      END LOOP;
    END LOOP;
  END LOOP;
END;
$test$;
