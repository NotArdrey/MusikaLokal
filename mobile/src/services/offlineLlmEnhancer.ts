import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";
import {
  ExperienceLevel,
  InstrumentSuggestion,
  SuggestionPurpose,
} from "../types/instruments";
import {
  getOfflineInstrumentSuggestions,
  getOfflineInstrumentCatalog,
  LocalInstrumentProfile,
} from "../utils/offlineInstrumentRecommender";
import { musikaLlmAdapter } from "./musikaLlmAdapter";

const CACHE_PREFIX = "offline_llm_enhanced_suggestions:";
const LLM_ONLY_CACHE_PREFIX = "offline_llm_only_suggestions:";
const HOME_FEED_CACHE_PREFIX = "offline_llm_home_feed:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const GENERATION_TIMEOUT_MS = 30000;
const HOME_FEED_TIMEOUT_MS = 60000;
const HOME_FEED_MAX_TOKENS = 120;
const HOME_FEED_MAX_LLM_CANDIDATES = 8;
const HOME_FEED_LLM_TARGET_COUNT = 6;

interface OfflineLlmNativeModule {
  isModelReady?: (() => Promise<boolean>) | (() => boolean);
  prepareModel?: (() => Promise<boolean>) | (() => boolean);
  generateJson?: (payload: {
    prompt: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
  }) => Promise<string | object>;
  generateText?: (
    prompt: string,
    options?: { maxTokens?: number; temperature?: number },
  ) => Promise<string>;
}

interface CachedSuggestions<T> {
  timestamp: number;
  suggestions: T[];
}

interface EnhanceOfflineSuggestionsInput {
  baseSuggestions: InstrumentSuggestion[];
  genres: string[];
  currentInstruments: string[];
  userRoles: string[];
  experienceLevel: ExperienceLevel;
  purpose: SuggestionPurpose;
  limit: number;
}

export interface GenerateOfflineSuggestionsWithLlmInput {
  genres: string[];
  currentInstruments: string[];
  userRoles: string[];
  experienceLevel: ExperienceLevel;
  purpose: SuggestionPurpose;
  limit: number;
}

interface LlmRec {
  name?: unknown;
  headline?: unknown;
  whyThisFits?: unknown;
  proTip?: unknown;
  perfectFor?: unknown;
  scoreDelta?: unknown;
}

interface LlmOnlyRec {
  name?: unknown;
  score?: unknown;
  headline?: unknown;
  whyThisFits?: unknown;
  learningCurve?: unknown;
  timeToBasics?: unknown;
  proTip?: unknown;
  famousPlayers?: unknown;
  perfectFor?: unknown;
}

interface HomeFeedLlmRec {
  idx?: unknown;
  id?: unknown;
  score?: unknown;
  reason?: unknown;
}

export interface HomeFeedProfileSignals {
  skills: string[];
  genres: string[];
}

export interface RerankHomeFeedInput {
  candidates: any[];
  profileSignals: HomeFeedProfileSignals;
  limit: number;
}

export interface RerankHomeFeedResult {
  recommendations: any[];
  aiPowered: boolean;
  aiProvider: string;
  message: string;
}

export interface EnhanceOfflineSuggestionsResult {
  suggestions: InstrumentSuggestion[];
  aiPowered: boolean;
  aiProvider: string;
  message: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalize = (value: string) => value.trim().toLowerCase();

const normalizeLearningCurve = (
  value: unknown,
): "easy" | "moderate" | "challenging" => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "easy" || normalized === "moderate" || normalized === "challenging") {
    return normalized;
  }

  return "moderate";
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error("offline_llm_timeout"));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result as T;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const getNativeOfflineLlmModule = (): OfflineLlmNativeModule | null => {
  // Prefer the JS-level llama.rn adapter (real on-device LLM)
  if (musikaLlmAdapter) {
    return musikaLlmAdapter as unknown as OfflineLlmNativeModule;
  }

  // Fallback: legacy native module bridge
  const nativeModule = (NativeModules as Record<string, unknown>)
    .MusikaOfflineLLM as OfflineLlmNativeModule | undefined;

  return nativeModule || null;
};

