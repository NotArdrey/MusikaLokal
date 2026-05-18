ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS stream_url text,
  ADD COLUMN IF NOT EXISTS stream_status text NOT NULL DEFAULT 'offline',
  ADD COLUMN IF NOT EXISTS now_playing_title text,
  ADD COLUMN IF NOT EXISTS now_playing_artist text,
  ADD COLUMN IF NOT EXISTS last_seen_live_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stations_stream_status_check'
  ) THEN
    ALTER TABLE public.stations
      ADD CONSTRAINT stations_stream_status_check
      CHECK (stream_status IN ('offline', 'live', 'autoplay'));
  END IF;
END $$;

COMMENT ON COLUMN public.stations.stream_url IS
'Public listener URL for a real continuous station stream, such as Icecast, HLS, or managed radio output.';

COMMENT ON COLUMN public.stations.stream_status IS
'Current broadcast state for stream_url stations: offline, live, or autoplay fallback.';

COMMENT ON COLUMN public.stations.last_seen_live_at IS
'Last time the station was confirmed live by the broadcast/control plane.';
