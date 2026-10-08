// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_VIDEO_BYTES = 18 * 1024 * 1024;
const MAX_VIDEO_FILE_BYTES =
  Math.max(20, Number(Deno.env.get("GEMINI_MAX_VIDEO_MB") || "96")) * 1024 * 1024;
const GROQ_MODEL = Deno.env.get("GROQ_TEXT_MODEL") || "llama-3.3-70b-versatile";
const GEMINI_MODEL = Deno.env.get("GEMINI_VIDEO_MODEL") || "gemini-2.5-flash";

const ALLOWED_RECOMMENDATIONS = new Set([
  "strong_match",
  "good_match",
  "needs_review",
  "not_recommended",
  "insufficient_info",
]);

type ReviewResult = {
  status?: string;
  recommendation: string;
  confidence: number | null;
  summary: string;
  reasons: string[];
  concerns: string[];
  missing_info: string[];
  raw?: Record<string, unknown>;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractAccessToken(authHeader: string): string | null {
  const trimmed = (authHeader || "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim() || null;
  }
  return trimmed;
}

function trimText(value: unknown, maxLength = 12000) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => trimText(item, 240))
        .filter((item) => item.length > 0),
    ),
  ).slice(0, 8);
}

function normalizeRecommendation(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return ALLOWED_RECOMMENDATIONS.has(normalized) ? normalized : "needs_review";
}

function normalizeConfidence(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
}

function parseJsonFromText(rawText: string): Record<string, unknown> {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!objectMatch) return {};
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return {};
    }
  }
}

function normalizeReview(raw: Record<string, unknown>, fallbackSummary: string): ReviewResult {
  return {
    recommendation: normalizeRecommendation(raw.recommendation),
    confidence: normalizeConfidence(raw.confidence),
    summary: trimText(raw.summary || fallbackSummary, 1000),
    reasons: normalizeArray(raw.reasons),
    concerns: normalizeArray(raw.concerns),
    missing_info: normalizeArray(raw.missing_info),
    raw,
  };
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? trimText(value, 320) : ""))
        .filter(Boolean),
    ),
  );
}

function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Provider request failed");
  if (message.toLowerCase().includes("api key not valid")) {
    return "Gemini API key is invalid.";
  }
  return trimText(message, 320);
}

function firstNonEmpty(...values: unknown[]) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0) || null;
}

