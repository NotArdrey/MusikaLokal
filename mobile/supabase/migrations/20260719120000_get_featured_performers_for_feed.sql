-- Batch the public featured-performer lookup used by gig cards in the Feed.
comment on column public.gig_applications.show_on_gig_page is
  'True only when the performer explicitly permits public display on the gig details page and its Feed cards.';

create or replace function public.get_gig_featured_performers_for_feed(p_gig_ids uuid[])
returns table (
  application_id uuid,
  gig_id uuid,
  display_name text,
  avatar_url text,
  entity_type text,
  profile_id uuid,
  group_id uuid,
  consented_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with requested_gigs as (
    select distinct requested.gig_id
    from unnest(coalesce(p_gig_ids, array[]::uuid[])) as requested(gig_id)
    limit 50
  )
  select featured.*
  from requested_gigs requested
  cross join lateral public.get_gig_featured_performers(requested.gig_id) featured
  order by featured.gig_id, featured.consented_at asc nulls last;
$$;

revoke all on function public.get_gig_featured_performers_for_feed(uuid[]) from public;
grant execute on function public.get_gig_featured_performers_for_feed(uuid[]) to anon, authenticated;

update public.notifications
set message = regexp_replace(
  message,
  'featured on the gig page or your public profile',
  'featured on the gig and Feed pages or your public profile',
  'i'
)
where meta ->> 'event_type' = 'gig_feature_consent_requested'
  and message ~* 'featured on the gig page or your public profile';
