import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetBackdrop, BottomSheetView, useBottomSheetSpringConfigs } from "@gorhom/bottom-sheet";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  Platform,
  Share,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/src/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase";
import CachedImage from "../../src/components/CachedImage";
import GuestSignInGate from "../../src/components/GuestSignInGate";
import Header from "../../src/components/header";
import ListingDetailsSheet from "../../src/components/ListingDetailsSheet";
import { normalizeVisibleInput } from "../../src/components/modal";
import Navbar, {
  NAVBAR_BOTTOM_OFFSET,
  NAVBAR_CLEARANCE,
  NAVBAR_HEIGHT,
} from "../../src/components/navbar";
import PostDetailsModal from "../../src/components/PostDetailsModal";
import ProductionTeamDetailsSheet from "../../src/components/ProductionTeamDetailsSheet";
import ReportModal from "../../src/components/ReportModal";
import SearchBottomSheet from "../../src/components/SearchBottomSheet";
import Skeleton from "../../src/components/Skeleton";
import SlidingTabBar from "../../src/components/SlidingTabBar";
import TrackedBottomSheetModal from "../../src/components/TrackedBottomSheetModal";
import CustomAlert, { AlertType } from "../../src/components/CustomAlert";
import { useAuth } from "../../src/context/AuthContext";
import { formatDashedNumericDate } from "../../src/utils/friendlyDateTime";
import { useBottomOverlay } from "../../src/context/BottomOverlayContext";
import {
  RADIO_MINI_PLAYER_HEIGHT,
  RADIO_MINI_PLAYER_STACK_GAP,
  useRadioPlayer,
  useRadioPlayerPresence,
} from "../../src/context/RadioPlayerContext";
import { emitToast } from "../../src/events/toastBus";
import { useFeedQuery } from "../../src/data/hooks";
import { useTheme } from "../../src/context/ThemeContext";
import { resolveRadioMediaUrl } from "../../src/audio/radioTrackPlayer";
import {
  buildSocialFollowKey,
  getListingSocialFollowTarget,
  normalizeSocialFollowTargetType,
} from "../../src/utils/socialFollow";
import type { SocialFollowTargetType } from "../../src/utils/socialFollow";
import {
  getGroqModelInfo,
} from "../../src/services/groqModelRouter";
import { screenUploadsWithAi } from "../../src/services/uploadSafetyScreen";
import { logLoadTime, usePageLoadLogger } from "../../src/utils/loadTimeLogger";
import { bottomSheetSpringConfig } from "../../src/utils/motion";
import { setSmoothTab } from "../../src/utils/smoothTabs";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type FeedTab = "for_you" | "following";
const isForYouFeedTab = (feedTab: FeedTab) => feedTab === "for_you";
const FEED_TABS = [
  { key: "for_you", label: "For You" },
  { key: "following", label: "Following" },
] as const;

type FeedAiCardsResult = {
  cards: any[];
  provider: string;
  message: string;
};

type FeedCacheEntry = {
  posts: any[];
  aiCards: any[];
  aiFeedMessage: string;
  aiFeedProvider: string;
  hasMore: boolean;
  loaded: boolean;
};

const createEmptyFeedCacheEntry = (provider: string): FeedCacheEntry => ({
  posts: [],
  aiCards: [],
  aiFeedMessage: "",
  aiFeedProvider: provider,
  hasMore: false,
  loaded: false,
});

const createFeedCache = (provider: string): Record<FeedTab, FeedCacheEntry> => ({
  for_you: createEmptyFeedCacheEntry(provider),
  following: createEmptyFeedCacheEntry(provider),
});

const normalizeAiFeedProvider = (provider: string) =>
  provider.replace(/\s*\(Cached\)\s*$/i, "").trim();

const normalizeAiFeedMessage = (message: string) =>
  /loaded cached/i.test(message) ? "" : message;

const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const logFeedInvokeError = (
  scope: string,
  error: any,
  extra: Record<string, unknown> = {},
) => {
  const rawStatus = Number(error?.status || error?.context?.status || 0);
  const status = Number.isFinite(rawStatus) && rawStatus > 0 ? rawStatus : null;

  console.error(`[FeedInvokeError] ${scope}`, {
    message: error?.message || "Unknown function invoke error",
    status,
    code: error?.code ?? error?.context?.code ?? null,
    details: error?.details ?? error?.context?.details ?? null,
    hint: error?.hint ?? error?.context?.hint ?? null,
    context: error?.context ?? null,
    ...extra,
  });
};

const FEED_PAGE_SIZE = 12;
const AI_CARD_LIMIT = 20;
const AI_RECOMMENDATION_TIMEOUT_MS = 2500;
const FEED_FOCUS_REFRESH_COOLDOWN_MS = 30000;
const PESO_SIGN = "\u20B1";
const POST_MEDIA_BUCKET = "post-media";
const MAX_POST_MEDIA_ITEMS = 10;
const MAX_POST_MEDIA_BYTES = 50 * 1024 * 1024;
const MAX_INLINE_SCREEN_BYTES = 4 * 1024 * 1024;
const VIDEO_THUMBNAIL_OPTION_LIMIT = 4;
const VIDEO_THUMBNAIL_INTERVAL_MS = 2500;
const POST_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]);
const POST_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"]);
const POST_MIME_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mov: "video/quicktime",
  mp4: "video/mp4",
  png: "image/png",
  webm: "video/webm",
  webp: "image/webp",
};

type PostComposerThumbnail = {
  uri: string;
  dataUrl: string;
};

type PostComposerMedia = {
  id: string;
  uri: string;
  name: string;
  media_type: "image" | "video";
  mime_type: string;
  ext: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  base64?: string;
  is_cover: boolean;
  thumbnailChoices: PostComposerThumbnail[];
  selectedThumbnailIndex: number;
  safetyMetadata: Record<string, any>;
};

const feedScreenCache = createFeedCache(getGroqModelInfo().modelLabel);
let feedScreenCacheIdentity = "guest";

const withAiRecommendationTimeout = async <T,>(promise: Promise<T>): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), AI_RECOMMENDATION_TIMEOUT_MS);
    }),
  ]);

const FEED_FALLBACK_IMAGES: Record<string, string[]> = {
  Artist: [
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=75",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=75",
    "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=75",
  ],
  Gig: [
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1000&q=75",
  ],
  Group: [
    "https://images.unsplash.com/photo-1521335629791-ce4aec67dd47?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=75",
  ],
  Production: [
    "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=1000&q=75",
  ],
  Studio: [
    "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=75",
  ],
  Venue: [
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1000&q=75",
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1000&q=75",
  ],
};

const getFeedFallbackImage = (type: string, id?: string | null) => {
  const images = FEED_FALLBACK_IMAGES[type] || FEED_FALLBACK_IMAGES.Group;
  const seed = String(id || type || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return images[seed % images.length];
};

const ensureFeedCardImage = <T extends { id?: string | null; type?: string; image?: string | null; images?: string[] }>(item: T): T => {
  const type = item.type || "Group";
  const validImages = Array.isArray(item.images)
    ? item.images.filter((image) => typeof image === "string" && image.trim().length > 0)
    : [];
  const primaryImage =
    typeof item.image === "string" && item.image.trim().length > 0
      ? item.image
      : validImages[0] || getFeedFallbackImage(type, item.id);

  return {
    ...item,
    image: primaryImage,
    images: validImages.length > 0 ? validImages : [primaryImage],
  };
};

const normalizeAiRecommendationCard = (item: any) => {
  const type = typeof item?.type === "string" && item.type.trim().length > 0
    ? item.type.trim()
    : "Group";
  const isGroup = type.toLowerCase() === "group";
  const isGig = type.toLowerCase() === "gig";
  const ownerId = typeof item?.owner_id === "string" ? item.owner_id : null;
  const organizerId = typeof item?.organizer_id === "string" ? item.organizer_id : null;
  const targetId = isGroup ? item?.id : isGig ? organizerId : ownerId;

  return ensureFeedCardImage({
    ...item,
    __feedKind: "ai_card",
    id: item?.id,
    type,
    name: item?.name || `Recommended ${type}`,
    image: typeof item?.image === "string" ? item.image : null,
    images: Array.isArray(item?.images) ? item.images : [],
    rating: Number(item?.rating || 0),
    review_count: Number(item?.review_count || 0),
    location: item?.location || "",
    genre: item?.genre || "",
    created_at: item?.created_at || null,
    updated_at: item?.updated_at || item?.created_at || null,
    owner_id: ownerId,
    organizer_id: organizerId,
    rate: item?.rate?.toString?.() || null,
    hourly_rate: item?.hourly_rate?.toString?.() || null,
    budget: item?.budget?.toString?.() || null,
    similarity: Number(item?.similarity || 0),
    aiReason: typeof item?.aiReason === "string" ? item.aiReason : "",
    aiScore: Number(item?.aiScore || 0),
    social_follow_target_id: typeof targetId === "string" && targetId.length > 0 ? targetId : null,
    social_follow_target_type: isGroup ? "group" : "profile",
  });
};

const getFeedItemCreatedTime = (item: any) => {
  const timestamp = typeof item?.created_at === "string" && item.created_at.length > 0
    ? item.created_at
    : typeof item?.updated_at === "string" && item.updated_at.length > 0
      ? item.updated_at
      : "";
  const time = timestamp ? new Date(timestamp).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const sortFeedItemsNewestFirst = (items: any[]) =>
  [...items].sort((a, b) => getFeedItemCreatedTime(b) - getFeedItemCreatedTime(a));

const clampFeedScore = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const normalizeRecommendationScore = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clampFeedScore(numeric <= 1 ? numeric * 100 : numeric);
};

const getExplicitRecommendationScore = (item: any) => {
  const score = normalizeRecommendationScore(item?.aiScore ?? item?.ai_score);
  if (score > 0) return score;
  return normalizeRecommendationScore(item?.similarity);
};

const getForYouRecencyScore = (item: any) => {
  const createdTime = getFeedItemCreatedTime(item);
  if (!createdTime) return 20;
  const ageDays = Math.max(0, (Date.now() - createdTime) / (1000 * 60 * 60 * 24));
  if (ageDays <= 1) return 100;
  if (ageDays <= 7) return 82;
  if (ageDays <= 30) return 58;
  if (ageDays <= 90) return 34;
  return 18;
};

const getForYouEngagementScore = (item: any) => {
  const reactions = Number(item?.reaction_count || 0);
  const comments = Number(item?.comment_count || 0);
  const shares = Number(item?.share_count || 0);
  return clampFeedScore(Math.log1p(Math.max(0, reactions) + Math.max(0, comments) * 2 + Math.max(0, shares) * 3) * 22);
};

const getRecommendationProfileTargetId = (item: any) => {
  if (item?.social_follow_target_type === "profile" && typeof item?.social_follow_target_id === "string") {
    return item.social_follow_target_id;
  }

  return [item?.owner_id, item?.organizer_id, item?.author_id].find(
    (value) => typeof value === "string" && value.length > 0,
  ) || "";
};

const buildForYouRecommendationSignals = (items: any[]) => {
  const signals = new Map<string, number>();

  for (const item of items) {
    if (item?.__feedKind !== "ai_card") continue;
    const targetId = getRecommendationProfileTargetId(item);
    if (!targetId) continue;
    const score = getExplicitRecommendationScore(item) || 62;
    signals.set(targetId, Math.max(signals.get(targetId) || 0, score));
  }

  return signals;
};

const sortForYouFeedItems = (items: any[]) => {
  const recommendationSignals = buildForYouRecommendationSignals(items);

  return [...items].sort((a, b) => {
    const scoreItem = (item: any) => {
      const explicitScore = getExplicitRecommendationScore(item);
      const recencyScore = getForYouRecencyScore(item);
      const engagementScore = getForYouEngagementScore(item);

      if (item?.__feedKind === "ai_card") {
        return (explicitScore || 62) * 0.7 + recencyScore * 0.2 + engagementScore * 0.1;
      }

      const authorSignal = typeof item?.author_id === "string"
        ? recommendationSignals.get(item.author_id) || 0
        : 0;
      const followSignal = item?.is_following === true ? 52 : 0;

      return Math.max(authorSignal, followSignal) * 0.55 + recencyScore * 0.3 + engagementScore * 0.15;
    };

    const scoreDelta = scoreItem(b) - scoreItem(a);
    if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
    return getFeedItemCreatedTime(b) - getFeedItemCreatedTime(a);
  });
};

const feedLastFetchAt: Record<FeedTab, number> = {
  for_you: 0,
  following: 0,
};

const resetFeedScreenCacheForIdentity = (provider: string, identity: string) => {
  const nextCache = createFeedCache(provider);
  feedScreenCache.for_you = nextCache.for_you;
  feedScreenCache.following = nextCache.following;
  feedLastFetchAt.for_you = 0;
  feedLastFetchAt.following = 0;
  feedScreenCacheIdentity = identity;
  return feedScreenCache;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const lookup = new Uint8Array(256);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < chars.length; i += 1) lookup[chars.charCodeAt(i)] = i;
  const normalized = base64.replace(/=/g, "");
  const bytes = new Uint8Array(Math.floor(normalized.length * 0.75));
  let byteIndex = 0;

  for (let i = 0; i < normalized.length; i += 4) {
    const enc1 = lookup[normalized.charCodeAt(i)];
    const enc2 = lookup[normalized.charCodeAt(i + 1)];
    const enc3 = lookup[normalized.charCodeAt(i + 2)];
    const enc4 = lookup[normalized.charCodeAt(i + 3)];
    const triplet = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
    if (byteIndex < bytes.length) bytes[byteIndex++] = (triplet >> 16) & 255;
    if (byteIndex < bytes.length) bytes[byteIndex++] = (triplet >> 8) & 255;
    if (byteIndex < bytes.length) bytes[byteIndex++] = triplet & 255;
  }

  return bytes;
};

const estimateBase64Bytes = (base64: string): number => {
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const ensureScreenableDataUrl = (dataUrl: string, message: string) => {
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64 || estimateBase64Bytes(base64) > MAX_INLINE_SCREEN_BYTES) {
    throw new Error(message);
  }
  return dataUrl;
};

const sanitizePostMediaExtension = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
};

const getAssetFileName = (asset: any, fallbackExt: string) => {
  const explicit = typeof asset?.fileName === "string" ? asset.fileName : "";
  const uriName = typeof asset?.uri === "string" ? asset.uri.split("?")[0].split("/").pop() || "" : "";
  return explicit || uriName || `post-media.${fallbackExt}`;
};

const resolvePostMediaExtension = (asset: any) => {
  const mimeExt = Object.entries(POST_MIME_BY_EXTENSION)
    .find(([, mime]) => mime === String(asset?.mimeType || "").toLowerCase())?.[0] || "";
  const name = getAssetFileName(asset, mimeExt || "jpg");
  const nameExt = name.includes(".") ? name.split(".").pop() : "";
  const uriExt = typeof asset?.uri === "string" && asset.uri.includes(".")
    ? asset.uri.split("?")[0].split(".").pop()
    : "";
  return sanitizePostMediaExtension(nameExt) || sanitizePostMediaExtension(uriExt) || sanitizePostMediaExtension(mimeExt) || "jpg";
};

const resolvePostMediaMimeType = (asset: any, ext: string) => {
  const pickedMime = typeof asset?.mimeType === "string" ? asset.mimeType.trim().toLowerCase() : "";
  return pickedMime && pickedMime !== "application/octet-stream"
    ? pickedMime
    : POST_MIME_BY_EXTENSION[ext] || "image/jpeg";
};

const resolvePostMediaType = (asset: any, mimeType: string, ext: string): "image" | "video" => {
  const pickerType = String(asset?.type || "").toLowerCase();
  if (pickerType === "video" || mimeType.startsWith("video/") || POST_VIDEO_EXTENSIONS.has(ext)) return "video";
  return "image";
};

const getPostMediaFileSize = async (asset: any) => {
  const pickerSize = Number(asset?.fileSize ?? asset?.size);
  if (Number.isFinite(pickerSize) && pickerSize > 0) return Math.floor(pickerSize);
  try {
    const info = await FileSystem.getInfoAsync(asset.uri);
    return info.exists && typeof info.size === "number" ? info.size : 0;
  } catch {
    return 0;
  }
};

const buildVideoThumbnailTimes = (durationMs?: number | null) => {
  const duration = Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
    ? Number(durationMs)
    : VIDEO_THUMBNAIL_INTERVAL_MS * VIDEO_THUMBNAIL_OPTION_LIMIT;
  const times: number[] = [0];
  for (
    let time = Math.min(VIDEO_THUMBNAIL_INTERVAL_MS, duration);
    time <= duration && times.length < VIDEO_THUMBNAIL_OPTION_LIMIT;
    time += VIDEO_THUMBNAIL_INTERVAL_MS
  ) {
    times.push(Math.floor(time));
  }
  return Array.from(new Set(times)).slice(0, VIDEO_THUMBNAIL_OPTION_LIMIT);
};

const buildVideoThumbnailChoices = async (asset: any): Promise<PostComposerThumbnail[]> => {
  const attempts = await Promise.allSettled(
    buildVideoThumbnailTimes(asset?.duration).map(async (time) => {
      const thumbnail = await VideoThumbnails.getThumbnailAsync(asset.uri, {
        time,
        quality: 0.72,
      });
      const base64 = await FileSystem.readAsStringAsync(thumbnail.uri, { encoding: "base64" });
      return {
        uri: thumbnail.uri,
        dataUrl: ensureScreenableDataUrl(
          `data:image/jpeg;base64,${base64}`,
          "Could not create a small enough video preview for safety screening.",
        ),
      };
    }),
  );

  const choices = attempts
    .filter((result): result is PromiseFulfilledResult<PostComposerThumbnail> => result.status === "fulfilled")
    .map((result) => result.value);

  if (choices.length === 0) {
    throw new Error("Could not create a video thumbnail for safety screening.");
  }

  return choices;
};

const preparePostComposerMedia = async (asset: any): Promise<PostComposerMedia> => {
  const ext = resolvePostMediaExtension(asset);
  const mimeType = resolvePostMediaMimeType(asset, ext);
  const mediaType = resolvePostMediaType(asset, mimeType, ext);

  if (mediaType === "image" && !POST_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error("This image type is not supported for posts.");
  }
  if (mediaType === "video" && !POST_VIDEO_EXTENSIONS.has(ext)) {
    throw new Error("This video type is not supported for posts.");
  }

  const size = await getPostMediaFileSize(asset);
  if (size > MAX_POST_MEDIA_BYTES) {
    throw new Error("Post media must be 50 MB or smaller.");
  }

  const name = getAssetFileName(asset, ext);
  const width = Number.isFinite(Number(asset?.width)) ? Number(asset.width) : null;
  const height = Number.isFinite(Number(asset?.height)) ? Number(asset.height) : null;
  const durationSeconds = mediaType === "video" && Number.isFinite(Number(asset?.duration))
    ? Math.max(0, Number(asset.duration) / 1000)
    : null;

  if (mediaType === "video") {
    const thumbnailChoices = await buildVideoThumbnailChoices(asset);
    const screeningSummary = await screenUploadsWithAi(
      thumbnailChoices.map((choice, index) => ({
        name: `${name} frame ${index + 1}`,
        mimeType: "image/jpeg",
        size,
        uri: `${asset.uri}#frame-${index + 1}`,
        contentDataUrl: choice.dataUrl,
        kind: "video" as const,
      })),
      "social_post_media",
    );

    if (!screeningSummary.allowed) {
      throw new Error(screeningSummary.reason || "This video did not pass safety screening.");
    }

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      uri: asset.uri,
      name,
      media_type: "video",
      mime_type: mimeType,
      ext,
      size,
      width,
      height,
      duration_seconds: durationSeconds,
      is_cover: false,
      thumbnailChoices,
      selectedThumbnailIndex: 0,
      safetyMetadata: { reason: screeningSummary.reason || null },
    };
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
  const screeningSummary = await screenUploadsWithAi(
    [{
      name,
      mimeType,
      size,
      uri: asset.uri,
      contentDataUrl: ensureScreenableDataUrl(
        `data:${mimeType};base64,${base64}`,
        "This image is too large to safety screen. Please choose an image under 4 MB.",
      ),
      kind: "photo" as const,
    }],
    "social_post_media",
  );

  if (!screeningSummary.allowed) {
    throw new Error(screeningSummary.reason || "This image did not pass safety screening.");
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    uri: asset.uri,
    name,
    media_type: "image",
    mime_type: mimeType,
    ext,
    size,
    width,
    height,
    is_cover: false,
    thumbnailChoices: [],
    selectedThumbnailIndex: 0,
    base64,
    safetyMetadata: { reason: screeningSummary.reason || null },
  };
};

const uploadPostMediaFile = async (
  uri: string,
  storagePath: string,
  mimeType: string,
  bytes?: Uint8Array,
) => {
  if (bytes) {
    return supabase.storage.from(POST_MEDIA_BUCKET).upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: true,
    });
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Your session expired. Please log in again before uploading media.");
  }

  const baseUrl = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
  const encodedPath = storagePath.split("/").map((part) => encodeURIComponent(part)).join("/");
  const uploadUrl = `${baseUrl}/storage/v1/object/${POST_MEDIA_BUCKET}/${encodedPath}`;
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      "Content-Type": mimeType,
      "x-upsert": "true",
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    let message = `Storage upload failed with status ${uploadResult.status}.`;
    try {
      const parsed = JSON.parse(uploadResult.body || "{}");
      message = parsed?.message || parsed?.error || message;
    } catch {
      if (uploadResult.body) message = uploadResult.body;
    }
    return { data: null, error: new Error(message) };
  }

  return { data: { path: storagePath }, error: null };
};

const KNOWN_FEED_MEDIA_BUCKETS = [
  "post-media",
  "posts",
  "images",
  "listings",
  "documents",
  "avatars",
];

const normalizeRelativeSupabaseStorageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!envBase) {
    return normalizedPath;
  }

  const base = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
  return `${base}${normalizedPath}`;
};

const resolveFeedMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.startsWith("/storage/v1/") || candidate.startsWith("storage/v1/")) {
    return normalizeRelativeSupabaseStorageUrl(candidate);
  }

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
  }

  if (candidate.includes("/storage/v1/object/public/")) {
    return candidate;
  }

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) {
    return candidate;
  }

  const normalized = candidate.replace(/^\/+/, "");
  const directParts = normalized.split("/");

  if (directParts.length > 1) {
    const directBucket = directParts[0];
    const directPath = directParts.slice(1).join("/");
    if (KNOWN_FEED_MEDIA_BUCKETS.includes(directBucket)) {
      const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
      if (data?.publicUrl) return data.publicUrl;
    }
  }

  for (const bucket of KNOWN_FEED_MEDIA_BUCKETS) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }

  return normalized;
};

const normalizeFeedPost = (post: any) => {
  const author = post?.author || {};
  const visibility = post?.visibility === "followers_only" ? "followers" : post?.visibility;
  const media = Array.isArray(post?.media)
    ? post.media.map((item: any) => ({
        ...item,
        url: resolveFeedMediaUrl(item?.url || item?.storage_path || item?.public_url),
        thumbnail_url: resolveFeedMediaUrl(item?.thumbnail_url || item?.thumbnail_path || item?.url || item?.storage_path || item?.public_url),
      }))
    : [];

  return {
    ...post,
    body: post?.body ?? post?.content ?? "",
    author_name: post?.author_name ?? author?.full_name ?? "User",
    author_avatar: post?.author_avatar ?? author?.avatar_url ?? "",
    my_reaction: post?.my_reaction ?? post?.user_reaction ?? null,
    visibility: visibility || "public",
    media,
  };
};

const formatGroupTypeLabel = (groupType: unknown) => {
  const normalized = typeof groupType === "string" ? groupType.toLowerCase() : "";
  return normalized === "duo" ? "Duo" : "Group";
};

const formatProfileRoleLabel = (role: unknown) => {
  const normalized = typeof role === "string" ? role.toLowerCase() : "";
  if (!normalized) return "Member";
  if (normalized === "musician") return "Musician";
  if (normalized === "producer") return "Producer";
  if (normalized === "venue-owner") return "Venue owner";
  if (normalized === "studio-owner") return "Studio owner";
  return normalized
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const normalizeFollowingEntity = (row: any, ownerAvatarById: Map<string, string> = new Map()) => {
  const followedType = normalizeSocialFollowTargetType(row?.followed_type);

  if (followedType === "group") {
    const group = row?.followed_group || {};
    const id = typeof group?.id === "string" && group.id.length > 0
      ? group.id
      : row?.followed_id;

    if (typeof id !== "string" || id.length === 0) {
      return null;
    }

    const images = Array.isArray(group?.images)
      ? group.images
          .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
          .map((value: string) => resolveFeedMediaUrl(value))
          .filter((value: string) => value.length > 0)
      : [];
    const ownerId = typeof group?.owner_id === "string" ? group.owner_id : "";
    const ownerAvatarUrl = ownerId ? resolveFeedMediaUrl(ownerAvatarById.get(ownerId) || "") : "";

    return {
      __feedKind: "following_entity",
      followed_type: "group" as const,
      id,
      name: group?.name || formatGroupTypeLabel(group?.group_type),
      avatar_url: images[0] || ownerAvatarUrl || getFeedFallbackImage("Group", id),
      group_type: group?.group_type || null,
      created_at: group?.created_at || row?.created_at || null,
    };
  }

  const followed = row?.followed || {};
  const id = typeof followed?.id === "string" && followed.id.length > 0
    ? followed.id
    : row?.followed_id;

  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  return {
    __feedKind: "following_entity",
    followed_type: "profile" as const,
    id,
    name: followed?.full_name || "User",
    avatar_url: resolveFeedMediaUrl(followed?.avatar_url || "") || getFeedFallbackImage("Artist", id),
    role: followed?.role || "",
    created_at: followed?.created_at || row?.created_at || null,
  };
};

const getFeedItemStableKey = (item: any) => {
  const kind = item?.__feedKind || "post";
  const id = typeof item?.id === "string" && item.id.length > 0 ? item.id : "";
  if (!id) return "";

  if (kind === "ai_card") {
    const type = typeof item?.type === "string" && item.type.length > 0 ? item.type : "item";
    return `${kind}:${type}:${id}`;
  }

  if (kind === "following_entity") {
    const followedType =
      typeof item?.followed_type === "string" && item.followed_type.length > 0
        ? item.followed_type
        : "entity";
    return `${kind}:${followedType}:${id}`;
  }

  return `${kind}:${id}`;
};

const getFeedItemListKey = (item: any, index: number) =>
  getFeedItemStableKey(item) || `row:${index}`;

const dedupeFeedItems = (items: any[]) => {
  const seen = new Set<string>();
  const uniqueItems: any[] = [];

  for (const item of items) {
    const key = getFeedItemStableKey(item);
    if (key) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
    }

    uniqueItems.push(item);
  }

  return uniqueItems;
};

const normalizeFeedUserRole = (role: unknown) =>
  typeof role === "string" ? role.trim().toLowerCase().replace(/[_\s]+/g, "-") : "";

const getPositiveInteger = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

type FeedCoordinate = {
  latitude: number;
  longitude: number;
};

const PH_LOCATION_COORDINATES: { keywords: string[]; coordinate: FeedCoordinate }[] = [
  { keywords: ["albay", "legazpi"], coordinate: { latitude: 13.1391, longitude: 123.7438 } },
  { keywords: ["daraga"], coordinate: { latitude: 13.1483, longitude: 123.7124 } },
  { keywords: ["naga"], coordinate: { latitude: 13.6218, longitude: 123.1948 } },
  { keywords: ["manila"], coordinate: { latitude: 14.5995, longitude: 120.9842 } },
  { keywords: ["makati"], coordinate: { latitude: 14.5547, longitude: 121.0244 } },
  { keywords: ["quezon city", "qc"], coordinate: { latitude: 14.676, longitude: 121.0437 } },
  { keywords: ["taguig", "bgc", "bonifacio global city"], coordinate: { latitude: 14.5176, longitude: 121.0509 } },
  { keywords: ["pasig"], coordinate: { latitude: 14.5764, longitude: 121.0851 } },
  { keywords: ["marikina"], coordinate: { latitude: 14.6507, longitude: 121.1029 } },
  { keywords: ["mandaluyong"], coordinate: { latitude: 14.5794, longitude: 121.0359 } },
  { keywords: ["paranaque", "parañaque"], coordinate: { latitude: 14.4793, longitude: 121.0198 } },
  { keywords: ["pasay"], coordinate: { latitude: 14.5378, longitude: 121.0014 } },
  { keywords: ["caloocan"], coordinate: { latitude: 14.7566, longitude: 121.045 } },
  { keywords: ["las pinas", "las piñas"], coordinate: { latitude: 14.4445, longitude: 120.9939 } },
  { keywords: ["muntinlupa", "alabang"], coordinate: { latitude: 14.4081, longitude: 121.0415 } },
  { keywords: ["cebu"], coordinate: { latitude: 10.3157, longitude: 123.8854 } },
  { keywords: ["davao"], coordinate: { latitude: 7.1907, longitude: 125.4553 } },
  { keywords: ["iloilo"], coordinate: { latitude: 10.7202, longitude: 122.5621 } },
  { keywords: ["bacolod"], coordinate: { latitude: 10.6765, longitude: 122.9509 } },
  { keywords: ["baguio"], coordinate: { latitude: 16.4023, longitude: 120.596 } },
  { keywords: ["cavite"], coordinate: { latitude: 14.4791, longitude: 120.896 } },
  { keywords: ["laguna"], coordinate: { latitude: 14.1709, longitude: 121.2437 } },
  { keywords: ["batangas"], coordinate: { latitude: 13.7565, longitude: 121.0583 } },
  { keywords: ["rizal", "antipolo"], coordinate: { latitude: 14.6255, longitude: 121.1245 } },
  { keywords: ["pampanga", "angeles"], coordinate: { latitude: 15.1456, longitude: 120.5887 } },
];

const toFeedCoordinateValue = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getItemCoordinates = (item: any): FeedCoordinate | null => {
  const latitude = toFeedCoordinateValue(item?.latitude ?? item?.lat);
  const longitude = toFeedCoordinateValue(item?.longitude ?? item?.lng);

  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
};

const getCoordinateFromLocationText = (value: unknown): FeedCoordinate | null => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!normalized.trim()) return null;
  const coordinateMatch = normalized.match(/(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/);
  if (coordinateMatch) {
    const latitude = Number(coordinateMatch[1]);
    const longitude = Number(coordinateMatch[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    ) {
      return { latitude, longitude };
    }
  }

  return PH_LOCATION_COORDINATES.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  )?.coordinate || null;
};

const getDistanceKm = (from: FeedCoordinate | null, to: FeedCoordinate | null) => {
  if (!from || !to) return null;

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const radiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatCompactPostType = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "Update";
  return raw
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatFeedPrice = (amount: number, unit = "", label = "") => {
  const formatted = `${PESO_SIGN}${amount.toLocaleString()}`;
  return `${formatted}${unit}${label ? ` ${label}` : ""}`;
};

type FeedQuickInfoItem = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

const getFeedQuickInfoIconMetrics = (icon: FeedQuickInfoItem["icon"]) => {
  switch (icon) {
    case "star":
      return { size: 16 };
    case "location":
      return { size: 18 };
    case "chatbubble-ellipses":
      return { size: 17 };
    default:
      return { size: 17 };
  }
};

const getFeedQuickInfoItems = (item: any): FeedQuickInfoItem[] => {
  const rating = Number(item?.rating || 0);
  const reviewCount = Number(item?.review_count || 0);
  const rawLocation = typeof item?.location === "string" ? item.location.trim() : "";
  const distanceKm = Number(item?.distance_km || item?.distanceKm || 0);
  const reviewLabel =
    reviewCount > 0
      ? `${reviewCount} ${reviewCount === 1 ? "Review" : "Reviews"}`
      : "No reviews yet";
  const locationLabel =
    distanceKm > 0
      ? `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km away`
      : item?.type === "Studio" || item?.type === "Venue"
        ? "Distance N/A"
        : rawLocation.split(",")[0]?.trim() || "Local";
  const ratingLabel =
    rating > 0
      ? `${rating.toFixed(1)} Rating`
      : item?.type === "Studio" || item?.type === "Venue"
        ? `New ${item?.type}`
        : "Featured";

  const quickInfoItems: FeedQuickInfoItem[] = [
    { icon: "star", label: ratingLabel },
    { icon: "location", label: locationLabel },
    { icon: "chatbubble-ellipses", label: reviewLabel },
  ];

  return quickInfoItems.filter((info) => info.label.length > 0);
};

const getFeedPriceChips = (item: any) => {
  const chips: string[] = [];
  const type = item?.type;
  const rehearsalRate = getPositiveInteger(item?.rehearsal_rate);
  const recordingRate = getPositiveInteger(item?.recording_rate);
  const hourlyRate = getPositiveInteger(item?.hourly_rate);
  const budget = getPositiveInteger(item?.budget);
  const numericRate = getPositiveInteger(item?.rate);

  if (type === "Studio" || type === "Venue") {
    if (rehearsalRate > 0) chips.push(formatFeedPrice(rehearsalRate, "/hr", "Rehearsal"));
    if (recordingRate > 0) chips.push(formatFeedPrice(recordingRate, "/song", "Recording"));
    if (chips.length === 0 && hourlyRate > 0) chips.push(formatFeedPrice(hourlyRate, "/hr"));
  } else if (budget > 0) {
    chips.push(formatFeedPrice(budget, "", "Budget"));
  } else if (numericRate > 0) {
    chips.push(formatFeedPrice(numericRate));
  } else if (typeof item?.rate === "string" && item.rate.trim() && item.rate !== "0") {
    const rawRate = item.rate.trim();
    chips.push(rawRate.startsWith(PESO_SIGN) ? rawRate : `${PESO_SIGN}${rawRate}`);
  }

  const productPrice = getPositiveInteger(item?.linked_product?.price || item?.linked_product?.amount);
  if (chips.length === 0 && productPrice > 0) {
    chips.push(formatFeedPrice(productPrice));
  }

  return chips.slice(0, 2);
};

const getFeedServiceBadges = (item: any) => {
  const badges: string[] = [];
  const type = item?.type;
  const studioType = typeof item?.studio_type === "string" ? item.studio_type : "";

  if (type === "Studio" || type === "Venue") {
    badges.push(type === "Venue" ? "Venue" : "Live Room");
    if (/rehearsal/i.test(studioType) || getPositiveInteger(item?.rehearsal_rate) > 0) {
      badges.push("Rehearsal");
    }
    if (/recording/i.test(studioType) || getPositiveInteger(item?.recording_rate) > 0) {
      badges.push("Recording");
    }
  } else if (type === "Gig") {
    badges.push("Live Gig");
  } else if (type === "Production") {
    badges.push("Production");
    if (item?.open_production_applications === true) {
      badges.push("Open Applications");
    }
  } else if (type === "Group") {
    badges.push(formatGroupTypeLabel(item?.group_type));
  } else if (type === "Artist") {
    badges.push("Artist");
  }

  if (item?.linked_playlist) badges.push("Playlist");
  if (item?.linked_product) badges.push("Merch");

  return Array.from(new Set(badges.filter(Boolean))).slice(0, 3);
};

const getFeedMediaUrls = (item: any) => {
  const mediaUrls = Array.isArray(item?.media)
    ? item.media
        .map((media: any) => resolveFeedMediaUrl(media?.thumbnail_url || media?.thumbnail_path || media?.url || media?.storage_path || media?.public_url))
        .filter((value: string) => value.length > 0)
    : [];
  if (mediaUrls.length > 0) return mediaUrls;

  const imageUrls = Array.isArray(item?.images)
    ? item.images
        .map((image: unknown) => resolveFeedMediaUrl(typeof image === "string" ? image : ""))
        .filter((value: string) => value.length > 0)
    : [];
  const primaryImage = resolveFeedMediaUrl(typeof item?.image === "string" ? item.image : "");
  return Array.from(new Set([primaryImage, ...imageUrls].filter((value) => value.length > 0)));
};

const SOCIAL_GALLERY_GAP = 3;
const SOCIAL_GALLERY_VISIBLE_LIMIT = 4;

type SocialMediaGalleryProps = {
  mediaUrls: string[];
  mediaWidth: number;
  onPress: () => void;
};

const SocialMediaGallery = React.memo(function SocialMediaGallery({
  mediaUrls,
  mediaWidth,
  onPress,
}: SocialMediaGalleryProps) {
  const visibleMedia = mediaUrls.slice(0, SOCIAL_GALLERY_VISIBLE_LIMIT);
  const remainingCount = Math.max(0, mediaUrls.length - visibleMedia.length);

  const renderImageCell = (
    uri: string,
    index: number,
    imageWidth: number,
    imageHeight: number,
    extraStyle?: any,
  ) => (
    <View key={`${uri}-${index}`} style={[styles.socialGalleryCell, extraStyle]}>
      <CachedImage
        uri={uri}
        style={styles.socialGalleryImage}
        width={Math.round(imageWidth)}
        height={Math.round(imageHeight)}
        contentFit="cover"
        priority={index === 0 ? "normal" : "low"}
      />
      {index === visibleMedia.length - 1 && remainingCount > 0 ? (
        <View style={styles.socialGalleryMoreOverlay}>
          <Text style={styles.socialGalleryMoreText}>+{remainingCount}</Text>
        </View>
      ) : null}
    </View>
  );

  if (visibleMedia.length === 0) return null;

  const singleHeight = 230;
  const halfWidth = (mediaWidth - SOCIAL_GALLERY_GAP) / 2;

  let galleryContent: React.ReactNode;

  if (visibleMedia.length === 1) {
    galleryContent = renderImageCell(visibleMedia[0], 0, mediaWidth, singleHeight, {
      height: singleHeight,
    });
  } else if (visibleMedia.length === 2) {
    const rowHeight = Math.round(halfWidth);
    galleryContent = (
      <View style={[styles.socialGalleryRow, { height: rowHeight }]}>
        {visibleMedia.map((uri, index) => renderImageCell(uri, index, halfWidth, rowHeight))}
      </View>
    );
  } else if (visibleMedia.length === 3) {
    const rowHeight = Math.round(mediaWidth * 0.72);
    const stackedHeight = (rowHeight - SOCIAL_GALLERY_GAP) / 2;
    galleryContent = (
      <View style={[styles.socialGalleryRow, { height: rowHeight }]}>
        {renderImageCell(visibleMedia[0], 0, halfWidth, rowHeight)}
        <View style={styles.socialGalleryColumn}>
          {renderImageCell(visibleMedia[1], 1, halfWidth, stackedHeight)}
          {renderImageCell(visibleMedia[2], 2, halfWidth, stackedHeight)}
        </View>
      </View>
    );
  } else {
    const rowHeight = Math.round(halfWidth * 0.82);
    galleryContent = (
      <View style={styles.socialGalleryGrid}>
        <View style={[styles.socialGalleryRow, { height: rowHeight }]}>
          {visibleMedia.slice(0, 2).map((uri, index) => renderImageCell(uri, index, halfWidth, rowHeight))}
        </View>
        <View style={[styles.socialGalleryRow, { height: rowHeight }]}>
          {visibleMedia.slice(2, 4).map((uri, index) =>
            renderImageCell(uri, index + 2, halfWidth, rowHeight),
          )}
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.92} onPress={onPress} style={styles.socialMediaWrap}>
      {galleryContent}
    </TouchableOpacity>
  );
});

const getFeedAvatarUri = (item: any) => {
  const avatar = resolveFeedMediaUrl(item?.author_avatar || item?.avatar_url || item?.logo_url || "");
  if (avatar) return avatar;
  return getFeedMediaUrls(item)[0] || getFeedFallbackImage(item?.type || "Artist", item?.id);
};

const getFeedDisplayName = (item: any) =>
  item?.__feedKind === "ai_card"
    ? item?.name || "MusikaLokal"
    : item?.author_name || "MusikaLokal";

const getFeedReportTargetType = (item: any) => {
  if (!item) return "";
  if (item?.__feedKind !== "ai_card") return "post";

  const type = String(item?.type || "").trim().toLowerCase();
  if (type === "artist" || type === "musician" || type === "profile") return "profile";
  if (type === "group") return "group";
  if (type === "studio" || type === "venue") return "studio";
  if (type === "gig") return "gig";
  if (type === "product") return "product";
  if (type === "playlist" || type === "music") return "playlist";
  return "";
};

const getFeedReportTypeLabel = (item: any) => {
  if (item?.__feedKind !== "ai_card") return "Post";
  const type = String(item?.type || "").trim();
  if (!type) return "Card";
  if (type.toLowerCase() === "artist") return "Artist";
  return type;
};

const isOwnFeedReportTarget = (item: any, currentUserId?: string | null) => {
  if (!item || !currentUserId) return false;
  if (item?.__feedKind !== "ai_card") {
    return item?.author_id === currentUserId;
  }

  const targetType = getFeedReportTargetType(item);
  if (targetType === "profile") return item?.id === currentUserId;
  return item?.owner_id === currentUserId || item?.organizer_id === currentUserId || item?.seller_id === currentUserId;
};

const getFeedOptionViewLabel = (item: any) => {
  if (item?.__feedKind !== "ai_card") return "Open Post";
  const type = String(item?.type || "").trim().toLowerCase();
  if (type === "artist" || type === "profile" || type === "musician") return "View Profile";
  if (type === "group") return "View Group";
  if (type === "venue") return "View Venue";
  if (type === "studio") return "View Studio";
  if (type === "gig") return "View Gig";
  if (type === "production") return "View Team";
  if (type === "product") return "View Product";
  if (type === "playlist" || type === "music") return "View Playlist";
  return "View Details";
};

const getFeedMetaLabel = (item: any) => {
  if (item?.__feedKind !== "ai_card") {
    return formatCompactPostType(item?.post_type);
  }

  const location = typeof item?.location === "string" ? item.location.trim() : "";
  const genre = typeof item?.genre === "string" ? item.genre.trim() : "";
  return location || genre || item?.type || "Featured";
};

const getFeedCaption = (item: any) => {
  if (item?.__feedKind !== "ai_card") {
    return item?.body || "Shared an update on MusikaLokal.";
  }

  const description = typeof item?.description === "string" ? item.description.trim() : "";
  if (description) return description;
  const aiReason = typeof item?.aiReason === "string" ? item.aiReason.trim() : "";
  if (aiReason) return aiReason;
  const type = item?.type === "Studio" ? "studio" : String(item?.type || "listing").toLowerCase();
  return `Featured ${type} from the local music community.`;
};

const getFeedTimestampLabel = (item: any, formatter: (value: string) => string) => {
  const timestamp = item?.created_at || item?.updated_at;
  if (typeof timestamp === "string" && timestamp.length > 0) return formatter(timestamp);
  return item?.__feedKind === "ai_card" ? "Featured now" : "Just now";
};

const getFeedPrimaryCtaLabel = (item: any) => {
  if (item?.__feedKind !== "ai_card") return "View Post";
  if (item?.type === "Studio") return "View Studio";
  if (item?.type === "Venue") return "View Venue";
  if (item?.type === "Artist") return "View Profile";
  if (item?.type === "Group") return "View Group";
  if (item?.type === "Gig") return "View Gig";
  if (item?.type === "Production") return "View Team";
  return "View Details";
};

const getStationSlots = (station: any) => {
  if (Array.isArray(station?.live_slots) && station.live_slots.length > 0) {
    return station.live_slots;
  }

  return Array.isArray(station?.slots) ? station.slots : [];
};

const getStationSlotCount = (station: any) => Number(
  station?.slot_count ?? station?.slot_playlist_ids?.length ?? getStationSlots(station).length ?? 0,
);

const getStationBroadcastStreamUrl = (station: any) => {
  const streamUrl = typeof station?.stream_url === "string" ? station.stream_url.trim() : "";
  if (!streamUrl || station?.is_active === false) {
    return "";
  }

  const streamStatus = typeof station?.stream_status === "string"
    ? station.stream_status.trim().toLowerCase()
    : "";
  return streamStatus === "live" ? streamUrl : "";
};

const hasStationPlayableItem = (item: any) => {
  const storagePath = typeof item?.teaser?.storage_path === "string" && item.teaser.storage_path.trim().length > 0;
  const teaserFilePath = typeof item?.teaser?.file_path === "string" && item.teaser.file_path.trim().length > 0;
  const itemStoragePath = typeof item?.storage_path === "string" && item.storage_path.trim().length > 0;

  if (storagePath || teaserFilePath || itemStoragePath) {
    return true;
  }

  const directCandidates = [
    item?.audio_url,
    item?.audioUrl,
    item?.public_url,
    item?.publicUrl,
    item?.signed_url,
    item?.signedUrl,
    item?.url,
    item?.teaser?.audio_url,
    item?.teaser?.audioUrl,
    item?.teaser?.public_url,
    item?.teaser?.publicUrl,
    item?.teaser?.signed_url,
    item?.teaser?.signedUrl,
    item?.teaser?.url,
  ];

  return directCandidates.some((candidate) => Boolean(resolveRadioMediaUrl(candidate)));
};

const getStationPlayableTrackCount = (station: any) =>
  getStationSlots(station).reduce((total: number, slot: any) => {
    const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
    return total + items.filter(hasStationPlayableItem).length;
  }, 0);

const isStationPlayable = (station: any) => Boolean(
  getStationBroadcastStreamUrl(station) || getStationPlayableTrackCount(station) > 0,
);

const getStationNowPlayingTitle = (station: any, slotIndex = 0) => {
  if (getStationBroadcastStreamUrl(station)) {
    return station?.now_playing_title || station?.name || "Live broadcast";
  }

  const slots = getStationSlots(station);
  const slot = slots[slotIndex] || slots[0] || null;
  const firstItem = Array.isArray(slot?.playlist?.items) ? slot.playlist.items[0] : null;

  return (
    firstItem?.title ||
    slot?.playlist?.title ||
    slot?.label ||
    "Local artist spotlight"
  );
};

const FEED_RADIO_CACHE_TTL_MS = 60_000;
const FEED_RADIO_DEFER_MS = 250;
type FeedLiveRadioRequest = {
  recommendationEnabled?: boolean;
  recommendationUserId?: string | null;
};
let feedRadioStationCache: { fetchedAt: number; key: string; station: any | null } = {
  fetchedAt: 0,
  key: "guest",
  station: null,
};
let feedRadioStationPromise: { key: string; promise: Promise<any | null> } | null = null;

const getFeedRadioCacheKey = (request?: FeedLiveRadioRequest) => (
  request?.recommendationEnabled && request.recommendationUserId
    ? `for-you:${request.recommendationUserId}`
    : "guest"
);

const getFreshFeedRadioStationCache = (cacheKey = "guest") => {
  if (feedRadioStationCache.key !== cacheKey) {
    return null;
  }

  if (Date.now() - feedRadioStationCache.fetchedAt >= FEED_RADIO_CACHE_TTL_MS) {
    return null;
  }

  return feedRadioStationCache;
};

const fetchFeedLiveRadioStation = async (request?: FeedLiveRadioRequest) => {
  const cacheKey = getFeedRadioCacheKey(request);
  const shouldUseRecommendation = Boolean(request?.recommendationEnabled && request?.recommendationUserId);
  const freshCache = getFreshFeedRadioStationCache(cacheKey);
  if (freshCache) {
    logLoadTime("FeedRadio", "cache-hit", {
      details: {
        cacheKey,
        playableStations: freshCache.station && isStationPlayable(freshCache.station) ? 1 : 0,
        stations: freshCache.station ? 1 : 0,
      },
    });
    return freshCache.station;
  }

  if (feedRadioStationPromise?.key === cacheKey) {
    logLoadTime("FeedRadio", "dedupe-hit", {
      details: { cacheKey, includeItems: true },
    });
    return feedRadioStationPromise.promise;
  }

  const promise = (async () => {
    const fetchStations = async (featuredOnly: boolean, useRecommendation = false) => {
      const startedAt = Date.now();
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "browse_stations",
          featured_only: featuredOnly,
          include_items: true,
          limit: useRecommendation ? 12 : 5,
          ...(useRecommendation ? { recommendation_mode: "for_you" } : {}),
        },
      });

      if (error) {
        throw error;
      }

      const rows = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.stations)
          ? data.stations
          : [];

      logLoadTime("FeedRadio", "edge-complete", {
        details: {
          featuredOnly,
          provider: data?.aiProvider || "",
          recommended: useRecommendation,
          playableStations: rows.filter(isStationPlayable).length,
          stations: rows.length,
        },
        durationMs: Date.now() - startedAt,
      });

      return rows;
    };

    const fetchPlaylistStationFallback = async () => {
      const startedAt = Date.now();
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "browse_playlists",
          limit: 3,
        },
      });

      if (error) {
        throw error;
      }

      const playlists = Array.isArray(data?.data) ? data.data : [];
      logLoadTime("FeedRadio", "playlist-fallback-start", {
        details: { playlists: playlists.length },
        durationMs: Date.now() - startedAt,
      });

      for (const playlist of playlists) {
        if (!playlist?.id) {
          continue;
        }

        const detailsStartedAt = Date.now();
        const { data: detailsData, error: detailsError } = await supabase.functions.invoke("manage-playlists", {
          body: {
            action: "get_playlist_details",
            playlist_id: playlist.id,
          },
        });

        if (detailsError) {
          console.warn("Live radio playlist fallback details error:", detailsError);
          continue;
        }

        const detailedPlaylist = detailsData?.data || playlist;
        const items = Array.isArray(detailedPlaylist?.items) ? detailedPlaylist.items : [];
        const playableItems = items.filter(hasStationPlayableItem);
        logLoadTime("FeedRadio", "playlist-fallback-detail-complete", {
          details: {
            items: items.length,
            playableItems: playableItems.length,
            playlistId: playlist.id,
          },
          durationMs: Date.now() - detailsStartedAt,
        });

        if (playableItems.length === 0) {
          continue;
        }

        const stationName = typeof detailedPlaylist?.title === "string" && detailedPlaylist.title.trim().length > 0
          ? `${detailedPlaylist.title.trim()} Radio`
          : "MusikaLokal Radio";

        return {
          __playlistFallback: true,
          __queueReady: true,
          cover_image_url: detailedPlaylist?.cover_image_url || null,
          created_at: detailedPlaylist?.created_at,
          creator: detailedPlaylist?.creator || null,
          description: detailedPlaylist?.description || null,
          genre: detailedPlaylist?.genre || null,
          id: `playlist-radio:${playlist.id}`,
          is_active: true,
          live_slots: [
            {
              id: `playlist-slot:${playlist.id}`,
              label: detailedPlaylist?.title || "Now Playing",
              playlist: {
                ...detailedPlaylist,
                items,
                track_count: items.length,
              },
              position: 0,
            },
          ],
          name: stationName,
          slot_count: 1,
          slots: [
            {
              id: `playlist-slot:${playlist.id}`,
              label: detailedPlaylist?.title || "Now Playing",
              playlist: {
                ...detailedPlaylist,
                items,
                track_count: items.length,
              },
              position: 0,
            },
          ],
          updated_at: detailedPlaylist?.updated_at,
        };
      }

      return null;
    };

    const startedAt = Date.now();
    logLoadTime("FeedRadio", "fetch-start", {
      details: { cacheKey, includeItems: true, recommended: shouldUseRecommendation },
    });

    const recommendedStations = shouldUseRecommendation
      ? await fetchStations(false, true)
      : [];
    const featuredStations = recommendedStations.some(isStationPlayable)
      ? []
      : await fetchStations(true);
    let stations = recommendedStations.some(isStationPlayable)
      ? recommendedStations
      : featuredStations.some(isStationPlayable)
        ? featuredStations
        : await fetchStations(false);
    if (!stations.some(isStationPlayable)) {
      const playlistStation = await fetchPlaylistStationFallback();
      stations = playlistStation ? [playlistStation] : stations;
    }

    const station = stations.find(isStationPlayable) || stations[0] || null;
    feedRadioStationCache = {
      fetchedAt: Date.now(),
      key: cacheKey,
      station,
    };

    logLoadTime("FeedRadio", "fetch-complete", {
      details: {
        playableStations: stations.filter(isStationPlayable).length,
        recommended: shouldUseRecommendation,
        stations: stations.length,
      },
      durationMs: Date.now() - startedAt,
    });

    return station;
  })();
  feedRadioStationPromise = { key: cacheKey, promise };

  try {
    return await promise;
  } finally {
    if (feedRadioStationPromise?.key === cacheKey) {
      feedRadioStationPromise = null;
    }
  }
};