function inferMimeType(url: string, fallback: string) {
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".txt")) return "text/plain";
  return fallback;
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractBasicPdfText(buffer: ArrayBuffer) {
  const raw = new TextDecoder("latin1").decode(new Uint8Array(buffer));
  const parts: string[] = [];
  const literalTextRegex = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  const arrayTextRegex = /\[(.*?)\]\s*TJ/gs;

  for (const match of raw.matchAll(literalTextRegex)) {
    const literal = match[0].replace(/\)\s*Tj$/, "").slice(1);
    const text = decodePdfLiteral(literal);
    if (text.trim().length > 1) parts.push(text);
  }

  for (const match of raw.matchAll(arrayTextRegex)) {
    const arrayBody = match[1] || "";
    for (const literal of arrayBody.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      const text = decodePdfLiteral(literal[0].slice(1, -1));
      if (text.trim().length > 1) parts.push(text);
    }
  }

  const combined = parts.join(" ");
  if (combined.trim().length > 80) return trimText(combined, 12000);

  const printableFallback = raw
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return trimText(printableFallback, 4000);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fetchLimitedBuffer(url: string, maxBytes: number) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch file: ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new Error(`File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] || null;
  return { buffer, contentType };
}

async function extractDocumentText(url: string | null) {
  if (!url) {
    return {
      text: "",
      summary: "No CV or resume file was submitted.",
      extraction_method: "none",
      concerns: ["No CV or resume was provided."],
    };
  }

  try {
    const { buffer, contentType } = await fetchLimitedBuffer(url, MAX_DOCUMENT_BYTES);
    const mimeType = contentType || inferMimeType(url, "application/octet-stream");

    if (mimeType.includes("pdf") || url.toLowerCase().split("?")[0].endsWith(".pdf")) {
      const text = extractBasicPdfText(buffer);
      return {
        text,
        summary: text ? "Extracted text from the uploaded PDF resume." : "The PDF could not be read clearly.",
        extraction_method: "basic_pdf_text",
        concerns: text ? [] : ["The CV PDF did not expose readable text."],
      };
    }

    if (mimeType.startsWith("text/") || mimeType.includes("json")) {
      const text = trimText(new TextDecoder().decode(new Uint8Array(buffer)), 12000);
      return {
        text,
        summary: "Read the uploaded text-based CV or resume file.",
        extraction_method: "text_file",
        concerns: [],
      };
    }

    return {
      text: "",
      summary: `CV file type ${mimeType} is not text-extractable in this reviewer.`,
      extraction_method: "unsupported_file_type",
      concerns: [`CV file type ${mimeType} could not be reviewed as text.`],
    };
  } catch (error) {
    return {
      text: "",
      summary: "The CV or resume could not be fetched for review.",
      extraction_method: "fetch_failed",
      concerns: [error instanceof Error ? error.message : "Unable to fetch CV or resume."],
    };
  }
}

async function loadApplicationContext(supabaseAdmin: any, applicationId: string) {
  const { data: application, error: applicationError } = await supabaseAdmin
    .from("gig_applications")
    .select(
      `
        id,
        applicant_id,
        submitted_by_user_id,
        group_id,
        gig_id,
        pitch_message,
        video_url,
        cv_url,
        slot_type,
        status,
        created_at,
        applicant:profiles!applicant_id(id, full_name, role, bio, location, is_verified),
        submitter:profiles!submitted_by_user_id(id, full_name, role),
        group:groups!group_id(id, name, genre, description, location, group_type),
        production_team:production_team_id(id, name),
        production_roster:production_roster_id(
          id,
          entity_kind,
          roster_profile:profile_id(id, full_name, role, bio, location, is_verified),
          roster_group:group_id(id, name, genre, description, location, group_type)
        ),
        gig:gigs!gig_id(id, organizer_id, name, location, budget, rate, description, event_date, status)
      `,
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (applicationError) throw applicationError;
  if (!application) throw new HttpError(404, "Application not found");

  const profileIds = uniqueStrings([
    application.applicant?.id,
    application.production_roster?.roster_profile?.id,
  ]);
  const groupIds = uniqueStrings([
    application.group?.id,
    application.production_roster?.roster_group?.id,
  ]);

  const [requirementsResult, profileLegacyResult, groupLegacyResult] = await Promise.all([
    supabaseAdmin
      .from("gig_requirements")
      .select("requirement_key, requirement_value")
      .eq("gig_id", application.gig_id)
      .order("created_at", { ascending: true }),
    profileIds.length > 0
      ? supabaseAdmin
        .from("profiles_legacy_projection")
        .select("id, skills, genres, portfolio_urls")
        .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? supabaseAdmin
        .from("groups_legacy_projection")
        .select("id, members")
        .in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (requirementsResult.error) throw requirementsResult.error;
  if (profileLegacyResult.error) throw profileLegacyResult.error;
  if (groupLegacyResult.error) throw groupLegacyResult.error;

  const profileLegacyById = new Map(
    (profileLegacyResult.data || []).map((row: any) => [row.id, row]),
  );
  const groupLegacyById = new Map(
    (groupLegacyResult.data || []).map((row: any) => [row.id, row]),
  );

  const applicantLegacy = profileLegacyById.get(application.applicant?.id) || {};
  const rosterProfileLegacy = profileLegacyById.get(application.production_roster?.roster_profile?.id) || {};
  const groupLegacy =
    groupLegacyById.get(application.group?.id) ||
    groupLegacyById.get(application.production_roster?.roster_group?.id) ||
    {};

  return {
    application,
    requirements: requirementsResult.data || [],
    applicantLegacy,
    rosterProfileLegacy,
    groupLegacy,
  };
}

function buildReviewContext(context: any, documentInfo: any) {
  const application = context.application;
  const applicant = application.production_roster?.roster_profile || application.applicant || {};
  const group = application.production_roster?.roster_group || application.group || null;
  const applicantLegacy = application.production_roster?.roster_profile
    ? context.rosterProfileLegacy
    : context.applicantLegacy;

  return {
    gig: {
      name: application.gig?.name || null,
      location: application.gig?.location || null,
      budget: application.gig?.budget || application.gig?.rate || null,
      description: trimText(application.gig?.description, 2500),
      event_date: application.gig?.event_date || null,
      status: application.gig?.status || null,
      requirements: context.requirements.map((requirement: any) => ({
        key: requirement.requirement_key,
        value: requirement.requirement_value,
      })),
    },
    applicant: {
      name: firstNonEmpty(group?.name, applicant.full_name, application.production_team?.name),
      role: applicant.role || null,
      bio: trimText(applicant.bio, 1500),
      location: applicant.location || group?.location || null,
      is_verified: applicant.is_verified === true,
      skills: Array.isArray(applicantLegacy.skills) ? applicantLegacy.skills : [],
      genres: Array.isArray(applicantLegacy.genres) ? applicantLegacy.genres : [],
      portfolio_urls: Array.isArray(applicantLegacy.portfolio_urls) ? applicantLegacy.portfolio_urls : [],
      group: group
        ? {
          name: group.name || null,
          genre: group.genre || null,
          description: trimText(group.description, 1500),
          group_type: group.group_type || null,
          members: Array.isArray(context.groupLegacy.members) ? context.groupLegacy.members : [],
        }
        : null,
      production_team: application.production_team?.name || null,
    },
    application: {
      pitch_message: trimText(application.pitch_message, 2500),
      slot_type: application.slot_type || null,
      submitted_at: application.created_at || null,
      has_video: Boolean(application.video_url),
      has_cv: Boolean(application.cv_url),
      cv_extraction_method: documentInfo.extraction_method,
      cv_text: trimText(documentInfo.text, 9000),
    },
  };
}

async function callGroqJson(messages: Array<Record<string, string>>) {
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";
  if (!groqKey) throw new Error("Missing GROQ_API_KEY");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq request failed (${response.status}): ${trimText(body, 500)}`);
  }

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content || "";
  return parseJsonFromText(text);
}

