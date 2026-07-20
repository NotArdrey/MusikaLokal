// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deno environment
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// ─── Configuration ────────────────────────────────────────────────────────────

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")?.trim() || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")?.trim() || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")?.trim() || "";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const OPENAI_CHAT_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODERATION_API_URL = "https://api.openai.com/v1/moderations";
const ACRCLOUD_HOST = Deno.env.get("ACRCLOUD_HOST")?.trim() || "";
const ACRCLOUD_ACCESS_KEY = Deno.env.get("ACRCLOUD_ACCESS_KEY")?.trim() || "";
const ACRCLOUD_ACCESS_SECRET = Deno.env.get("ACRCLOUD_ACCESS_SECRET")?.trim() || "";
const ACRCLOUD_MIN_SCORE = Number(Deno.env.get("ACRCLOUD_MIN_SCORE") || "80");

const MAX_FILES_PER_REQUEST = 10;
const GROQ_VISION_MODEL = Deno.env.get("GROQ_VISION_MODEL")?.trim() || "qwen/qwen3.6-27b";
const GROQ_SAFETY_TEXT_MODEL = "openai/gpt-oss-safeguard-20b";
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_ACRCLOUD_AUDIO_SAMPLE_BYTES = 4 * 1024 * 1024;

// ─── Blocked extensions / MIME types ─────────────────────────────────────────
// (rule-based pre-screen before AI)

const BLOCKED_EXTENSIONS = new Set([
  // Executables
  "exe", "bat", "cmd", "com", "vbs", "vbe", "js", "jse", "wsf", "wsh",
  "scr", "pif", "reg", "msi", "msp",
  // Scripts
  "sh", "bash", "zsh", "fish", "ps1", "psm1", "psd1",
  // Web threats
  "php", "php3", "php4", "php5", "phtml", "asp", "aspx", "cgi", "pl", "py",
  "rb", "htaccess", "htpasswd",
  // Archives that may auto-exec
  "jar", "jnlp",
]);

const BLOCKED_MIME_PREFIXES = [
  "application/x-msdownload",
  "application/x-executable",
  "application/x-shellscript",
  "application/x-sh",
  "application/x-bat",
  "application/x-msdos-program",
];

// Known-safe MIME categories for photos, documents, and video uploads.
const SAFE_PHOTO_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

const SAFE_DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "text/plain",
  "application/rtf",
  "text/rtf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const SAFE_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-msvideo",
]);

const SAFE_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mpeg", "mpg"]);
const SAFE_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "rtf",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);
const SAFE_AUDIO_MIMES = new Set([
  "audio/mpeg",
  "audio/mp3",
]);
const SAFE_AUDIO_EXTENSIONS = new Set(["mp3"]);
const COPYRIGHT_MEDIA_MIMES = new Set([
  ...SAFE_AUDIO_MIMES,
  ...SAFE_VIDEO_MIMES,
  "audio/mp4",
  "audio/x-m4a",
]);
const COPYRIGHT_OWNERSHIP_REVIEW_SOURCE = "COPYRIGHT_OWNERSHIP";
const COPYRIGHT_OWNERSHIP_REVIEW_REASON = "COPYRIGHT_OWNERSHIP_REVIEW";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileCandidate {
  id?: string;
  fingerprint?: string;
  fileName?: string;
  mimeType?: string | null;
  fileSize?: number;
  kind?: "photo" | "document" | "video" | "audio";
  contentDataUrl?: string | null;
}

type ScreeningResult = {
  id: string;
  allowed: boolean;
  reason?: string;
  requiresAdminReview?: boolean;
  publiclyAvailable?: boolean;
  copyrightStatus?: "not_required" | "pending_review" | "approved" | "declined";
  copyrightReviewId?: string | null;
  copyrightTrackKey?: string | null;
  copyrightMetadata?: Record<string, unknown>;
};

type CopyrightScreeningContext = {
  supabaseAdmin?: any | null;
  user?: {
    id?: string | null;
    email?: string | null;
  } | null;
  context?: string;
};

// ─── Rule-based pre-screen ────────────────────────────────────────────────────

function extractExtension(fileName: string): string {
  const cleaned = (fileName || "").trim().toLowerCase().split("?")[0];
  const dotIndex = cleaned.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return cleaned.slice(dotIndex + 1);
}

function ruleBasedScreen(file: FileCandidate): { allowed: boolean; reason?: string } {
  const ext = extractExtension(file.fileName || "");

  if (ext && BLOCKED_EXTENSIONS.has(ext)) {
    return {
      allowed: false,
      reason: `Files of type .${ext} are not allowed for upload.`,
    };
  }

  const mime = (file.mimeType || "").toLowerCase();
  for (const prefix of BLOCKED_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) {
      return {
        allowed: false,
        reason: `Files with MIME type "${file.mimeType}" are not allowed for upload.`,
      };
    }
  }

  // Kind-specific MIME validation (only block if a conflicting MIME is explicitly set)
  if (file.kind === "photo" && mime && !mime.startsWith("image/")) {
    return {
      allowed: false,
      reason: "Photos must be valid image files (JPEG, PNG, WebP, etc.).",
    };
  }

  if (file.kind === "document") {
    if (ext && !SAFE_DOCUMENT_EXTENSIONS.has(ext)) {
      return {
        allowed: false,
        reason: `Documents of type .${ext} are not accepted. Please upload a PDF, Office document, CSV, TXT, RTF, or image.`,
      };
    }

    if (mime && !SAFE_DOCUMENT_MIMES.has(mime) && !mime.startsWith("image/")) {
      return {
        allowed: false,
        reason: `Documents of type "${file.mimeType}" are not accepted. Please upload a PDF, Office document, CSV, TXT, RTF, or image.`,
      };
    }
  }

  if (file.kind === "video") {
    if (ext && !SAFE_VIDEO_EXTENSIONS.has(ext)) {
      return {
        allowed: false,
        reason: `Videos of type .${ext} are not accepted. Please upload MP4, MOV, or WebM video.`,
      };
    }

    if (mime && !SAFE_VIDEO_MIMES.has(mime)) {
      return {
        allowed: false,
        reason: `Videos of type "${file.mimeType}" are not accepted. Please upload MP4, MOV, or WebM video.`,
      };
    }
  }

  if (file.kind === "audio") {
    if (ext && !SAFE_AUDIO_EXTENSIONS.has(ext)) {
      return {
        allowed: false,
        reason: `Audio files of type .${ext} are not accepted. Please upload an MP3 audio file.`,
      };
    }

    if (mime && !SAFE_AUDIO_MIMES.has(mime)) {
      return {
        allowed: false,
        reason: `Audio files of type "${file.mimeType}" are not accepted. Please upload an MP3 audio file.`,
      };
    }
  }

  return { allowed: true };
}

