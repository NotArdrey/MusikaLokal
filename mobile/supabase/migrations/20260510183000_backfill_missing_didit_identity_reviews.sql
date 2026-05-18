with pending_didit_profiles as (
  select
    p.id as user_id,
    lower(trim(coalesce(p.role, 'musician'))) as submitted_role,
    p.email as submitted_by_email,
    p.didit_session_id,
    upper(replace(trim(coalesce(vs.status, 'PENDING_REVIEW')), ' ', '_')) as session_status,
    vs.verification_data
  from public.profiles p
  join public.verification_sessions vs
    on vs.session_ref = p.didit_session_id
  where p.verification_status = 'PENDING_REVIEW'
    and p.didit_session_id is not null
    and not exists (
      select 1
      from public.manual_identity_reviews mir
      where mir.user_id = p.id
        and mir.status = 'PENDING_REVIEW'
    )
),
normalized_candidates as (
  select
    p.*,
    nullif(trim(coalesce(p.verification_data->>'document_fingerprint', '')), '') as document_fingerprint,
    coalesce(
      nullif(trim(p.verification_data->>'selected_document_type'), ''),
      nullif(trim(p.verification_data->>'document_type'), ''),
      nullif(trim(p.verification_data->>'documentType'), ''),
      'Government ID'
    ) as document_type,
    coalesce(
      nullif(trim(p.verification_data->>'selected_document_type_key'), ''),
      nullif(trim(p.verification_data->>'document_type_key'), ''),
      nullif(trim(p.verification_data->>'documentTypeKey'), '')
    ) as document_type_key,
    upper(coalesce(
      nullif(trim(p.verification_data->>'document_country'), ''),
      nullif(trim(p.verification_data->>'issuing_country'), ''),
      nullif(trim(p.verification_data->>'country'), ''),
      'PHL'
    )) as document_country,
    coalesce(
      nullif(trim(p.verification_data->>'verified_full_legal_name'), ''),
      nullif(trim(p.verification_data->>'full_legal_name'), ''),
      nullif(trim(p.verification_data->>'full_name'), ''),
      nullif(trim(concat_ws(' ', p.verification_data->>'first_name', p.verification_data->>'last_name')), '')
    ) as verified_full_legal_name,
    case
      when coalesce(
        p.verification_data->>'birth_date',
        p.verification_data->>'date_of_birth',
        p.verification_data #>> '{raw_data,birth_date}',
        p.verification_data #>> '{raw_data,date_of_birth}'
      ) ~ '^\d{4}-\d{2}-\d{2}'
        then substring(coalesce(
          p.verification_data->>'birth_date',
          p.verification_data->>'date_of_birth',
          p.verification_data #>> '{raw_data,birth_date}',
          p.verification_data #>> '{raw_data,date_of_birth}'
        ) from 1 for 10)::date
      else null
    end as birth_date
  from pending_didit_profiles p
),
review_candidates as (
  select
    n.*,
    coalesce(matches.match_count, 0) as duplicate_match_count,
    coalesce(matches.matched_accounts, '[]'::jsonb) as duplicate_matches
  from normalized_candidates n
  left join lateral (
    select
      count(c.id)::integer as match_count,
      coalesce(jsonb_agg(jsonb_build_object(
        'claim_id', c.id,
        'user_id', c.user_id,
        'original_user_id', c.original_user_id,
        'email', coalesce(c.normalized_email, lower(mp.email)),
        'full_name', coalesce(c.verified_full_legal_name, mp.full_name),
        'role', c.role,
        'source', c.source,
        'claim_status', c.status,
        'verified_at', c.created_at,
        'matched_on', 'DOCUMENT_FINGERPRINT'
      ) order by c.created_at desc), '[]'::jsonb) as matched_accounts
    from public.identity_document_claims c
    left join public.profiles mp
      on mp.id = c.user_id
    where n.document_fingerprint is not null
      and c.document_fingerprint = n.document_fingerprint
      and c.role = n.submitted_role
      and c.status in ('APPROVED', 'PENDING_REVIEW')
      and c.user_id is distinct from n.user_id
  ) matches on true
),
queued_reviews as (
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
    verified_full_legal_name,
    normalized_full_legal_name,
    birth_date,
    review_reason,
    matched_on,
    duplicate_reason,
    duplicate_match_count,
    review_notes,
    metadata,
    expected_decision_by,
    updated_at
  )
  select
    user_id,
    submitted_by_email,
    submitted_role,
    document_type,
    document_type_key,
    document_country,
    case
      when duplicate_match_count > 0 then 'DIDIT_DUPLICATE'
      else 'DIDIT_PENDING'
    end,
    'PENDING_REVIEW',
    didit_session_id,
    document_fingerprint,
    verified_full_legal_name,
    public.normalize_identity_full_legal_name(verified_full_legal_name),
    birth_date,
    case
      when duplicate_match_count > 0 then 'DUPLICATE_DOCUMENT_FINGERPRINT'
      else 'DIDIT_PENDING_REVIEW_BACKFILL'
    end,
    case
      when duplicate_match_count > 0 then 'DOCUMENT_FINGERPRINT'
      else null
    end,
    case
      when duplicate_match_count > 0 then format(
        'This ID appears to match another %s account. We will review it manually so the account is handled correctly.',
        case when submitted_role = 'fan' then 'fan' else 'musician' end
      )
      else null
    end,
    duplicate_match_count,
    case
      when duplicate_match_count > 0 then format(
        'This ID appears to match another %s account. We will review it manually so the account is handled correctly.',
        case when submitted_role = 'fan' then 'fan' else 'musician' end
      )
      else 'Queued from Didit pending-review profile backfill.'
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'backfilled_at', now(),
      'backfill_reason', 'missing_manual_identity_review_row',
      'source_session_status', session_status,
      'duplicate_identity_review', duplicate_match_count > 0,
      'review_reason', case
        when duplicate_match_count > 0 then 'DUPLICATE_DOCUMENT_FINGERPRINT'
        else 'DIDIT_PENDING_REVIEW_BACKFILL'
      end,
      'matched_on', case
        when duplicate_match_count > 0 then 'DOCUMENT_FINGERPRINT'
        else null
      end,
      'duplicate_matches', duplicate_matches
    )),
    now() + interval '7 days',
    now()
  from review_candidates
  on conflict (user_id, source) where status = 'PENDING_REVIEW'
  do update
    set submitted_by_email = excluded.submitted_by_email,
        submitted_role = excluded.submitted_role,
        document_type = excluded.document_type,
        document_type_key = excluded.document_type_key,
        document_country = excluded.document_country,
        didit_session_id = excluded.didit_session_id,
        document_fingerprint = excluded.document_fingerprint,
        verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.manual_identity_reviews.verified_full_legal_name),
        normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.manual_identity_reviews.normalized_full_legal_name),
        birth_date = coalesce(excluded.birth_date, public.manual_identity_reviews.birth_date),
        review_reason = excluded.review_reason,
        matched_on = excluded.matched_on,
        duplicate_reason = excluded.duplicate_reason,
        duplicate_match_count = excluded.duplicate_match_count,
        review_notes = excluded.review_notes,
        metadata = coalesce(public.manual_identity_reviews.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
  returning
    id,
    user_id,
    submitted_by_email,
    submitted_role,
    document_type,
    document_type_key,
    document_country,
    source,
    didit_session_id,
    document_fingerprint,
    verified_full_legal_name,
    normalized_full_legal_name,
    birth_date,
    review_reason,
    matched_on,
    metadata
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
  verified_full_legal_name,
  normalized_full_legal_name,
  birth_date,
  source,
  status,
  didit_session_id,
  manual_review_id,
  claim_metadata,
  updated_at,
  last_seen_at
)
select
  user_id,
  user_id,
  lower(nullif(trim(submitted_by_email), '')),
  submitted_role,
  document_fingerprint,
  document_type,
  document_type_key,
  document_country,
  verified_full_legal_name,
  normalized_full_legal_name,
  birth_date,
  source,
  'PENDING_REVIEW',
  didit_session_id,
  id,
  metadata,
  now(),
  now()
from queued_reviews
where document_fingerprint is not null
on conflict (user_id, document_fingerprint, role)
do update
  set normalized_email = excluded.normalized_email,
      document_type = coalesce(excluded.document_type, public.identity_document_claims.document_type),
      document_type_key = coalesce(excluded.document_type_key, public.identity_document_claims.document_type_key),
      document_country = excluded.document_country,
      verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
      normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
      birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
      source = excluded.source,
      status = 'PENDING_REVIEW',
      didit_session_id = excluded.didit_session_id,
      manual_review_id = excluded.manual_review_id,
      claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
      updated_at = now(),
      last_seen_at = now();
