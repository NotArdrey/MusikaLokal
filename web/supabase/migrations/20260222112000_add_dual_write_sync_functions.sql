BEGIN;

-- Phase 3 (Dual-write): Sync legacy denormalized fields to normalized 3NF child tables.
-- These functions are intended to be called by edge functions immediately after writes.

CREATE OR REPLACE FUNCTION public.sync_profile_3nf(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NOT NULL AND v_uid <> p_profile_id THEN
    RAISE EXCEPTION 'Not authorized to sync this profile';
  END IF;

  DELETE FROM public.profile_skills WHERE profile_id = p_profile_id;
  DELETE FROM public.profile_genres WHERE profile_id = p_profile_id;
  DELETE FROM public.profile_portfolio_urls WHERE profile_id = p_profile_id;

  INSERT INTO public.profile_skills (profile_id, skill)
  SELECT p.id, trim(x.skill)
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(COALESCE(p.skills, ARRAY[]::text[])) AS x(skill)
  WHERE p.id = p_profile_id
    AND NULLIF(btrim(x.skill), '') IS NOT NULL
  ON CONFLICT (profile_id, skill) DO NOTHING;

  INSERT INTO public.profile_genres (profile_id, genre)
  SELECT p.id, trim(x.genre)
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(COALESCE(p.genres, ARRAY[]::text[])) AS x(genre)
  WHERE p.id = p_profile_id
    AND NULLIF(btrim(x.genre), '') IS NOT NULL
  ON CONFLICT (profile_id, genre) DO NOTHING;

  INSERT INTO public.profile_portfolio_urls (profile_id, portfolio_url, sort_order)
  SELECT p.id, trim(x.url), x.position::int - 1
  FROM public.profiles p
  CROSS JOIN LATERAL unnest(COALESCE(p.portfolio_urls, ARRAY[]::text[])) WITH ORDINALITY AS x(url, position)
  WHERE p.id = p_profile_id
    AND NULLIF(btrim(x.url), '') IS NOT NULL
  ON CONFLICT (profile_id, portfolio_url) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_gig_3nf(p_gig_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
BEGIN
  v_uid := auth.uid();

  SELECT organizer_id INTO v_owner
  FROM public.gigs
  WHERE id = p_gig_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Gig not found';
  END IF;

  IF v_uid IS NOT NULL AND v_uid <> v_owner THEN
    RAISE EXCEPTION 'Not authorized to sync this gig';
  END IF;

  DELETE FROM public.gig_requirements WHERE gig_id = p_gig_id;
  DELETE FROM public.gig_media WHERE gig_id = p_gig_id;
  DELETE FROM public.gig_availability_slots WHERE gig_id = p_gig_id;

  INSERT INTO public.gig_requirements (gig_id, requirement_key, requirement_value)
  SELECT g.id, kv.key, kv.value
  FROM public.gigs g
  CROSS JOIN LATERAL jsonb_each(COALESCE(g.requirements, '{}'::jsonb)) AS kv(key, value)
  WHERE g.id = p_gig_id
  ON CONFLICT (gig_id, requirement_key) DO UPDATE
  SET requirement_value = EXCLUDED.requirement_value;

  INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
  SELECT g.id, 'image', trim(x.url), x.position::int - 1
  FROM public.gigs g
  CROSS JOIN LATERAL unnest(COALESCE(g.images, ARRAY[]::text[])) WITH ORDINALITY AS x(url, position)
  WHERE g.id = p_gig_id
    AND NULLIF(btrim(x.url), '') IS NOT NULL
  ON CONFLICT (gig_id, media_type, media_url) DO NOTHING;

  INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
  SELECT g.id, 'document', trim(x.url), x.position::int - 1
  FROM public.gigs g
  CROSS JOIN LATERAL unnest(COALESCE(g.documents, ARRAY[]::text[])) WITH ORDINALITY AS x(url, position)
  WHERE g.id = p_gig_id
    AND NULLIF(btrim(x.url), '') IS NOT NULL
  ON CONFLICT (gig_id, media_type, media_url) DO NOTHING;

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
    END AS day_of_week,
    CASE
      WHEN COALESCE(slot.item->>'date', slot.item->>'slot_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (COALESCE(slot.item->>'date', slot.item->>'slot_date'))::date
      ELSE NULL
    END AS slot_date,
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
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_studio_3nf(p_studio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner uuid;
BEGIN
  v_uid := auth.uid();

  SELECT owner_id INTO v_owner
  FROM public.studios
  WHERE id = p_studio_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;

  IF v_uid IS NOT NULL AND v_uid <> v_owner THEN
    RAISE EXCEPTION 'Not authorized to sync this studio';
  END IF;

  DELETE FROM public.studio_amenities WHERE studio_id = p_studio_id;
  DELETE FROM public.studio_types WHERE studio_id = p_studio_id;
  DELETE FROM public.studio_media WHERE studio_id = p_studio_id;
  DELETE FROM public.studio_instruments WHERE studio_id = p_studio_id;
  DELETE FROM public.studio_availability_slots WHERE studio_id = p_studio_id;
  DELETE FROM public.studio_open_dates WHERE studio_id = p_studio_id;

  INSERT INTO public.studio_amenities (studio_id, amenity)
  SELECT s.id, trim(x.amenity)
  FROM public.studios s
  CROSS JOIN LATERAL unnest(COALESCE(s.amenities, ARRAY[]::text[])) AS x(amenity)
  WHERE s.id = p_studio_id
    AND NULLIF(btrim(x.amenity), '') IS NOT NULL
  ON CONFLICT (studio_id, amenity) DO NOTHING;

  INSERT INTO public.studio_types (studio_id, studio_type)
  SELECT s.id, trim(x.studio_type)
  FROM public.studios s
  CROSS JOIN LATERAL unnest(COALESCE(s.types, ARRAY[]::text[])) AS x(studio_type)
  WHERE s.id = p_studio_id
    AND NULLIF(btrim(x.studio_type), '') IS NOT NULL
  ON CONFLICT (studio_id, studio_type) DO NOTHING;

  INSERT INTO public.studio_media (studio_id, media_type, media_url, sort_order)
  SELECT s.id, 'image', trim(x.url), x.position::int - 1
  FROM public.studios s
  CROSS JOIN LATERAL unnest(COALESCE(s.images, ARRAY[]::text[])) WITH ORDINALITY AS x(url, position)
  WHERE s.id = p_studio_id
    AND NULLIF(btrim(x.url), '') IS NOT NULL
  ON CONFLICT (studio_id, media_type, media_url) DO NOTHING;

  INSERT INTO public.studio_instruments (studio_id, instrument_name, image_url)
  SELECT
    s.id,
    COALESCE(NULLIF(btrim(i.item->>'name'), ''), NULLIF(btrim(i.item->>'instrument'), ''), 'Unknown'),
    NULLIF(btrim(COALESCE(i.item->>'image', i.item->>'image_url')), '')
  FROM public.studios s
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.instruments) = 'array' THEN s.instruments ELSE '[]'::jsonb END
  ) AS i(item)
  WHERE s.id = p_studio_id
  ON CONFLICT (studio_id, instrument_name, image_url) DO NOTHING;

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
    END AS day_of_week,
    CASE
      WHEN COALESCE(slot.item->>'date', slot.item->>'slot_date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (COALESCE(slot.item->>'date', slot.item->>'slot_date'))::date
      ELSE NULL
    END AS slot_date,
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

  INSERT INTO public.studio_open_dates (studio_id, open_date, is_open)
  SELECT
    s.id,
    CASE
      WHEN jsonb_typeof(d.item) = 'string' AND trim(both '"' from d.item::text) ~ '^\d{4}-\d{2}-\d{2}$' THEN (trim(both '"' from d.item::text))::date
      WHEN jsonb_typeof(d.item) = 'object' AND (d.item->>'date') ~ '^\d{4}-\d{2}-\d{2}$' THEN (d.item->>'date')::date
      ELSE NULL
    END AS open_date,
    COALESCE(
      CASE WHEN jsonb_typeof(d.item) = 'object' THEN (d.item->>'is_open')::boolean ELSE NULL END,
      true
    ) AS is_open
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

GRANT EXECUTE ON FUNCTION public.sync_profile_3nf(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_gig_3nf(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_studio_3nf(uuid) TO authenticated;

COMMIT;
