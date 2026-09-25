import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const clientModule = await import(new URL(
  "../mobile/supabase/functions/_shared/faceRecognitionClient.ts",
  import.meta.url,
));

const portfolioReviewPaths = [
  "../mobile/supabase/functions/_shared/gigPortfolioReview.ts",
  "../web/supabase/functions/_shared/gigPortfolioReview.ts",
];

function loadPortfolioReviewHarness() {
  const source = readFileSync(new URL(portfolioReviewPaths[0], import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const faceCalls = [];
  const faceResult = {
    status: "likely_same_person",
    confidence: 91.5,
    similarity: 0.915,
    distance: null,
    threshold: 80,
    threshold_tier: "1e-5",
    summary: "Face++ matched 2 of 3 clear representative video frames.",
    frames_compared: 3,
    sampled_frames: 3,
    usable_frames: 3,
    matched_frames: 2,
    match_rate: 2 / 3,
    no_face_frames: 0,
    multiple_people_frames: 0,
    processing_failure_frames: 0,
    provider: "faceplusplus_compare",
    model: "Face++ Compare API",
    aggregation_strategy: "two_frame_consensus_or_single_clear_frame",
    frames: [],
    limitation: "",
    error: null,
  };
  const unavailableFaceMatch = (summary, limitation = "", error = null) => ({
    ...faceResult,
    status: "not_run",
    summary,
    limitation,
    error,
    frames_compared: 0,
    sampled_frames: 0,
    usable_frames: 0,
    matched_frames: 0,
    match_rate: 0,
  });
  const context = vm.createContext({
    exports,
    console: { log() {}, warn() {}, error() {} },
    URL,
    fetch: async (_url, init) => {
      const request = JSON.parse(init.body);
      const system = String(request.messages?.[0]?.content || "");
      const payload = system.includes("advisory evidence extraction")
        ? { summary: "Fixture review", criteria: [], cv_criteria: [], limitations: [] }
        : { observations: [{ image_index: 0, observation: "Visible performer", confidence: 0.9 }] };
      return Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] });
    },
    FormData,
    Blob,
    Response,
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    AbortSignal,
    setTimeout,
    clearTimeout,
    Deno: {
      env: {
        get: (key) => ({
          GROQ_API_KEY: "groq-fixture",
          FACEPP_API_KEY: "facepp-key",
          FACEPP_API_SECRET: "facepp-secret",
          FACEPP_THRESHOLD_TIER: "1e-5",
        })[key],
      },
    },
    require: (specifier) => {
      if (!String(specifier).includes("faceRecognitionClient")) throw new Error(`Unexpected import: ${specifier}`);
      return {
        unavailableFaceMatch,
        compareApplicantFacesWithFacePlusPlus: async (subjects, frames, options) => {
          faceCalls.push({ subjects, frames, options });
          return new Map(subjects.map((subject) => [subject.id, faceResult]));
        },
      };
    },
  });
  vm.runInContext(javascript, context);
  return { exports, faceCalls, faceResult };
}

