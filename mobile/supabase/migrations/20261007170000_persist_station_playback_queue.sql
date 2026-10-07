-- NULL keeps a station's existing playlist order until its next admin edit.
alter table public.stations
  add column if not exists queue_item_ids uuid[],
  add column if not exists queue_revision bigint not null default 0,
  add column if not exists queue_anchor_at timestamptz;

create or replace function public.guard_station_queue_fields()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') and (
    (tg_op = 'INSERT' and (new.queue_item_ids is not null or new.queue_revision <> 0 or new.queue_anchor_at is not null))
    or (tg_op = 'UPDATE' and (new.queue_item_ids is distinct from old.queue_item_ids
      or new.queue_revision is distinct from old.queue_revision or new.queue_anchor_at is distinct from old.queue_anchor_at))
  ) then
    raise exception 'Station queues must be saved through the admin service' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_station_queue_fields on public.stations;
create trigger guard_station_queue_fields before insert or update on public.stations
for each row execute function public.guard_station_queue_fields();

create or replace function public.admin_save_station_queue(
  p_admin_id uuid, p_station_id uuid, p_patch jsonb, p_playlist_ids uuid[], p_item_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station public.stations%rowtype;
  v_profile_id uuid := (p_patch->>'managed_profile_id')::uuid;
  v_group_id uuid := (p_patch->>'managed_group_id')::uuid;
  v_items uuid[];
begin
  if not exists(select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if v_profile_id is null then raise exception 'Station owner is required'; end if;
  if coalesce(cardinality(p_playlist_ids), 0) = 0
    or cardinality(p_playlist_ids) <> (select count(distinct id) from unnest(p_playlist_ids) id)
  then raise exception 'Select distinct eligible playlists'; end if;

  -- Serializes saves for a source, including two simultaneous first saves.
  perform pg_advisory_xact_lock(hashtextextended('station-source:' || coalesce(v_group_id, v_profile_id)::text, 0));
  if p_station_id is not null then
    select * into v_station from public.stations where id = p_station_id for update;
    if not found then raise exception 'Station not found'; end if;
    if coalesce(v_station.managed_profile_id, v_station.creator_id) <> v_profile_id
      or v_station.managed_group_id is distinct from v_group_id
    then raise exception 'Station source changed'; end if;
  else
    select * into v_station from public.stations
      where (v_group_id is not null and managed_group_id = v_group_id)
        or (v_group_id is null and managed_group_id is null and coalesce(managed_profile_id, creator_id) = v_profile_id)
      order by created_at, id limit 1 for update;
  end if;

  perform 1 from public.playlists where id = any(p_playlist_ids) for share;
  if (select count(*) from public.playlists where id = any(p_playlist_ids) and is_hidden is not true) <> cardinality(p_playlist_ids)
  then raise exception 'A selected playlist is unavailable'; end if;
  perform 1 from public.playlist_items where playlist_id = any(p_playlist_ids) for share;
  select coalesce(array_agg(i.id order by array_position(p_playlist_ids, i.playlist_id), i.position, i.id), '{}'::uuid[])
    into v_items
    from public.playlist_items i left join public.playlist_teaser_assets t on t.id = i.teaser_asset_id
    where i.playlist_id = any(p_playlist_ids) and coalesce(i.copyright_status, 'not_required') in ('not_required', 'approved')
      and t.screen_result is distinct from 'failed'
      and (nullif(btrim(i.audio_url), '') is not null or nullif(btrim(t.storage_path), '') is not null);
  if p_item_ids is not null then
    if cardinality(p_item_ids) <> (select count(distinct id) from unnest(p_item_ids) id)
      or not p_item_ids <@ v_items then raise exception 'A selected track is unavailable or outside the selected playlists'; end if;
    v_items := p_item_ids;
  end if;
  if cardinality(v_items) = 0 then raise exception 'Select at least one playable track'; end if;

  if v_station.id is null then
    insert into public.stations(creator_id, managed_profile_id, managed_group_id, name)
      values(p_admin_id, v_profile_id, v_group_id, p_patch->>'name') returning * into v_station;
  end if;
  update public.stations set
    creator_id = p_admin_id, managed_profile_id = v_profile_id, managed_group_id = v_group_id,
    name = p_patch->>'name', description = p_patch->>'description', genre = p_patch->>'genre',
    cover_image_url = p_patch->>'cover_image_url',
    is_active = coalesce((p_patch->>'is_active')::boolean, true),
    is_featured = coalesce((p_patch->>'is_featured')::boolean, false),
    rotation_interval_minutes = coalesce((p_patch->>'rotation_interval_minutes')::integer, 15),
    stream_url = null, stream_status = 'offline', now_playing_title = null, now_playing_artist = null, last_seen_live_at = null,
    queue_item_ids = v_items, queue_revision = queue_revision + 1, queue_anchor_at = clock_timestamp()
    where id = v_station.id returning * into v_station;
  delete from public.station_playlist_slots where station_id = v_station.id;
  insert into public.station_playlist_slots(station_id, playlist_id, position, is_active)
    select v_station.id, id, (ordinality - 1)::integer, true from unnest(p_playlist_ids) with ordinality as ids(id, ordinality);
  return to_jsonb(v_station);
end;
$$;
revoke all on function public.admin_save_station_queue(uuid, uuid, jsonb, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.admin_save_station_queue(uuid, uuid, jsonb, uuid[], uuid[]) to service_role;

-- The existing mobile playlist toggles also update the shared revision atomically.
create or replace function public.admin_change_station_playlist(
  p_admin_id uuid, p_station_id uuid, p_playlist_id uuid, p_remove boolean, p_slot_patch jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_station public.stations%rowtype;
  v_slot_id uuid;
  v_items uuid[];
  v_added uuid[] := '{}';
begin
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    raise exception 'Admin role required' using errcode='42501';
  end if;
  select * into v_station from public.stations where id=p_station_id for update;
  if not found then raise exception 'Station not found'; end if;
  select id into v_slot_id from public.station_playlist_slots
    where station_id=p_station_id and playlist_id=p_playlist_id order by position, id limit 1;
  if (p_remove and v_slot_id is null) or (not p_remove and v_slot_id is not null) then
    return jsonb_build_object('on_radio', not p_remove, 'slot_id', v_slot_id, 'station_id', p_station_id);
  end if;
  if p_remove then
    delete from public.station_playlist_slots where station_id=p_station_id and playlist_id=p_playlist_id;
  else
    perform 1 from public.playlists where id=p_playlist_id and is_hidden is not true for share;
    if not found then raise exception 'Playlist is unavailable'; end if;
    insert into public.station_playlist_slots(station_id,playlist_id,position,is_active,label,starts_at,ends_at)
      values(p_station_id,p_playlist_id,coalesce((select max(position)+1 from public.station_playlist_slots where station_id=p_station_id),0),true,
        p_slot_patch->>'label',(p_slot_patch->>'starts_at')::timestamptz,(p_slot_patch->>'ends_at')::timestamptz)
      returning id into v_slot_id;
    select coalesce(array_agg(i.id order by i.position,i.id),'{}'::uuid[]) into v_added from public.playlist_items i
      left join public.playlist_teaser_assets t on t.id=i.teaser_asset_id
      where i.playlist_id=p_playlist_id and coalesce(i.copyright_status,'not_required') in ('not_required','approved')
        and t.screen_result is distinct from 'failed' and (nullif(btrim(i.audio_url),'') is not null or nullif(btrim(t.storage_path),'') is not null);
  end if;
  if v_station.queue_item_ids is null then
    select coalesce(array_agg(id order by slot_position,item_position,id),'{}'::uuid[]) into v_items from (
      select i.id,min(sl.position) slot_position,i.position item_position from public.station_playlist_slots sl
      join public.playlists p on p.id=sl.playlist_id join public.playlist_items i on i.playlist_id=p.id
      left join public.playlist_teaser_assets t on t.id=i.teaser_asset_id
      where sl.station_id=p_station_id and sl.is_active is not false and p.is_hidden is not true
        and coalesce(i.copyright_status,'not_required') in ('not_required','approved') and t.screen_result is distinct from 'failed'
        and (nullif(btrim(i.audio_url),'') is not null or nullif(btrim(t.storage_path),'') is not null)
      group by i.id,i.position
    ) playable;
  else
    select coalesce(array_agg(id order by ordinality),'{}'::uuid[]) into v_items from unnest(v_station.queue_item_ids) with ordinality ids(id,ordinality)
      where exists(select 1 from public.playlist_items i join public.station_playlist_slots sl on sl.playlist_id=i.playlist_id
        where i.id=ids.id and sl.station_id=p_station_id and sl.is_active is not false);
    select v_items || coalesce(array_agg(id order by ordinality),'{}'::uuid[]) into v_items
      from unnest(v_added) with ordinality ids(id,ordinality) where not id=any(v_items);
  end if;
  update public.stations set creator_id=p_admin_id,managed_profile_id=coalesce(managed_profile_id,v_station.creator_id),
    queue_item_ids=v_items,queue_revision=queue_revision+1,queue_anchor_at=clock_timestamp() where id=p_station_id;
  return jsonb_build_object('on_radio',not p_remove,'slot_id',v_slot_id,'station_id',p_station_id);
end;
$$;
revoke all on function public.admin_change_station_playlist(uuid,uuid,uuid,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.admin_change_station_playlist(uuid,uuid,uuid,boolean,jsonb) to service_role;

-- One snapshot prevents a listener mixing one revision with another revision's slots.
create or replace function public.get_station_playback_snapshot(p_station_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('station', to_jsonb(s) || jsonb_build_object(
    'creator', (select jsonb_build_object('id', id, 'full_name', full_name, 'avatar_url', avatar_url) from public.profiles where id = s.creator_id),
    'managed_profile', (select jsonb_build_object('id', id, 'full_name', full_name, 'avatar_url', avatar_url) from public.profiles where id = s.managed_profile_id),
    'managed_group', (select jsonb_build_object('id', id, 'name', name, 'group_type', group_type, 'genre', genre) from public.groups where id = s.managed_group_id)
  ), 'slots', coalesce((
    select jsonb_agg(to_jsonb(sl) || jsonb_build_object('playlist', to_jsonb(p) || jsonb_build_object('items', coalesce((
      select jsonb_agg(to_jsonb(i) || jsonb_build_object('teaser', to_jsonb(t)) order by i.position, i.id)
      from public.playlist_items i left join public.playlist_teaser_assets t on t.id = i.teaser_asset_id
      where i.playlist_id = p.id and coalesce(i.copyright_status, 'not_required') in ('not_required', 'approved')
        and t.screen_result is distinct from 'failed'
    ), '[]'::jsonb))) order by sl.position, sl.id)
    from public.station_playlist_slots sl join public.playlists p on p.id = sl.playlist_id
    where sl.station_id = s.id and p.is_hidden is not true
  ), '[]'::jsonb)) from public.stations s where s.id = p_station_id;
$$;
revoke all on function public.get_station_playback_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_station_playback_snapshot(uuid) to service_role;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stations')
  then alter publication supabase_realtime add table public.stations; end if;
end $$;
