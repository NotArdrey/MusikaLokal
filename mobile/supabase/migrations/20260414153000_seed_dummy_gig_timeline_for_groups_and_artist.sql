-- Populate accepted gig timeline dummy data for seeded musician groups and solo artist.
-- This is data-only and idempotent so it can be safely re-run in the MCP-connected dev project.

DO $$
DECLARE
  v_musician_id uuid;
  v_manager_id uuid;
  v_the_manila_sound_id uuid;
  v_indie_vibes_id uuid;
  v_neon_lights_id uuid;
  v_midnight_jazz_id uuid;
  v_sonic_boom_id uuid;
  v_acoustic_soul_id uuid;
  v_electric_dreams_id uuid;
BEGIN
  SELECT id
  INTO v_musician_id
  FROM public.profiles
  WHERE email IN ('musician@test.com', 'musician@tet.com')
  ORDER BY CASE WHEN email = 'musician@test.com' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id
  INTO v_manager_id
  FROM public.profiles
  WHERE email = 'manager@test.com'
  LIMIT 1;

  IF v_musician_id IS NULL OR v_manager_id IS NULL THEN
    RAISE NOTICE 'Skipping dummy gig timeline seed. musician@test.com / manager@test.com profile(s) not found.';
    RETURN;
  END IF;

  SELECT id INTO v_the_manila_sound_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'The Manila Sound'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_the_manila_sound_id IS NULL THEN
    v_the_manila_sound_id := '11111111-1111-1111-1111-111111110101';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_the_manila_sound_id,
      v_musician_id,
      'The Manila Sound',
      'Rock',
      'High-energy rock band from Manila.',
      'Manila, Philippines',
      14.5995,
      120.9842,
      15000,
      'band'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_indie_vibes_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'Indie Vibes'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_indie_vibes_id IS NULL THEN
    v_indie_vibes_id := '11111111-1111-1111-1111-111111110102';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_indie_vibes_id,
      v_musician_id,
      'Indie Vibes',
      'Indie',
      'Chill indie folk duo for brunch, lounges, and intimate rooms.',
      'Quezon City, Philippines',
      14.6760,
      121.0437,
      8000,
      'duo'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_neon_lights_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'The Neon Lights'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_neon_lights_id IS NULL THEN
    v_neon_lights_id := '11111111-1111-1111-1111-111111110103';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_neon_lights_id,
      v_musician_id,
      'The Neon Lights',
      'Indie Pop',
      'High-energy indie pop band for parties and nightlife sets.',
      'Quezon City',
      14.6760,
      121.0437,
      15000,
      'band'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_midnight_jazz_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'Midnight Jazz Trio'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_midnight_jazz_id IS NULL THEN
    v_midnight_jazz_id := '11111111-1111-1111-1111-111111110104';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_midnight_jazz_id,
      v_musician_id,
      'Midnight Jazz Trio',
      'Jazz',
      'Sophisticated jazz trio for cocktail hours and upscale events.',
      'Makati City',
      14.5547,
      121.0244,
      8000,
      'band'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_sonic_boom_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'Sonic Boom'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_sonic_boom_id IS NULL THEN
    v_sonic_boom_id := '11111111-1111-1111-1111-111111110105';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_sonic_boom_id,
      v_musician_id,
      'Sonic Boom',
      'Rock',
      'Alternative rock band playing 90s hits and originals.',
      'Mandaluyong',
      14.5794,
      121.0359,
      12000,
      'band'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_acoustic_soul_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'Acoustic Soul'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_acoustic_soul_id IS NULL THEN
    v_acoustic_soul_id := '11111111-1111-1111-1111-111111110106';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_acoustic_soul_id,
      v_musician_id,
      'Acoustic Soul',
      'Acoustic',
      'Soulful acoustic duo perfect for intimate gatherings.',
      'San Juan',
      14.6019,
      121.0355,
      5000,
      'duo'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  SELECT id INTO v_electric_dreams_id
  FROM public.groups
  WHERE owner_id = v_musician_id AND name = 'Electric Dreams'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_electric_dreams_id IS NULL THEN
    v_electric_dreams_id := '11111111-1111-1111-1111-111111110107';
    INSERT INTO public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude, rate, group_type
    ) VALUES (
      v_electric_dreams_id,
      v_musician_id,
      'Electric Dreams',
      'Synthwave',
      'Retro-futuristic synthwave band bringing 80s nostalgia.',
      'Ortigas',
      14.5866,
      121.0601,
      10000,
      'band'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.gigs (
    id,
    organizer_id,
    name,
    location,
    budget,
    description,
    event_date,
    status,
    latitude,
    longitude,
    rate
  ) VALUES
    (
      '22222222-2222-2222-2222-222222220201',
      v_manager_id,
      'Solo Spotlight Session',
      'Poblacion, Makati',
      6000,
      'Feature set for a versatile solo musician with strong crowd connection.',
      CURRENT_DATE + TIME '20:00:00',
      'open',
      14.5652,
      121.0303,
      6000
    ),
    (
      '22222222-2222-2222-2222-222222220202',
      v_manager_id,
      'Katipunan Indie Exchange',
      'Katipunan, Quezon City',
      12000,
      'Indie-focused live room for melodic, low-volume sets.',
      NOW() + INTERVAL '6 days',
      'open',
      14.6407,
      121.0740,
      12000
    ),
    (
      '22222222-2222-2222-2222-222222220203',
      v_manager_id,
      'Roofdeck Jazz Nights',
      'Salcedo Village, Makati',
      14000,
      'Cocktail-hour jazz booking for a polished trio.',
      NOW() + INTERVAL '12 days',
      'open',
      14.5577,
      121.0184,
      14000
    ),
    (
      '22222222-2222-2222-2222-222222220204',
      v_manager_id,
      'Rock District Friday',
      'Tomas Morato, Quezon City',
      15000,
      'Prime Friday slot for a high-energy band.',
      CURRENT_DATE + TIME '21:30:00',
      'open',
      14.6349,
      121.0338,
      15000
    ),
    (
      '22222222-2222-2222-2222-222222220205',
      v_manager_id,
      'QC Battle Replay',
      'Cubao Expo, Quezon City',
      11000,
      'A throwback showcase slot for a punchy rock act.',
      NOW() - INTERVAL '5 days',
      'closed',
      14.6206,
      121.0548,
      11000
    ),
    (
      '22222222-2222-2222-2222-222222220206',
      v_manager_id,
      'Acoustic Garden Sessions',
      'San Juan Garden Cafe',
      7000,
      'Warm acoustic brunch set with relaxed crowd energy.',
      NOW() - INTERVAL '2 days',
      'closed',
      14.6019,
      121.0355,
      7000
    ),
    (
      '22222222-2222-2222-2222-222222220207',
      v_manager_id,
      'Synth City After Hours',
      'Ortigas, Pasig',
      13000,
      'Late-night synth-driven showcase for retro electronic acts.',
      NOW() + INTERVAL '18 days',
      'open',
      14.5869,
      121.0614,
      13000
    ),
    (
      '22222222-2222-2222-2222-222222220208',
      v_manager_id,
      'Manila Sound Anniversary Set',
      'Escolta, Manila',
      16000,
      'Anniversary headline slot for a full-band performance.',
      NOW() + INTERVAL '25 days',
      'open',
      14.5997,
      120.9796,
      16000
    ),
    (
      '22222222-2222-2222-2222-222222220209',
      v_manager_id,
      'Solo Sunset House Show',
      'Forbes Park, Makati',
      9000,
      'Private house show for a strong solo performer.',
      NOW() - INTERVAL '10 days',
      'closed',
      14.5488,
      121.0332,
      9000
    )
  ON CONFLICT (id) DO UPDATE SET
    organizer_id = EXCLUDED.organizer_id,
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    budget = EXCLUDED.budget,
    description = EXCLUDED.description,
    event_date = EXCLUDED.event_date,
    status = EXCLUDED.status,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    rate = EXCLUDED.rate;

  INSERT INTO public.gig_applications (
    id,
    applicant_id,
    group_id,
    gig_id,
    status,
    pitch_message,
    is_solo_application,
    show_on_profile
  ) VALUES
    (
      '33333333-3333-3333-3333-333333330301',
      v_musician_id,
      NULL,
      '22222222-2222-2222-2222-222222220201',
      'accepted',
      'Solo artist set with adaptive crowd reads and clean acoustic transitions.',
      true,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330302',
      v_musician_id,
      v_indie_vibes_id,
      '22222222-2222-2222-2222-222222220202',
      'accepted',
      'Indie Vibes can deliver an intimate indie set that fits the room perfectly.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330303',
      v_musician_id,
      v_midnight_jazz_id,
      '22222222-2222-2222-2222-222222220203',
      'accepted',
      'Midnight Jazz Trio is ready with a polished cocktail-hour repertoire.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330304',
      v_musician_id,
      v_neon_lights_id,
      '22222222-2222-2222-2222-222222220204',
      'accepted',
      'The Neon Lights can drive a high-energy primetime crowd set tonight.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330305',
      v_musician_id,
      v_sonic_boom_id,
      '22222222-2222-2222-2222-222222220205',
      'accepted',
      'Sonic Boom handled the replay showcase with a tight alt-rock set.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330306',
      v_musician_id,
      v_acoustic_soul_id,
      '22222222-2222-2222-2222-222222220206',
      'accepted',
      'Acoustic Soul matched the brunch vibe with a mellow, soulful performance.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330307',
      v_musician_id,
      v_electric_dreams_id,
      '22222222-2222-2222-2222-222222220207',
      'accepted',
      'Electric Dreams is booked for a synth-forward late-night showcase.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330308',
      v_musician_id,
      v_the_manila_sound_id,
      '22222222-2222-2222-2222-222222220208',
      'accepted',
      'The Manila Sound is confirmed for the anniversary headline slot.',
      false,
      true
    ),
    (
      '33333333-3333-3333-3333-333333330309',
      v_musician_id,
      NULL,
      '22222222-2222-2222-2222-222222220209',
      'accepted',
      'Solo sunset house-show performance with stripped-back arrangements.',
      true,
      true
    )
  ON CONFLICT (id) DO UPDATE SET
    applicant_id = EXCLUDED.applicant_id,
    group_id = EXCLUDED.group_id,
    gig_id = EXCLUDED.gig_id,
    status = EXCLUDED.status,
    pitch_message = EXCLUDED.pitch_message,
    is_solo_application = EXCLUDED.is_solo_application,
    show_on_profile = EXCLUDED.show_on_profile;

  RAISE NOTICE 'Seeded dummy gig timeline data for musician %, groups, and solo artist timeline cards.', v_musician_id;
END $$;