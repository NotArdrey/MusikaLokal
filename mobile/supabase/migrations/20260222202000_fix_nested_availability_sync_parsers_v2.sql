-- Fix nested availability parser using availability-only sync functions
-- compatible with contracted gigs/studios schemas.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_gig_availability_3nf(p_gig_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.gigs g WHERE g.id = p_gig_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gig not found';
  END IF;

  DELETE FROM public.gig_availability_slots WHERE gig_id = p_gig_id;

  INSERT INTO public.gig_availability_slots (gig_id, day_of_week, slot_date, start_time, end_time, is_available)
  SELECT
    g.id,
    CASE
      WHEN COALESCE(slot.item->>'day_of_week', slot.item->>'day') ~ '^[0-6]$' THEN (COALESCE(slot.item->>'day_of_week', slot.item->>'day'))::smallint
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'sunday' THEN 0
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'monday' THEN 1
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'tuesday' THEN 2
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'wednesday' THEN 3
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'thursday' THEN 4
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'friday' THEN 5
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'saturday' THEN 6
      ELSE NULL
    END,
    CASE WHEN COALESCE(slot.item->>'date', slot.item->>'slot_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (COALESCE(slot.item->>'date', slot.item->>'slot_date'))::date ELSE NULL END,
    (COALESCE(slot.item->>'start', slot.item->>'starts_at', slot.item->>'start_time'))::time,
    (COALESCE(slot.item->>'end', slot.item->>'ends_at', slot.item->>'end_time'))::time,
    COALESCE((slot.item->>'is_available')::boolean, true)
  FROM public.gigs g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.availability) = 'array' THEN g.availability ELSE '[]'::jsonb END
  ) AS slot(item)
  WHERE g.id = p_gig_id
    AND COALESCE(slot.item->>'start', slot.item->>'starts_at', slot.item->>'start_time') IS NOT NULL
    AND COALESCE(slot.item->>'end', slot.item->>'ends_at', slot.item->>'end_time') IS NOT NULL;

  INSERT INTO public.gig_availability_slots (gig_id, day_of_week, slot_date, start_time, end_time, is_available)
  SELECT
    g.id,
    CASE
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'sunday' THEN 0
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'monday' THEN 1
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'tuesday' THEN 2
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'wednesday' THEN 3
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'thursday' THEN 4
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'friday' THEN 5
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'saturday' THEN 6
      ELSE NULL
    END,
    NULL,
    (slot.item->>'start')::time,
    (slot.item->>'end')::time,
    true
  FROM public.gigs g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.availability) = 'array' THEN g.availability ELSE '[]'::jsonb END
  ) AS day_obj(item)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(day_obj.item->'slots') = 'array' THEN day_obj.item->'slots' ELSE '[]'::jsonb END
  ) AS slot(item)
  WHERE g.id = p_gig_id
    AND slot.item ? 'start'
    AND slot.item ? 'end';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_studio_availability_3nf(p_studio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.studios s WHERE s.id = p_studio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  DELETE FROM public.studio_availability_slots WHERE studio_id = p_studio_id;
  DELETE FROM public.studio_open_dates WHERE studio_id = p_studio_id;

  INSERT INTO public.studio_availability_slots (studio_id, day_of_week, slot_date, start_time, end_time, is_open)
  SELECT
    s.id,
    CASE
      WHEN COALESCE(slot.item->>'day_of_week', slot.item->>'day') ~ '^[0-6]$' THEN (COALESCE(slot.item->>'day_of_week', slot.item->>'day'))::smallint
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'sunday' THEN 0
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'monday' THEN 1
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'tuesday' THEN 2
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'wednesday' THEN 3
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'thursday' THEN 4
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'friday' THEN 5
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'saturday' THEN 6
      ELSE NULL
    END,
    CASE WHEN COALESCE(slot.item->>'date', slot.item->>'slot_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (COALESCE(slot.item->>'date', slot.item->>'slot_date'))::date ELSE NULL END,
    (COALESCE(slot.item->>'start', slot.item->>'starts_at', slot.item->>'start_time'))::time,
    (COALESCE(slot.item->>'end', slot.item->>'ends_at', slot.item->>'end_time'))::time,
    COALESCE((slot.item->>'is_open')::boolean, true)
  FROM public.studios s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.availability) = 'array' THEN s.availability ELSE '[]'::jsonb END
  ) AS slot(item)
  WHERE s.id = p_studio_id
    AND COALESCE(slot.item->>'start', slot.item->>'starts_at', slot.item->>'start_time') IS NOT NULL
    AND COALESCE(slot.item->>'end', slot.item->>'ends_at', slot.item->>'end_time') IS NOT NULL;

  INSERT INTO public.studio_availability_slots (studio_id, day_of_week, slot_date, start_time, end_time, is_open)
  SELECT
    s.id,
    CASE
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'sunday' THEN 0
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'monday' THEN 1
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'tuesday' THEN 2
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'wednesday' THEN 3
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'thursday' THEN 4
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'friday' THEN 5
      WHEN lower(COALESCE(day_obj.item->>'day', '')) = 'saturday' THEN 6
      ELSE NULL
    END,
    NULL,
    (slot.item->>'start')::time,
    (slot.item->>'end')::time,
    true
  FROM public.studios s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.availability) = 'array' THEN s.availability ELSE '[]'::jsonb END
  ) AS day_obj(item)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(day_obj.item->'slots') = 'array' THEN day_obj.item->'slots' ELSE '[]'::jsonb END
  ) AS slot(item)
  WHERE s.id = p_studio_id
    AND slot.item ? 'start'
    AND slot.item ? 'end';

  INSERT INTO public.studio_open_dates (studio_id, open_date, is_open)
  SELECT
    s.id,
    CASE
      WHEN jsonb_typeof(d.item) = 'string' AND trim(both '"' from d.item::text) ~ '^\d{4}-\d{2}-\d{2}$' THEN (trim(both '"' from d.item::text))::date
      WHEN jsonb_typeof(d.item) = 'object' AND (d.item->>'date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (d.item->>'date')::date
      ELSE NULL
    END,
    COALESCE(CASE WHEN jsonb_typeof(d.item) = 'object' THEN (d.item->>'is_open')::boolean ELSE NULL END, true)
  FROM public.studios s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.open_dates) = 'array' THEN s.open_dates ELSE '[]'::jsonb END
  ) AS d(item)
  WHERE s.id = p_studio_id
    AND (
      (jsonb_typeof(d.item) = 'string' AND trim(both '"' from d.item::text) ~ '^\d{4}-\d{2}-\d{2}$')
      OR
      (jsonb_typeof(d.item) = 'object' AND d.item ? 'date' AND (d.item->>'date') ~ '^\d{4}-\d{2}-\d{2}$')
    )
  ON CONFLICT (studio_id, open_date) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_gig_availability_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_gig_availability_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;
  PERFORM public.sync_gig_availability_3nf(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_studio_availability_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_studio_availability_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;
  PERFORM public.sync_studio_availability_3nf(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gigs_sync_availability_3nf_from_legacy ON public.gigs;
CREATE TRIGGER trg_gigs_sync_availability_3nf_from_legacy
AFTER INSERT OR UPDATE OF availability
ON public.gigs
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_gig_availability_3nf_from_legacy();

DROP TRIGGER IF EXISTS trg_studios_sync_availability_3nf_from_legacy ON public.studios;
CREATE TRIGGER trg_studios_sync_availability_3nf_from_legacy
AFTER INSERT OR UPDATE OF availability, open_dates
ON public.studios
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_studio_availability_3nf_from_legacy();

DO $$
DECLARE
  v_gig_id uuid;
  v_group_id uuid;
  v_studio_id uuid;
BEGIN
  FOR v_gig_id IN SELECT id FROM public.gigs LOOP
    PERFORM public.sync_gig_availability_3nf(v_gig_id);
  END LOOP;

  FOR v_group_id IN SELECT id FROM public.groups LOOP
    PERFORM public.sync_group_availability_3nf(v_group_id);
  END LOOP;

  FOR v_studio_id IN SELECT id FROM public.studios LOOP
    PERFORM public.sync_studio_availability_3nf(v_studio_id);
  END LOOP;
END;
$$;

COMMIT;
