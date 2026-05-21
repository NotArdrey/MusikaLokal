// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const MAX_PLAYLIST_TRACK_DURATION_SECONDS = 300;
const DEFAULT_STATION_ROTATION_INTERVAL_MINUTES = 15;
const MIN_STATION_ROTATION_INTERVAL_MINUTES = 5;
const MAX_STATION_ROTATION_INTERVAL_MINUTES = 120;
const DEFAULT_LIVE_TRACK_DURATION_SECONDS = 180;
const DEFAULT_STATION_CONCURRENT_SLOT_LIMIT = 4;
const MAX_STATION_CONCURRENT_SLOT_LIMIT = 4;
const ADMIN_STATION_SOURCE_PLAYLIST_LIMIT = 500;
const PLAYLIST_AUDIO_SIGNED_URL_SECONDS = 24 * 60 * 60;
const KNOWN_PLAYLIST_AUDIO_BUCKETS = new Set(["documents", "playlist-assets"]);
const KNOWN_PLAYLIST_STORAGE_BUCKETS = new Set(["documents", "playlist-assets", "post-media"]);
const PLAYLIST_ASSET_BUCKET = "playlist-assets";
const PLAYLIST_RADIO_ID_PREFIX = "playlist-radio:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")?.trim() || "";
const GROQ_MODEL_CANDIDATES = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
];
const GROQ_RETRYABLE_STATUS_CODES = new Set([403, 404, 408, 409, 429, 498, 500, 502, 503, 504]);
const AI_LOCAL_ONLY = ["1", "true", "yes", "on"].includes(
  (Deno.env.get("PLAYLIST_RADIO_LOCAL_ONLY") || Deno.env.get("AI_LOCAL_ONLY") || "").trim().toLowerCase(),
);

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractAccessToken(authHeader: string): string | null {
  const trimmed = (authHeader || "").trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    return token || null;
  }
  return trimmed;
}

const PUBLIC_ACTIONS = new Set([
  "browse_playlists",
  "browse_stations",
  "get_playlist_details",
  "get_station_details",
  "list_user_playlists",
  "list_user_stations",
  "record_play_event",
]);

function normalizeOptionalDurationSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("duration_seconds must be a number greater than zero");
  }

  if (parsed > MAX_PLAYLIST_TRACK_DURATION_SECONDS) {
    throw new Error(`Tracks must be ${MAX_PLAYLIST_TRACK_DURATION_SECONDS} seconds or less`);
  }

  return Math.round(parsed);
}