function mockReviewClient() {
  const application = {
    id: "application-1",
    gig_id: "gig-1",
    applicant_id: "profile-1",
    submitted_by_user_id: "profile-1",
    group_id: null,
    production_roster_id: null,
    slot_type: "solo",
    cv_url: null,
    video_url: null,
    ai_review_frame_url: "https://fixture.supabase.co/storage/v1/object/public/applications/frame-1.jpg",
    ai_review_frame_urls: [
      "https://fixture.supabase.co/storage/v1/object/public/applications/frame-1.jpg",
      "https://fixture.supabase.co/storage/v1/object/public/applications/frame-2.jpg",
      "https://fixture.supabase.co/storage/v1/object/public/applications/frame-3.jpg",
    ],
    ai_review_group_member_ids: [],
    ai_portfolio_review_consent: true,
    ai_portfolio_review_consented_at: "2026-09-23T00:00:00.000Z",
    video_copyright_status: "not_found",
    video_copyright_review_id: null,
    video_copyright_metadata: {},
  };
  const rows = {
    gig_applications: [application],
    gigs: [{ id: "gig-1", name: "Fixture Gig", description: "", location: "Bulacan" }],
    gig_requirements: [],
    profiles: [{ id: "profile-1", full_name: "Fixture Artist", bio: "", location: "Bulacan", avatar_url: "https://fixture.supabase.co/storage/v1/object/public/avatars/profile.jpg" }],
    profile_skills: [],
    profile_genres: [],
    profile_portfolio_urls: [],
  };
  const upserts = [];
  const updates = [];

  class Query {
    constructor(table) { this.table = table; this.filters = []; }
    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    in(key, values) { this.filters.push([key, values]); return this; }
    order() { return this; }
    result() {
      let data = rows[this.table] || [];
      for (const [key, value] of this.filters) {
        data = Array.isArray(value) ? data.filter((row) => value.includes(row[key])) : data.filter((row) => row[key] === value);
      }
      return { data, error: null };
    }
    async maybeSingle() { return { data: this.result().data[0] || null, error: null }; }
    then(resolve, reject) { return Promise.resolve(this.result()).then(resolve, reject); }
    async upsert(payload) { upserts.push({ table: this.table, payload }); return { error: null }; }
    update(payload) {
      updates.push({ table: this.table, payload });
      return { eq: async () => ({ error: null }) };
    }
  }
  return { client: { from: (table) => new Query(table) }, upserts, updates };
}

function loadRecommendationHarness() {
  const source = readFileSync(new URL(
    "../mobile/supabase/functions/gig-applications/index.ts",
    import.meta.url,
  ), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const imported = new Proxy({}, { get: () => () => ({}) });
  const context = vm.createContext({
    exports,
    console: { log() {}, warn() {}, error() {} },
    URL,
    Response,
    Request,
    Headers,
    fetch,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    Deno: { env: { get: () => "" }, serve: () => {} },
    EdgeRuntime: { waitUntil() {} },
    require: () => imported,
  });
  vm.runInContext(javascript, context);
  return exports;
}

test("production client sends the profile photo and representative JPEG URLs to Face++ Compare", async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = init.body;
    requests.push({ url, init, body });
    const frameNumber = Number(String(body.get("image_url2")).match(/frame-(\d)/)?.[1] || 1);
    return Response.json({
      confidence: frameNumber === 3 ? 40 : 92,
      thresholds: { "1e-3": 65, "1e-4": 72, "1e-5": 80 },
      faces1: [{ face_token: "profile" }],
      faces2: frameNumber === 2 ? [{ face_token: "a" }, { face_token: "b" }] : [{ face_token: "a" }],
    });
  };
  const frames = [
    "https://fixture.supabase.co/frame-1.jpg",
    "https://fixture.supabase.co/frame-2.jpg",
    "https://fixture.supabase.co/frame-3.jpg",
  ];
  const result = (await clientModule.compareApplicantFacesWithFacePlusPlus(
    [{ id: "solo-applicant", reference_image_url: "https://fixture.supabase.co/profile.jpg" }],
    frames,
    { apiKey: "test-key", apiSecret: "test-secret", thresholdTier: "1e-5", fetchImpl },
  )).get("solo-applicant");

  assert.equal(requests.length, 3);
  assert.equal(requests[0].url, "https://api-us.faceplusplus.com/facepp/v3/compare");
  assert.equal(requests[0].body.get("api_key"), "test-key");
  assert.equal(requests[0].body.get("api_secret"), "test-secret");
  assert.equal(requests[0].body.get("image_url1"), "https://fixture.supabase.co/profile.jpg");
  assert.deepEqual(requests.map((request) => request.body.get("image_url2")), frames);
  assert.equal(result.status, "likely_same_person");
  assert.equal(result.provider, "faceplusplus_compare");
  assert.equal(result.model, "Face++ Compare API");
  assert.equal(result.distance, null);
  assert.equal(result.threshold, 80);
  assert.equal(result.confidence, 92);
  assert.equal(result.similarity, 0.92);
  assert.equal(result.multiple_people_frames, 1);
  assert.equal(result.frames.length, 3);
});

