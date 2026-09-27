-- Remove duplicate bookmarks before enforcing one favorite per user and target.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id, group_id ORDER BY created_at, id) AS duplicate_rank
  FROM public.favorites
  WHERE group_id IS NOT NULL
)
DELETE FROM public.favorites AS favorites
USING ranked
WHERE favorites.id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id, profile_id ORDER BY created_at, id) AS duplicate_rank
  FROM public.favorites
  WHERE profile_id IS NOT NULL
)
DELETE FROM public.favorites AS favorites
USING ranked
WHERE favorites.id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id, studio_id ORDER BY created_at, id) AS duplicate_rank
  FROM public.favorites
  WHERE studio_id IS NOT NULL
)
DELETE FROM public.favorites AS favorites
USING ranked
WHERE favorites.id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id, gig_id ORDER BY created_at, id) AS duplicate_rank
  FROM public.favorites
  WHERE gig_id IS NOT NULL
)
DELETE FROM public.favorites AS favorites
USING ranked
WHERE favorites.id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id, production_team_id ORDER BY created_at, id) AS duplicate_rank
  FROM public.favorites
  WHERE production_team_id IS NOT NULL
)
DELETE FROM public.favorites AS favorites
USING ranked
WHERE favorites.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_group
  ON public.favorites (user_id, group_id)
  WHERE group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_profile
  ON public.favorites (user_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_studio
  ON public.favorites (user_id, studio_id)
  WHERE studio_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_gig
  ON public.favorites (user_id, gig_id)
  WHERE gig_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_production_team
  ON public.favorites (user_id, production_team_id)
  WHERE production_team_id IS NOT NULL;
