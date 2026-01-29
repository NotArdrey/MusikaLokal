-- Add cancellation_reason column to studio_bookings if it doesn't exist
ALTER TABLE studio_bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add cancellation_reason column to gig_applications if it doesn't exist
ALTER TABLE gig_applications ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
