insert into public.conversation_participants (conversation_id, user_id, role)
select c.id, c.participant_1, 'member'
from public.conversations c
where c.participant_1 is not null
on conflict (conversation_id, user_id) do nothing;

insert into public.conversation_participants (conversation_id, user_id, role)
select c.id, c.participant_2, 'member'
from public.conversations c
where c.participant_2 is not null
on conflict (conversation_id, user_id) do nothing;

create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conv_id
      and cp.user_id = auth.uid()
  );
$function$;

create or replace function public.create_group_conversation(p_group_id uuid, p_creator_id uuid)
returns uuid
language plpgsql
security definer
as $function$
declare
    v_conversation_id uuid;
    v_member record;
begin
    select id into v_conversation_id
    from public.conversations
    where group_id = p_group_id and is_group = true
    limit 1;

    if v_conversation_id is not null then
        return v_conversation_id;
    end if;

    insert into public.conversations (is_group, group_id)
    values (true, p_group_id)
    returning id into v_conversation_id;

    for v_member in
        select user_id, role from public.group_members where group_id = p_group_id
    loop
        insert into public.conversation_participants (conversation_id, user_id, role)
        values (
            v_conversation_id,
            v_member.user_id,
            case when v_member.role = 'owner' then 'owner' else 'member' end
        )
        on conflict (conversation_id, user_id) do nothing;
    end loop;

    if p_creator_id is not null then
      insert into public.conversation_participants (conversation_id, user_id, role)
      values (v_conversation_id, p_creator_id, 'owner')
      on conflict (conversation_id, user_id) do nothing;
    end if;

    return v_conversation_id;
end;
$function$;

drop trigger if exists trg_conversations_fill_group_display_fields on public.conversations;
drop trigger if exists trg_groups_propagate_to_conversations on public.groups;

drop function if exists public.trg_conversations_fill_group_display_fields();
drop function if exists public.trg_groups_propagate_to_conversations();

drop policy if exists "Users can view their conversations" on public.conversations;
create policy "Users can view their conversations"
on public.conversations
for select
using (public.is_conversation_member(id));

drop policy if exists "Users can update their conversations" on public.conversations;
create policy "Users can update their conversations"
on public.conversations
for update
using (public.is_conversation_member(id));

drop policy if exists "Users can create conversations" on public.conversations;
create policy "Users can create conversations"
on public.conversations
for insert
with check (auth.uid() is not null);

drop policy if exists "Users can send messages in their conversations" on public.messages;
create policy "Users can send messages in their conversations"
on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can send messages to their conversations" on public.messages;
create policy "Users can send messages to their conversations"
on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can update messages" on public.messages;
create policy "Users can update messages"
on public.messages
for update
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can view messages in their conversations" on public.messages;
create policy "Users can view messages in their conversations"
on public.messages
for select
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can add reactions" on public.message_reactions;
create policy "Users can add reactions"
on public.message_reactions
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.messages m
    join public.conversation_participants cp on cp.conversation_id = m.conversation_id
    where m.id = message_reactions.message_id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can view reactions in their conversations" on public.message_reactions;
create policy "Users can view reactions in their conversations"
on public.message_reactions
for select
using (
  exists (
    select 1
    from public.messages m
    join public.conversation_participants cp on cp.conversation_id = m.conversation_id
    where m.id = message_reactions.message_id
      and cp.user_id = auth.uid()
  )
);

create or replace view public.conversations_display_projection as
 select c.id,
    c.group_id,
    c.is_group,
    case
      when c.group_id is not null then g.name
      else null::text
    end as group_name,
    case
      when c.group_id is not null then glp.images[1]
      else null::text
    end as group_avatar_url
 from public.conversations c
 left join public.groups g on g.id = c.group_id
 left join public.groups_legacy_projection glp on glp.id = c.group_id;

alter table public.conversations
  drop constraint if exists unique_conversation;

alter table public.conversations
  drop column if exists participant_1,
  drop column if exists participant_2,
  drop column if exists group_name,
  drop column if exists group_avatar_url;

delete from public.normalization_exceptions
where table_name = 'conversations'
  and column_name in ('group_name', 'group_avatar_url');