const extractJsonObject = (raw: string) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const fencedArray = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])```/i);
  if (fencedArray?.[1]) {
    return fencedArray[1].trim();
  }

  const firstBracket = raw.indexOf("[");
  const lastBracket = raw.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const arrayCandidate = raw.slice(firstBracket, lastBracket + 1);
    if (arrayCandidate.includes("{") || /\d/.test(arrayCandidate)) {
      return arrayCandidate;
    }
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }

  return raw;
};

const buildCacheKey = (input: EnhanceOfflineSuggestionsInput) => {
  const keyPayload = {
    genres: [...input.genres].map(normalize).sort(),
    currentInstruments: [...input.currentInstruments].map(normalize).sort(),
    userRoles: [...input.userRoles].map(normalize).sort(),
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: input.limit,
    names: input.baseSuggestions.map((item) => item.name.toLowerCase()),
  };

  return `${CACHE_PREFIX}${hashString(JSON.stringify(keyPayload))}`;
};

const getCachedSuggestions = async <T>(
  key: string,
): Promise<T[] | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CachedSuggestions<T>;
    if (!parsed?.timestamp || !Array.isArray(parsed?.suggestions)) {
      return null;
    }

    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      return null;
    }

    return parsed.suggestions;
  } catch {
    return null;
  }
};

const setCachedSuggestions = async <T>(
  key: string,
  suggestions: T[],
): Promise<void> => {
  try {
    const payload: CachedSuggestions<T> = {
      timestamp: Date.now(),
      suggestions,
    };
    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Cache failure should never block suggestions.
  }
};

const buildPrompt = (input: EnhanceOfflineSuggestionsInput) => {
  const compactCandidates = input.baseSuggestions.slice(0, 12).map((item) => ({
    name: item.name,
    score: item.score,
    headline: item.headline,
    whyThisFits: item.matchReason,
    learningCurve: item.learningCurve,
    timeToBasics: item.timeToBasics,
    perfectFor: item.perfectFor,
  }));

  const systemPrompt =
    "You are an on-device music recommendation enhancer. Return JSON only and never invent instruments not in candidates.";

  const userPrompt = [
    "Refine these local recommendation cards.",
    `Genres: ${input.genres.join(", ") || "none"}`,
    `Current skills: ${input.currentInstruments.join(", ") || "none"}`,
    `Roles: ${input.userRoles.join(", ") || "none"}`,
    `Experience: ${input.experienceLevel}`,
    `Purpose: ${input.purpose}`,
    "Return JSON shape only:",
    '{"recommendations":[{"name":"candidate name","headline":"short line","whyThisFits":"1-2 short sentences","proTip":"actionable tip","perfectFor":"short tag","scoreDelta":-6..10}]}',
    "Rules:",
    "- Use only candidate names.",
    "- Keep headlines under 80 chars.",
    "- Keep whyThisFits under 220 chars.",
    "- Keep proTip under 140 chars.",
    `- Return up to ${input.limit} items sorted best to worst.`,
    `Candidates: ${JSON.stringify(compactCandidates)}`,
  ].join("\n");

  return { systemPrompt, userPrompt };
};

const parseLlmResult = (raw: string): LlmRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    if (!Array.isArray(parsed?.recommendations)) {
      return [];
    }

    return parsed.recommendations as LlmRec[];
  } catch {
    return [];
  }
};

const applyEnhancements = (
  baseSuggestions: InstrumentSuggestion[],
  llmRecommendations: LlmRec[],
  limit: number,
): InstrumentSuggestion[] => {
  const byName = new Map(
    baseSuggestions.map((item) => [item.name.toLowerCase(), item]),
  );

  const enhanced: InstrumentSuggestion[] = [];

  for (const rec of llmRecommendations) {
    const name = typeof rec?.name === "string" ? rec.name.trim() : "";
    if (!name) continue;

    const base = byName.get(name.toLowerCase());
    if (!base) continue;

    const parsedDelta = Number(rec?.scoreDelta);
    const scoreDelta = Number.isFinite(parsedDelta)
      ? clamp(Math.round(parsedDelta), -6, 10)
      : 0;

    const nextScore = clamp(base.score + scoreDelta, 0, 100);

    enhanced.push({
      ...base,
      score: nextScore,
      headline:
        typeof rec?.headline === "string" && rec.headline.trim().length > 0
          ? rec.headline.trim().slice(0, 80)
          : base.headline,
      matchReason:
        typeof rec?.whyThisFits === "string" && rec.whyThisFits.trim().length > 0
          ? rec.whyThisFits.trim().slice(0, 220)
          : base.matchReason,
      proTip:
        typeof rec?.proTip === "string" && rec.proTip.trim().length > 0
          ? rec.proTip.trim().slice(0, 140)
          : base.proTip,
      perfectFor:
        typeof rec?.perfectFor === "string" && rec.perfectFor.trim().length > 0
          ? rec.perfectFor.trim().slice(0, 32)
          : base.perfectFor,
      aiPowered: true,
      aiProvider: "On-Device LLM",
    });
  }

  if (enhanced.length === 0) {
    return baseSuggestions.slice(0, limit);
  }

  const used = new Set(enhanced.map((item) => item.name.toLowerCase()));
  for (const candidate of baseSuggestions) {
    if (enhanced.length >= limit) break;
    if (used.has(candidate.name.toLowerCase())) continue;

    enhanced.push({
      ...candidate,
      aiPowered: true,
      aiProvider: "On-Device LLM",
    });
  }

  return enhanced
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

const ensureModelReady = async (
  module: OfflineLlmNativeModule,
): Promise<boolean> => {
  if (typeof module.isModelReady === "function") {
    const ready = await Promise.resolve(module.isModelReady());
    if (ready) return true;
  }

  if (typeof module.prepareModel === "function") {
    try {
      const prepared = await withTimeout(
        Promise.resolve(module.prepareModel()),
        GENERATION_TIMEOUT_MS,
      );
      return Boolean(prepared);
    } catch {
      return false;
    }
  }

  return typeof module.generateJson === "function" || typeof module.generateText === "function";
};

const generateWithNativeLlm = async (
  module: OfflineLlmNativeModule,
  systemPrompt: string,
  userPrompt: string,
  options: {
    timeoutMs?: number;
    maxTokens?: number;
    temperature?: number;
  } = {},
): Promise<string | null> => {
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const maxTokens = options.maxTokens ?? 650;
  const temperature = options.temperature ?? 0.3;

  if (typeof module.generateJson === "function") {
    const result = await withTimeout(
      module.generateJson({
        prompt: userPrompt,
        systemPrompt,
        maxTokens,
        temperature,
      }),
      timeoutMs,
    );

    if (typeof result === "string") return result;
    return JSON.stringify(result);
  }

  if (typeof module.generateText === "function") {
    const result = await withTimeout(
      module.generateText(`${systemPrompt}\n\n${userPrompt}`, {
        maxTokens,
        temperature,
      }),
      timeoutMs,
    );
    return typeof result === "string" ? result : null;
  }

  return null;
};

export const enhanceOfflineSuggestionsWithLocalLLM = async (
  input: EnhanceOfflineSuggestionsInput,
): Promise<EnhanceOfflineSuggestionsResult> => {
  const base = input.baseSuggestions.slice(0, input.limit);
  const cacheKey = buildCacheKey(input);

  const cached = await getCachedSuggestions<InstrumentSuggestion>(cacheKey);
  if (cached && cached.length > 0) {
    return {
      suggestions: cached,
      aiPowered: true,
      aiProvider: "On-Device LLM (Cached)",
      message: "Offline LLM enhancement loaded from local cache.",
    };
  }

  const module = getNativeOfflineLlmModule();
  if (!module) {
    return {
      suggestions: base,
      aiPowered: false,
      aiProvider: "On-Device Local Ranker",
      message:
        "Offline LLM runtime not found. Using local smart ranking only.",
    };
  }

  const ready = await ensureModelReady(module);
  if (!ready) {
    return {
      suggestions: base,
      aiPowered: false,
      aiProvider: "On-Device Local Ranker",
      message:
        "Offline LLM model is not ready on this device yet. Using local smart ranking.",
    };
  }

  try {
    const { systemPrompt, userPrompt } = buildPrompt(input);
    const raw = await generateWithNativeLlm(module, systemPrompt, userPrompt);

    if (!raw) {
      return {
        suggestions: base,
        aiPowered: false,
        aiProvider: "On-Device Local Ranker",
        message:
          "Offline LLM produced no output. Using local smart ranking.",
      };
    }

    const parsed = parseLlmResult(raw);
    if (parsed.length === 0) {
      return {
        suggestions: base,
        aiPowered: false,
        aiProvider: "On-Device Local Ranker",
        message:
          "Offline LLM output was invalid. Using local smart ranking.",
      };
    }

    const merged = applyEnhancements(base, parsed, input.limit);
    await setCachedSuggestions<InstrumentSuggestion>(cacheKey, merged);

    return {
      suggestions: merged,
      aiPowered: true,
      aiProvider: "On-Device LLM",
      message:
        "Enhanced by on-device LLM. No internet or paid API used.",
    };
  } catch {
    return {
      suggestions: base,
      aiPowered: false,
      aiProvider: "On-Device Local Ranker",
      message:
        "Offline LLM timed out. Using local smart ranking for this request.",
    };
  }
};

const buildLlmOnlyCacheKey = (input: GenerateOfflineSuggestionsWithLlmInput) => {
  const keyPayload = {
    genres: [...input.genres].map(normalize).sort(),
    currentInstruments: [...input.currentInstruments].map(normalize).sort(),
    userRoles: [...input.userRoles].map(normalize).sort(),
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: input.limit,
  };

  return `${LLM_ONLY_CACHE_PREFIX}${hashString(JSON.stringify(keyPayload))}`;
};

const buildLlmOnlyPrompt = (
  input: GenerateOfflineSuggestionsWithLlmInput,
  candidates: LocalInstrumentProfile[],
) => {
  const compactCandidates = candidates.slice(0, 24).map((item) => ({
    name: item.name,
    category: item.category,
    difficulty: item.difficulty,
    genres: item.genres,
    description: item.description,
    relatedInstruments: item.relatedInstruments,
  }));

  const systemPrompt =
    "You are an on-device AI music advisor. Return strict JSON only and do not invent instruments outside candidates.";

  const userPrompt = [
    "Generate personalized instrument recommendations from the candidate list.",
    `Genres: ${input.genres.join(", ") || "none"}`,
    `Current skills: ${input.currentInstruments.join(", ") || "none"}`,
    `User roles: ${input.userRoles.join(", ") || "none"}`,
    `Experience level: ${input.experienceLevel}`,
    `Purpose: ${input.purpose}`,
    "Return JSON with shape:",
    '{"recommendations":[{"name":"candidate name","score":0-100,"headline":"short line","whyThisFits":"1-2 short sentences","learningCurve":"easy|moderate|challenging","timeToBasics":"X-Y weeks/months","proTip":"actionable tip","famousPlayers":["Name 1","Name 2"],"perfectFor":"short tag"}]}',
    "Rules:",
    "- Use only candidate names.",
    "- Return up to requested limit sorted best to worst.",
    "- Keep whyThisFits under 220 chars.",
    "- Keep proTip under 140 chars.",
    `Requested limit: ${input.limit}`,
    `Candidates: ${JSON.stringify(compactCandidates)}`,
  ].join("\n");

  return { systemPrompt, userPrompt };
};

const parseLlmOnlyResult = (raw: string): LlmOnlyRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    if (!Array.isArray(parsed?.recommendations)) {
      return [];
    }

    return parsed.recommendations as LlmOnlyRec[];
  } catch {
    return [];
  }
};

const mapLlmOnlySuggestions = (
  llmRecommendations: LlmOnlyRec[],
  candidates: LocalInstrumentProfile[],
  limit: number,
): InstrumentSuggestion[] => {
  const byName = new Map(
    candidates.map((item) => [item.name.toLowerCase(), item]),
  );

  const mapped: InstrumentSuggestion[] = [];

  for (const rec of llmRecommendations) {
    const name = typeof rec?.name === "string" ? rec.name.trim() : "";
    if (!name) continue;

    const candidate = byName.get(name.toLowerCase());
    if (!candidate) continue;

    const parsedScore = Number(rec?.score);
    const score = Number.isFinite(parsedScore)
      ? clamp(Math.round(parsedScore), 0, 100)
      : 80;

    mapped.push({
      name: candidate.name,
      image: candidate.image,
      score,
      headline:
        typeof rec?.headline === "string" && rec.headline.trim().length > 0
          ? rec.headline.trim().slice(0, 80)
          : `${candidate.name} fits your musical profile`,
      matchReason:
        typeof rec?.whyThisFits === "string" && rec.whyThisFits.trim().length > 0
          ? rec.whyThisFits.trim().slice(0, 220)
          : candidate.description,
      learningCurve: normalizeLearningCurve(rec?.learningCurve),
      timeToBasics:
        typeof rec?.timeToBasics === "string" && rec.timeToBasics.trim().length > 0
          ? rec.timeToBasics.trim().slice(0, 40)
          : "4-8 weeks",
      proTip:
        typeof rec?.proTip === "string" && rec.proTip.trim().length > 0
          ? rec.proTip.trim().slice(0, 140)
          : "Practice short focused sessions and track your progress weekly.",
      famousPlayers: Array.isArray(rec?.famousPlayers)
        ? rec.famousPlayers
          .filter((value: unknown) => typeof value === "string")
          .slice(0, 2)
        : candidate.famousPlayers.slice(0, 2),
      perfectFor:
        typeof rec?.perfectFor === "string" && rec.perfectFor.trim().length > 0
          ? rec.perfectFor.trim().slice(0, 32)
          : "your next step",
      genres: candidate.genres,
      difficulty: candidate.difficulty,
      category: candidate.category,
      description: candidate.description,
      relatedInstruments: candidate.relatedInstruments,
      aiPowered: true,
      aiProvider: "On-Device LLM",
    });
  }

  if (mapped.length === 0) {
    return [];
  }

  return mapped
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

export const generateOfflineSuggestionsWithLocalLLM = async (
  input: GenerateOfflineSuggestionsWithLlmInput,
): Promise<EnhanceOfflineSuggestionsResult> => {
  const traceId = `llm-suggest-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  const startedAt = Date.now();
  const safeLimit = clamp(input.limit || 10, 3, 20);
  const cacheKey = buildLlmOnlyCacheKey({ ...input, limit: safeLimit });

  console.log("[OFFLINE_LLM_SUGGESTIONS] Start", {
    traceId,
    safeLimit,
    genresCount: input.genres.length,
    currentInstrumentsCount: input.currentInstruments.length,
    userRolesCount: input.userRoles.length,
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
  });

  const buildLocalFallback = (
    stage: string,
    message: string,
  ): EnhanceOfflineSuggestionsResult => {
    const suggestions = getOfflineInstrumentSuggestions({
      genres: input.genres,
      currentInstruments: input.currentInstruments,
      userRoles: input.userRoles,
      experienceLevel: input.experienceLevel,
      purpose: input.purpose,
      limit: safeLimit,
    });

    console.log("[OFFLINE_LLM_SUGGESTIONS] Local fallback", {
      traceId,
      stage,
      suggestionsCount: suggestions.length,
      message,
      elapsedMs: Date.now() - startedAt,
    });

    return {
      suggestions,
      aiPowered: false,
      aiProvider: "On-Device Local Ranker",
      message,
    };
  };

  const cached = await getCachedSuggestions<InstrumentSuggestion>(cacheKey);
  if (cached && cached.length > 0) {
    console.log("[OFFLINE_LLM_SUGGESTIONS] Cache hit", {
      traceId,
      suggestionsCount: cached.length,
      elapsedMs: Date.now() - startedAt,
    });

    return {
      suggestions: cached,
      aiPowered: true,
      aiProvider: "On-Device LLM (Cached)",
      message: "Generated by on-device LLM from local cache.",
    };
  }

  console.log("[OFFLINE_LLM_SUGGESTIONS] Cache miss", {
    traceId,
    cacheKeyPreview: cacheKey.slice(0, 28),
  });

  const module = getNativeOfflineLlmModule();
  if (!module) {
    return buildLocalFallback(
      "module_unavailable",
      "Using smart local suggestions.",
    );
  }

  console.log("[OFFLINE_LLM_SUGGESTIONS] Native module detected", {
    traceId,
    hasGenerateJson: typeof module.generateJson === "function",
    hasGenerateText: typeof module.generateText === "function",
    hasIsModelReady: typeof module.isModelReady === "function",
    hasPrepareModel: typeof module.prepareModel === "function",
  });

  const ready = await ensureModelReady(module);
  console.log("[OFFLINE_LLM_SUGGESTIONS] Model readiness check", {
    traceId,
    ready,
  });

  if (!ready) {
    return buildLocalFallback(
      "model_not_ready",
      "Using smart local suggestions.",
    );
  }

  const normalizedCurrent = input.currentInstruments.map(normalize);
  const candidates = getOfflineInstrumentCatalog().filter((item) => {
    const name = item.name.toLowerCase();
    return !normalizedCurrent.some(
      (owned) => owned.includes(name) || name.includes(owned),
    );
  });

  console.log("[OFFLINE_LLM_SUGGESTIONS] Candidate filter", {
    traceId,
    catalogCount: getOfflineInstrumentCatalog().length,
    candidatesCount: candidates.length,
  });

  if (candidates.length === 0) {
    return buildLocalFallback(
      "candidate_filter_empty",
      "Using smart local suggestions.",
    );
  }

  try {
    const { systemPrompt, userPrompt } = buildLlmOnlyPrompt(
      { ...input, limit: safeLimit },
      candidates,
    );
    const raw = await generateWithNativeLlm(module, systemPrompt, userPrompt);

    console.log("[OFFLINE_LLM_SUGGESTIONS] LLM response received", {
      traceId,
      hasRaw: Boolean(raw),
      rawLength: raw ? raw.length : 0,
    });

    if (!raw) {
      return buildLocalFallback(
        "empty_llm_output",
        "Using smart local suggestions.",
      );
    }

    const parsed = parseLlmOnlyResult(raw);
    const suggestions = mapLlmOnlySuggestions(parsed, candidates, safeLimit);

    console.log("[OFFLINE_LLM_SUGGESTIONS] Parse result", {
      traceId,
      parsedCount: parsed.length,
      mappedSuggestionsCount: suggestions.length,
    });

    if (suggestions.length === 0) {
      return buildLocalFallback(
        "invalid_llm_output",
        "Using smart local suggestions.",
      );
    }

    await setCachedSuggestions<InstrumentSuggestion>(cacheKey, suggestions);

    console.log("[OFFLINE_LLM_SUGGESTIONS] Success", {
      traceId,
      suggestionsCount: suggestions.length,
      elapsedMs: Date.now() - startedAt,
    });

    return {
      suggestions,
      aiPowered: true,
      aiProvider: "On-Device LLM",
      message: "Generated by on-device LLM. No internet or paid API used.",
    };
  } catch (error: unknown) {
    console.warn("[OFFLINE_LLM_SUGGESTIONS] Generation failed", {
      traceId,
      elapsedMs: Date.now() - startedAt,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });

    return buildLocalFallback(
      "llm_exception",
      "Using smart local suggestions.",
    );
  }
};

