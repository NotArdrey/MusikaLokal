import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
    Platform,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import ReportModal from "../src/components/ReportModal";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { DEFAULT_AVATAR } from "../src/constants/Images";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { screenUploadsWithAi } from "../src/services/uploadSafetyScreen";

const GRID_GAP = 8;
const NUM_COLUMNS = 3;
const GRID_PADDING = 24;
const MAX_INLINE_SCREEN_BYTES = 4 * 1024 * 1024;
const SAFETY_CHECK_TIMEOUT_MS = 6000;
const VIDEO_MEDIA_EXTENSIONS = new Set(["mp4", "mov", "avi", "mkv", "webm", "m4v"]);
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
};

const EMPTY_BOOKMARKS = {
  studios: [] as any[],
  gigs: [] as any[],
  musicians: [] as any[],
};

const logProfileMedia = (event: string, details?: Record<string, unknown>) => {
  console.log(`[ProfileMedia] ${event}`, {
    timestamp: new Date().toISOString(),
    ...(details || {}),
  });
};

const resolveStorageObjectFromPublicUrl = (url: string): { bucket: string; path: string } | null => {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;

  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2].split("?")[0]),
  };
};

const sanitizePortfolioExtension = (value?: string | null): string => {
  const cleaned = (value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned || cleaned === "quicktime") return cleaned === "quicktime" ? "mov" : "";
  if (cleaned === "jpeg") return "jpg";
  return cleaned;
};

const resolvePortfolioFileExtension = (file: ImagePicker.ImagePickerAsset): string => {
  const mimeExt =
    typeof file.mimeType === "string"
      ? PORTFOLIO_EXTENSION_BY_MIME[file.mimeType.trim().toLowerCase()]
      : "";
  const fileName = typeof (file as any)?.fileName === "string" ? (file as any).fileName : "";
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
  file: ImagePicker.ImagePickerAsset,
  fileExt: string,
): string => {
  const pickedMimeType = typeof file.mimeType === "string" ? file.mimeType.trim().toLowerCase() : "";
  if (/^(image|video)\/[a-z0-9.+-]+$/.test(pickedMimeType)) {
    return pickedMimeType;
  }
  return PORTFOLIO_MIME_BY_EXTENSION[fileExt] || "image/jpeg";
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

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read media for safety screening."));
    reader.readAsDataURL(blob);
  });

const getPortfolioSourceBlob = async (file: ImagePicker.ImagePickerAsset): Promise<Blob> => {
  const webFile = (file as any)?.file;
  if (typeof Blob !== "undefined" && webFile instanceof Blob) {
    return webFile;
  }

  const response = await fetch(file.uri);
  if (!response.ok) {
    throw new Error("Could not read media for safety screening.");
  }
  return response.blob();
};

const isPortfolioVideoAsset = (
  file: ImagePicker.ImagePickerAsset,
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

const extractWebVideoFrameDataUrl = (
  sourceBlob: Blob,
  targetTimeSeconds: number,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(sourceBlob);
    const video = document.createElement("video");
    let settled = false;
    const timeoutId = window.setTimeout(
      () => fail("Video preview generation timed out during safety screening."),
      8000,
    );

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const capture = () => {
      if (settled) return;
      const sourceWidth = video.videoWidth || 640;
      const sourceHeight = video.videoHeight || 360;
      const maxDimension = 960;
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        fail("Could not read a video preview frame for safety screening.");
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      settled = true;
      cleanup();
      resolve(
        ensureScreenableDataUrl(
          dataUrl,
          "Could not create a small enough video preview for safety screening.",
        ),
      );
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) {
        capture();
        return;
      }

      try {
        const latestUsefulTime = Math.max(0.05, duration - 0.05);
        video.currentTime = Math.min(Math.max(0.05, targetTimeSeconds), latestUsefulTime);
      } catch {
        capture();
      }
    };
    video.onloadeddata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => fail("Could not read the selected video for safety screening.");
    video.src = objectUrl;
    video.load();
  });

