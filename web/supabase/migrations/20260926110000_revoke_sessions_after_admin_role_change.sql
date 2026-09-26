-- Admin role changes must start from a fresh authenticated session. This RPC is
-- intentionally restricted to the service role used by trusted edge functions.
create or replace function public.revoke_user_auth_sessions(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  delete from auth.sessions where user_id = p_user_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.revoke_user_auth_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_auth_sessions(uuid) to service_role;
