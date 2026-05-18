-- Read-only visibility for performers selected by production applications.
-- This only expands SELECT access; mutation policies remain unchanged.

CREATE OR REPLACE FUNCTION public.can_view_gig_application_readonly_participant(
  p_application_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target_application AS (
    SELECT
      ga.id,
      ga.group_id,
      ga.production_team_id,
      ptr.profile_id AS roster_profile_id,
      ptr.group_id AS roster_group_id
    FROM public.gig_applications ga
    LEFT JOIN public.production_team_roster ptr
      ON ptr.id = ga.production_roster_id
    WHERE ga.id = p_application_id
  ),
  visible_groups AS (
    SELECT COALESCE(roster_group_id, group_id) AS group_id
    FROM target_application
    WHERE COALESCE(roster_group_id, group_id) IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM target_application ta
    WHERE ta.production_team_id IS NOT NULL
      AND ta.roster_profile_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM visible_groups vg
    JOIN public.groups g
      ON g.id = vg.group_id
    WHERE g.owner_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM visible_groups vg
    JOIN public.group_members gm
      ON gm.group_id = vg.group_id
    WHERE gm.user_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_gig_application_readonly_participant(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_view_gig_application_readonly_participant(uuid) TO authenticated;

DROP POLICY IF EXISTS "Selected performers and group members can view applications"
ON public.gig_applications;

CREATE POLICY "Selected performers and group members can view applications"
ON public.gig_applications
FOR SELECT
TO authenticated
USING ((SELECT public.can_view_gig_application_readonly_participant(id)));

COMMENT ON FUNCTION public.can_view_gig_application_readonly_participant(uuid) IS
'Allows selected production performers and group/duo members to view a gig application without granting update/action access.';
