BEGIN;

-- Add computed completion_rate to profiles_with_stats and groups_with_stats.
--
-- Profile completion formula (8 equally weighted checks):
-- 1) full_name present
-- 2) avatar_url present
-- 3) bio has at least 20 characters
-- 4) contact_number present
-- 5) address OR location present
-- 6) at least one skill
-- 7) at least one genre
-- 8) at least one portfolio URL
--
-- Group completion formula (7 equally weighted checks):
-- 1) name present
-- 2) genre present
-- 3) description has at least 20 characters
-- 4) location present
-- 5) at least one group image
-- 6) at least one roster member
-- 7) at least one availability slot

CREATE OR REPLACE VIEW public.profiles_with_stats AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.role,
  p.bio,
  p.location,
  plp.skills,
  plp.genres,
  plp.portfolio_urls,
  p.is_verified,
  p.verification_status,
  p.didit_session_id,
  p.id_document_expiry,
  p.id_verified_at,
  p.created_at,
  COALESCE(AVG(r.rating), 0::numeric) AS rating,
  COUNT(r.id) AS review_count,
  ROUND(
    (
      (
        CASE WHEN NULLIF(BTRIM(p.full_name), '') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN NULLIF(BTRIM(p.avatar_url), '') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p.bio IS NOT NULL AND LENGTH(BTRIM(p.bio)) >= 20 THEN 1 ELSE 0 END +
        CASE WHEN NULLIF(BTRIM(p.contact_number), '') IS NOT NULL THEN 1 ELSE 0 END +
        CASE
          WHEN NULLIF(BTRIM(p.address), '') IS NOT NULL
            OR NULLIF(BTRIM(p.location), '') IS NOT NULL
          THEN 1
          ELSE 0
        END +
        CASE WHEN COALESCE(array_length(plp.skills, 1), 0) > 0 THEN 1 ELSE 0 END +
        CASE WHEN COALESCE(array_length(plp.genres, 1), 0) > 0 THEN 1 ELSE 0 END +
        CASE WHEN COALESCE(array_length(plp.portfolio_urls, 1), 0) > 0 THEN 1 ELSE 0 END
      )::numeric / 8::numeric
    ) * 100::numeric,
    0
  ) AS completion_rate
FROM public.profiles p
LEFT JOIN public.reviews r ON r.user_id = p.id
LEFT JOIN public.profiles_legacy_projection plp ON plp.id = p.id
GROUP BY
  p.id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.role,
  p.bio,
  p.location,
  plp.skills,
  plp.genres,
  plp.portfolio_urls,
  p.is_verified,
  p.verification_status,
  p.didit_session_id,
  p.id_document_expiry,
  p.id_verified_at,
  p.created_at,
  p.contact_number,
  p.address;

CREATE OR REPLACE VIEW public.groups_with_stats AS
SELECT
  g.id,
  g.owner_id,
  g.name,
  g.genre,
  g.description,
  glp.members,
  g.location,
  glp.images,
  g.latitude,
  g.longitude,
  g.rate,
  g.created_at,
  g.group_type,
  COALESCE(gap.availability, '[]'::jsonb) AS availability,
  COALESCE(AVG(r.rating), 0::numeric) AS rating,
  COUNT(r.id) AS review_count,
  ROUND(
    (
      (
        CASE WHEN NULLIF(BTRIM(g.name), '') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN NULLIF(BTRIM(g.genre), '') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN g.description IS NOT NULL AND LENGTH(BTRIM(g.description)) >= 20 THEN 1 ELSE 0 END +
        CASE WHEN NULLIF(BTRIM(g.location), '') IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN COALESCE(array_length(glp.images, 1), 0) > 0 THEN 1 ELSE 0 END +
        CASE
          WHEN jsonb_typeof(glp.members) = 'array'
            AND jsonb_array_length(glp.members) > 0
          THEN 1
          ELSE 0
        END +
        CASE
          WHEN jsonb_typeof(COALESCE(gap.availability, '[]'::jsonb)) = 'array'
            AND jsonb_array_length(COALESCE(gap.availability, '[]'::jsonb)) > 0
          THEN 1
          ELSE 0
        END
      )::numeric / 7::numeric
    ) * 100::numeric,
    0
  ) AS completion_rate
FROM public.groups g
LEFT JOIN public.reviews r ON r.group_id = g.id
LEFT JOIN public.groups_legacy_projection glp ON glp.id = g.id
LEFT JOIN public.groups_availability_projection gap ON gap.group_id = g.id
GROUP BY
  g.id,
  g.owner_id,
  g.name,
  g.genre,
  g.description,
  glp.members,
  g.location,
  glp.images,
  g.latitude,
  g.longitude,
  g.rate,
  g.created_at,
  g.group_type,
  gap.availability;

COMMIT;
