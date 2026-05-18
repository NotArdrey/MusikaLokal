-- Production catch-up for identity duplicate enforcement, trusted profile writes,
-- webhook replay protection, and public registration throttling.

do $$
begin
  if exists (
    select 1
    from public.profiles
    where email is not null
    group by lower(email)
    having count(*) > 1
  ) then
    raise exception 'Cannot add lower(email) uniqueness: profiles has case-insensitive duplicate emails.';
  end if;
end $$;

update public.profiles
set email = lower(email)
where email is not null
  and email <> lower(email);

create unique index if not exists idx_profiles_email_lower_unique
  on public.profiles ((lower(email)));

alter table public.identity_document_claims
  add column if not exists original_user_id uuid,
  add column if not exists normalized_email text,
  add column if not exists claim_metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_profile_at timestamptz;

update public.identity_document_claims c
set
  original_user_id = coalesce(c.original_user_id, c.user_id),
  normalized_email = coalesce(c.normalized_email, lower(p.email))
from public.profiles p
where c.user_id = p.id;

update public.identity_document_claims
set original_user_id = coalesce(original_user_id, user_id)
where original_user_id is null
  and user_id is not null;

alter table public.identity_document_claims
  alter column user_id drop not null;

alter table public.identity_document_claims
  drop constraint if exists identity_document_claims_user_id_fkey;

alter table public.identity_document_claims
  add constraint identity_document_claims_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete set null;

with ranked_approved_claims as (
  select
    id,
    row_number() over (
      partition by document_fingerprint, role
      order by last_seen_at desc nulls last, updated_at desc nulls last, created_at desc
    ) as rn
  from public.identity_document_claims
  where status = 'APPROVED'
)
update public.identity_document_claims c
set
  status = 'PENDING_REVIEW',
  claim_metadata = coalesce(c.claim_metadata, '{}'::jsonb) || jsonb_build_object(
    'auto_demoted_duplicate_approved_claim', true,
    'auto_demoted_at', now()
  ),
  updated_at = now()
from ranked_approved_claims ranked
where ranked.id = c.id
  and ranked.rn > 1;

create unique index if not exists idx_identity_document_claims_approved_fingerprint_role_unique
  on public.identity_document_claims (document_fingerprint, role)
  where status = 'APPROVED';

create index if not exists idx_identity_document_claims_original_user
  on public.identity_document_claims (original_user_id);

create index if not exists idx_identity_document_claims_normalized_email
  on public.identity_document_claims (normalized_email)
  where normalized_email is not null;

create table if not exists public.didit_webhook_events (
  event_key text primary key,
  session_id text,
  status text,
  payload_hash text not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.didit_webhook_events enable row level security;

drop policy if exists didit_webhook_events_service_manage on public.didit_webhook_events;
create policy didit_webhook_events_service_manage
on public.didit_webhook_events
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists idx_verification_sessions_session_nonce_hash
  on public.verification_sessions ((verification_data->>'session_nonce_hash'))
  where verification_data ? 'session_nonce_hash';

drop policy if exists manual_identity_reviews_update_own_pending on public.manual_identity_reviews;
drop policy if exists manual_identity_reviews_insert_own on public.manual_identity_reviews;

create or replace function public.guard_profile_sensitive_client_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_role text := auth.role();
begin
  if tg_op = 'INSERT' and new.email is not null then
    new.email := lower(new.email);
  end if;

  if v_client_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.role := lower(trim(coalesce(new.role, 'musician')));

      if new.id is distinct from auth.uid() then
        raise exception 'Profiles can only be inserted for the signed-in user'
          using errcode = '42501';
      end if;

      if new.role not in ('fan', 'musician') then
        raise exception 'Profile role must be assigned by trusted server code'
          using errcode = '42501';
      end if;

      if new.is_verified is true
        or upper(coalesce(new.verification_status, '')) in ('APPROVED', 'PENDING_REVIEW')
        or new.didit_session_id is not null
        or new.id_verified_at is not null
        or new.id_document_expiry is not null
        or coalesce(new.subscription_status, 'none') <> 'none'
        or new.subscription_expires_at is not null
        or new.subscription_plan_id is not null
        or new.smile_user_id is not null
      then
        raise exception 'Sensitive profile fields must be written by trusted server code'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.email is distinct from old.email
        or new.role is distinct from old.role
        or new.is_verified is distinct from old.is_verified
        or new.verification_status is distinct from old.verification_status
        or new.didit_session_id is distinct from old.didit_session_id
        or new.id_verified_at is distinct from old.id_verified_at
        or new.id_document_expiry is distinct from old.id_document_expiry
        or new.subscription_status is distinct from old.subscription_status
        or new.subscription_expires_at is distinct from old.subscription_expires_at
        or new.subscription_plan_id is distinct from old.subscription_plan_id
        or new.smile_user_id is distinct from old.smile_user_id
      then
        raise exception 'Sensitive profile fields must be updated by trusted server code'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if new.email is not null then
    new.email := lower(new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_sensitive_client_writes on public.profiles;
create trigger trg_guard_profile_sensitive_client_writes
before insert or update on public.profiles
for each row
execute function public.guard_profile_sensitive_client_writes();

revoke all on function public.guard_profile_sensitive_client_writes() from public;
revoke all on function public.guard_profile_sensitive_client_writes() from anon;
revoke all on function public.guard_profile_sensitive_client_writes() from authenticated;

create or replace function public.sync_didit_profile_after_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_profile public.profiles%rowtype;
  v_claim record;
  v_should_activate boolean := false;
  v_role text := null;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.email_confirmed_at is not distinct from new.email_confirmed_at
  then
    return new;
  end if;

  select *
  into v_existing_profile
  from public.profiles
  where id = new.id;

  select c.role, c.didit_session_id
  into v_claim
  from public.identity_document_claims c
  where c.status = 'APPROVED'
    and (c.user_id = new.id or c.original_user_id = new.id)
  order by c.last_seen_at desc nulls last, c.updated_at desc nulls last, c.created_at desc
  limit 1;

  v_should_activate :=
    upper(coalesce(v_existing_profile.verification_status, '')) = 'APPROVED'
    or v_claim.role is not null;

  if not v_should_activate then
    return new;
  end if;

  v_role := coalesce(nullif(v_existing_profile.role, ''), nullif(v_claim.role, ''), 'musician');

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    is_verified,
    verification_status,
    didit_session_id,
    id_verified_at
  )
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(v_existing_profile.full_name, ''),
      split_part(new.email, '@', 1)
    ),
    v_role,
    true,
    'APPROVED',
    coalesce(v_existing_profile.didit_session_id, v_claim.didit_session_id),
    coalesce(v_existing_profile.id_verified_at, new.email_confirmed_at, now())
  )
  on conflict (id) do update
    set email = lower(excluded.email),
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
        role = coalesce(nullif(public.profiles.role, ''), excluded.role),
        is_verified = true,
        verification_status = 'APPROVED',
        didit_session_id = coalesce(public.profiles.didit_session_id, excluded.didit_session_id),
        id_verified_at = coalesce(public.profiles.id_verified_at, excluded.id_verified_at);

  return new;
