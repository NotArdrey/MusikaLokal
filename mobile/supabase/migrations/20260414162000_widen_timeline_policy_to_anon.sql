-- Widen the timeline visibility policy to cover unauthenticated (guest) viewers.
-- Previously scoped to `authenticated` only; changing to `public` includes the anon role.

DO $$
BEGIN
  -- Drop the old authenticated-only version if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'gig_applications'
      AND policyname = 'Accepted profile timeline applications are publicly visible'
  ) THEN
    EXECUTE $policy$ DROP POLICY "Accepted profile timeline applications are publicly visible" ON public.gig_applications; $policy$;
  END IF;

  EXECUTE $policy$
    CREATE POLICY "Accepted profile timeline applications are publicly visible"
      ON public.gig_applications
      AS PERMISSIVE
      FOR SELECT
      TO public
      USING (
        status          = 'accepted'
        AND show_on_profile = true
      );
  $policy$;
END $$;
