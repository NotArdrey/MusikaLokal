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

    assert.match(review, /gig-portfolio-v17-split-workers/);
    assert.doesNotMatch(review, /faceRecognitionClient|identityDocumentReference|FACEPP_|face_similarity|group_face_similarity/);
    assert.doesNotMatch(applications, /identity_document_review|face_similarity|group_face_similarity/);
  });

  test(`${root} registered member verification is separate from legacy identity review`, () => {
    const submission = read(`${root}/src/hooks/useApplicationSubmissionAction.ts`);
    const terms = read(`${root}/src/components/listingDetails/GigApplyTab.tsx`);
    const fullTerms = read(`${root}/app/terms_and_conditions.tsx`);
    const reviewUi = root === "mobile"
      ? read("mobile/src/components/ApplicantDetailsModal.tsx")
      : read("web/app/manage_gig.tsx");

    assert.doesNotMatch(submission, /identity_document_review_consent/);
    assert.match(terms, /General AI Match Review does not perform identity matching/);
    assert.match(terms, /including AI Match Review and registered member verification/);
    assert.match(terms, /government identity documents are never used/i);
    assert.match(terms, /setMemberVerificationConsent\(accepted\)/);
    assert.doesNotMatch(terms, /Allow MusikaLokal to compare your registered profile\/reference photo/);
    assert.match(fullTerms, /compare registered profile or reference photos with faces in the submitted performance video/);
    assert.match(submission, /member_verification_consent:\s*memberVerificationConsent/);
    assert.match(submission, /action:\s*"request_member_verification"/);
    assert.doesNotMatch(reviewUi, /Approved ID & Video Check|Face\+\+ video match|identity_document_review|face_similarity|group_face_similarity/);
    assert.match(reviewUi, /Registered [Mm]ember [Vv]erification/);
    assert.match(reviewUi, /does not change the match score/);
    assert.match(reviewUi, /Match to gig requirements/);
    assert.doesNotMatch(reviewUi, /CV match:/);
    assert.match(reviewUi, /Major verification issue/);
    assert.match(reviewUi, /Important verification needed/);
    assert.match(reviewUi, /Requirements not met/);
    assert.match(reviewUi, /Couldn't confirm/);
    assert.match(reviewUi, /Performance video submitted/);
    assert.match(reviewUi, /Couldn't confirm from CV/);
  });

  test(`${root} CV name mismatch is a verification gate and does not alter the fit score`, () => {
    const applications = read(`${root}/supabase/functions/gig-applications/index.ts`);
    const migration = read(`${root}/supabase/migrations/20260928120000_add_gig_recommendation_needs_review_status.sql`);

    assert.match(applications, /gig-fit-v11-submitted-media-state/);
    assert.match(applications, /verificationStatus === 'needs_verification'[\s\S]*\? 'needs_review'/);
    assert.match(applications, /fit_recommendation_status:\s*fitRecommendationStatus/);
    assert.match(applications, /identity_status:\s*verificationStatus/);
    assert.match(applications, /mediaSubmitted[\s\S]*A performance video was submitted/);
    assert.match(applications, /score,[\s\S]*recommendation_status:\s*recommendationStatus/);
    assert.match(migration, /needs_review/i);
  });

  test(`${root} deterministic scoring weights, denominator, gates, and coordinate distance stay unchanged`, () => {
    const applications = read(`${root}/supabase/functions/gig-applications/index.ts`);

    assert.match(applications, /'instruments',[\s\S]*30,[\s\S]*expected\.instruments/);
    assert.match(applications, /'genres',[\s\S]*25,[\s\S]*expected\.genres/);
    assert.match(applications, /possiblePoints \+= 10[\s\S]*distanceKm <= Number\(settings\.location_radius_km\)/);
    assert.match(applications, /possiblePoints \+= 15/);
    assert.match(applications, /Math\.round\(\(earnedPoints \/ possiblePoints\) \* 100\)/);
    assert.match(applications, /mode === 'ignore' \|\| expectedValues\.length === 0/);
    assert.match(applications, /mode === 'required'[\s\S]*missingRequired = true/);
    assert.match(applications, /haversineDistanceKm\(gigCoordinates, performer\.coordinates\)/);
    assert.match(applications, /hasPortfolio:\s*Boolean\(application\?\.video_url\)/);
  });

  test(`${root} a submitted-video provider failure remains technical and routes required evidence to review`, () => {
    const applications = read(`${root}/supabase/functions/gig-applications/index.ts`);
    const reviewUi = root === "mobile"
      ? read("mobile/src/components/ApplicantDetailsModal.tsx")
      : read("web/app/manage_gig.tsx");

    assert.match(applications, /videoProcessingStatus === 'processing_failed'/);
    assert.match(applications, /Automatic video review was unavailable\. The match score is unchanged/);
    assert.match(applications, /technicalReviewNeedsManualDecision[\s\S]*\? 'needs_review'/);
    assert.match(reviewUi, /Automatic review unavailable/);
    assert.match(reviewUi, /performance video was submitted successfully[\s\S]*Review (?:it|the video) manually/i);
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

  test(`${root} Gemini review is consent-gated, direct-video, and has the configured Flash fallback`, () => {
    const review = read(`${root}/supabase/functions/_shared/gigPortfolioReview.ts`);
    const consentCheck = review.indexOf("application.ai_portfolio_review_consent !== true");
    const missingKeyCheck = review.indexOf("!geminiApiKey", consentCheck);

    assert.ok(consentCheck >= 0 && missingKeyCheck > consentCheck, "consent must be checked before provider use");
    assert.match(review, /GEMINI_MODEL[\s\S]*gemini-3\.5-flash-lite/);
    assert.match(review, /GEMINI_FALLBACK_MODEL[\s\S]*gemini-3\.5-flash/);
    assert.match(review, /GEMINI_ENABLE_FALLBACK/);
    assert.match(review, /thinkingConfig:\s*\{ thinkingLevel: 'minimal' \}/);
    assert.match(review, /maxOutputTokens:\s*2_048/);
    assert.match(review, /upload\/v1beta\/files/);
    assert.match(review, /video_file_status/);
    assert.match(review, /video_file_delete/);
    assert.match(review, /video_processing_status/);
    assert.match(review, /processing_failed/);
    assert.match(review, /GIG_AI_REVIEW_PROVIDER[\s\S]*groq/);
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

  test(`${root} member verification has dedicated consent, storage, async AWS calls, and score-independent gating`, () => {
    const service = read(`${root}/supabase/functions/_shared/gigMemberVerificationService.ts`);
    const applications = read(`${root}/supabase/functions/gig-applications/index.ts`);
    const migration = read(`${root}/supabase/migrations/20260928170000_add_gig_member_verification.sql`);
    const groupMemberScreen = read(`${root}/app/group_application_cv.tsx`);

    assert.match(migration, /member_verification_consent/i);
    assert.match(migration, /create table if not exists public\.member_verification_reference_faces/i);
    assert.match(migration, /create table if not exists public\.gig_application_member_verifications/i);
    assert.match(migration, /create table if not exists public\.gig_application_member_verification_results/i);
    assert.doesNotMatch(migration, /identity_document/i);
    assert.match(groupMemberScreen, /memberVerificationConsent/);
    assert.match(applications, /request_member_verification/);
    assert.match(service, /IndexFacesCommand/);
    assert.match(service, /StartFaceSearchCommand/);
    assert.match(service, /GetFaceSearchCommand/);
    assert.match(service, /HeadObjectCommand/);
    assert.match(service, /ClientRequestToken/);
    assert.match(service, /NextToken/);
    assert.match(service, /roster_snapshot:\s*references\.map/);
    assert.match(service, /MEMBER_VERIFICATION_ALLOWED_MEDIA_HOSTS/);
    assert.match(service, /redirect:\s*'manual'/);
    assert.match(service, /recommendation_status:\s*'needs_review'/);
    assert.doesNotMatch(service, /score\s*:/);
  });
}

test("repository no longer configures the retired face comparison provider", () => {
  assert.doesNotMatch(read("README.md"), /FACEPP_API_KEY|approved ID and original performance video/i);
  assert.doesNotMatch(read("mobile/.env.example"), /FACEPP_|FACE_GROUP_MAX_MEMBERS/);
  assert.doesNotMatch(read("package.json"), /benchmark:face/);
});

test("mobile applicant review polling refreshes silently without reopening the loading state", () => {
  const modal = read("mobile/src/components/ApplicantDetailsModal.tsx");
  const manageGig = read("mobile/app/manage_gig.tsx");
  const bookings = read("mobile/app/(tabs)/bookings.tsx");

  assert.match(modal, /retryRef\.current\(\{ silent: true \}\)/);
  assert.match(manageGig, /onRetry=\{\(options\) => selectedApplicantSummary && loadApplicantDetails\(selectedApplicantSummary, options\)\}/);
  assert.match(bookings, /loadApplicantDetails\(selectedApplicantSummary, options\)/);
});
