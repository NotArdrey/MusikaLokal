-- Zero out all pending payments in studio_bookings.
-- Sets payment_status to 'paid' and remaining_balance to 0
-- for every booking where payment is still pending or partial/unpaid.

UPDATE public.studio_bookings
SET payment_status    = 'paid',
    remaining_balance = 0,
    updated_at        = now()
WHERE payment_status IN ('pending', 'unpaid', 'partial')
   OR remaining_balance > 0;
