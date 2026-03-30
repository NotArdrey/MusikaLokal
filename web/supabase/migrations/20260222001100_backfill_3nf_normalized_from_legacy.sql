BEGIN;

-- ============================================================
-- Phase 2 (Backfill): Idempotent migration from legacy columns.
-- Safe to re-run. Uses ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO profile_skills (profile_id, skill)
SELECT p.id, TRIM(s)
FROM profiles p
CROSS JOIN LATERAL UNNEST(COALESCE(p.skills, ARRAY[]::TEXT[])) AS s
WHERE TRIM(s) <> ''
ON CONFLICT (profile_id, skill) DO NOTHING;

INSERT INTO profile_genres (profile_id, genre)
SELECT p.id, TRIM(g)
FROM profiles p
CROSS JOIN LATERAL UNNEST(COALESCE(p.genres, ARRAY[]::TEXT[])) AS g
WHERE TRIM(g) <> ''
ON CONFLICT (profile_id, genre) DO NOTHING;

INSERT INTO profile_portfolio_urls (profile_id, portfolio_url, sort_order)
SELECT p.id, TRIM(u), ord::INTEGER - 1
FROM profiles p
CROSS JOIN LATERAL UNNEST(COALESCE(p.portfolio_urls, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(u, ord)
WHERE TRIM(u) <> ''
ON CONFLICT (profile_id, portfolio_url) DO NOTHING;

INSERT INTO gig_media (gig_id, media_type, media_url, sort_order)
SELECT g.id, 'image', TRIM(i), ord::INTEGER - 1
FROM gigs g
CROSS JOIN LATERAL UNNEST(COALESCE(g.images, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(i, ord)
WHERE TRIM(i) <> ''
ON CONFLICT (gig_id, media_type, media_url) DO NOTHING;

INSERT INTO gig_media (gig_id, media_type, media_url, sort_order)
SELECT g.id, 'document', TRIM(d), ord::INTEGER - 1
FROM gigs g
CROSS JOIN LATERAL UNNEST(COALESCE(g.documents, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(d, ord)
WHERE TRIM(d) <> ''
ON CONFLICT (gig_id, media_type, media_url) DO NOTHING;

INSERT INTO gig_requirements (gig_id, requirement_key, requirement_value)
SELECT g.id, r.key, r.value
FROM gigs g
CROSS JOIN LATERAL jsonb_each(COALESCE(g.requirements, '{}'::jsonb)) AS r(key, value)
ON CONFLICT (gig_id, requirement_key) DO UPDATE
SET requirement_value = EXCLUDED.requirement_value;

INSERT INTO studio_amenities (studio_id, amenity)
SELECT s.id, TRIM(a)
FROM studios s
CROSS JOIN LATERAL UNNEST(COALESCE(s.amenities, ARRAY[]::TEXT[])) AS a
WHERE TRIM(a) <> ''
ON CONFLICT (studio_id, amenity) DO NOTHING;

INSERT INTO studio_media (studio_id, media_type, media_url, sort_order)
SELECT s.id, 'image', TRIM(i), ord::INTEGER - 1
FROM studios s
CROSS JOIN LATERAL UNNEST(COALESCE(s.images, ARRAY[]::TEXT[])) WITH ORDINALITY AS t(i, ord)
WHERE TRIM(i) <> ''
ON CONFLICT (studio_id, media_type, media_url) DO NOTHING;

-- Existing schema variations: either studios.type (TEXT) or studios.types (TEXT[])
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'types'
  ) THEN
    EXECUTE $sql$
      INSERT INTO studio_types (studio_id, studio_type)
      SELECT s.id, TRIM(t)
      FROM studios s
      CROSS JOIN LATERAL UNNEST(COALESCE(s.types, ARRAY[]::TEXT[])) AS t
      WHERE TRIM(t) <> ''
      ON CONFLICT (studio_id, studio_type) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'type'
  ) THEN
    EXECUTE $sql$
      INSERT INTO studio_types (studio_id, studio_type)
      SELECT s.id, TRIM(s.type)
      FROM studios s
      WHERE s.type IS NOT NULL AND TRIM(s.type) <> ''
      ON CONFLICT (studio_id, studio_type) DO NOTHING
    $sql$;
  END IF;
END $$;

-- Existing schema variations: studios.instruments may be JSONB [{name,image}] or TEXT[]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'instruments'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'studios'
        AND column_name = 'instruments'
        AND data_type = 'ARRAY'
    ) THEN
      EXECUTE $sql$
        INSERT INTO studio_instruments (studio_id, instrument_name)
        SELECT s.id, TRIM(i)
        FROM studios s
        CROSS JOIN LATERAL UNNEST(COALESCE(s.instruments, ARRAY[]::TEXT[])) AS i
        WHERE TRIM(i) <> ''
        ON CONFLICT (studio_id, instrument_name, image_url) DO NOTHING
      $sql$;
    ELSE
      EXECUTE $sql$
        INSERT INTO studio_instruments (studio_id, instrument_name, image_url)
        SELECT
          s.id,
          TRIM(COALESCE(inst->>'name', inst->>'instrument', '')),
          NULLIF(TRIM(COALESCE(inst->>'image', inst->>'image_url', '')), '')
        FROM studios s
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.instruments, '[]'::jsonb)) AS inst
        WHERE TRIM(COALESCE(inst->>'name', inst->>'instrument', '')) <> ''
        ON CONFLICT (studio_id, instrument_name, image_url) DO NOTHING
      $sql$;
    END IF;
  END IF;
END $$;

-- Existing schema variations: gigs.availability may be JSONB array with optional date/day fields.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gigs' AND column_name = 'availability'
  ) THEN
    EXECUTE $sql$
      INSERT INTO gig_availability_slots (gig_id, day_of_week, slot_date, start_time, end_time, is_available)
      SELECT
        g.id,
        CASE WHEN slot->>'day_of_week' ~ '^[0-6]$' THEN (slot->>'day_of_week')::SMALLINT ELSE NULL END,
        CASE WHEN slot ? 'date' THEN (slot->>'date')::DATE ELSE NULL END,
        (slot->>'start')::TIME,
        (slot->>'end')::TIME,
        COALESCE((slot->>'is_available')::BOOLEAN, TRUE)
      FROM gigs g
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(g.availability, '[]'::jsonb)) AS slot
      WHERE slot ? 'start' AND slot ? 'end'
    $sql$;
  END IF;
