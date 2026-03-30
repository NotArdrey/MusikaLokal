update public.gigs
set availability = null
where availability = '[]'::jsonb;

update public.groups
set availability = null
where availability = '[]'::jsonb;

update public.studios
set availability = null
where availability = '[]'::jsonb;

update public.studios
set open_dates = null
where open_dates = '[]'::jsonb;