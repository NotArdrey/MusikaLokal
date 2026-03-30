-- Fix attendance notification trigger for 3NF schema
-- Replaces deprecated studios.images reference with studio_media lookup.

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
    (
      SELECT sm.media_url
      FROM public.studio_media sm
      WHERE sm.studio_id = sb.studio_id
        AND sm.media_type = 'image'
      ORDER BY sm.sort_order NULLS LAST, sm.created_at ASC
      LIMIT 1
    ) AS studio_image
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_image := v_booking.studio_image;

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

    BEGIN
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
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'notify_booking_attendance_event failed to insert notification: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;
