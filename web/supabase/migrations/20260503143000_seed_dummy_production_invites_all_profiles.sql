-- Seed pending production-team invites for every existing profile.
-- This gives each account a Bookings > Pending invite for QA coverage.

WITH owner_profile AS (
  SELECT p.id
  FROM public.profiles p
  ORDER BY
    CASE
      WHEN lower(coalesce(p.email, '')) = 'producer@test.com' THEN 0
      WHEN lower(coalesce(p.role, '')) = 'producer' THEN 1
      ELSE 2
    END,
    p.created_at NULLS LAST,
    p.id
  LIMIT 1
),
upsert_team AS (
  INSERT INTO public.production_teams (
    id,
    owner_id,
    name,
    description,
    logo_url
  )
  SELECT
    '11111111-1111-4111-8111-111111111118'::uuid,
    op.id,
    'Harborlight Production Collective',
    'Dummy production team for QA coverage of production invite workflows across all accounts.',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&fit=crop'
  FROM owner_profile op
  ON CONFLICT (id) DO UPDATE
  SET
    owner_id = EXCLUDED.owner_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    logo_url = EXCLUDED.logo_url,
    updated_at = timezone('utc'::text, now())
  RETURNING id, owner_id, name, logo_url
),
upsert_owner_member AS (
  INSERT INTO public.production_team_members (
    team_id,
    user_id,
    role
  )
  SELECT
    ut.id,
    ut.owner_id,
    'owner'
  FROM upsert_team ut
  ON CONFLICT (team_id, user_id) DO UPDATE
  SET role = EXCLUDED.role
  RETURNING id
),
invite_targets AS (
  SELECT
    ut.id AS team_id,
    ut.owner_id AS sender_id,
    ut.name AS team_name,
    ut.logo_url AS team_logo_url,
    p.id AS receiver_id,
    coalesce(nullif(trim(p.full_name), ''), p.email, 'MusikaLokal user') AS receiver_name
  FROM upsert_team ut
  CROSS JOIN public.profiles p
),
inserted_requests AS (
  INSERT INTO public.booking_requests (
    sender_id,
    receiver_id,
    group_id,
    studio_id,
    message,
    status,
    attachment_url,
    event_details
  )
  SELECT
    it.sender_id,
    it.receiver_id,
    NULL,
    NULL,
    it.team_name || ' invited you to join their production team on MusikaLokal.',
    'pending',
    NULL,
    jsonb_build_object(
      'type', 'listing_connection_request',
      'sender_entity_type', 'production_team',
      'sender_entity_id', it.team_id::text,
      'sender_entity_name', it.team_name,
      'team_logo_url', it.team_logo_url,
      'receiver_entity_type', 'musician',
      'receiver_entity_id', it.receiver_id::text,
      'receiver_entity_name', it.receiver_name,
      'production_team_id', it.team_id::text,
      'route', '/bookings',
      'route_params', jsonb_build_object('tab', 'Pending'),
      'source', 'dummy_production_invite_seed',
      'request_kind', 'invite',
      'request_details', jsonb_build_object(
        'pitch_message', it.team_name || ' invited you to join their production team on MusikaLokal.',
        'context_label', 'Invite Context',
        'request_kind', 'invite',
        'roster_entry_name', it.receiver_name,
        'roster_entry_kind', 'musician'
      )
    )
  FROM invite_targets it
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.booking_requests br
    WHERE br.receiver_id = it.receiver_id
      AND br.event_details @> jsonb_build_object(
        'sender_entity_type', 'production_team',
        'production_team_id', it.team_id::text,
        'request_kind', 'invite',
        'source', 'dummy_production_invite_seed'
      )
  )
  RETURNING id, receiver_id, message, event_details
),
inserted_notifications AS (
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    image,
    meta,
    read
  )
  SELECT
    ir.receiver_id,
    'info',
    'New production team invite',
    ir.message,
    ir.event_details ->> 'team_logo_url',
    jsonb_build_object(
      'type', 'listing_connection_request',
      'request_id', ir.id,
      'request_status', 'pending',
      'sender_entity_type', 'production_team',
      'sender_entity_id', ir.event_details ->> 'sender_entity_id',
      'sender_entity_name', ir.event_details ->> 'sender_entity_name',
      'receiver_entity_type', 'musician',
      'receiver_entity_name', ir.event_details ->> 'receiver_entity_name',
      'production_team_id', ir.event_details ->> 'production_team_id',
      'route', '/bookings',
      'route_params', jsonb_build_object('tab', 'Pending'),
      'source', 'dummy_production_invite_seed'
    ),
    false
  FROM inserted_requests ir
  RETURNING id
)
SELECT
  (SELECT count(*) FROM upsert_team) AS teams_upserted,
  (SELECT count(*) FROM upsert_owner_member) AS owner_members_upserted,
  (SELECT count(*) FROM inserted_requests) AS invites_inserted,
  (SELECT count(*) FROM inserted_notifications) AS notifications_inserted;
