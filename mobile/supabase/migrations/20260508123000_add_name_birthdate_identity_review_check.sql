create extension if not exists unaccent with schema extensions;

alter table public.identity_document_claims
  alter column document_fingerprint drop not null,
  add column if not exists verified_full_legal_name text,
  add column if not exists normalized_full_legal_name text,
  add column if not exists birth_date date;

alter table public.manual_identity_reviews
  add column if not exists verified_full_legal_name text,
  add column if not exists normalized_full_legal_name text,
  add column if not exists birth_date date,
  add column if not exists review_reason text,
  add column if not exists matched_on text;

create or replace function public.normalize_identity_full_legal_name(p_value text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(upper(unaccent(coalesce(p_value, ''))), '[^A-Z0-9]+', ' ', 'g'),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.set_identity_name_birthdate_normalized()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.verified_full_legal_name is not null or new.normalized_full_legal_name is not null then
    new.normalized_full_legal_name := public.normalize_identity_full_legal_name(
      coalesce(new.verified_full_legal_name, new.normalized_full_legal_name)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_identity_document_claims_name_birthdate_normalized on public.identity_document_claims;
create trigger trg_identity_document_claims_name_birthdate_normalized
before insert or update of verified_full_legal_name, normalized_full_legal_name, birth_date
on public.identity_document_claims
for each row
execute function public.set_identity_name_birthdate_normalized();

drop trigger if exists trg_manual_identity_reviews_name_birthdate_normalized on public.manual_identity_reviews;
create trigger trg_manual_identity_reviews_name_birthdate_normalized
before insert or update of verified_full_legal_name, normalized_full_legal_name, birth_date
on public.manual_identity_reviews
for each row
execute function public.set_identity_name_birthdate_normalized();

create index if not exists idx_identity_document_claims_name_birth_approved
  on public.identity_document_claims (role, normalized_full_legal_name, birth_date)
  where status = 'APPROVED'
    and normalized_full_legal_name is not null
    and birth_date is not null;

create index if not exists idx_manual_identity_reviews_name_birth_pending
  on public.manual_identity_reviews (submitted_role, normalized_full_legal_name, birth_date)
  where status = 'PENDING_REVIEW'
    and normalized_full_legal_name is not null
    and birth_date is not null;

create or replace function public.claim_identity_document_approval_v2(
  p_user_id uuid,
  p_role text,
  p_document_fingerprint text default null,
  p_normalized_email text default null,
  p_document_type text default null,
  p_document_type_key text default null,
  p_document_country text default 'PHL',
  p_full_legal_name text default null,
  p_normalized_full_legal_name text default null,
  p_birth_date date default null,
  p_source text default 'DIDIT',
  p_didit_session_id text default null,
  p_manual_review_id uuid default null,
  p_claim_metadata jsonb default '{}'::jsonb,
  p_duplicate_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text := lower(trim(coalesce(p_role, 'musician')));
  v_email text := lower(trim(coalesce(p_normalized_email, '')));
  v_document_fingerprint text := nullif(trim(coalesce(p_document_fingerprint, '')), '');
  v_country text := upper(trim(coalesce(p_document_country, 'PHL')));
  v_full_legal_name text := nullif(trim(coalesce(p_full_legal_name, '')), '');
  v_normalized_name text := public.normalize_identity_full_legal_name(coalesce(p_full_legal_name, p_normalized_full_legal_name));
  v_now timestamptz := now();
  v_matches jsonb := '[]'::jsonb;
  v_duplicate_count integer := 0;
  v_claim_id uuid;
  v_same_email_claim_id uuid;
  v_first_match_user_id uuid;
  v_review_reason text;
  v_matched_on text;
  v_match_source text := case
    when upper(coalesce(p_source, 'DIDIT')) = 'DIDIT' then 'DIDIT_ID_DOCUMENT'
    else upper(coalesce(p_source, 'IDENTITY_DOCUMENT'))
  end;
begin
  if p_user_id is null then
    return jsonb_build_object('decision', 'NO_CLAIM', 'claim_id', null, 'matches', v_matches);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(v_document_fingerprint, 'MISSING_DOCUMENT_FINGERPRINT') || ':' ||
    v_role || ':' ||
    coalesce(v_normalized_name, '') || ':' ||
    coalesce(p_birth_date::text, ''),
    0
  ));

  if v_document_fingerprint is not null then
    select c.id
    into v_same_email_claim_id
    from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.document_fingerprint = v_document_fingerprint
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id
      and v_email <> ''
      and coalesce(c.normalized_email, lower(p.email), '') = v_email
    limit 1;

    if v_same_email_claim_id is not null and not p_duplicate_override then
      return jsonb_build_object(
        'decision', 'EXISTING_ACCOUNT',
        'claim_id', v_same_email_claim_id,
        'review_reason', 'DUPLICATE_DOCUMENT_FINGERPRINT',
        'matched_on', 'DOCUMENT_FINGERPRINT',
        'matches', jsonb_build_array(jsonb_build_object('claim_id', v_same_email_claim_id))
      );
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'claim_id', c.id,
      'user_id', c.user_id,
      'original_user_id', c.original_user_id,
      'email', coalesce(c.normalized_email, lower(p.email)),
      'full_name', p.full_name,
      'role', c.role,
      'source', c.source,
      'verified_at', c.created_at,
      'matched_on', 'DOCUMENT_FINGERPRINT'
    )), '[]'::jsonb)
    into v_matches
    from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.document_fingerprint = v_document_fingerprint
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id
      and (
        v_email = ''
        or coalesce(c.normalized_email, lower(p.email), '') = ''
        or coalesce(c.normalized_email, lower(p.email), '') <> v_email
      );

    v_duplicate_count := jsonb_array_length(v_matches);

    if v_duplicate_count > 0 and not p_duplicate_override then
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
      values (
        p_user_id,
        p_user_id,
        nullif(v_email, ''),
        v_role,
        v_document_fingerprint,
        p_document_type,
        p_document_type_key,
        coalesce(nullif(v_country, ''), 'PHL'),
        v_full_legal_name,
        v_normalized_name,
        p_birth_date,
        coalesce(nullif(p_source, ''), 'DIDIT_DUPLICATE'),
        'PENDING_REVIEW',
        p_didit_session_id,
        p_manual_review_id,
        coalesce(p_claim_metadata, '{}'::jsonb) || jsonb_build_object(
          'review_reason', 'DUPLICATE_DOCUMENT_FINGERPRINT',
          'matched_on', 'DOCUMENT_FINGERPRINT',
          'source', v_match_source,
          'duplicate_matches', v_matches
        ),
        v_now,
        v_now
      )
      on conflict (user_id, document_fingerprint, role) do update
        set normalized_email = excluded.normalized_email,
            verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
            normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
            birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
            source = excluded.source,
            status = 'PENDING_REVIEW',
            didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
            manual_review_id = coalesce(excluded.manual_review_id, public.identity_document_claims.manual_review_id),
            claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
            updated_at = v_now,
            last_seen_at = v_now
      returning id into v_claim_id;

      return jsonb_build_object(
        'decision', 'PENDING_REVIEW',
        'claim_id', v_claim_id,
        'matches', v_matches,
        'duplicate_count', v_duplicate_count,
        'review_reason', 'DUPLICATE_DOCUMENT_FINGERPRINT',
        'matched_on', 'DOCUMENT_FINGERPRINT'
      );
    end if;

    if v_duplicate_count > 0 and p_duplicate_override then
      update public.identity_document_claims c
      set
        status = 'REVOKED',
        claim_metadata = coalesce(c.claim_metadata, '{}'::jsonb) || jsonb_build_object(
          'revoked_by_duplicate_override', true,
          'replacement_user_id', p_user_id,
          'revoked_at', v_now,
          'override_metadata', coalesce(p_claim_metadata, '{}'::jsonb)
        ),
        updated_at = v_now
      where c.document_fingerprint = v_document_fingerprint
        and c.role = v_role
        and c.status = 'APPROVED'
        and c.user_id is distinct from p_user_id;
    end if;
  end if;

  if v_normalized_name is not null and p_birth_date is not null and not p_duplicate_override then
    select coalesce(jsonb_agg(jsonb_build_object(
      'claim_id', c.id,
      'user_id', c.user_id,
      'original_user_id', c.original_user_id,
      'email', coalesce(c.normalized_email, lower(p.email)),
      'full_name', coalesce(c.verified_full_legal_name, p.full_name),
      'role', c.role,
      'source', c.source,
      'verified_at', c.created_at,
      'matched_on', 'NAME_BIRTHDATE'
    )), '[]'::jsonb)
    into v_matches
    from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.normalized_full_legal_name = v_normalized_name
      and c.birth_date = p_birth_date
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id;

    v_duplicate_count := jsonb_array_length(v_matches);

    if v_duplicate_count > 0 then
      select (v_matches -> 0 ->> 'user_id')::uuid into v_first_match_user_id;
      v_review_reason := 'SAME_NAME_BIRTHDATE_EXISTING_APPROVED_IDENTITY';
      v_matched_on := 'NAME_BIRTHDATE';

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
      values (
        p_user_id,
        p_user_id,
        nullif(v_email, ''),
        v_role,
        v_document_fingerprint,
        p_document_type,
        p_document_type_key,
        coalesce(nullif(v_country, ''), 'PHL'),
        v_full_legal_name,
        v_normalized_name,
        p_birth_date,
        coalesce(nullif(p_source, ''), 'DIDIT'),
        'PENDING_REVIEW',
        p_didit_session_id,
        p_manual_review_id,
        coalesce(p_claim_metadata, '{}'::jsonb) || jsonb_build_object(
          'review_reason', v_review_reason,
          'matched_on', v_matched_on,
          'source', v_match_source,
          'matched_existing_user_id', v_first_match_user_id,
          'duplicate_matches', v_matches,
          'missing_document_fingerprint', v_document_fingerprint is null
        ),
        v_now,
        v_now
      )
      on conflict (user_id, document_fingerprint, role) do update
        set normalized_email = excluded.normalized_email,
            verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
            normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
            birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
            source = excluded.source,
            status = 'PENDING_REVIEW',
            didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
            manual_review_id = coalesce(excluded.manual_review_id, public.identity_document_claims.manual_review_id),
            claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
            updated_at = v_now,
            last_seen_at = v_now
      returning id into v_claim_id;

      return jsonb_build_object(
        'decision', 'PENDING_REVIEW',
        'claim_id', v_claim_id,
        'matches', v_matches,
        'duplicate_count', v_duplicate_count,
        'review_reason', v_review_reason,
        'matched_on', v_matched_on,
        'matched_existing_user_id', v_first_match_user_id
      );
    end if;
  end if;

  if v_document_fingerprint is null then
    return jsonb_build_object(
      'decision', 'PENDING_REVIEW',
      'claim_id', null,
      'matches', '[]'::jsonb,
      'duplicate_count', 0,
      'review_reason', 'MISSING_DOCUMENT_FINGERPRINT',
      'matched_on', null
    );
  end if;

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
  values (
    p_user_id,
    p_user_id,
    nullif(v_email, ''),
    v_role,
    v_document_fingerprint,
    p_document_type,
    p_document_type_key,
    coalesce(nullif(v_country, ''), 'PHL'),
    v_full_legal_name,
    v_normalized_name,
    p_birth_date,
    coalesce(nullif(p_source, ''), 'DIDIT'),
    'APPROVED',
    p_didit_session_id,
    p_manual_review_id,
    coalesce(p_claim_metadata, '{}'::jsonb),
    v_now,
    v_now
  )
  on conflict (user_id, document_fingerprint, role) do update
    set normalized_email = excluded.normalized_email,
        document_type = coalesce(excluded.document_type, public.identity_document_claims.document_type),
        document_type_key = coalesce(excluded.document_type_key, public.identity_document_claims.document_type_key),
        document_country = excluded.document_country,
        verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
        normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
        birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
        source = excluded.source,
        status = 'APPROVED',
        didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
        manual_review_id = coalesce(excluded.manual_review_id, public.identity_document_claims.manual_review_id),
        claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
        updated_at = v_now,
        last_seen_at = v_now
  returning id into v_claim_id;

  return jsonb_build_object(
    'decision', 'APPROVED',
    'claim_id', v_claim_id,
    'matches', '[]'::jsonb,
    'duplicate_count', 0,
    'duplicate_override_applied', p_duplicate_override
  );
