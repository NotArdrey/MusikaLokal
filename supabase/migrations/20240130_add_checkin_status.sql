-- Migration to support QR Code Check-in
-- 1. Add 'checked_in' to the status constraint of studio_bookings
ALTER TABLE studio_bookings 
DROP CONSTRAINT studio_bookings_status_check;

ALTER TABLE studio_bookings 
ADD CONSTRAINT studio_bookings_status_check 
CHECK (status IN ('pending', 'confirmed', 'checked_in', 'cancelled', 'completed', 'rejected', 'accepted'));

-- 2. Add check_in_time column to studio_bookings
ALTER TABLE studio_bookings 
ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP WITH TIME ZONE;
