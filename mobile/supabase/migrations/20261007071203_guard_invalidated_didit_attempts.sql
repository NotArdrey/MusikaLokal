-- Provider retries may retain audit data, but cannot revive a cancelled attempt.
create or replace function public.guard_invalidated_didit_attempt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if upper(coalesce(old.status, '')) like 'SUPERSEDED%' then
    new.status := old.status;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_invalidated_didit_attempt() from public, anon, authenticated;
create trigger guard_invalidated_didit_attempt
before update on public.verification_sessions
for each row execute function public.guard_invalidated_didit_attempt();
