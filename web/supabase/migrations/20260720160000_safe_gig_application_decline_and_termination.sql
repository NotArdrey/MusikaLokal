-- Make decline and performer termination row-scoped, auditable, and slot-safe.
alter table public.gig_applications
  add column if not exists fired_at timestamptz,
  add column if not exists fired_by_user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_gig_applications_fired_audit
  on public.gig_applications (fired_by_user_id, fired_at desc)
  where status = 'fired';

comment on column public.gig_applications.fired_at is
  'UTC timestamp when an accepted performer assignment was terminated.';
comment on column public.gig_applications.fired_by_user_id is
  'Organizer or authorized venue staff user who terminated the performer assignment.';

create or replace function public.refresh_gig_slot_counts(p_gig_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_total_filled integer := 0;
  v_total_needed integer := 0;
begin
  if p_gig_id is null then
    return;
  end if;

  perform 1 from public.gigs where id = p_gig_id for update;
  if not found then
    return;
  end if;

  delete from public.gig_slot_fill_applicants where gig_id = p_gig_id;
  delete from public.gig_slot_fill_summary where gig_id = p_gig_id;

  insert into public.gig_slot_fill_summary (gig_id, slot_type, accepted_count, updated_at)
  select
    ga.gig_id,
    coalesce(ga.slot_type, case when ga.group_id is null then 'solo' else 'band' end),
    count(*)::integer,
    now()
  from public.gig_applications ga
  where ga.gig_id = p_gig_id
    and ga.status in ('accepted', 'approved')
  group by
    ga.gig_id,
    coalesce(ga.slot_type, case when ga.group_id is null then 'solo' else 'band' end);

  insert into public.gig_slot_fill_applicants (gig_id, slot_type, applicant_id)
  select distinct
    ga.gig_id,
    coalesce(ga.slot_type, case when ga.group_id is null then 'solo' else 'band' end),
    ga.applicant_id
  from public.gig_applications ga
  where ga.gig_id = p_gig_id
    and ga.status in ('accepted', 'approved');

  select count(*)::integer
  into v_total_filled
  from public.gig_applications
  where gig_id = p_gig_id
    and status in ('accepted', 'approved');

  select coalesce((gr.requirement_value #>> '{}')::integer, 0)
  into v_total_needed
  from public.gig_requirements gr
  where gr.gig_id = p_gig_id
    and gr.requirement_key = 'total_slots_needed'
  order by gr.created_at desc
  limit 1;

  update public.gigs g
  set
    total_slots_filled = v_total_filled,
    status = case
      when g.status not in ('open', 'closed') then g.status
      when v_total_needed > 0 and v_total_filled >= v_total_needed then 'closed'
      else 'open'
    end
  where g.id = p_gig_id;
end;
$function$;

create or replace function public.update_gig_slot_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_gig_slot_counts(old.gig_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.gig_id is distinct from new.gig_id then
    perform public.refresh_gig_slot_counts(old.gig_id);
  end if;

  perform public.refresh_gig_slot_counts(new.gig_id);
  return new;
end;
$function$;

drop trigger if exists trigger_insert_slot_counts on public.gig_applications;
drop trigger if exists trigger_update_slot_counts on public.gig_applications;
drop trigger if exists trigger_delete_slot_counts on public.gig_applications;

create trigger trigger_insert_slot_counts
after insert on public.gig_applications
for each row
when (new.status in ('accepted', 'approved'))
execute function public.update_gig_slot_counts();

create trigger trigger_update_slot_counts
after update of status, slot_type, applicant_id, group_id, gig_id on public.gig_applications
for each row
when (
  (old.status in ('accepted', 'approved') or new.status in ('accepted', 'approved'))
  and (
    old.status is distinct from new.status
    or old.slot_type is distinct from new.slot_type
    or old.applicant_id is distinct from new.applicant_id
    or old.group_id is distinct from new.group_id
    or old.gig_id is distinct from new.gig_id
  )
)
execute function public.update_gig_slot_counts();

create trigger trigger_delete_slot_counts
after delete on public.gig_applications
for each row
when (old.status in ('accepted', 'approved'))
execute function public.update_gig_slot_counts();

do $backfill$
declare
  v_gig_id uuid;
begin
  for v_gig_id in
    select distinct gig_id
    from public.gig_applications
    where status in ('accepted', 'approved')
    union
    select distinct gig_id from public.gig_slot_fill_summary
  loop
    perform public.refresh_gig_slot_counts(v_gig_id);
  end loop;
end;
$backfill$;

create or replace function public.decline_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns public.gig_applications
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_application public.gig_applications%rowtype;
  v_organizer_id uuid;
begin
  select *
  into v_application
  from public.gig_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  select organizer_id
  into v_organizer_id
  from public.gigs
  where id = v_application.gig_id;

  if v_organizer_id is distinct from p_actor_user_id
    and not exists (
      select 1
      from public.staff_listing_access access
      where access.staff_user_id = p_actor_user_id
        and access.entity_type = 'venue'
        and access.gig_id = v_application.gig_id
        and access.revoked_at is null
        and access.access_level <= 2
    )
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_application.status <> 'pending' then
    raise exception 'Only pending applications can be declined' using errcode = 'P0001';
  end if;

  update public.gig_applications
  set
    status = 'rejected',
    cancellation_reason = coalesce(nullif(btrim(p_reason), ''), cancellation_reason),
    rejected_at = now(),
    updated_at = timezone('utc', now())
  where id = p_application_id
  returning * into v_application;

  return v_application;
end;
$function$;

create or replace function public.terminate_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns public.gig_applications
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_application public.gig_applications%rowtype;
  v_organizer_id uuid;
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'A termination reason is required' using errcode = '22023';
  end if;

  select *
  into v_application
  from public.gig_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;

  select organizer_id
  into v_organizer_id
  from public.gigs
  where id = v_application.gig_id;

  if v_organizer_id is distinct from p_actor_user_id
    and not exists (
      select 1
      from public.staff_listing_access access
      where access.staff_user_id = p_actor_user_id
        and access.entity_type = 'venue'
        and access.gig_id = v_application.gig_id
        and access.revoked_at is null
        and access.access_level <= 2
    )
  then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if v_application.status not in ('accepted', 'approved') then
    raise exception 'Only an accepted performer can be fired' using errcode = 'P0001';
  end if;

  update public.gig_applications
  set
    status = 'fired',
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
$function$;

revoke all on function public.refresh_gig_slot_counts(uuid) from public, anon, authenticated;
revoke all on function public.decline_gig_application_safely(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.terminate_gig_application_safely(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.refresh_gig_slot_counts(uuid) to service_role;
grant execute on function public.decline_gig_application_safely(uuid, uuid, text) to service_role;
grant execute on function public.terminate_gig_application_safely(uuid, uuid, text) to service_role;
