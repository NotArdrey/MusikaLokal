import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { InstrumentSuggestion } from "../types/instruments";
import { getOfflineInstrumentSuggestions } from "../utils/offlineInstrumentRecommender";
import type {
  EnhanceOfflineSuggestionsResult,
  GenerateOfflineSuggestionsWithLlmInput,
  RerankHomeFeedInput,
  RerankHomeFeedResult,
} from "./offlineLlmEnhancer";

const SUGGESTION_CACHE_PREFIX = "groq_suggestions:";
const HOME_CACHE_PREFIX = "groq_home:";
const SUGGESTION_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const HOME_CACHE_TTL_MS = 1000 * 60 * 10;
const SUGGESTION_TIMEOUT_MS = 20000;
const HOME_TIMEOUT_MS = 16000;
const MAX_SUGGESTION_CANDIDATES = 12;
const MAX_HOME_CANDIDATES = 12;
const MAX_HOME_TARGET_COUNT = 6;
const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_GROQ_MODEL_ID = "qwen/qwen3-32b";
const GROQ_MODEL_FALLBACK_IDS = [
  DEFAULT_GROQ_MODEL_ID,
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];
const GROQ_MODEL_LABELS: Record<string, string> = {
  "qwen/qwen3-32b": "qwen/qwen3-32b",
  "openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "openai/gpt-oss-20b": "openai/gpt-oss-20b",
};

export const GROQ_PRIMARY_MODEL_ID = DEFAULT_GROQ_MODEL_ID;
export const GROQ_PRIMARY_LABEL = GROQ_MODEL_LABELS[DEFAULT_GROQ_MODEL_ID];
export const GROQ_FALLBACK_CHAIN = GROQ_MODEL_FALLBACK_IDS.join(" -> ");

interface CachedPayload<T> {
  timestamp: number;
  data: T;
}

interface GroqSuggestionRec {
  name?: unknown;
  score?: unknown;
  scoreDelta?: unknown;
  headline?: unknown;
  whyThisFits?: unknown;
  proTip?: unknown;
  perfectFor?: unknown;
}

interface GroqHomeRec {
  idx?: unknown;
  id?: unknown;
  score?: unknown;
  reason?: unknown;
}

interface GroqModelInfo {
  modelId: string;
  modelLabel: string;
  configured: boolean;
  transportLabel: string;
  statusMessage: string;
  modelSource: string;
  apiKeySource: string;
  apiKeySignature: string;
}

interface GroqRequestResult {
  text: string;
  modelId: string;
}

interface ResolvedConfigValue {
  value: string;
  source: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalize = (value: string) => value.trim().toLowerCase();

const normalizeMatchKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
};

const pendingGroqRequests = new Map<string, Promise<GroqRequestResult>>();

