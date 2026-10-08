import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const reviewDeclaration = (path, name, scope = {}) => {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(declaration, `${name} must exist in ${path}`);
  const compiled = ts.transpileModule(`(${declaration.initializer.getText(source)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return vm.runInNewContext(compiled, scope);
};

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
  assert.match(details, /member ID photos matched people in the video/i);
  assert.match(details, /Each profile matched the same person as that member's ID/i);
  assert.match(details, /full ID is hidden/i);
  assert.match(details, /Government ID photo/);
  assert.match(details, /reference_portrait_url/);
  assert.match(details, /profile_photo_url/);
  assert.match(details, /Profile photo in video/);
  assert.match(details, /No match: profile matched another member in the video/);
  assert.match(details, /No match: profile and ID matched different people in the video/);
  assert.match(details, /Needs review: No clear match found for this member in the video/);
});

test("gig, group, and production reviews describe the video comparisons", () => {
  const gigDetails = read("mobile/src/components/ApplicantDetailsModal.tsx");
  const connectionDetails = read("mobile/src/components/ConnectionApplicantDetailsModal.tsx");

  for (const details of [gigDetails, connectionDetails]) {
    assert.match(details, /Profile photo in video/);
    assert.match(details, /Confirmed: Match found for this member in the video/);
    assert.match(details, /No match: profile matched another member in the video/);
    assert.match(details, /No match: profile and ID matched different people in the video/);
    assert.match(details, /Needs review: No clear match found for this member in the video/);
    assert.match(details, /Government ID photo/);
    assert.match(details, /Not confirmed/);
    assert.doesNotMatch(details, /The ID match stays recorded/);
    assert.doesNotMatch(details, /Profile-to-video/);
    assert.doesNotMatch(details, /secondary result never overrides/i);
  }
});

for (const component of ["ApplicantDetailsModal", "ConnectionApplicantDetailsModal"]) {
  const profileMeta = reviewDeclaration(`mobile/src/components/${component}.tsx`, "profileVerificationMeta");

  test(`${component}: a profile not matched in the video needs review regardless of the ID result`, () => {
    for (const status of ["needs_review", "verified"]) {
      const finding = profileMeta({ status, profile_status: "needs_review", profile_issue_code: "not_found_in_video" });
      assert.equal(finding.tone, "review");
      assert.equal(finding.color, "#D97706");
      assert.equal(finding.label, status === "verified"
        ? "Needs review: No clear match found for the profile photo in the video."
        : "Needs review: No clear match found for this member in the video.");
    }
  });

  test(`${component}: a profile match cannot confirm identity when the ID was not matched`, () => {
    const finding = profileMeta({ status: "needs_review", profile_status: "needs_review", profile_issue_code: "identity_not_confirmed" });
    assert.equal(finding.tone, "review");
    assert.equal(finding.label, "Needs review: No clear match found for this member in the video.");
  });

  test(`${component}: confirmed matches stay green and matches to different video people stay red`, () => {
    const confirmed = profileMeta({ status: "verified", profile_status: "verified" });
    assert.equal(confirmed.tone, "match");
    assert.equal(confirmed.label, "Confirmed: Match found for this member in the video.");
    for (const profile_issue_code of ["matches_another_member", "different_video_person"]) {
      const finding = profileMeta({ status: "verified", profile_status: "mismatch", profile_issue_code });
      assert.equal(finding.tone, "mismatch");
      assert.equal(finding.color, "#DC2626");
      assert.match(finding.label, /video/);
    }
  });
}

test("compact connection review distinguishes an unconfirmed profile from a different video person", () => {
  const path = "mobile/src/components/ConnectionApplicantReview.tsx";
  for (const [profile_status, profile_issue_code, expected] of [
    ["needs_review", "not_found_in_video", false],
    ["needs_review", "identity_not_confirmed", false],
    ["mismatch", "different_video_person", true],
    ["mismatch", "matches_another_member", true],
  ]) {
    assert.equal(reviewDeclaration(path, "hasProfileMismatch", {
      usesDualReference: true,
      verificationMembers: [{ profile_status, profile_issue_code }],
    }), expected);
  }
});
