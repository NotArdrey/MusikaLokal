CREATE OR REPLACE FUNCTION public.admin_resolve_booking_incident(
  p_incident_id uuid,
  p_resolution text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_incident record;
  v_notes text;
  v_updated record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_resolution NOT IN ('resolved_refund', 'resolved_no_refund', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid resolution. Must be: resolved_refund, resolved_no_refund, or dismissed';
  END IF;

  SELECT * INTO v_incident FROM booking_incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found';
  END IF;

  IF v_incident.status NOT IN ('open', 'responded', 'manual_review') THEN
    RAISE EXCEPTION 'This incident is already resolved';
  END IF;

  v_notes := COALESCE(
    NULLIF(TRIM(COALESCE(p_admin_notes, '')), ''),
    CASE p_resolution
      WHEN 'resolved_refund'    THEN 'Admin resolved incident with refund outcome.'
      WHEN 'resolved_no_refund' THEN 'Admin resolved incident with no-refund outcome.'
      ELSE                           'Admin dismissed incident.'
    END
  );

  UPDATE booking_incidents
  SET
    status = p_resolution,
    resolved_at = NOW(),
    resolved_by_user_id = v_user_id,
    resolution = v_notes
  WHERE id = p_incident_id
  RETURNING * INTO v_updated;

  INSERT INTO notifications (user_id, type, title, message, read, meta)
  SELECT DISTINCT
    uid,
    'info',
    'Booking Incident Resolved',
    'An admin resolved your booking incident as ' || REPLACE(p_resolution, '_', ' ') || '.',
    false,
    jsonb_build_object(
      'incident_id', p_incident_id,
      'booking_id', v_incident.booking_id,
      'resolution', p_resolution,
      'event_type', 'booking_incident_resolved_by_admin'
    )
  FROM unnest(ARRAY[v_incident.reporter_user_id, v_incident.counterparty_user_id]) AS uid
  WHERE uid IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'incident', row_to_json(v_updated));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(uuid, text, text) TO authenticated;
