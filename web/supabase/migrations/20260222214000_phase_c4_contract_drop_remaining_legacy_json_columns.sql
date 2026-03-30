create or replace function public.gig_has_available_slots(p_gig_id uuid, p_slot_type text default null::text)
returns boolean
language plpgsql
as $function$
declare
    v_requirements jsonb;
    v_total_needed integer;
    v_total_filled integer;
    v_type_needed integer;
    v_type_filled integer;
begin
    select requirements, coalesce(total_slots_filled, 0)
    into v_requirements, v_total_filled
    from public.gigs
    where id = p_gig_id;

    v_total_needed := coalesce((v_requirements->'total_slots_needed')::int, 999);
    if v_total_filled >= v_total_needed then
        return false;
    end if;

    if p_slot_type is not null then
        v_type_needed := coalesce((v_requirements->'slots'->p_slot_type->>'needed')::int, 0);
        select coalesce(s.accepted_count, 0)
        into v_type_filled
        from public.gig_slot_fill_summary s
        where s.gig_id = p_gig_id
          and s.slot_type = p_slot_type;

        if v_type_needed > 0 and coalesce(v_type_filled, 0) >= v_type_needed then
            return false;
        end if;
    end if;

    return true;
end;
$function$;

create or replace function public.update_gig_slot_counts()
returns trigger
language plpgsql
as $function$
declare
    v_slot_type text;
    v_requirements jsonb;
    v_total_needed integer;
    v_new_total integer;
    v_applicant_id uuid;
begin
    if new.status = 'accepted' and (old.status is null or old.status <> 'accepted') then
        v_slot_type := coalesce(new.slot_type, 'solo');
        v_applicant_id := new.applicant_id;

        insert into public.gig_slot_fill_summary (gig_id, slot_type, accepted_count)
        values (new.gig_id, v_slot_type, 1)
        on conflict (gig_id, slot_type)
        do update set
            accepted_count = public.gig_slot_fill_summary.accepted_count + 1,
            updated_at = now();

        insert into public.gig_slot_fill_applicants (gig_id, slot_type, applicant_id)
        values (new.gig_id, v_slot_type, v_applicant_id)
        on conflict (gig_id, slot_type, applicant_id) do nothing;

        select coalesce(sum(accepted_count), 0)
        into v_new_total
        from public.gig_slot_fill_summary
        where gig_id = new.gig_id;

        select requirements into v_requirements from public.gigs where id = new.gig_id;
        v_total_needed := coalesce((v_requirements->'total_slots_needed')::int, 999);

        update public.gigs g
        set total_slots_filled = v_new_total,
            status = case when v_new_total >= v_total_needed then 'closed' else g.status end
        where g.id = new.gig_id;

    elsif old.status = 'accepted' and new.status <> 'accepted' then
        v_slot_type := coalesce(old.slot_type, 'solo');
        v_applicant_id := old.applicant_id;

        update public.gig_slot_fill_summary
        set accepted_count = greatest(accepted_count - 1, 0),
            updated_at = now()
        where gig_id = old.gig_id
          and slot_type = v_slot_type;

        delete from public.gig_slot_fill_applicants
        where gig_id = old.gig_id
          and slot_type = v_slot_type
          and applicant_id = v_applicant_id;

        select coalesce(sum(accepted_count), 0)
        into v_new_total
        from public.gig_slot_fill_summary
        where gig_id = old.gig_id;

        update public.gigs g
        set total_slots_filled = v_new_total,
            status = case when g.status = 'closed' then 'open' else g.status end
        where g.id = old.gig_id;
    end if;

    return new;
end;
$function$;

create or replace function public.sync_studio_availability_3nf(p_studio_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform 1 from public.studios s where s.id = p_studio_id;
  if not found then
    raise exception 'Studio not found';
  end if;

  delete from public.studio_open_dates where studio_id = p_studio_id;

  insert into public.studio_open_dates (studio_id, open_date, is_open)
  select
    s.id,
    case
      when jsonb_typeof(d.item) = 'string' and trim(both '"' from d.item::text) ~ '^\\d{4}-\\d{2}-\\d{2}$' then (trim(both '"' from d.item::text))::date
      when jsonb_typeof(d.item) = 'object' and (d.item->>'date') ~ '^\\d{4}-\\d{2}-\\d{2}$' then (d.item->>'date')::date
      else null
    end,
    coalesce(case when jsonb_typeof(d.item) = 'object' then (d.item->>'is_open')::boolean else null end, true)
  from public.studios s
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.open_dates) = 'array' then s.open_dates else '[]'::jsonb end
  ) as d(item)
  where s.id = p_studio_id
    and (
      (jsonb_typeof(d.item) = 'string' and trim(both '"' from d.item::text) ~ '^\\d{4}-\\d{2}-\\d{2}$')
      or
      (jsonb_typeof(d.item) = 'object' and d.item ? 'date' and (d.item->>'date') ~ '^\\d{4}-\\d{2}-\\d{2}$')
    )
  on conflict (studio_id, open_date) do nothing;
