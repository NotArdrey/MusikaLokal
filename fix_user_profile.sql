-- Fix the profile that wasn't updated due to column errors
-- Run this in Supabase SQL Editor

UPDATE profiles
SET 
    full_name = 'Neil Ardrey Payoyo Laza',
    is_verified = true,
    verification_status = 'APPROVED',
    id_verified_at = NOW(),
    didit_session_id = NULL
WHERE id = 'd1f99b6f-c94e-4a3d-bbe9-3c1d80e25275';

-- Verify the update
SELECT id, email, full_name, is_verified, verification_status, id_verified_at 
FROM profiles 
WHERE id = 'd1f99b6f-c94e-4a3d-bbe9-3c1d80e25275';
