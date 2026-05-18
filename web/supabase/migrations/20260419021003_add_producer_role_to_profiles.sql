-- Phase 1: Expand profiles role CHECK to include 'producer' and 'admin'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['musician'::text, 'studio-owner'::text, 'venue-owner'::text, 'producer'::text, 'admin'::text]));