const buildHomeFeedCacheKey = (input: RerankHomeFeedInput) => {
  const keyPayload = {
    skills: [...input.profileSignals.skills].map(normalize).sort(),
    genres: [...input.profileSignals.genres].map(normalize).sort(),
    limit: input.limit,
    candidates: input.candidates.slice(0, 30).map((item: any) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      score: item.similarity,
      updated_at: item.updated_at || item.created_at,
    })),
  };

  return `${HOME_FEED_CACHE_PREFIX}${hashString(JSON.stringify(keyPayload))}`;
};

const parseHomeFeedLlmResult = (raw: string): HomeFeedLlmRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const normalizeRec = (entry: unknown): HomeFeedLlmRec | null => {
      if (typeof entry === "number") {
        return { idx: entry };
      }

      if (typeof entry === "string") {
        const numericMatch = entry.match(/\d+/);
        return numericMatch ? { idx: Number(numericMatch[0]) } : null;
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      return {
        idx:
          record.idx ??
          record.index ??
          record.candidate_idx ??
          record.candidateIndex ??
          record.rank,
        id: record.id ?? record.candidate_id ?? record.candidateId,
        score: record.score ?? record.rating ?? record.relevance,
        reason:
          record.reason ??
          record.why ??
          record.rationale ??
          record.explanation,
      };
    };

    const rawRecommendations = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : Array.isArray(parsed?.ranking)
          ? parsed.ranking
          : Array.isArray(parsed?.results)
            ? parsed.results
            : Array.isArray(parsed?.items)
              ? parsed.items
              : [];

    return rawRecommendations
      .map((entry: unknown) => normalizeRec(entry))
      .filter((entry: HomeFeedLlmRec | null): entry is HomeFeedLlmRec => entry !== null);
  } catch {
    const regexMatches = Array.from(raw.matchAll(/(?:idx|index|candidate)\D{0,6}(\d{1,2})/gi));
    if (regexMatches.length > 0) {
      return regexMatches.map((match) => ({ idx: Number(match[1]) }));
    }

    return [];
  }
};