const compactText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";

  const normalizedValue = value.replace(/\s+/g, " ").trim();
  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 1)).trim()}~`;
};

const extractJsonObject = (raw: string) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return raw.slice(firstBracket, lastBracket + 1);
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return raw;
};

const sanitizeString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const getConstantsExtraSources = () => {
  const constantsRecord = Constants as unknown as {
    manifest?: { extra?: Record<string, unknown> };
    manifest2?: {
      extra?:
        | (Record<string, unknown> & {
            expoClient?: { extra?: Record<string, unknown> };
          })
        | undefined;
    };
  };

  return [
    {
      source: "Constants.expoConfig.extra",
      data: (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>,
    },
    {
      source: "Constants.manifest.extra",
      data: (constantsRecord.manifest?.extra ?? {}) as Record<string, unknown>,
    },
    {
      source: "Constants.manifest2.extra",
      data: (constantsRecord.manifest2?.extra ?? {}) as Record<string, unknown>,
    },
    {
      source: "Constants.manifest2.expoClient.extra",
      data: (constantsRecord.manifest2?.extra?.expoClient?.extra ?? {}) as Record<
        string,
        unknown
      >,
    },
  ];
};

const resolveConfigValue = (
  candidates: Array<{ source: string; value: unknown }>,
  fallback = "",
  fallbackSource = "default",
): ResolvedConfigValue => {
  for (const candidate of candidates) {
    const sanitizedValue = sanitizeString(candidate.value);
    if (sanitizedValue.length > 0) {
      return {
        value: sanitizedValue,
        source: candidate.source,
      };
    }
  }

  return {
    value: fallback,
    source: fallbackSource,
  };
};

const formatApiKeySignature = (apiKey: string) => {
  if (!apiKey) {
    return "missing";
  }

  const prefix = apiKey.slice(0, 6);
  const suffix = apiKey.slice(-6);
  return `len=${apiKey.length} prefix=${prefix} suffix=${suffix}`;
};

const getResolvedGroqConfig = () => {
  const extraSources = getConstantsExtraSources();

  const apiKey = resolveConfigValue([
    {
      source: "process.env.EXPO_PUBLIC_GROQ_API_KEY",
      value: process.env.EXPO_PUBLIC_GROQ_API_KEY,
    },
    {
      source: "process.env.GROQ_API_KEY",
      value: process.env.GROQ_API_KEY,
    },
    ...extraSources.flatMap(({ source, data }) => [
      { source: `${source}.groqApiKey`, value: data.groqApiKey },
      { source: `${source}.expoPublicGroqApiKey`, value: data.expoPublicGroqApiKey },
      { source: `${source}.EXPO_PUBLIC_GROQ_API_KEY`, value: data.EXPO_PUBLIC_GROQ_API_KEY },
      { source: `${source}.GROQ_API_KEY`, value: data.GROQ_API_KEY },
    ]),
  ]);

  const model = resolveConfigValue(
    [
      {
        source: "process.env.EXPO_PUBLIC_GROQ_MODEL",
        value: process.env.EXPO_PUBLIC_GROQ_MODEL,
      },
      {
        source: "process.env.GROQ_MODEL",
        value: process.env.GROQ_MODEL,
      },
      ...extraSources.flatMap(({ source, data }) => [
        { source: `${source}.groqModel`, value: data.groqModel },
        { source: `${source}.expoPublicGroqModel`, value: data.expoPublicGroqModel },
        { source: `${source}.EXPO_PUBLIC_GROQ_MODEL`, value: data.EXPO_PUBLIC_GROQ_MODEL },
        { source: `${source}.GROQ_MODEL`, value: data.GROQ_MODEL },
      ]),
    ],
    DEFAULT_GROQ_MODEL_ID,
    `default.${DEFAULT_GROQ_MODEL_ID}`,
  );

  return {
    apiKey,
    model,
  };
};

const getGroqModelLabel = (modelId: string) => GROQ_MODEL_LABELS[modelId] || modelId;

const getConfiguredGroqModelId = () => {
  return getResolvedGroqConfig().model.value || DEFAULT_GROQ_MODEL_ID;
};

const getGroqModelCandidates = () => {
  const preferredModelId = getConfiguredGroqModelId();
  return Array.from(new Set([preferredModelId, ...GROQ_MODEL_FALLBACK_IDS]));
};

const isApiLimitErrorMessage = (message: string) => {
  return /rate limit|quota|insufficient[_ -]?quota|too many requests|api calls|capacity|exhausted|billing|hard limit|credits/i.test(
    message,
  );
};

const shouldRetryWithNextGroqModel = (status: number | null, message: string) => {
  if (status !== null && [402, 404, 408, 409, 429, 500, 502, 503, 504, 529].includes(status)) {
    return true;
  }

  if (isApiLimitErrorMessage(message)) {
    return true;
  }

  return /unknown model|model .*not found|is not found|not supported|unsupported model|does not exist|unavailable model|invalid model|overloaded|temporarily unavailable/i.test(
    message,
  );
};

const getGroqApiKey = () => getResolvedGroqConfig().apiKey.value;

export const getGroqModelInfo = (): GroqModelInfo => {
  const resolvedConfig = getResolvedGroqConfig();
  const modelId = resolvedConfig.model.value || DEFAULT_GROQ_MODEL_ID;
  const modelLabel = getGroqModelLabel(modelId);
  const configured = resolvedConfig.apiKey.value.length > 0;

  return {
    modelId,
    modelLabel,
    configured,
    transportLabel: "Network (Groq)",
    statusMessage: configured
      ? `Uses Groq model routing over the network: ${GROQ_FALLBACK_CHAIN}.`
      : "Set EXPO_PUBLIC_GROQ_API_KEY in .env to enable Groq routing.",
    modelSource: resolvedConfig.model.source,
    apiKeySource: resolvedConfig.apiKey.source,
    apiKeySignature: formatApiKeySignature(resolvedConfig.apiKey.value),
  };
};

export const isGroqConfigured = () => getGroqApiKey().length > 0;

const getCachedValue = async <T>(key: string, ttlMs: number): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedPayload<T>;
    if (!parsed?.timestamp || parsed.data == null) {
      return null;
    }

    if (Date.now() - parsed.timestamp > ttlMs) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
};

const setCachedValue = async <T>(key: string, data: T) => {
  try {
    const payload: CachedPayload<T> = {
      timestamp: Date.now(),
      data,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore cache failures.
  }
};

const extractGroqText = (payload: any): string | null => {
  const content = payload?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("\n")
      .trim();

    return text.length > 0 ? text : null;
  }

  if (content && typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return null;
    }
  }

  return null;
};

const readGroqError = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error_description ||
      payload?.details?.[0]?.message;

    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  } catch {
    // Ignore JSON parse failure.
  }

  try {
    const text = await response.text();
    if (typeof text === "string" && text.trim().length > 0) {
      return text.trim();
    }
  } catch {
    // Ignore body parse failure.
  }

  return `Groq request failed with status ${response.status}.`;
};

const performGroqJsonRequest = async (input: {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
}): Promise<GroqRequestResult> => {
  const resolvedConfig = getResolvedGroqConfig();
  const apiKey = resolvedConfig.apiKey.value;
  if (!apiKey) {
    throw new Error("groq_api_key_missing");
  }

  let lastModelError: Error | null = null;

  for (const modelId of getGroqModelCandidates()) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      console.log("[GROQ_ROUTER] Request start", {
        modelId,
        modelSource: resolvedConfig.model.source,
        apiKeySource: resolvedConfig.apiKey.source,
        apiKeySignature: formatApiKeySignature(apiKey),
      });

      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: "system",
              content: input.systemPrompt,
            },
            {
              role: "user",
              content: input.userPrompt,
            },
          ],
          temperature: input.temperature,
          max_tokens: input.maxOutputTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readGroqError(response);
        console.warn("[GROQ_ROUTER] Request failed", {
          modelId,
          status: response.status,
          message,
          modelSource: resolvedConfig.model.source,
          apiKeySource: resolvedConfig.apiKey.source,
          apiKeySignature: formatApiKeySignature(apiKey),
        });
        if (shouldRetryWithNextGroqModel(response.status, message)) {
          lastModelError = new Error(message);
          continue;
        }

        throw new Error(message);
      }

      const payload = await response.json();
      const text = extractGroqText(payload);
      if (!text) {
        throw new Error("groq_empty_response");
      }

      console.log("[GROQ_ROUTER] Request success", {
        modelId,
        modelSource: resolvedConfig.model.source,
        apiKeySource: resolvedConfig.apiKey.source,
        apiKeySignature: formatApiKeySignature(apiKey),
      });

      return { text, modelId };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("groq_request_timeout");
      }

      const message = error instanceof Error ? error.message : String(error);
      console.warn("[GROQ_ROUTER] Request exception", {
        modelId,
        message,
        modelSource: resolvedConfig.model.source,
        apiKeySource: resolvedConfig.apiKey.source,
        apiKeySignature: formatApiKeySignature(apiKey),
      });
      if (shouldRetryWithNextGroqModel(null, message)) {
        lastModelError = error instanceof Error ? error : new Error(message);
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw lastModelError || new Error("groq_model_unavailable");
};

const buildGroqRequestFingerprint = (input: {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
}) => {
  return hashString(
    JSON.stringify({
      models: getGroqModelCandidates(),
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      timeoutMs: input.timeoutMs,
      maxOutputTokens: input.maxOutputTokens,
      temperature: input.temperature,
    }),
  );
};

const requestGroqJson = async (input: {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
}): Promise<GroqRequestResult> => {
  const fingerprint = buildGroqRequestFingerprint(input);
  const pendingRequest = pendingGroqRequests.get(fingerprint);
  if (pendingRequest) {
    return pendingRequest;
  }

  const nextRequest = performGroqJsonRequest(input);
  pendingGroqRequests.set(fingerprint, nextRequest);

  try {
    return await nextRequest;
  } finally {
    if (pendingGroqRequests.get(fingerprint) === nextRequest) {
      pendingGroqRequests.delete(fingerprint);
    }
  }
};

const parseSuggestionResponse = (raw: string): GroqSuggestionRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : Array.isArray(parsed?.results)
          ? parsed.results
          : Array.isArray(parsed?.items)
            ? parsed.items
            : [];

    return records.filter((entry: unknown) => entry && typeof entry === "object") as GroqSuggestionRec[];
  } catch {
    return [];
  }
};

const parseNumericIndex = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      return Number(match[0]);
    }
  }

  return null;
};

const parseHomeResponse = (raw: string): GroqHomeRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const records = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.ranking)
        ? parsed.ranking
        : Array.isArray(parsed?.recommendations)
          ? parsed.recommendations
          : Array.isArray(parsed?.results)
            ? parsed.results
            : [];

    return records
      .map((entry: unknown) => {
        if (typeof entry === "number") {
          return { idx: entry };
        }

        if (!entry || typeof entry !== "object") {
          return null;
        }

        const record = entry as Record<string, unknown>;
        return {
          idx: record.idx ?? record.index ?? record.i ?? record.rank,
          id: record.id ?? record.candidateId ?? record.candidate_id,
          score: record.score ?? record.rating ?? record.relevance,
          reason: record.reason ?? record.why ?? record.rationale,
        } as GroqHomeRec;
      })
      .filter((entry: GroqHomeRec | null): entry is GroqHomeRec => entry !== null);
  } catch {
    const regexMatches = Array.from(raw.matchAll(/(?:idx|index|candidate)\D{0,6}(\d{1,2})/gi));
    return regexMatches.map((match) => ({ idx: Number(match[1]) }));
  }
};

const buildSuggestionCacheKey = (
  input: GenerateOfflineSuggestionsWithLlmInput,
  baseSuggestions: InstrumentSuggestion[],
) => {
  const providerLabel = getGroqModelLabel(getConfiguredGroqModelId());
  const payload = {
    genres: [...input.genres].map(normalize).sort(),
    currentInstruments: [...input.currentInstruments].map(normalize).sort(),
    userRoles: [...input.userRoles].map(normalize).sort(),
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: input.limit,
    providerLabel,
    names: baseSuggestions.map((item) => normalize(item.name)),
  };

  return `${SUGGESTION_CACHE_PREFIX}${hashString(JSON.stringify(payload))}`;
};

const buildHomeCacheKey = (input: RerankHomeFeedInput, safeLimit: number) => {
  const providerLabel = getGroqModelLabel(getConfiguredGroqModelId());
  const payload = {
    skills: [...input.profileSignals.skills].map(normalize).sort(),
    genres: [...input.profileSignals.genres].map(normalize).sort(),
    limit: safeLimit,
    providerLabel,
    candidates: input.candidates.slice(0, 30).map((item: any) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      genre: item.genre,
      similarity: item.similarity,
    })),
  };

  return `${HOME_CACHE_PREFIX}${hashString(JSON.stringify(payload))}`;
};

const buildSuggestionPrompt = (
  input: GenerateOfflineSuggestionsWithLlmInput,
  baseSuggestions: InstrumentSuggestion[],
) => {
  const candidates = baseSuggestions.slice(0, MAX_SUGGESTION_CANDIDATES).map((item) => ({
    name: item.name,
    category: item.category,
    difficulty: item.difficulty,
    genres: item.genres.slice(0, 4),
    score: item.score,
    matchReason: compactText(item.matchReason, 140),
    perfectFor: compactText(item.perfectFor, 24),
  }));

  return {
    systemPrompt:
      "You are MusikaLokal's recommendation model. Return strict JSON only and never invent instruments outside the provided candidates.",
    userPrompt: [
      "Refine these instrument recommendations for the user.",
      `Genres: ${input.genres.join(", ") || "none"}`,
      `Current skills: ${input.currentInstruments.join(", ") || "none"}`,
      `User roles: ${input.userRoles.join(", ") || "none"}`,
      `Experience level: ${input.experienceLevel}`,
      `Purpose: ${input.purpose}`,
      "Return JSON with shape:",
      '{"recommendations":[{"name":"candidate name","score":0-100,"headline":"short line","whyThisFits":"1-2 short sentences","proTip":"actionable tip","perfectFor":"short tag","scoreDelta":-8..10}]}',
      "Rules:",
      "- Use only candidate names.",
      `- Return up to ${Math.min(input.limit, baseSuggestions.length)} items sorted best to worst.`,
      "- Keep headline under 80 chars.",
      "- Keep whyThisFits under 220 chars.",
      "- Keep proTip under 140 chars.",
      `Candidates: ${JSON.stringify(candidates)}`,
    ].join("\n"),
  };
};

const applySuggestionEnhancements = (
  baseSuggestions: InstrumentSuggestion[],
  suggestions: GroqSuggestionRec[],
  limit: number,
  aiProvider: string,
) => {
  const byName = new Map(
    baseSuggestions.map((item) => [normalizeMatchKey(item.name), item]),
  );
  const enhanced: InstrumentSuggestion[] = [];
  const used = new Set<string>();

  for (const suggestion of suggestions) {
    const rawName = typeof suggestion?.name === "string" ? suggestion.name.trim() : "";
    if (!rawName) continue;

    const key = normalizeMatchKey(rawName);
    const base = byName.get(key);
    if (!base || used.has(key)) continue;

    const parsedScore = Number(suggestion?.score);
    const parsedDelta = Number(suggestion?.scoreDelta);
    const nextScore = Number.isFinite(parsedScore)
      ? clamp(Math.round(parsedScore), 0, 100)
      : Number.isFinite(parsedDelta)
        ? clamp(base.score + Math.round(parsedDelta), 0, 100)
        : base.score;

    enhanced.push({
      ...base,
      score: nextScore,
      headline:
        typeof suggestion?.headline === "string" && suggestion.headline.trim().length > 0
          ? suggestion.headline.trim().slice(0, 80)
          : base.headline,
      matchReason:
        typeof suggestion?.whyThisFits === "string" && suggestion.whyThisFits.trim().length > 0
          ? suggestion.whyThisFits.trim().slice(0, 220)
          : base.matchReason,
      proTip:
        typeof suggestion?.proTip === "string" && suggestion.proTip.trim().length > 0
          ? suggestion.proTip.trim().slice(0, 140)
          : base.proTip,
      perfectFor:
        typeof suggestion?.perfectFor === "string" && suggestion.perfectFor.trim().length > 0
          ? suggestion.perfectFor.trim().slice(0, 32)
          : base.perfectFor,
      aiPowered: true,
      aiProvider,
    });
    used.add(key);
  }

  for (const base of baseSuggestions) {
    if (enhanced.length >= limit) {
      break;
    }

    const key = normalizeMatchKey(base.name);
    if (used.has(key)) continue;

    enhanced.push({
      ...base,
      aiPowered: true,
      aiProvider,
    });
    used.add(key);
  }

  return enhanced.slice(0, limit);
};

const buildHomePrompt = (input: RerankHomeFeedInput, candidates: any[], targetCount: number) => {
  const compactSkills = input.profileSignals.skills
    .slice(0, 4)
    .map((value) => compactText(value, 20))
    .filter(Boolean);
  const compactGenres = input.profileSignals.genres
    .slice(0, 4)
    .map((value) => compactText(value, 20))
    .filter(Boolean);

  const compactCandidates = candidates.map((item: any, idx: number) => ({
    idx,
    id: compactText(item.id, 36),
    t: compactText(item.type, 10),
    n: compactText(item.name, 28),
    g: compactText(item.genre, 18),
    s: Math.round(Number(item.similarity || 0) * 100),
  }));

  return {
    systemPrompt:
      "You rank MusikaLokal home feed candidates. Return strict JSON only and prefer candidate idx numbers.",
    userPrompt: [
      "Rerank this Home feed for realtime relevance.",
      `Skills: ${compactSkills.join(", ") || "none"}`,
      `Genres: ${compactGenres.join(", ") || "none"}`,
      `Return up to ${targetCount} candidates.`,
      "Return JSON with one of these shapes:",
      '{"ranking":[{"idx":0,"score":92,"reason":"why"}]}',
      '{"ranking":[0,1,2]}',
      "Rules:",
      "- Use only candidate idx values.",
      "- No prose before or after the JSON.",
      "- Keep reason under 100 chars when present.",
      "- Prefer skill and genre fit, then freshness and seed score.",
      `Candidates: ${JSON.stringify(compactCandidates)}`,
    ].join("\n"),
  };
};

const formatGroqFallbackMessage = (error: unknown, fallbackLabel: string) => {
  const providerLabel = getGroqModelLabel(getConfiguredGroqModelId());
  const message = error instanceof Error ? error.message : String(error);
  if (message === "groq_api_key_missing") {
    return `${providerLabel} API key is not configured. ${fallbackLabel}`;
  }

  if (/api key not valid|invalid api key|unauthorized|invalid authentication/i.test(message)) {
    return `${providerLabel} API key is invalid. Replace EXPO_PUBLIC_GROQ_API_KEY in .env. ${fallbackLabel}`;
  }

  if (message === "groq_request_timeout") {
    return `${providerLabel} timed out. ${fallbackLabel}`;
  }

  if (message === "groq_empty_response") {
    return `${providerLabel} returned no usable output. ${fallbackLabel}`;
  }

  if (message === "groq_model_unavailable") {
    return `${providerLabel} and fallback models are unavailable for this request. ${fallbackLabel}`;
  }

  if (isApiLimitErrorMessage(message)) {
    return `${providerLabel} is out of API calls right now. Tried fallback models (${GROQ_FALLBACK_CHAIN}). ${fallbackLabel}`;
  }

  if (/permission|forbidden/i.test(message)) {
    return `${providerLabel} rejected the configured API key. ${fallbackLabel}`;
  }

  return `${providerLabel} request failed. ${fallbackLabel}`;
};

export const generateInstrumentSuggestionsWithGroq = async (
  input: GenerateOfflineSuggestionsWithLlmInput,
): Promise<EnhanceOfflineSuggestionsResult> => {
  const preferredProviderLabel = getGroqModelLabel(getConfiguredGroqModelId());
  const safeLimit = clamp(input.limit || 10, 1, 20);
  const baseSuggestions = getOfflineInstrumentSuggestions({
    genres: input.genres,
    currentInstruments: input.currentInstruments,
    userRoles: input.userRoles,
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: Math.max(safeLimit, 10),
  }).slice(0, safeLimit);

  const buildLocalFallback = (message: string): EnhanceOfflineSuggestionsResult => ({
    suggestions: baseSuggestions,
    aiPowered: false,
    aiProvider: "Local Ranker",
    message,
  });

  if (baseSuggestions.length === 0) {
    return {
      suggestions: [],
      aiPowered: false,
      aiProvider: "Local Ranker",
      message: "No suggestion candidates are available right now.",
    };
  }

  if (!isGroqConfigured()) {
    return buildLocalFallback(
      `${preferredProviderLabel} API key is not configured. Using smart local suggestions.`,
    );
  }

  const cacheKey = buildSuggestionCacheKey(input, baseSuggestions);
  const cached = await getCachedValue<InstrumentSuggestion[]>(cacheKey, SUGGESTION_CACHE_TTL_MS);
  if (cached && cached.length > 0) {
    const cachedProvider =
      typeof cached[0]?.aiProvider === "string" && cached[0].aiProvider.trim().length > 0
        ? cached[0].aiProvider.trim()
        : preferredProviderLabel;
    return {
      suggestions: cached.slice(0, safeLimit),
      aiPowered: true,
      aiProvider: `${cachedProvider} (Cached)`,
      message: `Loaded cached ${cachedProvider} suggestions.`,
    };
  }

  try {
    const { systemPrompt, userPrompt } = buildSuggestionPrompt(input, baseSuggestions);
    const result = await requestGroqJson({
      systemPrompt,
      userPrompt,
      timeoutMs: SUGGESTION_TIMEOUT_MS,
      maxOutputTokens: 600,
      temperature: 0.25,
    });
    const resolvedProviderLabel = getGroqModelLabel(result.modelId);

    const parsed = parseSuggestionResponse(result.text);
    const enhanced = applySuggestionEnhancements(
      baseSuggestions,
      parsed,
      safeLimit,
      resolvedProviderLabel,
    );
    if (enhanced.length === 0) {
      return buildLocalFallback(
        `${resolvedProviderLabel} returned an invalid recommendation payload. Using smart local suggestions.`,
      );
    }

    await setCachedValue(cacheKey, enhanced);

    return {
      suggestions: enhanced,
      aiPowered: true,
      aiProvider: resolvedProviderLabel,
      message: `Generated by ${resolvedProviderLabel}.`,
    };
  } catch (error: unknown) {
    return buildLocalFallback(
      formatGroqFallbackMessage(error, "Using smart local suggestions."),
    );
  }
};

export const rerankHomeFeedWithGroq = async (
  input: RerankHomeFeedInput,
): Promise<RerankHomeFeedResult> => {
  const preferredProviderLabel = getGroqModelLabel(getConfiguredGroqModelId());
  const safeLimit = clamp(input.limit || 20, 4, 30);
  const baseCandidates = Array.isArray(input.candidates)
    ? input.candidates.slice(0, Math.max(safeLimit, 24))
    : [];
  const llmCandidates = baseCandidates.slice(0, MAX_HOME_CANDIDATES);
  const targetCount = clamp(
    Math.min(Math.max(llmCandidates.length - 2, 4), MAX_HOME_TARGET_COUNT),
    4,
    MAX_HOME_TARGET_COUNT,
  );

  if (baseCandidates.length === 0) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "Local Ranker",
      message: "No candidates available for Home feed reranking.",
    };
  }

  if (!isGroqConfigured()) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "Local Ranker",
      message: `${preferredProviderLabel} API key is not configured for Home feed reranking.`,
    };
  }

  const cacheKey = buildHomeCacheKey(input, safeLimit);
  const cached = await getCachedValue<any[]>(cacheKey, HOME_CACHE_TTL_MS);
  if (cached && cached.length > 0) {
    return {
      recommendations: cached.slice(0, safeLimit),
      aiPowered: true,
      aiProvider: `${preferredProviderLabel} (Cached)`,
      message: `Loaded cached ${preferredProviderLabel} Home feed rerank.`,
    };
  }

  try {
    const { systemPrompt, userPrompt } = buildHomePrompt(input, llmCandidates, targetCount);
    const result = await requestGroqJson({
      systemPrompt,
      userPrompt,
      timeoutMs: HOME_TIMEOUT_MS,
      maxOutputTokens: 320,
      temperature: 0.2,
    });
    const resolvedProviderLabel = getGroqModelLabel(result.modelId);

    const parsed = parseHomeResponse(result.text);
    if (parsed.length === 0) {
      return {
        recommendations: [],
        aiPowered: false,
        aiProvider: "Local Ranker",
        message: `${resolvedProviderLabel} Home feed output was invalid.`,
      };
    }

    const reranked: any[] = [];

    for (const record of parsed) {
      const idx = parseNumericIndex(record.idx);
      let base: any = null;

      if (idx !== null && idx >= 0 && idx < llmCandidates.length) {
        base = llmCandidates[idx];
      } else if (typeof record.id === "string" && record.id.trim().length > 0) {
        base = llmCandidates.find((item: any) => item.id === record.id) || null;
      }

      if (!base) continue;

      const parsedScore = Number(record.score);
      const safeScore = Number.isFinite(parsedScore)
        ? clamp(Math.round(parsedScore), 0, 100)
        : Math.round(Number(base.similarity || 0) * 100);

      reranked.push({
        ...base,
        similarity: safeScore / 100,
        aiReason:
          typeof record.reason === "string" && record.reason.trim().length > 0
            ? record.reason.trim().slice(0, 100)
            : base.aiReason || "Recommended for your profile.",
      });
    }

    if (reranked.length === 0) {
      return {
        recommendations: [],
        aiPowered: false,
        aiProvider: "Local Ranker",
        message: `${GROQ_PRIMARY_LABEL} did not return usable Home feed candidates.`,
      };
    }

    const usedIds = new Set(reranked.map((item: any) => item.id));
    for (const fallback of baseCandidates) {
      if (reranked.length >= safeLimit) break;
      if (usedIds.has(fallback.id)) continue;
      reranked.push(fallback);
      usedIds.add(fallback.id);
    }

    const finalRanked = reranked.slice(0, safeLimit);
    await setCachedValue(cacheKey, finalRanked);

    return {
      recommendations: finalRanked,
      aiPowered: true,
      aiProvider: resolvedProviderLabel,
      message: `Realtime For You feed reranked by ${resolvedProviderLabel}.`,
    };
  } catch (error: unknown) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "Local Ranker",
      message: formatGroqFallbackMessage(error, "Using local ranking for Home feed."),
    };
  }
};

// Legacy aliases so existing screens can switch providers without refactoring symbol names.
export const GEMINI_FLASH_LITE_MODEL_ID = GROQ_PRIMARY_MODEL_ID;
export const GEMINI_FLASH_LITE_LABEL = GROQ_PRIMARY_LABEL;
export const getGeminiFlashLiteInfo = getGroqModelInfo;
export const isGeminiFlashLiteConfigured = isGroqConfigured;
export const generateInstrumentSuggestionsWithGeminiFlashLite = generateInstrumentSuggestionsWithGroq;
export const rerankHomeFeedWithGeminiFlashLite = rerankHomeFeedWithGroq;
