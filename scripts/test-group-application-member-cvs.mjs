import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

for (const app of ["mobile", "web"]) {
  test(`${app}: group applications collect one private CV per member`, async () => {
    const [migration, backend, review, memberVerification, submission, notificationNavigation, taskList, screen, bookings, bookingDetails] = await Promise.all([
      read(`../${app}/supabase/migrations/20260928150000_add_group_application_member_cvs.sql`),
      read(`../${app}/supabase/functions/gig-applications/index.ts`),
      read(`../${app}/supabase/functions/_shared/gigPortfolioReview.ts`),
      read(`../${app}/supabase/functions/_shared/gigMemberVerificationService.ts`),
      read(`../${app}/src/hooks/useApplicationSubmissionAction.ts`),
      read(`../${app}/src/utils/notificationNavigation.ts`),
      read(`../${app}/src/components/GroupApplicationCvTaskList.tsx`),
      app === "mobile" ? read(`../${app}/src/components/GroupApplicationCvForm.tsx`) : Promise.resolve(""),
      app === "mobile" ? read(`../${app}/app/(tabs)/bookings.tsx`) : Promise.resolve(""),
      app === "mobile" ? read(`../${app}/src/components/BookingDetailsSheet.tsx`) : Promise.resolve(""),
    ]);

    assert.match(migration, /create table if not exists public\.gig_application_members/i);
    assert.match(migration, /'application-cvs'[\s\S]*false/i);
    assert.match(migration, /member_cv_status in \('not_required', 'collecting', 'ready', 'complete'\)/i);
    assert.match(migration, /Gig organizers can view applications[\s\S]*member_cv_status in \('not_required', 'complete'\)/i);

    assert.match(backend, /action === 'submit_group_gig_application'/);
    assert.match(backend, /action === 'fetch_member_cv_tasks'/);
    assert.match(backend, /action === 'submit_member_cv'/);
    assert.match(backend, /action === 'finalize_group_application'/);
    assert.match(backend, /Every group member must submit a CV/);
    assert.match(backend, /createSignedUrl\(member\.cv_storage_path, 15 \* 60\)/);
    assert.match(backend, /\.in\('member_cv_status', ORGANIZER_VISIBLE_MEMBER_CV_STATUSES\)/);

    assert.match(review, /gig-portfolio-v18-member-cv-video-evidence/);
    assert.match(review, /from\('gig_application_members'\)/);
    assert.match(review, /member_cv_reviews/);
    assert.match(review, /Member did not authorize optional AI review/);

    assert.match(memberVerification, /if \(application\.group_id\)/);
    assert.match(memberVerification, /from\('gig_application_members'\)/);
    assert.match(memberVerification, /\.eq\('application_id', application\.id\)/);
    assert.match(memberVerification, /expected_member_count: roster\.length/);
    assert.match(memberVerification, /roster\.every\(\(member\) => Boolean\(member\.consented_at\)\)/);

    assert.match(submission, /submit_group_gig_application/);
    assert.match(submission, /bucket: "application-cvs"/);
    assert.match(notificationNavigation, /group_application_member_cv_required/);
    assert.match(taskList, /Group application tasks/);
    if (app === "mobile") {
      assert.match(screen, /Send Application/);
      assert.match(screen, /aiReviewConsent: true/);
      assert.match(screen, /memberVerificationConsent: true/);
      assert.doesNotMatch(screen, /accessibilityRole="checkbox"/);
      assert.doesNotMatch(screen, /Back to Bookings/);
      assert.doesNotMatch(bookings, /<GroupApplicationCvTaskList/);
      assert.match(bookings, /getGroupApplicationCvStatusLabel/);
      assert.match(bookings, /member CVs submitted/);
      assert.match(bookings, /\bWithdraw\b/);
      assert.doesNotMatch(bookingDetails, /name="arrow-down"/);
      assert.match(bookingDetails, /!isGig \? \([\s\S]*<CachedImage/);
    }
  });
}
