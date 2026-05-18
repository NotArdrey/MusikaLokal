-- Read-path indexes for the mobile bookings and feed screens.
-- These support existing fetches only; no CRUD logic, policies, or query bodies change.

CREATE INDEX IF NOT EXISTS idx_profiles_role_created_desc
ON public.profiles (role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_media_post_display_order
ON public.post_media (post_id, display_order);

CREATE INDEX IF NOT EXISTS idx_gig_applications_group_direct_created_desc
ON public.gig_applications (group_id, created_at DESC)
WHERE group_id IS NOT NULL
  AND production_team_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_gig_applications_roster_created_desc
ON public.gig_applications (production_roster_id, created_at DESC)
WHERE production_roster_id IS NOT NULL;
