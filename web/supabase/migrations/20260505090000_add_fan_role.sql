-- Allow public signup profiles to use the fan role.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (
      role = ANY (
        ARRAY[
          'fan'::text,
          'musician'::text,
          'studio-owner'::text,
          'venue-owner'::text,
          'producer'::text,
          'admin'::text
        ]
      )
    );
END
$$;
