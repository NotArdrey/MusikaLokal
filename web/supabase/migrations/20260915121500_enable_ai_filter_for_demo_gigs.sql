-- Enable the existing gig-applicant AI filter for the role-accurate demo gigs.
--
-- Portfolio and distance are intentionally ignored for this fixture because
-- those fields are incomplete on several real QA profiles. The saved scores
-- mirror the production rules engine and are replaced by a fresh evaluation
-- whenever the gig owner opens Manage Gig.

insert into public.gig_requirements (id, gig_id, requirement_key, requirement_value)
select
  md5('role_accurate_demo_seed_v1:ai_settings:' || g.id::text)::uuid,
  g.id,
  'ai_recommendation_settings',
  jsonb_build_object(
    'enabled', true,
    'minimum_score', 75,
    'location_radius_km', null,
    'criteria', jsonb_build_object(
      'genres', 'preferred',
      'instruments', 'preferred',
      'location', 'ignore',
      'portfolio', 'ignore'
    )
  )
from public.gigs g
where g.description like '%[role_accurate_demo_seed_v1]%'
  and g.event_date > now()
on conflict (gig_id, requirement_key) do update
set requirement_value = excluded.requirement_value;

with demo_requirements as (
  select
    g.id as gig_id,
    g.latitude as gig_latitude,
    g.longitude as gig_longitude,
    coalesce(
      (
        select gr.requirement_value->'solo'->'preferred_genres'
        from public.gig_requirements gr
        where gr.gig_id = g.id and gr.requirement_key = 'slots'
        limit 1
      ),
      (
        select gr.requirement_value
        from public.gig_requirements gr
        where gr.gig_id = g.id and gr.requirement_key = 'genres'
        limit 1
      ),
      '[]'::jsonb
    ) as expected_genres,
    coalesce(
      (
        select gr.requirement_value->'solo'->'preferred_instruments'
        from public.gig_requirements gr
        where gr.gig_id = g.id and gr.requirement_key = 'slots'
        limit 1
      ),
      (
        select gr.requirement_value
        from public.gig_requirements gr
        where gr.gig_id = g.id and gr.requirement_key = 'instruments'
        limit 1
      ),
      '[]'::jsonb
    ) as expected_instruments,
    (
      select gr.requirement_value
      from public.gig_requirements gr
      where gr.gig_id = g.id and gr.requirement_key = 'ai_recommendation_settings'
      limit 1
    ) as settings
  from public.gigs g
  where g.description like '%[role_accurate_demo_seed_v1]%'
    and g.event_date > now()
),
candidate_data as (
  select
    ga.id as application_id,
    ga.gig_id,
    p.is_verified,
    p.verification_status,
    p.latitude as performer_latitude,
    p.longitude as performer_longitude,
    dr.gig_latitude,
    dr.gig_longitude,
    dr.expected_genres,
    dr.expected_instruments,
    dr.settings,
    coalesce(
      (select jsonb_agg(pg.genre order by pg.genre) from public.profile_genres pg where pg.profile_id = p.id),
      '[]'::jsonb
    ) as performer_genres,
    coalesce(
      (select jsonb_agg(ps.skill order by ps.skill) from public.profile_skills ps where ps.profile_id = p.id),
      '[]'::jsonb
    ) as performer_instruments
  from public.gig_applications ga
  join public.profiles p on p.id = ga.applicant_id
  join demo_requirements dr on dr.gig_id = ga.gig_id
  where ga.performer_snapshot->>'source' = 'role_accurate_demo_seed_v1'
),
candidate_matches as (
  select
    cd.*,
    exists (
      select 1
      from jsonb_array_elements_text(cd.expected_genres) expected(value)
      cross join jsonb_array_elements_text(cd.performer_genres) actual(value)
      where position(
        regexp_replace(lower(trim(expected.value)), '[^a-z0-9]+', ' ', 'g')
        in regexp_replace(lower(trim(actual.value)), '[^a-z0-9]+', ' ', 'g')
      ) > 0
      or position(
        regexp_replace(lower(trim(actual.value)), '[^a-z0-9]+', ' ', 'g')
        in regexp_replace(lower(trim(expected.value)), '[^a-z0-9]+', ' ', 'g')
      ) > 0
    ) as genre_match,
    exists (
      select 1
      from jsonb_array_elements_text(cd.expected_instruments) expected(value)
      cross join jsonb_array_elements_text(cd.performer_instruments) actual(value)
      where position(
        regexp_replace(lower(trim(expected.value)), '[^a-z0-9]+', ' ', 'g')
        in regexp_replace(lower(trim(actual.value)), '[^a-z0-9]+', ' ', 'g')
      ) > 0
      or position(
        regexp_replace(lower(trim(actual.value)), '[^a-z0-9]+', ' ', 'g')
        in regexp_replace(lower(trim(expected.value)), '[^a-z0-9]+', ' ', 'g')
      ) > 0
    ) as instrument_match,
    case
      when cd.performer_latitude is null or cd.performer_longitude is null
        or cd.gig_latitude is null or cd.gig_longitude is null
      then null
      else round((
        6371 * 2 * asin(sqrt(least(1, greatest(0,
          power(sin(radians(cd.performer_latitude - cd.gig_latitude) / 2), 2)
          + cos(radians(cd.gig_latitude)) * cos(radians(cd.performer_latitude))
          * power(sin(radians(cd.performer_longitude - cd.gig_longitude) / 2), 2)
        ))))
      )::numeric, 1)
    end as distance_km
  from candidate_data cd
),
scored as (
  select
    cm.*,
    round((
      (case when cm.instrument_match then 30 else 0 end)
      + (case when cm.genre_match then 25 else 0 end)
    ) * 100.0 / 55.0)::smallint as score
  from candidate_matches cm
),
recommendations as (
  select
    s.*,
    case when s.score >= 75 then 'recommended' else 'possible_match' end as recommendation_status,
    to_jsonb(array_remove(array[
      case when s.instrument_match then 'Instrument or role fit' end,
      case when s.genre_match then 'Genre fit' end
    ], null)) as matched_criteria,
    to_jsonb(array_remove(array[
      case
        when s.instrument_match then null
        when jsonb_array_length(s.performer_instruments) = 0 then 'Instrument or role fit unavailable on the applicant profile or group roster'
        else 'Instrument or role fit'
      end,
      case
        when s.genre_match then null
        when jsonb_array_length(s.performer_genres) = 0 then 'Genre fit unavailable on the applicant profile or group roster'
        else 'Genre fit'
      end
    ], null)) as missing_criteria
  from scored s
)
insert into public.gig_application_recommendations (
  id,
  application_id,
  gig_id,
  score,
  is_verified,
  is_eligible,
  recommendation_status,
  matched_criteria,
  missing_criteria,
  explanation,
  criteria_snapshot,
  model_provider,
  model_version,
  generated_at,
  updated_at,
  distance_km,
  distance_status
)
select
  md5('role_accurate_demo_seed_v1:ai_recommendation:' || r.application_id::text)::uuid,
  r.application_id,
  r.gig_id,
  r.score,
  r.is_verified is true and upper(coalesce(r.verification_status, '')) = 'APPROVED',
  true,
  r.recommendation_status,
  r.matched_criteria,
  r.missing_criteria,
  case
    when r.recommendation_status = 'recommended'
      then r.score::text || '% advisory fit based on the gig''s saved requirements.'
    else r.score::text || '% advisory fit; review the unmatched preferences before deciding.'
  end,
  jsonb_build_object(
    'settings', r.settings,
    'requirements', jsonb_build_object(
      'genres', r.expected_genres,
      'instruments', r.expected_instruments
    ),
    'performer', jsonb_build_object(
      'genres', r.performer_genres,
      'instruments', r.performer_instruments,
      'has_portfolio', false
    ),
    'source', 'role_accurate_demo_seed_v1'
  ),
  'rules',
  'gig-fit-v4',
  now(),
  now(),
  r.distance_km,
  case when r.distance_km is null then 'unavailable' else 'any_distance' end
from recommendations r
on conflict (application_id) do nothing;
