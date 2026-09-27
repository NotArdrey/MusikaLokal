import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const root of ["mobile", "web"]) {
  test(`${root} add and edit gig keep AI Match Review visible and persisted`, () => {
    const addGig = read(`${root}/app/add_gig.tsx`);
    const editGig = read(`${root}/app/edit_gig.tsx`);

    for (const source of [addGig, editGig]) {
      assert.match(source, /<GigRecommendationSettings/);
      assert.match(source, /value=\{aiRecommendationSettings\}/);
      assert.match(source, /onChange=\{setAiRecommendationSettings\}/);
      assert.match(source, /ai_recommendation_settings:\s*aiRecommendationSettings/);
    }
    assert.match(editGig, /normalizeGigRecommendationSettings\(data\.requirements\?\.ai_recommendation_settings\)/);
  });

  test(`${root} gig review never performs identity or profile photo matching`, () => {
    const review = read(`${root}/supabase/functions/_shared/gigPortfolioReview.ts`);
    const applications = read(`${root}/supabase/functions/gig-applications/index.ts`);

    assert.match(review, /gig-portfolio-v11-flexible-cv-ingestion/);
    assert.doesNotMatch(review, /faceRecognitionClient|identityDocumentReference|FACEPP_|face_similarity|group_face_similarity/);
    assert.doesNotMatch(applications, /identity_document_review|face_similarity|group_face_similarity/);
  });

  test(`${root} application submission and review UI exclude approved IDs and face results`, () => {
    const submission = read(`${root}/src/hooks/useApplicationSubmissionAction.ts`);
    const terms = read(`${root}/src/components/listingDetails/GigApplyTab.tsx`);
    const reviewUi = root === "mobile"
      ? read("mobile/src/components/ApplicantDetailsModal.tsx")
      : read("web/app/manage_gig.tsx");

    assert.doesNotMatch(submission, /identity_document_review_consent/);
    assert.match(terms, /Identity documents and profile photos are not used for application-video matching/);
    assert.doesNotMatch(reviewUi, /Approved ID & Video Check|Face\+\+ video match|identity_document_review|face_similarity|group_face_similarity/);
  });

  test(`${root} review frames are prepared with video upload but used only after consent`, () => {
    const applyTab = read(`${root}/src/components/listingDetails/GigApplyTab.tsx`);
    const submission = read(`${root}/src/hooks/useApplicationSubmissionAction.ts`);
    const uploader = read(`${root}/src/components/VideoUploader.tsx`);

    assert.match(applyTab, /enableReviewFrame=\{isAiMatchReviewEnabled\}/);
    assert.doesNotMatch(applyTab, /enableReviewFrame=\{[^}\n]*aiPortfolioReviewConsent/);
    assert.match(uploader, /Uploading video\.\.\.[\s\S]*Preparing performance evidence for AI Match Review/);
    assert.match(submission, /ai_review_frame_url:\s*aiPortfolioReviewConsent\s*\?\s*videoReviewFrameUrl\s*\|\|\s*null\s*:\s*null/);
    assert.match(submission, /if \(data\?\.id && aiPortfolioReviewConsent\)/);
  });

  test(`${root} removal migration drops face-review data and consent columns`, () => {
    const migration = read(`${root}/supabase/migrations/20260927180000_remove_gig_identity_video_matching.sql`);

    for (const column of [
      "identity_document_review_consent",
      "identity_document_review_consented_at",
      "ai_review_group_member_ids",
      "face_similarity",
      "group_face_similarity",
    ]) {
      assert.match(migration, new RegExp(`drop column if exists ${column}`, "i"));
    }
    assert.match(migration, /drop function if exists public\.snapshot_gig_ai_review_group_members\(\)/i);
  });
}

test("repository no longer configures the retired face comparison provider", () => {
  assert.doesNotMatch(read("README.md"), /FACEPP_API_KEY|approved ID and original performance video/i);
  assert.doesNotMatch(read("mobile/.env.example"), /FACEPP_|FACE_GROUP_MAX_MEMBERS/);
  assert.doesNotMatch(read("package.json"), /benchmark:face/);
});
