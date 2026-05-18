// @ts-ignore
import { createClient } from "npm:@supabase/supabase-js@2";
import { withNotificationRouteMeta } from "../_shared/notificationRoutes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

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

type FollowTargetType = "profile" | "group";

function normalizeFollowTargetType(value: unknown): FollowTargetType {
  return value === "group" ? "group" : "profile";
}

const POST_CREATOR_ROLES = new Set(["musician", "producer", "studio-owner", "venue-owner", "admin"]);
const POST_VISIBILITIES = new Set(["public", "followers", "unlisted"]);
const POST_MEDIA_TYPES = new Set(["image", "video"]);
const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const SAFE_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TEXT_MODERATION_MODEL = Deno.env.get("GROQ_TEXT_MODERATION_MODEL")?.trim() ||
  Deno.env.get("GROQ_COMMENT_MODERATION_MODEL")?.trim() ||
  "openai/gpt-oss-safeguard-20b";

type TextModerationTarget = "post" | "comment";
type TextModerationStatus = "approved" | "pending_review" | "blocked";

type TextModerationDecision = {
  status: TextModerationStatus;
  reason: string;
  categories: string[];
  score: number | null;
  provider: string;
  metadata: Record<string, any>;
};

function normalizeRole(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeVisibility(value: unknown) {
  const visibility = typeof value === "string" ? value.trim().toLowerCase() : "public";
  return POST_VISIBILITIES.has(visibility) ? visibility : "public";
}

function normalizeContent(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeStoragePath(value: unknown, ownerId: string) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.includes("..")) return "";
  if (!trimmed.startsWith(`${ownerId}/`)) return "";
  return trimmed;
}

function parseFiniteNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

function normalizePostMediaInput(media: unknown, ownerId: string) {
  if (media === undefined || media === null) return { rows: [] as Record<string, any>[] };
  if (!Array.isArray(media)) return { error: "media must be an array" };
  if (media.length > 10) return { error: "A post can include up to 10 media items" };

  const rows = media.map((item: any, index: number) => {
    const mediaType = typeof item?.media_type === "string" ? item.media_type.trim().toLowerCase() : "image";
    if (!POST_MEDIA_TYPES.has(mediaType)) {
      return { error: "Unsupported media type" };
    }

    const storagePath = normalizeStoragePath(item?.storage_path, ownerId);
    if (!storagePath) {
      return { error: "Invalid media storage path" };
    }

    const mimeType = typeof item?.mime_type === "string" ? item.mime_type.trim().toLowerCase() : "";
    const safeMimeSet = mediaType === "video" ? SAFE_VIDEO_MIME_TYPES : SAFE_IMAGE_MIME_TYPES;
    if (!mimeType || !safeMimeSet.has(mimeType)) {
      return { error: "Unsupported media MIME type" };
    }

    const thumbnailPath = item?.thumbnail_path ? normalizeStoragePath(item.thumbnail_path, ownerId) : null;
    if (mediaType === "video" && !thumbnailPath) {
      return { error: "Video posts require a selected thumbnail" };
    }

    const safetyStatus = typeof item?.safety_status === "string" ? item.safety_status.trim().toLowerCase() : "passed";
    if (safetyStatus !== "passed") {
      return { error: "Media must pass AI safety screening before posting" };
    }

    return {
      media_type: mediaType,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      is_cover: Boolean(item?.is_cover),
      mime_type: mimeType,
      width: parseFiniteNumber(item?.width),
      height: parseFiniteNumber(item?.height),
      duration_seconds: parseFiniteNumber(item?.duration_seconds),
      display_order: index,
      safety_context: typeof item?.safety_context === "string" ? item.safety_context.slice(0, 120) : "social_post_media",
      safety_checked_at: item?.safety_checked_at || new Date().toISOString(),
      safety_status: "passed",
      safety_metadata: normalizeMetadata(item?.safety_metadata),
    };
  });

  const failed = rows.find((row: any) => row?.error) as { error?: string } | undefined;
  if (failed?.error) return { error: failed.error };

  const normalizedRows = rows as Record<string, any>[];
  if (normalizedRows.length > 0) {
    const coverCount = normalizedRows.filter((row) => row.is_cover).length;
    if (coverCount > 1) return { error: "Only one media item can be selected as the cover" };
    if (coverCount === 0) normalizedRows[0].is_cover = true;
  }

  return { rows: normalizedRows };
}

async function canViewPost(supabaseAdmin: any, post: any, uid: string, role: string) {
  if (!post) return false;
  if (role === "admin") return true;
  if (post.author_id === uid) return true;
  if (post.is_hidden) return false;
  if (post.visibility === "public") return true;
  if (post.visibility !== "followers" || !uid) return false;

  const { data: followRow } = await supabaseAdmin
    .from("follows")
    .select("id")
    .eq("follower_id", uid)
    .eq("followed_id", post.author_id)
    .eq("followed_type", "profile")
    .maybeSingle();

  return Boolean(followRow?.id);
}

async function getVisiblePostOrResponse(supabaseAdmin: any, postId: string, uid: string, role: string) {
  const { data: post, error } = await supabaseAdmin
    .from("feed_posts")
    .select("id, author_id, visibility, is_hidden, content, share_count")
    .eq("id", postId)
    .maybeSingle();

  if (error || !post) return { response: jsonResponse({ error: "Post not found" }, 404) };
  const visible = await canViewPost(supabaseAdmin, post, uid, role);
  if (!visible) return { response: jsonResponse({ error: "Post not found" }, 404) };
  return { post };
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function moderationTargetLabel(target: TextModerationTarget) {
  return target === "post" ? "Post" : "Comment";
}

type RuleNormalizedText = {
  normalizedText: string;
  compactText: string;
  compactSquashedText: string;
  tokens: Set<string>;
};

const FILIPINO_STRONG_PROFANITY_TERMS = [
  "putangina",
  "putang ina",
  "tangina",
  "tang ina",
  "pukinangina",
  "kingina",
  "kinangina",
  "pakyu",
  "pak yu",
  "pakyo",
  "pakshet",
  "pakshit",
  "punyeta",
  "punyemas",
  "hinayupak",
  "tarantado",
];

const FILIPINO_ABUSIVE_TERMS = [
  "gago",
  "bobo",
  "tanga",
  "ulol",
  "kupal",
  "leche",
  "bwisit",
  "lintik",
  "inutil",
  "buang",
  "boang",
  "yawa",
  "piste",
  "pokpok",
];

const FILIPINO_TARGETED_ABUSE_PATTERNS = [
  /\b(hayop|animal)\s+(ka|mo|kayo|nyo|niyo|sila|siya)\b/i,
  /\b(ikaw|ka|mo|kayo|nyo|niyo|sila|siya)\s+(?:ay\s+)?(gago|bobo|tanga|ulol|kupal|tarantado|inutil|buang|boang|pokpok)\b/i,
  /\b(gago|bobo|tanga|ulol|kupal|tarantado|inutil|buang|boang|pokpok)\s+(ka|mo|kayo|nyo|niyo|sila|siya)\b/i,
];

const LEETISH_CHAR_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "!": "i",
  "|": "i",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  "$": "s",
  "7": "t",
  "+": "t",
  "8": "b",
};

function normalizeTextForRules(content: string): RuleNormalizedText {
  const withoutMarks = content
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  let normalized = "";

  for (const char of withoutMarks) {
    if (LEETISH_CHAR_MAP[char]) {
      normalized += LEETISH_CHAR_MAP[char];
    } else if (/[a-z0-9]/.test(char)) {
      normalized += char;
    } else {
      normalized += " ";
    }
  }

  const normalizedText = ` ${normalized.replace(/\s+/g, " ").trim()} `;
  const compactText = normalizedText.replace(/\s+/g, "");
  const compactSquashedText = compactText.replace(/([a-z])\1+/g, "$1");
  const tokens = new Set(normalizedText.trim().split(/\s+/).filter(Boolean));

  return { normalizedText, compactText, compactSquashedText, tokens };
}