const compactHomeFeedField = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") return "";

  const normalized = value
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}~`;
};

export const rerankHomeFeedWithLocalLLM = async (
  input: RerankHomeFeedInput,
): Promise<RerankHomeFeedResult> => {
  const safeLimit = clamp(input.limit || 20, 4, 30);
  const baseCandidates = Array.isArray(input.candidates)
    ? input.candidates.slice(0, Math.max(safeLimit, 24))
    : [];
  const llmCandidates = baseCandidates.slice(0, HOME_FEED_MAX_LLM_CANDIDATES);

  if (baseCandidates.length === 0) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "No candidates available for LLM reranking.",
    };
  }

  const module = getNativeOfflineLlmModule();
  if (!module) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "On-device LLM runtime not found for Home FYP.",
    };
  }

  const ready = await ensureModelReady(module);
  if (!ready) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "On-device LLM model is not ready for Home FYP yet.",
    };
  }

  const cacheKey = buildHomeFeedCacheKey({
    candidates: baseCandidates,
    profileSignals: input.profileSignals,
    limit: safeLimit,
  });

  const cached = await getCachedSuggestions<any>(cacheKey);
  if (cached && cached.length > 0) {
    return {
      recommendations: cached.slice(0, safeLimit),
      aiPowered: true,
      aiProvider: "On-Device LLM (Cached)",
      message: "Realtime feed enhanced by cached on-device LLM rerank.",
    };
  }

  try {
    const compactSkills = input.profileSignals.skills
      .slice(0, 4)
      .map((value) => compactHomeFeedField(value, 20))
      .filter(Boolean);
    const compactGenres = input.profileSignals.genres
      .slice(0, 4)
      .map((value) => compactHomeFeedField(value, 20))
      .filter(Boolean);

    // Use simple numeric indices instead of UUIDs so the small LLM can
    // reliably reference candidates in its output.
    const compactCandidates = llmCandidates.map((item: any, idx: number) => ({
      idx,
      t: compactHomeFeedField(item.type, 8),
      n: compactHomeFeedField(item.name, 28),
      g: compactHomeFeedField(item.genre, 18),
      s: Math.round(Number(item.similarity || 0) * 100),
    }));
    const llmTargetCount = Math.min(HOME_FEED_LLM_TARGET_COUNT, llmCandidates.length);

    const systemPrompt =
      "You are an on-device feed ranking model. Return strict JSON only. Prefer a compact ranking with candidate idx numbers.";

    const userPrompt = [
      "Rerank this For You feed for realtime relevance.",
      `Skills: ${compactSkills.join(", ") || "none"}`,
      `Genres: ${compactGenres.join(", ") || "none"}`,
      `Return up to ${llmTargetCount} candidates.`,
      "Return exactly:",
      '{"ranking":[0,1,2]}',
      "Also accepted:",
      '{"recommendations":[{"idx":0,"score":90}]}',
      "Rules:",
      "- Use only candidate idx numbers.",
      "- No prose before or after the JSON.",
      "- Reasons are optional.",
      "- Sort best to worst.",
      "- Prefer skill and genre fit, then freshness and score.",
      `Candidates: ${JSON.stringify(compactCandidates)}`,
    ].join("\n");

    const raw = await generateWithNativeLlm(
      module,
      systemPrompt,
      userPrompt,
      {
        timeoutMs: HOME_FEED_TIMEOUT_MS,
        maxTokens: HOME_FEED_MAX_TOKENS,
        temperature: 0.2,
      },
    );

    if (!raw) {
      return {
        recommendations: [],
        aiPowered: false,
        aiProvider: "On-Device CPU Ranker",
        message: "On-device LLM returned no Home FYP result in realtime window.",
      };
    }

    const parsed = parseHomeFeedLlmResult(raw);
    if (parsed.length === 0) {
      console.warn("[HOME_FYP_LLM] Invalid raw output", raw.slice(0, 400));
      return {
        recommendations: [],
        aiPowered: false,
        aiProvider: "On-Device CPU Ranker",
        message: "On-device LLM Home FYP output was invalid.",
      };
    }

    const reranked: any[] = [];

    for (const rec of parsed) {
      // Support both idx (new numeric) and id (legacy UUID) fields
      const idx = rec?.idx != null ? Number(rec.idx) : -1;
      let base: any = null;

      if (Number.isInteger(idx) && idx >= 0 && idx < llmCandidates.length) {
        base = llmCandidates[idx];
      } else {
        // Fallback: try matching by id string for backwards compat
        const id = typeof rec?.id === "string" ? rec.id : "";
        if (id) {
          base = llmCandidates.find((item: any) => item.id === id) || null;
        }
      }

      if (!base) continue;

      const parsedScore = Number(rec?.score);
      const safeScore = Number.isFinite(parsedScore)
        ? clamp(Math.round(parsedScore), 0, 100)
        : Math.round(Number(base.similarity || 0) * 100);

      reranked.push({
        ...base,
        similarity: safeScore / 100,
        aiReason:
          typeof rec?.reason === "string" && rec.reason.trim().length > 0
            ? rec.reason.trim().slice(0, 100)
            : base.aiReason || "Recommended for your profile.",
      });
    }

    if (reranked.length === 0) {
      return {
        recommendations: [],
        aiPowered: false,
        aiProvider: "On-Device CPU Ranker",
        message: "On-device LLM did not return usable Home FYP candidates.",
      };
    }

    const usedIds = new Set(reranked.map((item: any) => item.id));
    for (const fallback of baseCandidates) {
      if (reranked.length >= safeLimit) break;
      if (usedIds.has(fallback.id)) continue;
      reranked.push(fallback);
    }

    const finalRanked = reranked.slice(0, safeLimit);
    await setCachedSuggestions<any>(cacheKey, finalRanked);

    return {
      recommendations: finalRanked,
      aiPowered: true,
      aiProvider: "On-Device LLM",
      message: "Realtime For You feed reranked by on-device LLM.",
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const isContextFull = /context is full/i.test(errorMessage);

    console.warn("[HOME_FYP_LLM] Rerank failed", {
      limit: safeLimit,
      candidateCount: baseCandidates.length,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : String(error),
    });

    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: isContextFull
        ? "On-device LLM prompt exceeded the local context window. Using CPU ranking for Home feed."
        : "On-device LLM timed out for Home FYP rerank.",
    };
  }
};