function estimateBase64Bytes(base64Value: string): number {
  const normalized = base64Value.replace(/\s/g, "");
  let padding = 0;
  if (normalized.endsWith("==")) padding = 2;
  else if (normalized.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function normalizePhotoMimeType(value?: string | null): string {
  const mimeType = (value || "").trim().toLowerCase();
  if (mimeType === "image/jpg") return "image/jpeg";
  return mimeType;
}

function resolvePhotoMimeTypeFromExtension(fileName?: string): string {
  switch (extractExtension(fileName || "")) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "avif":
      return "image/avif";
    default:
      return "";
  }
}

function resolveScreeningImageMimeType(file: FileCandidate, declaredMimeType: string): string {
  const candidates = [
    declaredMimeType,
    file.mimeType || "",
    resolvePhotoMimeTypeFromExtension(file.fileName || ""),
  ];

  for (const candidate of candidates) {
    const mimeType = normalizePhotoMimeType(candidate);
    if (SAFE_PHOTO_MIMES.has(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

function parseImageDataUrl(
  file: FileCandidate,
): { dataUrl: string; mimeType: string; base64: string } | null {
  const raw = typeof file.contentDataUrl === "string" ? file.contentDataUrl.trim() : "";
  if (!raw) return null;

  const match = raw.match(/^data:([^;,]*);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("Image content must be sent as a base64 data URL.");
  }

  const mimeType = resolveScreeningImageMimeType(file, match[1]);
  const base64 = match[2].replace(/\s/g, "");
  if (!mimeType) {
    throw new Error("Photos must be valid image files (JPEG, PNG, WebP, etc.).");
  }

  if (estimateBase64Bytes(base64) > MAX_INLINE_IMAGE_BYTES) {
    throw new Error("Image is too large for safety screening. Please upload an image under 4 MB.");
  }

  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    base64,
  };
}

function base64ToUint8Array(base64Value: string): Uint8Array {
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function parseCopyrightMediaDataUrl(
  file: FileCandidate,
): { bytes: Uint8Array; mimeType: string; originalBytes: number; wasTruncated: boolean } | null {
  const raw = typeof file.contentDataUrl === "string" ? file.contentDataUrl.trim() : "";
  if (!raw) return null;

  const match = raw.match(/^data:((?:audio|video)\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("Copyright media must be sent as an audio or video base64 data URL.");
  }

  const mimeType = match[1].toLowerCase();
  if (!COPYRIGHT_MEDIA_MIMES.has(mimeType)) {
    throw new Error("Copyright screening supports MP3, MP4, MOV, M4V, WebM, AVI, and MPEG media.");
  }

  const base64 = match[2].replace(/\s/g, "");
  const bytes = base64ToUint8Array(base64);
  if (bytes.byteLength === 0) {
    throw new Error("Copyright media is empty. Please upload a valid audio or video file.");
  }

  const wasTruncated = bytes.byteLength > MAX_ACRCLOUD_AUDIO_SAMPLE_BYTES;

  return {
    bytes: wasTruncated ? bytes.slice(0, MAX_ACRCLOUD_AUDIO_SAMPLE_BYTES) : bytes,
    mimeType,
    originalBytes: bytes.byteLength,
    wasTruncated,
  };
}

async function createAcrCloudSignature(
  accessSecret: string,
  stringToSign: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(accessSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(stringToSign),
  );
  return bytesToBase64(new Uint8Array(signature));
}

function getAcrCloudIdentifyUrl(host: string): string {
  const trimmedHost = host.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmedHost)) {
    return `${trimmedHost}/v1/identify`;
  }
  return `https://${trimmedHost}/v1/identify`;
}

function maskSecretPreview(value: string): string {
  if (!value) return "missing";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function normalizeTrackKeyText(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAcrArtistNames(match: any): string[] {
  return Array.isArray(match?.artists)
    ? match.artists.map((artist: any) => artist?.name).filter(Boolean)
    : [];
}

function getAcrRightsOwner(match: any): string {
  return Array.isArray(match?.rights_claim)
    ? match.rights_claim
        .flatMap((claim: any) => Array.isArray(claim?.rights_owners) ? claim.rights_owners : [])
        .map((owner: any) => owner?.name)
        .filter(Boolean)[0] || ""
    : "";
}

function buildCopyrightTrackKey(match: any): string {
  const isrc = String(match?.external_ids?.isrc || "").trim().toUpperCase();
  if (isrc) return `isrc:${isrc}`;

  const acrid = String(match?.acrid || "").trim();
  if (acrid) return `acrid:${acrid}`;

  const title = normalizeTrackKeyText(match?.title || "unknown-track");
  const artists = getAcrArtistNames(match).map(normalizeTrackKeyText).filter(Boolean).join("-");
  return `track:${hashText(`${title}|${artists}`)}`;
}

function buildCopyrightMatchMetadata(match: any) {
  const artistNames = getAcrArtistNames(match);
  const title = typeof match?.title === "string" && match.title.trim()
    ? match.title.trim()
    : "Released recording";
  const score = Number(match?.score || 0);
  const isrc = String(match?.external_ids?.isrc || "").trim();
  const upc = String(match?.external_ids?.upc || "").trim();
  const acrid = String(match?.acrid || "").trim();
  const rightsOwner = getAcrRightsOwner(match);

  return {
    copyright_track_key: buildCopyrightTrackKey(match),
    copyright_title: title,
    copyright_artists: artistNames,
    copyright_artist_label: artistNames.join(", "),
    copyright_score: Number.isFinite(score) ? score : null,
    copyright_isrc: isrc || null,
    copyright_upc: upc || null,
    copyright_acrid: acrid || null,
    copyright_label: String(match?.label || "").trim() || null,
    copyright_album: String(match?.album?.name || match?.album || "").trim() || null,
    copyright_release_date: String(match?.release_date || "").trim() || null,
    copyright_rights_owner: rightsOwner || null,
  };
}

function buildCopyrightMatchDetails(match: any): string {
  const metadata = buildCopyrightMatchMetadata(match);
  const details = [
    metadata.copyright_artist_label
      ? `${metadata.copyright_title} by ${metadata.copyright_artist_label}`
      : metadata.copyright_title,
    Number.isFinite(metadata.copyright_score) && Number(metadata.copyright_score) > 0
      ? `match score ${metadata.copyright_score}`
      : "",
    metadata.copyright_rights_owner ? `rights owner: ${metadata.copyright_rights_owner}` : "",
    metadata.copyright_isrc ? `ISRC: ${metadata.copyright_isrc}` : "",
  ].filter(Boolean).join("; ");

  return details || "a released recording";
}

async function findCopyrightOwnershipReview(
  supabaseAdmin: any,
  userId: string,
  trackKey: string,
  statuses: string[],
) {
  const { data, error } = await supabaseAdmin
    .from("manual_identity_reviews")
    .select("id, status, metadata")
    .eq("user_id", userId)
    .eq("source", COPYRIGHT_OWNERSHIP_REVIEW_SOURCE)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[upload-safety-screen] copyright_ownership_review_lookup_failed", {
      userId,
      trackKey,
      message: error.message,
    });
    return null;
  }

  return (data || []).find((review: any) => (
    String(review?.metadata?.copyright_track_key || "").trim() === trackKey
  )) || null;
}

async function queueCopyrightOwnershipReview(
  supabaseAdmin: any,
  user: { id?: string | null; email?: string | null } | null,
  file: FileCandidate,
  match: any,
  context?: string,
) {
  const isGigPerformanceVideo = context === "gig_application_performance_video";
  const userId = String(user?.id || "").trim();
  if (!supabaseAdmin || !userId) {
    const metadata = buildCopyrightMatchMetadata(match);
    return {
      approved: false,
      queued: false,
      reviewId: null,
      reviewStatus: null,
      trackKey: metadata.copyright_track_key,
      metadata,
    };
  }

  const matchMetadata = buildCopyrightMatchMetadata(match);
  const trackKey = matchMetadata.copyright_track_key;
  const existingReview = await findCopyrightOwnershipReview(
    supabaseAdmin,
    userId,
    trackKey,
    ["APPROVED", "PENDING_REVIEW"],
  );

  if (existingReview?.status === "APPROVED") {
    return {
      approved: true,
      queued: false,
      reviewId: existingReview.id,
      reviewStatus: "APPROVED",
      trackKey,
      metadata: matchMetadata,
    };
  }

  if (existingReview?.status === "PENDING_REVIEW") {
    return {
      approved: false,
      queued: false,
      reviewId: existingReview.id,
      reviewStatus: "PENDING_REVIEW",
      trackKey,
      metadata: matchMetadata,
    };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const submittedEmail = String(user?.email || profile?.email || "unknown@musikalokal.local").trim().toLowerCase();
  const submittedRole = String(profile?.role || "musician").trim().toLowerCase() || "musician";
  const nowIso = new Date().toISOString();
  const metadata = {
    ...matchMetadata,
    review_reason: COPYRIGHT_OWNERSHIP_REVIEW_REASON,
    requested_from: "upload-safety-screen",
    requested_context: context || "playlist_audio_upload",
    upload_kind: isGigPerformanceVideo ? "gig_performance_video" : "playlist_audio",
    uploaded_file_name: file.fileName || null,
    uploaded_mime_type: file.mimeType || null,
    uploaded_file_size: typeof file.fileSize === "number" ? file.fileSize : null,
    requested_at: nowIso,
  };

  const { data: insertedReview, error: insertError } = await supabaseAdmin
    .from("manual_identity_reviews")
    .insert({
      user_id: userId,
      submitted_by_email: submittedEmail,
      submitted_role: submittedRole,
      document_type: isGigPerformanceVideo ? "Performance video recording ownership" : "Released track ownership",
      document_type_key: "COPYRIGHT_OWNERSHIP",
      document_country: "PHL",
      source: COPYRIGHT_OWNERSHIP_REVIEW_SOURCE,
      status: "PENDING_REVIEW",
      review_reason: COPYRIGHT_OWNERSHIP_REVIEW_REASON,
      matched_on: "COPYRIGHT_TRACK",
      review_notes: isGigPerformanceVideo
        ? "A gig performance video matched a released recording and requires admin ownership or permission review."
        : "Matched released recording requires admin ownership approval before upload.",
      metadata,
      expected_decision_by: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[upload-safety-screen] copyright_ownership_review_queue_failed", {
      userId,
      trackKey,
      message: insertError.message,
    });
    return {
      approved: false,
      queued: false,
      reviewId: null,
      reviewStatus: null,
      trackKey,
      metadata: matchMetadata,
    };
  }

  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type: "warning",
    title: isGigPerformanceVideo ? "Performance Video Review Required" : "Track Ownership Review Required",
    message: isGigPerformanceVideo
      ? "Your performance video matched a released recording. Your gig application can continue, but an admin will review your ownership or permission claim."
      : "Your upload matched a released recording. Identity Review admin approval is required before you can upload this track.",
    meta: {
      manual_identity_review_id: insertedReview?.id || null,
      source: COPYRIGHT_OWNERSHIP_REVIEW_SOURCE,
      copyright_track_key: trackKey,
      copyright_title: matchMetadata.copyright_title,
      copyright_artists: matchMetadata.copyright_artists,
    },
  });

  console.log("[upload-safety-screen] copyright_ownership_review_queued", {
    userId,
    reviewId: insertedReview?.id || null,
    trackKey,
  });

  return {
    approved: false,
    queued: true,
    reviewId: insertedReview?.id || null,
    reviewStatus: "PENDING_REVIEW",
    trackKey,
    metadata: matchMetadata,
  };
}

function getBestAcrMusicMatch(response: any): any | null {
  const matches = Array.isArray(response?.metadata?.music) ? response.metadata.music : [];
  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((best: any, current: any) => {
    const bestScore = Number(best?.score || 0);
    const currentScore = Number(current?.score || 0);
    return currentScore > bestScore ? current : best;
  }, matches[0]);
}

function summarizeAcrMusicMatch(match: any): string {
  return `This audio appears to match ${buildCopyrightMatchDetails(match)}. If this is your song, an ownership request has been sent to Identity Review for admin approval.`;
}

function getAcrCloudFailureReason(statusCode: number): string {
  switch (statusCode) {
    case 2004:
      return "ACRCloud could not decode the audio sample (code 2004). Please try another MP4/MOV video or re-export this file.";
    case 3001:
      return "ACRCloud credentials were rejected (code 3001). Please contact support.";
    case 3003:
      return "ACRCloud's monthly request limit has been reached (code 3003). Please contact support.";
    case 3014:
      return "ACRCloud rejected the request signature (code 3014). Please contact support.";
    case 3015:
      return "ACRCloud is receiving too many requests (code 3015). Please wait a few seconds and try again.";
    case 3000:
    case 3010:
      return `ACRCloud's recognition service is temporarily unavailable (code ${statusCode}). Please try again shortly.`;
    case 3002:
    case 3006:
      return `ACRCloud rejected the screening request (code ${statusCode}). Please contact support.`;
    default:
      return `ACRCloud could not verify this video (code ${Number.isFinite(statusCode) ? statusCode : "unknown"}). Please try again.`;
  }
}

async function screenAudioCopyright(
  file: FileCandidate,
  screeningContext: CopyrightScreeningContext = {},
): Promise<Omit<ScreeningResult, "id">> {
  console.log("[upload-safety-screen] acrcloud_copyright_check_start", {
    fileName: file.fileName || "(unknown)",
    mimeType: file.mimeType || null,
    declaredFileSize: typeof file.fileSize === "number" ? file.fileSize : null,
    hasInlineAudio: typeof file.contentDataUrl === "string" && file.contentDataUrl.trim().length > 0,
  });

  const parsedAudio = parseCopyrightMediaDataUrl(file);
  if (!parsedAudio) {
    console.log("[upload-safety-screen] acrcloud_copyright_check_skipped", {
      fileName: file.fileName || "(unknown)",
      reason: "no_inline_audio_content",
    });
    return { allowed: true, publiclyAvailable: true, copyrightStatus: "not_required" };
  }

  if (!ACRCLOUD_HOST || !ACRCLOUD_ACCESS_KEY || !ACRCLOUD_ACCESS_SECRET) {
    console.error("[upload-safety-screen] acrcloud_config_missing", {
      hasHost: Boolean(ACRCLOUD_HOST),
      hasAccessKey: Boolean(ACRCLOUD_ACCESS_KEY),
      hasAccessSecret: Boolean(ACRCLOUD_ACCESS_SECRET),
    });
    return {
      allowed: false,
      reason: "Audio copyright checking is not configured. Upload blocked until ACRCloud credentials are available.",
    };
  }

  console.log("[upload-safety-screen] acrcloud_config_ready", {
    host: ACRCLOUD_HOST,
    accessKey: maskSecretPreview(ACRCLOUD_ACCESS_KEY),
    minScore: Number.isFinite(ACRCLOUD_MIN_SCORE) ? ACRCLOUD_MIN_SCORE : 80,
    sampleBytes: parsedAudio.bytes.byteLength,
    originalBytes: parsedAudio.originalBytes,
    truncatedForAcrCloud: parsedAudio.wasTruncated,
    sampleMimeType: parsedAudio.mimeType,
  });

  const httpMethod = "POST";
  const httpUri = "/v1/identify";
  const dataType = "audio";
  const signatureVersion = "1";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = [
    httpMethod,
    httpUri,
    ACRCLOUD_ACCESS_KEY,
    dataType,
    signatureVersion,
    timestamp,
  ].join("\n");
  const signature = await createAcrCloudSignature(ACRCLOUD_ACCESS_SECRET, stringToSign);

  const formData = new FormData();
  const sampleBytes = parsedAudio.bytes.buffer.slice(
    parsedAudio.bytes.byteOffset,
    parsedAudio.bytes.byteOffset + parsedAudio.bytes.byteLength,
  ) as ArrayBuffer;
  formData.append("sample", new Blob([sampleBytes], { type: parsedAudio.mimeType }), file.fileName || "track.mp3");
  formData.append("access_key", ACRCLOUD_ACCESS_KEY);
  formData.append("sample_bytes", String(parsedAudio.bytes.byteLength));
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);
  formData.append("data_type", dataType);
  formData.append("signature_version", signatureVersion);

  const response = await fetch(getAcrCloudIdentifyUrl(ACRCLOUD_HOST), {
    method: httpMethod,
    body: formData,
  });

  console.log("[upload-safety-screen] acrcloud_identify_response", {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("[upload-safety-screen] acrcloud_identify_failed", {
      status: response.status,
      statusText: response.statusText,
      body: errorBody.slice(0, 1000),
    });
    return {
      allowed: false,
      reason: `ACRCloud could not be reached (HTTP ${response.status}). Please try again in a moment.`,
    };
  }

  const acrResult = await response.json();
  const statusCode = Number(acrResult?.status?.code);
  console.log("[upload-safety-screen] acrcloud_identify_payload_status", {
    code: acrResult?.status?.code,
    message: acrResult?.status?.msg,
    version: acrResult?.status?.version,
    hasMusicMetadata: Array.isArray(acrResult?.metadata?.music),
    matchCount: Array.isArray(acrResult?.metadata?.music) ? acrResult.metadata.music.length : 0,
  });

  if (statusCode === 1001) {
    console.log("[upload-safety-screen] acrcloud_copyright_check_allowed", {
      fileName: file.fileName || "(unknown)",
      reason: "no_match",
      statusCode,
    });
    return { allowed: true, publiclyAvailable: true, copyrightStatus: "not_required" };
  }

  if (statusCode !== 0) {
    console.error("[upload-safety-screen] acrcloud_identify_status", {
      code: acrResult?.status?.code,
      message: acrResult?.status?.msg,
    });
    return {
      allowed: false,
      reason: getAcrCloudFailureReason(statusCode),
    };
  }

  const bestMatch = getBestAcrMusicMatch(acrResult);
  const minScore = Number.isFinite(ACRCLOUD_MIN_SCORE) ? ACRCLOUD_MIN_SCORE : 80;
  console.log("[upload-safety-screen] acrcloud_best_match", {
    found: Boolean(bestMatch),
    title: bestMatch?.title || null,
    artists: Array.isArray(bestMatch?.artists)
      ? bestMatch.artists.map((artist: any) => artist?.name).filter(Boolean)
      : [],
    score: bestMatch?.score || null,
    acrid: bestMatch?.acrid || null,
    isrc: bestMatch?.external_ids?.isrc || null,
    upc: bestMatch?.external_ids?.upc || null,
    label: bestMatch?.label || null,
    minScore,
  });

  if (bestMatch && Number(bestMatch?.score || 0) >= minScore) {
    const ownershipReview = await queueCopyrightOwnershipReview(
      screeningContext.supabaseAdmin,
      screeningContext.user || null,
      file,
      bestMatch,
      screeningContext.context,
    );

    if (ownershipReview.approved) {
      console.log("[upload-safety-screen] acrcloud_copyright_check_allowed", {
        fileName: file.fileName || "(unknown)",
        reason: "approved_ownership_review",
        reviewId: ownershipReview.reviewId,
        trackKey: ownershipReview.trackKey,
      });
      return {
        allowed: true,
        publiclyAvailable: true,
        copyrightStatus: "approved",
        copyrightReviewId: ownershipReview.reviewId,
        copyrightTrackKey: ownershipReview.trackKey,
        copyrightMetadata: ownershipReview.metadata,
      };
    }

    console.warn("[upload-safety-screen] acrcloud_copyright_check_blocked", {
      fileName: file.fileName || "(unknown)",
      title: bestMatch?.title || null,
      score: bestMatch?.score || null,
      minScore,
      acrid: bestMatch?.acrid || null,
      ownershipReviewId: ownershipReview.reviewId,
      ownershipReviewQueued: ownershipReview.queued,
    });

    if (!ownershipReview.reviewId && !ownershipReview.queued) {
      return {
        allowed: false,
        reason: "This track appears to match a released recording, but the ownership review could not be sent. Please try again.",
      };
    }

    return {
      allowed: true,
      reason: summarizeAcrMusicMatch(bestMatch),
      requiresAdminReview: true,
      publiclyAvailable: false,
      copyrightStatus: "pending_review",
      copyrightReviewId: ownershipReview.reviewId,
      copyrightTrackKey: ownershipReview.trackKey,
      copyrightMetadata: ownershipReview.metadata,
    };
  }

  console.log("[upload-safety-screen] acrcloud_copyright_check_allowed", {
    fileName: file.fileName || "(unknown)",
    reason: bestMatch ? "below_score_threshold" : "no_music_match",
    score: bestMatch?.score || null,
    minScore,
  });

  return { allowed: true, publiclyAvailable: true, copyrightStatus: "not_required" };
}

function getFileId(file: FileCandidate, index: number): string {
  return (
    (typeof file.id === "string" ? file.id : null) ||
    (typeof file.fingerprint === "string" ? file.fingerprint : null) ||
    String(index)
  );
}

const BLOCKED_CATEGORY_LABELS: Record<string, string> = {
  sexual: "sexual or nude content",
  "sexual/minors": "sexual content involving minors",
  violence: "violent content",
  "violence/graphic": "graphic violence or gore",
  hate: "hate or extremist content",
  "hate/threatening": "threatening hate content",
  illicit: "illegal content",
  "illicit/violent": "violent illegal content",
};

const VISUAL_BLOCK_REASONS: Record<string, string> = {
  sexual: "sexual content",
  nudity: "nudity",
  violence: "violence",
  gore: "graphic violence or gore",
  hate_symbols: "hate symbols or extremist imagery",
  illegal: "illegal content",
};

const BLOCKED_REASON_PATTERN =
  /\b(adult|blood|bloody|criminal|explicit|extremis(?:t|m)|gore|gory|hate(?:ful)?|illegal|illicit|injur(?:y|ies)|nazi|nude|nudity|offensive|porn(?:ographic)?|sexual|swastika|violence|violent|weapon)\b/i;

function hasBlockedCategory(
  categories: Record<string, unknown>,
  labels: Record<string, string>,
): string | null {
  for (const category of Object.keys(labels)) {
    if (parseLooseBoolean(categories?.[category]) === true) {
      return labels[category];
    }
  }

  return null;
}

function isBlockedPolicyReason(reason: unknown): reason is string {
  return typeof reason === "string" && BLOCKED_REASON_PATTERN.test(reason);
}

function resolveBlockedModerationReason(result: any): string | null {
  const categories = result?.categories || {};
  const blockedCategory = hasBlockedCategory(categories, BLOCKED_CATEGORY_LABELS);
  if (blockedCategory) {
    return `Blocked for ${blockedCategory}.`;
  }

  if (result?.flagged === true && isBlockedPolicyReason(result?.reason)) {
    return "Blocked by image safety moderation.";
  }

  return null;
}

function buildVisualReviewPrompt(context: string, file: FileCandidate): string {
  const mediaDescription = file.kind === "video"
    ? "a representative frame from an uploaded video"
    : "an uploaded image";

  return `You are reviewing ${mediaDescription} for Musika Lokal before the media can be saved or displayed.

Context: ${context}
File name: ${file.fileName || "(unknown)"}
File type: ${file.mimeType || "(unknown)"}

Block the image ONLY if it contains one of these categories:
- pornographic or sexual content
- nudity
- violence, weapons used threateningly, blood, gore, or serious injury
- hate symbols, extremist symbols, or offensive hateful content
- illegal content

Allow everything else, including ordinary selfies, profile photos, gig photos, posters, landscapes, food, screenshots, documents, and non-music images.
Do not block an image because it lacks music, instruments, performances, artists, stages, or other musical content.

Return ONLY valid JSON:
{"allowed": true, "categories": {"sexual": false, "nudity": false, "violence": false, "gore": false, "hate_symbols": false, "illegal": false}, "reason": ""}`;
}

function parseLooseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "allow", "allowed", "safe", "pass"].includes(normalized)) return true;
  if (["false", "no", "block", "blocked", "unsafe", "fail"].includes(normalized)) return false;
  return null;
}

