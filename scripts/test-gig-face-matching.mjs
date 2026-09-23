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
    confidence: null,
    similarity: null,
    distance: 0.31,
    threshold: 0.68,
    summary: "ArcFace matched 2 of 3 usable representative video frames.",
    frames_compared: 3,
    sampled_frames: 3,
    usable_frames: 3,
    matched_frames: 2,
    match_rate: 2 / 3,
    no_face_frames: 0,
    multiple_people_frames: 0,
    processing_failure_frames: 0,
    provider: "deepface_arcface",
    model: "ArcFace",
    detector_backend: "retinaface",
    distance_metric: "cosine",
    alignment: true,
    aggregation_strategy: "at_least_2_usable_frames_and_2_verified_matches",
    service_version: "1.0.0",
    deepface_version: "0.0.101",
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
          FACE_RECOGNITION_URL: "http://127.0.0.1:8000",
        })[key],
      },
    },
    require: (specifier) => {
      if (!String(specifier).includes("faceRecognitionClient")) throw new Error(`Unexpected import: ${specifier}`);
      return {
        unavailableFaceMatch,
        compareApplicantFacesWithDeepFace: async (subjects, frames, options) => {
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

test("production client sends the existing representative JPEG URLs to DeepFace/ArcFace", async () => {
  const requests = [];
  const servicePayload = {
    provider: "deepface_arcface",
    service_version: "1.0.0",
    deepface_version: "0.0.101",
    model: "ArcFace",
    detector_backend: "retinaface",
    distance_metric: "cosine",
    threshold: 0.68,
    alignment: true,
    aggregation_strategy: "at_least_2_usable_frames_and_2_verified_matches",
    results: [{
      subject_id: "solo-applicant",
      status: "likely_same_person",
      confidence: null,
      similarity: null,
      distance: 0.31,
      threshold: 0.68,
      summary: "ArcFace matched 2 of 3 usable representative video frames.",
      frames_compared: 3,
      sampled_frames: 3,
      usable_frames: 3,
      matched_frames: 2,
      match_rate: 2 / 3,
      no_face_frames: 0,
      multiple_people_frames: 1,
      processing_failure_frames: 0,
      frames: [
        { frame: 1, frame_url: "https://fixture.supabase.co/frame-1.jpg", outcome: "matched", verified: true, distance: 0.28, threshold: 0.68, faces_detected: 1 },
        { frame: 2, frame_url: "https://fixture.supabase.co/frame-2.jpg", outcome: "matched", verified: true, distance: 0.31, threshold: 0.68, faces_detected: 2 },
        { frame: 3, frame_url: "https://fixture.supabase.co/frame-3.jpg", outcome: "different", verified: false, distance: 0.82, threshold: 0.68, faces_detected: 1 },
      ],
      limitation: "",
      error: null,
    }],
  };
  const fetchImpl = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) });
    return Response.json(servicePayload);
  };
  const frames = [
    "https://fixture.supabase.co/frame-1.jpg",
    "https://fixture.supabase.co/frame-2.jpg",
    "https://fixture.supabase.co/frame-3.jpg",
  ];
  const result = (await clientModule.compareApplicantFacesWithDeepFace(
    [{ id: "solo-applicant", reference_image_url: "https://fixture.supabase.co/profile.jpg" }],
    frames,
    { serviceUrl: "http://127.0.0.1:8000/", apiKey: "test-key", fetchImpl },
  )).get("solo-applicant");

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:8000/v1/face-match/batch");
  assert.equal(requests[0].init.headers["X-Face-Service-Key"], "test-key");
  assert.deepEqual(requests[0].body.frame_urls, frames);
  assert.equal(requests[0].body.subjects[0].reference_image_url, "https://fixture.supabase.co/profile.jpg");
  assert.equal(result.status, "likely_same_person");
  assert.equal(result.provider, "deepface_arcface");
  assert.equal(result.model, "ArcFace");
  assert.equal(result.distance, 0.31);
  assert.equal(result.threshold, 0.68);
  assert.equal(result.confidence, null);
  assert.equal(result.similarity, null);
  assert.equal(result.multiple_people_frames, 1);
  assert.equal(result.frames.length, 3);
});

