-- Rename the OneRoots demo account/studio to the real display name used by the app.

UPDATE auth.users
SET raw_user_meta_data = CASE
  WHEN coalesce(raw_user_meta_data, '{}'::jsonb) ? 'name' THEN
    jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'Roots Records'),
      '{name}',
      to_jsonb('Roots Records'::text),
      true
    )
  ELSE
    coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'Roots Records')
  END
WHERE lower(email) = 'seed.oneroots.records@musikalokal.app'
   OR raw_user_meta_data ->> 'full_name' = 'OneRoots Records'
   OR raw_user_meta_data ->> 'name' = 'OneRoots Records';

UPDATE public.profiles
SET
  full_name = 'Roots Records',
  bio = replace(coalesce(bio, ''), 'OneRoots Records', 'Roots Records')
WHERE lower(email) = 'seed.oneroots.records@musikalokal.app'
   OR full_name = 'OneRoots Records';

UPDATE public.studios
SET
  name = 'Roots Records',
  description = replace(coalesce(description, ''), 'OneRoots Records', 'Roots Records')
WHERE name = 'OneRoots Records'
   OR owner_id IN (
     SELECT id
     FROM public.profiles
     WHERE lower(email) = 'seed.oneroots.records@musikalokal.app'
        OR full_name = 'Roots Records'
   );
