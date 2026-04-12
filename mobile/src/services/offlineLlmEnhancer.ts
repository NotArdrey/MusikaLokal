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
import { getLastPrepareError, getLlmDeviceCapabilityInfo, musikaLlmAdapter, stopGeneration } from "./musikaLlmAdapter";

const CACHE_PREFIX = "offline_llm_enhanced_suggestions:";
const LLM_ONLY_CACHE_PREFIX = "offline_llm_only_suggestions:";
const HOME_FEED_CACHE_PREFIX = "offline_llm_home_feed:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const GENERATION_TIMEOUT_MS = 30000;
const HOME_FEED_TIMEOUT_MS = 60000;
const HOME_FEED_MAX_LLM_CANDIDATES = 12;
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
  waitForIdle?: () => Promise<void>;
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
  idx?: unknown;
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

interface LlmOnlyAttemptConfig {
  candidateCap: number;
  maxTokens: number;
  temperature: number;
  compactMode: boolean;
  timeoutMs: number;
  timeoutGraceMs: number;
}

interface LlmOnlyPromptProfile {
  label: "very_compact" | "compact" | "full";
  preferTextGeneration: boolean;
  genreLimit: number;
  skillLimit: number;
  termLength: number;
  candidateNameLength: number;
  includeCategory: boolean;
  categoryLength: number;
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

const normalizeMatchKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const extractNumericIndex = (value: unknown): number | null => {
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

const withTimeoutGrace = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  graceMs: number,
): Promise<T> => {
  try {
    return await withTimeout(promise, timeoutMs);
  } catch (error: unknown) {
    if (
      graceMs <= 0 ||
      !(error instanceof Error) ||
      error.message !== "offline_llm_timeout"
    ) {
      throw error;
    }

    // Allow near-complete local generations to finish when wall-clock drift
    // slightly exceeds the JS timeout on constrained devices.
    try {
      return await withTimeout(promise, graceMs);
    } catch (graceError: unknown) {
      if (
        graceError instanceof Error &&
        graceError.message !== "offline_llm_timeout"
      ) {
        throw graceError;
      }

      throw error;
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

const isNativeRuntimeMissing = () => {
  const lastError = getLastPrepareError();
  return (
    typeof lastError === "string" &&
    lastError.toLowerCase().includes("native module is not available")
  );
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
  const llmNctx = getLlmDeviceCapabilityInfo().config.nCtx;
  const keyPayload = {
    genres: [...input.genres].map(normalize).sort(),
    currentInstruments: [...input.currentInstruments].map(normalize).sort(),
    userRoles: [...input.userRoles].map(normalize).sort(),
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: input.limit,
    llmNctx,
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
    timeoutGraceMs?: number;
    maxTokens?: number;
    temperature?: number;
    preferText?: boolean;
  } = {},
): Promise<string | null> => {
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const timeoutGraceMs = options.timeoutGraceMs ?? 0;
  const maxTokens = options.maxTokens ?? 650;
  const temperature = options.temperature ?? 0.3;
  const preferText = options.preferText === true;

  if (preferText && typeof module.generateText === "function") {
    const result = await withTimeoutGrace(
      module.generateText(`${systemPrompt}\n${userPrompt}`, {
        maxTokens,
        temperature,
      }),
      timeoutMs,
      timeoutGraceMs,
    );
    return typeof result === "string" ? result : null;
  }

  if (typeof module.generateJson === "function") {
    const result = await withTimeoutGrace(
      module.generateJson({
        prompt: userPrompt,
        systemPrompt,
        maxTokens,
        temperature,
      }),
      timeoutMs,
      timeoutGraceMs,
    );

    if (typeof result === "string") return result;
    return JSON.stringify(result);
  }

  if (typeof module.generateText === "function") {
    const result = await withTimeoutGrace(
      module.generateText(`${systemPrompt}\n\n${userPrompt}`, {
        maxTokens,
        temperature,
      }),
      timeoutMs,
      timeoutGraceMs,
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
        isNativeRuntimeMissing()
          ? "On-device LLM requires a custom dev client build (expo run:android). Using local smart ranking."
          : "Offline LLM model is not ready on this device yet. Using local smart ranking.",
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
  const llmNctx = getLlmDeviceCapabilityInfo().config.nCtx;
  const keyPayload = {
    genres: [...input.genres].map(normalize).sort(),
    currentInstruments: [...input.currentInstruments].map(normalize).sort(),
    userRoles: [...input.userRoles].map(normalize).sort(),
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: input.limit,
    llmNctx,
  };

  return `${LLM_ONLY_CACHE_PREFIX}${hashString(JSON.stringify(keyPayload))}`;
};

const compactLlmPromptText = (value: unknown, maxLength: number): string => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}~`;
};

const compactLlmPromptList = (
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry: unknown): entry is string => typeof entry === "string")
    .map((entry) => compactLlmPromptText(entry, maxItemLength))
    .filter(Boolean)
    .slice(0, maxItems);
};

const isLlmContextFullError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /context is full|context full|n_ctx|prompt.+long|too many tokens|token limit/i.test(message);
};

const isRetriableLlmError = (error: unknown): boolean => {
  if (isLlmContextFullError(error)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /offline_llm_timeout|timed out|timeout/i.test(message);
};

const prioritizeLlmOnlyCandidates = (
  input: GenerateOfflineSuggestionsWithLlmInput,
  candidates: LocalInstrumentProfile[],
): LocalInstrumentProfile[] => {
  const seedLimit = clamp(Math.max(input.limit * 2, 12), 6, 24);
  const seedSuggestions = getOfflineInstrumentSuggestions({
    genres: input.genres,
    currentInstruments: input.currentInstruments,
    userRoles: input.userRoles,
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: seedLimit,
  });

  if (seedSuggestions.length === 0) {
    return candidates;
  }

  const byName = new Map(
    candidates.map((item) => [normalize(item.name), item]),
  );
  const prioritized: LocalInstrumentProfile[] = [];
  const used = new Set<string>();

  for (const suggestion of seedSuggestions) {
    const key = normalize(suggestion.name);
    const candidate = byName.get(key);
    if (!candidate || used.has(key)) {
      continue;
    }

    prioritized.push(candidate);
    used.add(key);
  }

  for (const candidate of candidates) {
    const key = normalize(candidate.name);
    if (used.has(key)) {
      continue;
    }

    prioritized.push(candidate);
  }

  return prioritized.length > 0 ? prioritized : candidates;
};

const buildLlmOnlyAttemptConfigs = (
  limit: number,
  candidateCount: number,
): LlmOnlyAttemptConfig[] => {
  if (candidateCount <= 0) {
    return [];
  }

  const capabilityInfo = getLlmDeviceCapabilityInfo();
  const promptProfile = getLlmOnlyPromptProfile();
  const cap = (n: number) => clamp(n, 1, candidateCount);

  if (promptProfile.label === "very_compact") {
    const firstCap = cap(Math.min(capabilityInfo.maxCandidateCap, 4));
    const secondCap = cap(3);
    const configs: LlmOnlyAttemptConfig[] = [
      {
        candidateCap: firstCap,
        maxTokens: Math.min(capabilityInfo.maxTokens, 80),
        temperature: 0.1,
        compactMode: true,
        timeoutMs: Math.max(capabilityInfo.timeoutMs + 9000, 30000),
        timeoutGraceMs: 6000,
      },
    ];

    if (secondCap < firstCap) {
      configs.push({
        candidateCap: secondCap,
        maxTokens: Math.min(capabilityInfo.maxTokens, 64),
        temperature: 0.1,
        compactMode: true,
        timeoutMs: Math.max(capabilityInfo.timeoutMs + 5000, 26000),
        timeoutGraceMs: 4000,
      });
    }

    return configs;
  }

  let firstCap = cap(
    Math.min(
      capabilityInfo.maxCandidateCap,
      Math.max(limit + 2, Math.min(capabilityInfo.maxCandidateCap, 6)),
    ),
  );
  let secondCap = cap(
    Math.max(Math.min(firstCap - 2, Math.max(limit, 4)), 4),
  );
  let thirdCap = cap(
    Math.max(Math.min(secondCap - 2, Math.max(limit - 1, 3)), 3),
  );

  if (promptProfile.label === "compact") {
    firstCap = cap(Math.min(capabilityInfo.maxCandidateCap, 6));
    secondCap = cap(Math.max(Math.min(firstCap - 1, 5), 4));
    thirdCap = cap(Math.max(Math.min(secondCap - 1, 4), 3));
  }

  const caps = [firstCap, secondCap, thirdCap];
  let tokenBudgets = [
    capabilityInfo.maxTokens,
    Math.max(Math.round(capabilityInfo.maxTokens * 0.75), 75),
    Math.max(Math.round(capabilityInfo.maxTokens * 0.6), 60),
  ];
  let timeouts = [
    capabilityInfo.timeoutMs,
    Math.max(capabilityInfo.timeoutMs - 4000, 15000),
    Math.max(capabilityInfo.timeoutMs - 8000, 12000),
  ];
  let timeoutGraceMs = [0, 0, 0];

  if (promptProfile.label === "compact") {
    timeouts = [
      Math.max(capabilityInfo.timeoutMs + 4000, 26000),
      Math.max(capabilityInfo.timeoutMs, 22000),
      Math.max(capabilityInfo.timeoutMs - 3000, 18000),
    ];
    timeoutGraceMs = [3000, 2500, 2000];
  }

  // Ensure strictly decreasing so each retry is smaller than the last.
  for (let i = 1; i < caps.length; i += 1) {
    if (caps[i] >= caps[i - 1]) {
      caps[i] = Math.max(caps[i - 1] - 1, 1);
    }
  }

  return caps.map((c, i) => ({
    candidateCap: c,
    maxTokens: tokenBudgets[i],
    temperature: 0.1,
    compactMode: true,
    timeoutMs: timeouts[i],
    timeoutGraceMs: timeoutGraceMs[i],
  }));
};

const getLlmOnlyPromptProfile = (): LlmOnlyPromptProfile => {
  const nCtx = getLlmDeviceCapabilityInfo().config.nCtx;

  if (nCtx <= 1536) {
    return {
      label: "very_compact",
      preferTextGeneration: true,
      genreLimit: 3,
      skillLimit: 3,
      termLength: 12,
      candidateNameLength: 18,
      includeCategory: false,
      categoryLength: 0,
    };
  }

  if (nCtx <= 3072) {
    return {
      label: "compact",
      preferTextGeneration: true,
      genreLimit: 4,
      skillLimit: 4,
      termLength: 14,
      candidateNameLength: 20,
      includeCategory: true,
      categoryLength: 10,
    };
  }

  return {
    label: "full",
    preferTextGeneration: false,
    genreLimit: 4,
    skillLimit: 4,
    termLength: 16,
    candidateNameLength: 24,
    includeCategory: true,
    categoryLength: 12,
  };
};

const buildHomeFeedLlmConfig = () => {
  const capabilityInfo = getLlmDeviceCapabilityInfo();
  const maxCandidates = clamp(
    Math.min(capabilityInfo.maxCandidateCap, HOME_FEED_MAX_LLM_CANDIDATES),
    6,
    HOME_FEED_MAX_LLM_CANDIDATES,
  );

  return {
    maxCandidates,
    targetCount: clamp(
      Math.min(Math.max(maxCandidates - 2, 4), HOME_FEED_LLM_TARGET_COUNT),
      4,
      HOME_FEED_LLM_TARGET_COUNT,
    ),
    maxTokens: clamp(Math.round(capabilityInfo.maxTokens * 0.9), 100, 240),
    timeoutMs: clamp(capabilityInfo.timeoutMs + 8000, 30000, HOME_FEED_TIMEOUT_MS),
  };
};

const buildLlmOnlyPrompt = (
  input: GenerateOfflineSuggestionsWithLlmInput,
  candidates: LocalInstrumentProfile[],
  options: { compactMode?: boolean; profile?: LlmOnlyPromptProfile } = {},
) => {
  const profile = options.profile ?? getLlmOnlyPromptProfile();
  const genres = input.genres
    .slice(0, profile.genreLimit)
    .map((g) => compactLlmPromptText(g, profile.termLength))
    .join(",");
  const skills = input.currentInstruments
    .slice(0, profile.skillLimit)
    .map((s) => compactLlmPromptText(s, profile.termLength))
    .join(",");
  const compactCandidates = candidates.map((candidate, idx) => ({
    i: idx,
    n: compactLlmPromptText(candidate.name, profile.candidateNameLength),
    ...(profile.includeCategory
      ? { c: compactLlmPromptText(candidate.category, profile.categoryLength) }
      : null),
  }));

  if (profile.label !== "full") {
    const compactHeader =
      profile.label === "very_compact"
        ? `Fit:${genres || "general"}|Has:${skills || "none"}|${input.experienceLevel}|${input.purpose}`
        : `Fit:${genres || "general"}|Has:${skills || "none"}|Lvl:${input.experienceLevel}|Goal:${input.purpose}`;

    return {
      systemPrompt:
        profile.label === "very_compact"
          ? "Rank instruments. JSON only. Use candidate i values."
          : "Rank instruments. Return JSON only with candidate i values and short reasons.",
      userPrompt: [
        compactHeader,
        `C:${JSON.stringify(compactCandidates)}`,
        'Reply:[{"i":0,"r":"why","s":90}]',
        `Max ${Math.min(input.limit, candidates.length)}, use only i, short r, JSON only, best first.`,
      ].join("\n"),
    };
  }

  const systemPrompt = "Music advisor. Return strict JSON only. Prefer candidate index values.";

  const userPrompt = [
    `Pick the best fits for ${genres || "general"} | has:${skills || "none"} | ${input.experienceLevel} | ${input.purpose}`,
    `Candidates:${JSON.stringify(compactCandidates)}`,
    `Return up to ${Math.min(input.limit, candidates.length)} candidates.`,
    'Return exactly:[{"i":0,"r":"why","s":90}]',
    "Rules: use only candidate index values, no markdown, no prose, best first.",
  ].join("\n");

  return { systemPrompt, userPrompt };
};

const parseLlmOnlyResult = (raw: string): LlmOnlyRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));

    const normalizeRec = (entry: unknown): LlmOnlyRec | null => {
      if (typeof entry === "number") {
        return { idx: entry };
      }

      if (typeof entry === "string") {
        const idx = extractNumericIndex(entry);
        if (idx !== null && /^\s*(?:idx|index|candidate|i|#|\d)/i.test(entry)) {
          return { idx };
        }

        return entry.trim().length > 0 ? { name: entry } : null;
      }

      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      return {
        idx:
          record.idx ??
          record.index ??
          record.i ??
          record.candidate_idx ??
          record.candidateIndex ??
          record.rank,
        name: record.n ?? record.name,
        score: record.s ?? record.score,
        whyThisFits:
          record.r ?? record.reason ?? record.whyThisFits ?? record.why,
        headline: record.headline,
        learningCurve: record.learningCurve,
        timeToBasics: record.timeToBasics,
        proTip: record.proTip,
        famousPlayers: record.famousPlayers,
        perfectFor: record.perfectFor,
      };
    };

    const recs: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : Array.isArray(parsed?.r)
          ? parsed.r
          : Array.isArray(parsed?.results)
            ? parsed.results
            : Array.isArray(parsed?.items)
              ? parsed.items
              : Array.isArray(parsed?.ranking)
                ? parsed.ranking
                : [];

    return recs
      .map((entry: unknown) => normalizeRec(entry))
      .filter(
        (rec: LlmOnlyRec | null): rec is LlmOnlyRec =>
          rec !== null && (rec.name != null || rec.idx != null),
      );
  } catch {
    const bracketedIndexes = raw.match(/\[\s*([\d\s,]+)\s*\]/);
    if (bracketedIndexes?.[1]) {
      const indexes = bracketedIndexes[1]
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry));

      if (indexes.length > 0) {
        return indexes.map((idx) => ({ idx }));
      }
    }

    if (/^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(raw)) {
      return raw
        .split(",")
        .map((entry) => Number(entry.trim()))
        .filter((entry) => Number.isInteger(entry))
        .map((idx) => ({ idx }));
    }

    const regexMatches = Array.from(
      raw.matchAll(/(?:idx|index|candidate|i|#)\D{0,6}(\d{1,2})/gi),
    );
    if (regexMatches.length > 0) {
      return regexMatches.map((match) => ({ idx: Number(match[1]) }));
    }

    return [];
  }
};

const mapLlmOnlySuggestions = (
  llmRecommendations: LlmOnlyRec[],
  candidates: LocalInstrumentProfile[],
  cpuSuggestions: InstrumentSuggestion[],
  limit: number,
): InstrumentSuggestion[] => {
  const candidateByIndex = candidates;
  const byName = new Map(
    candidates.map((item) => [normalizeMatchKey(item.name), item]),
  );

  const cpuByName = new Map(
    cpuSuggestions.map((item) => [normalizeMatchKey(item.name), item]),
  );

  const mapped: InstrumentSuggestion[] = [];
  const used = new Set<string>();

  for (const rec of llmRecommendations) {
    const idx = extractNumericIndex(rec?.idx);
    const name = typeof rec?.name === "string" ? rec.name.trim() : "";
    let candidate: LocalInstrumentProfile | undefined;

    if (idx !== null && idx >= 0 && idx < candidateByIndex.length) {
      candidate = candidateByIndex[idx];
    }

    if (!candidate && name) {
      const normalizedName = normalizeMatchKey(name);
      candidate = byName.get(normalizedName);

      if (!candidate && normalizedName) {
        candidate = candidates.find((item) => {
          const candidateKey = normalizeMatchKey(item.name);
          return (
            candidateKey.includes(normalizedName) ||
            normalizedName.includes(candidateKey)
          );
        });
      }
    }

    if (!candidate) continue;

    const candidateKey = normalizeMatchKey(candidate.name);
    if (used.has(candidateKey)) continue;

    // Use CPU ranker data as the rich fallback for all fields
    const cpu = cpuByName.get(candidateKey);

    const parsedScore = Number(rec?.score);
    const score = Number.isFinite(parsedScore)
      ? clamp(Math.round(parsedScore), 0, 100)
      : cpu?.score ?? 80;

    // LLM reason is the main value-add; everything else from CPU ranker
    const llmReason =
      typeof rec?.whyThisFits === "string" && rec.whyThisFits.trim().length > 0
        ? rec.whyThisFits.trim().slice(0, 220)
        : null;

    mapped.push({
      name: candidate.name,
      image: candidate.image,
      score,
      headline:
        cpu?.headline ?? `${candidate.name} fits your musical profile`,
      matchReason:
        llmReason ?? cpu?.matchReason ?? candidate.description,
      learningCurve:
        cpu?.learningCurve ?? normalizeLearningCurve(candidate.difficulty),
      timeToBasics: cpu?.timeToBasics ?? "4-8 weeks",
      proTip:
        cpu?.proTip ??
        "Practice short focused sessions and track your progress weekly.",
      famousPlayers:
        cpu?.famousPlayers ?? candidate.famousPlayers.slice(0, 2),
      perfectFor: cpu?.perfectFor ?? "your next step",
      genres: candidate.genres,
      difficulty: candidate.difficulty,
      category: candidate.category,
      description: candidate.description,
      relatedInstruments: candidate.relatedInstruments,
      aiPowered: true,
      aiProvider: "On-Device LLM",
    });

    used.add(candidateKey);
  }

  if (mapped.length === 0) {
    return [];
  }

  for (const cpuSuggestion of cpuSuggestions) {
    if (mapped.length >= limit) {
      break;
    }

    const cpuKey = normalizeMatchKey(cpuSuggestion.name);
    if (used.has(cpuKey)) {
      continue;
    }

    mapped.push({
      ...cpuSuggestion,
      aiPowered: true,
      aiProvider: "On-Device LLM",
    });
    used.add(cpuKey);
  }

  return mapped.slice(0, limit);
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
    const modelNotReadyMessage = isNativeRuntimeMissing()
      ? "On-device LLM requires a custom dev client build (expo run:android). Using smart local suggestions."
      : "On-device LLM model is still preparing. Using smart local suggestions.";

    return buildLocalFallback(
      "model_not_ready",
      modelNotReadyMessage,
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

  const prioritizedCandidates = prioritizeLlmOnlyCandidates(
    { ...input, limit: safeLimit },
    candidates,
  );

  // Pre-compute CPU ranker suggestions for enrichment (fast, <1ms)
  const cpuSuggestions = getOfflineInstrumentSuggestions({
    genres: input.genres,
    currentInstruments: input.currentInstruments,
    userRoles: input.userRoles,
    experienceLevel: input.experienceLevel,
    purpose: input.purpose,
    limit: 20,
  });

  const attempts = buildLlmOnlyAttemptConfigs(
    safeLimit,
    prioritizedCandidates.length,
  );
  const promptProfile = getLlmOnlyPromptProfile();
  const preferTextGeneration = promptProfile.preferTextGeneration;

  if (attempts.length === 0) {
    return buildLocalFallback(
      "candidate_attempt_empty",
      "Using smart local suggestions.",
    );
  }

  let contextFullSeen = false;

  try {
    await withTimeout(module.waitForIdle?.() ?? Promise.resolve(), 10000);
  } catch {
    // Ignore queue-drain failures before the first attempt.
  }

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const attempt = attempts[attemptIndex];
    const attemptCandidates = prioritizedCandidates.slice(0, attempt.candidateCap);

    console.log("[OFFLINE_LLM_SUGGESTIONS] Generation attempt", {
      traceId,
      attempt: attemptIndex + 1,
      totalAttempts: attempts.length,
      compactMode: attempt.compactMode,
      promptProfile: promptProfile.label,
      generationMode: preferTextGeneration ? "text" : "json",
      candidateCap: attempt.candidateCap,
      candidateCount: attemptCandidates.length,
      maxTokens: attempt.maxTokens,
      timeoutMs: attempt.timeoutMs,
      timeoutGraceMs: attempt.timeoutGraceMs,
    });

    try {
      const { systemPrompt, userPrompt } = buildLlmOnlyPrompt(
        { ...input, limit: safeLimit },
        attemptCandidates,
        { compactMode: attempt.compactMode, profile: promptProfile },
      );
      const raw = await generateWithNativeLlm(module, systemPrompt, userPrompt, {
        timeoutMs: attempt.timeoutMs,
        timeoutGraceMs: attempt.timeoutGraceMs,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
        preferText: preferTextGeneration,
      });

      console.log("[OFFLINE_LLM_SUGGESTIONS] LLM response received", {
        traceId,
        attempt: attemptIndex + 1,
        hasRaw: Boolean(raw),
        rawLength: raw ? raw.length : 0,
      });

      if (!raw) {
        if (attemptIndex < attempts.length - 1) {
          continue;
        }

        return buildLocalFallback(
          "empty_llm_output",
          "Using smart local suggestions.",
        );
      }

      const parsed = parseLlmOnlyResult(raw);
      const suggestions = mapLlmOnlySuggestions(parsed, attemptCandidates, cpuSuggestions, safeLimit);

      console.log("[OFFLINE_LLM_SUGGESTIONS] Parse result", {
        traceId,
        attempt: attemptIndex + 1,
        parsedCount: parsed.length,
        mappedSuggestionsCount: suggestions.length,
      });

      if (parsed.length === 0) {
        console.warn("[OFFLINE_LLM_SUGGESTIONS] Invalid raw output", {
          traceId,
          attempt: attemptIndex + 1,
          rawPreview: raw.slice(0, 200),
        });
      }

      if (suggestions.length === 0) {
        if (attemptIndex < attempts.length - 1) {
          continue;
        }

        return buildLocalFallback(
          "invalid_llm_output",
          "Using smart local suggestions.",
        );
      }

      await setCachedSuggestions<InstrumentSuggestion>(cacheKey, suggestions);

      console.log("[OFFLINE_LLM_SUGGESTIONS] Success", {
        traceId,
        attempt: attemptIndex + 1,
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
      // Cancel any in-progress generation so the next attempt doesn't queue behind it
      stopGeneration();

      const contextFull = isLlmContextFullError(error);
      contextFullSeen = contextFullSeen || contextFull;

      console.warn("[OFFLINE_LLM_SUGGESTIONS] Generation attempt failed", {
        traceId,
        attempt: attemptIndex + 1,
        compactMode: attempt.compactMode,
        candidateCap: attempt.candidateCap,
        contextFull,
        elapsedMs: Date.now() - startedAt,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error),
      });

      if (attemptIndex < attempts.length - 1 && isRetriableLlmError(error)) {
        try {
          await withTimeout(module.waitForIdle?.() ?? Promise.resolve(), 8000);
        } catch {
          // Ignore queue drain failures and let the retry continue.
        }
        continue;
      }

      return buildLocalFallback(
        contextFull ? "llm_context_full" : "llm_exception",
        contextFull
          ? "On-device LLM context window is full for this request. Using smart local suggestions."
          : "Using smart local suggestions.",
      );
    }
  }

  return buildLocalFallback(
    contextFullSeen ? "llm_context_full" : "llm_retries_exhausted",
    contextFullSeen
      ? "On-device LLM context window is full for this request. Using smart local suggestions."
      : "Using smart local suggestions.",
  );
};

const buildHomeFeedCacheKey = (input: RerankHomeFeedInput) => {
  const llmNctx = getLlmDeviceCapabilityInfo().config.nCtx;
  const keyPayload = {
    skills: [...input.profileSignals.skills].map(normalize).sort(),
    genres: [...input.profileSignals.genres].map(normalize).sort(),
    limit: input.limit,
    llmNctx,
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
  const homeFeedConfig = buildHomeFeedLlmConfig();
  const baseCandidates = Array.isArray(input.candidates)
    ? input.candidates.slice(0, Math.max(safeLimit, 24))
    : [];
  const llmCandidates = baseCandidates.slice(0, homeFeedConfig.maxCandidates);

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
      message: isNativeRuntimeMissing()
        ? "On-device LLM requires a custom dev client build (expo run:android) and is unavailable in Expo Go."
        : "On-device LLM model is not ready for Home FYP yet.",
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
    const llmTargetCount = Math.min(homeFeedConfig.targetCount, llmCandidates.length);

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
        timeoutMs: homeFeedConfig.timeoutMs,
        maxTokens: homeFeedConfig.maxTokens,
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
