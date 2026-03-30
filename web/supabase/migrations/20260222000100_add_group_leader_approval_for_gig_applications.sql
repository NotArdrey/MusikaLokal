-- Add leader approval workflow for group gig applications

ALTER TABLE public.gig_applications
ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS leader_approval_status TEXT
  CHECK (leader_approval_status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS leader_reviewed_at TIMESTAMP WITH TIME ZONE;

-- Backfill old rows to keep behavior unchanged for existing applications
UPDATE public.gig_applications
SET submitted_by_user_id = COALESCE(submitted_by_user_id, applicant_id)
WHERE submitted_by_user_id IS NULL;

UPDATE public.gig_applications
SET leader_approval_status = COALESCE(leader_approval_status, 'approved')
WHERE group_id IS NOT NULL AND leader_approval_status IS NULL;

-- Helpful index for leader queue lookups
CREATE INDEX IF NOT EXISTS idx_gig_applications_group_leader_approval
ON public.gig_applications(group_id, leader_approval_status, created_at DESC);
