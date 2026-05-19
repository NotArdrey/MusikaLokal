-- Track account-level actions taken while moderating reports.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS target_account_action text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS target_account_action_expires_at timestamp with time zone;

UPDATE public.reports
SET target_account_action = 'none'
WHERE target_account_action IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reports_target_account_action_check'
  ) THEN
    ALTER TABLE public.reports
      ADD CONSTRAINT reports_target_account_action_check
      CHECK (
        target_account_action IN (
          'none',
          'mark_unverified',
          'ban_1_day',
          'ban_7_days',
          'ban_30_days',
          'ban_permanent',
          'lift_ban'
        )
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_reports_target_account_action_created_at
  ON public.reports(target_account_action, created_at DESC)
  WHERE target_account_action <> 'none';

CREATE INDEX IF NOT EXISTS idx_reports_target_account_action_expires_at
  ON public.reports(target_account_action_expires_at)
  WHERE target_account_action_expires_at IS NOT NULL;

COMMENT ON COLUMN public.reports.target_account_action IS
  'Account-level action applied to the reported owner/profile during report moderation.';
COMMENT ON COLUMN public.reports.target_account_action_expires_at IS
  'Expiry timestamp for temporary account-level moderation actions when applicable.';
