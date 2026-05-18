-- Keep production invite duplicate checks fast when validating new invites.

CREATE INDEX IF NOT EXISTS idx_booking_requests_production_invites_group
ON public.booking_requests ((event_details->>'production_team_id'), group_id, status)
WHERE group_id IS NOT NULL
  AND status IN ('pending', 'accepted')
  AND event_details @> '{"sender_entity_type":"production_team","request_kind":"invite"}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_booking_requests_production_invites_profile
ON public.booking_requests ((event_details->>'production_team_id'), receiver_id, status)
WHERE group_id IS NULL
  AND status IN ('pending', 'accepted')
  AND event_details @> '{"sender_entity_type":"production_team","request_kind":"invite"}'::jsonb;
