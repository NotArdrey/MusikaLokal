-- Supabase grants new public-schema functions to API roles through default
-- privileges. Keep these staff helpers unavailable to anonymous callers.

revoke all on function public.staff_can_create_listing_for_owner(text, uuid) from public, anon;
revoke all on function public.delete_studio_as_full_access_staff(uuid, text) from public, anon;
revoke all on function public.delete_gig_as_full_access_staff(uuid, text) from public, anon;
revoke all on function public.inherit_staff_access_for_created_listing() from public, anon, authenticated;

grant execute on function public.staff_can_create_listing_for_owner(text, uuid) to authenticated, service_role;
grant execute on function public.delete_studio_as_full_access_staff(uuid, text) to authenticated, service_role;
grant execute on function public.delete_gig_as_full_access_staff(uuid, text) to authenticated, service_role;
