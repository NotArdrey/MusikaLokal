import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ExperienceLevel,
  InstrumentSuggestion,
  SuggestionPurpose,
} from "../types/instruments";
import {
  getOfflineInstrumentCatalog,
  getOfflineInstrumentSuggestions,
  LocalInstrumentProfile,
} from "../utils/offlineInstrumentRecommender";

const LLM_ONLY_CACHE_PREFIX = "offline_llm_only_suggestions:";
const HOME_FEED_CACHE_PREFIX = "offline_llm_home_feed:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const GENERATION_TIMEOUT_MS = 3500;
const HOME_FEED_TIMEOUT_MS = 1800;

// ── RAM-based device config (web equivalent of mobile musikaLlmAdapter) ──

export interface LlmDeviceConfig {
  nCtx: number;
  ramTierLabel: string;
  totalRamGB: number | null;
}

export interface LlmDeviceCapabilityInfo {
  config: LlmDeviceConfig;
  summaryText: string;
  limitationText: string;
  maxCandidateCap: number;
  maxTokens: number;
  timeoutMs: number;
}

interface LlmRamTierProfile {
  minDetectedRamGB: number;
  label: string;
  nCtx: number;
  maxCandidateCap: number;
  maxTokens: number;
  timeoutMs: number;
  limitationText: string;
}

const LLM_RAM_TIER_PROFILES: LlmRamTierProfile[] = [
  {
    minDetectedRamGB: 7.5,
    label: "8 GB",
    nCtx: 8192,
    maxCandidateCap: 14,
    maxTokens: 260,
    timeoutMs: 32000,
    limitationText:
      "Current device limit: up to 14 candidate instruments, 260 AI output tokens, and a 32s local generation window.",
  },
  {
    minDetectedRamGB: 5.5,
    label: "6 GB",
    nCtx: 4096,
    maxCandidateCap: 12,
    maxTokens: 220,
    timeoutMs: 28000,
    limitationText:
      "Current device limit: up to 12 candidate instruments, 220 AI output tokens, and a 28s local generation window.",
  },
  {
    minDetectedRamGB: 3.5,
    label: "4 GB",
    nCtx: 3072,
    maxCandidateCap: 10,
    maxTokens: 180,
    timeoutMs: 24000,
    limitationText:
      "Current device limit: up to 10 candidate instruments, 180 AI output tokens, and a 24s local generation window.",
  },
  {
    minDetectedRamGB: 2.5,
    label: "3 GB",
    nCtx: 2048,
    maxCandidateCap: 8,
    maxTokens: 140,
    timeoutMs: 22000,
    limitationText:
      "Current device limit: up to 8 candidate instruments, 140 AI output tokens, and a 22s local generation window.",
  },
  {
    minDetectedRamGB: 1.75,
    label: "2 GB",
    nCtx: 1536,
    maxCandidateCap: 7,
    maxTokens: 120,
    timeoutMs: 21000,
    limitationText:
      "This device runs AI in compact mode: up to 7 candidate instruments, 120 AI output tokens, and a 21s local generation window. Broader requests may fall back to smart local ranking.",
  },
  {
    minDetectedRamGB: 0,
    label: "<2 GB",
    nCtx: 1024,
    maxCandidateCap: 6,
    maxTokens: 100,
    timeoutMs: 20000,
    limitationText:
      "This device runs AI in compact mode: up to 6 candidate instruments, 100 AI output tokens, and a 20s local generation window. Broader requests may fall back to smart local ranking.",
  },
];

let deviceConfig: LlmDeviceConfig | null = null;

const buildDeviceSummaryText = (config: LlmDeviceConfig): string => {
  if (config.totalRamGB != null) {
    return `Context: ${config.nCtx.toLocaleString()} tokens \u00B7 ${config.ramTierLabel} RAM tier`;
  }

  return `Context: ${config.nCtx.toLocaleString()} tokens \u00B7 RAM not detected`;
};

