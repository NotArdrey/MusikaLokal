import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
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
    Easing as RNEasing,
    type ImageStyle,
    type StyleProp,
    type ViewStyle,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import InAppMediaViewer, { getInAppMediaType } from "../src/components/InAppMediaViewer";
import ReportModal from "../src/components/ReportModal";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import Navbar from "../src/components/navbar";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import ProfileAvatar from "../src/components/ProfileAvatar";
import CachedImage from "../src/components/CachedImage";
import PostDetailsModal from "../src/components/PostDetailsModal";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { emitToast } from "../src/events/toastBus";
import { screenUploadsWithAi } from "../src/services/uploadSafetyScreen";
import { isFanUserRole } from "../src/utils/roleRouting";
import { isStaffRole } from "../src/utils/staffAccess";
import {
  applyPlaylistAudioCopyrightDecision,
  pickPlaylistAudioFile,
  screenPlaylistAudioForCopyright,
  uploadPlaylistAudioFile,
  type PlaylistAudioFile,
} from "../src/utils/playlistAudio";
import {
  createE2EPlaylistAudioFixture,
  isE2EFixtureMode,
} from "../src/utils/e2eFixtures";

const GRID_GAP = 4;
const NUM_COLUMNS = 3;
const GRID_PADDING = 24;
const PROFILE_WEB_MAX_WIDTH = 935;
const PROFILE_WEB_PAGE_PADDING = 40;
const DRAWER_WIDTH = 320;
const DRAWER_OPEN_ANIMATION_MS = 320;
const DRAWER_CLOSE_ANIMATION_MS = 240;
const DRAWER_NAVIGATION_DELAY_MS = DRAWER_CLOSE_ANIMATION_MS;
const PENDING_REOPEN_LISTING_STORAGE_KEY = "pending_reopen_listing_id";
const PENDING_REOPEN_LISTING_TYPE_STORAGE_KEY = "pending_reopen_listing_type";
const MAX_INLINE_SCREEN_BYTES = 4 * 1024 * 1024;
const SAFETY_CHECK_TIMEOUT_MS = 6000;
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

const EMPTY_BOOKMARKS = {
  studios: [] as any[],
  gigs: [] as any[],
  artists: [] as any[],
  groups: [] as any[],
  production: [] as any[],
};

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

type ProfileTabKey = "about" | "posts" | "gigs" | "bookmarks" | "playlists";

type ProfileConnectionItem = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string | null;
  target_type: "profile" | "group";
};

const PROFILE_POSTS_CACHE_TTL_MS = 30000;
const PROFILE_PLAYLISTS_CACHE_TTL_MS = 30000;
const PLAYLIST_GENRES = ["Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic", "OPM", "Indie", "Other"];
const PLAYLIST_COVER_BUCKET = "post-media";
const PLAYLIST_COVER_FOLDER = "playlist-covers";
const PLAYLIST_TRACK_IMAGE_FOLDER = "playlist-track-images";
const PLAYLIST_COPYRIGHT_MATCH_PATTERN = /this (?:audio|track) appears to match|appears to be copyrighted|ownership request|identity review|admin approval|permission to share/i;
const PLAYLIST_EXPECTED_UPLOAD_FEEDBACK_PATTERN =
  /(blocked by safety screening|safety check|copyright check|appears to match|appears to be copyrighted|ownership request|identity review|admin approval|permission to share|please upload music you own|licensed to share|playlist tracks must be|tracks must be|only mp3)/i;
const PLAYLIST_COPYRIGHT_TERMS_BODY =
  "Under the Intellectual Property Code (RA 8293), protection is automatic from the moment of creation, securing creators' economic and moral rights. Unauthorized public performance, reproduction, or streaming without a license constitutes copyright infringement.";
const PLAYLIST_COPYRIGHT_ACKNOWLEDGEMENT =
  "I understand and confirm I own this music or have the required license to upload and stream it.";
const profilePostsCache = new Map<string, { posts: any[]; fetchedAt: number }>();
const profilePlaylistsCache = new Map<string, { playlists: any[]; fetchedAt: number }>();

type PlaylistDraftTrack = {
  id: string;
  title: string;
  artist_name: string;
  cover_image_url: string | null;
  audio_file: PlaylistAudioFile | null;
};

type PlaylistDraftTrackPayload = {
  id: string;
  title: string;
  artist_name: string | null;
  cover_image_url: string | null;
  duration_seconds: number | null;
  audio_file: PlaylistAudioFile | null;
};

const createPlaylistTrackDraft = (): PlaylistDraftTrack => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  artist_name: "",
  cover_image_url: null,
  audio_file: null,
});

const getFriendlyPlaylistUploadErrorMessage = (error: any) => {
  const message = typeof error?.message === "string" ? error.message : "";
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("different document picking in progress") ||
    normalizedMessage.includes("document picking in progress")
  ) {
    return "Another file picker is already open. Please finish or close it, then tap Upload MP3 again.";
  }

  if (normalizedMessage.includes("cancel") || normalizedMessage.includes("dismiss")) {
    return "No file was selected. Tap Upload MP3 when you're ready to choose a track.";
  }

  return message || "Please choose an MP3 file that is 5 minutes or less.";
};

const isExpectedPlaylistUploadFeedback = (message: string) =>
  PLAYLIST_EXPECTED_UPLOAD_FEEDBACK_PATTERN.test(message);

const formatPlaylistUploadFeedbackMessage = (message: string) =>
  message.replace(/^.+? was blocked by safety screening\.\s*/i, "").trim() || message;

const formatPlaylistCopyrightPendingMessage = (reason?: string) =>
  reason || "This MP3 appears to be copyrighted and was sent to admin review. You can still create the playlist; this track will stay unavailable publicly until admin approves it.";

const getPlaylistTrackCopyrightPayload = (source?: Partial<PlaylistAudioFile> | null) => ({
  copyright_status: source?.copyrightStatus || "not_required",
  copyright_review_id: source?.copyrightReviewId || null,
  copyright_metadata: source?.copyrightMetadata || (
    source?.copyrightTrackKey
      ? { copyright_track_key: source.copyrightTrackKey }
      : {}
  ),
});

const sanitizeAvatarUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "null" || lower === "undefined") return null;

  if (trimmed.startsWith("/storage/v1/") || trimmed.startsWith("storage/v1/")) {
    const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    return envBase ? `${envBase.replace(/\/$/, "")}${normalizedPath}` : normalizedPath;
  }

  return trimmed;
};

const buildSocialFollowKey = (type?: string | null, id?: string | null) => {
  const normalizedType = type === "group" ? "group" : "profile";
  const normalizedId = typeof id === "string" ? id.trim() : "";
  return normalizedId ? `${normalizedType}:${normalizedId}` : "";
};

