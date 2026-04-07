import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";
import {
  ExperienceLevel,
  InstrumentSuggestion,
  SuggestionPurpose,
} from "../types/instruments";
import {
  getOfflineInstrumentCatalog,
  LocalInstrumentProfile,
} from "../utils/offlineInstrumentRecommender";

const CACHE_PREFIX = "offline_llm_enhanced_suggestions:";
const LLM_ONLY_CACHE_PREFIX = "offline_llm_only_suggestions:";
const HOME_FEED_CACHE_PREFIX = "offline_llm_home_feed:";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const GENERATION_TIMEOUT_MS = 3500;
const HOME_FEED_TIMEOUT_MS = 1800;

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
  const nativeModule = (NativeModules as Record<string, unknown>)
    .MusikaOfflineLLM as OfflineLlmNativeModule | undefined;

  return nativeModule || null;
};

const extractJsonObject = (raw: string) => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
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
  timeoutMs = GENERATION_TIMEOUT_MS,
): Promise<string | null> => {
  if (typeof module.generateJson === "function") {
    const result = await withTimeout(
      module.generateJson({
        prompt: userPrompt,
        systemPrompt,
        maxTokens: 650,
        temperature: 0.3,
      }),
      timeoutMs,
    );

    if (typeof result === "string") return result;
    return JSON.stringify(result);
  }

  if (typeof module.generateText === "function") {
    const result = await withTimeout(
      module.generateText(`${systemPrompt}\n\n${userPrompt}`, {
        maxTokens: 650,
        temperature: 0.3,
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

  const module = getNativeOfflineLlmModule();
  if (!module) {
    return {
      suggestions: [],
      aiPowered: false,
      aiProvider: "On-Device LLM",
      message:
        "On-device LLM runtime is not installed on this build. Suggestions require the LLM runtime.",
    };
  }

  const ready = await ensureModelReady(module);
  if (!ready) {
    return {
      suggestions: [],
      aiPowered: false,
      aiProvider: "On-Device LLM",
      message:
        "On-device LLM model is not ready yet. Suggestions require a ready local model.",
    };
  }

  const normalizedCurrent = input.currentInstruments.map(normalize);
  const candidates = getOfflineInstrumentCatalog().filter((item) => {
    const name = item.name.toLowerCase();
    return !normalizedCurrent.some(
      (owned) => owned.includes(name) || name.includes(owned),
    );
  });

  if (candidates.length === 0) {
    return {
      suggestions: [],
      aiPowered: false,
      aiProvider: "On-Device LLM",
      message: "No candidate instruments available for LLM generation.",
    };
  }

  try {
    const { systemPrompt, userPrompt } = buildLlmOnlyPrompt(
      { ...input, limit: safeLimit },
      candidates,
    );
    const raw = await generateWithNativeLlm(module, systemPrompt, userPrompt);

    if (!raw) {
      return {
        suggestions: [],
        aiPowered: false,
        aiProvider: "On-Device LLM",
        message: "On-device LLM produced no output. No local-ranking fallback is enabled.",
      };
    }

    const parsed = parseLlmOnlyResult(raw);
    const suggestions = mapLlmOnlySuggestions(parsed, candidates, safeLimit);

    if (suggestions.length === 0) {
      return {
        suggestions: [],
        aiPowered: false,
        aiProvider: "On-Device LLM",
        message:
          "On-device LLM output was invalid for this request. No local-ranking fallback is enabled.",
      };
    }

    await setCachedSuggestions<InstrumentSuggestion>(cacheKey, suggestions);

    return {
      suggestions,
      aiPowered: true,
      aiProvider: "On-Device LLM",
      message: "Generated by on-device LLM. No internet or paid API used.",
    };
  } catch {
    return {
      suggestions: [],
      aiPowered: false,
      aiProvider: "On-Device LLM",
      message:
        "On-device LLM timed out. No local-ranking fallback is enabled.",
    };
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
    const compactCandidates = baseCandidates.map((item: any) => ({
      id: item.id,
      type: item.type,
      name: item.name,
      genre: item.genre,
      location: item.location,
      rating: item.rating,
      baseScore: Math.round(Number(item.similarity || 0) * 100),
      baseReason: item.aiReason || "",
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

    const raw = await generateWithNativeLlm(
      module,
      systemPrompt,
      userPrompt,
      HOME_FEED_TIMEOUT_MS,
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
  } catch {
    return {
      recommendations: [],
      aiPowered: false,
      aiProvider: "On-Device CPU Ranker",
      message: "On-device LLM timed out for Home FYP rerank.",
    };
  }
};
