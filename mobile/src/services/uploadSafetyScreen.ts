import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

export type UploadSafetyKind = "photo" | "document" | "video" | "audio";

export interface UploadSafetyFileInput {
  name: string;
  mimeType?: string;
  size?: number;
  uri?: string;
  contentDataUrl?: string;
  kind: UploadSafetyKind;
}

export interface UploadSafetyScreeningSummary {
  allowed: boolean;
  reason?: string;
  blockedCount: number;
}

export type UploadSafetyCopyrightStatus = "not_required" | "pending_review" | "approved" | "declined";

export interface UploadSafetyFileDecision {
  input: UploadSafetyFileInput;
  allowed: boolean;
  reason?: string;
  requiresAdminReview?: boolean;
  publiclyAvailable?: boolean;
  copyrightStatus?: UploadSafetyCopyrightStatus;
  copyrightReviewId?: string | null;
  copyrightTrackKey?: string | null;
  copyrightMetadata?: Record<string, unknown>;
}

interface CachedUploadSafetyDecision {
  allowed: boolean;
  reason?: string;
  requiresAdminReview?: boolean;
  publiclyAvailable?: boolean;
  copyrightStatus?: UploadSafetyCopyrightStatus;
  copyrightReviewId?: string | null;
  copyrightTrackKey?: string | null;
  copyrightMetadata?: Record<string, unknown>;
  reviewedAt: number;
  expiresAt: number;
}

interface RemoteUploadSafetyResult {
  id?: string;
  fingerprint?: string;
  allowed?: boolean;
  reason?: string;
  requiresAdminReview?: boolean;
  publiclyAvailable?: boolean;
  copyrightStatus?: UploadSafetyCopyrightStatus;
  copyrightReviewId?: string | null;
  copyrightTrackKey?: string | null;
  copyrightMetadata?: Record<string, unknown>;
}

const SAFETY_CACHE_PREFIX = "upload_safety_screen:v11:";
const SAFETY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFETY_UNAVAILABLE_CACHE_TTL_MS = 5 * 60 * 1000;
const SAFETY_OWNERSHIP_REVIEW_CACHE_TTL_MS = 30 * 1000;
const SCREENING_FUNCTION_NAME = "upload-safety-screen";
const MAX_CANDIDATES_PER_REQUEST = 10;
const SCREENING_UNAVAILABLE_BLOCK_MESSAGE =
  "Safety check is temporarily unavailable. Please try again in a moment.";
const SAFETY_RATE_LIMIT_MESSAGE =
  "Safety check is busy. Please try again in a few seconds.";
const SAFETY_TIMEOUT_MESSAGE =
  "Safety check took too long. Please try again.";
const SAFETY_GENERIC_BLOCK_MESSAGE =
  "This media did not pass safety screening. Please choose another file.";
const AUDIO_COPYRIGHT_FALLBACK_MESSAGE =
  "This track appears to match a released recording. If this is your song, an ownership request has been sent to Identity Review for admin approval.";
const PROVIDER_ERROR_PATTERN =
  /\b(groq|openai|gemini|api error|visual review error|image safety screening failed|rate_limit|rate limit|429|tokens per minute|tpm|organization|service tier|billing|console\.groq\.com|internal server error)\b/i;
const TEMPORARY_BLOCK_REASON_PATTERN =
  /\b(temporarily unavailable|unavailable|busy|too long|timed out|timeout|try again|could not verify|failed|not configured|incomplete|did not return)\b/i;
const OWNERSHIP_REVIEW_REASON_PATTERN =
  /\b(ownership request|ownership review|identity review|admin approval)\b/i;
const AUDIO_COPYRIGHT_REASON_PATTERN =
  /this audio appears to match\s+(.+?)(?:;\s*(?:match score|rights owner|ISRC)|\. (?:Please upload|If this is your song)|$)/i;

const memoryDecisionCache = new Map<string, CachedUploadSafetyDecision>();
const inFlightDecisionCache = new Map<string, Promise<CachedUploadSafetyDecision>>();

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const clampSize = (size: unknown): number => {
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return 0;
  }
  return Math.floor(size);
};

const sanitizeUriTail = (uri?: string): string => {
  if (!uri) return "";
  const parts = uri.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/").toLowerCase();
};

const hashValue = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const getCacheKey = (input: UploadSafetyFileInput): string => {
  const payload = [
    input.kind,
    normalizeText(input.name),
    normalizeText(input.mimeType),
    clampSize(input.size),
    sanitizeUriTail(input.uri),
    input.contentDataUrl ? hashValue(input.contentDataUrl) : "",
  ].join("|");
  return `${SAFETY_CACHE_PREFIX}${hashValue(payload)}`;
};