test("Face++ concurrency errors retry with capped backoff and preserve the comparison", async () => {
  let requestCount = 0;
  const delays = [];
  const result = (await clientModule.compareApplicantFacesWithFacePlusPlus(
    [{ id: "solo-applicant", reference_image_url: "https://fixture.supabase.co/profile.jpg" }],
    ["https://fixture.supabase.co/frame-1.jpg"],
    {
      apiKey: "test-key",
      apiSecret: "test-secret",
      maxConcurrencyRetries: 3,
      retryBaseDelayMs: 1_000,
      sleepImpl: async (delayMs) => delays.push(delayMs),
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return Response.json({ error_message: "CONCURRENCY_LIMIT_EXCEEDED" }, { status: 403 });
        }
        return Response.json({
          confidence: 92,
          thresholds: { "1e-3": 65, "1e-4": 72, "1e-5": 80 },
          faces1: [{ face_token: "profile" }],
          faces2: [{ face_token: "frame" }],
        });
      },
    },
  )).get("solo-applicant");

  assert.equal(requestCount, 2);
  assert.equal(delays.length, 1);
  assert.ok(delays[0] >= 1_000 && delays[0] <= 1_250);
  assert.equal(result.frames[0].outcome, "matched");
  assert.equal(result.frames[0].error, null);
});

test("Face++ failures remain not_run after retry exhaustion and never become a negative match", async () => {
  let requestCount = 0;
  const result = (await clientModule.compareApplicantFacesWithFacePlusPlus(
    [{ id: "solo-applicant", reference_image_url: "https://fixture.supabase.co/profile.jpg" }],
    ["https://fixture.supabase.co/frame-1.jpg"],
    {
      apiKey: "test-key",
      apiSecret: "test-secret",
      maxConcurrencyRetries: 2,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        requestCount += 1;
        return Response.json({ error_message: "CONCURRENCY_LIMIT_EXCEEDED" }, { status: 403 });
      },
    },
  )).get("solo-applicant");
  assert.equal(requestCount, 3);
  assert.equal(result.status, "not_run");
  assert.notEqual(result.status, "likely_different_person");
  assert.match(result.error, /CONCURRENCY_LIMIT_EXCEEDED/);
});

for (const relativePath of portfolioReviewPaths) {
  test(`${relativePath} reviews only application media and keeps optional face matching separate`, () => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /compareApplicantFacesWithFacePlusPlus/);
    assert.match(source, /FACEPP_API_KEY/);
    assert.match(source, /FACEPP_API_SECRET/);
    assert.match(source, /face_match_provider:\s*'faceplusplus_compare'/);
    assert.match(source, /face_similarity:\s*faceSimilarity/);
    assert.match(source, /group_face_similarity:\s*groupFaceSimilarity/);
    assert.match(source, /extractCvText/);
    assert.match(source, /transcribeVideo/);
    assert.match(source, /inspectImages/);
    assert.match(source, /MAX_VISION_IMAGES_PER_REQUEST = 3/);
    assert.match(source, /profile_portfolio_used: false/);
    assert.match(source, /gig-portfolio-v6-cv-name-check/);
    assert.match(source, /candidate_name/);
    assert.match(source, /cv_name_check:\s*cvNameCheck/);
    assert.doesNotMatch(source, /from\('profile_portfolio_urls'\)/);
    assert.doesNotMatch(source, /from\('group_media'\)/);
    assert.doesNotMatch(source, /portfolioImageUrls|portfolioDocumentUrls|portfolioDocuments/);
    assert.match(source, /buildRecognizedAudioGenreEvidence/);
    assert.match(source, /GROQ_TRANSCRIPTION_URL/);
    assert.match(source, /model_provider:\s*'groq\+faceplusplus'/);
    assert.doesNotMatch(source, /FACE_RECOGNITION_URL|compareApplicantFacesWithDeepFace/);
  });
}