function parseVisualReviewDecision(raw: string | null): { allowed: boolean; reason?: string } | null {
  if (!raw) return null;

  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return null;

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const categories = parsed?.categories && typeof parsed.categories === "object"
      ? parsed.categories
      : {};

    const blockedCategory = hasBlockedCategory(categories, VISUAL_BLOCK_REASONS);
    if (blockedCategory) {
      return {
        allowed: false,
        reason: parsed?.reason || `Blocked for ${blockedCategory}.`,
      };
    }

    const allowed = parseLooseBoolean(parsed?.allowed);
    if (allowed === false && isBlockedPolicyReason(parsed?.reason)) {
      return {
        allowed: false,
        reason: typeof parsed?.reason === "string" ? parsed.reason : undefined,
      };
    }

    return { allowed: true };
  } catch {
    return null;
  }
}

async function callOpenAiImageModeration(
  context: string,
  file: FileCandidate,
  dataUrl: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const response = await fetch(OPENAI_MODERATION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "omni-moderation-latest",
      input: [
        {
          type: "text",
          text: `Musika Lokal upload safety check. Context: ${context}. File: ${file.fileName || "unknown"}.`,
        },
        {
          type: "image_url",
          image_url: { url: dataUrl },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI moderation error: ${response.status}`);
  }

  const data = await response.json();
  const result = data?.results?.[0] || null;
  const blockedReason = resolveBlockedModerationReason(result);
  if (blockedReason) {
    return { allowed: false, reason: blockedReason };
  }

  return { allowed: true };
}

async function callOpenAiVisualReview(
  prompt: string,
  dataUrl: string,
): Promise<{ allowed: boolean; reason?: string } | null> {
  const response = await fetch(OPENAI_CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI visual review error: ${response.status}`);
  }

  const data = await response.json();
  return parseVisualReviewDecision(data?.choices?.[0]?.message?.content || null);
}

async function callGroqVisualReview(
  prompt: string,
  dataUrl: string,
): Promise<{ allowed: boolean; reason?: string } | null> {
  console.log("[upload-safety-screen] groq_visual_review_start", {
    model: GROQ_VISION_MODEL,
    imageBytesApprox: estimateBase64Bytes(dataUrl.split(",")[1] || ""),
  });

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_completion_tokens: 300,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("[upload-safety-screen] groq_visual_review_failed", {
      status: response.status,
      statusText: response.statusText,
      body: errorBody.slice(0, 1000),
    });
    throw new Error(`Groq visual review error: ${response.status}${errorBody ? ` ${errorBody}` : ""}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content || "";
  const decision = parseVisualReviewDecision(rawContent);
  console.log("[upload-safety-screen] groq_visual_review_done", {
    hasDecision: Boolean(decision),
    allowed: decision?.allowed,
    reason: decision?.reason,
    rawPreview: decision ? undefined : String(rawContent).slice(0, 500),
  });
  return decision;
}

async function callGeminiVisualReview(
  prompt: string,
  mimeType: string,
  base64: string,
): Promise<{ allowed: boolean; reason?: string } | null> {
  const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 300 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini visual review error: ${response.status}`);
  }

  const data = await response.json();
  return parseVisualReviewDecision(data?.candidates?.[0]?.content?.parts?.[0]?.text || null);
}

