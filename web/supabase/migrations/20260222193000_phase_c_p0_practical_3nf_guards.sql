-- Phase C (P0 practical 3NF):
-- 1) Normalize groups.availability into relational slots
-- 2) Enforce conversations.group_name/group_avatar_url as derived cache fields
-- 3) Register accepted normalization exceptions explicitly

BEGIN;

CREATE TABLE IF NOT EXISTS public.group_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  day_of_week smallint,
  slot_date date,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  CHECK ((day_of_week IS NOT NULL AND day_of_week BETWEEN 0 AND 6) OR slot_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_group_availability_slots_group_id
  ON public.group_availability_slots(group_id);

CREATE OR REPLACE FUNCTION public.sync_group_availability_3nf(p_group_id uuid)
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

  DELETE FROM public.group_availability_slots
  WHERE group_id = p_group_id;

  INSERT INTO public.group_availability_slots (
    group_id,
    day_of_week,
    slot_date,
    start_time,
    end_time,
    is_available
  )
  SELECT
    g.id,
    CASE
      WHEN COALESCE(slot.item->>'day_of_week', slot.item->>'day') ~ '^[0-6]$'
        THEN (COALESCE(slot.item->>'day_of_week', slot.item->>'day'))::smallint
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'sunday' THEN 0
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'monday' THEN 1
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'tuesday' THEN 2
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'wednesday' THEN 3
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'thursday' THEN 4
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'friday' THEN 5
      WHEN lower(COALESCE(slot.item->>'day', '')) = 'saturday' THEN 6
      ELSE NULL
    END AS day_of_week,
    CASE
      WHEN COALESCE(slot.item->>'date', slot.item->>'slot_date') ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (COALESCE(slot.item->>'date', slot.item->>'slot_date'))::date
      ELSE NULL
    END AS slot_date,
    (COALESCE(slot.item->>'start', slot.item->>'starts_at', slot.item->>'start_time'))::time,
    (COALESCE(slot.item->>'end', slot.item->>'ends_at', slot.item->>'end_time'))::time,
    COALESCE((slot.item->>'is_available')::boolean, true)
  FROM public.groups g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.availability) = 'array' THEN g.availability ELSE '[]'::jsonb END
  ) AS slot(item)
  WHERE g.id = p_group_id
    AND COALESCE(slot.item->>'start', slot.item->>'starts_at', slot.item->>'start_time') IS NOT NULL
    AND COALESCE(slot.item->>'end', slot.item->>'ends_at', slot.item->>'end_time') IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_group_availability_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_group_availability_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_group_availability_3nf(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_sync_availability_3nf_from_legacy ON public.groups;
CREATE TRIGGER trg_groups_sync_availability_3nf_from_legacy
AFTER INSERT OR UPDATE OF availability
ON public.groups
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_group_availability_3nf_from_legacy();

DO $$
DECLARE
  v_group_id uuid;
BEGIN
  FOR v_group_id IN
    SELECT id
    FROM public.groups
    WHERE availability IS NOT NULL
  LOOP
    PERFORM public.sync_group_availability_3nf(v_group_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_conversations_fill_group_display_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT g.name
  INTO NEW.group_name
  FROM public.groups g
  WHERE g.id = NEW.group_id;

  SELECT gm.media_url
  INTO NEW.group_avatar_url
  FROM public.group_media gm
  WHERE gm.group_id = NEW.group_id
    AND gm.media_type = 'image'
  ORDER BY gm.sort_order, gm.created_at
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_fill_group_display_fields ON public.conversations;
CREATE TRIGGER trg_conversations_fill_group_display_fields
BEFORE INSERT OR UPDATE OF group_id, group_name, group_avatar_url
ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.trg_conversations_fill_group_display_fields();

CREATE OR REPLACE FUNCTION public.trg_groups_propagate_to_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avatar_url text;
BEGIN
  SELECT gm.media_url
  INTO v_avatar_url
  FROM public.group_media gm
  WHERE gm.group_id = NEW.id
    AND gm.media_type = 'image'
  ORDER BY gm.sort_order, gm.created_at
  LIMIT 1;

  UPDATE public.conversations c
  SET
    group_name = NEW.name,
    group_avatar_url = v_avatar_url
  WHERE c.group_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_propagate_to_conversations ON public.groups;
CREATE TRIGGER trg_groups_propagate_to_conversations
AFTER UPDATE OF name
ON public.groups
FOR EACH ROW
EXECUTE FUNCTION public.trg_groups_propagate_to_conversations();

COMMENT ON COLUMN public.conversations.group_name IS
  'Derived cache from groups.name (source of truth is group_id).';

COMMENT ON COLUMN public.conversations.group_avatar_url IS
  'Derived cache from group_media media_url (source of truth is group_id).';

CREATE TABLE IF NOT EXISTS public.normalization_exceptions (
  table_name text NOT NULL,
  column_name text NOT NULL,
  rationale text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, column_name)
);

INSERT INTO public.normalization_exceptions (table_name, column_name, rationale)
VALUES
  ('booking_requests', 'event_details', 'Flexible event payload that is not consistently relationally queried.'),
  ('studio_bookings', 'modifiers_applied', 'Pricing/modifier audit payload retained for price traceability.'),
  ('studio_settings', 'peak_season_dates', 'Config payload; schedule exceptions are config-like and low cardinality.'),
  ('studio_settings', 'off_peak_dates', 'Config payload; schedule exceptions are config-like and low cardinality.'),
  ('subscription_plans', 'features', 'Plan feature metadata consumed as document payload.'),
  ('group_roster_members', 'raw_member', 'Raw member JSON retained for source traceability/parity during migrations.'),
  ('group_roster_members', 'metadata', 'Flexible sparse member metadata not currently used as relational join key.'),
  ('conversations', 'group_name', 'Derived cache column maintained automatically from group_id relation.'),
  ('conversations', 'group_avatar_url', 'Derived cache column maintained automatically from group_id relation.')
ON CONFLICT (table_name, column_name) DO UPDATE
SET rationale = EXCLUDED.rationale;

COMMIT;
