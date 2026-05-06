import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import { normalizeVisibleInput } from "../src/components/modal";
import Navbar from "../src/components/navbar";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";

type FeedTab = "for_you" | "following";

type ForYouTabIconProps = {
  active: boolean;
  primaryColor: string;
  mutedColor: string;
};

function ForYouTabIcon({ active, primaryColor, mutedColor }: ForYouTabIconProps) {
  const iconColor = active ? "#FFFFFF" : mutedColor;

  return (
    <View
      style={[
        styles.forYouTabIcon,
        {
          borderColor: active ? "#FFFFFF" : mutedColor,
          backgroundColor: active ? "rgba(255,255,255,0.18)" : "transparent",
        },
      ]}
    >
      <View style={[styles.forYouTabIconCenter, { backgroundColor: active ? "#FFFFFF" : primaryColor }]} />
      <Ionicons
        name={active ? "sparkles" : "sparkles-outline"}
        size={12}
        color={iconColor}
        style={styles.forYouTabIconSparkle}
      />
    </View>
  );
}

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
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const togglePreview = useCallback(() => {
    setIsPlayingPreview((current) => !current);
  }, []);

  return (
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
      <View style={styles.liveRadioContent}>
        <View style={styles.liveRadioTitleRow}>
          <View style={[styles.liveRadioIcon, { backgroundColor: primaryColor + "1A" }]}>
            <Ionicons name="radio" size={18} color={primaryColor} />
          </View>
          <Text style={[styles.liveRadioTitle, { color: textColor }]} numberOfLines={1}>
            Live Radio
          </Text>
          <View style={styles.liveRadioBadge}>
            <View style={styles.liveRadioBadgeDot} />
            <Text style={styles.liveRadioBadgeText}>LIVE</Text>
          </View>
        </View>

        <Text style={[styles.liveRadioStation, { color: textColor }]} numberOfLines={1}>
          MusikaloKal Radio
        </Text>
        <Text style={[styles.liveRadioSubtitle, { color: mutedTextColor }]} numberOfLines={2}>
          Stream local music and artist features
        </Text>

        <View style={styles.liveRadioMetaRow}>
          <View style={styles.liveRadioNowPlaying}>
            <Text style={[styles.liveRadioMetaLabel, { color: mutedTextColor }]} numberOfLines={1}>
              Now playing
            </Text>
            <Text style={[styles.liveRadioMetaValue, { color: textColor }]} numberOfLines={1}>
              Local artist spotlight
            </Text>
          </View>
          <View style={styles.liveRadioListeners}>
            <Ionicons name="headset-outline" size={14} color={mutedTextColor} />
            <Text style={[styles.liveRadioListenerText, { color: mutedTextColor }]} numberOfLines={1}>
              -- listeners
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={isPlayingPreview ? "Pause Live Radio" : "Play Live Radio"}
        onPress={togglePreview}
        style={[styles.liveRadioPlayButton, { backgroundColor: primaryColor }]}
      >
        <Ionicons name={isPlayingPreview ? "pause" : "play"} size={16} color="#FFFFFF" />
        <Text style={styles.liveRadioPlayText}>{isPlayingPreview ? "Pause" : "Play"}</Text>
      </TouchableOpacity>
    </View>
  );
});

const FEED_PAGE_SIZE = 20;
const SOCIAL_MEDIA_ASPECT_RATIO = 1.45;
const PESO_SIGN = "\u20B1";
const KNOWN_FEED_MEDIA_BUCKETS = ["post-media", "posts", "images", "listings", "documents", "avatars"];

const normalizeRelativeSupabaseStorageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!envBase) return normalizedPath;

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

  if (candidate.includes("/storage/v1/object/public/")) return candidate;
  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) return candidate;

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

