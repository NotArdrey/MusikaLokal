-- Fan out follower notifications when followed creators publish new social/feed activity.
-- Uses set-based inserts against follows(followed_type, followed_id, follower_id).

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
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if p_actor_id is null or nullif(btrim(coalesce(p_type, '')), '') is null then
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
    p_type,
    left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'New activity'), 180),
    left(coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'Someone you follow has a new update.'), 500),
    nullif(btrim(coalesce(p_image, '')), ''),
    jsonb_strip_nulls(
      v_meta ||
      jsonb_build_object(
        'event_type', p_type,
        'type', p_type,
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

create or replace function public.notify_followers_on_feed_post_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_excerpt text;
begin
  if new.author_id is null
    or coalesce(new.is_hidden, false) = true
    or lower(coalesce(new.visibility, 'public')) not in ('public', 'followers') then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.author_id;

  v_excerpt := nullif(btrim(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g')), '');

  perform public.notify_profile_followers(
    new.author_id,
    'followed_post_created',
    v_actor_name || ' posted something new',
    case
      when v_excerpt is not null then v_actor_name || ': ' || left(v_excerpt, 140)
      else v_actor_name || ' shared a new post.'
    end,
    v_actor_avatar,
    jsonb_build_object(
      'post_id', new.id,
      'route', '/post_details',
      'route_params', jsonb_build_object('post_id', new.id),
      'visibility', new.visibility
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_feed_post_created on public.feed_posts;
create trigger trg_notify_followers_on_feed_post_created
after insert on public.feed_posts
for each row
execute function public.notify_followers_on_feed_post_created();

create or replace function public.notify_followers_on_gig_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_was_visible boolean := false;
  v_is_visible boolean := false;
  v_gig_name text;
begin
  v_is_visible :=
    lower(coalesce(new.permit_status, 'pending_review')) = 'approved'
    and lower(coalesce(new.status, 'open')) = 'open';

  if tg_op = 'UPDATE' then
    v_was_visible :=
      lower(coalesce(old.permit_status, 'pending_review')) = 'approved'
      and lower(coalesce(old.status, 'open')) = 'open';

    if v_was_visible or not v_is_visible then
      return new;
    end if;
  elsif not v_is_visible then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.organizer_id;

  v_gig_name := coalesce(nullif(btrim(new.name), ''), 'a new gig');

  perform public.notify_profile_followers(
    new.organizer_id,
    'followed_gig_created',
    v_actor_name || ' created a new gig',
    v_actor_name || ' created "' || left(v_gig_name, 120) || '".',
    v_actor_avatar,
    jsonb_build_object(
      'gig_id', new.id,
      'listing_id', new.id,
      'listing_type', 'gig',
      'listing_name', v_gig_name,
      'route', '/feed',
      'route_params', jsonb_build_object('reopenListingId', new.id)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_gig_published on public.gigs;
create trigger trg_notify_followers_on_gig_published
after insert or update of permit_status, status on public.gigs
for each row
execute function public.notify_followers_on_gig_published();

create or replace function public.notify_followers_on_studio_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_actor_role text;
  v_label text := 'studio';
  v_type text := 'followed_studio_created';
  v_was_visible boolean := false;
  v_is_visible boolean := false;
  v_studio_name text;
begin
  v_is_visible := lower(coalesce(new.permit_status, 'pending_review')) = 'approved';

  if tg_op = 'UPDATE' then
    v_was_visible := lower(coalesce(old.permit_status, 'pending_review')) = 'approved';

    if v_was_visible or not v_is_visible then
      return new;
    end if;
  elsif not v_is_visible then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url,
    lower(coalesce(p.role, ''))
  into v_actor_name, v_actor_avatar, v_actor_role
  from public.profiles p
  where p.id = new.owner_id;

  if v_actor_role = 'venue-owner' then
    v_label := 'venue';
    v_type := 'followed_venue_created';
  end if;

  v_studio_name := coalesce(nullif(btrim(new.name), ''), 'a new ' || v_label);

  perform public.notify_profile_followers(
    new.owner_id,
    v_type,
    v_actor_name || ' created a new ' || v_label,
    v_actor_name || ' created "' || left(v_studio_name, 120) || '".',
    v_actor_avatar,
    jsonb_build_object(
      'studio_id', new.id,
      'listing_id', new.id,
      'listing_type', 'studio',
      'display_listing_type', v_label,
      'listing_name', v_studio_name,
      'route', '/feed',
      'route_params', jsonb_build_object('reopenListingId', new.id)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_studio_published on public.studios;
create trigger trg_notify_followers_on_studio_published
after insert or update of permit_status on public.studios
for each row
execute function public.notify_followers_on_studio_published();

create or replace function public.notify_followers_on_group_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_group_name text;
begin
  if new.owner_id is null then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.owner_id;

  v_group_name := coalesce(nullif(btrim(new.name), ''), 'a new group');

  perform public.notify_profile_followers(
    new.owner_id,
    'followed_group_created',
    v_actor_name || ' created a new group',
    v_actor_name || ' created "' || left(v_group_name, 120) || '".',
    v_actor_avatar,
    jsonb_build_object(
      'group_id', new.id,
      'listing_id', new.id,
      'listing_type', 'group',
      'listing_name', v_group_name,
      'route', '/group_details',
      'route_params', jsonb_build_object('id', new.id)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_group_created on public.groups;
create trigger trg_notify_followers_on_group_created
after insert on public.groups
for each row
execute function public.notify_followers_on_group_created();

create or replace function public.notify_followers_on_production_team_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_team_name text;
begin
  if new.owner_id is null then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.owner_id;

  v_team_name := coalesce(nullif(btrim(new.name), ''), 'a new production team');

  perform public.notify_profile_followers(
    new.owner_id,
    'followed_production_created',
    v_actor_name || ' created a production team',
    v_actor_name || ' created "' || left(v_team_name, 120) || '".',
    coalesce(nullif(btrim(new.logo_url), ''), v_actor_avatar),
    jsonb_build_object(
      'production_team_id', new.id,
      'team_id', new.id,
      'listing_id', new.id,
      'listing_type', 'production_team',
      'listing_name', v_team_name,
      'route', '/production_team',
      'route_params', jsonb_build_object('teamId', new.id)
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_followers_on_production_team_created on public.production_teams;
create trigger trg_notify_followers_on_production_team_created
after insert on public.production_teams
for each row
execute function public.notify_followers_on_production_team_created();
