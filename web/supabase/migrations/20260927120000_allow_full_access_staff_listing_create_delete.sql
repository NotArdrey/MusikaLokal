-- Access level 1 is full owner-equivalent listing access. Staff creation is
-- scoped to an owner they already represent, and the new listing inherits an
-- active assignment so follow-up writes remain authorized.

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
        and sla.access_level = 1
        and sla.revoked_at is null
        and s.owner_id = p_owner_id
    )
    when 'venue' then exists (
      select 1
      from public.staff_listing_access sla
      join public.gigs g on g.id = sla.gig_id
      where sla.staff_user_id = auth.uid()
        and sla.entity_type = 'venue'
        and sla.access_level = 1
        and sla.revoked_at is null
        and g.organizer_id = p_owner_id
    )
    when 'production' then exists (
      select 1
      from public.staff_listing_access sla
      join public.production_teams pt on pt.id = sla.production_team_id
      where sla.staff_user_id = auth.uid()
        and sla.entity_type = 'production'
        and sla.access_level = 1
        and sla.revoked_at is null
        and pt.owner_id = p_owner_id
    )
    else false
  end;
$$;

revoke all on function public.staff_can_create_listing_for_owner(text, uuid) from public;
grant execute on function public.staff_can_create_listing_for_owner(text, uuid) to authenticated, service_role;

drop policy if exists staff_can_create_studios_for_assigned_owner on public.studios;
create policy staff_can_create_studios_for_assigned_owner
  on public.studios for insert to authenticated
  with check (public.staff_can_create_listing_for_owner('studio', owner_id));

drop policy if exists staff_can_create_gigs_for_assigned_owner on public.gigs;
create policy staff_can_create_gigs_for_assigned_owner
  on public.gigs for insert to authenticated
  with check (public.staff_can_create_listing_for_owner('venue', organizer_id));

drop policy if exists staff_can_create_production_for_assigned_owner on public.production_teams;
create policy staff_can_create_production_for_assigned_owner
  on public.production_teams for insert to authenticated
  with check (public.staff_can_create_listing_for_owner('production', owner_id));

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
  v_marketplace boolean := false;
begin
  if v_actor is null then
    return new;
  end if;

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

  select coalesce(bool_or(sla.can_manage_marketplace), false)
  into v_marketplace
  from public.staff_listing_access sla
  left join public.studios s on v_entity_type = 'studio' and s.id = sla.studio_id
  left join public.gigs g on v_entity_type = 'venue' and g.id = sla.gig_id
  left join public.production_teams pt on v_entity_type = 'production' and pt.id = sla.production_team_id
  where sla.staff_user_id = v_actor
    and sla.entity_type = v_entity_type
    and sla.access_level = 1
    and sla.revoked_at is null
    and case v_entity_type
      when 'studio' then s.owner_id = v_owner
      when 'venue' then g.organizer_id = v_owner
      when 'production' then pt.owner_id = v_owner
      else false
    end;

  insert into public.staff_listing_access (
    staff_user_id,
    entity_type,
    studio_id,
    gig_id,
    production_team_id,
    access_level,
    can_manage_marketplace,
    created_by
  ) values (
    v_actor,
    v_entity_type,
    case when v_entity_type = 'studio' then new.id else null end,
    case when v_entity_type = 'venue' then new.id else null end,
    case when v_entity_type = 'production' then new.id else null end,
    1,
    v_marketplace,
    v_actor
  );

  return new;
end;
$$;

drop trigger if exists trg_inherit_staff_access_on_studio_create on public.studios;
create trigger trg_inherit_staff_access_on_studio_create
  after insert on public.studios
  for each row execute function public.inherit_staff_access_for_created_listing();

drop trigger if exists trg_inherit_staff_access_on_gig_create on public.gigs;
create trigger trg_inherit_staff_access_on_gig_create
  after insert on public.gigs
  for each row execute function public.inherit_staff_access_for_created_listing();

drop trigger if exists trg_inherit_staff_access_on_production_create on public.production_teams;
create trigger trg_inherit_staff_access_on_production_create
  after insert on public.production_teams
  for each row execute function public.inherit_staff_access_for_created_listing();

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
  if v_actor is null or not public.staff_can_edit_studio(v_actor, p_studio_id) then
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
  if v_actor is null or not public.staff_can_edit_gig(v_actor, p_gig_id) then
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

revoke all on function public.delete_studio_as_full_access_staff(uuid, text) from public;
revoke all on function public.delete_gig_as_full_access_staff(uuid, text) from public;
grant execute on function public.delete_studio_as_full_access_staff(uuid, text) to authenticated, service_role;
grant execute on function public.delete_gig_as_full_access_staff(uuid, text) to authenticated, service_role;
