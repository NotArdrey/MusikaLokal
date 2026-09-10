do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feed_posts_linked_entity_pair_check'
      and conrelid = 'public.feed_posts'::regclass
  ) then
    alter table public.feed_posts
      add constraint feed_posts_linked_entity_pair_check
      check ((linked_entity_type is null) = (linked_entity_id is null));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'feed_posts_single_comment_thread_link_check'
      and conrelid = 'public.feed_posts'::regclass
  ) then
    alter table public.feed_posts
      add constraint feed_posts_single_comment_thread_link_check
      check (linked_gig_id is null or linked_entity_id is null);
  end if;
end $$;
