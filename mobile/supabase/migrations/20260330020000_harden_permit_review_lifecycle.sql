BEGIN;

-- Normalize permit status defaults and legacy values.
UPDATE studios
SET permit_status = 'pending_review'
WHERE permit_status IS NULL OR permit_status = 'pending';

UPDATE gigs
SET permit_status = 'pending_review'
WHERE permit_status IS NULL OR permit_status = 'pending';

ALTER TABLE studios
  ALTER COLUMN permit_status SET DEFAULT 'pending_review';

ALTER TABLE gigs
  ALTER COLUMN permit_status SET DEFAULT 'pending_review';

ALTER TABLE studios
  DROP CONSTRAINT IF EXISTS studios_permit_status_check;

ALTER TABLE studios
  ADD CONSTRAINT studios_permit_status_check
  CHECK (permit_status IN ('pending_review', 'approved', 'rejected', 'resubmitted'));

ALTER TABLE gigs
  DROP CONSTRAINT IF EXISTS gigs_permit_status_check;

ALTER TABLE gigs
  ADD CONSTRAINT gigs_permit_status_check
  CHECK (permit_status IN ('pending_review', 'approved', 'rejected', 'resubmitted'));

-- Queue-oriented indexes for admin review pages.
CREATE INDEX IF NOT EXISTS idx_studios_permit_queue
  ON studios (permit_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gigs_permit_queue
  ON gigs (permit_status, created_at DESC);

-- Keep admin role constraint explicit and deterministic.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  ALTER TABLE profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('musician', 'manager', 'musician-member', 'studio-owner', 'venue-owner', 'admin'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END$$;

-- Ensure helper function exists for policy checks.
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

-- Keep legacy + modern audit columns for compatibility across deployments.
ALTER TABLE permit_audit_log
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS previous_status TEXT,
  ADD COLUMN IF NOT EXISTS new_status TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Tighten audit-log write policy to admins only.
ALTER TABLE permit_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System can insert audit logs" ON permit_audit_log;
DROP POLICY IF EXISTS "Admins can insert permit audit logs" ON permit_audit_log;

CREATE POLICY "Admins can insert permit audit logs"
ON permit_audit_log FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

-- Keep public views and metrics aligned with pending_review as the primary status.
CREATE OR REPLACE VIEW admin_permit_metrics AS
SELECT
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'pending_review') AS studios_pending,
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'approved') AS studios_approved,
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'rejected') AS studios_rejected,
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'resubmitted') AS studios_resubmitted,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'pending_review') AS gigs_pending,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'approved') AS gigs_approved,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'rejected') AS gigs_rejected,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'resubmitted') AS gigs_resubmitted,
  (SELECT COUNT(*) FROM profiles) AS total_users,
  (SELECT COUNT(*) FROM profiles WHERE role = 'studio-owner') AS studio_owners,
  (SELECT COUNT(*) FROM profiles WHERE role = 'venue-owner') AS venue_owners,
  (SELECT COUNT(*) FROM profiles WHERE role = 'musician') AS musicians,
  (SELECT COUNT(*) FROM profiles WHERE role = 'admin') AS admins,
  (SELECT COUNT(*) FROM permit_audit_log WHERE created_at > NOW() - INTERVAL '24 hours') AS recent_audit_actions,
  (SELECT COUNT(*) FROM studios WHERE created_at > NOW() - INTERVAL '24 hours') AS new_studios_24h,
  (SELECT COUNT(*) FROM gigs WHERE created_at > NOW() - INTERVAL '24 hours') AS new_gigs_24h;

COMMIT;
