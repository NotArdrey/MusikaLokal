-- Delete all active studio bookings (pending, confirmed, checked_in, pending_relocation).
DELETE FROM public.studio_bookings
WHERE status IN ('pending', 'confirmed', 'checked_in', 'pending_relocation');