const resolveLlmRamTier = (totalRamGB: number | null): LlmRamTierProfile | null => {
  if (totalRamGB == null) {
    return null;
  }

  return (
    LLM_RAM_TIER_PROFILES.find((profile) => totalRamGB >= profile.minDetectedRamGB) ??
    LLM_RAM_TIER_PROFILES[LLM_RAM_TIER_PROFILES.length - 1]
  );
};

const buildLlmDeviceCapabilityInfo = (
  config: LlmDeviceConfig,
): LlmDeviceCapabilityInfo => {
  const summaryText = buildDeviceSummaryText(config);

  const tier = resolveLlmRamTier(config.totalRamGB);
  if (!tier) {
    return {
      config,
      summaryText,
      limitationText:
        "RAM could not be detected, so AI stays in the safest compact mode: up to 6 candidate instruments, 100 AI output tokens, and a 20s local generation window.",
      maxCandidateCap: 6,
      maxTokens: 100,
      timeoutMs: 20000,
    };
  }

  return {
    config,
    summaryText,
    limitationText: tier.limitationText,
    maxCandidateCap: tier.maxCandidateCap,
    maxTokens: tier.maxTokens,
    timeoutMs: tier.timeoutMs,
  };
};

const detectDeviceConfig = (): LlmDeviceConfig => {
  if (deviceConfig) return deviceConfig;

  // navigator.deviceMemory is a Chrome/Edge API that returns approximate RAM in GiB
  const navMemory =
    typeof navigator !== "undefined"
      ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? undefined)
      : undefined;
  if (navMemory == null || !Number.isFinite(navMemory)) {
    deviceConfig = { nCtx: 1024, ramTierLabel: "Unknown RAM", totalRamGB: null };
  } else {
    const totalGB = Math.round(navMemory * 10) / 10;
    const tier = resolveLlmRamTier(totalGB) ?? LLM_RAM_TIER_PROFILES[LLM_RAM_TIER_PROFILES.length - 1];

    deviceConfig = {
      nCtx: tier.nCtx,
      ramTierLabel: tier.label,
      totalRamGB: totalGB,
    };
  }

  const capabilityInfo = buildLlmDeviceCapabilityInfo(deviceConfig);
  console.log("[MusikaLLM:webDeviceConfig]", {
    totalRamGB: deviceConfig.totalRamGB,
    ramTier: deviceConfig.ramTierLabel,
    nCtx: deviceConfig.nCtx,
    maxCandidates: capabilityInfo.maxCandidateCap,
    maxTokens: capabilityInfo.maxTokens,
    timeoutMs: capabilityInfo.timeoutMs,
    limitation: capabilityInfo.limitationText,
  });
  return deviceConfig;
};

/**
 * Returns the RAM-based LLM configuration for this device (web).
 * Safe to call at any time — detection is lazy and cached.
 */
export const getLlmDeviceConfig = (): LlmDeviceConfig => detectDeviceConfig();

export const getLlmDeviceCapabilityInfo = (): LlmDeviceCapabilityInfo =>
  buildLlmDeviceCapabilityInfo(detectDeviceConfig());

