-- Localize all musician profiles and group listings around Bulacan.

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    UPDATE public.profiles
    SET
      location = CASE
        WHEN id = '10000000-0000-4000-8000-000000000001' OR email IN ('juan.delacruz.20260514@musikalokal.app', 'juan.delacruz@gmail.com') THEN 'Malolos City, Bulacan'
        WHEN id = '10000000-0000-4000-8000-000000000002' OR email IN ('mara.reyes.20260514@musikalokal.app', 'mara.reyes@gmail.com') THEN 'Baliwag City, Bulacan'
        WHEN email = 'sofia.villanueva.seed@musikalokal.dev' THEN 'Meycauayan City, Bulacan'
        WHEN email = 'paolo.mendoza.seed@musikalokal.dev' THEN 'San Jose del Monte City, Bulacan'
        WHEN email = 'aira.bautista.seed@musikalokal.dev' THEN 'Santa Maria, Bulacan'
        WHEN email = 'carlo.santos.seed@musikalokal.dev' THEN 'Plaridel, Bulacan'
        WHEN email = 'bea.navarro.seed@musikalokal.dev' THEN 'Marilao, Bulacan'
        ELSE 'Guiguinto, Bulacan, Philippines'
      END,
      address = CASE
        WHEN id = '10000000-0000-4000-8000-000000000001' OR email IN ('juan.delacruz.20260514@musikalokal.app', 'juan.delacruz@gmail.com') THEN 'Barangay Tikay, Malolos City, Bulacan'
        WHEN id = '10000000-0000-4000-8000-000000000002' OR email IN ('mara.reyes.20260514@musikalokal.app', 'mara.reyes@gmail.com') THEN 'Poblacion, Baliwag City, Bulacan'
        WHEN email = 'sofia.villanueva.seed@musikalokal.dev' THEN 'Poblacion, Meycauayan City, Bulacan'
        WHEN email = 'paolo.mendoza.seed@musikalokal.dev' THEN 'Tungkong Mangga, San Jose del Monte City, Bulacan'
        WHEN email = 'aira.bautista.seed@musikalokal.dev' THEN 'Poblacion, Santa Maria, Bulacan'
        WHEN email = 'carlo.santos.seed@musikalokal.dev' THEN 'Poblacion, Plaridel, Bulacan'
        WHEN email = 'bea.navarro.seed@musikalokal.dev' THEN 'Poblacion, Marilao, Bulacan'
        ELSE 'Guiguinto, Bulacan, Philippines'
      END
    WHERE role = 'musician';
  END IF;

  IF to_regclass('public.groups') IS NOT NULL THEN
    UPDATE public.groups
    SET
      name = CASE
        WHEN id = '30000000-0000-4000-8000-000000000002' OR name IN ('Mara Reyes Quartet', 'Poblacion Jazz Collective') THEN 'Baliwag Jazz Collective'
        WHEN id = '30000000-0000-4000-8000-000000000003' OR name = 'Cubao Night Market' THEN 'Malolos Night Market'
        WHEN id = '30000000-0000-4000-8000-000000000005' OR name = 'Pasig Brass Club' THEN 'Bulacan Brass Club'
        WHEN id = 'f0000000-0000-4000-8000-000000000302' OR name = 'Quezon Indie Circuit' THEN 'Bulacan Indie Circuit'
        WHEN id = 'f0000000-0000-4000-8000-000000000301' OR name = 'Metro South Session Club' THEN 'Bulacan Session Club'
        ELSE name
      END,
      location = CASE
        WHEN id IN ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003') THEN 'Malolos City, Bulacan'
        WHEN id = '30000000-0000-4000-8000-000000000002' THEN 'Baliwag City, Bulacan'
        WHEN id = '30000000-0000-4000-8000-000000000004' THEN 'Angat, Bulacan'
        WHEN id = '30000000-0000-4000-8000-000000000005' THEN 'Bocaue, Bulacan'
        WHEN id = 'f0000000-0000-4000-8000-000000000301' THEN 'Meycauayan City, Bulacan'
        WHEN id = 'f0000000-0000-4000-8000-000000000302' THEN 'Plaridel, Bulacan'
        ELSE 'Guiguinto, Bulacan, Philippines'
      END,
      latitude = CASE
        WHEN id IN ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003') THEN 14.8527
        WHEN id = '30000000-0000-4000-8000-000000000002' THEN 14.9547
        WHEN id = '30000000-0000-4000-8000-000000000004' THEN 14.9285
        WHEN id = '30000000-0000-4000-8000-000000000005' THEN 14.7983
        WHEN id = 'f0000000-0000-4000-8000-000000000301' THEN 14.7369
        WHEN id = 'f0000000-0000-4000-8000-000000000302' THEN 14.8872
        ELSE 14.8337
      END,
      longitude = CASE
        WHEN id IN ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003') THEN 120.8160
        WHEN id = '30000000-0000-4000-8000-000000000002' THEN 120.8969
        WHEN id = '30000000-0000-4000-8000-000000000004' THEN 121.0309
        WHEN id = '30000000-0000-4000-8000-000000000005' THEN 120.9261
        WHEN id = 'f0000000-0000-4000-8000-000000000301' THEN 120.9608
        WHEN id = 'f0000000-0000-4000-8000-000000000302' THEN 120.8572
        ELSE 120.8657
      END,
      description = CASE
        WHEN id = '30000000-0000-4000-8000-000000000001' THEN 'Four-piece Bulacan band playing guitar-led OPM, funk grooves, and wedding reception medleys.'
        WHEN id = '30000000-0000-4000-8000-000000000002' THEN 'Lounge-ready Bulacan soul and jazz collective with Tagalog standards, bossa sets, and quiet-dinner arrangements.'
        WHEN id = '30000000-0000-4000-8000-000000000003' THEN 'Guitar-forward Bulacan alt-rock crew with 90s OPM covers and two-set bar programs.'
        WHEN id = '30000000-0000-4000-8000-000000000004' THEN 'Acoustic Bulacan duo built for garden weddings, listening rooms, and proposal dinners.'
        WHEN id = '30000000-0000-4000-8000-000000000005' THEN 'Horn-backed Bulacan party band for brand launches, city festivals, and late-night dance sets.'
        WHEN id = 'f0000000-0000-4000-8000-000000000301' THEN 'A Meycauayan-to-Malolos session group for polished synth-pop, R&B lounge sets, and brand-event warmups.'
        WHEN id = 'f0000000-0000-4000-8000-000000000302' THEN 'A Bulacan indie unit built around warm guitars, bass-forward grooves, and acoustic-friendly arrangements for cafes, community shows, and campus events.'
        ELSE replace(coalesce(description, 'A Bulacan group for local showcases.'), 'Quezon City', 'Bulacan')
      END;
  END IF;

  IF to_regclass('public.products') IS NOT NULL THEN
    UPDATE public.products
    SET
      title = replace(replace(replace(replace(title, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Pasig Brass Club', 'Bulacan Brass Club'), 'Cubao Night Market', 'Malolos Night Market'),
      description = replace(replace(replace(replace(description, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Pasig Brass Club', 'Bulacan Brass Club'), 'Quezon City', 'Bulacan');
  END IF;

  IF to_regclass('public.product_variants') IS NOT NULL THEN
    UPDATE public.product_variants
    SET sku = replace(replace(replace(sku, 'PJC-', 'BJC-'), 'MRQ-', 'BJC-'), 'MR-', 'BJC-');
  END IF;

  IF to_regclass('public.playlists') IS NOT NULL THEN
    UPDATE public.playlists
    SET
      title = replace(replace(title, 'Poblacion After Hours', 'Baliwag After Hours'), 'Cubao Guitar Notes', 'Malolos Guitar Notes'),
      description = replace(replace(replace(description, 'Poblacion', 'Baliwag'), 'Cubao', 'Bulacan'), 'Quezon City', 'Bulacan');
  END IF;

  IF to_regclass('public.playlist_items') IS NOT NULL THEN
    UPDATE public.playlist_items
    SET artist_name = replace(replace(replace(artist_name, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market');
  END IF;

  IF to_regclass('public.gig_applications') IS NOT NULL THEN
    UPDATE public.gig_applications
    SET
      pitch_message = replace(replace(replace(pitch_message, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market'),
      note = replace(replace(replace(note, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market');

    UPDATE public.gig_applications
    SET performer_snapshot = replace(replace(replace(performer_snapshot::text, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market')::jsonb
    WHERE performer_snapshot::text ILIKE '%Poblacion Jazz Collective%'
       OR performer_snapshot::text ILIKE '%Mara Reyes Quartet%'
       OR performer_snapshot::text ILIKE '%Cubao Night Market%';
  END IF;

  IF to_regclass('public.booking_requests') IS NOT NULL THEN
    UPDATE public.booking_requests
    SET
      message = replace(replace(replace(message, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market'),
      event_details = replace(replace(replace(event_details::text, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market')::jsonb;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    UPDATE public.notifications
    SET
      message = replace(replace(replace(message, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market'),
      meta = replace(replace(replace(meta::text, 'Poblacion Jazz Collective', 'Baliwag Jazz Collective'), 'Mara Reyes Quartet', 'Baliwag Jazz Collective'), 'Cubao Night Market', 'Malolos Night Market')::jsonb;
  END IF;
END $$;
