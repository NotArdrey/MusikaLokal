fo-- Resolve gig edit/delete deadlocks and improve applicant lifecycle notifications

ALTER TABLE public.gig_applications
ADD COLUMN IF NOT EXISTS reconfirmation_required_at TIMESTAMPTZ;

ALTER TABLE public.gig_applications
ADD COLUMN IF NOT EXISTS reconfirmation_due_at TIMESTAMPTZ;

ALTER TABLE public.gig_applications
ADD COLUMN IF NOT EXISTS system_status_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_gig_applications_reconfirm_due
  ON public.gig_applications (gig_id, reconfirmation_due_at)
  WHERE status = 'pending' AND reconfirmation_due_at IS NOT NULL;

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
  v_updated_requirements JSONB;
  v_updated_images TEXT[];
  v_updated_documents TEXT[];
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
  v_reconfirm_window_hours INTEGER := 24;
  v_reconfirm_due_at TIMESTAMPTZ;
  v_reconfirmation_required_count INTEGER := 0;
  v_system_rejected_pending_count INTEGER := 0;
  v_reconfirm_expired_count INTEGER := 0;
  v_soft_closed BOOLEAN := false;
  v_soft_closed_rejected_count INTEGER := 0;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    g.*,
    COALESCE(glp.requirements, '{}'::jsonb) AS legacy_requirements,
    COALESCE(glp.images, ARRAY[]::text[]) AS legacy_images,
    COALESCE(glp.documents, ARRAY[]::text[]) AS legacy_documents
  INTO v_gig
  FROM public.gigs g
  LEFT JOIN public.gigs_legacy_projection glp ON glp.id = g.id
  WHERE g.id = p_gig_id
  FOR UPDATE OF g;

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

  IF p_payload ? 'reconfirm_window_hours' THEN
    v_reconfirm_window_hours := GREATEST(1, LEAST(168, COALESCE((p_payload->>'reconfirm_window_hours')::INTEGER, 24)));
  END IF;
  v_reconfirm_due_at := NOW() + make_interval(hours => v_reconfirm_window_hours);

  WITH expired AS (
    UPDATE public.gig_applications
    SET
      status = 'rejected',
      system_status_reason = 'system_reconfirm_timeout'
    WHERE gig_id = p_gig_id
      AND status = 'pending'
      AND reconfirmation_due_at IS NOT NULL
      AND reconfirmation_due_at <= NOW()
    RETURNING applicant_id
  )
  INSERT INTO public.notifications (user_id, type, title, message, meta)
  SELECT
    e.applicant_id,
    'warning',
    'Reconfirmation Window Expired',
    COALESCE(v_gig.name, 'A gig') || ' required reconfirmation after updated terms, and your slot was released when the response window expired.',
    jsonb_build_object(
      'gig_id', p_gig_id,
      'event', 'gig_reconfirm_expired',
      'status_reason', 'system_reconfirm_timeout'
    )
  FROM expired e;

  GET DIAGNOSTICS v_reconfirm_expired_count = ROW_COUNT;

  v_existing_requirements := COALESCE(v_gig.legacy_requirements, '{}'::JSONB);
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
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Gig Terms Updated — Reconfirmation Required',
      COALESCE(v_gig.name, 'A gig') || ' changed key details. Please reconfirm within ' || v_reconfirm_window_hours || ' hours to keep your slot.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_major_change_reconfirm_required',
        'reason', p_reason,
        'reconfirm_window_hours', v_reconfirm_window_hours,
        'reconfirm_due_at', v_reconfirm_due_at,
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'accepted';

    UPDATE public.gig_applications
    SET
      status = 'pending',
      system_status_reason = 'system_reconfirm_required_terms_changed',
      reconfirmation_required_at = NOW(),
      reconfirmation_due_at = v_reconfirm_due_at
    WHERE gig_id = p_gig_id
      AND status = 'accepted';

    GET DIAGNOSTICS v_reconfirmation_required_count = ROW_COUNT;
  END IF;

  IF v_major_change AND v_pending_count > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Application Closed: Gig Requirements Changed',
      COALESCE(v_gig.name, 'A gig') || ' changed key details, so your pending application was system-closed. You can reapply if you still match the updated requirements.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_major_change_system_reject',
        'reason', p_reason,
        'status_reason', 'system_requirements_changed',
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'pending'
      AND ga.reconfirmation_due_at IS NULL;

    UPDATE public.gig_applications
    SET
      status = 'rejected',
      system_status_reason = 'system_requirements_changed'
    WHERE gig_id = p_gig_id
      AND status = 'pending'
      AND reconfirmation_due_at IS NULL;

    GET DIAGNOSTICS v_system_rejected_pending_count = ROW_COUNT;
  END IF;

  IF v_gig.legacy_images IS NOT NULL THEN
    v_old_urls := v_old_urls || v_gig.legacy_images;
  END IF;
  IF v_gig.legacy_documents IS NOT NULL THEN
    v_old_urls := v_old_urls || v_gig.legacy_documents;
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

  IF p_payload ? 'requirements' THEN
    DELETE FROM public.gig_requirements
    WHERE gig_id = p_gig_id;

    INSERT INTO public.gig_requirements (gig_id, requirement_key, requirement_value)
    SELECT p_gig_id, kv.key, kv.value
    FROM jsonb_each(COALESCE(v_new_requirements, '{}'::jsonb)) AS kv(key, value);
  END IF;

  IF p_payload ? 'images' THEN
    DELETE FROM public.gig_media
    WHERE gig_id = p_gig_id
      AND media_type = 'image';

    INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
    SELECT
      p_gig_id,
      'image',
      elem.url,
      elem.ord::integer - 1
    FROM jsonb_array_elements_text(COALESCE(p_payload->'images', '[]'::jsonb)) WITH ORDINALITY AS elem(url, ord)
    WHERE NULLIF(btrim(elem.url), '') IS NOT NULL;
  END IF;

  IF p_payload ? 'documents' THEN
    DELETE FROM public.gig_media
    WHERE gig_id = p_gig_id
      AND media_type = 'document';

    INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
    SELECT
      p_gig_id,
      'document',
      elem.url,
      elem.ord::integer - 1
    FROM jsonb_array_elements_text(COALESCE(p_payload->'documents', '[]'::jsonb)) WITH ORDINALITY AS elem(url, ord)
    WHERE NULLIF(btrim(elem.url), '') IS NOT NULL;
  END IF;

  SELECT
    COALESCE(glp.requirements, '{}'::jsonb),
    COALESCE(glp.images, ARRAY[]::text[]),
    COALESCE(glp.documents, ARRAY[]::text[])
  INTO
    v_updated_requirements,
    v_updated_images,
    v_updated_documents
  FROM public.gigs_legacy_projection glp
  WHERE glp.id = p_gig_id;

  IF v_updated_images IS NOT NULL THEN
    v_new_urls := v_new_urls || v_updated_images;
  END IF;
  IF v_updated_documents IS NOT NULL THEN
    v_new_urls := v_new_urls || v_updated_documents;
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

  IF v_new_total_slots > 0 AND v_accepted_count >= v_new_total_slots THEN
    v_soft_closed := true;

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'info',
      'Application Closed: Slots Filled',
      COALESCE(v_updated_gig.name, 'This gig') || ' has filled all available slots. Your pending application has been closed.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_soft_closed_slots_filled',
        'status_reason', 'system_slots_filled',
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'pending';

    UPDATE public.gig_applications
    SET
      status = 'rejected',
      system_status_reason = 'system_slots_filled'
    WHERE gig_id = p_gig_id
      AND status = 'pending';

    GET DIAGNOSTICS v_soft_closed_rejected_count = ROW_COUNT;

    UPDATE public.gigs
    SET status = 'closed'
    WHERE id = p_gig_id;
  ELSE
    UPDATE public.gigs
    SET status = 'open'
    WHERE id = p_gig_id
      AND status = 'closed';
  END IF;

  SELECT COUNT(*) FILTER (WHERE status = 'accepted'),
         COUNT(*) FILTER (WHERE status = 'pending')
  INTO v_accepted_count, v_pending_count
  FROM public.gig_applications
  WHERE gig_id = p_gig_id;

  RETURN jsonb_build_object(
    'success', true,
    'gig', to_jsonb(v_updated_gig) || jsonb_build_object(
      'requirements', v_updated_requirements,
      'images', to_jsonb(v_updated_images),
      'documents', to_jsonb(v_updated_documents)
    ),
    'major_change', v_major_change,
    'storage_cleanup', v_storage_cleanup,
    'reconfirmation', jsonb_build_object(
      'window_hours', v_reconfirm_window_hours,
      'required_count', v_reconfirmation_required_count,
      'expired_count', v_reconfirm_expired_count
    ),
    'system_rejected_pending_count', v_system_rejected_pending_count,
    'soft_closed', v_soft_closed,
    'soft_closed_rejected_count', v_soft_closed_rejected_count,
    'application_counts', jsonb_build_object(
      'accepted', v_accepted_count,
      'pending', v_pending_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_gig_safely(UUID, JSONB, TEXT) TO authenticated;

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
  v_cancelled_count INTEGER := 0;
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

  IF COALESCE(NULLIF(btrim(p_reason), ''), '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CANCELLATION_REASON_REQUIRED',
      'message', 'A cancellation reason is required before deleting this gig.'
    );
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

  SELECT COUNT(*) FILTER (WHERE status = 'pending'),
         COUNT(*) FILTER (WHERE status = 'accepted')
  INTO v_pending_count, v_accepted_count
  FROM public.gig_applications ga
  WHERE ga.gig_id = p_gig_id;

  IF (v_pending_count + v_accepted_count) > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      CASE WHEN ga.status = 'accepted' THEN 'error' ELSE 'warning' END,
      'Gig Cancelled',
      COALESCE(v_gig.name, 'A gig') || ' was cancelled by the organizer. Reason: ' || p_reason,
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_cancelled',
        'reason', p_reason,
        'previous_status', ga.status,
        'status_reason', 'gig_cancelled_by_organizer'
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status IN ('pending', 'accepted');

    UPDATE public.gig_applications
    SET
      status = 'cancelled',
      system_status_reason = 'gig_cancelled_by_organizer',
      reconfirmation_required_at = NULL,
      reconfirmation_due_at = NULL
    WHERE gig_id = p_gig_id
      AND status IN ('pending', 'accepted');

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;
  END IF;

  v_related_counts := jsonb_build_object(
    'gig_applications_total', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE gig_id = p_gig_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE gig_id = p_gig_id)
  );

  v_applicant_counts := jsonb_build_object(
    'pending', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'pending'),
    'accepted', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'accepted'),
    'cancelled', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'cancelled'),
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
    'cancelled_applications', v_cancelled_count,
    'related_counts', v_related_counts,
    'applicant_counts', v_applicant_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(UUID, TEXT) TO authenticated;
