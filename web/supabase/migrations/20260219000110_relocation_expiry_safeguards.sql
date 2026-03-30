-- Relocation safeguards for studio booking schedule edits.

-- 1) Ensure status supports pending relocation.
ALTER TABLE public.studio_bookings
DROP CONSTRAINT IF EXISTS studio_bookings_status_check;

ALTER TABLE public.studio_bookings
ADD CONSTRAINT studio_bookings_status_check
CHECK (
  status IN (
    'pending',
    'confirmed',
    'cancelled',
    'completed',
    'checked_in',
    'pending_relocation'
  )
);

-- 2) Add relocation lifecycle columns.
ALTER TABLE public.studio_bookings
ADD COLUMN IF NOT EXISTS relocation_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS relocation_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS relocation_proposed_date DATE,
ADD COLUMN IF NOT EXISTS relocation_proposed_start_time TIME,
ADD COLUMN IF NOT EXISTS relocation_proposed_end_time TIME;

-- 3) Owner penalty ledger for abuse deterrence.
CREATE TABLE IF NOT EXISTS public.studio_owner_penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
  penalty_type TEXT NOT NULL CHECK (penalty_type IN ('forced_relocation_expired')),
  penalty_points INTEGER NOT NULL DEFAULT 1 CHECK (penalty_points > 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now())
);

CREATE INDEX IF NOT EXISTS idx_owner_penalties_owner_created
  ON public.studio_owner_penalties(owner_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_penalties_unique_booking_type
  ON public.studio_owner_penalties(booking_id, penalty_type);

-- 4) Processor for expired pending relocations.
CREATE OR REPLACE FUNCTION public.process_expired_pending_relocations()
RETURNS TABLE(cancelled_count INTEGER, penalties_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_cancelled_count INTEGER := 0;
  v_penalties_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      sb.id,
      sb.user_id,
      sb.studio_id,
      sb.booking_date,
      sb.start_time,
      sb.end_time,
      sb.relocation_proposed_date,
      sb.relocation_proposed_start_time,
      sb.relocation_proposed_end_time,
      s.owner_id,
      s.name AS studio_name
    FROM public.studio_bookings sb
    JOIN public.studios s ON s.id = sb.studio_id
    WHERE sb.status = 'pending_relocation'
      AND sb.relocation_expires_at IS NOT NULL
      AND sb.relocation_expires_at <= timezone('utc'::TEXT, now())
  LOOP
    UPDATE public.studio_bookings
    SET
      status = 'cancelled',
      payment_status = CASE
        WHEN payment_status IN ('paid', 'partial') THEN 'refund_pending'
        ELSE payment_status
      END,
      cancellation_reason = COALESCE(cancellation_reason, '') ||
        CASE
          WHEN cancellation_reason IS NULL OR cancellation_reason = '' THEN ''
          ELSE ' '
        END ||
        'Relocation request expired without musician acceptance. Auto-cancelled with refund processing.',
      relocation_requested_at = NULL,
      relocation_expires_at = NULL,
      relocation_proposed_date = NULL,
      relocation_proposed_start_time = NULL,
      relocation_proposed_end_time = NULL,
      updated_at = timezone('utc'::TEXT, now())
    WHERE id = rec.id;

    v_cancelled_count := v_cancelled_count + 1;

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES (
      rec.user_id,
      'warning',
      'Relocation Request Expired',
      'Your booking at ' || COALESCE(rec.studio_name, 'the studio') ||
      ' was cancelled because the relocation request expired. Refund processing has started.',
      jsonb_build_object(
        'bookingId', rec.id,
        'studioId', rec.studio_id,
        'trigger', 'relocation_expired_auto_cancel'
      )
    );

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES (
      rec.owner_id,
      'warning',
      'Owner Penalty Applied',
      'A relocation request for booking ' || rec.id || ' expired and was auto-cancelled. A penalty has been recorded.',
      jsonb_build_object(
        'bookingId', rec.id,
        'studioId', rec.studio_id,
        'penaltyType', 'forced_relocation_expired'
      )
    );

    INSERT INTO public.studio_owner_penalties (
      owner_id,
      studio_id,
      booking_id,
      penalty_type,
      penalty_points,
      reason
    )
    VALUES (
      rec.owner_id,
      rec.studio_id,
      rec.id,
      'forced_relocation_expired',
      1,
      'Relocation request expired without acceptance; booking was auto-cancelled and refunded.'
    )
    ON CONFLICT (booking_id, penalty_type) DO NOTHING;

    IF FOUND THEN
      v_penalties_count := v_penalties_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_cancelled_count, v_penalties_count;
END;
$$;

COMMENT ON FUNCTION public.process_expired_pending_relocations()
IS 'Cancels expired pending_relocation bookings, marks refunds pending, notifies users, and records owner penalties.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'process-expired-pending-relocations';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'process-expired-pending-relocations',
      '*/15 * * * *',
      'SELECT public.process_expired_pending_relocations();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