test("CV name comparison tolerates middle names and initials but flags clear conflicts", () => {
  const { exports } = loadPortfolioReviewHarness();

  assert.equal(
    exports.compareCvApplicantName("Neil P. Laza", ["Neil Ardrey Payoyo Laza"], 0.95).status,
    "match",
  );
  assert.equal(
    exports.compareCvApplicantName("Laza, Neil", ["Neil Ardrey Payoyo Laza"], 0.95).status,
    "match",
  );
  assert.equal(
    exports.compareCvApplicantName("Neil Santos", ["Neil Ardrey Payoyo Laza"], 0.95).status,
    "unclear",
  );
  assert.equal(
    exports.compareCvApplicantName("Maria Santos", ["Neil Ardrey Payoyo Laza"], 0.95).status,
    "mismatch",
  );
  assert.equal(
    exports.compareCvApplicantName("Neil Laza", ["Neil Ardrey Payoyo Laza"], 0.55).status,
    "unclear",
  );
});

test("queued portfolio review invokes Face++ and stores its normalized result with the existing evidence fields", async () => {
  const harness = loadPortfolioReviewHarness();
  const database = mockReviewClient();
  await harness.exports.queueGigPortfolioReview(database.client, "application-1");
  assert.equal(database.upserts.length, 1);
  assert.equal(database.upserts[0].payload.status, "queued");

  await harness.exports.runGigPortfolioReview(database.client, "application-1", "https://fixture.supabase.co");
  assert.equal(harness.faceCalls.length, 1);
  assert.equal(harness.faceCalls[0].subjects[0].id, "solo-applicant");
  assert.equal(harness.faceCalls[0].frames.length, 3);
  const stored = database.updates.map((entry) => entry.payload).find((payload) => payload.face_similarity?.provider === "faceplusplus_compare");
  assert.ok(stored);
  assert.equal(stored.face_similarity.status, "likely_same_person");
  assert.equal(stored.face_similarity.confidence, 91.5);
  assert.equal(stored.source_summary.face_match_model, "Face++ Compare API");
  assert.ok("cv_document_classification" in stored.source_summary);
  assert.equal(stored.source_summary.cv_name_check.status, "not_run");
  assert.ok("video_transcribed" in stored.source_summary);
  assert.ok("video_frames_reviewed" in stored.source_summary);
  assert.ok("recognized_audio_genre" in stored.source_summary);
  assert.ok(Array.isArray(stored.evidence));
});

test("stored Face++ result still flows through the existing rules-based recommendation recalculation", async () => {
  const recommendations = loadRecommendationHarness();
  const client = {
    from: () => ({
      select() { return this; },
      in: async () => ({
        data: [{
          application_id: "application-1",
          status: "completed",
          source_summary: { cv_document_classification: { status: "cv" } },
          face_similarity: { status: "likely_same_person", provider: "faceplusplus_compare" },
          evidence: [{ criterion: "portfolio_requirement", result: "supported" }],
        }],
        error: null,
      }),
    }),
  };
  const [result] = await recommendations.addAdvisoryMediaReviewSummaries(client, [{
    application_id: "application-1",
    score: 0,
    matched_criteria: [],
    missing_criteria: ["Portfolio fit review pending"],
    criteria_snapshot: {
      settings: {
        criteria: { instruments: "ignore", genres: "ignore", location: "ignore", portfolio: "preferred" },
        location_radius_km: null,
        minimum_score: 75,
      },
      requirements: {},
    },
  }]);
  assert.equal(result.score, 100);
  assert.equal(result.recommendation_status, "recommended");
  assert.equal(result.criteria_snapshot.score_breakdown.earned_points, 15);
  assert.equal(result.criteria_snapshot.score_breakdown.possible_points, 15);
  assert.match(result.explanation, /appears to match the profile photo/i);
});

