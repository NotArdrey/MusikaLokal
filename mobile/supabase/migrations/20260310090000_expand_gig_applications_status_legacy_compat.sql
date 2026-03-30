-- Expand gig_applications status domain for legacy row compatibility.
-- This keeps the attribute domain in the base relation (3NF-safe),
-- while allowing historical statuses still referenced by app logic.

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
    'fired',
    'completed'
  )
);
