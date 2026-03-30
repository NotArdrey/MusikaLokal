-- Phase 2 (Backfill): idempotent migration into normalized tables.
-- Compatible with: 20260222001000/20260222001100/20260222001200

BEGIN;

-- Profiles
INSERT INTO public.profile_skills (profile_id, skill)
SELECT p.id, trim(v.skill)
FROM public.profiles p
CROSS JOIN LATERAL unnest(COALESCE(p.skills, ARRAY[]::text[])) AS v(skill)
WHERE NULLIF(btrim(v.skill), '') IS NOT NULL
ON CONFLICT (profile_id, skill) DO NOTHING;

INSERT INTO public.profile_genres (profile_id, genre)
SELECT p.id, trim(v.genre)
FROM public.profiles p
CROSS JOIN LATERAL unnest(COALESCE(p.genres, ARRAY[]::text[])) AS v(genre)
WHERE NULLIF(btrim(v.genre), '') IS NOT NULL
ON CONFLICT (profile_id, genre) DO NOTHING;

INSERT INTO public.profile_portfolio_urls (profile_id, portfolio_url, sort_order)
SELECT p.id, trim(v.url), v.position::int - 1
FROM public.profiles p
CROSS JOIN LATERAL unnest(COALESCE(p.portfolio_urls, ARRAY[]::text[])) WITH ORDINALITY AS v(url, position)
WHERE NULLIF(btrim(v.url), '') IS NOT NULL
ON CONFLICT (profile_id, portfolio_url) DO NOTHING;

-- Gigs
INSERT INTO public.gig_requirements (gig_id, requirement_key, requirement_value)
SELECT g.id, e.key, e.value
FROM public.gigs g
CROSS JOIN LATERAL jsonb_each(COALESCE(g.requirements, '{}'::jsonb)) AS e(key, value)
ON CONFLICT (gig_id, requirement_key) DO UPDATE
SET requirement_value = EXCLUDED.requirement_value;

INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
SELECT g.id, 'image', trim(v.url), v.position::int - 1
FROM public.gigs g
CROSS JOIN LATERAL unnest(COALESCE(g.images, ARRAY[]::text[])) WITH ORDINALITY AS v(url, position)
WHERE NULLIF(btrim(v.url), '') IS NOT NULL
ON CONFLICT (gig_id, media_type, media_url) DO NOTHING;

INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
SELECT g.id, 'document', trim(v.url), v.position::int - 1
FROM public.gigs g
CROSS JOIN LATERAL unnest(COALESCE(g.documents, ARRAY[]::text[])) WITH ORDINALITY AS v(url, position)
WHERE NULLIF(btrim(v.url), '') IS NOT NULL
ON CONFLICT (gig_id, media_type, media_url) DO NOTHING;

INSERT INTO public.gig_availability_slots (gig_id, day_of_week, slot_date, start_time, end_time, is_available)
SELECT
  g.id,
  CASE WHEN slot.item->>'day_of_week' ~ '^[0-6]$' THEN (slot.item->>'day_of_week')::smallint ELSE NULL END,
  CASE WHEN slot.item ? 'date' THEN (slot.item->>'date')::date ELSE NULL END,
  (slot.item->>'start')::time,
  (slot.item->>'end')::time,
  COALESCE((slot.item->>'is_available')::boolean, true)
FROM public.gigs g
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(g.availability) = 'array' THEN g.availability ELSE '[]'::jsonb END
) AS slot(item)
WHERE slot.item ? 'start' AND slot.item ? 'end';

-- Studios
INSERT INTO public.studio_amenities (studio_id, amenity)
SELECT s.id, trim(v.amenity)
FROM public.studios s
CROSS JOIN LATERAL unnest(COALESCE(s.amenities, ARRAY[]::text[])) AS v(amenity)
WHERE NULLIF(btrim(v.amenity), '') IS NOT NULL
ON CONFLICT (studio_id, amenity) DO NOTHING;

INSERT INTO public.studio_types (studio_id, studio_type)
SELECT s.id, trim(v.studio_type)
FROM public.studios s
CROSS JOIN LATERAL unnest(COALESCE(s.types, ARRAY[]::text[])) AS v(studio_type)
WHERE NULLIF(btrim(v.studio_type), '') IS NOT NULL
ON CONFLICT (studio_id, studio_type) DO NOTHING;

INSERT INTO public.studio_media (studio_id, media_type, media_url, sort_order)
SELECT s.id, 'image', trim(v.url), v.position::int - 1
FROM public.studios s
CROSS JOIN LATERAL unnest(COALESCE(s.images, ARRAY[]::text[])) WITH ORDINALITY AS v(url, position)
WHERE NULLIF(btrim(v.url), '') IS NOT NULL
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
ON CONFLICT (studio_id, instrument_name, image_url) DO NOTHING;

INSERT INTO public.studio_availability_slots (studio_id, day_of_week, slot_date, start_time, end_time, is_open)
SELECT
  s.id,
  CASE WHEN slot.item->>'day_of_week' ~ '^[0-6]$' THEN (slot.item->>'day_of_week')::smallint ELSE NULL END,
  CASE WHEN slot.item ? 'date' THEN (slot.item->>'date')::date ELSE NULL END,
  (slot.item->>'start')::time,
  (slot.item->>'end')::time,
  COALESCE((slot.item->>'is_open')::boolean, true)
FROM public.studios s
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(s.availability) = 'array' THEN s.availability ELSE '[]'::jsonb END
) AS slot(item)
WHERE slot.item ? 'start' AND slot.item ? 'end';

INSERT INTO public.studio_open_dates (studio_id, open_date, is_open)
SELECT s.id, d::date, true
FROM public.studios s
CROSS JOIN LATERAL unnest(COALESCE(s.open_dates, ARRAY[]::date[])) AS d
ON CONFLICT (studio_id, open_date) DO NOTHING;

COMMIT;

-- Guardrails
SELECT * FROM public.migration_row_count_parity();
SELECT * FROM public.migration_duplicate_check();
