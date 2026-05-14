-- Accepted venue gig invites must also exist as gig_applications because
-- My Venue and Bookings derive joined/active musicians from gig_applications.

WITH invite_rows AS (
  SELECT
    br.id AS request_id,
    br.receiver_id,
    br.group_id AS request_group_id,
    br.message,
    br.event_details,
    COALESCE(
      br.event_details->'request_details'->>'gig_id',
      br.event_details->>'gig_id',
      CASE
        WHEN lower(COALESCE(br.event_details->>'listing_type', br.event_details->'request_details'->>'listing_type', '')) = 'gig'
        THEN COALESCE(br.event_details->>'listing_id', br.event_details->'request_details'->>'listing_id')
      END,
      CASE
        WHEN lower(COALESCE(br.event_details->>'sender_entity_type', '')) = 'venue'
        THEN br.event_details->>'sender_entity_id'
      END
    ) AS raw_gig_id,
    COALESCE(
      br.group_id::text,
      CASE
        WHEN lower(COALESCE(br.event_details->>'receiver_entity_type', '')) = 'group'
        THEN br.event_details->>'receiver_entity_id'
      END
    ) AS raw_group_id,
    COALESCE(
      br.event_details->'request_details'->>'slot_type',
      br.event_details->>'slot_type',
      br.event_details->'request_details'->>'roster_entry_kind',
      br.event_details->>'roster_entry_kind',
      'solo'
    ) AS raw_slot_type,
    COALESCE(
      br.event_details->'request_details'->>'pitch_message',
      br.event_details->>'pitch_message',
      br.message,
      'Accepted venue gig invite.'
    ) AS pitch_message
  FROM public.booking_requests br
  WHERE br.status = 'accepted'
    AND lower(COALESCE(br.event_details->>'sender_entity_type', '')) = 'venue'
    AND lower(COALESCE(
      br.event_details->'request_details'->>'request_kind',
      br.event_details->>'request_kind',
      ''
    )) = 'invite'
),
normalized_invites AS (
  SELECT
    request_id,
    receiver_id,
    CASE
      WHEN raw_gig_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN raw_gig_id::uuid
    END AS gig_id,
    CASE
      WHEN raw_group_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN raw_group_id::uuid
    END AS group_id,
    CASE
      WHEN lower(raw_slot_type) = 'duo' THEN 'duo'
      WHEN lower(raw_slot_type) IN ('group', 'band') THEN 'band'
      ELSE 'solo'
    END AS slot_type,
    pitch_message
  FROM invite_rows
),
materializable_invites AS (
  SELECT
    ni.request_id,
    ni.gig_id,
    ni.group_id,
    COALESCE(g.owner_id, ni.receiver_id) AS applicant_id,
    ni.receiver_id AS submitted_by_user_id,
    ni.slot_type,
    ni.pitch_message
  FROM normalized_invites ni
  LEFT JOIN public.groups g ON g.id = ni.group_id
  WHERE ni.gig_id IS NOT NULL
    AND COALESCE(g.owner_id, ni.receiver_id) IS NOT NULL
),
deduped_invites AS (
  SELECT DISTINCT ON (mi.gig_id, mi.applicant_id)
    mi.request_id,
    mi.gig_id,
    mi.group_id,
    mi.applicant_id,
    mi.submitted_by_user_id,
    mi.slot_type,
    mi.pitch_message
  FROM materializable_invites mi
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.gig_applications ga
    WHERE ga.gig_id = mi.gig_id
      AND ga.production_team_id IS NULL
      AND (
        ga.applicant_id = mi.applicant_id
        OR (mi.group_id IS NOT NULL AND ga.group_id = mi.group_id)
      )
  )
  ORDER BY mi.gig_id, mi.applicant_id, mi.request_id
)
INSERT INTO public.gig_applications (
  gig_id,
  applicant_id,
  group_id,
  status,
  pitch_message,
  slot_type,
  submitted_by_user_id,
  leader_approval_status,
  is_solo_application,
  show_on_profile
)
SELECT
  gig_id,
  applicant_id,
  group_id,
  'accepted',
  pitch_message,
  slot_type,
  submitted_by_user_id,
  CASE WHEN group_id IS NOT NULL THEN 'approved' ELSE NULL END,
  group_id IS NULL,
  true
FROM deduped_invites;