type LiveRadioCardProps = {
  borderColor: string;
  cardColor: string;
  isDark: boolean;
  primaryColor: string;
  recommendationEnabled: boolean;
  recommendationUserId: string | null;
  textColor: string;
  mutedTextColor: string;
};

const LiveRadioCard = React.memo(function LiveRadioCard({
  borderColor,
  cardColor,
  isDark,
  primaryColor,
  recommendationEnabled,
  recommendationUserId,
  textColor,
  mutedTextColor,
}: LiveRadioCardProps) {
  const {
    activeStation,
    currentSlotIndex,
    currentTrack,
    isPlaying,
    loadingStationId,
    togglePlayPause,
    tuneIn,
  } = useRadioPlayer();
  const radioRequest = useMemo<FeedLiveRadioRequest>(() => ({
    recommendationEnabled,
    recommendationUserId,
  }), [recommendationEnabled, recommendationUserId]);
  const radioCacheKey = useMemo(() => getFeedRadioCacheKey(radioRequest), [radioRequest]);
  const cachedRadioStation = getFreshFeedRadioStationCache(radioCacheKey)?.station ?? null;
  const [featuredStation, setFeaturedStation] = useState<any | null>(cachedRadioStation);
  const [loadingStation, setLoadingStation] = useState(!cachedRadioStation);

  useEffect(() => {
    let cancelled = false;
    const cachedStation = getFreshFeedRadioStationCache(radioCacheKey)?.station ?? null;

    if (cachedStation) {
      setFeaturedStation(cachedStation);
      setLoadingStation(false);
      return () => {
        cancelled = true;
      };
    }

    setLoadingStation(true);
    const deferTimer = setTimeout(() => {
      void fetchFeedLiveRadioStation(radioRequest)
        .then((station) => {
          if (!cancelled) {
            setFeaturedStation(station);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            console.warn("Live radio station fetch error:", error);
            logLoadTime("FeedRadio", "fetch-failed", {
              error: error instanceof Error ? error.message : String(error),
            });
            setFeaturedStation(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingStation(false);
          }
        });
    }, FEED_RADIO_DEFER_MS);

    return () => {
      cancelled = true;
      clearTimeout(deferTimer);
    };
  }, [radioCacheKey, radioRequest]);

  useEffect(() => {
    if (!activeStation?.id) {
      return;
    }

    setLoadingStation(false);
  }, [activeStation?.id]);

  const liveFeaturedStation = featuredStation && isStationPlayable(featuredStation)
    ? featuredStation
    : null;
  const displayStation = activeStation || liveFeaturedStation || null;
  const hasDisplayStation = Boolean(displayStation?.id);
  const hasBroadcastStream = Boolean(getStationBroadcastStreamUrl(displayStation));
  const stationSlotCount = getStationSlotCount(displayStation);
  const stationPlayableTrackCount = getStationPlayableTrackCount(displayStation);
  const isCurrentStation = Boolean(
    displayStation?.id && activeStation?.id && displayStation.id === activeStation.id,
  );
  const isTuneInLoading = Boolean(
    displayStation?.id && loadingStationId === displayStation.id,
  );
  const canTuneIn = Boolean(
    displayStation?.id &&
    displayStation?.is_active !== false &&
    (hasBroadcastStream || stationPlayableTrackCount > 0)
  );
  const stationName =
    typeof displayStation?.name === "string" && displayStation.name.trim().length > 0
      ? displayStation.name.trim()
      : hasDisplayStation
        ? "MusikaLokal Radio"
        : "No live station";
  const nowPlayingTitle = hasDisplayStation
    ? isCurrentStation
      ? currentTrack?.title || getStationNowPlayingTitle(displayStation, currentSlotIndex)
      : getStationNowPlayingTitle(displayStation, 0)
    : "Check back for live stations";
  const primaryTrackTitle = hasDisplayStation
    ? currentTrack?.title || getStationNowPlayingTitle(displayStation, currentSlotIndex)
    : nowPlayingTitle;
  const stationRecommendationReason =
    displayStation?.ai_reason ||
    displayStation?.recommendation_reason ||
    "";
  const primaryArtistName =
    currentTrack?.sourceArtistName ||
    displayStation?.now_playing_artist ||
    displayStation?.managed_group?.name ||
    displayStation?.managed_profile?.full_name ||
    "MusikaLokal artists";
  const liveRadioSubtitle = Array.from(
    new Set(
      [primaryTrackTitle, primaryArtistName]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  ).join(" | ");
  const stationArtworkUrl = displayStation?.cover_image_url || displayStation?.creator?.avatar_url || null;

  const handlePlayPress = useCallback(async () => {
    if (!displayStation || loadingStation || isTuneInLoading) {
      return;
    }

    if (!canTuneIn) {
      emitToast({
        type: "info",
        title: "Station offline",
        message: "This station needs a live stream or at least one playable playlist track before it can play.",
      });
      return;
    }

    try {
      if (isCurrentStation) {
        await togglePlayPause();
        return;
      }

      await tuneIn({
        ...displayStation,
        __queueReady: displayStation.__queueReady === true,
      });
    } catch (error: any) {
      emitToast({
        type: "error",
        title: "Radio unavailable",
        message: error?.message || "Unable to start this station right now.",
      });
    }
  }, [
    canTuneIn,
    displayStation,
    isCurrentStation,
    isTuneInLoading,
    loadingStation,
    togglePlayPause,
    tuneIn,
  ]);
  const handleTuneIn = handlePlayPress;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={handleTuneIn}
      style={[styles.liveRadioCard, { backgroundColor: cardColor, borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={isCurrentStation ? "Toggle live radio playback" : "Tune in to live radio"}
    >
      <View style={[styles.liveRadioIcon, { backgroundColor: primaryColor + "18" }]}>
        {stationArtworkUrl ? (
          <CachedImage uri={stationArtworkUrl} style={styles.liveRadioArtwork} />
        ) : (
          <Ionicons name={isCurrentStation && isPlaying ? "volume-high" : "radio"} size={20} color={primaryColor} />
        )}
      </View>
      <View style={styles.liveRadioContent}>
        <View style={styles.liveRadioEyebrowRow}>
          <View style={[styles.liveDot, { backgroundColor: isPlaying && isCurrentStation ? "#22C55E" : primaryColor }]} />
          <Text style={[styles.liveRadioEyebrow, { color: primaryColor }]}>
            {stationRecommendationReason ? "For You Radio" : "Live Radio"}
          </Text>
        </View>
        <Text style={[styles.liveRadioTitle, { color: textColor }]} numberOfLines={1}>
          {stationName}
        </Text>
        <Text style={[styles.liveRadioSubtitle, { color: mutedTextColor }]} numberOfLines={1}>
          {liveRadioSubtitle}
        </Text>
        <Text style={[styles.liveRadioMeta, { color: mutedTextColor }]} numberOfLines={1}>
          {stationRecommendationReason
            ? stationRecommendationReason
            : hasBroadcastStream
            ? "Broadcast stream"
            : `${stationSlotCount} ${stationSlotCount === 1 ? "slot" : "slots"} | ${stationPlayableTrackCount} playable tracks`}
        </Text>
      </View>
      <View style={[styles.liveRadioPlayButton, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#FFFFFF" }]}>
        {isTuneInLoading ? (
          <ActivityIndicator size="small" color={primaryColor} />
        ) : (
          <Ionicons
            name={isCurrentStation && isPlaying ? "pause" : "play"}
            size={18}
            color={primaryColor}
          />
        )}
      </View>
    </TouchableOpacity>
  );
});

type SocialFeedCardProps = {
  item: any;
  borderColor: string;
  cardColor: string;
  colors: any;
  followBusy: boolean;
  followTarget: { id: string; type: SocialFollowTargetType } | null;
  isDark: boolean;
  isFollowing: boolean;
  mediaWidth: number;
  onFollow: (id: string, targetType: SocialFollowTargetType, isFollowing: boolean) => void;
  onOpenListing: (listingId: string) => void;
  onOpenPost: (postId: string) => void;
  onOpenPostOptions?: (post: any) => void;
  onOpenProduct: (productId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenProductionTeam: (teamId: string) => void;
  onOpenPlaylist: (playlistId: string) => void;
  onSharePost?: (post: any) => void;
  onToggleReaction?: (post: any) => void;
  showAuthorFollow: boolean;
  timeAgo: (value: string) => string;
};

const SocialFeedCard = React.memo(function SocialFeedCard({
  item,
  borderColor,
  cardColor,
  colors,
  followBusy,
  followTarget,
  isDark,
  isFollowing,
  mediaWidth,
  onFollow,
  onOpenListing,
  onOpenPost,
  onOpenPostOptions,
  onOpenProduct,
  onOpenProfile,
  onOpenProductionTeam,
  onOpenPlaylist,
  onSharePost,
  onToggleReaction,
  showAuthorFollow,
  timeAgo,
}: SocialFeedCardProps) {
  const isSuggestion = item?.__feedKind === "ai_card";
  const mediaUrls = useMemo(() => getFeedMediaUrls(item), [item]);
  const badges = useMemo(() => getFeedServiceBadges(item), [item]);
  const headerBadge = badges[0] || "";
  const bodyBadges = headerBadge ? badges.slice(1) : badges;
  const priceChips = useMemo(() => getFeedPriceChips(item), [item]);
  const quickInfoItems = useMemo(() => getFeedQuickInfoItems(item), [item]);
  const avatarUri = useMemo(() => getFeedAvatarUri(item), [item]);
  const displayName = getFeedDisplayName(item);
  const metaLabel = getFeedMetaLabel(item);
  const caption = getFeedCaption(item);
  const timestamp = getFeedTimestampLabel(item, timeAgo);
  const primaryCtaLabel = getFeedPrimaryCtaLabel(item);

  const handleOpenPrimary = useCallback(() => {
    if (isSuggestion) {
      if (item?.type === "Production") {
        onOpenProductionTeam(item.id);
        return;
      }
      if (item?.type === "Artist") {
        onOpenProfile(item.id);
        return;
      }
      onOpenListing(item.id);
      return;
    }

    onOpenPost(item.id);
  }, [isSuggestion, item?.id, item?.type, onOpenListing, onOpenPost, onOpenProductionTeam, onOpenProfile]);

  const handleFollow = useCallback(() => {
    if (!followTarget?.id || !followTarget?.type) return;
    onFollow(followTarget.id, followTarget.type, isFollowing);
  }, [followTarget, isFollowing, onFollow]);

  const handleLinkedPlaylist = useCallback(() => {
    if (item?.linked_playlist?.id) {
      onOpenPlaylist(item.linked_playlist.id);
    }
  }, [item?.linked_playlist?.id, onOpenPlaylist]);

  const handleLinkedProduct = useCallback(() => {
    if (item?.linked_product?.id) {
      onOpenProduct(item.linked_product.id);
    }
  }, [item?.linked_product?.id, onOpenProduct]);

  const hasLiked = Boolean(item?.my_reaction || item?.user_reaction);

  const handleMoreOptions = useCallback(() => {
    if (onOpenPostOptions) {
      onOpenPostOptions(item);
      return;
    }

    if (isSuggestion) {
      handleOpenPrimary();
      return;
    }

  }, [handleOpenPrimary, isSuggestion, item, onOpenPostOptions]);

  const reactionCount = Number(item?.reaction_count || 0);
  const commentCount = Number(item?.comment_count || 0);
  const shareCount = Number(item?.share_count || 0);

  return (
    <View
      style={[
        styles.socialPostCard,
        {
          backgroundColor: cardColor,
          borderColor,
          shadowOpacity: isDark ? 0 : 0.07,
        },
      ]}
    >
      <View style={styles.socialPostHeader}>
        <TouchableOpacity activeOpacity={0.78} onPress={handleOpenPrimary} style={styles.socialAvatarWrap}>
          {avatarUri ? (
            <CachedImage
              uri={avatarUri}
              style={styles.socialAvatar}
              width={44}
              height={44}
              priority="high"
            />
          ) : (
            <View style={[styles.socialAvatarFallback, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="musical-notes" size={20} color={colors.primary} />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.78} onPress={handleOpenPrimary} style={styles.socialHeaderText}>
          <Text style={[styles.socialName, { color: colors.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.socialMetaRow}>
            <Text style={[styles.socialMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {metaLabel}
            </Text>
            <Text style={[styles.socialMetaDot, { color: colors.textSecondary }]}>•</Text>
            <Text style={[styles.socialMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {timestamp}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.socialHeaderActions}>
          {showAuthorFollow ? (
            <TouchableOpacity
              activeOpacity={followBusy ? 1 : 0.78}
              disabled={followBusy}
              onPress={handleFollow}
              style={[
                styles.socialFollowButton,
                {
                  backgroundColor: isFollowing ? (isDark ? "#111827" : "#FFFFFF") : colors.primary,
                  borderColor: isFollowing ? borderColor : colors.primary,
                  opacity: followBusy ? 0.7 : 1,
                },
              ]}
            >
              {followBusy ? (
                <ActivityIndicator size="small" color={isFollowing ? colors.textSecondary : "#FFFFFF"} />
              ) : (
                <Text style={[styles.socialFollowText, { color: isFollowing ? colors.textSecondary : "#FFFFFF" }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}

          {headerBadge ? (
            <View style={[styles.socialHeaderBadgeChip, { backgroundColor: colors.primary + "12" }]}>
              <Text style={[styles.socialHeaderBadgeText, { color: colors.primary }]} numberOfLines={1}>
                {headerBadge}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="More options" onPress={handleMoreOptions} style={styles.socialMenuButton}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={handleOpenPrimary}>
        <Text style={[styles.socialCaption, { color: colors.text }]} numberOfLines={3}>
          {caption}
        </Text>
      </TouchableOpacity>

      {mediaUrls.length > 0 ? (
        <SocialMediaGallery mediaUrls={mediaUrls} mediaWidth={mediaWidth} onPress={handleOpenPrimary} />
      ) : null}

      {bodyBadges.length > 0 || priceChips.length > 0 ? (
        <View style={styles.socialChipRow}>
          {bodyBadges.map((badge) => (
            <View key={`badge-${badge}`} style={[styles.socialBadgeChip, { backgroundColor: colors.primary + "12" }]}>
              <Text style={[styles.socialBadgeText, { color: colors.primary }]} numberOfLines={1}>
                {badge}
              </Text>
            </View>
          ))}
          {priceChips.map((price) => (
            <View key={`price-${price}`} style={[styles.socialPriceChip, { borderColor: colors.primary + "55" }]}>
              <Text style={[styles.socialPriceText, { color: colors.primary }]} numberOfLines={1}>
                {price}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {item?.linked_playlist ? (
        <TouchableOpacity
          activeOpacity={0.78}
          style={[styles.socialLinkedCard, { backgroundColor: isDark ? "#111827" : "#F5F3FF", borderColor }]}
          onPress={handleLinkedPlaylist}
        >
          <Ionicons name="musical-notes" size={15} color={colors.primary} />
          <Text style={[styles.socialLinkedText, { color: colors.primary }]} numberOfLines={1}>
            {item.linked_playlist.title}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </TouchableOpacity>
      ) : null}

      {item?.linked_product ? (
        <TouchableOpacity
          activeOpacity={0.78}
          style={[styles.socialLinkedCard, { backgroundColor: isDark ? "#111827" : "#F0FDF4", borderColor }]}
          onPress={handleLinkedProduct}
        >
          <Ionicons name="cart" size={15} color="#22C55E" />
          <Text style={[styles.socialLinkedText, { color: "#22C55E" }]} numberOfLines={1}>
            {item.linked_product.title}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#22C55E" />
        </TouchableOpacity>
      ) : null}

      {isSuggestion ? (
        <View style={[styles.socialQuickInfoRow, { borderTopColor: borderColor }]}>
          {quickInfoItems.map((info, index) => {
            const iconMetrics = getFeedQuickInfoIconMetrics(info.icon);

            return (
              <View
                key={`${info.icon}-${info.label}`}
                style={[
                  styles.socialQuickInfoItem,
                  index === 0 && styles.socialQuickInfoItemStart,
                  index === quickInfoItems.length - 1 && styles.socialQuickInfoItemEnd,
                ]}
              >
                <View style={styles.socialQuickInfoIconBox}>
                  <Ionicons
                    name={info.icon}
                    size={iconMetrics.size}
                    color={info.icon === "star" ? "#F59E0B" : colors.primary}
                    style={styles.socialQuickInfoIcon}
                  />
                </View>
                <Text style={[styles.socialQuickInfoText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {info.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {isSuggestion ? (
        <View style={styles.socialCtaRow}>
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={handleOpenPrimary}
            style={[styles.socialPrimaryCta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.socialPrimaryCtaText}>{primaryCtaLabel}</Text>
          </TouchableOpacity>

          {followTarget ? (
            <TouchableOpacity
              activeOpacity={followBusy ? 1 : 0.78}
              disabled={followBusy}
              onPress={handleFollow}
              style={[
                styles.socialSecondaryCta,
                {
                  borderColor,
                  opacity: followBusy ? 0.7 : 1,
                },
              ]}
            >
              {followBusy ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <Text style={[styles.socialSecondaryCtaText, { color: colors.textSecondary }]}>
                  {isFollowing ? "Following" : "Follow"}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.socialStatsRow}>
            <Text style={[styles.socialStatsText, { color: colors.textSecondary }]}>
              {formatCountLabel(reactionCount, "like")}
            </Text>
            <Text style={[styles.socialStatsText, { color: colors.textSecondary }]}>
              {formatCountLabel(commentCount, "comment")}
            </Text>
            <Text style={[styles.socialStatsText, { color: colors.textSecondary }]}>
              {formatCountLabel(shareCount, "share")}
            </Text>
          </View>
          <View style={[styles.socialActionRow, { borderTopColor: borderColor }]}>
            <TouchableOpacity
              activeOpacity={0.78}
              style={styles.socialActionButton}
              onPress={() => onToggleReaction?.(item)}
            >
              <Ionicons name={hasLiked ? "heart" : "heart-outline"} size={18} color={hasLiked ? "#EF4444" : colors.textSecondary} />
              <Text style={[styles.socialActionText, { color: hasLiked ? "#EF4444" : colors.textSecondary }]}>Like</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.78} style={styles.socialActionButton} onPress={handleOpenPrimary}>
              <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Comment</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.78} style={styles.socialActionButton} onPress={() => onSharePost?.(item)}>
              <Ionicons name="share-social-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
});

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, isGuest, loading: authLoading, roleResolved, userRole } = useAuth();
  const resolvedUserId = session?.user?.id ?? userId ?? null;
  const canUseSocialActions = Boolean(session?.access_token && resolvedUserId && !isGuest);
  const params = useLocalSearchParams<{ reopenListingId?: string }>();
  const { clearBottomOverlays } = useBottomOverlay();
  const { activeStation } = useRadioPlayerPresence();
  const insets = useSafeAreaInsets();
  const groqModelLabel = getGroqModelInfo().modelLabel;
  const feedIdentityKey = resolvedUserId ?? "guest";

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [aiCards, setAiCards] = useState<any[]>([]);
  const [aiFeedMessage, setAiFeedMessage] = useState("");
  const [aiFeedProvider, setAiFeedProvider] = useState(groqModelLabel);
  const [isAiCardsLoading, setIsAiCardsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [followingKeys, setFollowingKeys] = useState<Set<string>>(new Set());
  const [followingEntities, setFollowingEntities] = useState<any[]>([]);
  const [followBusyByKey, setFollowBusyByKey] = useState<Record<string, boolean>>({});

  // Create-post modal
  const [showCreate, setShowCreate] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [postVisibility, setPostVisibility] = useState<"public" | "followers">("public");
  const [postMedia, setPostMedia] = useState<PostComposerMedia[]>([]);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaStatus, setMediaStatus] = useState("");
  const [creating, setCreating] = useState(false);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [postOptionsTarget, setPostOptionsTarget] = useState<any | null>(null);
  const [reportTarget, setReportTarget] = useState<any | null>(null);
  const [deletePostTarget, setDeletePostTarget] = useState<any | null>(null);
  const composerInputRef = React.useRef<TextInput>(null);
  const composerFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const createPostSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const searchSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const bottomSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const productionTeamSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const activeTabRef = React.useRef<FeedTab>(tab);
  const feedCacheRef = React.useRef<Record<FeedTab, FeedCacheEntry>>(feedScreenCache);
  const feedInFlightRef = React.useRef<Record<FeedTab, boolean>>({ for_you: false, following: false });
  const feedRequestIdRef = React.useRef<Record<FeedTab, number>>({ for_you: 0, following: 0 });
  const feedPublicFallbackCursorRef = React.useRef<string | null>(null);
  const feedCacheIdentityRef = React.useRef(feedScreenCacheIdentity);
  const followingKeysRef = React.useRef<Set<string>>(new Set());
  const hasFocusedFeedRef = React.useRef(false);
  const previousTabRef = React.useRef<FeedTab>(tab);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedListingPreview, setSelectedListingPreview] = useState<any | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedProductionTeamId, setSelectedProductionTeamId] = useState<string | null>(null);
  const [pendingReopenListingId, setPendingReopenListingId] = useState<string | null>(null);
  const canCreatePosts = useMemo(() => {
    const role = typeof userRole === "string" ? userRole.toLowerCase() : "";
    return Boolean(session && resolvedUserId && ["fan", "musician", "producer", "studio-owner", "venue-owner", "admin"].includes(role));
  }, [resolvedUserId, session, userRole]);
  const feedHeaderName = useMemo(() => {
    if (isGuest) return "Guest";

    const userMeta = (session?.user?.user_metadata || {}) as { full_name?: string; name?: string };
    const displayName = userMeta.full_name || userMeta.name || session?.user?.email?.split("@")[0] || "there";
    return displayName.trim().split(/\s+/)[0] || "there";
  }, [isGuest, session?.user?.email, session?.user?.user_metadata]);
  const shouldPersonalizeForYouFeed = Boolean(resolvedUserId && !isGuest);
  const openPostOptions = useCallback((post: any) => {
    if (!post?.id) return;
    setPostOptionsTarget(post);
  }, []);
  const composerCanSubmit = Boolean(
    normalizeVisibleInput(postBody) ||
    postMedia.length > 0 ||
    (editingPost && !mediaBusy),
  );
  const composerSheetSnapPoints = useMemo(() => ["88%"], []);
  const composerSheetAnimationConfigs = useBottomSheetSpringConfigs(bottomSheetSpringConfig);
  const composerSheetBackgroundStyle = useMemo(
    () => ({
      backgroundColor: colors.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    }),
    [colors.surface],
  );
  const composerSheetHandleIndicatorStyle = useMemo(
    () => ({
      backgroundColor: isDark ? "#4B5563" : "#E5E7EB",
      width: 40,
    }),
    [isDark],
  );
  const renderComposerBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior={creating || mediaBusy ? "none" : "close"}
        onPress={Keyboard.dismiss}
      />
    ),
    [creating, mediaBusy],
  );

  const forYouFeedQuery = useFeedQuery({
    enabled: false,
    feedTab: "for_you",
    feedType: shouldPersonalizeForYouFeed ? "for_you" : "public",
    limit: FEED_PAGE_SIZE,
    personalize: shouldPersonalizeForYouFeed,
    userId: resolvedUserId,
  });
  const followingFeedQuery = useFeedQuery({
    enabled: false,
    feedTab: "following",
    feedType: "following",
    limit: FEED_PAGE_SIZE,
    userId: resolvedUserId,
  });
  const forYouFeedQueryRef = React.useRef(forYouFeedQuery);
  const followingFeedQueryRef = React.useRef(followingFeedQuery);

  useEffect(() => {
    forYouFeedQueryRef.current = forYouFeedQuery;
    followingFeedQueryRef.current = followingFeedQuery;
  }, [followingFeedQuery, forYouFeedQuery]);

  useEffect(() => {
    followingKeysRef.current = followingKeys;
  }, [followingKeys]);

  const applyFollowingStateToRecommendationCards = useCallback((cards: any[]) => {
    const keys = followingKeysRef.current;

    return cards.map((card) => {
      const targetType = card?.social_follow_target_type === "group" ? "group" : "profile";
      const targetId = typeof card?.social_follow_target_id === "string" && card.social_follow_target_id.length > 0
        ? card.social_follow_target_id
        : null;
      const followKey = targetId ? buildSocialFollowKey(targetType, targetId) : "";

      if (!followKey) {
        return card;
      }

      return {
        ...card,
        is_following: card?.is_following === true || keys.has(followKey),
      };
    });
  }, []);

  usePageLoadLogger({
    counts: {
      aiCards: aiCards.length,
      followingEntities: followingEntities.length,
      posts: posts.length,
    },
    details: {
      hasMore,
      tab,
      user: resolvedUserId ? "signed-in" : "guest",
    },
    loading: loading || authLoading,
    page: "Feed",
    queries: {
      followingFeed: followingFeedQuery,
      forYouFeed: forYouFeedQuery,
    },
    ready: !authLoading && !loading,
    refreshing,
  });

  useEffect(() => {
    activeTabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    if (feedCacheIdentityRef.current === feedIdentityKey && feedScreenCacheIdentity === feedIdentityKey) {
      return;
    }

    feedCacheIdentityRef.current = feedIdentityKey;
    feedCacheRef.current = resetFeedScreenCacheForIdentity(groqModelLabel, feedIdentityKey);
    feedPublicFallbackCursorRef.current = null;
    feedInFlightRef.current = { for_you: false, following: false };
    feedRequestIdRef.current = {
      for_you: feedRequestIdRef.current.for_you + 1,
      following: feedRequestIdRef.current.following + 1,
    };
    setFollowingKeys(new Set());
    setFollowingEntities([]);
    setFollowBusyByKey({});
    setPosts([]);
    setAiCards([]);
    setAiFeedMessage("");
    setAiFeedProvider(groqModelLabel);
    setHasMore(false);
    setLoading(Boolean(session && !isGuest && !authLoading));
    setRefreshing(false);
    setLoadingMore(false);
  }, [authLoading, feedIdentityKey, groqModelLabel, isGuest, session]);

  const applyFeedSnapshot = useCallback((snapshot: FeedCacheEntry) => {
    setPosts(snapshot.posts);
    setAiCards(snapshot.aiCards);
    setAiFeedMessage(normalizeAiFeedMessage(snapshot.aiFeedMessage || ""));
    setAiFeedProvider(normalizeAiFeedProvider(snapshot.aiFeedProvider || groqModelLabel));
    setHasMore(snapshot.hasMore);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
  }, [groqModelLabel]);

  const isEmptyForYouSnapshot = useCallback((snapshot: FeedCacheEntry) => (
    snapshot.posts.length === 0 && snapshot.aiCards.length === 0
  ), []);

  const buildFeedSnapshotFromPages = useCallback((feedTab: FeedTab, data: any): FeedCacheEntry | null => {
    const pages = Array.isArray(data?.pages) ? data.pages : [];
    if (pages.length === 0) {
      return null;
    }

    const nextFollowingKeys = followingKeysRef.current;
    const latestPage = pages[pages.length - 1] as any;
    const fetchedPosts = pages
      .flatMap((page: any) =>
        Array.isArray(page?.items)
          ? page.items
          : Array.isArray(page?.data)
            ? page.data
            : [],
      )
      .map(normalizeFeedPost)
      .map((post: any) => ({
        ...post,
        is_following:
          post.is_following === true ||
          nextFollowingKeys.has(buildSocialFollowKey("profile", post.author_id)),
      }));
    const nextPosts = fetchedPosts;
    const cachedEntry = feedCacheRef.current[feedTab];

    const shouldKeepRecommendationCards = feedTab === "for_you";

    return {
      posts: nextPosts,
      aiCards: shouldKeepRecommendationCards ? cachedEntry.aiCards : [],
      aiFeedMessage: shouldKeepRecommendationCards ? normalizeAiFeedMessage(cachedEntry.aiFeedMessage || "") : "",
      aiFeedProvider:
        shouldKeepRecommendationCards
          ? normalizeAiFeedProvider(cachedEntry.aiFeedProvider || groqModelLabel)
          : groqModelLabel,
      hasMore: Boolean(latestPage?.nextCursor),
      loaded: true,
    };
  }, [groqModelLabel]);

  const hydrateCachedFeed = useCallback((feedTab: FeedTab) => {
    const cached = feedCacheRef.current[feedTab];
    if (!cached.loaded) {
      const queryData =
        feedTab === "following"
          ? followingFeedQueryRef.current.data
          : forYouFeedQueryRef.current.data;
      const querySnapshot = buildFeedSnapshotFromPages(feedTab, queryData);

      if (!querySnapshot) {
        return false;
      }

      feedCacheRef.current[feedTab] = querySnapshot;
      applyFeedSnapshot(querySnapshot);
      return true;
    }

    applyFeedSnapshot(cached);
    return true;
  }, [applyFeedSnapshot, buildFeedSnapshotFromPages]);

  const invalidateFeedCache = useCallback((feedTab: FeedTab) => {
    feedCacheRef.current[feedTab] = {
      ...feedCacheRef.current[feedTab],
      loaded: false,
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    feedCacheRef.current[tab] = {
      posts,
      aiCards,
      aiFeedMessage,
      aiFeedProvider,
      hasMore,
      loaded: true,
    };
  }, [aiCards, aiFeedMessage, aiFeedProvider, hasMore, loading, posts, tab]);

  const presentModalWithRetry = useCallback((modalRef: { current: any }) => {
    if (modalRef.current) {
      modalRef.current.present();
      return;
    }

    let attempts = 0;
    const maxAttempts = 6;

    const presentWhenReady = () => {
      if (modalRef.current) {
        modalRef.current.present();
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        requestAnimationFrame(presentWhenReady);
      }
    };

    requestAnimationFrame(presentWhenReady);
  }, []);

  const openSearchSheet = useCallback(() => {
    presentModalWithRetry(searchSheetRef as any);
  }, [presentModalWithRetry]);

  const openProductionTeamSheet = useCallback(() => {
    presentModalWithRetry(productionTeamSheetRef as any);
  }, [presentModalWithRetry]);

  const openDetailsSheet = useCallback(() => {
    presentModalWithRetry(bottomSheetRef as any);
  }, [presentModalWithRetry]);

  const openListingDetails = useCallback(
    (listingId: string, initialListing?: any | null) => {
      if (!listingId) return;
      setSelectedListingPreview(initialListing || null);
      setSelectedListingId(listingId);
      openDetailsSheet();
    },
    [openDetailsSheet],
  );

  const openProductionTeamDetails = useCallback(
    (teamId: string) => {
      if (!teamId) return;
      setSelectedProductionTeamId(teamId);
      openProductionTeamSheet();
    },
    [openProductionTeamSheet],
  );

  const handleSearchSheetClose = useCallback(() => {
    clearBottomOverlays();
  }, [clearBottomOverlays]);

  const handleDetailsSheetDismiss = useCallback(() => {
    clearBottomOverlays();
    setSelectedListingId(null);
    setSelectedListingPreview(null);
    setPendingReopenListingId(null);
  }, [clearBottomOverlays]);

  const handleProductionTeamSheetDismiss = useCallback(() => {
    clearBottomOverlays();
    setSelectedProductionTeamId(null);
  }, [clearBottomOverlays]);

  useEffect(() => {
    if (!pendingReopenListingId) return;
    if (selectedListingId !== pendingReopenListingId) return;

    let attempts = 0;
    const maxAttempts = 10;

    const presentWhenReady = () => {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.present();
        setPendingReopenListingId(null);
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(presentWhenReady, 60);
      } else {
        setPendingReopenListingId(null);
      }
    };

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          presentWhenReady();
        });
      });
    });

    return () => {
      interactionTask.cancel();
    };
  }, [pendingReopenListingId, selectedListingId]);

  useEffect(() => {
    const reopenListingId = Array.isArray(params.reopenListingId)
      ? params.reopenListingId[0]
      : params.reopenListingId;

    if (!reopenListingId || reopenListingId.length === 0) return;

    setSelectedListingId(reopenListingId);
    setPendingReopenListingId(reopenListingId);

    try {
      router.setParams({ reopenListingId: undefined as any });
    } catch {
      // Older router states may not accept clearing params here; the listing still opens.
    }
  }, [params.reopenListingId]);

  const fetchAiCardsForYou = useCallback(async (): Promise<FeedAiCardsResult> => {
    if (!session || !resolvedUserId || !roleResolved) {
      return { cards: [], provider: groqModelLabel, message: "" };
    }

    setIsAiCardsLoading(true);

    try {
      try {
        const aiInvokeResult = await withAiRecommendationTimeout(
          supabase.functions.invoke("home-feed", {
            body: {
              action: "for-you",
              limit: AI_CARD_LIMIT,
              userId: resolvedUserId,
            },
          }),
        );

        if (!aiInvokeResult) {
          logLoadTime("Feed", "home-feed-ai-timeout", {
            timeoutMs: AI_RECOMMENDATION_TIMEOUT_MS,
          });
        } else if (aiInvokeResult.error) {
          logFeedInvokeError("home-feed:for-you", aiInvokeResult.error, {
            action: "for-you",
            userId: resolvedUserId,
          });
        } else {
          const recommendations = Array.isArray(aiInvokeResult.data?.recommendations)
            ? aiInvokeResult.data.recommendations
            : Array.isArray(aiInvokeResult.data?.aiRecommendations)
              ? aiInvokeResult.data.aiRecommendations
              : [];
          const cards = recommendations
            .map(normalizeAiRecommendationCard)
            .filter((card: any) => typeof card?.id === "string" && card.id.length > 0)
            .slice(0, AI_CARD_LIMIT);

          if (cards.length > 0) {
            return {
              cards: applyFollowingStateToRecommendationCards(cards),
              provider: normalizeAiFeedProvider(aiInvokeResult.data?.aiProvider || aiInvokeResult.data?.provider || groqModelLabel),
              message: normalizeAiFeedMessage(
                aiInvokeResult.data?.message ||
                (aiInvokeResult.data?.aiPowered
                  ? "AI-ranked For You feed is active."
                  : "Showing profile-ranked recommendations."),
              ),
            };
          }
        }
      } catch (aiError: any) {
        logFeedInvokeError("home-feed:for-you", aiError, {
          action: "for-you",
          userId: resolvedUserId,
        });
      }

      // Primary queries with strict filters (matching Home)
      const [groupsResult, studiosResult, gigsResult, artistsResult, teamsResult, viewerProfileResult] = await Promise.all([
        supabase
          .from("groups_with_stats")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("studios_with_stats")
          .select("*")
          .eq("permit_status", "approved")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("gigs_with_stats")
          .select("*")
          .neq("status", "cancelled")
          .eq("permit_status", "approved")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, address, role, created_at")
          .eq("role", "musician")
          .eq("is_verified", true)
          .eq("verification_status", "APPROVED")
          .neq("id", resolvedUserId)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("production_teams")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("profiles")
          .select("address, location")
          .eq("id", resolvedUserId)
          .maybeSingle(),
      ]);


      // If strict queries all return empty, try relaxed queries (drop permit_status)
      const strictTotal = (groupsResult.data || []).length + (studiosResult.data || []).length +
        (gigsResult.data || []).length + (artistsResult.data || []).length + (teamsResult.data || []).length;

      let relaxedStudios: any[] = [];
      let relaxedGigs: any[] = [];
      let relaxedProfiles: any[] = [];

      if (strictTotal === 0) {
        const [relaxedStudiosResult, relaxedGigsResult, relaxedProfilesResult] = await Promise.all([
          supabase
            .from("studios_with_stats")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(24),
          supabase
            .from("gigs_with_stats")
            .select("*")
            .neq("status", "cancelled")
            .order("created_at", { ascending: false })
            .limit(24),
          supabase
            .from("profiles")
            .select("id, full_name, avatar_url, address, role, created_at")
            .eq("role", "musician")
            .eq("is_verified", true)
            .eq("verification_status", "APPROVED")
            .neq("id", resolvedUserId)
            .order("created_at", { ascending: false })
            .limit(24),
        ]);

        relaxedStudios = relaxedStudiosResult.data || [];
        relaxedGigs = relaxedGigsResult.data || [];
        relaxedProfiles = relaxedProfilesResult.data || [];

      }

      // Use strict results if available, else relaxed fallback
      const finalGroups = groupsResult.data || [];
      const finalStudios = (studiosResult.data || []).length > 0 ? studiosResult.data! : relaxedStudios;
      const finalGigs = (gigsResult.data || []).length > 0 ? gigsResult.data! : relaxedGigs;
      const finalArtists = (artistsResult.data || []).length > 0 ? artistsResult.data! : relaxedProfiles;
      const finalTeams = teamsResult.data || [];
      const viewerProfile = (viewerProfileResult.data || {}) as {
        address?: string | null;
        location?: string | null;
      };
      const viewerCoordinates = getCoordinateFromLocationText(viewerProfile.address || viewerProfile.location || "");
      const withFeedDistance = (item: any) => {
        const itemCoordinates = getItemCoordinates(item) || getCoordinateFromLocationText(item?.location);
        const distanceKm = getDistanceKm(viewerCoordinates, itemCoordinates);
        return {
          ...item,
          distance_km: distanceKm === null ? null : Number(distanceKm.toFixed(1)),
        };
      };

      const artistIds = finalArtists
        .map((row: any) => row?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0);

      let artistGenresById = new Map<string, string[]>();
      let artistSkillsById = new Map<string, string[]>();
      let teamOwnerById = new Map<string, { full_name: string; avatar_url: string | null }>();

      if (artistIds.length > 0) {
        const [genreRows, skillRows] = await Promise.all([
          supabase
            .from("profile_genres")
            .select("profile_id, genre")
            .in("profile_id", artistIds),
          supabase
            .from("profile_skills")
            .select("profile_id, skill")
            .in("profile_id", artistIds),
        ]);

        artistGenresById = new Map<string, string[]>();
        for (const row of genreRows.data || []) {
          if (typeof row?.profile_id !== "string" || typeof row?.genre !== "string") continue;
          const next = artistGenresById.get(row.profile_id) || [];
          next.push(row.genre);
          artistGenresById.set(row.profile_id, next);
        }

        artistSkillsById = new Map<string, string[]>();
        for (const row of skillRows.data || []) {
          if (typeof row?.profile_id !== "string" || typeof row?.skill !== "string") continue;
          const next = artistSkillsById.get(row.profile_id) || [];
          next.push(row.skill);
          artistSkillsById.set(row.profile_id, next);
        }
      }

      const teamOwnerIds = Array.from(
        new Set(
          finalTeams
            .map((row: any) => row?.owner_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      if (teamOwnerIds.length > 0) {
        const { data: ownerRows } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", teamOwnerIds);

        teamOwnerById = new Map(
          (ownerRows || [])
            .filter((row: any) => typeof row?.id === "string")
            .map((row: any) => [
              row.id,
              {
                full_name: row?.full_name || "Producer",
                avatar_url: typeof row?.avatar_url === "string" ? row.avatar_url : null,
              },
            ]),
        );
      }

      const normalizedGroups = finalGroups.map((item: any) => ({
        id: item.id,
        type: "Group",
        name: item.name || "Unnamed Group",
        image: Array.isArray(item.images) ? item.images[0] || null : null,
        images: Array.isArray(item.images) ? item.images : [],
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        location: item.location || "",
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        genre: item.genre || "",
        group_type: item.group_type || null,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        social_follow_target_id: item.id,
        social_follow_target_type: "group",
      }));

      const normalizedStudios = finalStudios.map((item: any) => {
        const isVenue = Array.isArray(item?.amenities)
          ? item.amenities.some((amenity: any) => String(amenity || "").toLowerCase().includes("stage"))
          : false;
        const listingType = isVenue ? "Venue" : "Studio";

        return {
          id: item.id,
          type: listingType,
          name: item.name || `Unnamed ${listingType}`,
          image: Array.isArray(item.images) ? item.images[0] || null : null,
          images: Array.isArray(item.images) ? item.images : [],
          rating: Number(item.rating || 0),
          review_count: Number(item.review_count || 0),
          location: item.address || "",
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
          genre: item.type || listingType,
          created_at: item.created_at || null,
          updated_at: item.updated_at || null,
          owner_id: item.owner_id || null,
          hourly_rate: item.hourly_rate?.toString() || null,
          rehearsal_rate: item.rehearsal_rate?.toString() || null,
          recording_rate: item.recording_rate?.toString() || null,
          studio_type: item.type || null,
          social_follow_target_id: item.owner_id || null,
          social_follow_target_type: "profile",
        };
      });

      const normalizedGigs = finalGigs.map((item: any) => ({
        id: item.id,
        type: "Gig",
        name: item.name || "Untitled Gig",
        image: Array.isArray(item.images) ? item.images[0] || null : null,
        images: Array.isArray(item.images) ? item.images : [],
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        location: item.location || "",
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        genre: Array.isArray(item?.requirements?.genres)
          ? item.requirements.genres.join(", ")
          : item?.requirements?.genre || "",
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        organizer_id: item.organizer_id || null,
        budget: item.budget?.toString() || null,
        rate: item.rate?.toString() || null,
        requirements: item.requirements || null,
        social_follow_target_id: item.organizer_id || null,
        social_follow_target_type: "profile",
      }));

      const normalizedArtists = finalArtists.map((item: any) => ({
        id: item.id,
        type: "Artist",
        name: item.full_name || "Artist",
        image: item.avatar_url || null,
        images: item.avatar_url ? [item.avatar_url] : [],
        rating: 0,
        review_count: 0,
        location: item.address || "",
        genre: (artistGenresById.get(item.id) || []).join(", "),
        genres: artistGenresById.get(item.id) || [],
        skills: artistSkillsById.get(item.id) || [],
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.id,
        social_follow_target_id: item.id,
        social_follow_target_type: "profile",
      }));

      const normalizedTeams = finalTeams.map((item: any) => {
        const owner = teamOwnerById.get(item.owner_id);
        const primaryImage = item.logo_url || owner?.avatar_url || null;

        return {
          id: item.id,
          type: "Production",
          name: item.name || "Production Team",
          image: primaryImage,
          images: primaryImage ? [primaryImage] : [],
          rating: 0,
          review_count: 0,
          location: item.description || owner?.full_name || "Production Team",
          genre: "",
          description: item.description || "",
          created_at: item.created_at || null,
          updated_at: item.updated_at || null,
          owner_id: item.owner_id || null,
          owner_name: owner?.full_name || null,
          logo_url: item.logo_url || null,
          open_production_applications: item.open_production_applications === true,
          social_follow_target_id: item.owner_id || null,
          social_follow_target_type: "profile",
        };
      });

      const allCandidates = [
        ...normalizedGroups,
        ...normalizedStudios,
        ...normalizedGigs,
        ...normalizedArtists,
        ...normalizedTeams,
      ]
        .map(withFeedDistance)
        .map(ensureFeedCardImage);

      if (allCandidates.length === 0) {
        return { cards: [], provider: "", message: "" };
      }

      return {
        cards: applyFollowingStateToRecommendationCards(
          sortFeedItemsNewestFirst(allCandidates)
            .slice(0, AI_CARD_LIMIT)
            .map((item) => ({ ...ensureFeedCardImage(item), __feedKind: "ai_card" })),
        ),
        provider: "Latest",
        message: "Showing the newest posts and listings.",
      };
    } catch (error: any) {
      console.error("Feed AI cards error:", error);
      return {
        cards: [],
        provider: "Normal Feed",
        message: error?.message || "Unable to load recommendation cards right now.",
      };
    }
  }, [applyFollowingStateToRecommendationCards, groqModelLabel, resolvedUserId, roleResolved, session]);

  const loadFollowingGraph = useCallback(async () => {
    if (!session) {
      setFollowingKeys(new Set());
      setFollowingEntities([]);
      return { keys: new Set<string>(), entities: [] as any[] };
    }

    const { data: followingResponse, error } = await supabase.functions.invoke("manage-social-feed", {
      body: { action: "get_following" },
    });

    if (error) {
      logFeedInvokeError("manage-social-feed:get_following", error, {
        action: "get_following",
      });
      throw error;
    }

    const rows = Array.isArray(followingResponse?.data) ? followingResponse.data : [];
    const groupOwnerIds = Array.from(
      new Set(
        rows
          .map((row: any) => row?.followed_group?.owner_id)
          .filter((value: any): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    let ownerAvatarById = new Map<string, string>();

    if (groupOwnerIds.length > 0) {
      const { data: ownerRows } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", groupOwnerIds);

      ownerAvatarById = new Map(
        (ownerRows || [])
          .filter((row: any) => typeof row?.id === "string")
          .map((row: any) => [row.id, typeof row?.avatar_url === "string" ? row.avatar_url : ""]),
      );
    }

    const keys = new Set<string>(
      rows
        .map((row: any) => buildSocialFollowKey(row?.followed_type, row?.followed_id))
        .filter((value: string) => value.length > 0),
    );
    const followedProfileIds = Array.from(
      new Set(
        rows
          .filter((row: any) => normalizeSocialFollowTargetType(row?.followed_type) === "profile")
          .map((row: any) => row?.followed_id)
          .filter((value: any): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    const followedGroupIds = Array.from(
      new Set(
        rows
          .filter((row: any) => normalizeSocialFollowTargetType(row?.followed_type) === "group")
          .map((row: any) => row?.followed_id)
          .filter((value: any): value is string => typeof value === "string" && value.length > 0),
      ),
    );
    const fallbackEntities = rows
      .map((row: any) => normalizeFollowingEntity(row, ownerAvatarById))
      .filter((value: any) => value !== null);

    const emptyQueryResult = { data: [], error: null } as any;
    const [
      followedProfilesResult,
      followedGroupsResult,
      ownedGroupsResult,
      studiosResult,
      gigsResult,
      teamsResult,
    ] = await Promise.all([
      followedProfileIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, full_name, avatar_url, address, role, created_at")
            .eq("is_verified", true)
            .eq("verification_status", "APPROVED")
            .in("id", followedProfileIds)
        : Promise.resolve(emptyQueryResult),
      followedGroupIds.length > 0
        ? supabase
            .from("groups_with_stats")
            .select("*")
            .in("id", followedGroupIds)
            .order("created_at", { ascending: false })
            .limit(AI_CARD_LIMIT)
        : Promise.resolve(emptyQueryResult),
      followedProfileIds.length > 0
        ? supabase
            .from("groups_with_stats")
            .select("*")
            .in("owner_id", followedProfileIds)
            .order("created_at", { ascending: false })
            .limit(AI_CARD_LIMIT)
        : Promise.resolve(emptyQueryResult),
      followedProfileIds.length > 0
        ? supabase
            .from("studios_with_stats")
            .select("*")
            .eq("permit_status", "approved")
            .in("owner_id", followedProfileIds)
            .order("created_at", { ascending: false })
            .limit(AI_CARD_LIMIT)
        : Promise.resolve(emptyQueryResult),
      followedProfileIds.length > 0
        ? supabase
            .from("gigs_with_stats")
            .select("*")
            .neq("status", "cancelled")
            .eq("permit_status", "approved")
            .in("organizer_id", followedProfileIds)
            .order("created_at", { ascending: false })
            .limit(AI_CARD_LIMIT)
        : Promise.resolve(emptyQueryResult),
      followedProfileIds.length > 0
        ? supabase
            .from("production_teams")
            .select("*")
            .in("owner_id", followedProfileIds)
            .order("created_at", { ascending: false })
            .limit(AI_CARD_LIMIT)
        : Promise.resolve(emptyQueryResult),
    ]);

    const partialErrors = [
      followedProfilesResult,
      followedGroupsResult,
      ownedGroupsResult,
      studiosResult,
      gigsResult,
      teamsResult,
    ]
      .map((result: any) => result?.error?.message)
      .filter((message: any): message is string => typeof message === "string" && message.length > 0);

    if (partialErrors.length > 0) {
      logLoadTime("Feed", "following-entities-partial", {
        errors: partialErrors.slice(0, 3),
      });
    }

    const followedProfiles = followedProfilesResult.data || [];
    const visibleFollowedProfileIds = new Set(
      followedProfiles
        .map((profile: any) => profile?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0),
    );
    const followedProfilesById = new Map<string, any>(
      followedProfiles
        .filter((profile: any) => typeof profile?.id === "string")
        .map((profile: any) => [profile.id, profile] as [string, any]),
    );
    const normalizeImages = (images: any) =>
      Array.isArray(images)
        ? images
            .map((image: any) => resolveFeedMediaUrl(image))
            .filter((image: string) => image.length > 0)
        : [];
    const toProfileCard = (profile: any) => {
      const avatar = resolveFeedMediaUrl(profile?.avatar_url || "");
      return ensureFeedCardImage({
        __feedKind: "ai_card",
        id: profile.id,
        type: "Artist",
        name: profile.full_name || "Musician",
        image: avatar || null,
        images: avatar ? [avatar] : [],
        rating: 0,
        review_count: 0,
        location: profile.address || "",
        genre: "",
        created_at: profile.created_at || null,
        updated_at: profile.created_at || null,
        owner_id: profile.id,
        social_follow_target_id: profile.id,
        social_follow_target_type: "profile",
        is_following: true,
      });
    };
    const toGroupCard = (item: any) => {
      const images = normalizeImages(item?.images);
      return ensureFeedCardImage({
        __feedKind: "ai_card",
        id: item.id,
        type: "Group",
        name: item.name || "Unnamed Group",
        image: images[0] || null,
        images,
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        location: item.location || "",
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        genre: item.genre || "",
        group_type: item.group_type || null,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        social_follow_target_id: item.id,
        social_follow_target_type: "group",
        is_following: keys.has(buildSocialFollowKey("group", item.id)),
      });
    };
    const toStudioCard = (item: any) => {
      const images = normalizeImages(item?.images);
      const isVenue = Array.isArray(item?.amenities)
        ? item.amenities.some((amenity: any) => String(amenity || "").toLowerCase().includes("stage"))
        : false;
      const listingType = isVenue ? "Venue" : "Studio";

      return ensureFeedCardImage({
        __feedKind: "ai_card",
        id: item.id,
        type: listingType,
        name: item.name || `Unnamed ${listingType}`,
        image: images[0] || null,
        images,
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        location: item.address || item.location || "",
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        genre: item.type || listingType,
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        hourly_rate: item.hourly_rate?.toString() || null,
        rehearsal_rate: item.rehearsal_rate?.toString() || null,
        recording_rate: item.recording_rate?.toString() || null,
        studio_type: item.type || null,
        social_follow_target_id: item.owner_id || null,
        social_follow_target_type: "profile",
        is_following: keys.has(buildSocialFollowKey("profile", item.owner_id)),
      });
    };
    const toGigCard = (item: any) => {
      const images = normalizeImages(item?.images);
      return ensureFeedCardImage({
        __feedKind: "ai_card",
        id: item.id,
        type: "Gig",
        name: item.name || "Untitled Gig",
        image: images[0] || null,
        images,
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        location: item.location || "",
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        genre: Array.isArray(item?.requirements?.genres)
          ? item.requirements.genres.join(", ")
          : item?.requirements?.genre || "",
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        organizer_id: item.organizer_id || null,
        budget: item.budget?.toString() || null,
        rate: item.rate?.toString() || null,
        requirements: item.requirements || null,
        social_follow_target_id: item.organizer_id || null,
        social_follow_target_type: "profile",
        is_following: keys.has(buildSocialFollowKey("profile", item.organizer_id)),
      });
    };
    const toTeamCard = (item: any) => {
      const owner = followedProfilesById.get(item.owner_id);
      const ownerAvatar = resolveFeedMediaUrl(owner?.avatar_url || "");
      const primaryImage = resolveFeedMediaUrl(item.logo_url || "") || ownerAvatar || null;

      return ensureFeedCardImage({
        __feedKind: "ai_card",
        id: item.id,
        type: "Production",
        name: item.name || "Production Team",
        image: primaryImage,
        images: primaryImage ? [primaryImage] : [],
        rating: 0,
        review_count: 0,
        location: item.description || owner?.full_name || "Production Team",
        genre: "",
        description: item.description || "",
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        owner_name: owner?.full_name || null,
        logo_url: item.logo_url || null,
        open_production_applications: item.open_production_applications === true,
        social_follow_target_id: item.owner_id || null,
        social_follow_target_type: "profile",
        is_following: keys.has(buildSocialFollowKey("profile", item.owner_id)),
      });
    };

    const latestEntityCards = dedupeFeedItems(
      sortFeedItemsNewestFirst([
        ...followedProfiles
          .filter((profile: any) => normalizeFeedUserRole(profile?.role) === "musician")
          .map(toProfileCard),
        ...(followedGroupsResult.data || []).map(toGroupCard),
        ...(ownedGroupsResult.data || [])
          .filter((item: any) => visibleFollowedProfileIds.has(item?.owner_id))
          .map(toGroupCard),
        ...(studiosResult.data || [])
          .filter((item: any) => visibleFollowedProfileIds.has(item?.owner_id))
          .map(toStudioCard),
        ...(gigsResult.data || [])
          .filter((item: any) => visibleFollowedProfileIds.has(item?.organizer_id))
          .map(toGigCard),
        ...(teamsResult.data || [])
          .filter((item: any) => visibleFollowedProfileIds.has(item?.owner_id))
          .map(toTeamCard),
      ]),
    ).slice(0, AI_CARD_LIMIT);
    const entities = latestEntityCards.length > 0 ? latestEntityCards : fallbackEntities;

    followingKeysRef.current = keys;
    setFollowingKeys(keys);
    setFollowingEntities(entities);

    return { keys, entities };
  }, [session]);

  /* ── Data fetching ── */
  const fetchFeed = useCallback(async (feedTab: FeedTab, append = false, currentLength = 0) => {
    if (authLoading || (isForYouFeedTab(feedTab) && Boolean(resolvedUserId) && !isGuest && !roleResolved)) {
      return;
    }

    if (isForYouFeedTab(feedTab) && session && !isGuest && !resolvedUserId) {
      return;
    }

    if (!session) {
      feedCacheRef.current = resetFeedScreenCacheForIdentity(groqModelLabel, "guest");
      feedCacheIdentityRef.current = "guest";
      feedPublicFallbackCursorRef.current = null;
      setFollowingKeys(new Set());
      setFollowingEntities([]);
      setFollowBusyByKey({});

      if (activeTabRef.current === feedTab) {
        applyFeedSnapshot(createEmptyFeedCacheEntry(groqModelLabel));
      }

      return;
    }

    if (feedInFlightRef.current[feedTab]) {
      return;
    }

    feedInFlightRef.current[feedTab] = true;
    const requestId = ++feedRequestIdRef.current[feedTab];

    try {
      if (isForYouFeedTab(feedTab)) {
        if (append) {
          const cachedEntry = feedCacheRef.current[feedTab];
          const queryResult = await forYouFeedQueryRef.current.fetchNextPage();

          if (queryResult.error) {
            logFeedInvokeError("manage-social-feed:get_feed", queryResult.error, {
              action: "get_feed",
              feedTab,
              feedType: shouldPersonalizeForYouFeed ? "for_you" : "public",
              append,
              currentLength,
            });
            throw queryResult.error;
          }

          const querySnapshot = buildFeedSnapshotFromPages(feedTab, queryResult.data);
          const nextSnapshot: FeedCacheEntry = querySnapshot
            ? {
                ...querySnapshot,
                aiCards: cachedEntry.aiCards,
                aiFeedMessage: cachedEntry.aiFeedMessage,
                aiFeedProvider: cachedEntry.aiFeedProvider,
              }
            : {
                ...cachedEntry,
                hasMore: false,
                loaded: true,
              };

          feedCacheRef.current[feedTab] = nextSnapshot;
          if (activeTabRef.current === feedTab) {
            applyFeedSnapshot(nextSnapshot);
          }

          return;
        }

        feedPublicFallbackCursorRef.current = null;
        setIsAiCardsLoading(true);

        const [aiResult, queryResult] = await Promise.all([
          fetchAiCardsForYou(),
          forYouFeedQueryRef.current.refetch(),
        ]);

        if (requestId !== feedRequestIdRef.current[feedTab]) {
          return;
        }

        if (queryResult.error) {
          logFeedInvokeError("manage-social-feed:get_feed", queryResult.error, {
            action: "get_feed",
            feedTab,
            feedType: shouldPersonalizeForYouFeed ? "for_you" : "public",
            append,
            currentLength,
          });
        }

        const postSnapshot = queryResult.error
          ? null
          : buildFeedSnapshotFromPages(feedTab, queryResult.data);

        const nextSnapshot: FeedCacheEntry = {
          posts: postSnapshot?.posts || [],
          aiCards: applyFollowingStateToRecommendationCards(aiResult.cards),
          aiFeedMessage: normalizeAiFeedMessage(aiResult.message || ""),
          aiFeedProvider: normalizeAiFeedProvider(aiResult.provider || groqModelLabel),
          hasMore: postSnapshot?.hasMore || false,
          loaded: true,
        };

        feedCacheRef.current[feedTab] = nextSnapshot;
        feedLastFetchAt[feedTab] = Date.now();

        if (activeTabRef.current === feedTab) {
          applyFeedSnapshot(nextSnapshot);
          setIsAiCardsLoading(false);
        }

        void loadFollowingGraph().catch(() => {
          // Follow metadata is nice-to-have; recommendations should render without waiting on it.
        });

        return;
      }

      const currentFollowingQuery = followingFeedQueryRef.current;
      const queryResult = append
        ? await currentFollowingQuery.fetchNextPage()
        : await currentFollowingQuery.refetch();

      if (queryResult.error) {
        logFeedInvokeError("manage-social-feed:get_feed", queryResult.error, {
          action: "get_feed",
          feedTab,
          feedType: feedTab === "following" ? "following" : "public",
          append,
          currentLength,
        });
        throw queryResult.error;
      }

      const nextFollowingKeys = followingKeysRef.current;

      const pages = queryResult.data?.pages || [];
      const latestPage = pages[pages.length - 1] as any;
      const nextCursor = latestPage?.nextCursor || null;
      const fetchedPosts = pages
        .flatMap((page: any) =>
          Array.isArray(page?.items)
            ? page.items
            : Array.isArray(page?.data)
              ? page.data
              : [],
        )
        .map(normalizeFeedPost)
        .map((post: any) => ({
          ...post,
          is_following:
            post.is_following === true ||
            nextFollowingKeys.has(buildSocialFollowKey("profile", post.author_id)),
        }));

      logLoadTime("Feed", "primary-page-parsed", {
        append,
        feedTab,
        pages: pages.length,
        posts: fetchedPosts.length,
      });

      const nextPosts = fetchedPosts;
      const nextAiCards: any[] = [];
      const nextAiFeedMessage = "";
      const nextAiFeedProvider = groqModelLabel;

      if (requestId !== feedRequestIdRef.current[feedTab]) {
        return;
      }

      const nextSnapshot: FeedCacheEntry = {
        posts: nextPosts,
        aiCards: nextAiCards,
        aiFeedMessage: nextAiFeedMessage,
        aiFeedProvider: nextAiFeedProvider,
        hasMore: Boolean(nextCursor),
        loaded: true,
      };
      logLoadTime("Feed", "snapshot-ready", {
        aiCards: nextAiCards.length,
        feedTab,
        hasMore: Boolean(nextCursor),
        posts: nextPosts.length,
      });
      feedCacheRef.current[feedTab] = nextSnapshot;
      feedLastFetchAt[feedTab] = Date.now();

      if (activeTabRef.current === feedTab) {
        setIsAiCardsLoading(false);
      }

      if (activeTabRef.current === feedTab) {
        applyFeedSnapshot(nextSnapshot);
      }

      if (!append) {
        void loadFollowingGraph().catch(() => {
          // Follow metadata is nice-to-have; feed readiness should not wait on it.
        });
      }

    } catch (e: any) {
      logFeedInvokeError("fetchFeed", e, {
        feedTab,
        append,
        currentLength,
      });

      if (requestId !== feedRequestIdRef.current[feedTab]) {
        return;
      }

      let fallbackSnapshot = feedCacheRef.current[feedTab];

      if (!fallbackSnapshot.loaded) {
        fallbackSnapshot = {
          ...createEmptyFeedCacheEntry(groqModelLabel),
          hasMore: false,
          loaded: true,
        };
      } else {
        fallbackSnapshot = {
          ...fallbackSnapshot,
          hasMore: false,
          loaded: true,
        };
      }

      feedCacheRef.current[feedTab] = fallbackSnapshot;

      if (activeTabRef.current === feedTab) {
        applyFeedSnapshot(fallbackSnapshot);
        setIsAiCardsLoading(false);
      }
    } finally {
      feedInFlightRef.current[feedTab] = false;
      if (requestId === feedRequestIdRef.current[feedTab] && activeTabRef.current === feedTab) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [
    applyFollowingStateToRecommendationCards,
    applyFeedSnapshot,
    authLoading,
    buildFeedSnapshotFromPages,
    fetchAiCardsForYou,
    groqModelLabel,
    isGuest,
    loadFollowingGraph,
    roleResolved,
    session,
    shouldPersonalizeForYouFeed,
    resolvedUserId,
  ]);

  useFocusEffect(useCallback(() => {
    const currentTab = activeTabRef.current;
    if (authLoading || (currentTab === "for_you" && Boolean(resolvedUserId) && !isGuest && !roleResolved)) {
      return;
    }

    if (currentTab === "for_you" && session && !isGuest && !resolvedUserId) {
      return;
    }

    hasFocusedFeedRef.current = true;
    clearBottomOverlays();
    const hydrated = hydrateCachedFeed(currentTab);
    const hydratedSnapshot = feedCacheRef.current[currentTab];
    const isHydratedEmptyForYou =
      currentTab === "for_you" &&
      hydrated &&
      isEmptyForYouSnapshot(hydratedSnapshot);
    const shouldRefreshFeed =
      !hydrated ||
      isHydratedEmptyForYou ||
      Date.now() - feedLastFetchAt[currentTab] >= FEED_FOCUS_REFRESH_COOLDOWN_MS;
    const shouldHoldForYouEmptyState =
      currentTab === "for_you" &&
      shouldRefreshFeed &&
      (!hydrated || isEmptyForYouSnapshot(hydratedSnapshot));

    if (!hydrated) {
      setLoading(true);
    }

    if (shouldHoldForYouEmptyState) {
      setIsAiCardsLoading(true);
    }

    if (!shouldRefreshFeed) {
      setLoading(false);
      setRefreshing(false);
    }

    let isActive = true;
    let focusRefreshTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    let refreshFallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshStarted = false;

    const startRefresh = () => {
      if (!isActive || refreshStarted || !shouldRefreshFeed) return;
      refreshStarted = true;
      void fetchFeed(currentTab);
    };

    if (shouldRefreshFeed) {
      if (!hydrated || isHydratedEmptyForYou) {
        startRefresh();
      } else {
        focusRefreshTask = InteractionManager.runAfterInteractions(startRefresh);
        refreshFallbackTimer = setTimeout(startRefresh, 800);
      }
    }

    const restorePendingReopen = async () => {
      const storedListingId = await AsyncStorage.getItem("pending_reopen_listing_id");

      if (storedListingId && storedListingId.length > 0) {
        setSelectedListingId(storedListingId);
        setPendingReopenListingId(storedListingId);
        await AsyncStorage.removeItem("pending_reopen_listing_id");
      }
    };

    void restorePendingReopen();

    return () => {
      isActive = false;
      focusRefreshTask?.cancel();
      if (refreshFallbackTimer) clearTimeout(refreshFallbackTimer);
    };
  }, [authLoading, clearBottomOverlays, fetchFeed, hydrateCachedFeed, isEmptyForYouSnapshot, isGuest, resolvedUserId, roleResolved, session]));

  useEffect(() => {
    if (authLoading || !hasFocusedFeedRef.current || (tab === "for_you" && Boolean(resolvedUserId) && !isGuest && !roleResolved)) {
      return;
    }

    if (tab === "for_you" && session && !isGuest && !resolvedUserId) {
      return;
    }

    if (previousTabRef.current === tab) {
      return;
    }

    previousTabRef.current = tab;

    const hydrated = hydrateCachedFeed(tab);
    const hydratedSnapshot = feedCacheRef.current[tab];
    const isHydratedEmptyForYou =
      tab === "for_you" &&
      hydrated &&
      isEmptyForYouSnapshot(hydratedSnapshot);
    const shouldRefreshTabFeed =
      !hydrated ||
      isHydratedEmptyForYou ||
      Date.now() - feedLastFetchAt[tab] >= FEED_FOCUS_REFRESH_COOLDOWN_MS;

    if (tab === "for_you" && shouldRefreshTabFeed && (!hydrated || isEmptyForYouSnapshot(hydratedSnapshot))) {
      setIsAiCardsLoading(true);
    }

    if (!hydrated) {
      setLoading(true);
    }

    if (!shouldRefreshTabFeed) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!hydrated || isHydratedEmptyForYou) {
      void fetchFeed(tab);
      return;
    }

    let isActive = true;
    let refreshStarted = false;
    const startTabRefresh = () => {
      if (!isActive || refreshStarted) return;
      refreshStarted = true;
      void fetchFeed(tab);
    };
    const tabSwitchTask = InteractionManager.runAfterInteractions(startTabRefresh);
    const tabRefreshFallbackTimer = setTimeout(startTabRefresh, 800);

    return () => {
      isActive = false;
      tabSwitchTask.cancel();
      clearTimeout(tabRefreshFallbackTimer);
    };
  }, [authLoading, fetchFeed, hydrateCachedFeed, isEmptyForYouSnapshot, isGuest, resolvedUserId, roleResolved, session, tab]);

  const onRefresh = useCallback(() => {
    if (authLoading || (tab === "for_you" && Boolean(resolvedUserId) && !isGuest && !roleResolved)) {
      return;
    }

    if (tab === "for_you" && session && !isGuest && !resolvedUserId) {
      return;
    }

    setRefreshing(true);
    if (tab === "for_you" && posts.length === 0 && aiCards.length === 0) {
      setIsAiCardsLoading(true);
    }
    void fetchFeed(tab);
  }, [aiCards.length, authLoading, fetchFeed, isGuest, posts.length, resolvedUserId, roleResolved, session, tab]);

  const loadMore = useCallback(() => {
    if (
      authLoading ||
      loading ||
      loadingMore ||
      !hasMore ||
      posts.length === 0 ||
      (tab === "for_you" && posts.length === 0 && aiCards.length > 0)
    ) {
      return;
    }

    setLoadingMore(true);
    void fetchFeed(tab, true, posts.length);
  }, [aiCards.length, authLoading, fetchFeed, hasMore, loading, loadingMore, posts.length, tab]);

  /* ── Actions ── */
  const clearComposerFocusTimer = useCallback(() => {
    if (!composerFocusTimerRef.current) {
      return;
    }

    clearTimeout(composerFocusTimerRef.current);
    composerFocusTimerRef.current = null;
  }, []);

  const resetComposer = useCallback(() => {
    setEditingPost(null);
    setPostBody("");
    setPostVisibility("public");
    setPostMedia([]);
    setMediaStatus("");
  }, []);

  const presentComposerSheet = useCallback(() => {
    clearComposerFocusTimer();
    setShowCreate(true);
    composerFocusTimerRef.current = setTimeout(() => {
      composerFocusTimerRef.current = null;
      composerInputRef.current?.focus?.();
    }, 320);
  }, [clearComposerFocusTimer]);

  const handleComposerClose = useCallback(() => {
    if (creating || mediaBusy) return;
    clearComposerFocusTimer();
    Keyboard.dismiss();
    setShowCreate(false);
    resetComposer();
  }, [clearComposerFocusTimer, creating, mediaBusy, resetComposer]);

  const handleComposerSheetDismiss = useCallback(() => {
    clearComposerFocusTimer();
    Keyboard.dismiss();
    setShowCreate(false);
    resetComposer();
  }, [clearComposerFocusTimer, resetComposer]);

  useEffect(() => {
    if (showCreate) {
      createPostSheetRef.current?.present();
    } else {
      createPostSheetRef.current?.dismiss();
    }
  }, [showCreate]);

  useEffect(() => clearComposerFocusTimer, [clearComposerFocusTimer]);

  const openCreateComposer = useCallback(() => {
    if (!canCreatePosts) {
      setAlert({
        type: "warning",
        title: "Posting unavailable",
        message: "Please sign in with an account that can post.",
      });
      return;
    }
    resetComposer();
    presentComposerSheet();
  }, [canCreatePosts, presentComposerSheet, resetComposer]);

  const closeComposer = useCallback(() => {
    handleComposerClose();
  }, [handleComposerClose]);

  const uploadComposerMedia = useCallback(async () => {
    if (!userId || postMedia.length === 0) return [];

    const uploadedMedia: any[] = [];
    for (let index = 0; index < postMedia.length; index += 1) {
      const item = postMedia[index];
      const stamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `${userId}/posts/${stamp}.${item.ext}`;
      const bytes = item.media_type === "image"
        ? base64ToUint8Array(item.base64 || await FileSystem.readAsStringAsync(item.uri, { encoding: "base64" }))
        : undefined;

      const uploadResult = await uploadPostMediaFile(item.uri, storagePath, item.mime_type, bytes);
      if (uploadResult.error) throw uploadResult.error;

      let thumbnailPath: string | null = null;
      if (item.media_type === "video") {
        const selectedThumbnail = item.thumbnailChoices[item.selectedThumbnailIndex] || item.thumbnailChoices[0];
        const thumbnailBase64 = selectedThumbnail?.dataUrl?.split(",")[1] || "";
        if (!thumbnailBase64) throw new Error("Selected video thumbnail is missing.");
        thumbnailPath = `${userId}/posts/thumbnails/${stamp}.jpg`;
        const thumbnailResult = await uploadPostMediaFile(
          selectedThumbnail.uri,
          thumbnailPath,
          "image/jpeg",
          base64ToUint8Array(thumbnailBase64),
        );
        if (thumbnailResult.error) throw thumbnailResult.error;
      }

      uploadedMedia.push({
        media_type: item.media_type,
        storage_path: storagePath,
        thumbnail_path: thumbnailPath,
        is_cover: item.is_cover,
        mime_type: item.mime_type,
        width: item.width || null,
        height: item.height || null,
        duration_seconds: item.duration_seconds || null,
        safety_status: "passed",
        safety_context: "social_post_media",
        safety_checked_at: new Date().toISOString(),
        safety_metadata: {
          ...item.safetyMetadata,
          client_screened: true,
          selected_thumbnail: item.media_type === "video",
        },
      });
    }

    return uploadedMedia;
  }, [postMedia, userId]);

  const handlePickPostMedia = useCallback(async () => {
    if (!canCreatePosts || mediaBusy || postMedia.length >= MAX_POST_MEDIA_ITEMS) return;

    try {
      const remaining = MAX_POST_MEDIA_ITEMS - postMedia.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        base64: false,
        mediaTypes: ["images", "videos"] as any,
        quality: 0.9,
        selectionLimit: remaining,
      });

      if (result.canceled) return;
      const assets = (result.assets || []).slice(0, remaining);
      if (assets.length === 0) return;

      setMediaBusy(true);
      setMediaStatus("Checking media...");
      const prepared: PostComposerMedia[] = [];
      const blockedReasons: string[] = [];
      for (const asset of assets) {
        try {
          prepared.push(await preparePostComposerMedia(asset));
        } catch (error: any) {
          const reason = typeof error?.message === "string" && error.message.trim().length > 0
            ? error.message.trim()
            : "This media could not be attached.";
          blockedReasons.push(reason);
        }
      }

      if (prepared.length > 0) {
        setPostMedia((current) => {
          const merged = [...current, ...prepared].slice(0, MAX_POST_MEDIA_ITEMS);
          const hasCover = merged.some((item) => item.is_cover);
          return merged.map((item, index) => ({ ...item, is_cover: hasCover ? item.is_cover : index === 0 }));
        });
      }

      if (blockedReasons.length > 0) {
        const firstReason = blockedReasons[0] || "This media could not be attached.";
        const blockedLabel = blockedReasons.length === 1 ? "1 media item was blocked" : `${blockedReasons.length} media items were blocked`;
        setAlert({
          type: prepared.length > 0 ? "warning" : "error",
          title: prepared.length > 0 ? "Some media blocked" : "Media blocked",
          message: prepared.length > 0
            ? `${blockedLabel}. Approved media was attached. ${firstReason}`
            : firstReason,
        });
      }
    } catch (error: any) {
      setAlert({
        type: "error",
        title: "Media blocked",
        message: error?.message || "This media could not be attached.",
      });
    } finally {
      setMediaBusy(false);
      setMediaStatus("");
    }
  }, [canCreatePosts, mediaBusy, postMedia.length]);

  const removeComposerMedia = useCallback((mediaId: string) => {
    setPostMedia((current) => {
      const next = current.filter((item) => item.id !== mediaId);
      const hasCover = next.some((item) => item.is_cover);
      return next.map((item, index) => ({ ...item, is_cover: hasCover ? item.is_cover : index === 0 }));
    });
  }, []);

  const setComposerCover = useCallback((mediaId: string) => {
    setPostMedia((current) => current.map((item) => ({ ...item, is_cover: item.id === mediaId })));
  }, []);

  const setComposerThumbnail = useCallback((mediaId: string, selectedThumbnailIndex: number) => {
    setPostMedia((current) =>
      current.map((item) => (item.id === mediaId ? { ...item, selectedThumbnailIndex } : item)),
    );
  }, []);

  const handleCreatePost = async () => {
    const content = normalizeVisibleInput(postBody);
    if (!canCreatePosts) {
      setAlert({ type: "warning", title: "Posting unavailable", message: "Please sign in with an account that can post." });
      return;
    }
    if (!content && postMedia.length === 0 && !editingPost) {
      setAlert({ type: "warning", title: "Empty Post", message: "Please write something or attach media." });
      return;
    }
    setCreating(true);
    try {
      const uploadedMedia = postMedia.length > 0 ? await uploadComposerMedia() : undefined;
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: editingPost
          ? {
              action: "update_post",
              post_id: editingPost.id,
              content,
              visibility: postVisibility,
              ...(uploadedMedia ? { media: uploadedMedia } : {}),
            }
          : {
              action: "create_post",
              content,
              visibility: postVisibility,
              media: uploadedMedia || [],
            },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        const createdPost = !editingPost && data?.data ? normalizeFeedPost(data.data) : null;
        if (createdPost?.id) {
          const addCreatedPost = (entry: FeedCacheEntry): FeedCacheEntry => ({
            ...entry,
            posts: sortFeedItemsNewestFirst(dedupeFeedItems([createdPost, ...entry.posts])),
            loaded: true,
          });

          feedCacheRef.current = {
            for_you: addCreatedPost(feedCacheRef.current.for_you),
            following: addCreatedPost(feedCacheRef.current.following),
          };
          setPosts((current) => sortFeedItemsNewestFirst(dedupeFeedItems([createdPost, ...current])));
        }

        emitToast({
          type: "success",
          title: editingPost ? "Post updated" : "Posted!",
          message: editingPost ? "Your changes are live." : "Your post is live.",
        });
        handleComposerClose();
        void fetchFeed(activeTabRef.current);
      } else if (data?.blocked || data?.pending_review || data?.status === "blocked" || data?.status === "pending_review") {
        setAlert({
          type: "warning",
          title: data?.pending_review || data?.status === "pending_review" ? "Post needs review" : "Post blocked",
          message: data?.moderation?.reason || data?.error || "This post did not pass AI moderation.",
        });
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create post" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setCreating(false);
    }
  };

  const handleFollow = useCallback(async (
    targetId: string,
    targetType: SocialFollowTargetType,
    isFollowing: boolean,
  ) => {
    if (!canUseSocialActions) {
      emitToast({
        type: "warning",
        title: "Sign in required",
        message: "Please sign in to follow creators.",
      });
      return;
    }

    const followKey = buildSocialFollowKey(targetType, targetId);

    if (!targetId || !followKey || followBusyByKey[followKey]) {
      return;
    }

    setFollowBusyByKey((prev) => ({ ...prev, [followKey]: true }));

    try {
      const { error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: isFollowing ? "unfollow" : "follow",
          target_id: targetId,
          target_type: targetType,
        },
      });

      if (error) {
        throw error;
      }

      emitToast({ type: "success", title: isFollowing ? "Unfollowed" : "Following", message: "" });

      const nextIsFollowing = !isFollowing;
      setFollowingKeys((prev) => {
        const next = new Set(prev);
        if (nextIsFollowing) {
          next.add(followKey);
        } else {
          next.delete(followKey);
        }
        return next;
      });

      if (targetType === "profile") {
        setPosts((prev) => prev.map((p) => (p.author_id === targetId ? { ...p, is_following: nextIsFollowing } : p)));
      }

      if (!nextIsFollowing) {
        setFollowingEntities((prev) => prev.filter(
          (entity) => !(entity.id === targetId && entity.followed_type === targetType),
        ));
      }

      invalidateFeedCache("following");

      if (tab === "following") {
        void fetchFeed("following");
      } else if (nextIsFollowing) {
        void loadFollowingGraph();
      }
    } catch (e: any) {
      console.error("Follow error:", e);
      emitToast({
        type: "error",
        title: "Follow failed",
        message: e?.message || "Please try again.",
      });
    } finally {
      setFollowBusyByKey((prev) => {
        const next = { ...prev };
        delete next[followKey];
        return next;
      });
    }
  }, [canUseSocialActions, fetchFeed, followBusyByKey, invalidateFeedCache, loadFollowingGraph, tab]);

  /* ── Renderers ── */

  const openPostDetails = useCallback((postId: string) => {
    if (!postId) return;
    setSelectedPostId(postId);
  }, []);

  const closePostDetails = useCallback(() => {
    setSelectedPostId(null);
  }, []);

  const patchPostEverywhere = useCallback((postId: string, updater: (post: any) => any) => {
    if (!postId) return;

    const updatePosts = (items: any[]) =>
      items.map((item) => (item?.id === postId ? updater(item) : item));

    setPosts(updatePosts);
    feedCacheRef.current = {
      for_you: {
        ...feedCacheRef.current.for_you,
        posts: updatePosts(feedCacheRef.current.for_you.posts),
      },
      following: {
        ...feedCacheRef.current.following,
        posts: updatePosts(feedCacheRef.current.following.posts),
      },
    };
  }, []);

  const handleModalReactionChanged = useCallback(
    (postId: string, hasReaction: boolean, reactionCount: number) => {
      patchPostEverywhere(postId, (post) => ({
        ...post,
        my_reaction: hasReaction ? "like" : null,
        user_reaction: hasReaction ? "like" : null,
        reaction_count: reactionCount,
      }));
    },
    [patchPostEverywhere],
  );

  const handleModalCommentChanged = useCallback((postId: string, commentCount: number) => {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, comment_count: commentCount } : post)),
    );
  }, []);

  const handleModalShareChanged = useCallback((postId: string, shareCount: number) => {
    setPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, share_count: shareCount } : post)),
    );
  }, []);

  const handleModalPostDeleted = useCallback((postId: string) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
    invalidateFeedCache("following");
  }, [invalidateFeedCache]);

  const handleEditPost = useCallback((post: any) => {
    if (!post?.id || post.author_id !== userId) return;
    setEditingPost(post);
    setPostBody(post.body || post.content || "");
    setPostVisibility(post.visibility === "followers" ? "followers" : "public");
    setPostMedia([]);
    setMediaStatus("");
    presentComposerSheet();
  }, [presentComposerSheet, userId]);

  const handleDeletePost = useCallback((post: any) => {
    if (!post?.id || post.author_id !== userId) return;

    setDeletePostTarget(post);
  }, [userId]);

  const confirmDeletePost = useCallback(async () => {
    const post = deletePostTarget;
    if (!post?.id || post.author_id !== userId) return;

    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_post", post_id: post.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setPosts((current) => current.filter((item) => item.id !== post.id));
      invalidateFeedCache("following");
      emitToast({ type: "success", title: "Post deleted", message: "" });
    } catch (error: any) {
      setAlert({ type: "error", title: "Delete failed", message: error?.message || "Please try again." });
    }
  }, [deletePostTarget, invalidateFeedCache, userId]);

  const handleTogglePostReaction = useCallback(async (post: any) => {
    if (!session || !post?.id) {
      emitToast({ type: "info", title: "Sign in required", message: "Please sign in to react." });
      return;
    }

    const hadReaction = Boolean(post.my_reaction || post.user_reaction);
    patchPostEverywhere(post.id, (item) => ({
      ...item,
      my_reaction: hadReaction ? null : "like",
      user_reaction: hadReaction ? null : "like",
      reaction_count: Math.max(0, Number(item.reaction_count || 0) + (hadReaction ? -1 : 1)),
    }));

    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: hadReaction ? "remove_reaction" : "react_to_post", post_id: post.id, reaction_type: "like" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
    } catch (error: any) {
      patchPostEverywhere(post.id, (item) => ({
        ...item,
        my_reaction: hadReaction ? "like" : null,
        user_reaction: hadReaction ? "like" : null,
        reaction_count: Math.max(0, Number(item.reaction_count || 0) + (hadReaction ? 1 : -1)),
      }));
      emitToast({ type: "error", title: "Reaction failed", message: error?.message || "Please try again." });
    }
  }, [patchPostEverywhere, session]);

  const openReportTarget = useCallback((target: any) => {
    if (!session || !resolvedUserId) {
      emitToast({ type: "info", title: "Sign in required", message: "Please sign in to submit a report." });
      return;
    }

    if (!target?.id) {
      setAlert({ type: "error", title: "Report unavailable", message: "Missing item details." });
      return;
    }

    if (isOwnFeedReportTarget(target, resolvedUserId)) {
      const label = getFeedReportTypeLabel(target).toLowerCase();
      emitToast({ type: "info", title: "Owner action", message: `You cannot report your own ${label}.` });
      return;
    }

    if (!getFeedReportTargetType(target)) {
      setAlert({
        type: "info",
        title: "Report unavailable",
        message: "Reporting is not available for this card yet.",
      });
      return;
    }

    setReportTarget(target);
  }, [resolvedUserId, session]);

  const submitReportTarget = useCallback(async (reason: string, details?: string) => {
    if (!reportTarget?.id) {
      throw new Error("Missing item details.");
    }

    if (!resolvedUserId) {
      throw new Error("Sign in to submit a report.");
    }

    if (reportTarget.__feedKind === "ai_card") {
      const targetType = getFeedReportTargetType(reportTarget);
      if (!targetType) {
        throw new Error("Reporting is not available for this card yet.");
      }

      const { data, error } = await supabase.functions.invoke("manage-details", {
        body: {
          action: "report",
          type: targetType,
          id: reportTarget.id,
          userId: resolvedUserId,
          reason,
          details: details || null,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return;
    }

    const { data, error } = await supabase.functions.invoke("manage-social-feed", {
      body: {
        action: "report_post",
        post_id: reportTarget.id,
        reason,
        details: details || null,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
  }, [reportTarget, resolvedUserId]);

  const handleSharePost = useCallback(async (post: any) => {
    if (!post?.id) return;
    try {
      const shareResult = await Share.share({
        message: `${post.body || post.content || "Check out this post on MusikaLokal."}\n\nMusikaLokal post: ${post.id}`,
      });

      if (shareResult.action === Share.dismissedAction) return;

      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "share_post", post_id: post.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const nextCount = Number(data?.data?.share_count || 0);
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? { ...item, share_count: nextCount || Number(item.share_count || 0) + 1 }
            : item,
        ),
      );
    } catch (error: any) {
      emitToast({ type: "error", title: "Share failed", message: error?.message || "Please try again." });
    }
  }, []);

  const openProfileDetails = useCallback((profileId: string) => {
    if (!profileId) return;
    router.push({ pathname: "/profile", params: { userId: profileId } });
  }, []);

  const openPlaylistDetails = useCallback((playlistId: string) => {
    if (!playlistId) return;
    router.push({ pathname: "/playlist_details", params: { playlist_id: playlistId } });
  }, []);

  const openProductDetails = useCallback((productId: string) => {
    if (!productId) return;
    router.push({ pathname: "/product_details", params: { product_id: productId } });
  }, []);

  const openFeedOptionTarget = useCallback((target: any) => {
    if (!target?.id) return;

    if (target.__feedKind !== "ai_card") {
      openPostDetails(target.id);
      return;
    }

    const type = String(target.type || "").trim().toLowerCase();
    if (type === "production") {
      openProductionTeamDetails(target.id);
      return;
    }
    if (type === "artist" || type === "profile" || type === "musician") {
      openProfileDetails(target.id);
      return;
    }
    if (type === "product") {
      openProductDetails(target.id);
      return;
    }
    if (type === "playlist" || type === "music") {
      openPlaylistDetails(target.id);
      return;
    }

    openListingDetails(target.id, target);
  }, [
    openListingDetails,
    openPlaylistDetails,
    openPostDetails,
    openProductDetails,
    openProductionTeamDetails,
    openProfileDetails,
  ]);

  const timeAgo = useCallback((dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return formatDashedNumericDate(dateStr);
  }, []);

  const renderPost = useCallback(({ item: post }: { item: any }) => {
    if (post?.__feedKind === "following_entity") {
      const followKey = buildSocialFollowKey(post.followed_type, post.id);
      const isFollowingEntity = followKey ? followingKeys.has(followKey) : false;
      const isFollowBusy = followKey ? followBusyByKey[followKey] === true : false;
      const isGroup = post.followed_type === "group";
      const roleLabel = isGroup
        ? formatGroupTypeLabel(post.group_type)
        : formatProfileRoleLabel(post.role);
      const hintText = isGroup
        ? `You are following this ${roleLabel.toLowerCase()}. Open the listing to check details, media, and availability.`
        : "Their updates will land here once they post. You can still open their profile now.";

      return (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            if (isGroup) {
              openListingDetails(post.id, {
                ...post,
                type: "Group",
                name: post.name || post.group_name || "Group",
              });
              return;
            }

            router.push({ pathname: "/profile", params: { userId: post.id } });
          }}
          style={[
            styles.followingProfileCard,
            { backgroundColor: isDark ? "#1E293B" : "#FFFFFF" },
          ]}
        >
          {post.avatar_url ? (
            <CachedImage
              uri={post.avatar_url}
              style={styles.followingProfileAvatar}
            />
          ) : (
            <View
              style={[
                styles.followingProfileAvatarFallback,
                {
                  backgroundColor: isDark ? "#0F172A" : colors.primary + "14",
                  borderColor: isDark ? "#334155" : colors.primary + "22",
                },
              ]}
            >
              <Ionicons
                name={isGroup ? "people" : "person"}
                size={24}
                color={colors.primary}
              />
            </View>
          )}
          <View style={styles.followingProfileBody}>
            <View
              style={[
                styles.followingRoleBadge,
                { backgroundColor: isDark ? "#0F172A" : colors.primary + "12" },
              ]}
            >
              <Text style={[styles.followingRoleText, { color: colors.primary }]}>
                {roleLabel}
              </Text>
            </View>
            <Text style={[styles.followingProfileName, { color: colors.text }]} numberOfLines={1}>
              {post.name}
            </Text>
            <Text style={[styles.followingProfileHint, { color: colors.textSecondary }]} numberOfLines={2}>
              {hintText}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={1}
            disabled={isFollowBusy}
            onPress={(e) => {
              e.stopPropagation();
              handleFollow(post.id, post.followed_type, isFollowingEntity);
            }}
            style={[
              styles.followingProfileBtn,
              {
                backgroundColor: isFollowingEntity ? (isDark ? "#0F172A" : "#FFFFFF") : colors.primary,
                borderColor: isFollowingEntity ? (isDark ? "#334155" : "#CBD5E1") : colors.primary,
                opacity: isFollowBusy ? 0.7 : 1,
              },
            ]}
          >
            {isFollowBusy ? (
              <ActivityIndicator size="small" color={isFollowingEntity ? colors.textSecondary : "#FFFFFF"} />
            ) : (
              <Text
                style={[
                  styles.followingProfileBtnText,
                  { color: isFollowingEntity ? colors.textSecondary : "#FFFFFF" },
                ]}
              >
                {isFollowingEntity ? "Following" : "Follow"}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      );
    }

    if (post?.__feedKind === "ai_card") {
      const followTarget = canUseSocialActions
        ? getListingSocialFollowTarget(post, resolvedUserId)
        : null;
      const followKey = followTarget
        ? buildSocialFollowKey(followTarget.type, followTarget.id)
        : "";
      const isFollowingSuggestion = followKey
        ? post.is_following === true || followingKeys.has(followKey)
        : false;
      const isFollowBusy = followKey ? followBusyByKey[followKey] === true : false;

      return (
        <SocialFeedCard
          item={post}
          borderColor={isDark ? "#334155" : "#EEF0F4"}
          cardColor={isDark ? "#1E293B" : "#FFFFFF"}
          colors={colors}
          followBusy={isFollowBusy}
          followTarget={followTarget}
          isDark={isDark}
          isFollowing={isFollowingSuggestion}
          mediaWidth={Math.max(260, SCREEN_WIDTH - 60)}
          onFollow={handleFollow}
          onOpenListing={openListingDetails}
          onOpenPost={openPostDetails}
          onOpenPostOptions={openPostOptions}
          onOpenProduct={openProductDetails}
          onOpenProfile={openProfileDetails}
          onOpenProductionTeam={openProductionTeamDetails}
          onOpenPlaylist={openPlaylistDetails}
          onSharePost={handleSharePost}
          onToggleReaction={handleTogglePostReaction}
          showAuthorFollow={false}
          timeAgo={timeAgo}
        />
      );
    }

    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    const borderColor = isDark ? "#334155" : "#EEF0F4";
    const authorFollowTarget =
      canUseSocialActions && post.author_id && post.author_id !== resolvedUserId
        ? { id: post.author_id, type: "profile" as SocialFollowTargetType }
        : null;
    const authorFollowKey = authorFollowTarget
      ? buildSocialFollowKey(authorFollowTarget.type, authorFollowTarget.id)
      : "";
    const isFollowingAuthor = Boolean(
      post.is_following || followingKeys.has(buildSocialFollowKey("profile", post.author_id)),
    );
    const isAuthorFollowBusy = authorFollowKey ? followBusyByKey[authorFollowKey] === true : false;
    return (
      <SocialFeedCard
        item={post}
        borderColor={borderColor}
        cardColor={cardBg}
        colors={colors}
        followBusy={isAuthorFollowBusy}
        followTarget={authorFollowTarget}
        isDark={isDark}
        isFollowing={isFollowingAuthor}
        mediaWidth={Math.max(260, SCREEN_WIDTH - 60)}
        onFollow={handleFollow}
        onOpenListing={openListingDetails}
        onOpenPost={openPostDetails}
        onOpenPostOptions={openPostOptions}
        onOpenProduct={openProductDetails}
        onOpenProfile={openProfileDetails}
        onOpenProductionTeam={openProductionTeamDetails}
        onOpenPlaylist={openPlaylistDetails}
        onSharePost={handleSharePost}
        onToggleReaction={handleTogglePostReaction}
        showAuthorFollow={Boolean(authorFollowTarget)}
        timeAgo={timeAgo}
      />
    );
  }, [
    colors,
    canUseSocialActions,
    followBusyByKey,
    followingKeys,
    handleFollow,
    handleSharePost,
    handleTogglePostReaction,
    isDark,
    openListingDetails,
    openPlaylistDetails,
    openPostOptions,
    openPostDetails,
    openProductDetails,
    openProfileDetails,
    openProductionTeamDetails,
    resolvedUserId,
    timeAgo,
  ]);

  const renderHeader = useCallback(() => {
    const cardBg = isDark ? "#1E293B" : "#FFFFFF";

    return (
      <>
        {/* ── Search bar trigger ── */}
        <View style={[styles.composerRow, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            style={[
              styles.composerInput,
              { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
            ]}
            onPress={openSearchSheet}
            activeOpacity={1}
          >
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <Text style={[styles.composerSearchText, { color: colors.textSecondary }]} numberOfLines={1}>
              Search musicians, studios, gigs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={1}
            onPress={openSearchSheet}
            style={[
              styles.composerFilterButton,
              { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open search filters"
          >
            <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {canCreatePosts ? (
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={openCreateComposer}
            accessibilityRole="button"
            accessibilityLabel="Create post"
            testID="mobile-feed-create-post-button"
            style={[styles.createPostPrompt, { backgroundColor: cardBg, borderColor: colors.border }]}
          >
            <View style={[styles.composerAvatar, { backgroundColor: colors.primary + "30" }]}>
              <Ionicons name="person" size={16} color={colors.primary} />
            </View>
            <View style={[styles.createPostInput, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
              <Text style={[styles.createPostInputText, { color: colors.textSecondary }]} numberOfLines={1}>
                {"What's on your mind?"}
              </Text>
            </View>
            <View style={[styles.createPostMediaButton, { backgroundColor: colors.primary + "14" }]}>
              <Ionicons name="images-outline" size={20} color={colors.primary} />
            </View>
          </TouchableOpacity>
        ) : null}

        <LiveRadioCard
          borderColor={colors.border}
          cardColor={isDark ? "#0F172A" : "#F8FAFC"}
          isDark={isDark}
          primaryColor={colors.primary}
          recommendationEnabled={shouldPersonalizeForYouFeed && roleResolved}
          recommendationUserId={resolvedUserId}
          textColor={colors.text}
          mutedTextColor={colors.textSecondary}
        />

        {/* ── Feed tabs ── */}
        <SlidingTabBar
          activeKey={tab}
          backgroundColor={cardBg}
          borderColor={isDark ? "#334155" : "#E2E8F0"}
          indicatorWidthRatio={0.28}
          onChange={(nextTab) => setSmoothTab(setTab, nextTab)}
          tabs={FEED_TABS}
          textStyle={styles.tabText}
        />
        <View style={[styles.feedTabBottomSpacer, { backgroundColor: cardBg }]} />

      </>
    );
  }, [
    colors.border,
    colors.primary,
    colors.text,
    colors.textSecondary,
    canCreatePosts,
    isDark,
    openCreateComposer,
    openSearchSheet,
    resolvedUserId,
    roleResolved,
    shouldPersonalizeForYouFeed,
    tab,
  ]);

  const showInitialFeedSkeleton = loading && !refreshing && !loadingMore;

  const renderFeedSkeleton = () => {
    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    const skeletonCardBg = isDark ? "#1E293B" : "#FFFFFF";
    const skeletonBorder = isDark ? "#334155" : "#E2E8F0";

    return (
      <ScrollView
        style={styles.feedViewport}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.feedSkeletonContent,
          { paddingBottom: feedBottomSpacer + 20 },
        ]}
      >
        <View style={[styles.feedSkeletonSearchWrap, { backgroundColor: cardBg }]}>
          <Skeleton width="100%" height={48} borderRadius={16} />
        </View>

        <View style={[styles.feedSkeletonLiveRadioWrap, { backgroundColor: cardBg }]}>
          <View style={[styles.feedSkeletonLiveRadioCard, { backgroundColor: isDark ? "#0F172A" : "#F8FAFC", borderColor: skeletonBorder }]}>
            <View style={{ flex: 1 }}>
              <Skeleton width={92} height={14} style={{ marginBottom: 10 }} />
              <Skeleton width="62%" height={18} style={{ marginBottom: 8 }} />
              <Skeleton width="82%" height={12} />
            </View>
            <Skeleton width={86} height={40} borderRadius={999} />
          </View>
        </View>

        <View style={[styles.tabRow, { backgroundColor: cardBg, borderBottomColor: skeletonBorder }]}>
          <View style={styles.feedSkeletonTab}>
            <Skeleton width={110} height={18} borderRadius={8} />
          </View>
          <View style={styles.feedSkeletonTab}>
            <Skeleton width={110} height={18} borderRadius={8} />
          </View>
        </View>
        <View style={[styles.feedTabBottomSpacer, { backgroundColor: cardBg }]} />

        {[1, 2, 3].map((item) => (
          <View
            key={`feed-post-skeleton-${item}`}
            style={[styles.feedSkeletonPostCard, { backgroundColor: skeletonCardBg, borderColor: skeletonBorder }]}
          >
            <View style={styles.feedSkeletonAuthorRow}>
              <Skeleton width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Skeleton width="42%" height={14} />
                <Skeleton width="28%" height={10} style={{ marginTop: 8 }} />
              </View>
              <Skeleton width={74} height={28} borderRadius={8} />
            </View>

            <View style={styles.feedSkeletonBody}>
              <Skeleton width="90%" height={14} />
              <Skeleton width="72%" height={14} style={{ marginTop: 8 }} />
            </View>

            <View style={styles.feedSkeletonMediaWrap}>
              <Skeleton width="100%" height={220} borderRadius={12} />
            </View>

            <View style={styles.feedSkeletonSummaryRow}>
              <Skeleton width={74} height={12} />
              <Skeleton width={90} height={12} />
            </View>

            <View style={[styles.feedSkeletonActionRow, { borderTopColor: skeletonBorder }]}>
              {[1, 2, 3].map((action) => (
                <View key={`feed-action-skeleton-${item}-${action}`} style={styles.feedSkeletonActionItem}>
                  <Skeleton width={74} height={18} borderRadius={8} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const feedItems = useMemo(() => {
    if (loading) return [];
    if (tab === "for_you") {
      return sortForYouFeedItems(dedupeFeedItems([...posts, ...aiCards]));
    }
    if (tab === "following") {
      return sortFeedItemsNewestFirst(dedupeFeedItems([...posts, ...followingEntities]));
    }
    return sortFeedItemsNewestFirst(dedupeFeedItems(posts));
  }, [aiCards, followingEntities, loading, posts, tab]);

  const isShowingAiCards = tab === "for_you" && posts.length === 0 && aiCards.length > 0;
  const showRecommendationLoadingState = tab === "for_you" && isAiCardsLoading;
  const radioPlayerBottom = NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + RADIO_MINI_PLAYER_STACK_GAP + insets.bottom;
  const hasRadioMiniPlayer = Boolean(activeStation);
  const feedBottomSpacer = hasRadioMiniPlayer
    ? radioPlayerBottom + RADIO_MINI_PLAYER_HEIGHT + 24
    : NAVBAR_CLEARANCE + insets.bottom;
  const feedListHeader = useMemo(() => renderHeader(), [renderHeader]);
  const feedKeyExtractor = useCallback(
    (item: any, index: number) => getFeedItemListKey(item, index),
    [],
  );
  const feedSeparator = useCallback(
    () => <View style={{ height: isShowingAiCards ? 12 : 12 }} />,
    [isShowingAiCards],
  );
  const feedFooter = useMemo(
    () => (
      <>
        {loadingMore && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />}
        <View style={{ height: 20 }} />
      </>
    ),
    [colors.primary, loadingMore],
  );
  const feedEmpty = useMemo(
    () =>
      showRecommendationLoadingState ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {[1, 2].map((i) => (
            <Skeleton
              borderRadius={12}
              height={180}
              key={i}
              style={{ marginBottom: 10 }}
              width={SCREEN_WIDTH - 32}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.emptyStateContainer, { backgroundColor: isDark ? "#1E293B" : "#FFFFFF" }]}>
          <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? "#1E293B" : colors.primary + "10" }]}>
            <Ionicons
              name={tab === "following" ? "people-outline" : "sparkles-outline"}
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {tab === "following"
              ? "Your Following Feed is Empty"
              : "No posts or recommendations yet"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {tab === "following"
              ? "Follow musicians, groups, and creators to see their latest posts and newly created listings here."
              : "Explore musicians, groups, studios, and gigs to help shape your For You feed."}
          </Text>

          <TouchableOpacity
            activeOpacity={1}
            style={[styles.emptyActionBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
            onPress={openSearchSheet}
          >
            <Ionicons name="search" size={18} color="#fff" />
            <Text style={styles.emptyActionBtnText}>
              {tab === "following" ? "Find Musicians" : "Explore Feed"}
            </Text>
          </TouchableOpacity>
        </View>
      ),
    [
      colors.primary,
      colors.text,
      colors.textSecondary,
      isDark,
      openSearchSheet,
      showRecommendationLoadingState,
      tab,
    ],
  );
  const feedContentContainerStyle = useMemo(
    () => ({ paddingBottom: feedBottomSpacer }),
    [feedBottomSpacer],
  );
  const optionsTargetIsPost = postOptionsTarget ? postOptionsTarget.__feedKind !== "ai_card" : false;
  const optionsTargetIsOwn = postOptionsTarget ? isOwnFeedReportTarget(postOptionsTarget, resolvedUserId) : false;
  const optionsTargetLabel = postOptionsTarget ? getFeedReportTypeLabel(postOptionsTarget) : "Post";
  const optionsTargetTitle = optionsTargetIsPost ? "Post options" : `${optionsTargetLabel} options`;
  const optionsTargetMessage = optionsTargetIsOwn
    ? (optionsTargetIsPost ? "Manage this post." : `This is your ${optionsTargetLabel.toLowerCase()}.`)
    : (optionsTargetIsPost ? "Choose an action for this post." : "Choose an action for this card.");
  const optionsTargetButtons = postOptionsTarget
    ? optionsTargetIsPost
      ? optionsTargetIsOwn
        ? [
            { text: "Edit Post", onPress: () => handleEditPost(postOptionsTarget) },
            { text: "Delete Post", style: "destructive" as const, onPress: () => handleDeletePost(postOptionsTarget) },
            { text: "Cancel", style: "cancel" as const },
          ]
        : [
            { text: "Report Post", style: "destructive" as const, onPress: () => openReportTarget(postOptionsTarget) },
            { text: "Cancel", style: "cancel" as const },
          ]
      : optionsTargetIsOwn
        ? [
            { text: getFeedOptionViewLabel(postOptionsTarget), onPress: () => openFeedOptionTarget(postOptionsTarget) },
            { text: "Cancel", style: "cancel" as const },
          ]
        : [
            { text: getFeedOptionViewLabel(postOptionsTarget), onPress: () => openFeedOptionTarget(postOptionsTarget) },
            {
              text: `Report ${optionsTargetLabel}`,
              style: "destructive" as const,
              onPress: () => openReportTarget(postOptionsTarget),
            },
            { text: "Cancel", style: "cancel" as const },
          ]
    : [];

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={feedHeaderName} overline="Welcome" />
        <GuestSignInGate message="Sign in to see your social feed" />
        <Navbar />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF" }]}>
      <Header title={feedHeaderName} overline="Welcome" />
      {showInitialFeedSkeleton ? (
        renderFeedSkeleton()
      ) : feedItems.length === 0 ? (
        <ScrollView
          style={styles.feedViewport}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={feedContentContainerStyle}
          scrollIndicatorInsets={{ bottom: feedBottomSpacer }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {feedListHeader}
          {feedEmpty}
          {feedFooter}
        </ScrollView>
      ) : (
        <FlatList
            style={styles.feedViewport}
            data={feedItems}
            keyExtractor={feedKeyExtractor}
            renderItem={renderPost}
            ListHeaderComponent={feedListHeader}
            ListEmptyComponent={feedEmpty}
            ListFooterComponent={feedFooter}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ItemSeparatorComponent={feedSeparator}
            contentContainerStyle={feedContentContainerStyle}
            scrollIndicatorInsets={{ bottom: feedBottomSpacer }}
          />
      )}

      {/* Create Post Modal */}
      <TrackedBottomSheetModal
        ref={createPostSheetRef}
        overlayLabel="FeedCreatePostModal"
        index={0}
        snapPoints={composerSheetSnapPoints}
        animationConfigs={composerSheetAnimationConfigs}
        animateOnMount={true}
        enableDynamicSizing={false}
        enableContentPanningGesture={false}
        enableOverDrag={false}
        backdropComponent={renderComposerBackdrop}
        backgroundStyle={composerSheetBackgroundStyle}
        handleIndicatorStyle={composerSheetHandleIndicatorStyle}
        enablePanDownToClose={!creating && !mediaBusy}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={handleComposerSheetDismiss}
      >
        <BottomSheetView
          testID="mobile-feed-create-post-modal"
          style={[
            styles.modalBox,
            {
              backgroundColor: colors.surface,
            },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.modalHeaderSide}>
              <TouchableOpacity
                activeOpacity={creating || mediaBusy ? 1 : 0.78}
                disabled={creating || mediaBusy}
                onPress={closeComposer}
                style={[styles.modalIconButton, { backgroundColor: isDark ? "#111827" : "#F1F5F9" }]}
                accessibilityRole="button"
                accessibilityLabel="Close composer"
              >
                <Ionicons name="close" size={21} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
              {editingPost ? "Edit Post" : "Create Post"}
            </Text>
            <View style={[styles.modalHeaderSide, styles.modalHeaderSideRight]}>
              <TouchableOpacity
                activeOpacity={creating || mediaBusy || !composerCanSubmit ? 1 : 0.78}
                style={[
                  styles.postBtn,
                  {
                    backgroundColor: composerCanSubmit ? colors.primary : colors.border,
                    opacity: creating || mediaBusy || !composerCanSubmit ? 0.6 : 1,
                  },
                ]}
                onPress={handleCreatePost}
                disabled={creating || mediaBusy || !composerCanSubmit}
                accessibilityRole="button"
                accessibilityLabel={editingPost ? "Save post" : "Post update"}
                testID="mobile-feed-post-submit-button"
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[styles.postBtnText, { color: composerCanSubmit ? "#fff" : colors.textSecondary }]}>
                    {editingPost ? "Save" : "Post"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.composerAuthorRow}>
            <View style={[styles.composerAvatar, { backgroundColor: colors.primary + "30" }]}>
              <Ionicons name="person" size={16} color={colors.primary} />
            </View>
            <View style={styles.composerAuthorText}>
              <Text style={[styles.composerAuthorName, { color: colors.text }]} numberOfLines={1}>
                You
              </Text>
              <TouchableOpacity
                activeOpacity={0.78}
                style={[styles.visibilityChip, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]}
                onPress={() => setPostVisibility(postVisibility === "public" ? "followers" : "public")}
                accessibilityRole="button"
                accessibilityLabel="Change post visibility"
              >
                <Ionicons name={postVisibility === "public" ? "globe-outline" : "people-outline"} size={11} color={colors.textSecondary} />
                <Text style={[styles.visibilityChipText, { color: colors.textSecondary }]}>
                  {postVisibility === "public" ? "Public" : "Followers"}
                </Text>
                <Ionicons name="caret-down" size={10} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.modalContent}>
            <TextInput
              ref={composerInputRef}
              testID="mobile-feed-create-post-input"
              style={[styles.modalTextArea, { color: colors.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textSecondary}
              value={postBody}
              onChangeText={setPostBody}
              multiline
              maxLength={5000}
              editable={showCreate && !creating}
              scrollEnabled
            />

            {postMedia.length > 0 ? (
              <FlatList
                horizontal
                data={postMedia}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                style={styles.composerMediaScroller}
                contentContainerStyle={styles.composerMediaList}
                renderItem={({ item }) => {
                  const previewUri = item.media_type === "video"
                    ? item.thumbnailChoices[item.selectedThumbnailIndex]?.uri || item.thumbnailChoices[0]?.uri || item.uri
                    : item.uri;
                  return (
                    <View style={[styles.composerMediaCard, { borderColor: item.is_cover ? colors.primary : colors.border }]}>
                      <Image source={{ uri: previewUri }} style={styles.composerMediaPreview} />
                      {item.media_type === "video" ? (
                        <View style={styles.composerVideoBadge}>
                          <Ionicons name="play" size={13} color="#FFFFFF" />
                        </View>
                      ) : null}
                      <TouchableOpacity
                        activeOpacity={0.78}
                        onPress={() => removeComposerMedia(item.id)}
                        style={styles.composerRemoveMedia}
                        accessibilityRole="button"
                        accessibilityLabel="Remove media"
                      >
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.78}
                        onPress={() => setComposerCover(item.id)}
                        style={[styles.composerCoverButton, { backgroundColor: item.is_cover ? colors.primary : "rgba(15,23,42,0.78)" }]}
                      >
                        <Text style={styles.composerCoverText}>{item.is_cover ? "Cover" : "Set cover"}</Text>
                      </TouchableOpacity>
                      {item.media_type === "video" && item.thumbnailChoices.length > 1 ? (
                        <View style={styles.composerThumbStrip}>
                          {item.thumbnailChoices.map((choice, index) => (
                            <TouchableOpacity
                              key={`${choice.uri}-${index}`}
                              activeOpacity={0.8}
                              onPress={() => setComposerThumbnail(item.id, index)}
                              style={[
                                styles.composerThumbOption,
                                { borderColor: index === item.selectedThumbnailIndex ? colors.primary : "transparent" },
                              ]}
                            >
                              <Image source={{ uri: choice.uri }} style={styles.composerThumbImage} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                }}
              />
              ) : null}
          </View>

          <View
            style={[
              styles.composerToolRow,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: Platform.OS === "android" ? 18 : Math.max(18, insets.bottom + 12),
              },
            ]}
          >
            <TouchableOpacity
              activeOpacity={mediaBusy ? 1 : 0.78}
              disabled={mediaBusy || postMedia.length >= MAX_POST_MEDIA_ITEMS}
              onPress={handlePickPostMedia}
              style={[styles.composerToolButton, { borderColor: colors.border, opacity: mediaBusy ? 0.7 : 1 }]}
            >
              {mediaBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="images-outline" size={18} color={colors.primary} />}
              <Text style={[styles.composerToolText, { color: colors.text }]}>Media</Text>
            </TouchableOpacity>
            {mediaStatus ? <Text style={[styles.composerMediaStatus, { color: colors.textSecondary }]}>{mediaStatus}</Text> : null}
          </View>
        </BottomSheetView>
      </TrackedBottomSheetModal>

      <SearchBottomSheet
        ref={searchSheetRef}
        onClose={handleSearchSheetClose}
        onItemPress={(id) => openListingDetails(id)}
        onProductionTeamPress={(teamId) => openProductionTeamDetails(teamId)}
        onFollowChanged={() => {
          invalidateFeedCache("following");
          void fetchFeed(activeTabRef.current);
        }}
      />

      <ProductionTeamDetailsSheet
        ref={productionTeamSheetRef}
        teamId={selectedProductionTeamId}
        onDismiss={handleProductionTeamSheetDismiss}
      />

      <ListingDetailsSheet
        ref={bottomSheetRef}
        initialListing={selectedListingPreview}
        listingId={selectedListingId}
        onDismiss={handleDetailsSheetDismiss}
      />

      <PostDetailsModal
        postId={selectedPostId}
        visible={Boolean(selectedPostId)}
        onClose={closePostDetails}
        onReactionChanged={handleModalReactionChanged}
        onCommentChanged={handleModalCommentChanged}
        onShareChanged={handleModalShareChanged}
        onEditPost={handleEditPost}
        onPostDeleted={handleModalPostDeleted}
      />

      {postOptionsTarget && (
        <CustomAlert
          visible
          forceModal
          type="info"
          title={optionsTargetTitle}
          message={optionsTargetMessage}
          buttons={optionsTargetButtons}
          onClose={() => setPostOptionsTarget(null)}
        />
      )}

      {reportTarget ? (
        <ReportModal
          visible
          onClose={() => setReportTarget(null)}
          onSubmit={submitReportTarget}
          targetName={getFeedDisplayName(reportTarget)}
          title={`Report ${getFeedReportTypeLabel(reportTarget)}`}
          reportType={getFeedReportTargetType(reportTarget)}
        />
      ) : null}

      {deletePostTarget && (
        <CustomAlert
          visible
          forceModal
          type="warning"
          title="Delete post"
          message="This post will be removed from the feed."
          buttons={[
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: confirmDeletePost },
          ]}
          onClose={() => setDeletePostTarget(null)}
        />
      )}

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  feedViewport: {
    flex: 1,
  },
  feedSkeletonContent: {
    paddingBottom: 20,
  },
  feedSkeletonSearchWrap: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feedSkeletonLiveRadioWrap: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  feedSkeletonLiveRadioCard: {
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  feedSkeletonTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  feedTabBottomSpacer: {
    height: 5,
  },
  feedSkeletonPostCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  feedSkeletonAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    paddingBottom: 6,
  },
  feedSkeletonBody: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  feedSkeletonMediaWrap: {
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  feedSkeletonSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  feedSkeletonActionRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingVertical: 8,
  },
  feedSkeletonActionItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Composer prompt */
  composerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  composerInput: { flex: 1, height: 48, borderRadius: 16, paddingHorizontal: 16, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 10 },
  composerSearchText: { flex: 1, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium", marginTop: 2 },
  composerFilterButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  composerMediaBtn: { padding: 4 },
  createPostPrompt: {
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 2,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  createPostInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  createPostInputText: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
    marginTop: 4,
  },
  createPostMediaButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  liveRadioWrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  liveRadioCard: {
    minHeight: 88,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 2,
  },
  liveRadioIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  liveRadioArtwork: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  liveRadioEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveRadioEyebrow: {
    fontSize: moderateScale(9),
    fontFamily: "Poppins_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  liveRadioTitle: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_700Bold",
    lineHeight: 20,
  },
  liveRadioSubtitle: {
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
    lineHeight: 16,
    marginTop: 2,
  },
  liveRadioMeta: {
    fontSize: moderateScale(9),
    fontFamily: "Poppins_500Medium",
    lineHeight: 13,
    marginTop: 4,
  },
  liveRadioThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  liveRadioArtworkInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  liveRadioContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  liveRadioBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveRadioBadgeMuted: {
    backgroundColor: "#64748B",
  },
  liveRadioBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  liveRadioBadgeText: {
    color: "#FFFFFF",
    fontSize: moderateScale(8),
    fontFamily: "Poppins_700Bold",
  },
  liveRadioStation: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_700Bold",
    lineHeight: 20,
  },
  liveRadioNowPlayingLine: {
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
    lineHeight: 16,
    marginTop: 2,
  },
  liveRadioMetaRow: {
    marginTop: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveRadioMetaLabel: {
    fontSize: moderateScale(9),
    fontFamily: "Poppins_500Medium",
  },
  liveRadioMetaDot: {
    fontSize: moderateScale(10),
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 12,
  },
  liveRadioTrackCount: {
    maxWidth: 74,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(124,58,237,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveRadioListenerText: {
    flexShrink: 1,
    fontSize: moderateScale(9),
    fontFamily: "Poppins_600SemiBold",
  },
  liveRadioActions: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  liveRadioPlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Tabs */
  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginTop: 6 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  tabText: { fontSize: moderateScale(13), fontWeight: "600" },

  socialPostCard: {
    marginHorizontal: 16,
    marginTop: 15,
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 2,
  },
  socialPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 9,
  },
  socialAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  socialAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  socialAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  socialHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  socialHeaderActions: {
    height: 30,
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "flex-start",
    gap: 6,
    flexShrink: 0,
    marginTop: 1,
  },
  socialHeaderBadgeChip: {
    height: 28,
    maxWidth: 82,
    borderRadius: 999,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  socialHeaderBadgeText: {
    fontSize: moderateScale(10),
    lineHeight: 14,
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  socialName: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_700Bold",
    lineHeight: 19,
  },
  socialMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  socialMetaText: {
    maxWidth: "48%",
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
    lineHeight: 15,
  },
  socialMetaDot: {
    fontSize: moderateScale(10),
    lineHeight: 14,
  },
  socialFollowButton: {
    minWidth: 68,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  socialFollowText: {
    fontSize: moderateScale(10),
    fontFamily: "Poppins_700Bold",
  },
  socialMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  socialCaption: {
    paddingHorizontal: 12,
    paddingTop: 10,
    marginBottom: 10,
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
  socialMediaWrap: {
    marginHorizontal: 12,
    marginTop: 0,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    position: "relative",
  },
  socialGalleryGrid: {
    gap: SOCIAL_GALLERY_GAP,
  },
  socialGalleryRow: {
    flexDirection: "row",
    gap: SOCIAL_GALLERY_GAP,
  },
  socialGalleryColumn: {
    flex: 1,
    gap: SOCIAL_GALLERY_GAP,
  },
  socialGalleryCell: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#CBD5E1",
    position: "relative",
  },
  socialGalleryImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  socialGalleryMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  socialGalleryMoreText: {
    color: "#FFFFFF",
    fontSize: moderateScale(28),
    fontFamily: "Poppins_700Bold",
  },
  socialMediaCount: {
    position: "absolute",
    right: 10,
    top: 10,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(15,23,42,0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  socialMediaCountText: {
    color: "#FFFFFF",
    fontSize: moderateScale(10),
    fontFamily: "Poppins_700Bold",
  },
  socialChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  socialBadgeChip: {
    borderRadius: 999,
    minHeight: 28,
    paddingHorizontal: 9,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  socialBadgeText: {
    fontSize: moderateScale(10),
    lineHeight: 14,
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  socialPriceChip: {
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,58,237,0.06)",
  },
  socialPriceText: {
    fontSize: moderateScale(10),
    lineHeight: 14,
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  socialLinkedCard: {
    marginHorizontal: 12,
    marginTop: 9,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  socialLinkedText: {
    flex: 1,
    fontSize: moderateScale(12),
    fontFamily: "Poppins_600SemiBold",
  },
  socialQuickInfoRow: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingTop: 11,
    paddingBottom: 7,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    gap: 10,
  },
  socialQuickInfoItem: {
    flex: 1,
    minWidth: 0,
    height: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  socialQuickInfoItemStart: {
    justifyContent: "flex-start",
  },
  socialQuickInfoItemEnd: {
    justifyContent: "flex-end",
  },
  socialQuickInfoIconBox: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  socialQuickInfoIcon: {
    width: 20,
    height: 20,
    lineHeight: 20,
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
  socialQuickInfoText: {
    flexShrink: 1,
    fontSize: moderateScale(10.5),
    height: 20,
    lineHeight: 20,
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  socialActionRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingTop: 3,
    borderTopWidth: 1,
    marginHorizontal: 12,
    marginTop: 8,
  },
  socialActionButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
  },
  socialActionText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_600SemiBold",
  },
  socialStatsRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  socialStatsText: {
    flex: 1,
    fontSize: moderateScale(11),
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
  socialCtaRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  socialPrimaryCta: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  socialPrimaryCtaText: {
    color: "#FFFFFF",
    fontSize: moderateScale(12),
    fontFamily: "Poppins_700Bold",
  },
  socialSecondaryCta: {
    minWidth: 90,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  socialSecondaryCtaText: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_700Bold",
  },

  /* Create-post modal */
  modalBox: { flex: 1, overflow: "hidden" },
  modalHeader: { minHeight: 58, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalHeaderSide: { width: 86, alignItems: "flex-start", justifyContent: "center" },
  modalHeaderSideRight: { alignItems: "flex-end" },
  modalIconButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  modalTitle: { flex: 1, textAlign: "center", fontSize: moderateScale(17), fontFamily: "Poppins_700Bold", includeFontPadding: false, lineHeight: 24 },
  postBtn: { minWidth: 70, minHeight: 38, borderRadius: 10, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  postBtnText: { color: "#fff", fontSize: moderateScale(13), fontFamily: "Poppins_700Bold", includeFontPadding: false, lineHeight: 18 },
  composerAuthorRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },
  composerAuthorText: { flex: 1, minWidth: 0 },
  composerAuthorName: { fontSize: moderateScale(15), fontFamily: "Poppins_700Bold", includeFontPadding: false, lineHeight: 20 },
  visibilityChip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4, gap: 4 },
  visibilityChipText: { fontSize: moderateScale(11), fontFamily: "Poppins_500Medium", includeFontPadding: false, lineHeight: 14 },
  modalContent: { flex: 1, minHeight: 0 },
  modalTextArea: { flex: 1, minHeight: 132, fontSize: moderateScale(18), fontFamily: "Poppins_400Regular", lineHeight: 26, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12, textAlignVertical: "top", includeFontPadding: false },
  composerToolRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  composerToolButton: { minHeight: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  composerToolText: { fontSize: moderateScale(12), fontFamily: "Poppins_700Bold", includeFontPadding: false, lineHeight: 16 },
  composerMediaStatus: { flex: 1, fontSize: moderateScale(11), fontFamily: "Poppins_500Medium" },
  composerMediaScroller: { flexGrow: 0, maxHeight: 230 },
  composerMediaList: { paddingHorizontal: 18, paddingBottom: 18, gap: 10 },
  composerMediaCard: { width: 176, minHeight: 212, borderWidth: 2, borderRadius: 12, overflow: "hidden", backgroundColor: "#0F172A" },
  composerMediaPreview: { width: "100%", height: 132, backgroundColor: "#111827" },
  composerVideoBadge: { position: "absolute", left: 8, top: 8, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.78)" },
  composerRemoveMedia: { position: "absolute", right: 8, top: 8, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15,23,42,0.78)" },
  composerCoverButton: { margin: 8, minHeight: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  composerCoverText: { color: "#FFFFFF", fontSize: moderateScale(11), fontFamily: "Poppins_700Bold" },
  composerThumbStrip: { flexDirection: "row", gap: 5, paddingHorizontal: 8, paddingBottom: 8 },
  composerThumbOption: { width: 34, height: 28, borderRadius: 6, borderWidth: 2, overflow: "hidden" },
  composerThumbImage: { width: "100%", height: "100%" },
  emptyText: { textAlign: "center", marginTop: 60, fontSize: moderateScale(14) },

  /* Empty state redesign */
  emptyStateContainer: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: moderateScale(17),
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
    width: "100%",
  },
  emptyActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyActionBtnText: {
    color: "#fff",
    fontSize: moderateScale(13),
    fontFamily: "Poppins_600SemiBold",
  },
  emptyActionBtnTextAlt: {
    fontSize: moderateScale(13),
    fontFamily: "Poppins_600SemiBold",
  },
  followingProfileCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  followingProfileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  followingProfileAvatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  followingProfileBody: {
    flex: 1,
    gap: 4,
  },
  followingRoleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  followingRoleText: {
    fontSize: moderateScale(10),
    fontFamily: "Poppins_600SemiBold",
    lineHeight: moderateScale(12),
    includeFontPadding: false,
    textAlignVertical: "center",
    textTransform: "uppercase",
  },
  followingProfileName: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_700Bold",
  },
  followingProfileHint: {
    fontSize: moderateScale(12),
    fontFamily: "Poppins_400Regular",
    lineHeight: 18,
  },
  followingProfileBtn: {
    minWidth: 92,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  followingProfileBtnText: {
    fontSize: moderateScale(11),
    fontFamily: "Poppins_600SemiBold",
  },
});
