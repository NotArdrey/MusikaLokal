import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

test("declining a copyright review cannot reach identity account deletion", () => {
  const source = readFileSync(
    new URL("../web/supabase/functions/admin-users-management/index.ts", import.meta.url),
    "utf8",
  );
  const copyrightBranch = source.match(
    /if \(isCopyrightOwnershipReview\(review\)\) \{[\s\S]+?\n\s*const \{ data: preDecisionProfile \}/,
  )?.[0];

  assert(copyrightBranch, "expected a dedicated copyright ownership review branch");
  assert.match(copyrightBranch, /declined_account_delete_attempted:\s*false/);
  assert.match(copyrightBranch, /return jsonResponse\(\{/);
  assert.doesNotMatch(copyrightBranch, /deleteReviewedIdentityAccount\(/);
});

function createScreeningHarness({ fallbackGroqApiKey = "" } = {}) {
  const cases = [],
    objects = new Map();
  let handler,
    providerCalls = 0,
    providerFailure = false,
    primaryAccountFailure = false,
    primaryVisionFailure = false,
    rateLimitFirstPass = false,
    providerAllows = false,
    jsonModeFailure = false,
    storageFailure = false,
    currentUser = "00000000-0000-4000-8000-000000000001";
  const providerRequestBodies = [];
  const providerAuthorizationHeaders = [];
  const query = (table) => {
    const filters = [];
    let inserted = null;
    const builder = {
      select() {
        return builder;
      },
      eq(key, value) {
        filters.push((row) => row[key] === value);
        return builder;
      },
      gt() {
        return builder;
      },
      insert(row) {
        inserted = row;
        return builder;
      },
      async maybeSingle() {
        return {
          data:
            table === "upload_moderation_cases"
              ? cases.find((row) => filters.every((filter) => filter(row))) ||
                null
              : null,
          error: null,
        };
      },
      async single() {
        assert.equal(table, "upload_moderation_cases");
        const row = { ...inserted, status: "pending_review", media_path: null };
        cases.push(row);
        return { data: row, error: null };
      },
    };
    return builder;
  };
  const client = {
    auth: {
      getUser: async (token) =>
        token === "valid"
          ? {
              data: {
                user: { id: currentUser, email: "fixture@example.invalid" },
              },
            }
          : { data: { user: null }, error: new Error("Invalid JWT") },
    },
    from: query,
    storage: {
      from: (bucket) => ({
        async upload(path, bytes, options) {
          assert.equal(bucket, "moderation-quarantine");
          assert.equal(options.upsert, false);
          if (storageFailure) return { error: new Error("Storage failed") };
          objects.set(path, bytes);
          return { error: null };
        },
        async remove(paths) {
          paths.forEach((path) => objects.delete(path));
          return { error: null };
        },
      }),
    },
  };
  const silentConsole = { log() {}, warn() {}, error() {} };
  const base = {
    console: silentConsole,
    Request,
    Response,
    URL,
    TextEncoder,
    Uint8Array,
    crypto: globalThis.crypto,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
  };
  function compile(path, require) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const js = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText;
    const exports = {};
    const context = vm.createContext({
      ...base,
      exports,
      require,
      Deno: {
        env: {
          get: (key) =>
            ({
              SUPABASE_URL: "https://fixture.supabase.co",
              SUPABASE_ANON_KEY: "anon-fixture",
              SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
              GROQ_API_KEY: "groq-fixture",
              GROQ_FALLBACK_API_KEY: fallbackGroqApiKey,
              GROQ_VISION_MODEL: "retired/vision-model",
            })[key],
        },
      },
      fetch: async (_url, init) => {
        providerCalls++;
        const requestBody = JSON.parse(init?.body || "{}");
        providerRequestBodies.push(requestBody);
        const authorization = init?.headers?.Authorization || init?.headers?.authorization || "";
        providerAuthorizationHeaders.push(authorization);
        if (providerFailure) return new Response("Unavailable", { status: 503 });
        if (rateLimitFirstPass && providerCalls <= 2) {
          return Response.json(
            { error: { code: "rate_limit_exceeded", message: "Rate limit reached" } },
            { status: 429, headers: { "retry-after": "0" } },
          );
        }
        if (primaryAccountFailure && authorization === "Bearer groq-fixture") {
          return Response.json(
            { error: { code: "rate_limit_exceeded", message: "Account rate limit reached" } },
            { status: 429 },
          );
        }
        if (primaryVisionFailure && requestBody.model === "retired/vision-model") {
          return Response.json(
            { error: { code: "rate_limit_exceeded", message: "Rate limit reached" } },
            { status: 429 },
          );
        }
        if (jsonModeFailure && requestBody.response_format) {
          return Response.json(
            { error: { code: "json_validate_failed", message: "Failed to validate JSON" } },
            { status: 400 },
          );
        }
        const isVisualRequest = Array.isArray(requestBody.messages?.[0]?.content);
        const safeContent = isVisualRequest
          ? { allowed: true, categories: {}, confidence: 0.99, reason: "" }
          : { results: [{ index: 0, allowed: true }] };
        return Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify(providerAllows ? safeContent : {
                      allowed: false,
                      categories: { violence: true },
                      confidence: 0.93,
                      reason: "Flagged for graphic violence.",
                    }),
                  },
                },
              ],
            });
      },
    });
    vm.runInContext(js, context);
    return exports;
  }
  const shared = compile(
    "../mobile/supabase/functions/_shared/uploadModeration.ts",
    () => {
      throw new Error("Unexpected import");
    },
  );
  const screeningModule = compile(
    "../mobile/supabase/functions/upload-safety-screen/index.ts",
    (path) => {
      if (path.includes("uploadModeration")) return shared;
      if (path.includes("http/server"))
        return {
          serve: (fn) => {
            handler = fn;
          },
        };
      if (path.includes("supabase-js")) return { createClient: () => client };
      throw new Error(`Unexpected import: ${path}`);
    },
  );
  return {
    cases,
    objects,
    get providerCalls() {
      return providerCalls;
    },
    providerRequestBodies,
    providerAuthorizationHeaders,
    buildCopyrightMatchMetadata: screeningModule.buildCopyrightMatchMetadata,
    buildPendingCopyrightReviewDecision: screeningModule.buildPendingCopyrightReviewDecision,
    failProvider() {
      providerFailure = true;
    },
    failPrimaryVisionModel() {
      primaryVisionFailure = true;
    },
    failPrimaryAccount() {
      primaryAccountFailure = true;
    },
    rateLimitFirstPass() {
      rateLimitFirstPass = true;
    },
    allowProvider() {
      providerAllows = true;
    },
    failJsonMode() {
      jsonModeFailure = true;
    },
    failStorage() {
      storageFailure = true;
    },
    user(id) {
      currentUser = id;
    },
    async screen(files, token = "valid", context = "social_post_media") {
      const response = await handler(
        new Request("https://fixture/screen", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ context, files }),
        }),
      );
      return { status: response.status, body: await response.json() };
    },
  };
}
const file = (content) => ({
  id: "client-controlled-cache-id",
  fileName: "upload.jpg",
  kind: "photo",
  mimeType: "image/jpeg",
  contentDataUrl: `data:image/jpeg;base64,${btoa(content)}`,
});

