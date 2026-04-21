-- Phase 2 Workstream 5: Teaser Playlists and Radio MVP
-- playlists, items, teaser assets, external links, stations, slots, play events

-- 1. Playlists
CREATE TABLE public.playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    description text CHECK (char_length(description) <= 2000),
    cover_image_url text,
    visibility text NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'unlisted', 'promotional')),
    genre text,
    track_count integer DEFAULT 0 CHECK (track_count >= 0),
    total_duration_seconds numeric DEFAULT 0,
    is_featured boolean DEFAULT false,
    is_hidden boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playlists_creator ON public.playlists(creator_id);
CREATE INDEX idx_playlists_public ON public.playlists(created_at DESC)
    WHERE visibility = 'public' AND is_hidden = false;
CREATE INDEX idx_playlists_featured ON public.playlists(created_at DESC)
    WHERE is_featured = true AND is_hidden = false;
CREATE INDEX idx_playlists_genre ON public.playlists(genre) WHERE genre IS NOT NULL;

-- 2. Playlist Items (ordered track references)
CREATE TABLE public.playlist_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    artist_name text CHECK (char_length(artist_name) <= 200),
    duration_seconds numeric,
    position integer NOT NULL DEFAULT 0,
    teaser_asset_id uuid,  -- FK added after teaser_assets table
    external_link_id uuid, -- FK added after external_links table
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playlist_items_playlist ON public.playlist_items(playlist_id, position);

-- 3. Playlist Teaser Assets (short preview clips and cover art)
CREATE TABLE public.playlist_teaser_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    uploader_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    asset_type text NOT NULL CHECK (asset_type IN ('teaser_clip', 'cover_art', 'track_preview')),
    storage_path text NOT NULL,
    mime_type text,
    duration_seconds numeric,
    file_size_bytes bigint,
    is_screened boolean DEFAULT false,
    screen_result text CHECK (screen_result IN ('passed', 'failed', 'pending')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_teaser_assets_playlist ON public.playlist_teaser_assets(playlist_id);
CREATE INDEX idx_teaser_assets_uploader ON public.playlist_teaser_assets(uploader_id);

-- Add FK from playlist_items to teaser_assets
ALTER TABLE public.playlist_items
    ADD CONSTRAINT fk_playlist_items_teaser_asset
    FOREIGN KEY (teaser_asset_id) REFERENCES public.playlist_teaser_assets(id) ON DELETE SET NULL;

-- 4. External Platform Links
CREATE TABLE public.external_platform_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('spotify', 'apple_music', 'youtube_music', 'soundcloud', 'bandcamp', 'deezer', 'tidal', 'other')),
    url text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2000),
    label text CHECK (char_length(label) <= 200),
    linked_playlist_id uuid REFERENCES public.playlists(id) ON DELETE SET NULL,
    linked_item_id uuid REFERENCES public.playlist_items(id) ON DELETE SET NULL,
    click_count integer DEFAULT 0 CHECK (click_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_external_links_owner ON public.external_platform_links(owner_id);
CREATE INDEX idx_external_links_playlist ON public.external_platform_links(linked_playlist_id)
    WHERE linked_playlist_id IS NOT NULL;

-- Add FK from playlist_items to external_links
ALTER TABLE public.playlist_items
    ADD CONSTRAINT fk_playlist_items_external_link
    FOREIGN KEY (external_link_id) REFERENCES public.external_platform_links(id) ON DELETE SET NULL;

-- 5. Stations (curated band/creator radio)
CREATE TABLE public.stations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
    description text CHECK (char_length(description) <= 2000),
    cover_image_url text,
    genre text,
    is_active boolean DEFAULT true,
    is_featured boolean DEFAULT false,
    listener_count integer DEFAULT 0 CHECK (listener_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stations_creator ON public.stations(creator_id);
CREATE INDEX idx_stations_active ON public.stations(created_at DESC) WHERE is_active = true;
CREATE INDEX idx_stations_featured ON public.stations(created_at DESC)
    WHERE is_featured = true AND is_active = true;

-- 6. Station Playlist Slots (schedule/rotation order)
CREATE TABLE public.station_playlist_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    label text CHECK (char_length(label) <= 200),
    starts_at timestamptz,
    ends_at timestamptz,
    is_active boolean DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_station_slots_station ON public.station_playlist_slots(station_id, position);
CREATE INDEX idx_station_slots_playlist ON public.station_playlist_slots(playlist_id);
CREATE INDEX idx_station_slots_active ON public.station_playlist_slots(station_id)
    WHERE is_active = true;

-- 7. Playlist Play Events (teaser play + outbound click metrics)
CREATE TABLE public.playlist_play_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id uuid REFERENCES public.playlists(id) ON DELETE SET NULL,
    item_id uuid REFERENCES public.playlist_items(id) ON DELETE SET NULL,
    station_id uuid REFERENCES public.stations(id) ON DELETE SET NULL,
    user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    event_type text NOT NULL CHECK (event_type IN ('teaser_play', 'outbound_click', 'station_tune_in', 'station_tune_out')),
    platform text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_play_events_playlist ON public.playlist_play_events(playlist_id)
    WHERE playlist_id IS NOT NULL;
CREATE INDEX idx_play_events_station ON public.playlist_play_events(station_id)
    WHERE station_id IS NOT NULL;
CREATE INDEX idx_play_events_type ON public.playlist_play_events(event_type, created_at DESC);
CREATE INDEX idx_play_events_user ON public.playlist_play_events(user_id)
    WHERE user_id IS NOT NULL;

-- Add FK from feed_posts.linked_playlist_id
ALTER TABLE public.feed_posts
    ADD CONSTRAINT fk_feed_posts_linked_playlist
    FOREIGN KEY (linked_playlist_id) REFERENCES public.playlists(id) ON DELETE SET NULL;

-- Triggers
CREATE TRIGGER trg_playlists_updated_at
    BEFORE UPDATE ON public.playlists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_stations_updated_at
    BEFORE UPDATE ON public.stations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Track count trigger
CREATE OR REPLACE FUNCTION public.update_playlist_track_count()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.playlists SET track_count = track_count + 1 WHERE id = NEW.playlist_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.playlists SET track_count = GREATEST(track_count - 1, 0) WHERE id = OLD.playlist_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_playlist_items_count
    AFTER INSERT OR DELETE ON public.playlist_items
    FOR EACH ROW EXECUTE FUNCTION public.update_playlist_track_count();

-- RLS Policies

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_teaser_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_platform_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_playlist_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_play_events ENABLE ROW LEVEL SECURITY;

-- Playlists
CREATE POLICY playlists_select ON public.playlists
    FOR SELECT USING (
        (visibility = 'public' AND is_hidden = false)
        OR creator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY playlists_insert ON public.playlists
    FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY playlists_update ON public.playlists
    FOR UPDATE USING (
        creator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY playlists_delete ON public.playlists
    FOR DELETE USING (creator_id = auth.uid());

-- Playlist Items
CREATE POLICY playlist_items_select ON public.playlist_items
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.playlists pl WHERE pl.id = playlist_items.playlist_id
            AND (pl.visibility = 'public' OR pl.creator_id = auth.uid()
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')))
    );

CREATE POLICY playlist_items_insert ON public.playlist_items
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.playlists pl WHERE pl.id = playlist_items.playlist_id AND pl.creator_id = auth.uid())
    );

CREATE POLICY playlist_items_update ON public.playlist_items
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.playlists pl WHERE pl.id = playlist_items.playlist_id AND pl.creator_id = auth.uid())
    );

