-- Anti-abuse workflow: booking incidents, payout holds, and safe payout release.

ALTER TABLE public.studio_bookings
ADD COLUMN IF NOT EXISTS payout_hold boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS payout_hold_reason text,
ADD COLUMN IF NOT EXISTS payout_hold_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS payout_released_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS musician_arrival_reported_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS owner_entry_confirmed_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.booking_incidents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  counterparty_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  issue_type text NOT NULL CHECK (issue_type IN (
    'cannot_access_studio',
    'entry_denied',
    'no_show_claim',
    'other'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'responded',
    'manual_review',
    'resolved_refund',
    'resolved_no_refund',
    'dismissed'
  )),
  reporter_notes text,
  reporter_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  counterparty_notes text,
  counterparty_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_deadline_at timestamp with time zone NOT NULL,
  responded_at timestamp with time zone,
  resolved_at timestamp with time zone,
  resolved_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_booking_incidents_booking_status
  ON public.booking_incidents(booking_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_incidents_counterparty_deadline
  ON public.booking_incidents(counterparty_user_id, status, response_deadline_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_incidents_single_open_per_booking
  ON public.booking_incidents(booking_id)
  WHERE status IN ('open', 'responded', 'manual_review');

ALTER TABLE public.booking_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view booking incidents" ON public.booking_incidents;
CREATE POLICY "Participants can view booking incidents"
ON public.booking_incidents FOR SELECT TO authenticated
USING (auth.uid() = reporter_user_id OR auth.uid() = counterparty_user_id);

DROP POLICY IF EXISTS "Participants can insert booking incidents" ON public.booking_incidents;
CREATE POLICY "Participants can insert booking incidents"
ON public.booking_incidents FOR INSERT TO authenticated
WITH CHECK (auth.uid() = reporter_user_id);

DROP POLICY IF EXISTS "Participants can update booking incidents" ON public.booking_incidents;
CREATE POLICY "Participants can update booking incidents"
ON public.booking_incidents FOR UPDATE TO authenticated
USING (auth.uid() = reporter_user_id OR auth.uid() = counterparty_user_id)
WITH CHECK (auth.uid() = reporter_user_id OR auth.uid() = counterparty_user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at_booking_incidents()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_incidents_updated_at ON public.booking_incidents;
CREATE TRIGGER trg_booking_incidents_updated_at
BEFORE UPDATE ON public.booking_incidents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_booking_incidents();

CREATE OR REPLACE FUNCTION public.hold_booking_payout(
  p_booking_id uuid,
  p_reason text DEFAULT NULL,
  p_reverse_existing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx record;
  v_hold_reverse_exists boolean := false;
BEGIN
  UPDATE public.studio_bookings
  SET
    payout_hold = true,
    payout_hold_reason = COALESCE(p_reason, payout_hold_reason, 'Payout hold requested.'),
    payout_hold_at = COALESCE(payout_hold_at, timezone('utc'::text, now())),
    payout_released_at = NULL,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF p_reverse_existing THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = p_booking_id
        AND wt.type = 'withdrawal'
        AND wt.description ILIKE 'Payout hold reversal%'
    )
    INTO v_hold_reverse_exists;

    IF NOT v_hold_reverse_exists THEN
      SELECT wt.id, wt.wallet_id, wt.amount
      INTO v_tx
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = p_booking_id
        AND wt.type = 'earning'
        AND wt.status = 'completed'
      ORDER BY wt.created_at DESC
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.wallets
        SET
          balance = GREATEST(0, COALESCE(balance, 0) - COALESCE(v_tx.amount, 0)),
          updated_at = timezone('utc'::text, now())
        WHERE id = v_tx.wallet_id;

        INSERT INTO public.wallet_transactions (
          wallet_id,
          amount,
          type,
          description,
          reference_id,
          is_credit,
          status
        )
        VALUES (
          v_tx.wallet_id,
          COALESCE(v_tx.amount, 0),
          'withdrawal',
          'Payout hold reversal for booking incident workflow',
          p_booking_id,
          false,
          'completed'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payout_hold', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_booking_payout(
  p_booking_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_wallet record;
  v_amount numeric := 0;
  v_existing_earning boolean := false;
BEGIN
  SELECT
    sb.id,
    sb.status,
    sb.payment_status,
    sb.payment_amount,
    sb.final_price,
    sb.payout_hold,
    sb.studio_id,
    s.owner_id
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_incidents bi
    WHERE bi.booking_id = p_booking_id
      AND bi.status IN ('open', 'responded', 'manual_review')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'blocked', true,
      'reason', 'Active incident exists'
    );
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'blocked', true,
      'reason', 'Booking is cancelled'
    );
  END IF;

  IF v_booking.payment_status NOT IN ('paid', 'partial') THEN
    UPDATE public.studio_bookings
    SET
      payout_hold = false,
      payout_hold_reason = NULL,
      payout_released_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'credited', false,
      'reason', 'Payment not settled'
    );
  END IF;

  v_amount := COALESCE(v_booking.payment_amount, v_booking.final_price, 0);

  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.reference_id = p_booking_id
      AND wt.type = 'earning'
      AND wt.status = 'completed'
  )
  INTO v_existing_earning;

  IF NOT v_existing_earning AND v_amount > 0 THEN
    SELECT id, balance
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_booking.owner_id
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance)
      VALUES (v_booking.owner_id, 0)
      RETURNING id, balance INTO v_wallet;
    END IF;

    UPDATE public.wallets
    SET
      balance = COALESCE(balance, 0) + v_amount,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      amount,
      type,
      description,
      reference_id,
      is_credit,
      status
    )
    VALUES (
      v_wallet.id,
      v_amount,
      'earning',
      COALESCE(p_reason, 'Booking payout released after completion and no active incidents.'),
      p_booking_id,
      true,
      'completed'
    );
  END IF;

  UPDATE public.studio_bookings
  SET
    payout_hold = false,
    payout_hold_reason = NULL,
    payout_released_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credited', NOT v_existing_earning,
    'amount', v_amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_release_eligible_booking_payouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT sb.id
    FROM public.studio_bookings sb
    WHERE sb.status = 'completed'
      AND sb.payment_status IN ('paid', 'partial')
      AND sb.payout_hold = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_incidents bi
        WHERE bi.booking_id = sb.id
          AND bi.status IN ('open', 'responded', 'manual_review')
      )
  LOOP
    PERFORM public.release_booking_payout(rec.id, 'Auto-release after completed booking without active incidents.');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_overdue_booking_incidents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT bi.id, bi.booking_id, bi.reporter_user_id, bi.counterparty_user_id
    FROM public.booking_incidents bi
    WHERE bi.status IN ('open', 'responded')
      AND bi.response_deadline_at <= timezone('utc'::text, now())
  LOOP
    UPDATE public.booking_incidents
    SET
      status = 'manual_review',
      resolution = COALESCE(resolution, 'Response deadline missed. Escalated for manual review.'),
      updated_at = timezone('utc'::text, now())
    WHERE id = rec.id;

    PERFORM public.hold_booking_payout(
      rec.booking_id,
      'Escalated to manual review after incident response deadline.',
      true
    );

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES
      (
        rec.reporter_user_id,
        'warning',
        'Incident Escalated',
        'Your booking incident has been escalated for manual review.',
        jsonb_build_object('incident_id', rec.id, 'booking_id', rec.booking_id, 'event_type', 'incident_escalated_manual_review')
      ),
      (
        rec.counterparty_user_id,
        'warning',
        'Incident Escalated',
        'A booking incident has been escalated for manual review.',
        jsonb_build_object('incident_id', rec.id, 'booking_id', rec.booking_id, 'event_type', 'incident_escalated_manual_review')
      );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_booking_auto_complete()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date;
  v_now_time time;
  v_count integer := 0;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_now_time := (now() AT TIME ZONE 'Asia/Manila')::time;

  UPDATE public.studio_bookings sb
  SET
    status = 'completed',
    updated_at = now()
  WHERE sb.status IN ('confirmed', 'checked_in')
    AND (
      sb.booking_date < v_today
      OR (
        sb.booking_date = v_today
        AND v_now_time >= sb.end_time
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.process_release_eligible_booking_payouts();

  RETURN v_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'process-release-eligible-booking-payouts';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'process-overdue-booking-incidents';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'process-release-eligible-booking-payouts',
      '*/5 * * * *',
      'SELECT public.process_release_eligible_booking_payouts();'
    );

    PERFORM cron.schedule(
      'process-overdue-booking-incidents',
      '*/5 * * * *',
      'SELECT public.process_overdue_booking_incidents();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
