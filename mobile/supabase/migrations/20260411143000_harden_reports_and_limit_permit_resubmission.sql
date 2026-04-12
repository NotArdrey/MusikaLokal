BEGIN;

-- Keep permit review statuses consistent across environments.
ALTER TABLE public.studios
  ADD COLUMN IF NOT EXISTS permit_status text DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS permit_rejection_reason text,
  ADD COLUMN IF NOT EXISTS permit_admin_notes text,
  ADD COLUMN IF NOT EXISTS permit_reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS permit_reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS permit_resubmissions_used integer NOT NULL DEFAULT 0;

ALTER TABLE public.gigs
  ADD COLUMN IF NOT EXISTS permit_status text DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS permit_rejection_reason text,
  ADD COLUMN IF NOT EXISTS permit_admin_notes text,
  ADD COLUMN IF NOT EXISTS permit_reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS permit_reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS permit_resubmissions_used integer NOT NULL DEFAULT 0;

UPDATE public.studios
SET permit_status = lower(btrim(coalesce(permit_status, 'pending_review')))
WHERE permit_status IS DISTINCT FROM lower(btrim(coalesce(permit_status, 'pending_review')));

UPDATE public.gigs
SET permit_status = lower(btrim(coalesce(permit_status, 'pending_review')))
WHERE permit_status IS DISTINCT FROM lower(btrim(coalesce(permit_status, 'pending_review')));

UPDATE public.studios
SET permit_status = 'pending_review'
WHERE permit_status IS NULL
   OR permit_status = 'pending'
   OR permit_status NOT IN ('pending_review', 'approved', 'rejected', 'resubmitted');

UPDATE public.gigs
SET permit_status = 'pending_review'
WHERE permit_status IS NULL
   OR permit_status = 'pending'
   OR permit_status NOT IN ('pending_review', 'approved', 'rejected', 'resubmitted');

UPDATE public.studios
SET permit_resubmissions_used = CASE
  WHEN permit_status = 'resubmitted' THEN 1
  ELSE 0
END
WHERE permit_resubmissions_used IS NULL
   OR permit_resubmissions_used NOT BETWEEN 0 AND 1;

UPDATE public.gigs
SET permit_resubmissions_used = CASE
  WHEN permit_status = 'resubmitted' THEN 1
  ELSE 0
END
WHERE permit_resubmissions_used IS NULL
   OR permit_resubmissions_used NOT BETWEEN 0 AND 1;

ALTER TABLE public.studios
  ALTER COLUMN permit_status SET DEFAULT 'pending_review',
  ALTER COLUMN permit_resubmissions_used SET DEFAULT 0;

ALTER TABLE public.gigs
  ALTER COLUMN permit_status SET DEFAULT 'pending_review',
  ALTER COLUMN permit_resubmissions_used SET DEFAULT 0;

ALTER TABLE public.studios
  DROP CONSTRAINT IF EXISTS studios_permit_status_check;

ALTER TABLE public.studios
  ADD CONSTRAINT studios_permit_status_check
  CHECK (permit_status IN ('pending_review', 'approved', 'rejected', 'resubmitted'));

ALTER TABLE public.gigs
  DROP CONSTRAINT IF EXISTS gigs_permit_status_check;

ALTER TABLE public.gigs
  ADD CONSTRAINT gigs_permit_status_check
  CHECK (permit_status IN ('pending_review', 'approved', 'rejected', 'resubmitted'));

ALTER TABLE public.studios
  DROP CONSTRAINT IF EXISTS studios_permit_resubmissions_used_check;

ALTER TABLE public.studios
  ADD CONSTRAINT studios_permit_resubmissions_used_check
  CHECK (permit_resubmissions_used BETWEEN 0 AND 1);

ALTER TABLE public.gigs
  DROP CONSTRAINT IF EXISTS gigs_permit_resubmissions_used_check;

ALTER TABLE public.gigs
  ADD CONSTRAINT gigs_permit_resubmissions_used_check
  CHECK (permit_resubmissions_used BETWEEN 0 AND 1);

CREATE OR REPLACE FUNCTION public.enforce_single_permit_resubmission()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_old_used integer;
  v_new_used integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_status := lower(coalesce(NEW.permit_status, 'pending_review'));

    IF v_new_status = 'pending' THEN
      v_new_status := 'pending_review';
    END IF;

    IF v_new_status NOT IN ('pending_review', 'approved', 'rejected', 'resubmitted') THEN
      v_new_status := 'pending_review';
    END IF;

    v_new_used := least(greatest(coalesce(NEW.permit_resubmissions_used, 0), 0), 1);

    IF v_new_status = 'resubmitted' THEN
      v_new_used := 1;
    END IF;

    NEW.permit_status := v_new_status;
    NEW.permit_resubmissions_used := v_new_used;
    RETURN NEW;
  END IF;

  v_old_status := lower(coalesce(OLD.permit_status, 'pending_review'));
  v_new_status := lower(coalesce(NEW.permit_status, v_old_status));

  IF v_new_status = 'pending' THEN
    v_new_status := 'pending_review';
  END IF;

  IF v_new_status NOT IN ('pending_review', 'approved', 'rejected', 'resubmitted') THEN
    RAISE EXCEPTION 'Invalid permit status: %', NEW.permit_status
      USING ERRCODE = '23514';
  END IF;

  v_old_used := coalesce(OLD.permit_resubmissions_used, 0);
  v_new_used := coalesce(NEW.permit_resubmissions_used, v_old_used);

  IF v_new_used < v_old_used THEN
    RAISE EXCEPTION 'permit_resubmissions_used cannot be decreased.'
      USING ERRCODE = '23514';
  END IF;

  IF v_new_status = 'resubmitted' AND v_old_status <> 'rejected' THEN
    RAISE EXCEPTION 'Permit can only be resubmitted after a rejection.'
      USING ERRCODE = '23514';
  END IF;

  IF v_old_status = 'rejected' AND v_new_status = 'resubmitted' THEN
    IF v_old_used >= 1 THEN
      RAISE EXCEPTION 'Permit resubmission limit reached. Only one resubmission is allowed after decline.'
        USING ERRCODE = '23514';
    END IF;
    v_new_used := 1;
  END IF;

  IF v_new_used > 1 THEN
    RAISE EXCEPTION 'Permit resubmission limit reached. Only one resubmission is allowed after decline.'
      USING ERRCODE = '23514';
  END IF;

  NEW.permit_status := v_new_status;
  NEW.permit_resubmissions_used := v_new_used;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_permit_resubmission_on_studios ON public.studios;
