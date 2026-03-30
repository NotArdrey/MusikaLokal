-- Phase C2: Non-destructive normalization hardening
-- 1) Normalize gigs.slots_filled into relational tables
-- 2) Add normalized availability/open_dates projection views for read-cutover prep

BEGIN;

CREATE TABLE IF NOT EXISTS public.gig_slot_fill_summary (
  gig_id uuid NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  slot_type text NOT NULL CHECK (slot_type IN ('solo','duo','band')),
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gig_id, slot_type)
);

CREATE TABLE IF NOT EXISTS public.gig_slot_fill_applicants (
  gig_id uuid NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  slot_type text NOT NULL CHECK (slot_type IN ('solo','duo','band')),
  applicant_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gig_id, slot_type, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_gig_slot_fill_applicants_gig_id
  ON public.gig_slot_fill_applicants(gig_id);

CREATE OR REPLACE FUNCTION public.sync_gig_slots_filled_3nf(p_gig_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot_type text;
BEGIN
  PERFORM 1 FROM public.gigs g WHERE g.id = p_gig_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gig not found';
  END IF;

  DELETE FROM public.gig_slot_fill_summary WHERE gig_id = p_gig_id;
  DELETE FROM public.gig_slot_fill_applicants WHERE gig_id = p_gig_id;

  FOR v_slot_type IN SELECT unnest(array['solo','duo','band'])
  LOOP
    INSERT INTO public.gig_slot_fill_summary (gig_id, slot_type, accepted_count)
    SELECT
      g.id,
      v_slot_type,
      COALESCE((g.slots_filled -> v_slot_type ->> 'accepted')::integer, 0)
    FROM public.gigs g
    WHERE g.id = p_gig_id
    ON CONFLICT (gig_id, slot_type) DO UPDATE
    SET accepted_count = EXCLUDED.accepted_count,
        updated_at = now();

    INSERT INTO public.gig_slot_fill_applicants (gig_id, slot_type, applicant_id)
    SELECT
      g.id,
      v_slot_type,
      (applicant.value)::uuid
    FROM public.gigs g
    CROSS JOIN LATERAL jsonb_array_elements_text(
      COALESCE(g.slots_filled -> v_slot_type -> 'applicant_ids', '[]'::jsonb)
    ) applicant(value)
    WHERE g.id = p_gig_id
      AND applicant.value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ON CONFLICT (gig_id, slot_type, applicant_id) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_gig_slots_filled_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_gig_slots_filled_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_gig_slots_filled_3nf(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gigs_sync_slots_filled_3nf_from_legacy ON public.gigs;
CREATE TRIGGER trg_gigs_sync_slots_filled_3nf_from_legacy
AFTER INSERT OR UPDATE OF slots_filled
ON public.gigs
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_gig_slots_filled_3nf_from_legacy();

DO $$
DECLARE
  v_gig_id uuid;
BEGIN
  FOR v_gig_id IN
    SELECT id
    FROM public.gigs
    WHERE slots_filled IS NOT NULL
  LOOP
    PERFORM public.sync_gig_slots_filled_3nf(v_gig_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE VIEW public.gigs_slots_filled_projection AS
SELECT
  g.id AS gig_id,
  jsonb_build_object(
    'solo', jsonb_build_object(
      'accepted', COALESCE((SELECT s.accepted_count FROM public.gig_slot_fill_summary s WHERE s.gig_id = g.id AND s.slot_type = 'solo'), 0),
      'applicant_ids', COALESCE((SELECT jsonb_agg(a.applicant_id ORDER BY a.applicant_id)
                                 FROM public.gig_slot_fill_applicants a
                                 WHERE a.gig_id = g.id AND a.slot_type = 'solo'), '[]'::jsonb)
    ),
    'duo', jsonb_build_object(
      'accepted', COALESCE((SELECT s.accepted_count FROM public.gig_slot_fill_summary s WHERE s.gig_id = g.id AND s.slot_type = 'duo'), 0),
      'applicant_ids', COALESCE((SELECT jsonb_agg(a.applicant_id ORDER BY a.applicant_id)
                                 FROM public.gig_slot_fill_applicants a
                                 WHERE a.gig_id = g.id AND a.slot_type = 'duo'), '[]'::jsonb)
    ),
    'band', jsonb_build_object(
      'accepted', COALESCE((SELECT s.accepted_count FROM public.gig_slot_fill_summary s WHERE s.gig_id = g.id AND s.slot_type = 'band'), 0),
      'applicant_ids', COALESCE((SELECT jsonb_agg(a.applicant_id ORDER BY a.applicant_id)
                                 FROM public.gig_slot_fill_applicants a
                                 WHERE a.gig_id = g.id AND a.slot_type = 'band'), '[]'::jsonb)
    )
  ) AS slots_filled
FROM public.gigs g;

CREATE OR REPLACE VIEW public.gigs_availability_projection AS
SELECT
  g.id AS gig_id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'day_of_week', gas.day_of_week,
            'date', gas.slot_date,
            'start', to_char(gas.start_time, 'HH24:MI'),
            'end', to_char(gas.end_time, 'HH24:MI'),
            'is_available', gas.is_available
          )
        )
        ORDER BY gas.day_of_week NULLS LAST, gas.slot_date NULLS LAST, gas.start_time
      )
      FROM public.gig_availability_slots gas
      WHERE gas.gig_id = g.id
    ),
    '[]'::jsonb
  ) AS availability
FROM public.gigs g;

CREATE OR REPLACE VIEW public.groups_availability_projection AS
SELECT
  g.id AS group_id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'day_of_week', gas.day_of_week,
            'date', gas.slot_date,
            'start', to_char(gas.start_time, 'HH24:MI'),
            'end', to_char(gas.end_time, 'HH24:MI'),
            'is_available', gas.is_available
          )
        )
        ORDER BY gas.day_of_week NULLS LAST, gas.slot_date NULLS LAST, gas.start_time
      )
      FROM public.group_availability_slots gas
      WHERE gas.group_id = g.id
    ),
    '[]'::jsonb
  ) AS availability
FROM public.groups g;

CREATE OR REPLACE VIEW public.studios_availability_projection AS
SELECT
  s.id AS studio_id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'day_of_week', sas.day_of_week,
            'date', sas.slot_date,
            'start', to_char(sas.start_time, 'HH24:MI'),
            'end', to_char(sas.end_time, 'HH24:MI'),
            'is_open', sas.is_open
          )
        )
        ORDER BY sas.day_of_week NULLS LAST, sas.slot_date NULLS LAST, sas.start_time
      )
      FROM public.studio_availability_slots sas
      WHERE sas.studio_id = s.id
    ),
    '[]'::jsonb
  ) AS availability,
  COALESCE(
    (
      SELECT jsonb_agg(sod.open_date ORDER BY sod.open_date)
      FROM public.studio_open_dates sod
      WHERE sod.studio_id = s.id
        AND sod.is_open = true
    ),
    '[]'::jsonb
  ) AS open_dates
FROM public.studios s;

COMMENT ON COLUMN public.gigs.slots_filled IS
  'Legacy mirror JSON. Canonical source is gig_slot_fill_summary + gig_slot_fill_applicants.';

COMMIT;
