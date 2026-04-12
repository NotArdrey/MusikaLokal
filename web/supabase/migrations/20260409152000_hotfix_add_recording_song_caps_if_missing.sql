-- Hotfix: ensure recording song cap columns exist even when older migration order drifted

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
