-- Track-level copyright availability for playlist MP3 uploads.

alter table public.playlist_items
  add column if not exists copyright_status text not null default 'not_required',
  add column if not exists copyright_review_id uuid references public.manual_identity_reviews(id) on delete set null,
  add column if not exists copyright_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'playlist_items_copyright_status_check'
      and conrelid = 'public.playlist_items'::regclass
  ) then
    alter table public.playlist_items
      add constraint playlist_items_copyright_status_check
      check (copyright_status in ('not_required', 'pending_review', 'approved', 'declined'));
  end if;
end $$;

create index if not exists idx_playlist_items_copyright_review
  on public.playlist_items (copyright_review_id)
  where copyright_review_id is not null;

create index if not exists idx_playlist_items_public_available
  on public.playlist_items (playlist_id, position)
  where copyright_status in ('not_required', 'approved');

drop index if exists public.idx_manual_identity_reviews_pending_user_source_unique;

create unique index if not exists idx_manual_identity_reviews_pending_user_source_unique
  on public.manual_identity_reviews (user_id, source)
  where status = 'PENDING_REVIEW'
    and source <> 'COPYRIGHT_OWNERSHIP';

create or replace function public.sync_playlist_item_copyright_status_from_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.source, '') <> 'COPYRIGHT_OWNERSHIP' then
    return null;
  end if;

  update public.playlist_items
  set
    copyright_status = case upper(coalesce(new.status, ''))
      when 'APPROVED' then 'approved'
      when 'DECLINED' then 'declined'
      when 'PENDING_REVIEW' then 'pending_review'
      else copyright_status
    end,
    copyright_metadata = coalesce(copyright_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'manual_identity_review_id', new.id,
        'review_status', new.status,
        'reviewed_at', new.reviewed_at,
        'reviewed_by', new.reviewed_by
      )
  where copyright_review_id = new.id;

  return null;
end;
$$;

drop trigger if exists trg_sync_playlist_item_copyright_status_from_review
  on public.manual_identity_reviews;

create trigger trg_sync_playlist_item_copyright_status_from_review
after update of status on public.manual_identity_reviews
for each row
execute function public.sync_playlist_item_copyright_status_from_review();

drop policy if exists playlist_items_select on public.playlist_items;

create policy playlist_items_select on public.playlist_items
  for select using (
    exists (
      select 1
      from public.playlists pl
      where pl.id = playlist_items.playlist_id
        and (
          (
            pl.visibility = 'public'
            and coalesce(pl.is_hidden, false) = false
            and coalesce(playlist_items.copyright_status, 'not_required') in ('not_required', 'approved')
          )
          or (pl.owner_group_id is null and pl.creator_id = auth.uid())
          or exists (
            select 1
            from public.groups g
            where g.id = pl.owner_group_id
              and g.owner_id = auth.uid()
          )
          or exists (
            select 1
            from public.profiles profile
            where profile.id = auth.uid()
              and profile.role = 'admin'
          )
        )
    )
  );

comment on column public.playlist_items.copyright_status is
  'Controls whether an uploaded playlist MP3 is public: not_required/approved are public; pending_review/declined are hidden from public playback.';

comment on column public.playlist_items.copyright_review_id is
  'Manual identity review row used for released-track ownership approval.';
