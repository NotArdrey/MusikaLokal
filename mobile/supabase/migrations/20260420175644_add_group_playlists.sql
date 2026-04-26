CREATE TABLE public.group_playlists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    playlist_id uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT group_playlists_group_id_playlist_id_key UNIQUE (group_id, playlist_id)
);

CREATE INDEX idx_group_playlists_group ON public.group_playlists(group_id, position);
CREATE INDEX idx_group_playlists_playlist ON public.group_playlists(playlist_id);

ALTER TABLE public.group_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_playlists_select ON public.group_playlists
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.playlists pl
            WHERE pl.id = group_playlists.playlist_id
              AND (
                pl.creator_id = auth.uid()
                OR (pl.visibility = 'public' AND COALESCE(pl.is_hidden, false) = false)
                OR EXISTS (
                    SELECT 1
                    FROM public.profiles profile
                    WHERE profile.id = auth.uid()
                      AND profile.role = 'admin'
                )
              )
        )
    );

CREATE POLICY group_playlists_insert ON public.group_playlists
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = group_playlists.group_id
              AND g.owner_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM public.playlists pl
            WHERE pl.id = group_playlists.playlist_id
              AND pl.creator_id = auth.uid()
        )
    );

CREATE POLICY group_playlists_update ON public.group_playlists
    FOR UPDATE USING (
        EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = group_playlists.group_id
              AND g.owner_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM public.playlists pl
            WHERE pl.id = group_playlists.playlist_id
              AND pl.creator_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = group_playlists.group_id
              AND g.owner_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM public.playlists pl
            WHERE pl.id = group_playlists.playlist_id
              AND pl.creator_id = auth.uid()
        )
    );

CREATE POLICY group_playlists_delete ON public.group_playlists
    FOR DELETE USING (
        EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = group_playlists.group_id
              AND g.owner_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM public.playlists pl
            WHERE pl.id = group_playlists.playlist_id
              AND pl.creator_id = auth.uid()
        )
    );