-- Keep notifications.type as the existing severity field while preserving
-- follower activity semantics in meta.event_type for routing and filtering.

create or replace function public.notify_profile_followers(
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_image text default null,
  p_meta jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_event_type text := nullif(btrim(coalesce(p_type, '')), '');
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if p_actor_id is null or v_event_type is null then
    return 0;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    image,
    meta,
    read
  )
  select distinct
    f.follower_id,
    'info',
    left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'New activity'), 180),
    left(coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'Someone you follow has a new update.'), 500),
    nullif(btrim(coalesce(p_image, '')), ''),
    jsonb_strip_nulls(
      v_meta ||
      jsonb_build_object(
        'event_type', v_event_type,
        'notification_type', v_event_type,
        'type', v_event_type,
        'actor_id', p_actor_id,
        'profile_id', p_actor_id,
        'followed_user_id', p_actor_id
      )
    ),
    false
  from public.follows f
  where f.followed_type = 'profile'
    and f.followed_id = p_actor_id
    and f.follower_id <> p_actor_id;

  get diagnostics v_inserted = row_count;
  return v_inserted;
exception
  when others then
    raise warning 'notify_profile_followers failed for actor %, type %: %', p_actor_id, p_type, sqlerrm;
    return 0;
end;
$$;

revoke all on function public.notify_profile_followers(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.notify_profile_followers(uuid, text, text, text, text, jsonb) to service_role;
