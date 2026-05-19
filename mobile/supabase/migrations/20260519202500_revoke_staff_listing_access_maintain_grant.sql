-- PostgreSQL 15+ can include MAINTAIN in broad default table grants.
-- Staff users do not need maintenance privileges on assignment rows.

REVOKE MAINTAIN ON TABLE public.staff_listing_access FROM authenticated;
GRANT SELECT ON TABLE public.staff_listing_access TO authenticated;
