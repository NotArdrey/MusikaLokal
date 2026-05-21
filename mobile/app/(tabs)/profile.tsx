import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/src/legacy";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Image,
  InteractionManager,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase";
import CustomAlert, { AlertType } from "../../src/components/CustomAlert";
import InAppMediaViewer, { getInAppMediaType } from "../../src/components/InAppMediaViewer";
import ReportModal from "../../src/components/ReportModal";
import GuestSignInGate from "../../src/components/GuestSignInGate";
import Header from "../../src/components/header";
import Navbar from "../../src/components/navbar";
import Skeleton from "../../src/components/Skeleton";
import SlidingTabBar from "../../src/components/SlidingTabBar";
import type { SlidingTabItem } from "../../src/components/SlidingTabBar";
import SmoothTabTransition from "../../src/components/SmoothTabTransition";
import TrackedBottomSheetModal from "../../src/components/TrackedBottomSheetModal";
import { DEFAULT_AVATAR } from "../../src/constants/Images";
import { useAuth } from "../../src/context/AuthContext";
import {
  useRadioPlayerActions,
  useRadioPlayerPlayback,
  useRadioPlayerPresence,
} from "../../src/context/RadioPlayerContext";
import {
  useBottomOverlayRegistration,
  useBottomOverlayVisibility,
} from "../../src/context/BottomOverlayContext";
import CachedImage from "../../src/components/CachedImage";
import { emitToast } from "../../src/events/toastBus";
import { resolveRadioMediaUrl } from "../../src/audio/radioTrackPlayer";
import { useTheme } from "../../src/context/ThemeContext";
import { screenUploadsWithAi } from "../../src/services/uploadSafetyScreen";
import { buildSocialFollowKey } from "../../src/utils/socialFollow";
import { getSmoothTabIndex, setSmoothTab } from "../../src/utils/smoothTabs";
import { bottomSheetSpringConfig, motion } from "../../src/utils/motion";
import { isFanUserRole } from "../../src/utils/roleRouting";
import { isStaffRole } from "../../src/utils/staffAccess";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PROFILE_CONTENT_HORIZONTAL_PADDING = 24;
const GRID_GAP = 8;
const NUM_COLUMNS = 3;
const SECTION_SIDE_MARGIN = 16;
const GRID_PADDING = 16;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);
const DRAWER_NAVIGATION_DELAY_MS = 260;
const DRAWER_BACKDROP_OPEN_GUARD_MS = 360;
const DRAWER_EDGE_GESTURE_HEADER_CLEARANCE = 96;
const DRAWER_CLOSE_FALLBACK_MS = 520;
const DRAWER_SPRING_CONFIG = motion.spring.overlay;
const PENDING_REOPEN_LISTING_STORAGE_KEY = "pending_reopen_listing_id";
const PENDING_REOPEN_LISTING_TYPE_STORAGE_KEY = "pending_reopen_listing_type";
const KNOWN_PROFILE_MEDIA_BUCKETS = [
  "avatars",
  "images",
  "documents",
  "post-media",
  "posts",
  "listings",
];
const ITEM_SIZE = Math.floor(
  (
    SCREEN_WIDTH -
    SECTION_SIDE_MARGIN * 2 -
    GRID_PADDING * 2 -
    GRID_GAP * (NUM_COLUMNS - 1)
  ) /
  NUM_COLUMNS
);

const TIKTOK_GRID_GAP = 2;
const TIKTOK_NUM_COLUMNS = 3;
const MAX_INLINE_SCREEN_BYTES = 4 * 1024 * 1024;
const SAFETY_CHECK_TIMEOUT_MS = 45000;
const VIDEO_SAFETY_FRAME_INTERVAL_MS = 2000;
const MAX_VIDEO_SAFETY_FRAMES = 10;
type PortfolioUploadAsset = ImagePicker.ImagePickerAsset | DocumentPicker.DocumentPickerAsset;
type PortfolioUploadKind = "photo" | "video" | "document";
const IMAGE_MEDIA_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);
const VIDEO_MEDIA_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v"]);
const DOCUMENT_MEDIA_EXTENSIONS = new Set([
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
]);
const PORTFOLIO_DOCUMENT_PICKER_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/rtf",
  "text/rtf",
];
const PORTFOLIO_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-msvideo": "avi",
  "video/x-m4v": "m4v",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/plain": "txt",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
};
const PORTFOLIO_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  m4v: "video/x-m4v",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  rtf: "application/rtf",
};

const TIKTOK_ITEM_SIZE = Math.floor(
  (
    SCREEN_WIDTH -
    PROFILE_CONTENT_HORIZONTAL_PADDING * 2 -
    TIKTOK_GRID_GAP * (TIKTOK_NUM_COLUMNS - 1)
  ) /
    TIKTOK_NUM_COLUMNS
);

const createEmptyBookmarks = () => ({
  studios: [] as any[],
  gigs: [] as any[],
  artists: [] as any[],
  groups: [] as any[],
  production: [] as any[],
});

type ProfileTabKey = "about" | "posts" | "gigs" | "bookmarks" | "playlists";

const logProfileMedia = (event: string, details?: Record<string, unknown>) => {
  console.log(`[ProfileMedia] ${event}`, {
    timestamp: new Date().toISOString(),
    ...(details || {}),
  });
};

const formatProfileCompletionRate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "N/A";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "N/A";
  return `${Math.max(0, Math.min(100, Math.round(parsed)))}%`;
};

type ProfileVideoThumbnailProps = {
  uri: string;
  isDark: boolean;
  imageStyle?: StyleProp<ImageStyle>;
  placeholderStyle?: StyleProp<ViewStyle>;
};

