BEGIN;

-- ============================================================
-- Phase 3/4 support: compatibility projections + guardrails.
-- Keep legacy payload shapes available while reads cut over gradually.
-- ============================================================

CREATE OR REPLACE VIEW profiles_legacy_projection AS
SELECT
  p.id,
  COALESCE(
    (SELECT ARRAY_AGG(ps.skill ORDER BY ps.skill) FROM profile_skills ps WHERE ps.profile_id = p.id),
    p.skills,
    ARRAY[]::TEXT[]
  ) AS skills,
  COALESCE(
    (SELECT ARRAY_AGG(pg.genre ORDER BY pg.genre) FROM profile_genres pg WHERE pg.profile_id = p.id),
    p.genres,
    ARRAY[]::TEXT[]
  ) AS genres,
  COALESCE(
    (SELECT ARRAY_AGG(ppu.portfolio_url ORDER BY ppu.sort_order, ppu.created_at)
     FROM profile_portfolio_urls ppu
     WHERE ppu.profile_id = p.id),
    p.portfolio_urls,
    ARRAY[]::TEXT[]
  ) AS portfolio_urls
FROM profiles p;

CREATE OR REPLACE VIEW gigs_legacy_projection AS
SELECT
  g.id,
  COALESCE(
    (SELECT jsonb_object_agg(gr.requirement_key, gr.requirement_value)
     FROM gig_requirements gr
     WHERE gr.gig_id = g.id),
    g.requirements,
    '{}'::jsonb
  ) AS requirements,
  COALESCE(
    (SELECT ARRAY_AGG(gm.media_url ORDER BY gm.sort_order, gm.created_at)
     FROM gig_media gm
     WHERE gm.gig_id = g.id AND gm.media_type = 'image'),
    g.images,
    ARRAY[]::TEXT[]
  ) AS images,
  COALESCE(
    (SELECT ARRAY_AGG(gm.media_url ORDER BY gm.sort_order, gm.created_at)
     FROM gig_media gm
     WHERE gm.gig_id = g.id AND gm.media_type = 'document'),
    g.documents,
    ARRAY[]::TEXT[]
  ) AS documents
FROM gigs g;

CREATE OR REPLACE VIEW studios_legacy_projection AS
SELECT
  s.id,
  COALESCE(
    (SELECT ARRAY_AGG(sa.amenity ORDER BY sa.amenity)
     FROM studio_amenities sa
     WHERE sa.studio_id = s.id),
    s.amenities,
    ARRAY[]::TEXT[]
  ) AS amenities,
  COALESCE(
    (SELECT ARRAY_AGG(sm.media_url ORDER BY sm.sort_order, sm.created_at)
     FROM studio_media sm
     WHERE sm.studio_id = s.id AND sm.media_type = 'image'),
    s.images,
    ARRAY[]::TEXT[]
  ) AS images,
  COALESCE(
    (SELECT ARRAY_AGG(st.studio_type ORDER BY st.studio_type)
     FROM studio_types st
     WHERE st.studio_id = s.id),
    ARRAY[]::TEXT[]
  ) AS types,
  COALESCE(
    (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'name', si.instrument_name,
      'image', si.image_url
    )) ORDER BY si.instrument_name)
     FROM studio_instruments si
     WHERE si.studio_id = s.id),
    '[]'::jsonb
  ) AS instruments
FROM studios s;

-- If conversations table exists, derive display fields from group relationship.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'conversations'
  ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW conversations_display_projection AS
      SELECT
        c.id,
        c.group_id,
        c.is_group,
        CASE
          WHEN c.group_id IS NOT NULL THEN COALESCE(g.name, c.group_name)
          ELSE c.group_name
        END AS group_name,
        CASE
          WHEN c.group_id IS NOT NULL THEN COALESCE((g.images)[1], c.group_avatar_url)
          ELSE c.group_avatar_url
        END AS group_avatar_url
      FROM conversations c
      LEFT JOIN groups g ON g.id = c.group_id
    $sql$;
  END IF;
END $$;

-- Guardrail helper: row-count parity by domain.
CREATE OR REPLACE FUNCTION migration_row_count_parity()
RETURNS TABLE(domain TEXT, legacy_count BIGINT, normalized_count BIGINT)
LANGUAGE sql
AS $$
  SELECT 'profiles.skills'::TEXT,
         COALESCE((SELECT SUM(COALESCE(array_length(skills, 1), 0)) FROM profiles), 0)::BIGINT,
         (SELECT COUNT(*) FROM profile_skills)::BIGINT
  UNION ALL
  SELECT 'profiles.genres',
         COALESCE((SELECT SUM(COALESCE(array_length(genres, 1), 0)) FROM profiles), 0)::BIGINT,
         (SELECT COUNT(*) FROM profile_genres)::BIGINT
  UNION ALL
  SELECT 'profiles.portfolio_urls',
         COALESCE((SELECT SUM(COALESCE(array_length(portfolio_urls, 1), 0)) FROM profiles), 0)::BIGINT,
         (SELECT COUNT(*) FROM profile_portfolio_urls)::BIGINT
  UNION ALL
  SELECT 'gigs.images',
         COALESCE((SELECT SUM(COALESCE(array_length(images, 1), 0)) FROM gigs), 0)::BIGINT,
         (SELECT COUNT(*) FROM gig_media WHERE media_type = 'image')::BIGINT
  UNION ALL
  SELECT 'gigs.documents',
         COALESCE((SELECT SUM(COALESCE(array_length(documents, 1), 0)) FROM gigs), 0)::BIGINT,
         (SELECT COUNT(*) FROM gig_media WHERE media_type = 'document')::BIGINT
  UNION ALL
  SELECT 'studios.amenities',
         COALESCE((SELECT SUM(COALESCE(array_length(amenities, 1), 0)) FROM studios), 0)::BIGINT,
         (SELECT COUNT(*) FROM studio_amenities)::BIGINT
  UNION ALL
  SELECT 'studios.images',
         COALESCE((SELECT SUM(COALESCE(array_length(images, 1), 0)) FROM studios), 0)::BIGINT,
         (SELECT COUNT(*) FROM studio_media WHERE media_type = 'image')::BIGINT
$$;

-- Guardrail helper: check duplicates in normalized child tables.
CREATE OR REPLACE FUNCTION migration_duplicate_check()
RETURNS TABLE(domain TEXT, duplicate_groups BIGINT)
LANGUAGE sql
AS $$
  SELECT 'profile_skills'::TEXT, COUNT(*)::BIGINT
  FROM (
    SELECT profile_id, skill FROM profile_skills GROUP BY profile_id, skill HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'profile_genres', COUNT(*)::BIGINT
  FROM (
    SELECT profile_id, genre FROM profile_genres GROUP BY profile_id, genre HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'profile_portfolio_urls', COUNT(*)::BIGINT
  FROM (
    SELECT profile_id, portfolio_url FROM profile_portfolio_urls GROUP BY profile_id, portfolio_url HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'gig_media', COUNT(*)::BIGINT
  FROM (
    SELECT gig_id, media_type, media_url FROM gig_media GROUP BY gig_id, media_type, media_url HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'studio_amenities', COUNT(*)::BIGINT
  FROM (
    SELECT studio_id, amenity FROM studio_amenities GROUP BY studio_id, amenity HAVING COUNT(*) > 1
  ) d
$$;

COMMIT;
