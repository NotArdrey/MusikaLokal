-- Allow administrators to transfer owned listings as part of an atomic role change.
-- The ownership updates and profile role transition run in the same transaction.

create or replace function public.admin_transition_user_role(
  p_actor_user_id uuid,
  p_user_id uuid,
  p_expected_old_role text,
  p_new_role text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_reassignment jsonb;
  v_entity_type text;
  v_target_id uuid;
  v_new_owner_id uuid;
  v_required_owner_role text;
  v_updated_count integer;
  v_now timestamptz := timezone('utc', now());
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

  if p_new_role not in ('fan', 'musician', 'studio-owner', 'venue-owner', 'producer', 'admin', 'staff') then
    raise exception 'Invalid role' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_profile.role is distinct from p_expected_old_role then
    raise exception 'Profile role changed concurrently' using errcode = '40001';
  end if;

  if p_new_role in ('studio-owner', 'venue-owner', 'producer', 'admin', 'staff')
    and (v_profile.is_verified is distinct from true or v_profile.verification_status <> 'APPROVED')
  then
    raise exception 'Approved identity verification is required for this role' using errcode = '42501';
  end if;

  if v_profile.role is distinct from p_new_role then
    for v_reassignment in
      select value
      from jsonb_array_elements(coalesce(p_metadata -> 'ownership_reassignments', '[]'::jsonb))
    loop
      v_entity_type := lower(trim(coalesce(v_reassignment ->> 'entity_type', '')));
      begin
        v_target_id := nullif(trim(coalesce(v_reassignment ->> 'target_id', '')), '')::uuid;
        v_new_owner_id := nullif(trim(coalesce(v_reassignment ->> 'new_owner_id', '')), '')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid ownership reassignment identifier' using errcode = '22023';
      end;

      if v_target_id is null or v_new_owner_id is null or v_new_owner_id = p_user_id then
        raise exception 'Every ownership reassignment requires a different replacement owner'
          using errcode = '22023';
      end if;

      v_required_owner_role := case v_entity_type
        when 'studio' then 'studio-owner'
        when 'venue' then 'venue-owner'
        when 'production' then 'producer'
        else null
      end;

      if v_required_owner_role is null or v_required_owner_role is distinct from v_profile.role then
        raise exception 'Ownership reassignment does not match the current account role'
          using errcode = '22023';
      end if;

      if not exists (
        select 1
        from public.profiles replacement
        join public.profile_roles replacement_role
          on replacement_role.profile_id = replacement.id
         and replacement_role.role = v_required_owner_role
         and replacement_role.status = 'ACTIVE'
        where replacement.id = v_new_owner_id
          and replacement.role = v_required_owner_role
          and replacement.is_verified is true
          and replacement.verification_status = 'APPROVED'
      ) then
        raise exception 'The selected replacement owner is no longer eligible'
          using errcode = '23514';
      end if;

      if v_entity_type = 'studio' then
        update public.studios
        set owner_id = v_new_owner_id
        where id = v_target_id and owner_id = p_user_id;
        get diagnostics v_updated_count = row_count;
      elsif v_entity_type = 'venue' then
        update public.gigs
        set organizer_id = v_new_owner_id
        where id = v_target_id and organizer_id = p_user_id;
        get diagnostics v_updated_count = row_count;
      else
        update public.production_teams
        set owner_id = v_new_owner_id
        where id = v_target_id and owner_id = p_user_id;
        get diagnostics v_updated_count = row_count;

        if v_updated_count > 0 then
          insert into public.production_team_members (team_id, user_id, role)
          values (v_target_id, v_new_owner_id, 'owner')
          on conflict (team_id, user_id) do update set role = 'owner';

          update public.production_team_members
          set role = 'manager'
          where team_id = v_target_id
            and user_id = p_user_id
            and role = 'owner';
        end if;
      end if;

      if v_updated_count = 0 then
        raise exception 'An owned listing changed before it could be reassigned'
          using errcode = '40001';
      end if;
    end loop;
  end if;

  update public.profiles set role = p_new_role where id = p_user_id;

  update public.profile_roles
  set status = 'REVOKED', updated_at = v_now
  where profile_id = p_user_id
    and status = 'ACTIVE'
    and role <> p_new_role;

  insert into public.profile_roles(profile_id, role, status, source, activated_at, updated_at)
  values (p_user_id, p_new_role, 'ACTIVE', 'ADMIN_ROLE_CHANGE', v_now, v_now)
  on conflict (profile_id, role) do update
  set status = 'ACTIVE',
      source = excluded.source,
      activated_at = excluded.activated_at,
      updated_at = excluded.updated_at;

  if p_new_role <> 'staff' then
    update public.staff_listing_access
    set revoked_at = coalesce(revoked_at, v_now), updated_at = v_now
    where staff_user_id = p_user_id and revoked_at is null;
  end if;

  insert into public.audit_events(
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
    p_user_id,
    'admin',
    'admin_role_transition',
    'profiles',
    p_user_id::text,
    'admin-users-management',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'old_role', v_profile.role,
      'new_role', p_new_role
    )
  );
end;
$$;

revoke all on function public.admin_transition_user_role(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_transition_user_role(uuid, uuid, text, text, jsonb)
  to service_role;

