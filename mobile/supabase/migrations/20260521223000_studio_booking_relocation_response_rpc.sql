CREATE OR REPLACE FUNCTION public.respond_to_studio_booking_relocation(
  p_booking_id uuid,
  p_accept boolean,
  p_preferred_date date DEFAULT NULL,
  p_preferred_start_time time DEFAULT NULL,
  p_preferred_end_time time DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_booking record;
  v_target_date date;
  v_target_start time;
  v_target_end time;
  v_is_paid_relocation boolean := false;
  v_refund_amount numeric := 0;
  v_refund_wallet_id uuid;
  v_refund_wallet_balance numeric := 0;
  v_existing_refund_id uuid;
  v_existing_refund_amount numeric := 0;
  v_refund_tx_id uuid;
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

  IF v_booking.user_id <> v_actor_id THEN
    RAISE EXCEPTION 'You can only respond to your own relocation request';
  END IF;

  IF v_booking.status <> 'pending_relocation' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This relocation request is no longer pending',
      'status', v_booking.status
    );
  END IF;

  IF v_booking.relocation_expires_at IS NOT NULL
     AND v_booking.relocation_expires_at <= timezone('utc'::text, now()) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This relocation request has expired'
    );
  END IF;

  v_is_paid_relocation := v_booking.payment_status IN ('paid', 'partial', 'refund_pending');

  IF p_accept THEN
    v_target_date := COALESCE(p_preferred_date, v_booking.relocation_proposed_date);
    v_target_start := COALESCE(p_preferred_start_time, v_booking.relocation_proposed_start_time);
    v_target_end := COALESCE(p_preferred_end_time, v_booking.relocation_proposed_end_time);

    IF v_target_date IS NULL OR v_target_start IS NULL OR v_target_end IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Choose an available date and time first'
      );
    END IF;

    IF v_target_end <= v_target_start THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Selected relocation time is invalid'
      );
    END IF;

    IF NOT public.are_slots_available(
      v_booking.studio_id,
      v_target_date,
      jsonb_build_array(jsonb_build_object('start', v_target_start, 'end', v_target_end)),
      v_actor_id,
      p_booking_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Selected relocation slot is no longer available'
      );
    END IF;

    UPDATE public.studio_bookings
    SET
      status = 'confirmed',
      booking_date = v_target_date,
      start_time = v_target_start,
      end_time = v_target_end,
      relocation_requested_at = NULL,
      relocation_expires_at = NULL,
      relocation_proposed_date = NULL,
      relocation_proposed_start_time = NULL,
      relocation_proposed_end_time = NULL,
      notes = concat_ws(
        E'\n',
        NULLIF(v_booking.notes, ''),
        'Relocation confirmed by musician. Original booking price and payment details preserved.'
      ),
      updated_at = timezone('utc'::text, now())
    WHERE id = p_booking_id;

    DELETE FROM public.studio_booking_slots
    WHERE booking_id = p_booking_id;

    INSERT INTO public.studio_booking_slots (
      booking_id,
      start_time,
      end_time,
      sort_order
    )
    VALUES (
      p_booking_id,
      v_target_start,
      v_target_end,
      0
    );

    DELETE FROM public.booking_holds
    WHERE studio_id = v_booking.studio_id
      AND user_id = v_booking.user_id
      AND (
        (
          v_booking.relocation_proposed_date IS NOT NULL
          AND booking_date = v_booking.relocation_proposed_date
          AND start_time = v_booking.relocation_proposed_start_time
          AND end_time = v_booking.relocation_proposed_end_time
        )
        OR (
          booking_date = v_target_date
          AND start_time = v_target_start
          AND end_time = v_target_end
        )
      );

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES (
      v_booking.studio_owner_id,
      'success',
      'Relocation Accepted',
      'The musician confirmed a new schedule for ' || COALESCE(v_booking.studio_name, 'your studio') || '.',
      jsonb_build_object(
        'bookingId', p_booking_id,
        'studioId', v_booking.studio_id,
        'event_type', 'relocation_accepted',
        'selected_date', v_target_date,
        'selected_start_time', v_target_start,
        'selected_end_time', v_target_end
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'confirmed',
      'booking_id', p_booking_id,
      'booking_date', v_target_date,
      'start_time', v_target_start,
      'end_time', v_target_end
    );
  END IF;

  IF v_is_paid_relocation THEN
    v_refund_amount := COALESCE(
      NULLIF(COALESCE(v_booking.payment_amount, 0), 0),
      GREATEST(
        COALESCE(v_booking.final_price, 0) - COALESCE(v_booking.remaining_balance, 0),
        0
      )
    );

    IF v_refund_amount > 0 THEN
      SELECT id, COALESCE(balance, 0)
      INTO v_refund_wallet_id, v_refund_wallet_balance
      FROM public.wallets
      WHERE user_id = v_booking.user_id
      FOR UPDATE;

      IF v_refund_wallet_id IS NULL THEN
        INSERT INTO public.wallets (user_id, balance)
        VALUES (v_booking.user_id, 0)
        RETURNING id, COALESCE(balance, 0)
        INTO v_refund_wallet_id, v_refund_wallet_balance;
      END IF;

      SELECT id, amount
      INTO v_existing_refund_id, v_existing_refund_amount
      FROM public.wallet_transactions
      WHERE wallet_id = v_refund_wallet_id
        AND reference_id = p_booking_id
        AND reference_type = 'refund'
        AND type = 'refund'
      LIMIT 1;

      IF v_existing_refund_id IS NOT NULL THEN
        v_refund_amount := COALESCE(NULLIF(v_existing_refund_amount, 0), v_refund_amount);
        v_refund_tx_id := v_existing_refund_id;
      ELSE
        UPDATE public.wallets
        SET
          balance = v_refund_wallet_balance + v_refund_amount,
          updated_at = timezone('utc'::text, now())
        WHERE id = v_refund_wallet_id;

        INSERT INTO public.wallet_transactions (
          wallet_id,
          amount,
          type,
          description,
          reference_id,
          reference_type,
          is_credit,
          status
        )
        VALUES (
          v_refund_wallet_id,
          v_refund_amount,
          'refund',
          'Refund for cancelled owner-requested studio booking relocation at ' || COALESCE(v_booking.studio_name, 'Studio'),
          p_booking_id,
          'refund',
          true,
          'completed'
        )
        RETURNING id INTO v_refund_tx_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.studio_bookings
  SET
    status = 'cancelled',
    payment_status = CASE
      WHEN v_refund_amount > 0 THEN 'refunded'
      WHEN v_is_paid_relocation THEN 'refund_pending'
      ELSE payment_status
    END,
    refund_amount = CASE
      WHEN v_refund_amount > 0 THEN v_refund_amount
      ELSE refund_amount
    END,
    refunded_at = CASE
      WHEN v_refund_amount > 0 THEN timezone('utc'::text, now())
      ELSE refunded_at
    END,
    cancellation_reason = 'Musician cancelled after an owner-requested schedule move. No musician completion-rate penalty.',
    relocation_requested_at = NULL,
    relocation_expires_at = NULL,
    relocation_proposed_date = NULL,
    relocation_proposed_start_time = NULL,
    relocation_proposed_end_time = NULL,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_booking_id;

  DELETE FROM public.booking_holds
  WHERE studio_id = v_booking.studio_id
    AND user_id = v_booking.user_id
    AND v_booking.relocation_proposed_date IS NOT NULL
    AND booking_date = v_booking.relocation_proposed_date
    AND start_time = v_booking.relocation_proposed_start_time
    AND end_time = v_booking.relocation_proposed_end_time;

  INSERT INTO public.notifications (user_id, type, title, message, meta)
  VALUES (
    v_booking.studio_owner_id,
    'warning',
    'Relocation Declined',
    CASE
      WHEN v_refund_amount > 0 THEN
        'The musician declined your relocation request. Booking was cancelled and the paid amount was credited back to their wallet.'
      WHEN v_is_paid_relocation THEN
        'The musician declined your relocation request. Booking was cancelled and refund processing has started.'
      ELSE
        'The musician declined your relocation request. Booking was cancelled.'
    END,
    jsonb_build_object(
      'bookingId', p_booking_id,
      'studioId', v_booking.studio_id,
      'event_type', 'relocation_declined'
    )
  );

  IF v_refund_amount > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES (
      v_booking.user_id,
      'success',
      'Refund Credited',
      'Your booking at ' || COALESCE(v_booking.studio_name, 'the studio') || ' was cancelled and PHP ' || trim(to_char(v_refund_amount, 'FM999999999990.00')) || ' was credited to your wallet.',
      jsonb_build_object(
        'bookingId', p_booking_id,
        'booking_id', p_booking_id,
        'studioId', v_booking.studio_id,
        'studio_id', v_booking.studio_id,
        'event_type', 'studio_booking_refunded',
        'refund_id', v_refund_tx_id,
        'refund_amount', v_refund_amount
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'cancelled',
    'booking_id', p_booking_id,
    'payment_status', CASE
      WHEN v_refund_amount > 0 THEN 'refunded'
      WHEN v_is_paid_relocation THEN 'refund_pending'
      ELSE v_booking.payment_status
    END,
    'refund_amount', v_refund_amount,
    'refund_id', v_refund_tx_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.respond_to_studio_booking_relocation(
  uuid,
  boolean,
  date,
  time,
  time
) TO authenticated;

COMMENT ON FUNCTION public.respond_to_studio_booking_relocation(
  uuid,
  boolean,
  date,
  time,
  time
) IS 'Lets a musician accept an owner-requested studio booking relocation with a preferred available slot, or cancel with a wallet refund and without a musician completion-rate penalty.';
