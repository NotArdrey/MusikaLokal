import assert from "node:assert/strict";

const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
if (!apiKey) throw new Error("GEMINI_API_KEY is required");

const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
const endpoint = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const cvText = String(process.env.TEST_CV_TEXT || `JARED CARIASO
Freelance Musician / Live Performer | Pampanga, Philippines | 2024-Present
Performs live music for private events, local venues, school activities, and community events.
Performs solo acoustic sets and group arrangements.
Guitarist & Vocalist - Local Band | 2023-2024
Genres: Pop, Rock / Alternative, Acoustic, Indie, OPM / Pop Rock
Primary skills: Lead & backing vocals, acoustic guitar, electric guitar, live performance, song interpretation, songwriting, band collaboration.
Portfolio: Performance videos, recordings, and additional portfolio materials available upon request.`).trim();

const criteria = [
  { key: "instrument_requirement", requirement: "Bass" },
  { key: "genre_requirement", requirement: "Jazz" },
  { key: "performance_experience", requirement: "Documented live or professional performance experience" },
];

const findingSchema = {
  type: "object",
  properties: {
    criterion: { type: "string" },
    status: { type: "string", enum: ["supported", "not_supported", "unclear"] },
    source: { type: "string", enum: ["cv"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["cv"] },
          observation: { type: "string" },
          timestamp_seconds: { anyOf: [{ type: "number" }, { type: "null" }] },
        },
        required: ["source", "observation", "timestamp_seconds"],
        additionalProperties: false,
      },
    },
    short_reason: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["criterion", "status", "source", "evidence", "short_reason", "confidence", "limitations"],
  additionalProperties: false,
};

const responseJsonSchema = {
  type: "object",
  properties: {
    document: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["cv", "not_a_cv", "uncertain"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        summary: { type: "string" },
        candidate_name: { anyOf: [{ type: "string" }, { type: "null" }] },
        name_confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["status", "confidence", "summary", "candidate_name", "name_confidence"],
      additionalProperties: false,
    },
    criteria: { type: "array", items: findingSchema },
    summary: { type: "string" },
    limitations: { type: "array", items: { type: "string" } },
  },
  required: ["document", "criteria", "summary", "limitations"],
  additionalProperties: false,
};

async function review(model) {
  let response;
  let payload;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    response = await fetch(endpoint(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "Review extracted CV text as advisory evidence only. Never score, rank, accept, reject, or judge talent. Return exactly one criterion finding for every supplied criterion key, preserving each key exactly. Not_supported needs an explicit contradiction such as 'does not play bass' or 'will not perform Jazz'. If bass or Jazz is merely absent while other instruments or genres are listed, status must be unclear. Recognize reasonable equivalents. A CV address is not a travel preference. Portfolio materials available on request are not performance experience; concrete dated live-performance history is performance experience.",
          }],
        },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ criteria, cv_text: cvText }) }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: "minimal" },
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      }),
    });
    payload = await response.json();
    if (response.ok) break;
    if (![408, 429].includes(response.status) && response.status < 500 || attempt === 3) {
      const providerMessage = String(payload?.error?.message || "request_failed")
        .replace(/AIza[0-9A-Za-z_-]+/g, "[key redacted]")
        .slice(0, 800);
      throw new Error(`Gemini ${model} returned HTTP ${response.status}: ${payload?.error?.status || "request_failed"}: ${providerMessage}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("\n");
  return { model, output: JSON.parse(text), finishReason: payload?.candidates?.[0]?.finishReason || null };
}

const primary = await review(primaryModel);
const hasExplicitEvidenceContradiction = (item) => (item.evidence || []).some((entry) =>
  /\b(never|refuses?|will not|won't|does not play|doesn't play|cannot|can't)\b/i.test(String(entry.observation || "")),
);
const needsFallback = primary.output.criteria.some((item) =>
  item.status === "unclear" || (item.status === "not_supported" && !hasExplicitEvidenceContradiction(item)),
) ||
  criteria.some((criterion) => !primary.output.criteria.some((item) => item.criterion === criterion.key));
let selected = primary;
let fallbackAttempted = false;
let fallbackError = null;
if (needsFallback) {
  fallbackAttempted = true;
  try {
    selected = await review(fallbackModel);
  } catch (error) {
    // Production retains the parseable primary response and applies deterministic
    // validation when the optional escalation cannot return structured output.
    fallbackError = String(error?.message || error)
      .replace(/AIza[0-9A-Za-z_-]+/g, "[key redacted]")
      .slice(0, 300);
  }
}
const explicitContradiction = (item) => {
  return hasExplicitEvidenceContradiction(item);
};
const validatedCriteria = selected.output.criteria.map((item) =>
  item.status === "not_supported" && !explicitContradiction(item)
    ? { ...item, status: "unclear", short_reason: "The CV does not clearly confirm or contradict this requirement." }
    : item,
);
const byCriterion = new Map(validatedCriteria.map((item) => [item.criterion, item]));

assert.equal(selected.output.document.status, "cv");
assert.equal(byCriterion.get("performance_experience")?.status, "supported");
assert.equal(byCriterion.get("instrument_requirement")?.status, "unclear");
assert.equal(byCriterion.get("genre_requirement")?.status, "unclear");
assert.notEqual(
  String(selected.output.document.candidate_name || "").trim().toLowerCase(),
  "neil ardrey laza",
);

const sanitizedOutput = {
  model: selected.model,
  fallback_attempted: fallbackAttempted,
  fallback_used: selected.model !== primary.model,
  fallback_error: fallbackError,
  finish_reason: selected.finishReason,
  document: {
    ...selected.output.document,
    candidate_name: "[redacted: differs from application name]",
  },
  raw_criteria: selected.output.criteria,
  validated_criteria: validatedCriteria,
  summary: selected.output.summary,
  limitations: selected.output.limitations,
};

console.log(JSON.stringify(sanitizedOutput, null, 2));
