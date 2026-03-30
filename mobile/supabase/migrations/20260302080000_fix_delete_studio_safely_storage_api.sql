-- Fix delete_studio_safely: avoid direct deletes against storage.objects
-- Supabase blocks direct table deletes and requires Storage API usage.

CREATE OR REPLACE FUNCTION public.delete_studio_safely(
  p_studio_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_uid UUID;
  v_studio RECORD;
  v_active_bookings_count INTEGER := 0;
  v_pending_relocation_count INTEGER := 0;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
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
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE studio_id = p_studio_id)
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

  -- NOTE: Do not delete from storage.objects directly.
  -- Supabase enforces Storage API-only deletion for safety.

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
    'related_counts', v_related_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(uuid, text) TO authenticated;
