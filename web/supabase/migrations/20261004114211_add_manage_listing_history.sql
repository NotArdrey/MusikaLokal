-- Manage history is independent of permit, membership, application and booking states.
alter table public.groups add column management_status text not null default 'active'
  check (management_status in ('active', 'inactive'));
alter table public.studios add column management_status text not null default 'active'
  check (management_status in ('active', 'inactive'));
alter table public.production_teams add column management_status text not null default 'active'
  check (management_status in ('active', 'inactive'));
alter table public.gigs add column management_status text not null default 'active'
  check (management_status in ('active', 'done'));

create function public.can_change_listing_lifecycle(p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    public.is_admin() or
    case p_type
      when 'group' then exists (
        select 1 from public.groups g join public.profiles p on p.id = g.owner_id
        where g.id = p_id and g.owner_id = auth.uid() and p.role = 'musician'
      )
      when 'studio' then public.staff_can_edit_studio(auth.uid(), p_id) or exists (
        select 1 from public.studios s join public.profiles p on p.id = s.owner_id
        where s.id = p_id and s.owner_id = auth.uid() and p.role = 'studio-owner'
      )
      when 'gig' then public.staff_can_edit_gig(auth.uid(), p_id) or exists (
        select 1 from public.gigs g join public.profiles p on p.id = g.organizer_id
        where g.id = p_id and g.organizer_id = auth.uid() and p.role = 'venue-owner'
      )
      when 'production' then public.staff_can_edit_production(auth.uid(), p_id) or exists (
        select 1 from public.production_teams t join public.profiles p on p.id = auth.uid()
        where t.id = p_id and p.role = 'producer' and (
          t.owner_id = auth.uid() or exists (
            select 1 from public.production_team_members m
            where m.team_id = t.id and m.user_id = auth.uid() and m.role = 'manager'
          )
        )
      )
      else false
    end
  );
$$;
revoke all on function public.can_change_listing_lifecycle(text, uuid) from public, anon;
grant execute on function public.can_change_listing_lifecycle(text, uuid) to authenticated;

-- Consider every scheduled day, including overnight sets, in the event's Manila timezone.
create function public.manage_gig_end_at(p_gig_id uuid)
returns timestamptz language plpgsql stable security definer set search_path = public
as $$
declare
  v_date timestamptz;
  v_requirements jsonb;
  v_schedule jsonb;
  v_schedules jsonb;
  v_start timestamp;
  v_end timestamp;
  v_latest timestamptz;
begin
  select event_date into v_date from public.gigs where id = p_gig_id;
  select coalesce(jsonb_object_agg(requirement_key, requirement_value), '{}'::jsonb)
    into v_requirements from public.gig_requirements where gig_id = p_gig_id;
  v_schedules := v_requirements->'event_schedules';
  if jsonb_typeof(v_schedules) is distinct from 'array' or jsonb_array_length(v_schedules) = 0 then
    if v_date is null then return null; end if;
    v_schedules := jsonb_build_array(jsonb_build_object(
      'date', (v_date at time zone 'Asia/Manila')::date,
      'start_time', v_requirements->>'event_start_time',
      'end_time', v_requirements->>'event_end_time'
    ));
  end if;
  for v_schedule in select value from jsonb_array_elements(v_schedules) loop
    begin
      v_start := (v_schedule->>'date')::date + coalesce(nullif(v_schedule->>'start_time', '')::time, time '00:00');
      v_end := (v_schedule->>'date')::date + coalesce(nullif(v_schedule->>'end_time', '')::time, time '23:59:59.999');
      if v_end < v_start then v_end := v_end + interval '1 day'; end if;
      if v_end is null then return null; end if;
      v_latest := greatest(v_latest, v_end at time zone 'Asia/Manila');
    exception when invalid_datetime_format or datetime_field_overflow then
      return null;
    end;
  end loop;
  return v_latest;
end;
$$;
revoke all on function public.manage_gig_end_at(uuid) from public, anon;
grant execute on function public.manage_gig_end_at(uuid) to authenticated;

create function public.guard_listing_lifecycle()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_type text := case tg_table_name when 'groups' then 'group' when 'studios' then 'studio'
    when 'gigs' then 'gig' else 'production' end;
  v_end timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.management_status <> 'active' then raise exception 'New listings must start active.' using errcode = '23514'; end if;
    return new;
  end if;
  if tg_table_name = 'gigs' and old.management_status = 'done' then
    if new.management_status <> 'done' or new.status = 'open' or new.event_date is distinct from old.event_date then
      raise exception 'Completed gigs cannot be activated again. Create a new gig instead.' using errcode = '23514';
    end if;
  end if;
  if new.management_status is distinct from old.management_status then
    if not public.can_change_listing_lifecycle(v_type, old.id) then
      raise exception 'You do not have permission to change this listing status.' using errcode = '42501';
    end if;
    if tg_table_name = 'gigs' and new.management_status = 'done' then
      if old.status = 'cancelled' then
        raise exception 'Cancelled gigs must stay cancelled.' using errcode = '23514';
      end if;
      v_end := public.manage_gig_end_at(old.id);
      if v_end is null or v_end > now() then
        raise exception 'A gig can be marked done only after all scheduled sets have ended.' using errcode = '23514';
      end if;
      new.status := 'closed';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_listing_lifecycle() from public, anon, authenticated;
