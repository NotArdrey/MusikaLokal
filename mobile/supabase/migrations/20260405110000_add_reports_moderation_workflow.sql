-- Add report moderation workflow metadata for admin actions, escalation, and auditability.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS moderation_action text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS moderation_notes text,
  ADD COLUMN IF NOT EXISTS escalation_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS escalated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

UPDATE public.reports
SET moderation_action = 'none'
WHERE moderation_action IS NULL;

UPDATE public.reports
SET escalation_status = 'none'
WHERE escalation_status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_moderation_action_check'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_moderation_action_check
      CHECK (
        moderation_action IN (
          'none',
          'warn_reporter',
          'warn_target_owner',
          'warn_both',
          'manual_review'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_escalation_status_check'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_escalation_status_check
      CHECK (escalation_status IN ('none', 'manual_review'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
  ON public.reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_escalation_status_created_at
  ON public.reports(escalation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_reviewed_at
  ON public.reports(reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_reviewed_by
  ON public.reports(reviewed_by);

COMMENT ON COLUMN public.reports.reviewed_by IS 'Admin user id that last reviewed this report.';
COMMENT ON COLUMN public.reports.reviewed_at IS 'Timestamp when the report was last reviewed by an admin.';
COMMENT ON COLUMN public.reports.moderation_action IS 'Last moderation action taken by admin.';
COMMENT ON COLUMN public.reports.moderation_notes IS 'Optional admin moderation notes.';
COMMENT ON COLUMN public.reports.escalation_status IS 'Escalation state for admin triage.';
COMMENT ON COLUMN public.reports.escalated_at IS 'Timestamp when report was escalated to manual review.';
COMMENT ON COLUMN public.reports.escalation_reason IS 'Optional reason for escalation.';
