import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
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
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import { normalizeVisibleInput } from "../src/components/modal";
import Navbar from "../src/components/navbar";
import PostDetailsModal from "../src/components/PostDetailsModal";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";
import { useRadioPlayer } from "../src/context/RadioPlayerContext";

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

const DEMO_RADIO_STATION = {
  id: "musikalokal-demo-radio",
  name: "MusikaLokal Radio",
  description: "Stream local music and artist features",
  is_active: true,
  is_featured: true,
  __queueReady: true,
  __isDemoStation: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  live_anchor_at: "2026-01-01T00:00:00.000Z",
  rotation_interval_minutes: 15,
  slot_count: 1,
  creator: { full_name: "MusikaLokal" },
  live_slots: [
    {
      id: "musikalokal-demo-slot",
      station_id: "musikalokal-demo-radio",
      position: 0,
      label: "Artist spotlight",
      playlist: {
        id: "musikalokal-demo-playlist",
        title: "Artist spotlight",
        track_count: 3,
        items: [
          {
            id: "musikalokal-demo-sky-high",
            title: "SoundHelix Song 1",
            artist_name: "SoundHelix",
            audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
          },
          {
            id: "musikalokal-demo-nekozilla",
            title: "SoundHelix Song 2",
            artist_name: "SoundHelix",
            audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
          },
          {
            id: "musikalokal-demo-on-and-on",
            title: "SoundHelix Song 3",
            artist_name: "SoundHelix",
            audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
          },
        ],
      },
    },
  ],
};

const getStationSlots = (station: any) => {
  if (Array.isArray(station?.live_slots) && station.live_slots.length > 0) return station.live_slots;
  return Array.isArray(station?.slots) ? station.slots : [];
};

const getStationSlotCount = (station: any) =>
  Number(station?.slot_count ?? station?.slot_playlist_ids?.length ?? getStationSlots(station).length ?? 0);

const getStationTrackCount = (station: any) =>
  getStationSlots(station).reduce((total: number, slot: any) => {
    const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
    const playlistCount = Number(slot?.playlist?.track_count || 0);
    return total + Math.max(items.length, playlistCount);
  }, 0);

const isLikelyBrowserAudioUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  const candidate = value.trim();
  if (!candidate) return false;
  if (/^data:audio\//i.test(candidate)) return true;
  if (candidate.startsWith("/storage/v1/") || candidate.includes("/storage/v1/object/")) return true;
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm)(?:[?#].*)?$/i.test(candidate);
};

const getStationPlayableTrackCount = (station: any) =>
  getStationSlots(station).reduce((total: number, slot: any) => {
    const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
    return total + items.filter((item: any) => (
      isLikelyBrowserAudioUrl(item?.audio_url)
    ) || (
      typeof item?.teaser?.storage_path === "string" && item.teaser.storage_path.trim().length > 0
    )).length;
  }, 0);

const getStationNowPlayingTitle = (station: any, slotIndex = 0) => {
  const slots = getStationSlots(station);
  const slot = slots[slotIndex] || slots[0] || null;
  const firstItem = Array.isArray(slot?.playlist?.items) ? slot.playlist.items[0] : null;

  return firstItem?.title || slot?.playlist?.title || slot?.label || "Local artist spotlight";
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

          if (error) throw error;
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
        if (!cancelled) setLoadingStation(false);
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
  const stationSlotCount = getStationSlotCount(displayStation);
  const stationTrackCount = getStationTrackCount(displayStation);
  const isCurrentStation = Boolean(displayStation?.id && activeStation?.id && displayStation.id === activeStation.id);
  const isTuneInLoading = Boolean(displayStation?.id && loadingStationId === displayStation.id);
  const canTuneIn = Boolean(displayStation?.id && displayStation?.is_active !== false && stationSlotCount > 0);
  const stationName = typeof displayStation?.name === "string" && displayStation.name.trim()
    ? displayStation.name.trim()
    : "MusikaLokal Radio";
  const stationSubtitle = typeof displayStation?.description === "string" && displayStation.description.trim()
    ? displayStation.description.trim()
    : "Stream local music and artist features";
  const nowPlayingTitle = isCurrentStation
    ? currentTrack?.title || getStationNowPlayingTitle(displayStation, currentSlotIndex)
    : getStationNowPlayingTitle(displayStation, 0);
  const rotationSummary = stationTrackCount > 0
    ? `${stationTrackCount} track${stationTrackCount === 1 ? "" : "s"}`
    : stationSlotCount > 0
      ? `${stationSlotCount} playlist${stationSlotCount === 1 ? "" : "s"}`
      : "-- listeners";
  const playButtonLabel = loadingStation || isTuneInLoading
    ? "Loading"
    : !canTuneIn
      ? "Offline"
      : isCurrentStation && isPlaying
        ? "Pause"
        : isCurrentStation
          ? "Resume"
          : "Play";
  const playIcon = isCurrentStation && isPlaying ? "pause" : "play";
  const badgeLabel = loadingStation ? "..." : canTuneIn ? "LIVE" : "OFF";

  const handlePlayPress = useCallback(async () => {
    if (!displayStation || loadingStation || isTuneInLoading) return;

    if (!canTuneIn) {
      emitToast({
        dedupeKey: "live-radio-offline",
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
        dedupeKey: "live-radio-unavailable",
        type: "error",
        title: "Radio unavailable",
        message: /no supported sources/i.test(error?.message || "")
          ? "No playable audio URL is available for this station."
          : error?.message || "Unable to start this station right now.",
      });
    }
  }, [canTuneIn, displayStation, isCurrentStation, isTuneInLoading, loadingStation, togglePlayPause, tuneIn]);

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
          <View style={[styles.liveRadioBadge, !canTuneIn && styles.liveRadioBadgeMuted]}>
            <View style={styles.liveRadioBadgeDot} />
            <Text style={styles.liveRadioBadgeText}>{badgeLabel}</Text>
          </View>
        </View>

        <Text style={[styles.liveRadioStation, { color: textColor }]} numberOfLines={1}>
          {loadingStation ? "Finding live stations..." : stationName}
        </Text>
        <Text style={[styles.liveRadioSubtitle, { color: mutedTextColor }]} numberOfLines={2}>
          {stationSubtitle}
        </Text>

        <View style={styles.liveRadioMetaRow}>
          <View style={styles.liveRadioNowPlaying}>
            <Text style={[styles.liveRadioMetaLabel, { color: mutedTextColor }]} numberOfLines={1}>
              Now playing
            </Text>
            <Text style={[styles.liveRadioMetaValue, { color: textColor }]} numberOfLines={1}>
              {loadingStation ? "Loading rotation" : nowPlayingTitle}
            </Text>
          </View>
          <View style={styles.liveRadioListeners}>
            <Ionicons name={stationTrackCount > 0 ? "musical-notes-outline" : "headset-outline"} size={14} color={mutedTextColor} />
            <Text style={[styles.liveRadioListenerText, { color: mutedTextColor }]} numberOfLines={1}>
              {rotationSummary}
            </Text>
          </View>
        </View>
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
          <Ionicons name={playIcon} size={16} color="#FFFFFF" />
        )}
        <Text style={styles.liveRadioPlayText}>{playButtonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
});

const FEED_PAGE_SIZE = 20;
const PENDING_REOPEN_LISTING_STORAGE_KEY = "pending_reopen_listing_id";
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
      />
      {index === visibleMedia.length - 1 && remainingCount > 0 ? (
        <View style={styles.socialGalleryMoreOverlay}>
          <Text style={styles.socialGalleryMoreText}>+{remainingCount}</Text>
        </View>
      ) : null}
    </View>
  );

  if (visibleMedia.length === 0) return null;

  const singleHeight = Math.round(mediaWidth / SOCIAL_MEDIA_ASPECT_RATIO);
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
  currentUserId: string | null;
  onOpenPost: (postId: string) => void;
  onOpenStudio: (studioId: string) => void;
  onRequestDelete: (postId: string) => void;
};

