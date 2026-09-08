import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function createScreeningHarness() {
  const cases = [],
    objects = new Map();
  let handler,
    providerCalls = 0,
    providerFailure = false,
    providerAllows = false,
    jsonModeFailure = false,
    storageFailure = false,
    currentUser = "00000000-0000-4000-8000-000000000001";
  const providerRequestBodies = [];
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
            })[key],
        },
      },
      fetch: async (_url, init) => {
        providerCalls++;
        const requestBody = JSON.parse(init?.body || "{}");
        providerRequestBodies.push(requestBody);
        if (providerFailure) return new Response("Unavailable", { status: 503 });
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
  compile(
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
    failProvider() {
      providerFailure = true;
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
  assert.deepEqual(h.providerRequestBodies[0].response_format, { type: "json_object" });
  assert.equal(h.providerRequestBodies[1].response_format, undefined);
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