end;
$$;

revoke all on function public.claim_identity_document_approval_v2(
  uuid, text, text, text, text, text, text, text, text, date, text, text, uuid, jsonb, boolean
) from public;
revoke all on function public.claim_identity_document_approval_v2(
  uuid, text, text, text, text, text, text, text, text, date, text, text, uuid, jsonb, boolean
) from anon;
revoke all on function public.claim_identity_document_approval_v2(
  uuid, text, text, text, text, text, text, text, text, date, text, text, uuid, jsonb, boolean
) from authenticated;
grant execute on function public.claim_identity_document_approval_v2(
  uuid, text, text, text, text, text, text, text, text, date, text, text, uuid, jsonb, boolean
) to service_role;

create or replace function public.claim_identity_document_approval(
  p_user_id uuid,
  p_role text,
  p_document_fingerprint text,
  p_normalized_email text default null,
  p_document_type text default null,
  p_document_type_key text default null,
  p_document_country text default 'PHL',
  p_source text default 'DIDIT',
  p_didit_session_id text default null,
  p_manual_review_id uuid default null,
  p_claim_metadata jsonb default '{}'::jsonb,
  p_duplicate_override boolean default false
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.claim_identity_document_approval_v2(
    p_user_id,
    p_role,
    p_document_fingerprint,
    p_normalized_email,
    p_document_type,
    p_document_type_key,
    p_document_country,
    null,
    null,
    null,
    p_source,
    p_didit_session_id,
    p_manual_review_id,
    p_claim_metadata,
    p_duplicate_override
  );
$$;

revoke all on function public.claim_identity_document_approval(
  uuid, text, text, text, text, text, text, text, text, uuid, jsonb, boolean
) from public;
revoke all on function public.claim_identity_document_approval(
  uuid, text, text, text, text, text, text, text, text, uuid, jsonb, boolean
) from anon;
revoke all on function public.claim_identity_document_approval(
  uuid, text, text, text, text, text, text, text, text, uuid, jsonb, boolean
) from authenticated;
grant execute on function public.claim_identity_document_approval(
  uuid, text, text, text, text, text, text, text, text, uuid, jsonb, boolean
) to service_role;
