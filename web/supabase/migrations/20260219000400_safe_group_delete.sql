-- Safe group deletion flow with guardrails for accepted gig applications and pending leadership transfers.

CREATE TABLE IF NOT EXISTS public.group_deletion_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL,
  owner_id UUID,
  deleted_by UUID,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  group_snapshot JSONB NOT NULL,
  related_counts JSONB NOT NULL,
  application_counts JSONB NOT NULL,
  reason TEXT
);

ALTER TABLE public.group_deletion_audit ENABLE ROW LEVEL SECURITY;

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

  DELETE FROM public.groups
  WHERE id = p_group_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete group';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'related_counts', v_related_counts,
    'application_counts', v_application_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(UUID, TEXT) TO authenticated;
