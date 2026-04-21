-- Seed Data for MusikaLokal
-- Using a DO block to dynamically fetch existing users

-- 0. Create Test Users (if they don't exist)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0. Create Test Users (if they don't exist)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
DECLARE
    dummy_id UUID;
BEGIN
    -- 0. CLEANUP: Delete these users if they exist (to ensure we can recreate them with known IDs)
    -- This fixes the FK error if 'manager@test.com' exists with a different random UUID.
    DELETE FROM auth.identities WHERE user_id IN (
        '00000000-0000-0000-0000-000000000001', 
        '00000000-0000-0000-0000-000000000002', 
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004'
    );
    DELETE FROM auth.users WHERE email IN ('manager@test.com', 'musician@test.com', 'studio@test.com', 'producer@test.com');

    -- 1. Create Users (Now safe to insert with known IDs)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES 
        ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@test.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'musician@test.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
      ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'studio@test.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
      ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'producer@test.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"role":"producer"}', now(), now(), '', '', '', '');

    -- 2. Create Identities
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES 
        (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000001', 'manager@test.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000001', now(), now(), now()),
        (uuid_generate_v4(), '00000000-0000-0000-0000-000000000002', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000002', 'musician@test.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000002', now(), now(), now()),
      (uuid_generate_v4(), '00000000-0000-0000-0000-000000000003', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000003', 'studio@test.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000003', now(), now(), now()),
      (uuid_generate_v4(), '00000000-0000-0000-0000-000000000004', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000004', 'producer@test.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000004', now(), now(), now());

END $$;


DO $$
DECLARE
    user1_id UUID;
    user4_id UUID;
    user2_id UUID;
    user3_id UUID;
    group_ids UUID[];
    studio_ids UUID[];
    gig_ids UUID[];
    i INT;
    temp_id UUID;
BEGIN
    -- 1. Fetch 3 existing users (or creates placeholders if you run this in local dev with clear db)
    -- We assume users exist in auth.users. If not, this block handles it gracefully by checking.
    
    -- 1. Specific User Mapping
    -- User 1: Musician (musician@test.com)
    SELECT id INTO user1_id FROM auth.users WHERE email = 'musician@test.com' LIMIT 1;
    
    -- User 2: Studio Owner (studio@test.com)
    SELECT id INTO user2_id FROM auth.users WHERE email = 'studio@test.com' LIMIT 1;

    -- User 4: Producer (producer@test.com)
    SELECT id INTO user4_id FROM auth.users WHERE email = 'producer@test.com' LIMIT 1;
    
    -- User 3: Venue Owner / Manager (manager@test.com)
    SELECT id INTO user3_id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1;

    -- Fallbacks (if specific emails not found, use offsets)
    IF user1_id IS NULL THEN SELECT id INTO user1_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 0; END IF;
    IF user2_id IS NULL THEN SELECT id INTO user2_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 1; END IF;
    IF user3_id IS NULL THEN SELECT id INTO user3_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 2; END IF;
    IF user4_id IS NULL THEN SELECT id INTO user4_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 3; END IF;

    -- SELF-HEALING FALLBACK: If we still don't have 3 distinct users, reuse what we have.
    IF user1_id IS NOT NULL THEN
        IF user2_id IS NULL THEN user2_id := user1_id; END IF;
        IF user3_id IS NULL THEN user3_id := user1_id; END IF;
        IF user4_id IS NULL THEN user4_id := user1_id; END IF;
    END IF;

    -- Final Check
    IF user1_id IS NULL THEN
        RAISE NOTICE 'No users found in auth.users. Please sign up at least one user.';
        RETURN;
    END IF;

    RAISE NOTICE 'Seeding data for Users: % (Musician), % (Studio), % (Manager)', user1_id, user2_id, user3_id;

    -- 2. Create Profiles if they don't exist (Upsert)
    INSERT INTO public.profiles (id, email, full_name, role, location, avatar_url, verification_status)
    VALUES 
         (user1_id, 'musician@test.com', 'Gabriel dela Cruz', 'musician', 'Quezon City, Metro Manila', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&fit=crop', 'APPROVED'),
      (user4_id, 'producer@test.com', 'Paolo Ramirez', 'producer', 'Pasig City, Metro Manila', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&fit=crop', 'APPROVED'),
      (user2_id, 'studio@test.com', 'Studio Owner User', 'studio-owner', 'Makati City', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&fit=crop', 'APPROVED'),
         (user3_id, 'manager@test.com', 'Marco Reyes', 'venue-owner', 'Quezon City, Metro Manila', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&fit=crop', 'APPROVED')
    ON CONFLICT (id) DO UPDATE 
    SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, avatar_url = EXCLUDED.avatar_url, email = EXCLUDED.email, verification_status = EXCLUDED.verification_status;

    -- 3. Create Groups (Bands)
    -- Group 1
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
      'Amihan Sessions',
      'Indie Folk',
      'Quezon City indie folk band playing OPM favorites, weddings, campus fairs, and brand events with a full live setup.',
      'Quezon City, Metro Manila',
        ARRAY['https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800&fit=crop', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&fit=crop'],
      '["Gabriel", "Kyla", "Paolo", "Mika"]'::jsonb,
      18000,
        14.6760, 121.0437 -- Quezon City
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 2
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
      'Kundiman After Dark',
        'Jazz',
      'Jazz trio blending standards, bossa, and kundiman arrangements for hotel lounges and intimate receptions.',
      'Makati City, Metro Manila',
        ARRAY['https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800&fit=crop'],
      '["Lia", "Anton", "Miko"]'::jsonb,
      9000,
        14.5547, 121.0244 -- Makati
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 3
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
      'Silakbo Collective',
      'Alternative Rock',
      'Metro Manila alt-rock band with a tight OPM set, 90s throwbacks, and crowd-ready originals.',
      'Pasig City, Metro Manila',
        ARRAY['https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&fit=crop'],
      '["Ian", "Rafa", "Nico", "Theo"]'::jsonb,
      14000,
      14.5764, 121.0851 -- Pasig
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 4
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
      'Harana Duo',
      'Acoustic OPM',
      'Acoustic duo built for garden weddings, cafe nights, and private dinners with modern OPM arrangements.',
      'San Juan City, Metro Manila',
        ARRAY['https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&fit=crop'],
      '["Ella", "Migs"]'::jsonb,
      6500,
        14.6019, 121.0355 -- San Juan
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 5
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
      'Mayumi Midnight',
      'Synth Pop',
      'Synth-driven pop act from the south of Metro Manila mixing city-pop textures with Filipino hooks.',
      'Muntinlupa City, Metro Manila',
        ARRAY['https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&fit=crop'],
      '["Aya", "Gio"]'::jsonb,
      11000,
      14.4081, 121.0415 -- Muntinlupa
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);


    -- 4. Create Studio
    INSERT INTO public.studios (owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
    VALUES (
        user2_id,
      'OneRoots Records',
      'MacArthur Highway, Tabang, Ilang-ilang, Guiguinto, Bulacan, Philippines',
      1500,
      'Recording and music production studio in Guiguinto, Bulacan for solo artists, bands, and local releases.',
      ARRAY['Recording', 'Mixing', 'Music Production', 'Wi-Fi'],
        ARRAY['https://onerootsrecords.weebly.com/uploads/1/2/6/0/126010163/published/oneroots-logo-ping.png?1559873743'],
        14.8336802, 120.8656847
    ) RETURNING id INTO temp_id;
    studio_ids := array_append(studio_ids, temp_id);

    -- Create operating hours and settings for all studios
    FOR i IN 1..array_length(studio_ids, 1) LOOP
        -- Create default studio settings (30 min buffer, no modifiers)
        INSERT INTO public.studio_settings (studio_id, buffer_minutes, weekend_multiplier, bulk_discount_threshold_hours, bulk_discount_percentage)
        VALUES (studio_ids[i], 30, 1.0, 10, 0);

        -- Create operating hours (Mon-Sun, 9 AM - 10 PM)
        FOR temp_id IN 0..6 LOOP
            INSERT INTO public.studio_operating_hours (studio_id, day_of_week, is_open, open_time, close_time)
            VALUES (studio_ids[i], temp_id, true, '09:00', '22:00');
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Created operating hours and settings for % studios', array_length(studio_ids, 1);


    -- 5. Create Gigs
    -- Gig 1
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
      'Acoustic Nights at Jess & Pat''s',
      'Jess & Pat''s, Quezon City',
      5000,
      'Looking for acoustic solo acts or duos with a warm OPM-heavy set for an intimate Friday crowd.',
        NOW() + INTERVAL '7 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&fit=crop'],
      14.6500, 121.0490
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 2
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
      'Tagaytay Wedding Reception Band',
      'Tagaytay, Cavite',
      30000,
      'Need a polished full band for a wedding reception. Strong OPM, pop ballad, and sing-along repertoire required.',
        NOW() + INTERVAL '30 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1519750157634-b6d493a0f77c?w=800&fit=crop'],
        14.1153, 120.9621
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 3
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
      'Corporate Opening Set at SMX Manila',
      'SMX Convention Center Manila, Pasay',
      18000,
      'Looking for a high-energy opener for a brand launch at SMX. Clean stage look and a tight 30-minute set are required.',
        NOW() + INTERVAL '14 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=800&fit=crop'],
      14.5311, 120.9827
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 4
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
      'Friday OPM Set at 70''s Bistro',
      '70''s Bistro, Quezon City',
      7000,
      'Rock and alt-pop bands needed for a Friday night lineup with a crowd that knows the classics.',
        NOW() + INTERVAL '5 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1514525253440-b393452e8d26?w=800&fit=crop'],
      14.6348, 121.0387
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 5
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
      'Private Jazz Night in Forbes Park',
      'Forbes Park, Makati',
      12000,
      'Private birthday dinner in Makati. Jazz trio or classy lounge band preferred.',
        NOW() + INTERVAL '21 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&fit=crop'],
        14.5492, 121.0336
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);


    -- 6. Add Reviews (Mix and Match)
    -- Reviews for Group 1
    INSERT INTO public.reviews (author_id, group_id, rating, content) VALUES (user2_id, group_ids[1], 5, 'Best band we have worked with!');
    INSERT INTO public.reviews (author_id, group_id, rating, content) VALUES (user3_id, group_ids[1], 4, 'Great energy, crowd loved them.');

    -- Reviews for Studio 1
    INSERT INTO public.reviews (author_id, studio_id, rating, content) VALUES (user1_id, studio_ids[1], 5, 'Top notch equipment.');
    INSERT INTO public.reviews (author_id, studio_id, rating, content) VALUES (user3_id, studio_ids[1], 4, 'Good acoustics.');

    -- Reviews for Gig 1
    INSERT INTO public.reviews (author_id, gig_id, rating, content) VALUES (user1_id, gig_ids[1], 5, 'Great venue owner, clear instructions.');

    -- Random extra reviews
    INSERT INTO public.reviews (author_id, studio_id, rating, content) VALUES (user1_id, studio_ids[2], 3, 'Decent for the price.');
    INSERT INTO public.reviews (author_id, group_id, rating, content) VALUES (user2_id, group_ids[2], 5, 'Classy jazz trio.');
    INSERT INTO public.reviews (author_id, gig_id, rating, content) VALUES (user1_id, gig_ids[2], 4, 'Fun gig, paid on time.');


    RAISE NOTICE 'Seeding Complete with MANY items!';
END $$;


UPDATE public.profiles 
SET is_verified = true 
WHERE email IN ('manager@test.com', 'musician@test.com', 'studio@test.com', 'producer@test.com');






-- ============================================================
-- IMPORTANT: Replace these UUIDs with actual IDs from your Supabase Dashboard
-- Go to: Authentication > Users and copy the exact User UID
-- ============================================================

-- Test User 1: Musician
-- Email: musician@test.com / Password: pass123
-- User ID from your dashboard: 14d2e916-8d1c-4c04-9877-7ccd9bea6149
INSERT INTO profiles (id, email, full_name, role, bio, location, skills, genres, is_verified, verification_status)
VALUES (
    '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
    'musician@test.com',
  'Gabriel dela Cruz',
    'musician',
  'Quezon City session musician with years of live and studio work across indie folk, alt-rock, and OPM gigs.',
  'Quezon City, Metro Manila, Philippines',
  ARRAY['Drums', 'Percussion', 'Backing Vocals'],
  ARRAY['Indie Folk', 'Alternative Rock', 'OPM'],
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED',
    role = 'musician',
  full_name = 'Gabriel dela Cruz';

-- Test User 2: Studio Owner
-- Email: studio@test.com / Password: pass123
-- User ID from your dashboard: 00000000-0000-0000-0000-000000000003
INSERT INTO profiles (id, email, full_name, role, bio, location, is_verified, verification_status)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'studio@test.com',
  'Maria Santos',
    'studio-owner',
  'Independent recording and music production studio operating under the OneRoots Records banner in Bulacan.',
  'Quezon City, Philippines',
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED',
    role = 'studio-owner',
  full_name = 'Maria Santos';

-- Test User 4: Producer
-- Email: producer@test.com / Password: pass123
-- User ID from your dashboard: 00000000-0000-0000-0000-000000000004
INSERT INTO profiles (id, email, full_name, role, bio, location, skills, genres, is_verified, verification_status)
VALUES (
    '00000000-0000-0000-0000-000000000004',
    'producer@test.com',
  'Paolo Ramirez',
    'producer',
  'Live event producer coordinating venue partnerships, stage logistics, and commercial show planning across Metro Manila.',
  'Pasig City, Metro Manila, Philippines',
  ARRAY['Event Production', 'Show Calling', 'Talent Coordination'],
  ARRAY['OPM', 'Pop', 'Live Events'],
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED',
    role = 'producer',
  full_name = 'Paolo Ramirez';

-- Test User 3: Manager/Venue Owner
-- Email: manager@test.com / Password: pass123
-- User ID from your dashboard: 00000000-0000-0000-0000-000000000001
INSERT INTO profiles (id, email, full_name, role, bio, location, is_verified, verification_status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'manager@test.com',
  'Marco Reyes',
    'venue-owner',
  'Venue booker and event organizer focused on OPM nights, private functions, and branded live events.',
  'Quezon City, Metro Manila, Philippines',
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED',
    role = 'venue-owner',
  full_name = 'Marco Reyes';

-- ============================================================
-- SAMPLE CONTENT (Groups, Studios, Gigs)
-- ============================================================

-- Sample Groups (owned by musician)
INSERT INTO groups (id, owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
VALUES 
  (uuid_generate_v4(), '14d2e916-8d1c-4c04-9877-7ccd9bea6149', 'Amihan Sessions', 'Indie Folk', 'Quezon City indie folk band with a polished OPM live set for weddings, campus fairs, and private events.', 'Quezon City, Philippines', ARRAY['https://picsum.photos/400/300?random=1'], '["Gabriel", "Kyla", "Paolo", "Mika"]'::jsonb, 18000, 14.6760, 121.0437),
  (uuid_generate_v4(), '14d2e916-8d1c-4c04-9877-7ccd9bea6149', 'Harana Duo', 'Acoustic OPM', 'Acoustic duo for cafe nights, proposals, and intimate receptions around Metro Manila.', 'San Juan City, Philippines', ARRAY['https://picsum.photos/400/300?random=2'], '["Ella", "Migs"]'::jsonb, 6500, 14.6019, 121.0355)
ON CONFLICT DO NOTHING;

-- Sample Studio (owned by studio owner)
INSERT INTO studios (id, owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
VALUES 
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000003', 'OneRoots Records', 'MacArthur Highway, Tabang, Ilang-ilang, Guiguinto, Bulacan, Philippines', 1500, 'Recording and music production studio in Guiguinto, Bulacan for solo artists, bands, and local releases.', ARRAY['Recording', 'Mixing', 'Music Production', 'Wi-Fi'], ARRAY['https://onerootsrecords.weebly.com/uploads/1/2/6/0/126010163/published/oneroots-logo-ping.png?1559873743'], 14.8336802, 120.8656847)
ON CONFLICT DO NOTHING;

-- Sample Gigs (organized by venue owner/manager)
INSERT INTO gigs (id, organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
VALUES 
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Friday OPM Set at 70''s Bistro', '70''s Bistro, Quezon City', 7000, 'Looking for a rock or alt-pop act to anchor a Friday night OPM lineup.', NOW() + INTERVAL '14 days', 'open', ARRAY['https://picsum.photos/400/300?random=5'], 14.6348, 121.0387),
  (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Acoustic Nights at Jess & Pat''s', 'Jess & Pat''s, Quezon City', 5000, 'Need an acoustic act for an intimate Friday set with a warm OPM-heavy repertoire.', NOW() + INTERVAL '7 days', 'open', ARRAY['https://picsum.photos/400/300?random=6'], 14.6500, 121.0490)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAMPLE BOOKINGS & APPLICATIONS
-- ============================================================

-- Sample Studio Bookings (Musician booked studios)
-- Schema requires: base_rate, hours, subtotal, modifiers_applied, final_price
INSERT INTO studio_bookings (id, user_id, studio_id, booking_date, start_time, end_time, base_rate, hours, subtotal, modifiers_applied, final_price, status, notes, buffer_minutes)
VALUES 
    (
        uuid_generate_v4(), 
        '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
        (SELECT id FROM studios WHERE name = 'OneRoots Records' LIMIT 1),
        NOW() + INTERVAL '3 days',
        '14:00:00',
        '18:00:00',
        1500,
        4,
        6000,
        '{}'::jsonb,
        6000,
        'confirmed',
        'Need to record drum tracks for new album',
        30
    ),
    (
        uuid_generate_v4(), 
        '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
        (SELECT id FROM studios WHERE owner_id = '00000000-0000-0000-0000-000000000003' ORDER BY created_at DESC LIMIT 1),
        NOW() + INTERVAL '7 days',
        '10:00:00',
        '14:00:00',
        800,
        4,
        3200,
        '{}'::jsonb,
        3200,
        'pending',
        'Band rehearsal session',
        30
    ),
    (
        uuid_generate_v4(), 
        '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
        (SELECT id FROM studios WHERE owner_id = '00000000-0000-0000-0000-000000000003' LIMIT 1),
        NOW() - INTERVAL '2 days',
        '15:00:00',
        '19:00:00',
        1500,
        4,
        6000,
        '{}'::jsonb,
        6000,
        'completed',
        'Practice for upcoming gig',
        30
    )
ON CONFLICT DO NOTHING;

-- Sample Gig Applications (Musician's groups applied to gigs)
INSERT INTO gig_applications (id, applicant_id, group_id, gig_id, status, pitch_message)
VALUES 
    (
        uuid_generate_v4(),
        '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
        (SELECT id FROM groups WHERE owner_id = '14d2e916-8d1c-4c04-9877-7ccd9bea6149' LIMIT 1),
        (SELECT id FROM gigs WHERE organizer_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
        'pending',
        'Amihan Sessions would love to headline your Friday OPM set. We can bring a crowd-friendly mix of originals and familiar OPM favorites.'
    ),
    (
        uuid_generate_v4(),
        '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
        (SELECT id FROM groups WHERE owner_id = '14d2e916-8d1c-4c04-9877-7ccd9bea6149' ORDER BY created_at DESC LIMIT 1),
        (SELECT id FROM gigs WHERE organizer_id = '00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT 1),
        'accepted',
        'Harana Duo is a great fit for your intimate acoustic night. We can bring our own DI boxes and keep the set warm and conversational.'
    )
ON CONFLICT DO NOTHING;

-- ============================================================
-- QUICK SETUP INSTRUCTIONS:
-- ============================================================
-- 1. Go to Supabase Dashboard > Authentication > Users
-- 2. Click "Add user" and create these test accounts:
--    - musician@test.com / pass123
--    - producer@test.com / pass123
--    - studio@test.com / pass123
--    - manager@test.com / pass123
-- 3. Copy each user's UUID from the dashboard
-- 4. Replace the placeholder UUIDs above with the real ones
-- 5. Run this SQL in Supabase SQL Editor
-- ============================================================
-- FIX SCRIPT: Dynamic Ownership Assignment
-- usage: Run this in Supabase SQL Editor to link existing data to your actual users.

DO $$
DECLARE
    -- Variable to hold the actual User IDs found in auth.users
    v_studio_owner_id UUID;
    v_musician_id UUID;
    v_manager_id UUID;
BEGIN
    -- 1. GET ACTUAL USER IDs (based on email)
    SELECT id INTO v_studio_owner_id FROM auth.users WHERE email = 'studio@test.com' LIMIT 1;
    SELECT id INTO v_musician_id FROM auth.users WHERE email = 'musician@test.com' LIMIT 1;
    
    SELECT id INTO v_manager_id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1;

    -- 2. UPDATE PROFILES (Ensure they have the correct ROLE)
    -- Studio Owner
    IF v_studio_owner_id IS NOT NULL THEN
        RAISE NOTICE 'Found Studio Owner: %', v_studio_owner_id;
        INSERT INTO public.profiles (id, email, full_name, role, verification_status)
        VALUES (v_studio_owner_id, 'studio@test.com', 'Maria Santos', 'studio-owner', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET role = 'studio-owner'; -- Enforce role
        
        -- Link All Studios (that were likely created by the seed)
        -- We'll assume ANY studio named like 'Santos%' or generic ones belong to them, 
        -- OR update ALL studios that currently don't have a valid owner (optional).
        -- Strategies:
        -- A. Update specific named studios from seed
        UPDATE public.studios 
        SET owner_id = v_studio_owner_id 
        WHERE name IN ('OneRoots Records') 
           OR owner_id = '00000000-0000-0000-0000-000000000003'; -- Catch the dummy ID
    ELSE
        RAISE NOTICE 'WARNING: studio@test.com not found';
    END IF;

    -- Musician
    IF v_musician_id IS NOT NULL THEN
        RAISE NOTICE 'Found Musician: %', v_musician_id;
        INSERT INTO public.profiles (id, email, full_name, role, verification_status)
      VALUES (v_musician_id, 'musician@test.com', 'Gabriel dela Cruz', 'musician', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET role = 'musician';

        -- Link Groups
        UPDATE public.groups 
        SET owner_id = v_musician_id 
        WHERE name IN ('The Manila Sound', 'Indie Vibes', 'The Neon Lights', 'Midnight Jazz Trio', 'Sonic Boom', 'Acoustic Soul', 'Electric Dreams', 'Amihan Sessions', 'Kundiman After Dark', 'Silakbo Collective', 'Harana Duo', 'Mayumi Midnight')
           OR owner_id = '00000000-0000-0000-0000-000000000002'
           OR owner_id = '14d2e916-8d1c-4c04-9877-7ccd9bea6149'; -- Catch the other dummy ID
    ELSE
        RAISE NOTICE 'WARNING: musician@test.com not found';
    END IF;

    -- Venue Owner
    IF v_manager_id IS NOT NULL THEN
        RAISE NOTICE 'Found Manager: %', v_manager_id;
        INSERT INTO public.profiles (id, email, full_name, role, verification_status)
      VALUES (v_manager_id, 'manager@test.com', 'Marco Reyes', 'venue-owner', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET role = 'venue-owner';

        -- Link Gigs
        UPDATE public.gigs 
        SET organizer_id = v_manager_id 
        WHERE name IN ('Friday Night Live', 'Acoustic Sunday', 'Acoustic Nights at The Hive', 'Wedding Reception Band', 'Corporate Event Opener', 'Bar gig: Friday Night', 'Private Party', 'Acoustic Nights at Jess & Pat''s', 'Tagaytay Wedding Reception Band', 'Corporate Opening Set at SMX Manila', 'Friday OPM Set at 70''s Bistro', 'Private Jazz Night in Forbes Park')
           OR organizer_id = '00000000-0000-0000-0000-000000000001';
    ELSE
        RAISE NOTICE 'WARNING: manager@test.com not found';
    END IF;

END $$;





-- Seed Ongoing Bookings for Testing
-- Creates multiple confirmed bookings at different studios that can be checked in via QR scan

DO $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_studio_ids UUID[];
  v_studio_id UUID;
  v_rate NUMERIC;
BEGIN
  -- 1. Get the Musician ID (musician@test.com)
  SELECT id INTO v_user_id FROM profiles WHERE email = 'musician@test.com';
  
  -- 2. Get the Studio Owner ID (studio@test.com)
  SELECT id INTO v_owner_id FROM profiles WHERE email = 'studio@test.com';
  
  -- 3. Get ALL studios owned by studio@test.com
  SELECT ARRAY_AGG(id) INTO v_studio_ids FROM studios WHERE owner_id = v_owner_id;

  -- Validation
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User musician@test.com not found. Skipping data.';
    RETURN;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'User studio@test.com not found. Skipping data.';
    RETURN;
  END IF;

  IF v_studio_ids IS NULL OR array_length(v_studio_ids, 1) = 0 THEN
    RAISE NOTICE 'No studios found for studio@test.com. Create studios first!';
    RETURN;
  END IF;

  RAISE NOTICE 'Found Users: Musician=%, StudioOwner=%, Studios=%', v_user_id, v_owner_id, array_length(v_studio_ids, 1);

  -- ==========================================
  -- COMPREHENSIVE CLEANUP
  -- ==========================================
  
  -- Remove ALL existing bookings for the test musician
  
  -- Seed Ongoing Bookings for Testing
-- Creates multiple confirmed bookings at different studios that can be checked in via QR scan

-- Seed Ongoing Bookings for Testing
-- Creates multiple confirmed bookings at different studios that can be checked in via QR scan
-- Seed Ongoing Bookings for Testing
-- Creates multiple confirmed bookings at different studios that can be checked in via QR scan

DO $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_studio_ids UUID[];
  v_studio_id UUID;
  v_rate NUMERIC;
BEGIN
  -- 1. Get the Musician ID (musician@test.com)
  SELECT id INTO v_user_id FROM profiles WHERE email = 'musician@test.com';
  
  -- 2. Get the Studio Owner ID (studio@test.com)
  SELECT id INTO v_owner_id FROM profiles WHERE email = 'studio@test.com';
  
  -- 3. Get ALL studios owned by studio@test.com
  SELECT ARRAY_AGG(id) INTO v_studio_ids FROM studios WHERE owner_id = v_owner_id;

  -- Validation
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User musician@test.com not found. Skipping data.';
    RETURN;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'User studio@test.com not found. Skipping data.';
    RETURN;
  END IF;

  IF v_studio_ids IS NULL OR array_length(v_studio_ids, 1) = 0 THEN
    RAISE NOTICE 'No studios found for studio@test.com. Create studios first!';
    RETURN;
  END IF;

  RAISE NOTICE 'Found Users: Musician=%, StudioOwner=%, Studios=%', v_user_id, v_owner_id, array_length(v_studio_ids, 1);

  -- ==========================================
  -- COMPREHENSIVE CLEANUP
  -- ==========================================
  
  RAISE NOTICE 'Starting cleanup...';
  
  -- Remove ALL existing reviews by/for the test musician
  DELETE FROM reviews 
  WHERE author_id = v_user_id OR user_id = v_user_id;
  
  -- Remove ALL existing gig applications for the test musician
  DELETE FROM gig_applications 
  WHERE applicant_id = v_user_id;
  
  -- Remove ALL existing bookings for the test musician
  DELETE FROM studio_bookings 
  WHERE user_id = v_user_id;
  
  RAISE NOTICE 'Cleanup complete: Removed all bookings, gig applications, and reviews for musician@test.com';

  -- ==========================================
  -- CREATE BOOKINGS AT DIFFERENT STUDIOS
  -- ==========================================
  
  -- Booking 1: Ongoing Rehearsal at Studio 1 (Started 1 hour ago, ends in 2 hours)
  v_studio_id := v_studio_ids[1];
  SELECT hourly_rate INTO v_rate FROM studios WHERE id = v_studio_id;
  
  INSERT INTO studio_bookings (
    studio_id, user_id, booking_date, start_time, end_time, 
    base_rate, hours, subtotal, final_price, status, check_in_time, notes
  ) VALUES (
    v_studio_id, v_user_id, CURRENT_DATE, 
    (NOW() - INTERVAL '1 hour')::TIME, (NOW() + INTERVAL '2 hours')::TIME,
    v_rate, 3, v_rate * 3, v_rate * 3, 'confirmed', NULL,
    'Rehearsal session - Ready to scan QR code'
  );
  RAISE NOTICE 'Created booking at studio 1 (Ongoing - 1hr ago to +2hrs)';

  -- Booking 2: Just Started at Studio 2 (Started 10 mins ago, ends in 50 mins) - IF exists
  IF array_length(v_studio_ids, 1) >= 2 THEN
    v_studio_id := v_studio_ids[2];
    SELECT hourly_rate INTO v_rate FROM studios WHERE id = v_studio_id;
    
    INSERT INTO studio_bookings (
      studio_id, user_id, booking_date, start_time, end_time, 
      base_rate, hours, subtotal, final_price, status, check_in_time, notes
    ) VALUES (
      v_studio_id, v_user_id, CURRENT_DATE, 
      (NOW() - INTERVAL '10 minutes')::TIME, (NOW() + INTERVAL '50 minutes')::TIME,
      v_rate, 1, v_rate * 1, v_rate * 1, 'confirmed', NULL,
      'Recording session - Just started'
    );
    RAISE NOTICE 'Created booking at studio 2 (Just Started - 10min ago to +50min)';
  END IF;

  -- Booking 3: Ongoing Recording at Studio 3 (Started 2 hours ago, ends in 2 hours) - IF exists
  IF array_length(v_studio_ids, 1) >= 3 THEN
    v_studio_id := v_studio_ids[3];
    SELECT hourly_rate INTO v_rate FROM studios WHERE id = v_studio_id;
    
    INSERT INTO studio_bookings (
      studio_id, user_id, booking_date, start_time, end_time, 
      base_rate, hours, subtotal, final_price, status, check_in_time, notes
    ) VALUES (
      v_studio_id, v_user_id, CURRENT_DATE, 
      (NOW() - INTERVAL '2 hours')::TIME, (NOW() + INTERVAL '2 hours')::TIME,
      v_rate, 4, v_rate * 4, v_rate * 4, 'confirmed', NULL,
      'Production session - Mid-way through'
    );
    RAISE NOTICE 'Created booking at studio 3 (Ongoing - 2hr ago to +2hrs)';
  ELSE
    -- If only 1-2 studios, create at studio 1 with different time
    v_studio_id := v_studio_ids[1];
    SELECT hourly_rate INTO v_rate FROM studios WHERE id = v_studio_id;
    
    INSERT INTO studio_bookings (
      studio_id, user_id, booking_date, start_time, end_time, 
      base_rate, hours, subtotal, final_price, status, check_in_time, notes
    ) VALUES (
      v_studio_id, v_user_id, CURRENT_DATE, 
      (NOW() - INTERVAL '2 hours')::TIME, (NOW() + INTERVAL '2 hours')::TIME,
      v_rate, 4, v_rate * 4, v_rate * 4, 'confirmed', NULL,
      'Production session - Mid-way through'
    );
    RAISE NOTICE 'Created booking at studio 1 (alternate slot)';
  END IF;

  -- Booking 4: Wrapping Up at Studio 4 OR Studio 2 (Started 3 hours ago, ends in 10 minutes)
  IF array_length(v_studio_ids, 1) >= 4 THEN
    v_studio_id := v_studio_ids[4];
  ELSIF array_length(v_studio_ids, 1) >= 2 THEN
    v_studio_id := v_studio_ids[2];
  ELSE
    v_studio_id := v_studio_ids[1];
  END IF;
  
  SELECT hourly_rate INTO v_rate FROM studios WHERE id = v_studio_id;
  
  INSERT INTO studio_bookings (
    studio_id, user_id, booking_date, start_time, end_time, 
    base_rate, hours, subtotal, final_price, status, check_in_time, notes
  ) VALUES (
    v_studio_id, v_user_id, CURRENT_DATE, 
    (NOW() - INTERVAL '3 hours')::TIME, (NOW() + INTERVAL '10 minutes')::TIME,
    v_rate, 3, v_rate * 3, v_rate * 3, 'confirmed', NULL,
    'Mixing session - Almost done'
  );
  RAISE NOTICE 'Created booking at studio (Wrapping Up - 3hr ago to +10min)';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'SUCCESS: Inserted 4 dummy CONFIRMED bookings across % studio(s)', array_length(v_studio_ids, 1);
  RAISE NOTICE 'These bookings can now be scanned with QR code to check in!';
  RAISE NOTICE '========================================';
END $$;
