import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  InteractionManager,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import { normalizeVisibleInput } from "../src/components/modal";
import Navbar, {
  NAVBAR_BOTTOM_OFFSET,
  NAVBAR_CLEARANCE,
  NAVBAR_HEIGHT,
} from "../src/components/navbar";
import ProductionTeamDetailsSheet from "../src/components/ProductionTeamDetailsSheet";
import SearchBottomSheet from "../src/components/SearchBottomSheet";
import Skeleton from "../src/components/Skeleton";
import SlidingTabBar from "../src/components/SlidingTabBar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { formatDashedNumericDate } from "../src/utils/friendlyDateTime";
import { useBottomOverlay, useBottomOverlayVisibility } from "../src/context/BottomOverlayContext";
import {
  RADIO_MINI_PLAYER_HEIGHT,
  RADIO_MINI_PLAYER_STACK_GAP,
  useRadioPlayer,
  useRadioPlayerPresence,
} from "../src/context/RadioPlayerContext";
import { emitToast } from "../src/events/toastBus";
import { useFeedQuery } from "../src/data/hooks";
import { useTheme } from "../src/context/ThemeContext";
import {
  buildSocialFollowKey,
  getListingSocialFollowTarget,
  normalizeSocialFollowTargetType,
} from "../src/utils/socialFollow";
import type { SocialFollowTargetType } from "../src/utils/socialFollow";
import {
  getGroqModelInfo,
  rerankHomeFeedWithGroq,
} from "../src/services/groqModelRouter";
import { usePageLoadLogger } from "../src/utils/loadTimeLogger";
import { setSmoothTab } from "../src/utils/smoothTabs";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type FeedTab = "for_you" | "following";
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
const FEED_FOCUS_REFRESH_COOLDOWN_MS = 30000;
const SOCIAL_MEDIA_ASPECT_RATIO = 1.45;
const PESO_SIGN = "\u20B1";
const feedScreenCache = createFeedCache(getGroqModelInfo().modelLabel);
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
const feedLastFetchAt: Record<FeedTab, number> = {
  for_you: 0,
  following: 0,
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
    const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
    if (data?.publicUrl) return data.publicUrl;
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
      created_at: row?.created_at || null,
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
    created_at: row?.created_at || null,
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

const normalizeSignal = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const uniqueNormalizedSignals = (values: unknown[]) => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeSignal(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
};

const scoreFreshness = (createdAt: unknown) => {
  if (typeof createdAt !== "string") return 0.35;

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0.35;

  const ageDays = Math.max(0, (Date.now() - created) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 90) return 0.55;
  return 0.35;
};

const buildOnDeviceReason = (
  skillMatches: string[],
  genreMatches: string[],
  itemType: string,
) => {
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

const ensureRecommendationTypeCoverage = (
  items: any[],
  fallbackItems: any[],
  type: string,
  limit: number,
  minimumCount = 1,
) => {
  if (!Array.isArray(items) || !Array.isArray(fallbackItems) || minimumCount <= 0) {
    return Array.isArray(items) ? items.slice(0, limit) : [];
  }

  const currentCount = items.filter((item) => item?.type === type).length;
  if (currentCount >= minimumCount) {
    return items.slice(0, limit);
  }

  const seen = new Set(items.map((item) => `${item?.type || "item"}:${item?.id || ""}`));
  const additions = fallbackItems
    .filter((item) => item?.type === type)
    .filter((item) => !seen.has(`${item?.type || "item"}:${item?.id || ""}`))
    .slice(0, minimumCount - currentCount);

  if (additions.length === 0) {
    return items.slice(0, limit);
  }

  return [...items.slice(0, Math.max(0, limit - additions.length)), ...additions].slice(0, limit);
};

const rankForYouOnDevice = (
  items: any[],
  profileSignals: { skills: string[]; genres: string[] },
  limit: number,
) => {
  const normalizedSkills = uniqueNormalizedSignals(profileSignals.skills);
  const normalizedGenres = uniqueNormalizedSignals(profileSignals.genres);

  return [...items]
    .map((item) => {
      const signalPool = uniqueNormalizedSignals([
        item?.name,
        item?.location,
        item?.genre,
        item?.description,
        item?.owner_name,
        ...(Array.isArray(item?.genres) ? item.genres : []),
        ...(Array.isArray(item?.skills) ? item.skills : []),
      ]);

      const skillMatches = normalizedSkills.filter((skill) =>
        signalPool.some((signal) => signal.includes(skill) || skill.includes(signal)),
      );
      const genreMatches = normalizedGenres.filter((genre) =>
        signalPool.some((signal) => signal.includes(genre) || genre.includes(signal)),
      );

      const skillScore = normalizedSkills.length
        ? Math.min(skillMatches.length / Math.min(3, normalizedSkills.length), 1)
        : 0;
      const genreScore = normalizedGenres.length
        ? Math.min(genreMatches.length / Math.min(3, normalizedGenres.length), 1)
        : 0;
      const popularityScore = Math.min(Number(item?.rating || 0) / 5, 1);
      const recencyScore = scoreFreshness(item?.created_at);

      let similarity =
        skillScore * 0.35 +
        genreScore * 0.35 +
        popularityScore * 0.2 +
        recencyScore * 0.1;

      if (normalizedSkills.length === 0 && normalizedGenres.length === 0) {
        similarity = popularityScore * 0.7 + recencyScore * 0.3;
      }

      return {
        ...item,
        similarity: Number(Math.max(0.05, Math.min(1, similarity)).toFixed(4)),
        aiReason: buildOnDeviceReason(skillMatches, genreMatches, item?.type || "Listing"),
      };
    })
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, Math.max(8, limit));
};

const isGroqQuotaExhaustedMessage = (value: unknown) => {
  const message = typeof value === "string" ? value.toLowerCase() : "";
  if (!message) return false;
  return (
    message.includes("out of api calls") ||
    message.includes("rate limit") ||
    message.includes("free-tier") ||
    message.includes("quota")
  );
};

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

const PH_LOCATION_COORDINATES: Array<{ keywords: string[]; coordinate: FeedCoordinate }> = [
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
      : item?.type === "Studio"
        ? "Distance N/A"
        : rawLocation.split(",")[0]?.trim() || "Local";
  const ratingLabel =
    rating > 0
      ? `${rating.toFixed(1)} Rating`
      : item?.type === "Studio"
        ? "New Studio"
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

  if (type === "Studio") {
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

  if (type === "Studio") {
    badges.push("Live Room");
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
        .map((media: any) => resolveFeedMediaUrl(media?.url || media?.storage_path || media?.public_url))
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

const getFeedAvatarUri = (item: any) => {
  const avatar = resolveFeedMediaUrl(item?.author_avatar || item?.avatar_url || item?.logo_url || "");
  if (avatar) return avatar;
  return getFeedMediaUrls(item)[0] || getFeedFallbackImage(item?.type || "Artist", item?.id);
};

const getFeedDisplayName = (item: any) =>
  item?.__feedKind === "ai_card"
    ? item?.name || "MusikaLokal"
    : item?.author_name || "MusikaLokal";

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
  if (item?.type === "Artist") return "View Profile";
  if (item?.type === "Group") return "View Group";
  if (item?.type === "Gig") return "View Gig";
  if (item?.type === "Production") return "View Team";
  return "View Details";
};

const getFeedEngagementCounts = (item: any) => ({
  likes: Number(item?.reaction_count || item?.review_count || 0),
  comments: Number(item?.comment_count || 0),
  shares: Number(item?.share_count || 0),
});

const DEMO_RADIO_STATION = {
  id: "musikalokal-ncs-radio",
  name: "MusikaLokal NCS Radio",
  description: "NCS releases for the demo radio rotation",
  genre: "NCS / EDM",
  is_active: true,
  __queueReady: true,
  __isDemoStation: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  live_anchor_at: "2026-01-01T00:00:00.000Z",
  rotation_interval_minutes: 15,
  slot_count: 1,
  creator: {
    full_name: "NoCopyrightSounds",
  },
  live_slots: [
    {
      id: "musikalokal-ncs-slot",
      station_id: "musikalokal-ncs-radio",
      position: 0,
      label: "NCS spotlight",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      playlist: {
        id: "musikalokal-ncs-playlist",
        title: "NCS spotlight",
        track_count: 3,
        items: [
          {
            id: "musikalokal-ncs-sky-high",
            title: "Sky High",
            artist_name: "Elektronomia",
            audio_url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/290/sky-high-1586948785-jGkCsW2xA9.mp3",
          },
          {
            id: "musikalokal-ncs-nekozilla",
            title: "Nekozilla",
            artist_name: "Different Heaven",
            audio_url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/275/nekozilla-1586948469-wOdU2Fj3uG.mp3",
          },
          {
            id: "musikalokal-ncs-on-and-on",
            title: "On & On (feat. Daniel Levi)",
            artist_name: "Cartoon, Jeja",
            audio_url: "https://ncsmusic.s3.eu-west-1.amazonaws.com/tracks/000/000/152/1654766391_N6n9kRBaAr_Cartoon---On--On-feat.-Daniel-Levi-_NCS-Release_.mp3",
          },
        ],
      },
    },
  ],
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

const getStationTrackCount = (station: any) =>
  getStationSlots(station).reduce((total: number, slot: any) => {
    const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
    const playlistCount = Number(slot?.playlist?.track_count || 0);
    return total + Math.max(items.length, playlistCount);
  }, 0);

const getStationPlayableTrackCount = (station: any) =>
  getStationSlots(station).reduce((total: number, slot: any) => {
    const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
    return total + items.filter((item: any) => (
      typeof item?.audio_url === "string" && item.audio_url.trim().length > 0
    ) || (
      typeof item?.teaser?.storage_path === "string" && item.teaser.storage_path.trim().length > 0
    )).length;
  }, 0);

const getStationNowPlayingTitle = (station: any, slotIndex = 0) => {
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

type LiveRadioCardProps = {
  borderColor: string;
  cardColor: string;
  isDark: boolean;
  primaryColor: string;
  textColor: string;
  mutedTextColor: string;
};

const LiveRadioCard = React.memo(function LiveRadioCard({
  borderColor,
  cardColor,
  isDark,
  primaryColor,
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
  const [featuredStation, setFeaturedStation] = useState<any | null>(null);
  const [loadingStation, setLoadingStation] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchLiveStation = async () => {
      setLoadingStation(true);

      try {
        const fetchStations = async (featuredOnly: boolean) => {
          const { data, error } = await supabase.functions.invoke("manage-playlists", {
            body: {
              action: "browse_stations",
              featured_only: featuredOnly,
              include_items: true,
              limit: 1,
            },
          });

          if (error) {
            throw error;
          }

          return Array.isArray(data?.data) ? data.data : [];
        };

        const featuredStations = await fetchStations(true);
        const stations = featuredStations.length > 0 ? featuredStations : await fetchStations(false);

        if (!cancelled) {
          setFeaturedStation(stations[0] || null);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Live radio station fetch error:", error);
          setFeaturedStation(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingStation(false);
        }
      }
    };

    void fetchLiveStation();

    return () => {
      cancelled = true;
    };
  }, []);

  const liveFeaturedStation = featuredStation && getStationPlayableTrackCount(featuredStation) > 0
    ? featuredStation
    : null;
  const displayStation = activeStation || liveFeaturedStation || DEMO_RADIO_STATION;
  const stationSlots = getStationSlots(displayStation);
  const stationSlotCount = getStationSlotCount(displayStation);
  const stationTrackCount = getStationTrackCount(displayStation);
  const isCurrentStation = Boolean(
    displayStation?.id && activeStation?.id && displayStation.id === activeStation.id,
  );
  const isTuneInLoading = Boolean(
    displayStation?.id && loadingStationId === displayStation.id,
  );
  const canTuneIn = Boolean(displayStation?.id && displayStation?.is_active !== false && stationSlotCount > 0);
  const stationName =
    typeof displayStation?.name === "string" && displayStation.name.trim().length > 0
      ? displayStation.name.trim()
      : "MusikaLokal Radio";
  const nowPlayingTitle = isCurrentStation
    ? currentTrack?.title || getStationNowPlayingTitle(displayStation, currentSlotIndex)
    : getStationNowPlayingTitle(displayStation, 0);
  const rotationSummary = stationTrackCount > 0
    ? `${stationTrackCount} track${stationTrackCount === 1 ? "" : "s"}`
    : stationSlotCount > 0
      ? `${stationSlotCount} playlist${stationSlotCount === 1 ? "" : "s"}`
      : "No station";
  const playButtonLabel = loadingStation || isTuneInLoading
    ? "Loading"
    : !canTuneIn
      ? "Offline"
      : isCurrentStation && isPlaying
        ? "Pause"
        : isCurrentStation
          ? "Resume"
          : "Listen";
  const playIcon = loadingStation || isTuneInLoading
    ? null
    : isCurrentStation && isPlaying
      ? "pause"
      : "play";
  const statusBadgeLabel = loadingStation ? "..." : canTuneIn ? "LIVE" : "OFF";

  const openStationDetails = useCallback(() => {
    if (!displayStation?.id || displayStation?.__isDemoStation) return;

    router.push({
      pathname: "/station_details" as any,
      params: { station_id: String(displayStation.id) },
    });
  }, [displayStation?.id]);

  const handlePlayPress = useCallback(async () => {
    if (!displayStation || loadingStation || isTuneInLoading) {
      return;
    }

    if (!canTuneIn) {
      emitToast({
        type: "info",
        title: "Station offline",
        message: "This station needs at least one playlist on air before it can play.",
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

  return (
    <View style={styles.liveRadioWrap}>
      <View
        style={[
          styles.liveRadioCard,
          {
            backgroundColor: cardColor,
            borderColor,
            shadowOpacity: isDark ? 0 : 0.06,
          },
        ]}
      >
        <View style={[styles.liveRadioThumbnail, { backgroundColor: primaryColor + (isDark ? "24" : "14") }]}>
          <View style={[styles.liveRadioArtworkInner, { borderColor: primaryColor + "55" }]}>
            <Ionicons name={isCurrentStation && isPlaying ? "volume-high" : "radio"} size={20} color={primaryColor} />
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={displayStation?.id ? 0.78 : 1}
          disabled={!displayStation?.id}
          onPress={openStationDetails}
          style={styles.liveRadioContent}
        >
          <Text style={[styles.liveRadioStation, { color: textColor }]} numberOfLines={1}>
            {loadingStation ? "Finding live stations..." : stationName}
          </Text>
          <Text style={[styles.liveRadioNowPlayingLine, { color: mutedTextColor }]} numberOfLines={1}>
            {loadingStation ? "Now playing: Loading rotation" : `Now playing: ${nowPlayingTitle}`}
          </Text>
          <View style={styles.liveRadioMetaRow}>
            <Text style={[styles.liveRadioMetaLabel, { color: mutedTextColor }]} numberOfLines={1}>
              Live Radio
            </Text>
            <Text style={[styles.liveRadioMetaDot, { color: mutedTextColor }]}>|</Text>
            <View style={styles.liveRadioTrackCount}>
              <Ionicons name={stationSlots.length > 0 ? "musical-notes-outline" : "cloud-offline-outline"} size={12} color={mutedTextColor} />
              <Text style={[styles.liveRadioListenerText, { color: mutedTextColor }]} numberOfLines={1}>
                {rotationSummary}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.liveRadioActions}>
          <View style={[styles.liveRadioBadge, !canTuneIn && styles.liveRadioBadgeMuted]}>
            <View style={styles.liveRadioBadgeDot} />
            <Text style={styles.liveRadioBadgeText}>{statusBadgeLabel}</Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={`${playButtonLabel} Live Radio`}
            disabled={loadingStation || isTuneInLoading}
            onPress={handlePlayPress}
            style={[
              styles.liveRadioPlayButton,
              {
                backgroundColor: canTuneIn ? primaryColor : (isDark ? "#334155" : "#CBD5E1"),
                opacity: loadingStation || isTuneInLoading ? 0.8 : 1,
              },
            ]}
          >
            {loadingStation || isTuneInLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name={playIcon as any} size={17} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  onOpenProduct: (productId: string) => void;
  onOpenProfile: (profileId: string) => void;
  onOpenProductionTeam: (teamId: string) => void;
  onOpenPlaylist: (playlistId: string) => void;
  onReaction: (postId: string, currentReaction: string | null) => void;
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
  onOpenProduct,
  onOpenProfile,
  onOpenProductionTeam,
  onOpenPlaylist,
  onReaction,
  showAuthorFollow,
  timeAgo,
}: SocialFeedCardProps) {
  const isSuggestion = item?.__feedKind === "ai_card";
  const mediaUrls = useMemo(() => getFeedMediaUrls(item), [item]);
  const badges = useMemo(() => getFeedServiceBadges(item), [item]);
  const priceChips = useMemo(() => getFeedPriceChips(item), [item]);
  const quickInfoItems = useMemo(() => getFeedQuickInfoItems(item), [item]);
  const engagement = useMemo(() => getFeedEngagementCounts(item), [item]);
  const avatarUri = useMemo(() => getFeedAvatarUri(item), [item]);
  const displayName = getFeedDisplayName(item);
  const metaLabel = getFeedMetaLabel(item);
  const caption = getFeedCaption(item);
  const timestamp = getFeedTimestampLabel(item, timeAgo);
  const primaryCtaLabel = getFeedPrimaryCtaLabel(item);
  const primaryMediaUri = mediaUrls[0] || "";
  const mediaHeight = Math.round(mediaWidth / SOCIAL_MEDIA_ASPECT_RATIO);

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

  const handleReaction = useCallback(() => {
    if (isSuggestion) return;
    onReaction(item.id, item.my_reaction);
  }, [isSuggestion, item?.id, item?.my_reaction, onReaction]);

  const handleComment = useCallback(() => {
    if (!isSuggestion) {
      onOpenPost(item.id);
    }
  }, [isSuggestion, item?.id, onOpenPost]);

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

        <TouchableOpacity activeOpacity={0.78} accessibilityRole="button" accessibilityLabel="More options" style={styles.socialMenuButton}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.9} onPress={handleOpenPrimary}>
        <Text style={[styles.socialCaption, { color: colors.text }]} numberOfLines={3}>
          {caption}
        </Text>
      </TouchableOpacity>

      {primaryMediaUri ? (
        <TouchableOpacity activeOpacity={0.92} onPress={handleOpenPrimary} style={styles.socialMediaWrap}>
          <CachedImage
            uri={primaryMediaUri}
            style={[styles.socialMedia, { height: mediaHeight }]}
            width={Math.round(mediaWidth)}
            height={mediaHeight}
            priority="normal"
          />
          {mediaUrls.length > 1 ? (
            <View style={styles.socialMediaCount}>
              <Ionicons name="albums-outline" size={12} color="#FFFFFF" />
              <Text style={styles.socialMediaCountText}>1/{mediaUrls.length}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {badges.length > 0 || priceChips.length > 0 ? (
        <View style={styles.socialChipRow}>
          {badges.map((badge) => (
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
          {quickInfoItems.map((info) => (
            <View key={`${info.icon}-${info.label}`} style={styles.socialQuickInfoItem}>
              <View
                style={[
                  styles.socialQuickInfoIconBox,
                  info.icon === "star" && styles.socialQuickInfoStarIconBox,
                  info.icon === "location" && styles.socialQuickInfoLocationIconBox,
                  info.icon === "chatbubble-ellipses" && styles.socialQuickInfoChatIconBox,
                ]}
              >
                <Ionicons
                  name={info.icon}
                  size={15}
                  color={info.icon === "star" ? "#F59E0B" : colors.primary}
                  style={styles.socialQuickInfoIcon}
                />
              </View>
              <Text style={[styles.socialQuickInfoText, { color: colors.textSecondary }]} numberOfLines={1}>
                {info.label}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={[styles.socialEngagementRow, { borderBottomColor: borderColor }]}>
            <View style={styles.socialEngagementLeft}>
              <View style={styles.socialLikeBubble}>
                <Ionicons name="heart" size={10} color="#FFFFFF" />
              </View>
              <Text style={[styles.socialEngagementText, { color: colors.textSecondary }]}>
                {engagement.likes} likes
              </Text>
            </View>
            <Text style={[styles.socialEngagementText, { color: colors.textSecondary }]} numberOfLines={1}>
          {engagement.comments} comments • {engagement.shares} shares
            </Text>
          </View>

          <View style={styles.socialActionRow}>
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={handleReaction}
              style={styles.socialActionButton}
            >
              <Ionicons
                name={item?.my_reaction ? "heart" : "heart-outline"}
                size={18}
                color={item?.my_reaction ? "#EF4444" : colors.textSecondary}
              />
              <Text style={[styles.socialActionText, { color: item?.my_reaction ? "#EF4444" : colors.textSecondary }]}>
                Like
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={handleComment}
              style={styles.socialActionButton}
            >
              <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
              <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Comment</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.78} style={styles.socialActionButton}>
              <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.socialCtaRow}>
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={handleOpenPrimary}
          style={[styles.socialPrimaryCta, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.socialPrimaryCtaText}>{primaryCtaLabel}</Text>
        </TouchableOpacity>

        {isSuggestion && followTarget ? (
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
    </View>
  );
});

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, isGuest, loading: authLoading } = useAuth();
  const { clearBottomOverlays } = useBottomOverlay();
  const { activeStation } = useRadioPlayerPresence();
  const insets = useSafeAreaInsets();
  const groqModelLabel = getGroqModelInfo().modelLabel;

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
  const [creating, setCreating] = useState(false);
  useBottomOverlayVisibility(showCreate, "FeedCreatePostModal");

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const searchSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const bottomSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const productionTeamSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const activeTabRef = React.useRef<FeedTab>(tab);
  const feedCacheRef = React.useRef<Record<FeedTab, FeedCacheEntry>>(feedScreenCache);
  const feedInFlightRef = React.useRef<Record<FeedTab, boolean>>({ for_you: false, following: false });
  const feedRequestIdRef = React.useRef<Record<FeedTab, number>>({ for_you: 0, following: 0 });
  const followingKeysRef = React.useRef<Set<string>>(new Set());
  const hasFocusedFeedRef = React.useRef(false);
  const previousTabRef = React.useRef<FeedTab>(tab);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [selectedProductionTeamId, setSelectedProductionTeamId] = useState<string | null>(null);
  const [pendingReopenListingId, setPendingReopenListingId] = useState<string | null>(null);

  const forYouFeedQuery = useFeedQuery({
    enabled: false,
    feedTab: "for_you",
    feedType: "public",
    limit: FEED_PAGE_SIZE,
    personalize: false,
    userId,
  });
  const followingFeedQuery = useFeedQuery({
    enabled: false,
    feedTab: "following",
    feedType: "following",
    limit: FEED_PAGE_SIZE,
    userId,
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

  usePageLoadLogger({
    counts: {
      aiCards: aiCards.length,
      followingEntities: followingEntities.length,
      posts: posts.length,
    },
    details: {
      hasMore,
      tab,
      user: userId ? "signed-in" : "guest",
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

  const applyFeedSnapshot = useCallback((snapshot: FeedCacheEntry) => {
    React.startTransition(() => {
      setPosts(snapshot.posts);
      setAiCards(snapshot.aiCards);
      setAiFeedMessage(normalizeAiFeedMessage(snapshot.aiFeedMessage || ""));
      setAiFeedProvider(normalizeAiFeedProvider(snapshot.aiFeedProvider || groqModelLabel));
      setHasMore(snapshot.hasMore);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    });
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
    const nextPosts = pages
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
    const cachedEntry = feedCacheRef.current[feedTab];

    return {
      posts: nextPosts,
      aiCards: nextPosts.length > 0 || feedTab !== "for_you" ? [] : cachedEntry.aiCards,
      aiFeedMessage: nextPosts.length > 0 || feedTab !== "for_you" ? "" : normalizeAiFeedMessage(cachedEntry.aiFeedMessage || ""),
      aiFeedProvider:
        nextPosts.length > 0 || feedTab !== "for_you"
          ? groqModelLabel
          : normalizeAiFeedProvider(cachedEntry.aiFeedProvider || groqModelLabel),
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
    (listingId: string) => {
      if (!listingId) return;
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

  const fetchAiCardsForYou = useCallback(async (): Promise<FeedAiCardsResult> => {
    if (!session || !userId) {
      return { cards: [], provider: groqModelLabel, message: "" };
    }

    setIsAiCardsLoading(true);

    try {
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
          .eq("status", "open")
          .eq("permit_status", "approved")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("profiles")
          .select("id, full_name, avatar_url, address, role, created_at")
          .eq("role", "musician")
          .neq("id", userId)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("production_teams")
          .select("id, owner_id, name, description, logo_url, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("profiles")
          .select("address, location")
          .eq("id", userId)
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
            .order("created_at", { ascending: false })
            .limit(24),
          supabase
            .from("profiles")
            .select("id, full_name, avatar_url, address, role, created_at")
            .neq("id", userId)
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

      const normalizedStudios = finalStudios.map((item: any) => ({
        id: item.id,
        type: "Studio",
        name: item.name || "Unnamed Studio",
        image: Array.isArray(item.images) ? item.images[0] || null : null,
        images: Array.isArray(item.images) ? item.images : [],
        rating: Number(item.rating || 0),
        review_count: Number(item.review_count || 0),
        location: item.address || "",
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        genre: item.type || "Studio",
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        hourly_rate: item.hourly_rate?.toString() || null,
        rehearsal_rate: item.rehearsal_rate?.toString() || null,
        recording_rate: item.recording_rate?.toString() || null,
        studio_type: item.type || null,
        social_follow_target_id: item.owner_id || null,
        social_follow_target_type: "profile",
      }));

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
      ].map(withFeedDistance).map(ensureFeedCardImage);

      if (allCandidates.length === 0) {
        return { cards: [], provider: "", message: "" };
      }

      const [skillsResult, genresResult] = await Promise.all([
        supabase.from("profile_skills").select("skill").eq("profile_id", userId),
        supabase.from("profile_genres").select("genre").eq("profile_id", userId),
      ]);

      const profileSignals = {
        skills: (skillsResult.data || [])
          .map((row: any) => row?.skill)
          .filter((value: any): value is string => typeof value === "string" && value.trim().length > 0),
        genres: (genresResult.data || [])
          .map((row: any) => row?.genre)
          .filter((value: any): value is string => typeof value === "string" && value.trim().length > 0),
      };

      const localRankedBase = rankForYouOnDevice(allCandidates, profileSignals, AI_CARD_LIMIT + 8);
      const localRanked = ensureRecommendationTypeCoverage(
        localRankedBase,
        normalizedTeams,
        "Production",
        AI_CARD_LIMIT,
        normalizedTeams.length > 0 ? 1 : 0,
      );
      const llmResult = await rerankHomeFeedWithGroq({
        candidates: localRanked,
        profileSignals,
        limit: AI_CARD_LIMIT,
      });

      if (isGroqQuotaExhaustedMessage(llmResult.message)) {
        return {
          cards: localRanked.slice(0, AI_CARD_LIMIT).map((item) => ({ ...ensureFeedCardImage(item), __feedKind: "ai_card" })),
          provider: "Normal Feed",
          message: "Groq free-tier limit reached. Showing normal recommendation cards.",
        };
      }

      if (llmResult.aiPowered && llmResult.recommendations.length > 0) {
        const ensuredRecommendations = ensureRecommendationTypeCoverage(
          llmResult.recommendations,
          normalizedTeams,
          "Production",
          AI_CARD_LIMIT,
          normalizedTeams.length > 0 ? 1 : 0,
        );

        return {
          cards: ensuredRecommendations
            .slice(0, AI_CARD_LIMIT)
            .map((item: any) => ({ ...ensureFeedCardImage(item), __feedKind: "ai_card" })),
          provider: llmResult.aiProvider || groqModelLabel,
          message: llmResult.message || `Realtime For You cards reranked by ${groqModelLabel}.`,
        };
      }

      return {
        cards: localRanked.slice(0, AI_CARD_LIMIT).map((item) => ({ ...ensureFeedCardImage(item), __feedKind: "ai_card" })),
        provider: llmResult.aiProvider || "Local Ranker",
        message: llmResult.message || "Using local ranking for Feed cards.",
      };
    } catch (error: any) {
      console.error("Feed AI cards error:", error);
      return {
        cards: [],
        provider: "Normal Feed",
        message: error?.message || "Unable to load recommendation cards right now.",
      };
    }
  }, [groqModelLabel, session, userId]);

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
    const entities = rows
      .map((row: any) => normalizeFollowingEntity(row, ownerAvatarById))
      .filter((value: any) => value !== null);

    setFollowingKeys(keys);
    setFollowingEntities(entities);

    return { keys, entities };
  }, [session]);

  /* ── Data fetching ── */
  const fetchFeed = useCallback(async (feedTab: FeedTab, append = false, currentLength = 0) => {
    if (authLoading) {
      return;
    }

    if (!session) {
      feedCacheRef.current = createFeedCache(groqModelLabel);
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
      const currentForYouQuery = forYouFeedQueryRef.current;
      const currentFollowingQuery = followingFeedQueryRef.current;
      const refetchFeedPage =
        feedTab === "following" ? currentFollowingQuery.refetch : currentForYouQuery.refetch;
      const fetchNextFeedPage =
        feedTab === "following"
          ? currentFollowingQuery.fetchNextPage
          : currentForYouQuery.fetchNextPage;
      const queryResult = append
        ? await fetchNextFeedPage()
        : await refetchFeedPage();

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
      const nextPosts = pages
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
      const cachedEntry = feedCacheRef.current[feedTab];
      let nextAiCards = cachedEntry.aiCards;
      let nextAiFeedMessage = normalizeAiFeedMessage(cachedEntry.aiFeedMessage || "");
      let nextAiFeedProvider = normalizeAiFeedProvider(cachedEntry.aiFeedProvider || groqModelLabel);

      if (!append) {
        if (nextPosts.length > 0 || feedTab !== "for_you") {
          nextAiCards = [];
          nextAiFeedMessage = "";
          nextAiFeedProvider = groqModelLabel;
        }
      }

      if (requestId !== feedRequestIdRef.current[feedTab]) {
        return;
      }

      const nextSnapshot: FeedCacheEntry = {
        posts: nextPosts,
        aiCards: nextAiCards,
        aiFeedMessage: nextAiFeedMessage,
        aiFeedProvider: nextAiFeedProvider,
        hasMore: Boolean(latestPage?.nextCursor),
        loaded: true,
      };
      const shouldLoadForYouRecommendations = !append && feedTab === "for_you" && nextPosts.length === 0;

      feedCacheRef.current[feedTab] = nextSnapshot;
      feedLastFetchAt[feedTab] = Date.now();

      if (shouldLoadForYouRecommendations && activeTabRef.current === feedTab) {
        setIsAiCardsLoading(true);
      } else if (activeTabRef.current === feedTab) {
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

      if (shouldLoadForYouRecommendations) {
        void fetchAiCardsForYou().then((aiResult) => {
          if (requestId !== feedRequestIdRef.current[feedTab]) {
            return;
          }

          const aiSnapshot: FeedCacheEntry = {
            ...feedCacheRef.current[feedTab],
            aiCards: aiResult.cards,
            aiFeedMessage: normalizeAiFeedMessage(aiResult.message || ""),
            aiFeedProvider: normalizeAiFeedProvider(aiResult.provider || groqModelLabel),
            loaded: true,
          };

          feedCacheRef.current[feedTab] = aiSnapshot;
          feedLastFetchAt[feedTab] = Date.now();

          if (activeTabRef.current === feedTab) {
            applyFeedSnapshot(aiSnapshot);
            setIsAiCardsLoading(false);
          }
        }).catch((aiError) => {
          console.error("Feed AI cards error:", aiError);
          if (requestId === feedRequestIdRef.current[feedTab] && activeTabRef.current === feedTab) {
            setIsAiCardsLoading(false);
          }
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

      if (!append && feedTab === "for_you") {
        try {
          const aiResult = await fetchAiCardsForYou();
          fallbackSnapshot = {
            posts: [],
            aiCards: aiResult.cards,
            aiFeedMessage: normalizeAiFeedMessage(aiResult.message || "Social feed is unavailable. Loading recommendation cards."),
            aiFeedProvider: normalizeAiFeedProvider(aiResult.provider || groqModelLabel),
            hasMore: false,
            loaded: true,
          };
        } catch (aiError) {
          console.error("Fallback AI cards error:", aiError);
          fallbackSnapshot = {
            ...createEmptyFeedCacheEntry(groqModelLabel),
            aiFeedProvider: groqModelLabel,
            hasMore: false,
            loaded: true,
          };
        }
      } else if (!fallbackSnapshot.loaded) {
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
    applyFeedSnapshot,
    authLoading,
    fetchAiCardsForYou,
    groqModelLabel,
    loadFollowingGraph,
    session,
  ]);

  useFocusEffect(useCallback(() => {
    if (authLoading) {
      return;
    }

    hasFocusedFeedRef.current = true;
    clearBottomOverlays();
    const currentTab = activeTabRef.current;
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

    const focusRefreshTask = InteractionManager.runAfterInteractions(() => {
      if (shouldRefreshFeed) {
        void fetchFeed(currentTab);
      }
    });

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
      focusRefreshTask.cancel();
    };
  }, [authLoading, clearBottomOverlays, fetchFeed, hydrateCachedFeed, isEmptyForYouSnapshot]));

  useEffect(() => {
    if (authLoading || !hasFocusedFeedRef.current) {
      return;
    }

    if (previousTabRef.current === tab) {
      return;
    }

    previousTabRef.current = tab;

    const tabSwitchTask = InteractionManager.runAfterInteractions(() => {
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

      if (shouldRefreshTabFeed) {
        void fetchFeed(tab);
      } else {
        setLoading(false);
        setRefreshing(false);
      }
    });

    return () => tabSwitchTask.cancel();
  }, [authLoading, fetchFeed, hydrateCachedFeed, isEmptyForYouSnapshot, tab]);

  const onRefresh = useCallback(() => {
    if (authLoading) {
      return;
    }

    setRefreshing(true);
    if (tab === "for_you" && posts.length === 0 && aiCards.length === 0) {
      setIsAiCardsLoading(true);
    }
    void fetchFeed(tab);
  }, [aiCards.length, authLoading, fetchFeed, posts.length, tab]);

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
  const handleCreatePost = async () => {
    const content = normalizeVisibleInput(postBody);
    if (!content) {
      setAlert({ type: "warning", title: "Empty Post", message: "Please write something." });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "create_post", content, visibility: postVisibility },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        emitToast({ type: "success", title: "Posted!", message: "Your post is live." });
        setShowCreate(false);
        setPostBody("");
        void fetchFeed(activeTabRef.current);
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create post" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setCreating(false);
    }
  };

  const handleReaction = useCallback(async (postId: string, currentReaction: string | null) => {
    // optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, my_reaction: currentReaction ? null : "like", reaction_count: currentReaction ? Math.max((p.reaction_count || 1) - 1, 0) : (p.reaction_count || 0) + 1 }
          : p
      )
    );
    try {
      const { error } = await supabase.functions.invoke("manage-social-feed", {
        body: currentReaction ? { action: "remove_reaction", post_id: postId } : { action: "react_to_post", post_id: postId, reaction_type: "like" },
      });

      if (error) {
        throw error;
      }
    } catch (e: any) {
      console.error("Reaction error:", e);
    }
  }, []);

  const handleFollow = useCallback(async (
    targetId: string,
    targetType: SocialFollowTargetType,
    isFollowing: boolean,
  ) => {
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
  }, [fetchFeed, followBusyByKey, invalidateFeedCache, loadFollowingGraph, tab]);

  /* ── Renderers ── */

  const openPostDetails = useCallback((postId: string) => {
    if (!postId) return;
    router.push({ pathname: "/post_details", params: { post_id: postId } });
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
              openListingDetails(post.id);
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
      const followTarget = getListingSocialFollowTarget(post, userId);
      const followKey = followTarget
        ? buildSocialFollowKey(followTarget.type, followTarget.id)
        : "";
      const isFollowingSuggestion = followKey ? followingKeys.has(followKey) : false;
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
          onOpenProduct={openProductDetails}
          onOpenProfile={openProfileDetails}
          onOpenProductionTeam={openProductionTeamDetails}
          onOpenPlaylist={openPlaylistDetails}
          onReaction={handleReaction}
          showAuthorFollow={false}
          timeAgo={timeAgo}
        />
      );
    }

    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    const borderColor = isDark ? "#334155" : "#EEF0F4";
    const authorFollowTarget =
      post.author_id && post.author_id !== userId
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
        onOpenProduct={openProductDetails}
        onOpenProfile={openProfileDetails}
        onOpenProductionTeam={openProductionTeamDetails}
        onOpenPlaylist={openPlaylistDetails}
        onReaction={handleReaction}
        showAuthorFollow={Boolean(authorFollowTarget)}
        timeAgo={timeAgo}
      />
    );
  }, [
    colors.border,
    colors.primary,
    colors.text,
    colors.textSecondary,
    followBusyByKey,
    followingKeys,
    handleFollow,
    handleReaction,
    isDark,
    openListingDetails,
    openPlaylistDetails,
    openPostDetails,
    openProductDetails,
    openProfileDetails,
    openProductionTeamDetails,
    timeAgo,
    userId,
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

        <LiveRadioCard
          borderColor={colors.border}
          cardColor={isDark ? "#0F172A" : "#F8FAFC"}
          isDark={isDark}
          primaryColor={colors.primary}
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
    isDark,
    openSearchSheet,
    tab,
  ]);

  const showInitialFeedSkeleton = loading && !refreshing && !loadingMore;

  const renderFeedSkeleton = () => {
    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    const skeletonCardBg = isDark ? "#1E293B" : "#FFFFFF";
    const skeletonBorder = isDark ? "#334155" : "#E2E8F0";

    return (
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.feedSkeletonContent, { paddingBottom: feedBottomSpacer + 20 }]}
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

  const postAuthorIdsWithPosts = useMemo(
    () =>
      new Set(
        posts
          .map((post) => post?.author_id)
          .filter((authorId): authorId is string => typeof authorId === "string" && authorId.length > 0),
      ),
    [posts],
  );

  const feedItems = useMemo(() => {
    if (loading) return [];
    if (tab === "for_you" && posts.length === 0 && aiCards.length > 0) {
      return dedupeFeedItems(aiCards);
    }
    if (tab === "following" && followingEntities.length > 0) {
      const entitiesWithoutPosts = followingEntities.filter(
        (entity) => entity.followed_type !== "profile" || !postAuthorIdsWithPosts.has(entity.id),
      );

      if (entitiesWithoutPosts.length > 0) {
        return dedupeFeedItems([...entitiesWithoutPosts, ...posts]);
      }
    }
    return dedupeFeedItems(posts);
  }, [aiCards, followingEntities, loading, postAuthorIdsWithPosts, posts, tab]);

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
    () => <View style={{ height: isShowingAiCards ? 10 : 8 }} />,
    [isShowingAiCards],
  );
  const feedFooter = useMemo(
    () => (
      <>
        {loadingMore && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />}
        <View style={{ height: feedBottomSpacer }} />
      </>
    ),
    [colors.primary, feedBottomSpacer, loadingMore],
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
              ? "Follow musicians, groups, and duos to see their updates here. Followed profiles and groups will also appear until they have posts."
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
  const feedContentContainerStyle = useMemo(() => ({ paddingBottom: 20 }), []);

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="MusikaLokal" />
        <GuestSignInGate message="Sign in to see your social feed" />
        <Navbar />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? "#0F172A" : "#FFFFFF" }]}>
      <Header title="MusikaLokal" />
      {showInitialFeedSkeleton ? (
        renderFeedSkeleton()
      ) : (
        <FlatList
            data={feedItems}
            initialNumToRender={4}
            keyExtractor={feedKeyExtractor}
            maxToRenderPerBatch={4}
            renderItem={renderPost}
            removeClippedSubviews
            updateCellsBatchingPeriod={32}
            windowSize={5}
            ListHeaderComponent={feedListHeader}
            ListEmptyComponent={feedEmpty}
            ListFooterComponent={feedFooter}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            ItemSeparatorComponent={feedSeparator}
            contentContainerStyle={feedContentContainerStyle}
          />
      )}

      {/* Create Post Modal */}
      <Modal visible={showCreate} transparent animationType="slide" hardwareAccelerated onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowCreate(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Post</Text>
              <TouchableOpacity activeOpacity={creating || !normalizeVisibleInput(postBody) ? 1 : 0.78}
                style={[styles.postBtn, { backgroundColor: normalizeVisibleInput(postBody) ? colors.primary : colors.border, opacity: creating || !normalizeVisibleInput(postBody) ? 0.6 : 1 }]}
                onPress={handleCreatePost}
                disabled={creating || !normalizeVisibleInput(postBody)}
              >
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.postBtnText, { color: normalizeVisibleInput(postBody) ? "#fff" : colors.textSecondary }]}>Post</Text>}
              </TouchableOpacity>
            </View>
            <View style={styles.composerAuthorRow}>
              <View style={[styles.composerAvatar, { backgroundColor: colors.primary + "30" }]}>
                <Ionicons name="person" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={[styles.composerAuthorName, { color: colors.text }]}>You</Text>
                <TouchableOpacity activeOpacity={1} style={[styles.visibilityChip, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} onPress={() => setPostVisibility(postVisibility === "public" ? "followers" : "public")}>
                  <Ionicons name={postVisibility === "public" ? "globe-outline" : "people-outline"} size={11} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 3 }}>{postVisibility === "public" ? "Public" : "Followers"}</Text>
                  <Ionicons name="caret-down" size={10} color={colors.textSecondary} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={[styles.modalTextArea, { color: colors.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textSecondary}
              value={postBody}
              onChangeText={setPostBody}
              multiline
              autoFocus
            />
          </View>
        </View>
      </Modal>

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
        listingId={selectedListingId}
        onDismiss={handleDetailsSheetDismiss}
      />

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

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
    height: 12,
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
  composerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  composerInput: { flex: 1, height: 48, borderRadius: 16, paddingHorizontal: 16, justifyContent: "center", flexDirection: "row", alignItems: "center", gap: 10 },
  composerSearchText: { flex: 1, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium", lineHeight: 20, includeFontPadding: false },
  composerFilterButton: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  composerMediaBtn: { padding: 4 },

  liveRadioWrap: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  liveRadioCard: {
    minHeight: 88,
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
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 10,
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
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  socialFollowText: {
    fontSize: moderateScale(10),
    fontFamily: "Poppins_700Bold",
  },
  socialMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  socialCaption: {
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: moderateScale(14),
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
  socialMediaWrap: {
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    position: "relative",
  },
  socialMedia: {
    width: "100%",
    resizeMode: "cover",
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
  socialEngagementRow: {
    marginHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  socialEngagementLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  socialLikeBubble: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  socialEngagementText: {
    fontSize: moderateScale(11),
    fontFamily: "Poppins_400Regular",
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
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  socialQuickInfoIconBox: {
    width: 20,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  socialQuickInfoStarIconBox: {
    transform: [{ translateY: -0.5 }],
  },
  socialQuickInfoLocationIconBox: {
    transform: [{ translateY: -2 }],
  },
  socialQuickInfoChatIconBox: {
    transform: [{ translateY: -1.5 }],
  },
  socialQuickInfoIcon: {
    width: 20,
    height: 24,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
  socialQuickInfoText: {
    flexShrink: 1,
    fontSize: moderateScale(10.5),
    lineHeight: 24,
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
    transform: [{ translateY: 0.5 }],
  },
  socialActionRow: {
    flexDirection: "row",
    paddingHorizontal: 6,
    paddingTop: 3,
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
  socialCtaRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
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

  /* Create-post modal (Facebook style) */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 30, maxHeight: "85%", minHeight: "50%" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: "#334155" },
  modalTitle: { fontSize: moderateScale(16), fontWeight: "700" },
  postBtn: { borderRadius: 6, paddingHorizontal: 16, paddingVertical: 7 },
  postBtnText: { color: "#fff", fontSize: moderateScale(13), fontWeight: "700" },
  composerAuthorRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  composerAuthorName: { fontSize: moderateScale(14), fontWeight: "700" },
  visibilityChip: { flexDirection: "row", alignItems: "center", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  modalTextArea: { flex: 1, fontSize: moderateScale(16), paddingHorizontal: 14, paddingTop: 10, textAlignVertical: "top" },
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
