-- Allow an administrator to resolve only the production participation that
-- directly conflicts with a staff assignment. Ownership, group roster entries,
-- and roster entries referenced by applications remain protected.

create or replace function public.admin_resolve_staff_production_conflict(
  p_actor_user_id uuid,
  p_staff_user_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_member_role text;
  v_memberships_removed integer := 0;
  v_roster_entries_removed integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.profile_roles pr
      on pr.profile_id = p.id
     and pr.role = 'admin'
     and pr.status = 'ACTIVE'
    where p.id = p_actor_user_id
      and p.role = 'admin'
  ) then
    raise exception 'Active administrator role required' using errcode = '42501';
  end if;

  select pt.owner_id into v_owner_id
  from public.production_teams pt
  where pt.id = p_team_id
  for update;

  if v_owner_id is null then
    raise exception 'Production team not found' using errcode = 'P0002';
  end if;

  if v_owner_id = p_staff_user_id then
    raise exception 'Transfer production team ownership before assigning this owner as staff' using errcode = 'P0001';
  end if;

  select ptm.role into v_member_role
  from public.production_team_members ptm
  where ptm.team_id = p_team_id
    and ptm.user_id = p_staff_user_id
  for update;

  if v_member_role = 'owner' then
    raise exception 'Transfer production team ownership before removing the owner membership' using errcode = 'P0001';
  end if;

  -- Hold the direct roster rows through the safety check and delete so a new
  -- application cannot be attached between those operations.
  perform 1
  from public.production_team_roster ptr
  where ptr.team_id = p_team_id
    and ptr.profile_id = p_staff_user_id
  for update;

  if exists (
    select 1
    from public.production_team_roster ptr
    where ptr.team_id = p_team_id
      and ptr.group_id is not null
      and (
        exists (
          select 1 from public.groups g
          where g.id = ptr.group_id and g.owner_id = p_staff_user_id
        )
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = ptr.group_id and gm.user_id = p_staff_user_id
        )
      )
  ) then
    raise exception 'A group roster conflict must be resolved from the production roster' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.production_team_roster ptr
    join public.gig_applications ga on ga.production_roster_id = ptr.id
    where ptr.team_id = p_team_id
      and ptr.profile_id = p_staff_user_id
  ) then
    raise exception 'This roster entry is referenced by a gig application and cannot be removed automatically' using errcode = 'P0001';
  end if;

  delete from public.production_team_members
  where team_id = p_team_id
    and user_id = p_staff_user_id
    and role <> 'owner';
  get diagnostics v_memberships_removed = row_count;

  delete from public.production_team_roster
  where team_id = p_team_id
    and profile_id = p_staff_user_id;
  get diagnostics v_roster_entries_removed = row_count;

  insert into public.audit_events (
    actor_user_id,
    target_user_id,
    actor_role,
    action,
    entity_table,
    entity_id,
    source,
    metadata
  ) values (
    p_actor_user_id,
    p_staff_user_id,
    'admin',
    'resolve_staff_production_conflict',
    'production_teams',
    p_team_id::text,
    'admin-users-management',
    jsonb_build_object(
      'memberships_removed', v_memberships_removed,
      'roster_entries_removed', v_roster_entries_removed
    )
  );

  return jsonb_build_object(
    'success', true,
    'memberships_removed', v_memberships_removed,
    'roster_entries_removed', v_roster_entries_removed
  );
end;
$$;

revoke all on function public.admin_resolve_staff_production_conflict(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_resolve_staff_production_conflict(uuid, uuid, uuid)
  to service_role;
