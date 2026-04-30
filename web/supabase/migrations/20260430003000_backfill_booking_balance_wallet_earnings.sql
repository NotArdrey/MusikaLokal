BEGIN;

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_reference_type_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_reference_type_check
  CHECK (
    reference_type = ANY (
      ARRAY[
        'booking'::text,
        'booking_payment'::text,
        'booking_downpayment'::text,
        'booking_balance'::text,
        'deal_deposit'::text,
        'deal_settlement'::text,
        'penalty'::text,
        'refund'::text,
        'withdrawal'::text,
        'deposit'::text
      ]
    )
  );

-- Normalize older face-to-face balance credits so the wallet activity can
-- treat every incoming booking payment as an earning.
UPDATE public.wallet_transactions wt
SET type = 'earning',
    reference_type = 'booking_balance',
    description = 'Remaining balance payment received for booking at ' || COALESCE(s.name, 'Studio'),
    is_credit = true,
    status = 'completed'
FROM public.studio_bookings b
JOIN public.studios s ON s.id = b.studio_id
WHERE wt.reference_id = b.id
  AND wt.type = 'credit'
  AND wt.is_credit IS TRUE;

-- Older balance-payment handling reused the original downpayment wallet
-- transaction key, so the remaining balance could be marked paid without a
-- separate owner earning. Backfill only online balance settlements that are
-- fully paid, still have no balance earning, and were not cleared face-to-face.
WITH missing_balance_earnings AS (
  SELECT
    b.id AS booking_id,
    w.id AS wallet_id,
    GREATEST(0, COALESCE(b.final_price, 0) - COALESCE(b.payment_amount, 0)) AS amount,
    COALESCE(s.name, 'Studio') AS studio_name
  FROM public.studio_bookings b
  JOIN public.studios s ON s.id = b.studio_id
  JOIN public.wallets w ON w.user_id = s.owner_id
  WHERE b.payment_status = 'paid'
    AND b.payment_type = 'downpayment'
    AND COALESCE(b.remaining_balance, 0) = 0
    AND COALESCE(b.final_price, 0) > COALESCE(b.payment_amount, 0)
    AND b.checkout_session_id IS NOT NULL
    AND b.payment_intent_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = b.id
        AND wt.type = 'earning'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = b.id
        AND wt.type = 'earning'
        AND wt.reference_type = 'booking_balance'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = b.id
        AND wt.type = 'credit'
        AND wt.status = 'completed'
    )
), inserted AS (
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
  SELECT
    wallet_id,
    amount,
    'earning',
    'Remaining balance payment received for booking at ' || studio_name,
    booking_id,
    'booking_balance',
    true,
    'completed'
  FROM missing_balance_earnings
  WHERE amount > 0
  RETURNING wallet_id, amount
), wallet_sums AS (
  SELECT wallet_id, SUM(amount) AS amount
  FROM inserted
  GROUP BY wallet_id
)
UPDATE public.wallets w
SET balance = COALESCE(w.balance, 0) + wallet_sums.amount,
    updated_at = now()
FROM wallet_sums
WHERE w.id = wallet_sums.wallet_id;

COMMIT;