test("an unrelated reviewed upload no longer earns portfolio match points", async () => {
  const recommendations = loadRecommendationHarness();
  const client = {
    from: () => ({
      select() { return this; },
      in: async () => ({
        data: [{
          application_id: "application-1",
          status: "completed",
          source_summary: {
            cv_document_classification: { status: "not_a_cv" },
            portfolio_documents_reviewed: 1,
          },
          face_similarity: { status: "not_run" },
          evidence: [{ criterion: "portfolio_requirement", result: "not_supported" }],
        }],
        error: null,
      }),
    }),
  };
  const [result] = await recommendations.addAdvisoryMediaReviewSummaries(client, [{
    application_id: "application-1",
    score: 100,
    matched_criteria: [],
    missing_criteria: ["Portfolio fit review pending"],
    criteria_snapshot: {
      settings: {
        criteria: { instruments: "ignore", genres: "ignore", location: "ignore", portfolio: "preferred" },
        location_radius_km: null,
        minimum_score: 75,
      },
      requirements: {},
    },
  }]);
  assert.equal(result.score, 0);
  assert.equal(result.recommendation_status, "possible_match");
  assert.equal(result.criteria_snapshot.score_breakdown.earned_points, 0);
  assert.equal(result.criteria_snapshot.score_breakdown.possible_points, 15);
  assert.ok(!result.matched_criteria.includes("Portfolio or performance evidence fits the gig"));
  assert.ok(result.missing_criteria.includes("Submitted performance evidence does not fit the gig"));
  assert.match(result.explanation, /does not show relevant performance or portfolio experience/i);
});

test("an unclear media review does not preserve unverified portfolio points", async () => {
  const recommendations = loadRecommendationHarness();
  const client = {
    from: () => ({
      select() { return this; },
      in: async () => ({
        data: [{
          application_id: "application-1",
          status: "partial",
          source_summary: { cv_document_classification: { status: "not_run" } },
          face_similarity: { status: "not_run" },
          evidence: [{ criterion: "portfolio_requirement", result: "unclear" }],
        }],
        error: null,
      }),
    }),
  };
  const [result] = await recommendations.addAdvisoryMediaReviewSummaries(client, [{
    application_id: "application-1",
    score: 100,
    matched_criteria: [],
    missing_criteria: ["Portfolio fit review pending"],
    criteria_snapshot: {
      settings: {
        criteria: { instruments: "ignore", genres: "ignore", location: "ignore", portfolio: "required" },
        location_radius_km: null,
        minimum_score: 75,
      },
      requirements: {},
    },
  }]);
  assert.equal(result.score, 0);
  assert.equal(result.is_eligible, false);
  assert.ok(!result.matched_criteria.includes("Portfolio or performance evidence fits the gig"));
  assert.ok(result.missing_criteria.includes("Performance evidence could not be confirmed"));
});

