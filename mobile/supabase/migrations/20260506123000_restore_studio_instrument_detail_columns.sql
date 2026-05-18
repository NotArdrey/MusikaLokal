-- Keep studio equipment details aligned with the add/edit studio forms.

alter table public.studio_instruments
  add column if not exists quantity integer,
  add column if not exists description text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'studio_instruments_quantity_positive'
      and conrelid = 'public.studio_instruments'::regclass
  ) then
    alter table public.studio_instruments
      add constraint studio_instruments_quantity_positive
      check (quantity is null or quantity > 0);
  end if;
end $$;

create or replace view public.studios_legacy_projection as
select
  s.id,
  coalesce((
    select array_agg(sa.amenity order by sa.amenity)
    from public.studio_amenities sa
    where sa.studio_id = s.id
  ), array[]::text[]) as amenities,
  coalesce((
    select array_agg(sm.media_url order by sm.sort_order, sm.created_at)
    from public.studio_media sm
    where sm.studio_id = s.id
      and sm.media_type = 'image'
  ), array[]::text[]) as images,
  coalesce((
    select array_agg(st.studio_type order by st.studio_type)
    from public.studio_types st
    where st.studio_id = s.id
  ), array[]::text[]) as types,
  coalesce((
    select jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', si.id,
          'name', si.instrument_name,
          'image', si.image_url,
          'quantity', si.quantity,
          'description', si.description
        )
      )
      order by si.instrument_name
    )
    from public.studio_instruments si
    where si.studio_id = s.id
  ), '[]'::jsonb) as instruments
from public.studios s;

notify pgrst, 'reload schema';
