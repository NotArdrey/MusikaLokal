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

-- ============================================================
-- Function: calculate_deal_settlement
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_deal_settlement(
    p_deal_id uuid,
    p_deal_type text,
    p_gross_revenue numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_terms RECORD;
  v_venue_share NUMERIC;
  v_production_share NUMERIC;
  v_fixed_fee NUMERIC;
  v_deposit NUMERIC;
  v_net_venue NUMERIC;
  v_net_production NUMERIC;
BEGIN
  IF p_deal_type = 'venue_partnership' THEN
    SELECT dtv.* INTO v_terms
    FROM venue_partnership_deals vpd
    JOIN deal_term_versions dtv ON dtv.id = vpd.accepted_term_version_id
    WHERE vpd.id = p_deal_id AND vpd.status = 'accepted';

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'No accepted terms found for deal');
    END IF;

    v_venue_share := ROUND((p_gross_revenue * v_terms.revenue_split_venue_pct / 100.0)::numeric, 2);
    v_production_share := ROUND((p_gross_revenue * v_terms.revenue_split_production_pct / 100.0)::numeric, 2);
    v_fixed_fee := COALESCE(v_terms.fixed_fee, 0);
    v_deposit := COALESCE(v_terms.deposit_amount, 0);

    -- Net = share + fixed fee adjustments - already paid deposit
    v_net_venue := v_venue_share + v_fixed_fee;
    v_net_production := v_production_share - v_fixed_fee - v_deposit;

    RETURN jsonb_build_object(
      'gross_revenue', p_gross_revenue,
      'venue_share', v_venue_share,
      'production_share', v_production_share,
      'fixed_fee', v_fixed_fee,
      'deposit_already_paid', v_deposit,
      'net_venue_payout', v_net_venue,
      'net_production_payout', GREATEST(v_net_production, 0),
      'production_owes', CASE WHEN v_net_production < 0 THEN ABS(v_net_production) ELSE 0 END
    );
  ELSIF p_deal_type = 'recording' THEN
    -- Recording deals use package pricing; settlement is simpler
    RETURN jsonb_build_object(
      'gross_revenue', p_gross_revenue,
      'studio_payout', p_gross_revenue,
      'deal_type', 'recording'
    );
  ELSE
    RETURN jsonb_build_object('error', 'Unknown deal type: ' || p_deal_type);
  END IF;
END;
$function$;

-- ============================================================
-- Function: mark_deal_terms_accepted
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_deal_terms_accepted(
    p_deal_id uuid,
    p_term_version_id uuid,
    p_accepted_by_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deal RECORD;
  v_term RECORD;
  v_event_id UUID;
BEGIN
  -- Lock the deal row to prevent concurrent acceptance
  SELECT * INTO v_deal
  FROM venue_partnership_deals
  WHERE id = p_deal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Deal not found');
  END IF;

  IF v_deal.status NOT IN ('proposed', 'countered') THEN
    RETURN jsonb_build_object('error', 'Deal is not in a negotiable state. Current status: ' || v_deal.status);
  END IF;

  -- Verify the term version is the latest for this deal
  SELECT * INTO v_term
  FROM deal_term_versions
  WHERE id = p_term_version_id AND deal_id = p_deal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Term version not found for this deal');
  END IF;

  -- The acceptor must not be the proposer of this term version
  IF v_term.proposed_by_user_id = p_accepted_by_user_id THEN
    RETURN jsonb_build_object('error', 'Cannot accept your own terms');
  END IF;

  -- Update deal status
  UPDATE venue_partnership_deals
  SET status = 'accepted',
      accepted_term_version_id = p_term_version_id,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_deal_id;

  -- Record negotiation event
  INSERT INTO deal_negotiation_events (deal_id, event_type, actor_user_id, term_version_id, notes)
  VALUES (p_deal_id, 'acceptance', p_accepted_by_user_id, p_term_version_id, 'Terms accepted')
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'deal_id', p_deal_id,
    'accepted_term_version_id', p_term_version_id,
    'event_id', v_event_id
  );
END;
$function$;

