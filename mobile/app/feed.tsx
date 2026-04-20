import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  InteractionManager,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import ListingCard from "../src/components/ListingCard";
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import Navbar from "../src/components/navbar";
import SearchBottomSheet from "../src/components/SearchBottomSheet";
import Skeleton from "../src/components/Skeleton";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";
import {
  buildSocialFollowKey,
  getListingSocialFollowTarget,
  normalizeSocialFollowTargetType,
} from "../src/utils/socialFollow";
import type { SocialFollowTargetType } from "../src/utils/socialFollow";
import {
  getGeminiFlashLiteInfo,
  rerankHomeFeedWithGeminiFlashLite,
} from "../src/services/groqModelRouter";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type FeedTab = "for_you" | "following";
const FEED_PAGE_SIZE = 20;
const AI_CARD_LIMIT = 20;
const KNOWN_FEED_MEDIA_BUCKETS = [
  "post-media",
  "posts",
  "images",
  "listings",
  "documents",
  "avatars",
];

const resolveFeedMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
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

const normalizeFollowingEntity = (row: any) => {
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

    return {
      __feedKind: "following_entity",
      followed_type: "group" as const,
      id,
      name: group?.name || formatGroupTypeLabel(group?.group_type),
      avatar_url: images[0] || "",
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
    avatar_url: resolveFeedMediaUrl(followed?.avatar_url || ""),
    role: followed?.role || "",
    created_at: row?.created_at || null,
  };
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

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, isGuest, loading: authLoading } = useAuth();
  const geminiModelLabel = getGeminiFlashLiteInfo().modelLabel;

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [aiCards, setAiCards] = useState<any[]>([]);
  const [aiFeedMessage, setAiFeedMessage] = useState("");
  const [aiFeedProvider, setAiFeedProvider] = useState(geminiModelLabel);
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

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const searchSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const bottomSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [pendingReopenListingId, setPendingReopenListingId] = useState<string | null>(null);

  const presentModalWithRetry = useCallback((modalRef: { current: any }) => {
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

  const fetchAiCardsForYou = useCallback(async () => {
    if (!session || !userId) {
      setAiCards([]);
      setAiFeedProvider(geminiModelLabel);
      setAiFeedMessage("");
      return;
    }

    setIsAiCardsLoading(true);

    try {
      // Primary queries with strict filters (matching Home)
      const [groupsResult, studiosResult, gigsResult, artistsResult, projectsResult, teamsResult] = await Promise.all([
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
          .from("producer_projects_with_summary")
          .select("*")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("production_teams")
          .select("id, owner_id, name, description, logo_url, created_at, updated_at")
          .order("created_at", { ascending: false })
          .limit(24),
      ]);

      console.log("ðŸ“Š Feed AI - Strict query results:",
        "groups:", (groupsResult.data || []).length, groupsResult.error?.message || "",
        "studios:", (studiosResult.data || []).length, studiosResult.error?.message || "",
        "gigs:", (gigsResult.data || []).length, gigsResult.error?.message || "",
        "artists:", (artistsResult.data || []).length, artistsResult.error?.message || "",
        "projects:", (projectsResult.data || []).length, projectsResult.error?.message || "",
        "teams:", (teamsResult.data || []).length, teamsResult.error?.message || "",
      );

      // If strict queries all return empty, try relaxed queries (drop permit_status)
      const strictTotal = (groupsResult.data || []).length + (studiosResult.data || []).length +
        (gigsResult.data || []).length + (artistsResult.data || []).length + (projectsResult.data || []).length + (teamsResult.data || []).length;

      let relaxedStudios: any[] = [];
      let relaxedGigs: any[] = [];
      let relaxedProfiles: any[] = [];

      if (strictTotal === 0) {
        console.log("ðŸ“Š Feed AI - Strict queries empty, trying relaxed queries...");
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

        console.log("ðŸ“Š Feed AI - Relaxed query results:",
          "studios:", relaxedStudios.length,
          "gigs:", relaxedGigs.length,
          "profiles:", relaxedProfiles.length,
        );
      }

      // Use strict results if available, else relaxed fallback
      const finalGroups = groupsResult.data || [];
      const finalStudios = (studiosResult.data || []).length > 0 ? studiosResult.data! : relaxedStudios;
      const finalGigs = (gigsResult.data || []).length > 0 ? gigsResult.data! : relaxedGigs;
      const finalArtists = (artistsResult.data || []).length > 0 ? artistsResult.data! : relaxedProfiles;
      const finalProjects = projectsResult.data || [];
      const finalTeams = teamsResult.data || [];

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

      const normalizedProjects = finalProjects.map((item: any) => ({
        id: item.id,
        type: "Project",
        name: item.title || "Untitled Project",
        image: item.cover_image_url || null,
        images: item.cover_image_url ? [item.cover_image_url] : [],
        rating: 0,
        review_count: 0,
        location: item.location || "",
        genre: item.genre || "",
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
        owner_name: item.owner_name || null,
        cover_image_url: item.cover_image_url || null,
        social_follow_target_id: item.owner_id || null,
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
        ...normalizedProjects,
        ...normalizedTeams,
      ];

      if (allCandidates.length === 0) {
        setAiCards([]);
        setAiFeedProvider("");
        setAiFeedMessage("");
        return;
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
      const llmResult = await rerankHomeFeedWithGeminiFlashLite({
        candidates: localRanked,
        profileSignals,
        limit: AI_CARD_LIMIT,
      });

      if (isGroqQuotaExhaustedMessage(llmResult.message)) {
        setAiCards(localRanked.slice(0, AI_CARD_LIMIT).map((item) => ({ ...item, __feedKind: "ai_card" })));
        setAiFeedProvider("Normal Feed");
        setAiFeedMessage("Groq free-tier limit reached. Showing normal recommendation cards.");
        return;
      }

      if (llmResult.aiPowered && llmResult.recommendations.length > 0) {
        const ensuredRecommendations = ensureRecommendationTypeCoverage(
          llmResult.recommendations,
          normalizedTeams,
          "Production",
          AI_CARD_LIMIT,
          normalizedTeams.length > 0 ? 1 : 0,
        );

        setAiCards(
          ensuredRecommendations
            .slice(0, AI_CARD_LIMIT)
            .map((item: any) => ({ ...item, __feedKind: "ai_card" })),
        );
        setAiFeedProvider(llmResult.aiProvider || geminiModelLabel);
        setAiFeedMessage(llmResult.message || `Realtime For You cards reranked by ${geminiModelLabel}.`);
        return;
      }

      setAiCards(localRanked.slice(0, AI_CARD_LIMIT).map((item) => ({ ...item, __feedKind: "ai_card" })));
      setAiFeedProvider(llmResult.aiProvider || "Local Ranker");
      setAiFeedMessage(llmResult.message || "Using local ranking for Feed cards.");
    } catch (error: any) {
      console.error("Feed AI cards error:", error);
      setAiCards([]);
      setAiFeedProvider("Normal Feed");
      setAiFeedMessage(error?.message || "Unable to load recommendation cards right now.");
    } finally {
      setIsAiCardsLoading(false);
    }
  }, [geminiModelLabel, session, userId]);

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
      throw error;
    }

    const rows = Array.isArray(followingResponse?.data) ? followingResponse.data : [];
    const keys = new Set<string>(
      rows
        .map((row: any) => buildSocialFollowKey(row?.followed_type, row?.followed_id))
        .filter((value: string) => value.length > 0),
    );
    const entities = rows
      .map(normalizeFollowingEntity)
      .filter((value: any) => value !== null);

    setFollowingKeys(keys);
    setFollowingEntities(entities);

    return { keys, entities };
  }, [session]);

  /* â”€â”€ Data fetching â”€â”€ */
  const fetchFeed = useCallback(async (append = false, currentLength = 0) => {
    if (authLoading) {
      return;
    }

    if (!session) {
      setPosts([]);
      setAiCards([]);
      setAiFeedMessage("");
      setAiFeedProvider(geminiModelLabel);
      setFollowingKeys(new Set());
      setFollowingEntities([]);
      setFollowBusyByKey({});
      setHasMore(false);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: "get_feed",
          feed_type: tab === "following" ? "following" : "public",
          limit: FEED_PAGE_SIZE,
          offset: append ? currentLength : 0,
        },
      });

      if (error) {
        throw error;
      }

      let nextFollowingKeys = new Set<string>();
      try {
        const followingGraph = await loadFollowingGraph();
        nextFollowingKeys = followingGraph.keys;
      } catch {
        // Keep current follow state if follow-list lookup fails.
      }

      const page = Array.isArray(data?.data)
        ? data.data
            .map(normalizeFeedPost)
            .map((post: any) => ({
              ...post,
              is_following: nextFollowingKeys.has(
                buildSocialFollowKey("profile", post.author_id),
              ),
            }))
        : [];
      if (append) {
        setPosts((prev) => [...prev, ...page]);
      } else {
        setPosts(page);

        if (tab === "for_you") {
          if (page.length === 0) {
            await fetchAiCardsForYou();
          } else {
            setAiCards([]);
            setAiFeedMessage("");
          }
        } else {
          setAiCards([]);
          setAiFeedMessage("");
        }
      }

      setHasMore(page.length === FEED_PAGE_SIZE);
    } catch (e: any) {
      console.error("Feed fetch error:", e);
      setHasMore(false);

      if (!append && tab === "for_you") {
        try {
          setAiFeedMessage("Social feed is unavailable. Loading recommendation cards.");
          await fetchAiCardsForYou();
        } catch (aiError) {
          console.error("Fallback AI cards error:", aiError);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [authLoading, fetchAiCardsForYou, geminiModelLabel, loadFollowingGraph, session, tab]);

  useFocusEffect(useCallback(() => {
    if (authLoading) {
      return;
    }

    setLoading(true);
    fetchFeed();

    const restorePendingReopen = async () => {
      const storedListingId = await AsyncStorage.getItem("pending_reopen_listing_id");

      if (storedListingId && storedListingId.length > 0) {
        setSelectedListingId(storedListingId);
        setPendingReopenListingId(storedListingId);
        await AsyncStorage.removeItem("pending_reopen_listing_id");
      }
    };

    void restorePendingReopen();
  }, [authLoading, fetchFeed]));

  const onRefresh = () => {
    if (authLoading) {
      return;
    }

    setRefreshing(true);
    fetchFeed();
  };

  const loadMore = () => {
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
    fetchFeed(true, posts.length);
  };

  /* â”€â”€ Actions â”€â”€ */
  const handleCreatePost = async () => {
    if (!postBody.trim()) {
      setAlert({ type: "warning", title: "Empty Post", message: "Please write something." });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "create_post", content: postBody.trim(), visibility: postVisibility },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        showTopToast({ type: "success", title: "Posted!", message: "Your post is live." });
        setShowCreate(false);
        setPostBody("");
        fetchFeed();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create post" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setCreating(false);
    }
  };

  const handleReaction = async (postId: string, currentReaction: string | null) => {
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
  };

  const handleFollow = async (
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

      showTopToast({ type: "success", title: isFollowing ? "Unfollowed" : "Following", message: "" });

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

      if (tab === "following") {
        fetchFeed();
      } else if (nextIsFollowing) {
        void loadFollowingGraph();
      }
    } catch (e: any) {
      console.error("Follow error:", e);
      showTopToast({
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
  };

  /* â”€â”€ Renderers â”€â”€ */

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(dateStr).toLocaleDateString();
  };

  const renderPost = ({ item: post }: { item: any }) => {
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
          <CachedImage
            uri={post.avatar_url || "https://via.placeholder.com/64"}
            style={styles.followingProfileAvatar}
          />
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
      const canFollowSuggestion = Boolean(followTarget && followKey);
      const isFollowingSuggestion = followKey ? followingKeys.has(followKey) : false;
      const isFollowBusy = followKey ? followBusyByKey[followKey] === true : false;

      return (
        <View style={[styles.aiCardContainer, { backgroundColor: isDark ? "#1E293B" : "#FFFFFF" }]}>
          <View style={styles.aiCardHeader}>
            <View style={[styles.aiChip, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}>
              <Ionicons name="sparkles" size={12} color={colors.primary} />
              <Text style={[styles.aiChipText, { color: colors.primary }]}>
                {aiFeedProvider || "AI Feed"}
              </Text>
            </View>
            <Text style={[styles.aiScoreText, { color: colors.textSecondary }]}>
              {Math.round(Number(post?.similarity || 0) * 100)}% match
            </Text>
          </View>

          {post?.aiReason ? (
            <Text style={[styles.aiReasonText, { color: colors.textSecondary }]} numberOfLines={2}>
              {post.aiReason}
            </Text>
          ) : null}

          <ListingCard
            item={post}
            onPress={(item: any) => {
              const nextId = item?.id || post.id;
              if (item?.type === "Project" && nextId) {
                router.push({ pathname: "/producer_project_details", params: { project_id: nextId } });
                return;
              }

              if (item?.type === "Production" && nextId) {
                router.push({ pathname: "/production_team", params: { teamId: nextId } });
                return;
              }

              openListingDetails(nextId);
            }}
            showGigSummary={false}
            variant="vertical"
            style={{ width: "100%", marginBottom: 0 }}
            actionSlot={
              canFollowSuggestion ? (
                <TouchableOpacity
                  activeOpacity={1}
                  disabled={isFollowBusy}
                  onPress={() => {
                    if (!followTarget) return;
                    handleFollow(followTarget.id, followTarget.type, isFollowingSuggestion);
                  }}
                  style={[
                    styles.aiFollowBtn,
                    {
                      backgroundColor: isFollowingSuggestion ? (isDark ? "#0F172A" : "#FFFFFF") : colors.primary,
                      borderColor: isFollowingSuggestion ? (isDark ? "#334155" : "#CBD5E1") : colors.primary,
                      opacity: isFollowBusy ? 0.7 : 1,
                    },
                  ]}
                >
                  {isFollowBusy ? (
                    <ActivityIndicator size="small" color={isFollowingSuggestion ? colors.textSecondary : "#FFFFFF"} />
                  ) : (
                    <Text
                      style={[
                        styles.aiFollowText,
                        { color: isFollowingSuggestion ? colors.textSecondary : "#FFFFFF" },
                      ]}
                    >
                      {isFollowingSuggestion ? "Following" : "Follow"}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
        </View>
      );
    }

    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    const divider = isDark ? "#334155" : "#E2E8F0";
    const isFollowingAuthor = Boolean(
      post.is_following || followingKeys.has(buildSocialFollowKey("profile", post.author_id)),
    );
    return (
      <View style={[styles.postCard, { backgroundColor: cardBg }]}>
        {/* Author header */}
        <View style={styles.authorRow}>
          <TouchableOpacity activeOpacity={1} style={styles.avatarWrap}>
            <CachedImage uri={post.author_avatar || "https://via.placeholder.com/40"} style={styles.authorAvatar} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.authorName, { color: colors.text }]}>{post.author_name || "User"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.postTime, { color: colors.textSecondary }]}>{timeAgo(post.created_at)}</Text>
              <Ionicons name={post.visibility === "followers" ? "people" : "globe-outline"} size={11} color={colors.textSecondary} />
            </View>
          </View>
          {post.author_id !== userId && (
            <TouchableOpacity activeOpacity={1} onPress={() => handleFollow(post.author_id, "profile", isFollowingAuthor)} style={[styles.followBtn, { backgroundColor: isFollowingAuthor ? "transparent" : colors.primary, borderColor: isFollowingAuthor ? colors.border : colors.primary }]}>
              <Text style={{ color: isFollowingAuthor ? colors.textSecondary : "#fff", fontSize: moderateScale(11), fontWeight: "600" }}>{isFollowingAuthor ? "Following" : "Follow"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Body */}
        <TouchableOpacity activeOpacity={1} onPress={() => router.push({ pathname: "/post_details", params: { post_id: post.id } })}>
          <Text style={[styles.postBody, { color: colors.text }]}>{post.body}</Text>
        </TouchableOpacity>

        {/* Media gallery */}
        {post.media && post.media.length > 0 && (
          <View style={styles.mediaContainer}>
            {post.media.length === 1 ? (
              <CachedImage uri={post.media[0].url} style={styles.mediaSingle} />
            ) : (
              <View style={styles.mediaGrid}>
                {post.media.slice(0, 4).map((m: any, idx: number) => (
                  <CachedImage key={idx} uri={m.url} style={[styles.mediaGridItem, { borderWidth: 1, borderColor: cardBg }]} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Linked items */}
        {post.linked_playlist && (
          <TouchableOpacity activeOpacity={1} style={[styles.linkedCard, { backgroundColor: isDark ? "#1a2436" : "#f0f5ff", borderColor: divider }]} onPress={() => router.push({ pathname: "/playlist_details", params: { playlist_id: post.linked_playlist.id } })}>
            <Ionicons name="musical-notes" size={16} color={colors.primary} />
            <Text style={[styles.linkedText, { color: colors.primary }]} numberOfLines={1}>{post.linked_playlist.title}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        {post.linked_product && (
          <TouchableOpacity activeOpacity={1} style={[styles.linkedCard, { backgroundColor: isDark ? "#1a2436" : "#f0fff4", borderColor: divider }]} onPress={() => router.push({ pathname: "/product_details", params: { product_id: post.linked_product.id } })}>
            <Ionicons name="cart" size={16} color="#22c55e" />
            <Text style={[styles.linkedText, { color: "#22c55e" }]} numberOfLines={1}>{post.linked_product.title}</Text>
            <Ionicons name="chevron-forward" size={14} color="#22c55e" />
          </TouchableOpacity>
        )}

        {/* Reaction summary */}
        {(post.reaction_count > 0 || post.comment_count > 0) && (
          <View style={[styles.reactionSummary, { borderBottomColor: divider }]}>
            {post.reaction_count > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={styles.likeBadge}><Ionicons name="heart" size={10} color="#fff" /></View>
                <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{post.reaction_count}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {post.comment_count > 0 && <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{post.comment_count} comments</Text>}
          </View>
        )}

        {/* Action bar (Like Â· Comment Â· Share) */}
        <View style={[styles.actionBar, { borderTopColor: divider }]}>
          <TouchableOpacity activeOpacity={1} style={styles.actionBtn} onPress={() => handleReaction(post.id, post.my_reaction)}>
            <Ionicons name={post.my_reaction ? "heart" : "heart-outline"} size={20} color={post.my_reaction ? "#ef4444" : colors.textSecondary} />
            <Text style={[styles.actionLabel, { color: post.my_reaction ? "#ef4444" : colors.textSecondary }]}>Like</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={1} style={styles.actionBtn} onPress={() => router.push({ pathname: "/post_details", params: { post_id: post.id } })}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Comment</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={1} style={styles.actionBtn}>
            <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHeader = () => {
    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    return (
      <>
        {/* â”€â”€ Search bar trigger â”€â”€ */}
        <View style={[styles.composerRow, { backgroundColor: cardBg }]}>
          <TouchableOpacity
            style={[
              styles.composerInput,
              {
                backgroundColor: isDark ? "#0F172A" : "#F1F5F9",
                borderColor: isDark ? "#334155" : "#E2E8F0",
              },
            ]}
            onPress={openSearchSheet}
            activeOpacity={1}
          >
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginLeft: 8 }}>
              Search musicians, studios, gigs
            </Text>
          </TouchableOpacity>
        </View>

        {/* â”€â”€ Feed tabs â”€â”€ */}
        <View style={[styles.tabRow, { backgroundColor: cardBg, borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
          {(["for_you", "following"] as FeedTab[]).map((t) => (
            <TouchableOpacity activeOpacity={1} key={t} style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
              <Ionicons name={t === "for_you" ? "flame-outline" : "people-outline"} size={18} color={tab === t ? colors.primary : colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textSecondary }]}>{t === "for_you" ? "For You" : "Following"}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "for_you" && posts.length === 0 && (isAiCardsLoading || (aiCards.length > 0 && aiFeedMessage)) ? (
          <View style={[styles.aiStatusBanner, { backgroundColor: cardBg, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
            <View style={[styles.aiStatusDot, { backgroundColor: isAiCardsLoading ? "#F59E0B" : "#10B981" }]} />
            <Text style={[styles.aiStatusText, { color: colors.textSecondary }]} numberOfLines={2}>
              {isAiCardsLoading
                ? `Building ${geminiModelLabel} Feed cards...`
                : aiFeedMessage || `Feed cards powered by ${aiFeedProvider || geminiModelLabel}.`}
            </Text>
          </View>
        ) : null}
      </>
    );
  };

  const feedItems = useMemo(() => {
    if (loading) return [];
    if (tab === "for_you" && posts.length === 0 && aiCards.length > 0) {
      return aiCards;
    }
    if (tab === "following" && followingEntities.length > 0) {
      const entitiesWithoutPosts = followingEntities.filter(
        (entity) => entity.followed_type !== "profile" || !posts.some((post) => post.author_id === entity.id),
      );

      if (entitiesWithoutPosts.length > 0) {
        return [...entitiesWithoutPosts, ...posts];
      }
    }
    return posts;
  }, [aiCards, followingEntities, loading, posts, tab]);

  const isShowingAiCards = tab === "for_you" && posts.length === 0 && aiCards.length > 0;

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
    <View style={[styles.container, { backgroundColor: isDark ? "#0F172A" : "#F0F2F5" }]}>
      <Header title="MusikaLokal" />
      <FlatList
        data={feedItems}
        keyExtractor={(item, index) => `${item.id || "row"}-${item.__feedKind || "post"}-${index}`}
        renderItem={renderPost}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} width={SCREEN_WIDTH - 32} height={180} style={{ marginBottom: 10, borderRadius: 12 }} />)}
            </View>
          ) : isAiCardsLoading ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              {[1, 2].map((i) => <Skeleton key={i} width={SCREEN_WIDTH - 32} height={180} style={{ marginBottom: 10, borderRadius: 12 }} />)}
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
                  : "Your For You Feed is Empty"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {tab === "following"
                  ? "Follow musicians, groups, and duos to see their updates here. Followed profiles and groups will also appear until they have posts."
                  : "Create a group, add a studio listing, or post a gig to start seeing AI-powered recommendations."}
              </Text>

              {tab === "for_you" ? (
                <View style={styles.emptyActions}>
                  <TouchableOpacity activeOpacity={1}
                    style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push("/add_group" as any)}
                  >
                    <Ionicons name="people" size={18} color="#fff" />
                    <Text style={styles.emptyActionBtnText}>Create Group</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={1}
                    style={[styles.emptyActionBtn, { backgroundColor: isDark ? "#334155" : "#F1F5F9" }]}
                    onPress={() => router.push("/add_studio" as any)}
                  >
                    <Ionicons name="business" size={18} color={colors.primary} />
                    <Text style={[styles.emptyActionBtnTextAlt, { color: colors.text }]}>Add Studio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={1}
                    style={[styles.emptyActionBtn, { backgroundColor: isDark ? "#334155" : "#F1F5F9" }]}
                    onPress={() => router.push("/add_gig" as any)}
                  >
                    <Ionicons name="musical-notes" size={18} color={colors.primary} />
                    <Text style={[styles.emptyActionBtnTextAlt, { color: colors.text }]}>Post Gig</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
                  onPress={openSearchSheet}
                >
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={styles.emptyActionBtnText}>Find Musicians</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
        ListFooterComponent={
          <>
            {loadingMore && <ActivityIndicator style={{ marginVertical: 20 }} color={colors.primary} />}
            <View style={{ height: 100 }} />
          </>
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: isShowingAiCards ? 10 : 8 }} />}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Create Post Modal */}
      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowCreate(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Post</Text>
              <TouchableOpacity activeOpacity={1}
                style={[styles.postBtn, { backgroundColor: colors.primary, opacity: creating || !postBody.trim() ? 0.5 : 1 }]}
                onPress={handleCreatePost}
                disabled={creating || !postBody.trim()}
              >
                {creating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postBtnText}>Post</Text>}
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
        onClose={() => {}}
        onItemPress={(id) => openListingDetails(id)}
        onFollowChanged={fetchFeed}
      />

      <ListingDetailsSheet
        ref={bottomSheetRef}
        listingId={selectedListingId}
        onDismiss={() => {}}
      />

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Composer prompt */
  composerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  composerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  composerInput: { flex: 1, height: 38, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center", flexDirection: "row", alignItems: "center" },
  composerMediaBtn: { padding: 4 },

  /* Tabs */
  tabRow: { flexDirection: "row", borderBottomWidth: 1, marginTop: 6 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  tabText: { fontSize: moderateScale(13), fontWeight: "600" },

  aiStatusBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  aiStatusText: {
    flex: 1,
    fontSize: moderateScale(11),
    fontWeight: "500",
  },

  aiCardContainer: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  aiCardHeader: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  aiChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  aiChipText: {
    fontSize: moderateScale(10),
    fontWeight: "700",
  },
  aiScoreText: {
    fontSize: moderateScale(10),
    fontWeight: "600",
  },
  aiReasonText: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    fontSize: moderateScale(12),
    lineHeight: 18,
  },
  aiFollowBtn: {
    height: 26,
    minWidth: 76,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  aiFollowText: {
    fontSize: moderateScale(10),
    fontWeight: "700",
    textTransform: "uppercase",
  },

  /* Post card */
  postCard: {
    marginTop: 0,
    marginHorizontal: 16,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  authorRow: { flexDirection: "row", alignItems: "center", padding: 14, paddingBottom: 6 },
  avatarWrap: {},
  authorAvatar: { width: 40, height: 40, borderRadius: 20 },
  authorName: { fontSize: moderateScale(14), fontWeight: "700" },
  postTime: { fontSize: moderateScale(11) },
  followBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  postBody: { fontSize: moderateScale(14), lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 },

  /* Media */
  mediaContainer: { marginHorizontal: 14, marginTop: 4, marginBottom: 8 },
  mediaSingle: { width: "100%", height: 280, resizeMode: "cover", borderRadius: 12 },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", borderRadius: 12, overflow: "hidden" },
  mediaGridItem: { width: "50%", height: 180 },

  /* Linked items */
  linkedCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 14, marginVertical: 6, padding: 10, borderWidth: 1, borderRadius: 10, gap: 8 },
  linkedText: { fontSize: moderateScale(12), fontWeight: "600", flex: 1 },

  /* Reaction summary row */
  reactionSummary: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 0.5 },
  likeBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  summaryText: { fontSize: moderateScale(12) },

  /* Action bar */
  actionBar: { flexDirection: "row", borderTopWidth: 0.5, paddingVertical: 4 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 5 },
  actionLabel: { fontSize: moderateScale(12), fontWeight: "500" },

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
