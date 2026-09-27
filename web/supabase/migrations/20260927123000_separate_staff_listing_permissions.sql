-- Store listing mutations independently from booking-management access.
-- Existing level-1 assignments retain their previous capabilities.

alter table public.staff_listing_access
  add column if not exists can_edit_listing boolean not null default false,
  add column if not exists can_add_listing boolean not null default false,
  add column if not exists can_delete_listing boolean not null default false;

update public.staff_listing_access
set can_edit_listing = true,
    can_add_listing = true,
    can_delete_listing = true
where access_level = 1;

create or replace function public.staff_can_edit_studio(p_user_id uuid, p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(p_user_id) and exists (
    select 1 from public.staff_listing_access sla
    where sla.staff_user_id = p_user_id
      and sla.entity_type = 'studio'
      and sla.studio_id = p_studio_id
      and sla.can_edit_listing
      and sla.revoked_at is null
  );
$$;

create or replace function public.staff_can_edit_gig(p_user_id uuid, p_gig_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(p_user_id) and exists (
    select 1 from public.staff_listing_access sla
    where sla.staff_user_id = p_user_id
      and sla.entity_type = 'venue'
      and sla.gig_id = p_gig_id
      and sla.can_edit_listing
      and sla.revoked_at is null
  );
$$;

create or replace function public.staff_can_edit_production(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(p_user_id) and exists (
    select 1 from public.staff_listing_access sla
    where sla.staff_user_id = p_user_id
      and sla.entity_type = 'production'
      and sla.production_team_id = p_team_id
      and sla.can_edit_listing
      and sla.revoked_at is null
  );
$$;

create or replace function public.staff_can_delete_studio(p_user_id uuid, p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(p_user_id) and exists (
    select 1 from public.staff_listing_access sla
    where sla.staff_user_id = p_user_id
      and sla.entity_type = 'studio'
      and sla.studio_id = p_studio_id
      and sla.can_delete_listing
      and sla.revoked_at is null
  );
$$;

create or replace function public.staff_can_delete_gig(p_user_id uuid, p_gig_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(p_user_id) and exists (
    select 1 from public.staff_listing_access sla
    where sla.staff_user_id = p_user_id
      and sla.entity_type = 'venue'
      and sla.gig_id = p_gig_id
      and sla.can_delete_listing
      and sla.revoked_at is null
  );
$$;

create or replace function public.staff_can_delete_production(p_user_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(p_user_id) and exists (
    select 1 from public.staff_listing_access sla
    where sla.staff_user_id = p_user_id
      and sla.entity_type = 'production'
      and sla.production_team_id = p_team_id
      and sla.can_delete_listing
      and sla.revoked_at is null
  );
$$;

create or replace function public.staff_can_create_listing_for_owner(
  p_entity_type text,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_staff(auth.uid()) and case p_entity_type
    when 'studio' then exists (
      select 1
      from public.staff_listing_access sla
      join public.studios s on s.id = sla.studio_id
      where sla.staff_user_id = auth.uid()
        and sla.entity_type = 'studio'
        and sla.can_add_listing
        and sla.revoked_at is null
        and s.owner_id = p_owner_id
    )
    when 'venue' then exists (
      select 1
      from public.staff_listing_access sla
      join public.gigs g on g.id = sla.gig_id
      where sla.staff_user_id = auth.uid()
        and sla.entity_type = 'venue'
        and sla.can_add_listing
        and sla.revoked_at is null
        and g.organizer_id = p_owner_id
    )
    when 'production' then exists (
      select 1
      from public.staff_listing_access sla
      join public.production_teams pt on pt.id = sla.production_team_id
      where sla.staff_user_id = auth.uid()
        and sla.entity_type = 'production'
        and sla.can_add_listing
        and sla.revoked_at is null
        and pt.owner_id = p_owner_id
    )
    else false
  end;
$$;

create or replace function public.inherit_staff_access_for_created_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_entity_type text;
  v_access_level smallint;
  v_can_edit boolean := false;
  v_can_add boolean := false;
  v_can_delete boolean := false;
  v_marketplace boolean := false;
begin
  if v_actor is null then return new; end if;

  if tg_table_name = 'studios' then
    v_owner := new.owner_id;
    v_entity_type := 'studio';
  elsif tg_table_name = 'gigs' then
    v_owner := new.organizer_id;
    v_entity_type := 'venue';
  elsif tg_table_name = 'production_teams' then
    v_owner := new.owner_id;
    v_entity_type := 'production';
  else
    return new;
  end if;

  if v_owner = v_actor
     or not public.staff_can_create_listing_for_owner(v_entity_type, v_owner) then
    return new;
  end if;

  select min(sla.access_level),
         coalesce(bool_or(sla.can_edit_listing), false),
         coalesce(bool_or(sla.can_add_listing), false),
         coalesce(bool_or(sla.can_delete_listing), false),
         coalesce(bool_or(sla.can_manage_marketplace), false)
  into v_access_level, v_can_edit, v_can_add, v_can_delete, v_marketplace
  from public.staff_listing_access sla
  left join public.studios s on v_entity_type = 'studio' and s.id = sla.studio_id
  left join public.gigs g on v_entity_type = 'venue' and g.id = sla.gig_id
  left join public.production_teams pt on v_entity_type = 'production' and pt.id = sla.production_team_id
  where sla.staff_user_id = v_actor
    and sla.entity_type = v_entity_type
    and sla.can_add_listing
    and sla.revoked_at is null
    and case v_entity_type
      when 'studio' then s.owner_id = v_owner
      when 'venue' then g.organizer_id = v_owner
      when 'production' then pt.owner_id = v_owner
      else false
    end;

  insert into public.staff_listing_access (
    staff_user_id, entity_type, studio_id, gig_id, production_team_id,
    access_level, can_edit_listing, can_add_listing, can_delete_listing,
    can_manage_marketplace, created_by
  ) values (
    v_actor,
    v_entity_type,
    case when v_entity_type = 'studio' then new.id else null end,
    case when v_entity_type = 'venue' then new.id else null end,
    case when v_entity_type = 'production' then new.id else null end,
    coalesce(v_access_level, 3),
    v_can_edit,
    v_can_add,
    v_can_delete,
    v_marketplace,
    v_actor
  );

  return new;
end;
$$;

create or replace function public.delete_studio_as_full_access_staff(
  p_studio_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_result jsonb;
begin
  if v_actor is null or not public.staff_can_delete_studio(v_actor, p_studio_id) then
    raise exception 'Not authorized to delete this studio';
  end if;

  select owner_id into v_owner from public.studios where id = p_studio_id;
  if v_owner is null then
    return jsonb_build_object('success', false, 'code', 'STUDIO_NOT_FOUND', 'message', 'Studio not found.');
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_result := public.delete_studio_safely(p_studio_id, p_reason);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  if coalesce((v_result->>'success')::boolean, false) then
    update public.studio_deletion_audit
    set deleted_by = v_actor
    where studio_id = p_studio_id and deleted_by = v_owner;
  end if;

  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  raise;
end;
$$;

create or replace function public.delete_gig_as_full_access_staff(
  p_gig_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_result jsonb;
begin
  if v_actor is null or not public.staff_can_delete_gig(v_actor, p_gig_id) then
    raise exception 'Not authorized to delete this gig';
  end if;

  select organizer_id into v_owner from public.gigs where id = p_gig_id;
  if v_owner is null then
    return jsonb_build_object('success', false, 'code', 'GIG_NOT_FOUND', 'message', 'Gig not found.');
  end if;

  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_result := public.delete_gig_safely(p_gig_id, p_reason);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  if coalesce((v_result->>'success')::boolean, false) then
    update public.gig_deletion_audit
    set deleted_by = v_actor
    where gig_id = p_gig_id and deleted_by = v_owner;
  end if;

  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  raise;
end;
$$;

revoke all on function public.staff_can_edit_studio(uuid, uuid) from public, anon;
revoke all on function public.staff_can_edit_gig(uuid, uuid) from public, anon;
revoke all on function public.staff_can_edit_production(uuid, uuid) from public, anon;
revoke all on function public.staff_can_delete_studio(uuid, uuid) from public, anon;
revoke all on function public.staff_can_delete_gig(uuid, uuid) from public, anon;
revoke all on function public.staff_can_delete_production(uuid, uuid) from public, anon;
revoke all on function public.staff_can_create_listing_for_owner(text, uuid) from public, anon;
revoke all on function public.delete_studio_as_full_access_staff(uuid, text) from public, anon;
revoke all on function public.delete_gig_as_full_access_staff(uuid, text) from public, anon;
revoke all on function public.inherit_staff_access_for_created_listing() from public, anon, authenticated;

grant execute on function public.staff_can_edit_studio(uuid, uuid) to authenticated, service_role;
grant execute on function public.staff_can_edit_gig(uuid, uuid) to authenticated, service_role;
grant execute on function public.staff_can_edit_production(uuid, uuid) to authenticated, service_role;
grant execute on function public.staff_can_delete_studio(uuid, uuid) to authenticated, service_role;
grant execute on function public.staff_can_delete_gig(uuid, uuid) to authenticated, service_role;
grant execute on function public.staff_can_delete_production(uuid, uuid) to authenticated, service_role;
grant execute on function public.staff_can_create_listing_for_owner(text, uuid) to authenticated, service_role;
grant execute on function public.delete_studio_as_full_access_staff(uuid, text) to authenticated, service_role;
grant execute on function public.delete_gig_as_full_access_staff(uuid, text) to authenticated, service_role;