async function reviewTextAndPdf(reviewContext: any, documentInfo: any): Promise<ReviewResult> {
  const raw = await callGroqJson([
    {
      role: "system",
      content:
        "You help a Gig User evaluate an applicant. You only recommend; the Gig User makes the final decision. Return valid JSON only.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task:
          "Review the applicant's pitch, profile, group/production context, gig requirements, and any extracted CV/PDF text. Do not invent facts. Use recommendation: strong_match, good_match, needs_review, not_recommended, or insufficient_info. Confidence must be 0 to 1. Include short reasons, concerns, and missing_info arrays.",
        context: reviewContext,
        document_fetch_summary: documentInfo.summary,
        document_fetch_concerns: documentInfo.concerns,
      }),
    },
  ]);

  const review = normalizeReview(raw, "Text and CV review completed.");
  review.concerns = uniqueStrings([...review.concerns, ...(documentInfo.concerns || [])]);
  return review;
}

function getGeminiKeys() {
  return uniqueStrings([
    Deno.env.get("GEMINI_API_KEY"),
    Deno.env.get("GEMINI_API_KEY_FALLBACK_1"),
    Deno.env.get("GEMINI_API_KEY_FALLBACK_2"),
    Deno.env.get("GEMINI_API_KEY_2"),
    Deno.env.get("GEMINI_API_KEY_3"),
  ]);
}

async function callGeminiVideoJson(params: {
  prompt: string;
  mimeType: string;
  buffer: ArrayBuffer;
}) {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error("Missing GEMINI_API_KEY");

  let lastError: Error | null = null;
  for (const key of keys) {
    let uploadedFile: any = null;
    try {
      const videoPart =
        params.buffer.byteLength <= MAX_INLINE_VIDEO_BYTES
          ? {
            inline_data: {
              mime_type: params.mimeType,
              data: arrayBufferToBase64(params.buffer),
            },
          }
          : {
            file_data: await (async () => {
              uploadedFile = await uploadGeminiFile(key, params.buffer, params.mimeType);
              return {
                mime_type: uploadedFile.mimeType || uploadedFile.mime_type || params.mimeType,
                file_uri: uploadedFile.uri,
              };
            })(),
          };

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: params.prompt },
                  videoPart,
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastError = new Error(`Gemini request failed (${response.status}): ${trimText(body, 500)}`);
        if (![401, 403, 429, 500, 502, 503, 504].includes(response.status)) break;
        continue;
      }

      const payload = await response.json();
      const text =
        payload?.candidates?.[0]?.content?.parts
          ?.map((part: any) => part?.text)
          .filter(Boolean)
          .join("\n") || "";

      return parseJsonFromText(text);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini request failed");
      continue;
    } finally {
      if (uploadedFile?.name) {
        await deleteGeminiFile(key, uploadedFile.name).catch(() => {});
      }
    }
  }

  throw lastError || new Error("Gemini request failed");
}

