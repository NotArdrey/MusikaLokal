-- Admin RLS policies for booking_incidents
DROP POLICY IF EXISTS "Admin can view all booking incidents" ON public.booking_incidents;
CREATE POLICY "Admin can view all booking incidents"
ON public.booking_incidents FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Admin can update booking incidents" ON public.booking_incidents;
CREATE POLICY "Admin can update booking incidents"
ON public.booking_incidents FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- RPC: fetch all booking incidents for admin
CREATE OR REPLACE FUNCTION public.admin_fetch_booking_incidents(
  p_status_filter text DEFAULT 'all',
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', bi.id,
          'booking_id', bi.booking_id,
          'reporter_user_id', bi.reporter_user_id,
          'counterparty_user_id', bi.counterparty_user_id,
          'issue_type', bi.issue_type,
          'status', bi.status,
          'reporter_notes', bi.reporter_notes,
          'counterparty_notes', bi.counterparty_notes,
          'response_deadline_at', bi.response_deadline_at,
          'responded_at', bi.responded_at,
          'resolved_at', bi.resolved_at,
          'resolved_by_user_id', bi.resolved_by_user_id,
          'resolution', bi.resolution,
          'created_at', bi.created_at,
          'studio_name', s.name,
          'booking_date', sb.booking_date,
          'booking_start_time', sb.start_time,
          'booking_end_time', sb.end_time,
          'reporter_name', COALESCE(rp.full_name, 'Unknown'),
          'reporter_email', COALESCE(rp.email, ''),
          'counterparty_name', COALESCE(cp.full_name, 'Unknown'),
          'counterparty_email', COALESCE(cp.email, '')
        )
        ORDER BY bi.created_at DESC
      ),
      '[]'::jsonb
    )
    FROM booking_incidents bi
    LEFT JOIN studio_bookings sb ON sb.id = bi.booking_id
    LEFT JOIN studios s ON s.id = sb.studio_id
    LEFT JOIN profiles rp ON rp.id = bi.reporter_user_id
    LEFT JOIN profiles cp ON cp.id = bi.counterparty_user_id
    WHERE p_status_filter = 'all' OR bi.status = p_status_filter
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_incidents(text, int) TO authenticated;

-- RPC: resolve a booking incident as admin
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
    status             = p_resolution,
    resolved_at        = NOW(),
    resolved_by_user_id = v_user_id,
    resolution         = v_notes
  WHERE id = p_incident_id
  RETURNING * INTO v_updated;

  -- Notify participants
  INSERT INTO notifications (user_id, type, title, message, read, meta)
  SELECT
    uid,
    'info',
    'Booking Incident Resolved',
    'An admin resolved your booking incident as ' || REPLACE(p_resolution, '_', ' ') || '.',
    false,
    jsonb_build_object(
      'incident_id',  p_incident_id,
      'booking_id',   v_incident.booking_id,
      'resolution',   p_resolution,
      'event_type',   'booking_incident_resolved_by_admin'
    )
  FROM unnest(ARRAY[v_incident.reporter_user_id, v_incident.counterparty_user_id]) AS uid
  WHERE uid IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'incident', row_to_json(v_updated));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(uuid, text, text) TO authenticated;
