-- Enforce separate authentication accounts for every role.
-- profile_roles remains an authorization/history ledger, but an account may
-- have only one live role. Identity ownership remains role-scoped so the same
-- person may own one fan account and one musician account with different email
-- addresses, but may not create two accounts for either role.

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  status text not null default 'ACTIVE',
  source text not null default 'PROFILE',
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, role),
  constraint profile_roles_role_check check (role in ('fan', 'musician', 'studio-owner', 'venue-owner', 'producer', 'admin', 'staff')),
  constraint profile_roles_status_check check (status in ('ACTIVE', 'PENDING_REVIEW', 'DECLINED', 'REVOKED'))
);

alter table public.profile_roles
  drop constraint if exists profile_roles_status_check;
alter table public.profile_roles
  add constraint profile_roles_status_check
  check (status in ('ACTIVE', 'PENDING_REVIEW', 'DECLINED', 'REVOKED'));

update public.profile_roles pr
set
  status = 'REVOKED',
  updated_at = now()
from public.profiles p
where p.id = pr.profile_id
  and pr.status in ('ACTIVE', 'PENDING_REVIEW')
  and pr.role is distinct from p.role;

insert into public.profile_roles (profile_id, role, status, source, activated_at)
select p.id, p.role, 'ACTIVE', 'SEPARATE_ACCOUNT_BACKFILL', now()
from public.profiles p
where p.role is not null
  and (p.is_verified is true or upper(coalesce(p.verification_status, '')) = 'APPROVED')
on conflict (profile_id, role) do nothing;

create unique index if not exists idx_profile_roles_one_live_role_per_account
  on public.profile_roles (profile_id)
  where status in ('ACTIVE', 'PENDING_REVIEW');

with ranked_live_claims as (
  select
    id,
    row_number() over (
      partition by document_fingerprint, role
      order by
        case status when 'APPROVED' then 0 else 1 end,
        created_at asc,
        id asc
    ) as claim_rank
  from public.identity_document_claims
  where document_fingerprint is not null
    and status in ('APPROVED', 'PENDING_REVIEW')
), declined_duplicates as (
  update public.identity_document_claims claim
  set
    status = 'DECLINED',
    claim_metadata = coalesce(claim.claim_metadata, '{}'::jsonb) || jsonb_build_object(
      'automatically_declined_same_role_duplicate', true,
      'automatically_declined_at', now()
    ),
    updated_at = now(),
    last_seen_at = now()
  from ranked_live_claims ranked
  where ranked.id = claim.id
    and ranked.claim_rank > 1
  returning claim.manual_review_id
)
update public.manual_identity_reviews review
set
  status = 'DECLINED',
  duplicate_reason = coalesce(
    review.duplicate_reason,
    'A verified identity may be used by only one account for each role.'
  ),
  review_notes = coalesce(
    review.review_notes,
    'Automatically declined by the separate-account identity policy.'
  ),
  reviewed_at = coalesce(review.reviewed_at, now()),
  updated_at = now()
where review.id in (
  select manual_review_id
  from declined_duplicates
  where manual_review_id is not null
);

update public.profiles profile
set
  is_verified = false,
  verification_status = 'DECLINED'
where exists (
    select 1
    from public.identity_document_claims claim
    where claim.user_id = profile.id
      and claim.role = profile.role
      and claim.status = 'DECLINED'
      and coalesce(claim.claim_metadata ->> 'automatically_declined_same_role_duplicate', 'false') = 'true'
  )
  and not exists (
    select 1
    from public.identity_document_claims approved_claim
    where approved_claim.user_id = profile.id
      and approved_claim.role = profile.role
      and approved_claim.status = 'APPROVED'
  );

update public.profile_roles membership
set status = 'DECLINED', updated_at = now()
from public.profiles profile
where profile.id = membership.profile_id
  and membership.role = profile.role
  and membership.status = 'PENDING_REVIEW'
  and upper(coalesce(profile.verification_status, '')) = 'DECLINED';

update auth.users auth_user
set raw_user_meta_data = coalesce(auth_user.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
  'is_verified', false,
  'verification_status', 'DECLINED'
)
from public.profiles profile
where profile.id = auth_user.id
  and upper(coalesce(profile.verification_status, '')) = 'DECLINED';

create unique index if not exists idx_identity_document_claims_approved_fingerprint_role_unique
  on public.identity_document_claims (document_fingerprint, role)
  where document_fingerprint is not null
    and status = 'APPROVED';

create or replace function public.prevent_same_role_identity_override()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'APPROVED'
    and new.status = 'REVOKED'
    and coalesce(new.claim_metadata ->> 'revoked_by_duplicate_override', 'false') = 'true'
  then
    raise exception 'A verified identity may be used by only one account for each role'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_same_role_identity_override
  on public.identity_document_claims;
create trigger trg_prevent_same_role_identity_override
before update of status, claim_metadata on public.identity_document_claims
for each row execute function public.prevent_same_role_identity_override();

create or replace function public.move_identity_claim_with_account_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role in ('fan', 'musician')
    and old.role is distinct from new.role
  then
    if exists (
      select 1
      from public.identity_document_claims current_claim
      join public.identity_document_claims target_claim
        on target_claim.document_fingerprint = current_claim.document_fingerprint
       and target_claim.role = new.role
       and target_claim.status in ('APPROVED', 'PENDING_REVIEW')
       and target_claim.user_id is distinct from new.id
      where current_claim.user_id = new.id
        and current_claim.role = old.role
        and current_claim.status in ('APPROVED', 'PENDING_REVIEW')
        and current_claim.document_fingerprint is not null
    ) then
      raise exception 'This identity already owns a % account', new.role
        using errcode = '23505';
    end if;

    update public.identity_document_claims
    set role = new.role, updated_at = now(), last_seen_at = now()
    where user_id = new.id
      and role = old.role
      and status in ('APPROVED', 'PENDING_REVIEW');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_move_identity_claim_with_account_role on public.profiles;
create trigger trg_move_identity_claim_with_account_role
before update of role on public.profiles
for each row execute function public.move_identity_claim_with_account_role();

alter table public.profile_roles enable row level security;
drop policy if exists "Users can view their own role memberships" on public.profile_roles;
create policy "Users can view their own role memberships" on public.profile_roles
  for select to authenticated using (profile_id = auth.uid());
revoke all on table public.profile_roles from anon, authenticated;
grant select on table public.profile_roles to authenticated;
grant all on table public.profile_roles to service_role;
