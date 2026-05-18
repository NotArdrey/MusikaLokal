-- Clean up booking_requests before deleting group or studio owners' listings.
-- The booking_requests group_id and studio_id FKs are nullable but currently use
-- NO ACTION, so safe deletes must clear those rows before deleting the parent.

CREATE OR REPLACE FUNCTION public.delete_group_safely(
  p_group_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_group RECORD;
  v_pending_count INTEGER := 0;
  v_accepted_count INTEGER := 0;
  v_pending_transfer_count INTEGER := 0;
  v_deleted_booking_request_count INTEGER := 0;
  v_related_counts JSONB;
  v_application_counts JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups g
  WHERE g.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GROUP_NOT_FOUND',
      'message', 'Group not found.'
    );
  END IF;

  IF v_group.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this group';
  END IF;

  SELECT COUNT(*)
  INTO v_pending_transfer_count
  FROM public.leadership_transfer_requests ltr
  WHERE ltr.group_id = p_group_id
    AND ltr.status = 'pending';

  IF v_pending_transfer_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PENDING_LEADERSHIP_TRANSFER_EXISTS',
      'pending_transfer_count', v_pending_transfer_count,
      'message', 'Delete blocked. Cancel pending leadership transfer request(s) first.'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_pending_count
  FROM public.gig_applications ga
  WHERE ga.group_id = p_group_id
    AND ga.status = 'pending';

  SELECT COUNT(*)
  INTO v_accepted_count
  FROM public.gig_applications ga
  WHERE ga.group_id = p_group_id
    AND ga.status = 'accepted';

  IF v_accepted_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACTIVE_ACCEPTED_APPLICATIONS_EXIST',
      'accepted_application_count', v_accepted_count,
      'pending_application_count', v_pending_count,
      'message', 'Delete blocked. Resolve accepted gig applications first.'
    );
  END IF;

  IF v_pending_count > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Group Removed',
      COALESCE(v_group.name, 'A group') || ' was removed by the owner. Your pending gig application has been closed.',
      jsonb_build_object(
        'group_id', p_group_id,
        'event', 'group_deleted',
        'reason', p_reason,
        'previous_status', ga.status,
        'gig_id', ga.gig_id
      )
    FROM public.gig_applications ga
    WHERE ga.group_id = p_group_id
      AND ga.status = 'pending';
  END IF;

  v_related_counts := jsonb_build_object(
    'group_members', (SELECT COUNT(*) FROM public.group_members WHERE group_id = p_group_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE group_id = p_group_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE group_id = p_group_id),
    'booking_requests', (SELECT COUNT(*) FROM public.booking_requests WHERE group_id = p_group_id),
    'leadership_transfer_requests_total', (SELECT COUNT(*) FROM public.leadership_transfer_requests WHERE group_id = p_group_id)
  );

  v_application_counts := jsonb_build_object(
    'pending', v_pending_count,
    'accepted', v_accepted_count,
    'rejected', (SELECT COUNT(*) FROM public.gig_applications WHERE group_id = p_group_id AND status = 'rejected')
  );

  INSERT INTO public.group_deletion_audit (
    group_id,
    owner_id,
    deleted_by,
    group_snapshot,
    related_counts,
    application_counts,
    reason
  )
  VALUES (
    p_group_id,
    v_group.owner_id,
    v_uid,
    to_jsonb(v_group),
    v_related_counts,
    v_application_counts,
    p_reason
  );

  DELETE FROM public.booking_requests
  WHERE group_id = p_group_id;

  GET DIAGNOSTICS v_deleted_booking_request_count = ROW_COUNT;

  DELETE FROM public.groups
  WHERE id = p_group_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete group';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'deleted_booking_requests', v_deleted_booking_request_count,
    'related_counts', v_related_counts,
    'application_counts', v_application_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_studio_safely(
  p_studio_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_uid UUID;
  v_studio RECORD;
  v_active_bookings_count INTEGER := 0;
  v_pending_relocation_count INTEGER := 0;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
  v_deleted_booking_request_count INTEGER := 0;
  v_related_counts JSONB;
  v_storage_cleanup JSONB;
  v_storage_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_pairs JSONB := '[]'::JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_studio
  FROM public.studios s
  WHERE s.id = p_studio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDIO_NOT_FOUND',
      'message', 'Studio not found.'
    );
  END IF;

  IF v_studio.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this studio';
  END IF;

  SELECT COUNT(*)
  INTO v_active_bookings_count
  FROM public.studio_bookings sb
  WHERE sb.studio_id = p_studio_id
    AND sb.status IN ('pending', 'confirmed', 'checked_in', 'pending_relocation');

  SELECT COUNT(*)
  INTO v_pending_relocation_count
  FROM public.studio_bookings sb
  WHERE sb.studio_id = p_studio_id
    AND sb.status = 'pending_relocation';

  IF v_active_bookings_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACTIVE_BOOKINGS_EXIST',
      'active_booking_count', v_active_bookings_count,
      'pending_relocation_count', v_pending_relocation_count,
      'message', 'Delete blocked. Resolve active bookings first (including relocation workflows) to preserve notifications/refund handling.'
    );
  END IF;

  v_related_counts := jsonb_build_object(
    'studio_settings', (SELECT COUNT(*) FROM public.studio_settings WHERE studio_id = p_studio_id),
    'studio_operating_hours', (SELECT COUNT(*) FROM public.studio_operating_hours WHERE studio_id = p_studio_id),
    'studio_date_overrides', (SELECT COUNT(*) FROM public.studio_date_overrides WHERE studio_id = p_studio_id),
    'studio_bookings_total', (SELECT COUNT(*) FROM public.studio_bookings WHERE studio_id = p_studio_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE studio_id = p_studio_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE studio_id = p_studio_id),
    'booking_requests', (SELECT COUNT(*) FROM public.booking_requests WHERE studio_id = p_studio_id)
  );

  v_storage_urls := v_storage_urls || ARRAY(
    SELECT sm.media_url
    FROM public.studio_media sm
    WHERE sm.studio_id = p_studio_id
      AND sm.media_type = 'image'
    ORDER BY sm.sort_order, sm.created_at
  );

  IF v_studio.contract_url IS NOT NULL AND btrim(v_studio.contract_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_studio.contract_url;
  END IF;

  IF v_studio.business_permit_url IS NOT NULL AND btrim(v_studio.business_permit_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_studio.business_permit_url;
  END IF;

  WITH parsed AS (
    SELECT
      (m)[1] AS bucket_id,
      split_part((m)[2], '?', 1) AS object_path
    FROM (
      SELECT regexp_matches(
        u.url,
        '/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$'
      ) AS m
      FROM unnest(v_storage_urls) AS u(url)
      WHERE u.url IS NOT NULL
    ) t
    WHERE m IS NOT NULL
  ), dedup AS (
    SELECT DISTINCT bucket_id, object_path
    FROM parsed
    WHERE object_path <> ''
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('bucket_id', bucket_id, 'object_path', object_path)), '[]'::jsonb),
    COUNT(*)
  INTO v_storage_pairs, v_storage_objects_to_delete
  FROM dedup;

  v_storage_cleanup := jsonb_build_object(
    'candidate_urls', COALESCE(array_length(v_storage_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count,
    'delete_mode', 'skipped_direct_table_delete'
  );

  INSERT INTO public.studio_deletion_audit (
    studio_id,
    owner_id,
    deleted_by,
    studio_snapshot,
    related_counts,
    storage_cleanup,
    reason
  )
  VALUES (
    p_studio_id,
    v_studio.owner_id,
    v_uid,
    to_jsonb(v_studio),
    v_related_counts,
    v_storage_cleanup,
    p_reason
  );

  DELETE FROM public.booking_requests
  WHERE studio_id = p_studio_id;

  GET DIAGNOSTICS v_deleted_booking_request_count = ROW_COUNT;

  DELETE FROM public.studios
  WHERE id = p_studio_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete studio';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'active_booking_count', 0,
    'deleted_booking_requests', v_deleted_booking_request_count,
    'related_counts', v_related_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(UUID, TEXT) TO authenticated;
