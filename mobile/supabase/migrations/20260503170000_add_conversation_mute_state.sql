alter table public.conversation_participants
  add column if not exists is_muted boolean not null default false;

alter table public.conversation_participants
  add column if not exists muted_until timestamp with time zone;

update public.conversation_participants
set is_muted = false
where is_muted is null;

alter table public.conversation_participants
  alter column is_muted set default false,
  alter column is_muted set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversation_participants_muted_until_requires_mute'
      and conrelid = 'public.conversation_participants'::regclass
  ) then
    alter table public.conversation_participants
      add constraint conversation_participants_muted_until_requires_mute
      check (is_muted or muted_until is null);
  end if;
end $$;

create index if not exists idx_conversation_participants_user_conversation
  on public.conversation_participants (user_id, conversation_id);

create index if not exists idx_conversation_participants_conversation_user
  on public.conversation_participants (conversation_id, user_id);

create index if not exists idx_conversation_participants_muted_by_user
  on public.conversation_participants (user_id, conversation_id, muted_until)
  where is_muted = true;

create or replace function public.set_conversation_mute(
  p_conversation_id uuid,
  p_muted boolean,
  p_muted_until timestamp with time zone default null
)
returns table (
  conversation_id uuid,
  user_id uuid,
  is_muted boolean,
  muted_until timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_id is required' using errcode = '22023';
  end if;

  return query
  update public.conversation_participants cp
  set
    is_muted = coalesce(p_muted, false),
    muted_until = case
      when coalesce(p_muted, false) then p_muted_until
      else null
    end
  where cp.conversation_id = p_conversation_id
    and cp.user_id = v_user_id
  returning cp.conversation_id, cp.user_id, cp.is_muted, cp.muted_until;

  if not found then
    raise exception 'Conversation participant not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_conversation_mute(uuid, boolean, timestamp with time zone) from public;
grant execute on function public.set_conversation_mute(uuid, boolean, timestamp with time zone) to authenticated;

comment on function public.set_conversation_mute(uuid, boolean, timestamp with time zone)
  is 'Updates the authenticated user mute state for a conversation participant row.';