const buildPortfolioVideoFrameDataUrls = async (sourceBlob: Blob): Promise<string[]> => {
  const attempts = await Promise.allSettled(
    [1, 4, 8].map((timeSeconds) => extractWebVideoFrameDataUrl(sourceBlob, timeSeconds)),
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
  file: ImagePicker.ImagePickerAsset,
  options: {
    fileExt: string;
    mimeType: string;
    sourceBlob: Blob;
    size: number;
  },
) => {
  const originalName =
    typeof (file as any)?.fileName === "string"
      ? (file as any).fileName
      : `profile-media.${options.fileExt}`;
  const isVideoUpload = isPortfolioVideoAsset(file, options.mimeType, options.fileExt);

  const screeningSummary = await screenUploadsWithAi(
    isVideoUpload
      ? (await buildPortfolioVideoFrameDataUrls(options.sourceBlob)).map((contentDataUrl, index) => ({
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
              await readBlobAsDataUrl(options.sourceBlob),
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
  asset: ImagePicker.ImagePickerAsset,
  index: number,
): string => {
  const fallbackName = asset.uri.split("/").pop() || `Selected media ${index + 1}`;
  return typeof (asset as any)?.fileName === "string" ? (asset as any).fileName : fallbackName;
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

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && winWidth >= 768;

  const gridContainerWidth = isWebDesktop
    ? Math.min(winWidth, 1120) - GRID_PADDING * 2
    : winWidth - GRID_PADDING * 2;
  const ITEM_SIZE = Math.floor(
    (gridContainerWidth - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS
  );
  const pageBackground = isWebDesktop
    ? isDark
      ? "#0A1224"
      : "#E9EEF8"
    : colors.background;
  const pageCardBackground = isWebDesktop
    ? isDark
      ? "#0F172A"
      : "#FFFFFF"
    : colors.surface;
  const surfaceBackground = isWebDesktop
    ? isDark
      ? "#13213A"
      : "#F4F7FE"
    : isDark
      ? "#1E293B"
      : "#F3F4F6";
  const borderSoft = isWebDesktop
    ? isDark
      ? "#1E2C48"
      : "#D8E3F2"
    : colors.border;
  const { loading: authLoading, userId: currentUserId, isGuest } = useAuth();
  const params = useLocalSearchParams<{
    userId?: string;
    returnToHome?: string;
    returnListingId?: string;
  }>();
  const normalizedParamUserId = Array.isArray(params.userId) ? params.userId[0] : params.userId;

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [gigStats, setGigStats] = useState({ active: 0, upcoming: 0, done: 0 });
  const [gigTimeline, setGigTimeline] = useState<{
    active: any[];
    upcoming: any[];
    done: any[];
  }>({ active: [], upcoming: [], done: [] });
  const [bookmarkedListings, setBookmarkedListings] = useState(EMPTY_BOOKMARKS);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [gigSearchQuery, setGigSearchQuery] = useState("");
  const [updatingGigVisibility, setUpdatingGigVisibility] = useState(false);
  const [supportsGigVisibilityPreference, setSupportsGigVisibilityPreference] = useState(true);
  const [activeTab, setActiveTab] = useState<"about" | "gigs" | "bookmarks">("about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [bookmarkFilter, setBookmarkFilter] = useState<"all" | "studios" | "gigs" | "musicians">("all");

  useEffect(() => {
    if (loading) return;

    console.log("[ProfileMenu][web] Header action eligibility", {
      timestamp: new Date().toISOString(),
      authLoading,
      loading,
      isOwner,
      isGuest,
      isWebDesktop,
      width: winWidth,
      menuButtonVisible: isOwner,
      reportButtonVisible: !isOwner && !isGuest,
      activeTab,
      profileId: profile?.id ?? null,
      currentUserId: currentUserId ?? null,
    });
  }, [activeTab, authLoading, currentUserId, isGuest, isOwner, isWebDesktop, loading, profile?.id, winWidth]);

  useEffect(() => {
    console.log("[ProfileMenu][web] Menu visibility changed", {
      timestamp: new Date().toISOString(),
      isMenuOpen,
      isWebDesktop,
      width: winWidth,
      activeTab,
      profileId: profile?.id ?? null,
    });
  }, [activeTab, isMenuOpen, isWebDesktop, profile?.id, winWidth]);

  const openMenu = useCallback((source: string = "unknown") => {
    console.log("[ProfileMenu][web] Open requested", {
      timestamp: new Date().toISOString(),
      source,
      isOwner,
      isGuest,
      isMenuOpen,
      isWebDesktop,
      width: winWidth,
      activeTab,
      profileId: profile?.id ?? null,
      currentUserId: currentUserId ?? null,
    });

    setIsMenuOpen(true);
  }, [activeTab, currentUserId, isGuest, isMenuOpen, isOwner, isWebDesktop, profile?.id, winWidth]);

  const closeMenu = useCallback((source: string = "unknown") => {
    console.log("[ProfileMenu][web] Close requested", {
      timestamp: new Date().toISOString(),
      source,
      isMenuOpen,
      isWebDesktop,
      width: winWidth,
      activeTab,
      profileId: profile?.id ?? null,
    });

    setIsMenuOpen(false);
  }, [activeTab, isMenuOpen, isWebDesktop, profile?.id, winWidth]);

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

  const resolveBookmarkImage = (entry: any): string | null => {
    if (Array.isArray(entry?.images) && typeof entry.images[0] === "string") {
      return entry.images[0];
    }

    if (typeof entry?.image === "string" && entry.image.trim().length > 0) {
      return entry.image;
    }

    if (typeof entry?.avatar_url === "string" && entry.avatar_url.trim().length > 0) {
      return entry.avatar_url;
    }

    return null;
  };

  const fetchBookmarkedListings = async (
    viewerId: string,
    shouldLoad: boolean,
  ) => {
    if (!shouldLoad) {
      setBookmarkedListings(EMPTY_BOOKMARKS);
      setLoadingBookmarks(false);
      return;
    }

    setLoadingBookmarks(true);

    try {
      const { data: favoritesData, error: favoritesError } = await supabase
        .from("favorites")
        .select("group_id, profile_id, studio_id, gig_id, created_at")
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

      const [groupsResult, profilesResult, studiosResult, gigsResult] = await Promise.all([
        groupIds.length > 0
          ? supabase
            .from("groups_with_stats")
            .select("id, name, location, images, image, genre")
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
            .select("id, name, address, images, image")
            .in("id", studioIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        gigIds.length > 0
          ? supabase
            .from("gigs_with_stats")
            .select("id, name, location, event_date, image, images")
            .in("id", gigIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (groupsResult.error) throw groupsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (studiosResult.error) throw studiosResult.error;
      if (gigsResult.error) throw gigsResult.error;

      const groupById = new Map((groupsResult.data || []).map((entry: any) => [entry.id, entry]));
      const profileById = new Map((profilesResult.data || []).map((entry: any) => [entry.id, entry]));
      const studioById = new Map((studiosResult.data || []).map((entry: any) => [entry.id, entry]));
      const gigById = new Map((gigsResult.data || []).map((entry: any) => [entry.id, entry]));

      const musicians = favorites
        .map((entry: any) => {
          if (entry.profile_id) {
            const artist = profileById.get(entry.profile_id);
            if (!artist) return null;

            return {
              id: artist.id,
              name: artist.full_name || "Unnamed Artist",
              subtitle: artist.location || "Artist",
              image: resolveBookmarkImage(artist),
              type: "Artist",
            };
          }

          if (entry.group_id) {
            const musician = groupById.get(entry.group_id);
            if (!musician) return null;

            return {
              id: musician.id,
              name: musician.name || "Unnamed Musician",
              subtitle: musician.location || musician.genre || "Musician",
              image: resolveBookmarkImage(musician),
              type: "Musician",
            };
          }

          return null;
        })
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

      setBookmarkedListings({
        studios: studios.slice(0, 8),
        gigs: gigs.slice(0, 8),
        musicians: musicians.slice(0, 8),
      });
    } catch (bookmarkError) {
      console.log("Error fetching bookmarks:", bookmarkError);
      setBookmarkedListings(EMPTY_BOOKMARKS);
    } finally {
      setLoadingBookmarks(false);
    }
  };

  // Refresh profile data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchProfile();
      }
    }, [params.userId, authLoading, currentUserId, isGuest]),
  );

  async function fetchProfile() {
    try {
      setLoading(true);
      // Determine target ID: param OR current user
      // Handle case where userId might be an array
      const paramUserId = normalizedParamUserId;
      let resolvedCurrentUserId = currentUserId;

      // Resolve the active user ID from auth when context is temporarily unavailable.
      if (!resolvedCurrentUserId && !isGuest) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.log("❌ Profile - Auth error while resolving current user:", error.message);
        }
        if (user?.id) {
          resolvedCurrentUserId = user.id;
        }
      }

      let targetId = paramUserId || resolvedCurrentUserId;
      console.log("👤 Profile - Param userId:", paramUserId);
      console.log("👤 Profile - Context userId:", currentUserId);
      console.log("👤 Profile - Resolved userId:", resolvedCurrentUserId);

      // If still no targetId, try to get from auth directly
      if (!targetId) {
        console.log("⚠️ Profile - No userId, fetching from auth...");
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.log("❌ Profile - Auth error:", error.message);
        }
        if (user) {
          console.log("✅ Profile - Got user from auth:", user.id);
          targetId = user.id;
        }
      }

      if (!targetId) {
        if (isGuest) {
          setIsOwner(false);
          setGigStats({ active: 0, upcoming: 0, done: 0 });
          setGigTimeline({ active: [], upcoming: [], done: [] });
          setBookmarkedListings(EMPTY_BOOKMARKS);
          setLoadingBookmarks(false);
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

        console.log("❌ Profile - No user ID available, redirecting to login");
        // No user logged in and no userId param - redirect to login
        router.replace("/");
        return;
      }

      console.log("🎯 Profile - Fetching profile for:", targetId);

      // Check ownership
      const ownership = resolvedCurrentUserId && targetId === resolvedCurrentUserId;
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

      const { data: profileStatsData } = await supabase
        .from("profiles_with_stats")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        throw profileError ?? new Error("Profile not found");
      }

      const hasGigVisibilityPreference = Object.prototype.hasOwnProperty.call(
        profileData,
        "show_gig_statuses",
      );
      setSupportsGigVisibilityPreference(hasGigVisibilityPreference);

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

        setGigStats(stats);
        setGigTimeline(timelineBuckets);
      } else {
        setGigStats({ active: 0, upcoming: 0, done: 0 });
        setGigTimeline({ active: [], upcoming: [], done: [] });
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

      setProfile({
        ...(profileStatsData || {}),
        ...profileData,
        skills: (skillsResult.data || []).map((row: any) => row.skill).filter(Boolean),
        genres: (genresResult.data || []).map((row: any) => row.genre).filter(Boolean),
        portfolio_urls: (portfolioResult.data || [])
          .map((row: any) => row.portfolio_url)
          .filter(Boolean),
      });

      await fetchBookmarkedListings(targetId, !!ownership && !isGuest);
    } catch (e) {
      console.log("Error fetching profile:", e);
    } finally {
      setLoading(false);
    }
  }

  const MENU_ITEMS = [
    { label: "Edit Profile", icon: "person-outline", route: "/edit_profile" },
    { label: "Wallet", icon: "wallet-outline", route: "/wallet" },
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
  const uploadingRef = useRef(false);
  const [alertConfig, setAlertConfig] = useState<ProfileAlertConfig>({
    type: "info",
    title: "",
    message: "",
  });

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
      "error",
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
      showAlert("error", "Update Failed", e?.message || "Failed to update gig visibility.");
    } finally {
      setUpdatingGigVisibility(false);
    }
  };

  const handleHeaderBack = useCallback(() => {
    const shouldReturnHome =
      (Array.isArray(params.returnToHome)
        ? params.returnToHome[0]
        : params.returnToHome) === "1";
    const returnListingId = Array.isArray(params.returnListingId)
      ? params.returnListingId[0]
      : params.returnListingId;

    if (shouldReturnHome && returnListingId) {
      void AsyncStorage.setItem("pending_reopen_listing_id", returnListingId)
        .catch(() => { })
        .finally(() => {
          router.back();
        });
      return;
    }

    router.back();
  }, [params.returnListingId, params.returnToHome]);

  const openBookmarkedListing = async (itemId: string) => {
    if (!itemId) return;

    try {
      await AsyncStorage.setItem("pending_reopen_listing_id", itemId);
    } catch {
      // Continue navigation even if cache write fails.
    }

    router.push("/home");
  };

  const submitProfileReport = async (reason: string, details?: string) => {
    if (!currentUserId) {
      showAlert("warning", "Login Required", "You need to be logged in to submit a report.");
      return;
    }
    if (!profile?.id) {
      showAlert("error", "Unable to Report", "Missing profile details.");
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

  // Check if URL is a video
  const isVideo = (url: string) => {
    const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

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
      showAlert("error", "Remove Failed", error?.message || "Failed to remove media.");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const confirmRemoveMedia = (url: string) => {
    showAlert(
      "warning",
      "Remove Media",
      "Remove this photo or video from your profile?",
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

  const addMediaToPortfolio = async () => {
    try {
      logProfileMedia("upload_started");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        logProfileMedia("upload_blocked_no_user");
        showAlert("error", "Error", "You must be logged in.");
        return;
      }

      logProfileMedia("upload_user_resolved", { userId: user.id });

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        logProfileMedia("upload_permission_denied");
        showAlert("warning", "Permission needed", "Please allow access to your photos.");
        return;
      }

      logProfileMedia("picker_opening");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        quality: 0.5,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        logProfileMedia("picker_cancelled");
        return;
      }

      const selectedAssets = result.assets;
      const uploadedUrls: string[] = [];
      const skippedMedia: SkippedProfileMediaFeedback[] = [];
      uploadingRef.current = true;
      setUploading(true);
      setUploadMessage("Preparing media...");

      const { data: lastPortfolioRow, error: portfolioFetchError } = await supabase
        .from("profile_portfolio_urls")
        .select("sort_order")
        .eq("profile_id", user.id)
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
      const fileName = `${user.id}/portfolio/${Date.now()}_${index}.${fileExt}`;
      const mimeType = resolvePortfolioMimeType(file, fileExt);

      logProfileMedia("file_selected", {
        uri: file.uri,
        fileName,
        fileExt,
        mimeType,
        pickerMimeType: file.mimeType,
        pickerType: (file as any)?.type,
        fileSize: (file as any)?.fileSize,
      });

      console.log("📤 Uploading portfolio media...");
      console.log("📍 File URI:", file.uri);
      console.log("📁 File name:", fileName);

      const sourceBlob = await getPortfolioSourceBlob(file);
      logProfileMedia("file_prepared", {
        byteLength: sourceBlob.size,
        blobType: sourceBlob.type,
      });
      setUploadMessage(`Checking media ${index + 1}/${selectedAssets.length}...`);
      logProfileMedia("safety_check_started", {
        fileName,
        mimeType,
        byteLength: sourceBlob.size,
      });
      await withSafetyTimeout(screenProfilePortfolioMedia(file, {
        fileExt,
        mimeType,
        sourceBlob,
        size: sourceBlob.size || Number((file as any)?.fileSize || 0),
      }));
      logProfileMedia("safety_check_passed", { fileName });

      setUploadMessage(`Uploading media ${index + 1}/${selectedAssets.length}...`);
      logProfileMedia("storage_upload_started", {
        bucket: "avatars",
        fileName,
        contentType: mimeType,
      });
      // Create FormData for upload
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: fileName.split("/").pop(),
        type: mimeType,
      } as any);

      // Get Supabase URL and key from the client
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      // Get current session for auth
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || supabaseKey;

      // Upload directly via fetch with FormData
      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/avatars/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-upsert": "true",
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logProfileMedia("storage_upload_failed", {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          errorText,
        });
        console.error("❌ Upload failed:", errorText);
        throw new Error(errorText || "Upload failed");
      }

      logProfileMedia("storage_upload_success", {
        bucket: "avatars",
        path: fileName,
      });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      console.log("✅ Uploaded:", urlData.publicUrl);

      logProfileMedia("public_url_resolved", { publicUrl: urlData.publicUrl });

      const sortOrder = nextSortOrder + uploadedUrls.length;
      const { error: portfolioInsertError } = await supabase
        .from("profile_portfolio_urls")
        .upsert(
          {
            profile_id: user.id,
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
      console.log("Upload error:", e);
      showUploadFeedbackAlert(e);
    } finally {
      logProfileMedia("upload_finished");
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  if (isGuest && !normalizedParamUserId) {
    return (
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
          <Header title="Profile" />
          <GuestSignInGate message="Sign in to view and manage your MusikaLokal profile." />
          <Navbar />
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: pageBackground }]}
      >
        <Text style={{ color: colors.textSecondary }}>Loading profile...</Text>
      </View>
    );
  }

  const portfolioCount = profile?.portfolio_urls?.length ?? 0;
  const mediaSummary =
    portfolioCount > 0
      ? `${portfolioCount} ${portfolioCount === 1 ? "item" : "items"} in ${isOwner ? "your" : "this"} portfolio`
      : isOwner
        ? "Add photos and short clips that show your sound, setup, or stage presence."
        : "No portfolio uploads yet.";

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header
          title={isOwner ? "My Profile" : "User Profile"}
          {...(!isOwner ? { onBackPress: handleHeaderBack } : {})}
          rightComponent={isOwner ? (
            <TouchableOpacity
              activeOpacity={1}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              onPress={() => openMenu("header-menu-button")}
              style={[
                styles.headerMenuBtn,
                { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: borderSoft },
              ]}
            >
              <Ionicons name="menu-outline" size={26} color={colors.text} />
            </TouchableOpacity>
          ) : !isGuest ? (
            <TouchableOpacity
              activeOpacity={1}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              onPress={openReportModal}
              style={[
                styles.headerMenuBtn,
                { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: borderSoft },
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : null}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.scrollContentWeb]}
        >
          {/* Profile Header */}
          <View
            style={[
              styles.headerProfile,
              isWebDesktop && styles.headerProfileWeb,
              isWebDesktop && styles.webSectionCard,
              { backgroundColor: isWebDesktop ? pageCardBackground : "transparent", borderColor: borderSoft },
            ]}
          >
            <View style={styles.avatarWrapper}>
              <View
                style={[
                  styles.avatarContainer,
                  { borderColor: colors.surface },
                ]}
              >
                <Image
                  source={
                    profile?.avatar_url
                      ? { uri: profile.avatar_url }
                      : DEFAULT_AVATAR
                  }
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              </View>

              {isOwner && (
                <TouchableOpacity activeOpacity={1}
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
              {profile?.role === "musician"
                ? profile?.skills?.join(", ") || "Musician"
                : profile?.role === "studio-owner"
                  ? "Studio Owner"
                  : profile?.role === "venue-owner"
                    ? "Venue Owner"
                    : profile?.role
                      ? profile.role.charAt(0).toUpperCase() +
                      profile.role.slice(1)
                      : "User"}{" "}
              • {profile?.location || "Unknown"}
            </Text>

            <View style={styles.genreRow}>
              {(profile?.genres || ["Rock", "Indie"]).map((genre: string) => (
                <View
                  key={genre}
                  style={[
                    styles.genreTag,
                    { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" },
                  ]}
                >
                  <Text
                    style={[styles.genreText, { color: colors.textSecondary }]}
                  >
                    {genre}
                  </Text>
                </View>
              ))}
            </View>

            {isOwner && profile?.role === "musician" && supportsGigVisibilityPreference && (
              <View
                style={[
                  styles.gigVisibilityCard,
                  { backgroundColor: pageCardBackground, borderColor: borderSoft },
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
                  trackColor={{ false: isDark ? "#374151" : "#D1D5DB", true: colors.primary + "66" }}
                  thumbColor={profile?.show_gig_statuses !== false ? colors.primary : "#9CA3AF"}
                />
              </View>
            )}

            <View style={styles.statsContainer}>
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
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.review_count || 0}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Reviews
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.role === "musician" ? gigStats.active : "-"}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Active
                </Text>
              </View>
            </View>

            {/* Bio Section */}
            {profile?.bio && (
              <View style={styles.bioContainer}>
                <Text style={[styles.bioText, { color: colors.text }]}>
                  {profile.bio}
                </Text>
              </View>
            )}

            {/* TAB NAVIGATION */}
            <View style={[styles.tabContainer, { borderBottomColor: borderSoft }]}>
              <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("about")} style={[styles.tabButton, activeTab === "about" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                <Ionicons name="grid-outline" size={24} color={activeTab === "about" ? colors.text : colors.textSecondary} />
              </TouchableOpacity>

              {profile?.role === "musician" && profile?.show_gig_statuses !== false && (
                <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("gigs")} style={[styles.tabButton, activeTab === "gigs" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                  <Ionicons name="mic-outline" size={24} color={activeTab === "gigs" ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
              )}

              {isOwner && !isGuest && (
                <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("bookmarks")} style={[styles.tabButton, activeTab === "bookmarks" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                  <Ionicons name="bookmark-outline" size={24} color={activeTab === "bookmarks" ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>


            {activeTab === "gigs" && profile?.role === "musician" && profile?.show_gig_statuses !== false && (
              <View style={styles.gigTimelineSection}>
                <View
                  style={[
                    styles.gigSearchWrap,
                    { backgroundColor: surfaceBackground, borderColor: borderSoft },
                  ]}
                >
                  <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
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
                          <View key={gig.id} style={[styles.gigTimelineCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
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
                              {" • "}
                              {gig.location || "Location TBA"}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={[styles.gigTimelineEmpty, { borderColor: borderSoft, backgroundColor: surfaceBackground }]}>
                        <Text style={[styles.gigTimelineEmptyText, { color: colors.textSecondary }]}>No {section.label.toLowerCase()} gigs found.</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {activeTab === "gigs" && profile?.role === "musician" && profile?.show_gig_statuses === false && isOwner && (
              <Text style={[styles.gigHiddenText, { color: colors.textSecondary }]}>Gig status is hidden from other users.</Text>
            )}

            {activeTab === "bookmarks" && isOwner && !isGuest && (
              <View style={styles.bookmarkSection}>
                {loadingBookmarks ? (
                  <View style={[styles.bookmarkEmptyState, { borderColor: borderSoft, backgroundColor: surfaceBackground }]}>
                    <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>Loading saved bookmarks...</Text>
                  </View>
                ) : (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 12, flexGrow: 0 }} style={{ maxHeight: 60, marginBottom: 8 }}>
                       {['all', 'studios', 'gigs', 'musicians'].map((key) => {
                          const isActive = bookmarkFilter === key;
                          return (
                            <TouchableOpacity activeOpacity={1} key={key} onPress={() => setBookmarkFilter(key as any)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isActive ? colors.primary : surfaceBackground, justifyContent: "center" }}>
                               <Text style={{ color: isActive ? "#fff" : colors.textSecondary, fontFamily: "Poppins_500Medium" }}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                            </TouchableOpacity>
                          )
                       })}
                    </ScrollView>

                    <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 24 }}>
                      {(() => {
                          let displayedItems: any[] = [];
                          if (bookmarkFilter === "all") {
                             displayedItems = [...bookmarkedListings.studios, ...bookmarkedListings.gigs, ...bookmarkedListings.musicians];
                          } else {
                             displayedItems = bookmarkedListings[bookmarkFilter];
                          }

                         if (displayedItems.length === 0) {
                            return (
                               <View style={[styles.bookmarkEmptyState, { borderColor: borderSoft, backgroundColor: surfaceBackground }]}>
                                 <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>No bookmarks found.</Text>
                               </View>
                            )
                         }

                         return displayedItems.map((item, index) => {
                             let icon = item.type === "Studio" ? "business-outline" : item.type === "Gig" ? "mic-outline" : "people-outline";

                             return (
                                <TouchableOpacity
                                  key={`${item.type}-${item.id}-${index}`}
                                  activeOpacity={1}
                                  onPress={() => openBookmarkedListing(item.id)}
                                  style={[
                                    styles.bookmarkCard,
                                    { backgroundColor: pageCardBackground, borderColor: borderSoft, width: "100%", flexDirection: "row", padding: 12, gap: 12 },
                                  ]}
                                >
                                  {item.image ? (
                                    <Image source={{ uri: item.image }} style={[styles.bookmarkCardImage, { width: 64, height: 64 }]} />
                                  ) : (
                                    <View style={[styles.bookmarkCardImageFallback, { backgroundColor: surfaceBackground, width: 64, height: 64 }]}>
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

          </View>

          {/* Media Section - Instagram Style Grid (About Tab) */}
          {activeTab === "about" && (
          <View
            style={[
              styles.mediaSection,
              isWebDesktop && styles.mediaSectionWeb,
              isWebDesktop && styles.webSectionCard,
              { backgroundColor: isWebDesktop ? pageCardBackground : "transparent", borderColor: borderSoft },
            ]}
          >
            <View style={styles.mediaSectionHeader}>
              <View style={styles.mediaSectionHeading}>
                <View
                  style={[
                    styles.mediaSectionIconWrap,
                    { backgroundColor: isDark ? "rgba(79,70,229,0.18)" : "#E0E7FF" },
                  ]}
                >
                  <Ionicons name="images-outline" size={18} color={colors.primary} />
                </View>
                <View style={styles.mediaSectionTextWrap}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Media</Text>
                  <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
                    {mediaSummary}
                  </Text>
                </View>
              </View>

              <View style={styles.mediaSectionActions}>
                {portfolioCount > 0 && (
                  <View
                    style={[
                      styles.mediaCountBadge,
                      {
                        backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                        borderColor: borderSoft,
                      },
                    ]}
                  >
                    <Text style={[styles.mediaCountBadgeText, { color: colors.textSecondary }]}>
                      {portfolioCount}
                    </Text>
                  </View>
                )}

                {isOwner && (
                  <TouchableOpacity
                    onPress={addMediaToPortfolio}
                    disabled={uploading}
                    activeOpacity={1}
                    style={[
                      styles.addMediaBtn,
                      {
                        backgroundColor: uploading
                          ? colors.textSecondary
                          : colors.primary,
                      },
                    ]}
                  >
                    <Ionicons
                      name={portfolioCount > 0 ? "add" : "cloud-upload-outline"}
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.addMediaBtnText}>
                      {uploading
                        ? "Uploading..."
                        : portfolioCount > 0
                          ? "Upload"
                          : "Add Media"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {!profile?.portfolio_urls || profile.portfolio_urls.length === 0 ? (
              <View
                style={[
                  styles.emptyMedia,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                  },
                ]}
              >
                <View
                  style={[
                    styles.emptyMediaIconWrap,
                    { backgroundColor: isDark ? "rgba(79,70,229,0.18)" : "#E0E7FF" },
                  ]}
                >
                  <Ionicons
                    name="images-outline"
                    size={28}
                    color={colors.primary}
                  />
                </View>
                <Text
                  style={[
                    styles.emptyMediaText,
                    { color: colors.textSecondary },
                  ]}
                >
                  No media yet
                </Text>
                <Text
                  style={[styles.emptyMediaSubtext, { color: colors.muted }]}
                >
                  {isOwner
                    ? "Share your best work!"
                    : "This musician hasn't added media yet"}
                </Text>
                {isOwner && (
                  <TouchableOpacity
                    onPress={addMediaToPortfolio}
                    disabled={uploading}
                    activeOpacity={1}
                    style={[
                      styles.uploadBtn,
                      {
                        backgroundColor: uploading
                          ? colors.textSecondary
                          : colors.primary,
                      },
                    ]}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={18}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.uploadBtnText}>
                      {uploading ? "Uploading..." : "Add Photos & Videos"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.mediaGrid}>
                {profile.portfolio_urls.map((url: string, i: number) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.gridItem, { width: ITEM_SIZE, height: ITEM_SIZE }]}
                    onPress={() => openMediaViewer(url)}
                    activeOpacity={1}
                  >
                    {isVideo(url) ? (
                      <View
                        style={[
                          styles.gridVideoPlaceholder,
                          { backgroundColor: isDark ? "#0F172A" : "#E2E8F0" },
                        ]}
                      >
                        <Ionicons name="play-circle" size={30} color="#fff" />
                        <Text style={styles.gridVideoPlaceholderText}>Tap to play</Text>
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
                          name={isVideo(url) ? "videocam" : "image"}
                          size={10}
                          color="#fff"
                        />
                        <Text style={styles.mediaTypeText}>
                          {isVideo(url) ? "Video" : "Photo"}
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
                ))}
              </View>
            )}
          </View>
          )}

          {/* Media Viewer Modal */}
          <Modal
            visible={mediaModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMediaModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <TouchableOpacity activeOpacity={1}
                style={styles.modalCloseBtn}
                onPress={() => setMediaModalVisible(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>

              {selectedMedia &&
                (isVideo(selectedMedia) ? (
                  <Video
                    source={{ uri: selectedMedia }}
                    style={styles.modalMedia}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                  />
                ) : (
                  <Image
                    source={{ uri: selectedMedia }}
                    style={styles.modalMedia}
                    resizeMode="contain"
                  />
                ))}
            </View>
          </Modal>
          <Modal
            visible={uploading}
            transparent={true}
            animationType="fade"
            statusBarTranslucent
          >
            <View style={styles.uploadLoadingOverlay}>
              <View style={[styles.uploadLoadingCard, { backgroundColor: colors.surface }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.uploadLoadingTitle, { color: colors.text }]}>
                  {uploadMessage}
                </Text>
                <Text style={[styles.uploadLoadingSubtitle, { color: colors.textSecondary }]}>
                  Please wait while your photo or video is checked and uploaded.
                </Text>
              </View>
            </View>
          </Modal>
        </ScrollView>
        <Navbar />
        </View>
      </View>

      <Modal
        visible={isMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => closeMenu("modal-request-close")}
        onShow={() => {
          console.log("[ProfileMenu][web] Drawer modal onShow fired", {
            timestamp: new Date().toISOString(),
            isMenuOpen,
            isWebDesktop,
            width: winWidth,
            activeTab,
            profileId: profile?.id ?? null,
          });
        }}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity activeOpacity={1} style={styles.drawerBackdrop} onPress={() => closeMenu("drawer-backdrop")} />
          <View style={[styles.drawerContent, { backgroundColor: colors.background, borderLeftColor: borderSoft }]}>
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: colors.text }]}>Menu</Text>
              <TouchableOpacity activeOpacity={1} onPress={() => closeMenu("drawer-close-button")}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {isOwner ? (
                <View style={styles.drawerMenuList}>
                  {MENU_ITEMS.map((item) => (
                    <TouchableOpacity activeOpacity={1}
                      key={item.label}
                      onPress={() => {
                        console.log("[ProfileMenu][web] Drawer menu item selected", {
                          timestamp: new Date().toISOString(),
                          label: item.label,
                          route: item.route,
                          isMenuOpen,
                          isWebDesktop,
                          width: winWidth,
                        });
                        closeMenu(`menu-item:${item.route}`);
                        router.push(item.route as any);
                      }}
                      style={[styles.drawerMenuItem, { borderBottomColor: colors.border }]}
                    >
                      <View style={[styles.drawerMenuIcon, { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" }]}>
                        <Ionicons name={item.icon as any} size={20} color={colors.text} />
                      </View>
                      <Text style={[styles.drawerMenuLabel, { color: colors.text }]}>{item.label}</Text>
                      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },

  flex1: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
    width: "100%",
  },
  pageFrameWeb: {
    maxWidth: 1240,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 220,
  },
  scrollContentWeb: {
    maxWidth: 1120,
    alignSelf: "center",
    width: "100%",
    paddingTop: 12,
  },
  webSectionCard: {
    borderWidth: 1,
    borderRadius: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  headerProfile: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  headerProfileWeb: {
    marginHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    marginBottom: 16,
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
  },
  avatarImage: {
    width: "100%",
    height: "100%",
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
  genreRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 28,
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
    width: "100%",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.02)",
    marginBottom: 24,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
  },
  statLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: "80%",
    alignSelf: "center",
  },
  gigTimelineSection: {
    width: "100%",
    marginTop: 14,
    gap: 14,
  },
  gigSearchWrap: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gigSearchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    paddingVertical: 0,
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
  bioContainer: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: "100%",
  },
  bioText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  menuContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  menuItem: {
    padding: 16,
    borderWidth: 1,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 16,
  },
  guestHintText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
    flexShrink: 1,
    lineHeight: 18,
  },
  mediaSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  mediaSectionWeb: {
    marginHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    marginBottom: 16,
  },
  mediaSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
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
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  mediaSectionTextWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  mediaSectionActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  mediaCountBadge: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  mediaCountBadgeText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  addMediaBtn: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  addMediaBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    marginHorizontal: 24,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
  },
  emptyMediaIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  uploadBtnText: {
    fontFamily: "Poppins_500Medium",
    color: "#fff",
    fontSize: 14,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  gridItem: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
  },
  gridVideoPlaceholder: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  gridVideoPlaceholderText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 11,
    fontFamily: "Poppins_500Medium",
  },
  gridMeta: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row" as const,
    justifyContent: "flex-start" as const,
  },
  mediaTypePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
    width: "90%",
    maxWidth: 800,
    aspectRatio: 1,
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
  // Drawer styles
  drawerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerContent: {
    width: 320,
    maxWidth: "80%" as any,
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 24,
    borderLeftWidth: 1,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    overflow: "hidden" as const,
  },
  drawerHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  drawerTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  drawerMenuList: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 32,
    gap: 2,
  },
  drawerMenuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  drawerMenuIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  drawerMenuLabel: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
  },
  headerMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
});
