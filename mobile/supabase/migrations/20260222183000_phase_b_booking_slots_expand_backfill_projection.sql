-- Phase B (Studio Bookings): expand + backfill + projection, backward compatible

CREATE TABLE IF NOT EXISTS public.studio_booking_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_booking_slots_time_check CHECK (end_time > start_time),
  CONSTRAINT studio_booking_slots_booking_id_start_time_end_time_key UNIQUE (booking_id, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS idx_studio_booking_slots_booking_id ON public.studio_booking_slots(booking_id);

CREATE OR REPLACE FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.studio_bookings sb WHERE sb.id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio booking not found';
  END IF;

  DELETE FROM public.studio_booking_slots WHERE booking_id = p_booking_id;

  INSERT INTO public.studio_booking_slots (booking_id, start_time, end_time, sort_order)
  SELECT
    sb.id,
    (slot.item->>'start')::time,
    (slot.item->>'end')::time,
    slot.position::int - 1
  FROM public.studio_bookings sb
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(sb.time_slots) = 'array' THEN sb.time_slots
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS slot(item, position)
  WHERE sb.id = p_booking_id
    AND slot.item ? 'start'
    AND slot.item ? 'end'
    AND NULLIF(slot.item->>'start', '') IS NOT NULL
    AND NULLIF(slot.item->>'end', '') IS NOT NULL
  ON CONFLICT (booking_id, start_time, end_time) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.studio_booking_slots sbs
    WHERE sbs.booking_id = p_booking_id
  ) THEN
    INSERT INTO public.studio_booking_slots (booking_id, start_time, end_time, sort_order)
    SELECT
      sb.id,
      sb.start_time,
      sb.end_time,
      0
    FROM public.studio_bookings sb
    WHERE sb.id = p_booking_id
      AND sb.start_time IS NOT NULL
      AND sb.end_time IS NOT NULL
      AND sb.end_time > sb.start_time
    ON CONFLICT (booking_id, start_time, end_time) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_studio_booking_slots_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_booking_slots_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_studio_booking_slots_3nf(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_studio_bookings_sync_slots_3nf_from_legacy ON public.studio_bookings;
CREATE TRIGGER trg_studio_bookings_sync_slots_3nf_from_legacy
AFTER INSERT OR UPDATE OF time_slots, start_time, end_time
ON public.studio_bookings
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_studio_booking_slots_3nf_from_legacy();

DO $$
DECLARE
  v_booking_id uuid;
BEGIN
  FOR v_booking_id IN
    SELECT sb.id
    FROM public.studio_bookings sb
    WHERE (sb.time_slots IS NOT NULL AND jsonb_typeof(sb.time_slots) = 'array' AND jsonb_array_length(sb.time_slots) > 0)
       OR (sb.start_time IS NOT NULL AND sb.end_time IS NOT NULL)
  LOOP
    PERFORM public.sync_studio_booking_slots_3nf(v_booking_id);
  END LOOP;
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
    sb.time_slots,
    '[]'::jsonb
  ) AS time_slots
FROM public.studio_bookings sb;