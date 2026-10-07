-- Online spending is history, not another debit from the payer's wallet.
CREATE TABLE public.studio_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_reference text NOT NULL,
  payment_id text,
  checkout_session_id text,
  payment_intent_id text,
  stage text NOT NULL CHECK (stage IN ('full', 'downpayment', 'balance', 'refund', 'historical')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text,
  occurred_at timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  is_historical boolean NOT NULL DEFAULT false,
  UNIQUE (provider_reference, booking_id)
);
CREATE UNIQUE INDEX studio_payment_events_booking_stage_key
  ON public.studio_payment_events(booking_id, stage) WHERE stage <> 'refund';
CREATE INDEX studio_payment_events_user_history_idx
  ON public.studio_payment_events(user_id, occurred_at DESC, id);
CREATE INDEX studio_payment_events_payment_id_idx ON public.studio_payment_events(payment_id);
ALTER TABLE public.studio_payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_payment_events_payer_read ON public.studio_payment_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.studio_payment_events FROM anon, authenticated;
GRANT SELECT ON public.studio_payment_events TO authenticated;
GRANT ALL ON public.studio_payment_events TO service_role;

-- Only confirmed online records are reconciled. A settled installment booking
-- has only one surviving paid_at, so represent it as a total, not dated stages.
-- Face-to-face settlement overwrites payment_amount; its original online
-- downpayment must come from the persisted initial owner earning instead.
INSERT INTO public.studio_payment_events (
  booking_id, user_id, provider_reference, checkout_session_id, payment_intent_id,
  stage, amount, payment_method, occurred_at, is_historical
)
SELECT b.id, b.user_id, 'historical:payment:' || b.id, b.checkout_session_id, b.payment_intent_id,
  CASE WHEN b.payment_type = 'downpayment' AND b.payment_status <> 'partial'
    THEN 'historical' WHEN b.payment_type = 'downpayment' THEN 'downpayment' ELSE 'full' END,
  CASE WHEN b.payment_type = 'downpayment' AND b.payment_status <> 'partial'
    THEN CASE WHEN b.payment_amount < b.final_price THEN b.final_price ELSE initial.amount END
    ELSE b.payment_amount END,
  b.payment_method, b.paid_at, true
FROM public.studio_bookings b
LEFT JOIN LATERAL (
  SELECT sum(wt.amount) AS amount FROM public.wallet_transactions wt
  JOIN public.wallets w ON w.id = wt.wallet_id
  JOIN public.studios s ON s.id = b.studio_id AND s.owner_id = w.user_id
  WHERE wt.reference_id = b.id AND wt.type = 'earning' AND wt.status = 'completed'
    AND (wt.reference_type IS NULL OR wt.reference_type IN ('booking_payment', 'booking_downpayment', 'booking'))
) initial ON true
WHERE b.payment_status IN ('paid', 'partial', 'refunded', 'refund_pending')
  AND b.paid_at IS NOT NULL AND b.payment_amount > 0
  AND (b.checkout_session_id IS NOT NULL OR b.payment_intent_id IS NOT NULL)
  AND coalesce(b.payment_method, '') NOT IN ('manual', 'cash', 'wallet', 'face_to_face')
  AND CASE WHEN b.payment_type = 'downpayment' AND b.payment_status <> 'partial'
    AND b.payment_amount >= b.final_price THEN coalesce(initial.amount, 0) > 0 ELSE true END;

INSERT INTO public.studio_payment_events (
  booking_id, user_id, provider_reference, checkout_session_id, payment_intent_id,
  stage, amount, payment_method, occurred_at, is_historical
)
SELECT b.id, b.user_id, coalesce(b.refund_id, 'historical:refund:' || b.id),
  b.checkout_session_id, b.payment_intent_id, 'refund', b.refund_amount,
  b.payment_method, b.refunded_at, true
FROM public.studio_bookings b
WHERE b.payment_status = 'refunded' AND b.refund_amount > 0 AND b.refunded_at IS NOT NULL
  AND b.refund_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions wt
    JOIN public.wallets w ON w.id = wt.wallet_id
    WHERE wt.reference_id = b.id AND wt.type = 'refund' AND w.user_id = b.user_id);

