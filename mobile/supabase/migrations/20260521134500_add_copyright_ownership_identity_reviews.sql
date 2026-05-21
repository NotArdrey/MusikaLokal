-- Route released-track ownership checks through the existing identity review queue.

alter table public.manual_identity_reviews
  drop constraint if exists manual_identity_reviews_source_check;

alter table public.manual_identity_reviews
  add constraint manual_identity_reviews_source_check
  check (source = any (array[
    'MANUAL_UPLOAD'::text,
    'DIDIT_PENDING'::text,
    'DIDIT_DUPLICATE'::text,
    'MUSICIAN_VIDEO'::text,
    'COPYRIGHT_OWNERSHIP'::text
  ]));

create unique index if not exists idx_manual_identity_reviews_pending_copyright_unique
  on public.manual_identity_reviews (user_id, ((metadata ->> 'copyright_track_key')))
  where source = 'COPYRIGHT_OWNERSHIP'
    and status = 'PENDING_REVIEW'
    and nullif(metadata ->> 'copyright_track_key', '') is not null;

create index if not exists idx_manual_identity_reviews_copyright_status
  on public.manual_identity_reviews (user_id, status, ((metadata ->> 'copyright_track_key')))
  where source = 'COPYRIGHT_OWNERSHIP'
    and nullif(metadata ->> 'copyright_track_key', '') is not null;

comment on index public.idx_manual_identity_reviews_pending_copyright_unique is
  'Prevents duplicate pending released-track ownership reviews for the same user and matched track.';
