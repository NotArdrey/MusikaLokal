begin;

-- Both views expose the cooldown column and must be recreated in this transaction.
drop view if exists public.gigs_with_stats;
drop view if exists public.gigs_with_verification;

alter table public.gigs
  drop constraint if exists gigs_reapplication_cooldown_days_check;

alter table public.gigs
  alter column reapplication_cooldown_days type numeric(8,3)
  using reapplication_cooldown_days::numeric;

alter table public.gigs
  add constraint gigs_reapplication_cooldown_days_check
  check (
    reapplication_cooldown_days >= 0
    and reapplication_cooldown_days <= 365
  );

comment on column public.gigs.reapplication_cooldown_days is
  'Cooldown after rejection expressed in days; fractional values support exact hours (for example, 0.5 = 12 hours). Zero allows immediate reapplication.';

create view public.gigs_with_verification as
 SELECT g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    g.business_permit_url,
    g.reapplication_cooldown_days,
    g.total_slots_filled,
    g.permit_status,
    g.permit_reviewed_by,
    g.permit_reviewed_at,
    g.permit_admin_notes,
    g.permit_rejection_reason,
    g.permit_resubmissions_used,
        CASE
            WHEN (g.address_verification_status = 'APPROVED'::text) THEN true
            ELSE false
        END AS is_address_verified,
    avs.extracted_address,
    avs.extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes
   FROM (gigs g
     LEFT JOIN address_verification_sessions avs ON (((avs.entity_type = 'gig'::text) AND (avs.entity_id = g.id) AND (avs.status = g.address_verification_status))));

grant all on public.gigs_with_verification to anon, authenticated, service_role;

create view public.gigs_with_stats as
select
  g.id,
  g.organizer_id,
  g.name,
  g.location,
  g.budget,
  g.description,
  g.event_date,
  glp.requirements,
  glp.images,
  glp.documents,
  g.status,
  g.latitude,
  g.longitude,
  g.created_at,
  g.embedding,
  g.rate,
  g.contract_url,
  g.business_permit_url,
  coalesce(gap.availability, '[]'::jsonb) as availability,
  g.address_verification_status,
  g.address_verification_session_id,
  g.address_verified_at,
  g.verified_address,
  g.address_verification_completed_at,
  coalesce(avg(r.rating), 0::numeric) as rating,
  count(r.id) as review_count,
  g.permit_status,
  g.permit_rejection_reason,
  g.permit_admin_notes,
  g.permit_reviewed_by,
  g.permit_reviewed_at,
  g.permit_resubmissions_used,
  g.total_slots_filled,
  coalesce(pending_apps.pending_applicant_count, 0) as pending_applicant_count,
  g.reapplication_cooldown_days
from public.gigs g
left join public.reviews r on r.gig_id = g.id
left join public.gigs_legacy_projection glp on glp.id = g.id
left join public.gigs_availability_projection gap on gap.gig_id = g.id
left join (
  select ga.gig_id, count(*)::integer as pending_applicant_count
  from public.gig_applications ga
  where ga.status = 'pending'
    and (ga.leader_approval_status is null or ga.leader_approval_status = 'approved')
  group by ga.gig_id
) pending_apps on pending_apps.gig_id = g.id
group by
  g.id,
  glp.requirements,
  glp.images,
  glp.documents,
  gap.availability,
  pending_apps.pending_applicant_count;

comment on column public.gigs_with_stats.reapplication_cooldown_days is
  'Gig-owner configured delay before a declined applicant may reapply; fractional days preserve exact hours.';

grant all on public.gigs_with_stats to anon, authenticated, service_role;

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
    and ga.status = 'rejected';

  if v_last_rejection is null or v_cooldown_days <= 0 then
    return true;
  end if;

  return now() >= (
    v_last_rejection
    + make_interval(secs => (v_cooldown_days * 86400)::double precision)
  );
end;
$$;

create or replace function public.update_gig_with_cooldown_safely(
  p_gig_id uuid,
  p_payload jsonb,
  p_cooldown_hours integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_uid uuid := auth.uid();
  v_organizer_id uuid;
  v_result jsonb;
  v_normalized_hours integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  v_normalized_hours := coalesce(p_cooldown_hours, 720);
  if v_normalized_hours < 0 or v_normalized_hours > 8760 then
    raise exception 'Reapplication cooldown must be between 0 and 8,760 hours';
  end if;

  select g.organizer_id
  into v_organizer_id
  from public.gigs g
  where g.id = p_gig_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'GIG_NOT_FOUND',
      'message', 'Gig not found.'
    );
  end if;

  if v_organizer_id <> v_uid
    and not public.staff_can_edit_gig(v_uid, p_gig_id)
  then
    raise exception 'Not authorized to update this gig';
  end if;

  v_result := public.update_gig_safely(
    p_gig_id,
    coalesce(p_payload, '{}'::jsonb) - 'reapplication_cooldown_days',
    p_reason
  );

  if coalesce((v_result->>'success')::boolean, false) is not true then
    return v_result;
  end if;

  update public.gigs
  set reapplication_cooldown_days = v_normalized_hours::numeric / 24
  where id = p_gig_id;

  return v_result || jsonb_build_object(
    'reapplication_cooldown_hours', v_normalized_hours,
    'reapplication_cooldown_days', v_normalized_hours::numeric / 24
  );
end;
$$;

revoke all on function public.update_gig_with_cooldown_safely(uuid, jsonb, integer, text) from public;
grant execute on function public.update_gig_with_cooldown_safely(uuid, jsonb, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
