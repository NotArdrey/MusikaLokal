alter table public.feed_posts
  add column if not exists linked_gig_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fk_feed_posts_linked_gig'
      and conrelid = 'public.feed_posts'::regclass
  ) then
    alter table public.feed_posts
      add constraint fk_feed_posts_linked_gig
      foreign key (linked_gig_id)
      references public.gigs(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists feed_posts_linked_gig_id_key
  on public.feed_posts (linked_gig_id)
  where linked_gig_id is not null;

create index if not exists idx_feed_posts_regular_created_desc
  on public.feed_posts (created_at desc)
  where linked_gig_id is null and is_hidden = false;

comment on column public.feed_posts.linked_gig_id is
  'Optional gig-backed comment thread used by Talent gig cards. These posts are excluded from the regular feed.';
