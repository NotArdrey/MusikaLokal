REVOKE ALL ON FUNCTION public.build_production_roster_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_gig_application_performer_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_repeated_gig_application_cancellations() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.build_production_roster_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_gig_application_performer_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_repeated_gig_application_cancellations() TO service_role;
