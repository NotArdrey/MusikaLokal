-- Cancel all pending/processing withdrawal requests and refund the amounts back to wallets.
-- This zeroes out any pending balance across all accounts.

BEGIN;

-- Refund each pending/processing withdrawal back to the corresponding wallet
UPDATE public.wallets w
SET balance = w.balance + wr.amount,
    updated_at = now()
FROM public.withdrawal_requests wr
WHERE wr.wallet_id = w.id
  AND wr.status IN ('pending', 'processing');

-- Mark all pending/processing withdrawals as cancelled
UPDATE public.withdrawal_requests
SET status = 'cancelled',
    notes  = coalesce(notes || ' | ', '') || 'Cancelled by admin: pending balance reset.',
    updated_at = now()
WHERE status IN ('pending', 'processing');

COMMIT;
