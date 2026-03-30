-- Allow owner-initiated relocation workflow without hard moving bookings.
ALTER TABLE public.studio_bookings
DROP CONSTRAINT IF EXISTS studio_bookings_status_check;

ALTER TABLE public.studio_bookings
ADD CONSTRAINT studio_bookings_status_check
CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'checked_in', 'pending_relocation'));