end;
$function$;

create or replace view public.studios_with_stats as
 select s.id,
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
    coalesce(sap.availability, '[]'::jsonb) as availability,
    slp.instruments,
        case
            when coalesce(array_length(slp.types, 1), 0) > 0 then slp.types[1]
            else null::text
        end as type,
    slp.types,
    s.rehearsal_rate,
    s.recording_rate,
    coalesce(sap.open_dates, '[]'::jsonb) as open_dates,
    s.pax,
    coalesce(r.rating, 0::numeric) as rating,
    coalesce(r.review_count, 0::bigint) as review_count,
    coalesce(b.completion_rate, 100::numeric) as completion_rate,
    coalesce(ss.lead_time_hours, 24) as lead_time_hours,
    coalesce(ss.weekend_multiplier, 1.0) as weekend_multiplier,
    coalesce(ss.peak_season_multiplier, 1.0) as peak_season_multiplier,
    coalesce(ss.peak_season_dates, '[]'::jsonb) as peak_season_dates,
    coalesce(ss.off_peak_multiplier, 1.0) as off_peak_multiplier,
    coalesce(ss.off_peak_dates, '[]'::jsonb) as off_peak_dates,
    coalesce(ss.holiday_multiplier, 1.0) as holiday_multiplier,
        case
            when ss.peak_season_multiplier is not null and ss.peak_season_multiplier <> 1.0 then true
            when ss.off_peak_multiplier is not null and ss.off_peak_multiplier <> 1.0 then true
            when ss.weekend_multiplier is not null and ss.weekend_multiplier <> 1.0 then true
            else false
        end as has_seasonal_pricing,
    (exists ( select 1
           from studio_date_overrides sdo
          where sdo.studio_id = s.id)) as has_special_dates
   from public.studios s
     left join ( select rv.studio_id,
            avg(rv.rating) as rating,
            count(rv.id) as review_count
           from public.reviews rv
          group by rv.studio_id) r on r.studio_id = s.id
     left join ( select sb.studio_id,
                case
                    when count(sb.id) = 0 then 100::numeric
                    else round(count(
                    case
                        when sb.status = 'completed'::text then 1
                        else null::integer
                    end)::numeric / count(sb.id)::numeric * 100::numeric, 0)
                end as completion_rate
           from public.studio_bookings sb
          where sb.status = any (array['completed'::text, 'cancelled'::text])
          group by sb.studio_id) b on b.studio_id = s.id
     left join public.studio_settings ss on ss.studio_id = s.id
     left join public.studios_legacy_projection slp on slp.id = s.id
     left join public.studios_availability_projection sap on sap.studio_id = s.id;

create or replace view public.studios_with_verification as
 select s.id,
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
    coalesce(sap.availability, '[]'::jsonb) as availability,
    slp.instruments,
        case
            when coalesce(array_length(slp.types, 1), 0) > 0 then slp.types[1]
            else null::text
        end as type,
    s.rehearsal_rate,
    s.recording_rate,
    coalesce(sap.open_dates, '[]'::jsonb) as open_dates,
    slp.types,
    s.pax,
    s.address_verification_status,
    s.address_verification_session_id,
    s.address_verified_at,
    s.verified_address,
    s.address_verification_completed_at,
        case
            when s.address_verification_status = any (array['APPROVED'::text, 'VERIFIED'::text]) then true
            else false
        end as is_address_verified,
    avs.extracted_address as session_extracted_address,
    avs.extracted_name as session_extracted_name,
    avs.issuer as verification_issuer,
    avs.notes as verification_notes,
    avs.provider as verification_provider,
    avs.archive_id as smile_archive_id
   from public.studios s
     left join public.studios_legacy_projection slp on slp.id = s.id
     left join public.studios_availability_projection sap on sap.studio_id = s.id
     left join public.address_verification_sessions avs on avs.entity_type = 'studio'::text and avs.entity_id = s.id and (avs.status = any (array['APPROVED'::text, 'VERIFIED'::text]));

drop trigger if exists trg_gigs_sync_slots_filled_3nf_from_legacy on public.gigs;
drop function if exists public.trg_sync_gig_slots_filled_3nf_from_legacy();
drop function if exists public.sync_gig_slots_filled_3nf(uuid);

drop trigger if exists trg_studios_sync_availability_3nf_from_legacy on public.studios;
create trigger trg_studios_sync_availability_3nf_from_legacy
after insert or update of open_dates on public.studios
for each row execute function public.trg_sync_studio_availability_3nf_from_legacy();

alter table public.gigs
  drop column if exists slots_filled;

alter table public.studios
  drop column if exists availability;