const SocialPostCard = React.memo(function SocialPostCard({
  item,
  borderColor,
  cardColor,
  colors,
  isDark,
  mediaWidth,
  width,
  currentUserId,
  onOpenPost,
  onOpenStudio,
  onRequestDelete,
}: SocialPostCardProps) {
  const mediaUrls = useMemo(() => getWebFeedMediaUrls(item), [item]);
  const serviceBadges = useMemo(() => getSocialServiceBadges(item), [item]);
  const priceChips = useMemo(() => getSocialPriceChips(item), [item]);
  const avatarUri = useMemo(() => getSocialAvatarUri(item), [item]);
  const studioId = getLinkedStudioId(item);

  const handleOpenPost = useCallback(() => {
    onOpenPost(item.id);
  }, [item?.id, onOpenPost]);

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

  const isOwner = !!currentUserId && item?.author_id === currentUserId;
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuPress = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      if (!isOwner) {
        emitToast({ type: "info", title: "No actions", message: "You can only manage your own posts." });
        return;
      }
      setMenuOpen((open) => !open);
    },
    [isOwner],
  );

  const handleSelectDelete = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      setMenuOpen(false);
      onRequestDelete(item.id);
    },
    [item?.id, onRequestDelete],
  );

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

        <View style={styles.socialMenuWrap}>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={handleMenuPress}
            style={styles.socialMenuButton}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          {menuOpen && isOwner && (
            <>
              <Pressable
                style={styles.socialMenuBackdrop}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  setMenuOpen(false);
                }}
              />
              <View
                style={[
                  styles.socialMenuPopover,
                  {
                    backgroundColor: cardColor,
                    borderColor,
                    shadowOpacity: isDark ? 0 : 0.18,
                  },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleSelectDelete}
                  style={styles.socialMenuItem}
                >
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  <Text style={[styles.socialMenuItemText, { color: "#ef4444" }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      <Text style={[styles.socialCaption, { color: colors.text }]} numberOfLines={3}>
        {getSocialCaption(item)}
      </Text>

      {mediaUrls.length > 0 ? (
        <SocialMediaGallery mediaUrls={mediaUrls} mediaWidth={mediaWidth} onPress={handleOpenPost} />
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
  const params = useLocalSearchParams<{ reopenListingId?: string }>();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [postBody, setPostBody] = useState("");
  const [postVisibility, setPostVisibility] = useState<"public" | "followers">("public");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listingDetailsRef = useRef<any>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [pendingReopenListingId, setPendingReopenListingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const canCreatePost = !!session && !isGuest && (normalizeVisibleInput(postBody).length > 0 || selectedMedia.length > 0);

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

  const presentListingDetailsWithRetry = useCallback(() => {
    let attempts = 0;
    const maxAttempts = 10;

    const presentWhenReady = () => {
      if (listingDetailsRef.current?.present) {
        listingDetailsRef.current.present();
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

    const schedule = (callback: () => void) => {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(callback);
        return;
      }

      setTimeout(callback, 0);
    };

    schedule(() => {
      schedule(presentWhenReady);
    });
  }, []);

  const openListingDetails = useCallback((listingId: string) => {
    if (!listingId) return;
    setSelectedListingId(listingId);
    setPendingReopenListingId(listingId);
  }, []);

  const handleListingDetailsDismiss = useCallback(() => {
    setSelectedListingId(null);
    setPendingReopenListingId(null);
  }, []);

  useEffect(() => {
    if (!pendingReopenListingId) return;
    if (selectedListingId !== pendingReopenListingId) return;

    presentListingDetailsWithRetry();
  }, [pendingReopenListingId, presentListingDetailsWithRetry, selectedListingId]);

  useEffect(() => {
    const reopenListingId = Array.isArray(params.reopenListingId)
      ? params.reopenListingId[0]
      : params.reopenListingId;

    if (!reopenListingId || reopenListingId.length === 0) return;

    openListingDetails(reopenListingId);

    try {
      router.setParams({ reopenListingId: undefined as any });
    } catch {
      // Older router states may not accept clearing params here; the listing still opens.
    }
  }, [openListingDetails, params.reopenListingId]);

  useFocusEffect(
    useCallback(() => {
      fetchFeed(tab);

      let isActive = true;

      const restorePendingReopen = async () => {
        try {
          const storedListingId = await AsyncStorage.getItem(PENDING_REOPEN_LISTING_STORAGE_KEY);

          if (!isActive || !storedListingId || storedListingId.length === 0) {
            return;
          }

          openListingDetails(storedListingId);
          await AsyncStorage.removeItem(PENDING_REOPEN_LISTING_STORAGE_KEY);
        } catch {
          // Ignore cache restore failures; explicit route params still work.
        }
      };

      void restorePendingReopen();

      return () => {
        isActive = false;
      };
    }, [fetchFeed, openListingDetails, tab]),
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
    if (!content && selectedMedia.length === 0) {
      setAlert({ type: "warning", title: "Empty Post", message: "Please write something or attach media." });
      return;
    }

    setCreating(true);

    try {
      const userId = session?.user?.id;
      let uploadedMedia: { storage_path: string; media_type: string; mime_type: string }[] = [];

      if (selectedMedia.length > 0 && userId) {
        for (const item of selectedMedia) {
          const ext = (item.file.name.split(".").pop() || "bin").toLowerCase();
          const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
          const path = `${userId}/${filename}`;
          const { error: upErr } = await supabase.storage
            .from("post-media")
            .upload(path, item.file, { contentType: item.file.type, upsert: false });
          if (upErr) throw upErr;
          uploadedMedia.push({
            storage_path: `post-media/${path}`,
            media_type: item.file.type.startsWith("video") ? "video" : "image",
            mime_type: item.file.type,
          });
        }
      }

      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: "create_post",
          content,
          visibility: postVisibility,
          ...(uploadedMedia.length > 0 ? { media: uploadedMedia } : {}),
        },
      });

      if (error) throw error;

      if (data?.success) {
        emitToast({ type: "success", title: "Posted!", message: "Your post is live." });
        setPostBody("");
        selectedMedia.forEach((m) => URL.revokeObjectURL(m.preview));
        setSelectedMedia([]);
        setShowCreate(false);
        fetchFeed(tab);
        return;
      }

      if (data?.blocked || data?.pending_review || data?.status === "blocked" || data?.status === "pending_review") {
        setAlert({
          type: "warning",
          title: data?.pending_review || data?.status === "pending_review" ? "Post needs review" : "Post blocked",
          message: data?.moderation?.reason || data?.error || "This post did not pass AI moderation.",
        });
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create post." });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e?.message || "Failed to create post." });
    } finally {
      setCreating(false);
    }
  };

  const handlePickMedia = () => {
    if (Platform.OS !== "web") return;
    fileInputRef.current?.click();
  };

  const handleMediaChange = (e: any) => {
    const files: FileList | null = e?.target?.files;
    if (!files || files.length === 0) return;
    const next: { file: File; preview: string }[] = [];
    Array.from(files).forEach((f) => {
      next.push({ file: f as File, preview: URL.createObjectURL(f as File) });
    });
    setSelectedMedia((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedMedia = (index: number) => {
    setSelectedMedia((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const contentWidth = useMemo(
    () => (isWebDesktop ? Math.min(width - 64, 720) : width),
    [isWebDesktop, width],
  );
  const mediaWidth = useMemo(() => Math.max(240, contentWidth - 28), [contentWidth]);

  const userMeta = (session?.user?.user_metadata || {}) as { full_name?: string; name?: string; avatar_url?: string };
  const composerName = (userMeta.full_name || userMeta.name || session?.user?.email?.split("@")[0] || "there").split(" ")[0];
  const composerAvatar = userMeta.avatar_url || "";

  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const openPostDetails = useCallback((postId: string) => {
    if (!postId) return;
    setOpenPostId(postId);
  }, []);

  const closePostDetails = useCallback(() => setOpenPostId(null), []);

  const handleModalReactionChanged = useCallback(
    (postId: string, hasReaction: boolean, reactionCount: number) => {
      setPosts((current) =>
        current.map((p) =>
          p.id === postId
            ? { ...p, my_reaction: hasReaction ? "like" : null, reaction_count: reactionCount }
            : p,
        ),
      );
    },
    [],
  );

  const handleModalCommentChanged = useCallback((postId: string, commentCount: number) => {
    setPosts((current) =>
      current.map((p) => (p.id === postId ? { ...p, comment_count: commentCount } : p)),
    );
  }, []);

  const handleModalPostDeleted = useCallback((postId: string) => {
    setPosts((current) => current.filter((p) => p.id !== postId));
  }, []);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestDeletePost = useCallback((postId: string) => {
    if (!postId) return;
    setPendingDeleteId(postId);
  }, []);

  const cancelDeletePost = useCallback(() => {
    if (deleting) return;
    setPendingDeleteId(null);
  }, [deleting]);

  const confirmDeletePost = useCallback(async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: { action: "delete_post", post_id: pendingDeleteId },
      });
      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "Failed to delete post.");
      }
      setPosts((current) => current.filter((p) => p.id !== pendingDeleteId));
      setPendingDeleteId(null);
      emitToast({ type: "success", title: "Deleted", message: "Your post was removed." });
    } catch (e: any) {
      setAlert({ type: "error", title: "Delete failed", message: e?.message || "Could not delete post." });
    } finally {
      setDeleting(false);
    }
  }, [pendingDeleteId]);

  const openStudioDetails = useCallback((studioId: string) => {
    if (!studioId) return;
    openListingDetails(studioId);
  }, [openListingDetails]);

  const renderPost = useCallback(
    ({ item }: { item: any }) => (
      <SocialPostCard
        item={item}
        borderColor={borderCol}
        cardColor={cardBg}
        colors={colors}
        isDark={isDark}
        mediaWidth={mediaWidth}
        currentUserId={session?.user?.id || null}
        onOpenPost={openPostDetails}
        onOpenStudio={openStudioDetails}
        onRequestDelete={requestDeletePost}
        width={contentWidth}
      />
    ),
    [borderCol, cardBg, colors, contentWidth, isDark, mediaWidth, openPostDetails, openStudioDetails, requestDeletePost, session?.user?.id],
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {!isWebDesktop && <Header title="Feed" onBackPress={() => router.back()} />}

      <View style={[styles.pageWrap, isWebDesktop && styles.pageWrapWeb]}>
        <View style={[styles.centerColumn, isWebDesktop && { width: contentWidth }]}>
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
                  {/* Search trigger row (mobile parity) */}
                  <View style={styles.searchRow}>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => router.push("/discover")}
                      style={[
                        styles.searchTrigger,
                        { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                      ]}
                    >
                      <Ionicons name="search" size={20} color={colors.textSecondary} />
                      <Text
                        style={[styles.searchTriggerText, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        Search musicians, studios, gigs
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => router.push("/discover")}
                      style={[
                        styles.searchFilterBtn,
                        { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Open search filters"
                    >
                      <Ionicons name="options-outline" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <LiveRadioCard
                    borderColor={borderCol}
                    cardColor={isDark ? "#111827" : "#F8FAFC"}
                    isDark={isDark}
                    primaryColor={colors.primary}
                    textColor={colors.text}
                    mutedTextColor={colors.textSecondary}
                  />

                  {/* "What's on your mind" trigger (opens modal, mobile parity) */}
                  <View
                    style={[
                      styles.composerTriggerCard,
                      { backgroundColor: cardBg, borderColor: borderCol, shadowOpacity: isDark ? 0 : 0.06 },
                    ]}
                  >
                    <View style={styles.composerTriggerTopRow}>
                      <View style={styles.fbComposerAvatarWrap}>
                        {composerAvatar ? (
                          <CachedImage uri={composerAvatar} style={styles.fbComposerAvatar} width={40} height={40} />
                        ) : (
                          <View
                            style={[
                              styles.fbComposerAvatarFallback,
                              { backgroundColor: colors.primary + "22" },
                            ]}
                          >
                            <Ionicons name="person" size={20} color={colors.primary} />
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => {
                          if (!session || isGuest) return;
                          setShowCreate(true);
                        }}
                        style={[
                          styles.composerTriggerInput,
                          { backgroundColor: isDark ? "#0F172A" : "#F1F5F9" },
                        ]}
                      >
                        <Text style={[styles.composerTriggerText, { color: colors.textSecondary }]} numberOfLines={1}>
                          {session && !isGuest
                            ? `What's on your mind, ${composerName}?`
                            : "Sign in to post and view your feed."}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.fbComposerDivider, { backgroundColor: borderCol }]} />

                    <View style={styles.composerTriggerActions}>
                      <TouchableOpacity
                        activeOpacity={!session || isGuest ? 1 : 0.78}
                        style={styles.composerTriggerActionBtn}
                        onPress={() => {
                          if (!session || isGuest) return;
                          setShowCreate(true);
                          setTimeout(() => handlePickMedia(), 50);
                        }}
                        disabled={!session || isGuest}
                      >
                        <Ionicons name="image" size={18} color="#22C55E" />
                        <Text style={[styles.fbComposerActionText, { color: colors.textSecondary }]}>
                          Photo/video
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={!session || isGuest ? 1 : 0.78}
                        style={styles.composerTriggerActionBtn}
                        onPress={() => {
                          if (!session || isGuest) return;
                          setShowCreate(true);
                        }}
                        disabled={!session || isGuest}
                      >
                        <Ionicons name="happy-outline" size={18} color="#F59E0B" />
                        <Text style={[styles.fbComposerActionText, { color: colors.textSecondary }]}>
                          Feeling
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Sliding pill tab bar (mobile parity) */}
                  <View style={[styles.pillTabRow, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
                    {[
                      { key: "for_you", label: "For You", icon: "for_you" as const },
                      { key: "following", label: "Following", icon: "people-outline" as const },
                    ].map((item) => {
                      const active = tab === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          activeOpacity={1}
                          style={[
                            styles.pillTabButton,
                            active && { backgroundColor: cardBg, shadowOpacity: isDark ? 0 : 0.08 },
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
                              color={active ? colors.primary : colors.textSecondary}
                            />
                          )}
                          <Text
                            style={[
                              styles.pillTabText,
                              { color: active ? colors.primary : colors.textSecondary },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
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
                loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} style={styles.footerLoader} />
                ) : (
                  <View style={{ height: 80 }} />
                )
              }
            />
          </SmoothTabTransition>
        </View>
      </View>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      {pendingDeleteId && (
        <CustomAlert
          visible
          type="warning"
          title="Delete post?"
          message="This will permanently remove your post, comments, and media. This action cannot be undone."
          onClose={cancelDeletePost}
          buttons={[
            { text: "Cancel", style: "cancel", onPress: cancelDeletePost },
            { text: deleting ? "Deleting..." : "Delete", style: "destructive", onPress: confirmDeletePost },
          ]}
        />
      )}
      <PostDetailsModal
        postId={openPostId}
        visible={!!openPostId}
        onClose={closePostDetails}
        onReactionChanged={handleModalReactionChanged}
        onCommentChanged={handleModalCommentChanged}
        onPostDeleted={handleModalPostDeleted}
      />

      {/* Create Post Modal (mobile parity) */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.createModalOverlay} onPress={() => setShowCreate(false)}>
          <Pressable
            style={[styles.createModalBox, { backgroundColor: cardBg, borderColor: borderCol }]}
            onPress={(e) => e?.stopPropagation?.()}
          >
            <View style={[styles.createModalHeader, { borderBottomColor: borderCol }]}>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowCreate(false)} style={styles.createModalCloseBtn}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.createModalTitle, { color: colors.text }]}>Create Post</Text>
              <TouchableOpacity
                activeOpacity={!canCreatePost || creating ? 1 : 0.78}
                style={[
                  styles.createModalPostBtn,
                  {
                    backgroundColor: canCreatePost ? colors.primary : (isDark ? "#1F2937" : "#E2E8F0"),
                    opacity: !canCreatePost || creating ? 0.6 : 1,
                  },
                ]}
                onPress={handleCreatePost}
                disabled={!canCreatePost || creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.createModalPostText, { color: canCreatePost ? "#FFFFFF" : colors.textSecondary }]}>
                    Post
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.createModalAuthorRow}>
              <View style={styles.fbComposerAvatarWrap}>
                {composerAvatar ? (
                  <CachedImage uri={composerAvatar} style={styles.fbComposerAvatar} width={40} height={40} />
                ) : (
                  <View style={[styles.fbComposerAvatarFallback, { backgroundColor: colors.primary + "22" }]}>
                    <Ionicons name="person" size={20} color={colors.primary} />
                  </View>
                )}
              </View>
              <View>
                <Text style={[styles.createModalAuthorName, { color: colors.text }]}>{composerName}</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  style={[styles.createModalVisibilityChip, { backgroundColor: isDark ? "#334155" : "#E2E8F0" }]}
                  onPress={() => setPostVisibility(postVisibility === "public" ? "followers" : "public")}
                >
                  <Ionicons
                    name={postVisibility === "public" ? "globe-outline" : "people-outline"}
                    size={11}
                    color={colors.textSecondary}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 4 }}>
                    {postVisibility === "public" ? "Public" : "Followers"}
                  </Text>
                  <Ionicons name="caret-down" size={10} color={colors.textSecondary} style={{ marginLeft: 3 }} />
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={[styles.createModalTextArea, { color: colors.text }]}
              placeholder="What's on your mind?"
              placeholderTextColor={colors.textSecondary}
              value={postBody}
              onChangeText={setPostBody}
              multiline
              autoFocus
              maxLength={1000}
            />

            {selectedMedia.length > 0 && (
              <View style={styles.fbMediaPreviewRow}>
                {selectedMedia.map((m, idx) => (
                  <View key={`${m.preview}-${idx}`} style={styles.fbMediaPreviewItem}>
                    {m.file.type.startsWith("video") ? (
                      <View style={[styles.fbMediaPreviewImg, { backgroundColor: "#000", alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="videocam" size={28} color="#fff" />
                      </View>
                    ) : (
                      <CachedImage uri={m.preview} style={styles.fbMediaPreviewImg} width={88} height={88} />
                    )}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => removeSelectedMedia(idx)}
                      style={styles.fbMediaPreviewRemove}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={[styles.createModalActionsRow, { borderTopColor: borderCol }]}>
              <TouchableOpacity
                activeOpacity={0.78}
                style={styles.fbComposerActionBtn}
                onPress={handlePickMedia}
              >
                <Ionicons name="image" size={18} color="#22C55E" />
                <Text style={[styles.fbComposerActionText, { color: colors.textSecondary }]}>
                  Photo/video
                </Text>
              </TouchableOpacity>
              {Platform.OS === "web" && (
                <input
                  ref={fileInputRef as any}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={handleMediaChange}
                  style={{ display: "none" }}
                />
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ListingDetailsSheet
        ref={listingDetailsRef}
        listingId={selectedListingId}
        onDismiss={handleListingDetailsDismiss}
      />

      {!isWebDesktop && <Navbar />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, alignItems: "center" },
  listContentWeb: { paddingTop: 4 },
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
  liveRadioBadgeMuted: {
    backgroundColor: "#64748B",
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
  pageWrap: { flex: 1 },
  pageWrapWeb: {
    flexDirection: "row",
    alignSelf: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 1240,
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: 24,
  },
  centerColumn: { flex: 1, width: "100%", maxWidth: 720, alignSelf: "center" },
  rightRail: {
    width: 300,
    gap: 14,
    paddingTop: 6,
    ...(Platform.OS === "web" ? ({ position: "sticky", top: 18 } as any) : null),
  },
  rightRailCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  rightRailTitle: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  rightRailSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Poppins_400Regular" },
  rightRailButton: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
  },
  rightRailButtonText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  fbMediaPreviewRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  fbMediaPreviewItem: {
    position: "relative",
    width: 88,
    height: 88,
    borderRadius: 8,
    overflow: "hidden",
  },
  fbMediaPreviewImg: { width: 88, height: 88, borderRadius: 8 },
  fbMediaPreviewRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  rightRailGhostButton: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  rightRailGhostButtonText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  fbComposer: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  fbComposerTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fbComposerAvatarWrap: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  fbComposerAvatar: { width: 40, height: 40, borderRadius: 20 },
  fbComposerAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  fbComposerInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  fbComposerDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  fbComposerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fbComposerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  fbComposerActionText: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  fbComposerPostBtn: {
    minWidth: 84,
    minHeight: 36,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  fbComposerPostText: { fontSize: 13, fontFamily: "Poppins_700Bold" },
  fbTabRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  fbTabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  fbTabText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
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
  socialMenuWrap: {
    position: "relative",
  },
  socialMenuBackdrop: {
    ...(Platform.OS === "web"
      ? ({ position: "fixed" as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 } as any)
      : StyleSheet.absoluteFillObject),
  },
  socialMenuPopover: {
    position: "absolute",
    top: 38,
    right: 0,
    minWidth: 150,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    zIndex: 50,
  },
  socialMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  socialMenuItemText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
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
  },
  socialGalleryMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.56)",
  },
  socialGalleryMoreText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontFamily: "Poppins_700Bold",
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
  // Mobile-parity search trigger row
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchTrigger: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchTriggerText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  searchFilterBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mobile-parity composer trigger card
  composerTriggerCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  composerTriggerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  composerTriggerInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    justifyContent: "center",
  },
  composerTriggerText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  composerTriggerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  composerTriggerActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  // Mobile-parity sliding pill tab bar
  pillTabRow: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  pillTabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  pillTabText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  // Create post modal (mobile parity)
  createModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  createModalBox: {
    width: "100%",
    maxWidth: 540,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
  },
  createModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  createModalCloseBtn: { padding: 4 },
  createModalTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  createModalPostBtn: {
    minWidth: 76,
    minHeight: 34,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  createModalPostText: { fontSize: 13, fontFamily: "Poppins_700Bold" },
  createModalAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
  },
  createModalAuthorName: { fontSize: 14, fontFamily: "Poppins_700Bold" },
  createModalVisibilityChip: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  createModalTextArea: {
    minHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Poppins_400Regular",
    textAlignVertical: "top",
  },
  createModalActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
});
