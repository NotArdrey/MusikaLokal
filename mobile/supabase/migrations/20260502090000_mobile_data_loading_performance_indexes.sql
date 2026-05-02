-- Mobile data-loading performance indexes.
-- These support the consolidated query payloads and cursor-style reads used by the mobile app.

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc
ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created_desc
ON public.notifications (user_id, created_at DESC)
WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_feed_posts_public_created_desc
ON public.feed_posts (created_at DESC)
WHERE visibility = 'public' AND is_hidden = false;

CREATE INDEX IF NOT EXISTS idx_feed_posts_author_visible_created_desc
ON public.feed_posts (author_id, created_at DESC)
WHERE is_hidden = false;

CREATE INDEX IF NOT EXISTS idx_post_reactions_user_post
ON public.post_reactions (user_id, post_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_type_followed
ON public.follows (follower_id, followed_type, followed_id);

CREATE INDEX IF NOT EXISTS idx_booking_requests_sender_status_created
ON public.booking_requests (sender_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_requests_receiver_status_created
ON public.booking_requests (receiver_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_booking_requests_group_status_created
ON public.booking_requests (group_id, status, created_at DESC)
WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_studio_bookings_user_status_date
ON public.studio_bookings (user_id, status, booking_date DESC);

CREATE INDEX IF NOT EXISTS idx_studio_bookings_studio_status_date
ON public.studio_bookings (studio_id, status, booking_date DESC);

CREATE INDEX IF NOT EXISTS idx_studio_bookings_unpaid_user
ON public.studio_bookings (user_id, booking_date)
WHERE remaining_balance > 0 AND status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_created_desc
ON public.wallet_transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_booking_earnings
ON public.wallet_transactions (wallet_id, created_at DESC)
WHERE type = 'earning'
  AND (
    reference_type IS NULL
    OR reference_type IN ('booking', 'booking_payment', 'booking_downpayment', 'booking_balance')
  );

CREATE INDEX IF NOT EXISTS idx_studio_promotions_active_lookup
ON public.studio_promotions (studio_id, start_date, end_date)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_studio_date_overrides_studio_date_slot
ON public.studio_date_overrides (studio_id, override_date, slot_order);
