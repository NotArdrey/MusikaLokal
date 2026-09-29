import assert from "node:assert/strict";

const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
const videoUrl = String(process.env.TEST_VIDEO_URL || "").trim();
if (!apiKey) throw new Error("GEMINI_API_KEY is required");
if (!videoUrl) throw new Error("TEST_VIDEO_URL is required");

const apiBase = "https://generativelanguage.googleapis.com";
const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const lifecycle = { video_submitted: true, file_uploaded: false, file_active: false, analysis_successful: false };

const findingSchema = {
  type: "object",
  properties: {
    criterion: { type: "string" },
    status: { type: "string", enum: ["supported", "not_supported", "unclear"] },
    source: { type: "string", enum: ["performance_video"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          source: { type: "string", enum: ["performance_video"] },
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
    performance_visible: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    performer_count: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    visible_instruments: { type: "array", items: { type: "string" }, maxItems: 12 },
    singing_present: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    performance_evidence: { type: "string", enum: ["supported", "not_supported", "unclear"] },
    observations: { type: "array", items: { type: "string" }, maxItems: 8 },
    criterion_findings: { type: "array", items: findingSchema },
  },
  required: ["performance_visible", "performer_count", "visible_instruments", "singing_present", "performance_evidence", "observations", "criterion_findings"],
  additionalProperties: false,
};

async function checkedFetch(url, init, operation) {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), "x-goog-api-key": apiKey },
  });
  if (response.ok) return response;
  const payload = await response.json().catch(() => ({}));
  const status = String(payload?.error?.status || "request_failed");
  throw new Error(`${operation} returned HTTP ${response.status}: ${status}`);
}

async function uploadVideo() {
  const download = await fetch(videoUrl);
  if (!download.ok) throw new Error(`video_download returned HTTP ${download.status}`);
  const blob = await download.blob();
  assert.ok(blob.size > 0, "The existing video fixture must not be empty");
  const mimeType = blob.type || "video/mp4";
  const start = await checkedFetch(`${apiBase}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(blob.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
    },
    body: JSON.stringify({ file: { displayName: "musikalokal-existing-video-regression" } }),
  }, "video_upload_start");
  const uploadUrl = start.headers.get("x-goog-upload-url");
  assert.ok(uploadUrl, "Gemini must return a resumable upload URL");
  const uploaded = await checkedFetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: blob,
  }, "video_upload");
  let file = (await uploaded.json())?.file;
  assert.ok(file?.name, "Gemini must return a file reference");
  lifecycle.file_uploaded = true;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const state = String(file?.state || "").toUpperCase();
    if (state === "ACTIVE") {
      lifecycle.file_active = true;
      return { file, mimeType };
    }
    if (state === "FAILED") throw new Error("Gemini file processing failed");
    await sleep(Math.min(1_000 * (2 ** Math.min(attempt, 3)), 8_000));
    const polled = await checkedFetch(`${apiBase}/v1beta/${file.name}`, { method: "GET" }, "video_file_status");
    file = await polled.json();
  }
  throw new Error("Gemini file processing timed out");
}

function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

async function analyze(model, file, mimeType) {
  const response = await checkedFetch(
    `${apiBase}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "Review this submitted performance video only for observable or audible musical-performance facts. Never identify people, infer protected traits, rate talent, calculate a score, rank, accept, or reject. Use null or unclear instead of guessing. Direct musical performance is supported only when visible or audible in the video. Return concise neutral observations." }],
        },
        contents: [{
          role: "user",
          parts: [
            { text: JSON.stringify({ criteria: [
              { key: "instrument_requirement", requirement: "Bass" },
              { key: "genre_requirement", requirement: "Jazz" },
              { key: "portfolio_requirement", requirement: "Submitted performance video contains direct musical-performance evidence" },
            ] }) },
            { fileData: { mimeType, fileUri: file.uri } },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: "minimal" },
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      }),
    },
    `video_analysis_${model}`,
  );
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || "").join("\n");
  return { model, output: parseJson(text), finish_reason: payload?.candidates?.[0]?.finishReason || null };
}

function outputNeedsFallback(value) {
  const findings = Array.isArray(value?.criterion_findings) ? value.criterion_findings : [];
  const inconsistent = value?.performance_evidence === "supported" && value?.performance_visible === false;
  return inconsistent || value?.performance_evidence === "unclear" || findings.length === 0 || findings.some((item) => item?.status === "unclear");
}

let uploadedFile = null;
let result = null;
let primary = null;
let fallbackAttempted = false;
let fallbackError = null;
let technicalError = null;
try {
  uploadedFile = await uploadVideo();
  try {
    primary = await analyze(primaryModel, uploadedFile.file, uploadedFile.mimeType);
  } catch (error) {
    fallbackAttempted = true;
    result = await analyze(fallbackModel, uploadedFile.file, uploadedFile.mimeType);
    fallbackError = `primary_failed: ${String(error?.message || error).slice(0, 180)}`;
  }
  if (!result && outputNeedsFallback(primary.output)) {
    fallbackAttempted = true;
    try {
      result = await analyze(fallbackModel, uploadedFile.file, uploadedFile.mimeType);
    } catch (error) {
      fallbackError = String(error?.message || error).slice(0, 180);
      result = primary;
    }
  }
  result ||= primary;
  lifecycle.analysis_successful = true;
} catch (error) {
  technicalError = String(error?.message || error).slice(0, 240);
} finally {
  if (uploadedFile?.file?.name) {
    await checkedFetch(`${apiBase}/v1beta/${uploadedFile.file.name}`, { method: "DELETE" }, "video_file_delete").catch(() => null);
  }
}

assert.equal(lifecycle.video_submitted, true);
assert.equal(lifecycle.file_uploaded, true);
assert.equal(lifecycle.file_active, true);
assert.equal(lifecycle.analysis_successful, true, technicalError || "Gemini video analysis did not complete");
assert.ok(result?.output, "Gemini must return structured video analysis");

console.log(JSON.stringify({
  ...lifecycle,
  primary_model: primaryModel,
  selected_model: result.model,
  fallback_attempted: fallbackAttempted,
  fallback_used: result.model !== primaryModel,
  fallback_error: fallbackError,
  finish_reason: result.finish_reason,
  structured_output: result.output,
  acrcloud_context: "not exercised by this isolated Gemini Files API regression",
  technical_error: technicalError,
}, null, 2));
