BEGIN;

ALTER TABLE public.studio_operating_hours
ADD COLUMN IF NOT EXISTS reason text;

UPDATE public.studio_operating_hours soh
SET reason = format(
  'Weekly schedule [session_type:%s]',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.studio_types st
      WHERE st.studio_id = soh.studio_id
        AND lower(st.studio_type) = 'recording'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.studio_types st
      WHERE st.studio_id = soh.studio_id
        AND lower(st.studio_type) = 'rehearsal'
    )
      THEN 'recording'
    WHEN EXISTS (
      SELECT 1
      FROM public.studio_types st
      WHERE st.studio_id = soh.studio_id
        AND lower(st.studio_type) = 'rehearsal'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.studio_types st
      WHERE st.studio_id = soh.studio_id
        AND lower(st.studio_type) = 'recording'
    )
      THEN 'rehearsal'
    ELSE 'both'
  END
)
WHERE soh.reason IS NULL OR btrim(soh.reason) = '';

CREATE OR REPLACE VIEW public.studios_availability_projection AS
SELECT
  s.id AS studio_id,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'day_of_week', soh.day_of_week,
            'start', to_char(soh.open_time::time, 'HH24:MI'),
            'end', to_char(soh.close_time::time, 'HH24:MI'),
            'is_open', soh.is_open,
            'session_type',
              lower(
                COALESCE(
                  substring(soh.reason from 'session_type:([a-z]+)'),
                  'both'
                )
              )
          )
        )
        ORDER BY soh.day_of_week NULLS LAST, soh.slot_order NULLS LAST, soh.open_time
      )
      FROM public.studio_operating_hours soh
      WHERE soh.studio_id = s.id
        AND soh.is_open = true
    ),
    '[]'::jsonb
  ) AS availability,
  COALESCE(
    (
      SELECT jsonb_agg(open_day.open_date ORDER BY open_day.open_date)
      FROM (
        SELECT sod.open_date
        FROM public.studio_open_dates sod
        WHERE sod.studio_id = s.id
          AND sod.is_open = true
        UNION
        SELECT sdo.override_date AS open_date
        FROM public.studio_date_overrides sdo
        WHERE sdo.studio_id = s.id
          AND sdo.is_open = true
      ) open_day
    ),
    '[]'::jsonb
  ) AS open_dates
FROM public.studios s;

NOTIFY pgrst, 'reload schema';

COMMIT;
