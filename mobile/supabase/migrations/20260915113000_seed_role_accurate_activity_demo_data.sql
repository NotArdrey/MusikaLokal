-- Seed real, role-accurate QA data for every existing MusikaLokal account.
--
-- The rows are deliberately marked with role_accurate_demo_seed_v1 and use
-- deterministic UUIDs. Re-running this migration is safe and never resets a
-- status that a tester has already accepted, declined, or otherwise changed.

do $seed$
declare
  v_venue record;
  v_musician record;
  v_group_pair record;
  v_producer record;
  v_studio_owner record;
  v_team_id uuid;
  v_team_name text;
  v_active_gig_id uuid;
  v_pending_gig_id uuid;
  v_completed_gig_id uuid;
  v_group_id uuid;
  v_studio_id uuid;
  v_local_today date := timezone('Asia/Manila', now())::date;
  v_musician_count integer;
begin
  select count(*)
    into v_musician_count
  from public.profiles
  where lower(coalesce(role, '')) = 'musician';

  -- Venue-owner coverage: an upcoming accepted gig, an upcoming gig with
  -- pending applicants, and a completed gig that belongs only in history.
  for v_venue in
    select id, coalesce(nullif(trim(full_name), ''), 'Venue Owner') as display_name
    from public.profiles
    where lower(coalesce(role, '')) = 'venue-owner'
    order by id
  loop
    v_active_gig_id := md5('role_accurate_demo_seed_v1:active_gig:' || v_venue.id::text)::uuid;
    v_pending_gig_id := md5('role_accurate_demo_seed_v1:pending_gig:' || v_venue.id::text)::uuid;
    v_completed_gig_id := md5('role_accurate_demo_seed_v1:completed_gig:' || v_venue.id::text)::uuid;

    insert into public.gigs (
      id, organizer_id, name, location, budget, description, event_date,
      status, latitude, longitude, rate, address_verification_status,
      verified_address, address_verified_at, permit_status, permit_reviewed_at
    ) values
      (
        v_active_gig_id,
        v_venue.id,
        '[Demo] Bulacan Live Music Night',
        'Malolos City, Bulacan',
        18000,
        '[role_accurate_demo_seed_v1] Confirmed musicians for an upcoming community live-music night.',
        ((v_local_today + 3) + time '19:00') at time zone 'Asia/Manila',
        'open', 14.8527, 120.8160, 18000, 'VERIFIED',
        'Malolos City, Bulacan', now(), 'approved', now()
      ),
      (
        v_pending_gig_id,
        v_venue.id,
        '[Demo] Artist Audition Showcase',
        'Baliwag City, Bulacan',
        15000,
        '[role_accurate_demo_seed_v1] Pending solo applications for the venue owner to accept or decline.',
        ((v_local_today + 7) + time '18:00') at time zone 'Asia/Manila',
        'open', 14.9540, 120.9010, 15000, 'VERIFIED',
        'Baliwag City, Bulacan', now(), 'approved', now()
      ),
      (
        v_completed_gig_id,
        v_venue.id,
        '[Demo] Heritage Stage Recap',
        'Meycauayan City, Bulacan',
        12000,
        '[role_accurate_demo_seed_v1] Completed performance used to verify that My Gig excludes finished events.',
        ((v_local_today - 3) + time '18:00') at time zone 'Asia/Manila',
        'closed', 14.7369, 120.9609, 12000, 'VERIFIED',
        'Meycauayan City, Bulacan', now() - interval '10 days', 'approved', now() - interval '10 days'
      )
    on conflict do nothing;

    insert into public.gig_media (id, gig_id, media_type, media_url, sort_order)
    values
      (
        md5('role_accurate_demo_seed_v1:active_gig_media:' || v_venue.id::text)::uuid,
        v_active_gig_id, 'image',
        'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200&fit=crop', 0
      ),
      (
        md5('role_accurate_demo_seed_v1:pending_gig_media:' || v_venue.id::text)::uuid,
        v_pending_gig_id, 'image',
        'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200&fit=crop', 0
      ),
      (
        md5('role_accurate_demo_seed_v1:completed_gig_media:' || v_venue.id::text)::uuid,
        v_completed_gig_id, 'image',
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=1200&fit=crop', 0
      )
    on conflict do nothing;

    insert into public.gig_requirements (id, gig_id, requirement_key, requirement_value)
    values
      (md5('role_accurate_demo_seed_v1:active:start:' || v_venue.id::text)::uuid, v_active_gig_id, 'event_start_time', to_jsonb('07:00 PM'::text)),
      (md5('role_accurate_demo_seed_v1:active:end:' || v_venue.id::text)::uuid, v_active_gig_id, 'event_end_time', to_jsonb('11:00 PM'::text)),
      (md5('role_accurate_demo_seed_v1:active:schedule:' || v_venue.id::text)::uuid, v_active_gig_id, 'event_schedules', jsonb_build_array(jsonb_build_object('date', to_char(v_local_today + 3, 'YYYY-MM-DD'), 'start_time', '07:00 PM', 'end_time', '11:00 PM'))),
      (md5('role_accurate_demo_seed_v1:active:genres:' || v_venue.id::text)::uuid, v_active_gig_id, 'genres', '["OPM", "Pop", "Acoustic"]'::jsonb),
      (md5('role_accurate_demo_seed_v1:active:instruments:' || v_venue.id::text)::uuid, v_active_gig_id, 'instruments', '["Vocals", "Acoustic Guitar"]'::jsonb),
      (md5('role_accurate_demo_seed_v1:active:type:' || v_venue.id::text)::uuid, v_active_gig_id, 'musician_type', to_jsonb('solo'::text)),
      (md5('role_accurate_demo_seed_v1:active:total:' || v_venue.id::text)::uuid, v_active_gig_id, 'total_slots_needed', to_jsonb(greatest(v_musician_count + 2, 4))),
      (md5('role_accurate_demo_seed_v1:active:slots:' || v_venue.id::text)::uuid, v_active_gig_id, 'slots', jsonb_build_object('solo', jsonb_build_object('needed', greatest(v_musician_count + 2, 4), 'roles', jsonb_build_array('Performer'), 'preferred_genres', jsonb_build_array('OPM', 'Pop'), 'preferred_instruments', jsonb_build_array('Vocals', 'Acoustic Guitar')), 'duo', jsonb_build_object('needed', 0, 'roles', '[]'::jsonb, 'preferred_genres', '[]'::jsonb, 'preferred_instruments', '[]'::jsonb), 'band', jsonb_build_object('needed', 0, 'roles', '[]'::jsonb, 'preferred_genres', '[]'::jsonb, 'preferred_instruments', '[]'::jsonb))),
      (md5('role_accurate_demo_seed_v1:pending:start:' || v_venue.id::text)::uuid, v_pending_gig_id, 'event_start_time', to_jsonb('06:00 PM'::text)),
      (md5('role_accurate_demo_seed_v1:pending:end:' || v_venue.id::text)::uuid, v_pending_gig_id, 'event_end_time', to_jsonb('10:00 PM'::text)),
      (md5('role_accurate_demo_seed_v1:pending:schedule:' || v_venue.id::text)::uuid, v_pending_gig_id, 'event_schedules', jsonb_build_array(jsonb_build_object('date', to_char(v_local_today + 7, 'YYYY-MM-DD'), 'start_time', '06:00 PM', 'end_time', '10:00 PM'))),
      (md5('role_accurate_demo_seed_v1:pending:genres:' || v_venue.id::text)::uuid, v_pending_gig_id, 'genres', '["Rock", "Pop", "Jazz"]'::jsonb),
      (md5('role_accurate_demo_seed_v1:pending:instruments:' || v_venue.id::text)::uuid, v_pending_gig_id, 'instruments', '["Vocals", "Electric Guitar", "Keyboard"]'::jsonb),
      (md5('role_accurate_demo_seed_v1:pending:type:' || v_venue.id::text)::uuid, v_pending_gig_id, 'musician_type', to_jsonb('solo'::text)),
      (md5('role_accurate_demo_seed_v1:pending:total:' || v_venue.id::text)::uuid, v_pending_gig_id, 'total_slots_needed', to_jsonb(greatest(v_musician_count + 2, 4))),
      (md5('role_accurate_demo_seed_v1:pending:slots:' || v_venue.id::text)::uuid, v_pending_gig_id, 'slots', jsonb_build_object('solo', jsonb_build_object('needed', greatest(v_musician_count + 2, 4), 'roles', jsonb_build_array('Performer'), 'preferred_genres', jsonb_build_array('Rock', 'Pop', 'Jazz'), 'preferred_instruments', jsonb_build_array('Vocals', 'Electric Guitar', 'Keyboard')), 'duo', jsonb_build_object('needed', 0, 'roles', '[]'::jsonb, 'preferred_genres', '[]'::jsonb, 'preferred_instruments', '[]'::jsonb), 'band', jsonb_build_object('needed', 0, 'roles', '[]'::jsonb, 'preferred_genres', '[]'::jsonb, 'preferred_instruments', '[]'::jsonb))),
      (md5('role_accurate_demo_seed_v1:completed:start:' || v_venue.id::text)::uuid, v_completed_gig_id, 'event_start_time', to_jsonb('06:00 PM'::text)),
      (md5('role_accurate_demo_seed_v1:completed:end:' || v_venue.id::text)::uuid, v_completed_gig_id, 'event_end_time', to_jsonb('10:00 PM'::text)),
      (md5('role_accurate_demo_seed_v1:completed:schedule:' || v_venue.id::text)::uuid, v_completed_gig_id, 'event_schedules', jsonb_build_array(jsonb_build_object('date', to_char(v_local_today - 3, 'YYYY-MM-DD'), 'start_time', '06:00 PM', 'end_time', '10:00 PM'))),
      (md5('role_accurate_demo_seed_v1:completed:total:' || v_venue.id::text)::uuid, v_completed_gig_id, 'total_slots_needed', to_jsonb(greatest(v_musician_count + 2, 4))),
      (md5('role_accurate_demo_seed_v1:completed:slots:' || v_venue.id::text)::uuid, v_completed_gig_id, 'slots', jsonb_build_object('solo', jsonb_build_object('needed', greatest(v_musician_count + 2, 4), 'roles', jsonb_build_array('Performer'), 'preferred_genres', jsonb_build_array('OPM'), 'preferred_instruments', jsonb_build_array('Vocals')), 'duo', jsonb_build_object('needed', 0, 'roles', '[]'::jsonb, 'preferred_genres', '[]'::jsonb, 'preferred_instruments', '[]'::jsonb), 'band', jsonb_build_object('needed', 0, 'roles', '[]'::jsonb, 'preferred_genres', '[]'::jsonb, 'preferred_instruments', '[]'::jsonb)))
    on conflict do nothing;

    for v_musician in
      select
        id,
        coalesce(nullif(trim(full_name), ''), 'Musician') as display_name,
        coalesce(
          nullif(trim(avatar_url), ''),
          case mod(get_byte(decode(md5(id::text), 'hex'), 0), 3)
            when 0 then 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=500&fit=crop'
            when 1 then 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=500&fit=crop'
            else 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&fit=crop'
          end
        ) as avatar_url
      from public.profiles
      where lower(coalesce(role, '')) = 'musician'
      order by id
    loop
      insert into public.gig_applications (
        id, applicant_id, gig_id, pitch_message, status, is_solo_application,
        slot_type, submitted_by_user_id, show_on_profile, performer_snapshot, created_at
      ) values
        (
          md5('role_accurate_demo_seed_v1:accepted_app:' || v_venue.id::text || ':' || v_musician.id::text)::uuid,
          v_musician.id, v_active_gig_id,
          'Demo application accepted for the upcoming Bulacan live-music night.',
          'accepted', true, 'solo', v_musician.id, true,
          jsonb_build_object('display_name', v_musician.display_name, 'avatar_url', v_musician.avatar_url, 'entity_kind', 'musician', 'source', 'role_accurate_demo_seed_v1'),
          now() - interval '2 days'
        ),
        (
          md5('role_accurate_demo_seed_v1:pending_app:' || v_venue.id::text || ':' || v_musician.id::text)::uuid,
          v_musician.id, v_pending_gig_id,
          'Demo application awaiting the venue owner review. Available for rehearsals and the full event.',
          'pending', true, 'solo', v_musician.id, false,
          jsonb_build_object('display_name', v_musician.display_name, 'avatar_url', v_musician.avatar_url, 'entity_kind', 'musician', 'source', 'role_accurate_demo_seed_v1'),
          now() - interval '1 hour'
        ),
        (
          md5('role_accurate_demo_seed_v1:completed_app:' || v_venue.id::text || ':' || v_musician.id::text)::uuid,
          v_musician.id, v_completed_gig_id,
          'Demo completed performance retained for activity history and review coverage.',
          'completed', true, 'solo', v_musician.id, true,
          jsonb_build_object('display_name', v_musician.display_name, 'avatar_url', v_musician.avatar_url, 'entity_kind', 'musician', 'source', 'role_accurate_demo_seed_v1'),
          now() - interval '10 days'
        )
      on conflict do nothing;
    end loop;
  end loop;

  -- Every musician owns one demo group. A separate pass creates one real
  -- incoming application per group from the next musician in the account list.
  for v_musician in
    select id, coalesce(nullif(trim(full_name), ''), 'Musician') as display_name
    from public.profiles
    where lower(coalesce(role, '')) = 'musician'
    order by id
  loop
    v_group_id := md5('role_accurate_demo_seed_v1:group:' || v_musician.id::text)::uuid;

    insert into public.groups (
      id, owner_id, name, genre, description, location, latitude, longitude,
      rate, group_type, open_group_applications
    ) values (
      v_group_id,
      v_musician.id,
      '[Demo] ' || left(v_musician.display_name, 36) || ' Collective',
      'OPM / Pop',
      '[role_accurate_demo_seed_v1] Demo group with a real incoming member application.',
      'Bulacan, Philippines', 14.7942, 120.8799, 9000, 'band', true
    )
    on conflict do nothing;

    insert into public.group_members (group_id, user_id, role)
    values (v_group_id, v_musician.id, 'owner')
    on conflict do nothing;

    insert into public.group_media (id, group_id, media_type, media_url, sort_order)
    values (
      md5('role_accurate_demo_seed_v1:group_media:' || v_musician.id::text)::uuid,
      v_group_id, 'image',
      'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=1000&fit=crop', 0
    )
    on conflict do nothing;
  end loop;

  if v_musician_count > 1 then
    for v_group_pair in
      with ordered_musicians as (
        select
          id as owner_id,
          coalesce(nullif(trim(full_name), ''), 'Musician') as owner_name,
          lead(id) over (order by id) as next_id,
          lead(coalesce(nullif(trim(full_name), ''), 'Musician')) over (order by id) as next_name,
          first_value(id) over (order by id) as first_id,
          first_value(coalesce(nullif(trim(full_name), ''), 'Musician')) over (order by id) as first_name
        from public.profiles
        where lower(coalesce(role, '')) = 'musician'
      )
      select
        owner_id,
        owner_name,
        coalesce(next_id, first_id) as applicant_id,
        coalesce(next_name, first_name) as applicant_name,
        md5('role_accurate_demo_seed_v1:group:' || owner_id::text)::uuid as group_id
      from ordered_musicians
      order by owner_id
    loop
      insert into public.booking_requests (
        id, sender_id, receiver_id, group_id, message, status, event_details, created_at
      ) values (
        md5('role_accurate_demo_seed_v1:group_application:' || v_group_pair.owner_id::text)::uuid,
        v_group_pair.applicant_id,
        v_group_pair.owner_id,
        v_group_pair.group_id,
        'I would like to audition and join your demo group.',
        'pending',
        jsonb_build_object(
          'type', 'listing_connection_request',
          'sender_entity_type', 'musician',
          'sender_entity_id', v_group_pair.applicant_id::text,
          'sender_entity_name', v_group_pair.applicant_name,
          'receiver_entity_type', 'group',
          'receiver_entity_id', v_group_pair.group_id::text,
          'receiver_entity_name', '[Demo] ' || left(v_group_pair.owner_name, 36) || ' Collective',
          'request_kind', 'application',
          'application_scope', 'group_member',
          'group_listing_id', v_group_pair.group_id::text,
          'listing_type', 'Group',
          'listing_id', v_group_pair.group_id::text,
          'status', 'pending',
          'source', 'role_accurate_demo_seed_v1',
          'route', '/bookings',
          'route_params', jsonb_build_object('tab', 'Pending'),
          'request_details', jsonb_build_object(
            'pitch_message', 'I would like to audition and join your demo group.',
            'application_context', 'Available for weekly rehearsals and live performances.',
            'context_label', 'Application Context',
            'request_kind', 'application'
          )
        ),
        now() - interval '45 minutes'
      )
      on conflict do nothing;
    end loop;
  end if;

  -- Producer coverage: use each producer's real owned team when available, or
  -- create one demo team. Every musician gets one pending team application.
  for v_producer in
    select id, coalesce(nullif(trim(full_name), ''), 'Producer') as display_name
    from public.profiles
    where lower(coalesce(role, '')) = 'producer'
    order by id
  loop
    select pt.id, pt.name
      into v_team_id, v_team_name
    from public.production_teams pt
    where pt.owner_id = v_producer.id
      and pt.open_production_applications is true
    order by pt.created_at, pt.id
    limit 1;

    if v_team_id is null then
      v_team_id := md5('role_accurate_demo_seed_v1:production_team:' || v_producer.id::text)::uuid;
      v_team_name := '[Demo] ' || left(v_producer.display_name, 36) || ' Productions';

      insert into public.production_teams (
        id, owner_id, name, description, logo_url, open_production_applications
      ) values (
        v_team_id,
        v_producer.id,
        v_team_name,
        '[role_accurate_demo_seed_v1] Production team accepting real demo applications.',
        'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=1000&fit=crop',
        true
      )
      on conflict do nothing;
    end if;

    insert into public.production_team_members (team_id, user_id, role)
    values (v_team_id, v_producer.id, 'owner')
    on conflict do nothing;

    for v_musician in
      select id, coalesce(nullif(trim(full_name), ''), 'Musician') as display_name
      from public.profiles
      where lower(coalesce(role, '')) = 'musician'
      order by id
    loop
      insert into public.booking_requests (
        id, sender_id, receiver_id, group_id, message, status, event_details, created_at
      ) values (
        md5('role_accurate_demo_seed_v1:production_application:' || v_team_id::text || ':' || v_musician.id::text)::uuid,
        v_musician.id,
        v_producer.id,
        null,
        'I would love to support your upcoming productions and live events.',
        'pending',
        jsonb_build_object(
          'type', 'listing_connection_request',
          'sender_entity_type', 'musician',
          'sender_entity_id', v_musician.id::text,
          'sender_entity_name', v_musician.display_name,
          'receiver_entity_type', 'production_team',
          'receiver_entity_id', v_team_id::text,
          'receiver_entity_name', v_team_name,
          'production_team_id', v_team_id::text,
          'request_kind', 'application',
          'application_scope', 'production_roster',
          'source', 'role_accurate_demo_seed_v1',
          'route', '/bookings',
          'route_params', jsonb_build_object('tab', 'Pending'),
          'request_details', jsonb_build_object(
            'pitch_message', 'I would love to support your upcoming productions and live events.',
            'application_context', 'Available for production rehearsals, event support, and live performance work.',
            'context_label', 'Application Context',
            'request_kind', 'application',
            'apply_as', 'solo',
            'roster_entry_name', v_musician.display_name,
            'roster_entry_kind', 'musician'
          )
        ),
        now() - interval '30 minutes'
      )
      on conflict do nothing;
    end loop;
  end loop;

  -- Studio-owner and musician coverage. Each musician receives pending,
  -- confirmed, and completed bookings on non-overlapping dates.
  for v_studio_owner in
    select id, coalesce(nullif(trim(full_name), ''), 'Studio Owner') as display_name
    from public.profiles
    where lower(coalesce(role, '')) = 'studio-owner'
    order by id
  loop
    v_studio_id := md5('role_accurate_demo_seed_v1:studio:' || v_studio_owner.id::text)::uuid;

    insert into public.studios (
      id, owner_id, name, address, hourly_rate, description, latitude, longitude,
      rate, rehearsal_rate, recording_rate, pax, address_verification_status,
      verified_address, address_verified_at, permit_status, permit_reviewed_at,
      studio_type
    ) values (
      v_studio_id,
      v_studio_owner.id,
      '[Demo] Bulacan Sound Lab',
      'Guiguinto, Bulacan',
      1200,
      '[role_accurate_demo_seed_v1] Rehearsal and recording studio with real demo bookings.',
      14.8333, 120.8833, 1200, 1200, 1800, 12, 'VERIFIED',
      'Guiguinto, Bulacan', now(), 'approved', now(), 'Recording and rehearsal studio'
    )
    on conflict do nothing;

    insert into public.studio_media (id, studio_id, media_type, media_url, sort_order)
    values (
      md5('role_accurate_demo_seed_v1:studio_media:' || v_studio_owner.id::text)::uuid,
      v_studio_id, 'image',
      'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1200&fit=crop', 0
    )
    on conflict do nothing;

    for v_musician in
      select
        id,
        coalesce(nullif(trim(full_name), ''), 'Musician') as display_name,
        row_number() over (order by id)::integer as sequence_no
      from public.profiles
      where lower(coalesce(role, '')) = 'musician'
      order by id
    loop
      insert into public.studio_bookings (
        id, user_id, studio_id, booking_date, start_time, end_time,
        base_rate, hours, subtotal, modifiers_applied, final_price, notes,
        status, payment_status, payment_amount, payment_type,
        remaining_balance, session_type, paid_at, created_at
      ) values
        (
          md5('role_accurate_demo_seed_v1:pending_studio_booking:' || v_studio_id::text || ':' || v_musician.id::text)::uuid,
          v_musician.id, v_studio_id, v_local_today + v_musician.sequence_no + 1,
          time '10:00', time '12:00', 1200, 2, 2400,
          jsonb_build_object('source', 'role_accurate_demo_seed_v1'),
          2400, 'Demo rehearsal request awaiting studio-owner confirmation.',
          'pending', 'unpaid', 0, 'full', 2400, 'rehearsal', null,
          now() - interval '20 minutes'
        ),
        (
          md5('role_accurate_demo_seed_v1:confirmed_studio_booking:' || v_studio_id::text || ':' || v_musician.id::text)::uuid,
          v_musician.id, v_studio_id, v_local_today + v_musician.sequence_no + 15,
          time '14:00', time '16:00', 1200, 2, 2400,
          jsonb_build_object('source', 'role_accurate_demo_seed_v1'),
          2400, 'Confirmed demo rehearsal session.',
          'confirmed', 'paid', 2400, 'full', 0, 'rehearsal', now() - interval '1 day',
          now() - interval '2 days'
        ),
        (
          md5('role_accurate_demo_seed_v1:completed_studio_booking:' || v_studio_id::text || ':' || v_musician.id::text)::uuid,
          v_musician.id, v_studio_id, v_local_today - v_musician.sequence_no - 1,
          time '18:00', time '20:00', 1200, 2, 2400,
          jsonb_build_object('source', 'role_accurate_demo_seed_v1'),
          2400, 'Completed demo recording session retained for review history.',
          'completed', 'paid', 2400, 'full', 0, 'recording', now() - interval '20 days',
          now() - interval '25 days'
        )
      on conflict do nothing;
    end loop;
  end loop;

  -- Every account gets one clearly labeled notification. This gives fan and
  -- admin accounts valid demo coverage without assigning unsupported roles.
  insert into public.notifications (id, user_id, type, title, message, read, meta)
  select
    md5('role_accurate_demo_seed_v1:notification:' || p.id::text)::uuid,
    p.id,
    'info',
    'Demo activity is ready',
    case lower(coalesce(p.role, ''))
      when 'venue-owner' then 'Your demo gigs now include accepted, pending, and completed musician activity.'
      when 'studio-owner' then 'Your demo studio now includes pending, confirmed, and completed bookings.'
      when 'producer' then 'Your production team now has pending musician applications to review.'
      when 'musician' then 'You now have demo gig, group, production-team, and studio activity.'
      when 'fan' then 'A demo notification was added; fan accounts are not assigned musician or owner records.'
      when 'admin' then 'A demo notification was added; admin accounts are not assigned unsupported booking records.'
      else 'Role-appropriate demo activity is available for this account.'
    end,
    false,
    jsonb_build_object(
      'source', 'role_accurate_demo_seed_v1',
      'is_demo', true,
      'role', p.role,
      'route', case
        when lower(coalesce(p.role, '')) in ('musician', 'producer', 'studio-owner', 'venue-owner') then '/bookings'
        else '/notifications'
      end
    )
  from public.profiles p
  on conflict do nothing;
end
$seed$;
