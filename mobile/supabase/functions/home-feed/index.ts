// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const ENV_GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")?.trim() || "";
const GROQ_MODEL_CANDIDATES = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
];
const GROQ_RETRYABLE_STATUS_CODES = new Set([400, 403, 404, 408, 409, 422, 429, 498, 500, 502, 503, 504]);
const isEnabledEnvFlag = (value?: string) =>
    ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase());
const LOCAL_ONLY_MODE = isEnabledEnvFlag(
    Deno.env.get("HOME_FEED_LOCAL_ONLY") || Deno.env.get("AI_LOCAL_ONLY"),
);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface GroqProviderStatus {
    envConfigured: boolean;
    active: boolean;
}

const resolveGroqApiKey = (): string => ENV_GROQ_API_KEY;

const getGroqProviderStatus = (): GroqProviderStatus => {
    const envConfigured = Boolean(ENV_GROQ_API_KEY);

    return {
        envConfigured,
        active: LOCAL_ONLY_MODE ? false : envConfigured,
    };
};

const createDbClient = (req: Request) => {
    if (!SUPABASE_URL) {
        throw new Error("SUPABASE_URL is not configured.");
    }

    if (SUPABASE_SERVICE_ROLE_KEY) {
        return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    }

    if (!SUPABASE_ANON_KEY) {
        throw new Error("SUPABASE_ANON_KEY is not configured.");
    }

    return createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            global: {
                headers: {
                    Authorization: req.headers.get("Authorization") || "",
                },
            },
        },
    );
};

type FeedAction = "featured" | "for-you" | "skill-suggestions" | "ai-status";
type RecommendationMode = "for-you" | "skill-suggestions";

interface FeedRequestBody {
    action?: FeedAction;
    userId?: string;
    limit?: number;
}

interface UserProfile {
    userId: string;
    role: string;
    skills: string[];
    genres: string[];
}

type RecommendationItemType = "Group" | "Duo" | "Studio" | "Venue" | "Gig" | "Artist" | "Production";

interface RecommendationItem {
    id: string;
    type: RecommendationItemType;
    name: string;
    image: string | null;
    images: string[];
    rating: number;
    review_count: number;
    rate: number | null;
    hourly_rate: number | null;
    budget: number | null;
    location: string;
    genre: string;
    created_at: string | null;
    updated_at: string | null;
    owner_id: string | null;
    organizer_id: string | null;
    description?: string | null;
    avatar_url?: string | null;
    logo_url?: string | null;
    group_type?: string | null;
    studio_type?: string | null;
    genres?: string[];
    skills?: string[];
    open_production_applications?: boolean;
    similarity: number;
    aiReason: string;
    aiScore: number;
}

interface CandidateItem extends Omit<RecommendationItem, "similarity" | "aiReason" | "aiScore"> {
    searchableText: string;
    extractedGenres: string[];
}

interface UserActivitySignals {
    positiveTerms: string[];
    negativeTerms: string[];
    searchTerms: string[];
    positiveTargetIds: Set<string>;
    negativeTargetIds: Set<string>;
    positiveOwnerIds: Set<string>;
    eventCount: number;
    summary: string;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const PROFILE_SKILL_DISPLAY_EXCLUSIONS = new Set(["producer"]);

const isVisibleProfileSkill = (value: unknown) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    !PROFILE_SKILL_DISPLAY_EXCLUSIONS.has(value.trim().toLowerCase());

const uniqueStrings = (values: unknown[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const value of values) {
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(trimmed);
    }

    return out;
};

const splitGenres = (raw: string | null | undefined): string[] => {
    if (!raw) return [];
    return uniqueStrings(
        raw
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
    );
};

const HOME_FEED_CANDIDATE_SOURCE_LIMIT = 48;
const HOME_FEED_GROQ_CANDIDATE_LIMIT = 18;
const HOME_FEED_GROQ_RETURN_LIMIT = 12;
const HOME_FEED_ACTIVITY_LOOKBACK_DAYS = 45;
const HOME_FEED_ACTIVITY_EVENT_LIMIT = 80;
const HOME_FEED_ACTIVITY_TERM_LIMIT = 18;

const HOME_FEED_ACTIVITY_EVENT_WEIGHTS: Record<string, number> = {
    follow: 5,
    reaction_added: 3,
    comment_added: 4,
    post_shared: 4,
    feed_post_opened: 2,
    feed_card_opened: 3,
    feed_card_favorited: 5,
    feed_card_unfavorited: -2,
    feed_card_shared: 4,
    feed_card_skipped: -1,
    feed_search_submitted: 2,
    reaction_removed: -1,
};

const ACTIVITY_STOPWORDS = new Set([
    "about",
    "after",
    "artist",
    "before",
    "card",
    "check",
    "created",
    "details",
    "feed",
    "from",
    "group",
    "here",
    "into",
    "lokal",
    "more",
    "musika",
    "music",
    "post",
    "profile",
    "recommended",
    "studio",
    "team",
    "that",
    "this",
    "with",
    "your",
]);

const freshnessScore = (createdAt: string | null) => {
    if (!createdAt) return 0.35;
    const created = new Date(createdAt).getTime();
    if (Number.isNaN(created)) return 0.35;

    const ageDays = Math.max(0, (Date.now() - created) / (1000 * 60 * 60 * 24));
    if (ageDays <= 7) return 1;
    if (ageDays <= 30) return 0.8;
    if (ageDays <= 90) return 0.55;
    return 0.35;
};

const createEmptyActivitySignals = (): UserActivitySignals => ({
    positiveTerms: [],
    negativeTerms: [],
    searchTerms: [],
    positiveTargetIds: new Set<string>(),
    negativeTargetIds: new Set<string>(),
    positiveOwnerIds: new Set<string>(),
    eventCount: 0,
    summary: "",
});

const asActivityMetadata = (metadata: unknown): Record<string, unknown> => {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {};
    }
    return metadata as Record<string, unknown>;
};

