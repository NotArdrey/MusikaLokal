-- Remove recursive admin policies on public.profiles.
-- These policies referenced public.profiles from inside profiles RLS checks,
-- which can trigger Postgres 42P17 (infinite recursion detected in policy).

drop policy if exists "profiles_select_admin" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
drop policy if exists "Admins can read all profiles" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
