-- Run against a database with the migration applied. All fixtures and changes are rolled back.
begin;
do $$
declare
  v_musician uuid;
  v_other uuid;
  v_producer uuid;
  v_studio_owner uuid;
  v_venue_owner uuid;
  v_staff uuid;
  v_group uuid := gen_random_uuid();
  v_team uuid := gen_random_uuid();
  v_studio uuid := gen_random_uuid();
  v_gig uuid := gen_random_uuid();
  v_future_gig uuid := gen_random_uuid();
  v_result jsonb;
begin
  select id into strict v_musician from public.profiles where role = 'musician' limit 1;
  select id into strict v_other from public.profiles where role = 'musician' and id <> v_musician limit 1;
  select id into strict v_producer from public.profiles where role = 'producer' limit 1;
  select id into strict v_studio_owner from public.profiles where role = 'studio-owner' limit 1;
  select id into strict v_venue_owner from public.profiles where role = 'venue-owner' limit 1;
  select id into v_staff from public.profiles where public.is_active_staff(id) limit 1;

  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.groups (id, owner_id, name) values (v_group, v_musician, 'History regression fixture');
  insert into public.production_teams (id, owner_id, name) values (v_team, v_producer, 'History regression fixture');
  insert into public.studios (id, owner_id, name) values (v_studio, v_studio_owner, 'History regression fixture');
  insert into public.gigs (id, organizer_id, name, event_date) values
    (v_gig, v_venue_owner, 'History regression fixture', now() - interval '3 days'),
    (v_future_gig, v_venue_owner, 'History future fixture', now() + interval '3 days');
  insert into public.group_members (group_id, user_id, role) values (v_group, v_other, 'member');

  begin
    perform public.set_listing_lifecycle('group', v_group, 'inactive', 'active');
    raise exception 'Anonymous request unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon', 'public.set_listing_lifecycle(text,uuid,text,text)', 'EXECUTE') then
    raise exception 'Anonymous users have RPC access';
  end if;
  perform set_config('request.jwt.claim.sub', v_other::text, true);
  begin
    perform public.set_listing_lifecycle('group', v_group, 'inactive', 'active');
    raise exception 'Group member unexpectedly changed the lifecycle';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', v_musician::text, true);
  perform public.set_listing_lifecycle('group', v_group, 'inactive', 'active');
  update public.groups set description = 'Edited while inactive' where id = v_group;
  if (select management_status from public.groups where id = v_group) <> 'inactive' then
    raise exception 'Editing reactivated the group';
  end if;
  begin
    perform public.set_listing_lifecycle('group', v_group, 'active', 'active');
    raise exception 'A stale lifecycle request unexpectedly succeeded';
  exception when serialization_failure then null; end;
  begin
    insert into public.booking_requests(sender_id, receiver_id, group_id, status) values (v_other, v_musician, v_group, 'pending');
    raise exception 'New request to inactive group unexpectedly succeeded';
  exception when check_violation then null; end;
  perform public.set_listing_lifecycle('group', v_group, 'active', 'inactive');
  if not exists (select 1 from public.group_members where group_id = v_group and user_id = v_other) then
    raise exception 'Changing lifecycle removed a member';
  end if;

  perform set_config('request.jwt.claim.sub', v_producer::text, true);
  perform public.set_listing_lifecycle('production', v_team, 'inactive', 'active');
  update public.production_teams set description = 'Edited while inactive' where id = v_team;
  if (select management_status from public.production_teams where id = v_team) <> 'inactive' then
    raise exception 'Editing reactivated the production team';
  end if;
  perform public.set_listing_lifecycle('production', v_team, 'active', 'inactive');

  perform set_config('request.jwt.claim.sub', v_studio_owner::text, true);
  perform public.set_listing_lifecycle('studio', v_studio, 'inactive', 'active');
  perform public.set_listing_lifecycle('studio', v_studio, 'active', 'inactive');
  if v_staff is not null then
    insert into public.staff_listing_access(staff_user_id, entity_type, studio_id, access_level, can_edit_listing)
      values (v_staff, 'studio', v_studio, 3, false);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    begin
      perform public.set_listing_lifecycle('studio', v_studio, 'inactive', 'active');
      raise exception 'View-only staff unexpectedly changed lifecycle';
    exception when insufficient_privilege then null; end;
    update public.staff_listing_access set access_level = 1, can_edit_listing = true where studio_id = v_studio;
    perform public.set_listing_lifecycle('studio', v_studio, 'inactive', 'active');
    update public.staff_listing_access set revoked_at = now() where studio_id = v_studio;
    begin
      perform public.set_listing_lifecycle('studio', v_studio, 'active', 'inactive');
      raise exception 'Revoked staff unexpectedly changed lifecycle';
    exception when insufficient_privilege then null; end;
  else
    raise exception 'No active staff fixture available to verify staff permissions';
  end if;

  perform set_config('request.jwt.claim.sub', v_venue_owner::text, true);
  begin
    perform public.set_listing_lifecycle('gig', v_future_gig, 'done', 'active');
    raise exception 'A future gig unexpectedly completed';
  exception when check_violation then null; end;
  insert into public.gig_requirements(gig_id, requirement_key, requirement_value) values (v_gig, 'event_schedules',
    jsonb_build_array(jsonb_build_object('date', (now() - interval '3 days')::date, 'start_time', '11:00 PM', 'end_time', '2:00 AM'),
      jsonb_build_object('date', (now() + interval '3 days')::date, 'start_time', '7:00 PM', 'end_time', '10:00 PM')));
  begin
    perform public.set_listing_lifecycle('gig', v_gig, 'done', 'active');
    raise exception 'A multi-day gig completed before its last set';
  exception when check_violation then null; end;
  delete from public.gig_requirements where gig_id = v_gig and requirement_key = 'event_schedules';
  perform public.set_listing_lifecycle('gig', v_gig, 'done', 'active');
  if not exists (select 1 from public.gigs where id = v_gig and management_status = 'done' and status = 'closed') then
    raise exception 'Mark done did not persist and close the gig';
  end if;
  begin
    update public.gigs set management_status = 'active', status = 'open' where id = v_gig;
    raise exception 'A completed gig unexpectedly reactivated';
  exception when check_violation then null; end;
  if exists (select 1 from public.gigs_with_stats where id = v_gig and management_status = 'active') then
    raise exception 'Completed gig leaked into active discovery';
  end if;
end;
$$;
rollback;
