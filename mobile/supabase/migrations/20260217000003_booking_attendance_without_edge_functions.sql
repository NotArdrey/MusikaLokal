-- Attendance and booking-start automation without Edge Functions

ALTER TABLE public.studio_bookings
ADD COLUMN IF NOT EXISTS check_in_time timestamptz;

CREATE TABLE IF NOT EXISTS public.booking_attendance_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id uuid NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
  reporter_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('booking_started', 'checked_in', 'late', 'not_attending', 'no_show')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_attendance_events_unique_report
ON public.booking_attendance_events (
  booking_id,
  event_type,
  coalesce(reporter_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

ALTER TABLE public.booking_attendance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view attendance events" ON public.booking_attendance_events;
CREATE POLICY "Participants can view attendance events"
ON public.booking_attendance_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.studio_bookings sb
    JOIN public.studios s ON s.id = sb.studio_id
    WHERE sb.id = booking_attendance_events.booking_id
      AND (sb.user_id = auth.uid() OR s.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Participants can insert attendance events" ON public.booking_attendance_events;
CREATE POLICY "Participants can insert attendance events"
ON public.booking_attendance_events
FOR INSERT TO authenticated
WITH CHECK (
  reporter_user_id = auth.uid()
  AND event_type IN ('checked_in', 'late', 'not_attending', 'no_show')
  AND EXISTS (
    SELECT 1
    FROM public.studio_bookings sb
    JOIN public.studios s ON s.id = sb.studio_id
    WHERE sb.id = booking_attendance_events.booking_id
      AND (sb.user_id = auth.uid() OR s.owner_id = auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.notify_booking_attendance_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_recipient uuid;
  v_title text;
  v_message text;
  v_image text;
BEGIN
  SELECT
    sb.id,
    sb.user_id,
    sb.studio_id,
    sb.booking_date,
    sb.start_time,
    s.owner_id,
    s.name AS studio_name,
    s.images AS studio_images
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_image := COALESCE(v_booking.studio_images->>0, NULL);

  CASE NEW.event_type
    WHEN 'booking_started' THEN
      v_title := 'Booking Started';
      v_message := format('Booking at %s has started.', COALESCE(v_booking.studio_name, 'the studio'));
    WHEN 'checked_in' THEN
      v_title := 'Check-in Confirmed';
      v_message := format('Check-in was confirmed for booking at %s on %s.', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date);
    WHEN 'late' THEN
      v_title := 'Late Arrival Alert';
      v_message := format('A participant reported they will be late for booking at %s on %s (%s).', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date, v_booking.start_time);
    WHEN 'not_attending' THEN
      v_title := 'Attendance Alert';
      v_message := format('A participant reported they cannot attend booking at %s on %s (%s).', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date, v_booking.start_time);
    WHEN 'no_show' THEN
      v_title := 'No-show Alert';
      v_message := format('A participant was marked as no-show for booking at %s on %s (%s).', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date, v_booking.start_time);
    ELSE
      RETURN NEW;
  END CASE;

  FOREACH v_recipient IN ARRAY ARRAY[v_booking.user_id, v_booking.owner_id]
  LOOP
    IF v_recipient IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = v_recipient
        AND n.meta->>'booking_id' = NEW.booking_id::text
        AND n.meta->>'event_type' = NEW.event_type
        AND n.created_at > now() - interval '12 hours'
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        image,
        meta,
        read
      )
      VALUES (
        v_recipient,
        CASE WHEN NEW.event_type IN ('late', 'not_attending', 'no_show') THEN 'warning' ELSE 'info' END,
        v_title,
        v_message,
        v_image,
        jsonb_build_object(
          'booking_id', NEW.booking_id,
          'studio_id', v_booking.studio_id,
          'booking_date', v_booking.booking_date,
          'event_type', NEW.event_type,
          'reported_by_user_id', NEW.reporter_user_id
        ),
        false
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_attendance_event ON public.booking_attendance_events;
CREATE TRIGGER trg_notify_booking_attendance_event
AFTER INSERT ON public.booking_attendance_events
FOR EACH ROW
EXECUTE FUNCTION public.notify_booking_attendance_event();

CREATE OR REPLACE FUNCTION public.record_booking_attendance(
  p_booking_id uuid,
  p_event_type text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_booking record;
  v_inserted_count integer := 0;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_event_type NOT IN ('checked_in', 'late', 'not_attending', 'no_show') THEN
    RAISE EXCEPTION 'Unsupported attendance event type: %', p_event_type;
  END IF;

  SELECT sb.id, sb.user_id, sb.studio_id, sb.booking_date, sb.start_time, sb.status, s.owner_id
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_uid <> v_booking.user_id AND v_uid <> v_booking.owner_id THEN
    RAISE EXCEPTION 'Not authorized for this booking';
  END IF;

  IF p_event_type = 'checked_in' THEN
    UPDATE public.studio_bookings
    SET
      status = 'checked_in',
      check_in_time = COALESCE(check_in_time, now()),
      updated_at = now()
    WHERE id = p_booking_id
      AND status IN ('confirmed', 'checked_in');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot check in. Booking must be confirmed.';
    END IF;
  END IF;

  INSERT INTO public.booking_attendance_events (
    booking_id,
    reporter_user_id,
    event_type,
    notes
  )
  VALUES (
    p_booking_id,
    v_uid,
    p_event_type,
    p_notes
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'event_type', p_event_type,
    'inserted', (v_inserted_count > 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_booking_attendance(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_booking_auto_start()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  v_now_time time;
  v_count integer := 0;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_now_time := (now() AT TIME ZONE 'Asia/Manila')::time;

  WITH updated AS (
    UPDATE public.studio_bookings sb
    SET
      status = 'checked_in',
      check_in_time = COALESCE(check_in_time, now()),
      updated_at = now()
    WHERE sb.status = 'confirmed'
      AND sb.booking_date = v_today
      AND v_now_time >= sb.start_time
      AND v_now_time < sb.end_time
    RETURNING sb.id
  )
  INSERT INTO public.booking_attendance_events (
    booking_id,
    reporter_user_id,
    event_type,
    notes
  )
  SELECT
    u.id,
    NULL,
    'booking_started',
    'Auto-started when booking window began.'
  FROM updated u
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

DO $$
BEGIN
  BEGIN
    EXECUTE 'create extension if not exists pg_cron';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension unavailable: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'booking_auto_start_every_minute') THEN
        PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'booking_auto_start_every_minute' LIMIT 1));
      END IF;

      PERFORM cron.schedule(
        'booking_auto_start_every_minute',
        '* * * * *',
        $job$select public.process_booking_auto_start();$job$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not schedule booking auto-start job: %', SQLERRM;
    END;
  END IF;
END;
$$;