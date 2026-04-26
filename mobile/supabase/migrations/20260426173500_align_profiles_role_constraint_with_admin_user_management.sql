-- Align profiles role constraint with current admin user management role model.
-- This keeps producer/admin roles available and normalizes legacy aliases.

DO $$
BEGIN
  UPDATE public.profiles
  SET role = 'musician'
  WHERE role IN ('manager', 'musician-member');

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
