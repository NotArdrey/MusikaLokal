BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL CHECK (amount >= 100),
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'cancelled')),
  reference_number text NOT NULL UNIQUE,
  notes text,
  source_gross_revenue numeric NOT NULL DEFAULT 0,
  source_provider_earnings numeric NOT NULL DEFAULT 0,
  source_refunds numeric NOT NULL DEFAULT 0,
  source_platform_net numeric NOT NULL DEFAULT 0,
  available_before numeric NOT NULL DEFAULT 0,
  available_after numeric NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0,
  processed_by uuid NOT NULL REFERENCES public.profiles(id),
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_withdrawal_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL REFERENCES public.platform_withdrawals(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
  payment_status text,
  payment_amount numeric NOT NULL DEFAULT 0,
  provider_earning numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  platform_net_amount numeric NOT NULL DEFAULT 0,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (withdrawal_id, booking_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_withdrawals_created_at
  ON public.platform_withdrawals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_withdrawals_processed_by
  ON public.platform_withdrawals(processed_by);

CREATE INDEX IF NOT EXISTS idx_platform_withdrawal_links_withdrawal
  ON public.platform_withdrawal_payment_links(withdrawal_id);

CREATE INDEX IF NOT EXISTS idx_platform_withdrawal_links_booking
  ON public.platform_withdrawal_payment_links(booking_id);

ALTER TABLE public.platform_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_withdrawal_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view platform withdrawals" ON public.platform_withdrawals;
CREATE POLICY "Admins can view platform withdrawals"
  ON public.platform_withdrawals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view platform withdrawal payment links" ON public.platform_withdrawal_payment_links;
CREATE POLICY "Admins can view platform withdrawal payment links"
  ON public.platform_withdrawal_payment_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.process_platform_manual_withdrawal(
  p_admin_user_id uuid,
  p_amount numeric,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_withdrawal_id uuid := gen_random_uuid();
  v_reference text := 'platform_wd_' || upper(substr(replace(v_withdrawal_id::text, '-', ''), 1, 12));
  v_gross numeric := 0;
  v_provider_earnings numeric := 0;
  v_refunds numeric := 0;
  v_platform_net numeric := 0;
  v_previous_withdrawals numeric := 0;
  v_available_before numeric := 0;
  v_available_after numeric := 0;
  v_payment_count integer := 0;
  v_withdrawal public.platform_withdrawals%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('platform_manual_withdrawal'));

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_admin_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  IF v_amount < 100 THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is PHP 100';
  END IF;

  WITH provider_by_booking AS (
    SELECT
      wt.reference_id AS booking_id,
      sum(coalesce(wt.amount, 0)) AS provider_earning
    FROM public.wallet_transactions wt
    WHERE wt.type = 'earning'
      AND wt.status = 'completed'
      AND wt.is_credit IS DISTINCT FROM false
      AND coalesce(wt.reference_type, '') = ANY (
        ARRAY['', 'booking', 'booking_payment', 'booking_downpayment', 'booking_balance']
      )
    GROUP BY wt.reference_id
  ),
  eligible_payments AS (
    SELECT
      b.id,
      coalesce(nullif(b.payment_amount, 0), b.final_price, 0) AS payment_amount,
      coalesce(p.provider_earning, 0) AS provider_earning,
      CASE
        WHEN lower(coalesce(b.payment_status, '')) IN ('refunded', 'refund_pending')
          THEN coalesce(nullif(b.payment_amount, 0), b.final_price, 0)
        ELSE 0
      END AS refund_amount
    FROM public.studio_bookings b
    LEFT JOIN provider_by_booking p ON p.booking_id = b.id
    WHERE lower(coalesce(b.payment_status, '')) IN ('paid', 'partial', 'refunded', 'refund_pending')
  )
  SELECT
    round(coalesce(sum(payment_amount), 0), 2),
    round(coalesce(sum(provider_earning), 0), 2),
    round(coalesce(sum(refund_amount), 0), 2),
    count(*)::integer
  INTO v_gross, v_provider_earnings, v_refunds, v_payment_count
  FROM eligible_payments;

  SELECT round(coalesce(sum(amount), 0), 2)
  INTO v_previous_withdrawals
  FROM public.platform_withdrawals
  WHERE status = 'completed';

  v_platform_net := round(greatest(v_gross - v_provider_earnings - v_refunds, 0), 2);
  v_available_before := round(greatest(v_platform_net - v_previous_withdrawals, 0), 2);

  IF v_amount > v_available_before THEN
    RAISE EXCEPTION 'Insufficient platform net. Available PHP %, requested PHP %',
      v_available_before,
      v_amount;
  END IF;

  v_available_after := round(v_available_before - v_amount, 2);

  INSERT INTO public.platform_withdrawals (
    id,
    amount,
    status,
    reference_number,
    notes,
    source_gross_revenue,
    source_provider_earnings,
    source_refunds,
    source_platform_net,
    available_before,
    available_after,
    payment_count,
    processed_by,
    processed_at
  )
  VALUES (
    v_withdrawal_id,
    v_amount,
    'completed',
    v_reference,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_gross,
    v_provider_earnings,
    v_refunds,
    v_platform_net,
    v_available_before,
    v_available_after,
    v_payment_count,
    p_admin_user_id,
    now()
  )
  RETURNING * INTO v_withdrawal;

  WITH provider_by_booking AS (
    SELECT
      wt.reference_id AS booking_id,
      sum(coalesce(wt.amount, 0)) AS provider_earning
    FROM public.wallet_transactions wt
    WHERE wt.type = 'earning'
      AND wt.status = 'completed'
      AND wt.is_credit IS DISTINCT FROM false
      AND coalesce(wt.reference_type, '') = ANY (
        ARRAY['', 'booking', 'booking_payment', 'booking_downpayment', 'booking_balance']
      )
    GROUP BY wt.reference_id
  ),
  eligible_payments AS (
    SELECT
      b.id,
      b.payment_status,
      coalesce(nullif(b.payment_amount, 0), b.final_price, 0) AS payment_amount,
      coalesce(p.provider_earning, 0) AS provider_earning,
      CASE
        WHEN lower(coalesce(b.payment_status, '')) IN ('refunded', 'refund_pending')
          THEN coalesce(nullif(b.payment_amount, 0), b.final_price, 0)
        ELSE 0
      END AS refund_amount,
      coalesce(b.checkout_session_id, b.payment_intent_id, b.id::text) AS payment_reference
    FROM public.studio_bookings b
    LEFT JOIN provider_by_booking p ON p.booking_id = b.id
    WHERE lower(coalesce(b.payment_status, '')) IN ('paid', 'partial', 'refunded', 'refund_pending')
  )
  INSERT INTO public.platform_withdrawal_payment_links (
    withdrawal_id,
    booking_id,
    payment_status,
    payment_amount,
    provider_earning,
    refund_amount,
    platform_net_amount,
    payment_reference
  )
  SELECT
    v_withdrawal_id,
    id,
    payment_status,
    round(payment_amount, 2),
    round(provider_earning, 2),
    round(refund_amount, 2),
    round(greatest(payment_amount - provider_earning - refund_amount, 0), 2),
    payment_reference
  FROM eligible_payments;

  RETURN jsonb_build_object(
    'success', true,
    'manual_cashout', true,
    'message', 'Manual platform withdrawal recorded. No external transfer was sent.',
    'withdrawal', to_jsonb(v_withdrawal),
    'reference', v_reference,
    'platformAvailable', v_available_after,
    'snapshot', jsonb_build_object(
      'grossRevenue', v_gross,
      'providerEarnings', v_provider_earnings,
      'refunds', v_refunds,
      'platformNet', v_platform_net,
      'previousWithdrawals', v_previous_withdrawals,
      'availableBefore', v_available_before,
      'availableAfter', v_available_after,
      'paymentCount', v_payment_count
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_platform_manual_withdrawal(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_platform_manual_withdrawal(uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_platform_manual_withdrawal(uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_platform_manual_withdrawal(uuid, numeric, text) TO service_role;

COMMIT;
