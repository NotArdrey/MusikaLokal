UPDATE public.stations
SET
  stream_url = NULL,
  stream_status = 'offline',
  now_playing_title = NULL,
  now_playing_artist = NULL,
  last_seen_live_at = NULL
WHERE stream_url IS NOT NULL
   OR stream_status <> 'offline'
   OR now_playing_title IS NOT NULL
   OR now_playing_artist IS NOT NULL
   OR last_seen_live_at IS NOT NULL;

DROP INDEX IF EXISTS public.idx_stations_live_stream_created;

