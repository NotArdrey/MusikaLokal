-- Route Android push notifications through a fresh high-importance channel.
-- Existing Android channels keep their old importance, so reusing "default"
-- can keep heads-up banners disabled on devices that created it earlier.
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
          'channelId', 'musika-lokal-alerts-v2',
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