function normalizeOptionalAudioUrl(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (_) {
    throw new Error("audio_url must be a valid http or https URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("audio_url must be a valid http or https URL");
  }

  return trimmed;
}

function normalizeOptionalImageUrl(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
}

function readTimestampMs(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return timestampMs;
}

function getStationRotationIntervalMinutes(station: any) {
  return normalizePositiveInteger(
    station?.rotation_interval_minutes,
    DEFAULT_STATION_ROTATION_INTERVAL_MINUTES,
    MIN_STATION_ROTATION_INTERVAL_MINUTES,
    MAX_STATION_ROTATION_INTERVAL_MINUTES,
  );
}

function normalizeStationRotationIntervalMinutes(value: unknown) {
  return normalizePositiveInteger(
    value,
    DEFAULT_STATION_ROTATION_INTERVAL_MINUTES,
    MIN_STATION_ROTATION_INTERVAL_MINUTES,
    MAX_STATION_ROTATION_INTERVAL_MINUTES,
  );
}

function getStationConcurrentSlotLimit(station: any) {
  return normalizePositiveInteger(
    station?.concurrent_slot_limit,
    DEFAULT_STATION_CONCURRENT_SLOT_LIMIT,
    1,
    MAX_STATION_CONCURRENT_SLOT_LIMIT,
  );
}

function getStationQueueAnchorTimestampMs(station: any, slots: any[]) {
  const slotTimestamps = slots
    .flatMap((slot: any) => [
      slot?.updated_at,
      slot?.created_at,
      slot?.playlist?.updated_at,
      slot?.playlist?.created_at,
      ...(Array.isArray(slot?.playlist?.items)
        ? slot.playlist.items.flatMap((item: any) => [item?.updated_at, item?.created_at])
        : []),
    ])
    .map(readTimestampMs)
    .filter((value): value is number => value !== null);

  const stationTimestamps = [station?.updated_at, station?.created_at]
    .map(readTimestampMs)
    .filter((value): value is number => value !== null);

  const candidateTimestamps = [...slotTimestamps, ...stationTimestamps];
  if (candidateTimestamps.length === 0) {
    return null;
  }

  return Math.max(...candidateTimestamps);
}

function normalizeLiveTrackDurationSeconds(value: unknown, fallback = DEFAULT_LIVE_TRACK_DURATION_SECONDS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.max(1, Math.round(parsed));
}

function getSlotFallbackDurationSeconds(slot: any, rotationIntervalMinutes: number) {
  const playlist = slot?.playlist || {};
  const playlistDuration = Number(playlist?.total_duration_seconds);
  if (Number.isFinite(playlistDuration) && playlistDuration > 0) {
    return Math.max(1, Math.round(playlistDuration));
  }

  const trackCount = Number(playlist?.track_count);
  if (Number.isFinite(trackCount) && trackCount > 0) {
    return Math.max(1, Math.round(trackCount) * DEFAULT_LIVE_TRACK_DURATION_SECONDS);
  }

  return Math.max(1, rotationIntervalMinutes * 60);
}

function hasPlaylistItemAudioSource(item: any) {
  return Boolean(
    (typeof item?.audio_url === "string" && item.audio_url.trim().length > 0) ||
    (typeof item?.storage_path === "string" && item.storage_path.trim().length > 0) ||
    (typeof item?.teaser?.storage_path === "string" && item.teaser.storage_path.trim().length > 0) ||
    (typeof item?.teaser?.file_path === "string" && item.teaser.file_path.trim().length > 0)
  );
}

function getStationLiveTimeline(
  station: any,
  slots: any[],
  rotationIntervalMinutes: number,
  nowMs = Date.now(),
) {
  const anchorTimestampMs = getStationQueueAnchorTimestampMs(station, slots) ?? nowMs;
  const entries = (slots || []).flatMap((slot: any, slotIndex: number) => {
    const playlist = slot?.playlist || {};
    const items = Array.isArray(playlist?.items)
      ? playlist.items.filter(hasPlaylistItemAudioSource)
      : [];

    if (items.length === 0) {
      return [{
        durationSeconds: getSlotFallbackDurationSeconds(slot, rotationIntervalMinutes),
        item: null,
        itemIndex: 0,
        queueIndex: 0,
        slot,
        slotIndex,
      }];
    }

    return items.map((item: any, itemIndex: number) => ({
      durationSeconds: normalizeLiveTrackDurationSeconds(
        item?.duration_seconds ?? item?.teaser?.duration_seconds,
      ),
      item,
      itemIndex,
      queueIndex: 0,
      slot,
      slotIndex,
    }));
  }).map((entry: any, queueIndex: number) => ({ ...entry, queueIndex }));

  if (entries.length === 0) {
    return {
      anchorTimestampMs,
      currentDurationSeconds: 0,
      currentItem: null,
      currentItemIndex: 0,
      currentQueueIndex: 0,
      currentSlot: null,
      currentSlotIndex: 0,
      loopDurationSeconds: 0,
      positionSeconds: 0,
    };
  }

  const loopDurationSeconds = entries.reduce(
    (total: number, entry: any) => total + entry.durationSeconds,
    0,
  );
  if (loopDurationSeconds <= 0) {
    const first = entries[0];
    return {
      anchorTimestampMs,
      currentDurationSeconds: 0,
      currentItem: first.item,
      currentItemIndex: first.itemIndex,
      currentQueueIndex: first.queueIndex,
      currentSlot: first.slot,
      currentSlotIndex: first.slotIndex,
      loopDurationSeconds: 0,
      positionSeconds: 0,
    };
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - anchorTimestampMs) / 1000));
  let remainingOffsetSeconds = elapsedSeconds % loopDurationSeconds;

  for (const entry of entries) {
    if (remainingOffsetSeconds < entry.durationSeconds) {
      return {
        anchorTimestampMs,
        currentDurationSeconds: entry.durationSeconds,
        currentItem: entry.item,
        currentItemIndex: entry.itemIndex,
        currentQueueIndex: entry.queueIndex,
        currentSlot: entry.slot,
        currentSlotIndex: entry.slotIndex,
        loopDurationSeconds,
        positionSeconds: remainingOffsetSeconds,
      };
    }

    remainingOffsetSeconds -= entry.durationSeconds;
  }

  const first = entries[0];
  return {
    anchorTimestampMs,
    currentDurationSeconds: first.durationSeconds,
    currentItem: first.item,
    currentItemIndex: first.itemIndex,
    currentQueueIndex: first.queueIndex,
    currentSlot: first.slot,
    currentSlotIndex: first.slotIndex,
    loopDurationSeconds,
    positionSeconds: 0,
  };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRecommendationText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitRecommendationTerms(raw: unknown): string[] {
  if (typeof raw !== "string") {
    return [];
  }

  return getUniqueStringValues(
    raw
      .split(/[,\n|/]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

function stationFreshnessScore(createdAt: unknown) {
  const timestampMs = readTimestampMs(createdAt);
  if (!timestampMs) {
    return 0.35;
  }

  const ageDays = Math.max(0, (Date.now() - timestampMs) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 90) return 0.55;
  return 0.35;
}

function getStationRecommendationOwnerName(station: any) {
  return (
    station?.managed_group?.name ||
    station?.managed_profile?.full_name ||
    station?.creator?.full_name ||
    "local artists"
  );
}

function getStationRecommendationText(station: any, slots: any[]) {
  const values = [
    station?.name,
    station?.description,
    station?.genre,
    station?.creator?.full_name,
    station?.managed_profile?.full_name,
    station?.managed_group?.name,
    station?.managed_group?.genre,
  ];

  for (const slot of slots || []) {
    values.push(
      slot?.label,
      slot?.playlist?.title,
      slot?.playlist?.description,
      slot?.playlist?.genre,
    );

    for (const item of slot?.playlist?.items || []) {
      values.push(item?.title, item?.artist_name);
    }
  }

  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" ");
}

function getStationRecommendationGenres(station: any, slots: any[]) {
  const values = [
    station?.genre,
    station?.managed_group?.genre,
    ...(slots || []).map((slot: any) => slot?.playlist?.genre),
  ];

  return getUniqueStringValues(values.flatMap(splitRecommendationTerms));
}

function getStationRecommendationTrackCount(station: any, slots: any[]) {
  const slotTrackCount = (slots || []).reduce((total: number, slot: any) => {
    const itemCount = Array.isArray(slot?.playlist?.items) ? slot.playlist.items.length : 0;
    const playlistCount = Number(slot?.playlist?.track_count || 0);
    return total + Math.max(itemCount, Number.isFinite(playlistCount) ? playlistCount : 0);
  }, 0);

  return Math.max(slotTrackCount, Number(station?.slot_count || 0));
}

function normalizeStationRecommendationMode(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ["for_you", "for-you", "ai", "recommended"].includes(normalized) ? "for_you" : "";
}

async function fetchStationRecommendationProfile(supabaseAdmin: any, userId: string | null) {
  if (!userId) {
    return {
      userId: null,
      skills: [],
      genres: [],
      followedProfileIds: new Set<string>(),
      followedGroupIds: new Set<string>(),
      favoriteProfileIds: new Set<string>(),
      favoriteGroupIds: new Set<string>(),
      playedStationIds: new Set<string>(),
    };
  }

  const [
    skillsResult,
    genresResult,
    followsResult,
    favoritesResult,
    playEventsResult,
  ] = await Promise.all([
    supabaseAdmin.from("profile_skills").select("skill").eq("profile_id", userId),
    supabaseAdmin.from("profile_genres").select("genre").eq("profile_id", userId),
    supabaseAdmin.from("follows").select("followed_id, followed_type").eq("follower_id", userId).limit(200),
    supabaseAdmin.from("favorites").select("profile_id, group_id").eq("user_id", userId).limit(200),
    supabaseAdmin
      .from("playlist_play_events")
      .select("station_id")
      .eq("user_id", userId)
      .not("station_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  for (const [scope, result] of [
    ["skills", skillsResult],
    ["genres", genresResult],
    ["follows", followsResult],
    ["favorites", favoritesResult],
    ["play_events", playEventsResult],
  ] as const) {
    if (result.error) {
      console.warn(`Station recommendation ${scope} lookup error:`, result.error.message);
    }
  }

  return {
    userId,
    skills: getUniqueStringValues((skillsResult.data || []).map((row: any) => row?.skill)),
    genres: getUniqueStringValues((genresResult.data || []).map((row: any) => row?.genre)),
    followedProfileIds: new Set(
      (followsResult.data || [])
        .filter((row: any) => row?.followed_type === "profile")
        .map((row: any) => row?.followed_id)
        .filter(Boolean),
    ),
    followedGroupIds: new Set(
      (followsResult.data || [])
        .filter((row: any) => row?.followed_type === "group")
        .map((row: any) => row?.followed_id)
        .filter(Boolean),
    ),
    favoriteProfileIds: new Set(
      (favoritesResult.data || [])
        .map((row: any) => row?.profile_id)
        .filter(Boolean),
    ),
    favoriteGroupIds: new Set(
      (favoritesResult.data || [])
        .map((row: any) => row?.group_id)
        .filter(Boolean),
    ),
    playedStationIds: new Set(
      (playEventsResult.data || [])
        .map((row: any) => row?.station_id)
        .filter(Boolean),
    ),
  };
}

function buildStationRecommendationReason(details: {
  favoriteMatch: boolean;
  followedMatch: boolean;
  genreMatches: string[];
  skillMatches: string[];
  playedMatch: boolean;
  station: any;
}) {
  if (details.favoriteMatch) {
    return `Based on artists and groups you saved.`;
  }
  if (details.followedMatch) {
    return `Because you follow ${getStationRecommendationOwnerName(details.station)}.`;
  }
  if (details.genreMatches.length > 0) {
    return `Matches your ${details.genreMatches[0]} taste.`;
  }
  if (details.skillMatches.length > 0) {
    return `Fits your ${details.skillMatches[0]} profile.`;
  }
  if (details.playedMatch) {
    return "More radio like stations you played.";
  }
  if (details.station?.is_featured) {
    return "Featured station with an active playlist rotation.";
  }
  if (details.station?.genre) {
    return `Fresh ${details.station.genre} radio from local artists.`;
  }
  return "Recommended from active MusikaLokal stations.";
}

function scoreStationForRecommendation(station: any, slots: any[], profile: any) {
  const searchableText = normalizeRecommendationText(getStationRecommendationText(station, slots));
  const stationGenres = getStationRecommendationGenres(station, slots);
  const normalizedStationGenres = stationGenres.map(normalizeRecommendationText).filter(Boolean);
  const normalizedSkills = (profile.skills || []).map(normalizeRecommendationText).filter(Boolean);
  const normalizedGenres = (profile.genres || []).map(normalizeRecommendationText).filter(Boolean);

  const skillMatches = normalizedSkills.filter((skill: string) => searchableText.includes(skill));
  const genreMatches = normalizedGenres.filter((genre: string) => (
    normalizedStationGenres.includes(genre) ||
    searchableText.includes(genre)
  ));

  const skillScore = normalizedSkills.length > 0
    ? clamp(skillMatches.length / Math.min(3, normalizedSkills.length))
    : 0;
  const genreScore = normalizedGenres.length > 0
    ? clamp(genreMatches.length / Math.min(3, normalizedGenres.length))
    : 0;

  const ownerProfileId = station?.managed_profile_id || station?.creator_id || "";
  const groupId = station?.managed_group_id || "";
  const followedMatch = Boolean(
    (ownerProfileId && profile.followedProfileIds?.has(ownerProfileId)) ||
    (groupId && profile.followedGroupIds?.has(groupId)),
  );
  const favoriteMatch = Boolean(
    (ownerProfileId && profile.favoriteProfileIds?.has(ownerProfileId)) ||
    (groupId && profile.favoriteGroupIds?.has(groupId)),
  );
  const playedMatch = Boolean(station?.id && profile.playedStationIds?.has(station.id));
  const trackCount = getStationRecommendationTrackCount(station, slots);
  const popularityScore = clamp(
    (Number(station?.listener_count || 0) / 50) +
    (trackCount / 80) +
    ((slots || []).length / 20),
  );
  const featuredScore = station?.is_featured ? 1 : 0;
  const freshness = stationFreshnessScore(station?.created_at);
  const hasUserSignals = Boolean(
    normalizedSkills.length ||
    normalizedGenres.length ||
    profile.followedProfileIds?.size ||
    profile.followedGroupIds?.size ||
    profile.favoriteProfileIds?.size ||
    profile.favoriteGroupIds?.size ||
    profile.playedStationIds?.size
  );

  const score = hasUserSignals
    ? (
      genreScore * 0.34 +
      skillScore * 0.16 +
      (followedMatch ? 1 : 0) * 0.16 +
      (favoriteMatch ? 1 : 0) * 0.12 +
      (playedMatch ? 1 : 0) * 0.10 +
      featuredScore * 0.05 +
      popularityScore * 0.04 +
      freshness * 0.03
    )
    : (
      featuredScore * 0.25 +
      popularityScore * 0.35 +
      freshness * 0.25 +
      (station?.genre ? 0.15 : 0)
    );

  return {
    score: Math.round(clamp(score) * 100),
    reason: buildStationRecommendationReason({
      favoriteMatch,
      followedMatch,
      genreMatches,
      skillMatches,
      playedMatch,
      station,
    }),
    searchableText,
    stationGenres,
    trackCount,
  };
}

function extractStationJsonObject(content: string) {
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
}

async function rankStationsWithGroq(profile: any, candidates: any[], limit: number) {
  if (!GROQ_API_KEY || AI_LOCAL_ONLY || candidates.length === 0) {
    return null;
  }

  const compactCandidates = candidates.slice(0, 30).map((entry) => ({
    id: entry.station.id,
    name: entry.station.name,
    owner: getStationRecommendationOwnerName(entry.station),
    genre: entry.station.genre || entry.station.managed_group?.genre || "",
    playlistCount: entry.slots.length,
    trackCount: entry.trackCount,
    featured: entry.station.is_featured === true,
    heuristicScore: entry.score,
    heuristicReason: entry.reason,
  }));

  const systemPrompt = "You are MusikaLokal radio recommendation AI. Return JSON only.";
  const userPrompt = [
    "Goal: Rank playlist-radio stations for the feed's For You radio card.",
    "Important: every station keeps one shared playback timeline; only rank which station to recommend.",
    `User skills: ${(profile.skills || []).join(", ") || "none"}`,
    `User genres: ${(profile.genres || []).join(", ") || "none"}`,
    "Return JSON shape:",
    `{"recommendations":[{"id":"station-id","score":0-100,"reason":"short reason"}]}.`,
    "Rules:",
    "- Use only station ids provided.",
    "- Keep reason under 90 characters.",
    `- Return up to ${limit} stations sorted best to worst.`,
    `Stations: ${JSON.stringify(compactCandidates)}`,
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
          temperature: 0.35,
          max_completion_tokens: 900,
        };

        if (useJsonMode) {
          requestPayload.response_format = { type: "json_object" };
        }

        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          console.error("manage-playlists station radio groq error:", {
            model,
            useJsonMode,
            status: response.status,
            errorBody,
          });
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

        const parsed = JSON.parse(extractStationJsonObject(content));
        const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
        if (recommendations.length === 0) {
          continue;
        }

        const byId = new Map(candidates.map((entry) => [entry.station.id, entry]));
        const ranked: any[] = [];

        for (const rec of recommendations) {
          const id = typeof rec?.id === "string" ? rec.id : "";
          if (!id || !byId.has(id)) continue;

          const base = byId.get(id)!;
          const parsedScore = Number(rec?.score);
          const aiScore = Number.isFinite(parsedScore)
            ? Math.round(clamp(parsedScore / 100) * 100)
            : base.score;
          const reason = typeof rec?.reason === "string" && rec.reason.trim().length > 0
            ? rec.reason.trim().slice(0, 120)
            : base.reason;

          ranked.push({
            ...base,
            score: aiScore,
            reason,
          });
        }

        if (ranked.length === 0) {
          continue;
        }

        const usedIds = new Set(ranked.map((entry) => entry.station.id));
        for (const fallback of candidates) {
          if (ranked.length >= limit) break;
          if (usedIds.has(fallback.station.id)) continue;
          ranked.push(fallback);
        }

        return {
          provider: model,
          ranked: ranked.slice(0, limit),
        };
      }
    }
  } catch (error) {
    console.error("manage-playlists station radio groq parse error:", error);
  }

  return null;
}

async function rankStationsForRecommendation(
  supabaseAdmin: any,
  stationRows: any[],
  slotsByStationId: Map<string, any[]>,
  userId: string | null,
  limit: number,
) {
  const profile = await fetchStationRecommendationProfile(supabaseAdmin, userId);
  const deterministicRank = stationRows
    .map((station) => {
      const slots = slotsByStationId.get(station.id) || [];
      const scored = scoreStationForRecommendation(station, slots, profile);
      return {
        station,
        slots,
        ...scored,
      };
    })
    .sort((left, right) => right.score - left.score);

  const aiRank = await rankStationsWithGroq(profile, deterministicRank, Math.max(1, limit));
  const ranked = aiRank?.ranked?.length ? aiRank.ranked : deterministicRank.slice(0, Math.max(1, limit));
  const provider = aiRank?.provider || (AI_LOCAL_ONLY ? "Local Ranker" : GROQ_API_KEY ? "Local Ranker" : "Local Ranker");
  const aiPowered = Boolean(aiRank?.provider);
  const message = aiPowered
    ? "AI-ranked playlist radio is active."
    : GROQ_API_KEY && !AI_LOCAL_ONLY
      ? "Using local radio ranking while AI provider is unavailable."
      : "Using local radio ranking.";

  return {
    aiPowered,
    message,
    provider,
    stations: ranked.map((entry: any) => ({
      ...entry.station,
      ai_powered: aiPowered,
      ai_provider: provider,
      ai_reason: entry.reason,
      ai_score: entry.score,
      recommendation_mode: "for_you",
      recommendation_reason: entry.reason,
      recommendation_score: entry.score,
    })),
  };
}

async function getRequesterRole(supabaseAdmin: any, authUser: any, uid: string) {
  const metadataRole = typeof authUser?.user_metadata?.role === "string"
    ? authUser.user_metadata.role.trim().toLowerCase()
    : typeof authUser?.app_metadata?.role === "string"
      ? authUser.app_metadata.role.trim().toLowerCase()
      : null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .maybeSingle();

  const profileRole = typeof profile?.role === "string"
    ? profile.role.trim().toLowerCase()
    : null;

  return profileRole || metadataRole;
}

