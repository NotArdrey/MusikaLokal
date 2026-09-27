-- Requirement-change closures are system actions, not organizer declines.
-- Keep the legacy applicant-scoped helper aligned with the client cooldown rule.
create or replace function public.can_musician_reapply(
  p_gig_id uuid,
  p_applicant_id uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_cooldown_days numeric := 30;
  v_last_rejection timestamptz;
begin
  select coalesce(g.reapplication_cooldown_days, 30)
  into v_cooldown_days
  from public.gigs g
  where g.id = p_gig_id;

  if not found then
    return false;
  end if;

  select max(coalesce(ga.rejected_at, ga.created_at))
  into v_last_rejection
  from public.gig_applications ga
  where ga.gig_id = p_gig_id
    and ga.applicant_id = p_applicant_id
    and ga.status = 'rejected'
    and ga.system_status_reason is distinct from 'system_requirements_changed';

  if v_last_rejection is null or v_cooldown_days <= 0 then
    return true;
  end if;

  return now() >= (
    v_last_rejection
    + make_interval(secs => (v_cooldown_days * 86400)::double precision)
  );
end;
$$;

comment on function public.can_musician_reapply(uuid, uuid) is
  'Returns whether an applicant cooldown has elapsed; system closures caused by changed gig requirements do not start a cooldown.';
