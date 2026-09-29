import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const pairedFunctions = [
  "manage-bookings",
  "manage-details",
  "manage-listings",
  "manage-production",
  "gig-applications",
];

test("JWT identity is verified instead of decoded", async () => {
  const files = await Promise.all([
    read("web/supabase/functions/admin-users-management/index.ts"),
    read("web/supabase/functions/manage-listings/index.ts"),
    read("mobile/supabase/functions/manage-listings/index.ts"),
  ]);

  for (const source of files) {
    assert.match(source, /auth\.getUser\(/);
    assert.doesNotMatch(source, /decodeJwtPayload|extractUserIdFromJwt/);
  }
});

test("web and mobile authorization paths contain the same defenses", async () => {
  for (const functionName of pairedFunctions) {
    const [web, mobile] = await Promise.all([
      read(`web/supabase/functions/${functionName}/index.ts`),
      read(`mobile/supabase/functions/${functionName}/index.ts`),
    ]);

    if (functionName === "manage-bookings") {
      for (const source of [web, mobile]) {
        assert.match(source, /Reviews are available only after .* completed/);
        assert.match(source, /author_id: actorId/);
        assert.match(source, /organizerTransitions/);
        assert.match(source, /\.eq\("status", expectedPreviousStatus\)/);
      }
    }

    if (functionName === "manage-details") {
      assert.match(web, /Listing reviews are retired/);
      assert.match(mobile, /Listing reviews are retired/);
    }

    if (functionName === "manage-listings") {
      for (const source of [web, mobile]) {
        assert.match(source, /retiredManagementActions/);
        assert.match(source, /applicant_id: authenticatedUserId/);
        assert.match(source, /supabaseAuthClient\.rpc\('update_gig_safely'/);
      }
    }

    if (functionName === "manage-production") {
      assert.match(web, /hasProductionApplicationConflict/);
      assert.match(mobile, /hasProductionApplicationConflict/);
      assert.match(web, /rpc\("is_active_staff"/);
      assert.match(mobile, /rpc\("is_active_staff"/);
    }

    if (functionName === "gig-applications") {
      for (const source of [web, mobile]) {
        assert.match(source, /hasApplicationActorConflict/);
        assert.match(source, /organizerTransitions/);
        assert.match(source, /currentProfileRole === 'venue-owner'/);
      }
    }
  }
});

test("database migration enforces active roles, booking-linked reviews, and locked decisions", async () => {
  const migration = await read(
    "web/supabase/migrations/20260927010000_harden_cross_role_authorization.sql",
  );

  for (const marker of [
    "SECURITY_MIGRATION_BACKFILL",
    "public.is_active_staff",
    "public.admin_transition_user_role",
    "trg_prevent_role_change_with_owned_entities",
    "public.assert_gig_application_manager_decision",
    "public.accept_gig_application_safely",
    "public.validate_review_booking_link",
    "trg_enforce_customer_studio_booking_update",
    "reviews_author_studio_booking_unique",
    "reviews_author_gig_application_unique",
  ]) {
    assert.ok(migration.includes(marker), `missing migration defense: ${marker}`);
  }

  assert.match(
    migration,
    /p\.is_verified is true\s+and p\.verification_status = 'APPROVED'/,
  );
});

test("admin role changes use the transactional database transition", async () => {
  const source = await read("web/supabase/functions/admin-users-management/index.ts");
  assert.match(source, /rpc\("admin_transition_user_role"/);
  assert.match(source, /Administrators cannot review their own identity submission/);
  assert.doesNotMatch(source, /role_transition_audit/);
});

test("staff production conflicts are hidden or resolved through the guarded admin RPC", async () => {
  const [adminSource, adminUi, migration] = await Promise.all([
    read("web/supabase/functions/admin-users-management/index.ts"),
    read("web/app/admin/users.tsx"),
    read("web/supabase/migrations/20260927124500_admin_resolve_staff_production_conflict.sql"),
  ]);

  assert.match(adminSource, /hidden_owned_ids/);
  assert.match(adminSource, /resolve_staff_production_conflict/);
  assert.match(adminSource, /rpc\("admin_resolve_staff_production_conflict"/);
  assert.match(adminUi, /Resolve participation conflict\?/);
  assert.match(adminUi, /Listings this user owns are hidden/);
  assert.match(migration, /auth\.jwt\(\) ->> 'role'.*service_role/);
  assert.match(migration, /join public\.gig_applications ga on ga\.production_roster_id = ptr\.id/);
  assert.match(migration, /revoke all on function public\.admin_resolve_staff_production_conflict/);
  assert.match(migration, /grant execute on function public\.admin_resolve_staff_production_conflict[\s\S]*to service_role/);
});

test("signup remains mobile-only and uses the guarded signup function", async () => {
  await assert.rejects(
    read("web/app/signup.tsx"),
    (error) => error?.code === "ENOENT",
  );

  const [source, signupFunction] = await Promise.all([
    read("mobile/app/signup.tsx"),
    read("mobile/supabase/functions/create-unverified-user/index.ts"),
  ]);
  assert.match(source, /functions\.invoke\('create-unverified-user'/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|auth\.admin\.createUser/);
  assert.match(signupFunction, /enforceRegistrationRateLimit/);
  assert.match(signupFunction, /allowedSignupRoles\.has/);
  assert.match(signupFunction, /Didit verification is not approved yet/);
  assert.match(signupFunction, /auth\.admin\.createUser/);
});
