import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
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

/* ── Quick-access shortcuts (Facebook-style row) ── */
const SHORTCUTS: { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; route: string; color: string }[] = [
  { label: "AI Suggest", icon: "sparkles-outline", route: "/ai_suggestions", color: "#3b82f6" },
];

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
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Create-post modal
  const [showCreate, setShowCreate] = useState(false);
  const [postBody, setPostBody] = useState("");
  const [postVisibility, setPostVisibility] = useState<"public" | "followers">("public");
  const [creating, setCreating] = useState(false);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const searchSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const bottomSheetRef = React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

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
      const [groupsResult, studiosResult, gigsResult, artistsResult] = await Promise.all([
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
          .select("id, full_name, avatar_url, address, role, created_at, updated_at")
          .eq("role", "musician")
          .neq("id", userId)
          .order("created_at", { ascending: false })
          .limit(24),
      ]);

      console.log("📊 Feed AI - Strict query results:",
        "groups:", (groupsResult.data || []).length, groupsResult.error?.message || "",
        "studios:", (studiosResult.data || []).length, studiosResult.error?.message || "",
        "gigs:", (gigsResult.data || []).length, gigsResult.error?.message || "",
        "artists:", (artistsResult.data || []).length, artistsResult.error?.message || "",
      );

      // If strict queries all return empty, try relaxed queries (drop permit_status)
      const strictTotal = (groupsResult.data || []).length + (studiosResult.data || []).length +
        (gigsResult.data || []).length + (artistsResult.data || []).length;

      let relaxedStudios: any[] = [];
      let relaxedGigs: any[] = [];
      let relaxedProfiles: any[] = [];

      if (strictTotal === 0) {
        console.log("📊 Feed AI - Strict queries empty, trying relaxed queries...");
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
            .select("id, full_name, avatar_url, address, role, created_at, updated_at")
            .neq("id", userId)
            .order("created_at", { ascending: false })
            .limit(24),
        ]);

        relaxedStudios = relaxedStudiosResult.data || [];
        relaxedGigs = relaxedGigsResult.data || [];
        relaxedProfiles = relaxedProfilesResult.data || [];

        console.log("📊 Feed AI - Relaxed query results:",
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

      const artistIds = finalArtists
        .map((row: any) => row?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0);

      let artistGenresById = new Map<string, string[]>();
      let artistSkillsById = new Map<string, string[]>();

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
        created_at: item.created_at || null,
        updated_at: item.updated_at || null,
        owner_id: item.owner_id || null,
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
      }));

      const allCandidates = [
        ...normalizedGroups,
        ...normalizedStudios,
        ...normalizedGigs,
        ...normalizedArtists,
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

      const localRanked = rankForYouOnDevice(allCandidates, profileSignals, AI_CARD_LIMIT);
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
        setAiCards(
          llmResult.recommendations
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

  /* ── Data fetching ── */
  const fetchFeed = useCallback(async (append = false, currentLength = 0) => {
    if (authLoading) {
      return;
    }

    if (!session) {
      setPosts([]);
      setAiCards([]);
      setAiFeedMessage("");
      setAiFeedProvider(geminiModelLabel);
      setFollowingIds(new Set());
      setHasMore(false);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }

    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: "get_feed",
          feed_type: tab === "following" ? "following" : "public",
          limit: FEED_PAGE_SIZE,
          offset: append ? currentLength : 0,
        },
      });

      let nextFollowingIds = new Set<string>();
      try {
        const { data: followingResponse } = await supabase.functions.invoke("manage-social-feed", {
          body: { action: "get_following" },
        });

        nextFollowingIds = new Set(
          (Array.isArray(followingResponse?.data) ? followingResponse.data : [])
            .map((row: any) => row?.followed_id)
            .filter((value: any): value is string => typeof value === "string" && value.length > 0),
        );
        setFollowingIds(nextFollowingIds);
      } catch {
        // Keep current follow state if follow-list lookup fails.
      }

      const page = Array.isArray(data?.data)
        ? data.data
            .map(normalizeFeedPost)
            .map((post: any) => ({
              ...post,
              is_following: nextFollowingIds.has(post.author_id),
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
  }, [authLoading, fetchAiCardsForYou, geminiModelLabel, session, tab]);

  useFocusEffect(useCallback(() => {
    if (authLoading) {
      return;
    }

    setLoading(true);
    fetchFeed();
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

  /* ── Actions ── */
  const handleCreatePost = async () => {
    if (!postBody.trim()) {
      setAlert({ type: "warning", title: "Empty Post", message: "Please write something." });
      return;
    }
    setCreating(true);
    try {
      const { data } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "create_post", content: postBody.trim(), visibility: postVisibility },
      });
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
      await supabase.functions.invoke("manage-social-feed", {
        body: currentReaction ? { action: "remove_reaction", post_id: postId } : { action: "react_to_post", post_id: postId, reaction_type: "like" },
      });
    } catch (e: any) {
      console.error("Reaction error:", e);
    }
  };

  const handleFollow = async (targetUserId: string, isFollowing: boolean) => {
    try {
      await supabase.functions.invoke("manage-social-feed", {
        body: { action: isFollowing ? "unfollow" : "follow", target_id: targetUserId },
      });
      showTopToast({ type: "success", title: isFollowing ? "Unfollowed" : "Following", message: "" });

      const nextIsFollowing = !isFollowing;
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (nextIsFollowing) {
          next.add(targetUserId);
        } else {
          next.delete(targetUserId);
        }
        return next;
      });

      // optimistic toggle in feed cards
      setPosts((prev) => prev.map((p) => (p.author_id === targetUserId ? { ...p, is_following: nextIsFollowing } : p)));

      if (tab === "following") {
        fetchFeed();
      }
    } catch (e: any) {
      console.error("Follow error:", e);
    }
  };

  /* ── Renderers ── */

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
    if (post?.__feedKind === "ai_card") {
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
            onPress={(item: any) => openListingDetails(item?.id || post.id)}
            showGigSummary={false}
            variant="vertical"
            style={{ width: "100%" }}
          />
        </View>
      );
    }

    const cardBg = isDark ? "#1E293B" : "#FFFFFF";
    const divider = isDark ? "#334155" : "#E2E8F0";
    const isFollowingAuthor = Boolean(post.is_following || followingIds.has(post.author_id));
    return (
      <View style={[styles.postCard, { backgroundColor: cardBg }]}>
        {/* Author header */}
        <View style={styles.authorRow}>
          <TouchableOpacity style={styles.avatarWrap}>
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
            <TouchableOpacity onPress={() => handleFollow(post.author_id, isFollowingAuthor)} style={[styles.followBtn, { backgroundColor: isFollowingAuthor ? "transparent" : colors.primary, borderColor: isFollowingAuthor ? colors.border : colors.primary }]}>
              <Text style={{ color: isFollowingAuthor ? colors.textSecondary : "#fff", fontSize: moderateScale(11), fontWeight: "600" }}>{isFollowingAuthor ? "Following" : "Follow"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Body */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push({ pathname: "/post_details", params: { post_id: post.id } })}>
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
                  <CachedImage key={idx} uri={m.url} style={styles.mediaGridItem} />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Linked items */}
        {post.linked_playlist && (
          <TouchableOpacity style={[styles.linkedCard, { backgroundColor: isDark ? "#1a2436" : "#f0f5ff", borderColor: divider }]} onPress={() => router.push({ pathname: "/playlist_details", params: { playlist_id: post.linked_playlist.id } })}>
            <Ionicons name="musical-notes" size={16} color={colors.primary} />
            <Text style={[styles.linkedText, { color: colors.primary }]} numberOfLines={1}>{post.linked_playlist.title}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
        {post.linked_product && (
          <TouchableOpacity style={[styles.linkedCard, { backgroundColor: isDark ? "#1a2436" : "#f0fff4", borderColor: divider }]} onPress={() => router.push({ pathname: "/product_details", params: { product_id: post.linked_product.id } })}>
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

        {/* Action bar (Like · Comment · Share) */}
        <View style={[styles.actionBar, { borderTopColor: divider }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleReaction(post.id, post.my_reaction)}>
            <Ionicons name={post.my_reaction ? "heart" : "heart-outline"} size={20} color={post.my_reaction ? "#ef4444" : colors.textSecondary} />
            <Text style={[styles.actionLabel, { color: post.my_reaction ? "#ef4444" : colors.textSecondary }]}>Like</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: "/post_details", params: { post_id: post.id } })}>
            <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Comment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
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
        {/* ── Search bar trigger ── */}
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
            activeOpacity={0.9}
          >
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginLeft: 8 }}>
              Search musicians, studios, gigs
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Shortcut row ── */}
        <View style={[styles.shortcutRow, { backgroundColor: cardBg }]}>
          {SHORTCUTS.map((s) => (
            <TouchableOpacity key={s.label} style={styles.shortcutItem} onPress={() => router.push(s.route as any)}>
              <View style={[styles.shortcutIcon, { backgroundColor: s.color + "18" }]}>
                <Ionicons name={s.icon} size={20} color={s.color} />
              </View>
              <Text style={[styles.shortcutLabel, { color: colors.textSecondary }]} numberOfLines={1}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Feed tabs ── */}
        <View style={[styles.tabRow, { backgroundColor: cardBg, borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
          {(["for_you", "following"] as FeedTab[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t)}>
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
    return posts;
  }, [aiCards, loading, posts, tab]);

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
                  ? "Follow musicians, bands, and producers to see their posts and updates here."
                  : "Create a group, add a studio listing, or post a gig to start seeing AI-powered recommendations."}
              </Text>

              {tab === "for_you" ? (
                <View style={styles.emptyActions}>
                  <TouchableOpacity
                    style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => router.push("/add_group" as any)}
                  >
                    <Ionicons name="people" size={18} color="#fff" />
                    <Text style={styles.emptyActionBtnText}>Create Group</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emptyActionBtn, { backgroundColor: isDark ? "#334155" : "#F1F5F9" }]}
                    onPress={() => router.push("/add_studio" as any)}
                  >
                    <Ionicons name="business" size={18} color={colors.primary} />
                    <Text style={[styles.emptyActionBtnTextAlt, { color: colors.text }]}>Add Studio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.emptyActionBtn, { backgroundColor: isDark ? "#334155" : "#F1F5F9" }]}
                    onPress={() => router.push("/add_gig" as any)}
                  >
                    <Ionicons name="musical-notes" size={18} color={colors.primary} />
                    <Text style={[styles.emptyActionBtnTextAlt, { color: colors.text }]}>Post Gig</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
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
              <TouchableOpacity onPress={() => setShowCreate(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Post</Text>
              <TouchableOpacity
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
                <TouchableOpacity style={[styles.visibilityChip, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]} onPress={() => setPostVisibility(postVisibility === "public" ? "followers" : "public")}>
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

  /* Shortcuts */
  shortcutRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 10, paddingHorizontal: 8, marginTop: 6 },
  shortcutItem: { alignItems: "center", width: 60 },
  shortcutIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  shortcutLabel: { fontSize: moderateScale(10), textAlign: "center" },

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
    borderRadius: 14,
    overflow: "hidden",
  },
  aiCardHeader: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
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
    paddingHorizontal: 12,
    paddingBottom: 8,
    fontSize: moderateScale(12),
    lineHeight: 18,
  },

  /* Post card */
  postCard: { marginTop: 0 },
  authorRow: { flexDirection: "row", alignItems: "center", padding: 14, paddingBottom: 6 },
  avatarWrap: {},
  authorAvatar: { width: 40, height: 40, borderRadius: 20 },
  authorName: { fontSize: moderateScale(14), fontWeight: "700" },
  postTime: { fontSize: moderateScale(11) },
  followBtn: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  postBody: { fontSize: moderateScale(14), lineHeight: 22, paddingHorizontal: 14, paddingBottom: 10 },

  /* Media */
  mediaContainer: { marginHorizontal: 0 },
  mediaSingle: { width: "100%", height: 280, resizeMode: "cover" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap" },
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
});
