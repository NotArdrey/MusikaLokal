-- Backfill existing Didit-approved identity claims and demote later accounts
-- that reused the same identity document for the same role.

with session_candidates as (
  select
    p.id as user_id,
    lower(p.email) as normalized_email,
    lower(trim(coalesce(p.role, 'musician'))) as role,
    vs.session_ref as didit_session_id,
    nullif(vs.verification_data ->> 'document_fingerprint', '') as document_fingerprint,
    coalesce(nullif(vs.verification_data ->> 'document_country', ''), 'PHL') as document_country,
    coalesce(nullif(vs.verification_data ->> 'selected_document_type', ''), 'Government ID') as document_type,
    nullif(vs.verification_data ->> 'selected_document_type_key', '') as document_type_key,
    coalesce(p.id_verified_at, vs.created_at, p.created_at, now()) as verified_at
  from public.verification_sessions vs
  join public.profiles p
    on (
      (
        vs.verification_data ->> 'user_ref' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and p.id = (vs.verification_data ->> 'user_ref')::uuid
      )
      or p.didit_session_id = vs.session_ref
      or (
        nullif(vs.verification_data ->> 'email', '') is not null
        and lower(p.email) = lower(vs.verification_data ->> 'email')
      )
    )
  where upper(coalesce(vs.status, '')) in ('APPROVED', 'SUPERSEDED_APPROVED')
    and nullif(vs.verification_data ->> 'document_fingerprint', '') is not null
    and upper(coalesce(p.verification_status, '')) = 'APPROVED'
),
deduped_candidates as (
  select distinct on (user_id, document_fingerprint, role)
    *
  from session_candidates
  order by user_id, document_fingerprint, role, verified_at desc
),
ranked_candidates as (
  select
    dc.*,
    row_number() over (
      partition by dc.document_fingerprint, dc.role
      order by dc.verified_at asc nulls last, dc.user_id
    ) as identity_role_rank
  from deduped_candidates dc
),
prepared_claims as (
  select
    rc.*,
    exists (
      select 1
      from public.identity_document_claims existing
      where existing.document_fingerprint = rc.document_fingerprint
        and existing.role = rc.role
        and existing.status = 'APPROVED'
        and existing.user_id is distinct from rc.user_id
    ) as has_other_approved_claim
  from ranked_candidates rc
)
insert into public.identity_document_claims (
  user_id,
  original_user_id,
  normalized_email,
  role,
  document_fingerprint,
  document_type,
  document_type_key,
  document_country,
  source,
  status,
  didit_session_id,
  claim_metadata,
  updated_at,
  last_seen_at
)
select
  user_id,
  user_id,
  normalized_email,
  role,
  document_fingerprint,
  document_type,
  document_type_key,
  document_country,
  case
    when identity_role_rank = 1 and not has_other_approved_claim then 'DIDIT'
    else 'DIDIT_DUPLICATE'
  end,
  case
    when identity_role_rank = 1 and not has_other_approved_claim then 'APPROVED'
    else 'PENDING_REVIEW'
  end,
  didit_session_id,
  jsonb_build_object(
    'backfilled_from_verification_session', true,
    'same_role_identity_rank', identity_role_rank,
    'backfilled_at', now()
  ),
  now(),
  now()
from prepared_claims
on conflict (user_id, document_fingerprint, role) do update
set
  original_user_id = coalesce(public.identity_document_claims.original_user_id, excluded.original_user_id),
  normalized_email = coalesce(excluded.normalized_email, public.identity_document_claims.normalized_email),
  document_type = coalesce(excluded.document_type, public.identity_document_claims.document_type),
  document_type_key = coalesce(excluded.document_type_key, public.identity_document_claims.document_type_key),
  document_country = coalesce(excluded.document_country, public.identity_document_claims.document_country),
  source = excluded.source,
  status = excluded.status,
  didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
  claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
  updated_at = now(),
  last_seen_at = now();

with ranked_approved_claims as (
  select
    id,
    row_number() over (
      partition by document_fingerprint, role
      order by last_seen_at asc nulls last, updated_at asc nulls last, created_at asc, id
    ) as identity_role_rank
  from public.identity_document_claims
  where status = 'APPROVED'
),
demoted as (
  update public.identity_document_claims c
  set
    status = 'PENDING_REVIEW',
    source = 'DIDIT_DUPLICATE',
    claim_metadata = coalesce(c.claim_metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_demoted_same_role_duplicate', true,
      'auto_demoted_at', now()
    ),
    updated_at = now()
  from ranked_approved_claims ranked
  where ranked.id = c.id
    and ranked.identity_role_rank > 1
  returning c.*
),
duplicate_pending_claims as (
  select distinct c.*
  from public.identity_document_claims c
  where c.status = 'PENDING_REVIEW'
    and exists (
      select 1
      from public.identity_document_claims approved
      where approved.document_fingerprint = c.document_fingerprint
        and approved.role = c.role
        and approved.status = 'APPROVED'
        and approved.user_id is distinct from c.user_id
    )
)
update public.profiles p
set
  is_verified = false,
  verification_status = 'PENDING_REVIEW',
  id_verified_at = null,
  didit_session_id = coalesce(p.didit_session_id, d.didit_session_id)
