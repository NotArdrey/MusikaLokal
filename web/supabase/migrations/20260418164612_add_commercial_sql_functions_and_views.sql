-- Phase 1 Commercial Booking: SQL functions, views, and helpers

-- ============================================================
-- Function: calculate_booking_cancellation_penalty
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_booking_cancellation_penalty(
    p_booking_id uuid,
    p_cancellation_time timestamptz DEFAULT timezone('utc'::text, now())
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking RECORD;
  v_policy RECORD;
  v_booking_start TIMESTAMPTZ;
  v_hours_before NUMERIC;
  v_penalty_pct NUMERIC;
  v_penalty_amount NUMERIC;
  v_refund_amount NUMERIC;
  v_penalty_type TEXT;
BEGIN
  SELECT sb.*, s.owner_id AS studio_owner_id
  INTO v_booking
  FROM studio_bookings sb
  JOIN studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  -- If no cancellation policy snapshot, check for active policy
  IF v_booking.cancellation_policy_snapshot IS NOT NULL THEN
    v_policy := jsonb_populate_record(null::booking_cancellation_policies, v_booking.cancellation_policy_snapshot);
  ELSE
    SELECT * INTO v_policy
    FROM booking_cancellation_policies
    WHERE studio_id = v_booking.studio_id AND is_active = true
    LIMIT 1;
  END IF;

  -- No policy = no penalty, full refund
  IF v_policy IS NULL OR v_policy.id IS NULL THEN
    RETURN jsonb_build_object(
      'penalty_type', 'none',
      'penalty_pct', 0,
      'penalty_amount', 0,
      'refund_amount', v_booking.final_price,
      'booking_total', v_booking.final_price
    );
  END IF;

  -- Calculate hours before booking start
  v_booking_start := (v_booking.booking_date || ' ' || v_booking.start_time)::timestamptz;
  v_hours_before := EXTRACT(EPOCH FROM (v_booking_start - p_cancellation_time)) / 3600.0;

  IF v_hours_before >= v_policy.full_refund_hours_before THEN
    -- Full refund window
    v_penalty_pct := 0;
    v_penalty_type := 'late_cancellation';
  ELSIF v_hours_before >= v_policy.partial_refund_hours_before THEN
    -- Partial refund window
    v_penalty_pct := v_policy.late_cancel_penalty_pct;
    v_penalty_type := 'late_cancellation';
  ELSIF v_hours_before > 0 THEN
    -- Late cancellation (inside penalty window)
    v_penalty_pct := v_policy.late_cancel_penalty_pct;
    v_penalty_type := 'late_cancellation';
  ELSE
    -- Past booking start = no-show
    v_penalty_pct := v_policy.no_show_penalty_pct;
    v_penalty_type := 'no_show';
  END IF;

  v_penalty_amount := ROUND((v_booking.final_price * v_penalty_pct / 100.0)::numeric, 2);
  v_refund_amount := v_booking.final_price - v_penalty_amount;

  RETURN jsonb_build_object(
    'penalty_type', v_penalty_type,
    'penalty_pct', v_penalty_pct,
    'penalty_amount', v_penalty_amount,
    'refund_amount', v_refund_amount,
    'booking_total', v_booking.final_price,
    'hours_before_booking', ROUND(v_hours_before::numeric, 2),
    'policy_snapshot', row_to_json(v_policy)
  );
END;
$function$;

-- ============================================================
-- Function: apply_booking_penalty
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_booking_penalty(
    p_booking_id uuid,
    p_penalty_type text,
    p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_calc JSONB;
  v_booking RECORD;
  v_penalty_event_id UUID;
  v_penalty_tx_id UUID;
  v_refund_tx_id UUID;
  v_penalized_wallet_id UUID;
  v_beneficiary_wallet_id UUID;
BEGIN
  -- Calculate the penalty
  v_calc := calculate_booking_cancellation_penalty(p_booking_id);

  IF v_calc ? 'error' THEN
    RETURN v_calc;
  END IF;

  SELECT sb.*, s.owner_id AS studio_owner_id
  INTO v_booking
  FROM studio_bookings sb
  JOIN studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id;

  -- Determine who pays the penalty (canceller = booker for user cancel)
  -- Get wallets
  SELECT id INTO v_penalized_wallet_id FROM wallets WHERE user_id = v_booking.user_id;
  SELECT id INTO v_beneficiary_wallet_id FROM wallets WHERE user_id = v_booking.studio_owner_id;

  -- Create penalty wallet transaction if penalty > 0
  IF (v_calc->>'penalty_amount')::numeric > 0 AND v_beneficiary_wallet_id IS NOT NULL THEN
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, is_credit, reference_type, status)
    VALUES (
      v_beneficiary_wallet_id,
      (v_calc->>'penalty_amount')::numeric,
      'earning',
      'Cancellation penalty for booking ' || p_booking_id::text,
      p_booking_id,
      true,
      'penalty',
      'completed'
    )
    RETURNING id INTO v_penalty_tx_id;

    -- Credit beneficiary wallet
    UPDATE wallets SET balance = balance + (v_calc->>'penalty_amount')::numeric, updated_at = now()
    WHERE id = v_beneficiary_wallet_id;
  END IF;

  -- Create refund wallet transaction if refund > 0
  IF (v_calc->>'refund_amount')::numeric > 0 AND v_penalized_wallet_id IS NOT NULL THEN
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, is_credit, reference_type, status)
    VALUES (
      v_penalized_wallet_id,
      (v_calc->>'refund_amount')::numeric,
      'refund',
      'Cancellation refund for booking ' || p_booking_id::text,
      p_booking_id,
      true,
      'refund',
      'completed'
    )
    RETURNING id INTO v_refund_tx_id;

    -- Credit refund to user wallet
    UPDATE wallets SET balance = balance + (v_calc->>'refund_amount')::numeric, updated_at = now()
    WHERE id = v_penalized_wallet_id;
  END IF;

  -- Create immutable penalty event
  INSERT INTO booking_penalty_events (
    booking_id, policy_snapshot, penalty_type, penalty_amount, refund_amount,
    booking_total, penalized_user_id, beneficiary_user_id,
    wallet_transaction_id, refund_transaction_id, notes
  )
  VALUES (
    p_booking_id,
    COALESCE(v_calc->'policy_snapshot', '{}'::jsonb),
    COALESCE(p_penalty_type, v_calc->>'penalty_type'),
    (v_calc->>'penalty_amount')::numeric,
    (v_calc->>'refund_amount')::numeric,
    (v_calc->>'booking_total')::numeric,
    v_booking.user_id,
    v_booking.studio_owner_id,
    v_penalty_tx_id,
    v_refund_tx_id,
    p_notes
  )
  RETURNING id INTO v_penalty_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'penalty_event_id', v_penalty_event_id,
    'penalty_amount', (v_calc->>'penalty_amount')::numeric,
    'refund_amount', (v_calc->>'refund_amount')::numeric,
    'penalty_type', v_calc->>'penalty_type'
  );
END;
$function$;


