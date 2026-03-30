-- Phase A (Groups): expand + backfill + projection, backward compatible

CREATE TABLE IF NOT EXISTS public.group_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  media_type text NOT NULL DEFAULT 'image',
  media_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_media_media_type_check CHECK (media_type IN ('image')),
  CONSTRAINT group_media_group_id_media_type_media_url_key UNIQUE (group_id, media_type, media_url)
);

CREATE INDEX IF NOT EXISTS idx_group_media_group_id ON public.group_media(group_id);

CREATE TABLE IF NOT EXISTS public.group_roster_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  member_role text NULL,
  instrument text NULL,
  avatar_url text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_roster_members_group_id ON public.group_roster_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_roster_members_user_id ON public.group_roster_members(user_id);

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
    metadata
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
    ) AS metadata
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

CREATE OR REPLACE FUNCTION public.trg_sync_group_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_group_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_group_3nf(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_sync_3nf_from_legacy ON public.groups;
CREATE TRIGGER trg_groups_sync_3nf_from_legacy
AFTER INSERT OR UPDATE OF members, images
ON public.groups
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_group_3nf_from_legacy();

DO $$
DECLARE
  v_group_id uuid;
BEGIN
  FOR v_group_id IN
    SELECT g.id
    FROM public.groups g
    WHERE (g.members IS NOT NULL AND g.members <> '[]'::jsonb)
       OR COALESCE(array_length(g.images, 1), 0) > 0
  LOOP
    PERFORM public.sync_group_3nf(v_group_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE VIEW public.groups_legacy_projection AS
SELECT
  g.id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'name', rm.member_name,
            'role', rm.member_role,
            'user_id', rm.user_id,
            'avatar_url', rm.avatar_url,
            'instrument', rm.instrument
          ) || COALESCE(rm.metadata, '{}'::jsonb)
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

CREATE OR REPLACE VIEW public.groups_with_stats AS
SELECT
  g.id,
  g.owner_id,
  g.name,
  g.genre,
  g.description,
  glp.members,
  g.location,
  glp.images,
  g.latitude,
  g.longitude,
  g.rate,
  g.created_at,
  g.group_type,
  g.availability,
  COALESCE(avg(r.rating), 0::numeric) AS rating,
  count(r.id) AS review_count
FROM public.groups g
LEFT JOIN public.reviews r ON r.group_id = g.id
LEFT JOIN public.groups_legacy_projection glp ON glp.id = g.id
GROUP BY
  g.id,
  g.owner_id,
  g.name,
  g.genre,
  g.description,
  glp.members,
  g.location,
  glp.images,
  g.latitude,
  g.longitude,
  g.rate,
  g.created_at,
  g.group_type,
  g.availability;

CREATE OR REPLACE VIEW public.conversations_display_projection AS
SELECT
  c.id,
  c.group_id,
  c.is_group,
  CASE
    WHEN c.group_id IS NOT NULL THEN COALESCE(g.name, c.group_name)
    ELSE c.group_name
  END AS group_name,
  CASE
    WHEN c.group_id IS NOT NULL THEN COALESCE(glp.images[1], c.group_avatar_url)
    ELSE c.group_avatar_url
  END AS group_avatar_url
FROM public.conversations c
LEFT JOIN public.groups g ON g.id = c.group_id
LEFT JOIN public.groups_legacy_projection glp ON glp.id = c.group_id;