const getPositiveInteger = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const formatCompactPostType = (value: unknown) => {
  const normalized = typeof value === "string" ? value.replace(/_/g, " ").trim() : "";
  if (!normalized) return "Public";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatFeedPrice = (amount: number, suffix = "") => `${PESO_SIGN}${amount.toLocaleString()}${suffix}`;

const getWebFeedMediaUrls = (item: any) => {
  const mediaUrls = Array.isArray(item?.media)
    ? item.media
        .map((media: any) => resolveFeedMediaUrl(media?.url || media?.storage_path || media?.public_url))
        .filter((value: string) => value.length > 0)
    : [];
  if (mediaUrls.length > 0) return Array.from(new Set(mediaUrls));

  const images = Array.isArray(item?.images)
    ? item.images
        .map((image: unknown) => resolveFeedMediaUrl(typeof image === "string" ? image : ""))
        .filter((value: string) => value.length > 0)
    : [];
  const primaryImage = resolveFeedMediaUrl(typeof item?.image === "string" ? item.image : "");
  return Array.from(new Set([primaryImage, ...images].filter((value) => value.length > 0)));
};

const getSocialAvatarUri = (item: any) =>
  resolveFeedMediaUrl(
    item?.author_avatar ||
      item?.studio?.image ||
      item?.studio?.avatar_url ||
      item?.linked_studio?.image ||
      item?.linked_studio?.avatar_url ||
      "",
  );

const getSocialDisplayName = (item: any) =>
  item?.studio?.name || item?.linked_studio?.name || item?.author_name || "MusikaLokal";

const getSocialMetaLabel = (item: any) => {
  const linkedStudio = item?.linked_studio || item?.studio || {};
  const location =
    typeof item?.location === "string" && item.location.trim()
      ? item.location.trim()
      : typeof linkedStudio?.location === "string"
        ? linkedStudio.location.trim()
        : "";
  const category =
    typeof item?.category === "string" && item.category.trim()
      ? item.category.trim()
      : typeof linkedStudio?.category === "string"
        ? linkedStudio.category.trim()
        : "";
  return location || category || formatCompactPostType(item?.post_type || item?.visibility);
};

const getSocialCaption = (item: any) => {
  const body = typeof item?.body === "string" ? item.body.trim() : "";
  if (body) return body;
  const studioName = item?.studio?.name || item?.linked_studio?.name;
  return studioName ? `Shared an update from ${studioName}.` : "Shared an update on MusikaLokal.";
};

const getTimestampLabel = (value: unknown) => {
  if (typeof value !== "string" || !value) return "Just now";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Just now";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(value).toLocaleDateString();
};

const getSocialServiceBadges = (item: any) => {
  const source = item?.linked_studio || item?.studio || item;
  const studioType = typeof source?.studio_type === "string" ? source.studio_type : typeof source?.type === "string" ? source.type : "";
  const badges: string[] = [];

  if (/live|studio|rehearsal|recording/i.test(studioType)) badges.push("Live Room");
  if (/rehearsal/i.test(studioType) || getPositiveInteger(source?.rehearsal_rate) > 0) badges.push("Rehearsal");
  if (/recording/i.test(studioType) || getPositiveInteger(source?.recording_rate) > 0) badges.push("Recording");
  if (item?.linked_playlist) badges.push("Playlist");
  if (item?.linked_product) badges.push("Merch");

  return Array.from(new Set(badges.filter(Boolean))).slice(0, 3);
};

const getSocialPriceChips = (item: any) => {
  const source = item?.linked_studio || item?.studio || item;
  const chips: string[] = [];
  const rehearsalRate = getPositiveInteger(source?.rehearsal_rate);
  const recordingRate = getPositiveInteger(source?.recording_rate);
  const hourlyRate = getPositiveInteger(source?.hourly_rate);
  const productPrice = getPositiveInteger(item?.linked_product?.price || item?.linked_product?.amount);

  if (rehearsalRate > 0) chips.push(formatFeedPrice(rehearsalRate, "/hr"));
  if (recordingRate > 0) chips.push(formatFeedPrice(recordingRate, "/hr"));
  if (chips.length === 0 && hourlyRate > 0) chips.push(formatFeedPrice(hourlyRate, "/hr"));
  if (productPrice > 0) chips.push(formatFeedPrice(productPrice));

  return Array.from(new Set(chips)).slice(0, 2);
};

const getSocialEngagementCounts = (item: any) => ({
  likes: Number(item?.reaction_count || 0),
  comments: Number(item?.comment_count || 0),
  shares: Number(item?.share_count || 0),
});

const getLinkedStudioId = (item: any) =>
  item?.linked_studio?.id || item?.studio?.id || item?.studio_id || item?.listing_id || "";

type SocialPostCardProps = {
  item: any;
  borderColor: string;
  cardColor: string;
  colors: any;
  isDark: boolean;
  mediaWidth: number;
  width: number;
  onOpenPost: (postId: string) => void;
  onOpenStudio: (studioId: string) => void;
  onReaction: (postId: string, currentReaction: string | null) => void;
};

const SocialPostCard = React.memo(function SocialPostCard({
  item,
  borderColor,
  cardColor,
  colors,
  isDark,
  mediaWidth,
  width,
  onOpenPost,
  onOpenStudio,
  onReaction,
}: SocialPostCardProps) {
  const mediaUrls = useMemo(() => getWebFeedMediaUrls(item), [item]);
  const serviceBadges = useMemo(() => getSocialServiceBadges(item), [item]);
  const priceChips = useMemo(() => getSocialPriceChips(item), [item]);
  const engagement = useMemo(() => getSocialEngagementCounts(item), [item]);
  const avatarUri = useMemo(() => getSocialAvatarUri(item), [item]);
  const primaryMediaUri = mediaUrls[0] || "";
  const studioId = getLinkedStudioId(item);
  const mediaHeight = Math.round(mediaWidth / SOCIAL_MEDIA_ASPECT_RATIO);

  const handleOpenPost = useCallback(() => {
    onOpenPost(item.id);
  }, [item?.id, onOpenPost]);

  const handleReaction = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      onReaction(item.id, item.my_reaction);
    },
    [item?.id, item?.my_reaction, onReaction],
  );

  const handleComment = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      onOpenPost(item.id);
    },
    [item?.id, onOpenPost],
  );

  const handleOpenCta = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      if (studioId) {
        onOpenStudio(studioId);
        return;
      }
      onOpenPost(item.id);
    },
    [item?.id, onOpenPost, onOpenStudio, studioId],
  );

  const handleShare = useCallback((event?: any) => {
    event?.stopPropagation?.();
  }, []);

  return (
    <TouchableOpacity
      activeOpacity={1}
      accessibilityRole="button"
      onPress={handleOpenPost}
      style={[
        styles.socialPostCard,
        {
          backgroundColor: cardColor,
          borderColor,
          shadowOpacity: isDark ? 0 : 0.07,
          width,
        },
      ]}
    >
      <View style={styles.socialPostHeader}>
        <View style={styles.socialAvatarWrap}>
          {avatarUri ? (
            <CachedImage uri={avatarUri} style={styles.socialAvatar} width={44} height={44} />
          ) : (
            <View style={[styles.socialAvatarFallback, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="musical-notes" size={20} color={colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.socialHeaderText}>
          <Text style={[styles.socialName, { color: colors.text }]} numberOfLines={1}>
            {getSocialDisplayName(item)}
          </Text>
          <View style={styles.socialMetaRow}>
            <Text style={[styles.socialMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {getSocialMetaLabel(item)}
            </Text>
            <Text style={[styles.socialMetaDot, { color: colors.textSecondary }]}>{"\u2022"}</Text>
            <Text style={[styles.socialMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
              {getTimestampLabel(item?.created_at)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="More options"
          onPress={handleShare}
          style={styles.socialMenuButton}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.socialCaption, { color: colors.text }]} numberOfLines={3}>
        {getSocialCaption(item)}
      </Text>

      {primaryMediaUri ? (
        <View style={styles.socialMediaWrap}>
          <CachedImage
            uri={primaryMediaUri}
            style={[styles.socialMedia, { height: mediaHeight }]}
            width={Math.round(mediaWidth)}
            height={mediaHeight}
          />
          {mediaUrls.length > 1 ? (
            <View style={styles.socialMediaCount}>
              <Ionicons name="albums-outline" size={12} color="#FFFFFF" />
              <Text style={styles.socialMediaCountText}>1/{mediaUrls.length}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {serviceBadges.length > 0 || priceChips.length > 0 ? (
        <View style={styles.socialChipRow}>
          {serviceBadges.map((badge) => (
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
          {engagement.comments} comments {"\u2022"} {engagement.shares} shares
        </Text>
      </View>

      <View style={styles.socialActionRow}>
        <TouchableOpacity activeOpacity={0.78} onPress={handleReaction} style={styles.socialActionButton}>
          <Ionicons
            name={item?.my_reaction ? "heart" : "heart-outline"}
            size={18}
            color={item?.my_reaction ? "#EF4444" : colors.textSecondary}
          />
          <Text style={[styles.socialActionText, { color: item?.my_reaction ? "#EF4444" : colors.textSecondary }]}>
            Like
          </Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.78} onPress={handleComment} style={styles.socialActionButton}>
          <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
          <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Comment</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.78} onPress={handleShare} style={styles.socialActionButton}>
          <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
          <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.socialCtaRow}>
        <TouchableOpacity activeOpacity={0.78} onPress={handleOpenCta} style={styles.socialPrimaryCta}>
          <Text style={[styles.socialPrimaryCtaText, { color: colors.primary }]}>
            {studioId ? "View Studio" : "View Post"}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

const logFeedInvokeError = (scope: string, error: any, extra: Record<string, unknown> = {}) => {
  console.error(`[FeedInvokeError] ${scope}`, {
    message: error?.message || "Unknown function invoke error",
    status: error?.status || error?.context?.status || null,
    code: error?.code ?? error?.context?.code ?? null,
    details: error?.details ?? error?.context?.details ?? null,
    hint: error?.hint ?? error?.context?.hint ?? null,
    context: error?.context ?? null,
    ...extra,
  });
};

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [postBody, setPostBody] = useState("");
  const [postVisibility, setPostVisibility] = useState<"public" | "followers_only">("public");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const canCreatePost = !!session && !isGuest && normalizeVisibleInput(postBody).length > 0;

  const fetchFeed = useCallback(
    async (feedTab: FeedTab, append = false) => {
      if (!session || isGuest) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!append) setLoading(true);

      try {
        const offset = append ? posts.length : 0;
        const { data, error } = await supabase.functions.invoke("manage-social-feed", {
          body: {
            action: "get_feed",
            feed_type: feedTab === "following" ? "following" : "public",
            limit: FEED_PAGE_SIZE,
            offset,
          },
        });

        if (error) {
          logFeedInvokeError("manage-social-feed:get_feed", error, {
            action: "get_feed",
            feedTab,
            append,
            offset,
          });
          throw error;
        }

        const page = Array.isArray(data?.data) ? data.data.map(normalizeFeedPost) : [];
        setPosts((current) => (append ? [...current, ...page] : page));
        setHasMore(page.length === FEED_PAGE_SIZE);
      } catch (e: any) {
        setAlert({ type: "error", title: "Error", message: e?.message || "Failed to load feed." });
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [isGuest, posts.length, session],
  );

  useFocusEffect(
    useCallback(() => {
      fetchFeed(tab);
    }, [fetchFeed, tab]),
  );

  const refresh = () => {
    setRefreshing(true);
    fetchFeed(tab);
  };

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    fetchFeed(tab, true);
  };

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

      if (error) throw error;

      if (data?.success) {
        emitToast({ type: "success", title: "Posted!", message: "Your post is live." });
        setPostBody("");
        fetchFeed(tab);
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create post." });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e?.message || "Failed to create post." });
    } finally {
      setCreating(false);
    }
  };

  const handleReaction = useCallback(async (postId: string, currentReaction: string | null) => {
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? {
              ...post,
              my_reaction: currentReaction ? null : "like",
              reaction_count: currentReaction
                ? Math.max((post.reaction_count || 1) - 1, 0)
                : (post.reaction_count || 0) + 1,
            }
          : post,
      ),
    );

    try {
      const { error } = await supabase.functions.invoke("manage-social-feed", {
        body: currentReaction
          ? { action: "remove_reaction", post_id: postId }
          : { action: "react_to_post", post_id: postId, reaction_type: "like" },
      });

      if (error) throw error;
    } catch (e: any) {
      logFeedInvokeError("manage-social-feed:reaction", e, { postId });
      fetchFeed(tab);
    }
  }, [fetchFeed, tab]);

  const contentWidth = useMemo(() => (isWebDesktop ? Math.min(width - 48, 760) : width), [isWebDesktop, width]);
  const mediaWidth = useMemo(() => Math.max(240, contentWidth - 28), [contentWidth]);

  const openPostDetails = useCallback((postId: string) => {
    if (!postId) return;
    router.push({ pathname: "/post_details", params: { post_id: postId } });
  }, []);

  const openStudioDetails = useCallback((studioId: string) => {
    if (!studioId) return;
    router.push({ pathname: "/home", params: { reopenListingId: studioId } });
  }, []);

  const renderPost = useCallback(
    ({ item }: { item: any }) => (
      <SocialPostCard
        item={item}
        borderColor={borderCol}
        cardColor={cardBg}
        colors={colors}
        isDark={isDark}
        mediaWidth={mediaWidth}
        onOpenPost={openPostDetails}
        onOpenStudio={openStudioDetails}
        onReaction={handleReaction}
        width={contentWidth}
      />
    ),
    [borderCol, cardBg, colors, contentWidth, handleReaction, isDark, mediaWidth, openPostDetails, openStudioDetails],
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Feed" onBackPress={() => router.back()} />

      <SmoothTabTransition activeKey={tab} style={{ flex: 1 }}>
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.35}
          contentContainerStyle={[styles.listContent, isWebDesktop && styles.listContentWeb]}
          ListHeaderComponent={
          <View style={[styles.headerBlock, { width: contentWidth }]}>
            <LiveRadioCard
              borderColor={borderCol}
              cardColor={isDark ? "#111827" : "#F8FAFC"}
              isDark={isDark}
              primaryColor={colors.primary}
              textColor={colors.text}
              mutedTextColor={colors.textSecondary}
            />

            <View style={styles.tabRow}>
              {[
                { key: "for_you", label: "For You", icon: "for_you" },
                { key: "following", label: "Following", icon: "people-outline" },
              ].map((item) => {
                const active = tab === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={1}
                    style={[
                      styles.tabButton,
                      {
                        backgroundColor: active ? colors.primary : cardBg,
                        borderColor: active ? colors.primary : borderCol,
                      },
                    ]}
                    onPress={() => setTab(item.key as FeedTab)}
                  >
                    {item.icon === "for_you" ? (
                      <ForYouTabIcon
                        active={active}
                        primaryColor={colors.primary}
                        mutedColor={colors.textSecondary}
                      />
                    ) : (
                      <Ionicons
                        name="people-outline"
                        size={18}
                        color={active ? "#FFFFFF" : colors.textSecondary}
                      />
                    )}
                    <Text style={[styles.tabText, { color: active ? "#FFFFFF" : colors.text }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.composer, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <TextInput
                style={[styles.composerInput, { color: colors.text }]}
                placeholder={session && !isGuest ? "Share an update..." : "Sign in to post and view your feed."}
                placeholderTextColor={colors.textSecondary}
                value={postBody}
                onChangeText={setPostBody}
                editable={!!session && !isGuest}
                multiline
                maxLength={1000}
              />
              <View style={styles.composerFooter}>
                <TouchableOpacity
                  activeOpacity={1}
                  style={[styles.visibilityToggle, { borderColor: borderCol }]}
                  onPress={() => setPostVisibility((current) => (current === "public" ? "followers_only" : "public"))}
                  disabled={!session || isGuest}
                >
                  <Ionicons name={postVisibility === "public" ? "earth-outline" : "people-outline"} size={16} color={colors.textSecondary} />
                  <Text style={[styles.visibilityToggleText, { color: colors.textSecondary }]}>
                    {postVisibility === "public" ? "Public" : "Followers"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={!canCreatePost || creating ? 1 : 0.78}
                  style={[
                    styles.postButton,
                    {
                      backgroundColor: canCreatePost ? colors.primary : colors.border,
                      opacity: !canCreatePost || creating ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleCreatePost}
                  disabled={!canCreatePost || creating}
                >
                  {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postButtonText}>Post</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
          ) : (
            <View style={[styles.emptyWrap, { width: contentWidth }]}>
              <Ionicons name="newspaper-outline" size={46} color={colors.textSecondary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {session && !isGuest ? "No posts yet" : "Sign in to view the feed"}
              </Text>
            </View>
          )
        }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator size="small" color={colors.primary} style={styles.footerLoader} /> : <View style={{ height: 80 }} />
          }
        />
      </SmoothTabTransition>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, alignItems: "center" },
  listContentWeb: { paddingTop: 22 },
  headerBlock: { gap: 12, marginBottom: 12 },
  liveRadioCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  liveRadioContent: {
    flex: 1,
    minWidth: 0,
  },
  liveRadioTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  liveRadioIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  liveRadioTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
  },
  liveRadioBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveRadioBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFFFFF",
  },
  liveRadioBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontFamily: "Poppins_700Bold",
  },
  liveRadioStation: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Poppins_700Bold",
  },
  liveRadioSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    fontFamily: "Poppins_400Regular",
  },
  liveRadioMetaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  liveRadioNowPlaying: {
    flex: 1,
    minWidth: 0,
  },
  liveRadioMetaLabel: {
    fontSize: 10,
    fontFamily: "Poppins_500Medium",
  },
  liveRadioMetaValue: {
    fontSize: 12,
    marginTop: 1,
    fontFamily: "Poppins_600SemiBold",
  },
  liveRadioListeners: {
    maxWidth: 104,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: "rgba(124,58,237,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  liveRadioListenerText: {
    flexShrink: 1,
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
  },
  liveRadioPlayButton: {
    minWidth: 88,
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  liveRadioPlayText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },
  tabRow: { flexDirection: "row", gap: 10 },
  tabButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  tabText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  forYouTabIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  forYouTabIconCenter: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  forYouTabIconSparkle: {
    position: "absolute",
    top: -4,
    right: -5,
  },
  composer: { borderWidth: 1, borderRadius: 14, padding: 12 },
  composerInput: { minHeight: 82, fontSize: 14, lineHeight: 20, textAlignVertical: "top" },
  composerFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 },
  visibilityToggle: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  visibilityToggleText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  postButton: { minWidth: 92, minHeight: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  postButtonText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  socialPostCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 18,
    elevation: 2,
  },
  socialPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  socialAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
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
    fontSize: 14,
    lineHeight: 18,
    fontFamily: "Poppins_700Bold",
  },
  socialMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  socialMetaText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Poppins_400Regular",
  },
  socialMetaDot: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: "Poppins_700Bold",
  },
  socialMenuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  socialCaption: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Poppins_400Regular",
    marginTop: 10,
  },
  socialMediaWrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(124,58,237,0.08)",
  },
  socialMedia: {
    width: "100%",
    borderRadius: 14,
  },
  socialMediaCount: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(15,23,42,0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  socialMediaCountText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
  },
  socialChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  socialBadgeChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  socialBadgeText: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
  },
  socialPriceChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(124,58,237,0.05)",
  },
  socialPriceText: {
    fontSize: 10,
    fontFamily: "Poppins_700Bold",
  },
  socialEngagementRow: {
    marginTop: 11,
    paddingBottom: 9,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Poppins_500Medium",
  },
  socialActionRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    paddingTop: 4,
  },
  socialActionButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  socialActionText: {
    fontSize: 12,
    fontFamily: "Poppins_600SemiBold",
  },
  socialCtaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 5,
  },
  socialPrimaryCta: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  socialPrimaryCtaText: {
    fontSize: 12,
    fontFamily: "Poppins_700Bold",
  },
  loading: { marginTop: 40 },
  emptyWrap: { minHeight: 260, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: 14, fontFamily: "Poppins_500Medium" },
  footerLoader: { paddingVertical: 20 },
});
