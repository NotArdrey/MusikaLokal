-- Enforce the live gig cooldown for every application entry point.
-- The applicant entity is the solo profile, selected group, or production team.
create or replace function public.prevent_repeated_gig_application_cancellations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cancelled_count integer := 0;
  v_cooldown_days numeric := 30;
  v_last_rejection timestamptz;
  v_cooldown_ends_at timestamptz;
  v_entity_label text := 'applicant';
begin
  if tg_op <> 'INSERT' or new.status <> 'pending' then
    return new;
  end if;

  select coalesce(g.reapplication_cooldown_days, 30)
  into v_cooldown_days
  from public.gigs g
  where g.id = new.gig_id;

  if new.production_team_id is not null then
    v_entity_label := 'production team';

    select
      count(*) filter (
        where ga.status = 'cancelled'
          and ga.updated_at >= now() - interval '30 days'
      ),
      max(coalesce(ga.rejected_at, ga.created_at)) filter (
        where ga.status = 'rejected'
          and ga.system_status_reason is distinct from 'system_requirements_changed'
      )
    into v_cancelled_count, v_last_rejection
    from public.gig_applications ga
    where ga.gig_id = new.gig_id
      and ga.production_team_id = new.production_team_id;
  elsif new.group_id is not null then
    v_entity_label := 'group';

    select
      count(*) filter (
        where ga.status = 'cancelled'
          and ga.updated_at >= now() - interval '30 days'
      ),
      max(coalesce(ga.rejected_at, ga.created_at)) filter (
        where ga.status = 'rejected'
          and ga.system_status_reason is distinct from 'system_requirements_changed'
      )
    into v_cancelled_count, v_last_rejection
    from public.gig_applications ga
    where ga.gig_id = new.gig_id
      and ga.group_id = new.group_id
      and ga.production_team_id is null;
  else
    v_entity_label := 'solo applicant';

    select
      count(*) filter (
        where ga.status = 'cancelled'
          and ga.updated_at >= now() - interval '30 days'
      ),
      max(coalesce(ga.rejected_at, ga.created_at)) filter (
        where ga.status = 'rejected'
          and ga.system_status_reason is distinct from 'system_requirements_changed'
      )
    into v_cancelled_count, v_last_rejection
    from public.gig_applications ga
    where ga.gig_id = new.gig_id
      and ga.applicant_id = new.applicant_id
      and ga.group_id is null
      and ga.production_team_id is null;
  end if;

  if v_cancelled_count >= 3 then
    raise exception 'Maximum attempts reached for this gig.'
      using errcode = 'P0001',
            hint = 'This applicant entity cancelled applications to this gig 3 times in the last 30 days.';
  end if;

  if coalesce(v_cooldown_days, 30) > 0 and v_last_rejection is not null then
    v_cooldown_ends_at :=
      v_last_rejection
      + make_interval(secs => (v_cooldown_days * 86400)::double precision);

    if now() < v_cooldown_ends_at then
      raise exception 'Reapplication cooldown is still active for this gig.'
        using errcode = 'P0001',
              hint = format(
                'The %s can reapply after %s. A cooldown of zero allows immediate reapplication.',
                v_entity_label,
                v_cooldown_ends_at
              );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_repeated_gig_application_cancellations
  on public.gig_applications;

create trigger trg_prevent_repeated_gig_application_cancellations
  before insert on public.gig_applications
  for each row
  execute function public.prevent_repeated_gig_application_cancellations();

