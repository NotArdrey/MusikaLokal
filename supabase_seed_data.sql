-- ============================================================
-- SEED DATA FOR TESTING (Verified Users & Sample Content)
-- ============================================================
-- Run this in Supabase SQL Editor after schema is applied
-- NOTE: For auth.users, you need to create users via Dashboard 
-- or Auth API first, then run this to create matching profiles

-- ============================================================
-- OPTION 1: Create test users via Supabase Dashboard first
-- Then run this SQL to create their profiles
-- ============================================================

-- Test User 1: Musician (replace UUID with actual auth.users id)
-- Email: musician@test.com / Password: pass123
INSERT INTO profiles (id, email, full_name, role, bio, location, skills, genres, is_verified, verification_status)
VALUES (
    (SELECT id FROM auth.users WHERE email = 'musician@test.com' LIMIT 1),
    'musician@test.com',
    'Juan Dela Cruz',
    'musician',
    'Professional drummer with 10 years experience in rock and indie bands.',
    'Manila, Philippines',
    ARRAY['Drums', 'Percussion', 'Backing Vocals'],
    ARRAY['Rock', 'Indie', 'Alternative'],
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED';

-- Test User 2: Studio Owner
-- Email: studio@test.com / Password: pass123
INSERT INTO profiles (id, email, full_name, role, bio, location, is_verified, verification_status)
VALUES (
    (SELECT id FROM auth.users WHERE email = 'studio@test.com' LIMIT 1),
    'studio@test.com',
    'Maria Santos',
    'studio-owner',
    'Owner of Santos Recording Studio, serving artists since 2015.',
    'Quezon City, Philippines',
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED';

-- Test User 3: Manager/Venue Owner
-- Email: manager@test.com / Password: pass123
INSERT INTO profiles (id, email, full_name, role, bio, location, is_verified, verification_status)
VALUES (
    (SELECT id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1),
    'manager@test.com',
    'Pedro Reyes',
    'venue-owner',
    'Talent manager and event organizer specializing in indie rock acts.',
    'Makati, Philippines',
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED';

-- ============================================================
-- SAMPLE CONTENT (Groups, Studios, Gigs)
-- ============================================================

-- Sample Groups
INSERT INTO groups (id, owner_id, name, genre, description, location, images)
VALUES 
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'musician@test.com' LIMIT 1), 'The Manila Sound', 'Rock', 'High-energy rock band from Manila', 'Manila, Philippines', ARRAY['https://picsum.photos/400/300?random=1']),
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'musician@test.com' LIMIT 1), 'Indie Vibes', 'Indie', 'Chill indie folk duo', 'Quezon City, Philippines', ARRAY['https://picsum.photos/400/300?random=2'])
ON CONFLICT DO NOTHING;

-- Sample Studios
INSERT INTO studios (id, owner_id, name, address, hourly_rate, description, amenities, images)
VALUES 
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'studio@test.com' LIMIT 1), 'Santos Recording Studio', '123 Music Ave, Quezon City', 1500, 'Professional recording studio with state-of-the-art equipment', ARRAY['Air Conditioning', 'Drum Kit', 'Amplifiers', 'Mixing Console'], ARRAY['https://picsum.photos/400/300?random=3']),
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'studio@test.com' LIMIT 1), 'Pocket Studio QC', '456 Sound St, Quezon City', 800, 'Affordable rehearsal and recording space', ARRAY['Air Conditioning', 'Basic PA System'], ARRAY['https://picsum.photos/400/300?random=4'])
ON CONFLICT DO NOTHING;

-- Sample Gigs
INSERT INTO gigs (id, organizer_id, name, location, budget, description, event_date, status, images)
VALUES 
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1), 'Friday Night Live', 'Route 196, Katipunan', 15000, 'Looking for a rock band to headline our Friday night show', NOW() + INTERVAL '14 days', 'open', ARRAY['https://picsum.photos/400/300?random=5']),
    (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1), 'Acoustic Sunday', 'Coffee Project, BGC', 8000, 'Need an acoustic act for our Sunday brunch sessions', NOW() + INTERVAL '7 days', 'open', ARRAY['https://picsum.photos/400/300?random=6'])
ON CONFLICT DO NOTHING;

-- ============================================================
-- QUICK SETUP INSTRUCTIONS:
-- ============================================================
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add user" and create these test accounts:
--    - musician@test.com / pass123
--    - studio@test.com / pass123
--    - manager@test.com / pass123
-- 3. Copy each user's UUID from the dashboard
-- 4. Replace the placeholder UUIDs above with the real ones
-- 5. Run this SQL in Supabase SQL Editor
-- ============================================================
