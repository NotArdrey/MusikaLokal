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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-groq-api-key",
};

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const ENV_GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")?.trim() || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface GroqProviderStatus {
    envConfigured: boolean;
    requestConfigured: boolean;
    active: boolean;
}

const resolveGroqApiKey = (req: Request): string => {
    if (ENV_GROQ_API_KEY) {
        return ENV_GROQ_API_KEY;
    }

    return req.headers.get("x-groq-api-key")?.trim() || "";
};

const getGroqProviderStatus = (req: Request): GroqProviderStatus => {
    const requestConfigured = Boolean(req.headers.get("x-groq-api-key")?.trim());
    const envConfigured = Boolean(ENV_GROQ_API_KEY);

    return {
        envConfigured,
        requestConfigured,
        active: envConfigured || requestConfigured,
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

interface RecommendationItem {
    id: string;
    type: "Group" | "Studio" | "Gig";
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
    similarity: number;
    aiReason: string;
    aiScore: number;
}

interface CandidateItem extends Omit<RecommendationItem, "similarity" | "aiReason" | "aiScore"> {
    searchableText: string;
    extractedGenres: string[];
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

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

    return {
        score: Math.round(clamp(score / 100) * 100),
        reason: buildFallbackReason(matchedSkills, matchedGenres, candidate.type),
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
) => {
    if (!groqApiKey) {
        return null;
    }

    const compactCandidates = candidates.slice(0, 30).map((entry) => ({
        id: entry.item.id,
        type: entry.item.type,
        name: entry.item.name,
        genre: entry.item.genre,
        location: entry.item.location,
        rating: entry.item.rating,
        heuristicScore: entry.score,
        heuristicReason: entry.reason,
    }));

    const systemPrompt = "You are MusikaLokal recommendation ranking AI. Return JSON only.";
    const userPrompt = [
        `Goal: Rank candidates for a ${mode === "for-you" ? "TikTok-style For You" : "skill-focused"} feed.`,
        `User skills: ${profile.skills.join(", ") || "none"}`,
        `User genres: ${profile.genres.join(", ") || "none"}`,
        "Return JSON shape:",
        '{"recommendations":[{"id":"candidate-id","score":0-100,"reason":"short reason"}]}.',
        `Rules:`,
        `- Use only candidate ids provided.`,
        `- Keep reason under 90 characters.`,
        `- Return up to ${limit} items sorted best to worst.`,
        `Candidates: ${JSON.stringify(compactCandidates)}`,
    ].join("\n");

    const modelCandidates = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

    try {
        for (const model of modelCandidates) {
            for (const useJsonMode of [true, false]) {
                const requestPayload: Record<string, unknown> = {
                    model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt },
                    ],
                    temperature: 0.4,
                    max_tokens: 1200,
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
                const ranked: Array<{ item: CandidateItem; score: number; reason: string }> = [];

                for (const rec of recommendations) {
                    const id = typeof rec?.id === "string" ? rec.id : "";
                    if (!id || !byId.has(id)) continue;

                    const base = byId.get(id)!;
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

                return ranked.slice(0, limit);
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

    const skills = uniqueStrings((skillsResult.data || []).map((row: any) => row.skill));
    const genres = uniqueStrings((genresResult.data || []).map((row: any) => row.genre));

    return {
        userId,
        role: profileRow.role || "musician",
        skills,
        genres,
    };
};

const fetchCandidates = async (supabaseClient: any): Promise<CandidateItem[]> => {
    const [{ data: groups }, { data: studios }, { data: gigs }] = await Promise.all([
        supabaseClient
            .from("groups_with_stats")
            .select("id, name, images, location, genre, rating, review_count, owner_id, created_at")
            .limit(60),
        supabaseClient
            .from("studios_with_stats")
            .select("id, name, images, address, type, hourly_rate, rehearsal_rate, recording_rate, rating, review_count, owner_id, created_at")
            .limit(60),
        supabaseClient
            .from("gigs_with_stats")
            .select("id, name, images, location, budget, rate, requirements, rating, review_count, organizer_id, created_at, status")
            .eq("status", "open")
            .limit(60),
    ]);

    const groupItems: CandidateItem[] = (groups || []).map((item: any) => {
        const genres = splitGenres(item.genre);
        return {
            id: item.id,
            type: "Group",
            name: item.name || "Unnamed Group",
            image: Array.isArray(item.images) ? item.images[0] || null : null,
            images: Array.isArray(item.images) ? item.images : [],
            rating: Number(item.rating || 0),
            review_count: Number(item.review_count || 0),
            rate: Number.isFinite(Number(item.rate)) ? Number(item.rate) : null,
            hourly_rate: null,
            budget: null,
            location: item.location || "",
            genre: item.genre || "",
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            owner_id: item.owner_id || null,
            organizer_id: null,
            searchableText: `${item.name || ""} ${item.genre || ""} ${item.location || ""}`,
            extractedGenres: genres,
        };
    });

    const studioItems: CandidateItem[] = (studios || []).map((item: any) => ({
        id: item.id,
        type: "Studio",
        name: item.name || "Unnamed Studio",
        image: Array.isArray(item.images) ? item.images[0] || null : null,
        images: Array.isArray(item.images) ? item.images : [],
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        rate: null,
        hourly_rate: Number.isFinite(Number(item.hourly_rate)) ? Number(item.hourly_rate) : null,
        budget: null,
        location: item.address || "",
        genre: item.type || "Studio",
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        organizer_id: null,
        searchableText: `${item.name || ""} ${item.type || ""} ${item.address || ""}`,
        extractedGenres: splitGenres(item.type || ""),
    }));

    const gigItems: CandidateItem[] = (gigs || []).map((item: any) => {
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
            created_at: item.created_at || null,
            updated_at: item.updated_at || null,
            owner_id: null,
            organizer_id: item.organizer_id || null,
            searchableText: `${item.name || ""} ${item.location || ""} ${JSON.stringify(item.requirements || {})}`,
            extractedGenres: genres,
        };
    });

    return [...groupItems, ...studioItems, ...gigItems];
};

const getRecommendations = async (
    supabaseClient: any,
    userId: string,
    mode: RecommendationMode,
    groqApiKey: string,
    limit: number,
) => {
    const profile = await fetchProfile(supabaseClient, userId);
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
            const scored = scoreCandidate(item, profile, mode);
            return {
                item,
                score: scored.score,
                reason: scored.reason,
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(20, limit));

    const aiRank = await rankWithGroq(groqApiKey, profile, mode, deterministicRank, limit);

    if (aiRank && aiRank.length > 0) {
        return {
            recommendations: buildRecommendationResponse(aiRank, true, "Groq Llama 3.3"),
            aiPowered: true,
            aiProvider: "Groq Llama 3.3",
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
            .order("created_at", { ascending: false })
            .limit(5),
        supabaseClient
            .from("studios_with_stats")
            .select("*")
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
        const groqApiKey = resolveGroqApiKey(req);
        const providerStatus = getGroqProviderStatus(req);

        if (action === "ai-status") {
            return new Response(
                JSON.stringify({
                    aiProvidersConfigured: providerStatus.active,
                    providerStatus,
                    message: providerStatus.active
                        ? "Groq provider is configured for home-feed recommendations."
                        : "Groq provider is not configured. Set GROQ_API_KEY in function secrets or pass x-groq-api-key.",
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                },
            );
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