test("AI block stores private evidence and returns a pending case, with category and confidence", async () => {
  const h = createScreeningHarness();
  const { status, body } = await h.screen([file("image-one")]);
  assert.equal(status, 200);
  assert.equal(body.results[0].allowed, false);
  assert.equal(body.results[0].moderationStatus, "pending_review");
  assert.equal(h.cases.length, 1);
  assert.equal(h.objects.size, 1);
  assert.equal(h.cases[0].confidence, 0.93);
  assert.equal(h.cases[0].categories[0], "violence");
  assert.equal(h.cases[0].provider, "groq-vision");
  assert.match(body.results[0].reason, /possible violence/i);
  assert.match(body.results[0].reason, /administrator reviews/i);
});
test("retries reuse the case; admin approval applies only to exact evidence and uploader", async () => {
  const h = createScreeningHarness();
  const original = file("image-one");
  const first = await h.screen([original]);
  const retry = await h.screen([original]);
  assert.equal(
    first.body.results[0].moderationCaseId,
    retry.body.results[0].moderationCaseId,
  );
  assert.match(retry.body.results[0].reason, /possible violence/i);
  assert.equal(h.providerCalls, 1);
  assert.equal(h.cases.length, 1);
  h.cases[0].status = "approved";
  assert.equal((await h.screen([original])).body.results[0].allowed, true);
  assert.equal(
    (await h.screen([file("different-image")])).body.results[0].allowed,
    false,
  );
  h.user("00000000-0000-4000-8000-000000000002");
  assert.equal((await h.screen([original])).body.results[0].allowed, false);
  assert.equal(h.cases.length, 3);
});
test("rejected media remains blocked and an attached original does not require another upload", async () => {
  const h = createScreeningHarness();
  await h.screen([file("image-one")]);
  h.cases[0].media_path = "private/original.jpg";
  assert.equal(
    (await h.screen([file("image-one")])).body.results[0]
      .moderationEvidenceAttached,
    true,
  );
  h.cases[0].status = "rejected";
  const result = (await h.screen([file("image-one")])).body.results[0];
  assert.equal(result.allowed, false);
  assert.equal(result.moderationStatus, "rejected");
});
test("a blocked extension cannot let sibling images skip AI screening", async () => {
  const h = createScreeningHarness();
  const result = await h.screen([
    { ...file("script"), fileName: "malware.exe" },
    file("image-one"),
  ]);
  assert.equal(result.body.results[0].allowed, false);
  assert.equal(result.body.results[1].allowed, false);
  assert.equal(h.providerCalls, 1);
  assert.equal(h.cases.length, 1);
});
test("provider and evidence storage failures keep uploads blocked; outages do not accuse users", async () => {
  const provider = createScreeningHarness();
  provider.failProvider();
  const result = await provider.screen([file("image-one")]);
  assert.equal(result.body.results[0].allowed, false);
  assert.equal(result.body.results[0].retryable, true);
  assert.equal(result.body.results[0].moderationCaseId, undefined);
  assert.equal(provider.cases.length, 0);
  const storage = createScreeningHarness();
  storage.failStorage();
  assert.equal(
    (await storage.screen([file("image-one")])).body.results[0].allowed,
    false,
  );
  assert.equal(storage.cases.length, 0);
});
test("Groq visual review disables reasoning and retries JSON-mode validation failures", async () => {
  const h = createScreeningHarness();
  h.failJsonMode();
  const result = await h.screen([file("image-one")]);
  assert.equal(result.body.results[0].moderationStatus, "pending_review");
  assert.equal(h.providerCalls, 2);
  assert.equal(h.providerRequestBodies[0].reasoning_effort, "none");
  assert.equal(h.providerRequestBodies[0].reasoning_format, "hidden");
  assert.equal(h.providerRequestBodies[0].max_completion_tokens, 160);
  assert.deepEqual(h.providerRequestBodies[0].response_format, { type: "json_object" });
  assert.equal(h.providerRequestBodies[1].response_format, undefined);
});
test("visual screening falls back to a separate Groq model after a primary rate limit", async () => {
  const h = createScreeningHarness();
  h.allowProvider();
  h.failPrimaryVisionModel();
  const result = await h.screen([file("image-one")]);
  assert.equal(result.body.results[0].allowed, true);
  assert.deepEqual(
    h.providerRequestBodies.map((request) => request.model),
    ["retired/vision-model", "qwen/qwen3.8-27b"],
  );
  assert.ok(h.providerRequestBodies.every((request) => request.max_completion_tokens === 160));
});
test("visual screening retries the same model with the secondary Groq account", async () => {
  const h = createScreeningHarness({ fallbackGroqApiKey: "groq-fallback-fixture" });
  h.allowProvider();
  h.failPrimaryAccount();
  const result = await h.screen([file("image-one")]);
  assert.equal(result.body.results[0].allowed, true);
  assert.deepEqual(
    h.providerRequestBodies.map((request) => request.model),
    ["retired/vision-model", "retired/vision-model"],
  );
  assert.deepEqual(h.providerAuthorizationHeaders, [
    "Bearer groq-fixture",
    "Bearer groq-fallback-fixture",
  ]);
});
test("visual screening honors Groq retry-after before reporting an outage", async () => {
  const h = createScreeningHarness();
  h.allowProvider();
  h.rateLimitFirstPass();
  const result = await h.screen([file("image-one")]);
  assert.equal(result.body.results[0].allowed, true);
  assert.equal(h.providerCalls, 3);
});
test("ACRCloud catalog genres are preserved in copyright metadata", () => {
  const h = createScreeningHarness();
  const metadata = h.buildCopyrightMatchMetadata({
    title: "Fixture Song",
    artists: [{ name: "Fixture Artist" }],
    score: 96,
    genres: [{ name: "Alternative Rock" }, "OPM", { title: "Alternative Rock" }],
    external_ids: { isrc: "PH-ABC-26-00001" },
  });

  assert.deepEqual(Array.from(metadata.recognized_audio_genres), ["Alternative Rock", "OPM"]);
  assert.equal(metadata.recognized_audio_genre_source, "acrcloud_catalog_metadata");
  assert.equal(metadata.recognized_audio_genre_confidence, 0.96);
});
test("non-gig recording uploads can still use the ownership-review decision", () => {
  const h = createScreeningHarness();
  const decision = h.buildPendingCopyrightReviewDecision(
    {
      reviewId: "review-fixture",
      trackKey: "isrc:PHABC2600001",
      metadata: { copyright_title: "Fixture Song" },
    },
    "Ownership or permission review is pending.",
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.requiresAdminReview, true);
  assert.equal(decision.publiclyAvailable, false);
  assert.equal(decision.copyrightStatus, "pending_review");
  assert.equal(decision.copyrightReviewId, "review-fixture");
});
test("ordinary image, video, avatar, feed, portfolio, and metadata uploads pass through Groq", async () => {
  const contexts = [
    ["add_edit_upload", "photo"],
    ["edit_profile_avatar", "photo"],
    ["profile_portfolio_media", "photo"],
    ["profile_portfolio_media", "video"],
    ["social_post_media", "photo"],
    ["social_post_media", "video"],
    ["gig_video_content", "video"],
  ];

  for (const [context, kind] of contexts) {
    const h = createScreeningHarness();
    h.allowProvider();
    const candidate = {
      ...file(`${context}-${kind}`),
      fileName: kind === "video" ? "upload.mp4" : "upload.jpg",
      mimeType: kind === "video" ? "video/mp4" : "image/jpeg",
      kind,
    };
    const result = await h.screen([candidate], "valid", context);
    assert.equal(result.body.results[0].allowed, true, `${context}/${kind}`);
    assert.equal(h.cases.length, 0, `${context}/${kind} created a moderation case`);
  }

  const document = createScreeningHarness();
  document.allowProvider();
  const documentResult = await document.screen(
    [{ id: "document", fileName: "permit.pdf", kind: "document", mimeType: "application/pdf" }],
    "valid",
    "profile_portfolio_media",
  );
  assert.equal(documentResult.body.results[0].allowed, true);
  assert.equal(document.cases.length, 0);
});
test("gig performance videos over five minutes are blocked before provider screening", async () => {
  const h = createScreeningHarness();
  h.allowProvider();
  const candidate = {
    ...file("over-duration-video"),
    fileName: "performance.mp4",
    mimeType: "video/mp4",
    kind: "video",
    fileSize: 50 * 1024 * 1024,
    durationMs: 5 * 60 * 1000 + 1,
  };

  const result = await h.screen([candidate], "valid", "gig_video_content");
  assert.equal(result.body.results[0].allowed, false);
  assert.match(result.body.results[0].reason, /5 minutes or shorter/i);
  assert.equal(h.providerCalls, 0);
});
test("gig performance videos over 50MB are blocked before provider screening", async () => {
  const h = createScreeningHarness();
  h.allowProvider();
  const candidate = {
    ...file("over-size-video"),
    fileName: "performance.mp4",
    mimeType: "video/mp4",
    kind: "video",
    fileSize: 50 * 1024 * 1024 + 1,
    durationMs: 5 * 60 * 1000,
  };

  const result = await h.screen([candidate], "valid", "gig_video_content");
  assert.equal(result.body.results[0].allowed, false);
  assert.match(result.body.results[0].reason, /50MB or smaller/i);
  assert.equal(h.providerCalls, 0);
});
test("gig performance videos at the five-minute and 50MB limits are allowed", async () => {
  const h = createScreeningHarness();
  h.allowProvider();
  const candidate = {
    ...file("boundary-video"),
    fileName: "performance.mp4",
    mimeType: "video/mp4",
    kind: "video",
    fileSize: 50 * 1024 * 1024,
    durationMs: 5 * 60 * 1000,
  };

  const result = await h.screen([candidate], "valid", "gig_video_content");
  assert.equal(result.body.results[0].allowed, true);
  assert.equal(h.providerCalls, 1);
});
test("upload screening contains no Google or Gemini provider path", () => {
  for (const path of [
    "../mobile/supabase/functions/upload-safety-screen/index.ts",
    "../web/supabase/functions/upload-safety-screen/index.ts",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /gemini|generativelanguage\.googleapis\.com/i);
  }
});
test("invalid authentication cannot create moderation cases", async () => {
  const h = createScreeningHarness();
  assert.equal((await h.screen([file("image-one")], "invalid")).status, 401);
  assert.equal(h.providerCalls, 0);
  assert.equal(h.cases.length, 0);
});