const isDecisionExpired = (decision: CachedUploadSafetyDecision): boolean =>
  !decision.expiresAt || Date.now() > decision.expiresAt;

const getCachedDecision = async (
  cacheKey: string,
): Promise<CachedUploadSafetyDecision | null> => {
  const inMemory = memoryDecisionCache.get(cacheKey);
  if (inMemory && !isDecisionExpired(inMemory)) {
    return inMemory;
  }

  if (inMemory && isDecisionExpired(inMemory)) {
    memoryDecisionCache.delete(cacheKey);
  }

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedUploadSafetyDecision;
    if (!parsed || typeof parsed.allowed !== "boolean") {
      return null;
    }

    if (isDecisionExpired(parsed)) {
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }

    memoryDecisionCache.set(cacheKey, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const setCachedDecision = async (
  cacheKey: string,
  decision: CachedUploadSafetyDecision,
): Promise<void> => {
  memoryDecisionCache.set(cacheKey, decision);

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(decision));
  } catch {
    // Cache write failures should not block uploads.
  }
};

const buildRemoteDecision = (
  allowed: boolean,
  reason?: string,
  ttlMs: number = SAFETY_CACHE_TTL_MS,
  extra: Partial<CachedUploadSafetyDecision> = {},
): CachedUploadSafetyDecision => ({
  allowed,
  reason,
  ...extra,
  reviewedAt: Date.now(),
  expiresAt: Date.now() + ttlMs,
});

const getDecisionCacheTtlMs = (allowed: boolean, reason?: string, requiresAdminReview = false): number => {
  if (requiresAdminReview) {
    return SAFETY_OWNERSHIP_REVIEW_CACHE_TTL_MS;
  }

  if (allowed) {
    return SAFETY_CACHE_TTL_MS;
  }

  if (OWNERSHIP_REVIEW_REASON_PATTERN.test(reason || "")) {
    return SAFETY_OWNERSHIP_REVIEW_CACHE_TTL_MS;
  }

  return TEMPORARY_BLOCK_REASON_PATTERN.test(reason || "")
    ? SAFETY_UNAVAILABLE_CACHE_TTL_MS
    : SAFETY_CACHE_TTL_MS;
};

const parseRemoteResults = (data: unknown): RemoteUploadSafetyResult[] => {
  if (!data || typeof data !== "object") {
    return [];
  }

  const payload = data as Record<string, unknown>;
  const fromResults = payload.results;
  if (Array.isArray(fromResults)) {
    return fromResults as RemoteUploadSafetyResult[];
  }

  const fromFiles = payload.files;
  if (Array.isArray(fromFiles)) {
    return fromFiles as RemoteUploadSafetyResult[];
  }

  return [];
};

const formatAudioCopyrightReason = (reason: string): string => {
  const matchDescription = reason.match(AUDIO_COPYRIGHT_REASON_PATTERN)?.[1]?.trim();
  if (!matchDescription) {
    return AUDIO_COPYRIGHT_FALLBACK_MESSAGE;
  }

  return `This track appears to match ${matchDescription}. If this is your song, an ownership request has been sent to Identity Review for admin approval.`;
};

const sanitizeUploadSafetyReason = (rawReason?: string): string => {
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason) {
    return SAFETY_GENERIC_BLOCK_MESSAGE;
  }

  const lower = reason.toLowerCase();
  if (lower.includes("acrcloud")) {
    return reason;
  }
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("tokens per minute") ||
    lower.includes("tpm") ||
    lower.includes("try again in")
  ) {
    return SAFETY_RATE_LIMIT_MESSAGE;
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return SAFETY_TIMEOUT_MESSAGE;
  }

  if (lower.includes("this audio appears to match")) {
    return formatAudioCopyrightReason(reason);
  }

  if (PROVIDER_ERROR_PATTERN.test(reason) || reason.length > 220) {
    return SCREENING_UNAVAILABLE_BLOCK_MESSAGE;
  }

  return reason;
};

