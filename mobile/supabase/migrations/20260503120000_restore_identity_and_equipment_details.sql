-- Restore identity detail fallbacks and preserve custom studio equipment fields.

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

with latest_sessions as (
  select distinct on (verification_data->>'user_ref')
    (verification_data->>'user_ref')::uuid as user_id,
    verification_data,
    created_at as session_created_at
  from public.verification_sessions
  where status = 'APPROVED'
    and verification_data->>'user_ref' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  order by verification_data->>'user_ref', created_at desc
),
extracted as (
  select
    user_id,
    session_created_at,
    coalesce(
      verification_data->>'id_document_expiry',
      verification_data #>> '{raw_data,expiration_date}',
      verification_data #>> '{raw_data,expiry_date}',
      verification_data #>> '{raw_data,date_of_expiry}',
      verification_data #>> '{raw_data,document_expiration_date}',
      verification_data #>> '{raw_data,document_expiry}',
      verification_data #>> '{raw_data,valid_until}',
      verification_data #>> '{raw_data,extra_fields,expiration_date}',
      verification_data #>> '{raw_data,extra_fields,expiry_date}',
      verification_data #>> '{raw_data,extra_fields,date_of_expiry}'
    ) as expiry_text,
    verification_data->>'id_verified_at' as verified_at_text
  from latest_sessions
)
update public.profiles p
set
  id_document_expiry = coalesce(
    p.id_document_expiry,
    case
      when extracted.expiry_text ~ '^\d{4}-\d{2}-\d{2}'
        then substring(extracted.expiry_text from 1 for 10)::date
      else null
    end
  ),
  id_verified_at = coalesce(
    p.id_verified_at,
    case
      when extracted.verified_at_text ~ '^\d{4}-\d{2}-\d{2}'
        then extracted.verified_at_text::timestamptz
      else extracted.session_created_at
    end
  )
from extracted
where p.id = extracted.user_id
  and p.verification_status = 'APPROVED';

update public.profiles
set id_verified_at = created_at
where verification_status = 'APPROVED'
  and is_verified = true
  and id_verified_at is null;
