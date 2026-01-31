-- Migration: Resolve conflicts and update schema
-- Description: Adds exclusion constraint to studio_bookings, and adds missing columns to profiles and gig_applications.

BEGIN;

-- 1. Enable btree_gist extension for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add contact_number and address to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS contact_number TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- 3. Add video_url and note to gig_applications
ALTER TABLE gig_applications 
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS note TEXT;

-- 4. Add Exclusion Constraint to studio_bookings to prevent overlapping bookings
-- We use a tsrange (timestamp range) constructed from booking_date + start_time and booking_date + end_time.
-- NOTE: We use timestamp without time zone to avoid timezone complexity in the constraint, assume inputs are consistent.
-- The range is '[)' (inclusive start, exclusive end) which is standard for scheduling.
-- We only enforce this for active bookings (status != 'cancelled' and status != 'rejected' and status != 'declined').
-- However, standard exclusion constraints don't support partial indexing with a WHERE clause directly inside the EXCLUDE definition easily in all versions without a workaround.
-- But since we want to prevent *confirmed* or *pending* overlaps, usually strictly checking all non-cancelled is best.
-- Note: 'pending' bookings might overlap if we allow multiple requests, but we probably want to block creating a 'pending' request if a 'confirmed' one exists.
-- But the prompt implies "resolve conflicts", which usually means "double bookings".
-- If we enforce it on ALL rows, we can't have two pending requests for the same slot.
-- The user might want multiple pending requests? 
-- The `is_slot_available` function checks `status NOT IN ('cancelled')`. 
-- So we should probably enforce uniqueness for all non-cancelled bookings.

-- To handle the "WHERE status != 'cancelled'" requirement for the exclusion constraint, we can use a partial index or just enforce it for everything and clean up cancelled rows?
-- Postgres supports partial exclusion constraints: "EXCLUDE ... WHERE (status != 'cancelled')"
-- Let's try to add it.

ALTER TABLE studio_bookings
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  studio_id WITH =,
  booking_date WITH =,
  tsrange(
    (booking_date + start_time)::timestamp,
    (booking_date + end_time)::timestamp,
    '[)'
  ) WITH &&
)
WHERE (status != 'cancelled' AND status != 'rejected');

COMMIT;
