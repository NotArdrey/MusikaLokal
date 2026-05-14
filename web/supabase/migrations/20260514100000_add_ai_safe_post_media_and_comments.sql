-- AI-safe social posts: video media, user-selected thumbnails, safer comments.

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'post-media',
  'post-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.post_media
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS is_cover boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_context text,
  ADD COLUMN IF NOT EXISTS safety_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS safety_status text NOT NULL DEFAULT 'passed',
  ADD COLUMN IF NOT EXISTS safety_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS moderation_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS moderation_score numeric,
  ADD COLUMN IF NOT EXISTS moderation_provider text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.post_media
  DROP CONSTRAINT IF EXISTS post_media_media_type_check,
  ADD CONSTRAINT post_media_media_type_check
  CHECK (media_type IN ('image', 'video', 'teaser_clip', 'cover_art'));

ALTER TABLE public.post_media
  DROP CONSTRAINT IF EXISTS post_media_safety_status_check,
  ADD CONSTRAINT post_media_safety_status_check
  CHECK (safety_status IN ('passed', 'pending_review', 'blocked'));

ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_moderation_status_check,
  ADD CONSTRAINT post_comments_moderation_status_check
  CHECK (moderation_status IN ('approved', 'pending_review', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_post_media_post_display_order
  ON public.post_media(post_id, display_order);

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_media_one_cover_per_post
  ON public.post_media(post_id)
  WHERE is_cover = true;

CREATE INDEX IF NOT EXISTS idx_post_comments_post_visible_created
  ON public.post_comments(post_id, created_at)
  WHERE is_hidden = false AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_post_comments_moderation_status
  ON public.post_comments(moderation_status, created_at DESC)
  WHERE moderation_status <> 'approved' OR is_hidden = true;

ALTER TABLE public.social_activity_events
  DROP CONSTRAINT IF EXISTS social_activity_events_event_type_check,
  ADD CONSTRAINT social_activity_events_event_type_check
  CHECK (event_type IN (
    'follow', 'unfollow',
    'post_created', 'post_updated', 'post_deleted', 'post_shared',
    'reaction_added', 'reaction_removed',
    'comment_added', 'comment_deleted',
    'comment_moderation_blocked', 'comment_moderation_review',
    'comment_moderation_approved', 'comment_hidden', 'comment_restored',
    'post_reported', 'post_hidden', 'post_restored'
  ));

CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS trigger AS $$
DECLARE
  old_visible boolean := false;
  new_visible boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_visible :=
      coalesce(OLD.is_hidden, false) = false
      AND coalesce(OLD.moderation_status, 'approved') = 'approved';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_visible :=
      coalesce(NEW.is_hidden, false) = false
      AND coalesce(NEW.moderation_status, 'approved') = 'approved';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new_visible THEN
      UPDATE public.feed_posts
      SET comment_count = comment_count + 1
      WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF old_visible THEN
      UPDATE public.feed_posts
      SET comment_count = GREATEST(comment_count - 1, 0)
      WHERE id = OLD.post_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.post_id IS DISTINCT FROM NEW.post_id THEN
      IF old_visible THEN
        UPDATE public.feed_posts
        SET comment_count = GREATEST(comment_count - 1, 0)
        WHERE id = OLD.post_id;
      END IF;
      IF new_visible THEN
        UPDATE public.feed_posts
        SET comment_count = comment_count + 1
        WHERE id = NEW.post_id;
      END IF;
    ELSIF old_visible IS DISTINCT FROM new_visible THEN
      UPDATE public.feed_posts
      SET comment_count = GREATEST(comment_count + CASE WHEN new_visible THEN 1 ELSE -1 END, 0)
      WHERE id = NEW.post_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_post_comments_count ON public.post_comments;
CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE OR UPDATE OF post_id, is_hidden, moderation_status
  ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_post_comment_count();

UPDATE public.feed_posts fp
SET comment_count = counts.visible_count
FROM (
  SELECT
    fp_inner.id,
    count(pc.id)::integer AS visible_count
  FROM public.feed_posts fp_inner
  LEFT JOIN public.post_comments pc
    ON pc.post_id = fp_inner.id
    AND coalesce(pc.is_hidden, false) = false
    AND coalesce(pc.moderation_status, 'approved') = 'approved'
  GROUP BY fp_inner.id
) counts
WHERE counts.id = fp.id
  AND fp.comment_count IS DISTINCT FROM counts.visible_count;

CREATE OR REPLACE FUNCTION public.increment_post_share_count(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_share_count integer;
BEGIN
  UPDATE public.feed_posts
  SET share_count = share_count + 1
  WHERE id = p_post_id
  RETURNING share_count INTO v_share_count;

  RETURN coalesce(v_share_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_post_share_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_post_share_count(uuid) TO service_role;

DROP POLICY IF EXISTS feed_posts_insert ON public.feed_posts;
CREATE POLICY feed_posts_insert ON public.feed_posts
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('musician', 'producer', 'studio-owner', 'venue-owner', 'admin')
    )
  );

DROP POLICY IF EXISTS post_media_select ON public.post_media;
CREATE POLICY post_media_select ON public.post_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.feed_posts fp
      WHERE fp.id = post_media.post_id
        AND (
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
          OR fp.author_id = auth.uid()
          OR (fp.visibility = 'public' AND fp.is_hidden = false)
          OR (
            fp.visibility = 'followers'
            AND fp.is_hidden = false
            AND EXISTS (
              SELECT 1
              FROM public.follows f
              WHERE f.follower_id = auth.uid()
                AND f.followed_id = fp.author_id
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS post_comments_select ON public.post_comments;
CREATE POLICY post_comments_select ON public.post_comments
  FOR SELECT USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR (
      is_hidden = false
      AND moderation_status = 'approved'
      AND EXISTS (
        SELECT 1
        FROM public.feed_posts fp
        WHERE fp.id = post_comments.post_id
          AND fp.is_hidden = false
          AND (
            fp.visibility = 'public'
            OR fp.author_id = auth.uid()
            OR (
              fp.visibility = 'followers'
              AND EXISTS (
                SELECT 1
                FROM public.follows f
                WHERE f.follower_id = auth.uid()
                  AND f.followed_id = fp.author_id
              )
            )
          )
      )
    )
  );