end;
$$;

drop trigger if exists trg_sync_didit_profile_after_email_confirmation on auth.users;
create trigger trg_sync_didit_profile_after_email_confirmation
after insert or update of email_confirmed_at on auth.users
for each row
execute function public.sync_didit_profile_after_email_confirmation();

revoke all on function public.sync_didit_profile_after_email_confirmation() from public;
revoke all on function public.sync_didit_profile_after_email_confirmation() from anon;
revoke all on function public.sync_didit_profile_after_email_confirmation() from authenticated;

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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(trim(coalesce(p_role, 'musician')));
  v_email text := lower(trim(coalesce(p_normalized_email, '')));
  v_country text := upper(trim(coalesce(p_document_country, 'PHL')));
  v_now timestamptz := now();
  v_matches jsonb := '[]'::jsonb;
  v_duplicate_count integer := 0;
  v_claim_id uuid;
  v_same_email_claim_id uuid;
begin
  if p_user_id is null or nullif(trim(coalesce(p_document_fingerprint, '')), '') is null then
    return jsonb_build_object('decision', 'NO_CLAIM', 'claim_id', null, 'matches', v_matches);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_document_fingerprint || ':' || v_role, 0));

  select c.id
  into v_same_email_claim_id
  from public.identity_document_claims c
  left join public.profiles p on p.id = c.user_id
  where c.document_fingerprint = p_document_fingerprint
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
      'matches', jsonb_build_array(jsonb_build_object('claim_id', v_same_email_claim_id))
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'claim_id', c.id,
    'user_id', c.user_id,
    'original_user_id', c.original_user_id,
    'email', coalesce(c.normalized_email, lower(p.email)),
    'role', c.role,
    'source', c.source,
    'verified_at', c.created_at
  )), '[]'::jsonb)
  into v_matches
  from public.identity_document_claims c
  left join public.profiles p on p.id = c.user_id
  where c.document_fingerprint = p_document_fingerprint
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
      p_document_fingerprint,
      p_document_type,
      p_document_type_key,
      coalesce(nullif(v_country, ''), 'PHL'),
      coalesce(nullif(p_source, ''), 'DIDIT_DUPLICATE'),
      'PENDING_REVIEW',
      p_didit_session_id,
      p_manual_review_id,
      coalesce(p_claim_metadata, '{}'::jsonb) || jsonb_build_object('duplicate_matches', v_matches),
      v_now,
      v_now
    )
    on conflict (user_id, document_fingerprint, role) do update
      set normalized_email = excluded.normalized_email,
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
      'duplicate_count', v_duplicate_count
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
    where c.document_fingerprint = p_document_fingerprint
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id;
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
    p_document_fingerprint,
    p_document_type,
    p_document_type_key,
    coalesce(nullif(v_country, ''), 'PHL'),
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
    'matches', v_matches,
    'duplicate_count', v_duplicate_count,
    'duplicate_override_applied', p_duplicate_override and v_duplicate_count > 0
  );
end;
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

create table if not exists public.registration_attempts (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  email_hash text,
  ip_hash text,
  device_hash text,
  user_id uuid,
  didit_session_id text,
  blocked boolean not null default false,
  success boolean not null default false,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint registration_attempts_action_check
    check (action in ('create_didit_session', 'create_unverified_user', 'manual_identity_review', 'resend_confirmation_email'))
);

alter table public.registration_attempts enable row level security;

drop policy if exists registration_attempts_service_manage on public.registration_attempts;
create policy registration_attempts_service_manage
on public.registration_attempts
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create index if not exists idx_registration_attempts_action_created
  on public.registration_attempts (action, created_at desc);

create index if not exists idx_registration_attempts_email_action_created
  on public.registration_attempts (email_hash, action, created_at desc)
  where email_hash is not null;

create index if not exists idx_registration_attempts_ip_action_created
  on public.registration_attempts (ip_hash, action, created_at desc)
  where ip_hash is not null;

create index if not exists idx_registration_attempts_device_action_created
  on public.registration_attempts (device_hash, action, created_at desc)
  where device_hash is not null;

notify pgrst, 'reload schema';
