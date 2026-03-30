-- Add 'partial' to the allowed payment_status values for downpayment support
-- This fixes: "new row for relation \"studio_bookings\" violates check constraint \"studio_bookings_payment_status_check\""

ALTER TABLE studio_bookings 
DROP CONSTRAINT IF EXISTS studio_bookings_payment_status_check;

ALTER TABLE studio_bookings 
ADD CONSTRAINT studio_bookings_payment_status_check 
CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'partial'::text, 'failed'::text, 'refunded'::text, 'refund_pending'::text]));