function compactRuleTerm(term: string) {
  return term.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findRuleTerm(ruleText: RuleNormalizedText, terms: string[], compactMinimumLength = 6) {
  for (const term of terms) {
    const compactTerm = compactRuleTerm(term);
    if (!compactTerm) continue;

    if (ruleText.tokens.has(compactTerm)) {
      return term;
    }

    if (
      compactTerm.length >= compactMinimumLength &&
      (ruleText.compactText.includes(compactTerm) || ruleText.compactSquashedText.includes(compactTerm))
    ) {
      return term;
    }
  }

  return null;
}

function hasFilipinoTargetedAbuse(normalizedText: string) {
  return FILIPINO_TARGETED_ABUSE_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function filipinoProfanityModeration(
  target: TextModerationTarget,
  content: string,
): TextModerationDecision | null {
  const ruleText = normalizeTextForRules(content);
  const strongTerm = findRuleTerm(ruleText, FILIPINO_STRONG_PROFANITY_TERMS, 5);
  if (strongTerm) {
    return {
      status: "blocked",
      reason: "Filipino or Taglish profanity detected.",
      categories: ["abusive", "filipino_profanity"],
      score: 0.94,
      provider: "local-text-rules",
      metadata: { rule: "filipino_strong_profanity", target, matched_term: strongTerm },
    };
  }

  const abusiveTerm = findRuleTerm(ruleText, FILIPINO_ABUSIVE_TERMS, 99);
  const targetedAbuse = hasFilipinoTargetedAbuse(ruleText.normalizedText);
  if ((abusiveTerm && target === "comment") || targetedAbuse) {
    return {
      status: "blocked",
      reason: "Filipino or Taglish abusive language detected.",
      categories: ["abusive", "harassment", "filipino_profanity"],
      score: targetedAbuse ? 0.9 : 0.82,
      provider: "local-text-rules",
      metadata: {
        rule: targetedAbuse ? "filipino_targeted_abuse" : "filipino_abusive_comment",
        target,
        matched_term: abusiveTerm,
      },
    };
  }

  if (abusiveTerm || targetedAbuse) {
    return {
      status: "pending_review",
      reason: "Possible Filipino or Taglish abusive language.",
      categories: ["abusive", "filipino_profanity"],
      score: 0.7,
      provider: "local-text-rules",
      metadata: { rule: "filipino_abusive_review", target, matched_term: abusiveTerm },
    };
  }

  return null;
}

function localTextModeration(target: TextModerationTarget, content: string): TextModerationDecision | null {
  const lower = content.toLowerCase();
  const urlCount = (lower.match(/https?:\/\/|www\./g) || []).length;
  const repeatedPhrases = lower.match(/\b(.{8,80})\b(?:\s+\1){2,}/);
  const suspiciousRepeats = /(.)\1{12,}/.test(lower);
  const severeHarm =
    /\b(kill yourself|kys|go die|i will kill|death threat|bomb threat|shoot up)\b/i.test(lower);
  const hateOrThreat =
    /\b(exterminate|genocide|wipe out|gas all|lynch)\b/i.test(lower);
  const abusive =
    /\b(stupid idiot|worthless|trash person|shut up loser|go hurt yourself)\b/i.test(lower);
  const scamOrMisinformation =
    /\b(guaranteed profit|double your money|free money now|miracle cure|send me your password|send your otp|fake charity|official giveaway)\b/i.test(lower);

  if (severeHarm) {
    return {
      status: "blocked",
      reason: "Severe harmful or threatening language detected.",
      categories: ["harmful", "abusive"],
      score: 0.98,
      provider: "local-text-rules",
      metadata: { rule: "severe_harm", target },
    };
  }

  if (hateOrThreat) {
    return {
      status: "blocked",
      reason: "Hateful or violent targeting language detected.",
      categories: ["hate", "violence"],
      score: 0.92,
      provider: "local-text-rules",
      metadata: { rule: "hate_or_threat", target },
    };
  }

  const filipinoProfanity = filipinoProfanityModeration(target, content);
  if (filipinoProfanity) return filipinoProfanity;

  if (urlCount >= 4 || repeatedPhrases || suspiciousRepeats) {
    return {
      status: "pending_review",
      reason: "Possible spam or repeated content.",
      categories: ["spam", "suspicious_repetition"],
      score: 0.72,
      provider: "local-text-rules",
      metadata: { rule: "spam_or_repetition", target, urlCount },
    };
  }

  if (abusive) {
    return {
      status: "pending_review",
      reason: "Potentially abusive language.",
      categories: ["abusive"],
      score: 0.62,
      provider: "local-text-rules",
      metadata: { rule: "abusive_phrase", target },
    };
  }

  if (scamOrMisinformation) {
    return {
      status: "pending_review",
      reason: "Possible scam, fake information, or misleading claim.",
      categories: ["spam", "misinformation"],
      score: 0.68,
      provider: "local-text-rules",
      metadata: { rule: "scam_or_misinformation", target },
    };
  }

  return null;
}

function moderationUnavailableDecision(
  target: TextModerationTarget,
  metadata: Record<string, any>,
): TextModerationDecision {
  const label = moderationTargetLabel(target);
  return {
    status: "pending_review",
    reason: `${label} needs review because AI moderation is temporarily unavailable.`,
    categories: ["ai_moderation_unavailable"],
    score: null,
    provider: "groq-unavailable",
    metadata,
  };
}

function normalizeModerationStatus(value: unknown): TextModerationStatus {
  const rawStatus = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (rawStatus === "approved" || rawStatus === "allow" || rawStatus === "allowed" || rawStatus === "safe") {
    return "approved";
  }
  if (rawStatus === "blocked" || rawStatus === "block" || rawStatus === "unsafe") {
    return "blocked";
  }
  return "pending_review";
}

async function moderateTextWithGroq(
  target: TextModerationTarget,
  content: string,
  context: Record<string, unknown> = {},
): Promise<TextModerationDecision> {
  const localDecision = localTextModeration(target, content);
  if (localDecision?.status === "blocked") return localDecision;

  const apiKey = Deno.env.get("GROQ_API_KEY")?.trim();
  if (!apiKey) {
    return localDecision || moderationUnavailableDecision(target, { missingApiKey: true });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const label = moderationTargetLabel(target).toLowerCase();

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_TEXT_MODERATION_MODEL,
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Moderate MusikaLokal social feed posts and comments. Check whether the content is safe, respectful, truthful enough to publish, and valid community content. Evaluate English, Filipino, Tagalog, Taglish, Bisaya/Cebuano, and code-switched Philippine slang, including profanity hidden with spaces, punctuation, repeated letters, or leetspeak. Block violence, threats, self-harm encouragement, hate speech, harassment, Filipino bad words used as abuse, inappropriate sexual content, spam, scams, impersonation, and clearly fake or harmful misinformation. Put uncertain cases in pending_review. Return JSON only with status approved, pending_review, or blocked; reason; categories array; score 0 to 1.",
          },
          {
            role: "user",
            content: JSON.stringify({
              target,
              [label]: content,
              context,
              policy:
                "Approve normal music, booking, community, and casual conversation. Block unsafe or abusive content, including Filipino or Taglish profanity aimed at another person. Do not block mild criticism or harmless opinions. Treat repeated links, scams, fake urgent claims, and impersonation as spam or misinformation.",
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return localDecision || moderationUnavailableDecision(target, {
        groqStatus: response.status,
        groqBody: await response.text().catch(() => ""),
      });
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content || "{}";
    const parsed = parseJsonObject(raw) || {};
    const rawStatus = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "pending_review";
    const status = normalizeModerationStatus(rawStatus);

    if (localDecision && localDecision.status === "pending_review" && status === "approved") {
      return localDecision;
    }

    return {
      status,
      reason: typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 500)
        : status === "approved"
          ? `${moderationTargetLabel(target)} passed moderation.`
          : `${moderationTargetLabel(target)} needs moderation review.`,
      categories: normalizeStringArray(parsed.categories),
      score: Number.isFinite(Number(parsed.score)) ? Math.max(0, Math.min(1, Number(parsed.score))) : null,
      provider: `groq:${GROQ_TEXT_MODERATION_MODEL}`,
      metadata: { model: GROQ_TEXT_MODERATION_MODEL, raw_status: rawStatus, target },
    };
  } catch (error: any) {
    return localDecision || moderationUnavailableDecision(target, { groqError: error?.message || "unknown" });
  } finally {
    clearTimeout(timeout);
  }
}

async function moderateCommentWithGroq(content: string, postContent?: string | null): Promise<TextModerationDecision> {
  return moderateTextWithGroq("comment", content, {
    post_excerpt: (postContent || "").slice(0, 800),
  });
}

async function moderatePostWithGroq(content: string): Promise<TextModerationDecision> {
  return moderateTextWithGroq("post", content);
}

function textModerationResponse(target: TextModerationTarget, moderation: TextModerationDecision) {
  const label = moderationTargetLabel(target);
  const pendingReview = moderation.status === "pending_review";
  return jsonResponse({
    success: false,
    allowed: false,
    blocked: moderation.status === "blocked",
    pending_review: pendingReview,
    status: moderation.status,
    moderation,
    error: pendingReview
      ? `${label} needs moderation review before it can be published.`
      : `${label} blocked by safety moderation.`,
  });
}

async function insertNotification(
  supabaseAdmin: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, any>;
  },
) {
  await supabaseAdmin.from("notifications").insert({
    ...payload,
    meta: withNotificationRouteMeta(payload.meta),
    read: false,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = extractAccessToken(authHeader);

    if (!accessToken) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server misconfiguration" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { action, ...params } = await req.json();
    const isPublicLiteFeed =
      action === "get_feed" &&
      params?.feed_type !== "following" &&
      params?.personalize === false;
    let uid = "";

    if (!isPublicLiteFeed) {
      const {
        data: { user: authUser },
        error: authErr,
      } = await supabaseAdmin.auth.getUser(accessToken);

      if (authErr || !authUser) {
        return jsonResponse({ error: "Invalid token" }, 401);
      }

      uid = authUser.id;
    }

    let requesterProfile: any | null | undefined;
    const getRequesterProfile = async () => {
      if (!uid) return null;
      if (requesterProfile !== undefined) return requesterProfile;
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("id, role, full_name, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      requesterProfile = data || null;
      return requesterProfile;
    };
    const getRequesterRole = async () => normalizeRole((await getRequesterProfile())?.role);

    // ── follow ──────────────────────────────────────────────────────
    if (action === "follow") {
      const { target_id } = params;
      const targetType = normalizeFollowTargetType(params?.target_type);
      if (!target_id) return jsonResponse({ error: "target_id is required" }, 400);

      let notificationUserId: string | null = null;
      let notificationTitle = "New Follower";
      let notificationMessage = "";
      let activityTargetUserId: string | null = null;
      let activityMetadata: Record<string, any> = { followed_type: targetType };

      if (targetType === "profile") {
        if (target_id === uid) return jsonResponse({ error: "Cannot follow yourself" }, 400);

        const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", target_id)
          .single();

        if (targetProfileError || !targetProfile) {
          return jsonResponse({ error: "Profile not found" }, 404);
        }

        notificationUserId = target_id;
        activityTargetUserId = target_id;
      } else {
        const { data: targetGroup, error: targetGroupError } = await supabaseAdmin
          .from("groups")
          .select("id, name, owner_id, group_type")
          .eq("id", target_id)
          .single();

        if (targetGroupError || !targetGroup) {
          return jsonResponse({ error: "Group not found" }, 404);
        }

        if (targetGroup.owner_id === uid) {
          return jsonResponse({ error: "Cannot follow your own group" }, 400);
        }

        notificationUserId = targetGroup.owner_id || null;
        notificationTitle = "New Group Follower";
        notificationMessage = `started following ${targetGroup.name || "your group"}`;
        activityTargetUserId = targetGroup.owner_id || null;
        activityMetadata = {
          ...activityMetadata,
          group_id: targetGroup.id,
          group_type: targetGroup.group_type || null,
        };
      }

      const { data, error } = await supabaseAdmin
        .from("follows")
        .insert({ follower_id: uid, followed_id: target_id, followed_type: targetType })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") return jsonResponse({ error: "Already following" }, 409);
        return jsonResponse({ error: error.message }, 500);
      }

      const { data: follower } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();

      if (notificationUserId) {
        await insertNotification(supabaseAdmin, {
          user_id: notificationUserId,
          type: "follow",
          title: notificationTitle,
          message:
            targetType === "profile"
              ? `${follower?.full_name || "Someone"} started following you`
              : `${follower?.full_name || "Someone"} ${notificationMessage}`,
          image: follower?.avatar_url || null,
          meta: { event_type: "follow", follower_id: uid, ...activityMetadata },
        });
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "follow",
        actor_id: uid,
        target_user_id: activityTargetUserId,
        metadata: activityMetadata,
      });

      return jsonResponse({ success: true, data });
    }

    // ── unfollow ────────────────────────────────────────────────────
    if (action === "unfollow") {
      const { target_id } = params;
      const targetType = normalizeFollowTargetType(params?.target_type);
      if (!target_id) return jsonResponse({ error: "target_id is required" }, 400);

      let activityTargetUserId: string | null = null;
      const activityMetadata: Record<string, any> = { followed_type: targetType };

      if (targetType === "group") {
        const { data: targetGroup } = await supabaseAdmin
          .from("groups")
          .select("id, owner_id, group_type")
          .eq("id", target_id)
          .maybeSingle();

        activityTargetUserId = targetGroup?.owner_id || null;
        if (targetGroup?.id) {
          activityMetadata.group_id = targetGroup.id;
          activityMetadata.group_type = targetGroup.group_type || null;
        }
      } else {
        activityTargetUserId = target_id;
      }

      const { error } = await supabaseAdmin
        .from("follows")
        .delete()
        .eq("follower_id", uid)
        .eq("followed_id", target_id)
        .eq("followed_type", targetType);

      if (error) return jsonResponse({ error: error.message }, 500);

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "unfollow",
        actor_id: uid,
        target_user_id: activityTargetUserId,
        metadata: activityMetadata,
      });

      return jsonResponse({ success: true });
    }

    // ── get_follow_status ───────────────────────────────────────────
    if (action === "get_follow_status") {
      const { target_id } = params;
      const targetType = normalizeFollowTargetType(params?.target_type);
      if (!target_id) return jsonResponse({ error: "target_id is required" }, 400);

      const { data: followRow } = await supabaseAdmin
        .from("follows")
        .select("id")
        .eq("follower_id", uid)
        .eq("followed_id", target_id)
        .eq("followed_type", targetType)
        .maybeSingle();

      const { count: followerCount } = await supabaseAdmin
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("followed_id", target_id)
        .eq("followed_type", targetType);

      const { count: followingCount } = targetType === "profile"
        ? await supabaseAdmin
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("follower_id", target_id)
        : { count: 0 };

      return jsonResponse({
        success: true,
        data: {
          is_following: !!followRow,
          follower_count: followerCount || 0,
          following_count: followingCount || 0,
        },
      });
    }

    // ── create_post ─────────────────────────────────────────────────
    if (action === "create_post") {
      const { content, post_type, visibility, linked_playlist_id, linked_product_id, media } = params;
      const role = await getRequesterRole();
      if (!POST_CREATOR_ROLES.has(role)) {
        return jsonResponse({ error: "Fans cannot create posts" }, 403);
      }

      const trimmedContent = normalizeContent(content);
      const normalizedMedia = normalizePostMediaInput(media, uid) as any;
      if (normalizedMedia.error) return jsonResponse({ error: normalizedMedia.error }, 400);

      if (!trimmedContent && normalizedMedia.rows.length === 0) {
        return jsonResponse({ error: "content or media is required" }, 400);
      }

      if (trimmedContent) {
        const moderation = await moderatePostWithGroq(trimmedContent);
        if (moderation.status !== "approved") {
          return textModerationResponse("post", moderation);
        }
      }

      const { data: post, error: postErr } = await supabaseAdmin
        .from("feed_posts")
        .insert({
          author_id: uid,
          content: trimmedContent || null,
          post_type: post_type || "text",
          visibility: normalizeVisibility(visibility),
          linked_playlist_id: linked_playlist_id || null,
          linked_product_id: linked_product_id || null,
        })
        .select()
        .single();

      if (postErr) return jsonResponse({ error: postErr.message }, 500);

      if (normalizedMedia.rows.length > 0) {
        const mediaRows = normalizedMedia.rows.map((m: any) => ({
          post_id: post.id,
          ...m,
        }));
        const { error: mediaErr } = await supabaseAdmin.from("post_media").insert(mediaRows);
        if (mediaErr) {
          await supabaseAdmin.from("feed_posts").delete().eq("id", post.id);
          return jsonResponse({ error: mediaErr.message }, 500);
        }
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_created",
        actor_id: uid,
        post_id: post.id,
      });

      const { data: createdPost } = await supabaseAdmin
        .from("feed_posts")
        .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
        .eq("id", post.id)
        .single();

      return jsonResponse({ success: true, data: createdPost || post });
    }

    // ── update_post ─────────────────────────────────────────────────
    if (action === "update_post") {
      const { post_id, content, visibility, is_pinned, media } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("feed_posts")
        .select("author_id")
        .eq("id", post_id)
        .single();

      if (!existing) return jsonResponse({ error: "Post not found" }, 404);
      if (existing.author_id !== uid) return jsonResponse({ error: "Forbidden" }, 403);

      let mediaRows: Record<string, any>[] | null = null;
      if (media !== undefined) {
        const normalizedMedia = normalizePostMediaInput(media, uid) as any;
        if (normalizedMedia.error) return jsonResponse({ error: normalizedMedia.error }, 400);
        mediaRows = normalizedMedia.rows || [];
      }

      const nextContent = content !== undefined ? normalizeContent(content) : undefined;
      if (nextContent) {
        const moderation = await moderatePostWithGroq(nextContent);
        if (moderation.status !== "approved") {
          return textModerationResponse("post", moderation);
        }
      }

      const patch: Record<string, any> = {};
      if (content !== undefined) patch.content = nextContent || null;
      if (visibility !== undefined) patch.visibility = normalizeVisibility(visibility);
      if (is_pinned !== undefined) patch.is_pinned = is_pinned;

      const { data, error } = await supabaseAdmin
        .from("feed_posts")
        .update(patch)
        .eq("id", post_id)
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);
      if (mediaRows) {
        const { error: deleteMediaErr } = await supabaseAdmin.from("post_media").delete().eq("post_id", post_id);
        if (deleteMediaErr) return jsonResponse({ error: deleteMediaErr.message }, 500);
        if (mediaRows.length > 0) {
          const { error: mediaErr } = await supabaseAdmin
            .from("post_media")
            .insert(mediaRows.map((row) => ({ post_id, ...row })));
          if (mediaErr) return jsonResponse({ error: mediaErr.message }, 500);
        }
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_updated",
        actor_id: uid,
        post_id,
      });

      const { data: updatedPost } = await supabaseAdmin
        .from("feed_posts")
        .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
        .eq("id", post_id)
        .single();

      return jsonResponse({ success: true, data: updatedPost || data });
    }

    // ── delete_post ─────────────────────────────────────────────────
    if (action === "delete_post") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("feed_posts")
        .select("author_id")
        .eq("id", post_id)
        .single();

      if (!existing) return jsonResponse({ error: "Post not found" }, 404);
      if (existing.author_id !== uid) {
        if ((await getRequesterRole()) !== "admin") return jsonResponse({ error: "Forbidden" }, 403);
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_deleted",
        actor_id: uid,
        post_id,
      });

      const { error } = await supabaseAdmin.from("feed_posts").delete().eq("id", post_id);
      if (error) return jsonResponse({ error: error.message }, 500);

      return jsonResponse({ success: true });
    }

    // ── get_feed ────────────────────────────────────────────────────
    if (action === "get_feed") {
      const feedStartedAt = performance.now();
      const { limit: lim, offset, feed_type, cursor } = params;
      const pageSize = Math.min(Number(lim) || 20, 50);
      const pageOffset = Number(offset) || 0;
      const shouldPersonalize = params?.personalize !== false && Boolean(uid);
      const includeEntityCards = params?.include_entities === true;
      const feedPostSelect =
        "id, author_id, post_type, content, visibility, is_pinned, linked_playlist_id, linked_product_id, reaction_count, comment_count, share_count, created_at, updated_at, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(id, post_id, media_type, storage_path, thumbnail_path, is_cover, mime_type, width, height, duration_seconds, display_order, safety_status, safety_metadata)";
      const cursorCreatedAt =
        typeof cursor === "string" && cursor.trim().length > 0
          ? cursor.trim()
          : null;

      const sourceLimit =
        params.cursor !== undefined ? pageSize + 1 : pageOffset + pageSize + 1;
      const withCursorAndLimit = (query: any) => {
        const ordered = query.order("created_at", { ascending: false });
        return (cursorCreatedAt ? ordered.lt("created_at", cursorCreatedAt) : ordered)
          .limit(sourceLimit);
      };
      const emptyResult = () => Promise.resolve({ data: [], error: null });
      const resultRows = (result: any) => Array.isArray(result?.data) ? result.data : [];
      const getSortTime = (item: any) => {
        const value = typeof item?.created_at === "string" ? item.created_at : "";
        const time = value ? Date.parse(value) : 0;
        return Number.isFinite(time) ? time : 0;
      };
      const dedupeMixedFeedItems = (items: any[]) => {
        const seen = new Set<string>();

        return items.filter((item) => {
          const kind = item?.__feedKind === "ai_card" ? "card" : "post";
          const type = typeof item?.type === "string" ? item.type : "item";
          const id = typeof item?.id === "string" ? item.id : "";
          const key = id ? `${kind}:${type}:${id}` : "";
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };
      const normalizePostFeedItem = (post: any) => ({
        ...post,
        social_follow_target_id: post?.author_id || null,
        social_follow_target_type: "profile",
      });
      const normalizeGroupFeedCard = (item: any) => {
        const images = Array.isArray(item?.images) ? item.images : [];
        return {
          __feedKind: "ai_card",
          id: item?.id,
          type: "Group",
          name: item?.name || "Unnamed Group",
          image: images[0] || null,
          images,
          rating: Number(item?.rating || 0),
          review_count: Number(item?.review_count || 0),
          location: item?.location || "",
          latitude: item?.latitude ?? null,
          longitude: item?.longitude ?? null,
          genre: item?.genre || "",
          group_type: item?.group_type || null,
          description: item?.description || "Newly created group on MusikaLokal.",
          created_at: item?.created_at || null,
          updated_at: item?.updated_at || null,
          owner_id: item?.owner_id || null,
          social_follow_target_id: item?.id || null,
          social_follow_target_type: "group",
        };
      };
      const normalizeStudioFeedCard = (item: any) => {
        const images = Array.isArray(item?.images) ? item.images : [];
        return {
          __feedKind: "ai_card",
          id: item?.id,
          type: "Studio",
          name: item?.name || "Unnamed Studio",
          image: images[0] || null,
          images,
          rating: Number(item?.rating || 0),
          review_count: Number(item?.review_count || 0),
          location: item?.address || item?.location || "",
          latitude: item?.latitude ?? null,
          longitude: item?.longitude ?? null,
          genre: item?.type || "Studio",
          description: item?.description || "Newly created studio on MusikaLokal.",
          created_at: item?.created_at || null,
          updated_at: item?.updated_at || null,
          owner_id: item?.owner_id || null,
          hourly_rate: item?.hourly_rate?.toString?.() || null,
          rehearsal_rate: item?.rehearsal_rate?.toString?.() || null,
          recording_rate: item?.recording_rate?.toString?.() || null,
          studio_type: item?.type || null,
          social_follow_target_id: item?.owner_id || null,
          social_follow_target_type: "profile",
        };
      };
      const normalizeVenueFeedCard = (item: any) => {
        const images = Array.isArray(item?.images) ? item.images : [];
        const requirements = item?.requirements || {};
        return {
          __feedKind: "ai_card",
          id: item?.id,
          type: "Gig",
          name: item?.name || "Untitled Venue",
          image: images[0] || null,
          images,
          rating: Number(item?.rating || 0),
          review_count: Number(item?.review_count || 0),
          location: item?.location || "",
          latitude: item?.latitude ?? null,
          longitude: item?.longitude ?? null,
          genre: Array.isArray(requirements?.genres)
            ? requirements.genres.join(", ")
            : requirements?.genre || "",
          description: item?.description || "Newly created venue listing on MusikaLokal.",
          created_at: item?.created_at || null,
          updated_at: item?.updated_at || null,
          organizer_id: item?.organizer_id || null,
          budget: item?.budget?.toString?.() || null,
          rate: item?.rate?.toString?.() || null,
          requirements,
          social_follow_target_id: item?.organizer_id || null,
          social_follow_target_type: "profile",
        };
      };
      const normalizeArtistFeedCard = (item: any) => ({
        __feedKind: "ai_card",
        id: item?.id,
        type: "Artist",
        name: item?.full_name || "Musician",
        image: item?.avatar_url || null,
        images: item?.avatar_url ? [item.avatar_url] : [],
        rating: 0,
        review_count: 0,
        location: item?.address || item?.location || "",
        genre: "",
        description: "Newly joined musician on MusikaLokal.",
        created_at: item?.created_at || null,
        updated_at: item?.updated_at || null,
        owner_id: item?.id || null,
        social_follow_target_id: item?.id || null,
        social_follow_target_type: "profile",
      });
      const normalizeProductionFeedCard = (item: any) => ({
        __feedKind: "ai_card",
        id: item?.id,
        type: "Production",
        name: item?.name || "Production Team",
        image: item?.logo_url || null,
        images: item?.logo_url ? [item.logo_url] : [],
        rating: 0,
        review_count: 0,
        location: item?.description || "Production Team",
        genre: "",
        description: item?.description || "Newly created production team on MusikaLokal.",
        created_at: item?.created_at || null,
        updated_at: item?.updated_at || null,
        owner_id: item?.owner_id || null,
        logo_url: item?.logo_url || null,
        open_production_applications: item?.open_production_applications === true,
        social_follow_target_id: item?.owner_id || null,
        social_follow_target_type: "profile",
      });

      let mixedRows: any[] = [];
      let sourceHadExtra = false;
      let followingListMs = 0;
      if (feed_type === "following") {
        if (!uid) {
          return jsonResponse({ success: true, data: [], items: [], nextCursor: null });
        }

        const followingListStartedAt = performance.now();
        const { data: following, error: followingError } = await supabaseAdmin
          .from("follows")
          .select("followed_id, followed_type")
          .eq("follower_id", uid);
        followingListMs = Math.round(performance.now() - followingListStartedAt);

        if (followingError) return jsonResponse({ error: followingError.message }, 500);

        const followedProfileIds = Array.from(
          new Set(
            (following || [])
              .filter((row: any) => normalizeFollowTargetType(row?.followed_type) === "profile")
              .map((row: any) => row?.followed_id)
              .filter((value: any): value is string => typeof value === "string" && value.length > 0),
          ),
        );
        const followedGroupIds = Array.from(
          new Set(
            (following || [])
              .filter((row: any) => normalizeFollowTargetType(row?.followed_type) === "group")
              .map((row: any) => row?.followed_id)
              .filter((value: any): value is string => typeof value === "string" && value.length > 0),
          ),
        );

        if (includeEntityCards && followedProfileIds.length === 0 && followedGroupIds.length === 0) {
          return jsonResponse({ success: true, data: [], items: [], nextCursor: null });
        }

        const postAuthorIds = includeEntityCards
          ? followedProfileIds
          : Array.from(new Set([...followedProfileIds, uid].filter(Boolean)));
        let followedPostsQuery = supabaseAdmin
          .from("feed_posts")
          .select(feedPostSelect)
          .in("author_id", postAuthorIds)
          .eq("is_hidden", false);
        followedPostsQuery = includeEntityCards
          ? followedPostsQuery.in("visibility", ["public", "followers"])
          : followedPostsQuery.or(`visibility.in.(public,followers),author_id.eq.${uid}`);

        const [
          postsResult,
          artistsResult,
          groupsByOwnerResult,
          followedGroupsResult,
          studiosResult,
          venuesResult,
          productionTeamsResult,
        ] = await Promise.all([
          postAuthorIds.length > 0
            ? withCursorAndLimit(followedPostsQuery)
            : emptyResult(),
          includeEntityCards && followedProfileIds.length > 0
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("profiles")
                  .select("id, full_name, avatar_url, address, location, role, created_at")
                  .eq("role", "musician")
                  .in("id", followedProfileIds),
              )
            : emptyResult(),
          includeEntityCards && followedProfileIds.length > 0
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("groups_with_stats")
                  .select("*")
                  .in("owner_id", followedProfileIds),
              )
            : emptyResult(),
          includeEntityCards && followedGroupIds.length > 0
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("groups_with_stats")
                  .select("*")
                  .in("id", followedGroupIds),
              )
            : emptyResult(),
          includeEntityCards && followedProfileIds.length > 0
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("studios_with_stats")
                  .select("*")
                  .eq("permit_status", "approved")
                  .in("owner_id", followedProfileIds),
              )
            : emptyResult(),
          includeEntityCards && followedProfileIds.length > 0
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("gigs_with_stats")
                  .select("*")
                  .eq("status", "open")
                  .eq("permit_status", "approved")
                  .in("organizer_id", followedProfileIds),
              )
            : emptyResult(),
          includeEntityCards && followedProfileIds.length > 0
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("production_teams")
                  .select("*")
                  .in("owner_id", followedProfileIds),
              )
            : emptyResult(),
        ]);

        const sourceError = [
          postsResult,
          artistsResult,
          groupsByOwnerResult,
          followedGroupsResult,
          studiosResult,
          venuesResult,
          productionTeamsResult,
        ].find((result: any) => result?.error)?.error;
        if (sourceError) return jsonResponse({ error: sourceError.message }, 500);
        sourceHadExtra = [
          postsResult,
          artistsResult,
          groupsByOwnerResult,
          followedGroupsResult,
          studiosResult,
          venuesResult,
          productionTeamsResult,
        ].some((result: any) => resultRows(result).length >= sourceLimit);

        mixedRows = [
          ...resultRows(postsResult).map(normalizePostFeedItem),
          ...resultRows(artistsResult).map(normalizeArtistFeedCard),
          ...resultRows(groupsByOwnerResult).map(normalizeGroupFeedCard),
          ...resultRows(followedGroupsResult).map(normalizeGroupFeedCard),
          ...resultRows(studiosResult).map(normalizeStudioFeedCard),
          ...resultRows(venuesResult).map(normalizeVenueFeedCard),
          ...resultRows(productionTeamsResult).map(normalizeProductionFeedCard),
        ];
      } else {
        let artistsQuery = supabaseAdmin
          .from("profiles")
          .select("id, full_name, avatar_url, address, location, role, created_at")
          .eq("role", "musician");
        if (uid) {
          artistsQuery = artistsQuery.neq("id", uid);
        }

        const [
          postsResult,
          artistsResult,
          groupsResult,
          studiosResult,
          venuesResult,
          productionTeamsResult,
        ] = await Promise.all([
          withCursorAndLimit(
            supabaseAdmin
              .from("feed_posts")
              .select(feedPostSelect)
              .eq("visibility", "public")
              .eq("is_hidden", false),
          ),
          includeEntityCards ? withCursorAndLimit(artistsQuery) : emptyResult(),
          includeEntityCards
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("groups_with_stats")
                  .select("*"),
              )
            : emptyResult(),
          includeEntityCards
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("studios_with_stats")
                  .select("*")
                  .eq("permit_status", "approved"),
              )
            : emptyResult(),
          includeEntityCards
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("gigs_with_stats")
                  .select("*")
                  .eq("status", "open")
                  .eq("permit_status", "approved"),
              )
            : emptyResult(),
          includeEntityCards
            ? withCursorAndLimit(
                supabaseAdmin
                  .from("production_teams")
                  .select("*"),
              )
            : emptyResult(),
        ]);

        const sourceError = [
          postsResult,
          artistsResult,
          groupsResult,
          studiosResult,
          venuesResult,
          productionTeamsResult,
        ].find((result: any) => result?.error)?.error;
        if (sourceError) return jsonResponse({ error: sourceError.message }, 500);
        sourceHadExtra = [
          postsResult,
          artistsResult,
          groupsResult,
          studiosResult,
          venuesResult,
          productionTeamsResult,
        ].some((result: any) => resultRows(result).length >= sourceLimit);

        mixedRows = [
          ...resultRows(postsResult).map(normalizePostFeedItem),
          ...resultRows(artistsResult).map(normalizeArtistFeedCard),
          ...resultRows(groupsResult).map(normalizeGroupFeedCard),
          ...resultRows(studiosResult).map(normalizeStudioFeedCard),
          ...resultRows(venuesResult).map(normalizeVenueFeedCard),
          ...resultRows(productionTeamsResult).map(normalizeProductionFeedCard),
        ];
      }

      const postsMs = Math.round(performance.now() - feedStartedAt);
      const rows = dedupeMixedFeedItems(mixedRows)
        .sort((a, b) => getSortTime(b) - getSortTime(a));
      const pageRows = params.cursor !== undefined
        ? rows.slice(0, pageSize)
        : rows.slice(pageOffset, pageOffset + pageSize);
      const nextCursor =
        params.cursor !== undefined && (rows.length > pageSize || sourceHadExtra)
          ? pageRows[pageRows.length - 1]?.created_at || null
          : null;

      const enrichmentStartedAt = performance.now();
      // Fetch user's reactions and follow state for these mixed feed items.
      const postRows = pageRows.filter((p: any) => p?.__feedKind !== "ai_card");
      const postIds = postRows.map((p: any) => p.id);
      const profileTargetIds = Array.from(
        new Set(
          pageRows
            .map((p: any) =>
              p?.social_follow_target_type === "profile"
                ? p?.social_follow_target_id
                : p?.author_id,
            )
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );
      const groupTargetIds = Array.from(
        new Set(
          pageRows
            .filter((p: any) => p?.social_follow_target_type === "group")
            .map((p: any) => p?.social_follow_target_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const [userReactionsResult, followingProfileRowsResult, followingGroupRowsResult] = await Promise.all([
        shouldPersonalize && postIds.length > 0
          ? supabaseAdmin
              .from("post_reactions")
              .select("post_id, reaction_type")
              .eq("user_id", uid)
              .in("post_id", postIds)
          : Promise.resolve({ data: [] }),
        shouldPersonalize && profileTargetIds.length > 0
          ? supabaseAdmin
              .from("follows")
              .select("followed_id")
              .eq("follower_id", uid)
              .eq("followed_type", "profile")
              .in("followed_id", profileTargetIds)
          : Promise.resolve({ data: [] }),
        shouldPersonalize && groupTargetIds.length > 0
          ? supabaseAdmin
              .from("follows")
              .select("followed_id")
              .eq("follower_id", uid)
              .eq("followed_type", "group")
              .in("followed_id", groupTargetIds)
          : Promise.resolve({ data: [] }),
      ]);

      const reactionMap = new Map();
      for (const r of userReactionsResult.data || []) {
        reactionMap.set(r.post_id, r.reaction_type);
      }

      const followingProfileIds = new Set(
        (followingProfileRowsResult.data || []).map((row: any) => row?.followed_id).filter(Boolean),
      );
      const followingGroupIds = new Set(
        (followingGroupRowsResult.data || []).map((row: any) => row?.followed_id).filter(Boolean),
      );
      const enrichmentMs = Math.round(performance.now() - enrichmentStartedAt);

      const enriched = pageRows.map((p: any) => {
        const followTargetType = normalizeFollowTargetType(p?.social_follow_target_type);
        const followTargetId = p?.social_follow_target_id || p?.author_id || null;
        const isFollowing = followTargetType === "group"
          ? followingGroupIds.has(followTargetId)
          : followingProfileIds.has(followTargetId);

        if (p?.__feedKind === "ai_card") {
          return {
            ...p,
            is_following: isFollowing,
          };
        }

        return {
          ...p,
          user_reaction: reactionMap.get(p.id) || null,
          is_following: isFollowing,
          social_follow_target_id: p.author_id || null,
          social_follow_target_type: "profile",
        };
      });

      console.info("[LoadTime][Edge:manage-social-feed:get_feed] stages", {
        enrichmentMs,
        feedType: feed_type || "public",
        followingListMs,
        pageSize,
        postsMs,
        returned: enriched.length,
        totalMs: Math.round(performance.now() - feedStartedAt),
      });

      return jsonResponse({ success: true, data: enriched, items: enriched, nextCursor });
    }

    // ── get_post_details ────────────────────────────────────────────
    if (action === "get_post_details") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const { data: post, error: postErr } = await supabaseAdmin
        .from("feed_posts")
        .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
        .eq("id", post_id)
        .single();

      if (postErr || !post) return jsonResponse({ error: "Post not found" }, 404);
      const requesterRole = await getRequesterRole();
      if (!(await canViewPost(supabaseAdmin, post, uid, requesterRole))) {
        return jsonResponse({ error: "Post not found" }, 404);
      }

      let commentsResult = await supabaseAdmin
        .from("post_comments")
        .select("*, author:profiles!author_id(id, full_name, avatar_url)")
        .eq("post_id", post_id)
        .or("is_hidden.eq.false,is_hidden.is.null")
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: true });

      if (
        commentsResult.error &&
        (commentsResult.error.code === "42703" ||
          String(commentsResult.error.message || "").includes("moderation_status"))
      ) {
        commentsResult = await supabaseAdmin
          .from("post_comments")
          .select("*, author:profiles!author_id(id, full_name, avatar_url)")
          .eq("post_id", post_id)
          .or("is_hidden.eq.false,is_hidden.is.null")
          .order("created_at", { ascending: true });
      }

      if (commentsResult.error) {
        return jsonResponse({ error: commentsResult.error.message }, 500);
      }

      // User's reaction
      const { data: userReaction } = await supabaseAdmin
        .from("post_reactions")
        .select("reaction_type")
        .eq("post_id", post_id)
        .eq("user_id", uid)
        .maybeSingle();

      return jsonResponse({
        success: true,
        data: {
          ...post,
          comments: commentsResult.data || [],
          user_reaction: userReaction?.reaction_type || null,
        },
      });
    }

    // ── react_to_post ───────────────────────────────────────────────
    if (action === "react_to_post") {
      const { post_id, reaction_type } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const visiblePostResult: any = await getVisiblePostOrResponse(supabaseAdmin, post_id, uid, await getRequesterRole());
      if (visiblePostResult.response) return visiblePostResult.response;
      const visiblePost = visiblePostResult.post;
      const rType = reaction_type || "like";

      // Upsert: remove existing then insert
      await supabaseAdmin
        .from("post_reactions")
        .delete()
        .eq("post_id", post_id)
        .eq("user_id", uid);

      const { data, error } = await supabaseAdmin
        .from("post_reactions")
        .insert({ post_id, user_id: uid, reaction_type: rType })
        .select()
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      // Notify post author
      const post = visiblePost;
      if (post && post.author_id !== uid) {
        const { data: reactor } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();
        await insertNotification(supabaseAdmin, {
          user_id: post.author_id,
          type: "reaction",
          title: "New Reaction",
          message: `${reactor?.full_name || "Someone"} reacted to your post`,
          image: reactor?.avatar_url || null,
          meta: { event_type: "reaction_added", post_id },
        });
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "reaction_added",
        actor_id: uid,
        target_user_id: post?.author_id || null,
        post_id,
        metadata: { reaction_type: rType },
      });

      return jsonResponse({ success: true, data });
    }

    // ── remove_reaction ─────────────────────────────────────────────
    if (action === "remove_reaction") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const visiblePostResult: any = await getVisiblePostOrResponse(supabaseAdmin, post_id, uid, await getRequesterRole());
      if (visiblePostResult.response) return visiblePostResult.response;
      const { error } = await supabaseAdmin
        .from("post_reactions")
        .delete()
        .eq("post_id", post_id)
        .eq("user_id", uid);

      if (error) return jsonResponse({ error: error.message }, 500);
      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "reaction_removed",
        actor_id: uid,
        post_id,
      });
      return jsonResponse({ success: true });
    }

    // ── add_comment ─────────────────────────────────────────────────
    if (action === "share_post") {
      const { post_id } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);

      const visiblePostResult: any = await getVisiblePostOrResponse(supabaseAdmin, post_id, uid, await getRequesterRole());
      if (visiblePostResult.response) return visiblePostResult.response;
      const post = visiblePostResult.post;

      const { data: shareCount, error } = await supabaseAdmin.rpc("increment_post_share_count", {
        p_post_id: post_id,
      });

      if (error) return jsonResponse({ error: error.message }, 500);

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_shared",
        actor_id: uid,
        target_user_id: post?.author_id || null,
        post_id,
      });

      return jsonResponse({ success: true, data: { post_id, share_count: shareCount || 0 } });
    }

    if (action === "add_comment") {
      const { post_id, content, parent_comment_id } = params;
      const trimmedContent = normalizeContent(content);
      if (!post_id || !trimmedContent) return jsonResponse({ error: "post_id and content are required" }, 400);

      const visiblePostResult: any = await getVisiblePostOrResponse(supabaseAdmin, post_id, uid, await getRequesterRole());
      if (visiblePostResult.response) return visiblePostResult.response;
      const post = visiblePostResult.post;

      if (parent_comment_id) {
        const { data: parentComment } = await supabaseAdmin
          .from("post_comments")
          .select("id")
          .eq("id", parent_comment_id)
          .eq("post_id", post_id)
          .eq("is_hidden", false)
          .eq("moderation_status", "approved")
          .maybeSingle();
        if (!parentComment) return jsonResponse({ error: "Parent comment not found" }, 404);
      }

      const moderation = await moderateCommentWithGroq(trimmedContent, post?.content);
      if (moderation.status === "blocked") {
        await supabaseAdmin.from("social_activity_events").insert({
          event_type: "comment_moderation_blocked",
          actor_id: uid,
          target_user_id: post?.author_id || null,
          post_id,
          metadata: {
            moderation_reason: moderation.reason,
            moderation_categories: moderation.categories,
            moderation_provider: moderation.provider,
          },
        });

        return jsonResponse({
          success: false,
          allowed: false,
          blocked: true,
          status: "blocked",
          moderation,
          error: "Comment blocked by safety moderation.",
        });
      }

      const pendingReview = moderation.status === "pending_review";

      const { data: comment, error } = await supabaseAdmin
        .from("post_comments")
        .insert({
          post_id,
          author_id: uid,
          content: trimmedContent,
          parent_comment_id: parent_comment_id || null,
          is_hidden: pendingReview,
          moderation_status: moderation.status,
          moderation_reason: moderation.reason,
          moderation_categories: moderation.categories,
          moderation_score: moderation.score,
          moderation_provider: moderation.provider,
          moderated_at: new Date().toISOString(),
          moderation_metadata: moderation.metadata,
        })
        .select("*, author:profiles!author_id(id, full_name, avatar_url)")
        .single();

      if (error) return jsonResponse({ error: error.message }, 500);

      if (pendingReview) {
        await supabaseAdmin.from("social_activity_events").insert({
          event_type: "comment_moderation_review",
          actor_id: uid,
          target_user_id: post?.author_id || null,
          post_id,
          comment_id: comment.id,
          metadata: {
            moderation_reason: moderation.reason,
            moderation_categories: moderation.categories,
            moderation_provider: moderation.provider,
          },
        });

        return jsonResponse({
          success: true,
          allowed: false,
          pending_review: true,
          status: "pending_review",
          data: comment,
          moderation,
        });
      }

      if (post && post.author_id !== uid) {
        const { data: commenter } = await supabaseAdmin.from("profiles").select("full_name, avatar_url").eq("id", uid).single();
        await insertNotification(supabaseAdmin, {
          user_id: post.author_id,
          type: "comment",
          title: "New Comment",
          message: `${commenter?.full_name || "Someone"} commented on your post`,
          image: commenter?.avatar_url || null,
          meta: { event_type: "comment_added", post_id, comment_id: comment.id },
        });
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "comment_added",
        actor_id: uid,
        target_user_id: post?.author_id || null,
        post_id,
        comment_id: comment.id,
      });

      return jsonResponse({
        success: true,
        allowed: true,
        status: "approved",
        data: comment,
        moderation,
      });
    }

    // ── delete_comment ──────────────────────────────────────────────
    if (action === "delete_comment") {
      const { comment_id } = params;
      if (!comment_id) return jsonResponse({ error: "comment_id is required" }, 400);

      const { data: existing } = await supabaseAdmin
        .from("post_comments")
        .select("author_id, post_id")
        .eq("id", comment_id)
        .single();

      if (!existing) return jsonResponse({ error: "Comment not found" }, 404);
      if (existing.author_id !== uid) {
        if ((await getRequesterRole()) !== "admin") return jsonResponse({ error: "Forbidden" }, 403);
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "comment_deleted",
        actor_id: uid,
        post_id: existing.post_id || null,
        comment_id,
      });

      const { error } = await supabaseAdmin.from("post_comments").delete().eq("id", comment_id);
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    // ── report_post ─────────────────────────────────────────────────
    if (action === "report_post") {
      const { post_id, reason, details } = params;
      if (!post_id) return jsonResponse({ error: "post_id is required" }, 400);
      const normalizedReason =
        typeof reason === "string" && reason.trim()
          ? reason.trim().slice(0, 180)
          : "Inappropriate content";
      const normalizedDetails =
        typeof details === "string" && details.trim()
          ? details.trim().slice(0, 1000)
          : null;

      await supabaseAdmin
        .from("feed_posts")
        .update({ is_reported: true })
        .eq("id", post_id);

      const { data: existingPendingReport, error: existingPendingReportError } = await supabaseAdmin
        .from("reports")
        .select("id")
        .eq("reporter_id", uid)
        .eq("target_type", "feed_post")
        .eq("target_id", post_id)
        .eq("reason", normalizedReason)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

      if (existingPendingReportError) {
        return jsonResponse({ error: existingPendingReportError.message }, 500);
      }

      if (existingPendingReport?.id) {
        return jsonResponse({
          success: true,
          already_reported: true,
          report_id: existingPendingReport.id,
        });
      }

      // Insert into existing reports table
      const { error: reportInsertError } = await supabaseAdmin.from("reports").insert({
        reporter_id: uid,
        target_type: "feed_post",
        target_id: post_id,
        reason: normalizedReason,
        details: normalizedDetails,
        status: "pending",
      });

      if (reportInsertError) {
        return jsonResponse({ error: reportInsertError.message }, 500);
      }

      await supabaseAdmin.from("social_activity_events").insert({
        event_type: "post_reported",
        actor_id: uid,
        post_id,
        metadata: { reason: normalizedReason, details: normalizedDetails },
      });

      return jsonResponse({ success: true });
    }

    // ── get_user_posts ──────────────────────────────────────────────
    if (action === "get_user_posts") {
      const { target_user_id, limit: lim, offset } = params;
      if (!target_user_id) return jsonResponse({ error: "target_user_id is required" }, 400);

      const pageSize = Math.min(Number(lim) || 20, 50);
      const pageOffset = Number(offset) || 0;
      const requesterRole = await getRequesterRole();
      const isOwnerOrAdmin = uid === target_user_id || requesterRole === "admin";
      let canSeeFollowerPosts = isOwnerOrAdmin;

      if (!canSeeFollowerPosts && uid) {
        const { data: followRow } = await supabaseAdmin
          .from("follows")
          .select("id")
          .eq("follower_id", uid)
          .eq("followed_id", target_user_id)
          .eq("followed_type", "profile")
          .maybeSingle();
        canSeeFollowerPosts = Boolean(followRow?.id);
      }

      let query = supabaseAdmin
        .from("feed_posts")
        .select("*, author:profiles!author_id(id, full_name, avatar_url, role), media:post_media(*)")
        .eq("author_id", target_user_id)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false });

      if (!isOwnerOrAdmin) {
        query = canSeeFollowerPosts
          ? query.in("visibility", ["public", "followers"])
          : query.eq("visibility", "public");
      }

      const { data, error } = await query.range(pageOffset, pageOffset + pageSize - 1);

      if (error) return jsonResponse({ error: error.message }, 500);

      const postIds = (data || []).map((post: any) => post.id);
      const { data: reactions } = uid && postIds.length > 0
        ? await supabaseAdmin
            .from("post_reactions")
            .select("post_id, reaction_type")
            .eq("user_id", uid)
            .in("post_id", postIds)
        : { data: [] };
      const reactionMap = new Map((reactions || []).map((reaction: any) => [reaction.post_id, reaction.reaction_type]));

      const enriched = (data || []).map((post: any) => ({
        ...post,
        user_reaction: reactionMap.get(post.id) || null,
      }));

      return jsonResponse({ success: true, data: enriched });
    }

    // ── get_followers / get_following ────────────────────────────────
    if (action === "get_followers") {
      const targetType = normalizeFollowTargetType(params?.target_type);
      const targetId = params?.target_user_id || params?.target_id || uid;

      const { data: rows, error } = await supabaseAdmin
        .from("follows")
        .select("*")
        .eq("followed_id", targetId)
        .eq("followed_type", targetType)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const followerIds = Array.from(
        new Set(
          (rows || [])
            .map((row: any) => row?.follower_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const { data: followerProfiles } = followerIds.length > 0
        ? await supabaseAdmin
            .from("profiles")
            .select("id, full_name, avatar_url, role")
            .in("id", followerIds)
        : { data: [] };

      const followerById = new Map(
        (followerProfiles || []).map((profile: any) => [profile.id, profile]),
      );

      const enriched = (rows || []).map((row: any) => ({
        ...row,
        followed_type: normalizeFollowTargetType(row?.followed_type),
        follower: followerById.get(row?.follower_id) || null,
      }));

      return jsonResponse({ success: true, data: enriched });
    }

    if (action === "get_following") {
      const targetId = params?.target_user_id || params?.target_id || uid;

      const { data: rows, error } = await supabaseAdmin
        .from("follows")
        .select("*")
        .eq("follower_id", targetId)
        .order("created_at", { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);

      const followedProfileIds = Array.from(
        new Set(
          (rows || [])
            .filter((row: any) => normalizeFollowTargetType(row?.followed_type) === "profile")
            .map((row: any) => row?.followed_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const followedGroupIds = Array.from(
        new Set(
          (rows || [])
            .filter((row: any) => normalizeFollowTargetType(row?.followed_type) === "group")
            .map((row: any) => row?.followed_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      const [{ data: followedProfiles }, { data: followedGroups }] = await Promise.all([
        followedProfileIds.length > 0
          ? supabaseAdmin
              .from("profiles")
              .select("id, full_name, avatar_url, role")
              .in("id", followedProfileIds)
          : Promise.resolve({ data: [] }),
        followedGroupIds.length > 0
          ? supabaseAdmin
              .from("groups_with_stats")
              .select("id, name, images, group_type, genre, location, owner_id")
              .in("id", followedGroupIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileById = new Map(
        (followedProfiles || []).map((profile: any) => [profile.id, profile]),
      );
      const groupById = new Map(
        (followedGroups || []).map((group: any) => [group.id, group]),
      );

      const enriched = (rows || []).map((row: any) => {
        const followedType = normalizeFollowTargetType(row?.followed_type);

        return {
          ...row,
          followed_type: followedType,
          followed:
            followedType === "profile"
              ? profileById.get(row?.followed_id) || null
              : null,
          followed_group:
            followedType === "group"
              ? groupById.get(row?.followed_id) || null
              : null,
        };
      });

      return jsonResponse({ success: true, data: enriched });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("manage-social-feed error:", err);
    return jsonResponse({ error: err.message || "Internal server error" }, 500);
  }
});
