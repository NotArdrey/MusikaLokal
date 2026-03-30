-- Fix delete_gig_safely for Supabase Storage hardening
-- Direct DELETE on storage.objects is blocked; cleanup must happen via Storage API.

CREATE OR REPLACE FUNCTION public.delete_gig_safely(
  p_gig_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_uid UUID;
  v_gig RECORD;
  v_pending_count INTEGER := 0;
  v_accepted_count INTEGER := 0;
  v_related_counts JSONB;
  v_applicant_counts JSONB;
  v_storage_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_pairs JSONB := '[]'::JSONB;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
  v_storage_cleanup JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_gig
  FROM public.gigs g
  WHERE g.id = p_gig_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GIG_NOT_FOUND',
      'message', 'Gig not found.'
    );
  END IF;

  IF v_gig.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this gig';
  END IF;

  SELECT COUNT(*)
  INTO v_pending_count
  FROM public.gig_applications ga
  WHERE ga.gig_id = p_gig_id
    AND ga.status = 'pending';

  SELECT COUNT(*)
  INTO v_accepted_count
  FROM public.gig_applications ga
  WHERE ga.gig_id = p_gig_id
    AND ga.status = 'accepted';

  IF v_accepted_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACTIVE_ACCEPTED_APPLICATIONS_EXIST',
      'accepted_application_count', v_accepted_count,
      'pending_application_count', v_pending_count,
      'message', 'Delete blocked. Resolve accepted applications first to avoid silently invalidating confirmed musicians.'
    );
  END IF;

  IF v_pending_count > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Gig Posting Removed',
      COALESCE(v_gig.name, 'A gig') || ' was removed by the organizer. Your pending application has been closed.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_deleted',
        'reason', p_reason,
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'pending';
  END IF;

  v_related_counts := jsonb_build_object(
    'gig_applications_total', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE gig_id = p_gig_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE gig_id = p_gig_id)
  );

  v_applicant_counts := jsonb_build_object(
    'pending', v_pending_count,
    'accepted', v_accepted_count,
    'rejected', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'rejected')
  );

  SELECT array_agg(gm.media_url)
  INTO v_storage_urls
  FROM public.gig_media gm
  WHERE gm.gig_id = p_gig_id
    AND gm.media_url IS NOT NULL
    AND btrim(gm.media_url) <> '';

  IF v_storage_urls IS NULL THEN
    v_storage_urls := ARRAY[]::TEXT[];
  END IF;

  IF v_gig.contract_url IS NOT NULL AND btrim(v_gig.contract_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_gig.contract_url;
  END IF;

  IF v_gig.business_permit_url IS NOT NULL AND btrim(v_gig.business_permit_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_gig.business_permit_url;
  END IF;

  WITH parsed AS (
    SELECT
      (m)[1] AS bucket_id,
      split_part((m)[2], '?', 1) AS object_path
    FROM (
      SELECT regexp_matches(
        u.url,
        '/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$'
      ) AS m
      FROM unnest(v_storage_urls) AS u(url)
      WHERE u.url IS NOT NULL
    ) t
    WHERE m IS NOT NULL
  ), dedup AS (
    SELECT DISTINCT bucket_id, object_path
    FROM parsed
    WHERE object_path <> ''
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('bucket_id', bucket_id, 'object_path', object_path)), '[]'::jsonb),
    COUNT(*)
  INTO v_storage_pairs, v_storage_objects_to_delete
  FROM dedup;

  -- Do NOT delete directly from storage.objects here.
  -- Storage cleanup must be executed through the Storage API by a trusted service layer.
  v_storage_deleted_count := 0;

  v_storage_cleanup := jsonb_build_object(
    'candidate_urls', COALESCE(array_length(v_storage_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count,
    'requires_storage_api_cleanup', (v_storage_objects_to_delete > 0),
    'objects', v_storage_pairs
  );

  INSERT INTO public.gig_deletion_audit (
    gig_id,
    organizer_id,
    deleted_by,
    gig_snapshot,
    related_counts,
    applicant_counts,
    storage_cleanup,
    reason
  )
  VALUES (
    p_gig_id,
    v_gig.organizer_id,
    v_uid,
    to_jsonb(v_gig),
    v_related_counts,
    v_applicant_counts,
    v_storage_cleanup,
    p_reason
  );

  DELETE FROM public.gigs
  WHERE id = p_gig_id
    AND organizer_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete gig';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'gig_id', p_gig_id,
    'related_counts', v_related_counts,
    'applicant_counts', v_applicant_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(UUID, TEXT) TO authenticated;
