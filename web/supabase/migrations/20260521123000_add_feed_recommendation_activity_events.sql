ALTER TABLE public.social_activity_events
  DROP CONSTRAINT IF EXISTS social_activity_events_event_type_check,
  ADD CONSTRAINT social_activity_events_event_type_check
  CHECK (event_type IN (
    'follow',
    'unfollow',
    'post_created',
    'post_updated',
    'post_deleted',
    'post_shared',
    'reaction_added',
    'reaction_removed',
    'comment_added',
    'comment_deleted',
    'comment_moderation_blocked',
    'comment_moderation_review',
    'comment_moderation_approved',
    'comment_hidden',
    'comment_restored',
    'post_reported',
    'post_hidden',
    'post_restored',
    'feed_post_opened',
    'feed_card_opened',
    'feed_card_impressed',
    'feed_card_skipped',
    'feed_card_favorited',
    'feed_card_unfavorited',
    'feed_card_shared',
    'feed_search_opened',
    'feed_search_submitted'
  ));

CREATE INDEX IF NOT EXISTS idx_social_events_actor_created
  ON public.social_activity_events(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_events_actor_type_created
  ON public.social_activity_events(actor_id, event_type, created_at DESC);
