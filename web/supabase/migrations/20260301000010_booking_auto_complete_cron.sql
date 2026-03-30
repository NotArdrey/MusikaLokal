CREATE OR REPLACE FUNCTION public.process_booking_auto_complete()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date;
  v_now_time time;
  v_count integer := 0;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_now_time := (now() AT TIME ZONE 'Asia/Manila')::time;

  UPDATE public.studio_bookings sb
  SET
    status = 'completed',
    updated_at = now()
  WHERE sb.status IN ('confirmed', 'checked_in')
    AND (
      sb.booking_date < v_today
      OR (
        sb.booking_date = v_today
        AND v_now_time >= sb.end_time
      )
    );

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
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'booking_auto_complete_every_minute') THEN
        PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'booking_auto_complete_every_minute' LIMIT 1));
      END IF;

      PERFORM cron.schedule(
        'booking_auto_complete_every_minute',
        '* * * * *',
        $job$select public.process_booking_auto_complete();$job$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not schedule booking auto-complete job: %', SQLERRM;
    END;
  END IF;
END;
$$;