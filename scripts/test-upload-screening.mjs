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
    storageFailure = false,
    currentUser = "00000000-0000-4000-8000-000000000001";
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
      fetch: async () => {
        providerCalls++;
        return providerFailure
          ? new Response("Unavailable", { status: 503 })
          : Response.json({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
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
    failProvider() {
      providerFailure = true;
    },
    failStorage() {
      storageFailure = true;
    },
    user(id) {
      currentUser = id;
    },
    async screen(files, token = "valid") {
      const response = await handler(
        new Request("https://fixture/screen", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ context: "social_post_media", files }),
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
  assert.equal(provider.cases.length, 0);
  const storage = createScreeningHarness();
  storage.failStorage();
  assert.equal(
    (await storage.screen([file("image-one")])).body.results[0].allowed,
    false,
  );
  assert.equal(storage.cases.length, 0);
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