const ProfileVideoThumbnail = ({
  uri,
  isDark,
  imageStyle,
  placeholderStyle,
}: ProfileVideoThumbnailProps) => {
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setThumbnailUri(null);
    setThumbnailFailed(false);

    const sourceUri = uri.trim();
    if (!sourceUri) {
      setThumbnailFailed(true);
      return () => {
        isMounted = false;
      };
    }

    VideoThumbnails.getThumbnailAsync(sourceUri, {
      time: 1000,
      quality: 0.68,
    })
      .then((thumbnail) => {
        if (isMounted) {
          setThumbnailUri(thumbnail.uri);
        }
      })
      .catch((error) => {
        logProfileMedia("video_thumbnail_failed", {
          uri: sourceUri,
          message: error?.message || String(error),
        });
        if (isMounted) {
          setThumbnailFailed(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [uri]);

  return (
    <View
      style={[
        styles.gridVideoThumbnail,
        placeholderStyle,
        { backgroundColor: isDark ? "#0F172A" : "#E2E8F0" },
      ]}
    >
      {thumbnailUri ? (
        <>
          <Image source={{ uri: thumbnailUri }} style={imageStyle} resizeMode="cover" />
          <View style={styles.gridVideoScrim} />
        </>
      ) : (
        <View style={styles.gridVideoFallback}>
          {thumbnailFailed ? (
            <Ionicons name="play-circle" size={38} color="rgba(255,255,255,0.86)" />
          ) : (
            <ActivityIndicator size="small" color="#FFFFFF" />
          )}
        </View>
      )}

      {thumbnailUri ? (
        <View style={styles.gridVideoPlayBadgeWrap}>
          <View style={styles.gridVideoPlayBadge}>
            <Ionicons name="play" size={18} color="#FFFFFF" />
          </View>
        </View>
      ) : null}
    </View>
  );
};

const normalizeBookmarkBuckets = (value: any) => ({
  studios: Array.isArray(value?.studios) ? value.studios : [],
  gigs: Array.isArray(value?.gigs) ? value.gigs : [],
  artists: Array.isArray(value?.artists) ? value.artists : [],
  groups: Array.isArray(value?.groups) ? value.groups : [],
  production: Array.isArray(value?.production) ? value.production : [],
});

const getBookmarkListingTypeParam = (item: any) => {
  switch (item?.type) {
    case "Studio":
      return "studio";
    case "Gig":
      return "gig";
    case "Artist":
      return "profile";
    case "Group":
      return "group";
    case "Production Team":
      return "production_team";
    default:
      return "";
  }
};

type ProfileConnectionItem = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string | null;
  target_type: "profile" | "group";
};

const normalizeFollowerProfile = (row: any): ProfileConnectionItem | null => {
  const follower = row?.follower || row;
  const id =
    typeof follower?.id === "string" && follower.id.trim().length > 0
      ? follower.id.trim()
      : typeof row?.follower_id === "string"
        ? row.follower_id.trim()
        : "";

  if (!id) {
    return null;
  }

  return {
    id,
    full_name:
      typeof follower?.full_name === "string" && follower.full_name.trim().length > 0
        ? follower.full_name.trim()
        : "MusikaLokal User",
    avatar_url: sanitizeAvatarUrl(follower?.avatar_url),
    role: typeof follower?.role === "string" ? follower.role : null,
    target_type: "profile",
  };
};

const normalizeFollowingProfile = (row: any): ProfileConnectionItem | null => {
  const followedType = row?.followed_type === "group" ? "group" : "profile";
  const followed = followedType === "group" ? row?.followed_group : row?.followed;
  const id =
    typeof followed?.id === "string" && followed.id.trim().length > 0
      ? followed.id.trim()
      : typeof row?.followed_id === "string"
        ? row.followed_id.trim()
        : "";

  if (!id) {
    return null;
  }

  const groupImages = Array.isArray(followed?.images) ? followed.images : [];
  const groupImage = groupImages.find((item: any) => typeof item === "string" && item.trim().length > 0);

  return {
    id,
    full_name:
      followedType === "group"
        ? typeof followed?.name === "string" && followed.name.trim().length > 0
          ? followed.name.trim()
          : "MusikaLokal Group"
        : typeof followed?.full_name === "string" && followed.full_name.trim().length > 0
          ? followed.full_name.trim()
          : "MusikaLokal User",
    avatar_url: sanitizeAvatarUrl(followed?.avatar_url || groupImage),
    role:
      followedType === "group"
        ? typeof followed?.group_type === "string" && followed.group_type.trim().length > 0
          ? followed.group_type
          : "group"
        : typeof followed?.role === "string"
          ? followed.role
          : null,
    target_type: followedType,
  };
};

const uniqueConnectionItems = (items: ProfileConnectionItem[]) => {
  const seenKeys = new Set<string>();

  return items.filter((item) => {
    const key = `${item.target_type}:${item.id}`;
    if (!item.id || seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
};

const fetchProfileFollowersDirect = async (targetId: string): Promise<ProfileConnectionItem[]> => {
  const { data: followRows, error } = await supabase
    .from("follows")
    .select("id, follower_id, followed_id, followed_type, created_at")
    .eq("followed_id", targetId)
    .eq("followed_type", "profile")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const followerIds = Array.from(
    new Set(
      (followRows || [])
        .map((row: any) => row?.follower_id)
        .filter((value: any): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

  const { data: profiles } = followerIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .in("id", followerIds)
    : { data: [] };

  const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));

  return uniqueConnectionItems(
    (followRows || [])
      .map((row: any) => normalizeFollowerProfile({
        ...row,
        follower: profileById.get(row?.follower_id) || null,
      }))
      .filter((item: ProfileConnectionItem | null): item is ProfileConnectionItem => Boolean(item)),
  );
};

const fetchProfileFollowingDirect = async (targetId: string): Promise<ProfileConnectionItem[]> => {
  const { data: followRows, error } = await supabase
    .from("follows")
    .select("id, followed_id, followed_type, created_at")
    .eq("follower_id", targetId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const followedProfileIds = Array.from(
    new Set(
      (followRows || [])
        .filter((row: any) => row?.followed_type !== "group")
        .map((row: any) => row?.followed_id)
        .filter((value: any): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
  const followedGroupIds = Array.from(
    new Set(
      (followRows || [])
        .filter((row: any) => row?.followed_type === "group")
        .map((row: any) => row?.followed_id)
        .filter((value: any): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

  const [{ data: followedProfiles }, { data: followedGroups }] = await Promise.all([
    followedProfileIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name, avatar_url, role")
          .in("id", followedProfileIds)
      : Promise.resolve({ data: [] }),
    followedGroupIds.length > 0
      ? supabase
          .from("groups_with_stats")
          .select("id, name, images, group_type, genre, location, owner_id")
          .in("id", followedGroupIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileById = new Map((followedProfiles || []).map((profile: any) => [profile.id, profile]));
  const groupById = new Map((followedGroups || []).map((group: any) => [group.id, group]));

  return uniqueConnectionItems(
    (followRows || [])
      .map((row: any) => {
        const followedType = row?.followed_type === "group" ? "group" : "profile";
        return normalizeFollowingProfile({
          ...row,
          followed_type: followedType,
          followed: followedType === "profile" ? profileById.get(row?.followed_id) || null : null,
          followed_group: followedType === "group" ? groupById.get(row?.followed_id) || null : null,
        });
      })
      .filter((item: ProfileConnectionItem | null): item is ProfileConnectionItem => Boolean(item)),
  );
};

type ProfileScreenCachePayload = {
  profile: any;
  isOwner: boolean;
  gigStats: { active: number; upcoming: number; done: number };
  gigTimeline: { active: any[]; upcoming: any[]; done: any[] };
  supportsGigVisibilityPreference: boolean;
  profileFollowerCount: number;
  profileFollowingCount: number;
  profileFollowers: ProfileConnectionItem[];
  profileFollowing: ProfileConnectionItem[];
  fetchedAt: number;
};

const PROFILE_FOCUS_REFRESH_COOLDOWN_MS = 30000;
const PROFILE_POSTS_CACHE_TTL_MS = 30000;
const PROFILE_PLAYLISTS_CACHE_TTL_MS = 30000;
const profileScreenCache = new Map<string, ProfileScreenCachePayload>();
const profilePostsCache = new Map<string, { posts: any[]; fetchedAt: number }>();
const profilePlaylistsCache = new Map<string, { playlists: any[]; fetchedAt: number }>();
const profileStationCache = new Map<string, {
  radioPlaylistIds: string[];
  station: any | null;
  fetchedAt: number;
}>();

const getProfileStationSlots = (station: any) => {
  if (Array.isArray(station?.live_slots) && station.live_slots.length > 0) {
    return station.live_slots;
  }

  return Array.isArray(station?.slots) ? station.slots : [];
};

const hasProfileStationHydratedSlots = (station: any) => (
  Array.isArray(station?.live_slots) || Array.isArray(station?.slots)
);

const getProfileStationSlotCount = (station: any, fallbackCount = 0) => {
  const rawCount =
    station?.live_slot_count ??
    station?.slot_count ??
    station?.slot_playlist_ids?.length;
  const parsedCount = Number(rawCount);

  if (Number.isFinite(parsedCount)) {
    return parsedCount;
  }

  const slotCount = getProfileStationSlots(station).length;
  return slotCount > 0 ? slotCount : fallbackCount;
};

const hasProfileStationPlayableItem = (item: any) => {
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

const getProfileStationPlayableTrackCount = (station: any) =>
  getProfileStationSlots(station).reduce((total: number, slot: any) => {
    const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
    return total + items.filter(hasProfileStationPlayableItem).length;
  }, 0);

const sanitizeAvatarUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;

  if (trimmed.startsWith("/storage/v1/") || trimmed.startsWith("storage/v1/")) {
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    if (!envBase) {
      return normalizedPath;
    }

    const base = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
    return `${base}${normalizedPath}`;
  }

  if (trimmed.includes("/storage/v1/object/avatars/")) {
    return trimmed.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
  }

  if (trimmed.includes("/storage/v1/object/public/")) {
    return trimmed;
  }

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.replace(/^\/+/, "");
  const directParts = normalized.split("/");

  if (directParts.length > 1) {
    const directBucket = directParts[0];
    const directPath = directParts.slice(1).join("/");
    if (KNOWN_PROFILE_MEDIA_BUCKETS.includes(directBucket)) {
      const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }
  }

  for (const bucket of KNOWN_PROFILE_MEDIA_BUCKETS) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
    if (data?.publicUrl) {
      return data.publicUrl;
    }
  }

  return normalized;
};

// Decode base64 to Uint8Array without using fetch().arrayBuffer() which crashes on Android New Architecture
const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const b64 = base64.replace(/=/g, "");
  let bufLen = Math.floor(b64.length * 0.75);
  const bytes = new Uint8Array(bufLen);
  let p = 0;
  for (let i = 0; i < b64.length; i += 4) {
    const e1 = lookup[b64.charCodeAt(i)];
    const e2 = lookup[b64.charCodeAt(i + 1)];
    const e3 = lookup[b64.charCodeAt(i + 2)];
    const e4 = lookup[b64.charCodeAt(i + 3)];
    if (p < bufLen) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bufLen) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bufLen) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }
  return bytes;
};

const sanitizePortfolioExtension = (value?: string | null): string => {
  const cleaned = (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned || cleaned === "quicktime") return cleaned === "quicktime" ? "mov" : "";
  if (cleaned === "jpeg") return "jpg";
  return cleaned;
};

const getPortfolioOriginalName = (
  file: PortfolioUploadAsset,
  fallbackExt = "media",
): string => {
  const explicitName =
    typeof (file as any)?.fileName === "string"
      ? (file as any).fileName
      : typeof (file as any)?.name === "string"
        ? (file as any).name
        : "";
  const uriName = file.uri?.split("?")[0]?.split("/").pop() || "";
  return explicitName || uriName || `profile-media.${fallbackExt}`;
};

const getPortfolioUrlExtension = (url: string): string => {
  try {
    const parsed = new URL(url);
    const match = decodeURIComponent(parsed.pathname).match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toUpperCase() || "FILE";
  } catch {
    const match = url.split("?")[0]?.split("#")[0]?.match(/\.([a-z0-9]+)$/i);
    return match?.[1]?.toUpperCase() || "FILE";
  }
};

const resolvePortfolioFileExtension = (file: PortfolioUploadAsset): string => {
  const mimeExt =
    typeof file.mimeType === "string"
      ? PORTFOLIO_EXTENSION_BY_MIME[file.mimeType.trim().toLowerCase()]
      : "";
  const fileName = getPortfolioOriginalName(file, mimeExt || "media");
  const nameExt = fileName.includes(".") ? fileName.split(".").pop() : "";
  const uri = file.uri || "";
  const uriExt = !uri.startsWith("blob:") && uri.includes(".") ? uri.split("?")[0].split(".").pop() : "";

  return (
    sanitizePortfolioExtension(nameExt) ||
    sanitizePortfolioExtension(uriExt) ||
    sanitizePortfolioExtension(mimeExt) ||
    "jpg"
  );
};

const resolvePortfolioMimeType = (
  file: PortfolioUploadAsset,
  fileExt: string,
): string => {
  const pickedMimeType = typeof file.mimeType === "string" ? file.mimeType.trim().toLowerCase() : "";
  const mappedMimeType = PORTFOLIO_MIME_BY_EXTENSION[fileExt.toLowerCase()];
  if (pickedMimeType && pickedMimeType !== "application/octet-stream") {
    return pickedMimeType;
  }
  return mappedMimeType || pickedMimeType || "application/octet-stream";
};

const estimateBase64Bytes = (base64: string): number => {
  let padding = 0;
  if (base64.endsWith("==")) padding = 2;
  else if (base64.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const ensureScreenableDataUrl = (dataUrl: string, message: string): string => {
  const base64 = dataUrl.split(",")[1] || "";
  if (!base64 || estimateBase64Bytes(base64) > MAX_INLINE_SCREEN_BYTES) {
    throw new Error(message);
  }
  return dataUrl;
};

const isPortfolioVideoAsset = (
  file: PortfolioUploadAsset,
  mimeType: string,
  fileExt: string,
): boolean => {
  const pickerType = String((file as any)?.type || "").toLowerCase();
  return (
    pickerType === "video" ||
    mimeType.toLowerCase().startsWith("video/") ||
    VIDEO_MEDIA_EXTENSIONS.has(fileExt.toLowerCase())
  );
};

const isPortfolioImageAsset = (
  file: PortfolioUploadAsset,
  mimeType: string,
  fileExt: string,
): boolean => {
  const pickerType = String((file as any)?.type || "").toLowerCase();
  return (
    pickerType === "image" ||
    mimeType.toLowerCase().startsWith("image/") ||
    IMAGE_MEDIA_EXTENSIONS.has(fileExt.toLowerCase())
  );
};

const resolvePortfolioUploadKind = (
  file: PortfolioUploadAsset,
  mimeType: string,
  fileExt: string,
): PortfolioUploadKind => {
  const normalizedExt = fileExt.toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase();
  if (isPortfolioVideoAsset(file, normalizedMimeType, normalizedExt)) return "video";
  if (isPortfolioImageAsset(file, normalizedMimeType, normalizedExt)) return "photo";
  if (
    DOCUMENT_MEDIA_EXTENSIONS.has(normalizedExt) ||
    normalizedMimeType === "application/pdf" ||
    normalizedMimeType.startsWith("text/") ||
    normalizedMimeType.includes("wordprocessingml") ||
    normalizedMimeType.includes("presentationml") ||
    normalizedMimeType.includes("spreadsheetml") ||
    normalizedMimeType === "application/msword" ||
    normalizedMimeType === "application/vnd.ms-powerpoint" ||
    normalizedMimeType === "application/vnd.ms-excel" ||
    normalizedMimeType === "application/rtf"
  ) {
    return "document";
  }

  throw new Error("This file type is not supported. Please upload a photo, video, PDF, Office document, CSV, TXT, or RTF file.");
};

const getPortfolioFileSize = async (file: PortfolioUploadAsset): Promise<number> => {
  const pickerSize = Number((file as any)?.fileSize ?? (file as any)?.size);
  if (Number.isFinite(pickerSize) && pickerSize > 0) {
    return Math.floor(pickerSize);
  }

  try {
    const info = await FileSystem.getInfoAsync(file.uri);
    return info.exists && typeof info.size === "number" ? info.size : 0;
  } catch {
    return 0;
  }
};

const buildVideoSafetyFrameTimes = (duration?: number | null): number[] => {
  const normalizedDuration = typeof duration === "number" && Number.isFinite(duration)
    ? Math.max(0, duration)
    : 0;
  const effectiveDuration = normalizedDuration > 0
    ? normalizedDuration
    : VIDEO_SAFETY_FRAME_INTERVAL_MS * 5;
  const times: number[] = [];

  for (
    let time = Math.min(1000, effectiveDuration);
    time <= effectiveDuration && times.length < MAX_VIDEO_SAFETY_FRAMES;
    time += VIDEO_SAFETY_FRAME_INTERVAL_MS
  ) {
    times.push(Math.max(0, Math.floor(time)));
  }

  if (times.length === 0) {
    times.push(0);
  }

  return times;
};

const buildPortfolioVideoFrameDataUrls = async (
  file: PortfolioUploadAsset,
): Promise<string[]> => {
  const frameTimes = buildVideoSafetyFrameTimes((file as any)?.duration);
  const attempts = await Promise.allSettled(
    frameTimes.map(async (time) => {
      const thumbnail = await VideoThumbnails.getThumbnailAsync(file.uri, {
        time,
        quality: 0.55,
      });
      const base64 = await FileSystem.readAsStringAsync(thumbnail.uri, {
        encoding: "base64",
      });
      return ensureScreenableDataUrl(
        `data:image/jpeg;base64,${base64}`,
        "Could not create a small enough video preview for safety screening.",
      );
    }),
  );

  const frameDataUrls = Array.from(
    new Set(
      attempts
        .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
        .map((result) => result.value),
    ),
  );

  if (frameDataUrls.length === 0) {
    const firstFailure = attempts.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw firstFailure?.reason instanceof Error
      ? firstFailure.reason
      : new Error("Could not create a video preview for safety screening.");
  }

  return frameDataUrls;
};

const screenProfilePortfolioMedia = async (
  file: PortfolioUploadAsset,
  options: {
    fileExt: string;
    mimeType: string;
    uploadKind: PortfolioUploadKind;
    size: number;
    base64?: string;
  },
) => {
  const originalName = getPortfolioOriginalName(file, options.fileExt);
  const isVideoUpload = options.uploadKind === "video";
  const isDocumentUpload = options.uploadKind === "document";

  if (isDocumentUpload) {
    const screeningSummary = await screenUploadsWithAi(
      [
        {
          name: originalName,
          mimeType: options.mimeType,
          size: options.size,
          uri: file.uri,
          kind: "document" as const,
        },
      ],
      "profile_portfolio_media",
    );

    if (!screeningSummary.allowed) {
      throw new Error(
        screeningSummary.reason || "This document did not pass safety screening.",
      );
    }
    return;
  }
  const videoFrameDataUrls = isVideoUpload ? await buildPortfolioVideoFrameDataUrls(file) : [];

  const screeningSummary = await screenUploadsWithAi(
    isVideoUpload
      ? videoFrameDataUrls.map((contentDataUrl, index) => ({
          name: originalName,
          mimeType: options.mimeType,
          size: options.size,
          uri: `${file.uri}#frame-${index + 1}`,
          contentDataUrl,
          kind: "video" as const,
        }))
      : [
          {
            name: originalName,
            mimeType: options.mimeType,
            size: options.size,
            uri: file.uri,
            contentDataUrl: ensureScreenableDataUrl(
              `data:${options.mimeType};base64,${options.base64 || ""}`,
              "This image is too large to safety screen. Please choose an image under 4 MB.",
            ),
            kind: "photo" as const,
          },
        ],
    "profile_portfolio_media",
  );

  if (!screeningSummary.allowed) {
    throw new Error(
      screeningSummary.reason || "This media did not pass safety screening.",
    );
  }
};

const uploadPortfolioMediaFile = async (
  file: PortfolioUploadAsset,
  options: {
    fileName: string;
    mimeType: string;
    bytes?: Uint8Array;
    streamFile: boolean;
  },
) => {
  if (!options.streamFile && options.bytes) {
    return supabase.storage
      .from("portfolio")
      .upload(options.fileName, options.bytes, {
        contentType: options.mimeType,
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
  const encodedPath = options.fileName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const uploadUrl = `${baseUrl}/storage/v1/object/portfolio/${encodedPath}`;
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, file.uri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      "Content-Type": options.mimeType,
      "x-upsert": "true",
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    let message = `Storage upload failed with status ${uploadResult.status}.`;
    try {
      const parsed = JSON.parse(uploadResult.body || "{}");
      message = parsed?.message || parsed?.error || message;
    } catch {
      if (uploadResult.body) {
        message = uploadResult.body;
      }
    }
    return {
      data: null,
      error: new Error(message),
    };
  }

  return {
    data: { path: options.fileName },
    error: null,
  };
};

const withSafetyTimeout = async (promise: Promise<void>): Promise<void> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Safety screening timed out. Upload blocked. Please try again.")),
      SAFETY_CHECK_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const sanitizeUploadFeedbackMessage = (message: string): string => {
  const raw = message.trim();
  if (!raw) {
    return "Failed to upload media.";
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("tokens per minute") ||
    lower.includes("tpm") ||
    lower.includes("try again in")
  ) {
    return "Safety check is busy. Please try again in a few seconds.";
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "Safety check took too long. Please try again.";
  }

  if (
    /\b(groq|openai|gemini|api error|visual review error|image safety screening failed|organization|service tier|billing|console\.groq\.com|internal server error)\b/i.test(raw) ||
    raw.length > 220
  ) {
    return "Safety check is temporarily unavailable. Please try again in a moment.";
  }

  return raw;
};

type ProfileAlertConfig = {
  type: AlertType;
  title: string;
  message: string;
  buttons?: any[];
  forceModal?: boolean;
};

type SkippedProfileMediaFeedback = {
  name: string;
  reason: string;
};

const getPortfolioAssetDisplayName = (
  asset: PortfolioUploadAsset,
  index: number,
): string => {
  const name = getPortfolioOriginalName(asset, "media");
  return name === "profile-media.media" ? `Selected media ${index + 1}` : name;
};

const formatSkippedProfileMediaFeedback = (items: SkippedProfileMediaFeedback[]): string => {
  if (items.length === 0) {
    return "";
  }

  const visibleItems = items
    .slice(0, 4)
    .map((item) => `${item.name}: ${item.reason}`)
    .join("\n");
  const remainingCount = items.length - Math.min(items.length, 4);
  const remainingText =
    remainingCount > 0 ? `\n+ ${remainingCount} more media item(s) skipped.` : "";

  return `\n\nSkipped media:\n${visibleItems}${remainingText}`;
};

const resolveStorageObjectFromPublicUrl = (url: string): { bucket: string; path: string } | null => {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;

  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2].split("?")[0]),
  };
};

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const { loading: authLoading, userId: currentUserId, isGuest, userRole } = useAuth();
  const { activeStation } = useRadioPlayerPresence();
  const { isMuted, isPlaying, loadingStationId } = useRadioPlayerPlayback();
  const { toggleMute, tuneIn } = useRadioPlayerActions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    userId?: string;
    refresh?: string;
    returnToHome?: string;
    returnListingId?: string;
  }>();
  const normalizedParamUserId = useMemo(() => {
    return Array.isArray(params.userId) ? params.userId[0] : params.userId;
  }, [params.userId]);
  const normalizedRefresh = useMemo(() => {
    return Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
  }, [params.refresh]);

  const [profile, setProfile] = useState<any>(null);
  const isFan = isFanUserRole(userRole || profile?.role);
  const isStaff = isStaffRole(userRole || profile?.role);
  const [loading, setLoading] = useState(true);
  const [profilePosts, setProfilePosts] = useState<any[]>([]);
  const [loadingProfilePosts, setLoadingProfilePosts] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const isProfileFan = isFanUserRole(profile?.role) || (isOwner && isFanUserRole(userRole));
  const shouldHideProfessionalProfileStats = isFan || isProfileFan;
  const profileSkillTags = useMemo<string[]>(() => {
    const values = Array.isArray(profile?.skills) ? profile.skills : [];
    const normalized = values
      .map((skill: unknown): string => String(skill || "").trim())
      .filter((skill: string) => skill.length > 0 && skill.toLowerCase() !== "producer");
    return Array.from(new Set<string>(normalized));
  }, [profile?.skills]);
  const profileGenreTags = useMemo<string[]>(() => {
    const values = Array.isArray(profile?.genres) ? profile.genres : [];
    const normalized = values
      .map((genre: unknown): string => String(genre || "").trim())
      .filter((genre: string) => genre.length > 0);
    return Array.from(new Set<string>(normalized));
  }, [profile?.genres]);
  const profileSkillLabel = isProfileFan ? "Interests" : "Roles & Instruments";
  const [, setGigStats] = useState({ active: 0, upcoming: 0, done: 0 });
  const [gigTimeline, setGigTimeline] = useState<{
    active: any[];
    upcoming: any[];
    done: any[];
  }>({ active: [], upcoming: [], done: [] });
  const [bookmarkedListings, setBookmarkedListings] = useState(() => createEmptyBookmarks());
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [gigSearchQuery, setGigSearchQuery] = useState("");
  const [updatingGigVisibility, setUpdatingGigVisibility] = useState(false);
  const [supportsGigVisibilityPreference, setSupportsGigVisibilityPreference] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>("about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDrawerMounted, setIsDrawerMounted] = useState(false);
  const [isDrawerTouchable, setIsDrawerTouchable] = useState(false);
  const drawerProgress = useSharedValue(0);
  const drawerGestureStartProgress = useSharedValue(1);
  const drawerOpenedAtRef = useRef(0);
  const drawerCloseFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookmarkFilter, setBookmarkFilter] = useState<"all" | "studios" | "gigs" | "artists" | "groups" | "production">("all");
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [userStation, setUserStation] = useState<any>(null);
  const [loadingStation, setLoadingStation] = useState(false);
  const [radioPlaylistIds, setRadioPlaylistIds] = useState<Set<string>>(new Set());
  const [stationActionBusy, setStationActionBusy] = useState(false);
  const [togglingRadio, setTogglingRadio] = useState<string | null>(null);
  const [playlistActionId, setPlaylistActionId] = useState<string | null>(null);
  const [isProfileFollowing, setIsProfileFollowing] = useState(false);
  const [isProfileFollowBusy, setIsProfileFollowBusy] = useState(false);
  const [profileFollowerCount, setProfileFollowerCount] = useState(0);
  const [profileFollowingCount, setProfileFollowingCount] = useState(0);
  const [profileFollowers, setProfileFollowers] = useState<ProfileConnectionItem[]>([]);
  const [profileFollowing, setProfileFollowing] = useState<ProfileConnectionItem[]>([]);
  const [loadingProfileFollowers, setLoadingProfileFollowers] = useState(false);
  const [followListModal, setFollowListModal] = useState<"followers" | "following" | null>(null);
  const followListSheetRef = useRef<BottomSheetModal>(null);
  const followListSnapPoints = useMemo(() => ["48%", "78%"], []);
  const followListAnimationConfigs = useBottomSheetSpringConfigs(bottomSheetSpringConfig);
  const profileFetchInFlightRef = useRef<string | null>(null);
  const profileFetchRequestIdRef = useRef(0);
  const lastHandledProfileRefreshRef = useRef<string | null>(null);
  const profilePostsFetchInFlightRef = useRef<string | null>(null);
  const profilePlaylistsFetchInFlightRef = useRef<string | null>(null);
  const profileStationFetchInFlightRef = useRef<string | null>(null);
  const canManageStations = !isGuest && userRole === "admin";
  const { registerOverlay: registerDrawerOverlay, unregisterOverlay: unregisterDrawerOverlay } =
    useBottomOverlayRegistration("ProfileDrawer");
  const drawerEdgeGestureStyle = useMemo(
    () => [
      styles.drawerEdgeGestureArea,
      { top: insets.top + DRAWER_EDGE_GESTURE_HEADER_CLEARANCE },
    ],
    [insets.top],
  );

  const clearDrawerCloseFallback = useCallback(() => {
    if (!drawerCloseFallbackRef.current) {
      return;
    }

    clearTimeout(drawerCloseFallbackRef.current);
    drawerCloseFallbackRef.current = null;
  }, []);

  const enableDrawerBackdrop = useCallback(() => {
    setIsDrawerTouchable(true);
  }, []);

  const finishCloseDrawer = useCallback(() => {
    clearDrawerCloseFallback();
    setIsDrawerTouchable(false);
    setIsMenuOpen(false);
    setIsDrawerMounted(false);
    unregisterDrawerOverlay();
  }, [clearDrawerCloseFallback, unregisterDrawerOverlay]);

  const scheduleDrawerCloseFallback = useCallback(() => {
    clearDrawerCloseFallback();
    unregisterDrawerOverlay();
    drawerCloseFallbackRef.current = setTimeout(() => {
      drawerCloseFallbackRef.current = null;
      finishCloseDrawer();
    }, DRAWER_CLOSE_FALLBACK_MS);
  }, [clearDrawerCloseFallback, finishCloseDrawer, unregisterDrawerOverlay]);

  const markDrawerOpen = useCallback(() => {
    setIsMenuOpen(true);
    setIsDrawerTouchable(false);
    clearDrawerCloseFallback();
  }, [clearDrawerCloseFallback]);

  const startDrawerGestureOpen = useCallback(() => {
    clearDrawerCloseFallback();
    drawerOpenedAtRef.current = Date.now();
    registerDrawerOverlay();
    setIsDrawerTouchable(false);
    setIsMenuOpen(false);
    setIsDrawerMounted(true);
  }, [clearDrawerCloseFallback, registerDrawerOverlay]);

  const animateDrawerOpen = useCallback(() => {
    drawerProgress.value = withSpring(1, DRAWER_SPRING_CONFIG, (finished) => {
      if (finished) {
        runOnJS(enableDrawerBackdrop)();
      }
    });
  }, [drawerProgress, enableDrawerBackdrop]);

  const animateDrawerClosed = useCallback(() => {
    setIsDrawerTouchable(false);
    setIsMenuOpen(false);
    scheduleDrawerCloseFallback();
    drawerProgress.value = withSpring(0, DRAWER_SPRING_CONFIG, (finished) => {
      if (finished) {
        runOnJS(finishCloseDrawer)();
      }
    });
  }, [drawerProgress, finishCloseDrawer, scheduleDrawerCloseFallback]);

  const openDrawer = useCallback((_source: string = "unknown") => {
    if (isMenuOpen) {
      return;
    }

    clearDrawerCloseFallback();
    drawerProgress.value = 0;
    drawerOpenedAtRef.current = Date.now();
    registerDrawerOverlay();
    setIsDrawerTouchable(false);
    setIsDrawerMounted(true);
    setIsMenuOpen(true);
    animateDrawerOpen();
  }, [animateDrawerOpen, clearDrawerCloseFallback, drawerProgress, isMenuOpen, registerDrawerOverlay]);

  const closeDrawer = useCallback((source: string = "unknown") => {
    if (!isMenuOpen && !isDrawerMounted) {
      return;
    }

    if (
      source === "drawer-backdrop" &&
      (!isDrawerTouchable || Date.now() - drawerOpenedAtRef.current < DRAWER_BACKDROP_OPEN_GUARD_MS)
    ) {
      return;
    }

    animateDrawerClosed();
  }, [animateDrawerClosed, isDrawerMounted, isDrawerTouchable, isMenuOpen]);

  useEffect(() => {
    if (!isDrawerMounted) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeDrawer("hardware-back");
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [closeDrawer, isDrawerMounted]);

  useEffect(() => {
    return () => {
      clearDrawerCloseFallback();
      unregisterDrawerOverlay();
    };
  }, [clearDrawerCloseFallback, unregisterDrawerOverlay]);

  const drawerPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-18, 18])
        .onBegin(() => {
          drawerGestureStartProgress.value = drawerProgress.value;
        })
        .onUpdate((event) => {
          const draggedProgress = drawerGestureStartProgress.value - event.translationX / DRAWER_WIDTH;
          drawerProgress.value = Math.min(1, Math.max(0, draggedProgress));
        })
        .onEnd((event) => {
          const shouldClose =
            drawerProgress.value < 0.68 ||
            event.translationX > DRAWER_WIDTH * 0.28 ||
            event.velocityX > 650;

          if (shouldClose) {
            runOnJS(scheduleDrawerCloseFallback)();
            drawerProgress.value = withSpring(0, DRAWER_SPRING_CONFIG, (finished) => {
              if (finished) {
                runOnJS(finishCloseDrawer)();
              }
            });
          } else {
            drawerProgress.value = withSpring(1, DRAWER_SPRING_CONFIG, (finished) => {
              if (finished) {
                runOnJS(enableDrawerBackdrop)();
              }
            });
          }
        }),
    [drawerGestureStartProgress, drawerProgress, enableDrawerBackdrop, finishCloseDrawer, scheduleDrawerCloseFallback],
  );

  const drawerEdgeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-18, 18])
        .onBegin(() => {
          drawerProgress.value = 0;
          runOnJS(startDrawerGestureOpen)();
        })
        .onUpdate((event) => {
          drawerProgress.value = Math.min(1, Math.max(0, -event.translationX / DRAWER_WIDTH));
        })
        .onEnd((event) => {
          const shouldOpen =
            drawerProgress.value > 0.34 ||
            event.translationX < -DRAWER_WIDTH * 0.22 ||
            event.velocityX < -650;

          if (shouldOpen) {
            runOnJS(markDrawerOpen)();
            drawerProgress.value = withSpring(1, DRAWER_SPRING_CONFIG, (finished) => {
              if (finished) {
                runOnJS(enableDrawerBackdrop)();
              }
            });
          } else {
            runOnJS(scheduleDrawerCloseFallback)();
            drawerProgress.value = withSpring(0, DRAWER_SPRING_CONFIG, (finished) => {
              if (finished) {
                runOnJS(finishCloseDrawer)();
              }
            });
          }
        }),
    [drawerProgress, enableDrawerBackdrop, finishCloseDrawer, markDrawerOpen, scheduleDrawerCloseFallback, startDrawerGestureOpen],
  );

  const drawerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - drawerProgress.value) * DRAWER_WIDTH }],
  }));

  const drawerScrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drawerProgress.value, [0, 1], [0, 1]),
  }));

  const isMissingShowGigStatusesColumnError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return error?.code === "42703" && message.includes("show_gig_statuses");
  };

  const filteredGigTimeline = useMemo(() => {
    const query = gigSearchQuery.trim().toLowerCase();
    if (!query) return gigTimeline;

    const match = (gig: any) => {
      const haystack = `${gig?.name || ""} ${gig?.location || ""} ${gig?.performer_label || ""}`.toLowerCase();
      return haystack.includes(query);
    };

    return {
      active: gigTimeline.active.filter(match),
      upcoming: gigTimeline.upcoming.filter(match),
      done: gigTimeline.done.filter(match),
    };
  }, [gigSearchQuery, gigTimeline]);

  const safeBookmarkedListings = useMemo(
    () => normalizeBookmarkBuckets(bookmarkedListings),
    [bookmarkedListings],
  );

  const resolveBookmarkImage = (entry: any): string | null => {
    if (Array.isArray(entry?.images) && typeof entry.images[0] === "string") {
      return entry.images[0];
    }

    if (typeof entry?.cover_image_url === "string" && entry.cover_image_url.trim().length > 0) {
      return entry.cover_image_url;
    }

    if (typeof entry?.logo_url === "string" && entry.logo_url.trim().length > 0) {
      return entry.logo_url;
    }

    if (typeof entry?.image === "string" && entry.image.trim().length > 0) {
      return entry.image;
    }

    if (typeof entry?.avatar_url === "string" && entry.avatar_url.trim().length > 0) {
      return entry.avatar_url;
    }

    return null;
  };

  const fetchBookmarkedListings = useCallback(async (
    viewerId: string,
    shouldLoad: boolean,
  ) => {
    if (!shouldLoad) {
      setBookmarkedListings(createEmptyBookmarks());
      setLoadingBookmarks(false);
      return;
    }

    setLoadingBookmarks(true);

    try {
      const { data: favoritesData, error: favoritesError } = await supabase
        .from("favorites")
        .select("group_id, profile_id, studio_id, gig_id, production_team_id, created_at")
        .eq("user_id", viewerId)
        .order("created_at", { ascending: false });

      if (favoritesError) throw favoritesError;

      const favorites = favoritesData || [];
      const groupIds = favorites
        .map((entry: any) => entry.group_id)
        .filter((value: any): value is string => typeof value === "string");
      const profileIds = favorites
        .map((entry: any) => entry.profile_id)
        .filter((value: any): value is string => typeof value === "string");
      const studioIds = favorites
        .map((entry: any) => entry.studio_id)
        .filter((value: any): value is string => typeof value === "string");
      const gigIds = favorites
        .map((entry: any) => entry.gig_id)
        .filter((value: any): value is string => typeof value === "string");
      const productionTeamIds = favorites
        .map((entry: any) => entry.production_team_id)
        .filter((value: any): value is string => typeof value === "string");

      const [groupsResult, profilesResult, studiosResult, gigsResult, productionTeamsResult] = await Promise.all([
        groupIds.length > 0
          ? supabase
            .from("groups_with_stats")
            .select("id, name, location, images, genre")
            .in("id", groupIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        profileIds.length > 0
          ? supabase
            .from("profiles")
            .select("id, full_name, location, avatar_url")
            .in("id", profileIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        studioIds.length > 0
          ? supabase
            .from("studios_with_stats")
            .select("id, name, address, images")
            .in("id", studioIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        gigIds.length > 0
          ? supabase
            .from("gigs_with_stats")
            .select("id, name, location, event_date, images")
            .in("id", gigIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        productionTeamIds.length > 0
          ? supabase
            .from("production_teams")
            .select("id, name, description, logo_url")
            .in("id", productionTeamIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (groupsResult.error) throw groupsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (studiosResult.error) throw studiosResult.error;
      if (gigsResult.error) throw gigsResult.error;
      if (productionTeamsResult.error) throw productionTeamsResult.error;

      const groupById = new Map((groupsResult.data || []).map((entry: any) => [entry.id, entry]));
      const profileById = new Map((profilesResult.data || []).map((entry: any) => [entry.id, entry]));
      const studioById = new Map((studiosResult.data || []).map((entry: any) => [entry.id, entry]));
      const gigById = new Map((gigsResult.data || []).map((entry: any) => [entry.id, entry]));
      const productionTeamById = new Map((productionTeamsResult.data || []).map((entry: any) => [entry.id, entry]));

      const artists = favorites
        .filter((entry: any) => !!entry.profile_id)
        .map((entry: any) => profileById.get(entry.profile_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.full_name || "Unnamed Artist",
          subtitle: entry.location || "Artist",
          image: resolveBookmarkImage(entry),
          type: "Artist",
        }));

      const groups = favorites
        .filter((entry: any) => !!entry.group_id)
        .map((entry: any) => groupById.get(entry.group_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Group",
          subtitle: entry.location || entry.genre || "Group",
          image: resolveBookmarkImage(entry),
          type: "Group",
        }))
        .filter(Boolean);

      const studios = favorites
        .filter((entry: any) => !!entry.studio_id)
        .map((entry: any) => studioById.get(entry.studio_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Studio",
          subtitle: entry.address || "Studio",
          image: resolveBookmarkImage(entry),
          type: "Studio",
        }));

      const gigs = favorites
        .filter((entry: any) => !!entry.gig_id)
        .map((entry: any) => gigById.get(entry.gig_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Gig",
          subtitle:
            entry.location ||
            (entry.event_date
              ? new Date(entry.event_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              : "Gig"),
          image: resolveBookmarkImage(entry),
          type: "Gig",
        }));

      const production = favorites
        .filter((entry: any) => !!entry.production_team_id)
        .map((entry: any) => productionTeamById.get(entry.production_team_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Production Team",
          subtitle: entry.description || "Production Team",
          image: resolveBookmarkImage(entry),
          type: "Production Team",
        }));

      setBookmarkedListings(normalizeBookmarkBuckets({
        studios: studios.slice(0, 8),
        gigs: gigs.slice(0, 8),
        artists: artists.slice(0, 8),
        groups: groups.slice(0, 8),
        production: production.slice(0, 8),
      }));
    } catch (bookmarkError) {
      setBookmarkedListings(createEmptyBookmarks());
    } finally {
      setLoadingBookmarks(false);
    }
  }, []);

  // Fetch user playlists
  const fetchPlaylists = useCallback(async (targetUserId: string) => {
    if (!targetUserId) {
      setUserPlaylists([]);
      setLoadingPlaylists(false);
      return;
    }

    const cached = profilePlaylistsCache.get(targetUserId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_PLAYLISTS_CACHE_TTL_MS) {
      setUserPlaylists(cached.playlists);
      setLoadingPlaylists(false);
      return;
    }

    if (profilePlaylistsFetchInFlightRef.current === targetUserId) {
      return;
    }

    profilePlaylistsFetchInFlightRef.current = targetUserId;
    setLoadingPlaylists(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "list_user_playlists", user_id: targetUserId },
      });
      const playlists = data?.data || data?.playlists || [];
      profilePlaylistsCache.set(targetUserId, {
        playlists,
        fetchedAt: Date.now(),
      });
      setUserPlaylists(playlists);
    } catch (_) {
      setUserPlaylists([]);
    } finally {
      if (profilePlaylistsFetchInFlightRef.current === targetUserId) {
        profilePlaylistsFetchInFlightRef.current = null;
      }
      setLoadingPlaylists(false);
    }
  }, []);

  // Fetch user station (first/primary) and which playlists are on radio
  const fetchStation = useCallback(async (targetUserId: string) => {
    if (!targetUserId) {
      setUserStation(null);
      setRadioPlaylistIds(new Set());
      setLoadingStation(false);
      return;
    }

    const cached = profileStationCache.get(targetUserId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_PLAYLISTS_CACHE_TTL_MS) {
      setUserStation(cached.station);
      setRadioPlaylistIds(new Set(cached.radioPlaylistIds));
      setLoadingStation(false);
      return;
    }

    if (profileStationFetchInFlightRef.current === targetUserId) {
      return;
    }

    profileStationFetchInFlightRef.current = targetUserId;
    setLoadingStation(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "list_user_stations", user_id: targetUserId },
      });
      const stations = data?.data || [];
      const station = stations.length > 0 ? stations[0] : null;
      const nextRadioPlaylistIds = Array.isArray(station?.slot_playlist_ids)
        ? station.slot_playlist_ids
        : [];
      profileStationCache.set(targetUserId, {
        station,
        radioPlaylistIds: nextRadioPlaylistIds,
        fetchedAt: Date.now(),
      });
      setUserStation(station);
      setRadioPlaylistIds(new Set(nextRadioPlaylistIds));
    } catch (_) {
      setUserStation(null);
      setRadioPlaylistIds(new Set());
    } finally {
      if (profileStationFetchInFlightRef.current === targetUserId) {
        profileStationFetchInFlightRef.current = null;
      }
      setLoadingStation(false);
    }
  }, []);

  // Toggle a playlist on/off the user's radio station
  const handleToggleRadio = useCallback(async (playlistId: string) => {
    setTogglingRadio(playlistId);
    try {
      const managedProfileId = typeof profile?.id === "string" && profile.id.trim().length > 0
        ? profile.id.trim()
        : currentUserId || undefined;

      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "toggle_radio_slot",
          playlist_id: playlistId,
          user_id: managedProfileId,
        },
      });
      if (data?.success) {
        if (managedProfileId) {
          profileStationCache.delete(managedProfileId);
        }

        setRadioPlaylistIds((prev) => {
          const next = new Set(prev);
          if (data.on_radio) {
            next.add(playlistId);
          } else {
            next.delete(playlistId);
          }
          return next;
        });

        setUserStation((prev: any) => {
          const previousSlotCount = prev
            ? typeof prev.slot_count === "number"
              ? prev.slot_count
              : Array.isArray(prev.slot_playlist_ids)
                ? prev.slot_playlist_ids.length
                : 0
            : 0;

          if (prev) {
            return {
              ...prev,
              slot_count: Math.max(previousSlotCount + (data.on_radio ? 1 : -1), 0),
              is_active: data.on_radio ? true : prev.is_active,
            };
          }

          if (data.station_id) {
            return {
              id: data.station_id,
              name: `${profile?.full_name || "My"}'s Radio`,
              slot_count: data.on_radio ? 1 : 0,
              is_active: data.on_radio,
            };
          }

          return prev;
        });
      }
    } catch (_) {
      // silently fail
    } finally {
      setTogglingRadio(null);
    }
  }, [currentUserId, profile?.full_name, profile?.id]);

  // Refresh profile data every time the screen comes into focus
  const fetchProfile = useCallback(async (
    options: { showLoading?: boolean; force?: boolean } = {},
  ) => {
    let targetIdForRequest: string | null = null;
    let requestId = 0;
    let skippedDuplicateFetch = false;

    try {
      if (options.showLoading !== false) {
        setLoading(true);
      }
      // Determine target ID: param OR current user
      let resolvedCurrentUserId = currentUserId;

      // Resolve the active user ID from auth when context is temporarily unavailable.
      if (!resolvedCurrentUserId && !isGuest) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
        }
        if (user?.id) {
          resolvedCurrentUserId = user.id;
        }
      }

      let targetId = normalizedParamUserId || resolvedCurrentUserId;

      // If still no targetId, try to get from auth directly
      if (!targetId) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
        }
        if (user) {
          targetId = user.id;
        }
      }

      if (!targetId) {
        if (isGuest) {
          setIsOwner(false);
          setGigStats({ active: 0, upcoming: 0, done: 0 });
          setGigTimeline({ active: [], upcoming: [], done: [] });
          setBookmarkedListings(createEmptyBookmarks());
          setLoadingBookmarks(false);
          setProfileFollowerCount(0);
          setProfileFollowingCount(0);
          setProfileFollowers([]);
          setProfileFollowing([]);
          setLoadingProfileFollowers(false);
          setProfile({
            full_name: "Guest User",
            role: null,
            location: "Browse Mode",
            skills: [],
            genres: [],
            portfolio_urls: [],
          });
          return;
        }

        // No user logged in and no userId param - redirect to login
        router.replace("/");
        return;
      }

      targetIdForRequest = targetId;
      if (!options.force && profileFetchInFlightRef.current === targetId) {
        skippedDuplicateFetch = true;
        return;
      }

      requestId = profileFetchRequestIdRef.current + 1;
      profileFetchRequestIdRef.current = requestId;
      profileFetchInFlightRef.current = targetId;
      const shouldApplyFetchResult = () => profileFetchRequestIdRef.current === requestId;


      // Check ownership
      const ownership = resolvedCurrentUserId && targetId === resolvedCurrentUserId;
      if (!shouldApplyFetchResult()) return;
      setIsOwner(!!ownership);

      const classifyGigBucket = (gig: any): "active" | "upcoming" | "done" => {
        const eventDate = gig?.event_date ? new Date(gig.event_date) : null;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (gig?.status === "closed" || gig?.status === "cancelled") {
          return "done";
        }

        if (!eventDate || isNaN(eventDate.getTime())) {
          return "upcoming";
        }

        if (eventDate < todayStart) {
          return "done";
        }

        if (eventDate.toDateString() === now.toDateString()) {
          return "active";
        }

        return "upcoming";
      };

      const [profileStatsResult, profileResult] = await Promise.all([
        supabase
          .from("profiles_with_stats")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("*")
          .eq("id", targetId)
          .maybeSingle(),
      ]);
      const profileStatsData = profileStatsResult.data;
      const { data: profileData, error: profileError } = profileResult;

      if (profileError) throw profileError;

      if (!profileData) {
        throw profileError ?? new Error("Profile not found");
      }

      if (!shouldApplyFetchResult()) return;

      const hasGigVisibilityPreference = Object.prototype.hasOwnProperty.call(
        profileData,
        "show_gig_statuses",
      );
      setSupportsGigVisibilityPreference(hasGigVisibilityPreference);
      let nextGigStats = { active: 0, upcoming: 0, done: 0 };
      let nextGigTimeline: { active: any[]; upcoming: any[]; done: any[] } = {
        active: [],
        upcoming: [],
        done: [],
      };

      if (profileData.role === "musician") {
        const { data: ownedGroups } = await supabase
          .from("groups")
          .select("id, name")
          .eq("owner_id", targetId);

        const groupIds = (ownedGroups || []).map((group: any) => group.id);
        const groupNameById = new Map(
          (ownedGroups || []).map((group: any) => [group.id, group.name || "Group"]),
        );

        const [{ data: soloApplications }, { data: groupApplications }] = await Promise.all([
          supabase
            .from("gig_applications")
            .select("applicant_id, gigs(id,name,location,budget,event_date,status)")
            .eq("status", "accepted")
            .eq("applicant_id", targetId)
            .is("group_id", null),
          groupIds.length > 0
            ? supabase
              .from("gig_applications")
              .select("group_id, gigs(id,name,location,budget,event_date,status)")
              .eq("status", "accepted")
              .in("group_id", groupIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        if (!shouldApplyFetchResult()) return;

        const stats = { active: 0, upcoming: 0, done: 0 };
        const timelineBuckets: { active: any[]; upcoming: any[]; done: any[] } = {
          active: [],
          upcoming: [],
          done: [],
        };
        const seenGigIds = new Set<string>();

        [...(soloApplications || []), ...(groupApplications || [])].forEach((application: any) => {
          const gig = application.gigs;
          if (!gig?.id || seenGigIds.has(gig.id)) return;
          seenGigIds.add(gig.id);

          const bucket = classifyGigBucket(gig);
          stats[bucket] += 1;
          timelineBuckets[bucket].push({
            ...gig,
            performer_label: application.group_id
              ? `As ${groupNameById.get(application.group_id) || "Group"}`
              : "As Solo Artist",
          });
        });

        const byDateDesc = (a: any, b: any) => {
          const aTime = a?.event_date ? new Date(a.event_date).getTime() : 0;
          const bTime = b?.event_date ? new Date(b.event_date).getTime() : 0;
          return bTime - aTime;
        };

        timelineBuckets.active.sort(byDateDesc);
        timelineBuckets.upcoming.sort(byDateDesc);
        timelineBuckets.done.sort(byDateDesc);

        nextGigStats = stats;
        nextGigTimeline = timelineBuckets;
        setGigStats(nextGigStats);
        setGigTimeline(nextGigTimeline);
      } else {
        setGigStats(nextGigStats);
        setGigTimeline(nextGigTimeline);
      }

      const [skillsResult, genresResult, portfolioResult] = await Promise.all([
        supabase
          .from("profile_skills")
          .select("skill")
          .eq("profile_id", targetId),
        supabase
          .from("profile_genres")
          .select("genre")
          .eq("profile_id", targetId),
        supabase
          .from("profile_portfolio_urls")
          .select("portfolio_url, sort_order")
          .eq("profile_id", targetId)
          .order("sort_order", { ascending: true }),
      ]);

      if (!shouldApplyFetchResult()) return;

      const normalizedAvatarUrl =
        sanitizeAvatarUrl(profileData?.avatar_url) ||
        sanitizeAvatarUrl(profileStatsData?.avatar_url);

      const nextProfile = {
        ...(profileStatsData || {}),
        ...profileData,
        avatar_url: normalizedAvatarUrl,
        skills: (skillsResult.data || []).map((row: any) => row.skill).filter(Boolean),
        genres: (genresResult.data || []).map((row: any) => row.genre).filter(Boolean),
        portfolio_urls: (portfolioResult.data || [])
          .map((row: any) => row.portfolio_url)
          .filter(Boolean),
      };
      setProfile(nextProfile);

      const fallbackFollowerCount = Number(
        profileStatsData?.followers_count ??
          profileStatsData?.follower_count ??
          profileData?.followers_count ??
          profileData?.follower_count ??
          0,
      );
      let nextProfileFollowerCount = Number.isFinite(fallbackFollowerCount)
        ? Math.max(0, Math.floor(fallbackFollowerCount))
        : 0;
      let nextProfileFollowingCount = 0;
      let nextProfileFollowers: ProfileConnectionItem[] = [];
      let nextProfileFollowing: ProfileConnectionItem[] = [];
      setProfileFollowerCount(nextProfileFollowerCount);
      setProfileFollowingCount(nextProfileFollowingCount);
      setProfileFollowers(nextProfileFollowers);
      setProfileFollowing(nextProfileFollowing);
      setLoadingProfileFollowers(!isGuest);

      try {
        const [followerCountResult, followingCountResult] = await Promise.all([
          supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("followed_id", targetId)
            .eq("followed_type", "profile"),
          supabase
            .from("follows")
            .select("id", { count: "exact", head: true })
            .eq("follower_id", targetId),
        ]);

        if (!shouldApplyFetchResult()) return;

        if (!followerCountResult.error && typeof followerCountResult.count === "number") {
          nextProfileFollowerCount = Math.max(0, followerCountResult.count);
          setProfileFollowerCount(nextProfileFollowerCount);
        }

        if (!followingCountResult.error && typeof followingCountResult.count === "number") {
          nextProfileFollowingCount = Math.max(0, followingCountResult.count);
          setProfileFollowingCount(nextProfileFollowingCount);
        }
      } catch {
        // Keep fallback counts when follows queries are unavailable.
      }

      if (!isGuest) {
        try {
          const [followingResult, followersResult] = await Promise.all([
            supabase.functions.invoke("manage-social-feed", {
              body: {
                action: "get_following",
                target_user_id: targetId,
              },
            }),
            supabase.functions.invoke("manage-social-feed", {
              body: {
                action: "get_followers",
                target_user_id: targetId,
                target_type: "profile",
              },
            }),
          ]);
          const followingResponse = followingResult.data;
          const followingError = followingResult.error;
          const followersResponse = followersResult.data;
          const followersError = followersResult.error;

          if (!shouldApplyFetchResult()) return;

          if (!followingError && Array.isArray(followingResponse?.data)) {
            nextProfileFollowingCount = followingResponse.data.length;
            setProfileFollowingCount(nextProfileFollowingCount);
            nextProfileFollowing = uniqueConnectionItems(
              followingResponse.data
                .map(normalizeFollowingProfile)
                .filter((item: ProfileConnectionItem | null): item is ProfileConnectionItem => Boolean(item)),
            );

            if (followingResponse.data.length > 0 && nextProfileFollowing.length === 0) {
              nextProfileFollowing = await fetchProfileFollowingDirect(targetId);
            }

            if (!shouldApplyFetchResult()) return;
            setProfileFollowing(nextProfileFollowing);
          } else {
            nextProfileFollowing = await fetchProfileFollowingDirect(targetId);
            if (!shouldApplyFetchResult()) return;
            nextProfileFollowingCount = Math.max(nextProfileFollowingCount, nextProfileFollowing.length);
            setProfileFollowingCount(nextProfileFollowingCount);
            setProfileFollowing(nextProfileFollowing);
          }

          if (followersError) {
            nextProfileFollowers = await fetchProfileFollowersDirect(targetId);
            if (!shouldApplyFetchResult()) return;
          } else {
            const seenFollowerIds = new Set<string>();
            nextProfileFollowers = (Array.isArray(followersResponse?.data) ? followersResponse.data : [])
              .map(normalizeFollowerProfile)
              .filter((item: ProfileConnectionItem | null): item is ProfileConnectionItem => {
                if (!item || seenFollowerIds.has(item.id)) {
                  return false;
                }
                seenFollowerIds.add(item.id);
                return true;
              });
          }

          if (
            Array.isArray(followersResponse?.data) &&
            followersResponse.data.length > 0 &&
            nextProfileFollowers.length === 0
          ) {
            nextProfileFollowers = await fetchProfileFollowersDirect(targetId);
            if (!shouldApplyFetchResult()) return;
          }

          setProfileFollowers(nextProfileFollowers);
          nextProfileFollowerCount = Math.max(nextProfileFollowerCount, nextProfileFollowers.length);
          setProfileFollowerCount(nextProfileFollowerCount);
        } catch {
          // Counts still render when the follower list endpoint is unavailable.
        } finally {
          if (shouldApplyFetchResult()) {
            setLoadingProfileFollowers(false);
          }
        }
      } else {
        if (!shouldApplyFetchResult()) return;
        setLoadingProfileFollowers(false);
      }

      if (!shouldApplyFetchResult()) return;

      profileScreenCache.set(targetId, {
        profile: nextProfile,
        isOwner: !!ownership,
        gigStats: nextGigStats,
        gigTimeline: nextGigTimeline,
        supportsGigVisibilityPreference: hasGigVisibilityPreference,
        profileFollowerCount: nextProfileFollowerCount,
        profileFollowingCount: nextProfileFollowingCount,
        profileFollowers: nextProfileFollowers,
        profileFollowing: nextProfileFollowing,
        fetchedAt: Date.now(),
      });

      void fetchBookmarkedListings(targetId, !!ownership && !isGuest);

      if (isFanUserRole(nextProfile.role)) {
        setUserPlaylists([]);
        setUserStation(null);
        setRadioPlaylistIds(new Set());
        setLoadingPlaylists(false);
        setLoadingStation(false);
      } else {
        void fetchPlaylists(targetId);
        void fetchStation(targetId);
      }
    } catch (e) {
    } finally {
      if (targetIdForRequest && profileFetchInFlightRef.current === targetIdForRequest) {
        profileFetchInFlightRef.current = null;
      }
      if (!skippedDuplicateFetch && (!requestId || profileFetchRequestIdRef.current === requestId)) {
        setLoading(false);
      }
    }
  }, [currentUserId, fetchBookmarkedListings, fetchPlaylists, fetchStation, isGuest, normalizedParamUserId]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        const cacheTargetId = normalizedParamUserId || currentUserId;
        const refreshToken =
          typeof normalizedRefresh === "string" && normalizedRefresh.trim().length > 0
            ? normalizedRefresh.trim()
            : null;
        const shouldForceRefresh = Boolean(
          refreshToken && lastHandledProfileRefreshRef.current !== refreshToken,
        );

        if (shouldForceRefresh) {
          if (cacheTargetId) {
            profileScreenCache.delete(cacheTargetId);
          }
          lastHandledProfileRefreshRef.current = refreshToken;
        }

        const cached =
          !shouldForceRefresh && cacheTargetId ? profileScreenCache.get(cacheTargetId) : null;
        const cacheIsFresh =
          !shouldForceRefresh &&
          cached &&
          Date.now() - cached.fetchedAt < PROFILE_FOCUS_REFRESH_COOLDOWN_MS;

        if (cached) {
          setProfile(cached.profile);
          setIsOwner(cached.isOwner);
          setGigStats(cached.gigStats);
          setGigTimeline(cached.gigTimeline);
          setSupportsGigVisibilityPreference(cached.supportsGigVisibilityPreference);
          setProfileFollowerCount(cached.profileFollowerCount);
          setProfileFollowingCount(cached.profileFollowingCount ?? 0);
          setProfileFollowers(cached.profileFollowers || []);
          setProfileFollowing(cached.profileFollowing || []);
          setLoadingProfileFollowers(false);
          setLoading(false);
        }

        if (!cacheIsFresh) {
          let isActive = true;
          let refreshStarted = false;
          let focusFallbackTimer: ReturnType<typeof setTimeout> | null = null;
          const startProfileRefresh = () => {
            if (!isActive || refreshStarted) return;
            refreshStarted = true;
            void fetchProfile({ showLoading: !cached, force: shouldForceRefresh });
          };

          if (!cached) {
            startProfileRefresh();
          } else {
            const focusTask = InteractionManager.runAfterInteractions(startProfileRefresh);
            focusFallbackTimer = setTimeout(startProfileRefresh, 800);

            return () => {
              isActive = false;
              focusTask.cancel();
              if (focusFallbackTimer) clearTimeout(focusFallbackTimer);
            };
          }

          return () => {
            isActive = false;
            if (focusFallbackTimer) clearTimeout(focusFallbackTimer);
          };
        }
      }
    }, [authLoading, currentUserId, fetchProfile, normalizedParamUserId, normalizedRefresh]),
  );

  const MENU_ITEMS = [
    { label: "Edit Profile", icon: "person-outline", route: "/edit_profile" },
    ...(!isFan && !isStaff ? [{ label: "Wallet", icon: "wallet-outline", route: "/wallet" }] : []),
    { label: "Identity Verification", icon: "card-outline", route: "/identity_verification" },
    { label: "Settings", icon: "settings-outline", route: "/settings" },
  ];

  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("Preparing media...");
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [pendingAlert, setPendingAlert] = useState<ProfileAlertConfig | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  useBottomOverlayVisibility(mediaModalVisible || uploading, "ProfileMediaOrUploadModal");
  const uploadingRef = useRef(false);
  const [alertConfig, setAlertConfig] = useState<ProfileAlertConfig>({
    type: "info",
    title: "",
    message: "",
  });

  const fetchProfilePosts = useCallback(async (targetId: string) => {
    if (!targetId || isGuest) {
      setProfilePosts([]);
      return;
    }

    const cached = profilePostsCache.get(targetId);
    if (cached && Date.now() - cached.fetchedAt < PROFILE_POSTS_CACHE_TTL_MS) {
      setProfilePosts(cached.posts);
      setLoadingProfilePosts(false);
      return;
    }

    if (profilePostsFetchInFlightRef.current === targetId) {
      return;
    }

    profilePostsFetchInFlightRef.current = targetId;
    setLoadingProfilePosts(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_user_posts", target_user_id: targetId, limit: 12 },
      });

      if (error) throw error;

      const rows = Array.isArray(data?.data) ? data.data : [];
      const nextPosts = rows.map((post: any) => {
        const media = Array.isArray(post?.media)
          ? post.media.map((item: any) => ({
              ...item,
              preview_url: sanitizeAvatarUrl(item?.thumbnail_url || item?.thumbnail_path || item?.url || item?.storage_path || item?.public_url) || "",
            }))
          : [];
        const cover = media.find((item: any) => item?.is_cover) || media[0] || null;

        return {
          ...post,
          body: post?.body ?? post?.content ?? "",
          media,
          preview_url: cover?.preview_url || "",
        };
      });
      profilePostsCache.set(targetId, {
        posts: nextPosts,
        fetchedAt: Date.now(),
      });
      setProfilePosts(nextPosts);
    } catch (error) {
      console.warn("Profile posts fetch failed", error);
      setProfilePosts([]);
    } finally {
      if (profilePostsFetchInFlightRef.current === targetId) {
        profilePostsFetchInFlightRef.current = null;
      }
      setLoadingProfilePosts(false);
    }
  }, [isGuest]);

  const resolveProfilePostsTargetId = useCallback(() => {
    return profile?.id || normalizedParamUserId || currentUserId || "";
  }, [currentUserId, normalizedParamUserId, profile?.id]);

  useFocusEffect(useCallback(() => {
    if (activeTab !== "posts") {
      return undefined;
    }

    const targetId = resolveProfilePostsTargetId();
    if (!targetId) {
      setProfilePosts([]);
      return undefined;
    }
    void fetchProfilePosts(targetId);
    return undefined;
  }, [activeTab, fetchProfilePosts, resolveProfilePostsTargetId]));

  const openProfilePost = useCallback((post: any) => {
    if (!post?.id) {
      return;
    }

    router.push({
      pathname: "/post_details" as any,
      params: { post_id: String(post.id) },
    });
  }, []);

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
    forceModal = false,
  ) => {
    const nextAlert = { type, title, message, buttons, forceModal };
    if (uploadingRef.current) {
      setPendingAlert(nextAlert);
      return;
    }

    setAlertConfig(nextAlert);
    setAlertVisible(true);
  };

  useEffect(() => {
    if (uploading || !pendingAlert) {
      return;
    }

    const nextAlert = pendingAlert;
    const timeoutId = setTimeout(() => {
      setAlertConfig(nextAlert);
      setAlertVisible(true);
      setPendingAlert(null);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [pendingAlert, uploading]);

  const showUploadFeedbackAlert = (error: any) => {
    const rawMessage = String(error?.message || error || "Failed to upload media").trim();
    if (rawMessage.includes("Skipped media:")) {
      showAlert(
        "warning",
        "Upload failed",
        rawMessage,
        [{ text: "OK", style: "default" }],
        true,
      );
      return;
    }

    const safetyPrefix = " was blocked by safety screening. ";
    const safetyPrefixIndex = rawMessage.indexOf(safetyPrefix);

    if (safetyPrefixIndex >= 0) {
      const reason = sanitizeUploadFeedbackMessage(
        rawMessage.slice(safetyPrefixIndex + safetyPrefix.length).trim(),
      );
      showAlert(
        "warning",
        "Upload blocked",
        reason || "This media did not pass safety screening.",
        [{ text: "Choose another", style: "default" }],
        true,
      );
      return;
    }

    showAlert(
      "warning",
      "Upload failed",
      sanitizeUploadFeedbackMessage(rawMessage),
      [{ text: "OK", style: "default" }],
      true,
    );
  };

  const handleToggleGigVisibility = async (value: boolean) => {
    if (!isOwner || profile?.role !== "musician" || !currentUserId) return;

    const previousValue = profile?.show_gig_statuses !== false;
    setUpdatingGigVisibility(true);
    setProfile((prev: any) => ({ ...(prev || {}), show_gig_statuses: value }));

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ show_gig_statuses: value })
        .eq("id", currentUserId);

      if (error) throw error;
    } catch (e: any) {
      setProfile((prev: any) => ({ ...(prev || {}), show_gig_statuses: previousValue }));
      if (isMissingShowGigStatusesColumnError(e)) {
        setSupportsGigVisibilityPreference(false);
        setProfile((prev: any) => ({ ...(prev || {}), show_gig_statuses: true }));
        showAlert(
          "warning",
          "Setting Unavailable",
          "Gig status visibility preference is unavailable until the latest profile schema migration is applied.",
        );
        return;
      }
      showAlert("warning", "Update Failed", e?.message || "Failed to update gig visibility.");
    } finally {
      setUpdatingGigVisibility(false);
    }
  };

  const navigateBackToPreviousOrHome = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/home");
  }, []);

  const handleHeaderBack = useCallback(() => {
    const shouldReturnHome =
      (Array.isArray(params.returnToHome)
        ? params.returnToHome[0]
        : params.returnToHome) === "1";
    const returnListingId = Array.isArray(params.returnListingId)
      ? params.returnListingId[0]
      : params.returnListingId;

    if (shouldReturnHome && returnListingId) {
      void AsyncStorage.setItem(PENDING_REOPEN_LISTING_STORAGE_KEY, returnListingId)
        .catch(() => { })
        .finally(() => {
          navigateBackToPreviousOrHome();
        });
      return;
    }

    navigateBackToPreviousOrHome();
  }, [navigateBackToPreviousOrHome, params.returnListingId, params.returnToHome]);

  const openBookmarkedListing = async (item: any) => {
    const itemId = item?.id;
    if (!itemId) return;
    const listingType = getBookmarkListingTypeParam(item);

    try {
      const pendingWrites: [string, string][] = [
        [PENDING_REOPEN_LISTING_STORAGE_KEY, itemId],
      ];

      if (listingType) {
        pendingWrites.push([PENDING_REOPEN_LISTING_TYPE_STORAGE_KEY, listingType]);
      }

      await AsyncStorage.multiSet(pendingWrites);
    } catch {
      // Continue navigation even if cache write fails.
    }

    router.push({
      pathname: "/home" as any,
      params: {
        reopenListingId: itemId,
        listingType,
      },
    });
  };

  const submitProfileReport = async (reason: string, details?: string) => {
    if (!currentUserId) {
      showAlert("warning", "Login Required", "You need to be logged in to submit a report.");
      return;
    }
    if (!profile?.id) {
      showAlert("warning", "Unable to Report", "Missing profile details.");
      return;
    }

    const { error } = await supabase.functions.invoke("manage-details", {
      body: {
        action: "report",
        type: "profile",
        id: profile.id,
        userId: currentUserId,
        reason,
        details: details || null,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to submit report.");
    }
  };

  const openReportModal = () => {
    setShowReportModal(true);
  };

  const getProfileMediaType = (url: string) => getInAppMediaType(url);

  const openMediaViewer = (url: string) => {
    setSelectedMedia(url);
    setMediaModalVisible(true);
  };

  const removeMediaFromPortfolio = async (url: string) => {
    if (!currentUserId || !isOwner) {
      showAlert("warning", "Unable to Remove", "You can only remove media from your own profile.");
      return;
    }

    logProfileMedia("remove_requested", { profileId: currentUserId, url });

    try {
      uploadingRef.current = true;
      setUploading(true);
      setUploadMessage("Removing media...");

      const { error: deleteError } = await supabase
        .from("profile_portfolio_urls")
        .delete()
        .eq("profile_id", currentUserId)
        .eq("portfolio_url", url);

      if (deleteError) {
        logProfileMedia("remove_db_failed", {
          message: deleteError.message,
          code: deleteError.code,
          details: deleteError.details,
        });
        throw deleteError;
      }

      logProfileMedia("remove_db_success", { url });

      const storageObject = resolveStorageObjectFromPublicUrl(url);
      if (storageObject) {
        const { error: storageError } = await supabase.storage
          .from(storageObject.bucket)
          .remove([storageObject.path]);

        if (storageError) {
          logProfileMedia("remove_storage_failed_non_blocking", {
            ...storageObject,
            message: storageError.message,
          });
        } else {
          logProfileMedia("remove_storage_success", storageObject);
        }
      } else {
        logProfileMedia("remove_storage_skipped_unrecognized_url", { url });
      }

      setProfile((prev: any) => ({
        ...(prev || {}),
        portfolio_urls: Array.isArray(prev?.portfolio_urls)
          ? prev.portfolio_urls.filter((item: string) => item !== url)
          : [],
      }));
      fetchProfile();
      showAlert("success", "Removed", "Media removed from your profile.");
    } catch (error: any) {
      logProfileMedia("remove_failed", { message: error?.message || String(error) });
      showAlert("warning", "Remove Failed", error?.message || "Failed to remove media.");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const confirmRemoveMedia = (url: string) => {
    showAlert(
      "warning",
      "Remove Media",
      "Remove this photo, video, or document from your profile?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMediaFromPortfolio(url),
        },
      ],
    );
  };

  const uploadSelectedPortfolioAssets = async (
    selectedAssets: PortfolioUploadAsset[],
    userId: string,
  ) => {
    try {
      const uploadedUrls: string[] = [];
      const skippedMedia: SkippedProfileMediaFeedback[] = [];
      uploadingRef.current = true;
      setUploading(true);
      setUploadMessage("Preparing media...");

      const { data: lastPortfolioRow, error: portfolioFetchError } = await supabase
        .from("profile_portfolio_urls")
        .select("sort_order")
        .eq("profile_id", userId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (portfolioFetchError) {
        logProfileMedia("sort_order_fetch_failed", { message: portfolioFetchError.message });
        throw portfolioFetchError;
      }

      const nextSortOrder =
        lastPortfolioRow?.sort_order !== undefined && lastPortfolioRow?.sort_order !== null
          ? Number(lastPortfolioRow.sort_order) + 1
          : 0;

      for (const [index, file] of selectedAssets.entries()) {
        const displayName = getPortfolioAssetDisplayName(file, index);

        try {
          setUploadMessage(`Preparing media ${index + 1}/${selectedAssets.length}...`);

      const fileExt = resolvePortfolioFileExtension(file);
      const fileName = `${userId}/portfolio/${Date.now()}_${index}.${fileExt}`;
      const mimeType = resolvePortfolioMimeType(file, fileExt);
      const uploadKind = resolvePortfolioUploadKind(file, mimeType, fileExt);
      const fileSize = await getPortfolioFileSize(file);

      logProfileMedia("file_selected", {
        uri: file.uri,
        fileName,
        fileExt,
        mimeType,
        uploadKind,
        pickerMimeType: file.mimeType,
        pickerType: (file as any)?.type,
        fileSize: (file as any)?.fileSize,
        resolvedFileSize: fileSize,
      });

      let base64: string | undefined;
      let bytes: Uint8Array | undefined;
      if (uploadKind === "photo") {
        base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: "base64" });
        bytes = base64ToUint8Array(base64);
      }

      logProfileMedia("file_prepared", {
        byteLength: bytes?.byteLength || fileSize,
        base64Length: base64?.length || 0,
        uploadMode: uploadKind === "photo" ? "inline_bytes" : "streamed_file",
      });
      setUploadMessage(`Checking media ${index + 1}/${selectedAssets.length}...`);
      logProfileMedia("safety_check_started", {
        fileName,
        mimeType,
        byteLength: bytes?.byteLength || fileSize,
      });
      await withSafetyTimeout(screenProfilePortfolioMedia(file, {
        fileExt,
        mimeType,
        uploadKind,
        size: bytes?.byteLength || fileSize,
        base64,
      }));
      logProfileMedia("safety_check_passed", { fileName });

      setUploadMessage(`Uploading media ${index + 1}/${selectedAssets.length}...`);
      logProfileMedia("storage_upload_started", {
        bucket: "portfolio",
        fileName,
        contentType: mimeType,
      });
      const { data: uploadData, error: uploadError } = await uploadPortfolioMediaFile(file, {
        fileName,
        mimeType,
        bytes,
        streamFile: uploadKind !== "photo",
      });

      if (uploadError) {
        logProfileMedia("storage_upload_failed", { message: uploadError.message });
        console.error("❌ Upload failed:", uploadError);
        throw new Error(uploadError.message || "Upload failed");
      }

      logProfileMedia("storage_upload_success", { path: uploadData?.path });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("portfolio")
        .getPublicUrl(fileName);


      logProfileMedia("public_url_resolved", { publicUrl: urlData.publicUrl });

      const sortOrder = nextSortOrder + uploadedUrls.length;
      const { error: portfolioInsertError } = await supabase
        .from("profile_portfolio_urls")
        .upsert(
          {
            profile_id: userId,
            portfolio_url: urlData.publicUrl,
            sort_order: sortOrder,
          },
          { onConflict: "profile_id,portfolio_url" },
        );

      if (portfolioInsertError) {
        logProfileMedia("portfolio_db_insert_failed", {
          message: portfolioInsertError.message,
          code: portfolioInsertError.code,
          details: portfolioInsertError.details,
        });
        throw portfolioInsertError;
      }

      logProfileMedia("portfolio_db_insert_success", {
        url: urlData.publicUrl,
        sortOrder,
      });
      uploadedUrls.push(urlData.publicUrl);
        } catch (itemError: any) {
          logProfileMedia("upload_item_failed", {
            name: displayName,
            message: itemError?.message || String(itemError),
          });
          skippedMedia.push({
            name: displayName,
            reason: sanitizeUploadFeedbackMessage(
              String(itemError?.message || itemError || "Failed to upload media."),
            ),
          });
        }
      }

      if (uploadedUrls.length === 0) {
        throw new Error(
          `No selected media was uploaded.${formatSkippedProfileMediaFeedback(skippedMedia)}`,
        );
      }

      // Refresh profile
      fetchProfile();
      setProfile((prev: any) => ({
        ...(prev || {}),
        portfolio_urls: [
          ...(Array.isArray(prev?.portfolio_urls) ? prev.portfolio_urls : []),
          ...uploadedUrls,
        ],
      }));
      showAlert(
        skippedMedia.length > 0 ? "warning" : "success",
        skippedMedia.length > 0 ? "Some Media Skipped" : "Success",
        skippedMedia.length > 0
          ? `${uploadedUrls.length} media item(s) added. ${skippedMedia.length} selected item(s) were skipped.${formatSkippedProfileMediaFeedback(skippedMedia)}`
          : `${uploadedUrls.length} media item(s) added to your portfolio!`,
        [{ text: "OK", style: "default" }],
        skippedMedia.length > 0,
      );
    } catch (e: any) {
      logProfileMedia("upload_failed", { message: e?.message || String(e) });
      showUploadFeedbackAlert(e);
    } finally {
      logProfileMedia("upload_finished");
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const getPortfolioUploadUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logProfileMedia("upload_blocked_no_user");
      showAlert("warning", "Not Logged In", "You must be logged in.");
      return null;
    }

    logProfileMedia("upload_user_resolved", { userId: user.id });
    return user;
  };

  const pickPhotosAndVideosForPortfolio = async () => {
    try {
      logProfileMedia("upload_started", { source: "media_library" });
      const user = await getPortfolioUploadUser();
      if (!user) return;

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        logProfileMedia("upload_permission_denied");
        showAlert("warning", "Permission needed", "Please allow access to your photos.");
        return;
      }

      logProfileMedia("picker_opening", { source: "media_library" });
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.5,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        logProfileMedia("picker_cancelled", { source: "media_library" });
        return;
      }

      await uploadSelectedPortfolioAssets(result.assets, user.id);
    } catch (e: any) {
      logProfileMedia("picker_failed", { source: "media_library", message: e?.message || String(e) });
      showUploadFeedbackAlert(e);
    }
  };

  const pickDocumentsForPortfolio = async () => {
    try {
      logProfileMedia("upload_started", { source: "document_picker" });
      const user = await getPortfolioUploadUser();
      if (!user) return;

      logProfileMedia("picker_opening", { source: "document_picker" });
      const result = await DocumentPicker.getDocumentAsync({
        type: PORTFOLIO_DOCUMENT_PICKER_MIME_TYPES,
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        logProfileMedia("picker_cancelled", { source: "document_picker" });
        return;
      }

      await uploadSelectedPortfolioAssets(result.assets, user.id);
    } catch (e: any) {
      logProfileMedia("picker_failed", { source: "document_picker", message: e?.message || String(e) });
      showUploadFeedbackAlert(e);
    }
  };

  const addMediaToPortfolio = () => {
    if (uploadingRef.current || uploading) {
      return;
    }

    showAlert(
      "info",
      "Add Media",
      "Choose what to add to your profile.",
      [
        { text: "Photos & Videos", onPress: () => void pickPhotosAndVideosForPortfolio() },
        { text: "Documents", onPress: () => void pickDocumentsForPortfolio() },
        { text: "Cancel", style: "cancel" },
      ],
      true,
    );
  };

  const portfolioCount = profile?.portfolio_urls?.length ?? 0;
  const profileAvatarUrl = sanitizeAvatarUrl(profile?.avatar_url);
  const viewedProfileId = typeof profile?.id === "string" ? profile.id.trim() : "";
  const profileFollowKey = buildSocialFollowKey("profile", viewedProfileId);
  const canFollowProfile =
    Boolean(currentUserId) &&
    !isGuest &&
    !isOwner &&
    viewedProfileId.length > 0 &&
    viewedProfileId !== currentUserId;
  const openCreatePlaylist = useCallback(() => {
    const targetUserId = viewedProfileId || currentUserId || normalizedParamUserId || "";

    if (targetUserId) {
      profilePlaylistsCache.delete(targetUserId);
      profileStationCache.delete(targetUserId);
    }

    router.push("/create_playlist" as any);
  }, [currentUserId, normalizedParamUserId, viewedProfileId]);
  const formatFollowerRole = (role?: string | null) => {
    if (!role) return "Profile";
    if (role === "group") return "Group";
    if (role === "studio-owner") return "Studio Owner";
    if (role === "venue-owner") return "Gig Owner";
    return role.replace("-", " ").replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatProfileRoleHeadline = (profileData?: any) => {
    const role = profileData?.role;
    const specialties = Array.isArray(profileData?.skills)
      ? profileData.skills
        .map((skill: unknown) => String(skill || "").trim())
        .filter((skill: string) => skill.length > 0 && skill.toLowerCase() !== "producer")
      : [];

    if (role === "musician") {
      return specialties.length > 0
        ? `Musician (${specialties.join(", ")})`
        : "Musician";
    }
    if (role === "fan") {
      return specialties.length > 0
        ? `Fan (${specialties.join(", ")})`
        : "Fan";
    }
    if (role === "studio-owner") return "Studio Owner";
    if (role === "venue-owner") return "Gig Owner";
    return role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
  };

  const openFollowListItem = (item: ProfileConnectionItem) => {
    if (!item.id) return;

    followListSheetRef.current?.dismiss();

    if (item.target_type === "group") {
      router.push({
        pathname: "/group_details",
        params: { id: item.id },
      });
      return;
    }

    router.push({
      pathname: "/profile",
      params: { userId: item.id },
    });
  };

  const logPlaylistInvokeError = useCallback((context: string, error: any, body: Record<string, unknown>) => {
    console.error(`manage-playlists ${context} failed`, {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      context: error?.context,
      body,
    });
  }, []);

  const ensurePlaylistMutationSession = useCallback(async () => {
    if (isGuest) {
      throw new Error("You need to sign in to manage playlists.");
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (session?.access_token) {
      return session;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw refreshError;
    }

    if (!refreshed.session?.access_token) {
      throw new Error("Your session expired. Please sign in again.");
    }

    return refreshed.session;
  }, [isGuest]);

  const handleDeletePlaylist = async (playlistId: string, playlistTitle: string) => {
    const targetUserId = viewedProfileId || currentUserId || normalizedParamUserId || "";

    if (authLoading) {
      showAlert("info", "Please Wait", "Your session is still loading. Try again in a moment.");
      return;
    }

    try {
      setPlaylistActionId(playlistId);
      await ensurePlaylistMutationSession();

      const body = { action: "delete_playlist", playlist_id: playlistId };
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body,
      });

      if (error) {
        logPlaylistInvokeError("delete_playlist", error, body);
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete playlist.");
      }

      [viewedProfileId, targetUserId].forEach((cacheTargetId) => {
        if (!cacheTargetId) return;

        profilePlaylistsCache.delete(cacheTargetId);
        profileStationCache.delete(cacheTargetId);
      });

      setUserPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
      setRadioPlaylistIds((prev) => {
        if (!prev.has(playlistId)) {
          return prev;
        }

        const next = new Set(prev);
        next.delete(playlistId);
        return next;
      });

      if (viewedProfileId) {
        void fetchStation(viewedProfileId);
      }

      if (targetUserId) {
        void fetchPlaylists(targetUserId);
        void fetchStation(targetUserId);
      }

      emitToast({
        type: "success",
        title: "Playlist Deleted",
        message: `${playlistTitle || "Playlist"} was removed.`,
      });
    } catch (error: any) {
      showAlert("warning", "Delete Failed", error?.message || "Failed to delete playlist.");
    } finally {
      setPlaylistActionId(null);
    }
  };

  const promptDeletePlaylist = (playlist: any) => {
    showAlert(
      "warning",
      "Delete Playlist",
      `Delete \"${playlist?.title || "this playlist"}\"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void handleDeletePlaylist(playlist.id, playlist.title || "Playlist");
          },
        },
      ],
    );
  };
  const mediaSummary =
    portfolioCount > 0
      ? `${portfolioCount} ${portfolioCount === 1 ? "item" : "items"} in ${isOwner ? "your" : "this"} portfolio`
      : isOwner
        ? "Add photos, videos, and documents that show your sound, setup, or stage presence."
        : "No portfolio uploads yet.";
  const stationSlotCount = getProfileStationSlotCount(userStation, radioPlaylistIds.size);
  const hasStation = Boolean(userStation?.id);
  const stationArtworkUrl =
    profileAvatarUrl ||
    sanitizeAvatarUrl(userStation?.managed_profile?.avatar_url) ||
    sanitizeAvatarUrl(userStation?.creator?.avatar_url);
  const stationName =
    typeof userStation?.name === "string" && userStation.name.trim().length > 0
      ? userStation.name.trim()
      : `${profile?.full_name || "Artist"}'s Radio`;
  const stationCreatorName =
    typeof userStation?.managed_profile?.full_name === "string" &&
    userStation.managed_profile.full_name.trim().length > 0
      ? userStation.managed_profile.full_name.trim()
      : typeof profile?.full_name === "string" && profile.full_name.trim().length > 0
        ? profile.full_name.trim()
        : profile?.full_name || "Artist";
  const stationGenre =
    typeof userStation?.genre === "string" && userStation.genre.trim().length > 0
      ? userStation.genre.trim()
      : Array.isArray(profile?.genres) && typeof profile.genres[0] === "string"
        ? profile.genres[0]
        : "";
  const stationHasHydratedSlots = hasProfileStationHydratedSlots(userStation);
  const stationPlayableTrackCount = stationHasHydratedSlots
    ? getProfileStationPlayableTrackCount(userStation)
    : 0;
  const stationHasPlayablePlaylistTracks = stationHasHydratedSlots
    ? stationPlayableTrackCount > 0
    : stationSlotCount > 0;
  const stationIsLive = hasStation && userStation?.is_active !== false && stationHasPlayablePlaylistTracks;
  const stationIsCurrentSource = Boolean(
    hasStation && activeStation?.id && activeStation.id === userStation?.id,
  );
  const canPlayStationFromProfile = stationIsLive;
  const isStationActionLoading = Boolean(
    stationActionBusy ||
    (hasStation && userStation?.id && loadingStationId === userStation.id),
  );
  const loadProfileFollowState = useCallback(async () => {
    if (!canFollowProfile || !profileFollowKey) {
      setIsProfileFollowing(false);
      return;
    }

    try {
      const { data: followingResponse, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_following" },
      });

      if (error) {
        throw error;
      }

      const nextFollowingKeys = new Set<string>(
        (Array.isArray(followingResponse?.data) ? followingResponse.data : [])
          .map((row: any) => buildSocialFollowKey(row?.followed_type, row?.followed_id))
          .filter((value: string) => value.length > 0),
      );

      setIsProfileFollowing(nextFollowingKeys.has(profileFollowKey));
    } catch {
      // Keep the current profile follow state when lookup fails.
    }
  }, [canFollowProfile, profileFollowKey]);

  useEffect(() => {
    void loadProfileFollowState();
  }, [loadProfileFollowState]);

  const refreshProfileFollowLists = useCallback(async () => {
    const targetId = viewedProfileId || currentUserId || normalizedParamUserId || "";
    if (!targetId || isGuest) {
      setProfileFollowers([]);
      setProfileFollowing([]);
      setProfileFollowerCount(0);
      setProfileFollowingCount(0);
      return;
    }

    setLoadingProfileFollowers(true);

    try {
      const [followers, following] = await Promise.all([
        fetchProfileFollowersDirect(targetId),
        fetchProfileFollowingDirect(targetId),
      ]);

      setProfileFollowers(followers);
      setProfileFollowing(following);
      setProfileFollowerCount((prev) => Math.max(prev, followers.length));
      setProfileFollowingCount((prev) => Math.max(prev, following.length));
    } catch {
      // Keep already loaded counts and cached rows if the list refresh fails.
    } finally {
      setLoadingProfileFollowers(false);
    }
  }, [currentUserId, isGuest, normalizedParamUserId, viewedProfileId]);

  const openFollowListModal = useCallback((nextModal: "followers" | "following") => {
    setFollowListModal(nextModal);
    void refreshProfileFollowLists();
  }, [refreshProfileFollowLists]);

  const closeFollowListModal = useCallback(() => {
    followListSheetRef.current?.dismiss();
  }, []);

  useEffect(() => {
    if (followListModal) {
      requestAnimationFrame(() => followListSheetRef.current?.present());
    }
  }, [followListModal]);

  const handleProfileFollowToggle = useCallback(async () => {
    if (!canFollowProfile || !viewedProfileId || isProfileFollowBusy) {
      return;
    }

    const wasFollowing = isProfileFollowing;
    const previousFollowerCount = profileFollowerCount;
    setIsProfileFollowBusy(true);
    setIsProfileFollowing(!wasFollowing);
    setProfileFollowerCount((prev) => Math.max(0, prev + (wasFollowing ? -1 : 1)));

    try {
      const { error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: wasFollowing ? "unfollow" : "follow",
          target_id: viewedProfileId,
          target_type: "profile",
        },
      });

      if (error) {
        throw error;
      }

      emitToast({
        type: "success",
        title: wasFollowing ? "Unfollowed" : "Following",
        message: "",
      });
      void fetchProfile({ showLoading: false });
    } catch (error: any) {
      setIsProfileFollowing(wasFollowing);
      setProfileFollowerCount(previousFollowerCount);
      emitToast({
        type: "error",
        title: "Follow failed",
        message: error?.message || "Please try again.",
      });
    } finally {
      setIsProfileFollowBusy(false);
    }
  }, [canFollowProfile, fetchProfile, isProfileFollowBusy, isProfileFollowing, profileFollowerCount, viewedProfileId]);

  const playlistSectionHint = hasStation
    ? canManageStations
      ? "Tap the station card to listen live, then use the station controls to curate what stays on air."
      : "Tap the station card to listen live, or open any playlist card to view its tracks."
    : canManageStations
      ? "Create a station and curate the live queue for this profile."
      : isOwner && !isGuest
        ? "Stations are managed for this profile. Contact support to create or update your radio station."
      : "Tap any playlist card to open it.";
  const stationPrimaryLabel = isStationActionLoading
    ? "Tuning In"
    : !hasStation
    ? canManageStations
      ? "Create Station"
      : "Managed"
    : canPlayStationFromProfile
      ? stationIsCurrentSource
        ? isMuted
          ? "Unmute Live Audio"
          : "Mute Live Audio"
        : "Listen Live"
      : canManageStations
        ? "Manage Station"
        : "Open Station";
  const stationStatusLabel = stationIsLive
    ? stationIsCurrentSource && isPlaying
      ? "LIVE NOW"
      : "LIVE"
    : "OFFLINE";
  const followListTitle = followListModal === "following" ? "Following" : "Followers";
  const followListItems = followListModal === "following" ? profileFollowing : profileFollowers;
  const followListCount = followListModal === "following" ? profileFollowingCount : profileFollowerCount;
  const followListEmptyText = isGuest
    ? "Sign in to view this list."
    : followListModal === "following"
      ? "Not following anyone yet."
      : "No followers yet.";
  const profileTabOrder = useMemo(
    () => [
      "about",
      "posts",
      ...(profile?.role === "musician" && profile?.show_gig_statuses !== false ? ["gigs"] : []),
      ...(isOwner && !isGuest ? ["bookmarks"] : []),
      ...(!isProfileFan ? ["playlists"] : []),
    ] as ProfileTabKey[],
    [isGuest, isOwner, isProfileFan, profile?.role, profile?.show_gig_statuses],
  );
  const profileTabs = useMemo<SlidingTabItem<ProfileTabKey>[]>(
    () =>
      profileTabOrder.map((key) => {
        if (key === "gigs") {
          return {
            key,
            icon: "mic-outline",
            activeIcon: "mic",
            accessibilityLabel: "Gigs",
          };
        }

        if (key === "bookmarks") {
          return {
            key,
            icon: "bookmark-outline",
            activeIcon: "bookmark",
            accessibilityLabel: "Bookmarks",
          };
        }

        if (key === "posts") {
          return {
            key,
            icon: "newspaper-outline",
            activeIcon: "newspaper",
            accessibilityLabel: "Posts",
          };
        }

        if (key === "playlists") {
          return {
            key,
            icon: "musical-notes-outline",
            activeIcon: "musical-notes",
            accessibilityLabel: "Playlists",
          };
        }

        return {
          key,
          icon: "grid-outline",
          activeIcon: "grid",
          accessibilityLabel: "About",
        };
      }),
    [profileTabOrder],
  );
  const profileActiveTabIndex = getSmoothTabIndex(profileTabOrder, activeTab);
  const handleProfileTabChange = useCallback((nextTab: ProfileTabKey) => {
    React.startTransition(() => {
      setSmoothTab(setActiveTab, nextTab);
    });
  }, []);

  useEffect(() => {
    if (profileTabOrder.includes(activeTab)) {
      return;
    }

    setActiveTab(profileTabOrder[0] ?? "about");
  }, [activeTab, profileTabOrder]);

  const openStationScreen = () => {
    if (hasStation && userStation?.id) {
      router.push({
        pathname: "/station_details" as any,
        params: { station_id: String(userStation.id) },
      });
      return;
    }

    if (canManageStations) {
      if (viewedProfileId) {
        router.push({ pathname: "/create_station" as any, params: { profile_id: viewedProfileId } });
        return;
      }

      router.push("/create_station" as any);
    }
  };

  const cacheHydratedProfileStation = (station: any) => {
    const cacheTargetId = viewedProfileId || currentUserId || normalizedParamUserId || "";
    const nextRadioPlaylistIds = Array.isArray(station?.slot_playlist_ids)
      ? station.slot_playlist_ids
      : [];

    setUserStation(station);
    setRadioPlaylistIds(new Set(nextRadioPlaylistIds));

    if (cacheTargetId) {
      profileStationCache.set(cacheTargetId, {
        station,
        radioPlaylistIds: nextRadioPlaylistIds,
        fetchedAt: Date.now(),
      });
    }
  };

  const hydrateStationForProfilePlayback = async () => {
    if (!userStation?.id) {
      return null;
    }

    if (userStation.__queueReady === true || hasProfileStationHydratedSlots(userStation)) {
      return userStation;
    }

    const { data, error } = await supabase.functions.invoke("manage-playlists", {
      body: {
        action: "get_station_details",
        station_id: userStation.id,
      },
    });

    if (error) {
      throw error;
    }

    const hydratedStation = data?.data
      ? {
        ...data.data,
        __queueReady: true,
      }
      : userStation;

    cacheHydratedProfileStation(hydratedStation);
    return hydratedStation;
  };

  const handleStationPrimaryAction = async () => {
    if (isStationActionLoading) {
      return;
    }

    if (!hasStation) {
      openStationScreen();
      return;
    }

    if (!canPlayStationFromProfile) {
      openStationScreen();
      return;
    }

    setStationActionBusy(true);
    try {
      if (stationIsCurrentSource) {
        await toggleMute();
        return;
      }

      const playableStation = await hydrateStationForProfilePlayback();
      const canTuneIn = Boolean(
        playableStation &&
        getProfileStationPlayableTrackCount(playableStation) > 0,
      );

      if (!canTuneIn) {
        emitToast({
          type: "info",
          title: "Station offline",
          message: "This station needs at least one playable playlist track before it can play.",
        });
        return;
      }

      await tuneIn(playableStation);
    } catch (stationError: any) {
      emitToast({
        type: "error",
        title: "Radio unavailable",
        message: stationError?.message || "Unable to start this station right now.",
      });
    } finally {
      setStationActionBusy(false);
    }
  };

  if (isGuest && !normalizedParamUserId) {
    return (
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Profile" />
        <GuestSignInGate message="Sign in to view and manage your MusikaLokal profile." />
        <Navbar />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Profile" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.profileSkeletonScrollContent}
        >
          <View style={styles.profileSkeletonHeader}>
            <Skeleton width={112} height={112} borderRadius={56} />
            <Skeleton width={180} height={24} style={{ marginTop: 16 }} />
            <Skeleton width={220} height={16} style={{ marginTop: 8 }} />

            <View style={styles.profileSkeletonTagRow}>
              <Skeleton width={68} height={24} borderRadius={100} />
              <Skeleton width={84} height={24} borderRadius={100} />
              <Skeleton width={72} height={24} borderRadius={100} />
            </View>

            <View style={styles.profileSkeletonStatsRow}>
              <Skeleton width="31%" height={56} borderRadius={14} />
              <Skeleton width="31%" height={56} borderRadius={14} />
              <Skeleton width="31%" height={56} borderRadius={14} />
            </View>
          </View>

          <View style={styles.profileSkeletonSection}>
            <Skeleton width="100%" height={72} borderRadius={16} />
            <Skeleton width="100%" height={72} borderRadius={16} />
            <Skeleton width="100%" height={72} borderRadius={16} />
          </View>

          <View style={styles.profileSkeletonMediaGrid}>
            <Skeleton style={styles.profileSkeletonMediaItem} borderRadius={12} />
            <Skeleton style={styles.profileSkeletonMediaItem} borderRadius={12} />
            <Skeleton style={styles.profileSkeletonMediaItem} borderRadius={12} />
            <Skeleton style={styles.profileSkeletonMediaItem} borderRadius={12} />
            <Skeleton style={styles.profileSkeletonMediaItem} borderRadius={12} />
            <Skeleton style={styles.profileSkeletonMediaItem} borderRadius={12} />
          </View>
        </ScrollView>
        <Navbar />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header
          title={isOwner ? "My Profile" : "User Profile"}
          {...(!isOwner ? { onBackPress: handleHeaderBack } : {})}
          rightComponent={isOwner ? (
            <TouchableOpacity
              activeOpacity={1}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              onPress={() => openDrawer("header-menu-button")}
              style={[
                styles.headerMenuBtn,
                { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border },
              ]}
            >
              <Ionicons name="menu-outline" size={26} color={colors.text} />
            </TouchableOpacity>
          ) : !isGuest ? (
            <TouchableOpacity
              activeOpacity={1}
              testID="profile-report-button"
              accessibilityLabel="profile-report-button"
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              onPress={openReportModal}
              style={[
                styles.headerReportBtn,
                { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border },
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : null}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Profile Header */}
          <View style={styles.headerProfile}>
            <View style={styles.avatarWrapper}>
              <View
                style={[
                  styles.avatarContainer,
                  { borderColor: colors.surface },
                ]}
              >
                <Image source={DEFAULT_AVATAR} style={styles.avatarImage} resizeMode="cover" />
                {profileAvatarUrl ? (
                  <CachedImage
                    uri={profileAvatarUrl}
                    style={[styles.avatarImage, styles.avatarImageOverlay]}
                    contentFit="cover"
                    transition={120}
                    width={240}
                    height={240}
                    disableRecyclingKey
                  />
                ) : null}
              </View>

              {isOwner && (
                <TouchableOpacity activeOpacity={1}
                  onPress={() => router.push("/edit_profile")}
                  style={[
                    styles.editIconBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="pencil" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.nameText, { color: colors.text }]}>
              {profile?.full_name || "User"}
            </Text>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>
              {formatProfileRoleHeadline(profile)}{" "}
              {"\u2022"} {profile?.location || "Unknown"}
            </Text>

            {canFollowProfile ? (
              <TouchableOpacity
                activeOpacity={1}
                disabled={isProfileFollowBusy}
                onPress={() => void handleProfileFollowToggle()}
                style={[
                  styles.profileFollowBtn,
                  {
                    backgroundColor: isProfileFollowing ? (isDark ? "#111827" : "#FFFFFF") : colors.primary,
                    borderColor: isProfileFollowing ? (isDark ? "#374151" : "#CBD5E1") : colors.primary,
                    opacity: isProfileFollowBusy ? 0.7 : 1,
                  },
                ]}
              >
                {isProfileFollowBusy ? (
                  <ActivityIndicator size="small" color={isProfileFollowing ? colors.textSecondary : "#FFFFFF"} />
                ) : (
                  <Text
                    style={[
                      styles.profileFollowBtnText,
                      { color: isProfileFollowing ? colors.textSecondary : "#FFFFFF" },
                    ]}
                  >
                    {isProfileFollowing ? "Following" : "Follow"}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}

            {(profileSkillTags.length > 0 || profileGenreTags.length > 0) && (
              <View style={styles.profileTagsSection}>
                {profileSkillTags.length > 0 ? (
                  <View style={styles.profileTagGroup}>
                    <Text style={[styles.profileTagLabel, { color: colors.textSecondary }]}>
                      {profileSkillLabel}
                    </Text>
                    <View style={styles.profileTagRow}>
                      {profileSkillTags.map((skill) => (
                        <View
                          key={skill}
                          style={[
                            styles.genreTag,
                            { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
                          ]}
                        >
                          <Text style={[styles.genreText, { color: colors.text }]}>
                            {skill}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {profileGenreTags.length > 0 ? (
                  <View style={styles.profileTagGroup}>
                    <Text style={[styles.profileTagLabel, { color: colors.textSecondary }]}>
                      Genres
                    </Text>
                    <View style={styles.profileTagRow}>
                      {profileGenreTags.map((genre) => (
                        <View
                          key={genre}
                          style={[
                            styles.genreTag,
                            { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
                          ]}
                        >
                          <Text style={[styles.genreText, { color: colors.text }]}>
                            {genre}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            )}

            {isOwner && profile?.role === "musician" && supportsGigVisibilityPreference && (
              <View
                style={[
                  styles.gigVisibilityCard,
                  { backgroundColor: isDark ? "#1E293B" : "#F8FAFC", borderColor: colors.border },
                ]}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.gigVisibilityTitle, { color: colors.text }]}>
                    Show gig status on my profile and cards
                  </Text>
                  <Text style={[styles.gigVisibilitySubtitle, { color: colors.textSecondary }]}>
                    Displays Active, Upcoming, and Done gigs to other users.
                  </Text>
                </View>
                <Switch
                  value={profile?.show_gig_statuses !== false}
                  onValueChange={handleToggleGigVisibility}
                  disabled={updatingGigVisibility}
                  trackColor={{ false: isDark ? "#374151" : "#E2E8F0", true: colors.primary + "80" }}
                  thumbColor={profile?.show_gig_statuses !== false ? colors.primary : isDark ? "#9CA3AF" : "#CBD5E1"}
                />
              </View>
            )}

            {/* Bio Section */}
            {profile?.bio && (
              <View style={styles.bioContainer}>
                <Text style={[styles.bioText, { color: colors.text }]}>
                  {profile.bio}
                </Text>
              </View>
            )}

            <View style={styles.statsContainer}>
              {!shouldHideProfessionalProfileStats && (
                <>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      {profile?.rating
                        ? `${Math.round(profile.rating * 20)}%`
                        : "N/A"}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.textSecondary }]}
                    >
                      Rating
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statValue, { color: colors.text }]}>
                      {formatProfileCompletionRate(profile?.completion_rate)}
                    </Text>
                    <Text
                      style={[styles.statLabel, { color: colors.textSecondary }]}
                    >
                      Completion
                    </Text>
                  </View>
                </>
              )}
              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityRole="button"
                onPress={() => openFollowListModal("followers")}
                style={styles.statItem}
              >
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profileFollowerCount}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Followers
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityRole="button"
                onPress={() => openFollowListModal("following")}
                style={styles.statItem}
              >
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profileFollowingCount}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Following
                </Text>
              </TouchableOpacity>
            </View>

            {/* TAB NAVIGATION */}
            <SlidingTabBar
              activeKey={activeTab}
              borderColor={isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)"}
              iconSize={22}
              indicatorWidthRatio={0.22}
              onChange={handleProfileTabChange}
              showTopBorder
              tabs={profileTabs}
            />

            <SmoothTabTransition
              activeKey={activeTab}
              activeIndex={profileActiveTabIndex}
              style={styles.profileTabTransition}
            >
              {/* TAB CONTENT: GIGS */}
              {activeTab === "gigs" && profile?.role === "musician" && profile?.show_gig_statuses !== false && (
                <View style={styles.gigTimelineSection}>
                <View
                  style={[
                    styles.gigSearchWrap,
                    { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                  ]}
                >
                  <Ionicons name="search" size={20} color={colors.textSecondary} />
                  <TextInput
                    value={gigSearchQuery}
                    onChangeText={setGigSearchQuery}
                    placeholder="Search gigs by name, location, or performer"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.gigSearchInput, { color: colors.text }]}
                  />
                </View>

                {([
                  { key: "active", label: "Active", color: "#10B981", icon: "flash-outline" },
                  { key: "upcoming", label: "Upcoming", color: "#3B82F6", icon: "calendar-outline" },
                  { key: "done", label: "Done", color: "#6B7280", icon: "checkmark-done-outline" },
                ] as const).map((section) => (
                  <View key={section.key} style={styles.gigTimelineBlock}>
                    <View style={styles.gigSectionHeader}>
                      <Ionicons name={section.icon as any} size={15} color={section.color} />
                      <Text style={[styles.gigSectionTitle, { color: colors.text }]}> 
                        {section.label} Gigs ({filteredGigTimeline[section.key].length})
                      </Text>
                    </View>

                    {filteredGigTimeline[section.key].length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.gigHorizontalList}
                        decelerationRate="fast"
                        nestedScrollEnabled
                        directionalLockEnabled
                        scrollEnabled
                        keyboardShouldPersistTaps="handled"
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                      >
                        {filteredGigTimeline[section.key].map((gig: any) => (
                          <View key={gig.id} style={[styles.gigTimelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={styles.gigCardTopRow}>
                              <Text style={[styles.gigCardTitle, { color: colors.text }]} numberOfLines={1}>{gig.name || "Untitled Gig"}</Text>
                              <View style={[styles.gigStatusBadge, { backgroundColor: `${section.color}20` }]}>
                                <Text style={[styles.gigStatusBadgeText, { color: section.color }]}>{section.label.toUpperCase()}</Text>
                              </View>
                            </View>
                            <Text style={[styles.gigCardMeta, { color: colors.textSecondary }]}>{gig.performer_label}</Text>
                            <Text style={[styles.gigCardMeta, { color: colors.textSecondary }]}> 
                              {gig.event_date
                                ? new Date(gig.event_date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                                : "Date TBA"}
                              {" \u2022 "}
                              {gig.location || "Location TBA"}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={[styles.gigTimelineEmpty, { borderColor: colors.border, backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}>
                        <Text style={[styles.gigTimelineEmptyText, { color: colors.textSecondary }]}>No {section.label.toLowerCase()} gigs found.</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              )}

              {/* TAB CONTENT: BOOKMARKS */}
              {activeTab === "bookmarks" && isOwner && !isGuest && (
                <View style={styles.bookmarkSection}>
                {loadingBookmarks ? (
                  <View style={[styles.bookmarkEmptyState, { borderColor: colors.border, backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}>
                    <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>Loading saved bookmarks...</Text>
                  </View>
                ) : (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 12, flexGrow: 0 }} style={{ maxHeight: 60, marginBottom: 8 }}>
                       {['all', 'studios', 'gigs', 'artists', 'groups', 'production'].map((key) => {
                          const isActive = bookmarkFilter === key;
                          return (
                            <TouchableOpacity activeOpacity={1} key={key} onPress={() => setBookmarkFilter(key as any)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isActive ? colors.primary : isDark ? "#1E293B" : "#F3F4F6", justifyContent: "center" }}>
                               <Text style={{ color: isActive ? "#fff" : colors.textSecondary, fontFamily: "Poppins_500Medium" }}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                            </TouchableOpacity>
                          )
                       })}
                    </ScrollView>

                    <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 24 }}>
                      {(() => {
                         const filterToKey: any = { 'studios': 'studios', 'gigs': 'gigs', 'artists': 'artists', 'groups': 'groups', 'production': 'production' };
                         let displayedItems: any[] = [];
                         if (bookmarkFilter === "all") {
                           displayedItems = [
                             ...safeBookmarkedListings.studios,
                             ...safeBookmarkedListings.gigs,
                             ...safeBookmarkedListings.artists,
                             ...safeBookmarkedListings.groups,
                             ...safeBookmarkedListings.production,
                           ];
                         } else {
                            displayedItems = safeBookmarkedListings[filterToKey[bookmarkFilter] as keyof typeof safeBookmarkedListings] || [];
                         }

                         if (displayedItems.length === 0) {
                            return (
                               <View style={[styles.bookmarkEmptyState, { borderColor: colors.border, backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}>
                                 <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>No bookmarks found.</Text>
                               </View>
                            )
                         }

                         return displayedItems.map((item, index) => {
                             let icon = item.type === "Studio"
                               ? "business-outline"
                               : item.type === "Gig"
                                 ? "mic-outline"
                                 : item.type === "Artist"
                                   ? "person-outline"
                                 : item.type === "Production Team"
                                   ? "people-circle-outline"
                                   : "people-outline";

                             return (
                                <TouchableOpacity
                                  key={`${item.type}-${item.id}-${index}`}
                                  activeOpacity={1}
                                  onPress={() => openBookmarkedListing(item)}
                                  style={[
                                    styles.bookmarkCard,
                                    { backgroundColor: colors.surface, borderColor: colors.border, width: "100%", flexDirection: "row", padding: 12, gap: 12 },
                                  ]}
                                >
                                  {item.image ? (
                                    <Image source={{ uri: item.image }} style={[styles.bookmarkCardImage, { width: 64, height: 64 }]} />
                                  ) : (
                                    <View style={[styles.bookmarkCardImageFallback, { backgroundColor: isDark ? "#1E293B" : "#F3F4F6", width: 64, height: 64 }]}>
                                      <Ionicons name={icon as any} size={24} color={colors.textSecondary} />
                                    </View>
                                  )}

                                  <View style={{ flex: 1, justifyContent: "center" }}>
                                      <Text numberOfLines={1} style={[styles.bookmarkCardTitle, { color: colors.text, fontSize: 16 }]}>
                                        {item.name}
                                      </Text>
                                      <Text numberOfLines={1} style={[styles.bookmarkCardSubtitle, { color: colors.textSecondary }]}>
                                        {item.subtitle}
                                      </Text>
                                      <Text style={[styles.bookmarkCardTitle, { color: colors.primary, fontSize: 12, marginTop: 4, fontFamily: "Poppins_600SemiBold" }]}>
                                        {item.type}
                                      </Text>
                                  </View>
                                  <View style={{ justifyContent: "center" }}>
                                       <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                                  </View>
                                </TouchableOpacity>
                             )
                         })
                      })()}
                    </View>
                  </>
                )}
              </View>
              )}

              {/* TAB CONTENT: PLAYLISTS */}
              {activeTab === "playlists" && !isProfileFan && (
                <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Poppins_600SemiBold", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Playlists
                    </Text>
                    {stationSlotCount > 0 && (
                      <View style={{ backgroundColor: "#22C55E20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                        <Text style={{ fontSize: 10, fontFamily: "Poppins_600SemiBold", color: "#22C55E" }}>
                          {stationSlotCount} on air
                        </Text>
                      </View>
                    )}
                  </View>

                  {isOwner && !isGuest && (
                    <TouchableOpacity
                      activeOpacity={1}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: colors.primary,
                      }}
                      onPress={openCreatePlaylist}
                    >
                      <Ionicons name="add" size={14} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>New Playlist</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 14, lineHeight: 17 }}>
                  {playlistSectionHint}
                </Text>

                {loadingStation ? (
                  <View style={{ gap: 10, marginBottom: 16 }}>
                    <Skeleton width={SCREEN_WIDTH - 32} height={148} style={{ borderRadius: 18 }} />
                  </View>
                ) : hasStation ? (
                  <View
                    style={{
                      marginBottom: 16,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: stationIsCurrentSource && isPlaying ? colors.primary : colors.border,
                      backgroundColor: stationIsCurrentSource && isPlaying
                        ? (isDark ? "rgba(59,130,246,0.14)" : "rgba(59,130,246,0.08)")
                        : colors.surface,
                      overflow: "hidden",
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={1}
                      disabled={isStationActionLoading}
                      onPress={() => void handleStationPrimaryAction()}
                      style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <View
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            overflow: "hidden",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: stationIsLive ? colors.primary + "18" : (isDark ? "#1E293B" : "#EEF2FF"),
                          }}
                        >
                          {stationArtworkUrl ? (
                            <Image source={{ uri: stationArtworkUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                          ) : (
                            <Ionicons name="radio" size={26} color={stationIsLive ? colors.primary : colors.textSecondary} />
                          )}
                        </View>

                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                            <Text style={{ flexShrink: 1, fontSize: 15, fontFamily: "Poppins_600SemiBold", color: colors.text }} numberOfLines={1}>
                              {stationName}
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 999,
                                backgroundColor: stationIsLive ? "#22C55E20" : (isDark ? "#334155" : "#E2E8F0"),
                              }}
                            >
                              <Text style={{ color: stationIsLive ? "#22C55E" : colors.textSecondary, fontSize: 10, fontFamily: "Poppins_600SemiBold" }}>
                                {stationStatusLabel}
                              </Text>
                            </View>
                          </View>

                          <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: "Poppins_400Regular" }} numberOfLines={1}>
                            {canManageStations ? "Managed station" : `${stationCreatorName}'s radio station`}
                          </Text>

                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }} numberOfLines={1}>
                            {`${stationSlotCount} playlist${stationSlotCount === 1 ? "" : "s"}`}
                            {stationGenre ? ` \u2022 ${stationGenre}` : ""}
                          </Text>
                        </View>

                        {isStationActionLoading ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Ionicons
                            name={canPlayStationFromProfile && stationIsCurrentSource ? (isMuted ? "volume-mute" : "volume-high") : "play-circle"}
                            size={30}
                            color={canPlayStationFromProfile ? colors.primary : colors.textSecondary}
                          />
                        )}
                      </View>

                      <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 17, marginTop: 12 }}>
                        {canPlayStationFromProfile
                          ? "Tap this card to start listening live. Open the station screen anytime for more controls."
                            : canManageStations
                              ? "This station is ready to manage, but it needs at least one playlist on air before listeners can tune in."
                            : "Open the station to browse its queue and live details."}
                      </Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingBottom: 14 }}>
                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={isStationActionLoading}
                        onPress={() => void handleStationPrimaryAction()}
                        style={{
                          flex: 1,
                          minHeight: 42,
                          borderRadius: 12,
                          backgroundColor: canPlayStationFromProfile ? colors.primary : (isDark ? "#1E293B" : "#F3F4F6"),
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          paddingHorizontal: 12,
                        }}
                      >
                        {isStationActionLoading ? (
                          <ActivityIndicator size="small" color={canPlayStationFromProfile ? "#fff" : colors.primary} />
                        ) : (
                          <Ionicons
                            name={canPlayStationFromProfile && stationIsCurrentSource ? (isMuted ? "volume-mute" : "volume-high") : canPlayStationFromProfile ? "radio" : "open-outline"}
                            size={16}
                            color={canPlayStationFromProfile ? "#fff" : colors.text}
                          />
                        )}
                        <Text style={{ color: canPlayStationFromProfile ? "#fff" : colors.text, fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                          {stationPrimaryLabel}
                        </Text>
                      </TouchableOpacity>

                      {canPlayStationFromProfile && (
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={openStationScreen}
                          style={{
                            minWidth: 128,
                            minHeight: 42,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: isDark ? "#0F172A" : "#FFFFFF",
                            alignItems: "center",
                            justifyContent: "center",
                            paddingHorizontal: 12,
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                            {canManageStations ? "Manage Station" : "Open Station"}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ) : isOwner && !isGuest ? (
                  <View
                    style={{
                      marginBottom: 16,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: 16,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.primary + "16",
                        }}
                      >
                        <Ionicons name="radio-outline" size={24} color={colors.primary} />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: "Poppins_600SemiBold", color: colors.text }}>
                          {canManageStations ? "Create your radio station" : "Station managed by admin"}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 17, marginTop: 4 }}>
                          {canManageStations
                            ? "Your station lives above your playlists and lets visitors listen live from your profile."
                            : "Regular users can listen to stations here, but station creation and curation are handled by admins."}
                        </Text>
                      </View>
                    </View>

                    {canManageStations && (
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => router.push("/create_station" as any)}
                        style={{
                          marginTop: 14,
                          minHeight: 42,
                          borderRadius: 12,
                          backgroundColor: colors.primary,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          gap: 8,
                        }}
                      >
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                          Create Station
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : null}

                {loadingPlaylists ? (
                  <View style={{ gap: 10 }}>
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} width={SCREEN_WIDTH - 32} height={72} style={{ borderRadius: 12 }} />
                    ))}
                  </View>
                ) : userPlaylists.length > 0 ? (
                  userPlaylists.map((pl: any) => {
                    const isOnRadio = radioPlaylistIds.has(pl.id);
                    const isToggling = togglingRadio === pl.id;
                    const playlistTrackCount = pl.track_count || pl.item_count || 0;

                    return (
                      <View
                        key={pl.id}
                        style={{
                          padding: 12,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: isOnRadio ? "#22C55E40" : (isDark ? "#334155" : "#E2E8F0"),
                          backgroundColor: isOnRadio ? (isDark ? "#22C55E10" : "#F0FDF4") : colors.surface,
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <TouchableOpacity
                            activeOpacity={1}
                            style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
                            onPress={() => router.push({ pathname: "/playlist_details" as any, params: { playlist_id: pl.id } })}
                          >
                            <View
                              style={{
                                width: 50,
                                height: 50,
                                borderRadius: 14,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: isOnRadio ? "#22C55E20" : colors.primary + "15",
                                marginRight: 12,
                              }}
                            >
                              <Ionicons name={isOnRadio ? "radio" : "musical-notes"} size={20} color={isOnRadio ? "#22C55E" : colors.primary} />
                            </View>

                            <View style={{ flex: 1, minWidth: 0 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <Text style={{ fontSize: 14, fontFamily: "Poppins_600SemiBold", color: colors.text, flexShrink: 1 }} numberOfLines={1}>
                                  {pl.title}
                                </Text>
                                {isOnRadio && (
                                  <View style={{
                                    backgroundColor: "#22C55E",
                                    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
                                  }}>
                                    <Text style={{ fontSize: 9, fontFamily: "Poppins_600SemiBold", color: "#fff" }}>ON AIR</Text>
                                  </View>
                                )}
                              </View>

                              {pl.genre && (
                                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{pl.genre}</Text>
                              )}

                              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                                {playlistTrackCount} track{playlistTrackCount !== 1 ? "s" : ""} {"\u2022"} {pl.visibility === "private" ? "Private" : "Public"}
                              </Text>
                            </View>

                            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} style={{ marginLeft: 10 }} />
                          </TouchableOpacity>

                          {canManageStations && (
                            <TouchableOpacity
                              activeOpacity={1}
                              style={{
                                minWidth: 96,
                                minHeight: 36,
                                borderRadius: 999,
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: isOnRadio ? "#22C55E20" : (isDark ? "#334155" : "#F1F5F9"),
                                marginLeft: 8,
                                paddingHorizontal: 12,
                              }}
                              onPress={() => handleToggleRadio(pl.id)}
                              disabled={isToggling}
                            >
                              {isToggling ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                              ) : (
                                <Text
                                  style={{
                                    color: isOnRadio ? "#22C55E" : colors.textSecondary,
                                    fontSize: 11,
                                    fontFamily: "Poppins_600SemiBold",
                                  }}
                                >
                                  {isOnRadio ? "On Radio" : "Add to Radio"}
                                </Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>

                        {isOwner && !isGuest && (
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, paddingLeft: 62 }}>
                            <TouchableOpacity
                              activeOpacity={1}
                              hitSlop={8}
                              onPress={() => promptDeletePlaylist(pl)}
                              disabled={playlistActionId === pl.id || authLoading}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 999,
                                backgroundColor: isDark ? "rgba(239,68,68,0.16)" : "#FEE2E2",
                                opacity: playlistActionId === pl.id || authLoading ? 0.6 : 1,
                              }}
                            >
                              {playlistActionId === pl.id ? (
                                <ActivityIndicator size="small" color="#EF4444" />
                              ) : (
                                <Ionicons name="trash-outline" size={14} color="#EF4444" />
                              )}
                              <Text
                                style={{
                                  color: "#EF4444",
                                  fontSize: 11,
                                  lineHeight: 14,
                                  fontFamily: "Poppins_600SemiBold",
                                  includeFontPadding: false,
                                  textAlignVertical: "center",
                                }}
                              >
                                {playlistActionId === pl.id ? "Deleting..." : "Delete Playlist"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                      </View>
                    );
                  })
                ) : (
                  <View
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: 188,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      paddingHorizontal: 20,
                      paddingVertical: 24,
                    }}
                  >
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 18,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark ? "#1E293B" : "#F1F5F9",
                      }}
                    >
                      <Ionicons name="musical-notes-outline" size={24} color={colors.textSecondary} />
                    </View>

                    <Text style={{ color: colors.text, fontSize: 15, fontFamily: "Poppins_600SemiBold", textAlign: "center", marginTop: 14 }}>
                      {isOwner && !isGuest ? "No playlists yet" : "No playlists to show"}
                    </Text>

                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 18, marginTop: 6 }}>
                      {isOwner && !isGuest
                        ? "Your playlists will appear here once they are added to your profile."
                        : "This profile has not shared any playlists yet."}
                    </Text>
                  </View>
                )}
              </View>
              )}

              {/* TAB CONTENT: POSTS */}
              {activeTab === "posts" && (
                <View style={styles.profileTabContent}>
                  <View style={[styles.profilePostsSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.profilePostsHeader}>
                      <Text style={[styles.profilePostsTitle, { color: colors.text }]}>Posts</Text>
                      {loadingProfilePosts ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                    </View>
                    {!loadingProfilePosts && profilePosts.length === 0 ? (
                      <Text style={[styles.profilePostsEmpty, { color: colors.textSecondary }]}>
                        {isOwner ? "Your posts will appear here." : "No posts to show yet."}
                      </Text>
                    ) : (
                      profilePosts.map((post) => {
                        const hasVideoMedia = post.media?.some((item: any) => ["video", "teaser_clip"].includes(item.media_type));

                        return (
                          <TouchableOpacity
                            key={post.id}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                            onPress={() => openProfilePost(post)}
                            style={[styles.profilePostCard, { borderColor: colors.border }]}
                          >
                            {post.preview_url ? (
                              <View style={styles.profilePostPreviewWrap}>
                                <CachedImage uri={post.preview_url} style={styles.profilePostPreview} width={84} height={84} />
                                {hasVideoMedia ? (
                                  <View style={styles.profilePostVideoBadge}>
                                    <Ionicons name="play" size={12} color="#FFFFFF" />
                                  </View>
                                ) : null}
                              </View>
                            ) : (
                              <View style={[styles.profilePostPreviewFallback, { backgroundColor: isDark ? "#0F172A" : "#F1F5F9" }]}>
                                <Ionicons name="newspaper-outline" size={24} color={colors.textSecondary} />
                              </View>
                            )}
                            <View style={styles.profilePostBody}>
                              <Text style={[styles.profilePostText, { color: colors.text }]} numberOfLines={3}>
                                {post.body || "Media post"}
                              </Text>
                              <View style={styles.profilePostMetaRow}>
                                <Text style={[styles.profilePostMeta, { color: colors.textSecondary }]}>
                                  {new Date(post.created_at).toLocaleDateString()}
                                </Text>
                                <Text style={[styles.profilePostMeta, { color: colors.textSecondary }]}>
                                  {Number(post.reaction_count || 0)} likes
                                </Text>
                                <Text style={[styles.profilePostMeta, { color: colors.textSecondary }]}>
                                  {Number(post.comment_count || 0)} comments
                                </Text>
                              </View>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} style={styles.profilePostOpenIcon} />
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>
              )}

              {/* TAB CONTENT: ABOUT/MEDIA */}
              {activeTab === "about" && (
                <View style={styles.profileTabContent}>
                <View
                  style={[
                    styles.mediaSectionTikTok,
                    { backgroundColor: colors.background, marginTop: 12 },
                  ]}
                >
                  <View style={styles.mediaGridTikTok}>
                    {isOwner && (
                      <TouchableOpacity
                        style={[
                          styles.gridItemTikTok,
                          {
                            backgroundColor: isDark ? "#1E293B" : "#F3F4F6",
                            alignItems: "center",
                            justifyContent: "center",
                          },
                        ]}
                        onPress={addMediaToPortfolio}
                        disabled={uploading}
                        activeOpacity={1}
                      >
                        <Ionicons
                          name={uploading ? "cloud-upload-outline" : "add"}
                          size={32}
                          color={colors.primary}
                        />
                        <Text style={{ fontSize: 12, color: colors.primary, marginTop: 4, fontFamily: "Poppins_500Medium" }}>
                          {uploading ? "Uploading..." : "Upload"}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {(profile?.portfolio_urls || []).map((url: string, i: number) => {
                      const mediaType = getProfileMediaType(url);
                      const isVideoItem = mediaType === "video";
                      const isDocumentItem = mediaType === "document";

                      return (
                        <TouchableOpacity
                          key={url}
                          style={[styles.gridItemTikTok, { borderColor: colors.border }]}
                          onPress={() => openMediaViewer(url)}
                          activeOpacity={1}
                        >
                          {isVideoItem ? (
                            <ProfileVideoThumbnail
                              uri={url}
                              isDark={isDark}
                              imageStyle={styles.gridImage}
                              placeholderStyle={styles.gridVideoPlaceholder}
                            />
                          ) : isDocumentItem ? (
                            <View
                              style={[
                                styles.gridDocumentPlaceholder,
                                { backgroundColor: isDark ? "#0F172A" : "#E2E8F0" },
                              ]}
                            >
                              <Ionicons name="document-text" size={30} color={colors.primary} />
                              <Text style={[styles.gridDocumentExtension, { color: colors.text }]}>
                                {getPortfolioUrlExtension(url)}
                              </Text>
                            </View>
                          ) : (
                            <Image
                              source={{ uri: url }}
                              style={styles.gridImage}
                              resizeMode="cover"
                            />
                          )}

                          <View style={styles.gridMeta}>
                            <View style={styles.mediaTypePill}>
                              <Ionicons
                                name={isDocumentItem ? "document-text" : isVideoItem ? "videocam" : "image"}
                                size={10}
                                color="#fff"
                              />
                              <Text style={styles.mediaTypeText}>
                                {isDocumentItem ? "Document" : isVideoItem ? "Video" : "Photo"}
                              </Text>
                            </View>
                          </View>

                          {isOwner && (
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={(event: any) => {
                                event?.stopPropagation?.();
                                confirmRemoveMedia(url);
                              }}
                              style={styles.mediaRemoveBtn}
                            >
                              <Ionicons name="trash-outline" size={14} color="#fff" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
              )}
            </SmoothTabTransition>

          </View>

          <InAppMediaViewer
            visible={mediaModalVisible}
            uri={selectedMedia}
            onClose={() => {
              setMediaModalVisible(false);
              setSelectedMedia(null);
            }}
          />
          <Modal
            visible={uploading}
            transparent={true}
            animationType="fade"
            hardwareAccelerated
            statusBarTranslucent
          >
            <View style={styles.uploadLoadingOverlay}>
              <View style={[styles.uploadLoadingCard, { backgroundColor: colors.surface }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.uploadLoadingTitle, { color: colors.text }]}>
                  {uploadMessage}
                </Text>
                <Text style={[styles.uploadLoadingSubtitle, { color: colors.textSecondary }]}>
                  Please wait while your photo, video, or document is checked and uploaded.
                </Text>
              </View>
            </View>
          </Modal>
        </ScrollView>
        {!isDrawerMounted ? <Navbar /> : null}
        {isOwner && !isDrawerMounted ? (
          <GestureDetector gesture={drawerEdgeGesture}>
            <View style={drawerEdgeGestureStyle} />
          </GestureDetector>
        ) : null}
      </View>

      <Modal
        visible={isDrawerMounted}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        hardwareAccelerated
        animationType="none"
        onRequestClose={() => closeDrawer("hardware-back")}
      >
        {isDrawerMounted ? (
          <View style={styles.drawerOverlay}>
          <Animated.View
            pointerEvents="none"
            style={[styles.drawerScrim, drawerScrimAnimatedStyle]}
          />
          <View pointerEvents="auto" style={styles.drawerBackdrop}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.drawerBackdropTouchTarget}
              onPress={() => closeDrawer("drawer-backdrop")}
            />
          </View>
          <GestureDetector gesture={drawerPanGesture}>
            <Animated.View
              style={[
                styles.drawerContent,
                { backgroundColor: colors.background, borderLeftColor: colors.border },
                drawerAnimatedStyle,
              ]}
            >
            {/* Drawer top — avatar + name */}
            <View style={[styles.drawerTop, { borderBottomColor: colors.border }]}>
              <View style={styles.drawerAvatar}>
                <Image source={DEFAULT_AVATAR} style={styles.drawerAvatarImage} resizeMode="cover" />
                {profileAvatarUrl ? (
                  <CachedImage
                    uri={profileAvatarUrl}
                    style={[styles.drawerAvatarImage, styles.avatarImageOverlay]}
                    contentFit="cover"
                    transition={120}
                    width={88}
                    height={88}
                    disableRecyclingKey
                  />
                ) : null}
              </View>
              <View style={styles.drawerTopInfo}>
                <Text style={[styles.drawerName, { color: colors.text }]} numberOfLines={1}>
                  {profile?.full_name || profile?.name || "Profile"}
                </Text>
                <Text style={[styles.drawerRole, { color: colors.textSecondary }]}>
                  {profile?.role ? profile.role.replace("-", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : ""}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={1} onPress={() => closeDrawer("drawer-close-button")} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={styles.drawerMenuList}>
                {isOwner ? (
                  MENU_ITEMS.map((item) => (
                    <TouchableOpacity
                      activeOpacity={1}
                      key={item.label}
                      onPress={() => {
                        closeDrawer(`menu-item:${item.route}`);
                        setTimeout(() => router.push(item.route as any), DRAWER_NAVIGATION_DELAY_MS);
                      }}
                      style={[styles.drawerMenuItem, { borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}
                    >
                      <View style={[styles.drawerMenuIcon, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
                        <Ionicons name={item.icon as any} size={19} color={colors.primary} />
                      </View>
                      <Text style={[styles.drawerMenuLabel, { color: colors.text }]}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))
                ) : null}
              </View>
            </ScrollView>
            </Animated.View>
          </GestureDetector>
          </View>
        ) : null}
      </Modal>

      <TrackedBottomSheetModal
        ref={followListSheetRef}
        overlayLabel="ProfileFollowListSheet"
        index={0}
        snapPoints={followListSnapPoints}
        animationConfigs={followListAnimationConfigs}
        animateOnMount
        enableDynamicSizing={false}
        enableOverDrag={false}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.4}
          />
        )}
        onDismiss={() => setFollowListModal(null)}
        backgroundStyle={{
          backgroundColor: colors.background,
          borderRadius: 32,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? "#4B5563" : "#E5E7EB",
          width: 40,
          marginTop: 10,
        }}
      >
        <View style={styles.followModalSheetContent}>
          <View style={styles.followModalHeader}>
            <View>
              <Text style={[styles.followModalTitle, { color: colors.text }]}>
                {followListTitle}
              </Text>
              <Text style={[styles.followModalCount, { color: colors.textSecondary }]}>
                {followListCount} {followListCount === 1 ? "user" : "users"}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={closeFollowListModal}
              style={[styles.followModalCloseBtn, { backgroundColor: isDark ? "#111827" : "#F8FAFC" }]}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loadingProfileFollowers ? (
            <View style={styles.followModalState}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.followersEmptyText, { color: colors.textSecondary }]}>
                Loading {followListTitle.toLowerCase()}...
              </Text>
            </View>
          ) : followListItems.length > 0 ? (
            <BottomSheetScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.followModalList}
            >
              {followListItems.map((item) => (
                <TouchableOpacity
                  key={`${item.target_type}-${item.id}`}
                  activeOpacity={0.86}
                  onPress={() => openFollowListItem(item)}
                  style={[
                    styles.followerRow,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <View style={[styles.followerAvatar, { backgroundColor: isDark ? "#1E293B" : "#EEF2FF" }]}>
                    {item.avatar_url ? (
                      <CachedImage
                        uri={item.avatar_url}
                        style={styles.followerAvatarImage}
                        contentFit="cover"
                        transition={120}
                        width={88}
                        height={88}
                        disableRecyclingKey
                      />
                    ) : (
                      <Ionicons
                        name={item.target_type === "group" ? "people" : "person"}
                        size={20}
                        color={colors.textSecondary}
                      />
                    )}
                  </View>
                  <View style={styles.followerInfo}>
                    <Text style={[styles.followerName, { color: colors.text }]} numberOfLines={1}>
                      {item.full_name}
                    </Text>
                    <Text style={[styles.followerRole, { color: colors.textSecondary }]} numberOfLines={1}>
                      {formatFollowerRole(item.role)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </BottomSheetScrollView>
          ) : (
            <View style={styles.followModalState}>
              <Text style={[styles.followersEmptyText, { color: colors.textSecondary }]}>
                {followListEmptyText}
              </Text>
            </View>
          )}
        </View>
      </TrackedBottomSheetModal>

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        forceModal={alertConfig.forceModal}
        onClose={() => setAlertVisible(false)}
      />
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitProfileReport}
        targetName={profile?.full_name || profile?.name || 'this user'}
        title="Report User"
        reportType="profile"
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  profileSkeletonScrollContent: {
    paddingBottom: 220,
  },
  profileSkeletonHeader: {
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: "center",
  },
  profileSkeletonTagRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
  },
  profileSkeletonStatsRow: {
    width: "100%",
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  profileSkeletonSection: {
    marginTop: 20,
    paddingHorizontal: 24,
    gap: 12,
  },
  profileSkeletonMediaGrid: {
    marginTop: 24,
    paddingHorizontal: SECTION_SIDE_MARGIN + GRID_PADDING,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },
  profileSkeletonMediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
  },
  scrollContent: {
    paddingBottom: 220,
  },
  headerProfile: {
    paddingHorizontal: PROFILE_CONTENT_HORIZONTAL_PADDING,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  editIconBtn: {
    position: "absolute",
    bottom: 16,
    right: 0,
    padding: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nameText: {
    fontSize: 24,
    marginBottom: 4,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
  },
  roleText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  profileFollowBtn: {
    minWidth: 132,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  profileFollowBtnText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  genreRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 28,
  },
  profileTagsSection: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  profileTagGroup: {
    width: "100%",
    alignItems: "center",
    gap: 8,
  },
  profileTagLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
  },
  profileTagRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  genreTag: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  genreText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  gigVisibilityCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  gigVisibilityTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  gigVisibilitySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
    marginBottom: 16,
    gap: 12,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
    textAlign: "center",
  },
  followersSection: {
    width: "100%",
    marginBottom: 16,
  },
  followersHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  followersTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  followersCountLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  followersList: {
    width: "100%",
    gap: 8,
  },
  followersLoadingRow: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  followersEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  followerRow: {
    width: "100%",
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  followerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  followerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  followerInfo: {
    flex: 1,
    minWidth: 0,
  },
  followerName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  followerRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  followModalSheetContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  followModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  followModalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
  },
  followModalCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  followModalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  followModalList: {
    gap: 8,
    paddingBottom: 28,
  },
  followModalState: {
    flex: 1,
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  statDivider: {
    display: "none",
  },
  bioContainer: {
    paddingHorizontal: 32,
    marginBottom: 20,
    alignItems: "center",
  },
  bioText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  tabContainer: {
    flexDirection: "row",
    width: "100%",
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  tabText: {
    fontSize: 12,
    marginTop: 4,
  },
  profileTabContent: {
    width: "100%",
  },
  profileTabTransition: {
    width: "100%",
  },
  gigTimelineSection: {
    width: "100%",
    marginTop: 14,
    gap: 14,
  },
  gigSearchWrap: {
    width: "100%",
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gigSearchInput: {
    flex: 1,
    height: 24,
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
    padding: 0,
    textAlignVertical: "center",
  },
  gigTimelineBlock: {
    gap: 8,
  },
  gigHorizontalList: {
    paddingRight: 8,
    gap: 10,
  },
  gigSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gigSectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  gigTimelineCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 4,
    width: 280,
  },
  gigCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  gigCardTitle: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  gigStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gigStatusBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  gigCardMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  gigTimelineEmpty: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  gigTimelineEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  gigHiddenText: {
    marginTop: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  bookmarkSection: {
    width: "100%",
    marginTop: 18,
    gap: 14,
  },
  bookmarkBlock: {
    gap: 8,
  },
  bookmarkBlockTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  bookmarkHorizontalList: {
    paddingRight: 8,
    gap: 10,
  },
  bookmarkCard: {
    width: 170,
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    gap: 6,
  },
  bookmarkCardImage: {
    width: "100%",
    height: 88,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  bookmarkCardImageFallback: {
    width: "100%",
    height: 88,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bookmarkCardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  bookmarkCardSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  bookmarkEmptyState: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bookmarkEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  menuContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  menuItem: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 12,
    gap: 16,
  },
  menuTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
  guestHintText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
    flexShrink: 1,
    lineHeight: 18,
  },
  mediaSectionTikTok: {
    width: "100%",
    alignSelf: "stretch",
    alignItems: "flex-start",
    marginTop: 8,
    marginBottom: 0,
    marginHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    borderWidth: 0,
    borderRadius: 0,
  },
  mediaSectionHeaderTikTok: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16, // Keep padding just for the header
    marginBottom: 12,
  },
  mediaSection: {
    marginTop: 24,
    marginBottom: 12,
    marginHorizontal: SECTION_SIDE_MARGIN,
    paddingTop: 18,
    paddingBottom: 20,
    borderWidth: 1,
    borderRadius: 24,
  },
  mediaSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: GRID_PADDING,
    marginBottom: 18,
  },
  mediaSectionHeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mediaSectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaSectionTextWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  mediaSectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mediaCountBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaCountBadgeText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  addMediaBtn: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  addMediaBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    marginHorizontal: GRID_PADDING,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 20,
  },
  emptyMediaIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMediaText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
  emptyMediaSubtext: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  uploadBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  uploadBtnText: {
    fontFamily: "Poppins_500Medium",
    color: "#fff",
    fontSize: 14,
  },
  mediaGridTikTok: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    alignContent: "flex-start",
    gap: TIKTOK_GRID_GAP,
    paddingHorizontal: 0,
    paddingBottom: 40, // some bottom padding
  },
  gridItemTikTok: {
    width: TIKTOK_ITEM_SIZE,
    height: TIKTOK_ITEM_SIZE,
    position: "relative",
    borderWidth: 0,
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 4,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a1a",
  },
  gridVideoThumbnail: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  gridVideoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  gridVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  gridVideoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  gridVideoPlayBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  gridVideoPlayBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  gridVideoPlaceholderText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },
  gridDocumentPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
  },
  gridDocumentExtension: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  gridMeta: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  mediaTypePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.78)",
  },
  mediaTypeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.92)",
  },
  profilePostsSection: {
    marginTop: 18,
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  profilePostsHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  profilePostsTitle: {
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  profilePostsEmpty: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    paddingVertical: 10,
  },
  profilePostCard: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profilePostPreviewWrap: {
    width: 84,
    height: 84,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0F172A",
  },
  profilePostPreview: {
    width: 84,
    height: 84,
  },
  profilePostPreviewFallback: {
    width: 84,
    height: 84,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  profilePostVideoBadge: {
    position: "absolute",
    left: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.76)",
  },
  profilePostBody: {
    flex: 1,
    minWidth: 0,
  },
  profilePostText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Poppins_500Medium",
  },
  profilePostMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  profilePostMeta: {
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },
  profilePostOpenIcon: {
    marginLeft: "auto",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  modalMedia: {
    width: "100%",
    height: "100%",
  },
  uploadLoadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.52)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  uploadLoadingCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  uploadLoadingTitle: {
    marginTop: 14,
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  uploadLoadingSubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  resumeSection: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  resumeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  resumeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  resumeTitle: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  resumeSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
  },
  // Header button styles
  headerMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerReportBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Drawer styles
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 20000,
    elevation: 20000,
  },
  drawerEdgeGestureArea: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 28,
    zIndex: 900,
    elevation: 900,
    backgroundColor: "transparent",
  },
  drawerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
    zIndex: 1,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  drawerBackdropTouchTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerContent: {
    width: DRAWER_WIDTH,
    maxWidth: "80%" as any,
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 24,
    borderLeftWidth: 1,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: "hidden",
  },
  drawerTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 20,
    borderBottomWidth: 1,
    gap: 12,
  },
  drawerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1E293B",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  drawerTopInfo: {
    flex: 1,
    minWidth: 0,
  },
  drawerName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  drawerRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 1,
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerMenuList: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 2,
  },
  drawerMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  drawerMenuIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerMenuLabel: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
});

