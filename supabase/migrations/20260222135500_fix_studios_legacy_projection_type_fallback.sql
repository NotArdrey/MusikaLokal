-- Ensure studios legacy projection remains backward-compatible when studio_types rows are absent.
-- Fallback order for `types`: normalized studio_types -> legacy studios.types -> legacy studios.type -> []

create or replace view public.studios_legacy_projection as
select
  s.id,
  coalesce(
    (
      select array_agg(sa.amenity order by sa.amenity)
      from public.studio_amenities sa
      where sa.studio_id = s.id
    ),
    s.amenities,
    array[]::text[]
  ) as amenities,
  coalesce(
    (
      select array_agg(sm.media_url order by sm.sort_order, sm.created_at)
      from public.studio_media sm
      where sm.studio_id = s.id
        and sm.media_type = 'image'
    ),
    s.images,
    array[]::text[]
  ) as images,
  coalesce(
    (
      select array_agg(st.studio_type order by st.studio_type)
      from public.studio_types st
      where st.studio_id = s.id
    ),
    case
      when coalesce(array_length(s.types, 1), 0) > 0 then s.types
      when s.type is not null then array[s.type]
      else array[]::text[]
    end
  ) as types,
  coalesce(
    (
      select jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object(
            'name', si.instrument_name,
            'image', si.image_url
          )
        )
        order by si.instrument_name
      )
      from public.studio_instruments si
      where si.studio_id = s.id
    ),
    s.instruments,
    '[]'::jsonb
  ) as instruments
from public.studios s;
