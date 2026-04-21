-- Phase 2 Workstream 4: Social Feed Schema
-- follows, posts, media, reactions, comments, and activity events

-- 1. Follows (user-to-user or user-to-entity)
CREATE TABLE public.follows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    followed_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (follower_id, followed_id),
    CHECK (follower_id <> followed_id)
);

CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_followed ON public.follows(followed_id);

-- 2. Feed Posts
CREATE TABLE public.feed_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    post_type text NOT NULL DEFAULT 'text'
        CHECK (post_type IN ('text', 'announcement', 'release', 'project_update', 'merch_drop', 'playlist_share', 'station_share')),
    content text CHECK (char_length(content) <= 5000),
    visibility text NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'followers', 'unlisted')),
    is_pinned boolean DEFAULT false,
    linked_project_id uuid REFERENCES public.producer_projects(id) ON DELETE SET NULL,
    linked_playlist_id uuid,  -- FK added after playlist table creation
    linked_product_id uuid,   -- FK added after product table creation
    reaction_count integer DEFAULT 0 CHECK (reaction_count >= 0),
    comment_count integer DEFAULT 0 CHECK (comment_count >= 0),
    share_count integer DEFAULT 0 CHECK (share_count >= 0),
    is_reported boolean DEFAULT false,
    is_hidden boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_posts_author ON public.feed_posts(author_id);
CREATE INDEX idx_feed_posts_created ON public.feed_posts(created_at DESC) WHERE is_hidden = false;
CREATE INDEX idx_feed_posts_type ON public.feed_posts(post_type);
CREATE INDEX idx_feed_posts_public_feed ON public.feed_posts(created_at DESC)
    WHERE visibility = 'public' AND is_hidden = false;

-- 3. Post Media
CREATE TABLE public.post_media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    media_type text NOT NULL CHECK (media_type IN ('image', 'teaser_clip', 'cover_art')),
    storage_path text NOT NULL,
    mime_type text,
    width integer,
    height integer,
    duration_seconds numeric,
    display_order integer DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_media_post ON public.post_media(post_id);

-- 4. Post Reactions
CREATE TABLE public.post_reactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reaction_type text NOT NULL DEFAULT 'like'
        CHECK (reaction_type IN ('like', 'love', 'fire', 'clap', 'sad')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (post_id, user_id, reaction_type)
);

CREATE INDEX idx_post_reactions_post ON public.post_reactions(post_id);
CREATE INDEX idx_post_reactions_user ON public.post_reactions(user_id);

-- 5. Post Comments (flat model)
CREATE TABLE public.post_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    parent_comment_id uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
    content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    is_hidden boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_post_comments_post ON public.post_comments(post_id);
CREATE INDEX idx_post_comments_author ON public.post_comments(author_id);
CREATE INDEX idx_post_comments_parent ON public.post_comments(parent_comment_id)
    WHERE parent_comment_id IS NOT NULL;

-- 6. Social Activity Events (denormalized audit / fan-out)
CREATE TABLE public.social_activity_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL CHECK (event_type IN (
        'follow', 'unfollow',
        'post_created', 'post_updated', 'post_deleted',
        'reaction_added', 'reaction_removed',
        'comment_added', 'comment_deleted',
        'post_reported', 'post_hidden', 'post_restored'
    )),
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    post_id uuid REFERENCES public.feed_posts(id) ON DELETE SET NULL,
    comment_id uuid REFERENCES public.post_comments(id) ON DELETE SET NULL,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_events_actor ON public.social_activity_events(actor_id);
CREATE INDEX idx_social_events_target ON public.social_activity_events(target_user_id)
    WHERE target_user_id IS NOT NULL;
CREATE INDEX idx_social_events_post ON public.social_activity_events(post_id)
    WHERE post_id IS NOT NULL;
CREATE INDEX idx_social_events_type ON public.social_activity_events(event_type, created_at DESC);

-- Triggers
CREATE TRIGGER trg_feed_posts_updated_at
    BEFORE UPDATE ON public.feed_posts
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_post_comments_updated_at
    BEFORE UPDATE ON public.post_comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reaction count triggers
CREATE OR REPLACE FUNCTION public.update_post_reaction_count()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.feed_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.feed_posts SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_reactions_count
    AFTER INSERT OR DELETE ON public.post_reactions
    FOR EACH ROW EXECUTE FUNCTION public.update_post_reaction_count();

-- Comment count triggers
CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.feed_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.feed_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_post_comments_count
    AFTER INSERT OR DELETE ON public.post_comments
    FOR EACH ROW EXECUTE FUNCTION public.update_post_comment_count();

-- Follow count helper view
CREATE OR REPLACE VIEW public.follow_counts AS
SELECT
    p.id AS user_id,
    (SELECT count(*) FROM public.follows f WHERE f.followed_id = p.id) AS follower_count,
    (SELECT count(*) FROM public.follows f WHERE f.follower_id = p.id) AS following_count
FROM public.profiles p;

-- RLS Policies

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_activity_events ENABLE ROW LEVEL SECURITY;

-- Follows
CREATE POLICY follows_select ON public.follows FOR SELECT USING (true);
CREATE POLICY follows_insert ON public.follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY follows_delete ON public.follows FOR DELETE USING (follower_id = auth.uid());

-- Feed Posts
CREATE POLICY feed_posts_select ON public.feed_posts
    FOR SELECT USING (
        (visibility = 'public' AND is_hidden = false)
        OR author_id = auth.uid()
        OR (visibility = 'followers' AND is_hidden = false AND EXISTS (
            SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.followed_id = feed_posts.author_id
        ))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY feed_posts_insert ON public.feed_posts
    FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY feed_posts_update ON public.feed_posts
    FOR UPDATE USING (
        author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY feed_posts_delete ON public.feed_posts
    FOR DELETE USING (
        author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Post Media
CREATE POLICY post_media_select ON public.post_media
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_media.post_id
            AND (fp.visibility = 'public' OR fp.author_id = auth.uid()
                OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')))
    );

CREATE POLICY post_media_insert ON public.post_media
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_media.post_id AND fp.author_id = auth.uid())
    );

CREATE POLICY post_media_delete ON public.post_media
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_media.post_id AND fp.author_id = auth.uid())
    );

-- Post Reactions
CREATE POLICY post_reactions_select ON public.post_reactions FOR SELECT USING (true);
CREATE POLICY post_reactions_insert ON public.post_reactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY post_reactions_delete ON public.post_reactions FOR DELETE USING (user_id = auth.uid());

-- Post Comments
CREATE POLICY post_comments_select ON public.post_comments
    FOR SELECT USING (is_hidden = false OR author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY post_comments_insert ON public.post_comments
    FOR INSERT WITH CHECK (author_id = auth.uid());

CREATE POLICY post_comments_update ON public.post_comments
    FOR UPDATE USING (
        author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY post_comments_delete ON public.post_comments
    FOR DELETE USING (
        author_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Social Activity Events
CREATE POLICY social_events_select ON public.social_activity_events
    FOR SELECT USING (
        actor_id = auth.uid()
        OR target_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY social_events_insert ON public.social_activity_events
    FOR INSERT WITH CHECK (actor_id = auth.uid());
