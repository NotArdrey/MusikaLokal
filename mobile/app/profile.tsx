import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import ReportModal from "../src/components/ReportModal";
import { isTrackPlayerAvailable } from "../src/audio/safeTrackPlayer";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import { DEFAULT_AVATAR } from "../src/constants/Images";
import { useAuth } from "../src/context/AuthContext";
import {
  useRadioPlayerActions,
  useRadioPlayerPlayback,
  useRadioPlayerPresence,
} from "../src/context/RadioPlayerContext";
import CachedImage from "../src/components/CachedImage";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";
import { buildSocialFollowKey } from "../src/utils/socialFollow";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PROFILE_CONTENT_HORIZONTAL_PADDING = 24;
const GRID_GAP = 8;
const NUM_COLUMNS = 3;
const SECTION_SIDE_MARGIN = 16;
const GRID_PADDING = 16;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);
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
  musicians: [] as any[],
  productions: [] as any[],
});

const normalizeBookmarkBuckets = (value: any) => ({
  studios: Array.isArray(value?.studios) ? value.studios : [],
  gigs: Array.isArray(value?.gigs) ? value.gigs : [],
  musicians: Array.isArray(value?.musicians) ? value.musicians : [],
  productions: Array.isArray(value?.productions) ? value.productions : [],
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
    const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
    if (data?.publicUrl) {
      return data.publicUrl;
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

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const { loading: authLoading, userId: currentUserId, isGuest, userRole } = useAuth();
  const { activeStation } = useRadioPlayerPresence();
  const { isPlaying } = useRadioPlayerPlayback();
  const { togglePlayPause, tuneIn } = useRadioPlayerActions();
  const params = useLocalSearchParams<{
    userId?: string;
    returnToHome?: string;
    returnListingId?: string;
  }>();
  const normalizedParamUserId = useMemo(() => {
    return Array.isArray(params.userId) ? params.userId[0] : params.userId;
  }, [params.userId]);

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [gigStats, setGigStats] = useState({ active: 0, upcoming: 0, done: 0 });
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
  const [activeTab, setActiveTab] = useState<"about" | "gigs" | "bookmarks" | "playlists">("about");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [bookmarkFilter, setBookmarkFilter] = useState<"all" | "studios" | "gigs" | "musicians" | "productions">("all");
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [userStation, setUserStation] = useState<any>(null);
  const [loadingStation, setLoadingStation] = useState(false);
  const [radioPlaylistIds, setRadioPlaylistIds] = useState<Set<string>>(new Set());
  const [togglingRadio, setTogglingRadio] = useState<string | null>(null);
  const [playlistActionId, setPlaylistActionId] = useState<string | null>(null);
  const [isProfileFollowing, setIsProfileFollowing] = useState(false);
  const [isProfileFollowBusy, setIsProfileFollowBusy] = useState(false);
  const profileFetchInFlightRef = useRef(false);
  const canManageStations = !isGuest && userRole === "admin";

  useEffect(() => {
    if (loading) return;

    console.log("[ProfileMenu][mobile] Header action eligibility", {
      timestamp: new Date().toISOString(),
      authLoading,
      loading,
      isOwner,
      isGuest,
      menuButtonVisible: isOwner || isGuest,
      reportButtonVisible: !isOwner && !isGuest,
      activeTab,
      profileId: profile?.id ?? null,
      currentUserId: currentUserId ?? null,
    });
  }, [activeTab, authLoading, currentUserId, isGuest, isOwner, loading, profile?.id]);

  useEffect(() => {
    console.log("[ProfileMenu][mobile] Menu visibility changed", {
      timestamp: new Date().toISOString(),
      isMenuOpen,
      activeTab,
      profileId: profile?.id ?? null,
    });
  }, [activeTab, isMenuOpen, profile?.id]);

  const openDrawer = useCallback((source: string = "unknown") => {
    if (isMenuOpen) {
      console.log("[ProfileMenu][mobile] Open ignored because drawer is already open", {
        timestamp: new Date().toISOString(),
        source,
        isMenuOpen,
      });
      return;
    }

    console.log("[ProfileMenu][mobile] Open requested", {
      timestamp: new Date().toISOString(),
      source,
      isOwner,
      isGuest,
      isMenuOpen,
      activeTab,
      profileId: profile?.id ?? null,
      currentUserId: currentUserId ?? null,
    });

    console.log("[ProfileMenu][mobile] Opening drawer", {
      source,
      nextIsMenuOpen: true,
    });

    setIsMenuOpen(true);
  }, [activeTab, currentUserId, isGuest, isMenuOpen, isOwner, profile?.id]);

  const closeDrawer = useCallback((source: string = "unknown") => {
    if (!isMenuOpen) {
      console.log("[ProfileMenu][mobile] Close ignored because drawer is already closed", {
        timestamp: new Date().toISOString(),
        source,
      });
      return;
    }

    console.log("[ProfileMenu][mobile] Close requested", {
      timestamp: new Date().toISOString(),
      source,
      isMenuOpen,
      activeTab,
      profileId: profile?.id ?? null,
    });

    console.log("[ProfileMenu][mobile] Closing drawer", {
      source,
      nextIsMenuOpen: false,
    });

    setIsMenuOpen(false);
  }, [activeTab, isMenuOpen, profile?.id]);

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
        .select("group_id, profile_id, studio_id, gig_id, project_id, created_at")
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
      const projectIds = favorites
        .map((entry: any) => entry.project_id)
        .filter((value: any): value is string => typeof value === "string");

      const [groupsResult, profilesResult, studiosResult, gigsResult, projectsResult] = await Promise.all([
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
        projectIds.length > 0
          ? supabase
            .from("producer_projects_with_summary")
            .select("id, title, genre, location, cover_image_url, owner_name")
            .in("id", projectIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (groupsResult.error) throw groupsResult.error;
      if (profilesResult.error) throw profilesResult.error;
      if (studiosResult.error) throw studiosResult.error;
      if (gigsResult.error) throw gigsResult.error;
      if (projectsResult.error) throw projectsResult.error;

      const groupById = new Map((groupsResult.data || []).map((entry: any) => [entry.id, entry]));
      const profileById = new Map((profilesResult.data || []).map((entry: any) => [entry.id, entry]));
      const studioById = new Map((studiosResult.data || []).map((entry: any) => [entry.id, entry]));
      const gigById = new Map((gigsResult.data || []).map((entry: any) => [entry.id, entry]));
      const projectById = new Map((projectsResult.data || []).map((entry: any) => [entry.id, entry]));

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

      const productions = favorites
        .filter((entry: any) => !!entry.project_id)
        .map((entry: any) => projectById.get(entry.project_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.title || "Untitled Production",
          subtitle: entry.location || entry.genre || entry.owner_name || "Producer Project",
          image: resolveBookmarkImage(entry),
          type: "Production",
        }));

      setBookmarkedListings(normalizeBookmarkBuckets({
        studios: studios.slice(0, 8),
        gigs: gigs.slice(0, 8),
        musicians: musicians.slice(0, 8),
        productions: productions.slice(0, 8),
      }));
    } catch (bookmarkError) {
      console.log("Error fetching bookmarks:", bookmarkError);
      setBookmarkedListings(createEmptyBookmarks());
    } finally {
      setLoadingBookmarks(false);
    }
  }, []);

  // Fetch user playlists
  const fetchPlaylists = useCallback(async (targetUserId: string) => {
    setLoadingPlaylists(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "list_user_playlists", user_id: targetUserId },
      });
      setUserPlaylists(data?.data || data?.playlists || []);
    } catch (_) {
      setUserPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  }, []);

  // Fetch user station (first/primary) and which playlists are on radio
  const fetchStation = useCallback(async (targetUserId: string) => {
    setLoadingStation(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "list_user_stations", user_id: targetUserId },
      });
      const stations = data?.data || [];
      const station = stations.length > 0 ? stations[0] : null;
      setUserStation(station);
      setRadioPlaylistIds(new Set(station?.slot_playlist_ids || []));
    } catch (_) {
      setUserStation(null);
      setRadioPlaylistIds(new Set());
    } finally {
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
  const fetchProfile = useCallback(async () => {
    if (profileFetchInFlightRef.current) {
      return;
    }

    profileFetchInFlightRef.current = true;
    try {
      setLoading(true);
      // Determine target ID: param OR current user
      let resolvedCurrentUserId = currentUserId;

      // Resolve the active user ID from auth when context is temporarily unavailable.
      if (!resolvedCurrentUserId && !isGuest) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.log("âŒ Profile - Auth error while resolving current user:", error.message);
        }
        if (user?.id) {
          resolvedCurrentUserId = user.id;
        }
      }

      let targetId = normalizedParamUserId || resolvedCurrentUserId;
      console.log("ðŸ‘¤ Profile - Param userId:", normalizedParamUserId);
      console.log("ðŸ‘¤ Profile - Context userId:", currentUserId);
      console.log("ðŸ‘¤ Profile - Resolved userId:", resolvedCurrentUserId);

      // If still no targetId, try to get from auth directly
      if (!targetId) {
        console.log("âš ï¸ Profile - No userId, fetching from auth...");
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.log("âŒ Profile - Auth error:", error.message);
        }
        if (user) {
          console.log("âœ… Profile - Got user from auth:", user.id);
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

        console.log("âŒ Profile - No user ID available, redirecting to login");
        // No user logged in and no userId param - redirect to login
        router.replace("/");
        return;
      }

      console.log("ðŸŽ¯ Profile - Fetching profile for:", targetId);

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

      const normalizedAvatarUrl =
        sanitizeAvatarUrl(profileData?.avatar_url) ||
        sanitizeAvatarUrl(profileStatsData?.avatar_url);

      setProfile({
        ...(profileStatsData || {}),
        ...profileData,
        avatar_url: normalizedAvatarUrl,
        skills: (skillsResult.data || []).map((row: any) => row.skill).filter(Boolean),
        genres: (genresResult.data || []).map((row: any) => row.genre).filter(Boolean),
        portfolio_urls: (portfolioResult.data || [])
          .map((row: any) => row.portfolio_url)
          .filter(Boolean),
      });

      await fetchBookmarkedListings(targetId, !!ownership && !isGuest);
      fetchPlaylists(targetId);
      fetchStation(targetId);
    } catch (e) {
      console.log("Error fetching profile:", e);
    } finally {
      profileFetchInFlightRef.current = false;
      setLoading(false);
    }
  }, [currentUserId, fetchBookmarkedListings, fetchPlaylists, fetchStation, isGuest, normalizedParamUserId]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchProfile();
      }
    }, [authLoading, fetchProfile]),
  );

  const MENU_ITEMS = [
    { label: "Edit Profile", icon: "person-outline", route: "/edit_profile" },
    { label: "Wallet", icon: "wallet-outline", route: "/wallet" },
    { label: "Identity Verification", icon: "card-outline", route: "/identity_verification" },
    { label: "Settings", icon: "settings-outline", route: "/settings" },
  ];

  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: "info",
    title: "",
    message: "",
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
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

    router.replace("/feed");
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
      void AsyncStorage.setItem("pending_reopen_listing_id", returnListingId)
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

    if (item?.type === "Production") {
      router.push({ pathname: "/producer_project_details", params: { project_id: itemId } });
      return;
    }

    try {
      await AsyncStorage.setItem("pending_reopen_listing_id", itemId);
    } catch {
      // Continue navigation even if cache write fails.
    }

    router.push("/feed");
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

  // Check if URL is a video
  const isVideo = (url: string) => {
    const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  const openMediaViewer = (url: string) => {
    setSelectedMedia(url);
    setMediaModalVisible(true);
  };

  const addMediaToPortfolio = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showAlert("warning", "Not Logged In", "You must be logged in.");
        return;
      }

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert("warning", "Permission needed", "Please allow access to your photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: true,
        quality: 0.5,
      });

      if (result.canceled || !result.assets[0]) return;

      const file = result.assets[0];
      setUploading(true);

      const fileExt = file.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${user.id}/portfolio/${Date.now()}.${fileExt}`;
      const mimeType =
        file.mimeType ||
        (fileExt === "mp4"
          ? "video/mp4"
          : `image/${fileExt === "jpg" ? "jpeg" : fileExt}`);

      console.log("ðŸ“¤ Uploading portfolio media...");
      console.log("ðŸ“ File URI:", file.uri);
      console.log("ðŸ“ File name:", fileName);

      const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
      const bytes = base64ToUint8Array(base64);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("portfolio")
        .upload(fileName, bytes, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.error("âŒ Upload failed:", uploadError);
        throw new Error(uploadError.message || "Upload failed");
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("portfolio")
        .getPublicUrl(fileName);

      console.log("âœ… Uploaded:", urlData.publicUrl);

      const { data: lastPortfolioRow, error: portfolioFetchError } = await supabase
        .from("profile_portfolio_urls")
        .select("sort_order")
        .eq("profile_id", user.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (portfolioFetchError) {
        throw portfolioFetchError;
      }

      const nextSortOrder =
        lastPortfolioRow?.sort_order !== undefined && lastPortfolioRow?.sort_order !== null
          ? Number(lastPortfolioRow.sort_order) + 1
          : 0;

      const { error: portfolioInsertError } = await supabase
        .from("profile_portfolio_urls")
        .upsert(
          {
            profile_id: user.id,
            portfolio_url: urlData.publicUrl,
            sort_order: nextSortOrder,
          },
          { onConflict: "profile_id,portfolio_url" },
        );

      if (portfolioInsertError) {
        throw portfolioInsertError;
      }

      // Refresh profile
      fetchProfile();
      showAlert("success", "Success", "Media added to portfolio!");
    } catch (e: any) {
      console.log("Upload error:", e);
      showAlert("warning", "Upload Failed", e.message || "Failed to upload media");
    } finally {
      setUploading(false);
    }
  };

  const portfolioCount = profile?.portfolio_urls?.length ?? 0;
  const profileAvatarUrl = sanitizeAvatarUrl(profile?.avatar_url);
  const viewedProfileId = typeof profile?.id === "string" ? profile.id.trim() : "";
  const profileFollowKey = buildSocialFollowKey("profile", viewedProfileId);
  const canFollowProfile = !isGuest && !isOwner && viewedProfileId.length > 0;

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

      showTopToast({
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
        ? "Add photos and short clips that show your sound, setup, or stage presence."
        : "No portfolio uploads yet.";
  const stationSlotCount = Number(
    userStation?.slot_count ??
      userStation?.slot_playlist_ids?.length ??
      radioPlaylistIds.size ??
      0,
  );
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
        : typeof userStation?.creator?.full_name === "string" &&
            userStation.creator.full_name.trim().length > 0
          ? userStation.creator.full_name.trim()
      : profile?.full_name || "Artist";
  const stationGenre =
    typeof userStation?.genre === "string" && userStation.genre.trim().length > 0
      ? userStation.genre.trim()
      : Array.isArray(profile?.genres) && typeof profile.genres[0] === "string"
        ? profile.genres[0]
        : "";
  const stationIsLive = hasStation && userStation?.is_active !== false && stationSlotCount > 0;
  const stationIsCurrentSource = Boolean(
    hasStation && activeStation?.id && activeStation.id === userStation?.id,
  );
  const canPlayStationFromProfile = stationIsLive && isTrackPlayerAvailable;
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

  const handleProfileFollowToggle = useCallback(async () => {
    if (!canFollowProfile || !viewedProfileId || isProfileFollowBusy) {
      return;
    }

    const wasFollowing = isProfileFollowing;
    setIsProfileFollowBusy(true);
    setIsProfileFollowing(!wasFollowing);

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

      showTopToast({
        type: "success",
        title: wasFollowing ? "Unfollowed" : "Following",
        message: "",
      });
    } catch (error: any) {
      setIsProfileFollowing(wasFollowing);
      showTopToast({
        type: "error",
        title: "Follow failed",
        message: error?.message || "Please try again.",
      });
    } finally {
      setIsProfileFollowBusy(false);
    }
  }, [canFollowProfile, isProfileFollowBusy, isProfileFollowing, viewedProfileId]);

  const playlistSectionHint = hasStation
    ? canManageStations
      ? "Tap the station card to listen live, then use the station controls to curate what stays on air."
      : "Tap the station card to listen live, or open any playlist card to view its tracks."
    : canManageStations
      ? "Admins can create a station and curate the live rotation for this profile."
      : isOwner && !isGuest
        ? "Stations are managed by admins. Contact an admin to create or update your radio station."
      : "Tap any playlist card to open it.";
  const stationPrimaryLabel = !hasStation
    ? canManageStations
      ? "Create Station"
      : "Admin Managed"
    : canPlayStationFromProfile
      ? stationIsCurrentSource
        ? isPlaying
          ? "Pause Live Audio"
          : "Resume Live Audio"
        : "Listen Live"
      : canManageStations
        ? "Manage Station"
        : "Open Station";
  const stationStatusLabel = stationIsLive
    ? stationIsCurrentSource && isPlaying
      ? "LIVE NOW"
      : "LIVE"
    : "OFFLINE";

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

  const handleStationPrimaryAction = async () => {
    if (!hasStation) {
      openStationScreen();
      return;
    }

    if (!canPlayStationFromProfile) {
      openStationScreen();
      return;
    }

    try {
      if (stationIsCurrentSource) {
        await togglePlayPause();
        return;
      }

      await tuneIn(userStation);
    } catch (stationError) {
      console.log("[profile] Failed to start station playback:", stationError);
      openStationScreen();
    }
  };

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
          rightComponent={(isOwner || isGuest) ? (
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
          ) : (
            <TouchableOpacity
              activeOpacity={1}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              onPress={openReportModal}
              style={[
                styles.headerReportBtn,
                { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border },
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
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
              {"\u2022"} {profile?.location || "Unknown"}
            </Text>

            {canFollowProfile ? (
              <TouchableOpacity
                activeOpacity={0.9}
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

            <View style={styles.genreRow}>
              {(profile?.genres || ["Rock", "Indie"]).map((genre: string) => (
                <View
                  key={genre}
                  style={[
                    styles.genreTag,
                    { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)" },
                  ]}
                >
                  <Text
                    style={[styles.genreText, { color: colors.text }]}
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
                  {profile?.review_count || 0}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Reviews
                </Text>
              </View>
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

            {/* TAB NAVIGATION */}
            <View style={[styles.tabContainer, { borderBottomColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }]}>
              <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("about")} style={[styles.tabButton, activeTab === "about" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                <Ionicons name={activeTab === "about" ? "grid" : "grid-outline"} size={22} color={activeTab === "about" ? colors.text : colors.textSecondary} />
              </TouchableOpacity>
              
              {profile?.role === "musician" && profile?.show_gig_statuses !== false && (
                <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("gigs")} style={[styles.tabButton, activeTab === "gigs" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                  <Ionicons name={activeTab === "gigs" ? "mic" : "mic-outline"} size={22} color={activeTab === "gigs" ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
              )}
              
              {isOwner && !isGuest && (
                <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("bookmarks")} style={[styles.tabButton, activeTab === "bookmarks" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                  <Ionicons name={activeTab === "bookmarks" ? "bookmark" : "bookmark-outline"} size={22} color={activeTab === "bookmarks" ? colors.text : colors.textSecondary} />
                </TouchableOpacity>
              )}

              <TouchableOpacity activeOpacity={1} onPress={() => setActiveTab("playlists")} style={[styles.tabButton, activeTab === "playlists" && { borderBottomColor: colors.text, borderBottomWidth: 2 }]}>
                <Ionicons name={activeTab === "playlists" ? "musical-notes" : "musical-notes-outline"} size={22} color={activeTab === "playlists" ? colors.text : colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* TAB CONTENT: GIGS */}
            {activeTab === "gigs" && profile?.role === "musician" && profile?.show_gig_statuses !== false && (
              <View style={styles.gigTimelineSection}>
                <View
                  style={[
                    styles.gigSearchWrap,
                    { backgroundColor: isDark ? "#1E293B" : "#F9FAFB", borderColor: colors.border },
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
                            <Text style={[styles.gigCardBudget, { color: colors.primary }]}>Budget: {"\u20B1"}{Number(gig.budget || 0).toLocaleString()}</Text>
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
                       {['all', 'studios', 'gigs', 'musicians', 'productions'].map((key) => {
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
                         const filterToKey: any = { 'studios': 'studios', 'gigs': 'gigs', 'musicians': 'musicians', 'productions': 'productions' };
                         let displayedItems: any[] = [];
                         if (bookmarkFilter === "all") {
                           displayedItems = [
                             ...safeBookmarkedListings.studios,
                             ...safeBookmarkedListings.gigs,
                             ...safeBookmarkedListings.musicians,
                             ...safeBookmarkedListings.productions,
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
                             let icon = item.type === "Studio" ? "business-outline" : item.type === "Gig" ? "mic-outline" : item.type === "Production" ? "albums-outline" : "people-outline";

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
            {activeTab === "playlists" && (
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
                      activeOpacity={0.8}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 10,
                        backgroundColor: colors.primary,
                      }}
                      onPress={() => router.push("/create_playlist" as any)}
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
                      activeOpacity={0.88}
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
                            {canManageStations ? "Admin managed station" : `${stationCreatorName}'s radio station`}
                          </Text>

                          <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }} numberOfLines={1}>
                            {stationSlotCount} playlist{stationSlotCount === 1 ? "" : "s"}
                            {stationGenre ? ` \u2022 ${stationGenre}` : ""}
                          </Text>
                        </View>

                        <Ionicons
                          name={canPlayStationFromProfile && stationIsCurrentSource && isPlaying ? "pause-circle" : "play-circle"}
                          size={30}
                          color={canPlayStationFromProfile ? colors.primary : colors.textSecondary}
                        />
                      </View>

                      <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 17, marginTop: 12 }}>
                        {canPlayStationFromProfile
                          ? "Tap this card to start listening live. Open the station screen anytime for more controls."
                            : canManageStations
                              ? "This station is ready to manage, but it needs at least one playlist on air before listeners can tune in."
                            : "Open the station to browse its rotation and live details."}
                      </Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingBottom: 14 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
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
                        <Ionicons
                          name={canPlayStationFromProfile && stationIsCurrentSource && isPlaying ? "pause" : canPlayStationFromProfile ? "radio" : "open-outline"}
                          size={16}
                          color={canPlayStationFromProfile ? "#fff" : colors.text}
                        />
                        <Text style={{ color: canPlayStationFromProfile ? "#fff" : colors.text, fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                          {stationPrimaryLabel}
                        </Text>
                      </TouchableOpacity>

                      {canPlayStationFromProfile && (
                        <TouchableOpacity
                          activeOpacity={0.85}
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
                        activeOpacity={0.85}
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
                            activeOpacity={0.82}
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
                              activeOpacity={0.6}
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
                              activeOpacity={0.85}
                              hitSlop={8}
                              onPress={() => router.push({
                                pathname: "/create_playlist" as any,
                                params: {
                                  edit_id: pl.id,
                                  return_to: "profile",
                                  return_user_id: viewedProfileId || currentUserId || normalizedParamUserId || "",
                                },
                              })}
                              disabled={playlistActionId === pl.id || authLoading}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 999,
                                backgroundColor: colors.primary,
                                opacity: playlistActionId === pl.id || authLoading ? 0.6 : 1,
                              }}
                            >
                              <Ionicons name="create-outline" size={14} color="#fff" />
                              <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>Edit Playlist</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.85}
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
                              <Text style={{ color: "#EF4444", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>
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
                        ? "Create your first playlist to start building your station rotation and featured profile section."
                        : "This profile has not shared any playlists yet."}
                    </Text>

                    {isOwner && !isGuest && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => router.push("/create_playlist" as any)}
                        style={{
                          marginTop: 16,
                          minHeight: 42,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          backgroundColor: colors.primary,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                        }}
                      >
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                          Create Playlist
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* TAB CONTENT: ABOUT/MEDIA */}
            {activeTab === "about" && (
              <View>
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

                    {(profile?.portfolio_urls || []).map((url: string, i: number) => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.gridItemTikTok, { borderColor: colors.border }]}
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
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}

          </View>

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
        </ScrollView>
        <Navbar />
      </View>
      <Modal
        visible={isMenuOpen}
        transparent={true}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => closeDrawer("modal-request-close")}
        onShow={() => {
          console.log("[ProfileMenu][mobile] Drawer modal onShow fired", {
            timestamp: new Date().toISOString(),
            isMenuOpen,
            activeTab,
            profileId: profile?.id ?? null,
          });
        }}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity activeOpacity={1} style={styles.drawerBackdrop} onPress={() => closeDrawer("drawer-backdrop")} />
          <View
            style={[
              styles.drawerContent,
              { backgroundColor: colors.background, borderLeftColor: colors.border },
            ]}
          >
            {/* Drawer top â€” avatar + name */}
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
                        console.log("[ProfileMenu][mobile] Drawer menu item selected", {
                          timestamp: new Date().toISOString(),
                          label: item.label,
                          route: item.route,
                          isMenuOpen,
                        });
                        closeDrawer(`menu-item:${item.route}`);
                        setTimeout(() => router.push(item.route as any), 250);
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
                ) : isGuest ? (
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {
                      console.log("[ProfileMenu][mobile] Guest drawer settings selected", {
                        timestamp: new Date().toISOString(),
                        route: "/settings",
                        isMenuOpen,
                      });
                      closeDrawer("guest-settings");
                      setTimeout(() => router.push("/settings"), 250);
                    }}
                    style={[styles.drawerMenuItem, { borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }]}
                  >
                    <View style={[styles.drawerMenuIcon, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
                      <Ionicons name="settings-outline" size={19} color={colors.primary} />
                    </View>
                    <Text style={[styles.drawerMenuLabel, { color: colors.text }]}>Settings</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
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
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
    marginBottom: 16,
    gap: 32,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
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
    paddingVertical: 14,
  },
  tabText: {
    fontSize: 12,
    marginTop: 4,
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
  gigCardBudget: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    marginTop: 2,
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
  gridVideoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  drawerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
    zIndex: 1,
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  drawerContent: {
    width: DRAWER_WIDTH,
    maxWidth: "80%" as any,
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
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

