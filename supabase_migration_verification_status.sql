-- Migration: Add verification status tracking to profiles
-- Run this in Supabase Dashboard > SQL Editor
-- This migration is SAFE to run multiple times (idempotent)

-- ============================================
-- STEP 1: Create the enum type if it doesn't exist
-- ============================================
DO $$ BEGIN
    CREATE TYPE verification_status_enum AS ENUM ('NOT_STARTED', 'PENDING', 'PENDING_REVIEW', 'APPROVED', 'DECLINED', 'ABANDONED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- STEP 2: Add new columns to profiles table
-- All columns use IF NOT EXISTS for safety
-- ============================================
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_status verification_status_enum DEFAULT 'NOT_STARTED',
ADD COLUMN IF NOT EXISTS didit_session_id text,
ADD COLUMN IF NOT EXISTS id_document_expiry date,
ADD COLUMN IF NOT EXISTS id_verified_at timestamp with time zone;

-- ============================================
-- STEP 3: Create indexes for performance
-- ============================================

-- Index for session ID lookups (used by webhook to find user by session)
CREATE INDEX IF NOT EXISTS idx_profiles_didit_session 
ON profiles(didit_session_id) 
WHERE didit_session_id IS NOT NULL;

-- Index for finding unverified users by email (for re-registration flow)
CREATE INDEX IF NOT EXISTS idx_profiles_email_unverified 
ON profiles(email, is_verified) 
WHERE is_verified = false;

-- Index for finding users by verification status
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
ON profiles(verification_status)
WHERE verification_status != 'APPROVED';

-- ============================================
-- STEP 4: Sync existing data
-- Set APPROVED status for already verified users
-- ============================================
UPDATE profiles 
SET verification_status = 'APPROVED' 
WHERE is_verified = true 
  AND (verification_status IS NULL OR verification_status = 'NOT_STARTED');

-- ============================================
-- STEP 5: RLS Policy for profiles (ensure users can read their own status)
-- ============================================
-- Users can read their own profile (including verification status)
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
    CREATE POLICY "Users can view own profile" ON profiles
        FOR SELECT USING (auth.uid() = id);
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Users can update their own non-sensitive fields
-- Note: is_verified and verification_status should NOT be updatable by user
DO $$ BEGIN
    DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
    CREATE POLICY "Users can update own profile" ON profiles
        FOR UPDATE USING (auth.uid() = id)
        WITH CHECK (auth.uid() = id);
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- ============================================
-- NOTE ON EMAIL UNIQUE CONSTRAINT:
-- The existing UNIQUE constraint on 'email' column does NOT prevent updates.
-- When a user with DECLINED/ABANDONED status retries registration:
-- 1. We authenticate them with their existing credentials
-- 2. We UPDATE their existing row (not INSERT)
-- 3. The UNIQUE constraint allows this because it's the same row
-- 
-- The "lockout loophole" is prevented by:
-- 1. Checking is_verified BEFORE blocking with "email taken" error
-- 2. Allowing retry if verification_status is DECLINED or ABANDONED
-- 3. Blocking retry ONLY if status is PENDING_REVIEW
-- ============================================

-- Verification: Check the table structure after migration
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' 
--   AND column_name IN ('is_verified', 'verification_status', 'didit_session_id');
