-- Migration: Add Address Verification System
-- This migration adds support for Didit Proof of Address verification for studios and gigs

-- ============================================================
-- 1. CREATE ADDRESS VERIFICATION SESSIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS address_verification_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('studio', 'gig')),
    entity_id UUID NOT NULL,
    expected_address TEXT,
    expected_name TEXT,
    extracted_address TEXT,
    extracted_name TEXT,
    issuer TEXT,
    issue_date TEXT,
    name_matches BOOLEAN,
    address_matches BOOLEAN,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW')),
    notes TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    raw_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_session_id ON address_verification_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_entity ON address_verification_sessions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_user ON address_verification_sessions(user_id);

-- ============================================================
-- 2. ADD ADDRESS VERIFICATION COLUMNS TO STUDIOS
-- ============================================================
ALTER TABLE studios 
ADD COLUMN IF NOT EXISTS address_verification_status TEXT DEFAULT 'NOT_STARTED' CHECK (address_verification_status IN ('NOT_STARTED', 'PENDING', 'APPROVED', 'DECLINED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW')),
ADD COLUMN IF NOT EXISTS address_verification_session_id TEXT,
ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- 3. ADD ADDRESS VERIFICATION COLUMNS TO GIGS (Venues)
-- ============================================================
ALTER TABLE gigs 
ADD COLUMN IF NOT EXISTS address_verification_status TEXT DEFAULT 'NOT_STARTED' CHECK (address_verification_status IN ('NOT_STARTED', 'PENDING', 'APPROVED', 'DECLINED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW')),
ADD COLUMN IF NOT EXISTS address_verification_session_id TEXT,
ADD COLUMN IF NOT EXISTS address_verified_at TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on address_verification_sessions
ALTER TABLE address_verification_sessions ENABLE ROW LEVEL SECURITY;

-- Ensure policy creation is idempotent when this migration is replayed.
DROP POLICY IF EXISTS "Users can view own address verification sessions"
ON address_verification_sessions;

DROP POLICY IF EXISTS "Service role can manage address verification sessions"
ON address_verification_sessions;

-- Users can view their own verification sessions
CREATE POLICY "Users can view own address verification sessions"
ON address_verification_sessions FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage all (for webhooks)
CREATE POLICY "Service role can manage address verification sessions"
ON address_verification_sessions FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================
-- 5. CREATE VIEW FOR STUDIOS WITH VERIFICATION STATUS
-- ============================================================
DROP VIEW IF EXISTS studios_with_verification;
CREATE VIEW studios_with_verification AS
SELECT 
    s.*,
    CASE 
        WHEN s.address_verification_status = 'APPROVED' THEN TRUE
        ELSE FALSE
    END AS is_address_verified,
    avs.extracted_address,
    avs.extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes
FROM studios s
LEFT JOIN address_verification_sessions avs 
    ON avs.entity_type = 'studio' 
    AND avs.entity_id = s.id 
    AND avs.status = s.address_verification_status;

-- ============================================================
-- 6. CREATE VIEW FOR GIGS WITH VERIFICATION STATUS
-- ============================================================
DROP VIEW IF EXISTS gigs_with_verification;
CREATE VIEW gigs_with_verification AS
SELECT 
    g.*,
    CASE 
        WHEN g.address_verification_status = 'APPROVED' THEN TRUE
        ELSE FALSE
    END AS is_address_verified,
    avs.extracted_address,
    avs.extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes
FROM gigs g
LEFT JOIN address_verification_sessions avs 
    ON avs.entity_type = 'gig' 
    AND avs.entity_id = g.id 
    AND avs.status = g.address_verification_status;

-- ============================================================
-- 7. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================
COMMENT ON TABLE address_verification_sessions IS 'Tracks Didit Proof of Address verification sessions for studios and gigs';
COMMENT ON COLUMN address_verification_sessions.session_id IS 'Didit session ID';
COMMENT ON COLUMN address_verification_sessions.entity_type IS 'Type of entity being verified (studio or gig)';
COMMENT ON COLUMN address_verification_sessions.expected_address IS 'Address entered by user for the studio/gig';
COMMENT ON COLUMN address_verification_sessions.expected_name IS 'Verified name of the owner from ID verification';
COMMENT ON COLUMN address_verification_sessions.extracted_address IS 'Address extracted from utility bill by Didit';
COMMENT ON COLUMN address_verification_sessions.extracted_name IS 'Name extracted from utility bill by Didit';

COMMENT ON COLUMN studios.address_verification_status IS 'Status of address verification: NOT_STARTED, PENDING, APPROVED, DECLINED, ABANDONED, MANUAL_REVIEW, PENDING_REVIEW';
COMMENT ON COLUMN gigs.address_verification_status IS 'Status of address verification: NOT_STARTED, PENDING, APPROVED, DECLINED, ABANDONED, MANUAL_REVIEW, PENDING_REVIEW';
