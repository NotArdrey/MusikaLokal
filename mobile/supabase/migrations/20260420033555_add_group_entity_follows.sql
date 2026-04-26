BEGIN;

ALTER TABLE public.follows
    ADD COLUMN IF NOT EXISTS followed_type text;

UPDATE public.follows
SET followed_type = 'profile'
WHERE followed_type IS NULL;

ALTER TABLE public.follows
    ALTER COLUMN followed_type SET DEFAULT 'profile',
    ALTER COLUMN followed_type SET NOT NULL;

ALTER TABLE public.follows
    DROP CONSTRAINT IF EXISTS follows_followed_id_fkey,
    DROP CONSTRAINT IF EXISTS follows_follower_id_followed_id_key,
    DROP CONSTRAINT IF EXISTS follows_check,
    DROP CONSTRAINT IF EXISTS follows_followed_type_check,
    DROP CONSTRAINT IF EXISTS follows_profile_self_check;

ALTER TABLE public.follows
    ADD CONSTRAINT follows_followed_type_check
        CHECK (followed_type IN ('profile', 'group')),
    ADD CONSTRAINT follows_profile_self_check
        CHECK (followed_type <> 'profile' OR follower_id <> followed_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_unique_target
    ON public.follows(follower_id, followed_type, followed_id);

CREATE INDEX IF NOT EXISTS idx_follows_target_type_follower
    ON public.follows(followed_type, followed_id, follower_id);

CREATE OR REPLACE VIEW public.follow_counts AS
SELECT
    p.id AS user_id,
    (
        SELECT count(*)
        FROM public.follows f
        WHERE f.followed_type = 'profile'
          AND f.followed_id = p.id
    ) AS follower_count,
    (
        SELECT count(*)
        FROM public.follows f
        WHERE f.follower_id = p.id
    ) AS following_count
FROM public.profiles p;

DROP POLICY IF EXISTS feed_posts_select ON public.feed_posts;

CREATE POLICY feed_posts_select ON public.feed_posts
    FOR SELECT USING (
        (visibility = 'public' AND is_hidden = false)
        OR author_id = auth.uid()
        OR (
            visibility = 'followers'
            AND is_hidden = false
            AND EXISTS (
                SELECT 1
                FROM public.follows f
                WHERE f.follower_id = auth.uid()
                  AND f.followed_type = 'profile'
                  AND f.followed_id = feed_posts.author_id
            )
        )
        OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
              AND role = 'admin'
        )
    );

COMMIT;