async function screenVisualContent(
  context: string,
  file: FileCandidate,
): Promise<{ allowed: boolean; reason?: string }> {
  const parsedImage = parseImageDataUrl(file);
  if (!parsedImage) {
    return { allowed: true };
  }

  const prompt = buildVisualReviewPrompt(context, file);
  let reviewed = false;
  const providerFailures: string[] = [];

  if (OPENAI_API_KEY) {
    try {
      const moderationDecision = await callOpenAiImageModeration(
        context,
        file,
        parsedImage.dataUrl,
      );
      reviewed = true;
      if (!moderationDecision.allowed) {
        return moderationDecision;
      }

      const visualDecision = await callOpenAiVisualReview(prompt, parsedImage.dataUrl);
      if (visualDecision) {
        reviewed = true;
        if (!visualDecision.allowed) {
          return visualDecision;
        }
      }
    } catch (error) {
      providerFailures.push(`OpenAI: ${error instanceof Error ? error.message : String(error)}`);
      console.error("[upload-safety-screen] openai_visual_review_exception_fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      // Try another image-capable provider before blocking.
    }
  }

  if (GROQ_API_KEY) {
    try {
      const visualDecision = await callGroqVisualReview(prompt, parsedImage.dataUrl);
      if (visualDecision) {
        reviewed = true;
        if (!visualDecision.allowed) {
          return visualDecision;
        }
      } else {
        providerFailures.push("Groq: no valid JSON decision returned");
      }
    } catch (error) {
      providerFailures.push(`Groq: ${error instanceof Error ? error.message : String(error)}`);
      console.error("[upload-safety-screen] groq_visual_review_exception_fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      // Try the next image-capable provider before blocking.
    }
  }

  if (GEMINI_API_KEY) {
    try {
      const visualDecision = await callGeminiVisualReview(
        prompt,
        parsedImage.mimeType,
        parsedImage.base64,
      );
      if (visualDecision) {
        reviewed = true;
        if (!visualDecision.allowed) {
          return visualDecision;
        }
      } else {
        providerFailures.push("Gemini: no valid JSON decision returned");
      }
    } catch (error) {
      providerFailures.push(`Gemini: ${error instanceof Error ? error.message : String(error)}`);
      console.error("[upload-safety-screen] gemini_visual_review_exception_fallback", {
        message: error instanceof Error ? error.message : String(error),
      });
      // Fall through to fail-closed response below.
    }
  }

  if (reviewed) {
    return { allowed: true };
  }

  console.warn("[upload-safety-screen] visual_review_unavailable_allowing", {
    fileName: file.fileName || "(unknown)",
    kind: file.kind || "photo",
    providerFailures,
    hasOpenAi: Boolean(OPENAI_API_KEY),
    hasGroq: Boolean(GROQ_API_KEY),
    hasGemini: Boolean(GEMINI_API_KEY),
  });

  return {
    allowed: true,
    reason: "Visual safety screening is unavailable; upload allowed after rule-based checks.",
  };
}

// ─── AI screening ─────────────────────────────────────────────────────────────

function buildAiPrompt(context: string, files: FileCandidate[]): string {
  const fileDescriptions = files
    .map((f, i) => {
      const parts = [
        `File ${i + 1}:`,
        `  name: ${f.fileName || "(unknown)"}`,
        `  type: ${f.mimeType || "(unknown)"}`,
        `  size: ${typeof f.fileSize === "number" ? `${f.fileSize} bytes` : "(unknown)"}`,
        `  kind: ${f.kind || "photo"}`,
      ];
      return parts.join("\n");
    })
    .join("\n\n");

  return `You are a content safety reviewer for Musika Lokal. Your job is to review file metadata ONLY (no actual file content is provided) and block only clearly prohibited content.

Upload context: ${context}

Files to review:
${fileDescriptions}

Review guidelines:
- ALLOW all ordinary uploads, even when they are not related to music
- ALLOW profile photos, gig photos, studio photos, event photos, ID documents, PDF contracts, PDF permits, document images, performance videos, audition videos, rehearsal videos, and gig walkthrough videos
- BLOCK only files with names clearly suggesting pornographic/sexual content, nudity, violence, gore, hate symbols, offensive hateful content, or illegal material
- Do not block because the file lacks music, instruments, performances, artists, stages, or other musical content

Return ONLY valid JSON. No markdown, no explanation.
Format: {"results": [{"index": 0, "allowed": true}, {"index": 1, "allowed": false, "reason": "..."}]}`;
}

async function callGroq(prompt: string): Promise<string> {
  console.log("[upload-safety-screen] groq_text_safety_start", {
    model: GROQ_SAFETY_TEXT_MODEL,
  });

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_SAFETY_TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_completion_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("[upload-safety-screen] groq_text_safety_failed", {
      status: response.status,
      statusText: response.statusText,
      body: errorBody.slice(0, 1000),
    });
    throw new Error(`Groq API error: ${response.status}${errorBody ? ` ${errorBody}` : ""}`);
  }

  const data = await response.json();
  console.log("[upload-safety-screen] groq_text_safety_done");
  return data?.choices?.[0]?.message?.content || "";
}

async function callGemini(prompt: string): Promise<string> {
  const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOpenAi(prompt: string): Promise<string> {
  const response = await fetch(OPENAI_CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callAi(prompt: string): Promise<string | null> {
  if (GROQ_API_KEY) {
    try {
      return await callGroq(prompt);
    } catch {
      // fall through
    }
  }

  if (GEMINI_API_KEY) {
    try {
      return await callGemini(prompt);
    } catch {
      // fall through
    }
  }

  if (OPENAI_API_KEY) {
    try {
      return await callOpenAi(prompt);
    } catch {
      // fall through
    }
  }

  return null;
}

function parseAiResults(
  raw: string | null,
  files: FileCandidate[],
): Array<{ index: number; allowed: boolean; reason?: string }> | null {
  if (!raw) return null;

  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return null;

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed?.results)) return null;

    return parsed.results
      .filter(
        (r: unknown) => r && typeof r === "object" && typeof (r as any).index === "number",
      )
      .map((result: any) => {
        const reason = typeof result?.reason === "string" ? result.reason : undefined;
        const categories = result?.categories && typeof result.categories === "object"
          ? result.categories
          : {};
        const blockedCategory = hasBlockedCategory(categories, VISUAL_BLOCK_REASONS);
        const allowed = parseLooseBoolean(result?.allowed);
        const shouldBlock = Boolean(blockedCategory) || (allowed === false && isBlockedPolicyReason(reason));

        return {
          index: result.index,
          allowed: !shouldBlock,
          reason: shouldBlock ? reason || `Blocked for ${blockedCategory}.` : undefined,
        };
      });
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : null;

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim() || "";

    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const context = typeof body.context === "string" ? body.context : "add_edit_upload";

    if (body.action === "link_copyright_review_media") {
      const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";
      const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
      if (!supabaseAdmin || !reviewId || !mediaUrl) {
        return new Response(JSON.stringify({ error: "reviewId and mediaUrl are required." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      let parsedMediaUrl: URL;
      try {
        parsedMediaUrl = new URL(mediaUrl);
        const storageOrigin = new URL(supabaseUrl).origin;
        if (parsedMediaUrl.origin !== storageOrigin || !parsedMediaUrl.pathname.startsWith("/storage/v1/object/")) {
          throw new Error("invalid_storage_url");
        }
      } catch {
        return new Response(JSON.stringify({ error: "mediaUrl must be a URL in this project's Supabase Storage." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const { data: review, error: reviewError } = await supabaseAdmin
        .from("manual_identity_reviews")
        .select("id, user_id, source, metadata")
        .eq("id", reviewId)
        .maybeSingle();
      if (reviewError) throw reviewError;
      if (!review || review.user_id !== user.id || String(review.source || "").toUpperCase() !== COPYRIGHT_OWNERSHIP_REVIEW_SOURCE) {
        return new Response(JSON.stringify({ error: "Copyright review not found." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      const { error: linkError } = await supabaseAdmin
        .from("manual_identity_reviews")
        .update({
          metadata: {
            ...(review.metadata || {}),
            uploaded_video_url: parsedMediaUrl.toString(),
            media_linked_at: new Date().toISOString(),
          },
        })
        .eq("id", reviewId)
        .eq("user_id", user.id);
      if (linkError) throw linkError;

      return new Response(JSON.stringify({ linked: true, reviewId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const rawFiles = Array.isArray(body.files) ? (body.files as FileCandidate[]) : [];
    console.log("[upload-safety-screen] request_received", {
      context,
      fileCount: rawFiles.length,
      hasInlineContent: rawFiles.some(
        (file) => typeof file.contentDataUrl === "string" && file.contentDataUrl.trim().length > 0,
      ),
      kinds: rawFiles.map((file) => file.kind || "photo"),
    });

    if (rawFiles.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const files = rawFiles.slice(0, MAX_FILES_PER_REQUEST);

    // Step 1: Rule-based pre-screen
    const ruleResults = files.map((file) => ruleBasedScreen(file));
    const blockedByRules = ruleResults.some((r) => !r.allowed);

    // If any file is blocked by rules, skip AI entirely and return immediately
    if (blockedByRules) {
      const results: ScreeningResult[] = files.map((file, i) => {
        return {
          id: getFileId(file, i),
          allowed: ruleResults[i].allowed,
          reason: ruleResults[i].reason,
        };
      });

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Step 2: Content screening when the client provides actual media bytes.
    const hasInlineMediaContent = files.some(
      (file) => typeof file.contentDataUrl === "string" && file.contentDataUrl.trim().length > 0,
    );

    if (hasInlineMediaContent) {
      const results: ScreeningResult[] = [];

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const fileId = getFileId(file, i);
        const hasContentDataUrl =
          typeof file.contentDataUrl === "string" && file.contentDataUrl.trim().length > 0;

        if (!hasContentDataUrl) {
          results.push({ id: fileId, allowed: true });
          continue;
        }

        try {
          const decision = file.kind === "audio" ||
              (file.kind === "video" && context === "gig_application_performance_video")
            ? await screenAudioCopyright(file, {
                supabaseAdmin,
                user: { id: user.id, email: user.email || null },
                context,
              })
            : await screenVisualContent(context, file);
          results.push({
            id: fileId,
            ...decision,
            reason: decision.reason,
          });
        } catch (mediaError) {
          results.push({
            id: fileId,
            allowed: false,
            reason:
              mediaError instanceof Error
                ? mediaError.message
                : "Media safety screening failed. Upload blocked.",
          });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Step 3: AI metadata screening for files that passed rule-based check
    const aiPrompt = buildAiPrompt(context, files);
    const aiRaw = await callAi(aiPrompt);
    const aiDecisions = parseAiResults(aiRaw, files);

    const results: ScreeningResult[] = files.map((file, i) => {
      const fileId = getFileId(file, i);

      if (!aiDecisions) {
        // AI unavailable — allow files that passed rule-based check
        return { id: fileId, allowed: true };
      }

      const aiDecision = aiDecisions.find((d) => d.index === i);
      if (!aiDecision) {
        // AI gave no decision for this file — allow it
        return { id: fileId, allowed: true };
      }

      return {
        id: fileId,
        allowed: aiDecision.allowed !== false,
        reason: aiDecision.allowed === false ? aiDecision.reason : undefined,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("upload-safety-screen error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error while screening uploads." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
