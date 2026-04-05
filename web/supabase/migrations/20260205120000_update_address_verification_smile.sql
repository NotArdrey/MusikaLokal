-- Migration: Update Address Verification for Smile Identity API
-- This migration updates the address verification system from Didit to Smile Identity

-- ============================================================
-- 1. ADD SMILE IDENTITY COLUMNS TO PROFILES
-- ============================================================
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS smile_user_id TEXT;

-- Add index for faster lookups by Smile user ID
CREATE INDEX IF NOT EXISTS idx_profiles_smile_user_id ON profiles(smile_user_id);

COMMENT ON COLUMN profiles.smile_user_id IS 'Smile Identity user ID for document verification';

-- ============================================================
-- 2. UPDATE ADDRESS VERIFICATION SESSIONS TABLE
-- ============================================================
-- Add new columns for Smile Identity integration
ALTER TABLE address_verification_sessions 
ADD COLUMN IF NOT EXISTS smile_user_id TEXT,
ADD COLUMN IF NOT EXISTS archive_id TEXT,
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'smile',
ADD COLUMN IF NOT EXISTS verification_result JSONB,
ADD COLUMN IF NOT EXISTS error_code TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW());

-- Update the status check constraint to include new Smile-specific statuses
-- First drop the existing constraint
ALTER TABLE address_verification_sessions 
DROP CONSTRAINT IF EXISTS address_verification_sessions_status_check;

-- Add new constraint with additional statuses
ALTER TABLE address_verification_sessions 
ADD CONSTRAINT address_verification_sessions_status_check 
CHECK (status IN ('PENDING', 'SUBMITTED', 'PROCESSING', 'ANALYZED', 'VERIFIED', 'APPROVED', 'DECLINED', 'FAILED', 'REVOKED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW'));

-- Make entity_id nullable for pre-creation verification flow
ALTER TABLE address_verification_sessions 
ALTER COLUMN entity_id DROP NOT NULL;

-- Add index for Smile user ID lookups
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_smile_user ON address_verification_sessions(smile_user_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_archive ON address_verification_sessions(archive_id);

-- ============================================================
-- 3. UPDATE STUDIOS TABLE FOR SMILE INTEGRATION
-- ============================================================
ALTER TABLE studios 
ADD COLUMN IF NOT EXISTS verified_address TEXT,
ADD COLUMN IF NOT EXISTS address_verification_completed_at TIMESTAMP WITH TIME ZONE;

-- Update the status check constraint to include new statuses
ALTER TABLE studios 
DROP CONSTRAINT IF EXISTS studios_address_verification_status_check;

ALTER TABLE studios 
ADD CONSTRAINT studios_address_verification_status_check 
CHECK (address_verification_status IN ('NOT_STARTED', 'PENDING', 'PROCESSING', 'VERIFIED', 'APPROVED', 'DECLINED', 'FAILED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW'));

-- ============================================================
-- 4. UPDATE GIGS TABLE FOR SMILE INTEGRATION
-- ============================================================
ALTER TABLE gigs 
ADD COLUMN IF NOT EXISTS verified_address TEXT,
ADD COLUMN IF NOT EXISTS address_verification_completed_at TIMESTAMP WITH TIME ZONE;

-- Update the status check constraint to include new statuses
ALTER TABLE gigs 
DROP CONSTRAINT IF EXISTS gigs_address_verification_status_check;

ALTER TABLE gigs 
ADD CONSTRAINT gigs_address_verification_status_check 
CHECK (address_verification_status IN ('NOT_STARTED', 'PENDING', 'PROCESSING', 'VERIFIED', 'APPROVED', 'DECLINED', 'FAILED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW'));

-- ============================================================
-- 5. UPDATE COMMENTS FOR DOCUMENTATION
-- ============================================================
COMMENT ON TABLE address_verification_sessions IS 'Tracks Smile Identity Proof of Address verification sessions for studios and gigs';
COMMENT ON COLUMN address_verification_sessions.session_id IS 'Internal session ID for tracking';
COMMENT ON COLUMN address_verification_sessions.smile_user_id IS 'Smile Identity user ID';
COMMENT ON COLUMN address_verification_sessions.archive_id IS 'Smile Identity archive/document ID';
COMMENT ON COLUMN address_verification_sessions.provider IS 'Verification provider (smile)';
COMMENT ON COLUMN address_verification_sessions.extracted_address IS 'Address extracted from utility bill by Smile Identity OCR';
COMMENT ON COLUMN address_verification_sessions.extracted_name IS 'Name extracted from utility bill by Smile Identity OCR';
COMMENT ON COLUMN address_verification_sessions.verification_result IS 'Full verification result from Smile API';

COMMENT ON COLUMN studios.verified_address IS 'Address extracted and verified from utility bill';
COMMENT ON COLUMN studios.address_verification_completed_at IS 'Timestamp when address verification was completed';
COMMENT ON COLUMN gigs.verified_address IS 'Address extracted and verified from utility bill';
COMMENT ON COLUMN gigs.address_verification_completed_at IS 'Timestamp when address verification was completed';

-- ============================================================
-- 6. DROP AND RECREATE VIEWS FOR SMILE INTEGRATION
-- ============================================================
DROP VIEW IF EXISTS studios_with_verification;
CREATE VIEW studios_with_verification AS
SELECT 
    s.*,
    CASE 
        WHEN s.address_verification_status IN ('APPROVED', 'VERIFIED') THEN TRUE
        ELSE FALSE
    END AS is_address_verified,
    avs.extracted_address AS session_extracted_address,
    avs.extracted_name AS session_extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes,
    avs.provider AS verification_provider,
    avs.archive_id AS smile_archive_id
FROM studios s
LEFT JOIN address_verification_sessions avs 
    ON avs.entity_type = 'studio' 
    AND avs.entity_id = s.id 
    AND avs.status IN ('APPROVED', 'VERIFIED');

DROP VIEW IF EXISTS gigs_with_verification;
CREATE VIEW gigs_with_verification AS
SELECT 
    g.*,
    CASE 
        WHEN g.address_verification_status IN ('APPROVED', 'VERIFIED') THEN TRUE
        ELSE FALSE
    END AS is_address_verified,
    avs.extracted_address AS session_extracted_address,
    avs.extracted_name AS session_extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes,
    avs.provider AS verification_provider,
    avs.archive_id AS smile_archive_id
FROM gigs g
LEFT JOIN address_verification_sessions avs 
    ON avs.entity_type = 'gig' 
    AND avs.entity_id = g.id 
    AND avs.status IN ('APPROVED', 'VERIFIED');
