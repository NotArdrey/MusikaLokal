-- Supabase default privileges can grant anon directly, independently of PUBLIC.
begin;
revoke all on function public.update_gig_with_cooldown_safely(uuid, jsonb, integer, text) from anon;
notify pgrst, 'reload schema';
commit;
