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
        '00000000-0000-0000-0000-000000000003'
    );
    DELETE FROM auth.users WHERE email IN ('manager@test.com', 'musician@tet.com', 'studio@test.com');

    -- 1. Create Users (Now safe to insert with known IDs)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES 
        ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@test.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'musician@tet.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
        ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'studio@test.com', crypt('pass123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

    -- 2. Create Identities
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES 
        (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000001', 'manager@test.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000001', now(), now(), now()),
        (uuid_generate_v4(), '00000000-0000-0000-0000-000000000002', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000002', 'musician@tet.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000002', now(), now(), now()),
        (uuid_generate_v4(), '00000000-0000-0000-0000-000000000003', format('{"sub":"%s","email":"%s"}', '00000000-0000-0000-0000-000000000003', 'studio@test.com')::jsonb, 'email', '00000000-0000-0000-0000-000000000003', now(), now(), now());

END $$;


DO $$
DECLARE
    user1_id UUID;
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
    -- User 1: Musician (musician@tet.com)
    SELECT id INTO user1_id FROM auth.users WHERE email = 'musician@tet.com' LIMIT 1;
    
    -- User 2: Studio Owner (studio@test.com)
    SELECT id INTO user2_id FROM auth.users WHERE email = 'studio@test.com' LIMIT 1;
    
    -- User 3: Venue Owner / Manager (manager@test.com)
    SELECT id INTO user3_id FROM auth.users WHERE email = 'manager@test.com' LIMIT 1;

    -- Fallbacks (if specific emails not found, use offsets)
    IF user1_id IS NULL THEN SELECT id INTO user1_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 0; END IF;
    IF user2_id IS NULL THEN SELECT id INTO user2_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 1; END IF;
    IF user3_id IS NULL THEN SELECT id INTO user3_id FROM auth.users ORDER BY created_at ASC LIMIT 1 OFFSET 2; END IF;

    -- SELF-HEALING FALLBACK: If we still don't have 3 distinct users, reuse what we have.
    IF user1_id IS NOT NULL THEN
        IF user2_id IS NULL THEN user2_id := user1_id; END IF;
        IF user3_id IS NULL THEN user3_id := user1_id; END IF;
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
        (user1_id, 'musician@tet.com', 'Musician User', 'musician', 'Quezon City', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&fit=crop', 'APPROVED'),
        (user2_id, 'studio@test.com', 'Studio Owner User', 'studio-owner', 'Makati City', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&fit=crop', 'APPROVED'),
        (user3_id, 'manager@test.com', 'Venue Owner', 'venue-owner', 'BGC, Taguig', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&fit=crop', 'APPROVED')
    ON CONFLICT (id) DO UPDATE 
    SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, avatar_url = EXCLUDED.avatar_url, email = EXCLUDED.email, verification_status = EXCLUDED.verification_status;

    -- 3. Create Groups (Bands)
    -- Group 1
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
        'The Neon Lights',
        'Indie Pop',
        'High-energy indie pop band available for weddings, corporate events, and parties. We bring the vibes and get everyone on the dance floor!',
        'Quezon City',
        ARRAY['https://images.unsplash.com/photo-1493225255756-d9584f8606e9?w=800&fit=crop', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&fit=crop'],
        '["Marc", "Buddy", "Ely", "Raymund"]'::jsonb,
        15000,
        14.6760, 121.0437 -- Quezon City
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 2
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
        'Midnight Jazz Trio',
        'Jazz',
        'Sophisticated jazz standards for cocktail hours and upscale events.',
        'Makati City',
        ARRAY['https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800&fit=crop'],
        '["Sax", "Keys", "Bass"]'::jsonb,
        8000,
        14.5547, 121.0244 -- Makati
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 3
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
        'Sonic Boom',
        'Rock',
        'Alternative rock band playing 90s hits and originals.',
        'Mandaluyong',
        ARRAY['https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&fit=crop'],
        '["Lead", "Rhythm", "Bass", "Drums"]'::jsonb,
        12000,
        14.5794, 121.0359 -- Mandaluyong
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 4
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
        'Acoustic Soul',
        'Acoustic',
        'Soulful acoustic duo perfect for intimate gatherings.',
        'San Juan',
        ARRAY['https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&fit=crop'],
        '["Vocals", "Guitar"]'::jsonb,
        5000,
        14.6019, 121.0355 -- San Juan
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);

    -- Group 5
    INSERT INTO public.groups (owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
    VALUES (
        user1_id,
        'Electric Dreams',
        'Synthwave',
        'Retro-futuristic synthwave band bringing 80s nostalgia.',
        'Ortigas',
        ARRAY['https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&fit=crop'],
        '["Synths", "Drums"]'::jsonb,
        10000,
        14.5866, 121.0601 -- Ortigas
    ) RETURNING id INTO temp_id;
    group_ids := array_append(group_ids, temp_id);


    -- 4. Create Studios
    -- Studio 1
    INSERT INTO public.studios (owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
    VALUES (
        user2_id,
        'SoundLab Manila',
        'Makati City, Metro Manila',
        1200,
        'State of the art recording studio in the heart of Makati. Features a fully treated live room, vocal booth, and premium analog gear.',
        ARRAY['Wifi', 'Aircon', 'Lounge', 'Parking', 'Stage'],
        ARRAY['https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop', 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&fit=crop'],
        14.5547, 121.0244
    ) RETURNING id INTO temp_id;
    studio_ids := array_append(studio_ids, temp_id);

    -- Studio 2
    INSERT INTO public.studios (owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
    VALUES (
        user2_id,
        'Basement Beats',
        'Marikina City',
        500,
        'Affordable rehearsal space for up-and-coming bands. Basic backline provided. Open 24/7.',
        ARRAY['Aircon', 'Vending Machine', 'Drum Kit'],
        ARRAY['https://images.unsplash.com/photo-1520523831597-d8c3be5287c2?w=800&fit=crop'],
        14.6333, 121.0980
    ) RETURNING id INTO temp_id;
    studio_ids := array_append(studio_ids, temp_id);

    -- Studio 3
    INSERT INTO public.studios (owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
    VALUES (
        user2_id,
        'The Red Room',
        'Quezon City',
        800,
        'Cozy recording booth perfect for vocal tracking and mixing.',
        ARRAY['Wifi', 'Coffee', 'Vocal Booth'],
        ARRAY['https://images.unsplash.com/photo-1525201548942-d8732f6617a0?w=800&fit=crop'],
        14.6760, 121.0437
    ) RETURNING id INTO temp_id;
    studio_ids := array_append(studio_ids, temp_id);

    -- Studio 4
    INSERT INTO public.studios (owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
    VALUES (
        user2_id,
        'ProAudio Hub',
        'Pasig City',
        1500,
        'Professional studio with mastering services available.',
        ARRAY['Wifi', 'Lounge', 'Valet', 'Mixing Console'],
        ARRAY['https://images.unsplash.com/photo-1581368129683-176c2688825e?w=800&fit=crop'],
        14.5764, 121.0851
    ) RETURNING id INTO temp_id;
    studio_ids := array_append(studio_ids, temp_id);

    -- Studio 5
    INSERT INTO public.studios (owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
    VALUES (
        user2_id,
        'Garage Jam',
        'Parañaque',
        400,
        'No frills jamming studio. Bring your own cymbals.',
        ARRAY['Fan', 'Amps'],
        ARRAY['https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=800&fit=crop'],
        14.4793, 121.0198
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
        'Acoustic Nights at The Hive',
        'BGC, Taguig',
        3500,
        'Looking for acoustic solo acts or duos for our weekend dinner service. Chill vibes, appreciative crowd, and free dinner included.',
        NOW() + INTERVAL '7 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&fit=crop'],
        14.5543, 121.0524
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 2
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
        'Wedding Reception Band',
        'Tagaytay',
        25000,
        'Need a full band for a wedding reception. Must play outdated pop songs.',
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
        'Corporate Event Opener',
        'SMX Convention Center',
        15000,
        'Looking for a high energy opener for a tech conference.',
        NOW() + INTERVAL '14 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=800&fit=crop'],
        14.5323, 120.9841
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 4
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
        'Bar gig: Friday Night',
        'Tomas Morato',
        5000,
        'Rock bands needed for Friday night lineup.',
        NOW() + INTERVAL '5 days',
        'open',
        ARRAY['https://images.unsplash.com/photo-1514525253440-b393452e8d26?w=800&fit=crop'],
        14.6361, 121.0365
    ) RETURNING id INTO temp_id;
    gig_ids := array_append(gig_ids, temp_id);

    -- Gig 5
    INSERT INTO public.gigs (organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
    VALUES (
        user3_id,
        'Private Party',
        'Forbes Park',
        10000,
        'Private birthday party. Jazz band preferred.',
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
WHERE email IN ('manager@test.com', 'musician@tet.com', 'studio@test.com');






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
    verification_status = 'APPROVED',
    role = 'musician',
    full_name = 'Juan Dela Cruz';

-- Test User 2: Studio Owner
-- Email: studio@test.com / Password: pass123
-- User ID from your dashboard: 00000000-0000-0000-0000-000000000003
INSERT INTO profiles (id, email, full_name, role, bio, location, is_verified, verification_status)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'studio@test.com',
    'Maria Santos',
    'studio-owner',
    'Owner of Santos Recording Studio, serving artists since 2015.',
    'Quezon City, Philippines',
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED',
    role = 'studio-owner',
    full_name = 'Maria Santos';

-- Test User 3: Manager/Venue Owner
-- Email: manager@test.com / Password: pass123
-- User ID from your dashboard: 00000000-0000-0000-0000-000000000001
INSERT INTO profiles (id, email, full_name, role, bio, location, is_verified, verification_status)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'manager@test.com',
    'Pedro Reyes',
    'venue-owner',
    'Talent manager and event organizer specializing in indie rock acts.',
    'Makati, Philippines',
    TRUE,
    'APPROVED'
) ON CONFLICT (id) DO UPDATE SET 
    is_verified = TRUE,
    verification_status = 'APPROVED',
    role = 'venue-owner',
    full_name = 'Pedro Reyes';

-- ============================================================
-- SAMPLE CONTENT (Groups, Studios, Gigs)
-- ============================================================

-- Sample Groups (owned by musician)
INSERT INTO groups (id, owner_id, name, genre, description, location, images, members, rate, latitude, longitude)
VALUES 
    (uuid_generate_v4(), '14d2e916-8d1c-4c04-9877-7ccd9bea6149', 'The Manila Sound', 'Rock', 'High-energy rock band from Manila', 'Manila, Philippines', ARRAY['https://picsum.photos/400/300?random=1'], '["Lead Guitar", "Bass", "Drums", "Vocals"]'::jsonb, 15000, 14.5995, 120.9842),
    (uuid_generate_v4(), '14d2e916-8d1c-4c04-9877-7ccd9bea6149', 'Indie Vibes', 'Indie', 'Chill indie folk duo', 'Quezon City, Philippines', ARRAY['https://picsum.photos/400/300?random=2'], '["Acoustic Guitar", "Vocals"]'::jsonb, 8000, 14.6760, 121.0437)
ON CONFLICT DO NOTHING;

-- Sample Studios (owned by studio owner)
INSERT INTO studios (id, owner_id, name, address, hourly_rate, description, amenities, images, latitude, longitude)
VALUES 
    (uuid_generate_v4(), '00000000-0000-0000-0000-000000000003', 'Santos Recording Studio', '123 Music Ave, Quezon City', 1500, 'Professional recording studio with state-of-the-art equipment', ARRAY['Air Conditioning', 'Drum Kit', 'Amplifiers', 'Mixing Console'], ARRAY['https://picsum.photos/400/300?random=3'], 14.6760, 121.0437),
    (uuid_generate_v4(), '00000000-0000-0000-0000-000000000003', 'Pocket Studio QC', '456 Sound St, Quezon City', 800, 'Affordable rehearsal and recording space', ARRAY['Air Conditioning', 'Basic PA System'], ARRAY['https://picsum.photos/400/300?random=4'], 14.6760, 121.0437)
ON CONFLICT DO NOTHING;

-- Sample Gigs (organized by venue owner/manager)
INSERT INTO gigs (id, organizer_id, name, location, budget, description, event_date, status, images, latitude, longitude)
VALUES 
    (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Friday Night Live', 'Route 196, Katipunan', 15000, 'Looking for a rock band to headline our Friday night show', NOW() + INTERVAL '14 days', 'open', ARRAY['https://picsum.photos/400/300?random=5'], 14.6389, 121.0733),
    (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'Acoustic Sunday', 'Coffee Project, BGC', 8000, 'Need an acoustic act for our Sunday brunch sessions', NOW() + INTERVAL '7 days', 'open', ARRAY['https://picsum.photos/400/300?random=6'], 14.5547, 121.0244)
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
        (SELECT id FROM studios WHERE owner_id = '00000000-0000-0000-0000-000000000003' LIMIT 1),
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
        'The Manila Sound would love to headline your Friday night show! We have a great setlist prepared.'
    ),
    (
        uuid_generate_v4(),
        '14d2e916-8d1c-4c04-9877-7ccd9bea6149',
        (SELECT id FROM groups WHERE owner_id = '14d2e916-8d1c-4c04-9877-7ccd9bea6149' ORDER BY created_at DESC LIMIT 1),
        (SELECT id FROM gigs WHERE organizer_id = '00000000-0000-0000-0000-000000000001' ORDER BY created_at DESC LIMIT 1),
        'accepted',
        'Indie Vibes is perfect for your acoustic Sunday brunch. We can bring our own equipment.'
    )
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
    SELECT id INTO v_musician_id FROM auth.users WHERE email = 'musician@test.com' LIMIT 1;  -- Note: Seed used 'musician@tet.com' in one place, verify which one user uses. User said 'musician@test.com'.
    -- Try 'musician@tet.com' if 'musician@test.com' not found
    IF v_musician_id IS NULL THEN
        SELECT id INTO v_musician_id FROM auth.users WHERE email = 'musician@tet.com' LIMIT 1;
    END IF;
    
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
        WHERE name IN ('Santos Recording Studio', 'Pocket Studio QC', 'SoundLab Manila', 'Basement Beats', 'The Red Room', 'ProAudio Hub', 'Garage Jam') 
           OR owner_id = '00000000-0000-0000-0000-000000000003'; -- Catch the dummy ID
    ELSE
        RAISE NOTICE 'WARNING: studio@test.com not found';
    END IF;

    -- Musician
    IF v_musician_id IS NOT NULL THEN
        RAISE NOTICE 'Found Musician: %', v_musician_id;
        INSERT INTO public.profiles (id, email, full_name, role, verification_status)
        VALUES (v_musician_id, 'musician@test.com', 'Juan Dela Cruz', 'musician', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET role = 'musician';

        -- Link Groups
        UPDATE public.groups 
        SET owner_id = v_musician_id 
        WHERE name IN ('The Manila Sound', 'Indie Vibes', 'The Neon Lights', 'Midnight Jazz Trio', 'Sonic Boom', 'Acoustic Soul', 'Electric Dreams')
           OR owner_id = '00000000-0000-0000-0000-000000000002'
           OR owner_id = '14d2e916-8d1c-4c04-9877-7ccd9bea6149'; -- Catch the other dummy ID
    ELSE
        RAISE NOTICE 'WARNING: musician@test.com not found';
    END IF;

    -- Venue Owner
    IF v_manager_id IS NOT NULL THEN
        RAISE NOTICE 'Found Manager: %', v_manager_id;
        INSERT INTO public.profiles (id, email, full_name, role, verification_status)
        VALUES (v_manager_id, 'manager@test.com', 'Pedro Reyes', 'venue-owner', 'APPROVED')
        ON CONFLICT (id) DO UPDATE SET role = 'venue-owner';

        -- Link Gigs
        UPDATE public.gigs 
        SET organizer_id = v_manager_id 
        WHERE name IN ('Friday Night Live', 'Acoustic Sunday', 'Acoustic Nights at The Hive', 'Wedding Reception Band', 'Corporate Event Opener', 'Bar gig: Friday Night', 'Private Party')
           OR organizer_id = '00000000-0000-0000-0000-000000000001';
    ELSE
        RAISE NOTICE 'WARNING: manager@test.com not found';
    END IF;

END $$;
