-- Initiate group leadership transfers atomically so cross-user notifications
-- stay behind a trusted server-side permission boundary.

CREATE OR REPLACE FUNCTION public.initiate_leadership_transfer(
  p_group_id uuid,
  p_to_user_id uuid,
  p_message text DEFAULT NULL
)
RETURNS public.leadership_transfer_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_group public.groups%ROWTYPE;
  v_request public.leadership_transfer_requests%ROWTYPE;
  v_message text := NULLIF(BTRIM(COALESCE(p_message, '')), '');
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_group_id IS NULL OR p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Group and new leader are required' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups
  WHERE id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_group.owner_id <> v_actor_id THEN
    RAISE EXCEPTION 'Only the current group owner can transfer leadership' USING ERRCODE = '42501';
  END IF;

  IF p_to_user_id = v_actor_id THEN
    RAISE EXCEPTION 'Choose a different group member as the new leader' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_to_user_id
  ) THEN
    RAISE EXCEPTION 'New leader must be a current group member' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.leadership_transfer_requests ltr
    WHERE ltr.group_id = p_group_id
      AND ltr.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This group already has a pending leadership transfer' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.leadership_transfer_requests (
    group_id,
    from_user_id,
    to_user_id,
    message,
    status
  )
  VALUES (
    p_group_id,
    v_actor_id,
    p_to_user_id,
    v_message,
    'pending'
  )
  RETURNING * INTO v_request;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    meta,
    read
  )
  VALUES (
    p_to_user_id,
    'info',
    'Leadership Transfer Request',
    FORMAT('You have been invited to become the leader of "%s". Open to accept or decline.', v_group.name),
    jsonb_build_object(
      'type', 'leadership_transfer',
      'request_id', v_request.id,
      'group_id', p_group_id,
      'group_name', v_group.name,
      'route', '/notifications'
    ),
    false
  );

  RETURN v_request;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'This group already has a pending leadership transfer' USING ERRCODE = '23505';
END;
$function$;

REVOKE ALL ON FUNCTION public.initiate_leadership_transfer(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.initiate_leadership_transfer(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.initiate_leadership_transfer(uuid, uuid, text) TO authenticated;
