-- Run inside a transaction and ROLLBACK afterwards. No real files are touched.
DO $test$
DECLARE
  v_owner uuid;
  v_gig uuid := gen_random_uuid();
  v_result jsonb;
  v_base text := 'https://test.supabase.co/storage/v1/object/public/';
  v_image text;
  v_shared text;
  v_contract text;
  v_permit text;
BEGIN
  SELECT organizer_id INTO STRICT v_owner FROM public.gigs LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_image := v_base || 'listings/' || v_gig || '/old.jpg';
  v_shared := v_base || 'documents/' || v_gig || '/shared.pdf';
  v_contract := v_base || 'documents/' || v_gig || '/contract.pdf';
  v_permit := v_base || 'documents/' || v_gig || '/permit.pdf';

  INSERT INTO public.gigs (id, organizer_id, name, contract_url, business_permit_url)
  VALUES (v_gig, v_owner, 'Storage cleanup regression fixture', v_contract, v_permit);
  INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
  VALUES (v_gig, 'image', v_image, 0), (v_gig, 'image', v_shared, 1),
         (v_gig, 'document', v_shared, 0);

  -- Text-only edits must leave media alone.
  v_result := public.update_gig_with_cooldown_safely(v_gig, '{"description":"text-only edit"}', 36);
  ASSERT (v_result->>'success')::boolean, 'Text-only save failed';
  ASSERT v_result#>'{storage_cleanup,removed_urls}' = '[]'::jsonb, 'Text-only save removed media';
  ASSERT (SELECT count(*) FROM public.gig_media WHERE gig_id = v_gig) = 3, 'Media references changed';

  -- Replace/remove every media kind. A URL retained as a document stays intact.
  v_result := public.update_gig_with_cooldown_safely(v_gig, jsonb_build_object(
    'images', jsonb_build_array(v_base || 'listings/' || v_gig || '/new.jpg'),
    'contract_url', null,
    'business_permit_url', v_base || 'documents/' || v_gig || '/new-permit.pdf'
  ), 36);
  ASSERT (v_result->>'success')::boolean, 'Media replacement failed';
  ASSERT jsonb_array_length(v_result#>'{storage_cleanup,removed_urls}') = 3, 'Wrong removed URL count';
  ASSERT (v_result#>'{storage_cleanup,removed_urls}') ?& ARRAY[v_image, v_contract, v_permit], 'Missing cleanup targets';
  ASSERT NOT ((v_result#>'{storage_cleanup,removed_urls}') ? v_shared), 'Retained document marked for deletion';
  ASSERT (v_result#>>'{storage_cleanup,deleted_objects}')::integer = 0, 'SQL deleted storage objects';
  ASSERT (v_result#>>'{storage_cleanup,requires_storage_api_cleanup}')::boolean, 'Cleanup not requested';
  ASSERT (SELECT contract_url IS NULL AND reapplication_cooldown_days = 1.5 FROM public.gigs WHERE id = v_gig), 'References/cooldown not saved';

  -- Retrying the same save must not repeat the cleanup targets.
  v_result := public.update_gig_with_cooldown_safely(v_gig, jsonb_build_object(
    'images', jsonb_build_array(v_base || 'listings/' || v_gig || '/new.jpg')
  ), 36);
  ASSERT v_result#>'{storage_cleanup,removed_urls}' = '[]'::jsonb, 'Retry removed retained media';

  v_result := public.update_gig_with_cooldown_safely(v_gig, '{"documents":[]}', 36);
  ASSERT v_result#>'{storage_cleanup,removed_urls}' = jsonb_build_array(v_shared), 'Document removal missing';

  -- A rejected database write must roll back its media and scalar changes.
  BEGIN
    PERFORM public.update_gig_with_cooldown_safely(v_gig, '{"name":null,"images":[]}', 36);
    RAISE EXCEPTION 'Expected a not-null violation';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.gig_media WHERE gig_id = v_gig AND media_type = 'image') = 1, 'Failed save lost media';

  -- Verify authentication still protects the same save entry point.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.update_gig_with_cooldown_safely(v_gig, '{"images":[]}', 36);
    RAISE EXCEPTION 'Unauthenticated save unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Unauthorized' THEN RAISE; END IF;
  END;
END;
$test$;

-- Covers public CRUD RPCs and trigger functions, including other add/edit pages.
DO $audit$
DECLARE
  v_unsafe text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_unsafe
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.prosrc ~* '\m(delete\s+from|truncate(\s+table)?)\s+"?storage"?\s*\.';
  ASSERT v_unsafe IS NULL, 'Unsafe storage SQL remains: ' || v_unsafe;
END;
$audit$;
