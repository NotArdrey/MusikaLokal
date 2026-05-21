CREATE OR REPLACE FUNCTION public.delete_studio_safely(
  p_studio_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_uid UUID;
  v_studio RECORD;
  v_active_bookings_count INTEGER := 0;
  v_pending_relocation_count INTEGER := 0;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
  v_deleted_booking_request_count INTEGER := 0;
  v_related_counts JSONB;
  v_storage_cleanup JSONB;
  v_storage_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_pairs JSONB := '[]'::JSONB;
  v_active_bookings JSONB := '[]'::JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_studio
  FROM public.studios s
  WHERE s.id = p_studio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDIO_NOT_FOUND',
      'message', 'Studio not found.'
    );
  END IF;

  IF v_studio.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this studio';
  END IF;

  SELECT COUNT(*)
  INTO v_active_bookings_count
  FROM public.studio_bookings sb
  WHERE sb.studio_id = p_studio_id
    AND sb.status IN ('pending', 'confirmed', 'checked_in', 'pending_relocation');

  SELECT COUNT(*)
  INTO v_pending_relocation_count
  FROM public.studio_bookings sb
  WHERE sb.studio_id = p_studio_id
    AND sb.status = 'pending_relocation';

  IF v_active_bookings_count > 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', sb.id,
          'booking_date', sb.booking_date,
          'start_time', sb.start_time,
          'end_time', sb.end_time,
          'status', sb.status,
          'user_id', sb.user_id,
          'user_name', COALESCE(p.full_name, p.email, 'Unknown'),
          'user_email', COALESCE(p.email, ''),
          'profiles', jsonb_build_object(
            'full_name', p.full_name,
            'email', p.email
          )
        )
        ORDER BY sb.booking_date ASC, sb.start_time ASC
      ),
      '[]'::JSONB
    )
    INTO v_active_bookings
    FROM public.studio_bookings sb
    LEFT JOIN public.profiles p ON p.id = sb.user_id
    WHERE sb.studio_id = p_studio_id
      AND sb.status IN ('pending', 'confirmed', 'checked_in', 'pending_relocation');

    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACTIVE_BOOKINGS_EXIST',
      'active_booking_count', v_active_bookings_count,
      'pending_relocation_count', v_pending_relocation_count,
      'active_bookings', v_active_bookings,
      'message', 'Delete blocked. Resolve active bookings first (including relocation workflows) to preserve notifications/refund handling.'
    );
  END IF;

  v_related_counts := jsonb_build_object(
    'studio_settings', (SELECT COUNT(*) FROM public.studio_settings WHERE studio_id = p_studio_id),
    'studio_operating_hours', (SELECT COUNT(*) FROM public.studio_operating_hours WHERE studio_id = p_studio_id),
    'studio_date_overrides', (SELECT COUNT(*) FROM public.studio_date_overrides WHERE studio_id = p_studio_id),
    'studio_bookings_total', (SELECT COUNT(*) FROM public.studio_bookings WHERE studio_id = p_studio_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE studio_id = p_studio_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE studio_id = p_studio_id),
    'booking_requests', (SELECT COUNT(*) FROM public.booking_requests WHERE studio_id = p_studio_id)
  );

  v_storage_urls := v_storage_urls || ARRAY(
    SELECT sm.media_url
    FROM public.studio_media sm
    WHERE sm.studio_id = p_studio_id
      AND sm.media_type = 'image'
    ORDER BY sm.sort_order, sm.created_at
  );

  IF v_studio.contract_url IS NOT NULL AND btrim(v_studio.contract_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_studio.contract_url;
  END IF;

  IF v_studio.business_permit_url IS NOT NULL AND btrim(v_studio.business_permit_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_studio.business_permit_url;
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

  v_storage_cleanup := jsonb_build_object(
    'candidate_urls', COALESCE(array_length(v_storage_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count,
    'delete_mode', 'skipped_direct_table_delete'
  );

  INSERT INTO public.studio_deletion_audit (
    studio_id,
    owner_id,
    deleted_by,
    studio_snapshot,
    related_counts,
    storage_cleanup,
    reason
  )
  VALUES (
    p_studio_id,
    v_studio.owner_id,
    v_uid,
    to_jsonb(v_studio),
    v_related_counts,
    v_storage_cleanup,
    p_reason
  );

  DELETE FROM public.booking_requests
  WHERE studio_id = p_studio_id;

  GET DIAGNOSTICS v_deleted_booking_request_count = ROW_COUNT;

  DELETE FROM public.studios
  WHERE id = p_studio_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete studio';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'active_booking_count', 0,
    'deleted_booking_requests', v_deleted_booking_request_count,
    'related_counts', v_related_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_studio_booking_relocation(
  p_booking_id UUID,
  p_proposed_date DATE DEFAULT NULL,
  p_proposed_start_time TIME DEFAULT NULL,
  p_proposed_end_time TIME DEFAULT NULL,
  p_musician_can_choose_slot BOOLEAN DEFAULT FALSE,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_booking RECORD;
  v_expires_at TIMESTAMPTZ := timezone('utc'::TEXT, now()) + INTERVAL '24 hours';
  v_has_proposed_slot BOOLEAN :=
    p_proposed_date IS NOT NULL
    OR p_proposed_start_time IS NOT NULL
    OR p_proposed_end_time IS NOT NULL;
  v_note TEXT;
  v_notification_title TEXT;
  v_notification_message TEXT;
  v_relocation_meta JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    sb.*,
    s.owner_id AS studio_owner_id,
    s.name AS studio_name
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id
  FOR UPDATE OF sb;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Booking not found'
    );
  END IF;

  IF v_booking.studio_owner_id <> v_actor_id
     AND NOT COALESCE(public.staff_can_edit_studio(v_actor_id, v_booking.studio_id), false) THEN
    RAISE EXCEPTION 'Only the studio owner can request this relocation';
  END IF;

  IF v_booking.status NOT IN ('pending', 'confirmed', 'pending_relocation') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This booking cannot be relocated from its current status',
      'status', v_booking.status
    );
  END IF;

  IF NOT p_musician_can_choose_slot AND NOT v_has_proposed_slot THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Choose a relocation slot or allow the musician to choose one'
    );
  END IF;

  IF v_has_proposed_slot THEN
    IF p_proposed_date IS NULL
       OR p_proposed_start_time IS NULL
       OR p_proposed_end_time IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Relocation date, start time, and end time are required together'
      );
    END IF;

    IF p_proposed_end_time <= p_proposed_start_time THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Selected relocation time is invalid'
      );
    END IF;

    IF NOT public.are_slots_available(
      v_booking.studio_id,
      p_proposed_date,
      jsonb_build_array(jsonb_build_object('start', p_proposed_start_time, 'end', p_proposed_end_time)),
      v_booking.user_id,
      p_booking_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Selected relocation slot is no longer available'
      );
    END IF;
  END IF;

  DELETE FROM public.booking_holds
  WHERE studio_id = v_booking.studio_id
    AND user_id = v_booking.user_id
    AND v_booking.relocation_proposed_date IS NOT NULL
    AND booking_date = v_booking.relocation_proposed_date
    AND start_time = v_booking.relocation_proposed_start_time
    AND end_time = v_booking.relocation_proposed_end_time;

  IF v_has_proposed_slot THEN
    DELETE FROM public.booking_holds
    WHERE studio_id = v_booking.studio_id
      AND user_id = v_booking.user_id
      AND booking_date = p_proposed_date
      AND start_time = p_proposed_start_time
      AND end_time = p_proposed_end_time;

    INSERT INTO public.booking_holds (
      user_id,
      studio_id,
      booking_date,
      start_time,
      end_time,
      expires_at
    )
    VALUES (
      v_booking.user_id,
      v_booking.studio_id,
      p_proposed_date,
      p_proposed_start_time,
      p_proposed_end_time,
      v_expires_at
    );
  END IF;

  v_note := CASE
    WHEN v_has_proposed_slot THEN
      'Pending relocation requested by studio owner. Proposed slot: '
        || p_proposed_date::TEXT || ' '
        || p_proposed_start_time::TEXT || '-'
        || p_proposed_end_time::TEXT
        || '. Musician can choose another available slot. Expires: '
        || v_expires_at::TEXT
    ELSE
      'Pending relocation requested by studio owner. Musician will choose an available slot. Expires: '
        || v_expires_at::TEXT
  END;

  UPDATE public.studio_bookings
  SET
    status = 'pending_relocation',
    relocation_requested_at = timezone('utc'::TEXT, now()),
    relocation_proposed_date = CASE WHEN v_has_proposed_slot THEN p_proposed_date ELSE NULL END,
    relocation_proposed_start_time = CASE WHEN v_has_proposed_slot THEN p_proposed_start_time ELSE NULL END,
    relocation_proposed_end_time = CASE WHEN v_has_proposed_slot THEN p_proposed_end_time ELSE NULL END,
    relocation_expires_at = v_expires_at,
    notes = concat_ws(
      E'\n',
      NULLIF(notes, ''),
      COALESCE(NULLIF(p_reason, ''), v_note)
    ),
    updated_at = timezone('utc'::TEXT, now())
  WHERE id = p_booking_id;

  v_relocation_meta := jsonb_build_object(
    'status', 'pending_relocation',
    'expires_at', v_expires_at,
    'musician_can_choose_slot', p_musician_can_choose_slot
  );

  IF v_has_proposed_slot THEN
    v_relocation_meta := v_relocation_meta || jsonb_build_object(
      'proposed_date', p_proposed_date,
      'proposed_start_time', p_proposed_start_time,
      'proposed_end_time', p_proposed_end_time
    );
  END IF;

  v_notification_title := CASE
    WHEN v_has_proposed_slot THEN 'Booking Relocation Request'
    ELSE 'Choose a New Booking Time'
  END;

  v_notification_message := CASE
    WHEN v_has_proposed_slot THEN
      'Your booking at ' || COALESCE(v_booking.studio_name, 'the studio')
        || ' needs relocation. A suggested slot is '
        || p_proposed_date::TEXT || ' at ' || p_proposed_start_time::TEXT
        || ', but you can choose another available time in Bookings. Your existing price and payment stay attached to this booking.'
    ELSE
      'Your booking at ' || COALESCE(v_booking.studio_name, 'the studio')
        || ' needs relocation. Please choose a new available time in Bookings. Your existing price and payment stay attached to this booking.'
  END;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    meta,
    read
  )
  VALUES (
    v_booking.user_id,
    'warning',
    v_notification_title,
    v_notification_message,
    jsonb_build_object(
      'bookingId', p_booking_id,
      'booking_id', p_booking_id,
      'studioId', v_booking.studio_id,
      'studio_id', v_booking.studio_id,
      'event_type', 'studio_booking_relocation_requested',
      'relocation', v_relocation_meta
    ),
    false
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending_relocation',
    'booking_id', p_booking_id,
    'studio_id', v_booking.studio_id,
    'expires_at', v_expires_at,
    'relocation', v_relocation_meta
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_studio_booking_relocation(
  UUID,
  DATE,
  TIME,
  TIME,
  BOOLEAN,
  TEXT
) TO authenticated;

COMMENT ON FUNCTION public.request_studio_booking_relocation(
  UUID,
  DATE,
  TIME,
  TIME,
  BOOLEAN,
  TEXT
) IS 'Studio owner/staff helper for requesting booking relocation, optionally letting the musician choose their own available slot.';