CREATE POLICY playlist_items_delete ON public.playlist_items
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.playlists pl WHERE pl.id = playlist_items.playlist_id AND pl.creator_id = auth.uid())
    );

-- Teaser Assets
CREATE POLICY teaser_assets_select ON public.playlist_teaser_assets
    FOR SELECT USING (
        uploader_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.playlists pl WHERE pl.id = playlist_teaser_assets.playlist_id
            AND (pl.visibility = 'public' OR pl.creator_id = auth.uid()))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY teaser_assets_insert ON public.playlist_teaser_assets
    FOR INSERT WITH CHECK (uploader_id = auth.uid());

CREATE POLICY teaser_assets_delete ON public.playlist_teaser_assets
    FOR DELETE USING (uploader_id = auth.uid());

-- External Links
CREATE POLICY external_links_select ON public.external_platform_links FOR SELECT USING (true);

CREATE POLICY external_links_insert ON public.external_platform_links
    FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY external_links_update ON public.external_platform_links
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY external_links_delete ON public.external_platform_links
    FOR DELETE USING (owner_id = auth.uid());

-- Stations
CREATE POLICY stations_select ON public.stations
    FOR SELECT USING (
        is_active = true
        OR creator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY stations_insert ON public.stations
    FOR INSERT WITH CHECK (creator_id = auth.uid());

CREATE POLICY stations_update ON public.stations
    FOR UPDATE USING (
        creator_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY stations_delete ON public.stations
    FOR DELETE USING (creator_id = auth.uid());

-- Station Slots
CREATE POLICY station_slots_select ON public.station_playlist_slots
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.stations s WHERE s.id = station_playlist_slots.station_id
            AND (s.is_active = true OR s.creator_id = auth.uid()))
    );

CREATE POLICY station_slots_insert ON public.station_playlist_slots
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.stations s WHERE s.id = station_playlist_slots.station_id AND s.creator_id = auth.uid())
    );

CREATE POLICY station_slots_update ON public.station_playlist_slots
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.stations s WHERE s.id = station_playlist_slots.station_id AND s.creator_id = auth.uid())
    );

CREATE POLICY station_slots_delete ON public.station_playlist_slots
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.stations s WHERE s.id = station_playlist_slots.station_id AND s.creator_id = auth.uid())
    );

-- Play Events (anyone can insert for tracking, admin can read all)
CREATE POLICY play_events_select ON public.playlist_play_events
    FOR SELECT USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY play_events_insert ON public.playlist_play_events
    FOR INSERT WITH CHECK (true);
