-- Keep group leadership canonical: public.groups.owner_id is the single source of truth.
-- Existing duplicate owner roles are cleaned, and future membership writes are normalized.

UPDATE public.group_members gm
SET role = 'member'
FROM public.groups g
WHERE gm.group_id = g.id
  AND gm.role = 'owner'
  AND gm.user_id IS DISTINCT FROM g.owner_id;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT g.id, g.owner_id, 'owner'
FROM public.groups g
WHERE g.owner_id IS NOT NULL
ON CONFLICT (group_id, user_id)
DO UPDATE SET role = 'owner';

UPDATE public.group_roster_members grm
SET
  member_role = CASE
    WHEN grm.user_id = g.owner_id THEN 'Leader'
    WHEN grm.member_role IN ('Leader', 'owner') THEN 'Member'
    ELSE grm.member_role
  END,
  raw_member = CASE
    WHEN jsonb_typeof(COALESCE(grm.raw_member, '{}'::jsonb)) = 'object' THEN
      jsonb_set(
        COALESCE(grm.raw_member, '{}'::jsonb),
        '{role}',
        to_jsonb(
          CASE
            WHEN grm.user_id = g.owner_id THEN 'Leader'
            WHEN grm.member_role IN ('Leader', 'owner') THEN 'Member'
            ELSE COALESCE(grm.member_role, 'Member')
          END
        ),
        true
      )
    ELSE grm.raw_member
  END
FROM public.groups g
WHERE grm.group_id = g.id
  AND grm.user_id IS NOT NULL
  AND (
    grm.user_id = g.owner_id
    OR grm.member_role IN ('Leader', 'owner')
    OR grm.raw_member->>'role' IN ('Leader', 'owner')
  );

UPDATE public.leadership_transfer_requests ltr
SET status = 'cancelled',
    responded_at = COALESCE(ltr.responded_at, now())
FROM public.groups g
WHERE ltr.group_id = g.id
  AND ltr.status = 'pending'
  AND ltr.from_user_id IS DISTINCT FROM g.owner_id;

CREATE OR REPLACE FUNCTION public.normalize_group_member_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid;
BEGIN
  SELECT owner_id
  INTO v_owner_id
  FROM public.groups
  WHERE id = NEW.group_id;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = v_owner_id THEN
    NEW.role := 'owner';
  ELSIF NEW.role = 'owner' THEN
    NEW.role := 'member';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_group_members_normalize_owner_role ON public.group_members;
CREATE TRIGGER trg_group_members_normalize_owner_role
BEFORE INSERT OR UPDATE OF group_id, user_id, role
ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.normalize_group_member_owner_role();

CREATE OR REPLACE FUNCTION public.sync_group_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.group_members
  SET role = 'member'
  WHERE group_id = NEW.id
    AND user_id <> NEW.owner_id
    AND role = 'owner';

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET role = 'owner';

  UPDATE public.leadership_transfer_requests
  SET status = 'cancelled',
      responded_at = now()
  WHERE group_id = NEW.id
    AND status = 'pending'
    AND from_user_id IS DISTINCT FROM NEW.owner_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_groups_sync_owner_membership ON public.groups;
CREATE TRIGGER trg_groups_sync_owner_membership
AFTER INSERT OR UPDATE OF owner_id
ON public.groups
FOR EACH ROW
EXECUTE FUNCTION public.sync_group_owner_membership();

CREATE UNIQUE INDEX IF NOT EXISTS idx_group_members_one_owner_per_group
ON public.group_members (group_id)
WHERE role = 'owner';

CREATE OR REPLACE FUNCTION public.accept_leadership_transfer(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  req public.leadership_transfer_requests%ROWTYPE;
  v_group public.groups%ROWTYPE;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO req
  FROM public.leadership_transfer_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer request not found' USING ERRCODE = 'P0002';
  END IF;

  IF req.status <> 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending' USING ERRCODE = 'P0001';
  END IF;

  IF req.to_user_id IS DISTINCT FROM v_actor_id THEN
    RAISE EXCEPTION 'Only the recipient can accept this transfer' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups
  WHERE id = req.group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.leadership_transfer_requests
    SET status = 'cancelled', responded_at = now()
    WHERE id = request_id;

    RAISE EXCEPTION 'Group not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_group.owner_id IS DISTINCT FROM req.from_user_id THEN
    UPDATE public.leadership_transfer_requests
    SET status = 'cancelled', responded_at = now()
    WHERE id = request_id;

    RAISE EXCEPTION 'Transfer is no longer valid because group leadership changed' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = req.group_id
      AND gm.user_id = req.to_user_id
  ) THEN
    RAISE EXCEPTION 'New leader must still be a current group member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.groups
  SET owner_id = req.to_user_id
  WHERE id = req.group_id;

  UPDATE public.group_members
  SET role = 'member'
  WHERE group_id = req.group_id
    AND user_id <> req.to_user_id
    AND role = 'owner';

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (req.group_id, req.from_user_id, 'member')
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET role = 'member';

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (req.group_id, req.to_user_id, 'owner')
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET role = 'owner';

  UPDATE public.leadership_transfer_requests
  SET status = 'cancelled', responded_at = now()
  WHERE group_id = req.group_id
    AND id <> request_id
    AND status = 'pending';

  UPDATE public.leadership_transfer_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = request_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_leadership_transfer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_leadership_transfer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_leadership_transfer(uuid) TO authenticated;