-- ============================================================
-- Function: resolve_active_recording_package
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_active_recording_package(
    p_studio_id uuid,
    p_counterparty_id uuid,
    p_hours numeric DEFAULT NULL::numeric
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deal RECORD;
  v_package RECORD;
BEGIN
  SELECT * INTO v_deal
  FROM studio_recording_deals
  WHERE studio_id = p_studio_id
    AND counterparty_id = p_counterparty_id
    AND status = 'accepted'
    AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_deal', false);
  END IF;

  -- Find best matching package by hours
  IF p_hours IS NOT NULL THEN
    SELECT * INTO v_package
    FROM recording_deal_packages
    WHERE deal_id = v_deal.id AND hours_included >= p_hours
    ORDER BY hours_included ASC, sort_order ASC
    LIMIT 1;
  END IF;

  -- Fallback to cheapest package
  IF v_package IS NULL OR v_package.id IS NULL THEN
    SELECT * INTO v_package
    FROM recording_deal_packages
    WHERE deal_id = v_deal.id
    ORDER BY sort_order ASC, price ASC
    LIMIT 1;
  END IF;

  IF v_package IS NULL OR v_package.id IS NULL THEN
    RETURN jsonb_build_object('has_deal', true, 'deal_id', v_deal.id, 'has_package', false);
  END IF;

  RETURN jsonb_build_object(
    'has_deal', true,
    'deal_id', v_deal.id,
    'has_package', true,
    'package_id', v_package.id,
    'package_name', v_package.name,
    'hours_included', v_package.hours_included,
    'songs_included', v_package.songs_included,
    'price', v_package.price
  );
END;
$function$;

-- ============================================================
-- View: venue_partnership_deals_with_summary
-- ============================================================
CREATE OR REPLACE VIEW public.venue_partnership_deals_with_summary AS
SELECT
    vpd.id,
    vpd.venue_owner_id,
    vpd.production_team_id,
    vpd.gig_id,
    vpd.title,
    vpd.status,
    vpd.proposed_by_user_id,
    vpd.accepted_term_version_id,
    vpd.settled_at,
    vpd.created_at,
    vpd.updated_at,
    pt.name AS production_team_name,
    pt.logo_url AS production_team_logo,
    po.full_name AS venue_owner_name,
    po.avatar_url AS venue_owner_avatar,
    g.name AS gig_name,
    g.event_date AS gig_event_date,
    dtv.revenue_split_venue_pct AS current_venue_pct,
    dtv.revenue_split_production_pct AS current_production_pct,
    dtv.fixed_fee AS current_fixed_fee,
    dtv.deposit_amount AS current_deposit,
    dtv.event_date AS current_event_date,
    dtv.version_number AS current_version,
    (SELECT count(*) FROM deal_negotiation_events dne WHERE dne.deal_id = vpd.id) AS event_count,
    (SELECT max(dne.created_at) FROM deal_negotiation_events dne WHERE dne.deal_id = vpd.id) AS last_activity_at
FROM venue_partnership_deals vpd
JOIN production_teams pt ON pt.id = vpd.production_team_id
JOIN profiles po ON po.id = vpd.venue_owner_id
LEFT JOIN gigs g ON g.id = vpd.gig_id
LEFT JOIN deal_term_versions dtv ON (
    dtv.id = vpd.accepted_term_version_id
    OR (
        vpd.accepted_term_version_id IS NULL
        AND dtv.deal_id = vpd.id
        AND dtv.version_number = (
            SELECT max(dtv2.version_number)
            FROM deal_term_versions dtv2
            WHERE dtv2.deal_id = vpd.id
        )
    )
);

-- ============================================================
-- View: studio_recording_deals_with_summary
-- ============================================================
CREATE OR REPLACE VIEW public.studio_recording_deals_with_summary AS
SELECT
    srd.id,
    srd.studio_id,
    srd.counterparty_id,
    srd.title,
    srd.status,
    srd.proposed_by_user_id,
    srd.valid_from,
    srd.valid_until,
    srd.notes,
    srd.accepted_at,
    srd.created_at,
    srd.updated_at,
    s.name AS studio_name,
    s.hourly_rate AS studio_hourly_rate,
    so.full_name AS studio_owner_name,
    so.avatar_url AS studio_owner_avatar,
    cp.full_name AS counterparty_name,
    cp.avatar_url AS counterparty_avatar,
    (SELECT count(*) FROM recording_deal_packages rdp WHERE rdp.deal_id = srd.id) AS package_count,
    (SELECT json_agg(
        json_build_object(
            'id', rdp.id,
            'name', rdp.name,
            'hours_included', rdp.hours_included,
            'songs_included', rdp.songs_included,
            'price', rdp.price
        ) ORDER BY rdp.sort_order
    ) FROM recording_deal_packages rdp WHERE rdp.deal_id = srd.id) AS packages
FROM studio_recording_deals srd
JOIN studios s ON s.id = srd.studio_id
JOIN profiles so ON so.id = s.owner_id
JOIN profiles cp ON cp.id = srd.counterparty_id;

-- ============================================================
-- View: booking_penalty_events_with_summary
-- ============================================================
CREATE OR REPLACE VIEW public.booking_penalty_events_with_summary AS
SELECT
    bpe.id,
    bpe.booking_id,
    bpe.policy_snapshot,
    bpe.penalty_type,
    bpe.penalty_amount,
    bpe.refund_amount,
    bpe.booking_total,
    bpe.penalized_user_id,
    bpe.beneficiary_user_id,
    bpe.wallet_transaction_id,
    bpe.refund_transaction_id,
    bpe.notes,
    bpe.created_at,
    sb.booking_date,
    sb.start_time,
    sb.end_time,
    sb.session_type,
    s.name AS studio_name,
    pu.full_name AS penalized_user_name,
    bu.full_name AS beneficiary_user_name
FROM booking_penalty_events bpe
JOIN studio_bookings sb ON sb.id = bpe.booking_id
JOIN studios s ON s.id = sb.studio_id
JOIN profiles pu ON pu.id = bpe.penalized_user_id
LEFT JOIN profiles bu ON bu.id = bpe.beneficiary_user_id;
