BEGIN;

-- Musician-initiated resignations are tracked separately from cancellations
-- so reliability/completion metrics can ignore voluntary resignations while
-- still preserving the contract history and venue notification trail.

ALTER TABLE public.gig_applications
DROP CONSTRAINT IF EXISTS gig_applications_status_check;

ALTER TABLE public.gig_applications
ADD CONSTRAINT gig_applications_status_check
CHECK (
  status IN (
    'pending',
    'approved',
    'accepted',
    'rejected',
    'declined',
    'cancelled',
    'resigned',
    'fired',
    'completed'
  )
);

COMMIT;