test("AI review is enabled by default without a checkbox and applicant review sections start collapsed", () => {
  const applySource = readFileSync(new URL(
    "../mobile/src/components/listingDetails/GigApplyTab.tsx",
    import.meta.url,
  ), "utf8");
  const reviewSource = readFileSync(new URL(
    "../mobile/src/components/ApplicantDetailsModal.tsx",
    import.meta.url,
  ), "utf8");
  const listingSource = readFileSync(new URL(
    "../mobile/src/components/ListingDetailsSheet.tsx",
    import.meta.url,
  ), "utf8");
  assert.doesNotMatch(applySource, /Allow optional AI application review/);
  assert.doesNotMatch(applySource, /setAiPortfolioReviewConsent/);
  assert.match(listingSource, /useState\(true\)/);
  assert.doesNotMatch(reviewSource, /colors=\{colors\} defaultOpen/);
  assert.equal((reviewSource.match(/<Section title=/g) || []).length, 3);
  assert.doesNotMatch(reviewSource, /Weighted score|median distance|Match rate/);
  assert.match(reviewSource, /did not authorize optional AI file review/);
  assert.match(reviewSource, /title="CV Check"/);
  assert.match(reviewSource, /title="Song & Genre Check"/);
  assert.match(reviewSource, /title="Profile & Video Check"/);
  assert.match(reviewSource, /Possible match/);
  assert.match(reviewSource, /View details/);
  assert.match(reviewSource, /We couldn't identify the song or genre\./);
  assert.match(reviewSource, /Review the performance video if needed\./);
  assert.match(reviewSource, /The applicant may appear in the performance video\./);
  assert.match(reviewSource, /Only one clear frame was found\. Please verify manually\./);
  assert.match(reviewSource, /Name matches/);
  assert.match(reviewSource, /Name needs review/);
  assert.match(reviewSource, /Name not confirmed/);
  assert.match(reviewSource, /source_summary\?\.cv_name_check/);
  assert.doesNotMatch(reviewSource, /No additional song evidence is available\./);
  assert.doesNotMatch(reviewSource, /The profile photo was compared with clear frames from the performance video\./);
  assert.doesNotMatch(reviewSource, /Advisory only · Not included in score/);
  assert.doesNotMatch(reviewSource, /Not scored|wasn't scored|couldn't be scored|included in score/i);
  assert.doesNotMatch(reviewSource, /statusPill|Audio & Genre Evidence|Optional Profile-Video Face Match/);
});

test("application queue, stored face result, and recommendation recalculation path remain connected", () => {
  const reviewSource = readFileSync(new URL(
    "../mobile/supabase/functions/_shared/gigPortfolioReview.ts",
    import.meta.url,
  ), "utf8");
  const applicationSource = readFileSync(new URL(
    "../mobile/supabase/functions/gig-applications/index.ts",
    import.meta.url,
  ), "utf8");
    assert.match(applicationSource, /await queueGigPortfolioReview\(supabaseClient, applicationId\)/);
    assert.match(applicationSource, /await scheduleGigPortfolioReview\(supabaseClient, applicationId, supabaseUrl\)/);
    assert.match(applicationSource, /hasReviewAdminAccess && action === 'reprocess_ai_portfolio_review'/);
    assert.match(applicationSource, /AI_REVIEW_ADMIN_SECRET/);
    assert.match(applicationSource, /hasStaleFaceConfigurationFailure/);
    assert.match(applicationSource, /storedFaceError === 'missing_facepp_credentials'/);
    assert.match(applicationSource, /face_similarity:\s*\{\}/);
    assert.match(applicationSource, /group_face_similarity:\s*\[\]/);
    assert.match(reviewSource, /runGigPortfolioReview\(client, applicationId, supabaseUrl\)/);
  assert.match(reviewSource, /compareApplicantFacesWithFacePlusPlus\(faceSubjects, frameUrls/);
  assert.match(reviewSource, /face_similarity:\s*faceSimilarity/);
  assert.match(applicationSource, /attachGigApplicationRecommendations/);
  assert.match(applicationSource, /const faceStatus = String\(review\?\.face_similarity\?\.status/);
  assert.match(applicationSource, /cv_document_classification/);
  assert.match(applicationSource, /genreEvidence/);
  assert.match(applicationSource, /portfolioEvidence/);
  assert.match(applicationSource, /latitude === 0 && longitude === 0/);
  assert.match(applicationSource, /hasPortfolio: Boolean\(application\?\.video_url \|\| application\?\.cv_url\)/);
  assert.doesNotMatch(applicationSource, /hasPortfolio:[\s\S]{0,250}profile\?\.portfolio_urls/);
});

test("benchmark imports the production Face++ client and cannot rewrite the production threshold tier", () => {
  const source = readFileSync(new URL("./face-benchmark.ts", import.meta.url), "utf8");
  assert.match(source, /mobile\/supabase\/functions\/_shared\/faceRecognitionClient\.ts/);
  assert.match(source, /BENCHMARK ONLY/);
  assert.match(source, /false_match_rate/);
  assert.match(source, /false_non_match_rate/);
  assert.match(source, /conditional_accuracy/);
  assert.match(source, /service_failure_rate/);
  assert.doesNotMatch(source, /FACEPP_THRESHOLD_TIER\s*=/);
});
