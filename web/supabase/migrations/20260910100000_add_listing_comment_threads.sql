alter table public.feed_posts
  add column if not exists linked_entity_type text,
  add column if not exists linked_entity_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'feed_posts_linked_entity_type_check'
      and conrelid = 'public.feed_posts'::regclass
  ) then
    alter table public.feed_posts
      add constraint feed_posts_linked_entity_type_check
      check (
        linked_entity_type is null
        or linked_entity_type in ('profile', 'group', 'studio', 'production_team')
      );
  end if;
end $$;

create unique index if not exists feed_posts_linked_entity_key
  on public.feed_posts (linked_entity_type, linked_entity_id)
  where linked_entity_type is not null and linked_entity_id is not null;

create index if not exists idx_feed_posts_regular_entity_created_desc
  on public.feed_posts (created_at desc, id desc)
  where linked_gig_id is null
    and linked_entity_id is null
    and is_hidden = false;

comment on column public.feed_posts.linked_entity_type is
  'Entity type for a listing-backed comment thread. These posts are excluded from the regular feed.';

comment on column public.feed_posts.linked_entity_id is
  'Entity ID paired with linked_entity_type for a listing-backed comment thread.';
