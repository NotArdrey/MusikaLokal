DROP POLICY IF EXISTS booking_holds_owner_relocation_insert ON public.booking_holds;

CREATE POLICY booking_holds_owner_relocation_insert
ON public.booking_holds
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.studio_bookings sb
    JOIN public.studios s ON s.id = sb.studio_id
    WHERE s.id = booking_holds.studio_id
      AND s.owner_id = auth.uid()
      AND sb.studio_id = booking_holds.studio_id
      AND sb.user_id = booking_holds.user_id
      AND sb.status = 'pending_relocation'
      AND sb.relocation_proposed_date = booking_holds.booking_date
      AND sb.relocation_proposed_start_time = booking_holds.start_time
      AND sb.relocation_proposed_end_time = booking_holds.end_time
      AND sb.relocation_expires_at IS NOT NULL
      AND sb.relocation_expires_at > timezone('utc'::text, now())
      AND booking_holds.expires_at > timezone('utc'::text, now())
      AND booking_holds.expires_at <= sb.relocation_expires_at
  )
);

COMMENT ON POLICY booking_holds_owner_relocation_insert
ON public.booking_holds
IS 'Allows studio owners to reserve only the exact pending relocation slot proposed for one of their bookings.';
