ALTER TABLE public.playlists
  ADD COLUMN IF NOT EXISTS owner_group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_playlists_owner_group
  ON public.playlists(owner_group_id, created_at DESC)
  WHERE owner_group_id IS NOT NULL;

DROP POLICY IF EXISTS playlists_select ON public.playlists;
DROP POLICY IF EXISTS playlists_insert ON public.playlists;
DROP POLICY IF EXISTS playlists_update ON public.playlists;
DROP POLICY IF EXISTS playlists_delete ON public.playlists;

CREATE POLICY playlists_select ON public.playlists
  FOR SELECT USING (
    (visibility = 'public' AND COALESCE(is_hidden, false) = false)
    OR (owner_group_id IS NULL AND creator_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = playlists.owner_group_id
        AND g.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'admin'
    )
  );

CREATE POLICY playlists_insert ON public.playlists
  FOR INSERT WITH CHECK (
    creator_id = auth.uid()
    AND (
      owner_group_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = owner_group_id
          AND g.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = auth.uid()
          AND profile.role = 'admin'
      )
    )
  );

CREATE POLICY playlists_update ON public.playlists
  FOR UPDATE USING (
    (owner_group_id IS NULL AND creator_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = playlists.owner_group_id
        AND g.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'admin'
    )
  ) WITH CHECK (
    (
      (owner_group_id IS NULL AND creator_id = auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = owner_group_id
          AND g.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = auth.uid()
          AND profile.role = 'admin'
      )
    )
    AND (
      owner_group_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.groups g
        WHERE g.id = owner_group_id
          AND g.owner_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = auth.uid()
          AND profile.role = 'admin'
      )
    )
  );

CREATE POLICY playlists_delete ON public.playlists
  FOR DELETE USING (
    (owner_group_id IS NULL AND creator_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.groups g
      WHERE g.id = playlists.owner_group_id
        AND g.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'admin'
    )
  );

DROP POLICY IF EXISTS playlist_items_select ON public.playlist_items;
DROP POLICY IF EXISTS playlist_items_insert ON public.playlist_items;
DROP POLICY IF EXISTS playlist_items_update ON public.playlist_items;
DROP POLICY IF EXISTS playlist_items_delete ON public.playlist_items;

CREATE POLICY playlist_items_select ON public.playlist_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = playlist_items.playlist_id
        AND (
          pl.visibility = 'public'
          OR (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = pl.owner_group_id
              AND g.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles profile
            WHERE profile.id = auth.uid()
              AND profile.role = 'admin'
          )
        )
    )
  );

CREATE POLICY playlist_items_insert ON public.playlist_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = playlist_items.playlist_id
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = pl.owner_group_id
              AND g.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles profile
            WHERE profile.id = auth.uid()
              AND profile.role = 'admin'
          )
        )
    )
  );

CREATE POLICY playlist_items_update ON public.playlist_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = playlist_items.playlist_id
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = pl.owner_group_id
              AND g.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles profile
            WHERE profile.id = auth.uid()
              AND profile.role = 'admin'
          )
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = playlist_items.playlist_id
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = pl.owner_group_id
              AND g.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles profile
            WHERE profile.id = auth.uid()
              AND profile.role = 'admin'
          )
        )
    )
  );

CREATE POLICY playlist_items_delete ON public.playlist_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = playlist_items.playlist_id
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = pl.owner_group_id
              AND g.owner_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles profile
            WHERE profile.id = auth.uid()
              AND profile.role = 'admin'
          )
        )
    )
  );

DROP POLICY IF EXISTS teaser_assets_select ON public.playlist_teaser_assets;

CREATE POLICY teaser_assets_select ON public.playlist_teaser_assets
  FOR SELECT USING (
    uploader_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = playlist_teaser_assets.playlist_id
        AND (
          pl.visibility = 'public'
          OR (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = pl.owner_group_id
              AND g.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'admin'
    )
  );

DROP POLICY IF EXISTS group_playlists_select ON public.group_playlists;
DROP POLICY IF EXISTS group_playlists_insert ON public.group_playlists;
DROP POLICY IF EXISTS group_playlists_update ON public.group_playlists;
DROP POLICY IF EXISTS group_playlists_delete ON public.group_playlists;

CREATE POLICY group_playlists_select ON public.group_playlists
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.playlists pl
      WHERE pl.id = group_playlists.playlist_id
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR (pl.visibility = 'public' AND COALESCE(pl.is_hidden, false) = false)
          OR EXISTS (
            SELECT 1
            FROM public.groups g
            WHERE g.id = group_playlists.group_id
              AND g.owner_id = auth.uid()
          )
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
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR pl.owner_group_id = group_playlists.group_id
        )
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
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR pl.owner_group_id = group_playlists.group_id
        )
    )
  ) WITH CHECK (
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
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR pl.owner_group_id = group_playlists.group_id
        )
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
        AND (
          (pl.owner_group_id IS NULL AND pl.creator_id = auth.uid())
          OR pl.owner_group_id = group_playlists.group_id
        )
    )
  );