const resolveDecisionReason = (input: UploadSafetyFileInput, rawReason?: string): string => {
  const reason = sanitizeUploadSafetyReason(
    typeof rawReason === "string" && rawReason.trim().length > 0
      ? rawReason
      : "This file does not comply with Musika Lokal safety guidelines.",
  );

  if (
    reason.toLowerCase().includes("guideline") ||
    reason.toLowerCase().includes("this track appears to match") ||
    reason === AUDIO_COPYRIGHT_FALLBACK_MESSAGE ||
    reason === SAFETY_RATE_LIMIT_MESSAGE ||
    reason === SAFETY_TIMEOUT_MESSAGE ||
    reason === SCREENING_UNAVAILABLE_BLOCK_MESSAGE ||
    reason === SAFETY_GENERIC_BLOCK_MESSAGE
  ) {
    return reason;
  }

  return `${input.name} was blocked by safety screening. ${reason}`;
};

const screenChunkWithRemoteAi = async (
  chunk: { cacheKey: string; input: UploadSafetyFileInput }[],
  contextTag?: string,
): Promise<void> => {
  const { data, error } = await supabase.functions.invoke(SCREENING_FUNCTION_NAME, {
    body: {
      context: contextTag || "add_edit_upload",
      files: chunk.map(({ cacheKey, input }) => ({
        id: cacheKey,
        fileName: input.name,
        mimeType: input.mimeType || null,
        fileSize: clampSize(input.size),
        kind: input.kind,
        contentDataUrl: input.contentDataUrl || null,
      })),
    },
  });

  if (error) {
    console.error("[UploadSafetyScreen] invoke_failed", {
      message: error.message,
      status: (error as any).status,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      context: contextTag || "add_edit_upload",
      fileNames: chunk.map((item) => item.input.name),
    });
    throw new Error(SCREENING_UNAVAILABLE_BLOCK_MESSAGE);
  }

  const parsedResults = parseRemoteResults(data);
  const resultsByKey = new Map<string, RemoteUploadSafetyResult>();

  for (const result of parsedResults) {
    const resultKey =
      typeof result?.id === "string"
        ? result.id
        : typeof result?.fingerprint === "string"
          ? result.fingerprint
          : "";

    if (resultKey) {
      resultsByKey.set(resultKey, result);
    }
  }

  for (const item of chunk) {
    const remote = resultsByKey.get(item.cacheKey);

    if (!remote) {
      const unavailableDecision = buildRemoteDecision(
        false,
        "Safety screening response was incomplete. Upload blocked.",
        SAFETY_UNAVAILABLE_CACHE_TTL_MS,
      );
      await setCachedDecision(item.cacheKey, unavailableDecision);
      continue;
    }

    const allowed = remote.allowed !== false;
    const requiresAdminReview = Boolean(remote.requiresAdminReview);
    const reason = allowed
      ? requiresAdminReview
        ? sanitizeUploadSafetyReason(remote.reason)
        : undefined
      : resolveDecisionReason(item.input, remote.reason);
    const decision = buildRemoteDecision(
      allowed,
      reason,
      getDecisionCacheTtlMs(allowed, reason, requiresAdminReview),
      {
        requiresAdminReview,
        publiclyAvailable: typeof remote.publiclyAvailable === "boolean"
          ? remote.publiclyAvailable
          : allowed && !requiresAdminReview,
        copyrightStatus: remote.copyrightStatus,
        copyrightReviewId: remote.copyrightReviewId || null,
        copyrightTrackKey: remote.copyrightTrackKey || null,
        copyrightMetadata: remote.copyrightMetadata,
      },
    );

    console.log("[UploadSafetyScreen] remote_decision", {
      context: contextTag || "add_edit_upload",
      fileName: item.input.name,
      kind: item.input.kind,
      allowed,
      requiresAdminReview,
      publiclyAvailable: decision.publiclyAvailable,
      copyrightStatus: decision.copyrightStatus || null,
      copyrightReviewId: decision.copyrightReviewId || null,
      reason: decision.reason || null,
    });

    await setCachedDecision(item.cacheKey, decision);
  }
};

const resolveDecisionForKey = async (
  cacheKey: string,
  input: UploadSafetyFileInput,
  contextTag?: string,
): Promise<CachedUploadSafetyDecision> => {
  const cached = await getCachedDecision(cacheKey);
  if (cached) {
    return cached;
  }

  const existing = inFlightDecisionCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    await screenChunkWithRemoteAi([{ cacheKey, input }], contextTag);
    const resolved = await getCachedDecision(cacheKey);

    if (!resolved) {
      const fallbackDecision = buildRemoteDecision(
        false,
        "Safety screening did not return a valid decision.",
        SAFETY_UNAVAILABLE_CACHE_TTL_MS,
      );

      await setCachedDecision(cacheKey, fallbackDecision);
      return fallbackDecision;
    }

    return resolved;
  })();

  inFlightDecisionCache.set(cacheKey, promise);

  try {
    const resolved = await promise;
    return resolved;
  } finally {
    inFlightDecisionCache.delete(cacheKey);
  }
};