CREATE OR REPLACE FUNCTION public.confirm_online_studio_payment(
  p_payment_id text, p_booking_ids uuid[], p_stage text, p_amount numeric,
  p_payment_method text, p_paid_at timestamptz,
  p_checkout_session_id text DEFAULT NULL, p_payment_intent_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  booking public.studio_bookings%ROWTYPE;
  event public.studio_payment_events%ROWTYPE;
  ids uuid[];
  payer uuid;
  expected numeric := 0;
  allocation numeric;
  earning_wallet_id uuid;
  owner_id uuid;
  studio_name text;
  earning_reference_type text;
  processed uuid[] := '{}';
BEGIN
  IF nullif(p_payment_id, '') IS NULL OR p_amount IS NULL OR p_amount <= 0
    OR p_amount <> round(p_amount, 2) OR p_stage IS NULL OR p_stage NOT IN ('full', 'downpayment', 'balance') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT';
  END IF;
  SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_booking_ids) id;
  IF coalesce(cardinality(ids), 0) = 0 THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-payment:' || p_payment_id, 0));
  PERFORM id FROM public.studio_bookings WHERE id = ANY(ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.studio_bookings WHERE id = ANY(ids)) <> cardinality(ids) THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  -- A payment reference cannot be reassigned to another booking or stage.
  IF EXISTS (SELECT 1 FROM public.studio_payment_events e WHERE e.provider_reference = p_payment_id
    AND (NOT e.booking_id = ANY(ids) OR e.stage <> p_stage)) THEN
    RAISE EXCEPTION 'PAYMENT_REFERENCE_MISMATCH';
  END IF;
  IF EXISTS (SELECT 1 FROM public.studio_payment_events WHERE provider_reference = p_payment_id) THEN
    IF (SELECT count(*) FROM public.studio_payment_events WHERE provider_reference = p_payment_id) <> cardinality(ids)
      OR (SELECT sum(amount) FROM public.studio_payment_events WHERE provider_reference = p_payment_id) <> p_amount THEN
      RAISE EXCEPTION 'PAYMENT_REFERENCE_MISMATCH';
    END IF;
    RETURN jsonb_build_object('booking_ids', '[]'::jsonb, 'already_recorded', true);
  END IF;
  FOR booking IN SELECT * FROM public.studio_bookings WHERE id = ANY(ids) ORDER BY id LOOP
    IF payer IS NOT NULL AND payer <> booking.user_id THEN RAISE EXCEPTION 'PAYMENT_PAYER_MISMATCH'; END IF;
    payer := booking.user_id;
    -- Replayed historical confirmations must not create another charge/earning.
    IF EXISTS (SELECT 1 FROM public.studio_payment_events e WHERE e.booking_id = booking.id
      AND e.is_historical AND e.stage <> 'refund') AND
      (booking.payment_status IN ('paid', 'refunded') OR (p_stage = 'downpayment' AND booking.payment_status = 'partial')) THEN
      CONTINUE;
    END IF;
    IF (p_checkout_session_id IS NOT NULL AND booking.checkout_session_id IS DISTINCT FROM p_checkout_session_id)
      OR (p_checkout_session_id IS NULL AND (p_payment_intent_id IS NULL
        OR booking.payment_intent_id IS DISTINCT FROM p_payment_intent_id)) THEN
      RAISE EXCEPTION 'PAYMENT_TARGET_MISMATCH';
    END IF;
    IF EXISTS (SELECT 1 FROM public.studio_payment_events e WHERE e.booking_id = booking.id AND e.stage = p_stage)
      OR booking.payment_status = 'refunded' THEN RAISE EXCEPTION 'PAYMENT_STAGE_ALREADY_RECORDED'; END IF;
    IF p_stage = 'balance' THEN
      IF NOT EXISTS (SELECT 1 FROM public.studio_payment_events e WHERE e.booking_id = booking.id
        AND e.stage IN ('downpayment', 'historical')) OR coalesce(booking.remaining_balance, 0) <= 0 THEN
        RAISE EXCEPTION 'NO_CONFIRMED_DOWNPAYMENT';
      END IF;
      allocation := booking.remaining_balance;
    ELSE
      IF EXISTS (SELECT 1 FROM public.studio_payment_events e WHERE e.booking_id = booking.id AND e.stage <> 'refund') THEN
        RAISE EXCEPTION 'PAYMENT_STAGE_ALREADY_RECORDED';
      END IF;
      allocation := CASE WHEN p_stage = 'downpayment' THEN booking.payment_amount ELSE booking.final_price END;
    END IF;
    IF coalesce(allocation, 0) <= 0 OR allocation > booking.final_price THEN RAISE EXCEPTION 'INVALID_PAYMENT_ALLOCATION'; END IF;
    expected := expected + allocation;
    processed := array_append(processed, booking.id);
  END LOOP;
  IF cardinality(processed) = 0 THEN
    RETURN jsonb_build_object('booking_ids', '[]'::jsonb, 'already_recorded', true);
  END IF;
  IF expected <> p_amount THEN RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'; END IF;
  -- All wallets touched by this batch are acquired in the same order.
  INSERT INTO public.wallets(user_id, balance)
    SELECT DISTINCT s.owner_id, 0 FROM public.studio_bookings b JOIN public.studios s ON s.id = b.studio_id
    WHERE b.id = ANY(processed) ORDER BY s.owner_id ON CONFLICT (user_id) DO NOTHING;
  PERFORM w.id FROM public.wallets w WHERE w.user_id IN (
    SELECT s.owner_id FROM public.studio_bookings b JOIN public.studios s ON s.id = b.studio_id WHERE b.id = ANY(processed)
  ) ORDER BY w.user_id FOR UPDATE;
  earning_reference_type := CASE p_stage WHEN 'downpayment' THEN 'booking_downpayment'
    WHEN 'balance' THEN 'booking_balance' ELSE 'booking_payment' END;
  FOR booking IN SELECT * FROM public.studio_bookings WHERE id = ANY(processed) ORDER BY id LOOP
    allocation := CASE p_stage WHEN 'balance' THEN booking.remaining_balance
      WHEN 'downpayment' THEN booking.payment_amount ELSE booking.final_price END;
    INSERT INTO public.studio_payment_events(booking_id, user_id, provider_reference, payment_id,
      checkout_session_id, payment_intent_id, stage, amount, payment_method, occurred_at)
    VALUES(booking.id, booking.user_id, p_payment_id, p_payment_id, p_checkout_session_id,
      p_payment_intent_id, p_stage, allocation, p_payment_method, p_paid_at);
    UPDATE public.studio_bookings SET
      payment_status = CASE WHEN p_stage = 'downpayment' AND allocation < final_price THEN 'partial' ELSE 'paid' END,
      remaining_balance = CASE WHEN p_stage = 'downpayment' THEN greatest(0, final_price - allocation) ELSE 0 END,
      payment_amount = CASE WHEN p_stage = 'balance' THEN payment_amount ELSE allocation END,
      payment_intent_id = coalesce(p_payment_intent_id, payment_intent_id), payment_method = p_payment_method,
      paid_at = coalesce(p_paid_at, now()),
      status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END
    WHERE id = booking.id;
    SELECT s.owner_id, s.name INTO owner_id, studio_name FROM public.studios s WHERE s.id = booking.studio_id;
    SELECT w.id INTO earning_wallet_id FROM public.wallets w WHERE w.user_id = owner_id;
    IF earning_wallet_id IS NULL THEN RAISE EXCEPTION 'STUDIO_OWNER_WALLET_MISSING'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.wallet_transactions wt WHERE wt.wallet_id = earning_wallet_id
      AND wt.reference_id = booking.id AND wt.type = 'earning'
      AND (wt.reference_type = earning_reference_type OR (wt.reference_type IS NULL AND p_stage <> 'balance'))) THEN
      INSERT INTO public.wallet_transactions(wallet_id, amount, type, description, reference_id, reference_type, is_credit, status)
      VALUES(earning_wallet_id, allocation, 'earning', 'Payment received for booking at ' || coalesce(studio_name, 'Studio'),
        booking.id, earning_reference_type, true, 'completed');
      UPDATE public.wallets SET balance = coalesce(balance, 0) + allocation, updated_at = now() WHERE id = earning_wallet_id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('booking_ids', to_jsonb(processed), 'already_recorded', false);
