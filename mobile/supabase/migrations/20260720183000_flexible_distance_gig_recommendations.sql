-- Store performer coordinates once and support advisory distance-aware gig recommendations.
alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.profiles
  drop constraint if exists profiles_latitude_range,
  drop constraint if exists profiles_longitude_range;

alter table public.profiles
  add constraint profiles_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint profiles_longitude_range check (longitude is null or longitude between -180 and 180);

alter table public.gig_application_recommendations
  alter column score drop not null,
  add column if not exists distance_km numeric(8,1),
  add column if not exists distance_status text;

alter table public.gig_application_recommendations
  drop constraint if exists gig_application_recommendations_recommendation_status_check,
  drop constraint if exists gig_application_recommendations_distance_status_check,
  add constraint gig_application_recommendations_recommendation_status_check
    check (recommendation_status in ('recommended', 'possible_match', 'not_eligible', 'insufficient_data')),
  add constraint gig_application_recommendations_distance_status_check
    check (distance_status is null or distance_status in ('inside_range', 'outside_range', 'unavailable', 'any_distance'));

create or replace function public.validate_gig_ai_recommendation_settings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_score numeric;
  v_radius numeric;
begin
  if new.requirement_key <> 'ai_recommendation_settings' then
    return new;
  end if;

  if jsonb_typeof(new.requirement_value) <> 'object' then
    raise exception 'AI recommendation settings must be a JSON object';
  end if;

  if new.requirement_value ? 'minimum_score' then
    begin
      v_score := (new.requirement_value->>'minimum_score')::numeric;
    exception when others then
      raise exception 'minimum_score must be a number from 0 to 100';
    end;
    if v_score < 0 or v_score > 100 or v_score <> trunc(v_score) then
      raise exception 'minimum_score must be an integer from 0 to 100';
    end if;
  end if;

  if new.requirement_value ? 'location_radius_km'
     and new.requirement_value->'location_radius_km' <> 'null'::jsonb then
    begin
      v_radius := (new.requirement_value->>'location_radius_km')::numeric;
    exception when others then
      raise exception 'location_radius_km must be 5, 10, 25, 50, 100, or null';
    end;
    if v_radius not in (5, 10, 25, 50, 100) then
      raise exception 'location_radius_km must be 5, 10, 25, 50, 100, or null';
    end if;
  end if;

  new.requirement_value := new.requirement_value - 'verified_only' - 'verifiedApplicantsOnly';
  return new;
end;
$$;

drop trigger if exists trg_validate_gig_ai_recommendation_settings on public.gig_requirements;
create trigger trg_validate_gig_ai_recommendation_settings
before insert or update on public.gig_requirements
for each row execute function public.validate_gig_ai_recommendation_settings();

update public.gig_requirements
set requirement_value =
  jsonb_set(
    requirement_value - 'verified_only' - 'verifiedApplicantsOnly',
    '{minimum_score}',
    to_jsonb(greatest(0, least(100,
      case
        when jsonb_typeof(requirement_value->'minimum_score') = 'number'
          then round((requirement_value->>'minimum_score')::numeric)::integer
        else 75
      end
    )))
  )
where requirement_key = 'ai_recommendation_settings'
  and jsonb_typeof(requirement_value) = 'object';

comment on column public.profiles.latitude is 'Latitude captured by the profile location picker; never inferred from address text during recommendation reads.';
comment on column public.profiles.longitude is 'Longitude captured by the profile location picker; never inferred from address text during recommendation reads.';
comment on column public.gig_application_recommendations.distance_km is 'Haversine distance between stored gig and performer coordinates; null when unavailable.';
comment on column public.gig_application_recommendations.distance_status is 'Advisory location range result; never an automatic hiring decision.';
