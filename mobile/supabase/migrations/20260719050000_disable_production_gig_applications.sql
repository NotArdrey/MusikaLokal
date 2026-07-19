-- Gig applications may be submitted only by musician accounts, either directly
-- or for a duo/group they belong to. Production-team roster submissions are disabled.

alter table public.gig_applications
  drop constraint if exists gig_applications_no_production_submission;

alter table public.gig_applications
  add constraint gig_applications_no_production_submission
  check (production_team_id is null and production_roster_id is null);

create or replace function public.validate_gig_application_submitter_role()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  actor_id uuid;
  actor_role text;
begin
  if new.production_team_id is not null or new.production_roster_id is not null then
    raise exception 'Production-team gig applications are disabled. Apply from a musician account as solo, duo, or group.'
      using errcode = '42501';
  end if;

  actor_id := coalesce(new.submitted_by_user_id, new.applicant_id);
  if actor_id is null then
    raise exception 'A gig application submitter is required' using errcode = '23502';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from actor_id then
    raise exception 'The authenticated user must be the gig application submitter'
      using errcode = '42501';
  end if;

  select p.role into actor_role
  from public.profiles p
  where p.id = actor_id;

  if actor_role is distinct from 'musician' then
    raise exception 'Only musician accounts may apply to gigs as solo, duo, or group'
      using errcode = '42501';
  end if;

  if new.group_id is not null and not exists (
    select 1
    from public.groups g
    where g.id = new.group_id
      and (
        g.owner_id = actor_id
        or exists (
          select 1
          from public.group_members gm
          where gm.group_id = g.id
            and gm.user_id = actor_id
        )
      )
  ) then
    raise exception 'The musician submitter must belong to the selected duo or group'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_gig_application_submitter_role() from public, anon, authenticated;
grant execute on function public.validate_gig_application_submitter_role() to service_role;

drop trigger if exists trg_validate_gig_application_submitter_role on public.gig_applications;
create trigger trg_validate_gig_application_submitter_role
before insert or update of applicant_id, submitted_by_user_id, group_id, production_team_id, production_roster_id
on public.gig_applications
for each row
execute function public.validate_gig_application_submitter_role();

comment on constraint gig_applications_no_production_submission on public.gig_applications is
  'Production teams and production roster entries cannot submit gig applications.';
