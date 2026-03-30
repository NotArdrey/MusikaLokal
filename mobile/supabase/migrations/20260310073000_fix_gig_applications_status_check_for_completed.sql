-- Ensure gig_applications status domain supports contract lifecycle states used by the app.
-- 3NF note: this only updates the attribute domain constraint on the base relation.

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
    'cancelled',
    'completed'
  )
);