test("image or video metadata alone cannot authorize a public upload", async () => {
  const h = createScreeningHarness();
  const candidate = file("image-one");
  delete candidate.contentDataUrl;
  assert.equal((await h.screen([candidate])).body.results[0].allowed, false);
  assert.equal(h.providerCalls, 0);
  assert.equal(h.cases.length, 0);
});

test("non-group app image uploaders bypass AI while group uploaders retain screening", () => {
  const appRoots = [
    new URL("../mobile/app/", import.meta.url),
    new URL("../web/app/", import.meta.url),
  ];
  const visit = (directory) => {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) files.push(...visit(path));
      else if (entry.name.endsWith(".tsx")) files.push(path);
    }
    return files;
  };

  const uploaderCalls = appRoots.flatMap((root) =>
    visit(fileURLToPath(root)).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return Array.from(source.matchAll(/<ImageUploader\b[\s\S]*?\/>/g), (match) => ({
        path,
        call: match[0],
      }));
    }),
  );

  assert.ok(uploaderCalls.length > 0);
  for (const { path, call } of uploaderCalls) {
    const isGroupFlow = /group/i.test(path);
    if (isGroupFlow) {
      assert.doesNotMatch(call, /enableAiSafetyScreening=\{false\}/, path);
    } else {
      assert.match(call, /enableAiSafetyScreening=\{false\}/, path);
    }
  }
});

test("custom profile image and document flows bypass AI but portfolio videos retain it", () => {
  for (const path of ["../mobile/app/edit_profile.tsx", "../web/app/edit_profile.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /ensureUploadPassesSafetyScreening/);
    assert.doesNotMatch(source, /base64:\s*true/);
  }

  for (const path of ["../mobile/app/(tabs)/profile.tsx", "../web/app/profile.tsx"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /if \(options\.uploadKind !== "video"\) \{\s*return;/);
    assert.match(source, /if \(uploadKind === "video"\)/);
    assert.doesNotMatch(source, /This document did not pass safety screening/);
  }
});

test("storage uploads retry transient slow-network failures", () => {
  for (const path of [
    "../mobile/src/utils/storageUpload.ts",
    "../web/src/utils/storageUpload.ts",
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /STORAGE_UPLOAD_ATTEMPTS = 3/);
    assert.match(source, /\[408, 425, 429, 500, 502, 503, 504\]/);
    assert.match(source, /network request failed\|network error\|timeout/);
  }
});