function normalizeProfileId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUuid(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function readPlaylistRadioFallbackId(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed.startsWith(PLAYLIST_RADIO_ID_PREFIX)) {
    return null;
  }

  return normalizeUuid(trimmed.slice(PLAYLIST_RADIO_ID_PREFIX.length));
}

function resolveManagedProfileId(
  requesterRole: string | null,
  uid: string,
  rawManagedProfileId: unknown,
) {
  const normalized = normalizeProfileId(rawManagedProfileId);

  if (requesterRole === "admin") {
    return normalized || uid;
  }

  return uid;
}

async function getGroupOwnerId(supabaseAdmin: any, groupId: string) {
  const { data: group, error } = await supabaseAdmin
    .from("groups")
    .select("id, owner_id")
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return typeof group?.owner_id === "string" ? group.owner_id : null;
}

async function assertCanManageGroup(supabaseAdmin: any, groupId: string, uid: string, requesterRole: string | null) {
  const ownerId = await getGroupOwnerId(supabaseAdmin, groupId);

  if (!ownerId) {
    throw new Error("Group not found");
  }

  if (ownerId !== uid && requesterRole !== "admin") {
    throw new Error("Only the group owner can manage group playlists.");
  }

  return ownerId;
}

async function canManagePlaylist(supabaseAdmin: any, playlist: any, uid: string, requesterRole: string | null) {
  if (requesterRole === "admin") {
    return true;
  }

  const ownerGroupId = typeof playlist?.owner_group_id === "string"
    ? playlist.owner_group_id
    : "";
  if (ownerGroupId) {
    const ownerId = await getGroupOwnerId(supabaseAdmin, ownerGroupId);
    return ownerId === uid;
  }

  return playlist?.creator_id === uid;
}

async function linkPlaylistToGroup(supabaseAdmin: any, groupId: string, playlistId: string) {
  const { data: lastLink, error: lastLinkError } = await supabaseAdmin
    .from("group_playlists")
    .select("position")
    .eq("group_id", groupId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastLinkError) {
    throw lastLinkError;
  }

  const nextPosition = Number.isFinite(Number(lastLink?.position))
    ? Number(lastLink.position) + 1
    : 0;

  const { error } = await supabaseAdmin
    .from("group_playlists")
    .upsert(
      {
        group_id: groupId,
        playlist_id: playlistId,
        position: nextPosition,
      },
      { onConflict: "group_id,playlist_id" },
    );

  if (error) {
    throw error;
  }
}

async function transferManagedProfileStationsToAdmin(
  supabaseAdmin: any,
  adminUserId: string,
  managedProfileId: string,
) {
  const { error } = await supabaseAdmin
    .from("stations")
    .update({ creator_id: adminUserId, managed_profile_id: managedProfileId })
    .eq("managed_profile_id", managedProfileId)
    .neq("creator_id", adminUserId);

  if (error) {
    throw error;
  }
}

