-- Keep staff assignment reads available to assigned staff while avoiding
-- unnecessary SECURITY DEFINER RPC exposure for simple own-row checks.

GRANT SELECT ON TABLE public.staff_listing_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_listing_access TO service_role;
REVOKE ALL ON TABLE public.staff_listing_access FROM anon;

ALTER FUNCTION public.staff_access_level_for_studio(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_access_level_for_gig(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_access_level_for_production(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_read_studio(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_edit_studio(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_manage_studio_bookings(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_read_gig(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_edit_gig(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_manage_gig_applications(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_read_production(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_edit_production(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.staff_can_manage_production_applications(uuid, uuid) SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION public.staff_access_level_for_studio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_access_level_for_gig(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_access_level_for_production(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_studio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_studio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_studio_bookings(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_gig(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_gig(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_gig_applications(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_production(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_production(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_production_applications(uuid, uuid) TO authenticated, service_role;