END $$;

-- Existing schema variations: studios.availability may be JSONB array and open_dates may be DATE[]
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'availability'
  ) THEN
    EXECUTE $sql$
      INSERT INTO studio_availability_slots (studio_id, day_of_week, slot_date, start_time, end_time, is_open)
      SELECT
        s.id,
        CASE WHEN slot->>'day_of_week' ~ '^[0-6]$' THEN (slot->>'day_of_week')::SMALLINT ELSE NULL END,
        CASE WHEN slot ? 'date' THEN (slot->>'date')::DATE ELSE NULL END,
        (slot->>'start')::TIME,
        (slot->>'end')::TIME,
        COALESCE((slot->>'is_open')::BOOLEAN, TRUE)
      FROM studios s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.availability, '[]'::jsonb)) AS slot
      WHERE slot ? 'start' AND slot ? 'end'
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'open_dates'
      AND data_type = 'ARRAY'
  ) THEN
    EXECUTE $sql$
      INSERT INTO studio_open_dates (studio_id, open_date, is_open)
      SELECT s.id, d::DATE, TRUE
      FROM studios s
      CROSS JOIN LATERAL UNNEST(COALESCE(s.open_dates, ARRAY[]::DATE[])) AS d
      ON CONFLICT (studio_id, open_date) DO NOTHING
    $sql$;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'studios' AND column_name = 'open_dates'
      AND udt_name = 'jsonb'
  ) THEN
    EXECUTE $sql$
      INSERT INTO studio_open_dates (studio_id, open_date, is_open)
      SELECT
        s.id,
        CASE
          WHEN jsonb_typeof(d.item) = 'string' THEN (trim(both '"' from d.item::text))::date
          ELSE (d.item->>'date')::date
        END AS open_date,
        COALESCE(
          CASE WHEN jsonb_typeof(d.item) = 'object' THEN (d.item->>'is_open')::boolean ELSE NULL END,
          TRUE
        ) AS is_open
      FROM studios s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.open_dates, '[]'::jsonb)) AS d(item)
      WHERE (
        (jsonb_typeof(d.item) = 'string' AND trim(both '"' from d.item::text) ~ '^\d{4}-\d{2}-\d{2}$')
        OR
        (jsonb_typeof(d.item) = 'object' AND d.item ? 'date' AND (d.item->>'date') ~ '^\d{4}-\d{2}-\d{2}$')
      )
      ON CONFLICT (studio_id, open_date) DO NOTHING
    $sql$;
  END IF;
END $$;

COMMIT;
