-- Add audio_url to playlist_items so musicians can paste a direct public audio URL
-- (e.g. self-hosted MP3, Supabase public bucket URL, SoundCloud direct stream URL)
-- The radio player will use this as a fallback when no teaser_asset_id is set.

ALTER TABLE public.playlist_items
    ADD COLUMN IF NOT EXISTS audio_url text;
