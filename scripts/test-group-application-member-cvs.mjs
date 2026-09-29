import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

for (const app of ["mobile", "web"]) {
  test(`${app}: group applications collect one private CV per member`, async () => {
    const [migration, backend, review, submission, notificationNavigation, taskList, screen] = await Promise.all([
      read(`../${app}/supabase/migrations/20260928150000_add_group_application_member_cvs.sql`),
      read(`../${app}/supabase/functions/gig-applications/index.ts`),
      read(`../${app}/supabase/functions/_shared/gigPortfolioReview.ts`),
      read(`../${app}/src/hooks/useApplicationSubmissionAction.ts`),
      read(`../${app}/src/utils/notificationNavigation.ts`),
      read(`../${app}/src/components/GroupApplicationCvTaskList.tsx`),
      read(`../${app}/app/group_application_cv.tsx`),
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

    assert.match(review, /gig-portfolio-v17-split-workers/);
    assert.match(review, /from\('gig_application_members'\)/);
    assert.match(review, /member_cv_reviews/);
    assert.match(review, /Member did not authorize optional AI review/);

    assert.match(submission, /submit_group_gig_application/);
    assert.match(submission, /bucket: "application-cvs"/);
    assert.match(notificationNavigation, /group_application_member_cv_required/);
    assert.match(taskList, /Group application tasks/);
    assert.match(screen, /Send Complete Application/);
    assert.match(screen, /Allow Gemini to review my CV/);
  });
}
