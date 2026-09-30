import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const root of ["web", "mobile"]) {
  test(`${root}: connection applications use the shared registered-member verifier`, () => {
    const service = read(`${root}/supabase/functions/_shared/gigMemberVerificationService.ts`);
    const manager = read(`${root}/supabase/functions/manage-production/index.ts`);
    const groups = read(`${root}/supabase/functions/group-members/index.ts`);
    const worker = read(`${root}/supabase/functions/connection-member-verification/index.ts`);
    const migration = read(`${root}/supabase/migrations/20260930130000_add_connection_member_verification.sql`);
    const rosterMigration = read(`${root}/supabase/migrations/20260930150000_add_connection_application_members.sql`);

    assert.match(service, /from\('booking_requests'\)/);
    assert.match(service, /runConnectionMemberVerification/);
    assert.match(service, /booking_request_id/);
    assert.match(service, /from\('connection_application_members'\)/);
    assert.match(manager, /queueConnectionMemberVerification/);
    assert.match(manager, /snapshotConnectionApplicationMembers/);
    assert.match(manager, /member_verification_consent/);
    assert.match(manager, /attachConnectionMemberVerification/);
    assert.match(groups, /attachConnectionMemberVerification/);
    assert.match(worker, /runConnectionMemberVerification/);
    assert.match(migration, /add column if not exists member_verification_consent/i);
    assert.match(migration, /booking_request_id uuid unique references public\.booking_requests/i);
    assert.match(rosterMigration, /create table if not exists public\.connection_application_members/i);
    assert.match(rosterMigration, /unique \(booking_request_id, user_id\)/i);
  });
}

test("connection application UIs collect consent and show verification results", () => {
  const groupForm = read("mobile/src/components/listingDetails/GigApplyTab.tsx");
  const groupSubmission = read("mobile/src/hooks/useApplicationSubmissionAction.ts");
  const productionForm = read("mobile/src/components/ProductionTeamDetailsSheet.tsx");
  const review = read("mobile/src/components/ConnectionApplicantReview.tsx");
  const details = read("mobile/src/components/ConnectionApplicantDetailsModal.tsx");

  assert.match(groupForm, /registered member verification/i);
  assert.match(groupForm, /setMemberVerificationConsent\(accepted\)/);
  assert.match(groupSubmission, /member_verification_consent:\s*memberVerificationConsent/);
  assert.match(productionForm, /Registered member verification \*/);
  assert.match(productionForm, /useState\(true\)/);
  assert.match(productionForm, /every registered member represented by this group application/i);
  assert.match(productionForm, /member_verification_consent:\s*memberVerificationConsent/);
  assert.match(review, /Registered member:/);
  assert.match(details, /Registered Member Verification/);
  assert.match(details, /does not use a government ID/i);
});
