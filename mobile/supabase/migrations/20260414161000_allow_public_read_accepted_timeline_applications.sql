-- Allow any authenticated user to read accepted gig applications that are
-- explicitly flagged for public profile display (show_on_profile = true).
-- This powers the Artist and Group Gig Timeline tabs visible to all viewers.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'gig_applications'
      AND policyname = 'Accepted profile timeline applications are publicly visible'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Accepted profile timeline applications are publicly visible"
        ON public.gig_applications
        AS PERMISSIVE
        FOR SELECT
        TO authenticated
        USING (
          status          = 'accepted'
          AND show_on_profile = true
        );
    $policy$;
  END IF;
END $$;
