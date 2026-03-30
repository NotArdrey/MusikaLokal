-- One-time data cleanup for stale studio rates after mode changes.
-- Fixes rows where a single-mode studio still has the opposite mode's legacy rate.

BEGIN;

WITH studio_mode AS (
  SELECT
    s.id,
    BOOL_OR(st.studio_type = 'Rehearsal') AS supports_rehearsal,
    BOOL_OR(st.studio_type = 'Recording') AS supports_recording
  FROM public.studios s
  LEFT JOIN public.studio_types st ON st.studio_id = s.id
  GROUP BY s.id
),
targets AS (
  SELECT
    s.id,
    COALESCE(s.rehearsal_rate, 0) AS current_rehearsal_rate,
    COALESCE(s.recording_rate, 0) AS current_recording_rate,
    COALESCE(s.hourly_rate, 0) AS current_hourly_rate,
    CASE
      WHEN sm.supports_recording AND NOT sm.supports_rehearsal THEN 0
      ELSE COALESCE(s.rehearsal_rate, 0)
    END AS next_rehearsal_rate,
    CASE
      WHEN sm.supports_rehearsal AND NOT sm.supports_recording THEN 0
      ELSE COALESCE(s.recording_rate, 0)
    END AS next_recording_rate
  FROM public.studios s
  JOIN studio_mode sm ON sm.id = s.id
  WHERE sm.supports_rehearsal OR sm.supports_recording
),
updated AS (
  UPDATE public.studios s
  SET
    rehearsal_rate = t.next_rehearsal_rate,
    recording_rate = t.next_recording_rate,
    hourly_rate = CASE
      WHEN t.next_rehearsal_rate > 0 THEN t.next_rehearsal_rate
      WHEN t.next_recording_rate > 0 THEN t.next_recording_rate
      ELSE COALESCE(s.hourly_rate, 0)
    END
  FROM targets t
  WHERE s.id = t.id
    AND (
      COALESCE(s.rehearsal_rate, 0) <> t.next_rehearsal_rate
      OR COALESCE(s.recording_rate, 0) <> t.next_recording_rate
      OR COALESCE(s.hourly_rate, 0) <> CASE
        WHEN t.next_rehearsal_rate > 0 THEN t.next_rehearsal_rate
        WHEN t.next_recording_rate > 0 THEN t.next_recording_rate
        ELSE COALESCE(s.hourly_rate, 0)
      END
    )
  RETURNING s.id
)
SELECT COUNT(*) AS updated_rows
FROM updated;

COMMIT;
