begin;

-- Role memberships removed by an administrator remain as historical records,
-- but must no longer grant authorization.
alter table public.profile_roles
  drop constraint if exists profile_roles_status_check;

alter table public.profile_roles
  add constraint profile_roles_status_check
  check (status in ('ACTIVE', 'PENDING_REVIEW', 'DECLINED', 'REVOKED'));

-- Legacy role changes updated profiles.role without always keeping the role
-- membership ledger in sync. Preserve access for users whose current role has
-- already passed identity verification before authorization starts depending
-- on profile_roles.
insert into public.profile_roles (
  profile_id,
  role,
  status,
  source,
  activated_at,
  updated_at
)
select
  p.id,
  p.role,
  'ACTIVE',
  'SECURITY_MIGRATION_BACKFILL',
  timezone('utc', now()),
  timezone('utc', now())
from public.profiles p
where p.is_verified is true
  and p.verification_status = 'APPROVED'
on conflict (profile_id, role) do update
set status = 'ACTIVE',
    activated_at = coalesce(public.profile_roles.activated_at, excluded.activated_at),
    updated_at = excluded.updated_at;

create or replace function public.is_active_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr
      on pr.profile_id = p.id
     and pr.role = 'staff'
     and pr.status = 'ACTIVE'
    where p.id = p_user_id
      and p.role = 'staff'
  );
$$;

revoke all on function public.is_active_staff(uuid) from public, anon;
grant execute on function public.is_active_staff(uuid) to authenticated, service_role;

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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr
      on pr.profile_id = p.id
     and pr.role = 'admin'
     and pr.status = 'ACTIVE'
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.profile_roles pr
      on pr.profile_id = p.id
     and pr.role = 'admin'
     and pr.status = 'ACTIVE'
    where p.id = user_id
      and p.role = 'admin'
  );
$$;

create or replace function public.staff_access_level_for_studio(p_user_id uuid, p_studio_id uuid)
returns smallint
language sql
stable
set search_path = public
as $$
  select min(sla.access_level)::smallint
  from public.staff_listing_access sla
  where public.is_active_staff(p_user_id)
    and sla.staff_user_id = p_user_id
    and sla.entity_type = 'studio'
    and sla.studio_id = p_studio_id
    and sla.revoked_at is null;
$$;

create or replace function public.staff_access_level_for_gig(p_user_id uuid, p_gig_id uuid)
returns smallint
language sql
stable
set search_path = public
as $$
  select min(sla.access_level)::smallint
  from public.staff_listing_access sla
  where public.is_active_staff(p_user_id)
    and sla.staff_user_id = p_user_id
    and sla.entity_type = 'venue'
    and sla.gig_id = p_gig_id
    and sla.revoked_at is null;
$$;

create or replace function public.staff_access_level_for_production(p_user_id uuid, p_team_id uuid)
returns smallint
language sql
stable
set search_path = public
as $$
  select min(sla.access_level)::smallint
  from public.staff_listing_access sla
  where public.is_active_staff(p_user_id)
    and sla.staff_user_id = p_user_id
    and sla.entity_type = 'production'
    and sla.production_team_id = p_team_id
    and sla.revoked_at is null;
$$;

