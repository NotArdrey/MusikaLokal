-- Accepted production-team applications/invites should make the performer visible
-- wherever the app reads production_team_members, while still keeping roster data.

WITH accepted_production_requests AS (
  SELECT
    br.id,
    br.sender_id,
    br.receiver_id,
    br.group_id,
    lower(coalesce(br.status, '')) AS request_status,
    lower(coalesce(
      br.event_details::jsonb #>> '{request_details,request_kind}',
      br.event_details::jsonb ->> 'request_kind',
      ''
    )) AS request_kind,
    lower(coalesce(br.event_details::jsonb ->> 'sender_entity_type', '')) AS sender_entity_type,
    lower(coalesce(br.event_details::jsonb ->> 'receiver_entity_type', '')) AS receiver_entity_type,
    coalesce(
      nullif(br.event_details::jsonb ->> 'production_team_id', ''),
      CASE
        WHEN lower(coalesce(br.event_details::jsonb ->> 'sender_entity_type', '')) = 'production_team'
          THEN nullif(br.event_details::jsonb ->> 'sender_entity_id', '')
      END,
      CASE
        WHEN lower(coalesce(br.event_details::jsonb ->> 'receiver_entity_type', '')) = 'production_team'
          THEN nullif(br.event_details::jsonb ->> 'receiver_entity_id', '')
      END
    ) AS team_id_text
  FROM public.booking_requests br
  WHERE lower(coalesce(br.status, '')) IN ('accepted', 'approved', 'connected')
),
resolved_requests AS (
  SELECT
    *,
    team_id_text::uuid AS team_id
  FROM accepted_production_requests
  WHERE request_kind IN ('application', 'invite')
    AND (sender_entity_type = 'production_team' OR receiver_entity_type = 'production_team')
    AND team_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
solo_requests AS (
  SELECT
    r.team_id,
    CASE
      WHEN r.sender_entity_type = 'production_team' THEN r.receiver_id
      ELSE r.sender_id
    END AS profile_id,
    r.sender_id AS added_by_user_id
  FROM resolved_requests r
  WHERE r.group_id IS NULL
    AND (
      (r.sender_entity_type = 'production_team' AND r.receiver_entity_type = 'musician')
      OR (r.receiver_entity_type = 'production_team' AND r.sender_entity_type = 'musician')
    )
),
group_requests AS (
  SELECT
    r.team_id,
    r.group_id,
    r.sender_id AS added_by_user_id,
    g.owner_id,
    CASE WHEN g.group_type = 'duo' THEN 'duo' ELSE 'group' END AS entity_kind
  FROM resolved_requests r
  JOIN public.groups g ON g.id = r.group_id
  WHERE r.group_id IS NOT NULL
    AND (
      (r.sender_entity_type = 'production_team' AND r.receiver_entity_type = 'group')
      OR (r.receiver_entity_type = 'production_team' AND r.sender_entity_type = 'group')
    )
),
insert_solo_roster AS (
  INSERT INTO public.production_team_roster (
    team_id,
    entity_kind,
    profile_id,
    added_by_user_id
  )
  SELECT
    s.team_id,
    'musician',
    p.id,
    s.added_by_user_id
  FROM solo_requests s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE lower(coalesce(p.role, '')) = 'musician'
  ON CONFLICT DO NOTHING
  RETURNING id
),
insert_group_roster AS (
  INSERT INTO public.production_team_roster (
    team_id,
    entity_kind,
    group_id,
    added_by_user_id
  )
  SELECT
    g.team_id,
    g.entity_kind,
    g.group_id,
    g.added_by_user_id
  FROM group_requests g
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO public.production_team_members (
  team_id,
  user_id,
  role
)
SELECT
  s.team_id,
  p.id,
  'member'
FROM solo_requests s
JOIN public.profiles p ON p.id = s.profile_id
WHERE lower(coalesce(p.role, '')) = 'musician'
UNION
SELECT
  g.team_id,
  g.owner_id,
  'member'
FROM group_requests g
WHERE g.owner_id IS NOT NULL
ON CONFLICT (team_id, user_id) DO NOTHING;
