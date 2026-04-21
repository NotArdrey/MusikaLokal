alter table public.notification_preferences
add column if not exists push_enabled boolean not null default true;

create table if not exists public.push_notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  installation_id text not null,
  push_token text not null,
  token_type text not null default 'expo' check (token_type in ('expo')),
  platform text check (platform in ('android', 'ios')),
  device_name text,
  app_version text,
  project_id text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  disabled_at timestamptz,
  disabled_reason text
);

create unique index if not exists push_notification_devices_installation_id_key
  on public.push_notification_devices (installation_id);

create index if not exists idx_push_notification_devices_user_active
  on public.push_notification_devices (user_id, last_seen_at desc)
  where is_active = true;

create index if not exists idx_push_notification_devices_token_active
  on public.push_notification_devices (push_token)
  where is_active = true;

alter table public.push_notification_devices enable row level security;

drop policy if exists "Users can view their push devices" on public.push_notification_devices;
create policy "Users can view their push devices"
on public.push_notification_devices
for select
to authenticated
using (auth.uid() = user_id);

grant select on public.push_notification_devices to authenticated;

create or replace function public.register_push_device(
  p_installation_id text,
  p_push_token text,
  p_platform text default null,
  p_device_name text default null,
  p_app_version text default null,
  p_project_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  normalized_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  normalized_push_token text := nullif(trim(coalesce(p_push_token, '')), '');
  normalized_platform text := lower(nullif(trim(coalesce(p_platform, '')), ''));
  registered_device_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if normalized_installation_id is null then
    raise exception 'installation_id is required'
      using errcode = '22023';
  end if;

  if normalized_push_token is null then
    raise exception 'push_token is required'
      using errcode = '22023';
  end if;

  if normalized_platform is not null and normalized_platform not in ('android', 'ios') then
    normalized_platform := null;
  end if;

  update public.push_notification_devices
  set is_active = false,
      disabled_at = timezone('utc', now()),
      disabled_reason = 'superseded_token',
      updated_at = timezone('utc', now())
  where push_token = normalized_push_token
    and installation_id <> normalized_installation_id
    and is_active = true;

  insert into public.push_notification_devices (
    user_id,
    installation_id,
    push_token,
    token_type,
    platform,
    device_name,
    app_version,
    project_id,
    is_active,
    last_seen_at,
    updated_at,
    disabled_at,
    disabled_reason
  )
  values (
    requesting_user_id,
    normalized_installation_id,
    normalized_push_token,
    'expo',
    normalized_platform,
    nullif(trim(coalesce(p_device_name, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), ''),
    nullif(trim(coalesce(p_project_id, '')), ''),
    true,
    timezone('utc', now()),
    timezone('utc', now()),
    null,
    null
  )
  on conflict (installation_id) do update
  set user_id = excluded.user_id,
      push_token = excluded.push_token,
      token_type = excluded.token_type,
      platform = excluded.platform,
      device_name = excluded.device_name,
      app_version = excluded.app_version,
      project_id = excluded.project_id,
      is_active = true,
      last_seen_at = timezone('utc', now()),
      updated_at = timezone('utc', now()),
      disabled_at = null,
      disabled_reason = null
  returning id into registered_device_id;

  return registered_device_id;
end;
$$;

create or replace function public.unregister_push_device(
  p_installation_id text,
  p_reason text default 'signed_out'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  normalized_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  normalized_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'disabled');
begin
  if requesting_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if normalized_installation_id is null then
    return;
  end if;

  update public.push_notification_devices
  set is_active = false,
      disabled_at = timezone('utc', now()),
      disabled_reason = normalized_reason,
      updated_at = timezone('utc', now())
  where installation_id = normalized_installation_id
    and user_id = requesting_user_id;
end;
$$;

grant execute on function public.register_push_device(text, text, text, text, text, text) to authenticated;
grant execute on function public.unregister_push_device(text, text) to authenticated;

create or replace function public.dispatch_push_notification_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  should_send_push boolean := true;
  notification_route text := coalesce(nullif(trim(coalesce(new.meta ->> 'route', '')), ''), '/notifications');
  notification_params jsonb := case
    when jsonb_typeof(new.meta -> 'route_params') = 'object' then new.meta -> 'route_params'
    else '{}'::jsonb
  end;
  active_device record;
begin
  if new.user_id is null or coalesce(new.read, false) = true then
    return new;
  end if;

  if nullif(trim(coalesce(new.message, '')), '') is null then
    return new;
  end if;

  select coalesce(
    (
      select notification_preferences.push_enabled
      from public.notification_preferences
      where notification_preferences.user_id = new.user_id
    ),
    true
  ) into should_send_push;

  if should_send_push is false then
    return new;
  end if;

  for active_device in
    select distinct on (push_token) push_token
    from public.push_notification_devices
    where user_id = new.user_id
      and is_active = true
      and (
        push_token like 'ExponentPushToken[%]'
        or push_token like 'ExpoPushToken[%]'
      )
  loop
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', active_device.push_token,
          'title', coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Notification'),
          'body', new.message,
          'sound', 'default',
          'channelId', 'default',
          'priority', 'high',
          'data', jsonb_build_object(
            'notificationId', new.id,
            'route', notification_route,
            'params', notification_params,
            'meta', coalesce(new.meta, '{}'::jsonb)
          )
        ),
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Accept', 'application/json',
          'Content-Type', 'application/json'
        ),
        timeout_milliseconds := 1000
      );
    exception
      when others then
        raise notice 'Push dispatch skipped for notification %: %', new.id, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_dispatch_push_notification_on_insert on public.notifications;
create trigger trg_dispatch_push_notification_on_insert
after insert on public.notifications
for each row
execute function public.dispatch_push_notification_on_insert();
