-- Phase B contract: drop legacy studio_bookings.time_slots

DO $$
DECLARE
  v_booking_id uuid;
  v_remaining bigint;
BEGIN
  FOR v_booking_id IN
    SELECT sb.id
    FROM public.studio_bookings sb
    WHERE (sb.time_slots IS NOT NULL AND jsonb_typeof(sb.time_slots) = 'array' AND jsonb_array_length(sb.time_slots) > 0)
       OR (sb.start_time IS NOT NULL AND sb.end_time IS NOT NULL)
  LOOP
    PERFORM public.sync_studio_booking_slots_3nf(v_booking_id);
  END LOOP;

  PERFORM set_config('app.skip_booking_slots_3nf_sync', '1', true);
  UPDATE public.studio_bookings
  SET time_slots = NULL
  WHERE time_slots IS NOT NULL
    AND jsonb_typeof(time_slots) = 'array'
    AND jsonb_array_length(time_slots) > 0;
  PERFORM set_config('app.skip_booking_slots_3nf_sync', '0', true);

  SELECT count(*)
  INTO v_remaining
  FROM public.studio_bookings
  WHERE time_slots IS NOT NULL
    AND jsonb_typeof(time_slots) = 'array'
    AND jsonb_array_length(time_slots) > 0;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Booking slots contract blocked: % legacy rows still populated', v_remaining;
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.studio_bookings_legacy_projection AS
SELECT
  sb.id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'start', to_char(sbs.start_time, 'HH24:MI'),
          'end', to_char(sbs.end_time, 'HH24:MI')
        )
        ORDER BY sbs.sort_order, sbs.created_at
      )
      FROM public.studio_booking_slots sbs
      WHERE sbs.booking_id = sb.id
    ),
    '[]'::jsonb
  ) AS time_slots
FROM public.studio_bookings sb;

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
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

  FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
  LOOP
    slot_start := (slot->>'start')::time;
    slot_end := (slot->>'end')::time;

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

    IF EXISTS (
      SELECT 1
      FROM public.studio_date_overrides sdo
      WHERE sdo.studio_id = p_studio_id
        AND sdo.override_date = p_booking_date
        AND sdo.is_open = false
    ) THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.studio_bookings sb
      JOIN public.studio_booking_slots sbs
        ON sbs.booking_id = sb.id
      WHERE sb.studio_id = p_studio_id
        AND sb.booking_date = p_booking_date
        AND sb.status IN ('pending', 'confirmed')
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

DROP TRIGGER IF EXISTS trg_studio_bookings_sync_slots_3nf_from_legacy ON public.studio_bookings;
DROP FUNCTION IF EXISTS public.trg_sync_studio_booking_slots_3nf_from_legacy();

ALTER TABLE public.studio_bookings
  DROP COLUMN IF EXISTS time_slots;

CREATE OR REPLACE FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.studio_bookings sb
  WHERE sb.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio booking not found';
  END IF;
END;
$$;