-- Migration: Allow gig organizers (venue owners) to update applications for their gigs
-- Run this SQL in your Supabase SQL Editor to fix the confirm/decline issue

-- Drop if exists to avoid conflicts
DROP POLICY IF EXISTS "Gig organizers can update applications" ON gig_applications;

-- Create policy allowing venue owners to accept/reject applications for their gigs
CREATE POLICY "Gig organizers can update applications"
  ON gig_applications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM gigs 
      WHERE gigs.id = gig_applications.gig_id 
      AND gigs.organizer_id = auth.uid()
    )
  );

-- Verify the policy was created
SELECT * FROM pg_policies WHERE tablename = 'gig_applications';
