-- Align are_slots_available with date override precedence used by booking UX and is_slot_available.
-- If a date override exists for the booking date, it must be the source of truth for open/close checks.

CREATE OR REPLACE FUNCTION public.are_slots_available(
  p_studio_id uuid,
  p_booking_date date,
  p_time_slots jsonb,
  p_user_id uuid DEFAULT NULL::uuid,
  p_exclude_booking_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
  slot jsonb;
  slot_start time;
  slot_end time;
  v_day_of_week integer;
  v_override record;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

  SELECT override_date, is_open, open_time, close_time
  INTO v_override
  FROM public.studio_date_overrides
  WHERE studio_id = p_studio_id
    AND override_date = p_booking_date
  LIMIT 1;

  FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
  LOOP
    BEGIN
      slot_start := (slot->>'start')::time;
      slot_end := (slot->>'end')::time;
    EXCEPTION WHEN OTHERS THEN
      RETURN FALSE;
    END;

    IF slot_end <= slot_start THEN
      RETURN FALSE;
    END IF;

    -- Date override takes precedence over weekly operating hours.
    IF v_override.override_date IS NOT NULL THEN
      IF COALESCE(v_override.is_open, false) = false THEN
        RETURN FALSE;
      END IF;

      IF v_override.open_time IS NOT NULL AND slot_start < v_override.open_time THEN
        RETURN FALSE;
      END IF;

      IF v_override.close_time IS NOT NULL AND slot_end > v_override.close_time THEN
        RETURN FALSE;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_operating_hours soh
        WHERE soh.studio_id = p_studio_id
          AND soh.day_of_week = v_day_of_week
          AND soh.is_open = true
          AND soh.open_time <= slot_start
          AND soh.close_time >= slot_end
      ) THEN
        RETURN FALSE;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.studio_bookings sb
      JOIN public.studio_booking_slots sbs
        ON sbs.booking_id = sb.id
      WHERE sb.studio_id = p_studio_id
        AND sb.booking_date = p_booking_date
        AND sb.status NOT IN ('cancelled', 'rejected')
        AND (p_exclude_booking_id IS NULL OR sb.id <> p_exclude_booking_id)
        AND (sbs.start_time < slot_end AND sbs.end_time > slot_start)
    ) THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.booking_holds bh
      WHERE bh.studio_id = p_studio_id
        AND bh.booking_date = p_booking_date
        AND bh.expires_at > now()
        AND (p_user_id IS NULL OR bh.user_id <> p_user_id)
        AND (bh.start_time < slot_end AND bh.end_time > slot_start)
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$;
