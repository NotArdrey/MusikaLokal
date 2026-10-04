-- Existing clients already subscribe to these tables for cache invalidation.
-- Publish updates so activation, deactivation and completion refresh other clients too.
alter publication supabase_realtime add table public.groups, public.studios, public.gigs, public.production_teams;