create trigger guard_group_lifecycle before insert or update on public.groups for each row execute function public.guard_listing_lifecycle();
create trigger guard_studio_lifecycle before insert or update on public.studios for each row execute function public.guard_listing_lifecycle();
create trigger guard_production_lifecycle before insert or update on public.production_teams for each row execute function public.guard_listing_lifecycle();
create trigger guard_gig_lifecycle before insert or update on public.gigs for each row execute function public.guard_listing_lifecycle();

create function public.set_listing_lifecycle(p_type text, p_id uuid, p_status text, p_expected_status text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_table text;
  v_current text;
begin
  if auth.uid() is null then raise exception 'Sign in to change a listing.' using errcode = '42501'; end if;
  v_table := case p_type when 'group' then 'groups' when 'studio' then 'studios'
    when 'gig' then 'gigs' when 'production' then 'production_teams' end;
  if v_table is null or p_status is null or not (
    (p_type = 'gig' and p_status = 'done') or (p_type <> 'gig' and p_status in ('active', 'inactive'))
  ) then raise exception 'Invalid listing status.' using errcode = '22023'; end if;
  if not public.can_change_listing_lifecycle(p_type, p_id) then
    raise exception 'You do not have permission to change this listing status.' using errcode = '42501';
  end if;
  execute format('select management_status from public.%I where id = $1 for update', v_table)
    into v_current using p_id;
  if v_current is null then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if v_current is distinct from p_expected_status then
    raise exception 'This listing has changed. Refresh and try again.' using errcode = '40001';
  end if;
  execute format('update public.%I set management_status = $1 where id = $2', v_table) using p_status, p_id;
  return jsonb_build_object('id', p_id, 'management_status', p_status);
end;
$$;
revoke all on function public.set_listing_lifecycle(text, uuid, text, text) from public, anon;
grant execute on function public.set_listing_lifecycle(text, uuid, text, text) to authenticated;

-- Existing commitments remain valid; only new requests to unavailable listings are blocked.
create function public.guard_new_request_listing_lifecycle()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
  v_id uuid;
begin
  if tg_table_name = 'studio_bookings' then
    select management_status into v_status from public.studios where id = new.studio_id for share;
    if v_status = 'inactive' then raise exception 'This studio is inactive.' using errcode = '23514'; end if;
  elsif tg_table_name = 'gig_applications' then
    select management_status into v_status from public.gigs where id = new.gig_id for share;
    if v_status = 'done' then raise exception 'This gig is completed.' using errcode = '23514'; end if;
  else
    if new.studio_id is not null then
      select management_status into v_status from public.studios where id = new.studio_id for share;
      if v_status = 'inactive' then raise exception 'This studio is inactive.' using errcode = '23514'; end if;
    end if;
    v_id := new.group_id;
    if v_id is null and coalesce(new.event_details->>'group_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id := (new.event_details->>'group_id')::uuid;
    end if;
    if v_id is not null then
      select management_status into v_status from public.groups where id = v_id for share;
      if v_status = 'inactive' then raise exception 'This group is inactive.' using errcode = '23514'; end if;
    end if;
    v_id := null;
    if coalesce(new.event_details->>'production_team_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_id := (new.event_details->>'production_team_id')::uuid;
    end if;
    if v_id is not null then
      select management_status into v_status from public.production_teams where id = v_id for share;
      if v_status = 'inactive' then raise exception 'This production team is inactive.' using errcode = '23514'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_new_request_listing_lifecycle() from public, anon, authenticated;
create trigger guard_new_studio_booking_lifecycle before insert on public.studio_bookings for each row execute function public.guard_new_request_listing_lifecycle();
create trigger guard_new_gig_application_lifecycle before insert on public.gig_applications for each row execute function public.guard_new_request_listing_lifecycle();
create trigger guard_new_booking_request_lifecycle before insert on public.booking_requests for each row execute function public.guard_new_request_listing_lifecycle();

create or replace view public.gigs_with_stats as
 SELECT g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    glp.requirements,
    glp.images,
    glp.documents,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    g.business_permit_url,
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    g.permit_status,
    g.permit_rejection_reason,
    g.permit_admin_notes,
    g.permit_reviewed_by,
    g.permit_reviewed_at,
    g.permit_resubmissions_used,
    g.total_slots_filled,
    COALESCE(pending_apps.pending_applicant_count, 0) AS pending_applicant_count,
    g.reapplication_cooldown_days,
    g.management_status
   FROM gigs g
     LEFT JOIN reviews r ON r.gig_id = g.id
     LEFT JOIN gigs_legacy_projection glp ON glp.id = g.id
     LEFT JOIN gigs_availability_projection gap ON gap.gig_id = g.id
     LEFT JOIN ( SELECT ga.gig_id,
            count(*)::integer AS pending_applicant_count
           FROM gig_applications ga
          WHERE ga.status = 'pending'::text AND (ga.leader_approval_status IS NULL OR ga.leader_approval_status = 'approved'::text)
          GROUP BY ga.gig_id) pending_apps ON pending_apps.gig_id = g.id
  GROUP BY g.id, glp.requirements, glp.images, glp.documents, gap.availability, pending_apps.pending_applicant_count;

create or replace view public.groups_with_stats as
 SELECT g.id,
    g.owner_id,
    g.name,
    g.genre,
    g.description,
    glp.members,
    g.location,
    glp.images,
    g.latitude,
    g.longitude,
    g.rate,
    g.created_at,
    g.group_type,
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    gc.completion_rate,
    g.management_status
   FROM groups g
     LEFT JOIN reviews r ON r.group_id = g.id
     LEFT JOIN groups_legacy_projection glp ON glp.id = g.id
     LEFT JOIN groups_availability_projection gap ON gap.group_id = g.id
     LEFT JOIN ( SELECT ga.group_id,
            round(count(*) FILTER (WHERE ga.status = 'completed'::text)::numeric / NULLIF(count(*), 0)::numeric * 100::numeric, 0) AS completion_rate
           FROM gig_applications ga
          WHERE ga.group_id IS NOT NULL AND (ga.status = 'completed'::text OR ga.completion_rate_penalty = true)
          GROUP BY ga.group_id) gc ON gc.group_id = g.id
  GROUP BY g.id, g.owner_id, g.name, g.genre, g.description, glp.members, g.location, glp.images, g.latitude, g.longitude, g.rate, g.created_at, g.group_type, gap.availability, gc.completion_rate;

create or replace view public.studios_with_stats as
 SELECT s.id,
    s.owner_id,
    s.name,
    s.address,
    s.hourly_rate,
    s.description,
    slp.amenities,
    slp.images,
    s.latitude,
    s.longitude,
    s.created_at,
    s.embedding,
    s.rate,
    s.contract_url,
    COALESCE(sap.availability, '[]'::jsonb) AS availability,
    slp.instruments,
        CASE
            WHEN COALESCE(array_length(slp.types, 1), 0) > 0 THEN slp.types[1]
            ELSE NULL::text
        END AS type,
    slp.types,
    s.rehearsal_rate,
    s.recording_rate,
    COALESCE(sap.open_dates, '[]'::jsonb) AS open_dates,
    s.pax,
    COALESCE(r.rating, 0::numeric) AS rating,
    COALESCE(r.review_count, 0::bigint) AS review_count,
    COALESCE(b.completion_rate, 100::numeric) AS completion_rate,
    COALESCE(ss.lead_time_hours, 24) AS lead_time_hours,
    COALESCE(ss.weekend_multiplier, 1.0) AS weekend_multiplier,
    COALESCE(ss.peak_season_multiplier, 1.0) AS peak_season_multiplier,
    COALESCE(ss.peak_season_dates, '[]'::jsonb) AS peak_season_dates,
    COALESCE(ss.off_peak_multiplier, 1.0) AS off_peak_multiplier,
    COALESCE(ss.off_peak_dates, '[]'::jsonb) AS off_peak_dates,
    COALESCE(ss.holiday_multiplier, 1.0) AS holiday_multiplier,
        CASE
            WHEN ss.peak_season_multiplier IS NOT NULL AND ss.peak_season_multiplier <> 1.0 THEN true
            WHEN ss.off_peak_multiplier IS NOT NULL AND ss.off_peak_multiplier <> 1.0 THEN true
            WHEN ss.weekend_multiplier IS NOT NULL AND ss.weekend_multiplier <> 1.0 THEN true
            ELSE false
        END AS has_seasonal_pricing,
    (EXISTS ( SELECT 1
           FROM studio_date_overrides sdo
          WHERE sdo.studio_id = s.id)) AS has_special_dates,
    s.permit_status,
    s.permit_rejection_reason,
    s.permit_admin_notes,
    s.permit_reviewed_by,
    s.permit_reviewed_at,
    s.permit_resubmissions_used,
    s.address AS location,
    s.management_status
   FROM studios s
     LEFT JOIN ( SELECT rv.studio_id,
            avg(rv.rating) AS rating,
            count(rv.id) AS review_count
           FROM reviews rv
          GROUP BY rv.studio_id) r ON r.studio_id = s.id
     LEFT JOIN ( SELECT sb.studio_id,
                CASE
                    WHEN count(sb.id) = 0 THEN 100::numeric
                    ELSE round(count(
                    CASE
                        WHEN sb.status = 'completed'::text THEN 1
                        ELSE NULL::integer
                    END)::numeric / count(sb.id)::numeric * 100::numeric, 0)
                END AS completion_rate
           FROM studio_bookings sb
          WHERE sb.status = ANY (ARRAY['completed'::text, 'cancelled'::text])
          GROUP BY sb.studio_id) b ON b.studio_id = s.id
     LEFT JOIN studio_settings ss ON ss.studio_id = s.id
     LEFT JOIN studios_legacy_projection slp ON slp.id = s.id
     LEFT JOIN studios_availability_projection sap ON sap.studio_id = s.id;
