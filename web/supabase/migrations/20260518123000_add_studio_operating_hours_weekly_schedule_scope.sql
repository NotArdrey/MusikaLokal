BEGIN;

ALTER TABLE public.studio_operating_hours
ADD COLUMN IF NOT EXISTS weekly_schedule_scope text,
ADD COLUMN IF NOT EXISTS weekly_schedule_end_date date,
ADD COLUMN IF NOT EXISTS weekly_schedule_dates jsonb;

ALTER TABLE public.studio_operating_hours
DROP CONSTRAINT IF EXISTS studio_operating_hours_weekly_schedule_scope_check;

ALTER TABLE public.studio_operating_hours
ADD CONSTRAINT studio_operating_hours_weekly_schedule_scope_check
CHECK (
  weekly_schedule_scope IS NULL
  OR weekly_schedule_scope = ANY (ARRAY['indefinite', 'until', 'specific_dates'])
);

ALTER TABLE public.studio_operating_hours
DROP CONSTRAINT IF EXISTS studio_operating_hours_weekly_schedule_dates_check;

ALTER TABLE public.studio_operating_hours
ADD CONSTRAINT studio_operating_hours_weekly_schedule_dates_check
CHECK (
  weekly_schedule_dates IS NULL
  OR jsonb_typeof(weekly_schedule_dates) = 'array'
);

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
  v_has_override boolean;
  v_weekly_scope text;
  v_weekly_end_date date;
  v_weekly_dates jsonb;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

  SELECT EXISTS (
    SELECT 1
    FROM public.studio_date_overrides
    WHERE studio_id = p_studio_id
      AND override_date = p_booking_date
  )
  INTO v_has_override;

  IF NOT v_has_override THEN
    SELECT
      ss.weekly_schedule_scope,
      ss.weekly_schedule_end_date,
      ss.weekly_schedule_dates
    INTO v_weekly_scope, v_weekly_end_date, v_weekly_dates
    FROM public.studio_settings ss
    WHERE ss.studio_id = p_studio_id;
  END IF;

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

    IF v_has_override THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_date_overrides sdo
        WHERE sdo.studio_id = p_studio_id
          AND sdo.override_date = p_booking_date
          AND sdo.is_open = true
          AND sdo.open_time <= slot_start
          AND sdo.close_time >= slot_end
      ) THEN
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
          AND (
            COALESCE(soh.weekly_schedule_scope, v_weekly_scope, 'indefinite') = 'indefinite'
            OR (
              COALESCE(soh.weekly_schedule_scope, v_weekly_scope, 'indefinite') = 'until'
              AND (
                COALESCE(soh.weekly_schedule_end_date, v_weekly_end_date) IS NULL
                OR p_booking_date <= COALESCE(soh.weekly_schedule_end_date, v_weekly_end_date)
              )
            )
            OR (
              COALESCE(soh.weekly_schedule_scope, v_weekly_scope, 'indefinite') = 'specific_dates'
              AND COALESCE(soh.weekly_schedule_dates, v_weekly_dates, '[]'::jsonb) ? p_booking_date::text
            )
          )
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

CREATE OR REPLACE FUNCTION public.is_slot_available(
  p_studio_id uuid,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE sql
AS $function$
  SELECT public.are_slots_available(
    p_studio_id,
    p_booking_date,
    jsonb_build_array(jsonb_build_object('start', p_start_time, 'end', p_end_time)),
    p_user_id,
    NULL::uuid
  );
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