test("face service failures remain not_run and never become a negative match", async () => {
  const result = (await clientModule.compareApplicantFacesWithDeepFace(
    [{ id: "solo-applicant", reference_image_url: "https://fixture.supabase.co/profile.jpg" }],
    ["https://fixture.supabase.co/frame-1.jpg"],
    {
      serviceUrl: "http://127.0.0.1:8000",
      fetchImpl: async () => new Response(JSON.stringify({ detail: "model failed to load" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    },
  )).get("solo-applicant");
  assert.equal(result.status, "not_run");
  assert.notEqual(result.status, "likely_different_person");
  assert.match(result.error, /503/);
});

for (const relativePath of portfolioReviewPaths) {
  test(`${relativePath} preserves the full portfolio pipeline while replacing only face matching`, () => {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /compareApplicantFacesWithDeepFace/);
    assert.match(source, /FACE_RECOGNITION_URL/);
    assert.match(source, /face_match_provider:\s*'deepface_arcface'/);
    assert.match(source, /face_similarity:\s*faceSimilarity/);
    assert.match(source, /group_face_similarity:\s*groupFaceSimilarity/);
    assert.match(source, /extractCvText/);
    assert.match(source, /transcribeVideo/);
    assert.match(source, /inspectImages/);
    assert.match(source, /buildRecognizedAudioGenreEvidence/);
    assert.match(source, /GROQ_TRANSCRIPTION_URL/);
    assert.match(source, /model_provider:\s*'groq\+deepface_arcface'/);
    assert.doesNotMatch(source, /Face\+\+|faceplusplus|FACEPP_|faceapi/i);
  });
}

test("queued portfolio review invokes ArcFace and stores its normalized result with the existing evidence fields", async () => {
  const harness = loadPortfolioReviewHarness();
  const database = mockReviewClient();
  await harness.exports.queueGigPortfolioReview(database.client, "application-1");
  assert.equal(database.upserts.length, 1);
  assert.equal(database.upserts[0].payload.status, "queued");

  await harness.exports.runGigPortfolioReview(database.client, "application-1", "https://fixture.supabase.co");
  assert.equal(harness.faceCalls.length, 1);
  assert.equal(harness.faceCalls[0].subjects[0].id, "solo-applicant");
  assert.equal(harness.faceCalls[0].frames.length, 3);
  const stored = database.updates.map((entry) => entry.payload).find((payload) => payload.face_similarity?.provider === "deepface_arcface");
  assert.ok(stored);
  assert.equal(stored.face_similarity.status, "likely_same_person");
  assert.equal(stored.face_similarity.distance, 0.31);
  assert.equal(stored.source_summary.face_match_model, "ArcFace");
  assert.ok("cv_document_classification" in stored.source_summary);
  assert.ok("video_transcribed" in stored.source_summary);
  assert.ok("video_frames_reviewed" in stored.source_summary);
  assert.ok("recognized_audio_genre" in stored.source_summary);
  assert.ok(Array.isArray(stored.evidence));
});

test("stored ArcFace result still flows through the existing rules-based recommendation recalculation", async () => {
  const recommendations = loadRecommendationHarness();
  const client = {
    from: () => ({
      select() { return this; },
      in: async () => ({
        data: [{
          application_id: "application-1",
          status: "completed",
          source_summary: { cv_document_classification: { status: "cv" } },
          face_similarity: { status: "likely_same_person", provider: "deepface_arcface" },
          evidence: [{ criterion: "portfolio_requirement", result: "supported" }],
        }],
        error: null,
      }),
    }),
  };
  const [result] = await recommendations.addAdvisoryMediaReviewSummaries(client, [{
    application_id: "application-1",
    score: 0,
    matched_criteria: ["Portfolio or application media provided"],
    missing_criteria: [],
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
  assert.match(result.explanation, /appears to match the profile photo/i);
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
  assert.match(reviewSource, /runGigPortfolioReview\(client, applicationId, supabaseUrl\)/);
  assert.match(reviewSource, /compareApplicantFacesWithDeepFace\(faceSubjects, frameUrls/);
  assert.match(reviewSource, /face_similarity:\s*faceSimilarity/);
  assert.match(applicationSource, /attachGigApplicationRecommendations/);
  assert.match(applicationSource, /const faceStatus = String\(review\?\.face_similarity\?\.status/);
  assert.match(applicationSource, /cv_document_classification/);
  assert.match(applicationSource, /genreEvidence/);
  assert.match(applicationSource, /portfolioEvidence/);
});

test("benchmark imports the production client and cannot rewrite the production threshold", () => {
  const source = readFileSync(new URL("./face-benchmark.ts", import.meta.url), "utf8");
  assert.match(source, /mobile\/supabase\/functions\/_shared\/faceRecognitionClient\.ts/);
  assert.match(source, /BENCHMARK ONLY/);
  assert.match(source, /false_match_rate/);
  assert.match(source, /false_non_match_rate/);
  assert.match(source, /conditional_accuracy/);
  assert.match(source, /service_failure_rate/);
  assert.doesNotMatch(source, /FACE_ARCFACE_THRESHOLD\s*=/);
});
