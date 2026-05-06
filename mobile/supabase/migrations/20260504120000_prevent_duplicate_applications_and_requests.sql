-- Prevent duplicate active application/request rows while keeping historical rows queryable.
-- Existing live data contains historical active duplicates, so the unique guards
-- apply only to rows created after this migration timestamp.

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_active_group_application
ON public.gig_applications (gig_id, group_id)
WHERE group_id IS NOT NULL
  AND production_team_id IS NULL
  AND status IN ('pending', 'accepted', 'approved')
  AND created_at >= '2026-05-04 12:00:00+00'::timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_requests_unique_active_listing_request
ON public.booking_requests (
  sender_id,
  receiver_id,
  (COALESCE(group_id::text, '')),
  (COALESCE(studio_id::text, '')),
  (COALESCE(event_details->>'sender_entity_type', '')),
  (COALESCE(event_details->>'sender_entity_id', '')),
  (COALESCE(event_details->>'receiver_entity_type', '')),
  (COALESCE(event_details->>'receiver_entity_id', '')),
  (COALESCE(event_details->>'production_team_id', '')),
  (COALESCE(event_details->>'request_kind', '')),
  (COALESCE(event_details->>'application_scope', ''))
)
WHERE status IN ('pending', 'accepted', 'approved', 'connected')
  AND created_at >= '2026-05-04 12:00:00+00'::timestamptz
  AND event_details @> '{"type":"listing_connection_request"}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_booking_requests_group_member_applications
ON public.booking_requests (group_id, status, created_at DESC)
WHERE group_id IS NOT NULL
  AND event_details @> '{"type":"listing_connection_request","request_kind":"application","application_scope":"group_member"}'::jsonb;
