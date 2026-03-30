BEGIN;

-- ============================================================
-- Permit Review System Migration
-- Adds permit review workflow fields, audit logging, and admin role support
-- ============================================================

-- Add permit_status ENUM type for consistent status values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permit_status') THEN
    CREATE TYPE permit_status AS ENUM ('pending', 'approved', 'rejected', 'resubmitted');
  END IF;
END$$;

-- ============================================================
-- Phase 1: Add permit review fields to studios table
-- ============================================================
ALTER TABLE studios 
  ADD COLUMN IF NOT EXISTS permit_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS permit_reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS permit_reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS permit_admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS permit_rejection_reason TEXT;

-- Add constraint to ensure valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studios_permit_status_check'
  ) THEN
    ALTER TABLE studios ADD CONSTRAINT studios_permit_status_check 
      CHECK (permit_status IN ('pending', 'approved', 'rejected', 'resubmitted'));
  END IF;
END$$;

-- Add index for permit queue queries
CREATE INDEX IF NOT EXISTS idx_studios_permit_status ON studios(permit_status);
CREATE INDEX IF NOT EXISTS idx_studios_permit_reviewed_at ON studios(permit_reviewed_at);

COMMENT ON COLUMN studios.permit_status IS 'Status of business permit review: pending, approved, rejected, resubmitted';
COMMENT ON COLUMN studios.permit_reviewed_by IS 'Admin user ID who reviewed the permit';
COMMENT ON COLUMN studios.permit_reviewed_at IS 'Timestamp when permit was last reviewed';
COMMENT ON COLUMN studios.permit_admin_notes IS 'Internal admin notes about the permit review';
COMMENT ON COLUMN studios.permit_rejection_reason IS 'Required reason when permit is rejected';

-- ============================================================
-- Phase 2: Add permit review fields to gigs table
-- ============================================================
ALTER TABLE gigs 
  ADD COLUMN IF NOT EXISTS permit_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS permit_reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS permit_reviewed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS permit_admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS permit_rejection_reason TEXT;

-- Add constraint to ensure valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gigs_permit_status_check'
  ) THEN
    ALTER TABLE gigs ADD CONSTRAINT gigs_permit_status_check 
      CHECK (permit_status IN ('pending', 'approved', 'rejected', 'resubmitted'));
  END IF;
END$$;

-- Add index for permit queue queries
CREATE INDEX IF NOT EXISTS idx_gigs_permit_status ON gigs(permit_status);
CREATE INDEX IF NOT EXISTS idx_gigs_permit_reviewed_at ON gigs(permit_reviewed_at);

COMMENT ON COLUMN gigs.permit_status IS 'Status of business permit review: pending, approved, rejected, resubmitted';
COMMENT ON COLUMN gigs.permit_reviewed_by IS 'Admin user ID who reviewed the permit';
COMMENT ON COLUMN gigs.permit_reviewed_at IS 'Timestamp when permit was last reviewed';
COMMENT ON COLUMN gigs.permit_admin_notes IS 'Internal admin notes about the permit review';
COMMENT ON COLUMN gigs.permit_rejection_reason IS 'Required reason when permit is rejected';

-- ============================================================
-- Phase 3: Create audit log table for permit review actions
-- ============================================================
CREATE TABLE IF NOT EXISTS permit_audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('studio', 'gig')),
  entity_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('submitted', 'approved', 'rejected', 'resubmitted')),
  performed_by UUID NOT NULL REFERENCES profiles(id),
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  rejection_reason TEXT,
  admin_notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Add indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_permit_audit_log_entity ON permit_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_permit_audit_log_performed_by ON permit_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_permit_audit_log_created_at ON permit_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permit_audit_log_action ON permit_audit_log(action);

COMMENT ON TABLE permit_audit_log IS 'Audit trail for all permit review actions';

-- ============================================================
-- Phase 4: Ensure admin role exists in profiles
-- ============================================================
-- Update the role check constraint if it exists, or add admin to allowed values
DO $$
BEGIN
  -- Check if there's an existing role constraint and update it
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
  END IF;
  
  -- Add updated constraint with admin role
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('musician', 'manager', 'musician-member', 'studio-owner', 'venue-owner', 'admin'));
EXCEPTION
  WHEN others THEN
    -- If constraint doesn't exist or can't be modified, create index for role
    NULL;