create or replace function public.staff_marketplace_owner_ids(p_user_id uuid)
returns table(owner_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct owners.owner_id
  from (
    select s.owner_id
    from public.staff_listing_access sla
    join public.studios s on s.id = sla.studio_id
    where public.is_active_staff(p_user_id)
      and sla.staff_user_id = p_user_id
      and sla.entity_type = 'studio'
      and sla.can_manage_marketplace = true
      and sla.revoked_at is null
    union all
    select g.organizer_id
    from public.staff_listing_access sla
    join public.gigs g on g.id = sla.gig_id
    where public.is_active_staff(p_user_id)
      and sla.staff_user_id = p_user_id
      and sla.entity_type = 'venue'
      and sla.can_manage_marketplace = true
      and sla.revoked_at is null
    union all
    select pt.owner_id
    from public.staff_listing_access sla
    join public.production_teams pt on pt.id = sla.production_team_id
    where public.is_active_staff(p_user_id)
      and sla.staff_user_id = p_user_id
      and sla.entity_type = 'production'
      and sla.can_manage_marketplace = true
      and sla.revoked_at is null
  ) owners
  where owners.owner_id is not null;
$$;

create or replace function public.enforce_active_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.revoked_at is null and not public.is_active_staff(new.staff_user_id) then
    raise exception 'An active staff role is required for a staff assignment' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_active_staff_assignment on public.staff_listing_access;
create trigger trg_enforce_active_staff_assignment
before insert or update of staff_user_id, revoked_at on public.staff_listing_access
for each row execute function public.enforce_active_staff_assignment();

create or replace function public.prevent_role_change_with_owned_entities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'studio-owner' and new.role is distinct from 'studio-owner'
    and exists (select 1 from public.studios s where s.owner_id = old.id)
  then
    raise exception 'Reassign owned studios before changing this role' using errcode = '23514';
  end if;

  if old.role = 'venue-owner' and new.role is distinct from 'venue-owner'
    and exists (select 1 from public.gigs g where g.organizer_id = old.id)
  then
    raise exception 'Reassign owned gigs before changing this role' using errcode = '23514';
  end if;

  if old.role = 'producer' and new.role is distinct from 'producer'
    and exists (select 1 from public.production_teams pt where pt.owner_id = old.id)
  then
    raise exception 'Reassign owned production teams before changing this role' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_role_change_with_owned_entities on public.profiles;
create trigger trg_prevent_role_change_with_owned_entities
before update of role on public.profiles
for each row execute function public.prevent_role_change_with_owned_entities();

create or replace function public.revoke_staff_access_after_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'staff' and new.role is distinct from 'staff' then
    update public.staff_listing_access
    set revoked_at = coalesce(revoked_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where staff_user_id = new.id
      and revoked_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revoke_staff_access_after_role_change on public.profiles;
create trigger trg_revoke_staff_access_after_role_change
after update of role on public.profiles
for each row execute function public.revoke_staff_access_after_role_change();

update public.staff_listing_access sla
set revoked_at = coalesce(sla.revoked_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
where sla.revoked_at is null
  and not public.is_active_staff(sla.staff_user_id);

create or replace function public.enforce_customer_studio_booking_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- Trusted server workflows use service_role and do not carry auth.uid().
  if v_actor is null or v_actor is distinct from old.user_id then
    return new;
  end if;

  if new.user_id is distinct from old.user_id or new.studio_id is distinct from old.studio_id then
    raise exception 'Booking ownership and studio cannot be changed by the customer' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'cancelled' and old.status in ('pending', 'confirmed', 'pending_relocation') then
    return new;
  end if;

  if old.status = 'pending_relocation'
    and new.status = 'confirmed'
    and new.booking_date is not distinct from old.relocation_proposed_date
    and new.start_time is not distinct from old.relocation_proposed_start_time
    and new.end_time is not distinct from old.relocation_proposed_end_time
  then
    return new;
  end if;

  raise exception 'This studio booking status transition is not available to the customer' using errcode = '42501';
end;
$$;

drop trigger if exists trg_enforce_customer_studio_booking_update on public.studio_bookings;
create trigger trg_enforce_customer_studio_booking_update
before update on public.studio_bookings
for each row execute function public.enforce_customer_studio_booking_update();

create or replace function public.is_user_represented_by_gig_application(
  p_user_id uuid,
  p_application_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gig_applications ga
    left join public.production_team_roster ptr on ptr.id = ga.production_roster_id
    where ga.id = p_application_id
      and (
        ga.applicant_id = p_user_id
        or ga.submitted_by_user_id = p_user_id
        or ptr.profile_id = p_user_id
        or exists (
          select 1 from public.groups g
          where g.id = coalesce(ga.group_id, ptr.group_id)
            and g.owner_id = p_user_id
        )
        or exists (
          select 1 from public.group_members gm
          where gm.group_id = coalesce(ga.group_id, ptr.group_id)
            and gm.user_id = p_user_id
        )
      )
  );
$$;

revoke all on function public.is_user_represented_by_gig_application(uuid, uuid) from public, anon;
grant execute on function public.is_user_represented_by_gig_application(uuid, uuid) to authenticated, service_role;

create or replace function public.assert_gig_application_manager_decision(
  p_actor_user_id uuid,
  p_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gig_id uuid;
  v_organizer_id uuid;
begin
  select ga.gig_id, g.organizer_id
  into v_gig_id, v_organizer_id
  from public.gig_applications ga
  join public.gigs g on g.id = ga.gig_id
  where ga.id = p_application_id;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  if v_organizer_id is distinct from p_actor_user_id
    and not public.staff_can_manage_gig_applications(p_actor_user_id, v_gig_id)
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if public.is_user_represented_by_gig_application(p_actor_user_id, p_application_id) then
    raise exception 'A represented performer cannot decide this application' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_gig_application_manager_decision(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assert_gig_application_manager_decision(uuid, uuid) to service_role;

create or replace function public.accept_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_new_status text default 'accepted'
)
returns public.gig_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.gig_applications%rowtype;
  v_gig record;
  v_slot_type text;
  v_total_needed integer := 0;
  v_slot_needed integer := 0;
  v_total_filled integer := 0;
  v_slot_filled integer := 0;
begin
  if p_new_status not in ('accepted', 'approved') then
    raise exception 'Unsupported accepted status: %', p_new_status using errcode = '22023';
  end if;

  select * into v_app
  from public.gig_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  perform public.assert_gig_application_manager_decision(p_actor_user_id, p_application_id);

  select id, organizer_id, status into v_gig
  from public.gigs
  where id = v_app.gig_id
  for update;

  if not found then
    raise exception 'Gig not found' using errcode = 'P0002';
  end if;

  if v_app.leader_approval_status = 'pending' then
    raise exception 'Application is still awaiting group leader approval' using errcode = 'P0001';
  end if;

  if v_app.status = p_new_status then
    if v_app.acceptance_announcement_status = 'not_available' then
      update public.gig_applications
      set acceptance_announcement_status = 'available',
          acceptance_announcement_prompted_at = coalesce(
            acceptance_announcement_prompted_at,
            timezone('utc', now())
          ),
          acceptance_announcement_dismissed_at = null,
          updated_at = timezone('utc', now())
      where id = v_app.id
      returning * into v_app;
    end if;
    return v_app;
  end if;

  if v_app.status <> 'pending' then
    raise exception 'Only pending applications can be accepted' using errcode = 'P0001';
  end if;

  v_slot_type := coalesce(v_app.slot_type, case when v_app.group_id is null then 'solo' else 'band' end);

  select coalesce((gr.requirement_value #>> '{}')::integer, 0)
  into v_total_needed
  from public.gig_requirements gr
  where gr.gig_id = v_app.gig_id
    and gr.requirement_key = 'total_slots_needed';

  select coalesce((gr.requirement_value -> v_slot_type ->> 'needed')::integer, 0)
  into v_slot_needed
  from public.gig_requirements gr
  where gr.gig_id = v_app.gig_id
    and gr.requirement_key = 'slots';

  select count(*) into v_total_filled
  from public.gig_applications ga
  where ga.gig_id = v_app.gig_id
    and ga.id <> v_app.id
    and ga.status in ('accepted', 'approved');

  select count(*) into v_slot_filled
  from public.gig_applications ga
  where ga.gig_id = v_app.gig_id
    and ga.id <> v_app.id
    and coalesce(ga.slot_type, case when ga.group_id is null then 'solo' else 'band' end) = v_slot_type
    and ga.status in ('accepted', 'approved');

  if v_total_needed > 0 and v_total_filled >= v_total_needed then
    raise exception 'All performer slots for this gig have been filled.' using errcode = 'P0001';
  end if;

  if v_slot_needed <= 0 then
    raise exception 'This gig does not have an available % slot.', v_slot_type using errcode = 'P0001';
  end if;

  if v_slot_filled >= v_slot_needed then
    raise exception 'All % slots have been filled. Try a different slot type.', v_slot_type using errcode = 'P0001';
  end if;

  update public.gig_applications
  set status = p_new_status,
      acceptance_announcement_status = case
        when acceptance_announcement_status = 'posted' then 'posted'
        else 'available'
      end,
      acceptance_announcement_prompted_at = case
        when acceptance_announcement_status = 'posted' then acceptance_announcement_prompted_at
        else coalesce(acceptance_announcement_prompted_at, timezone('utc', now()))
      end,
      acceptance_announcement_dismissed_at = case
        when acceptance_announcement_status = 'posted' then acceptance_announcement_dismissed_at
        else null
      end,
      updated_at = timezone('utc', now())
  where id = v_app.id
  returning * into v_app;

  return v_app;
end;
$$;

create or replace function public.decline_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns public.gig_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.gig_applications%rowtype;
begin
  select * into v_application
  from public.gig_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  perform public.assert_gig_application_manager_decision(p_actor_user_id, p_application_id);

  if v_application.status <> 'pending' then
    raise exception 'Only pending applications can be declined' using errcode = 'P0001';
  end if;

  update public.gig_applications
  set status = 'rejected',
      cancellation_reason = coalesce(nullif(btrim(p_reason), ''), cancellation_reason),
      rejected_at = now(),
      updated_at = timezone('utc', now())
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

create or replace function public.terminate_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns public.gig_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.gig_applications%rowtype;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A termination reason is required' using errcode = '22023';
  end if;

  select * into v_application
  from public.gig_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  perform public.assert_gig_application_manager_decision(p_actor_user_id, p_application_id);

  if v_application.status not in ('accepted', 'approved') then
    raise exception 'Only an accepted performer can be fired' using errcode = 'P0001';
  end if;

  update public.gig_applications
  set status = 'fired',
      cancellation_reason = btrim(p_reason),
      fired_at = now(),
      fired_by_user_id = p_actor_user_id,
      feature_consent_status = 'revoked',
      show_on_gig_page = false,
      show_on_profile = false,
      feature_consent_responded_at = now(),
      updated_at = timezone('utc', now())
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$$;

revoke all on function public.accept_gig_application_safely(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.decline_gig_application_safely(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.terminate_gig_application_safely(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_gig_application_safely(uuid, uuid, text) to service_role;
grant execute on function public.decline_gig_application_safely(uuid, uuid, text) to service_role;
grant execute on function public.terminate_gig_application_safely(uuid, uuid, text) to service_role;

create or replace function public.validate_review_booking_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking record;
  v_application record;
  v_roster record;
  v_is_customer boolean;
  v_is_manager boolean;
  v_is_performer boolean;
  v_target_profile uuid;
  v_target_group uuid;
begin
  if (new.studio_booking_id is null) = (new.gig_application_id is null) then
    raise exception 'A review must reference exactly one completed booking' using errcode = '23514';
  end if;

  if new.author_id = new.user_id then
    raise exception 'Self-reviews are not allowed' using errcode = '42501';
  end if;

  if new.studio_booking_id is not null then
    select sb.id, sb.user_id, sb.studio_id, sb.status, s.owner_id
    into v_booking
    from public.studio_bookings sb
    join public.studios s on s.id = sb.studio_id
    where sb.id = new.studio_booking_id;

    if not found or v_booking.status <> 'completed' then
      raise exception 'Reviews require a completed studio booking' using errcode = '23514';
    end if;

    v_is_customer := v_booking.user_id = new.author_id;
    v_is_manager := (
      exists (select 1 from public.profiles p where p.id = new.author_id and p.role = 'studio-owner')
      and v_booking.owner_id = new.author_id
    ) or public.staff_can_manage_studio_bookings(new.author_id, v_booking.studio_id);

    if v_is_customer and v_is_manager then
      raise exception 'A booking participant cannot review with manager authority' using errcode = '42501';
    elsif v_is_customer then
      if new.studio_id is distinct from v_booking.studio_id then
        raise exception 'Studio review target does not match the booking' using errcode = '23514';
      end if;
    elsif v_is_manager then
      if new.user_id is distinct from v_booking.user_id then
        raise exception 'Customer review target does not match the booking' using errcode = '23514';
      end if;
    else
      raise exception 'The review author is not a booking participant' using errcode = '42501';
    end if;

    return new;
  end if;

  select ga.*, g.organizer_id
  into v_application
  from public.gig_applications ga
  join public.gigs g on g.id = ga.gig_id
  where ga.id = new.gig_application_id;

  if not found or v_application.status <> 'completed' then
    raise exception 'Reviews require a completed gig application' using errcode = '23514';
  end if;

  v_is_performer := public.is_user_represented_by_gig_application(new.author_id, new.gig_application_id);
  v_is_manager := (
    exists (select 1 from public.profiles p where p.id = new.author_id and p.role = 'venue-owner')
    and v_application.organizer_id = new.author_id
  ) or public.staff_can_manage_gig_applications(new.author_id, v_application.gig_id);

  if v_is_performer and v_is_manager then
    raise exception 'A represented performer cannot review with manager authority' using errcode = '42501';
  elsif v_is_performer then
    if new.gig_id is distinct from v_application.gig_id then
      raise exception 'Gig review target does not match the application' using errcode = '23514';
    end if;
    return new;
  elsif not v_is_manager then
    raise exception 'The review author is not an application participant' using errcode = '42501';
  end if;

  v_target_group := v_application.group_id;
  v_target_profile := v_application.applicant_id;
  if v_application.production_roster_id is not null then
    select ptr.profile_id, ptr.group_id
    into v_roster
    from public.production_team_roster ptr
    where ptr.id = v_application.production_roster_id;
    v_target_group := coalesce(v_target_group, v_roster.group_id);
    v_target_profile := coalesce(v_roster.profile_id, v_target_profile);
  end if;

  if v_target_group is not null then
    if new.group_id is distinct from v_target_group then
      raise exception 'Group review target does not match the application' using errcode = '23514';
    end if;
  elsif new.user_id is distinct from v_target_profile or new.user_id = new.author_id then
    raise exception 'Performer review target does not match the application' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_review_booking_link on public.reviews;
create trigger trg_validate_review_booking_link
before insert or update on public.reviews
for each row execute function public.validate_review_booking_link();

create unique index if not exists reviews_author_studio_booking_unique
  on public.reviews(author_id, studio_booking_id)
  where studio_booking_id is not null;

create unique index if not exists reviews_author_gig_application_unique
  on public.reviews(author_id, gig_application_id)
  where gig_application_id is not null;

commit;