async function uploadGeminiFile(apiKey: string, buffer: ArrayBuffer, mimeType: string) {
  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buffer.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: {
          display_name: `gig-application-video-${Date.now()}`,
        },
      }),
    },
  );

  if (!startResponse.ok) {
    const body = await startResponse.text().catch(() => "");
    throw new Error(`Gemini upload start failed (${startResponse.status}): ${trimText(body, 500)}`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload URL was not returned");

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buffer.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    const body = await uploadResponse.text().catch(() => "");
    throw new Error(`Gemini upload failed (${uploadResponse.status}): ${trimText(body, 500)}`);
  }

  const payload = await uploadResponse.json();
  let file = payload?.file || payload;
  if (!file?.name || !file?.uri) throw new Error("Gemini upload did not return a file URI");

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const state = String(file?.state || "").toUpperCase();
    if (!state || state === "ACTIVE") return file;
    if (state === "FAILED") throw new Error("Gemini video processing failed");

    await new Promise((resolve) => setTimeout(resolve, 5000));
    const getResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`,
    );
    if (!getResponse.ok) {
      const body = await getResponse.text().catch(() => "");
      throw new Error(`Gemini file polling failed (${getResponse.status}): ${trimText(body, 500)}`);
    }
    const getPayload = await getResponse.json();
    file = getPayload?.file || getPayload;
  }

  throw new Error("Gemini video processing timed out");
}

async function deleteGeminiFile(apiKey: string, fileName: string) {
  await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`,
    { method: "DELETE" },
  );
}

async function reviewVideo(reviewContext: any, videoUrl: string | null): Promise<ReviewResult> {
  if (!videoUrl) {
    return {
      status: "skipped",
      recommendation: "insufficient_info",
      confidence: null,
      summary: "No audition video was submitted.",
      reasons: [],
      concerns: ["No audition video was provided."],
      missing_info: ["Audition video"],
      raw: {},
    };
  }

  try {
    const { buffer, contentType } = await fetchLimitedBuffer(videoUrl, MAX_VIDEO_FILE_BYTES);
    const mimeType = contentType || inferMimeType(videoUrl, "video/mp4");
    const raw = await callGeminiVideoJson({
      mimeType,
      buffer,
      prompt: JSON.stringify({
        task:
          "Review this applicant audition video for the gig. Focus on visible performance quality, professionalism, stage presence, audio/musical cues if present, and fit for the gig requirements. Do not identify protected traits. Do not make the final decision. Return JSON only with recommendation, confidence, summary, reasons, concerns, missing_info.",
        allowed_recommendations: [
          "strong_match",
          "good_match",
          "needs_review",
          "not_recommended",
          "insufficient_info",
        ],
        context: {
          gig: reviewContext.gig,
          applicant: {
            name: reviewContext.applicant.name,
            role: reviewContext.applicant.role,
            group_type: reviewContext.applicant.group?.group_type || null,
          },
          application: {
            slot_type: reviewContext.application.slot_type,
          },
        },
      }),
    });

    return {
      ...normalizeReview(raw, "Video review completed."),
      status: "completed",
    };
  } catch (error) {
    return {
      status: "skipped",
      recommendation: "insufficient_info",
      confidence: null,
      summary: "The audition video could not be reviewed automatically.",
      reasons: [],
      concerns: [sanitizeProviderError(error)],
      missing_info: ["Review video manually"],
      raw: {},
    };
  }
}

function scoreForRecommendation(recommendation: string) {
  switch (recommendation) {
    case "strong_match":
      return 4;
    case "good_match":
      return 3;
    case "needs_review":
      return 2;
    case "insufficient_info":
      return 1;
    case "not_recommended":
      return 0;
    default:
      return 2;
  }
}

function recommendationForScore(score: number) {
  if (score >= 3.55) return "strong_match";
  if (score >= 2.65) return "good_match";
  if (score >= 1.4) return "needs_review";
  if (score >= 0.75) return "insufficient_info";
  return "not_recommended";
}

