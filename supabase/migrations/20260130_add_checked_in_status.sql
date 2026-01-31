-- Migration: Add 'checked_in' status to studio_bookings
-- Date: 2026-01-30
-- Description: Adds support for check-in functionality

-- 1. Drop the existing status check constraint
ALTER TABLE studio_bookings 
DROP CONSTRAINT IF EXISTS studio_bookings_status_check;

-- 2. Add new constraint with 'checked_in' status
ALTER TABLE studio_bookings 
ADD CONSTRAINT studio_bookings_status_check 
CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'checked_in'));

-- 3. Add check_in_time column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'studio_bookings' 
        AND column_name = 'check_in_time'
    ) THEN
        ALTER TABLE studio_bookings 
        ADD COLUMN check_in_time TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 4. Add proof_url column if it doesn't exist (for proof of service)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'studio_bookings' 
        AND column_name = 'proof_url'
    ) THEN
        ALTER TABLE studio_bookings 
        ADD COLUMN proof_url TEXT;
    END IF;
END $$;

-- 5. Add review tracking columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'studio_bookings' 
        AND column_name = 'reviewed_by_customer'
    ) THEN
        ALTER TABLE studio_bookings 
        ADD COLUMN reviewed_by_customer BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'studio_bookings' 
        AND column_name = 'reviewed_by_owner'
    ) THEN
        ALTER TABLE studio_bookings 
        ADD COLUMN reviewed_by_owner BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 6. Comment for documentation
COMMENT ON COLUMN studio_bookings.check_in_time IS 'Timestamp when the customer was checked in via QR scan';
COMMENT ON COLUMN studio_bookings.proof_url IS 'URL to proof of service completion (photo/document)';