export const screenUploadsWithAi = async (
  inputs: UploadSafetyFileInput[],
  contextTag?: string,
): Promise<UploadSafetyScreeningSummary> => {
  const decisions = await screenUploadsWithAiDecisions(inputs, contextTag);
  const blockedDecisions = decisions.filter((decision) => !decision.allowed);

  if (blockedDecisions.length > 0) {
    return {
      allowed: false,
      blockedCount: blockedDecisions.length,
      reason: blockedDecisions[0].reason,
    };
  }

  return {
    allowed: true,
    blockedCount: 0,
  };
};

export const screenUploadsWithAiDecisions = async (
  inputs: UploadSafetyFileInput[],
  contextTag?: string,
): Promise<UploadSafetyFileDecision[]> => {
  const normalizedInputs = inputs.filter((item) => item && typeof item.name === "string");
  if (normalizedInputs.length === 0) {
    return [];
  }

  const decisionsByKey = new Map<string, CachedUploadSafetyDecision>();
  const uncachedItems: { cacheKey: string; input: UploadSafetyFileInput }[] = [];
  const seenKeys = new Set<string>();

  for (const input of normalizedInputs) {
    const cacheKey = getCacheKey(input);
    const cached = await getCachedDecision(cacheKey);
    if (cached) {
      decisionsByKey.set(cacheKey, cached);
      continue;
    }

    if (seenKeys.has(cacheKey)) {
      continue;
    }
    seenKeys.add(cacheKey);
    uncachedItems.push({ cacheKey, input });
  }

  const chunkSize = uncachedItems.some((item) => item.input.contentDataUrl)
    ? 1
    : MAX_CANDIDATES_PER_REQUEST;
  const chunks: { cacheKey: string; input: UploadSafetyFileInput }[][] = [];
  for (let i = 0; i < uncachedItems.length; i += chunkSize) {
    chunks.push(uncachedItems.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    // If only one file needs review, route through single-flight cache for efficiency.
    if (chunk.length === 1) {
      const [single] = chunk;
      const decision = await resolveDecisionForKey(single.cacheKey, single.input, contextTag);
      decisionsByKey.set(single.cacheKey, decision);
      continue;
    }

    await screenChunkWithRemoteAi(chunk, contextTag);

    for (const item of chunk) {
      const decision = await getCachedDecision(item.cacheKey);
      decisionsByKey.set(
        item.cacheKey,
        decision || buildRemoteDecision(
          false,
          `${item.input.name} was blocked by safety screening.`,
          SAFETY_UNAVAILABLE_CACHE_TTL_MS,
        ),
      );
    }
  }

  return normalizedInputs.map((input) => {
    const cacheKey = getCacheKey(input);
    const decision = decisionsByKey.get(cacheKey);

    return {
      input,
      allowed: decision?.allowed === true,
      reason: decision?.reason
        ? sanitizeUploadSafetyReason(decision.reason)
        : decision?.allowed === false
          ? `${input.name} was blocked by safety screening.`
          : decision
            ? undefined
            : SCREENING_UNAVAILABLE_BLOCK_MESSAGE,
      requiresAdminReview: Boolean(decision?.requiresAdminReview),
      publiclyAvailable: typeof decision?.publiclyAvailable === "boolean"
        ? decision.publiclyAvailable
        : decision?.allowed === true,
      copyrightStatus: decision?.copyrightStatus,
      copyrightReviewId: decision?.copyrightReviewId || null,
      copyrightTrackKey: decision?.copyrightTrackKey || null,
      copyrightMetadata: decision?.copyrightMetadata,
    };
  });
};

export const ensureUploadPassesSafetyScreening = async (
  input: UploadSafetyFileInput,
  contextTag?: string,
): Promise<void> => {
  const summary = await screenUploadsWithAi([input], contextTag);
  console.log("[UploadSafetyScreen] summary", {
    context: contextTag || "add_edit_upload",
    fileName: input.name,
    kind: input.kind,
    allowed: summary.allowed,
    blockedCount: summary.blockedCount,
    reason: summary.reason || null,
  });
  if (!summary.allowed) {
    throw new Error(summary.reason || "Upload blocked by safety screening.");
  }
};
