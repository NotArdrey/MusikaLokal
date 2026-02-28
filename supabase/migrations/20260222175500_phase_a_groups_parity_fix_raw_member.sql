-- Phase A parity fix: preserve exact source member JSON for perfect projection parity

ALTER TABLE public.group_roster_members
ADD COLUMN IF NOT EXISTS raw_member jsonb;

UPDATE public.group_roster_members
SET raw_member = COALESCE(raw_member, jsonb_strip_nulls(
  jsonb_build_object(
    'name', member_name,
    'role', member_role,
    'user_id', user_id,
    'avatar_url', avatar_url,
    'instrument', instrument
  ) || COALESCE(metadata, '{}'::jsonb)
));

ALTER TABLE public.group_roster_members
ALTER COLUMN raw_member SET DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.sync_group_3nf(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.groups g WHERE g.id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  DELETE FROM public.group_media WHERE group_id = p_group_id;
  DELETE FROM public.group_roster_members WHERE group_id = p_group_id;

  INSERT INTO public.group_media (group_id, media_type, media_url, sort_order)
  SELECT
    g.id,
    'image',
    trim(x.url),
    x.position::int - 1
  FROM public.groups g
  CROSS JOIN LATERAL unnest(COALESCE(g.images, ARRAY[]::text[])) WITH ORDINALITY AS x(url, position)
  WHERE g.id = p_group_id
    AND NULLIF(btrim(x.url), '') IS NOT NULL
  ON CONFLICT (group_id, media_type, media_url) DO NOTHING;

  INSERT INTO public.group_roster_members (
    group_id,
    user_id,
    member_name,
    member_role,
    instrument,
    avatar_url,
    sort_order,
    metadata,
    raw_member
  )
  SELECT
    g.id,
    CASE
      WHEN NULLIF(btrim(m.item->>'user_id'), '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN (m.item->>'user_id')::uuid
      ELSE NULL
    END AS user_id,
    COALESCE(NULLIF(btrim(m.item->>'name'), ''), 'Unknown') AS member_name,
    NULLIF(btrim(m.item->>'role'), '') AS member_role,
    NULLIF(btrim(m.item->>'instrument'), '') AS instrument,
    NULLIF(btrim(m.item->>'avatar_url'), '') AS avatar_url,
    m.position::int - 1 AS sort_order,
    jsonb_strip_nulls(
      COALESCE(m.item - 'user_id' - 'name' - 'role' - 'instrument' - 'avatar_url', '{}'::jsonb)
    ) AS metadata,
    m.item AS raw_member
  FROM public.groups g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(g.members) = 'array' THEN g.members
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS m(item, position)
  WHERE g.id = p_group_id;
END;
$$;

CREATE OR REPLACE VIEW public.groups_legacy_projection AS
SELECT
  g.id,
  COALESCE(
    (
      SELECT jsonb_agg(
        COALESCE(rm.raw_member,
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
    g.members,
    '[]'::jsonb
  ) AS members,
  COALESCE(
    (
      SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at)
      FROM public.group_media gm
      WHERE gm.group_id = g.id
        AND gm.media_type = 'image'
    ),
    g.images,
    ARRAY[]::text[]
  ) AS images
FROM public.groups g;

DO $$
DECLARE
  v_group_id uuid;
BEGIN
  FOR v_group_id IN SELECT id FROM public.groups LOOP
    PERFORM public.sync_group_3nf(v_group_id);
  END LOOP;
END;
$$;