-- Safe gig management: guarded delete + guarded update with audit, notifications, and storage cleanup.

CREATE TABLE IF NOT EXISTS public.gig_deletion_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gig_id UUID NOT NULL,
  organizer_id UUID,
  deleted_by UUID,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  gig_snapshot JSONB NOT NULL,
  related_counts JSONB NOT NULL,
  applicant_counts JSONB NOT NULL,
  storage_cleanup JSONB,
  reason TEXT
);

ALTER TABLE public.gig_deletion_audit ENABLE ROW LEVEL SECURITY;

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

  -- Collect storage URLs from gig_media (3NF: images/documents live here now)
  SELECT array_agg(gm.media_url)
  INTO v_storage_urls
  FROM public.gig_media gm
  WHERE gm.gig_id = p_gig_id
    AND gm.media_url IS NOT NULL
    AND btrim(gm.media_url) <> '';

  IF v_storage_urls IS NULL THEN
    v_storage_urls := ARRAY[]::TEXT[];
  END IF;

  -- Also collect contract_url and business_permit_url from the gigs row
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

  IF v_storage_objects_to_delete > 0 THEN
    WITH targets AS (
      SELECT
        elem->>'bucket_id' AS bucket_id,
        elem->>'object_path' AS object_path
      FROM jsonb_array_elements(v_storage_pairs) AS elem
    ), deleted AS (
      DELETE FROM storage.objects so
      USING targets t
      WHERE so.bucket_id = t.bucket_id
        AND so.name = t.object_path
      RETURNING so.id
    )
    SELECT COUNT(*) INTO v_storage_deleted_count FROM deleted;
  END IF;

  v_storage_cleanup := jsonb_build_object(
    'candidate_urls', COALESCE(array_length(v_storage_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count
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

CREATE OR REPLACE FUNCTION public.update_gig_safely(
  p_gig_id UUID,
  p_payload JSONB,
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
  v_updated_gig RECORD;
  v_existing_requirements JSONB;
  v_new_requirements JSONB;
  v_existing_event_start TEXT;
  v_existing_event_end TEXT;
  v_new_event_start TEXT;
  v_new_event_end TEXT;
  v_existing_total_slots INTEGER;
  v_new_total_slots INTEGER;
  v_accepted_total INTEGER := 0;
  v_pending_count INTEGER := 0;
  v_accepted_count INTEGER := 0;
  v_accepted_solo INTEGER := 0;
  v_accepted_duo INTEGER := 0;
  v_accepted_band INTEGER := 0;
  v_needed_solo INTEGER;
  v_needed_duo INTEGER;
  v_needed_band INTEGER;
  v_major_change BOOLEAN := false;
  v_old_urls TEXT[] := ARRAY[]::TEXT[];
  v_new_urls TEXT[] := ARRAY[]::TEXT[];
  v_removed_urls TEXT[] := ARRAY[]::TEXT[];
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
    RAISE EXCEPTION 'Not authorized to update this gig';
  END IF;

  v_existing_requirements := COALESCE(v_gig.requirements, '{}'::JSONB);
  v_new_requirements := CASE WHEN p_payload ? 'requirements' THEN COALESCE(p_payload->'requirements', '{}'::JSONB) ELSE v_existing_requirements END;

  v_existing_event_start := v_existing_requirements->>'event_start_time';
  v_existing_event_end := v_existing_requirements->>'event_end_time';
  v_new_event_start := v_new_requirements->>'event_start_time';
  v_new_event_end := v_new_requirements->>'event_end_time';

  v_existing_total_slots := COALESCE((v_existing_requirements->>'total_slots_needed')::INTEGER, 0);
  v_new_total_slots := COALESCE((v_new_requirements->>'total_slots_needed')::INTEGER, 0);

  SELECT
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted' AND COALESCE(slot_type, 'solo') = 'solo'),
    COUNT(*) FILTER (WHERE status = 'accepted' AND COALESCE(slot_type, 'solo') = 'duo'),
    COUNT(*) FILTER (WHERE status = 'accepted' AND COALESCE(slot_type, 'solo') = 'band')
  INTO
    v_accepted_total,
    v_pending_count,
    v_accepted_solo,
    v_accepted_duo,
    v_accepted_band
  FROM public.gig_applications
  WHERE gig_id = p_gig_id;

  v_needed_solo := COALESCE((v_new_requirements->'slots'->'solo'->>'needed')::INTEGER, NULL);
  v_needed_duo := COALESCE((v_new_requirements->'slots'->'duo'->>'needed')::INTEGER, NULL);
  v_needed_band := COALESCE((v_new_requirements->'slots'->'band'->>'needed')::INTEGER, NULL);

  IF v_new_total_slots <= 0 THEN
    v_new_total_slots := COALESCE(v_needed_solo, 0) + COALESCE(v_needed_duo, 0) + COALESCE(v_needed_band, 0);
  END IF;

  IF v_new_total_slots > 0 AND v_accepted_total > v_new_total_slots THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_TOTAL',
      'accepted_total', v_accepted_total,
      'new_total_slots_needed', v_new_total_slots,
      'message', 'Update blocked. Accepted applications exceed the new total slot capacity.'
    );
  END IF;

  IF v_needed_solo IS NOT NULL AND v_accepted_solo > v_needed_solo THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_SOLO',
      'accepted_solo', v_accepted_solo,
      'new_solo_slots_needed', v_needed_solo,
      'message', 'Update blocked. Accepted solo applications exceed the new solo slot capacity.'
    );
  END IF;

  IF v_needed_duo IS NOT NULL AND v_accepted_duo > v_needed_duo THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_DUO',
      'accepted_duo', v_accepted_duo,
      'new_duo_slots_needed', v_needed_duo,
      'message', 'Update blocked. Accepted duo applications exceed the new duo slot capacity.'
    );
  END IF;

  IF v_needed_band IS NOT NULL AND v_accepted_band > v_needed_band THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_BAND',
      'accepted_band', v_accepted_band,
      'new_band_slots_needed', v_needed_band,
      'message', 'Update blocked. Accepted band applications exceed the new band slot capacity.'
    );
  END IF;

  v_major_change := (
    (CASE WHEN p_payload ? 'event_date' THEN (p_payload->>'event_date')::timestamptz ELSE v_gig.event_date END) IS DISTINCT FROM v_gig.event_date
    OR (CASE WHEN p_payload ? 'location' THEN p_payload->>'location' ELSE v_gig.location END) IS DISTINCT FROM v_gig.location
    OR v_new_event_start IS DISTINCT FROM v_existing_event_start
    OR v_new_event_end IS DISTINCT FROM v_existing_event_end
    OR COALESCE(v_new_requirements->'slots', '{}'::jsonb) IS DISTINCT FROM COALESCE(v_existing_requirements->'slots', '{}'::jsonb)
    OR COALESCE(v_new_requirements->'instruments', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_existing_requirements->'instruments', '[]'::jsonb)
    OR COALESCE(v_new_requirements->'genres', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_existing_requirements->'genres', '[]'::jsonb)
    OR (v_new_requirements->>'musician_type') IS DISTINCT FROM (v_existing_requirements->>'musician_type')
    OR (v_new_requirements->>'experience_level') IS DISTINCT FROM (v_existing_requirements->>'experience_level')
    OR v_new_total_slots IS DISTINCT FROM v_existing_total_slots
  );

  IF v_major_change AND v_accepted_total > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MAJOR_CHANGE_ACCEPTED_EXISTS',
      'accepted_application_count', v_accepted_total,
      'pending_application_count', v_pending_count,
      'message', 'Major updates are blocked while accepted applicants exist. Resolve accepted applications first.'
    );
  END IF;

  IF v_major_change AND v_pending_count > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Gig Requirements Updated',
      COALESCE(v_gig.name, 'A gig') || ' changed key details. Your pending application was closed and you may reapply if you still match the updated requirements.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_major_change_auto_reject',
        'reason', p_reason,
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'pending';

    UPDATE public.gig_applications
    SET status = 'rejected'
    WHERE gig_id = p_gig_id
      AND status = 'pending';
  END IF;

  IF v_gig.images IS NOT NULL THEN
    v_old_urls := v_old_urls || v_gig.images;
  END IF;
  IF v_gig.documents IS NOT NULL THEN
    v_old_urls := v_old_urls || v_gig.documents;
  END IF;
  IF v_gig.contract_url IS NOT NULL AND btrim(v_gig.contract_url) <> '' THEN
    v_old_urls := v_old_urls || v_gig.contract_url;
  END IF;
  IF v_gig.business_permit_url IS NOT NULL AND btrim(v_gig.business_permit_url) <> '' THEN
    v_old_urls := v_old_urls || v_gig.business_permit_url;
  END IF;

  UPDATE public.gigs
  SET
    name = CASE WHEN p_payload ? 'name' THEN p_payload->>'name' ELSE name END,
    description = CASE WHEN p_payload ? 'description' THEN p_payload->>'description' ELSE description END,
    location = CASE WHEN p_payload ? 'location' THEN p_payload->>'location' ELSE location END,
    budget = CASE WHEN p_payload ? 'budget' THEN (p_payload->>'budget')::numeric ELSE budget END,
    images = CASE
      WHEN p_payload ? 'images' THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'images')), ARRAY[]::text[])
      ELSE images
    END,
    documents = CASE
      WHEN p_payload ? 'documents' THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'documents')), ARRAY[]::text[])
      ELSE documents
    END,
    contract_url = CASE
      WHEN p_payload ? 'contract_url' THEN NULLIF(p_payload->>'contract_url', '')
      ELSE contract_url
    END,
    business_permit_url = CASE
      WHEN p_payload ? 'business_permit_url' THEN NULLIF(p_payload->>'business_permit_url', '')
      ELSE business_permit_url
    END,
    latitude = CASE WHEN p_payload ? 'latitude' THEN (p_payload->>'latitude')::double precision ELSE latitude END,
    longitude = CASE WHEN p_payload ? 'longitude' THEN (p_payload->>'longitude')::double precision ELSE longitude END,
    event_date = CASE WHEN p_payload ? 'event_date' THEN (p_payload->>'event_date')::timestamptz ELSE event_date END,
    requirements = CASE WHEN p_payload ? 'requirements' THEN p_payload->'requirements' ELSE requirements END,
    reapplication_cooldown_days = CASE
      WHEN p_payload ? 'reapplication_cooldown_days' THEN (p_payload->>'reapplication_cooldown_days')::integer
      ELSE reapplication_cooldown_days
    END
  WHERE id = p_gig_id
    AND organizer_id = v_uid
  RETURNING * INTO v_updated_gig;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update gig';
  END IF;

  IF v_updated_gig.images IS NOT NULL THEN
    v_new_urls := v_new_urls || v_updated_gig.images;
  END IF;
  IF v_updated_gig.documents IS NOT NULL THEN
    v_new_urls := v_new_urls || v_updated_gig.documents;
  END IF;
  IF v_updated_gig.contract_url IS NOT NULL AND btrim(v_updated_gig.contract_url) <> '' THEN
    v_new_urls := v_new_urls || v_updated_gig.contract_url;
  END IF;
  IF v_updated_gig.business_permit_url IS NOT NULL AND btrim(v_updated_gig.business_permit_url) <> '' THEN
    v_new_urls := v_new_urls || v_updated_gig.business_permit_url;
  END IF;

  WITH old_set AS (
    SELECT DISTINCT u AS url
    FROM unnest(v_old_urls) AS t(u)
    WHERE u IS NOT NULL AND btrim(u) <> ''
  ),
  new_set AS (
    SELECT DISTINCT u AS url
    FROM unnest(v_new_urls) AS t(u)
    WHERE u IS NOT NULL AND btrim(u) <> ''
  )
  SELECT COALESCE(array_agg(o.url), ARRAY[]::TEXT[])
  INTO v_removed_urls
  FROM old_set o
  LEFT JOIN new_set n ON n.url = o.url
  WHERE n.url IS NULL;

  WITH parsed AS (
    SELECT
      (m)[1] AS bucket_id,
      split_part((m)[2], '?', 1) AS object_path
    FROM (
      SELECT regexp_matches(
        u.url,
        '/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$'
      ) AS m
      FROM unnest(v_removed_urls) AS u(url)
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

  IF v_storage_objects_to_delete > 0 THEN
    WITH targets AS (
      SELECT
        elem->>'bucket_id' AS bucket_id,
        elem->>'object_path' AS object_path
      FROM jsonb_array_elements(v_storage_pairs) AS elem
    ), deleted AS (
      DELETE FROM storage.objects so
      USING targets t
      WHERE so.bucket_id = t.bucket_id
        AND so.name = t.object_path
      RETURNING so.id
    )
    SELECT COUNT(*) INTO v_storage_deleted_count FROM deleted;
  END IF;

  v_storage_cleanup := jsonb_build_object(
    'removed_url_count', COALESCE(array_length(v_removed_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count
  );

  SELECT COUNT(*) FILTER (WHERE status = 'accepted'),
         COUNT(*) FILTER (WHERE status = 'pending')
  INTO v_accepted_count, v_pending_count
  FROM public.gig_applications
  WHERE gig_id = p_gig_id;

  RETURN jsonb_build_object(
    'success', true,
    'gig', to_jsonb(v_updated_gig),
    'major_change', v_major_change,
    'storage_cleanup', v_storage_cleanup,
    'application_counts', jsonb_build_object(
      'accepted', v_accepted_count,
      'pending', v_pending_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_gig_safely(UUID, JSONB, TEXT) TO authenticated;