function combineReviews(textReview: ReviewResult, videoReview: ReviewResult): ReviewResult {
  const textConfidence = textReview.confidence ?? 0.55;
  const videoWasReviewed = videoReview.status === "completed";
  const videoConfidence = videoWasReviewed ? videoReview.confidence ?? 0.55 : 0;
  const textWeight = 0.62;
  const videoWeight = videoWasReviewed ? 0.38 : 0;
  const totalWeight = textWeight + videoWeight;
  const averageScore =
    (scoreForRecommendation(textReview.recommendation) * textWeight +
      scoreForRecommendation(videoReview.recommendation) * videoWeight) /
    Math.max(totalWeight, 0.01);

  let recommendation = recommendationForScore(averageScore);
  const strongConcern =
    (textReview.recommendation === "not_recommended" && textConfidence >= 0.72) ||
    (videoReview.recommendation === "not_recommended" && videoConfidence >= 0.72);

  if (strongConcern) recommendation = "not_recommended";
  if (!videoWasReviewed && textReview.recommendation === "insufficient_info") {
    recommendation = "insufficient_info";
  }

  const confidenceValues = [textReview.confidence, videoWasReviewed ? videoReview.confidence : null]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const confidence = confidenceValues.length > 0
    ? Math.round(
      (confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) * 100,
    ) / 100
    : null;

  const summaryParts = [
    textReview.summary ? `Text/PDF: ${textReview.summary}` : "",
    videoReview.summary ? `Video: ${videoReview.summary}` : "",
  ].filter(Boolean);

  return {
    recommendation,
    confidence,
    summary: trimText(summaryParts.join(" "), 1200),
    reasons: uniqueStrings([...textReview.reasons, ...videoReview.reasons]).slice(0, 8),
    concerns: uniqueStrings([...textReview.concerns, ...videoReview.concerns]).slice(0, 8),
    missing_info: uniqueStrings([...textReview.missing_info, ...videoReview.missing_info]).slice(0, 8),
  };
}

async function getRequester(
  supabaseAdmin: any,
  authHeader: string,
  serviceRoleKey: string,
  adminReviewTokenHeader: string | null,
) {
  const adminReviewToken = Deno.env.get("AI_REVIEW_ADMIN_TOKEN") || "";
  if (adminReviewToken && adminReviewTokenHeader && adminReviewTokenHeader === adminReviewToken) {
    return { user: null, isServiceRole: true };
  }

  const accessToken = extractAccessToken(authHeader);
  if (!accessToken) return { user: null, isServiceRole: false };
  if (accessToken === serviceRoleKey) return { user: null, isServiceRole: true };

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) throw new HttpError(401, "Invalid token");
  return { user: data.user, isServiceRole: false };
}

async function getAccess(supabaseAdmin: any, context: any, requester: any) {
  if (requester.isServiceRole) {
    return { canTrigger: true, canReadResult: true };
  }

  const userId = requester.user?.id || null;
  if (!userId) return { canTrigger: false, canReadResult: false };

  const application = context.application;
  const isOrganizer = application.gig?.organizer_id === userId;
  const isApplicant =
    application.applicant_id === userId || application.submitted_by_user_id === userId;
  const { data: staffCanRead } = await supabaseAdmin.rpc("staff_can_read_gig", {
    p_user_id: userId,
    p_gig_id: application.gig_id,
  });
  const isStaff = staffCanRead === true;

  return {
    canTrigger: isOrganizer || isStaff || isApplicant,
    canReadResult: isOrganizer || isStaff,
  };
}

async function shouldSkipExistingReview(supabaseAdmin: any, applicationId: string, force: boolean) {
  if (force) return null;
  const { data, error } = await supabaseAdmin
    .from("gig_application_ai_reviews")
    .select("*")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (data.status === "completed") return data;
  if (data.status === "running") {
    const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
    if (updatedAt && Date.now() - updatedAt < 5 * 60 * 1000) return data;
  }

  return null;
}

