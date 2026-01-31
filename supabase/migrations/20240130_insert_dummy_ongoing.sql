DO $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_studio_id UUID;
  v_rate NUMERIC;
BEGIN
  -- 1. Get the Musician ID (musician@test.com)
  SELECT id INTO v_user_id FROM profiles WHERE email = 'musician@test.com';
  
  -- 2. Get the Studio Owner ID (studio@test.com)
  SELECT id INTO v_owner_id FROM profiles WHERE email = 'studio@test.com';
  
  -- 3. Get the first studio owned by studio@test.com
  SELECT id, hourly_rate INTO v_studio_id, v_rate FROM studios WHERE owner_id = v_owner_id LIMIT 1;

  -- Validation
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User musician@test.com not found. Skipping data.';
    RETURN;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'User studio@test.com not found. Skipping data.';
    RETURN;
  END IF;

  IF v_studio_id IS NULL THEN
    RAISE NOTICE 'No studio found for studio@test.com. Create a studio first!';
    RETURN;
  END IF;

  RAISE NOTICE 'Found Users: Musician=%, StudioOwner=%, StudioID=%', v_user_id, v_owner_id, v_studio_id;

  -- CLEANUP: Remove all existing 'checked_in' (ongoing) bookings for this studio/user to start fresh
  DELETE FROM studio_bookings 
  WHERE studio_id = v_studio_id 
  AND status = 'checked_in';
  
  RAISE NOTICE 'Cleaned up existing ongoing bookings.';

  -- NOTE: Inserting as 'confirmed' (Upcoming) so they can be scanned.
  -- Setting check_in_time to NULL.

  -- Booking 1: Ongoing Rehearsal (Started 1 hour ago, ends in 2 hours)
  INSERT INTO studio_bookings (
    studio_id, user_id, booking_date, start_time, end_time, 
    base_rate, hours, subtotal, final_price, status, check_in_time
  ) VALUES (
    v_studio_id, v_user_id, CURRENT_DATE, 
    (NOW() - INTERVAL '1 hour')::TIME, (NOW() + INTERVAL '2 hours')::TIME,
    v_rate, 3, v_rate * 3, v_rate * 3, 'confirmed', NULL
  );

  -- Booking 2: Just Started (Started 10 mins ago, ends in 1 hour)
  INSERT INTO studio_bookings (
    studio_id, user_id, booking_date, start_time, end_time, 
    base_rate, hours, subtotal, final_price, status, check_in_time
  ) VALUES (
    v_studio_id, v_user_id, CURRENT_DATE, 
    (NOW() - INTERVAL '10 minutes')::TIME, (NOW() + INTERVAL '50 minutes')::TIME,
    v_rate, 1, v_rate * 1, v_rate * 1, 'confirmed', NULL
  );

  -- Booking 3: Ongoing Recording (Started 2 hours ago, ends in 2 hours)
  INSERT INTO studio_bookings (
    studio_id, user_id, booking_date, start_time, end_time, 
    base_rate, hours, subtotal, final_price, status, check_in_time
  ) VALUES (
    v_studio_id, v_user_id, CURRENT_DATE, 
    (NOW() - INTERVAL '2 hours')::TIME, (NOW() + INTERVAL '2 hours')::TIME,
    v_rate, 4, v_rate * 4, v_rate * 4, 'confirmed', NULL
  );

  -- Booking 4: Wrapping Up (Started 3 hours ago, ends in 10 minutes)
  INSERT INTO studio_bookings (
    studio_id, user_id, booking_date, start_time, end_time, 
    base_rate, hours, subtotal, final_price, status, check_in_time
  ) VALUES (
    v_studio_id, v_user_id, CURRENT_DATE, 
    (NOW() - INTERVAL '3 hours')::TIME, (NOW() + INTERVAL '10 minutes')::TIME,
    v_rate, 3, v_rate * 3, v_rate * 3, 'confirmed', NULL
  );

  RAISE NOTICE 'SUCCESS: Inserted 4 dummy UPCOMING bookings for musician@test.com at studio owned by studio@test.com';
END $$;
