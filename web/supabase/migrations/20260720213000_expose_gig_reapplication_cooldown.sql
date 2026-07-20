-- Keep the public gig details projection aligned with the cooldown saved on gigs.
-- The application form reads this view; omitting the column made a saved value of
-- zero look missing and caused the client to fall back to a 30-day cooldown.

create or replace view public.gigs_with_stats as
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
  gap.availability,
  g.address_verification_status,
  g.address_verification_session_id,
  g.address_verified_at,
  g.verified_address,
  g.address_verification_completed_at,
  g.permit_status,
  g.permit_rejection_reason,
  g.permit_admin_notes,
  g.permit_reviewed_by,
  g.permit_reviewed_at,
  g.permit_resubmissions_used,
  g.total_slots_filled,
  pending_apps.pending_applicant_count,
  g.reapplication_cooldown_days;

comment on column public.gigs_with_stats.reapplication_cooldown_days is
  'Gig-owner configured delay before a declined applicant may reapply; zero means no cooldown.';