async function reviewApplication(params: {
  supabaseAdmin: any;
  applicationId: string;
  requester: any;
  requestedBy: string | null;
  force: boolean;
}) {
  const context = await loadApplicationContext(params.supabaseAdmin, params.applicationId);
  const access = await getAccess(params.supabaseAdmin, context, params.requester);
  if (!access.canTrigger) throw new HttpError(403, "Forbidden");

  const existing = await shouldSkipExistingReview(
    params.supabaseAdmin,
    params.applicationId,
    params.force,
  );
  if (existing) {
    return { review: existing, canReadResult: access.canReadResult, reused: true };
  }

  const application = context.application;
  await params.supabaseAdmin
    .from("gig_application_ai_reviews")
    .upsert(
      {
        application_id: application.id,
        gig_id: application.gig_id,
        applicant_id: application.applicant_id,
        status: "running",
        requested_by: params.requestedBy || params.requester.user?.id || null,
        error_message: null,
      },
      { onConflict: "application_id" },
    );

  try {
    const documentInfo = await extractDocumentText(application.cv_url || null);
    const reviewContext = buildReviewContext(context, documentInfo);
    const [textReview, videoReview] = await Promise.all([
      reviewTextAndPdf(reviewContext, documentInfo),
      reviewVideo(reviewContext, application.video_url || null),
    ]);
    const combined = combineReviews(textReview, videoReview);

    const updatePayload = {
      status: "completed",
      recommendation: combined.recommendation,
      confidence: combined.confidence,
      summary: combined.summary,
      text_pdf_summary: textReview.summary,
      video_summary: videoReview.summary,
      reasons: combined.reasons,
      concerns: combined.concerns,
      missing_info: combined.missing_info,
      text_pdf_review: {
        recommendation: textReview.recommendation,
        confidence: textReview.confidence,
        summary: textReview.summary,
        reasons: textReview.reasons,
        concerns: textReview.concerns,
        missing_info: textReview.missing_info,
        raw: textReview.raw || {},
      },
      video_review: {
        status: videoReview.status || "completed",
        recommendation: videoReview.recommendation,
        confidence: videoReview.confidence,
        summary: videoReview.summary,
        reasons: videoReview.reasons,
        concerns: videoReview.concerns,
        missing_info: videoReview.missing_info,
        raw: videoReview.raw || {},
      },
      raw_response: {
        text_pdf: textReview.raw || {},
        video: videoReview.raw || {},
        combined,
      },
      error_message: null,
      model_text: GROQ_MODEL,
      model_video: videoReview.status === "completed" ? GEMINI_MODEL : null,
      completed_at: new Date().toISOString(),
    };

    const { data: review, error } = await params.supabaseAdmin
      .from("gig_application_ai_reviews")
      .update(updatePayload)
      .eq("application_id", application.id)
      .select("*")
      .single();

    if (error) throw error;
    return { review, canReadResult: access.canReadResult, reused: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI review failed";
    const { data: review } = await params.supabaseAdmin
      .from("gig_application_ai_reviews")
      .update({
        status: "failed",
        recommendation: "needs_review",
        confidence: null,
        summary: "AI review failed. Please review this applicant manually.",
        concerns: [errorMessage],
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("application_id", application.id)
      .select("*")
      .maybeSingle();

    return { review, canReadResult: access.canReadResult, reused: false };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const requester = await getRequester(
      supabaseAdmin,
      req.headers.get("Authorization") || "",
      serviceRoleKey,
      req.headers.get("x-ai-review-admin-token"),
    );

    const body = await req.json().catch(() => ({}));
    const action = body.action || "review_application";

    if (action === "process_pending") {
      if (!requester.isServiceRole) throw new HttpError(403, "Forbidden");

      const limit = Math.min(Math.max(Number(body.limit || 5), 1), 20);
      const { data: applications, error } = await supabaseAdmin
        .from("gig_applications")
        .select("id")
        .in("status", ["pending", "accepted", "approved"])
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const results = [];
      for (const application of applications || []) {
        const result = await reviewApplication({
          supabaseAdmin,
          applicationId: application.id,
          requester,
          requestedBy: body.requested_by || null,
          force: body.force === true,
        });
        results.push({
          application_id: application.id,
          status: result.review?.status || null,
          recommendation: result.review?.recommendation || null,
          reused: result.reused,
        });
      }

      return jsonResponse({ success: true, processed: results.length, results });
    }

    if (action !== "review_application") {
      return jsonResponse({ error: "Unknown action" }, 400);
    }

    const applicationId = body.application_id || body.applicationId;
    if (!applicationId) {
      return jsonResponse({ error: "application_id is required" }, 400);
    }

    const result = await reviewApplication({
      supabaseAdmin,
      applicationId,
      requester,
      requestedBy: body.requested_by || null,
      force: body.force === true,
    });

    if (!result.canReadResult) {
      return jsonResponse({
        success: true,
        status: result.review?.status || "completed",
      });
    }

    return jsonResponse({
      success: true,
      review: result.review,
      reused: result.reused,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("review_gig_application_error", { status, message });
    return jsonResponse({ error: message }, status);
  }
});