END;
$$;
REVOKE ALL ON FUNCTION public.confirm_online_studio_payment(text, uuid[], text, numeric, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_online_studio_payment(text, uuid[], text, numeric, text, timestamptz, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_online_studio_refund(
  p_refund_id text, p_payment_id text, p_booking_ids uuid[], p_amount numeric, p_refunded_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  booking public.studio_bookings%ROWTYPE;
  ids uuid[];
  confirmed numeric;
  refunded numeric;
  total numeric;
  allocation numeric;
  amount_left numeric := p_amount;
  processed uuid[] := '{}';
  owner_wallet uuid;
BEGIN
  IF nullif(p_refund_id, '') IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_REFUND';
  END IF;
  SELECT array_agg(DISTINCT id ORDER BY id) INTO ids FROM unnest(p_booking_ids) id;
  IF coalesce(cardinality(ids), 0) = 0 THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('studio-refund:' || p_refund_id, 0));
  PERFORM id FROM public.studio_bookings WHERE id = ANY(ids) ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.studio_bookings WHERE id = ANY(ids)) <> cardinality(ids) THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.studio_payment_events WHERE provider_reference = p_refund_id) THEN
    IF EXISTS (SELECT 1 FROM public.studio_payment_events e WHERE e.provider_reference = p_refund_id
        AND (e.stage <> 'refund' OR NOT e.booking_id = ANY(ids)))
      OR (SELECT count(*) FROM public.studio_payment_events WHERE provider_reference = p_refund_id) <> cardinality(ids)
      OR (SELECT sum(amount) FROM public.studio_payment_events WHERE provider_reference = p_refund_id) <> p_amount THEN
      RAISE EXCEPTION 'REFUND_REFERENCE_MISMATCH';
    END IF;
    RETURN jsonb_build_object('booking_ids', '[]'::jsonb, 'already_recorded', true);
  END IF;
  SELECT sum(amount) INTO total FROM public.studio_payment_events
    WHERE booking_id = ANY(ids) AND stage <> 'refund'
      AND (payment_id = p_payment_id OR is_historical);
  IF coalesce(total, 0) < p_amount THEN RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT'; END IF;
  PERFORM w.id FROM public.wallets w WHERE w.user_id IN (
    SELECT s.owner_id FROM public.studio_bookings b JOIN public.studios s ON s.id = b.studio_id WHERE b.id = ANY(ids)
  ) ORDER BY w.user_id FOR UPDATE;
  FOR booking IN SELECT * FROM public.studio_bookings WHERE id = ANY(ids) ORDER BY id LOOP
    SELECT sum(amount) INTO confirmed FROM public.studio_payment_events
      WHERE booking_id = booking.id AND stage <> 'refund' AND (payment_id = p_payment_id OR is_historical);
    SELECT coalesce(sum(amount), 0) INTO refunded FROM public.studio_payment_events
      WHERE booking_id = booking.id AND stage = 'refund' AND (payment_id = p_payment_id OR is_historical);
    allocation := CASE WHEN booking.id = ids[cardinality(ids)] THEN amount_left ELSE round(p_amount * confirmed / total, 2) END;
    amount_left := amount_left - allocation;
    IF coalesce(confirmed, 0) <= 0 OR allocation <= 0 OR refunded + allocation > confirmed THEN RAISE EXCEPTION 'REFUND_EXCEEDS_PAYMENT'; END IF;
    INSERT INTO public.studio_payment_events(booking_id, user_id, provider_reference, payment_id, stage, amount, payment_method, occurred_at)
      VALUES(booking.id, booking.user_id, p_refund_id, p_payment_id, 'refund', allocation, booking.payment_method, p_refunded_at);
    UPDATE public.studio_bookings SET status = 'cancelled', payment_status = 'refunded',
      refund_amount = (SELECT sum(amount) FROM public.studio_payment_events WHERE booking_id = booking.id AND stage = 'refund'),
      refund_id = p_refund_id, refunded_at = coalesce(p_refunded_at, now()) WHERE id = booking.id;
    SELECT w.id INTO owner_wallet FROM public.wallets w JOIN public.studios s ON s.owner_id = w.user_id WHERE s.id = booking.studio_id;
    IF owner_wallet IS NULL THEN RAISE EXCEPTION 'STUDIO_OWNER_WALLET_MISSING'; END IF;
    INSERT INTO public.wallet_transactions(wallet_id, amount, type, description, reference_id, reference_type, is_credit, status)
      VALUES(owner_wallet, allocation, 'refund', 'Online booking payment refunded to customer', booking.id, 'refund', false, 'completed');
    UPDATE public.wallets SET balance = coalesce(balance, 0) - allocation, updated_at = now() WHERE id = owner_wallet;
    processed := array_append(processed, booking.id);
  END LOOP;
  -- The money returns to the provider's original payment method, not a wallet.
  RETURN jsonb_build_object('booking_ids', to_jsonb(processed), 'already_recorded', false);
END;
$$;
REVOKE ALL ON FUNCTION public.record_online_studio_refund(text, text, uuid[], numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_studio_refund(text, text, uuid[], numeric, timestamptz) TO service_role;

-- Limit whole provider payments, rather than cutting off a payment's allocations.
CREATE OR REPLACE FUNCTION public.get_online_studio_payment_events(p_user_id uuid, p_limit integer DEFAULT 80)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH recent AS (
    SELECT provider_reference FROM public.studio_payment_events WHERE user_id = p_user_id
    GROUP BY provider_reference ORDER BY max(occurred_at) DESC NULLS LAST, provider_reference
    LIMIT greatest(1, least(coalesce(p_limit, 80), 80))
  )
  SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at DESC NULLS LAST, e.id), '[]'::jsonb)
  FROM public.studio_payment_events e JOIN recent USING (provider_reference) WHERE e.user_id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.get_online_studio_payment_events(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_online_studio_payment_events(uuid, integer) TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.studio_payment_events;
  END IF;
END $$;
