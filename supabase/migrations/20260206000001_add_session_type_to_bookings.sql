-- Migration: Add session_type column to studio_bookings
-- Purpose: Track whether a booking is for Rehearsal or Recording at studios that offer both services

-- Add session_type column to studio_bookings table
ALTER TABLE studio_bookings 
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'rehearsal' 
CHECK (session_type IN ('rehearsal', 'recording'));

-- Add comment explaining the column
COMMENT ON COLUMN studio_bookings.session_type IS 'Type of session booked: rehearsal (hourly time slots) or recording (whole-day booking)';

-- Update existing bookings based on studio type
-- For pure Recording studios, set session_type to 'recording'
-- For pure Rehearsal studios, set session_type to 'rehearsal'
-- For Both studios, default to 'rehearsal' (existing bookings were likely rehearsals since recording whole-day wasn't tracked before)
UPDATE studio_bookings sb
SET session_type = CASE 
  WHEN s.studio_type = 'Recording' THEN 'recording'
  ELSE 'rehearsal'
END
FROM studios s
WHERE sb.studio_id = s.id
AND sb.session_type IS NULL;
