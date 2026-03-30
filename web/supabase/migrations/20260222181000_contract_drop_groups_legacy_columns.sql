-- Phase A contract: drop legacy group columns (members, images)
-- Preconditions handled in-migration:
-- 1) sync legacy -> normalized
-- 2) drain legacy columns with trigger bypass
-- 3) assert drained
-- 4) rewrite projection to normalized-only

DO $$
DECLARE
  v_group_id uuid;
  v_remaining bigint;
BEGIN
  FOR v_group_id IN
    SELECT g.id
    FROM public.groups g
    WHERE (g.members IS NOT NULL AND g.members <> '[]'::jsonb)
       OR COALESCE(array_length(g.images, 1), 0) > 0
  LOOP
    PERFORM public.sync_group_3nf(v_group_id);
  END LOOP;

  PERFORM set_config('app.skip_group_3nf_sync', '1', true);
  UPDATE public.groups
  SET members = NULL,
      images = NULL
  WHERE (members IS NOT NULL AND members <> '[]'::jsonb)
     OR COALESCE(array_length(images, 1), 0) > 0;
  PERFORM set_config('app.skip_group_3nf_sync', '0', true);

  SELECT
    (
      SELECT count(*)
      FROM public.groups
      WHERE members IS NOT NULL AND members <> '[]'::jsonb
    )
    +
    (
      SELECT count(*)
      FROM public.groups
      WHERE COALESCE(array_length(images, 1), 0) > 0
    )
  INTO v_remaining;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Groups contract blocked: % legacy rows still populated', v_remaining;
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.groups_legacy_projection AS
SELECT
  g.id,
  COALESCE(
    (
      SELECT jsonb_agg(
        COALESCE(
          rm.raw_member,
          jsonb_strip_nulls(
            jsonb_build_object(
              'name', rm.member_name,
              'role', rm.member_role,
              'user_id', rm.user_id,
              'avatar_url', rm.avatar_url,
              'instrument', rm.instrument
            ) || COALESCE(rm.metadata, '{}'::jsonb)
          )
        )
        ORDER BY rm.sort_order, rm.created_at
      )
      FROM public.group_roster_members rm
      WHERE rm.group_id = g.id
    ),
    '[]'::jsonb
  ) AS members,
  COALESCE(
    (
      SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at)
      FROM public.group_media gm
      WHERE gm.group_id = g.id
        AND gm.media_type = 'image'
    ),
    ARRAY[]::text[]
  ) AS images
FROM public.groups g;

DROP TRIGGER IF EXISTS trg_groups_sync_3nf_from_legacy ON public.groups;
DROP FUNCTION IF EXISTS public.trg_sync_group_3nf_from_legacy();

ALTER TABLE public.groups
  DROP COLUMN IF EXISTS members,
  DROP COLUMN IF EXISTS images;

CREATE OR REPLACE FUNCTION public.sync_group_3nf(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.groups g
  WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;
END;
$$;