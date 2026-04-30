-- Catch up gig_applications update tracking used by eligibility/cancellation checks.

ALTER TABLE public.gig_applications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.gig_applications
SET updated_at = COALESCE(rejected_at, leader_reviewed_at, created_at, timezone('utc'::text, now()))
WHERE updated_at IS NULL;

ALTER TABLE public.gig_applications
  ALTER COLUMN updated_at SET DEFAULT timezone('utc'::text, now()),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_gig_applications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gig_applications_updated_at ON public.gig_applications;
CREATE TRIGGER trg_gig_applications_updated_at
  BEFORE UPDATE ON public.gig_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_gig_applications_updated_at();

CREATE INDEX IF NOT EXISTS idx_gig_applications_cancelled_recent
  ON public.gig_applications (applicant_id, gig_id, updated_at DESC)
  WHERE status = 'cancelled';
