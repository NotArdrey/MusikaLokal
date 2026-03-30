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