from duplicate_pending_claims d
where p.id = d.user_id
  and upper(coalesce(p.verification_status, '')) = 'APPROVED';

with duplicate_pending_claims as (
  select distinct c.*
  from public.identity_document_claims c
  where c.status = 'PENDING_REVIEW'
    and exists (
      select 1
      from public.identity_document_claims approved
      where approved.document_fingerprint = c.document_fingerprint
        and approved.role = c.role
        and approved.status = 'APPROVED'
        and approved.user_id is distinct from c.user_id
    )
)
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'is_verified', false,
  'verification_status', 'PENDING_REVIEW'
)
from duplicate_pending_claims d
where u.id = d.user_id;

with duplicate_pending_claims as (
  select distinct
    c.*,
    p.email,
    (
      select count(*)
      from public.identity_document_claims approved
      where approved.document_fingerprint = c.document_fingerprint
        and approved.role = c.role
        and approved.status = 'APPROVED'
        and approved.user_id is distinct from c.user_id
    ) as approved_match_count
  from public.identity_document_claims c
  join public.profiles p on p.id = c.user_id
  where c.status = 'PENDING_REVIEW'
    and exists (
      select 1
      from public.identity_document_claims approved
      where approved.document_fingerprint = c.document_fingerprint
        and approved.role = c.role
        and approved.status = 'APPROVED'
        and approved.user_id is distinct from c.user_id
    )
)
insert into public.manual_identity_reviews (
  user_id,
  submitted_by_email,
  submitted_role,
  document_type,
  document_type_key,
  document_country,
  source,
  status,
  didit_session_id,
  document_fingerprint,
  duplicate_reason,
  duplicate_match_count,
  review_notes,
  metadata,
  expected_decision_by
)
select
  d.user_id,
  coalesce(d.email, d.normalized_email, ''),
  d.role,
  coalesce(d.document_type, 'Government ID'),
  d.document_type_key,
  coalesce(d.document_country, 'PHL'),
  'DIDIT_DUPLICATE',
  'PENDING_REVIEW',
  d.didit_session_id,
  d.document_fingerprint,
  case
    when d.role = 'fan' then 'This ID appears to match another fan account. We will review it manually so the account is handled correctly.'
    else 'This ID appears to match another musician account. We will review it manually so the account is handled correctly.'
  end,
  greatest(d.approved_match_count, 1),
  case
    when d.role = 'fan' then 'This ID appears to match another fan account. We will review it manually so the account is handled correctly.'
    else 'This ID appears to match another musician account. We will review it manually so the account is handled correctly.'
  end,
  jsonb_build_object(
    'auto_created_for_same_role_duplicate', true,
    'created_at', now()
  ),
  now() + interval '7 days'
from duplicate_pending_claims d
where not exists (
  select 1
  from public.manual_identity_reviews existing
  where existing.user_id = d.user_id
    and existing.source = 'DIDIT_DUPLICATE'
    and existing.status = 'PENDING_REVIEW'
);

with duplicate_pending_claims as (
  select distinct c.*
  from public.identity_document_claims c
  where c.status = 'PENDING_REVIEW'
    and c.didit_session_id is not null
    and exists (
      select 1
      from public.identity_document_claims approved
      where approved.document_fingerprint = c.document_fingerprint
        and approved.role = c.role
        and approved.status = 'APPROVED'
        and approved.user_id is distinct from c.user_id
    )
)
update public.verification_sessions vs
set
  status = 'PENDING_REVIEW',
  verification_data = coalesce(vs.verification_data, '{}'::jsonb) || jsonb_build_object(
    'duplicate_identity_review_required', true,
    'duplicate_reason', case
      when d.role = 'fan' then 'This ID appears to match another fan account. We will review it manually so the account is handled correctly.'
      else 'This ID appears to match another musician account. We will review it manually so the account is handled correctly.'
    end,
    'duplicate_review_backfilled_at', now()
  )
from duplicate_pending_claims d
where vs.session_ref = d.didit_session_id;

notify pgrst, 'reload schema';