const uniqueConnectionItems = (items: ProfileConnectionItem[]) => {
  const seenKeys = new Set<string>();
  return items.filter((item) => {
    const key = `${item.target_type}:${item.id}`;
    if (!item.id || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
};

const normalizeFollowerProfile = (row: any): ProfileConnectionItem | null => {
  const follower = row?.follower || row;
  const id =
    typeof follower?.id === "string" && follower.id.trim().length > 0
      ? follower.id.trim()
      : typeof row?.follower_id === "string"
        ? row.follower_id.trim()
        : "";

  if (!id) return null;

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

  if (!id) return null;

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

const fetchProfileFollowersDirect = async (targetId: string): Promise<ProfileConnectionItem[]> => {
  const { data: followRows, error } = await supabase
    .from("follows")
    .select("id, follower_id, followed_id, followed_type, created_at")
    .eq("followed_id", targetId)
    .eq("followed_type", "profile")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const followerIds = Array.from(
    new Set(
      (followRows || [])
        .map((row: any) => row?.follower_id)
        .filter((value: any): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );

  const { data: profiles } = followerIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, avatar_url, role").in("id", followerIds)
    : { data: [] };

  const profileById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));

  return uniqueConnectionItems(
    (followRows || [])
      .map((row: any) => normalizeFollowerProfile({ ...row, follower: profileById.get(row?.follower_id) || null }))
      .filter((item: ProfileConnectionItem | null): item is ProfileConnectionItem => Boolean(item)),
  );
};

const fetchProfileFollowingDirect = async (targetId: string): Promise<ProfileConnectionItem[]> => {
  const { data: followRows, error } = await supabase
    .from("follows")
    .select("id, followed_id, followed_type, created_at")
    .eq("follower_id", targetId)
    .order("created_at", { ascending: false });

  if (error) throw error;

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
      ? supabase.from("profiles").select("id, full_name, avatar_url, role").in("id", followedProfileIds)
      : Promise.resolve({ data: [] }),
    followedGroupIds.length > 0
      ? supabase.from("groups_with_stats").select("id, name, images, group_type, genre, location, owner_id").in("id", followedGroupIds)
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

const WEB_VIDEO_THUMBNAIL_TIME_SECONDS = 1;
const WEB_VIDEO_THUMBNAIL_TIMEOUT_MS = 8000;

const createWebVideoThumbnail = (uri: string): Promise<string> =>
  new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Video thumbnails require a browser environment."));
      return;
    }

    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // Some browsers throw when loading a detached video; the thumbnail work is already done.
      }
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const fail = (message: string) => finish(() => reject(new Error(message)));

    const captureFrame = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
          fail("Video frame dimensions were unavailable.");
          return;
        }

        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          fail("Could not create a video thumbnail canvas.");
          return;
        }

        context.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        finish(() => resolve(dataUrl));
      } catch (error: any) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    };

    video.crossOrigin = "anonymous";
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration)
          ? video.duration
          : WEB_VIDEO_THUMBNAIL_TIME_SECONDS;
        const targetTime = Math.min(
          WEB_VIDEO_THUMBNAIL_TIME_SECONDS,
          Math.max(0, duration - 0.1),
        );

        if (targetTime <= 0.05) {
          video.addEventListener("loadeddata", captureFrame, { once: true });
          return;
        }

        try {
          video.currentTime = targetTime;
        } catch (error: any) {
          finish(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
      },
      { once: true },
    );
    video.addEventListener("seeked", captureFrame, { once: true });
    video.addEventListener("error", () => fail("Could not load video for thumbnail."), {
      once: true,
    });

    timeoutId = setTimeout(
      () => fail("Timed out while creating the video thumbnail."),
      WEB_VIDEO_THUMBNAIL_TIMEOUT_MS,
    );
    video.src = uri;
    video.load();
  });

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
    if (Platform.OS !== "web" || !sourceUri) {
      setThumbnailFailed(true);
      return () => {
        isMounted = false;
      };
    }

    createWebVideoThumbnail(sourceUri)
      .then((nextThumbnailUri) => {
        if (isMounted) {
          setThumbnailUri(nextThumbnailUri);
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

const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read media for safety screening."));
    reader.readAsDataURL(blob);
  });

const getPortfolioSourceBlob = async (file: PortfolioUploadAsset): Promise<Blob> => {
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
  file: PortfolioUploadAsset,
  options: {
    fileExt: string;
    mimeType: string;
    uploadKind: PortfolioUploadKind;
    sourceBlob: Blob;
    size: number;
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

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const { width: winWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && winWidth >= 768;

  const profileContentWidth = isWebDesktop
    ? Math.min(PROFILE_WEB_MAX_WIDTH, Math.max(320, winWidth - PROFILE_WEB_PAGE_PADDING))
    : winWidth;
  const gridContainerWidth = isWebDesktop
    ? profileContentWidth
    : profileContentWidth - GRID_PADDING * 2;
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
  const { loading: authLoading, userId: currentUserId, isGuest, userRole } = useAuth();
  const params = useLocalSearchParams<{
    userId?: string;
    refresh?: string;
    returnToHome?: string;
    returnListingId?: string;
  }>();
  const normalizedParamUserId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const normalizedRefresh = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;

  const [profile, setProfile] = useState<any>(null);
  const isFan = isFanUserRole(userRole || profile?.role);
  const isStaff = isStaffRole(userRole || profile?.role);
  const [loading, setLoading] = useState(true);
  const [profilePosts, setProfilePosts] = useState<any[]>([]);
  const [loadingProfilePosts, setLoadingProfilePosts] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const isProfileFan = isFanUserRole(profile?.role) || (isOwner && isFanUserRole(userRole));
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
  const [bookmarkedListings, setBookmarkedListings] = useState(EMPTY_BOOKMARKS);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [gigSearchQuery, setGigSearchQuery] = useState("");
  const [updatingGigVisibility, setUpdatingGigVisibility] = useState(false);
  const [supportsGigVisibilityPreference, setSupportsGigVisibilityPreference] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTabKey>("about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuMounted, setIsMenuMounted] = useState(false);
  const [isMenuTouchable, setIsMenuTouchable] = useState(false);
  const drawerProgress = useRef(new Animated.Value(0)).current;
  const [bookmarkFilter, setBookmarkFilter] = useState<"all" | "studios" | "gigs" | "artists" | "groups" | "production">("all");
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [playlistActionId, setPlaylistActionId] = useState<string | null>(null);
  const [isProfileFollowing, setIsProfileFollowing] = useState(false);
  const [isProfileFollowBusy, setIsProfileFollowBusy] = useState(false);
  const [profileFollowerCount, setProfileFollowerCount] = useState(0);
  const [profileFollowingCount, setProfileFollowingCount] = useState(0);
  const [profileFollowers, setProfileFollowers] = useState<ProfileConnectionItem[]>([]);
  const [profileFollowing, setProfileFollowing] = useState<ProfileConnectionItem[]>([]);
  const [loadingProfileFollowers, setLoadingProfileFollowers] = useState(false);
  const [followListModal, setFollowListModal] = useState<"followers" | "following" | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistGenre, setPlaylistGenre] = useState("");
  const [playlistCoverImages, setPlaylistCoverImages] = useState<string[]>([]);
  const [playlistTrackDrafts, setPlaylistTrackDrafts] = useState<PlaylistDraftTrack[]>([]);
  const [playlistVisibility, setPlaylistVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [uploadingPlaylistTrackId, setUploadingPlaylistTrackId] = useState<string | null>(null);
  const [playlistAudioUploadMessage, setPlaylistAudioUploadMessage] = useState<string | null>(null);
  const [playlistCopyrightTermsAccepted, setPlaylistCopyrightTermsAccepted] = useState(false);
  const [playlistCopyrightTermsVisible, setPlaylistCopyrightTermsVisible] = useState(false);
  const [playlistCopyrightTermsDraftAccepted, setPlaylistCopyrightTermsDraftAccepted] = useState(false);
  const profilePostsFetchInFlightRef = useRef<string | null>(null);
  const profilePlaylistsFetchInFlightRef = useRef<string | null>(null);

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

    drawerProgress.stopAnimation();
    drawerProgress.setValue(0);
    setIsMenuTouchable(false);
    setIsMenuMounted(true);
    setIsMenuOpen(true);
  }, [activeTab, currentUserId, drawerProgress, isGuest, isMenuOpen, isOwner, isWebDesktop, profile?.id, winWidth]);

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

    if (!isMenuOpen) {
      return;
    }

    setIsMenuTouchable(false);
    setIsMenuOpen(false);
  }, [activeTab, isMenuOpen, isWebDesktop, profile?.id, winWidth]);

  useEffect(() => {
    if (!isMenuMounted) {
      return;
    }

    drawerProgress.stopAnimation();

    const animation = Animated.timing(drawerProgress, {
      toValue: isMenuOpen ? 1 : 0,
      duration: isMenuOpen ? DRAWER_OPEN_ANIMATION_MS : DRAWER_CLOSE_ANIMATION_MS,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (!finished) {
        return;
      }

      if (isMenuOpen) {
        setIsMenuTouchable(true);
      } else {
        setIsMenuTouchable(false);
        setIsMenuMounted(false);
      }
    });

    return () => {
      animation.stop();
    };
  }, [drawerProgress, isMenuMounted, isMenuOpen]);

  const drawerTranslateX = useMemo(
    () =>
      drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [DRAWER_WIDTH + 28, 0],
      }),
    [drawerProgress],
  );
  const drawerBackdropOpacity = useMemo(
    () =>
      drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    [drawerProgress],
  );

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

    if (typeof entry?.logo_url === "string" && entry.logo_url.trim().length > 0) {
      return entry.logo_url;
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

      setBookmarkedListings({
        studios: studios.slice(0, 8),
        gigs: gigs.slice(0, 8),
        artists: artists.slice(0, 8),
        groups: groups.slice(0, 8),
        production: production.slice(0, 8),
      });
    } catch (bookmarkError) {
      console.log("Error fetching bookmarks:", bookmarkError);
      setBookmarkedListings(EMPTY_BOOKMARKS);
    } finally {
      setLoadingBookmarks(false);
    }
  };

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

    if (profilePlaylistsFetchInFlightRef.current === targetUserId) return;

    profilePlaylistsFetchInFlightRef.current = targetUserId;
    setLoadingPlaylists(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "list_user_playlists", user_id: targetUserId },
      });
      if (error) throw error;
      const playlists = Array.isArray(data?.data) ? data.data : Array.isArray(data?.playlists) ? data.playlists : [];
      profilePlaylistsCache.set(targetUserId, { playlists, fetchedAt: Date.now() });
      setUserPlaylists(playlists);
    } catch (error) {
      console.warn("Profile playlists fetch failed", error);
      setUserPlaylists([]);
    } finally {
      if (profilePlaylistsFetchInFlightRef.current === targetUserId) {
        profilePlaylistsFetchInFlightRef.current = null;
      }
      setLoadingPlaylists(false);
    }
  }, []);

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

    if (profilePostsFetchInFlightRef.current === targetId) return;

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
              preview_url: sanitizeAvatarUrl(
                item?.thumbnail_url ||
                  item?.thumbnail_path ||
                  item?.url ||
                  item?.storage_path ||
                  item?.public_url,
              ) || "",
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

      profilePostsCache.set(targetId, { posts: nextPosts, fetchedAt: Date.now() });
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

  const refreshProfileFollowLists = useCallback(async (targetId: string) => {
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
      setProfileFollowerCount(followers.length);
      setProfileFollowingCount(following.length);
    } catch (error) {
      console.warn("Profile follow lists fetch failed", error);
    } finally {
      setLoadingProfileFollowers(false);
    }
  }, [isGuest]);

  const loadProfileFollowState = useCallback(async (targetId: string) => {
    if (!targetId || !currentUserId || isGuest || targetId === currentUserId) {
      setIsProfileFollowing(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "get_following" },
      });
      if (error) throw error;
      const followKey = buildSocialFollowKey("profile", targetId);
      const nextFollowingKeys = new Set<string>(
        (Array.isArray(data?.data) ? data.data : [])
          .map((row: any) => buildSocialFollowKey(row?.followed_type, row?.followed_id))
          .filter(Boolean),
      );
      setIsProfileFollowing(nextFollowingKeys.has(followKey));
    } catch {
      setIsProfileFollowing(false);
    }
  }, [currentUserId, isGuest]);

  // Refresh profile data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchProfile();
      }
      // fetchProfile intentionally reads the latest route/auth/profile helpers on focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.userId, params.refresh, authLoading, currentUserId, isGuest]),
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
          setProfilePosts([]);
          setUserPlaylists([]);
          setProfileFollowerCount(0);
          setProfileFollowingCount(0);
          setProfileFollowers([]);
          setProfileFollowing([]);
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
      if (normalizedRefresh) {
        profilePlaylistsCache.delete(targetId);
      }

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

      const nextProfile = {
        ...(profileStatsData || {}),
        ...profileData,
        skills: (skillsResult.data || []).map((row: any) => row.skill).filter(Boolean),
        genres: (genresResult.data || []).map((row: any) => row.genre).filter(Boolean),
        portfolio_urls: (portfolioResult.data || [])
          .map((row: any) => row.portfolio_url)
          .filter(Boolean),
      };
      setProfile(nextProfile);

      await fetchBookmarkedListings(targetId, !!ownership && !isGuest);
      if (isFanUserRole(nextProfile.role)) {
        setUserPlaylists([]);
        setLoadingPlaylists(false);
      } else {
        void fetchPlaylists(targetId);
      }
      void fetchProfilePosts(targetId);
      void refreshProfileFollowLists(targetId);
      void loadProfileFollowState(targetId);
    } catch (e) {
      console.log("Error fetching profile:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "posts") return;
    const targetId = profile?.id || normalizedParamUserId || currentUserId || "";
    if (!targetId) {
      setProfilePosts([]);
      return;
    }
    void fetchProfilePosts(targetId);
  }, [activeTab, currentUserId, fetchProfilePosts, normalizedParamUserId, profile?.id]);

  const viewedProfileId = typeof profile?.id === "string" ? profile.id.trim() : "";
  const canFollowProfile =
    Boolean(currentUserId) &&
    !isGuest &&
    !isOwner &&
    viewedProfileId.length > 0 &&
    viewedProfileId !== currentUserId;

  const openFollowListModal = useCallback((nextModal: "followers" | "following") => {
    setFollowListModal(nextModal);
    const targetId = viewedProfileId || normalizedParamUserId || currentUserId || "";
    if (targetId) void refreshProfileFollowLists(targetId);
  }, [currentUserId, normalizedParamUserId, refreshProfileFollowLists, viewedProfileId]);

  const openFollowListItem = (item: ProfileConnectionItem) => {
    setFollowListModal(null);
    if (!item.id) return;

    if (item.target_type === "group") {
      router.push({ pathname: "/group_details" as any, params: { id: item.id } });
      return;
    }

    router.push({ pathname: "/profile" as any, params: { userId: item.id } });
  };

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

  const handleProfileFollowToggle = useCallback(async () => {
    if (!canFollowProfile || !viewedProfileId || isProfileFollowBusy) return;

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
      if (error) throw error;

      emitToast({ type: "success", title: wasFollowing ? "Unfollowed" : "Following", message: "" });
      void refreshProfileFollowLists(viewedProfileId);
    } catch (error: any) {
      setIsProfileFollowing(wasFollowing);
      setProfileFollowerCount(previousFollowerCount);
      emitToast({ type: "error", title: "Follow failed", message: error?.message || "Please try again." });
    } finally {
      setIsProfileFollowBusy(false);
    }
  }, [
    canFollowProfile,
    isProfileFollowBusy,
    isProfileFollowing,
    profileFollowerCount,
    refreshProfileFollowLists,
    viewedProfileId,
  ]);

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

  const openPlaylistCopyrightTermsModal = useCallback(() => {
    setPlaylistCopyrightTermsDraftAccepted(playlistCopyrightTermsAccepted);
    setPlaylistCopyrightTermsVisible(true);
  }, [playlistCopyrightTermsAccepted]);

  const confirmPlaylistCopyrightTerms = useCallback(() => {
    setPlaylistCopyrightTermsAccepted(true);
    setPlaylistCopyrightTermsVisible(false);
  }, []);

  const togglePlaylistCopyrightTerms = useCallback(() => {
    if (playlistCopyrightTermsAccepted) {
      setPlaylistCopyrightTermsAccepted(false);
      return;
    }

    openPlaylistCopyrightTermsModal();
  }, [openPlaylistCopyrightTermsModal, playlistCopyrightTermsAccepted]);

  const addPlaylistTrackDraft = useCallback(() => {
    setPlaylistTrackDrafts((current) => [...current, createPlaylistTrackDraft()]);
  }, []);

  const updatePlaylistTrackDraft = useCallback((trackId: string, field: "title" | "artist_name", value: string) => {
    setPlaylistTrackDrafts((current) => current.map((track) => (
      track.id === trackId ? { ...track, [field]: value } : track
    )));
  }, []);

  const setPlaylistTrackAudioFile = useCallback((trackId: string, audioFile: PlaylistAudioFile | null) => {
    setPlaylistTrackDrafts((current) => current.map((track) => (
      track.id === trackId ? { ...track, audio_file: audioFile } : track
    )));
  }, []);

  const setPlaylistTrackCoverImage = useCallback((trackId: string, coverImageUrl: string | null) => {
    setPlaylistTrackDrafts((current) => current.map((track) => (
      track.id === trackId ? { ...track, cover_image_url: coverImageUrl } : track
    )));
  }, []);

  const removePlaylistTrackDraft = useCallback((trackId: string) => {
    setPlaylistTrackDrafts((current) => current.filter((track) => track.id !== trackId));
  }, []);

  const handlePickPlaylistTrackAudio = useCallback(async (trackId: string) => {
    try {
      if (isE2EFixtureMode()) {
        setPlaylistTrackAudioFile(trackId, createE2EPlaylistAudioFixture());
        return;
      }

      setUploadingPlaylistTrackId(trackId);
      setPlaylistAudioUploadMessage("Preparing MP3...");
      const audioFile = await pickPlaylistAudioFile();
      if (!audioFile) return;

      setPlaylistAudioUploadMessage("Checking MP3...");
      const copyrightScreening = await screenPlaylistAudioForCopyright(audioFile);
      const reviewedAudioFile = applyPlaylistAudioCopyrightDecision(audioFile, copyrightScreening.decision);
      setPlaylistTrackAudioFile(trackId, reviewedAudioFile);

      if (copyrightScreening.decision.requiresAdminReview) {
        showAlert(
          "warning",
          "Copyright Match Found",
          formatPlaylistCopyrightPendingMessage(copyrightScreening.decision.reason),
          undefined,
          true,
        );
      }
    } catch (error: any) {
      const pickerErrorMessage = getFriendlyPlaylistUploadErrorMessage(error);
      const displayMessage = isExpectedPlaylistUploadFeedback(pickerErrorMessage)
        ? formatPlaylistUploadFeedbackMessage(pickerErrorMessage)
        : pickerErrorMessage;

      showAlert(
        "warning",
        PLAYLIST_COPYRIGHT_MATCH_PATTERN.test(pickerErrorMessage) ? "Copyright Match Found" : "Upload MP3",
        displayMessage,
        undefined,
        true,
      );
    } finally {
      setUploadingPlaylistTrackId(null);
      setPlaylistAudioUploadMessage(null);
    }
  }, [setPlaylistTrackAudioFile]);

  const preparePlaylistTrackPayloads = useCallback(async (): Promise<PlaylistDraftTrackPayload[]> => {
    const items = playlistTrackDrafts
      .map((track) => ({
        id: track.id,
        title: track.title.trim(),
        artist_name: track.artist_name.trim() || null,
        cover_image_url: track.cover_image_url,
        audio_file: track.audio_file,
      }))
      .filter((track) => track.title || track.artist_name || track.cover_image_url || track.audio_file);

    if (items.some((track) => !track.title)) {
      throw new Error("Each added music needs a title before you save the playlist.");
    }

    return Promise.all(items.map(async (track) => ({
      id: track.id,
      title: track.title,
      artist_name: track.artist_name,
      cover_image_url: track.cover_image_url,
      duration_seconds: track.audio_file?.durationSeconds || null,
      audio_file: track.audio_file,
    })));
  }, [playlistTrackDrafts]);

  const openCreatePlaylist = useCallback(() => {
    setPlaylistTitle("");
    setPlaylistDescription("");
    setPlaylistGenre("");
    setPlaylistCoverImages([]);
    setPlaylistTrackDrafts([]);
    setPlaylistVisibility("public");
    setUploadingPlaylistTrackId(null);
    setPlaylistAudioUploadMessage(null);
    setPlaylistCopyrightTermsAccepted(false);
    setPlaylistCopyrightTermsDraftAccepted(false);
    setPlaylistCopyrightTermsVisible(false);
    setCreatePlaylistModalVisible(true);
  }, []);

  const closeCreatePlaylistModal = useCallback(() => {
    if (creatingPlaylist || uploadingPlaylistTrackId) return;
    setCreatePlaylistModalVisible(false);
  }, [creatingPlaylist, uploadingPlaylistTrackId]);

  const handleCreatePlaylistFromModal = useCallback(async () => {
    const trimmedTitle = playlistTitle.trim();
    if (!trimmedTitle) {
      showAlert("error", "Playlist Title Required", "Add a title before creating your playlist.");
      return;
    }

    if (authLoading) {
      showAlert("info", "Please Wait", "Your session is still loading. Try again in a moment.");
      return;
    }

    if (!playlistCopyrightTermsAccepted) {
      openPlaylistCopyrightTermsModal();
      return;
    }

    try {
      setCreatingPlaylist(true);
      await ensurePlaylistMutationSession();
      const draftItems = await preparePlaylistTrackPayloads();
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "create_playlist",
          title: trimmedTitle,
          description: playlistDescription.trim() || null,
          genre: playlistGenre.trim() || null,
          cover_image_url: playlistCoverImages[0] || null,
          visibility: playlistVisibility,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to create playlist.");

      const createdPlaylist = data?.data || data?.playlist || null;
      const playlistId = createdPlaylist?.id || "";
      const failedTracks: { title: string; reason?: string }[] = [];
      const pendingReviewTracks: string[] = [];

      if (playlistId && draftItems.length > 0) {
        for (const track of draftItems) {
          try {
            let sourceUrl: string | null = null;
            let copyrightPayload = getPlaylistTrackCopyrightPayload(track.audio_file);
            if (track.audio_file) {
              if (isE2EFixtureMode()) {
                sourceUrl = track.audio_file.uri;
              } else {
                setUploadingPlaylistTrackId(track.id);
                setPlaylistAudioUploadMessage(`Uploading ${track.title}...`);
                const upload = await uploadPlaylistAudioFile(track.audio_file, playlistId);
                sourceUrl = upload.publicUrl;
                copyrightPayload = getPlaylistTrackCopyrightPayload({
                  copyrightStatus: upload.copyrightStatus,
                  copyrightReviewId: upload.copyrightReviewId,
                  copyrightTrackKey: upload.copyrightTrackKey,
                  copyrightMetadata: upload.copyrightMetadata,
                });
                if (upload.copyrightRequiresAdminReview || upload.copyrightStatus === "pending_review") {
                  pendingReviewTracks.push(track.title);
                }
              }
            }

            const itemBody = {
              action: "add_playlist_item",
              playlist_id: playlistId,
              title: track.title,
              artist_name: track.artist_name,
              cover_image_url: track.cover_image_url,
              audio_url: sourceUrl,
              duration_seconds: track.duration_seconds,
              ...copyrightPayload,
            };

            const { data: itemData, error: itemError } = await supabase.functions.invoke("manage-playlists", {
              body: itemBody,
            });

            if (itemError) throw itemError;
            if (!itemData?.success) throw new Error(itemData?.error || "Failed to add playlist item.");
          } catch (trackError: any) {
            failedTracks.push({
              title: track.title,
              reason: typeof trackError?.message === "string" ? trackError.message : undefined,
            });
          }
        }
      }

      const targetUserId = viewedProfileId || currentUserId || normalizedParamUserId || "";
      if (targetUserId) profilePlaylistsCache.delete(targetUserId);
      if (createdPlaylist?.id) {
        setUserPlaylists((prev) => [createdPlaylist, ...prev]);
      } else if (targetUserId) {
        void fetchPlaylists(targetUserId);
      }

      setCreatePlaylistModalVisible(false);
      setActiveTab("playlists");
      if (failedTracks.length > 0) {
        const firstReason = failedTracks.find((track) => track.reason)?.reason;
        const displayReason = firstReason && isExpectedPlaylistUploadFeedback(firstReason)
          ? formatPlaylistUploadFeedbackMessage(firstReason)
          : firstReason;
        showAlert(
          "warning",
          firstReason && PLAYLIST_COPYRIGHT_MATCH_PATTERN.test(firstReason)
            ? "Copyright Match Found"
            : "Track Upload Feedback",
          displayReason || `${failedTracks.length} track${failedTracks.length === 1 ? "" : "s"} could not be uploaded.`,
          undefined,
          true,
        );
        return;
      }
      if (pendingReviewTracks.length > 0) {
        showAlert(
          "warning",
          "Playlist Created",
          `${pendingReviewTracks.length} copyrighted MP3${pendingReviewTracks.length === 1 ? "" : "s"} were sent to admin review. Non-copyrighted tracks are available now; reviewed tracks will become available after approval.`,
          undefined,
          true,
        );
        return;
      }
      emitToast({ type: "success", title: "Playlist Created", message: `${trimmedTitle} is ready.` });
    } catch (error: any) {
      showAlert("error", "Create Playlist Failed", error?.message || "Please try again.");
    } finally {
      setUploadingPlaylistTrackId(null);
      setPlaylistAudioUploadMessage(null);
      setCreatingPlaylist(false);
    }
  }, [
    authLoading,
    currentUserId,
    ensurePlaylistMutationSession,
    fetchPlaylists,
    normalizedParamUserId,
    playlistCoverImages,
    playlistDescription,
    playlistGenre,
    playlistCopyrightTermsAccepted,
    playlistTitle,
    playlistTrackDrafts,
    playlistVisibility,
    openPlaylistCopyrightTermsModal,
    preparePlaylistTrackPayloads,
    viewedProfileId,
  ]);

  const handleDeletePlaylist = async (playlistId: string, playlistTitle: string) => {
    if (!playlistId) return;
    try {
      setPlaylistActionId(playlistId);
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "delete_playlist", playlist_id: playlistId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to delete playlist.");

      const targetUserId = viewedProfileId || currentUserId || normalizedParamUserId || "";
      if (targetUserId) profilePlaylistsCache.delete(targetUserId);
      setUserPlaylists((prev) => prev.filter((playlist) => playlist.id !== playlistId));
      emitToast({ type: "success", title: "Playlist Deleted", message: `${playlistTitle || "Playlist"} was removed.` });
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
      `Delete "${playlist?.title || "this playlist"}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void handleDeletePlaylist(playlist.id, playlist.title || "Playlist"),
        },
      ],
    );
  };

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

  useEffect(() => {
    if (profileTabOrder.includes(activeTab)) return;
    setActiveTab(profileTabOrder[0] ?? "about");
  }, [activeTab, profileTabOrder]);

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
      void AsyncStorage.setItem(PENDING_REOPEN_LISTING_STORAGE_KEY, returnListingId)
        .catch(() => { })
        .finally(() => {
          router.back();
        });
      return;
    }

    router.back();
  }, [params.returnListingId, params.returnToHome]);

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
      pathname: "/feed",
      params: {
        reopenListingId: itemId,
        listingType,
      },
    } as any);
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

      logProfileMedia("file_selected", {
        uri: file.uri,
        fileName,
        fileExt,
        mimeType,
        uploadKind,
        pickerMimeType: file.mimeType,
        pickerType: (file as any)?.type,
        fileSize: (file as any)?.fileSize ?? (file as any)?.size,
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
        uploadKind,
        sourceBlob,
        size: sourceBlob.size || Number((file as any)?.fileSize || (file as any)?.size || 0),
      }));
      logProfileMedia("safety_check_passed", { fileName });

      setUploadMessage(`Uploading media ${index + 1}/${selectedAssets.length}...`);
      logProfileMedia("storage_upload_started", {
        bucket: "portfolio",
        fileName,
        contentType: mimeType,
      });
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("portfolio")
        .upload(fileName, sourceBlob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        logProfileMedia("storage_upload_failed", { message: uploadError.message });
        console.error("❌ Upload failed:", uploadError);
        throw new Error(uploadError.message || "Upload failed");
      }

      logProfileMedia("storage_upload_success", {
        bucket: "portfolio",
        path: uploadData?.path || fileName,
      });

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("portfolio")
        .getPublicUrl(fileName);

      console.log("✅ Uploaded:", urlData.publicUrl);

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
      console.log("Upload error:", e);
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
      showAlert("error", "Error", "You must be logged in.");
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
        ? "Add photos, videos, and documents that show your sound, setup, or stage presence."
        : "No portfolio uploads yet.";
  const hasValidPlaylistTrackDrafts = playlistTrackDrafts.every((track) => {
    const hasAnyDraftValue =
      track.title.trim().length > 0 ||
      track.artist_name.trim().length > 0 ||
      Boolean(track.cover_image_url) ||
      Boolean(track.audio_file);
    return !hasAnyDraftValue || track.title.trim().length > 0;
  });
  const isCreatePlaylistReady = playlistTitle.trim().length > 0 && hasValidPlaylistTrackDrafts;
  const isCreatePlaylistBusy = creatingPlaylist || Boolean(uploadingPlaylistTrackId);

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
              testID="profile-report-button"
              accessibilityLabel="profile-report-button"
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
                <ProfileAvatar
                  uri={profile?.avatar_url}
                  style={styles.avatarImage}
                  backgroundColor={isDark ? "#374151" : "#E5E7EB"}
                  iconColor={colors.textSecondary}
                />
              </View>

              {isOwner && (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => router.push("/edit_profile" as any)}
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
              • {profile?.location || "Unknown"}
            </Text>

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
                            { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" },
                          ]}
                        >
                          <Text style={[styles.genreText, { color: colors.textSecondary }]}>
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
                            { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" },
                          ]}
                        >
                          <Text style={[styles.genreText, { color: colors.textSecondary }]}>
                            {genre}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            )}

            {canFollowProfile ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={isProfileFollowBusy}
                onPress={() => void handleProfileFollowToggle()}
                style={[
                  styles.profileFollowBtn,
                  {
                    backgroundColor: isProfileFollowing ? surfaceBackground : colors.primary,
                    borderColor: isProfileFollowing ? borderSoft : colors.primary,
                    opacity: isProfileFollowBusy ? 0.72 : 1,
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
                  {profilePosts.length}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Posts
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
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
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <TouchableOpacity
                activeOpacity={0.8}
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
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <TouchableOpacity
                activeOpacity={0.8}
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
              {profileTabOrder.map((tab) => {
                const isActive = activeTab === tab;
                const icon =
                  tab === "posts"
                    ? "newspaper-outline"
                    : tab === "gigs"
                      ? "mic-outline"
                      : tab === "bookmarks"
                        ? "bookmark-outline"
                        : tab === "playlists"
                          ? "musical-notes-outline"
                          : "grid-outline";

                return (
                  <TouchableOpacity
                    key={tab}
                    activeOpacity={0.85}
                    onPress={() => setActiveTab(tab)}
                    style={[styles.tabButton, isActive && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}
                  >
                    <Ionicons name={icon as any} size={20} color={isActive ? colors.text : colors.textSecondary} />
                    <Text style={[styles.tabButtonLabel, { color: isActive ? colors.text : colors.textSecondary }]}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SmoothTabTransition activeKey={activeTab} style={styles.profileTabTransition}>
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
                       {['all', 'studios', 'gigs', 'artists', 'groups', 'production'].map((key) => {
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
                             displayedItems = [
                               ...bookmarkedListings.studios,
                               ...bookmarkedListings.gigs,
                               ...bookmarkedListings.artists,
                               ...bookmarkedListings.groups,
                               ...bookmarkedListings.production,
                             ];
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

              {activeTab === "posts" && (
                <View style={styles.profileTabContent}>
                  <View style={[styles.profilePostsSection, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
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
                            onPress={() => setSelectedPostId(String(post.id))}
                            style={[styles.profilePostCard, { borderColor: borderSoft }]}
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
                              <View style={[styles.profilePostPreviewFallback, { backgroundColor: pageCardBackground }]}>
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

              {activeTab === "playlists" && !isProfileFan && (
                <View style={styles.profileTabContent}>
                  <View style={[styles.playlistsSection, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
                    <View style={styles.playlistsHeader}>
                      <View>
                        <Text style={[styles.profilePostsTitle, { color: colors.text }]}>Playlists</Text>
                        <Text style={[styles.playlistsHint, { color: colors.textSecondary }]}>
                          Open a playlist to view tracks and station details.
                        </Text>
                      </View>
                      <View style={styles.playlistsHeaderActions}>
                        {loadingPlaylists ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                        {isOwner && !isGuest ? (
                          <TouchableOpacity activeOpacity={0.85} onPress={openCreatePlaylist} style={[styles.createPlaylistBtn, { backgroundColor: colors.primary }]}>
                            <Ionicons name="add" size={16} color="#fff" />
                            <Text style={styles.createPlaylistText}>Create</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>

                    {!loadingPlaylists && userPlaylists.length === 0 ? (
                      <View style={[styles.playlistEmptyState, { borderColor: borderSoft, backgroundColor: pageCardBackground }]}>
                        <Ionicons name="musical-notes-outline" size={28} color={colors.textSecondary} />
                        <Text style={[styles.playlistEmptyTitle, { color: colors.text }]}>
                          {isOwner && !isGuest ? "No playlists yet" : "No playlists to show"}
                        </Text>
                        <Text style={[styles.playlistEmptyText, { color: colors.textSecondary }]}>
                          {isOwner && !isGuest
                            ? "Create your first playlist to build your profile rotation."
                            : "This profile has not shared any playlists yet."}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.playlistsList}>
                        {userPlaylists.map((playlist: any) => {
                          const trackCount = Number(playlist.track_count ?? playlist.items_count ?? playlist.items?.length ?? 0);
                          const isBusy = playlistActionId === playlist.id;
                          return (
                            <View key={playlist.id} style={[styles.playlistCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                              <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => router.push({ pathname: "/playlist_details" as any, params: { playlist_id: playlist.id } })}
                                style={styles.playlistMain}
                              >
                                <View style={[styles.playlistIconWrap, { backgroundColor: colors.primary + "22" }]}>
                                  <Ionicons name="musical-notes" size={20} color={colors.primary} />
                                </View>
                                <View style={styles.playlistBody}>
                                  <Text numberOfLines={1} style={[styles.playlistTitle, { color: colors.text }]}>{playlist.title || "Untitled Playlist"}</Text>
                                  <Text style={[styles.playlistMeta, { color: colors.textSecondary }]}>
                                    {trackCount} track{trackCount === 1 ? "" : "s"} {" • "} {playlist.visibility === "private" ? "Private" : "Public"}
                                  </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                              </TouchableOpacity>
                              {isOwner && !isGuest ? (
                                <TouchableOpacity
                                  activeOpacity={0.85}
                                  disabled={isBusy}
                                  onPress={() => promptDeletePlaylist(playlist)}
                                  style={styles.playlistDeleteBtn}
                                >
                                  {isBusy ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                  ) : (
                                    <Ionicons name="trash-outline" size={15} color="#EF4444" />
                                  )}
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </SmoothTabTransition>

          </View>

          {/* Media Section - Instagram Style Grid (About Tab) */}
          <SmoothTabTransition activeKey={activeTab} style={styles.profileTabTransition}>
            {activeTab === "about" && (
            <View
              style={[
                styles.mediaSection,
                isWebDesktop && styles.mediaSectionWeb,
                {
                  backgroundColor: isWebDesktop ? "transparent" : "transparent",
                  borderColor: isWebDesktop ? "transparent" : borderSoft,
                },
              ]}
            >
            <View
              style={[
                styles.mediaSectionHeader,
                isWebDesktop && styles.mediaSectionHeaderWeb,
                isWebDesktop && { borderTopColor: borderSoft },
              ]}
            >
              <View style={[styles.mediaSectionHeading, isWebDesktop && styles.mediaSectionHeadingWeb]}>
                <View
                  style={[
                    styles.mediaSectionIconWrap,
                    isWebDesktop && styles.mediaSectionIconWrapWeb,
                    { backgroundColor: isDark ? "rgba(79,70,229,0.18)" : "#E0E7FF" },
                    isWebDesktop && { backgroundColor: "transparent" },
                  ]}
                >
                  <Ionicons name="grid-outline" size={isWebDesktop ? 13 : 18} color={isWebDesktop ? colors.text : colors.primary} />
                </View>
                <View style={[styles.mediaSectionTextWrap, isWebDesktop && styles.mediaSectionTextWrapWeb]}>
                  <Text
                    numberOfLines={1}
                    style={[styles.sectionTitle, isWebDesktop && styles.sectionTitleWeb, { color: colors.text }]}
                  >
                    Media
                  </Text>
                  <Text style={[styles.sectionSubtitle, isWebDesktop && styles.sectionSubtitleWeb, { color: colors.textSecondary }]}>
                    {mediaSummary}
                  </Text>
                </View>
              </View>

              <View style={[styles.mediaSectionActions, isWebDesktop && styles.mediaSectionActionsWeb]}>
                {portfolioCount > 0 && !isWebDesktop && (
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
                      isWebDesktop && styles.addMediaBtnWeb,
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
                    ? "Use the Add Media button above to share your best work."
                    : "This profile hasn't added media yet"}
                </Text>
              </View>
            ) : (
              <View style={[styles.mediaGrid, isWebDesktop && styles.mediaGridWeb]}>
                {profile.portfolio_urls.map((url: string, i: number) => {
                  const mediaType = getProfileMediaType(url);
                  const isVideoItem = mediaType === "video";
                  const isDocumentItem = mediaType === "document";

                  return (
                    <TouchableOpacity
                      key={url}
                      style={[
                        styles.gridItem,
                        isWebDesktop && styles.gridItemWeb,
                        { width: ITEM_SIZE, height: ITEM_SIZE },
                      ]}
                      onPress={() => openMediaViewer(url)}
                      activeOpacity={1}
                    >
                      {isVideoItem ? (
                        <ProfileVideoThumbnail
                          uri={url}
                          isDark={isDark}
                          imageStyle={[styles.gridImage, isWebDesktop && styles.gridImageWeb]}
                          placeholderStyle={[
                            styles.gridVideoPlaceholder,
                            isWebDesktop && styles.gridVideoPlaceholderWeb,
                          ]}
                        />
                      ) : isDocumentItem ? (
                        <View
                          style={[
                            styles.gridDocumentPlaceholder,
                            isWebDesktop && styles.gridDocumentPlaceholderWeb,
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
                          style={[styles.gridImage, isWebDesktop && styles.gridImageWeb]}
                          resizeMode="cover"
                        />
                      )}

                      {!isWebDesktop && (
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
                      )}

                      {isOwner && (
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={(event: any) => {
                            event?.stopPropagation?.();
                            confirmRemoveMedia(url);
                          }}
                          style={[styles.mediaRemoveBtn, isWebDesktop && styles.mediaRemoveBtnWeb]}
                        >
                          <Ionicons name="trash-outline" size={14} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            </View>
            )}
          </SmoothTabTransition>

          <InAppMediaViewer
            visible={mediaModalVisible}
            uri={selectedMedia}
            onClose={() => {
              setMediaModalVisible(false);
              setSelectedMedia(null);
            }}
          />
          <PostDetailsModal
            visible={Boolean(selectedPostId)}
            postId={selectedPostId}
            onClose={() => setSelectedPostId(null)}
            onPostDeleted={(postId) => {
              setProfilePosts((prev) => prev.filter((post) => post.id !== postId));
              setSelectedPostId(null);
            }}
            onReactionChanged={(postId, hasReaction, reactionCount) => {
              setProfilePosts((prev) =>
                prev.map((post) =>
                  post.id === postId
                    ? { ...post, has_reaction: hasReaction, reaction_count: reactionCount }
                    : post,
                ),
              );
            }}
            onCommentChanged={(postId, commentCount) => {
              setProfilePosts((prev) =>
                prev.map((post) =>
                  post.id === postId ? { ...post, comment_count: commentCount } : post,
                ),
              );
            }}
          />
          <Modal
            visible={Boolean(followListModal)}
            transparent
            animationType="fade"
            onRequestClose={() => setFollowListModal(null)}
          >
            <View style={styles.followModalOverlay}>
              <View style={[styles.followModalCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                <View style={styles.followModalHeader}>
                  <View>
                    <Text style={[styles.followModalTitle, { color: colors.text }]}>
                      {followListModal === "following" ? "Following" : "Followers"}
                    </Text>
                    <Text style={[styles.followModalCount, { color: colors.textSecondary }]}>
                      {followListModal === "following" ? profileFollowingCount : profileFollowerCount} profiles
                    </Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setFollowListModal(null)} style={[styles.followModalClose, { backgroundColor: surfaceBackground }]}>
                    <Ionicons name="close" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.followModalList} contentContainerStyle={styles.followModalListContent}>
                  {loadingProfileFollowers ? (
                    <View style={styles.followModalLoading}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={[styles.followModalEmptyText, { color: colors.textSecondary }]}>Loading...</Text>
                    </View>
                  ) : (followListModal === "following" ? profileFollowing : profileFollowers).length === 0 ? (
                    <Text style={[styles.followModalEmptyText, { color: colors.textSecondary }]}>
                      {followListModal === "following" ? "Not following anyone yet." : "No followers yet."}
                    </Text>
                  ) : (
                    (followListModal === "following" ? profileFollowing : profileFollowers).map((item) => (
                      <TouchableOpacity
                        key={`${item.target_type}:${item.id}`}
                        activeOpacity={0.85}
                        onPress={() => openFollowListItem(item)}
                        style={[styles.followModalItem, { borderColor: borderSoft }]}
                      >
                        <ProfileAvatar
                          uri={item.avatar_url}
                          style={styles.followModalAvatar}
                          backgroundColor={surfaceBackground}
                          iconColor={colors.textSecondary}
                        />
                        <View style={styles.followModalItemBody}>
                          <Text numberOfLines={1} style={[styles.followModalName, { color: colors.text }]}>{item.full_name}</Text>
                          <Text style={[styles.followModalRole, { color: colors.textSecondary }]}>{formatFollowerRole(item.role)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
          <Modal
            visible={createPlaylistModalVisible}
            transparent
            animationType="fade"
            onRequestClose={closeCreatePlaylistModal}
          >
            <View style={styles.playlistModalOverlay}>
              <View style={[styles.playlistModalCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                <View style={styles.playlistModalHeader}>
                  <View>
                    <Text style={[styles.playlistModalTitle, { color: colors.text }]}>Create Playlist</Text>
                    <Text style={[styles.playlistModalSubtitle, { color: colors.textSecondary }]}>
                      Build a new playlist for your profile rotation.
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={closeCreatePlaylistModal}
                    disabled={isCreatePlaylistBusy}
                    style={[styles.followModalClose, { backgroundColor: surfaceBackground }]}
                  >
                    <Ionicons name="close" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.playlistModalBodyScroll}
                  contentContainerStyle={styles.playlistModalBody}
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[styles.playlistModalLabel, { color: colors.text }]}>Album Cover</Text>
                  {currentUserId ? (
                    <ImageUploader
                      images={playlistCoverImages}
                      onImagesChange={(images) => setPlaylistCoverImages(images.slice(0, 1))}
                      maxImages={1}
                      bucketName={PLAYLIST_COVER_BUCKET}
                      userId={currentUserId}
                      folder={PLAYLIST_COVER_FOLDER}
                      safetyContext="playlist_cover_upload"
                    />
                  ) : (
                    <View style={[styles.playlistUploadUnavailable, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
                      <Text style={[styles.playlistUploadUnavailableText, { color: colors.textSecondary }]}>
                        Sign in fully to upload a cover image.
                      </Text>
                    </View>
                  )}

                  <Text style={[styles.playlistModalLabel, { color: colors.text }]}>Title *</Text>
                  <TextInput
                    value={playlistTitle}
                    onChangeText={setPlaylistTitle}
                    placeholder="Playlist title"
                    placeholderTextColor={colors.textSecondary}
                    maxLength={100}
                    style={[styles.playlistModalInput, { color: colors.text, backgroundColor: surfaceBackground, borderColor: borderSoft }]}
                  />

                  <Text style={[styles.playlistModalLabel, { color: colors.text }]}>Description</Text>
                  <TextInput
                    value={playlistDescription}
                    onChangeText={setPlaylistDescription}
                    placeholder="Describe the playlist"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={500}
                    style={[
                      styles.playlistModalInput,
                      styles.playlistModalTextArea,
                      { color: colors.text, backgroundColor: surfaceBackground, borderColor: borderSoft },
                    ]}
                  />

                  <Text style={[styles.playlistModalLabel, { color: colors.text }]}>Genre</Text>
                  <View style={styles.playlistGenreWrap}>
                    {PLAYLIST_GENRES.map((genre) => {
                      const selected = playlistGenre === genre;
                      return (
                        <TouchableOpacity
                          key={genre}
                          activeOpacity={0.85}
                          onPress={() => setPlaylistGenre(selected ? "" : genre)}
                          style={[
                            styles.playlistGenreChip,
                            {
                              backgroundColor: selected ? colors.primary : surfaceBackground,
                              borderColor: selected ? colors.primary : borderSoft,
                            },
                          ]}
                        >
                          <Text style={[styles.playlistGenreText, { color: selected ? "#fff" : colors.textSecondary }]}>
                            {genre}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={[styles.playlistModalLabel, { color: colors.text }]}>Visibility</Text>
                  <View style={styles.playlistVisibilityRow}>
                    {(["public", "private", "unlisted"] as const).map((visibility) => {
                      const selected = playlistVisibility === visibility;
                      return (
                        <TouchableOpacity
                          key={visibility}
                          activeOpacity={0.85}
                          onPress={() => setPlaylistVisibility(visibility)}
                          style={[
                            styles.playlistVisibilityBtn,
                            {
                              backgroundColor: selected ? colors.primary : surfaceBackground,
                              borderColor: selected ? colors.primary : borderSoft,
                            },
                          ]}
                        >
                          <Text style={[styles.playlistVisibilityText, { color: selected ? "#fff" : colors.text }]}>
                            {visibility.charAt(0).toUpperCase() + visibility.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={[styles.playlistTermsCard, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={togglePlaylistCopyrightTerms}
                      style={styles.playlistTermsCheckboxButton}
                    >
                      <Ionicons
                        name={playlistCopyrightTermsAccepted ? "checkbox" : "square-outline"}
                        size={22}
                        color={playlistCopyrightTermsAccepted ? colors.primary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                    <Text style={[styles.playlistTermsText, { color: colors.textSecondary }]}>
                      I acknowledge the playlist copyright terms under RA 8293.{" "}
                      <Text style={[styles.playlistTermsLink, { color: colors.primary }]} onPress={openPlaylistCopyrightTermsModal}>
                        View terms
                      </Text>
                    </Text>
                  </View>

                  <View style={styles.playlistMusicHeader}>
                    <View>
                      <Text style={[styles.playlistModalLabel, styles.playlistMusicLabel, { color: colors.text }]}>Musics</Text>
                      <Text style={[styles.playlistModalHint, { color: colors.textSecondary }]}>
                        Add the tracks now so the playlist is ready as soon as it is created.
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={addPlaylistTrackDraft}
                      disabled={creatingPlaylist}
                      style={[styles.playlistAddTrackBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "35" }]}
                    >
                      <Ionicons name="add" size={15} color={colors.primary} />
                      <Text style={[styles.playlistAddTrackText, { color: colors.primary }]}>Add Music</Text>
                    </TouchableOpacity>
                  </View>

                  {playlistTrackDrafts.length === 0 ? (
                    <View style={[styles.playlistTrackEmptyCard, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
                      <Ionicons name="musical-notes-outline" size={22} color={colors.textSecondary} />
                      <Text style={[styles.playlistTrackEmptyTitle, { color: colors.text }]}>No musics added yet</Text>
                      <Text style={[styles.playlistTrackEmptyText, { color: colors.textSecondary }]}>
                        Tap Add Music to include a title and an MP3 audio file up to 5 minutes.
                      </Text>
                    </View>
                  ) : (
                    playlistTrackDrafts.map((track, index) => (
                      <View key={track.id} style={[styles.playlistTrackCard, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}>
                        <View style={styles.playlistTrackCardHeader}>
                          <Text style={[styles.playlistTrackCardTitle, { color: colors.text }]}>Music {index + 1}</Text>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => removePlaylistTrackDraft(track.id)}
                            disabled={creatingPlaylist || uploadingPlaylistTrackId === track.id}
                            style={styles.playlistTrackRemoveBtn}
                          >
                            <Ionicons name="trash-outline" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          value={track.title}
                          onChangeText={(value) => updatePlaylistTrackDraft(track.id, "title", value)}
                          placeholder="Track title"
                          placeholderTextColor={colors.textSecondary}
                          maxLength={120}
                          style={[styles.playlistModalInput, styles.playlistTrackInput, { color: colors.text, backgroundColor: pageCardBackground, borderColor: borderSoft }]}
                        />
                        <TextInput
                          value={track.artist_name}
                          onChangeText={(value) => updatePlaylistTrackDraft(track.id, "artist_name", value)}
                          placeholder="Artist name"
                          placeholderTextColor={colors.textSecondary}
                          maxLength={120}
                          style={[styles.playlistModalInput, styles.playlistTrackInput, { color: colors.text, backgroundColor: pageCardBackground, borderColor: borderSoft }]}
                        />
                        {currentUserId ? (
                          <>
                            <Text style={[styles.playlistTrackImageLabel, { color: colors.textSecondary }]}>Music Image (Optional)</Text>
                            <ImageUploader
                              images={track.cover_image_url ? [track.cover_image_url] : []}
                              onImagesChange={(images) => setPlaylistTrackCoverImage(track.id, images[0] || null)}
                              maxImages={1}
                              bucketName={PLAYLIST_COVER_BUCKET}
                              userId={currentUserId}
                              folder={PLAYLIST_TRACK_IMAGE_FOLDER}
                              safetyContext="playlist_track_image_upload"
                            />
                          </>
                        ) : null}
                        <TouchableOpacity
                          activeOpacity={uploadingPlaylistTrackId === track.id || creatingPlaylist ? 1 : 0.85}
                          onPress={() => void handlePickPlaylistTrackAudio(track.id)}
                          disabled={Boolean(uploadingPlaylistTrackId) || creatingPlaylist}
                          style={[
                            styles.playlistAudioPickerBtn,
                            {
                              backgroundColor: pageCardBackground,
                              borderColor: borderSoft,
                              opacity: uploadingPlaylistTrackId === track.id || creatingPlaylist ? 0.65 : 1,
                            },
                          ]}
                        >
                          {uploadingPlaylistTrackId === track.id ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                          )}
                          <Text style={[styles.playlistAudioPickerText, { color: colors.primary }]}>
                            {uploadingPlaylistTrackId === track.id ? "Working..." : "Upload MP3"}
                          </Text>
                        </TouchableOpacity>
                        <Text style={[styles.playlistModalHint, { color: colors.textSecondary }]}>
                          Uploaded MP3 files must be 5 minutes or less.
                        </Text>
                        {track.audio_file ? (
                          <View style={[styles.playlistAudioFileChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "35" }]}>
                            <Ionicons name="musical-note" size={14} color={colors.primary} />
                            <Text numberOfLines={1} style={[styles.playlistAudioFileText, { color: colors.text }]}>
                              {track.audio_file.name}
                            </Text>
                            <TouchableOpacity activeOpacity={0.85} onPress={() => setPlaylistTrackAudioFile(track.id, null)}>
                              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    ))
                  )}

                </ScrollView>

                <View style={[styles.playlistModalFooter, { borderTopColor: borderSoft }]}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={closeCreatePlaylistModal}
                    disabled={isCreatePlaylistBusy}
                    style={[styles.playlistModalCancelBtn, { borderColor: borderSoft }]}
                  >
                    <Text style={[styles.playlistModalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={isCreatePlaylistReady ? 0.85 : 1}
                    onPress={() => void handleCreatePlaylistFromModal()}
                    disabled={isCreatePlaylistBusy || !isCreatePlaylistReady}
                    style={[
                      styles.playlistModalSubmitBtn,
                      {
                        backgroundColor: isCreatePlaylistReady ? colors.primary : surfaceBackground,
                        opacity: isCreatePlaylistBusy || !isCreatePlaylistReady ? 0.65 : 1,
                      },
                    ]}
                  >
                    {isCreatePlaylistBusy ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.playlistModalSubmitText, { color: isCreatePlaylistReady ? "#fff" : colors.textSecondary }]}>
                        Create Playlist
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
          <Modal
            visible={playlistCopyrightTermsVisible}
            transparent
            animationType="fade"
            statusBarTranslucent
          >
            <View style={styles.playlistTermsOverlay}>
              <View style={[styles.playlistTermsModalCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                <Text style={[styles.playlistTermsModalTitle, { color: colors.text }]}>Copyright Terms</Text>
                <Text style={[styles.playlistTermsModalBody, { color: colors.textSecondary }]}>
                  {PLAYLIST_COPYRIGHT_TERMS_BODY}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setPlaylistCopyrightTermsDraftAccepted((accepted) => !accepted)}
                  style={[styles.playlistTermsModalCheckRow, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}
                >
                  <Ionicons
                    name={playlistCopyrightTermsDraftAccepted ? "checkbox" : "square-outline"}
                    size={22}
                    color={playlistCopyrightTermsDraftAccepted ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.playlistTermsModalCheckText, { color: colors.text }]}>
                    {PLAYLIST_COPYRIGHT_ACKNOWLEDGEMENT}
                  </Text>
                </TouchableOpacity>
                <View style={styles.playlistTermsModalActions}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setPlaylistCopyrightTermsVisible(false)}
                    style={[styles.playlistTermsModalButton, { borderColor: borderSoft }]}
                  >
                    <Text style={[styles.playlistTermsModalButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={playlistCopyrightTermsDraftAccepted ? 0.85 : 1}
                    disabled={!playlistCopyrightTermsDraftAccepted}
                    onPress={confirmPlaylistCopyrightTerms}
                    style={[
                      styles.playlistTermsModalButton,
                      styles.playlistTermsModalPrimaryButton,
                      {
                        backgroundColor: playlistCopyrightTermsDraftAccepted ? colors.primary : surfaceBackground,
                        opacity: playlistCopyrightTermsDraftAccepted ? 1 : 0.65,
                      },
                    ]}
                  >
                    <Text style={styles.playlistTermsModalPrimaryText}>Agree</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
          <Modal
            visible={Boolean(playlistAudioUploadMessage)}
            transparent
            animationType="fade"
            statusBarTranslucent
          >
            <View style={styles.uploadLoadingOverlay}>
              <View style={[styles.uploadLoadingCard, { backgroundColor: colors.surface }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.uploadLoadingTitle, { color: colors.text }]}>
                  {playlistAudioUploadMessage}
                </Text>
                <Text style={[styles.uploadLoadingSubtitle, { color: colors.textSecondary }]}>
                  Please keep this screen open.
                </Text>
              </View>
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
                  Please wait while your photo, video, or document is checked and uploaded.
                </Text>
              </View>
            </View>
          </Modal>
        </ScrollView>
        <Navbar />
        </View>
        {isMenuMounted ? (
          <View style={styles.drawerOverlay} pointerEvents="box-none">
            <Animated.View
              pointerEvents="none"
              style={[styles.drawerScrim, { opacity: drawerBackdropOpacity }]}
            />
            <View pointerEvents={isMenuTouchable ? "auto" : "none"} style={styles.drawerBackdrop}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.drawerBackdropTouchTarget}
                onPress={() => closeMenu("drawer-backdrop")}
              />
            </View>
            <Animated.View
              style={[
                styles.drawerContent,
                { backgroundColor: colors.background, borderLeftColor: borderSoft },
                { transform: [{ translateX: drawerTranslateX }] },
              ]}
            >
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
                          setTimeout(() => router.push(item.route as any), DRAWER_NAVIGATION_DELAY_MS);
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
            </Animated.View>
          </View>
        ) : null}
      </View>

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
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 10,
    borderBottomWidth: 1,
    marginTop: 8,
    marginBottom: 20,
  },
  tabButton: {
    flex: 0,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "capitalize",
  },
  profileFollowBtn: {
    minWidth: 128,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginBottom: 18,
  },
  profileFollowBtnText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  profileTabContent: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  profilePostsSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  profilePostsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  profilePostsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
  profilePostsEmpty: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    paddingVertical: 28,
    textAlign: "center",
  },
  profilePostCard: {
    borderTopWidth: 1,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profilePostPreviewWrap: {
    width: 84,
    height: 84,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#0F172A",
  },
  profilePostPreview: {
    width: "100%",
    height: "100%",
  },
  profilePostVideoBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.75)",
  },
  profilePostPreviewFallback: {
    width: 84,
    height: 84,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  profilePostBody: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  profilePostText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 14,
    lineHeight: 20,
  },
  profilePostMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  profilePostMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  profilePostOpenIcon: {
    marginLeft: 4,
  },
  playlistsSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 16,
  },
  playlistsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  playlistsHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  playlistsHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  createPlaylistBtn: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  createPlaylistText: {
    color: "#fff",
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  playlistEmptyState: {
    minHeight: 170,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  playlistEmptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    marginTop: 10,
  },
  playlistEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 4,
  },
  playlistsList: {
    gap: 10,
  },
  playlistCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playlistMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  playlistIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistBody: {
    flex: 1,
    minWidth: 0,
  },
  playlistTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
  playlistMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  playlistDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.14)",
  },
  followModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.68)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  followModalCard: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "78%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  followModalHeader: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  followModalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  followModalCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  followModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  followModalList: {
    maxHeight: 420,
  },
  followModalListContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 8,
  },
  followModalLoading: {
    minHeight: 110,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  followModalEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  followModalItem: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  followModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  followModalItemBody: {
    flex: 1,
    minWidth: 0,
  },
  followModalName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  followModalRole: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  playlistModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  playlistModalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "88%",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 20,
  },
  playlistModalHeader: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  playlistModalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    lineHeight: 26,
  },
  playlistModalSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  playlistModalBodyScroll: {
    maxHeight: 560,
  },
  playlistModalBody: {
    paddingHorizontal: 22,
    paddingBottom: 20,
  },
  playlistModalLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    marginTop: 12,
    marginBottom: 7,
  },
  playlistModalInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
  },
  playlistModalTextArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  playlistUploadUnavailable: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    borderStyle: "dashed",
  },
  playlistUploadUnavailableText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  playlistGenreWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  playlistGenreChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  playlistGenreText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  playlistVisibilityRow: {
    flexDirection: "row",
    gap: 8,
  },
  playlistVisibilityBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  playlistVisibilityText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  playlistTermsCard: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 10,
  },
  playlistTermsCheckboxButton: {
    paddingTop: 1,
  },
  playlistTermsText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  playlistTermsLink: {
    fontFamily: "Poppins_700Bold",
  },
  playlistMusicHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  playlistMusicLabel: {
    marginTop: 0,
    marginBottom: 3,
  },
  playlistModalHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 17,
  },
  playlistAddTrackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  playlistAddTrackText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  playlistTrackEmptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  playlistTrackEmptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    marginTop: 8,
  },
  playlistTrackEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    textAlign: "center",
  },
  playlistTrackCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  playlistTrackCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  playlistTrackCardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  playlistTrackRemoveBtn: {
    padding: 4,
  },
  playlistTrackInput: {
    marginTop: 10,
  },
  playlistTrackImageLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    marginTop: 12,
  },
  playlistAudioPickerBtn: {
    marginTop: 10,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  playlistAudioPickerText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
  },
  playlistAudioFileChip: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playlistAudioFileText: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  playlistModalFooter: {
    borderTopWidth: 1,
    padding: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  playlistModalCancelBtn: {
    minWidth: 112,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  playlistModalCancelText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  playlistModalSubmitBtn: {
    minWidth: 152,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  playlistModalSubmitText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  playlistTermsOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
    padding: 24,
  },
  playlistTermsModalCard: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  playlistTermsModalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
  },
  playlistTermsModalBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  playlistTermsModalCheckRow: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  playlistTermsModalCheckText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  playlistTermsModalActions: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  playlistTermsModalButton: {
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playlistTermsModalPrimaryButton: {
    borderWidth: 0,
  },
  playlistTermsModalButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  playlistTermsModalPrimaryText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
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
    maxWidth: PROFILE_WEB_MAX_WIDTH,
    alignSelf: "center",
    width: "100%",
    paddingTop: 28,
  },
  profileTabTransition: {
    width: "100%",
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
    marginHorizontal: 0,
    paddingTop: 42,
    paddingBottom: 30,
    marginBottom: 18,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarContainer: {
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: "hidden",
    marginBottom: 14,
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
    fontSize: 26,
    lineHeight: 34,
    marginBottom: 6,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
  },
  roleText: {
    fontSize: 13,
    marginBottom: 14,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  genreRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 20,
  },
  profileTagsSection: {
    width: "100%",
    alignItems: "center",
    gap: 14,
    marginBottom: 20,
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
    width: "100%",
    maxWidth: 620,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.02)",
    marginBottom: 20,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
  },
  statLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
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
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    marginHorizontal: 0,
    marginTop: 0,
    paddingTop: 0,
    paddingBottom: 0,
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
  mediaSectionHeaderWeb: {
    minHeight: 52,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 0,
    marginBottom: 12,
    borderTopWidth: 1,
  },
  mediaSectionHeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mediaSectionHeadingWeb: {
    flex: 1,
    justifyContent: "center",
    gap: 6,
    marginLeft: 104,
  },
  mediaSectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  mediaSectionIconWrapWeb: {
    width: 16,
    height: 16,
    borderRadius: 0,
  },
  mediaSectionTextWrap: {
    flex: 1,
  },
  mediaSectionTextWrapWeb: {
    flex: 0,
    minWidth: 58,
    alignItems: "center" as const,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  sectionTitleWeb: {
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    fontFamily: "Poppins_700Bold",
    textAlign: "center" as const,
    width: 58,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  sectionSubtitleWeb: {
    display: "none" as const,
  },
  mediaSectionActions: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  mediaSectionActionsWeb: {
    minWidth: 104,
    justifyContent: "flex-end" as const,
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
  addMediaBtnWeb: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addMediaBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 224,
    paddingVertical: 42,
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
  mediaGridWeb: {
    paddingHorizontal: 0,
    gap: GRID_GAP,
  },
  gridItem: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  gridItemWeb: {
    borderRadius: 0,
    backgroundColor: "#0B1220",
  },
  gridImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
  },
  gridImageWeb: {
    borderRadius: 0,
  },
  gridVideoThumbnail: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  gridVideoPlaceholder: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  gridVideoPlaceholderWeb: {
    borderRadius: 0,
  },
  gridVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  gridVideoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  gridVideoPlayBadgeWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  gridVideoPlayBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    padding: 12,
  },
  gridDocumentPlaceholderWeb: {
    borderRadius: 0,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },
  gridDocumentExtension: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
    textAlign: "center" as const,
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
  mediaRemoveBtnWeb: {
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.72)",
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 1000,
    elevation: 1000,
  },
  drawerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
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
    position: "absolute" as const,
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
