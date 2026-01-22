-- ============================================================
-- NORMALIZED DATABASE SCHEMA (3NF) for MusikaLokal
-- ============================================================
-- Changes from previous schema:
-- 1. REMOVED: pending_signups table (redundant - use Supabase auth flow)
-- 2. REMOVED: Derived columns (rating, review_count, likes_count, duration_hours, total_cost)
-- 3. ADDED: Views to calculate derived values on-the-fly
-- 4. ADDED: Functions for computed fields
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (public user data, linked to auth.users)
-- ============================================================
-- REMOVED: rating, review_count (derived from reviews table)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT CHECK (role IN ('manager', 'musician-member', 'studio-owner', 'venue-owner')),
  bio TEXT,
  location TEXT,
  skills TEXT[], -- Array of instruments/roles (Drummer, Vocalist, etc.)
  genres TEXT[], -- Array of music genres (Rock, Indie, etc.)
  portfolio_urls TEXT[],
  is_verified BOOLEAN DEFAULT FALSE,
  id_document_expiry DATE,
  id_verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 2. GROUPS (Bands/Artists)
-- ============================================================
-- REMOVED: rating, review_count (derived from reviews table)
CREATE TABLE groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  genre TEXT,
  description TEXT,
  members JSONB, -- Array of member names or details
  location TEXT,
  images TEXT[], -- Array of image URLs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 3. STUDIOS
-- ============================================================
-- REMOVED: rating, review_count (derived from reviews table)
CREATE TABLE studios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  hourly_rate NUMERIC,
  description TEXT,
  amenities TEXT[], -- Array of amenities
  images TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 4. GIGS
-- ============================================================
CREATE TABLE gigs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  budget NUMERIC,
  description TEXT,
  event_date TIMESTAMP WITH TIME ZONE,
  requirements JSONB, -- JSON object for specific filters
  images TEXT[], -- Gallery images
  documents TEXT[], -- Contract, Rider documents
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 5. REVIEWS (Polymorphic-style via nullable FKs)
-- ============================================================
-- REMOVED: likes_count (derived from review_likes table)
CREATE TABLE reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- Target Entities (Only one should be set)
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  studio_id UUID REFERENCES studios(id) ON DELETE CASCADE,
  gig_id UUID REFERENCES gigs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- For reviewing users directly
  
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  
  CONSTRAINT one_target_only CHECK (
    (group_id IS NOT NULL)::INT +
    (studio_id IS NOT NULL)::INT +
    (gig_id IS NOT NULL)::INT +
    (user_id IS NOT NULL)::INT = 1
  )
);

-- ============================================================
-- 6. FAVORITES (Likes/Bookmarks for Pages)
-- ============================================================
CREATE TABLE favorites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  studio_id UUID REFERENCES studios(id) ON DELETE CASCADE,
  gig_id UUID REFERENCES gigs(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  
  CONSTRAINT fav_one_target CHECK (
    (group_id IS NOT NULL)::INT +
    (studio_id IS NOT NULL)::INT +
    (gig_id IS NOT NULL)::INT = 1
  )
);

-- ============================================================
-- 7. REVIEW LIKES (Hearting a review)
-- ============================================================
CREATE TABLE review_likes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE(user_id, review_id)
);

