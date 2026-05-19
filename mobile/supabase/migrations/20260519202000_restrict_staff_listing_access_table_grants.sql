-- Defense in depth: staff users should read only their own active assignment.
-- Admin writes are routed through Edge Functions/service role and RLS admin policy.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.staff_listing_access
  FROM authenticated;

GRANT SELECT ON TABLE public.staff_listing_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_listing_access TO service_role;
REVOKE ALL ON TABLE public.staff_listing_access FROM anon;
