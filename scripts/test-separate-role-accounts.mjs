import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("web and mobile signup reject email reuse and same-role identity reuse", async () => {
  for (const workspace of ["web", "mobile"]) {
    const createUser = await read(`${workspace}/supabase/functions/create-unverified-user/index.ts`);
    const manualReview = await read(`${workspace}/supabase/functions/manual-identity-review/index.ts`);

    assert.match(createUser, /Use a different email for a separate account/);
    assert.match(createUser, /duplicateIdentityRejected: true/);
    assert.match(manualReview, /Use a different email for a separate account/);
    assert.match(manualReview, /duplicateIdentityRejected: true/);
    assert.doesNotMatch(createUser, /ROLE_SIGNUP/);
    assert.doesNotMatch(manualReview, /ROLE_SIGNUP/);
    assert.doesNotMatch(createUser, /roleAddedToExistingAccount/);
    assert.doesNotMatch(manualReview, /roleAddedToExistingAccount/);
  }

  const settings = await read("web/app/settings.tsx");
  const authContext = await read("web/src/context/AuthContext.tsx");
  const manageProfile = await read("web/supabase/functions/manage-profile/index.ts");
  assert.doesNotMatch(settings, /Both roles belong to this same email/);
  assert.doesNotMatch(authContext, /switchRole|availableRoles/);
  assert.match(manageProfile, /Role switching is disabled/);
});

test("database keeps one live account role and one approved identity per role", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table auth.users (
        id uuid primary key,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );

      create table public.profiles (
        id uuid primary key,
        role text not null,
        is_verified boolean not null default false,
        verification_status text
      );
      create table public.profile_roles (
        profile_id uuid not null references public.profiles(id) on delete cascade,
        role text not null,
        status text not null default 'ACTIVE',
        source text not null default 'PROFILE',
        activated_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (profile_id, role),
        constraint profile_roles_status_check check (status in ('ACTIVE', 'PENDING_REVIEW', 'DECLINED'))
      );
      create table public.manual_identity_reviews (
        id uuid primary key,
        status text not null,
        duplicate_reason text,
        review_notes text,
        reviewed_at timestamptz,
        updated_at timestamptz not null default now()
      );
      create table public.identity_document_claims (
        id uuid primary key,
        user_id uuid references public.profiles(id),
        role text not null,
        document_fingerprint text,
        status text not null,
        manual_review_id uuid references public.manual_identity_reviews(id),
        claim_metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now()
      );

      insert into public.profiles (id, role, is_verified, verification_status) values
        ('00000000-0000-0000-0000-000000000001', 'fan', true, 'APPROVED'),
        ('00000000-0000-0000-0000-000000000002', 'fan', false, 'PENDING_REVIEW'),
        ('00000000-0000-0000-0000-000000000003', 'musician', true, 'APPROVED');
      insert into public.profile_roles (profile_id, role, status) values
        ('00000000-0000-0000-0000-000000000001', 'fan', 'ACTIVE'),
        ('00000000-0000-0000-0000-000000000001', 'musician', 'PENDING_REVIEW'),
        ('00000000-0000-0000-0000-000000000002', 'fan', 'PENDING_REVIEW');
      insert into auth.users (id, raw_user_meta_data) values
        ('00000000-0000-0000-0000-000000000001', '{"is_verified": true, "verification_status": "APPROVED"}'),
        ('00000000-0000-0000-0000-000000000002', '{"is_verified": false, "verification_status": "PENDING_REVIEW"}'),
        ('00000000-0000-0000-0000-000000000003', '{"is_verified": true, "verification_status": "APPROVED"}');
      insert into public.identity_document_claims
        (id, user_id, role, document_fingerprint, status, created_at)
      values
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'fan', 'same-person', 'APPROVED', '2026-01-01'),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'fan', 'same-person', 'PENDING_REVIEW', '2026-01-02'),
        ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'musician', 'same-person', 'APPROVED', '2026-01-03');
    `);

    const migration = await read("web/supabase/migrations/20260927133000_enforce_separate_role_accounts.sql");
    await db.exec(migration);

    const roles = await db.query(`
      select role, status from public.profile_roles
      where profile_id = '00000000-0000-0000-0000-000000000001'
      order by role
    `);
    assert.deepEqual(roles.rows, [
      { role: "fan", status: "ACTIVE" },
      { role: "musician", status: "REVOKED" },
    ]);

    const claims = await db.query(`
      select role, status from public.identity_document_claims
      where document_fingerprint = 'same-person'
      order by role, created_at
    `);
    assert.deepEqual(claims.rows, [
      { role: "fan", status: "APPROVED" },
      { role: "fan", status: "DECLINED" },
      { role: "musician", status: "APPROVED" },
    ]);

    const rejectedDuplicate = await db.query(`
      select p.verification_status, pr.status as role_status,
             u.raw_user_meta_data ->> 'verification_status' as auth_status
      from public.profiles p
      join public.profile_roles pr on pr.profile_id = p.id and pr.role = p.role
      join auth.users u on u.id = p.id
      where p.id = '00000000-0000-0000-0000-000000000002'
    `);
    assert.deepEqual(rejectedDuplicate.rows, [{
      verification_status: "DECLINED",
      role_status: "DECLINED",
      auth_status: "DECLINED",
    }]);

    await assert.rejects(
      db.exec(`insert into public.profile_roles (profile_id, role, status) values
        ('00000000-0000-0000-0000-000000000001', 'studio-owner', 'ACTIVE')`),
      /idx_profile_roles_one_live_role_per_account/,
    );

    await assert.rejects(
      db.exec(`insert into public.identity_document_claims
        (id, user_id, role, document_fingerprint, status)
        values (
          '10000000-0000-0000-0000-000000000004',
          '00000000-0000-0000-0000-000000000002',
          'fan', 'same-person', 'APPROVED'
        )`),
      /idx_identity_document_claims_approved_fingerprint_role_unique/,
    );

    await assert.rejects(
      db.exec(`update public.identity_document_claims
        set status = 'REVOKED',
            claim_metadata = jsonb_build_object('revoked_by_duplicate_override', true)
        where id = '10000000-0000-0000-0000-000000000001'`),
      /only one account for each role/,
    );

    await assert.rejects(
      db.exec(`update public.profiles set role = 'musician'
        where id = '00000000-0000-0000-0000-000000000001'`),
      /already owns a musician account/,
    );
  } finally {
    await db.close();
  }
});