async function getPrimaryManagedStation(supabaseAdmin: any, managedProfileId: string) {
  const { data, error } = await supabaseAdmin
    .from("stations")
    .select("id, creator_id, managed_profile_id")
    .eq("managed_profile_id", managedProfileId)
    .is("managed_group_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getPrimaryManagedSourceStation(
  supabaseAdmin: any,
  sourceKind: "profile" | "group",
  sourceId: string,
  managedProfileId?: string | null,
) {
  let query = supabaseAdmin
    .from("stations")
    .select("id, creator_id, managed_profile_id, managed_group_id, is_active, is_featured")
    .order("created_at", { ascending: false })
    .limit(1);

  if (sourceKind === "group") {
    query = query.eq("managed_group_id", sourceId);
  } else {
    query = query.eq("managed_profile_id", managedProfileId || sourceId).is("managed_group_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  return data;
}

async function transferStationToAdminIfNeeded(
  supabaseAdmin: any,
  station: { id?: string | null; creator_id?: string | null; managed_profile_id?: string | null },
  adminUserId: string,
) {
  const stationId = typeof station?.id === "string" ? station.id : null;
  const managedProfileId = station?.managed_profile_id || station?.creator_id || null;

  if (!stationId || !managedProfileId || station?.creator_id === adminUserId) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("stations")
    .update({ creator_id: adminUserId, managed_profile_id: managedProfileId })
    .eq("id", stationId);

  if (error) {
    throw error;
  }
}

function getProfileDisplayName(profile: any) {
  const fullName = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
  return fullName || "Unknown artist";
}

function getGroupDisplayName(group: any) {
  const name = typeof group?.name === "string" ? group.name.trim() : "";
  return name || "Untitled group";
}

function getGroupTypeLabel(groupType: unknown) {
  const normalized = typeof groupType === "string" ? groupType.toLowerCase() : "";
  if (normalized === "duo") return "Duo";
  if (normalized === "solo") return "Solo";
  return "Group";
}

function getFirstImage(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const first = value.find((item) => typeof item === "string" && item.trim().length > 0);
  return typeof first === "string" ? first.trim() : null;
}

function filterPublicVisiblePlaylists(query: any) {
  return query
    .eq("visibility", "public")
    .or("is_hidden.is.false,is_hidden.is.null");
}

function filterStationEligiblePlaylists(query: any) {
  return query.or("is_hidden.is.false,is_hidden.is.null");
}

async function getStationEligiblePlaylistIds(supabaseAdmin: any, playlistIds: string[]) {
  const uniquePlaylistIds = Array.from(new Set(
    playlistIds
      .map((playlistId) => (typeof playlistId === "string" ? playlistId.trim() : ""))
      .filter((playlistId) => playlistId.length > 0),
  ));

  if (uniquePlaylistIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await filterStationEligiblePlaylists(
    supabaseAdmin
      .from("playlists")
      .select("id")
      .in("id", uniquePlaylistIds),
  );

  if (error) {
    throw error;
  }

  return new Set(
    (data || [])
      .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
      .filter((playlistId: string) => playlistId.length > 0),
  );
}

function getSourceStationSummary(stationsBySourceKey: Map<string, any>, sourceKey: string) {
  const station = stationsBySourceKey.get(sourceKey);
  if (!station) {
    return null;
  }

  return {
    id: station.id,
    name: station.name,
    description: station.description,
    genre: station.genre,
    cover_image_url: station.cover_image_url,
    is_active: station.is_active,
    is_featured: station.is_featured,
    rotation_interval_minutes: station.rotation_interval_minutes,
    slot_count: station.slot_count || 0,
    slot_playlist_ids: station.slot_playlist_ids || [],
  };
}

async function getStationPlaylistIdsByStationId(supabaseAdmin: any, stationIds: string[]) {
  const result = new Map<string, string[]>();

  if (stationIds.length === 0) {
    return result;
  }

  const { data, error } = await supabaseAdmin
    .from("station_playlist_slots")
    .select("station_id, playlist_id, position")
    .in("station_id", stationIds)
    .order("position");

  if (error) {
    throw error;
  }

  for (const row of data || []) {
    const stationId = typeof row?.station_id === "string" ? row.station_id : "";
    const playlistId = typeof row?.playlist_id === "string" ? row.playlist_id : "";
    if (!stationId || !playlistId) {
      continue;
    }

    const next = result.get(stationId) || [];
    next.push(playlistId);
    result.set(stationId, next);
  }

  return result;
}

async function listAdminStationSources(supabaseAdmin: any) {
  const { data: playlists, error: playlistError } = await filterStationEligiblePlaylists(
    supabaseAdmin
      .from("playlists")
      .select("id, creator_id, title, description, genre, cover_image_url, track_count, visibility, created_at, creator:profiles!creator_id(id, full_name, avatar_url, role)"),
  )
    .order("created_at", { ascending: false })
    .limit(ADMIN_STATION_SOURCE_PLAYLIST_LIMIT);

  if (playlistError) {
    throw playlistError;
  }

  const playlistRows = playlists || [];
  const playlistIds = playlistRows
    .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
    .filter((playlistId: string) => playlistId.length > 0);

  const [{ data: groupLinks, error: groupLinksError }, { data: stations, error: stationsError }] = await Promise.all([
    playlistIds.length > 0
      ? supabaseAdmin
          .from("group_playlists")
          .select("group_id, playlist_id, position")
          .in("playlist_id", playlistIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("stations")
      .select("id, creator_id, name, description, genre, cover_image_url, is_active, is_featured, rotation_interval_minutes, managed_profile_id, managed_group_id"),
  ]);

  if (groupLinksError) {
    throw groupLinksError;
  }

  if (stationsError) {
    throw stationsError;
  }

  const stationIds = (stations || [])
    .map((station: any) => (typeof station?.id === "string" ? station.id : ""))
    .filter((stationId: string) => stationId.length > 0);
  const stationPlaylistIds = await getStationPlaylistIdsByStationId(supabaseAdmin, stationIds);

  const stationsBySourceKey = new Map<string, any>();
  for (const station of stations || []) {
    if (typeof station?.id !== "string") {
      continue;
    }

    station.slot_playlist_ids = stationPlaylistIds.get(station.id) || [];
    station.slot_count = station.slot_playlist_ids.length;

    if (typeof station?.managed_group_id === "string" && station.managed_group_id) {
      stationsBySourceKey.set(`group:${station.managed_group_id}`, station);
      continue;
    }

    const profileStationId = typeof station?.managed_profile_id === "string" && station.managed_profile_id
      ? station.managed_profile_id
      : typeof station?.creator_id === "string" && station.creator_id
        ? station.creator_id
        : "";

    if (profileStationId) {
      stationsBySourceKey.set(`profile:${profileStationId}`, station);
    }
  }

  const groupIds = Array.from(new Set(
    (groupLinks || [])
      .map((row: any) => (typeof row?.group_id === "string" ? row.group_id : ""))
      .filter((groupId: string) => groupId.length > 0),
  ));
  const groupLinkedPlaylistIds = new Set(
    (groupLinks || [])
      .map((row: any) => (typeof row?.playlist_id === "string" ? row.playlist_id : ""))
      .filter((playlistId: string) => playlistId.length > 0),
  );

  let groupsById = new Map<string, any>();
  if (groupIds.length > 0) {
    const { data: groups, error: groupsError } = await supabaseAdmin
      .from("groups_with_stats")
      .select("id, owner_id, name, group_type, genre, images")
      .in("id", groupIds);

    if (groupsError) {
      throw groupsError;
    }

    groupsById = new Map(
      (groups || [])
        .filter((group: any) => typeof group?.id === "string")
        .map((group: any) => [group.id, group]),
    );
  }

  const playlistsByProfileId = new Map<string, any[]>();
  const playlistsByGroupId = new Map<string, any[]>();
  const playlistById = new Map<string, any>(
    playlistRows
      .filter((playlist: any) => typeof playlist?.id === "string")
      .map((playlist: any) => [playlist.id, playlist]),
  );

  for (const playlist of playlistRows) {
    const profileId = typeof playlist?.creator_id === "string" ? playlist.creator_id : "";
    if (!profileId || groupLinkedPlaylistIds.has(playlist.id)) {
      continue;
    }

    const next = playlistsByProfileId.get(profileId) || [];
    next.push(playlist);
    playlistsByProfileId.set(profileId, next);
  }

  for (const link of groupLinks || []) {
    const groupId = typeof link?.group_id === "string" ? link.group_id : "";
    const playlistId = typeof link?.playlist_id === "string" ? link.playlist_id : "";
    const playlist = playlistById.get(playlistId);
    if (!groupId || !playlist || !groupsById.has(groupId)) {
      continue;
    }

    const next = playlistsByGroupId.get(groupId) || [];
    next.push(playlist);
    playlistsByGroupId.set(groupId, next);
  }

  const profileSources = Array.from(playlistsByProfileId.entries())
    .map(([profileId, sourcePlaylists]) => {
      const firstPlaylist = sourcePlaylists[0] || {};
      const profile = firstPlaylist.creator || {};
      const profileRole = typeof profile?.role === "string" ? profile.role.toLowerCase() : "";
      if (profileRole && profileRole !== "musician") {
        return null;
      }

      const stationKey = `profile:${profileId}`;
      return {
        key: stationKey,
        kind: "profile",
        id: profileId,
        owner_profile_id: profileId,
        name: getProfileDisplayName(profile),
        subtitle: "Artist",
        genre: firstPlaylist.genre || null,
        cover_image_url: profile?.avatar_url || firstPlaylist.cover_image_url || null,
        playlist_count: sourcePlaylists.length,
        track_count: sourcePlaylists.reduce((sum, playlist) => sum + Number(playlist?.track_count || 0), 0),
        playlists: sourcePlaylists,
        station: getSourceStationSummary(stationsBySourceKey, stationKey),
      };
    })
    .filter(Boolean);

  const groupSources = Array.from(playlistsByGroupId.entries())
    .map(([groupId, sourcePlaylists]) => {
      const group = groupsById.get(groupId);
      if (!group?.owner_id) {
        return null;
      }

      const stationKey = `group:${groupId}`;
      const groupTypeLabel = getGroupTypeLabel(group.group_type);
      return {
        key: stationKey,
        kind: "group",
        id: groupId,
        owner_profile_id: group.owner_id,
        name: getGroupDisplayName(group),
        subtitle: groupTypeLabel,
        genre: group.genre || sourcePlaylists[0]?.genre || null,
        cover_image_url: getFirstImage(group.images) || sourcePlaylists[0]?.cover_image_url || null,
        playlist_count: sourcePlaylists.length,
        track_count: sourcePlaylists.reduce((sum, playlist) => sum + Number(playlist?.track_count || 0), 0),
        playlists: sourcePlaylists,
        station: getSourceStationSummary(stationsBySourceKey, stationKey),
      };
    })
    .filter(Boolean);

  return [...groupSources, ...profileSources].sort((left: any, right: any) => {
    const leftHasStation = left.station ? 1 : 0;
    const rightHasStation = right.station ? 1 : 0;
    if (leftHasStation !== rightHasStation) {
      return leftHasStation - rightHasStation;
    }

    return String(left.name || "").localeCompare(String(right.name || ""));
  });
}

async function getEligibleStationSource(
  supabaseAdmin: any,
  sourceKind: "profile" | "group",
  sourceId: string,
) {
  if (sourceKind === "profile") {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, avatar_url, role")
      .eq("id", sourceId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      throw new Error("Artist not found");
    }

    const { data: playlists, error: playlistError } = await filterStationEligiblePlaylists(
      supabaseAdmin
        .from("playlists")
        .select("id, title, description, genre, cover_image_url, track_count, visibility, creator_id")
        .eq("creator_id", sourceId),
    )
      .order("created_at", { ascending: false });

    if (playlistError) {
      throw playlistError;
    }

    const playlistIds = (playlists || [])
      .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
      .filter((playlistId: string) => playlistId.length > 0);
    let groupLinkedPlaylistIds = new Set<string>();
    if (playlistIds.length > 0) {
      const { data: groupLinks, error: groupLinksError } = await supabaseAdmin
        .from("group_playlists")
        .select("playlist_id")
        .in("playlist_id", playlistIds);

      if (groupLinksError) {
        throw groupLinksError;
      }

      groupLinkedPlaylistIds = new Set(
        (groupLinks || [])
          .map((row: any) => (typeof row?.playlist_id === "string" ? row.playlist_id : ""))
          .filter((playlistId: string) => playlistId.length > 0),
      );
    }

    const soloPlaylists = (playlists || []).filter((playlist: any) => !groupLinkedPlaylistIds.has(playlist.id));

    return {
      source: profile,
      managedProfileId: profile.id,
      managedGroupId: null,
      defaultName: `${getProfileDisplayName(profile)} Radio`,
      defaultGenre: soloPlaylists?.[0]?.genre || null,
      defaultCoverImageUrl: profile.avatar_url || soloPlaylists?.[0]?.cover_image_url || null,
      playlists: soloPlaylists,
    };
  }

  const { data: group, error: groupError } = await supabaseAdmin
    .from("groups_with_stats")
    .select("id, owner_id, name, group_type, genre, images")
    .eq("id", sourceId)
    .maybeSingle();

  if (groupError) {
    throw groupError;
  }

  if (!group?.owner_id) {
    throw new Error("Group not found");
  }

  const { data: links, error: linksError } = await supabaseAdmin
    .from("group_playlists")
    .select("playlist_id, position")
    .eq("group_id", sourceId)
    .order("position");

  if (linksError) {
    throw linksError;
  }

  const playlistIds = (links || [])
    .map((link: any) => (typeof link?.playlist_id === "string" ? link.playlist_id : ""))
    .filter((playlistId: string) => playlistId.length > 0);

  let playlists: any[] = [];
  if (playlistIds.length > 0) {
    const { data, error } = await filterStationEligiblePlaylists(
      supabaseAdmin
        .from("playlists")
        .select("id, title, description, genre, cover_image_url, track_count, visibility, creator_id")
        .in("id", playlistIds),
    );

    if (error) {
      throw error;
    }

    const positionByPlaylistId = new Map<string, number>(
      (links || []).map((link: any) => [link.playlist_id, Number(link.position || 0)]),
    );
    playlists = (data || []).sort((left: any, right: any) => {
      return (positionByPlaylistId.get(left.id) || 0) - (positionByPlaylistId.get(right.id) || 0);
    });
  }

  return {
    source: group,
    managedProfileId: group.owner_id,
    managedGroupId: group.id,
    defaultName: `${getGroupDisplayName(group)} Radio`,
    defaultGenre: group.genre || playlists?.[0]?.genre || null,
    defaultCoverImageUrl: getFirstImage(group.images) || playlists?.[0]?.cover_image_url || null,
    playlists,
  };
}

async function upsertStationFromSource(
  supabaseAdmin: any,
  adminUserId: string,
  sourceKind: "profile" | "group",
  sourceId: string,
  params: Record<string, any>,
) {
  const sourceInfo = await getEligibleStationSource(supabaseAdmin, sourceKind, sourceId);
  const eligiblePlaylists = sourceInfo.playlists || [];
  const eligiblePlaylistIds = new Set(
    eligiblePlaylists
      .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
      .filter((playlistId: string) => playlistId.length > 0),
  );

  const requestedPlaylistIds = Array.isArray(params.playlist_ids)
    ? params.playlist_ids
        .map((playlistId: unknown) => (typeof playlistId === "string" ? playlistId.trim() : ""))
        .filter((playlistId: string) => playlistId.length > 0)
    : [];
  const allowedPlaylistIds = requestedPlaylistIds.length > 0
    ? await getStationEligiblePlaylistIds(supabaseAdmin, requestedPlaylistIds)
    : eligiblePlaylistIds;
  const selectedPlaylistIds = (requestedPlaylistIds.length > 0
    ? requestedPlaylistIds
    : Array.from(eligiblePlaylistIds)
  ).filter((playlistId: string, index: number, list: string[]) => {
    return list.indexOf(playlistId) === index && allowedPlaylistIds.has(playlistId);
  });

  if (selectedPlaylistIds.length === 0) {
    throw new Error("Select at least one eligible playlist for this station.");
  }

  const existingStation = await getPrimaryManagedSourceStation(
    supabaseAdmin,
    sourceKind,
    sourceId,
    sourceInfo.managedProfileId,
  );

  const stationPatch = {
    creator_id: adminUserId,
    managed_profile_id: sourceInfo.managedProfileId,
    managed_group_id: sourceInfo.managedGroupId,
    name: params.name || sourceInfo.defaultName,
    description: params.description || null,
    genre: params.genre || sourceInfo.defaultGenre || null,
    cover_image_url: params.cover_image_url || sourceInfo.defaultCoverImageUrl || null,
    is_active: "is_active" in params ? params.is_active !== false : existingStation?.is_active ?? true,
    is_featured: "is_featured" in params ? params.is_featured === true : existingStation?.is_featured ?? false,
    rotation_interval_minutes: normalizeStationRotationIntervalMinutes(params.rotation_interval_minutes),
    stream_url: null,
    stream_status: "offline",
    now_playing_title: null,
    now_playing_artist: null,
    last_seen_live_at: null,
  };

  let station: any;
  if (existingStation?.id) {
    const { data, error } = await supabaseAdmin
      .from("stations")
      .update(stationPatch)
      .eq("id", existingStation.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    station = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("stations")
      .insert(stationPatch)
      .select()
      .single();

    if (error) {
      throw error;
    }

    station = data;
  }

  const { error: deleteSlotsError } = await supabaseAdmin
    .from("station_playlist_slots")
    .delete()
    .eq("station_id", station.id);

  if (deleteSlotsError) {
    throw deleteSlotsError;
  }

  const slotRows = selectedPlaylistIds.map((playlistId: string, index: number) => ({
    station_id: station.id,
    playlist_id: playlistId,
    position: index,
    is_active: true,
  }));

  const { error: insertSlotsError } = await supabaseAdmin
    .from("station_playlist_slots")
    .insert(slotRows);

  if (insertSlotsError) {
    throw insertSlotsError;
  }

  return {
    ...removeStationStreamFields(station),
    slot_count: selectedPlaylistIds.length,
    slot_playlist_ids: selectedPlaylistIds,
  };
}

function getStationLiveSlotState(station: any, slots: any[]) {
  const normalizedSlots = (slots || [])
    .map((slot: any, originalIndex: number) => ({ slot, originalIndex }))
    .filter(({ slot }) => slot?.is_active !== false)
    .sort((left, right) => {
      const leftPosition = Number(left.slot?.position);
      const rightPosition = Number(right.slot?.position);
      const leftOrder = Number.isFinite(leftPosition) ? leftPosition : left.originalIndex;
      const rightOrder = Number.isFinite(rightPosition) ? rightPosition : right.originalIndex;
      return leftOrder === rightOrder
        ? left.originalIndex - right.originalIndex
        : leftOrder - rightOrder;
    })
    .map(({ slot }) => slot);
  const rotationIntervalMinutes = getStationRotationIntervalMinutes(station);
  const concurrentSlotLimit = normalizedSlots.length || getStationConcurrentSlotLimit(station);
  const nowMs = Date.now();
  const liveTimeline = getStationLiveTimeline(
    station,
    normalizedSlots,
    rotationIntervalMinutes,
    nowMs,
  );

  return {
    concurrentSlotLimit,
    liveAnchorAt: new Date(liveTimeline.anchorTimestampMs).toISOString(),
    liveCurrentDurationSeconds: liveTimeline.currentDurationSeconds,
    liveCurrentItem: liveTimeline.currentItem,
    liveCurrentItemIndex: liveTimeline.currentItemIndex,
    liveCurrentQueueIndex: liveTimeline.currentQueueIndex,
    liveCurrentSlot: liveTimeline.currentSlot,
    liveCurrentSlotIndex: liveTimeline.currentSlotIndex,
    liveLoopDurationSeconds: liveTimeline.loopDurationSeconds,
    livePositionSeconds: liveTimeline.positionSeconds,
    liveSlots: normalizedSlots,
    liveSyncedAt: new Date(nowMs).toISOString(),
    rotationIntervalMinutes,
  };
}

function getUniqueStringValues(values: unknown[]) {
  return Array.from(new Set(
    values
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0),
  ));
}

function createGroupedRowMap(rows: any[], keyName: string, orderedKeys: string[]) {
  const grouped = new Map<string, any[]>(
    orderedKeys.map((key) => [key, []]),
  );

  for (const row of rows || []) {
    const key = typeof row?.[keyName] === "string" ? row[keyName] : "";
    if (!key) continue;

    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  return grouped;
}

function decodeStoragePath(value: string) {
  return value
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch (_) {
        return part;
      }
    })
    .join("/");
}

function parseStorageObjectReference(
  value: unknown,
  knownBuckets: Set<string> = KNOWN_PLAYLIST_AUDIO_BUCKETS,
): { bucket: string; path: string } | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;

  const storageUrlMatch = trimmed.match(
    /(?:^|\/)storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i,
  );

  if (storageUrlMatch) {
    return {
      bucket: decodeURIComponent(storageUrlMatch[1]),
      path: decodeStoragePath(storageUrlMatch[2]),
    };
  }

  const normalized = trimmed.replace(/^\/+/, "").split(/[?#]/)[0];
  const parts = normalized.split("/");
  const bucket = parts[0];

  if (parts.length > 1 && knownBuckets.has(bucket)) {
    return {
      bucket,
      path: parts.slice(1).join("/"),
    };
  }

  return null;
}

function addStorageRef(
  refs: Map<string, Set<string>>,
  bucket: string,
  path: unknown,
) {
  const cleanPath = typeof path === "string" ? path.trim().replace(/^\/+/, "") : "";
  if (!bucket || !cleanPath) return;

  const paths = refs.get(bucket) || new Set<string>();
  paths.add(cleanPath);
  refs.set(bucket, paths);
}

function addParsedStorageRef(
  refs: Map<string, Set<string>>,
  value: unknown,
) {
  const storageRef = parseStorageObjectReference(value, KNOWN_PLAYLIST_STORAGE_BUCKETS);
  if (!storageRef) return;
  addStorageRef(refs, storageRef.bucket, storageRef.path);
}

async function removePlaylistStorageRefs(
  supabaseAdmin: any,
  refs: Map<string, Set<string>>,
) {
  for (const [bucket, paths] of refs.entries()) {
    const uniquePaths = [...paths].filter(Boolean);
    for (let index = 0; index < uniquePaths.length; index += 100) {
      const chunk = uniquePaths.slice(index, index + 100);
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
      if (error) {
        console.warn("manage-playlists storage cleanup failed", {
          bucket,
          count: chunk.length,
          message: error.message,
        });
      }
    }
  }
}

async function getSignedPlaylistAudioUrl(supabaseAdmin: any, audioUrl: unknown) {
  const storageRef = parseStorageObjectReference(audioUrl);
  if (!storageRef) {
    return audioUrl;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(storageRef.bucket)
    .createSignedUrl(storageRef.path, PLAYLIST_AUDIO_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    console.warn("Unable to sign playlist audio URL:", {
      bucket: storageRef.bucket,
      message: error?.message || "No signed URL returned",
    });
    return audioUrl;
  }

  return data.signedUrl;
}

async function attachPlaylistItemsToSlots(supabaseAdmin: any, slots: any[], itemLimit?: number) {
  const playlistIds = getUniqueStringValues(
    (slots || []).map((slot: any) => slot?.playlist?.id),
  );

  if (playlistIds.length === 0) {
    return (slots || []).map((slot: any) => {
      if (slot?.playlist) {
        slot.playlist.items = [];
      }
      return slot;
    });
  }

  const { data: items, error } = await supabaseAdmin
    .from("playlist_items")
    .select("*, teaser:playlist_teaser_assets!teaser_asset_id(*)")
    .in("playlist_id", playlistIds)
    .order("playlist_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    console.warn("Unable to load playlist items for station slots:", error);
  }

  const itemsByPlaylistId = new Map<string, any[]>(
    playlistIds.map((playlistId) => [playlistId, []]),
  );

  const limitedItems: any[] = [];
  for (const item of items || []) {
    const playlistId = typeof item?.playlist_id === "string" ? item.playlist_id : "";
    if (!playlistId) continue;

    const current = itemsByPlaylistId.get(playlistId) || [];
    if (typeof itemLimit === "number" && current.length >= itemLimit) {
      continue;
    }

    current.push(item);
    itemsByPlaylistId.set(playlistId, current);
    limitedItems.push(item);
  }

  const signedItems = await Promise.all(
    limitedItems.map(async (item: any) => ({
      ...item,
      audio_url: await getSignedPlaylistAudioUrl(supabaseAdmin, item?.audio_url),
    })),
  );

  const signedItemsByOriginalItem = new Map(
    limitedItems.map((item: any, index: number) => [item, signedItems[index]]),
  );

  for (const [playlistId, playlistItems] of itemsByPlaylistId.entries()) {
    itemsByPlaylistId.set(
      playlistId,
      playlistItems.map((item: any) => signedItemsByOriginalItem.get(item) || item),
    );
  }

  return (slots || []).map((slot: any) => {
    if (slot?.playlist?.id) {
      slot.playlist.items = itemsByPlaylistId.get(slot.playlist.id) || [];
    }
    return slot;
  });
}

async function fetchStationSlotsByStation(supabaseAdmin: any, stationIds: string[], options: { includeItems?: boolean; itemLimit?: number } = {}) {
  const uniqueStationIds = getUniqueStringValues(stationIds);
  if (uniqueStationIds.length === 0) {
    return new Map<string, any[]>();
  }

  const { data: slots, error } = await supabaseAdmin
    .from("station_playlist_slots")
    .select("*, playlist:playlists!playlist_id(id, title, description, genre, cover_image_url, track_count, created_at, updated_at)")
    .in("station_id", uniqueStationIds)
    .order("station_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  const enrichedSlots = options.includeItems
    ? await attachPlaylistItemsToSlots(supabaseAdmin, slots || [], options.itemLimit)
    : (slots || []).map((slot: any) => {
        if (slot?.playlist) {
          slot.playlist.items = [];
        }
        return slot;
      });

  return createGroupedRowMap(enrichedSlots, "station_id", uniqueStationIds);
}

async function enrichStationSlots(supabaseAdmin: any, slots: any[], itemLimit?: number) {
  return attachPlaylistItemsToSlots(supabaseAdmin, slots || [], itemLimit);
}

async function fetchStationSlotSummariesByStation(supabaseAdmin: any, stationIds: string[]) {
  const uniqueStationIds = getUniqueStringValues(stationIds);
  if (uniqueStationIds.length === 0) {
    return new Map<string, any[]>();
  }

  const { data: slots, error } = await supabaseAdmin
    .from("station_playlist_slots")
    .select("id, station_id, playlist_id, is_active, position, starts_at, ends_at, created_at")
    .in("station_id", uniqueStationIds)
    .order("station_id", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    throw error;
  }

  return createGroupedRowMap(slots || [], "station_id", uniqueStationIds);
}

function attachStationSlotSummary(station: any, slots: any[]) {
  const liveSlotState = getStationLiveSlotState(station, slots || []);
  station.slot_count = (slots || []).length;
  station.slot_playlist_ids = (slots || []).map((slot: any) => slot.playlist_id);
  station.live_slot_count = liveSlotState.liveSlots.length;
  station.live_slot_playlist_ids = liveSlotState.liveSlots.map((slot: any) => slot.playlist_id);
  station.rotation_interval_minutes = liveSlotState.rotationIntervalMinutes;
  station.concurrent_slot_limit = liveSlotState.concurrentSlotLimit;
  station.live_anchor_at = liveSlotState.liveAnchorAt;
  station.live_current_slot_id = liveSlotState.liveCurrentSlot?.id || null;
  station.live_current_playlist_id = (
    liveSlotState.liveCurrentSlot?.playlist?.id ||
    liveSlotState.liveCurrentSlot?.playlist_id ||
    null
  );
  station.live_current_slot_index = liveSlotState.liveCurrentSlotIndex;
  station.live_current_item_index = liveSlotState.liveCurrentItemIndex;
  station.live_current_queue_index = liveSlotState.liveCurrentQueueIndex;
  station.live_position_seconds = liveSlotState.livePositionSeconds;
  station.live_duration_seconds = liveSlotState.liveCurrentDurationSeconds;
  station.live_loop_duration_seconds = liveSlotState.liveLoopDurationSeconds;
  station.live_synced_at = liveSlotState.liveSyncedAt;
  return removeStationStreamFields(station);
}

function removeStationStreamFields(station: any) {
  if (!station || typeof station !== "object") {
    return station;
  }

  const sanitized = { ...station };
  delete sanitized.stream_url;
  delete sanitized.stream_status;
  delete sanitized.now_playing_title;
  delete sanitized.now_playing_artist;
  delete sanitized.last_seen_live_at;
  return sanitized;
}

function decorateStationWithLiveRotation(station: any, enrichedSlots: any[]) {
  const liveSlotState = getStationLiveSlotState(station, enrichedSlots);

  return {
    ...removeStationStreamFields(station),
    concurrent_slot_limit: liveSlotState.concurrentSlotLimit,
    live_anchor_at: liveSlotState.liveAnchorAt,
    live_current_duration_seconds: liveSlotState.liveCurrentDurationSeconds,
    live_current_item: liveSlotState.liveCurrentItem,
    live_current_item_index: liveSlotState.liveCurrentItemIndex,
    live_current_playlist_id: (
      liveSlotState.liveCurrentSlot?.playlist?.id ||
      liveSlotState.liveCurrentSlot?.playlist_id ||
      null
    ),
    live_current_queue_index: liveSlotState.liveCurrentQueueIndex,
    live_current_slot: liveSlotState.liveCurrentSlot,
    live_current_slot_id: liveSlotState.liveCurrentSlot?.id || null,
    live_current_slot_index: liveSlotState.liveCurrentSlotIndex,
    live_loop_duration_seconds: liveSlotState.liveLoopDurationSeconds,
    live_position_seconds: liveSlotState.livePositionSeconds,
    live_slot_count: liveSlotState.liveSlots.length,
    live_slots: liveSlotState.liveSlots,
    live_synced_at: liveSlotState.liveSyncedAt,
    rotation_interval_minutes: liveSlotState.rotationIntervalMinutes,
    slot_count: enrichedSlots.length,
    slots: enrichedSlots,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = extractAccessToken(authHeader);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const requestBody = await req.json();
    const { action: rawAction, ...params } = requestBody ?? {};
    const action = typeof rawAction === "string" ? rawAction.trim() : "";

    if (!action) {
      return jsonResponse({ error: "action is required" }, 400);
    }

    const requiresAuth = !PUBLIC_ACTIONS.has(action);
    let authUser: any = null;

    if (accessToken) {
      const {
        data: { user },
        error: authErr,
      } = await supabaseAdmin.auth.getUser(accessToken);

      if (authErr || !user) {
        if (requiresAuth) {
          return jsonResponse({ error: "Invalid token" }, 401);
        }
      } else {
        authUser = user;
      }
    } else if (requiresAuth) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    if (requiresAuth && !authUser) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const uid = authUser?.id ?? null;
    const requesterRole = authUser && uid
      ? await getRequesterRole(supabaseAdmin, authUser, uid)
      : null;
    const stationAdminActions = new Set([
      "admin_list_stations",
      "admin_list_station_sources",
      "admin_upsert_station_from_source",
      "admin_auto_create_stations",
      "create_station",
      "delete_station",
      "update_station",
      "add_station_slot",
      "remove_station_slot",
      "toggle_radio_slot",
    ]);

    if (stationAdminActions.has(action)) {
      if (requesterRole !== "admin") {
        return jsonResponse({ error: "Stations are managed by admins." }, 403);
      }
    }

    // ── create_playlist ─────────────────────────────────────────────
    if (action === "create_playlist") {
      const { title, description, visibility, genre, cover_image_url, items } = params;
      const ownerGroupId = normalizeProfileId(params.owner_group_id || params.group_id);
      if (!title) return jsonResponse({ error: "title is required" }, 400);

      if (ownerGroupId) {
        try {
          await assertCanManageGroup(supabaseAdmin, ownerGroupId, uid, requesterRole);
        } catch (groupError: any) {
          const message = groupError?.message || "Unable to manage this group.";
          return jsonResponse({ error: message }, message === "Group not found" ? 404 : 403);
        }
      }

      const { data: playlist, error: plErr } = await supabaseAdmin
        .from("playlists")
        .insert({
          creator_id: uid,
          owner_group_id: ownerGroupId,
          title,
          description: description || null,
          visibility: visibility || "public",
          genre: genre || null,
          cover_image_url: cover_image_url || null,
        })
        .select()
        .single();

      if (plErr) return jsonResponse({ error: plErr.message }, 500);

      if (ownerGroupId) {
        try {
          await linkPlaylistToGroup(supabaseAdmin, ownerGroupId, playlist.id);
        } catch (linkError: any) {
          return jsonResponse({ error: linkError?.message || "Playlist created, but it could not be linked to the group." }, 500);
        }
      }

      // Bulk insert items if provided
      if (items && Array.isArray(items) && items.length > 0) {
        let itemRows;
        try {
          itemRows = items.map((item: any, i: number) => ({
            playlist_id: playlist.id,
            title: String(item?.title || "").trim(),
            artist_name: item?.artist_name ? String(item.artist_name).trim() : null,
            audio_url: normalizeOptionalAudioUrl(item?.audio_url),
            cover_image_url: normalizeOptionalImageUrl(item?.cover_image_url),
            duration_seconds: normalizeOptionalDurationSeconds(item?.duration_seconds),
            teaser_asset_id: item?.teaser_asset_id || null,
            position: i,
          }));
        } catch (validationError: any) {
          return jsonResponse({ error: validationError.message || "Invalid track data" }, 400);
        }

        if (itemRows.some((item: any) => !item.title)) {
          return jsonResponse({ error: "Each playlist item requires a title" }, 400);
        }

        await supabaseAdmin.from("playlist_items").insert(itemRows);
      }

      return jsonResponse({ success: true, data: playlist });
    }

    // ── update_playlist ─────────────────────────────────────────────
    if (action === "update_playlist") {
      const { playlist_id, ...updates } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("playlists")
        .select("creator_id, owner_group_id, cover_image_url")
        .eq("id", playlist_id)
        .single();

      if (!existing) return jsonResponse({ error: "Playlist not found" }, 404);
      if (!(await canManagePlaylist(supabaseAdmin, existing, uid, requesterRole))) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const oldCoverImageUrl = existing.cover_image_url || null;

      const allowed = ["title", "description", "visibility", "genre", "cover_image_url", "is_featured"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

      const { data, error } = await supabaseAdmin
        .from("playlists")
        .update(patch)
        .eq("id", playlist_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      const nextCoverImageUrl = "cover_image_url" in patch ? patch.cover_image_url || null : oldCoverImageUrl;
      if (oldCoverImageUrl && oldCoverImageUrl !== nextCoverImageUrl) {
        const refs = new Map<string, Set<string>>();
        addParsedStorageRef(refs, oldCoverImageUrl);
        await removePlaylistStorageRefs(supabaseAdmin, refs);
      }

      return jsonResponse({ success: true, data });
    }

    // ── delete_playlist ─────────────────────────────────────────────
    if (action === "delete_playlist") {
      const { playlist_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("playlists")
        .select("creator_id, owner_group_id, cover_image_url")
        .eq("id", playlist_id)
        .single();

      if (!existing) return jsonResponse({ error: "Playlist not found" }, 404);
      if (!(await canManagePlaylist(supabaseAdmin, existing, uid, requesterRole))) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const storageRefs = new Map<string, Set<string>>();
      addParsedStorageRef(storageRefs, existing.cover_image_url);

      const { data: playlistItemsForCleanup } = await supabaseAdmin
        .from("playlist_items")
        .select("audio_url, cover_image_url, teaser:playlist_teaser_assets!teaser_asset_id(storage_path)")
        .eq("playlist_id", playlist_id);

      for (const item of playlistItemsForCleanup || []) {
        addParsedStorageRef(storageRefs, item?.audio_url);
        addParsedStorageRef(storageRefs, item?.cover_image_url);
        const teaser = Array.isArray(item?.teaser) ? item.teaser[0] : item?.teaser;
        addStorageRef(storageRefs, PLAYLIST_ASSET_BUCKET, teaser?.storage_path);
      }

      const { data: teaserAssetsForCleanup } = await supabaseAdmin
        .from("playlist_teaser_assets")
        .select("storage_path")
        .eq("playlist_id", playlist_id);

      for (const asset of teaserAssetsForCleanup || []) {
        addStorageRef(storageRefs, PLAYLIST_ASSET_BUCKET, asset?.storage_path);
      }

      let { error } = await supabaseAdmin.from("playlists").delete().eq("id", playlist_id);
      const shouldRetryWithItemCleanup = error && /constraint|foreign key|referenced|trigger|tuple|cascade/i.test(error.message || "");

      if (shouldRetryWithItemCleanup) {
        console.warn("manage-playlists delete_playlist retrying after item cleanup", {
          playlist_id,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        const { error: itemDeleteError } = await supabaseAdmin
          .from("playlist_items")
          .delete()
          .eq("playlist_id", playlist_id);

        if (itemDeleteError) {
          return jsonResponse({
            error: itemDeleteError.message,
            original_error: error.message,
            code: itemDeleteError.code,
            details: itemDeleteError.details,
            hint: itemDeleteError.hint,
          }, 500);
        }

        ({ error } = await supabaseAdmin.from("playlists").delete().eq("id", playlist_id));
      }

      if (error) {
        console.error("manage-playlists delete_playlist failed", {
          playlist_id,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });

        return jsonResponse({
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }, 500);
      }

      await removePlaylistStorageRefs(supabaseAdmin, storageRefs);

      return jsonResponse({ success: true });
    }

    // ── get_playlist_details ────────────────────────────────────────
    if (action === "get_playlist_details") {
      const { playlist_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const { data: playlist, error: plErr } = await supabaseAdmin
        .from("playlists")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url)")
        .eq("id", playlist_id)
        .single();

      if (plErr || !playlist) return jsonResponse({ error: "Playlist not found" }, 404);

      const { data: items } = await supabaseAdmin
        .from("playlist_items")
        .select("*, teaser:playlist_teaser_assets!teaser_asset_id(*), external_link:external_platform_links!external_link_id(*)")
        .eq("playlist_id", playlist_id)
        .order("position");

      const { data: teaserAssets } = await supabaseAdmin
        .from("playlist_teaser_assets")
        .select("*")
        .eq("playlist_id", playlist_id)
        .order("created_at", { ascending: false });

      const { data: externalLinks } = await supabaseAdmin
        .from("external_platform_links")
        .select("*")
        .eq("linked_playlist_id", playlist_id)
        .order("created_at", { ascending: false });

      return jsonResponse({
        success: true,
        data: {
          ...playlist,
          items: items || [],
          teaser_assets: teaserAssets || [],
          external_links: externalLinks || [],
        },
      });
    }

    // ── list_my_playlists ───────────────────────────────────────────
    if (action === "list_my_playlists") {
      const { data, error } = await supabaseAdmin
        .from("playlists")
        .select("*")
        .eq("creator_id", uid)
        .is("owner_group_id", null)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── list_user_playlists ──────────────────────────────────────────
    if (action === "list_user_playlists") {
      const { user_id } = params;
      if (!user_id) return jsonResponse({ error: "user_id is required" }, 400);

      const isOwnProfile = user_id === uid || requesterRole === "admin";
      let query = supabaseAdmin
        .from("playlists")
        .select("*")
        .eq("creator_id", user_id)
        .is("owner_group_id", null);

      // Non-owners only see public playlists
      if (!isOwnProfile) {
        query = filterPublicVisiblePlaylists(query);
      }

      query = query.order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── browse_playlists ────────────────────────────────────────────
    if (action === "browse_playlists") {
      const { genre, featured_only, limit: lim } = params;
      let query = filterPublicVisiblePlaylists(
        supabaseAdmin
          .from("playlists")
          .select("*, creator:profiles!creator_id(id, full_name, avatar_url)"),
      )
        .order("created_at", { ascending: false });

      if (genre) query = query.eq("genre", genre);
      if (featured_only) query = query.eq("is_featured", true);
      if (lim) query = query.limit(Number(lim));

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── add_playlist_item ───────────────────────────────────────────
    if (action === "add_playlist_item") {
      const { playlist_id, title, artist_name, duration_seconds, teaser_asset_id, external_link_id, audio_url, cover_image_url } = params;
      if (!playlist_id || !title) return jsonResponse({ error: "playlist_id and title are required" }, 400);

      const { data: pl } = await supabaseAdmin.from("playlists").select("creator_id, owner_group_id").eq("id", playlist_id).single();
      if (!pl || !(await canManagePlaylist(supabaseAdmin, pl, uid, requesterRole))) return jsonResponse({ error: "Forbidden" }, 403);

      // Get next position
      const { data: lastItem } = await supabaseAdmin
        .from("playlist_items")
        .select("position")
        .eq("playlist_id", playlist_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPos = (lastItem?.position ?? -1) + 1;

      let normalizedDuration: number | null;
      let normalizedAudioUrl: string | null;
      let normalizedCoverImageUrl: string | null;
      try {
        normalizedDuration = normalizeOptionalDurationSeconds(duration_seconds);
        normalizedAudioUrl = normalizeOptionalAudioUrl(audio_url);
        normalizedCoverImageUrl = normalizeOptionalImageUrl(cover_image_url);
      } catch (validationError: any) {
        return jsonResponse({ error: validationError.message || "Invalid track data" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("playlist_items")
        .insert({
          playlist_id,
          title,
          artist_name: artist_name || null,
          duration_seconds: normalizedDuration,
          cover_image_url: normalizedCoverImageUrl,
          position: nextPos,
          teaser_asset_id: teaser_asset_id || null,
          external_link_id: external_link_id || null,
          audio_url: normalizedAudioUrl,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── update_playlist_item ───────────────────────────────────────
    if (action === "update_playlist_item") {
      const { item_id, title, artist_name, duration_seconds, teaser_asset_id, external_link_id, audio_url, cover_image_url } = params;
      if (!item_id || !title) return jsonResponse({ error: "item_id and title are required" }, 400);

      const { data: item } = await supabaseAdmin
        .from("playlist_items")
        .select("playlist_id")
        .eq("id", item_id)
        .single();

      if (!item) return jsonResponse({ error: "Item not found" }, 404);

      const { data: pl } = await supabaseAdmin
        .from("playlists")
        .select("creator_id, owner_group_id")
        .eq("id", item.playlist_id)
        .single();

      if (!pl || !(await canManagePlaylist(supabaseAdmin, pl, uid, requesterRole))) return jsonResponse({ error: "Forbidden" }, 403);

      let normalizedDuration: number | null;
      let normalizedAudioUrl: string | null;
      let normalizedCoverImageUrl: string | null;
      try {
        normalizedDuration = normalizeOptionalDurationSeconds(duration_seconds);
        normalizedAudioUrl = normalizeOptionalAudioUrl(audio_url);
        normalizedCoverImageUrl = normalizeOptionalImageUrl(cover_image_url);
      } catch (validationError: any) {
        return jsonResponse({ error: validationError.message || "Invalid track data" }, 400);
      }

      const { data, error } = await supabaseAdmin
        .from("playlist_items")
        .update({
          title,
          artist_name: artist_name || null,
          duration_seconds: normalizedDuration,
          cover_image_url: normalizedCoverImageUrl,
          teaser_asset_id: teaser_asset_id || null,
          external_link_id: external_link_id || null,
          audio_url: normalizedAudioUrl,
        })
        .eq("id", item_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── remove_playlist_item ────────────────────────────────────────
    if (action === "remove_playlist_item") {
      const { item_id, playlist_id } = params;
      if (!item_id) return jsonResponse({ error: "item_id is required" }, 400);

      if (playlist_id) {
        const { data: pl, error: playlistError } = await supabaseAdmin
          .from("playlists")
          .select("creator_id, owner_group_id")
          .eq("id", playlist_id)
          .maybeSingle();

        if (playlistError) return jsonResponse({ error: playlistError.message }, 500);
        if (!pl) return jsonResponse({ error: "Playlist not found" }, 404);
        if (!(await canManagePlaylist(supabaseAdmin, pl, uid, requesterRole))) return jsonResponse({ error: "Forbidden" }, 403);

        const { data: deletedItem, error: deleteError } = await supabaseAdmin
          .from("playlist_items")
          .delete()
          .eq("id", item_id)
          .eq("playlist_id", playlist_id)
          .select("id")
          .maybeSingle();

        if (deleteError) return jsonResponse({ error: deleteError.message }, 500);
        return jsonResponse({ success: true, already_removed: !deletedItem });
      }

      const { data: item } = await supabaseAdmin
        .from("playlist_items")
        .select("playlist_id")
        .eq("id", item_id)
        .maybeSingle();

      if (!item) return jsonResponse({ error: "Item not found" }, 404);

      const { data: pl } = await supabaseAdmin.from("playlists").select("creator_id, owner_group_id").eq("id", item.playlist_id).single();
      if (!pl || !(await canManagePlaylist(supabaseAdmin, pl, uid, requesterRole))) return jsonResponse({ error: "Forbidden" }, 403);

      const { error } = await supabaseAdmin.from("playlist_items").delete().eq("id", item_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── upload_teaser_asset ─────────────────────────────────────────
    if (action === "upload_teaser_asset") {
      const { playlist_id, asset_type, storage_path, mime_type, duration_seconds, file_size_bytes } = params;
      if (!playlist_id || !storage_path) return jsonResponse({ error: "playlist_id and storage_path are required" }, 400);

      const { data: pl } = await supabaseAdmin.from("playlists").select("creator_id, owner_group_id").eq("id", playlist_id).single();
      if (!pl || !(await canManagePlaylist(supabaseAdmin, pl, uid, requesterRole))) return jsonResponse({ error: "Forbidden" }, 403);

      const { data, error } = await supabaseAdmin
        .from("playlist_teaser_assets")
        .insert({
          playlist_id,
          uploader_id: uid,
          asset_type: asset_type || "teaser_clip",
          storage_path,
          mime_type: mime_type || null,
          duration_seconds: duration_seconds || null,
          file_size_bytes: file_size_bytes || null,
          screen_result: "pending",
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── add_external_link ───────────────────────────────────────────
    if (action === "add_external_link") {
      const { platform, url, label, linked_playlist_id, linked_item_id } = params;
      if (!platform || !url) return jsonResponse({ error: "platform and url are required" }, 400);

      const { data, error } = await supabaseAdmin
        .from("external_platform_links")
        .insert({
          owner_id: uid,
          platform,
          url,
          label: label || null,
          linked_playlist_id: linked_playlist_id || null,
          linked_item_id: linked_item_id || null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── record_play_event ───────────────────────────────────────────
    if (action === "record_play_event") {
      const { playlist_id, item_id, station_id, event_type, platform } = params;
      if (!event_type) return jsonResponse({ error: "event_type is required" }, 400);
      const fallbackPlaylistId = readPlaylistRadioFallbackId(station_id);
      let normalizedPlaylistId = normalizeUuid(playlist_id) || fallbackPlaylistId;
      let normalizedItemId = normalizeUuid(item_id);
      let normalizedStationId = normalizeUuid(station_id);

      if (normalizedStationId) {
        const { data: stationExists, error: stationLookupError } = await supabaseAdmin
          .from("stations")
          .select("id")
          .eq("id", normalizedStationId)
          .maybeSingle();

        if (stationLookupError) return jsonResponse({ error: stationLookupError.message }, 500);
        if (!stationExists) normalizedStationId = "";
      }

      if (normalizedPlaylistId) {
        const { data: playlistExists, error: playlistLookupError } = await supabaseAdmin
          .from("playlists")
          .select("id")
          .eq("id", normalizedPlaylistId)
          .maybeSingle();

        if (playlistLookupError) return jsonResponse({ error: playlistLookupError.message }, 500);
        if (!playlistExists) normalizedPlaylistId = "";
      }

      if (normalizedItemId) {
        const { data: itemExists, error: itemLookupError } = await supabaseAdmin
          .from("playlist_items")
          .select("id")
          .eq("id", normalizedItemId)
          .maybeSingle();

        if (itemLookupError) return jsonResponse({ error: itemLookupError.message }, 500);
        if (!itemExists) normalizedItemId = "";
      }

      const { data, error } = await supabaseAdmin
        .from("playlist_play_events")
        .insert({
          playlist_id: normalizedPlaylistId || null,
          item_id: normalizedItemId || null,
          station_id: normalizedStationId || null,
          user_id: uid,
          event_type,
          platform: platform || null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Increment click count for external links if outbound_click
      if (event_type === "outbound_click" && item_id) {
        const { data: item } = await supabaseAdmin
          .from("playlist_items")
          .select("external_link_id")
          .eq("id", item_id)
          .single();
        if (item?.external_link_id) {
          const { data: link } = await supabaseAdmin
            .from("external_platform_links")
            .select("click_count")
            .eq("id", item.external_link_id)
            .single();
          if (link) {
            await supabaseAdmin
              .from("external_platform_links")
              .update({ click_count: (link.click_count || 0) + 1 })
              .eq("id", item.external_link_id);
          }
        }
      }

      return jsonResponse({ success: true, data });
    }

    // ── create_station ──────────────────────────────────────────────
    if (action === "create_station") {
      const {
        name,
        description,
        genre,
        cover_image_url,
        rotation_interval_minutes,
        managed_profile_id,
      } = params;
      if (!name) return jsonResponse({ error: "name is required" }, 400);

      const managedProfileId = resolveManagedProfileId(requesterRole, uid, managed_profile_id);

      await transferManagedProfileStationsToAdmin(supabaseAdmin, uid, managedProfileId);

      const existingManagedStation = await getPrimaryManagedStation(
        supabaseAdmin,
        managedProfileId,
      );

      if (existingManagedStation?.id) {
        const { data, error } = await supabaseAdmin
          .from("stations")
          .update({
            creator_id: uid,
            managed_profile_id: managedProfileId,
            name,
            description: description || null,
            genre: genre || null,
            cover_image_url: cover_image_url || null,
            rotation_interval_minutes: normalizeStationRotationIntervalMinutes(rotation_interval_minutes),
            stream_url: null,
            stream_status: "offline",
            now_playing_title: null,
            now_playing_artist: null,
            last_seen_live_at: null,
          })
          .eq("id", existingManagedStation.id)
          .select()
          .single();

        if (error) return jsonResponse({ error: error.message }, 500);
        return jsonResponse({ success: true, data: removeStationStreamFields(data) });
      }

      const { data, error } = await supabaseAdmin
        .from("stations")
        .insert({
          creator_id: uid,
          managed_profile_id: managedProfileId,
          managed_group_id: null,
          name,
          description: description || null,
          genre: genre || null,
          cover_image_url: cover_image_url || null,
          rotation_interval_minutes: normalizeStationRotationIntervalMinutes(rotation_interval_minutes),
          stream_url: null,
          stream_status: "offline",
          now_playing_title: null,
          now_playing_artist: null,
          last_seen_live_at: null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: removeStationStreamFields(data) });
    }

    if (action === "admin_list_station_sources") {
      const sources = await listAdminStationSources(supabaseAdmin);
      return jsonResponse({ success: true, data: sources });
    }

    if (action === "admin_upsert_station_from_source") {
      const { source_kind, source_id } = params;
      const sourceKind = source_kind === "group" ? "group" : "profile";
      const sourceId = typeof source_id === "string" ? source_id.trim() : "";
      if (!sourceId) return jsonResponse({ error: "source_id is required" }, 400);

      try {
        const station = await upsertStationFromSource(
          supabaseAdmin,
          uid,
          sourceKind,
          sourceId,
          params,
        );

        return jsonResponse({ success: true, data: station });
      } catch (error: any) {
        return jsonResponse({ error: error.message || "Unable to save station" }, 400);
      }
    }

    if (action === "admin_auto_create_stations") {
      const sources = await listAdminStationSources(supabaseAdmin);
      const created: any[] = [];
      const skipped: any[] = [];

      for (const source of sources) {
        if (source?.station?.id) {
          skipped.push({ key: source.key, reason: "station_exists" });
          continue;
        }

        const playlistIds = Array.isArray(source?.playlists)
          ? source.playlists
              .map((playlist: any) => (typeof playlist?.id === "string" ? playlist.id : ""))
              .filter((playlistId: string) => playlistId.length > 0)
          : [];

        if (playlistIds.length === 0) {
          skipped.push({ key: source.key, reason: "no_playlists" });
          continue;
        }

        try {
          const station = await upsertStationFromSource(
            supabaseAdmin,
            uid,
            source.kind === "group" ? "group" : "profile",
            source.id,
            {
              playlist_ids: playlistIds,
              name: `${source.name || "Artist"} Radio`,
              description: `Auto-created from ${source.playlist_count || playlistIds.length} public playlist${playlistIds.length === 1 ? "" : "s"}.`,
              genre: source.genre || null,
              cover_image_url: source.cover_image_url || null,
              rotation_interval_minutes: DEFAULT_STATION_ROTATION_INTERVAL_MINUTES,
              is_active: true,
              is_featured: false,
            },
          );
          created.push(station);
        } catch (error: any) {
          skipped.push({
            key: source.key,
            reason: error.message || "create_failed",
          });
        }
      }

      return jsonResponse({
        success: true,
        data: {
          created,
          skipped,
          created_count: created.length,
          skipped_count: skipped.length,
        },
      });
    }

    // ── update_station ──────────────────────────────────────────────
    if (action === "update_station") {
      const { station_id, ...updates } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("stations")
        .select("id, creator_id, managed_profile_id, managed_group_id")
        .eq("id", station_id)
        .single();

      if (!existing) return jsonResponse({ error: "Station not found" }, 404);

      await transferStationToAdminIfNeeded(supabaseAdmin, existing, uid);

      const allowed = ["name", "description", "genre", "cover_image_url", "is_active", "is_featured", "rotation_interval_minutes"];
      const patch: Record<string, any> = {};
      for (const key of allowed) {
        if (key in updates) patch[key] = updates[key];
      }

      patch.creator_id = uid;
      patch.managed_profile_id = existing.managed_profile_id || existing.creator_id;
      patch.managed_group_id = existing.managed_group_id || null;

      if ("rotation_interval_minutes" in patch) {
        patch.rotation_interval_minutes = normalizeStationRotationIntervalMinutes(
          patch.rotation_interval_minutes,
        );
      }

      patch.stream_url = null;
      patch.stream_status = "offline";
      patch.now_playing_title = null;
      patch.now_playing_artist = null;
      patch.last_seen_live_at = null;

      const { data, error } = await supabaseAdmin
        .from("stations")
        .update(patch)
        .eq("id", station_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: removeStationStreamFields(data) });
    }

    if (action === "delete_station") {
      const { station_id } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { error } = await supabaseAdmin
        .from("stations")
        .delete()
        .eq("id", station_id);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── get_station_details ─────────────────────────────────────────
    if (action === "get_station_details") {
      const { station_id } = params;
      if (!station_id) return jsonResponse({ error: "station_id is required" }, 400);

      const { data: station, error: stErr } = await supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .eq("id", station_id)
        .single();

      if (stErr || !station) return jsonResponse({ error: "Station not found" }, 404);

      const slotsByStationId = await fetchStationSlotsByStation(supabaseAdmin, [station_id], { includeItems: true });
      const enrichedSlots = slotsByStationId.get(station_id) || [];

      return jsonResponse({
        success: true,
        data: {
          ...decorateStationWithLiveRotation(station, enrichedSlots),
          __queueReady: true,
        },
      });
    }

    // ── list_my_stations ────────────────────────────────────────────
    if (action === "list_my_stations") {
      const { data, error } = await supabaseAdmin
        .from("stations")
        .select("*")
        .eq("creator_id", uid)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data: (data || []).map(removeStationStreamFields) });
    }

    // ── list_user_stations ───────────────────────────────────────────
    if (action === "admin_list_stations") {
      const { data: stations, error } = await supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const stationRows = stations || [];
      const slotsByStationId = await fetchStationSlotSummariesByStation(
        supabaseAdmin,
        stationRows.map((st: any) => st.id),
      );

      return jsonResponse({
        success: true,
        data: stationRows.map((st: any) => attachStationSlotSummary(st, slotsByStationId.get(st.id) || [])),
      });
    }

    if (action === "list_user_stations") {
      const { user_id } = params;
      if (!user_id) return jsonResponse({ error: "user_id is required" }, 400);

      const isOwnProfile = user_id === uid || requesterRole === "admin";
      let query = supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .eq("managed_profile_id", user_id)
        .order("created_at", { ascending: false });

      // Non-owners only see active stations
      if (!isOwnProfile) {
        query = query.eq("is_active", true);
      }

      const { data: stations, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      const stationRows = stations || [];
      const slotsByStationId = await fetchStationSlotSummariesByStation(
        supabaseAdmin,
        stationRows.map((st: any) => st.id),
      );

      return jsonResponse({
        success: true,
        data: stationRows.map((st: any) => attachStationSlotSummary(st, slotsByStationId.get(st.id) || [])),
      });
    }

    // ── browse_stations ─────────────────────────────────────────────
    if (action === "browse_stations") {
      const { genre, featured_only, include_items, limit: lim, recommendation_mode } = params;
      const recommendationMode = normalizeStationRecommendationMode(recommendation_mode);
      const shouldRankForUser = recommendationMode === "for_you" && Boolean(uid);
      const requestedLimit = Number(lim);
      const responseLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.max(Math.round(requestedLimit), 1), 50)
        : 0;
      const queryLimit = shouldRankForUser
        ? Math.min(Math.max(responseLimit || 10, 10) * 4, 80)
        : responseLimit;
      let query = supabaseAdmin
        .from("stations")
        .select("*, creator:profiles!creator_id(id, full_name, avatar_url), managed_profile:profiles!managed_profile_id(id, full_name, avatar_url), managed_group:groups!managed_group_id(id, name, group_type, genre)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (genre) query = query.eq("genre", genre);
      if (featured_only) query = query.eq("is_featured", true);
      if (queryLimit) query = query.limit(queryLimit);

      const { data, error } = await query;
      if (error) return jsonResponse({ error: error.message }, 500);

      const stationRows = data || [];
      const shouldIncludeItems = include_items === true;
      const slotsByStationId = await fetchStationSlotsByStation(
        supabaseAdmin,
        stationRows.map((st: any) => st.id),
        { includeItems: shouldIncludeItems },
      );

      let aiProvider = "";
      let aiPowered = false;
      let recommendationMessage = "";
      let orderedStationRows = stationRows;

      if (shouldRankForUser && stationRows.length > 0) {
        const rankedResult = await rankStationsForRecommendation(
          supabaseAdmin,
          stationRows,
          slotsByStationId,
          uid,
          responseLimit || stationRows.length,
        );
        orderedStationRows = rankedResult.stations;
        aiProvider = rankedResult.provider;
        aiPowered = rankedResult.aiPowered;
        recommendationMessage = rankedResult.message;
      }

      const enriched = orderedStationRows
        .slice(0, responseLimit || orderedStationRows.length)
        .map((st: any) => ({
          ...decorateStationWithLiveRotation(st, slotsByStationId.get(st.id) || []),
          __queueReady: false,
        }));

      return jsonResponse({
        success: true,
        data: enriched,
        aiPowered,
        aiProvider,
        message: recommendationMessage,
      });
    }

    // ── add_station_slot ────────────────────────────────────────────
    if (action === "add_station_slot") {
      const { station_id, playlist_id, label, starts_at, ends_at } = params;
      if (!station_id || !playlist_id) return jsonResponse({ error: "station_id and playlist_id are required" }, 400);

      const { data: st } = await supabaseAdmin
        .from("stations")
        .select("id, creator_id, managed_profile_id, managed_group_id")
        .eq("id", station_id)
        .single();
      if (!st) return jsonResponse({ error: "Station not found" }, 404);

      await transferStationToAdminIfNeeded(supabaseAdmin, st, uid);

      const stationProfileId = st.managed_profile_id || st.creator_id;
      const { data: playlist } = await supabaseAdmin
        .from("playlists")
        .select("creator_id")
        .eq("id", playlist_id)
        .single();

      if (!playlist) return jsonResponse({ error: "Playlist not found" }, 404);
      let playlistAllowed = playlist.creator_id === stationProfileId;
      if (!playlistAllowed && st.managed_group_id) {
        const { data: groupLink } = await supabaseAdmin
          .from("group_playlists")
          .select("id")
          .eq("group_id", st.managed_group_id)
          .eq("playlist_id", playlist_id)
          .maybeSingle();
        playlistAllowed = !!groupLink;
      }

      if (!playlistAllowed) {
        return jsonResponse({ error: "Playlist must belong to the profile this station represents." }, 403);
      }

      const { data: lastSlot } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("position")
        .eq("station_id", station_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPos = (lastSlot?.position ?? -1) + 1;

      const { data, error } = await supabaseAdmin
        .from("station_playlist_slots")
        .insert({
          station_id,
          playlist_id,
          position: nextPos,
          label: label || null,
          starts_at: starts_at || null,
          ends_at: ends_at || null,
        })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true, data });
    }

    // ── remove_station_slot ─────────────────────────────────────────
    if (action === "remove_station_slot") {
      const { slot_id } = params;
      if (!slot_id) return jsonResponse({ error: "slot_id is required" }, 400);

      const { data: slot } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("station_id")
        .eq("id", slot_id)
        .single();

      if (!slot) return jsonResponse({ error: "Slot not found" }, 404);

      const { data: st } = await supabaseAdmin
        .from("stations")
        .select("id, creator_id, managed_profile_id, managed_group_id")
        .eq("id", slot.station_id)
        .single();
      if (!st) return jsonResponse({ error: "Station not found" }, 404);

      await transferStationToAdminIfNeeded(supabaseAdmin, st, uid);

      const { error } = await supabaseAdmin.from("station_playlist_slots").delete().eq("id", slot_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── toggle_radio_slot ──────────────────────────────────────────
    // Toggles a playlist on/off the managed profile's radio station.
    // Admin station ownership is preserved even when managing another profile.
    if (action === "toggle_radio_slot") {
      const { playlist_id, user_id } = params;
      if (!playlist_id) return jsonResponse({ error: "playlist_id is required" }, 400);

      const managedProfileId = resolveManagedProfileId(requesterRole, uid, user_id);

      // Verify playlist exists and belongs to the profile being managed
      const { data: playlist } = await supabaseAdmin
        .from("playlists")
        .select("id, creator_id")
        .eq("id", playlist_id)
        .single();
      if (!playlist) return jsonResponse({ error: "Playlist not found" }, 404);
      if (playlist.creator_id !== managedProfileId) return jsonResponse({ error: "Forbidden" }, 403);

      await transferManagedProfileStationsToAdmin(supabaseAdmin, uid, managedProfileId);

      const existingManagedStation = await getPrimaryManagedStation(
        supabaseAdmin,
        managedProfileId,
      );

      let stationId: string;
      if (!existingManagedStation) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", managedProfileId)
          .single();
        const stationName = `${profile?.full_name || "My"}'s Radio`;
        const { data: newStation, error: createErr } = await supabaseAdmin
          .from("stations")
          .insert({
            creator_id: uid,
            managed_profile_id: managedProfileId,
            managed_group_id: null,
            name: stationName,
            is_active: true,
          })
          .select("id")
          .single();
        if (createErr) return jsonResponse({ error: createErr.message }, 500);
        stationId = newStation.id;
      } else {
        stationId = existingManagedStation.id;
      }

      // Check if slot already exists for this playlist
      const { data: existingSlot } = await supabaseAdmin
        .from("station_playlist_slots")
        .select("id")
        .eq("station_id", stationId)
        .eq("playlist_id", playlist_id)
        .maybeSingle();

      if (existingSlot) {
        // Remove from radio
        await supabaseAdmin.from("station_playlist_slots").delete().eq("id", existingSlot.id);
        return jsonResponse({ success: true, on_radio: false, station_id: stationId });
      } else {
        // Add to radio at next position
        const { data: lastSlot } = await supabaseAdmin
          .from("station_playlist_slots")
          .select("position")
          .eq("station_id", stationId)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextPos = (lastSlot?.position ?? -1) + 1;

        const { data: newSlot, error: slotErr } = await supabaseAdmin
          .from("station_playlist_slots")
          .insert({ station_id: stationId, playlist_id, position: nextPos, is_active: true })
          .select("id")
          .single();
        if (slotErr) return jsonResponse({ error: slotErr.message }, 500);
        return jsonResponse({ success: true, on_radio: true, station_id: stationId, slot_id: newSlot.id });
      }
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-playlists error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