-- ============================================================
-- 8. REVIEW COMMENTS (Replying to a review)
-- ============================================================
CREATE TABLE review_comments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  review_id UUID REFERENCES reviews(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 9. REPORTS
-- ============================================================
CREATE TABLE reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL, -- 'group', 'studio', 'gig', 'user'
  target_id UUID NOT NULL, -- ID of the reported entity
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 10. STUDIO BOOKINGS
-- ============================================================
-- REMOVED: duration_hours, total_cost (can be calculated)
-- These are computed in views/functions from start_time, end_time, and studios.hourly_rate
CREATE TABLE studio_bookings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  studio_id UUID REFERENCES studios(id) ON DELETE CASCADE NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 11. GIG APPLICATIONS
-- ============================================================
CREATE TABLE gig_applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  applicant_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE, -- If applying as a group
  gig_id UUID REFERENCES gigs(id) ON DELETE CASCADE NOT NULL,
  pitch_message TEXT,
  video_url TEXT, -- Demo video link
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- 12. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('success', 'info', 'warning', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  image TEXT, 
  meta JSONB, 
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- ============================================================
-- VIEWS FOR COMPUTED/DERIVED VALUES (3NF Compliant)
-- ============================================================

-- View: Profile with computed rating and review count
CREATE OR REPLACE VIEW profiles_with_stats AS
SELECT 
  p.*,
  COALESCE(AVG(r.rating), 0) AS rating,
  COUNT(r.id) AS review_count
FROM profiles p
LEFT JOIN reviews r ON r.user_id = p.id
GROUP BY p.id;

-- View: Groups with computed rating and review count
CREATE OR REPLACE VIEW groups_with_stats AS
SELECT 
  g.*,
  COALESCE(AVG(r.rating), 0) AS rating,
  COUNT(r.id) AS review_count
FROM groups g
LEFT JOIN reviews r ON r.group_id = g.id
GROUP BY g.id;

-- View: Studios with computed rating and review count
CREATE OR REPLACE VIEW studios_with_stats AS
SELECT 
  s.*,
  COALESCE(AVG(r.rating), 0) AS rating,
  COUNT(r.id) AS review_count
FROM studios s
LEFT JOIN reviews r ON r.studio_id = s.id
GROUP BY s.id;

-- View: Gigs with computed rating and review count
CREATE OR REPLACE VIEW gigs_with_stats AS
SELECT 
  g.*,
  COALESCE(AVG(r.rating), 0) AS rating,
  COUNT(r.id) AS review_count
FROM gigs g
LEFT JOIN reviews r ON r.gig_id = g.id
GROUP BY g.id;

-- View: Reviews with computed likes count
CREATE OR REPLACE VIEW reviews_with_stats AS
SELECT 
  r.*,
  COUNT(rl.id) AS likes_count
FROM reviews r
LEFT JOIN review_likes rl ON rl.review_id = r.id
GROUP BY r.id;

-- View: Studio bookings with computed duration and cost
CREATE OR REPLACE VIEW studio_bookings_with_cost AS
SELECT 
  sb.*,
  EXTRACT(EPOCH FROM (sb.end_time - sb.start_time)) / 3600 AS duration_hours,
  (EXTRACT(EPOCH FROM (sb.end_time - sb.start_time)) / 3600) * s.hourly_rate AS total_cost,
  s.name AS studio_name,
  s.images AS studio_images
FROM studio_bookings sb
JOIN studios s ON s.id = sb.studio_id;

-- ============================================================
-- FUNCTIONS FOR COMPUTED VALUES
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
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gig_applications ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Groups Policies
CREATE POLICY "Groups are viewable by everyone"
  ON groups FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can create groups"
  ON groups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their groups"
  ON groups FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their groups"
  ON groups FOR DELETE
  USING (auth.uid() = owner_id);

-- Studios Policies
CREATE POLICY "Studios are viewable by everyone"
  ON studios FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can create studios"
  ON studios FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their studios"
  ON studios FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their studios"
  ON studios FOR DELETE
  USING (auth.uid() = owner_id);

-- Gigs Policies
CREATE POLICY "Gigs are viewable by everyone"
  ON gigs FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can create gigs"
  ON gigs FOR INSERT
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizers can update their gigs"
  ON gigs FOR UPDATE
  USING (auth.uid() = organizer_id);

CREATE POLICY "Organizers can delete their gigs"
  ON gigs FOR DELETE
  USING (auth.uid() = organizer_id);

-- Reviews Policies
CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their reviews"
  ON reviews FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their reviews"
  ON reviews FOR DELETE
  USING (auth.uid() = author_id);

-- Favorites Policies
CREATE POLICY "Users can view own favorites"
  ON favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own favorites"
  ON favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own favorites"
  ON favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Reports Policies
CREATE POLICY "Users can insert reports"
  ON reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

-- Review Likes Policies
CREATE POLICY "Review likes are public"
  ON review_likes FOR SELECT TO public
  USING (TRUE);

CREATE POLICY "Users can toggle review likes"
  ON review_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove review likes"
  ON review_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Review Comments Policies
CREATE POLICY "Review comments are public"
  ON review_comments FOR SELECT TO public
  USING (TRUE);

CREATE POLICY "Users can post review comments"
  ON review_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Notifications Policies
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Studio Bookings Policies
CREATE POLICY "Users can view own bookings"
  ON studio_bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookings"
  ON studio_bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own bookings"
  ON studio_bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Gig Applications Policies
CREATE POLICY "Applicants can view own applications"
  ON gig_applications FOR SELECT TO authenticated
  USING (auth.uid() = applicant_id);

CREATE POLICY "Users can create applications"
  ON gig_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "Applicants can update own applications"
  ON gig_applications FOR UPDATE TO authenticated
  USING (auth.uid() = applicant_id);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('portfolio', 'portfolio', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('listings', 'listings', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Avatars are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload portfolio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'portfolio' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Portfolio is publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'portfolio');

CREATE POLICY "Users can upload listings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'listings');

CREATE POLICY "Listings are publicly viewable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'listings');

-- ============================================================
-- INDEXES FOR PERFORMANCE
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
