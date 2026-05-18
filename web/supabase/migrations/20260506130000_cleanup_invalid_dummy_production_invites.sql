-- Remove dummy solo production-team invites that were seeded for non-musician accounts.
-- Solo production roster entries only support musician profiles.

WITH invalid_requests AS (
  SELECT br.id
  FROM public.booking_requests br
  JOIN public.profiles p ON p.id = br.receiver_id
  WHERE br.status = 'pending'
    AND br.group_id IS NULL
    AND lower(coalesce(p.role, '')) <> 'musician'
    AND br.event_details @> jsonb_build_object(
      'sender_entity_type', 'production_team',
      'request_kind', 'invite',
      'source', 'dummy_production_invite_seed'
    )
),
deleted_notifications AS (
  DELETE FROM public.notifications n
  USING invalid_requests ir
  WHERE n.meta ->> 'request_id' = ir.id::text
    AND n.meta ->> 'source' = 'dummy_production_invite_seed'
  RETURNING n.id
),
deleted_requests AS (
  DELETE FROM public.booking_requests br
  USING invalid_requests ir
  WHERE br.id = ir.id
  RETURNING br.id
)
SELECT
  (SELECT count(*) FROM deleted_requests) AS invalid_dummy_invites_deleted,
  (SELECT count(*) FROM deleted_notifications) AS invalid_dummy_notifications_deleted;
