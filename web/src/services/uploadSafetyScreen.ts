import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

export type UploadSafetyKind = "photo" | "document";

export interface UploadSafetyFileInput {
  name: string;
  mimeType?: string;
  size?: number;
  uri?: string;
  kind: UploadSafetyKind;
}

export interface UploadSafetyScreeningSummary {
  allowed: boolean;
  reason?: string;
  blockedCount: number;
}

interface CachedUploadSafetyDecision {
  allowed: boolean;
  reason?: string;
  reviewedAt: number;
  expiresAt: number;
}

interface RemoteUploadSafetyResult {
  id?: string;
  fingerprint?: string;
  allowed?: boolean;
  reason?: string;
}

const SAFETY_CACHE_PREFIX = "upload_safety_screen:v1:";
const SAFETY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAFETY_UNAVAILABLE_CACHE_TTL_MS = 5 * 60 * 1000;
const SCREENING_FUNCTION_NAME = "upload-safety-screen";
const MAX_CANDIDATES_PER_REQUEST = 10;
const SCREENING_UNAVAILABLE_BLOCK_MESSAGE =
  "Upload safety screening is currently unavailable. Uploads are blocked until screening is restored.";

const memoryDecisionCache = new Map<string, CachedUploadSafetyDecision>();
const inFlightDecisionCache = new Map<string, Promise<CachedUploadSafetyDecision>>();

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const parseBooleanFlag = (value: unknown): boolean | null => {
  const normalized = normalizeText(value);
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
};

const shouldFailOpenWhenScreeningUnavailable = (() => {
  const explicit = parseBooleanFlag(process.env.EXPO_PUBLIC_UPLOAD_SAFETY_FAIL_OPEN);
  if (explicit !== null) {
    return explicit;
  }

  return normalizeText(process.env.NODE_ENV) !== "production";
})();

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
): CachedUploadSafetyDecision => ({
  allowed,
  reason,
  reviewedAt: Date.now(),
  expiresAt: Date.now() + ttlMs,
});

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

const resolveDecisionReason = (input: UploadSafetyFileInput, rawReason?: string): string => {
  const reason = typeof rawReason === "string" && rawReason.trim().length > 0
    ? rawReason.trim()
    : "This file does not comply with Musika Lokal safety guidelines.";

  if (reason.toLowerCase().includes("guideline")) {
    return reason;
  }

  return `${input.name} was blocked by safety screening. ${reason}`;
};

const screenChunkWithRemoteAi = async (
  chunk: Array<{ cacheKey: string; input: UploadSafetyFileInput }>,
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
      })),
    },
  });

  if (error) {
    if (shouldFailOpenWhenScreeningUnavailable) {
      for (const item of chunk) {
        const fallbackDecision = buildRemoteDecision(
          true,
          "Safety screening is temporarily unavailable. Upload allowed for now.",
          SAFETY_UNAVAILABLE_CACHE_TTL_MS,
        );
        await setCachedDecision(item.cacheKey, fallbackDecision);
      }
      return;
    }

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
      const unavailableDecision = shouldFailOpenWhenScreeningUnavailable
        ? buildRemoteDecision(
            true,
            "Safety screening response was incomplete. Upload allowed for now.",
            SAFETY_UNAVAILABLE_CACHE_TTL_MS,
          )
        : buildRemoteDecision(false, "Safety screening response was incomplete. Upload blocked.");
      await setCachedDecision(item.cacheKey, unavailableDecision);
      continue;
    }

    const allowed = remote.allowed !== false;
    const decision = buildRemoteDecision(
      allowed,
      allowed ? undefined : resolveDecisionReason(item.input, remote.reason),
    );

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
      const fallbackDecision = shouldFailOpenWhenScreeningUnavailable
        ? buildRemoteDecision(
            true,
            "Safety screening did not return a valid decision. Upload allowed for now.",
            SAFETY_UNAVAILABLE_CACHE_TTL_MS,
          )
        : buildRemoteDecision(false, "Safety screening did not return a valid decision.");

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
  const normalizedInputs = inputs.filter((item) => item && typeof item.name === "string");
  if (normalizedInputs.length === 0) {
    return { allowed: true, blockedCount: 0 };
  }

  const blockedReasons: string[] = [];
  const uncachedItems: Array<{ cacheKey: string; input: UploadSafetyFileInput }> = [];
  const seenKeys = new Set<string>();

  for (const input of normalizedInputs) {
    const cacheKey = getCacheKey(input);
    if (seenKeys.has(cacheKey)) {
      continue;
    }
    seenKeys.add(cacheKey);

    const cached = await getCachedDecision(cacheKey);
    if (cached) {
      if (!cached.allowed) {
        blockedReasons.push(cached.reason || "Upload blocked by safety screening.");
      }
      continue;
    }

    uncachedItems.push({ cacheKey, input });
  }

  if (blockedReasons.length > 0) {
    return {
      allowed: false,
      blockedCount: blockedReasons.length,
      reason: blockedReasons[0],
    };
  }

  const chunks: Array<Array<{ cacheKey: string; input: UploadSafetyFileInput }>> = [];
  for (let i = 0; i < uncachedItems.length; i += MAX_CANDIDATES_PER_REQUEST) {
    chunks.push(uncachedItems.slice(i, i + MAX_CANDIDATES_PER_REQUEST));
  }

  for (const chunk of chunks) {
    // If only one file needs review, route through single-flight cache for efficiency.
    if (chunk.length === 1) {
      const [single] = chunk;
      const decision = await resolveDecisionForKey(single.cacheKey, single.input, contextTag);
      if (!decision.allowed) {
        blockedReasons.push(
          decision.reason || `${single.input.name} was blocked by safety screening.`,
        );
      }
      continue;
    }

    await screenChunkWithRemoteAi(chunk, contextTag);

    for (const item of chunk) {
      const decision = await getCachedDecision(item.cacheKey);
      if (!decision || !decision.allowed) {
        blockedReasons.push(
          decision?.reason || `${item.input.name} was blocked by safety screening.`,
        );
      }
    }
  }

  if (blockedReasons.length > 0) {
    return {
      allowed: false,
      blockedCount: blockedReasons.length,
      reason: blockedReasons[0],
    };
  }

  return {
    allowed: true,
    blockedCount: 0,
  };
};

export const ensureUploadPassesSafetyScreening = async (
  input: UploadSafetyFileInput,
  contextTag?: string,
): Promise<void> => {
  const summary = await screenUploadsWithAi([input], contextTag);
  if (!summary.allowed) {
    throw new Error(summary.reason || "Upload blocked by safety screening.");
  }
};
