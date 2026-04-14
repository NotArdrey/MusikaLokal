-- Populate accepted gig timeline dummy data for musician2@test.com (Jazz Musician).
-- Idempotent — safe to re-run.

DO $$
DECLARE
  v_musician2_id uuid;
  v_manager_id   uuid;
BEGIN
  SELECT id INTO v_musician2_id
  FROM public.profiles
  WHERE email = 'musician2@test.com'
  LIMIT 1;

  SELECT id INTO v_manager_id
  FROM public.profiles
  WHERE email = 'manager@test.com'
  LIMIT 1;

  IF v_musician2_id IS NULL OR v_manager_id IS NULL THEN
    RAISE NOTICE 'Skipping Jazz Musician gig timeline seed: musician2@test.com / manager@test.com not found.';
    RETURN;
  END IF;

  -- Gigs (reuse the existing manager-owned gigs where possible; add new ones for variety)
  INSERT INTO public.gigs (
    id, organizer_id, name, location, budget, description, event_date, status,
    latitude, longitude, rate
  ) VALUES
    (
      '22222222-2222-2222-2222-222222220401',
      v_manager_id,
      'Jazz at Sundown',
      'BGC, Taguig',
      10000,
      'Rooftop sunset jazz set for a chic crowd.',
      NOW() + INTERVAL '7 days',
      'open',
      14.5469, 121.0506, 10000
    ),
    (
      '22222222-2222-2222-2222-222222220402',
      v_manager_id,
      'Blue Note Sessions',
      'Poblacion, Makati',
      8000,
      'Mid-week jazz night for regulars and walk-ins.',
      NOW() + INTERVAL '14 days',
      'open',
      14.5652, 121.0303, 8000
    ),
    (
      '22222222-2222-2222-2222-222222220403',
      v_manager_id,
      'Hotel Bar Jazz Night',
      'Ortigas, Pasig',
      12000,
      'Sophisticated hotel lobby jazz performance.',
      NOW() + INTERVAL '21 days',
      'open',
      14.5869, 121.0614, 12000
    ),
    (
      '22222222-2222-2222-2222-222222220404',
      v_manager_id,
      'Baliwag Music Festival Set',
      'Baliwag, Bulacan',
      15000,
      'Local music festival headline jazz slot.',
      NOW() - INTERVAL '3 days',
      'closed',
      14.9533, 120.9047, 15000
    ),
    (
      '22222222-2222-2222-2222-222222220405',
      v_manager_id,
      'Private Wedding Set',
      'San Juan, Metro Manila',
      9000,
      'Intimate jazz background music for a garden wedding.',
      NOW() - INTERVAL '8 days',
      'closed',
      14.6019, 121.0355, 9000
    )
  ON CONFLICT (id) DO UPDATE SET
    organizer_id = EXCLUDED.organizer_id,
    name         = EXCLUDED.name,
    location     = EXCLUDED.location,
    budget       = EXCLUDED.budget,
    description  = EXCLUDED.description,
    event_date   = EXCLUDED.event_date,
    status       = EXCLUDED.status,
    latitude     = EXCLUDED.latitude,
    longitude    = EXCLUDED.longitude,
    rate         = EXCLUDED.rate;

  -- Solo accepted applications for Jazz Musician
  INSERT INTO public.gig_applications (
    id, applicant_id, group_id, gig_id, status, pitch_message,
    is_solo_application, show_on_profile
  ) VALUES
    (
      '44444444-4444-4444-4444-444444440401',
      v_musician2_id, NULL,
      '22222222-2222-2222-2222-222222220401',
      'accepted',
      'Smooth jazz set with original arrangements and classic standards.',
      true, true
    ),
    (
      '44444444-4444-4444-4444-444444440402',
      v_musician2_id, NULL,
      '22222222-2222-2222-2222-222222220402',
      'accepted',
      'Relaxed mid-week vibe with a focus on melodic improvisation.',
      true, true
    ),
    (
      '44444444-4444-4444-4444-444444440403',
      v_musician2_id, NULL,
      '22222222-2222-2222-2222-222222220403',
      'accepted',
      'Polished hotel lobby set with upscale repertoire.',
      true, true
    ),
    (
      '44444444-4444-4444-4444-444444440404',
      v_musician2_id, NULL,
      '22222222-2222-2222-2222-222222220404',
      'accepted',
      'High-energy festival jazz slot bringing the crowd energy up.',
      true, true
    ),
    (
      '44444444-4444-4444-4444-444444440405',
      v_musician2_id, NULL,
      '22222222-2222-2222-2222-222222220405',
      'accepted',
      'Gentle background jazz for an intimate garden wedding ceremony.',
      true, true
    )
  ON CONFLICT (id) DO UPDATE SET
    applicant_id        = EXCLUDED.applicant_id,
    group_id            = EXCLUDED.group_id,
    gig_id              = EXCLUDED.gig_id,
    status              = EXCLUDED.status,
    pitch_message       = EXCLUDED.pitch_message,
    is_solo_application = EXCLUDED.is_solo_application,
    show_on_profile     = EXCLUDED.show_on_profile;

  RAISE NOTICE 'Seeded Jazz Musician (%) solo gig timeline cards.', v_musician2_id;
END $$;