CREATE TRIGGER trg_enforce_single_permit_resubmission_on_studios
  BEFORE INSERT OR UPDATE OF permit_status, permit_resubmissions_used
  ON public.studios
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_permit_resubmission();

DROP TRIGGER IF EXISTS trg_enforce_single_permit_resubmission_on_gigs ON public.gigs;
CREATE TRIGGER trg_enforce_single_permit_resubmission_on_gigs
  BEFORE INSERT OR UPDATE OF permit_status, permit_resubmissions_used
  ON public.gigs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_permit_resubmission();

COMMENT ON COLUMN public.studios.permit_resubmissions_used IS
  'Number of permit resubmissions used after rejection. Capped at 1.';

COMMENT ON COLUMN public.gigs.permit_resubmissions_used IS
  'Number of permit resubmissions used after rejection. Capped at 1.';

-- Normalize report target labels and block invalid/missing targets.
CREATE OR REPLACE FUNCTION public.normalize_report_target_type(raw_target_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(raw_target_type, '')))
    WHEN 'venue' THEN 'studio'
    WHEN 'artist' THEN 'profile'
    WHEN 'user' THEN 'profile'
    ELSE lower(btrim(coalesce(raw_target_type, '')))
  END;
$$;

UPDATE public.reports
SET target_type = public.normalize_report_target_type(target_type)
WHERE target_type IS DISTINCT FROM public.normalize_report_target_type(target_type);

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_target_type_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('group', 'studio', 'gig', 'profile'));

UPDATE public.reports r
SET status = 'dismissed'
WHERE lower(coalesce(r.status, 'pending')) = 'pending'
  AND (
    (r.target_type = 'group' AND NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.id = r.target_id))
    OR (r.target_type = 'studio' AND NOT EXISTS (SELECT 1 FROM public.studios s WHERE s.id = r.target_id))
    OR (r.target_type = 'gig' AND NOT EXISTS (SELECT 1 FROM public.gigs gg WHERE gg.id = r.target_id))
    OR (r.target_type = 'profile' AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = r.target_id))
  );

WITH duplicate_pending AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        coalesce(reporter_id, '00000000-0000-0000-0000-000000000000'::uuid),
        target_type,
        target_id,
        lower(reason)
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.reports
  WHERE lower(coalesce(status, 'pending')) = 'pending'
)
UPDATE public.reports r
SET status = 'dismissed'
WHERE r.id IN (
  SELECT id FROM duplicate_pending WHERE duplicate_rank > 1
);

CREATE OR REPLACE FUNCTION public.validate_report_target_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target_type text;
  v_target_exists boolean := false;
BEGIN
  v_target_type := public.normalize_report_target_type(NEW.target_type);

  IF v_target_type NOT IN ('group', 'studio', 'gig', 'profile') THEN
    RAISE EXCEPTION 'Invalid report target_type: %', NEW.target_type
      USING ERRCODE = '23514';
  END IF;

  NEW.target_type := v_target_type;
  NEW.reason := btrim(coalesce(NEW.reason, ''));

  IF NEW.reason = '' THEN
    RAISE EXCEPTION 'Report reason is required.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_id IS NULL THEN
    RAISE EXCEPTION 'Report target_id is required.'
      USING ERRCODE = '23502';
  END IF;

  IF v_target_type = 'group' THEN
    SELECT EXISTS (SELECT 1 FROM public.groups WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'studio' THEN
    SELECT EXISTS (SELECT 1 FROM public.studios WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'gig' THEN
    SELECT EXISTS (SELECT 1 FROM public.gigs WHERE id = NEW.target_id) INTO v_target_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.target_id) INTO v_target_exists;
  END IF;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Cannot report missing target: % %', v_target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_report_target_before_write ON public.reports;
CREATE TRIGGER trg_validate_report_target_before_write
  BEFORE INSERT OR UPDATE OF target_type, target_id, reason
  ON public.reports
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_report_target_before_write();

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_pending_by_reporter_target_reason
  ON public.reports (
    coalesce(reporter_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_type,
    target_id,
    lower(reason)
  )
  WHERE lower(coalesce(status, 'pending')) = 'pending';

COMMIT;
