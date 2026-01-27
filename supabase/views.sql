-- ============================================================
-- MusikaLokal Database Views
-- Execute this SQL in Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. profiles_with_stats: profiles + average rating + review count
-- Used by: manage-profile edge function
CREATE OR REPLACE VIEW profiles_with_stats AS
SELECT 
    p.*,
    COALESCE(AVG(r.rating), 0) as rating,
    COUNT(r.id) as review_count
FROM profiles p
LEFT JOIN reviews r ON r.author_id = p.id
GROUP BY p.id;

-- 2. studio_bookings_with_cost: bookings + studio info + calculated cost
-- Used by: manage-bookings edge function
CREATE OR REPLACE VIEW studio_bookings_with_cost AS
SELECT 
    sb.*,
    s.name as studio_name,
    s.images as studio_images,
    s.hourly_rate,
    EXTRACT(EPOCH FROM (sb.end_time::time - sb.start_time::time)) / 3600 as duration_hours,
    (EXTRACT(EPOCH FROM (sb.end_time::time - sb.start_time::time)) / 3600) * s.hourly_rate as total_cost
FROM studio_bookings sb
LEFT JOIN studios s ON sb.studio_id = s.id;

-- 3. groups_with_stats: groups + average rating + review count
-- Used by: manage-listings edge function
CREATE OR REPLACE VIEW groups_with_stats AS
SELECT 
    g.*,
    COALESCE(AVG(r.rating), 0) as rating,
    COUNT(r.id) as review_count
FROM groups g
LEFT JOIN reviews r ON r.group_id = g.id
GROUP BY g.id;

-- 4. studios_with_stats: studios + average rating + review count
-- Used by: manage-listings edge function
CREATE OR REPLACE VIEW studios_with_stats AS
SELECT 
    s.*,
    COALESCE(AVG(r.rating), 0) as rating,
    COUNT(r.id) as review_count
FROM studios s
LEFT JOIN reviews r ON r.studio_id = s.id
GROUP BY s.id;

-- 5. gigs_with_stats: gigs + average rating + review count
-- Used by: manage-listings edge function
CREATE OR REPLACE VIEW gigs_with_stats AS
SELECT 
    g.*,
    COALESCE(AVG(r.rating), 0) as rating,
    COUNT(r.id) as review_count
FROM gigs g
LEFT JOIN reviews r ON r.gig_id = g.id
GROUP BY g.id;

-- 6. reviews_with_stats: reviews + likes count
-- Used by: manage-details edge function
-- NOTE: Creates review_likes table if it doesn't exist
CREATE TABLE IF NOT EXISTS review_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

CREATE OR REPLACE VIEW reviews_with_stats AS
SELECT 
    r.*,
    COALESCE((SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id), 0) as computed_likes_count
FROM reviews r;

-- ============================================================
-- DONE! All views have been created.
-- ============================================================