const getMetadataString = (metadata: Record<string, unknown>, key: string) => {
    const value = metadata[key];
    return typeof value === "string" ? value.trim() : "";
};

const addIdSignal = (target: Set<string>, value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
        target.add(value.trim());
    }
};

const extractActivityTerms = (value: unknown, limit = HOME_FEED_ACTIVITY_TERM_LIMIT): string[] => {
    if (typeof value !== "string" || value.trim().length === 0) {
        return [];
    }

    const seen = new Set<string>();
    const terms: string[] = [];
    for (const term of normalizeText(value).split(" ")) {
        if (term.length < 3 || term.length > 32) continue;
        if (ACTIVITY_STOPWORDS.has(term)) continue;
        if (seen.has(term)) continue;
        seen.add(term);
        terms.push(term);
        if (terms.length >= limit) break;
    }

    return terms;
};

const addWeightedTerms = (scores: Map<string, number>, value: unknown, weight: number) => {
    for (const term of extractActivityTerms(value)) {
        scores.set(term, (scores.get(term) || 0) + weight);
    }
};

const getTopTerms = (scores: Map<string, number>, limit: number) =>
    [...scores.entries()]
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([term]) => term)
        .slice(0, limit);

const fetchActivitySignals = async (supabaseClient: any, userId: string): Promise<UserActivitySignals> => {
    const emptySignals = createEmptyActivitySignals();
    const since = new Date(Date.now() - HOME_FEED_ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows, error } = await supabaseClient
        .from("social_activity_events")
        .select("event_type, target_user_id, post_id, metadata, created_at")
        .eq("actor_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(HOME_FEED_ACTIVITY_EVENT_LIMIT);

    if (error) {
        console.error("home-feed activity signal lookup error:", error);
        return emptySignals;
    }

    const activityRows = Array.isArray(rows) ? rows : [];
    if (activityRows.length === 0) {
        return emptySignals;
    }

    const postIds = uniqueStrings(activityRows.map((row: any) => row?.post_id));
    const postsById = new Map<string, { content?: string | null; post_type?: string | null; author_id?: string | null }>();

    if (postIds.length > 0) {
        const { data: postRows, error: postError } = await supabaseClient
            .from("feed_posts")
            .select("id, content, post_type, author_id")
            .in("id", postIds);

        if (postError) {
            console.error("home-feed activity post lookup error:", postError);
        } else {
            for (const post of postRows || []) {
                if (typeof post?.id === "string") {
                    postsById.set(post.id, post);
                }
            }
        }
    }

    const positiveTermScores = new Map<string, number>();
    const negativeTermScores = new Map<string, number>();
    const searchTermScores = new Map<string, number>();
    const positiveTargetIds = new Set<string>();
    const negativeTargetIds = new Set<string>();
    const positiveOwnerIds = new Set<string>();

    for (const row of activityRows) {
        const eventType = typeof row?.event_type === "string" ? row.event_type : "";
        const weight = HOME_FEED_ACTIVITY_EVENT_WEIGHTS[eventType] || 0;
        const metadata = asActivityMetadata(row?.metadata);
        const isPositive = weight > 0;
        const isNegative = weight < 0;
        const termScores = isNegative ? negativeTermScores : positiveTermScores;
        const termWeight = Math.max(1, Math.abs(weight));

        if (isPositive) {
            addIdSignal(positiveTargetIds, getMetadataString(metadata, "target_id"));
            addIdSignal(positiveOwnerIds, row?.target_user_id);
            addIdSignal(positiveOwnerIds, getMetadataString(metadata, "owner_id"));
            addIdSignal(positiveOwnerIds, getMetadataString(metadata, "organizer_id"));
            addIdSignal(positiveOwnerIds, getMetadataString(metadata, "uploader_id"));
        } else if (isNegative) {
            addIdSignal(negativeTargetIds, getMetadataString(metadata, "target_id"));
        }

        for (const key of ["name", "genre", "location", "description", "card_type", "target_type", "favorite_target_type"]) {
            addWeightedTerms(termScores, getMetadataString(metadata, key), termWeight);
        }

        if (eventType === "feed_search_submitted") {
            const query = getMetadataString(metadata, "query").slice(0, 120);
            addWeightedTerms(searchTermScores, query, termWeight);
            addWeightedTerms(positiveTermScores, query, termWeight);
        }

        const post = typeof row?.post_id === "string" ? postsById.get(row.post_id) : null;
        if (post) {
            if (isPositive) {
                addIdSignal(positiveOwnerIds, post.author_id);
            }
            addWeightedTerms(termScores, post.content, termWeight);
            addWeightedTerms(termScores, post.post_type, termWeight);
        }
    }

    const positiveTerms = getTopTerms(positiveTermScores, HOME_FEED_ACTIVITY_TERM_LIMIT);
    const negativeTerms = getTopTerms(negativeTermScores, 10);
    const searchTerms = getTopTerms(searchTermScores, 8);
    const summaryParts = [
        positiveTerms.length > 0 ? `Positive: ${positiveTerms.slice(0, 10).join(", ")}` : "",
        searchTerms.length > 0 ? `Searches: ${searchTerms.slice(0, 6).join(", ")}` : "",
        negativeTerms.length > 0 ? `Weak skips: ${negativeTerms.slice(0, 6).join(", ")}` : "",
    ].filter(Boolean);

    return {
        positiveTerms,
        negativeTerms,
        searchTerms,
        positiveTargetIds,
        negativeTargetIds,
        positiveOwnerIds,
        eventCount: activityRows.length,
        summary: summaryParts.join(" | "),
    };
};

const scoreActivityCandidate = (
    candidate: CandidateItem,
    normalizedText: string,
    activity?: UserActivitySignals,
): { score: number; reason: string } => {
    if (!activity || activity.eventCount === 0) {
        return { score: 0, reason: "" };
    }

    const candidateIds = [
        candidate.id,
        candidate.owner_id,
        candidate.organizer_id,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    let score = 0;
    const matchedTerms: string[] = [];

    if (activity.positiveTargetIds.has(candidate.id)) {
        score += 0.7;
    }
    if (activity.negativeTargetIds.has(candidate.id)) {
        score -= 0.2;
    }
    if (candidateIds.some((id) => activity.positiveOwnerIds.has(id))) {
        score += 0.55;
    }

    for (const term of activity.positiveTerms.slice(0, 12)) {
        if (normalizedText.includes(term)) {
            score += 0.12;
            if (matchedTerms.length < 2) matchedTerms.push(term);
        }
    }

    for (const term of activity.searchTerms.slice(0, 6)) {
        if (normalizedText.includes(term)) {
            score += 0.1;
            if (matchedTerms.length < 2) matchedTerms.push(term);
        }
    }

    for (const term of activity.negativeTerms.slice(0, 8)) {
        if (normalizedText.includes(term)) {
            score -= 0.04;
        }
    }

    const uniqueMatchedTerms = uniqueStrings(matchedTerms);
    return {
        score: clamp(score, -0.25, 1),
        reason: uniqueMatchedTerms.length > 0
            ? `Because of your recent ${uniqueMatchedTerms.slice(0, 2).join(" and ")} activity.`
            : score >= 0.55
                ? "Similar to creators or cards you recently opened."
                : "",
    };
};

const buildFallbackReason = (skillMatches: string[], genreMatches: string[], itemType: string): string => {
    if (skillMatches.length > 0 && genreMatches.length > 0) {
        return `Matches your ${skillMatches[0]} skills and ${genreMatches[0]} taste.`;
    }
    if (skillMatches.length > 0) {
        return `Recommended because of your ${skillMatches[0]} background.`;
    }
    if (genreMatches.length > 0) {
        return `Popular among ${genreMatches[0]} listeners and creators.`;
    }
    if (itemType === "Gig") {
        return "Trending opportunity with strong current engagement.";
    }
    return "Strong overall quality and relevance right now.";
};

const scoreCandidate = (
    candidate: CandidateItem,
    profile: UserProfile,
    mode: RecommendationMode,
    activity?: UserActivitySignals,
): { score: number; reason: string } => {
    const normalizedText = normalizeText(candidate.searchableText);
    const normalizedSkills = profile.skills.map((skill) => normalizeText(skill)).filter(Boolean);
    const normalizedGenres = profile.genres.map((genre) => normalizeText(genre)).filter(Boolean);
    const candidateGenres = candidate.extractedGenres.map((genre) => normalizeText(genre)).filter(Boolean);

    const matchedSkills = normalizedSkills.filter((skill) => normalizedText.includes(skill));
    const matchedGenres = normalizedGenres.filter((genre) => candidateGenres.includes(genre) || normalizedText.includes(genre));

    const skillScore = normalizedSkills.length > 0
        ? clamp(matchedSkills.length / Math.min(3, normalizedSkills.length))
        : 0;
    const genreScore = normalizedGenres.length > 0
        ? clamp(matchedGenres.length / Math.min(3, normalizedGenres.length))
        : 0;
    const popularityScore = clamp((candidate.rating || 0) / 5);
    const recentScore = freshnessScore(candidate.created_at);

    const hasUserSignals = normalizedSkills.length > 0 || normalizedGenres.length > 0;

    let score = 0;
    if (!hasUserSignals) {
        score = (popularityScore * 0.7 + recentScore * 0.3) * 100;
    } else if (mode === "skill-suggestions") {
        score = (skillScore * 0.55 + genreScore * 0.2 + popularityScore * 0.2 + recentScore * 0.05) * 100;
    } else {
        score = (skillScore * 0.35 + genreScore * 0.35 + popularityScore * 0.2 + recentScore * 0.1) * 100;
    }

    const activityMatch = scoreActivityCandidate(candidate, normalizedText, activity);
    score += activityMatch.score * (mode === "for-you" ? 18 : 14);

    return {
        score: Math.round(clamp(score / 100) * 100),
        reason: activityMatch.reason || buildFallbackReason(matchedSkills, matchedGenres, candidate.type),
    };
};

const extractJsonObject = (content: string) => {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        return content.slice(firstBrace, lastBrace + 1);
    }

    return content;
};

const rankWithGroq = async (
    groqApiKey: string,
    profile: UserProfile,
    mode: RecommendationMode,
    candidates: Array<{ item: CandidateItem; score: number; reason: string }>,
    limit: number,
    activity?: UserActivitySignals,
) => {
    if (!groqApiKey) {
        return null;
    }

    const groqReturnLimit = Math.min(limit, HOME_FEED_GROQ_RETURN_LIMIT);
    const compactCandidates = candidates.slice(0, HOME_FEED_GROQ_CANDIDATE_LIMIT).map((entry) => ({
        id: entry.item.id,
        type: entry.item.type,
        name: entry.item.name,
        genre: entry.item.genre,
        location: entry.item.location,
        rating: entry.item.rating,
        summary: entry.item.searchableText.slice(0, 120),
        heuristicScore: entry.score,
        heuristicReason: entry.reason,
    }));

    const systemPrompt = "You are MusikaLokal recommendation ranking AI. Return JSON only.";
    const userPrompt = [
        `Goal: Rank candidates for a personalized MusikaLokal recommendation feed.`,
        `Priority: ${mode === "for-you" ? "genre, location, quality, and creator fit" : "skill fit first, then genre, location, and quality"}.`,
        `User skills: ${profile.skills.join(", ") || "none"}`,
        `User genres: ${profile.genres.join(", ") || "none"}`,
        `Recent activity: ${activity?.summary || "none"}`,
        `Positive activity terms: ${activity?.positiveTerms.slice(0, 12).join(", ") || "none"}`,
        `Weak negative/skipped terms: ${activity?.negativeTerms.slice(0, 8).join(", ") || "none"}`,
        "Return JSON shape:",
        '{"recommendations":[{"id":"candidate-id","score":0-100,"reason":"short reason"}]}.',
        `Rules:`,
        `- Use only candidate ids provided.`,
        `- Treat skipped terms as weak hints, not hard blocks.`,
        `- Keep reason under 90 characters.`,
        `- Return up to ${groqReturnLimit} items sorted best to worst.`,
        `Candidates: ${JSON.stringify(compactCandidates)}`,
    ].join("\n");

    try {
        for (const model of GROQ_MODEL_CANDIDATES) {
            for (const useJsonMode of [true, false]) {
                const requestPayload: Record<string, unknown> = {
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                    temperature: 0.4,
                    max_completion_tokens: 900,
                };

                if (useJsonMode) {
                    requestPayload.response_format = { type: "json_object" };
                }

                const response = await fetch(GROQ_API_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${groqApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(requestPayload),
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error("home-feed groq error:", { model, useJsonMode, status: response.status, errorBody });
                    if (!GROQ_RETRYABLE_STATUS_CODES.has(response.status)) {
                        return null;
                    }
                    continue;
                }

                const payload = await response.json();
                const content = payload?.choices?.[0]?.message?.content;
                if (!content || typeof content !== "string") {
                    continue;
                }

                const parsed = JSON.parse(extractJsonObject(content));
                const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
                if (recommendations.length === 0) {
                    continue;
                }

                const byId = new Map(candidates.map((entry) => [entry.item.id, entry]));
                const byName = new Map(candidates.map((entry) => [normalizeText(entry.item.name), entry]));
                const ranked: Array<{ item: CandidateItem; score: number; reason: string }> = [];

                for (const rec of recommendations) {
                    const id = typeof rec?.id === "string" ? rec.id : "";
                    const recName = typeof rec?.name === "string" ? normalizeText(rec.name) : "";
                    const base = byId.get(id) || byName.get(normalizeText(id)) || (recName ? byName.get(recName) : undefined);
                    if (!base) continue;

                    const parsedScore = Number(rec?.score);
                    const aiScore = Number.isFinite(parsedScore) ? Math.round(clamp(parsedScore / 100) * 100) : base.score;
                    const reason = typeof rec?.reason === "string" && rec.reason.trim().length > 0
                        ? rec.reason.trim().slice(0, 120)
                        : base.reason;

                    ranked.push({
                        item: base.item,
                        score: aiScore,
                        reason,
                    });
                }

                if (ranked.length === 0) {
                    continue;
                }

                // Fill missing entries from deterministic ranking.
                const usedIds = new Set(ranked.map((entry) => entry.item.id));
                for (const fallback of candidates) {
                    if (ranked.length >= limit) break;
                    if (usedIds.has(fallback.item.id)) continue;
                    ranked.push(fallback);
                }

                return {
                    ranked: ranked.slice(0, limit),
                    provider: model,
                };
            }
        }

        return null;
    } catch (error) {
        console.error("home-feed groq parse error:", error);
        return null;
    }
};

const buildRecommendationResponse = (
    ranked: Array<{ item: CandidateItem; score: number; reason: string }>,
    aiPowered: boolean,
    aiProvider: string,
): RecommendationItem[] => {
    return ranked.map((entry) => ({
        ...entry.item,
        similarity: clamp(entry.score / 100),
        aiReason: entry.reason,
        aiScore: entry.score,
    }));
};

const fetchProfile = async (supabaseClient: any, userId: string): Promise<UserProfile | null> => {
    const { data: profileRow, error: profileError } = await supabaseClient
        .from("profiles")
        .select("id, role")
        .eq("id", userId)
        .single();

    if (profileError) {
        console.error("home-feed profile lookup error:", profileError);
    }

    if (!profileRow) {
        return {
            userId,
            role: "musician",
            skills: [],
            genres: [],
        };
    }

    const [skillsResult, genresResult] = await Promise.all([
        supabaseClient.from("profile_skills").select("skill").eq("profile_id", userId),
        supabaseClient.from("profile_genres").select("genre").eq("profile_id", userId),
    ]);

    if (skillsResult.error) {
        console.error("home-feed profile skills lookup error:", skillsResult.error);
    }

    if (genresResult.error) {
        console.error("home-feed profile genres lookup error:", genresResult.error);
    }

    const skills = uniqueStrings((skillsResult.data || []).map((row: any) => row.skill).filter(isVisibleProfileSkill));
    const genres = uniqueStrings((genresResult.data || []).map((row: any) => row.genre));

    return {
        userId,
        role: profileRow.role || "musician",
        skills,
        genres,
    };
};

const fetchCandidates = async (supabaseClient: any): Promise<CandidateItem[]> => {
    const [
        groupsResult,
        studiosResult,
        gigsResult,
        artistsResult,
        productionTeamsResult,
    ] = await Promise.all([
        supabaseClient
            .from("groups_with_stats")
            .select("id, name, description, images, location, genre, group_type, rate, rating, review_count, owner_id, created_at")
            .limit(HOME_FEED_CANDIDATE_SOURCE_LIMIT),
        supabaseClient
            .from("studios_with_stats")
            .select("id, name, description, amenities, images, address, location, type, types, hourly_rate, rehearsal_rate, recording_rate, rating, review_count, owner_id, created_at, permit_status")
            .eq("permit_status", "approved")
            .limit(HOME_FEED_CANDIDATE_SOURCE_LIMIT),
        supabaseClient
            .from("gigs_with_stats")
            .select("id, name, description, images, location, budget, rate, requirements, rating, review_count, organizer_id, created_at, status, permit_status")
            .neq("status", "cancelled")
            .eq("permit_status", "approved")
            .limit(HOME_FEED_CANDIDATE_SOURCE_LIMIT),
        supabaseClient
            .from("profiles")
            .select("id, full_name, avatar_url, address, location, role, bio, created_at")
            .eq("role", "musician")
            .eq("is_verified", true)
            .eq("verification_status", "APPROVED")
            .limit(HOME_FEED_CANDIDATE_SOURCE_LIMIT),
        supabaseClient
            .from("production_teams")
            .select("id, owner_id, name, description, logo_url, created_at, updated_at, open_production_applications")
            .limit(HOME_FEED_CANDIDATE_SOURCE_LIMIT),
    ]);

    const queryErrors = [
        groupsResult.error,
        studiosResult.error,
        gigsResult.error,
        artistsResult.error,
        productionTeamsResult.error,
    ].filter(Boolean);
    if (queryErrors.length > 0) {
        console.error("home-feed candidate query errors:", queryErrors);
    }

    const artists = Array.isArray(artistsResult.data) ? artistsResult.data : [];
    const artistIds = artists
        .map((row: any) => row?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0);
    let artistGenresById = new Map<string, string[]>();
    let artistSkillsById = new Map<string, string[]>();

    if (artistIds.length > 0) {
        const [genresResult, skillsResult] = await Promise.all([
            supabaseClient
                .from("profile_genres")
                .select("profile_id, genre")
                .in("profile_id", artistIds),
            supabaseClient
                .from("profile_skills")
                .select("profile_id, skill")
                .in("profile_id", artistIds),
        ]);

        if (genresResult.error) {
            console.error("home-feed artist genres query error:", genresResult.error);
        }
        if (skillsResult.error) {
            console.error("home-feed artist skills query error:", skillsResult.error);
        }

        for (const row of genresResult.data || []) {
            if (typeof row?.profile_id !== "string" || typeof row?.genre !== "string") continue;
            const next = artistGenresById.get(row.profile_id) || [];
            next.push(row.genre);
            artistGenresById.set(row.profile_id, next);
        }

        for (const row of skillsResult.data || []) {
            if (typeof row?.profile_id !== "string" || !isVisibleProfileSkill(row?.skill)) continue;
            const next = artistSkillsById.get(row.profile_id) || [];
            next.push(row.skill.trim());
            artistSkillsById.set(row.profile_id, next);
        }
    }

    const groupItems: CandidateItem[] = (groupsResult.data || []).map((item: any) => {
        const genres = splitGenres(item.genre);
        const groupType = String(item.group_type || "").toLowerCase();
        const type: RecommendationItemType = groupType.includes("duo") ? "Duo" : "Group";
        return {
            id: item.id,
            type,
            name: item.name || `Unnamed ${type}`,
            image: Array.isArray(item.images) ? item.images[0] || null : null,
            images: Array.isArray(item.images) ? item.images : [],
            rating: Number(item.rating || 0),
            review_count: Number(item.review_count || 0),
            rate: Number.isFinite(Number(item.rate)) ? Number(item.rate) : null,
            hourly_rate: null,
            budget: null,
            location: item.location || "",
            genre: item.genre || "",
            description: item.description || null,
            group_type: item.group_type || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            owner_id: item.owner_id || null,
            organizer_id: null,
            searchableText: `${item.name || ""} ${item.description || ""} ${item.genre || ""} ${item.location || ""} ${item.group_type || ""}`,
            extractedGenres: genres,
        };
    });

    const studioItems: CandidateItem[] = (studiosResult.data || []).map((item: any) => {
        const studioType = String(item.type || item.studio_type || "").trim();
        const isVenue = studioType.toLowerCase().includes("venue") ||
            (Array.isArray(item.amenities) && item.amenities.some((amenity: unknown) => String(amenity || "").toLowerCase().includes("stage")));
        const type: RecommendationItemType = isVenue ? "Venue" : "Studio";

        return {
            id: item.id,
            type,
            name: item.name || `Unnamed ${type}`,
            image: Array.isArray(item.images) ? item.images[0] || null : null,
            images: Array.isArray(item.images) ? item.images : [],
            rating: Number(item.rating || 0),
            review_count: Number(item.review_count || 0),
            rate: Number.isFinite(Number(item.rate)) ? Number(item.rate) : null,
            hourly_rate: Number.isFinite(Number(item.hourly_rate)) ? Number(item.hourly_rate) : null,
            budget: null,
            location: item.address || item.location || "",
            genre: isVenue ? "Gig" : studioType || "Studio",
            description: item.description || null,
            studio_type: studioType || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            owner_id: item.owner_id || null,
            organizer_id: null,
            searchableText: `${item.name || ""} ${item.description || ""} ${studioType} ${item.address || ""} ${item.location || ""}`,
            extractedGenres: splitGenres(studioType || ""),
        };
    });

    const gigItems: CandidateItem[] = (gigsResult.data || []).map((item: any) => {
        const requirementGenres = Array.isArray(item.requirements?.genres)
            ? item.requirements.genres
            : [];
        const rawGenre = item.requirements?.genre || "";
        const genres = uniqueStrings([...requirementGenres, ...splitGenres(rawGenre)]);

        return {
            id: item.id,
            type: "Gig",
            name: item.name || "Untitled Gig",
            image: Array.isArray(item.images) ? item.images[0] || null : null,
            images: Array.isArray(item.images) ? item.images : [],
            rating: Number(item.rating || 0),
            review_count: Number(item.review_count || 0),
            rate: Number.isFinite(Number(item.rate)) ? Number(item.rate) : null,
            hourly_rate: null,
            budget: Number.isFinite(Number(item.budget)) ? Number(item.budget) : null,
            location: item.location || "",
            genre: genres.join(", "),
            description: item.description || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            owner_id: null,
            organizer_id: item.organizer_id || null,
            searchableText: `${item.name || ""} ${item.description || ""} ${item.location || ""} ${JSON.stringify(item.requirements || {})}`,
            extractedGenres: genres,
        };
    });

    const artistItems: CandidateItem[] = artists.map((item: any) => {
        const genres = uniqueStrings(artistGenresById.get(item.id) || []);
        const skills = uniqueStrings(artistSkillsById.get(item.id) || []);

        return {
            id: item.id,
            type: "Artist",
            name: item.full_name || "Artist",
            image: item.avatar_url || null,
            images: item.avatar_url ? [item.avatar_url] : [],
            rating: 0,
            review_count: 0,
            rate: null,
            hourly_rate: null,
            budget: null,
            location: item.address || item.location || "",
            genre: genres.join(", "),
            genres,
            skills,
            description: item.bio || null,
            avatar_url: item.avatar_url || null,
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            owner_id: item.id,
            organizer_id: null,
            searchableText: `${item.full_name || ""} ${item.bio || ""} ${item.address || ""} ${item.location || ""} ${genres.join(" ")} ${skills.join(" ")}`,
            extractedGenres: genres,
        };
    });

    const productionItems: CandidateItem[] = (productionTeamsResult.data || []).map((item: any) => ({
        id: item.id,
        type: "Production",
        name: item.name || "Production Team",
        image: item.logo_url || null,
        images: item.logo_url ? [item.logo_url] : [],
        rating: 0,
        review_count: 0,
        rate: null,
        hourly_rate: null,
        budget: null,
        location: item.description || "Production Team",
        genre: "",
        description: item.description || null,
        logo_url: item.logo_url || null,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        organizer_id: null,
        open_production_applications: item.open_production_applications === true,
        searchableText: `${item.name || ""} ${item.description || ""} production team ${item.open_production_applications ? "open applications" : ""}`,
        extractedGenres: [],
    }));

    return [...groupItems, ...studioItems, ...gigItems, ...artistItems, ...productionItems];
};

const getRecommendations = async (
    supabaseClient: any,
    userId: string,
    mode: RecommendationMode,
    groqApiKey: string,
    limit: number,
) => {
    const [profile, activity] = await Promise.all([
        fetchProfile(supabaseClient, userId),
        fetchActivitySignals(supabaseClient, userId),
    ]);

    if (!profile) {
        return {
            recommendations: [],
            aiPowered: false,
            aiProvider: "none",
            message: "Unable to load user profile for recommendations.",
        };
    }

    const candidates = await fetchCandidates(supabaseClient);
    if (candidates.length === 0) {
        return {
            recommendations: [],
            aiPowered: false,
            aiProvider: "none",
            message: "No listings available yet.",
        };
    }

    const deterministicRank = candidates
        .map((item) => {
            const scored = scoreCandidate(item, profile, mode, activity);
            return {
                item,
                score: scored.score,
                reason: scored.reason,
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(20, limit));

    if (LOCAL_ONLY_MODE) {
        const fallbackRank = deterministicRank.slice(0, limit);
        return {
            recommendations: buildRecommendationResponse(fallbackRank, false, "Local Ranker"),
            aiPowered: false,
            aiProvider: "Local Ranker",
            message: "Local-only recommendation mode is active (no external AI provider calls).",
        };
    }

    const aiRank = await rankWithGroq(groqApiKey, profile, mode, deterministicRank, limit, activity);

    if (aiRank && aiRank.ranked.length > 0) {
        return {
            recommendations: buildRecommendationResponse(aiRank.ranked, true, aiRank.provider),
            aiPowered: true,
            aiProvider: aiRank.provider,
            message: mode === "for-you"
                ? "AI-ranked For You feed is active."
                : "AI-ranked skill suggestions are active.",
        };
    }

    const fallbackRank = deterministicRank.slice(0, limit);
    return {
        recommendations: buildRecommendationResponse(fallbackRank, false, "Local Ranker"),
        aiPowered: false,
        aiProvider: "Local Ranker",
        message: groqApiKey
            ? "Using local ranking while AI provider is unavailable."
            : "Using local ranking because Groq API key is not configured.",
    };
};

const getFeaturedPayload = async (supabaseClient: any) => {
    const [
        { data: featuredGigs, error: gigsError },
        { data: featuredStudios, error: studiosError },
        { data: newArrivals, error: groupsError },
    ] = await Promise.all([
        supabaseClient
            .from("gigs_with_stats")
            .select("*")
            .neq("status", "cancelled")
            .eq("permit_status", "approved")
            .order("created_at", { ascending: false })
            .limit(5),
        supabaseClient
            .from("studios_with_stats")
            .select("*")
            .eq("permit_status", "approved")
            .order("rating", { ascending: false })
            .limit(5),
        supabaseClient
            .from("groups_with_stats")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(5),
    ]);

    if (gigsError || studiosError || groupsError) {
        console.error("home-feed featured query errors:", {
            gigsError,
            studiosError,
            groupsError,
        });
    }

    const safeFeaturedGigs = Array.isArray(featuredGigs) ? featuredGigs : [];
    const safeFeaturedStudios = Array.isArray(featuredStudios) ? featuredStudios : [];
    const safeNewArrivals = Array.isArray(newArrivals) ? newArrivals : [];

    const studioIds = safeFeaturedStudios.map((s: any) => s.id);
    let studioDateOverridesMap: Record<string, boolean> = {};

    if (studioIds.length > 0) {
        const { data: dateOverrides, error: dateOverridesError } = await supabaseClient
            .from("studio_date_overrides")
            .select("studio_id")
            .in("studio_id", studioIds)
            .gte("override_date", new Date().toISOString().split("T")[0]);

        if (dateOverridesError) {
            console.error("home-feed studio date overrides error:", dateOverridesError);
        } else {
            (dateOverrides || []).forEach((row: any) => {
                studioDateOverridesMap[row.studio_id] = true;
            });
        }
    }

    const featured = [
        ...safeFeaturedGigs.map((item: any) => ({
            ...item,
            type: "Gig",
            rating: item.rating || 0,
            review_count: item.review_count || 0,
        })),
        ...safeFeaturedStudios.map((item: any) => ({
            ...item,
            type: "Studio",
            rating: item.rating || 0,
            review_count: item.review_count || 0,
            has_special_dates: studioDateOverridesMap[item.id] || false,
        })),
    ]
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 10);

    const mappedNewArrivals = safeNewArrivals.map((item: any) => ({
        ...item,
        rating: item.rating || 0,
        review_count: item.review_count || 0,
    }));

    return {
        featured,
        newArrivals: mappedNewArrivals,
    };
};

const getMobileProfileSummary = async (supabaseClient: any, userId?: string | null) => {
    if (!userId) {
        return {
            userName: "Guest",
            hasGroups: false,
        };
    }

    const [profileResult, groupCountResult] = await Promise.all([
        supabaseClient
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .maybeSingle(),
        supabaseClient
            .from("groups")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", userId),
    ]);

    if (profileResult.error) {
        console.error("home-feed mobile profile summary error:", profileResult.error);
    }

    if (groupCountResult.error) {
        console.error("home-feed mobile group count error:", groupCountResult.error);
    }

    return {
        userName: profileResult.data?.full_name
            ? String(profileResult.data.full_name).split(" ")[0]
            : "Guest",
        hasGroups: (groupCountResult.count || 0) > 0,
    };
};

const shuffleItems = <T,>(items: T[]): T[] => {
    return [...items].sort(() => Math.random() - 0.5);
};

const getMobileHomePayload = async (
    supabaseClient: any,
    body: FeedRequestBody & { isGuest?: boolean; userRole?: string | null },
    groqApiKey: string,
) => {
    const fetchedAt = Date.now();
    const userId = body.userId || null;
    const limit = Math.max(10, Math.min(Number(body.limit || 20), 30));

    const [featuredPayload, profileSummary] = await Promise.all([
        getFeaturedPayload(supabaseClient),
        getMobileProfileSummary(supabaseClient, userId),
    ]);

    const candidates = await fetchCandidates(supabaseClient);
    const randomRecommendations = shuffleItems(candidates).slice(0, limit);
    let aiRecommendations: RecommendationItem[] = [];
    let aiFeedProvider = "Normal Feed";
    let aiFeedMessage = "";

    if (userId) {
        const recommendations = await getRecommendations(
            supabaseClient,
            userId,
            "for-you",
            groqApiKey,
            limit,
        );

        aiRecommendations = recommendations.recommendations || [];
        aiFeedProvider = recommendations.aiProvider || aiFeedProvider;
        aiFeedMessage = recommendations.message || "";
    }

    const featured = aiRecommendations.length > 0
        ? aiRecommendations.slice(0, 10)
        : randomRecommendations.slice(0, 10);
    const discover = aiRecommendations.length > 10
        ? aiRecommendations.slice(10, 20)
        : randomRecommendations.slice(10, 20);

    return {
        fetchedAt,
        profile: profileSummary,
        featured,
        discover,
        newArrivals: featuredPayload.newArrivals || [],
        randomRecommendations,
        aiRecommendations,
        aiFeedProvider,
        aiFeedMessage,
        providerStatus: getGroqProviderStatus(),
    };
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createDbClient(req);

        let body: FeedRequestBody = {};
        if (req.method !== "GET") {
            try {
                body = await req.json();
            } catch {
                body = {};
            }
        }

        const action = body.action || "featured";
        const limit = Math.max(4, Math.min(Number(body.limit || 20), 30));
        const groqApiKey = resolveGroqApiKey();
        const providerStatus = getGroqProviderStatus();

        if (action === "ai-status") {
            return new Response(
                JSON.stringify({
                    aiProvidersConfigured: providerStatus.active,
                    providerStatus,
                    message: LOCAL_ONLY_MODE
                        ? "Local-only mode is active. External AI providers are disabled for home-feed recommendations."
                        : providerStatus.active
                            ? "Groq provider is configured for home-feed recommendations."
                            : "Groq provider is not configured. Set GROQ_API_KEY in function secrets.",
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                },
            );
        }

        if (action === "mobile_home") {
            const payload = await getMobileHomePayload(supabaseClient, body, groqApiKey);

            return new Response(JSON.stringify(payload), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        if (action === "for-you" || action === "skill-suggestions") {
            if (!body.userId) {
                return new Response(
                    JSON.stringify({
                        recommendations: [],
                        aiPowered: false,
                        aiProvider: "none",
                        message: "userId is required for personalized recommendations.",
                    }),
                    {
                        headers: { ...corsHeaders, "Content-Type": "application/json" },
                        status: 400,
                    },
                );
            }

            const result = await getRecommendations(
                supabaseClient,
                body.userId,
                action === "for-you" ? "for-you" : "skill-suggestions",
                groqApiKey,
                limit,
            );

            return new Response(JSON.stringify({
                ...result,
                providerStatus,
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        }

        const featuredPayload = await getFeaturedPayload(supabaseClient);

        return new Response(JSON.stringify(featuredPayload), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
