import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const target of ["web", "mobile"]) {
  test(`${target}: CV, video, and member verification use separate durable workers`, () => {
    const review = read(`${target}/supabase/functions/_shared/gigPortfolioReview.ts`);
    const dispatch = read(`${target}/supabase/functions/_shared/gigReviewWorkerDispatch.ts`);
    const memberVerification = read(`${target}/supabase/functions/_shared/gigMemberVerificationService.ts`);
    const migration = read(`${target}/supabase/migrations/20260929010000_split_gig_application_review_workers.sql`);
    const config = read(`${target}/supabase/config.toml`);

    assert.match(review, /export async function runGigCvReview/);
    assert.match(review, /export async function runGigVideoReview/);
    assert.match(review, /cv_status: 'queued'/);
    assert.match(review, /video_status: 'queued'/);
    assert.match(review, /scheduleGigReviewWorkers/);
    assert.match(dispatch, /'gig-cv-review'/);
    assert.match(dispatch, /'gig-video-review'/);
    assert.match(dispatch, /'gig-member-verification'/);
    assert.match(memberVerification, /scheduleGigMemberVerificationWorker/);

    for (const component of ["cv", "video"]) {
      assert.match(migration, new RegExp(`add column if not exists ${component}_status`));
      assert.match(migration, new RegExp(`add column if not exists ${component}_result`));
    }
    for (const worker of ["gig-cv-review", "gig-video-review", "gig-member-verification"]) {
      const endpoint = read(`${target}/supabase/functions/${worker}/index.ts`);
      assert.match(endpoint, /handleInternalGigWorker/);
      assert.match(config, new RegExp(`\\[functions\\.${worker}\\]\\s+verify_jwt = false`));
    }
    const workerHandler = read(`${target}/supabase/functions/_shared/internalGigWorker.ts`);
    assert.match(workerHandler, /edgeRuntime\.waitUntil\(work\)/);
    assert.match(workerHandler, /status: 202/);
  });

  test(`${target}: queued component work can be dispatched again without re-queuing completed work`, () => {
    const applications = read(`${target}/supabase/functions/gig-applications/index.ts`);
    assert.match(applications, /shouldResumeQueuedReview/);
    assert.match(applications, /reviewData\?\.cv_status/);
    assert.match(applications, /reviewData\?\.video_status/);
    assert.match(applications, /verificationPollIsDue/);
  });
}

test("application review UI exposes completed CV evidence while video continues", () => {
  const mobileDetails = read("mobile/src/components/ApplicantDetailsModal.tsx");
  const webManager = read("web/app/manage_gig.tsx");
  assert.match(mobileDetails, /cvProcessingStatus === "reviewed"/);
  assert.match(mobileDetails, /includes\(cvProcessingStatus\)/);
  assert.match(webManager, /CV review is still processing\./);
  assert.match(webManager, /Performance-video review is still processing\./);
});