END$$;

-- ============================================================
-- Phase 5: Create helper functions for permit status checks
-- ============================================================

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = user_id AND role = 'admin'
  );
END;
$$;

-- Function to log permit audit entry
CREATE OR REPLACE FUNCTION log_permit_audit(
  p_entity_type VARCHAR(20),
  p_entity_id UUID,
  p_action VARCHAR(20),
  p_performed_by UUID,
  p_previous_status VARCHAR(20),
  p_new_status VARCHAR(20),
  p_rejection_reason TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO permit_audit_log (
    entity_type, entity_id, action, performed_by,
    previous_status, new_status, rejection_reason, admin_notes, metadata
  ) VALUES (
    p_entity_type, p_entity_id, p_action, p_performed_by,
    p_previous_status, p_new_status, p_rejection_reason, p_admin_notes, p_metadata
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$;

-- ============================================================
-- Phase 6: RLS Policies for permit_audit_log
-- ============================================================
ALTER TABLE permit_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "Admins can read all audit logs"
ON permit_audit_log FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admins can insert audit logs (via functions)
CREATE POLICY "System can insert audit logs"
ON permit_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================
-- Phase 7: Update studio RLS for permit visibility
-- ============================================================

-- Owners can see their own studio permit status (already covered by existing policies)
-- Admins need to see all studios for permit review queue

-- Drop existing restrictive policies if they block admin access
DROP POLICY IF EXISTS "Admins can view all studios" ON studios;
CREATE POLICY "Admins can view all studios"
ON studios FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update studio permits" ON studios;
CREATE POLICY "Admins can update studio permits"
ON studios FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- Phase 8: Update gig RLS for permit visibility
-- ============================================================

DROP POLICY IF EXISTS "Admins can view all gigs" ON gigs;
CREATE POLICY "Admins can view all gigs"
ON gigs FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update gig permits" ON gigs;
CREATE POLICY "Admins can update gig permits"
ON gigs FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- ============================================================
-- Phase 9: Create views for public listings with permit filter
-- ============================================================

-- View for publicly visible studios (approved permits only)
CREATE OR REPLACE VIEW public_studios AS
SELECT s.*
FROM studios s
WHERE s.permit_status = 'approved';

-- View for publicly visible gigs (approved permits only)
CREATE OR REPLACE VIEW public_gigs AS
SELECT g.*
FROM gigs g
WHERE g.permit_status = 'approved';

COMMENT ON VIEW public_studios IS 'Studios with approved business permits - for public display';
COMMENT ON VIEW public_gigs IS 'Gigs with approved business permits - for public display';

-- ============================================================
-- Phase 10: Create admin dashboard metrics view
-- ============================================================
CREATE OR REPLACE VIEW admin_permit_metrics AS
SELECT
  -- Studio metrics
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'pending') AS studios_pending,
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'approved') AS studios_approved,
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'rejected') AS studios_rejected,
  (SELECT COUNT(*) FROM studios WHERE permit_status = 'resubmitted') AS studios_resubmitted,
  -- Gig metrics
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'pending') AS gigs_pending,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'approved') AS gigs_approved,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'rejected') AS gigs_rejected,
  (SELECT COUNT(*) FROM gigs WHERE permit_status = 'resubmitted') AS gigs_resubmitted,
  -- User metrics
  (SELECT COUNT(*) FROM profiles) AS total_users,
  (SELECT COUNT(*) FROM profiles WHERE role = 'studio-owner') AS studio_owners,
  (SELECT COUNT(*) FROM profiles WHERE role = 'venue-owner') AS venue_owners,
  (SELECT COUNT(*) FROM profiles WHERE role = 'musician') AS musicians,
  (SELECT COUNT(*) FROM profiles WHERE role = 'admin') AS admins,
  -- Recent activity (last 24 hours)
  (SELECT COUNT(*) FROM permit_audit_log WHERE created_at > NOW() - INTERVAL '24 hours') AS recent_audit_actions,
  (SELECT COUNT(*) FROM studios WHERE created_at > NOW() - INTERVAL '24 hours') AS new_studios_24h,
  (SELECT COUNT(*) FROM gigs WHERE created_at > NOW() - INTERVAL '24 hours') AS new_gigs_24h;

COMMENT ON VIEW admin_permit_metrics IS 'Dashboard metrics for admin panel';

COMMIT;