interface OfflineLlmRuntime {
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

export interface GenerateOfflineSuggestionsWithLlmInput {
  genres: string[];
  currentInstruments: string[];
  userRoles: string[];
  experienceLevel: ExperienceLevel;
  purpose: SuggestionPurpose;
  limit: number;
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

const getOfflineLlmRuntime = (): OfflineLlmRuntime | null => {
  const root = globalThis as unknown as Record<string, unknown>;
  const runtime = root.MusikaOfflineLLM || root.musikaOfflineLLM;

  if (runtime && typeof runtime === "object") {
    return runtime as OfflineLlmRuntime;
  }

  return null;
};

const extractJsonObject = (raw: string) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
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

const getCachedSuggestions = async <T>(key: string): Promise<T[] | null> => {
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

const setCachedSuggestions = async <T>(key: string, suggestions: T[]): Promise<void> => {
  try {
    const payload: CachedSuggestions<T> = {
      timestamp: Date.now(),
      suggestions,
    };

    await AsyncStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Cache write should not block recommendations.
  }
};

const ensureModelReady = async (runtime: OfflineLlmRuntime): Promise<boolean> => {
  if (typeof runtime.isModelReady === "function") {
    const ready = await Promise.resolve(runtime.isModelReady());
    if (ready) return true;
  }

  if (typeof runtime.prepareModel === "function") {
    try {
      const prepared = await withTimeout(
        Promise.resolve(runtime.prepareModel()),
        GENERATION_TIMEOUT_MS,
      );
      return Boolean(prepared);
    } catch {
      return false;
    }
  }

  return typeof runtime.generateJson === "function" || typeof runtime.generateText === "function";
};

const generateWithRuntime = async (
  runtime: OfflineLlmRuntime,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; maxTokens?: number; temperature?: number } = {},
): Promise<string | null> => {
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUT_MS;
  const maxTokens = options.maxTokens ?? 100;
  const temperature = options.temperature ?? 0.2;

  if (typeof runtime.generateJson === "function") {
    const result = await withTimeout(
      runtime.generateJson({
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

  if (typeof runtime.generateText === "function") {
    const result = await withTimeout(
      runtime.generateText(`${systemPrompt}\n\n${userPrompt}`, {
        maxTokens,
        temperature,
      }),
      timeoutMs,
    );

    return typeof result === "string" ? result : null;
  }

  return null;
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
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}~`;
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

  const byName = new Map(candidates.map((item) => [normalize(item.name), item]));
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
  const cap = (count: number) => clamp(count, 1, candidateCount);

  const firstCap = cap(
    Math.min(
      capabilityInfo.maxCandidateCap,
      Math.max(limit + 2, Math.min(capabilityInfo.maxCandidateCap, 6)),
    ),
  );
  const secondCap = cap(
    Math.max(Math.min(firstCap - 2, Math.max(limit, 4)), 4),
  );
  const thirdCap = cap(
    Math.max(Math.min(secondCap - 2, Math.max(limit - 1, 3)), 3),
  );

  const caps = [firstCap, secondCap, thirdCap];
  const tokenBudgets = [
    capabilityInfo.maxTokens,
    Math.max(Math.round(capabilityInfo.maxTokens * 0.75), 75),
    Math.max(Math.round(capabilityInfo.maxTokens * 0.6), 60),
  ];
  const timeouts = [
    capabilityInfo.timeoutMs,
    Math.max(capabilityInfo.timeoutMs - 4000, 15000),
    Math.max(capabilityInfo.timeoutMs - 8000, 12000),
  ];

  for (let i = 1; i < caps.length; i += 1) {
    if (caps[i] >= caps[i - 1]) {
      caps[i] = Math.max(caps[i - 1] - 1, 1);
    }
  }

  return caps.map((candidateCap, index) => ({
    candidateCap,
    maxTokens: tokenBudgets[index],
    temperature: 0.1,
    compactMode: true,
    timeoutMs: timeouts[index],
  }));
};

const buildLlmOnlyPrompt = (
  input: GenerateOfflineSuggestionsWithLlmInput,
  candidates: LocalInstrumentProfile[],
  _options: { compactMode?: boolean } = {},
) => {
  const genres = input.genres
    .slice(0, 4)
    .map((g) => compactLlmPromptText(g, 16))
    .join(",");
  const skills = input.currentInstruments
    .slice(0, 4)
    .map((s) => compactLlmPromptText(s, 16))
    .join(",");
  const names = candidates.map((c) => c.name).join(",");

  const systemPrompt = "Music advisor. JSON array only, no markdown.";

  const userPrompt = [
    `Rank for: ${genres || "general"} | has:${skills || "none"} | ${input.experienceLevel} | ${input.purpose}`,
    `Pick from:[${names}]`,
    `Reply:[{"n":"Name","r":"why"}]`,
    `Max ${input.limit}, best first.`,
  ].join("\n");

  return { systemPrompt, userPrompt };
};

const parseLlmOnlyResult = (raw: string): LlmOnlyRec[] => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));

    const recs: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : Array.isArray(parsed?.r)
          ? parsed.r
          : [];

    return recs
      .map((entry: any) => ({
        name: entry?.n ?? entry?.name,
        score: entry?.s ?? entry?.score,
        whyThisFits: entry?.r ?? entry?.reason ?? entry?.whyThisFits,
        headline: entry?.headline,
        learningCurve: entry?.learningCurve,
        timeToBasics: entry?.timeToBasics,
        proTip: entry?.proTip,
        famousPlayers: entry?.famousPlayers,
        perfectFor: entry?.perfectFor,
      }))
      .filter((rec: LlmOnlyRec) => rec.name);
  } catch {
    return [];
  }
};

const mapLlmOnlySuggestions = (
  llmRecommendations: LlmOnlyRec[],
  candidates: LocalInstrumentProfile[],
  cpuSuggestions: InstrumentSuggestion[],
  limit: number,
): InstrumentSuggestion[] => {
  const byName = new Map(candidates.map((item) => [item.name.toLowerCase(), item]));
  const cpuByName = new Map(cpuSuggestions.map((item) => [item.name.toLowerCase(), item]));

  const mapped: InstrumentSuggestion[] = [];

  for (const rec of llmRecommendations) {
    const name = typeof rec?.name === "string" ? rec.name.trim() : "";
    if (!name) continue;

    const candidate = byName.get(name.toLowerCase());
    if (!candidate) continue;

    const cpu = cpuByName.get(name.toLowerCase());

    const parsedScore = Number(rec?.score);
    const score = Number.isFinite(parsedScore)
      ? clamp(Math.round(parsedScore), 0, 100)
      : cpu?.score ?? 80;

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
  }

  if (mapped.length === 0) {
    return [];
  }

  return mapped.sort((a, b) => b.score - a.score).slice(0, limit);
};

export const generateOfflineSuggestionsWithLocalLLM = async (
  input: GenerateOfflineSuggestionsWithLlmInput,
): Promise<EnhanceOfflineSuggestionsResult> => {
  const safeLimit = clamp(input.limit || 10, 3, 20);
  const cacheKey = buildLlmOnlyCacheKey({ ...input, limit: safeLimit });

  const cached = await getCachedSuggestions<InstrumentSuggestion>(cacheKey);
  if (cached && cached.length > 0) {
    return {
      suggestions: cached,
      aiPowered: true,
      aiProvider: "On-Device LLM (Cached)",
      message: "Generated by on-device LLM from local cache.",
    };
  }

  const buildLocalFallback = (stage: string, message: string): EnhanceOfflineSuggestionsResult => {
    const suggestions = getOfflineInstrumentSuggestions({
      genres: input.genres,
      currentInstruments: input.currentInstruments,
      userRoles: input.userRoles,
      experienceLevel: input.experienceLevel,
      purpose: input.purpose,
      limit: safeLimit,
    });

    return {
      suggestions,
      aiPowered: false,
      aiProvider: "On-Device Local Ranker",
      message,
    };
  };

  const runtime = getOfflineLlmRuntime();
  if (!runtime) {
    return buildLocalFallback(
      "runtime_missing",
      "Using smart local suggestions.",
    );
  }

  const ready = await ensureModelReady(runtime);
  if (!ready) {
    return buildLocalFallback(
      "model_not_ready",
      "Using smart local suggestions.",
    );
  }

  const normalizedCurrent = input.currentInstruments.map(normalize);
  const candidates = getOfflineInstrumentCatalog().filter((item) => {
    const name = item.name.toLowerCase();
    return !normalizedCurrent.some((owned) => owned.includes(name) || name.includes(owned));
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

  // Pre-compute CPU ranker suggestions for enrichment
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

  if (attempts.length === 0) {
    return buildLocalFallback(
      "candidate_attempt_empty",
      "Using smart local suggestions.",
    );
  }

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const attempt = attempts[attemptIndex];
    const attemptCandidates = prioritizedCandidates.slice(0, attempt.candidateCap);

    try {
      const { systemPrompt, userPrompt } = buildLlmOnlyPrompt(
        { ...input, limit: safeLimit },
        attemptCandidates,
        { compactMode: attempt.compactMode },
      );

      const raw = await generateWithRuntime(runtime, systemPrompt, userPrompt, {
        timeoutMs: attempt.timeoutMs,
        maxTokens: attempt.maxTokens,
        temperature: attempt.temperature,
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
      const suggestions = mapLlmOnlySuggestions(
        parsed,
        attemptCandidates,
        cpuSuggestions,
        safeLimit,
      );

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

      return {
        suggestions,
        aiPowered: true,
        aiProvider: "On-Device LLM",
        message: "Generated by on-device LLM. No internet or paid API used.",
      };
    } catch (error: unknown) {
      if (attemptIndex < attempts.length - 1 && isRetriableLlmError(error)) {
        continue;
      }

      return buildLocalFallback(
        isLlmContextFullError(error) ? "llm_context_full" : "llm_exception",
        "Using smart local suggestions.",
      );
    }
  }

  return buildLocalFallback(
    "llm_attempt_exhausted",
    "Using smart local suggestions.",
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
    if (!Array.isArray(parsed?.recommendations)) {
      return [];
    }

    return parsed.recommendations as HomeFeedLlmRec[];
  } catch {
    return [];
  }
};

export const rerankHomeFeedWithLocalLLM = async (
  input: RerankHomeFeedInput,
): Promise<RerankHomeFeedResult> => {
  const safeLimit = clamp(input.limit || 20, 4, 30);
  const baseCandidates = Array.isArray(input.candidates)
    ? input.candidates.slice(0, Math.max(safeLimit, 24))
    : [];

  if (baseCandidates.length === 0) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "No candidates available for LLM reranking.",
    };
  }

  const runtime = getOfflineLlmRuntime();
  if (!runtime) {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "On-device LLM runtime not found for Home FYP.",
    };
  }

  const ready = await ensureModelReady(runtime);
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
    const compactCandidates = baseCandidates.map((item: any) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      genre: item.genre,
      location: item.location,
      rating: item.rating,
      baseScore: Math.round(Number(item.similarity || 0) * 100),
    }));

    const systemPrompt =
      "You are an on-device feed ranking model. Return strict JSON only with candidate ids and short reasons.";

    const userPrompt = [
      "Rerank this For You feed for realtime relevance.",
      `Skills: ${input.profileSignals.skills.join(", ") || "none"}`,
      `Genres: ${input.profileSignals.genres.join(", ") || "none"}`,
      `Limit: ${safeLimit}`,
      "Return JSON shape:",
      '{"recommendations":[{"id":"candidate-id","score":0-100,"reason":"short reason"}]}',
      "Rules:",
      "- Use only candidate ids.",
      "- Keep reason under 100 chars.",
      "- Sort best to worst.",
      `Candidates: ${JSON.stringify(compactCandidates)}`,
    ].join("\n");

    const raw = await generateWithRuntime(
      runtime,
      systemPrompt,
      userPrompt,
      { timeoutMs: HOME_FEED_TIMEOUT_MS },
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
      return {
        recommendations: [],
        aiPowered: false,
        aiProvider: "On-Device CPU Ranker",
        message: "On-device LLM Home FYP output was invalid.",
      };
    }

    const byId = new Map(baseCandidates.map((item: any) => [item.id, item]));
    const reranked: any[] = [];

    for (const rec of parsed) {
      const id = typeof rec?.id === "string" ? rec.id : "";
      if (!id || !byId.has(id)) continue;

      const base = byId.get(id);
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
            : "Recommended for your profile.",
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
  } catch {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "On-device LLM timed out for Home FYP rerank.",
    };
  }
};
