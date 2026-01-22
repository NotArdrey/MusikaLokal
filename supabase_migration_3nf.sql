-- ============================================================
-- MIGRATION SCRIPT: Normalize Database to 3NF
-- ============================================================
-- Run this script to migrate your existing Supabase database
-- to the normalized 3NF schema.
-- 
-- IMPORTANT: Backup your database before running this migration!
-- ============================================================

-- ============================================================
-- STEP 1: Remove Redundant pending_signups Table
-- ============================================================

-- Drop related cron jobs if exists (wrapped in DO block for safety)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-ghost-accounts');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if cron job doesn't exist or pg_cron not installed
  NULL;
END $$;

-- Drop policies first
DROP POLICY IF EXISTS "Allow insert" ON pending_signups;
DROP POLICY IF EXISTS "Allow select" ON pending_signups;
DROP POLICY IF EXISTS "Service role delete" ON pending_signups;
DROP POLICY IF EXISTS "Allow anonymous insert" ON pending_signups;
DROP POLICY IF EXISTS "Service role full access" ON pending_signups;

-- Drop indexes
DROP INDEX IF EXISTS idx_pending_signups_email;
DROP INDEX IF EXISTS idx_pending_signups_session;

-- Drop the table
DROP TABLE IF EXISTS pending_signups;

-- ============================================================
-- STEP 2: Remove Derived/Redundant Columns (BEFORE creating views)
-- ============================================================

-- Remove derived columns from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS rating;
ALTER TABLE profiles DROP COLUMN IF EXISTS review_count;

-- Remove derived columns from groups
ALTER TABLE groups DROP COLUMN IF EXISTS rating;
ALTER TABLE groups DROP COLUMN IF EXISTS review_count;

-- Remove derived columns from studios
ALTER TABLE studios DROP COLUMN IF EXISTS rating;
ALTER TABLE studios DROP COLUMN IF EXISTS review_count;

-- Remove derived columns from gigs (if exists)
ALTER TABLE gigs DROP COLUMN IF EXISTS rating;
ALTER TABLE gigs DROP COLUMN IF EXISTS review_count;

-- Remove derived column from reviews
ALTER TABLE reviews DROP COLUMN IF EXISTS likes_count;

-- Remove derived columns from studio_bookings
ALTER TABLE studio_bookings DROP COLUMN IF EXISTS duration_hours;
ALTER TABLE studio_bookings DROP COLUMN IF EXISTS total_cost;

-- ============================================================
-- STEP 3: Create Views for Computed Values (AFTER removing columns)
-- ============================================================

-- View: Profile with computed rating and review count
CREATE OR REPLACE VIEW profiles_with_stats AS
SELECT 
  p.*,
  COALESCE(AVG(r.rating), 0) AS computed_rating,
  COUNT(r.id) AS computed_review_count
FROM profiles p
LEFT JOIN reviews r ON r.user_id = p.id
GROUP BY p.id;

-- View: Groups with computed rating and review count
CREATE OR REPLACE VIEW groups_with_stats AS
SELECT 
  g.*,
  COALESCE(AVG(r.rating), 0) AS computed_rating,
  COUNT(r.id) AS computed_review_count
FROM groups g
LEFT JOIN reviews r ON r.group_id = g.id
GROUP BY g.id;

-- View: Studios with computed rating and review count
CREATE OR REPLACE VIEW studios_with_stats AS
SELECT 
  s.*,
  COALESCE(AVG(r.rating), 0) AS computed_rating,
  COUNT(r.id) AS computed_review_count
FROM studios s
LEFT JOIN reviews r ON r.studio_id = s.id
GROUP BY s.id;

-- View: Gigs with computed rating and review count
CREATE OR REPLACE VIEW gigs_with_stats AS
SELECT 
  g.*,
  COALESCE(AVG(r.rating), 0) AS computed_rating,
  COUNT(r.id) AS computed_review_count
FROM gigs g
LEFT JOIN reviews r ON r.gig_id = g.id
GROUP BY g.id;

-- View: Reviews with computed likes count
CREATE OR REPLACE VIEW reviews_with_stats AS
SELECT 
  r.*,
  COUNT(rl.id) AS computed_likes_count
FROM reviews r
LEFT JOIN review_likes rl ON rl.review_id = r.id
GROUP BY r.id;

-- View: Studio bookings with computed duration and cost
CREATE OR REPLACE VIEW studio_bookings_with_cost AS
SELECT 
  sb.*,
  EXTRACT(EPOCH FROM (sb.end_time - sb.start_time)) / 3600 AS computed_duration_hours,
  (EXTRACT(EPOCH FROM (sb.end_time - sb.start_time)) / 3600) * s.hourly_rate AS computed_total_cost,
  s.name AS studio_name,
  s.images AS studio_images
FROM studio_bookings sb
JOIN studios s ON s.id = sb.studio_id;

-- ============================================================
-- STEP 4: Create Helper Functions
-- ============================================================

-- Function to get rating for any entity type
CREATE OR REPLACE FUNCTION get_entity_rating(entity_type TEXT, entity_id UUID)
RETURNS TABLE(rating NUMERIC, review_count BIGINT) AS $$
BEGIN
  IF entity_type = 'profile' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.user_id = entity_id;
  ELSIF entity_type = 'group' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.group_id = entity_id;
  ELSIF entity_type = 'studio' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.studio_id = entity_id;
  ELSIF entity_type = 'gig' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.gig_id = entity_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate booking cost
CREATE OR REPLACE FUNCTION calculate_booking_cost(p_studio_id UUID, p_start_time TIME, p_end_time TIME)
RETURNS NUMERIC AS $$
DECLARE
  v_hourly_rate NUMERIC;
  v_duration NUMERIC;
BEGIN
  SELECT hourly_rate INTO v_hourly_rate FROM studios WHERE id = p_studio_id;
  v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600;
  RETURN v_duration * COALESCE(v_hourly_rate, 0);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 5: Add Performance Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reviews_group_id ON reviews(group_id);
CREATE INDEX IF NOT EXISTS idx_reviews_studio_id ON reviews(studio_id);
CREATE INDEX IF NOT EXISTS idx_reviews_gig_id ON reviews(gig_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON review_likes(review_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_studio_id ON studio_bookings(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_user_id ON studio_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_gig_applications_gig_id ON gig_applications(gig_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Your database is now normalized to 3NF.
-- 
-- CHANGES MADE:
-- 1. REMOVED: pending_signups table (use Supabase auth email verification)
-- 2. REMOVED: rating, review_count from profiles, groups, studios, gigs
-- 3. REMOVED: likes_count from reviews
-- 4. REMOVED: duration_hours, total_cost from studio_bookings
-- 5. CREATED: Views to compute these values on-the-fly
-- 6. CREATED: Helper functions for computed values
-- 
-- BACKEND/FRONTEND UPDATES REQUIRED:
-- - Update signup flow to use Supabase auth directly
-- - Update queries to use views (*_with_stats) or join with reviews
-- - Update booking queries to calculate cost on-the-fly
-- ============================================================
