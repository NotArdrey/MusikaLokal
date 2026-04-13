-- Add explicit recording time block rules for studio bookings.
-- Daily song caps are no longer enforced by the application flow.

ALTER TABLE public.studio_settings
  ADD COLUMN IF NOT EXISTS recording_songs_per_block integer,
  ADD COLUMN IF NOT EXISTS recording_hours_per_block numeric;

UPDATE public.studio_settings
SET
  recording_songs_per_block = COALESCE(NULLIF(recording_songs_per_block, 0), 1),
  recording_hours_per_block = COALESCE(
    NULLIF(recording_hours_per_block, 0),
    NULLIF(min_booking_duration_hours, 0),
    3
  )
WHERE
  recording_songs_per_block IS NULL
  OR recording_songs_per_block <= 0
  OR recording_hours_per_block IS NULL
  OR recording_hours_per_block <= 0;

ALTER TABLE public.studio_settings
  ALTER COLUMN recording_songs_per_block SET DEFAULT 1,
  ALTER COLUMN recording_songs_per_block SET NOT NULL,
  ALTER COLUMN recording_hours_per_block SET DEFAULT 3,
  ALTER COLUMN recording_hours_per_block SET NOT NULL;

ALTER TABLE public.studio_settings
  DROP CONSTRAINT IF EXISTS studio_settings_recording_songs_per_block_check;

ALTER TABLE public.studio_settings
  ADD CONSTRAINT studio_settings_recording_songs_per_block_check
  CHECK (recording_songs_per_block > 0);

ALTER TABLE public.studio_settings
  DROP CONSTRAINT IF EXISTS studio_settings_recording_hours_per_block_check;

ALTER TABLE public.studio_settings
  ADD CONSTRAINT studio_settings_recording_hours_per_block_check
  CHECK (recording_hours_per_block > 0);