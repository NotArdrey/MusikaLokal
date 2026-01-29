-- Run this in your Supabase SQL Editor to enable the new verification flow

-- 1. Create a table to temporarily store verification results for users who haven't created accounts yet
CREATE TABLE IF NOT EXISTS verification_sessions (
    session_ref TEXT PRIMARY KEY, -- This corresponds to the vendor_data/reference we send to Didit
    verification_data JSONB,
    status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Secure the table (Admin/Service Role only)
ALTER TABLE verification_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Create a secure function to link the verification data to the new user account
-- This function is called by the frontend after signup.
-- Since the user might not be logged in (email confirmation pending), we accept user_id as a parameter.
-- This relies on the secrecy of p_session_ref (nonce) for security.
CREATE OR REPLACE FUNCTION link_verification_session(p_session_ref TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges to update profiles
SET search_path = public -- Secure search path
AS $$
DECLARE
    v_data JSONB;
BEGIN
    -- Input validation
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID required';
    END IF;

    -- Retrieve the verification data
    SELECT verification_data INTO v_data
    FROM verification_sessions
    WHERE session_ref = p_session_ref;

    IF v_data IS NULL THEN
        RAISE EXCEPTION 'Verification session not found or expired';
    END IF;

    -- Upsert the profile with the verified data and link to the providing user_id
    INSERT INTO profiles (
        id, 
        email, -- We attempt to lookup email, if not found (race condition), it might be null/empty initially
        full_name, 
        role, -- FIXED: Include role to satisfy NOT NULL constraint
        is_verified, 
        verification_status, 
        id_document_expiry, 
        id_verified_at,
        didit_session_id
    )
    VALUES (
        p_user_id,
        (SELECT email FROM auth.users WHERE id = p_user_id),
        v_data->>'full_name',
        COALESCE((SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = p_user_id), 'fan'), -- Fetch role from auth metadata
        TRUE,
        'APPROVED',
        (v_data->>'id_document_expiry')::DATE,
        NOW(),
        p_session_ref
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = CASE WHEN profiles.full_name IS NULL THEN EXCLUDED.full_name ELSE profiles.full_name END,
        is_verified = TRUE,
        verification_status = 'APPROVED',
        id_document_expiry = EXCLUDED.id_document_expiry,
        id_verified_at = EXCLUDED.id_verified_at,
        didit_session_id = EXCLUDED.didit_session_id;

    -- Clean up
    DELETE FROM verification_sessions WHERE session_ref = p_session_ref;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- IMPORTANT: Grant execute permission to anon so the signup flow can call it before email is confirmed
GRANT EXECUTE ON FUNCTION link_verification_session TO anon, authenticated, service_role;
