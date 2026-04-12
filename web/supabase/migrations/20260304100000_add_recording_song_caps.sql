-- Add global and date-specific recording song caps
-- Global: studio_settings.max_recording_songs_per_day
-- Date override: studio_date_overrides.max_recording_songs_per_day

ALTER TABLE public.studio_settings
  ADD COLUMN IF NOT EXISTS max_recording_songs_per_day integer;

ALTER TABLE public.studio_date_overrides
  ADD COLUMN IF NOT EXISTS max_recording_songs_per_day integer;

ALTER TABLE public.studio_settings
  DROP CONSTRAINT IF EXISTS studio_settings_max_recording_songs_per_day_check;

ALTER TABLE public.studio_settings
  ADD CONSTRAINT studio_settings_max_recording_songs_per_day_check
  CHECK (
    max_recording_songs_per_day IS NULL
    OR max_recording_songs_per_day > 0
  );

ALTER TABLE public.studio_date_overrides
  DROP CONSTRAINT IF EXISTS studio_date_overrides_max_recording_songs_per_day_check;

ALTER TABLE public.studio_date_overrides
  ADD CONSTRAINT studio_date_overrides_max_recording_songs_per_day_check
  CHECK (
    max_recording_songs_per_day IS NULL
    OR max_recording_songs_per_day > 0
  );
