create index if not exists idx_feed_posts_latest_cursor on public.feed_posts (created_at desc, id desc) where is_hidden = false and linked_gig_id is null;
create index if not exists idx_feed_posts_following_cursor on public.feed_posts (author_id, created_at desc, id desc) where is_hidden = false and linked_gig_id is null;
