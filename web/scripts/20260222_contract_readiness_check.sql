-- 3NF Contract Readiness Check
-- Run before removing legacy columns/projections.

-- 1) Legacy payload still populated?
select
  count(*) filter (where coalesce(array_length(skills,1),0) > 0) as profiles_skills_nonempty,
  count(*) filter (where coalesce(array_length(genres,1),0) > 0) as profiles_genres_nonempty,
  count(*) filter (where coalesce(array_length(portfolio_urls,1),0) > 0) as profiles_portfolio_nonempty
from public.profiles;

select
  count(*) filter (where requirements is not null and requirements <> '{}'::jsonb) as gigs_requirements_nonempty,
  count(*) filter (where coalesce(array_length(images,1),0) > 0) as gigs_images_nonempty,
  count(*) filter (where coalesce(array_length(documents,1),0) > 0) as gigs_documents_nonempty
from public.gigs;

select
  count(*) filter (where coalesce(array_length(amenities,1),0) > 0) as studios_amenities_nonempty,
  count(*) filter (where coalesce(array_length(images,1),0) > 0) as studios_images_nonempty,
  count(*) filter (where coalesce(array_length(types,1),0) > 0) as studios_types_nonempty,
  count(*) filter (where instruments is not null and instruments <> '[]'::jsonb) as studios_instruments_nonempty,
  count(*) filter (where type is not null) as studios_type_scalar_nonnull
from public.studios;

-- 2) Normalized table population snapshot
select
  (select count(*) from public.profile_skills) as profile_skills_rows,
  (select count(*) from public.profile_genres) as profile_genres_rows,
  (select count(*) from public.profile_portfolio_urls) as profile_portfolio_rows,
  (select count(*) from public.gig_requirements) as gig_requirements_rows,
  (select count(*) from public.gig_media) as gig_media_rows,
  (select count(*) from public.studio_amenities) as studio_amenities_rows,
  (select count(*) from public.studio_media) as studio_media_rows,
  (select count(*) from public.studio_types) as studio_types_rows,
  (select count(*) from public.studio_instruments) as studio_instruments_rows;

-- 3) Semantic shadow-read parity checks against compatibility projections
with profiles_check as (
  select
    sum(case when coalesce((select array_agg(x order by x) from unnest(coalesce(p.skills, '{}')) as x), '{}') is distinct from coalesce((select array_agg(x order by x) from unnest(coalesce(v.skills, '{}')) as x), '{}') then 1 else 0 end) as skills_m,
    sum(case when coalesce((select array_agg(x order by x) from unnest(coalesce(p.genres, '{}')) as x), '{}') is distinct from coalesce((select array_agg(x order by x) from unnest(coalesce(v.genres, '{}')) as x), '{}') then 1 else 0 end) as genres_m,
    sum(case when coalesce(p.portfolio_urls, '{}') is distinct from coalesce(v.portfolio_urls, '{}') then 1 else 0 end) as portfolio_m
  from public.profiles p
  join public.profiles_legacy_projection v on v.id = p.id
), gigs_check as (
  select
    sum(case when coalesce(g.documents, '{}') is distinct from coalesce(v.documents, '{}') then 1 else 0 end) as documents_m,
    sum(case when coalesce(g.images, '{}') is distinct from coalesce(v.images, '{}') then 1 else 0 end) as images_m,
    sum(case when to_jsonb(coalesce(g.requirements, '{}'::jsonb)) is distinct from to_jsonb(coalesce(v.requirements, '{}'::jsonb)) then 1 else 0 end) as requirements_m
  from public.gigs g
  join public.gigs_legacy_projection v on v.id = g.id
), studios_check as (
  select
    sum(case when coalesce((select array_agg(x order by x) from unnest(coalesce(s.amenities, '{}')) as x), '{}') is distinct from coalesce((select array_agg(x order by x) from unnest(coalesce(v.amenities, '{}')) as x), '{}') then 1 else 0 end) as amenities_m,
    sum(case when coalesce((select array_agg(x order by x) from unnest(coalesce(case when s.types is null or coalesce(array_length(s.types,1),0)=0 then case when s.type is null then '{}'::text[] else array[s.type] end else s.types end, '{}')) as x), '{}') is distinct from coalesce((select array_agg(x order by x) from unnest(coalesce(v.types, '{}')) as x), '{}') then 1 else 0 end) as types_m,
    sum(case when coalesce((select jsonb_agg(e order by coalesce(e->>'name',''), e::text) from jsonb_array_elements(coalesce(s.instruments, '[]'::jsonb)) e), '[]'::jsonb) is distinct from coalesce((select jsonb_agg(e order by coalesce(e->>'name',''), e::text) from jsonb_array_elements(coalesce(v.instruments, '[]'::jsonb)) e), '[]'::jsonb) then 1 else 0 end) as instruments_m
  from public.studios s
  join public.studios_legacy_projection v on v.id = s.id
), conv_check as (
  select
    coalesce(sum(case when coalesce(v.group_name,'') is distinct from coalesce(g.name,'') then 1 else 0 end),0) as group_name_m,
    coalesce(sum(case when coalesce(v.group_avatar_url,'') is distinct from coalesce((g.images)[1],'') then 1 else 0 end),0) as group_avatar_m,
    count(*) as group_conv_rows
  from public.conversations c
  join public.conversations_display_projection v on v.id = c.id
  join public.groups g on g.id = c.group_id
  where c.group_id is not null
)
select * from profiles_check, gigs_check, studios_check, conv_check;

-- 4) Duplicate and orphan guardrails in normalized tables
select
  (select count(*) from (select profile_id, skill, count(*) c from public.profile_skills group by 1,2 having count(*)>1) t) as dup_profile_skills,
  (select count(*) from (select gig_id, requirement_key, count(*) c from public.gig_requirements group by 1,2 having count(*)>1) t) as dup_gig_requirements,
  (select count(*) from (select studio_id, amenity, count(*) c from public.studio_amenities group by 1,2 having count(*)>1) t) as dup_studio_amenities;

select
  (select count(*) from public.profile_skills ps left join public.profiles p on p.id=ps.profile_id where p.id is null) as orphan_profile_skills,
  (select count(*) from public.gig_requirements gr left join public.gigs g on g.id=gr.gig_id where g.id is null) as orphan_gig_requirements,
  (select count(*) from public.studio_amenities sa left join public.studios s on s.id=sa.studio_id where s.id is null) as orphan_studio_amenities;
