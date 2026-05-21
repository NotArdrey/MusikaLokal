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
  v_proposed_start_label TEXT;
  v_proposed_end_label TEXT;
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

    v_proposed_start_label := trim(to_char(p_proposed_start_time, 'FMHH12:MI AM'));
    v_proposed_end_label := trim(to_char(p_proposed_end_time, 'FMHH12:MI AM'));
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
        || v_proposed_start_label || '-'
        || v_proposed_end_label
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
        || p_proposed_date::TEXT || ' from ' || v_proposed_start_label
        || ' to ' || v_proposed_end_label
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
