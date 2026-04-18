-- Localize legacy demo data to Filipino names and Philippine-based venues.
-- This updates already-seeded rows in place and avoids touching legacy columns
-- that may no longer exist after the 3NF contract work.

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    UPDATE public.profiles
    SET
      full_name = 'Gabriel dela Cruz',
      location = 'Quezon City, Metro Manila'
    WHERE email IN ('musician@tet.com', 'musician@test.com');

    UPDATE public.profiles
    SET
      full_name = 'Marco Reyes',
      location = 'Quezon City, Metro Manila'
    WHERE email = 'manager@test.com';
  END IF;

  IF to_regclass('public.groups') IS NOT NULL THEN
    UPDATE public.groups
    SET
      name = 'Amihan Sessions',
      genre = 'Indie Folk',
      description = 'Quezon City indie folk band playing OPM favorites, weddings, campus fairs, and brand events with a full live setup.',
      location = 'Quezon City, Metro Manila',
      rate = 18000,
      latitude = 14.6760,
      longitude = 121.0437
    WHERE name IN ('The Neon Lights', 'The Manila Sound');

    UPDATE public.groups
    SET
      name = 'Kundiman After Dark',
      genre = 'Jazz',
      description = 'Jazz trio blending standards, bossa, and kundiman arrangements for hotel lounges and intimate receptions.',
      location = 'Makati City, Metro Manila',
      rate = 9000,
      latitude = 14.5547,
      longitude = 121.0244
    WHERE name = 'Midnight Jazz Trio';

    UPDATE public.groups
    SET
      name = 'Silakbo Collective',
      genre = 'Alternative Rock',
      description = 'Metro Manila alt-rock band with a tight OPM set, 90s throwbacks, and crowd-ready originals.',
      location = 'Pasig City, Metro Manila',
      rate = 14000,
      latitude = 14.5764,
      longitude = 121.0851
    WHERE name = 'Sonic Boom';

    UPDATE public.groups
    SET
      name = 'Harana Duo',
      genre = 'Acoustic OPM',
      description = 'Acoustic duo built for garden weddings, cafe nights, and private dinners with modern OPM arrangements.',
      location = 'San Juan City, Metro Manila',
      rate = 6500,
      latitude = 14.6019,
      longitude = 121.0355
    WHERE name IN ('Acoustic Soul', 'Indie Vibes');

    UPDATE public.groups
    SET
      name = 'Mayumi Midnight',
      genre = 'Synth Pop',
      description = 'Synth-driven pop act from the south of Metro Manila mixing city-pop textures with Filipino hooks.',
      location = 'Muntinlupa City, Metro Manila',
      rate = 11000,
      latitude = 14.4081,
      longitude = 121.0415
    WHERE name = 'Electric Dreams';
  END IF;

  IF to_regclass('public.gigs') IS NOT NULL THEN
    UPDATE public.gigs
    SET
      name = 'Acoustic Nights at Jess & Pat''s',
      location = 'Jess & Pat''s, Quezon City',
      budget = 5000,
      description = 'Looking for acoustic solo acts or duos with a warm OPM-heavy set for an intimate Friday crowd.',
      latitude = 14.6500,
      longitude = 121.0490
    WHERE name IN ('Acoustic Nights at The Hive', 'Acoustic Sunday');

    UPDATE public.gigs
    SET
      name = 'Tagaytay Wedding Reception Band',
      location = 'Tagaytay, Cavite',
      budget = 30000,
      description = 'Need a polished full band for a wedding reception. Strong OPM, pop ballad, and sing-along repertoire required.',
      latitude = 14.1153,
      longitude = 120.9621
    WHERE name = 'Wedding Reception Band';

    UPDATE public.gigs
    SET
      name = 'Corporate Opening Set at SMX Manila',
      location = 'SMX Convention Center Manila, Pasay',
      budget = 18000,
      description = 'Looking for a high-energy opener for a brand launch at SMX. Clean stage look and a tight 30-minute set are required.',
      latitude = 14.5311,
      longitude = 120.9827
    WHERE name = 'Corporate Event Opener';

    UPDATE public.gigs
    SET
      name = 'Friday OPM Set at 70''s Bistro',
      location = '70''s Bistro, Quezon City',
      budget = 7000,
      description = 'Rock and alt-pop bands needed for a Friday night lineup with a crowd that knows the classics.',
      latitude = 14.6348,
      longitude = 121.0387
    WHERE name IN ('Bar gig: Friday Night', 'Friday Night Live');

    UPDATE public.gigs
    SET
      name = 'Private Jazz Night in Forbes Park',
      location = 'Forbes Park, Makati',
      budget = 12000,
      description = 'Private birthday dinner in Makati. Jazz trio or classy lounge band preferred.',
      latitude = 14.5492,
      longitude = 121.0336
    WHERE name = 'Private Party';
  END IF;
END;
$$;