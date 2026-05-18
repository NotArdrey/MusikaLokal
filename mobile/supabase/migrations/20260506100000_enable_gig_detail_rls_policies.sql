alter table public.gig_media enable row level security;
alter table public.gig_requirements enable row level security;

drop policy if exists "Gig media are viewable by everyone" on public.gig_media;
create policy "Gig media are viewable by everyone"
on public.gig_media
for select
to public
using (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_media.gig_id
  )
);

drop policy if exists "Gig owners can insert gig media" on public.gig_media;
create policy "Gig owners can insert gig media"
on public.gig_media
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_media.gig_id
      and gigs.organizer_id = auth.uid()
  )
);

drop policy if exists "Gig owners can update gig media" on public.gig_media;
create policy "Gig owners can update gig media"
on public.gig_media
for update
to authenticated
using (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_media.gig_id
      and gigs.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_media.gig_id
      and gigs.organizer_id = auth.uid()
  )
);

drop policy if exists "Gig owners can delete gig media" on public.gig_media;
create policy "Gig owners can delete gig media"
on public.gig_media
for delete
to authenticated
using (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_media.gig_id
      and gigs.organizer_id = auth.uid()
  )
);

drop policy if exists "Gig requirements are viewable by everyone" on public.gig_requirements;
create policy "Gig requirements are viewable by everyone"
on public.gig_requirements
for select
to public
using (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_requirements.gig_id
  )
);

drop policy if exists "Gig owners can insert gig requirements" on public.gig_requirements;
create policy "Gig owners can insert gig requirements"
on public.gig_requirements
for insert
to authenticated
with check (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_requirements.gig_id
      and gigs.organizer_id = auth.uid()
  )
);

drop policy if exists "Gig owners can update gig requirements" on public.gig_requirements;
create policy "Gig owners can update gig requirements"
on public.gig_requirements
for update
to authenticated
using (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_requirements.gig_id
      and gigs.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_requirements.gig_id
      and gigs.organizer_id = auth.uid()
  )
);

drop policy if exists "Gig owners can delete gig requirements" on public.gig_requirements;
create policy "Gig owners can delete gig requirements"
on public.gig_requirements
for delete
to authenticated
using (
  exists (
    select 1
    from public.gigs
    where gigs.id = gig_requirements.gig_id
      and gigs.organizer_id = auth.uid()
  )
);
