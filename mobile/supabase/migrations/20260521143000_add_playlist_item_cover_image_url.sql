alter table public.playlist_items
  add column if not exists cover_image_url text;

comment on column public.playlist_items.cover_image_url is
  'Optional per-track artwork shown in radio and playlist track displays before falling back to playlist artwork.';
