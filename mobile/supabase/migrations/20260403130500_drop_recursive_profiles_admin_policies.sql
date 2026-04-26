-- Remove recursive admin policies on public.profiles.
-- These policies can cause Postgres 42P17 (infinite recursion detected in policy),
-- which surfaces as "Database error querying schema" during profile reads on login.

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
