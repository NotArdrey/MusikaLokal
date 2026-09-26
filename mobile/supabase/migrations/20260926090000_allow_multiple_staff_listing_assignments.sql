-- Staff members may have access to multiple listings, including listings of
-- different entity types. Keep only one active grant per staff/target pair.

DROP INDEX IF EXISTS public.staff_listing_access_one_active_user_idx;

CREATE UNIQUE INDEX IF NOT EXISTS staff_listing_access_one_active_studio_idx
  ON public.staff_listing_access(staff_user_id, studio_id)
  WHERE revoked_at IS NULL AND studio_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_listing_access_one_active_gig_idx
  ON public.staff_listing_access(staff_user_id, gig_id)
  WHERE revoked_at IS NULL AND gig_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS staff_listing_access_one_active_production_idx
  ON public.staff_listing_access(staff_user_id, production_team_id)
  WHERE revoked_at IS NULL AND production_team_id IS NOT NULL;
