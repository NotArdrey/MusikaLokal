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

const getStationBroadcastStreamUrl = (station: any) => {
  const streamUrl = typeof station?.stream_url === "string" ? station.stream_url.trim() : "";
  if (!streamUrl || station?.is_active === false) return "";

  const streamStatus = typeof station?.stream_status === "string"
    ? station.stream_status.trim().toLowerCase()
    : "";
  return streamStatus === "live" ? streamUrl : "";
};

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

  return firstItem?.title || slot?.playlist?.title || slot?.label || "Local artist spotlight";
};

const getStationArtworkUrl = (station: any) => {
  const candidates = [
    station?.artwork_url,
    station?.cover_url,
    station?.image_url,
    station?.image,
    station?.thumbnail_url,
    station?.creator?.avatar_url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "";
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
              limit: 5,
            },
          });

          if (error) throw error;
          return Array.isArray(data?.data) ? data.data : [];
        };

        const featuredStations = await fetchStations(true);
        const stations = featuredStations.some(isStationPlayable)
          ? featuredStations
          : await fetchStations(false);

        if (!cancelled) {
          setFeaturedStation(stations.find(isStationPlayable) || stations[0] || null);
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

  const liveFeaturedStation = featuredStation && isStationPlayable(featuredStation)
    ? featuredStation
    : null;
  const displayStation = activeStation || liveFeaturedStation || DEMO_RADIO_STATION;
  const hasBroadcastStream = Boolean(getStationBroadcastStreamUrl(displayStation));
  const stationSlotCount = getStationSlotCount(displayStation);
  const stationTrackCount = getStationTrackCount(displayStation);
  const stationPlayableTrackCount = getStationPlayableTrackCount(displayStation);
  const isCurrentStation = Boolean(displayStation?.id && activeStation?.id && displayStation.id === activeStation.id);
  const isTuneInLoading = Boolean(displayStation?.id && loadingStationId === displayStation.id);
  const canTuneIn = Boolean(
    displayStation?.id &&
    displayStation?.is_active !== false &&
    (hasBroadcastStream || stationPlayableTrackCount > 0)
  );
  const stationName = typeof displayStation?.name === "string" && displayStation.name.trim()
    ? displayStation.name.trim()
    : "MusikaLokal Radio";
  const stationSubtitle = typeof displayStation?.description === "string" && displayStation.description.trim()
    ? displayStation.description.trim()
    : "Stream local music and artist features";
  const nowPlayingTitle = isCurrentStation
    ? currentTrack?.title || getStationNowPlayingTitle(displayStation, currentSlotIndex)
    : getStationNowPlayingTitle(displayStation, 0);
  const rotationSummary = hasBroadcastStream
    ? "Live stream"
    : stationTrackCount > 0
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
  const stationArtworkUrl = getStationArtworkUrl(displayStation);
  const stationCreator =
    typeof displayStation?.creator?.full_name === "string" && displayStation.creator.full_name.trim()
      ? displayStation.creator.full_name.trim()
      : "";
  const nowPlayingLine = loadingStation
    ? "Loading rotation"
    : stationCreator
      ? `${nowPlayingTitle} | ${stationCreator}`
      : nowPlayingTitle;
  const stationMetaLine = hasBroadcastStream
    ? "Live stream"
    : stationSlotCount > 0 || stationPlayableTrackCount > 0
      ? `${stationSlotCount || 1} slot | ${stationPlayableTrackCount || stationTrackCount || 0} playable tracks`
      : rotationSummary;

  const handlePlayPress = useCallback(async () => {
    if (!displayStation || loadingStation || isTuneInLoading) return;

    if (!canTuneIn) {
      emitToast({
        dedupeKey: "live-radio-offline",
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
      <View style={[styles.liveRadioArtworkFrame, { backgroundColor: primaryColor + "1F" }]}>
        {stationArtworkUrl ? (
          <CachedImage uri={stationArtworkUrl} style={styles.liveRadioArtwork} width={70} height={70} />
        ) : (
          <Ionicons name="radio" size={26} color={primaryColor} />
        )}
      </View>

      <View style={styles.liveRadioContent}>
        <View style={styles.liveRadioEyebrowRow}>
          <View style={[styles.liveRadioLiveDot, { backgroundColor: primaryColor }]} />
          <Text style={[styles.liveRadioEyebrow, { color: primaryColor }]} numberOfLines={1}>
            {badgeLabel === "LIVE" ? "LIVE RADIO" : "RADIO"}
          </Text>
        </View>

        <Text style={[styles.liveRadioStation, { color: textColor }]} numberOfLines={1}>
          {loadingStation ? "Finding live stations..." : stationName}
        </Text>
        <Text style={[styles.liveRadioSubtitle, { color: mutedTextColor }]} numberOfLines={2}>
          {nowPlayingLine || stationSubtitle}
        </Text>
        <Text style={[styles.liveRadioMetaText, { color: mutedTextColor }]} numberOfLines={1}>
          {stationMetaLine}
        </Text>
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
          <Ionicons name={playIcon} size={24} color="#FFFFFF" />
        )}
      </TouchableOpacity>
    </View>
  );
});

const FEED_PAGE_SIZE = 20;
const AI_CARD_LIMIT = 8;
const AI_RECOMMENDATION_TIMEOUT_MS = 2500;
const PENDING_REOPEN_LISTING_STORAGE_KEY = "pending_reopen_listing_id";
const SOCIAL_MEDIA_ASPECT_RATIO = 1.45;
const PESO_SIGN = "\u20B1";
const KNOWN_FEED_MEDIA_BUCKETS = ["post-media", "posts", "images", "listings", "documents", "avatars"];

const withAiRecommendationTimeout = async <T,>(promise: Promise<T>): Promise<T | null> =>
  Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), AI_RECOMMENDATION_TIMEOUT_MS);
    }),
  ]);

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
        thumbnail_url: resolveFeedMediaUrl(
          item?.thumbnail_url ||
            item?.thumbnail_path ||
            item?.url ||
            item?.storage_path ||
            item?.public_url,
        ),
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

const normalizeAiRecommendationCard = (item: any) => {
  const type = typeof item?.type === "string" && item.type.trim().length > 0 ? item.type.trim() : "Group";
  const isGroup = type.toLowerCase() === "group";
  const isGig = type.toLowerCase() === "gig";
  const ownerId = typeof item?.owner_id === "string" ? item.owner_id : null;
  const organizerId = typeof item?.organizer_id === "string" ? item.organizer_id : null;
  const targetId = isGroup ? item?.id : isGig ? organizerId : ownerId;

  return {
    ...item,
    __feedKind: "ai_card",
    id: item?.id,
    type,
    name: item?.name || `Recommended ${type}`,
    image: typeof item?.image === "string" ? item.image : null,
    images: Array.isArray(item?.images) ? item.images : [],
    body: typeof item?.aiReason === "string" && item.aiReason.trim()
      ? item.aiReason.trim()
      : `Recommended ${type.toLowerCase()} for your profile.`,
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
  };
};

const getFeedItemListKey = (item: any, index: number) => {
  const kind = item?.__feedKind || "post";
  const type = item?.type || item?.post_type || "item";
  return item?.id ? `${kind}:${type}:${item.id}` : `row:${index}`;
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

const formatFeedCountLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getWebFeedMediaUrls = (item: any) => {
  const mediaUrls = Array.isArray(item?.media)
    ? item.media
        .map((media: any) => resolveFeedMediaUrl(
          media?.thumbnail_url ||
            media?.thumbnail_path ||
            media?.url ||
            media?.storage_path ||
            media?.public_url,
        ))
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
    <View
      key={`${uri}-${index}`}
      style={[
        styles.socialGalleryCell,
        {
          width: imageWidth,
          height: imageHeight,
        },
        extraStyle,
      ]}
    >
      <CachedImage
        uri={uri}
        style={[
          styles.socialGalleryImage,
          {
            width: imageWidth,
            height: imageHeight,
          },
        ]}
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
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.socialMediaWrap, { width: mediaWidth }]}
    >
      {galleryContent}
    </TouchableOpacity>
  );
});

const getSocialAvatarUri = (item: any) =>
  resolveFeedMediaUrl(
    item?.author_avatar ||
      item?.image ||
      item?.studio?.image ||
      item?.studio?.avatar_url ||
      item?.linked_studio?.image ||
      item?.linked_studio?.avatar_url ||
      "",
  );

const getSocialDisplayName = (item: any) =>
  item?.name || item?.studio?.name || item?.linked_studio?.name || item?.author_name || "MusikaLokal";

const getSocialMetaLabel = (item: any) => {
  if (item?.__feedKind === "ai_card") {
    const location = typeof item?.location === "string" ? item.location.trim() : "";
    const genre = typeof item?.genre === "string" ? item.genre.trim() : "";
    return location || genre || item?.type || "Recommended";
  }

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
  if (item?.__feedKind === "ai_card") {
    const aiReason = typeof item?.aiReason === "string" ? item.aiReason.trim() : "";
    if (aiReason) return aiReason;
    const body = typeof item?.body === "string" ? item.body.trim() : "";
    if (body) return body;
  }

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
  if (item?.__feedKind === "ai_card") {
    const type = typeof item?.type === "string" ? item.type : "Recommended";
    const badges = [type === "Gig" ? "Live Gig" : type];
    const score = Number(item?.similarity || 0);
    if (score > 0) badges.push(`${Math.round(score * 100)}% match`);
    return Array.from(new Set(badges.filter(Boolean))).slice(0, 3);
  }

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
  item?.__feedKind === "ai_card"
    ? item?.id || ""
    : item?.linked_studio?.id || item?.studio?.id || item?.studio_id || item?.listing_id || "";

const getSocialPrimaryCtaLabel = (item: any, listingId: string) => {
  if (item?.__feedKind === "ai_card") {
    const type = String(item?.type || "").toLowerCase();
    if (type === "group") return "View Group";
    if (type === "gig") return "View Gig";
    if (type === "studio") return "View Studio";
    return "View Details";
  }

  return listingId ? "View Studio" : "View Post";
};

const getSocialHeaderBadge = (item: any) => {
  if (item?.__feedKind === "ai_card") {
    return typeof item?.type === "string" && item.type.trim().length > 0
      ? item.type.trim()
      : "Recommended";
  }

  if (item?.visibility === "followers") return "Followers";
  if (item?.visibility === "public") return "Public";

  return formatCompactPostType(item?.post_type);
};

const getSocialSuggestionQuickInfo = (item: any) => {
  const quickInfo: { icon: keyof typeof Ionicons.glyphMap; label: string; color?: string }[] = [];
  const similarity = Number(item?.similarity || 0);
  const rating = Number(item?.rating || 0);
  const reviewCount = Number(item?.review_count || 0);
  const location = typeof item?.location === "string" ? item.location.trim() : "";
  const genre = typeof item?.genre === "string" ? item.genre.trim() : "";

  if (similarity > 0) {
    quickInfo.push({
      icon: "sparkles-outline",
      label: `${Math.round(similarity * 100)}% match`,
      color: "#7C3AED",
    });
  }

  if (rating > 0) {
    quickInfo.push({
      icon: "star",
      label: reviewCount > 0 ? `${rating.toFixed(1)} (${reviewCount})` : rating.toFixed(1),
      color: "#F59E0B",
    });
  }

  if (location) {
    quickInfo.push({ icon: "location-outline", label: location });
  } else if (genre) {
    quickInfo.push({ icon: "radio-outline", label: genre });
  }

  return quickInfo.slice(0, 3);
};

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
  onToggleReaction: (post: any) => void;
  onSharePost: (post: any) => void;
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
  onToggleReaction,
  onSharePost,
  onRequestDelete,
}: SocialPostCardProps) {
  const isSuggestion = item?.__feedKind === "ai_card";
  const mediaUrls = useMemo(() => getWebFeedMediaUrls(item), [item]);
  const serviceBadges = useMemo(() => getSocialServiceBadges(item), [item]);
  const priceChips = useMemo(() => getSocialPriceChips(item), [item]);
  const avatarUri = useMemo(() => getSocialAvatarUri(item), [item]);
  const listingId = getLinkedStudioId(item);
  const primaryCtaLabel = getSocialPrimaryCtaLabel(item, listingId);
  const headerBadge = getSocialHeaderBadge(item);
  const suggestionQuickInfo = useMemo(() => getSocialSuggestionQuickInfo(item), [item]);
  const reactionCount = getPositiveInteger(item?.reaction_count || item?.like_count || item?.likes);
  const commentCount = getPositiveInteger(item?.comment_count || item?.comments);
  const shareCount = getPositiveInteger(item?.share_count || item?.shares);
  const hasReaction = Boolean(item?.my_reaction || item?.user_reaction);

  const handleOpenPost = useCallback(() => {
    if (isSuggestion && listingId) {
      onOpenStudio(listingId);
      return;
    }
    onOpenPost(item.id);
  }, [isSuggestion, item?.id, listingId, onOpenPost, onOpenStudio]);

  const handleOpenCta = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      if (listingId) {
        onOpenStudio(listingId);
        return;
      }
      onOpenPost(item.id);
    },
    [item?.id, listingId, onOpenPost, onOpenStudio],
  );

  const handleToggleReaction = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      onToggleReaction(item);
    },
    [item, onToggleReaction],
  );

  const handleOpenComments = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      onOpenPost(item.id);
    },
    [item?.id, onOpenPost],
  );

  const handleShare = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      onSharePost(item);
    },
    [item, onSharePost],
  );

  const isOwner = !isSuggestion && !!currentUserId && item?.author_id === currentUserId;
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

        <View style={styles.socialHeaderActions}>
          {headerBadge ? (
            <View style={[styles.socialHeaderBadgeChip, { backgroundColor: colors.primary + "12" }]}>
              <Text style={[styles.socialHeaderBadgeText, { color: colors.primary }]} numberOfLines={1}>
                {headerBadge}
              </Text>
            </View>
          ) : null}

          {!isSuggestion ? (
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
          ) : null}
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

      {isSuggestion && suggestionQuickInfo.length > 0 ? (
        <View style={[styles.socialQuickInfoRow, { borderTopColor: borderColor }]}>
          {suggestionQuickInfo.map((info, index) => (
            <View
              key={`${info.icon}-${info.label}`}
              style={[
                styles.socialQuickInfoItem,
                index === 0 && styles.socialQuickInfoItemStart,
                index === suggestionQuickInfo.length - 1 && styles.socialQuickInfoItemEnd,
              ]}
            >
              <Ionicons
                name={info.icon}
                size={14}
                color={info.color || colors.primary}
              />
              <Text style={[styles.socialQuickInfoText, { color: colors.textSecondary }]} numberOfLines={1}>
                {info.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!isSuggestion ? (
        <View style={[styles.socialStatsRow, { borderTopColor: borderColor }]}>
          <Text style={[styles.socialStatsText, { color: colors.textSecondary }]}>
            {formatFeedCountLabel(reactionCount, "like")}
          </Text>
          <Text style={[styles.socialStatsText, { color: colors.textSecondary }]}>
            {formatFeedCountLabel(commentCount, "comment")}
          </Text>
          <Text style={[styles.socialStatsText, { color: colors.textSecondary }]}>
            {formatFeedCountLabel(shareCount, "share")}
          </Text>
        </View>
      ) : null}

      {!isSuggestion ? (
        <View style={[styles.socialActionRow, { borderTopColor: borderColor, borderBottomColor: borderColor }]}>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={hasReaction ? "Unlike post" : "Like post"}
            onPress={handleToggleReaction}
            style={styles.socialActionButton}
          >
            <Ionicons
              name={hasReaction ? "heart" : "heart-outline"}
              size={19}
              color={hasReaction ? "#EF4444" : colors.textSecondary}
            />
            <Text style={[styles.socialActionText, { color: hasReaction ? "#EF4444" : colors.textSecondary }]}>
              Like
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Comment on post"
            onPress={handleOpenComments}
            style={styles.socialActionButton}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Comment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Share post"
            onPress={handleShare}
            style={styles.socialActionButton}
          >
            <Ionicons name="share-social-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.socialActionText, { color: colors.textSecondary }]}>Share</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isSuggestion ? (
      <View style={styles.socialCtaRow}>
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={handleOpenCta}
          style={[
            styles.socialPrimaryCta,
            isSuggestion
              ? { backgroundColor: colors.primary }
              : {
                  backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                  borderColor,
                  borderWidth: 1,
                },
          ]}
        >
          <Text style={[styles.socialPrimaryCtaText, { color: isSuggestion ? "#FFFFFF" : colors.primary }]}>
            {primaryCtaLabel}
          </Text>
          <Ionicons name="chevron-forward" size={15} color={isSuggestion ? "#FFFFFF" : colors.primary} />
        </TouchableOpacity>
        {isSuggestion ? (
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.socialSecondaryCta,
              {
                borderColor,
                backgroundColor: isDark ? "#1E293B" : "#F8FAFC",
              },
            ]}
          >
            <Text style={[styles.socialSecondaryCtaText, { color: colors.textSecondary }]}>
              Following
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      ) : null}
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

const readFunctionErrorMessage = async (error: any, fallback: string) => {
  const context = error?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      const message = payload?.error || payload?.message;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // Fall through to the generic client error.
    }
  }

  const message = error?.message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
};

export default function FeedScreen() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    reopenListingId?: string;
    listingId?: string;
    listing_id?: string;
    listingType?: string;
    listing_type?: string;
    gig_id?: string;
    studio_id?: string;
    postId?: string;
    post_id?: string;
  }>();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const feedColors = useMemo(
    () =>
      isWebDesktop
        ? {
            ...colors,
            background: "#1E293B",
            surface: "#1E293B",
            border: "#334155",
            text: "#F8FAFC",
            textSecondary: "#A8B3C5",
          }
        : colors,
    [colors, isWebDesktop],
  );

  const [tab, setTab] = useState<FeedTab>("for_you");
  const [posts, setPosts] = useState<any[]>([]);
  const [aiCards, setAiCards] = useState<any[]>([]);
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

  const bg = isWebDesktop ? "#1E293B" : feedColors.background;
  const cardBg = isWebDesktop ? "#1E293B" : feedColors.surface;
  const borderCol = isWebDesktop ? "#334155" : feedColors.border;

  const canCreatePost = !!session && !isGuest && (normalizeVisibleInput(postBody).length > 0 || selectedMedia.length > 0);

  const fetchAiCardsForYou = useCallback(async () => {
    if (!session?.user?.id || isGuest) {
      setAiCards([]);
      return;
    }

    try {
      const aiInvokeResult = await withAiRecommendationTimeout(
        supabase.functions.invoke("home-feed", {
          body: {
            action: "for-you",
            limit: AI_CARD_LIMIT,
            userId: session.user.id,
          },
        }),
      );

      if (!aiInvokeResult) {
        return;
      }

      if (aiInvokeResult.error) {
        logFeedInvokeError("home-feed:for-you", aiInvokeResult.error, {
          action: "for-you",
          timeoutMs: AI_RECOMMENDATION_TIMEOUT_MS,
        });
        return;
      }

      const recommendations = Array.isArray(aiInvokeResult.data?.recommendations)
        ? aiInvokeResult.data.recommendations
        : Array.isArray(aiInvokeResult.data?.aiRecommendations)
          ? aiInvokeResult.data.aiRecommendations
          : [];

      const cards = recommendations
        .map(normalizeAiRecommendationCard)
        .filter((card: any) => typeof card?.id === "string" && card.id.length > 0)
        .slice(0, AI_CARD_LIMIT);

      setAiCards(cards);
    } catch (aiError: any) {
      logFeedInvokeError("home-feed:for-you", aiError, {
        action: "for-you",
      });
    }
  }, [isGuest, session?.user?.id]);

  const fetchFeed = useCallback(
    async (feedTab: FeedTab, append = false) => {
      if (!session || isGuest) {
        setPosts([]);
        setAiCards([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!append && feedTab !== "for_you") {
        setAiCards([]);
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

        if (feedTab === "for_you" && !append) {
          void fetchAiCardsForYou();
        }
      } catch (e: any) {
        setAlert({ type: "error", title: "Error", message: e?.message || "Failed to load feed." });
        if (!append) setPosts([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [fetchAiCardsForYou, isGuest, posts.length, session],
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
    const firstRouteParam = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
    const listingType = (firstRouteParam(params.listingType) || firstRouteParam(params.listing_type) || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const reopenListingId =
      firstRouteParam(params.reopenListingId) ||
      firstRouteParam(params.studio_id) ||
      firstRouteParam(params.gig_id) ||
      firstRouteParam(params.listingId) ||
      firstRouteParam(params.listing_id);

    if (!reopenListingId || reopenListingId.length === 0) return;

    if (listingType === "production_team" || listingType === "production") {
      router.push({ pathname: "/production_team", params: { teamId: reopenListingId } } as any);
      try {
        router.setParams({
          reopenListingId: undefined as any,
          listingId: undefined as any,
          listing_id: undefined as any,
          listingType: undefined as any,
          listing_type: undefined as any,
          gig_id: undefined as any,
          studio_id: undefined as any,
        });
      } catch {
        // The production page still opens even if this router state cannot clear params.
      }
      return;
    }

    openListingDetails(reopenListingId);

    try {
      router.setParams({
        reopenListingId: undefined as any,
        listingId: undefined as any,
        listing_id: undefined as any,
        listingType: undefined as any,
        listing_type: undefined as any,
        gig_id: undefined as any,
        studio_id: undefined as any,
      });
    } catch {
      // Older router states may not accept clearing params here; the listing still opens.
    }
  }, [
    openListingDetails,
    params.gig_id,
    params.listingId,
    params.listingType,
    params.listing_id,
    params.listing_type,
    params.reopenListingId,
    params.studio_id,
  ]);

  useEffect(() => {
    const routePostId = Array.isArray(params.postId)
      ? params.postId[0]
      : params.postId || (Array.isArray(params.post_id) ? params.post_id[0] : params.post_id);

    if (!routePostId || routePostId.length === 0) return;

    setOpenPostId(routePostId);

    try {
      router.setParams({ postId: undefined as any, post_id: undefined as any });
    } catch {
      // The post modal still opens even if this router state cannot clear params.
    }
  }, [params.postId, params.post_id]);

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
      let uploadedMedia: {
        storage_path: string;
        media_type: "image" | "video";
        mime_type: string;
        is_cover: boolean;
        safety_status: "passed";
        safety_context: string;
        safety_checked_at: string;
        safety_metadata: Record<string, unknown>;
      }[] = [];

      if (selectedMedia.length > 0 && userId) {
        for (const item of selectedMedia) {
          const ext = (item.file.name.split(".").pop() || "bin").toLowerCase();
          const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
          const path = `${userId}/posts/${filename}`;
          const { error: upErr } = await supabase.storage
            .from("post-media")
            .upload(path, item.file, { contentType: item.file.type, upsert: false });
          if (upErr) throw upErr;
          uploadedMedia.push({
            storage_path: path,
            media_type: item.file.type.startsWith("video") ? "video" : "image",
            mime_type: item.file.type,
            is_cover: uploadedMedia.length === 0,
            safety_status: "passed",
            safety_context: "social_post_media",
            safety_checked_at: new Date().toISOString(),
            safety_metadata: { client_screened: false },
          });
        }
      }

      const { data, error } = await supabase.functions.invoke("manage-social-feed", {
        body: {
          action: "create_post",
          content,
          visibility: postVisibility,
          media: uploadedMedia,
        },
      });

      if (error) {
        throw new Error(await readFunctionErrorMessage(error, "Failed to create post."));
      }

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
    () => (isWebDesktop ? Math.min(width - 80, 640) : width),
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

  const handleTogglePostReaction = useCallback(
    async (post: any) => {
      const postId = typeof post?.id === "string" ? post.id : "";
      if (!postId) return;
      if (!session || isGuest) {
        emitToast({ type: "info", title: "Sign in required", message: "Log in to like posts." });
        return;
      }

      const hadReaction = Boolean(post?.my_reaction || post?.user_reaction);
      const currentCount = getPositiveInteger(post?.reaction_count || post?.like_count || post?.likes);
      const nextCount = hadReaction ? Math.max(currentCount - 1, 0) : currentCount + 1;
      const nextReaction = hadReaction ? null : "like";

      setPosts((current) =>
        current.map((p) =>
          p.id === postId
            ? {
                ...p,
                my_reaction: nextReaction,
                user_reaction: nextReaction,
                reaction_count: nextCount,
                like_count: nextCount,
              }
            : p,
        ),
      );

      try {
        const { data, error } = await supabase.functions.invoke("manage-social-feed", {
          body: hadReaction
            ? { action: "remove_reaction", post_id: postId }
            : { action: "react_to_post", post_id: postId, reaction_type: "like" },
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Could not update reaction.");
      } catch (e: any) {
        setPosts((current) =>
          current.map((p) =>
            p.id === postId
              ? {
                  ...p,
                  my_reaction: hadReaction ? "like" : null,
                  user_reaction: hadReaction ? "like" : null,
                  reaction_count: currentCount,
                  like_count: currentCount,
                }
              : p,
          ),
        );
        emitToast({ type: "error", title: "Like failed", message: e?.message || "Could not update this post." });
      }
    },
    [isGuest, session],
  );

  const handleSharePost = useCallback(
    async (post: any) => {
      const postId = typeof post?.id === "string" ? post.id : "";
      if (!postId) return;

      const shareUrl =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/feed?postId=${encodeURIComponent(postId)}`
          : `https://musikalokal.app/feed?postId=${encodeURIComponent(postId)}`;
      const shareTitle = `${getSocialDisplayName(post)} on MusikaLokal`;
      const shareText = getSocialCaption(post);

      try {
        const webNavigator = Platform.OS === "web" && typeof navigator !== "undefined" ? navigator : null;
        if (webNavigator?.share) {
          await webNavigator.share({ title: shareTitle, text: shareText, url: shareUrl });
        } else if (webNavigator?.clipboard?.writeText) {
          await webNavigator.clipboard.writeText(shareUrl);
          emitToast({ type: "success", title: "Link copied", message: "Post link copied to clipboard." });
        } else {
          emitToast({ type: "info", title: "Share link", message: shareUrl });
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        emitToast({ type: "error", title: "Share failed", message: e?.message || "Could not share this post." });
        return;
      }

      if (!session || isGuest) return;

      try {
        const { data, error } = await supabase.functions.invoke("manage-social-feed", {
          body: { action: "share_post", post_id: postId },
        });
        if (error) throw error;
        const shareCount = getPositiveInteger(data?.data?.share_count);
        setPosts((current) =>
          current.map((p) =>
            p.id === postId
              ? { ...p, share_count: shareCount || getPositiveInteger(p?.share_count || p?.shares) + 1 }
              : p,
          ),
        );
      } catch (e: any) {
        console.error("Share count update failed:", e);
      }
    },
    [isGuest, session],
  );

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

  const feedItems = useMemo(
    () => (tab === "for_you" ? [...aiCards, ...posts] : posts),
    [aiCards, posts, tab],
  );

  const renderPost = useCallback(
    ({ item }: { item: any }) => (
      <SocialPostCard
        item={item}
        borderColor={borderCol}
        cardColor={cardBg}
        colors={feedColors}
        isDark={isDark}
        mediaWidth={mediaWidth}
        currentUserId={session?.user?.id || null}
        onOpenPost={openPostDetails}
        onOpenStudio={openStudioDetails}
        onToggleReaction={handleTogglePostReaction}
        onSharePost={handleSharePost}
        onRequestDelete={requestDeletePost}
        width={contentWidth}
      />
    ),
    [borderCol, cardBg, feedColors, contentWidth, handleSharePost, handleTogglePostReaction, isDark, mediaWidth, openPostDetails, openStudioDetails, requestDeletePost, session?.user?.id],
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      {!isWebDesktop && <Header title="Feed" onBackPress={() => router.back()} />}

      <View style={[styles.pageWrap, isWebDesktop && styles.pageWrapWeb]}>
        <View style={[styles.centerColumn, isWebDesktop && { width: contentWidth }]}>
          <SmoothTabTransition activeKey={tab} style={{ flex: 1 }}>
            <FlatList
              data={feedItems}
              keyExtractor={getFeedItemListKey}
              renderItem={renderPost}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={feedColors.primary} />}
              onEndReached={loadMore}
              onEndReachedThreshold={0.35}
              contentContainerStyle={[styles.listContent, isWebDesktop && styles.listContentWeb]}
              ListHeaderComponent={
                <View style={[styles.headerBlock, { width: contentWidth }]}>
                  {/* Search trigger row (mobile parity) */}
                  <View style={styles.searchBand}>
                    <View style={styles.searchRow}>
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => router.push("/discover")}
                        style={[
                          styles.searchTrigger,
                          { backgroundColor: "#3A465A" },
                        ]}
                      >
                        <Ionicons name="search" size={24} color={feedColors.textSecondary} />
                        <Text
                          style={[styles.searchTriggerText, { color: feedColors.textSecondary }]}
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
                          { backgroundColor: "#3A465A" },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Open search filters"
                      >
                        <Ionicons name="options-outline" size={24} color={feedColors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* "What's on your mind" trigger (opens modal, mobile parity) */}
                  <View
                    style={[
                      styles.composerTriggerCard,
                      { backgroundColor: "#0F172A", borderColor: borderCol, shadowOpacity: 0 },
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
                              { backgroundColor: feedColors.primary + "22" },
                            ]}
                          >
                            <Ionicons name="person" size={22} color={feedColors.primary} />
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
                          { backgroundColor: "#3A465A" },
                        ]}
                      >
                        <Text style={[styles.composerTriggerText, { color: feedColors.textSecondary }]} numberOfLines={1}>
                          {session && !isGuest
                            ? "What's on your mind?"
                            : "Sign in to post and view your feed."}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={!session || isGuest ? 1 : 0.78}
                        onPress={() => {
                          if (!session || isGuest) return;
                          setShowCreate(true);
                          setTimeout(() => handlePickMedia(), 50);
                        }}
                        disabled={!session || isGuest}
                        style={[styles.composerMediaIconButton, { backgroundColor: feedColors.primary + "12" }]}
                        accessibilityRole="button"
                        accessibilityLabel="Add media"
                      >
                        <Ionicons name="images-outline" size={25} color={feedColors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <LiveRadioCard
                    borderColor={borderCol}
                    cardColor="#0F172A"
                    isDark
                    primaryColor={feedColors.primary}
                    textColor={feedColors.text}
                    mutedTextColor={feedColors.textSecondary}
                  />

                  {/* Sliding pill tab bar (mobile parity) */}
                  <View
                    style={[
                      styles.pillTabRow,
                      {
                        backgroundColor: "#1E293B",
                        borderColor: borderCol,
                      },
                    ]}
                  >
                    {[
                      { key: "for_you", label: "For You" },
                      { key: "following", label: "Following" },
                    ].map((item) => {
                      const active = tab === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          activeOpacity={1}
                          style={[
                            styles.pillTabButton,
                            active && { borderBottomColor: "#FFFFFF" },
                          ]}
                          onPress={() => setTab(item.key as FeedTab)}
                        >
                          <Text
                            style={[
                              styles.pillTabText,
                              { color: active ? "#FFFFFF" : feedColors.textSecondary },
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
                  <ActivityIndicator size="large" color={feedColors.primary} style={styles.loading} />
                ) : (
                  <View
                    style={[
                      styles.emptyStateContainer,
                      {
                        width: contentWidth,
                        backgroundColor: cardBg,
                        borderColor: borderCol,
                        shadowOpacity: 0,
                      },
                    ]}
                  >
                    <View style={[styles.emptyIconCircle, { backgroundColor: feedColors.primary + "12" }]}>
                      <Ionicons
                        name={session && !isGuest ? "sparkles-outline" : "lock-closed-outline"}
                        size={34}
                        color={feedColors.primary}
                      />
                    </View>
                    <Text style={[styles.emptyTitle, { color: feedColors.text }]}>
                      {session && !isGuest ? "Your feed is warming up" : "Sign in to unlock the feed"}
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: feedColors.textSecondary }]}>
                      {session && !isGuest
                        ? "Follow local artists, studios, and creators to start shaping a feed that looks more like your music world."
                        : "Join MusikaLokal to post updates, discover local talent, and build a personalized For You stream."}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() => router.push(session && !isGuest ? "/discover" : "/")}
                      style={[styles.emptyActionBtn, { backgroundColor: feedColors.primary }]}
                    >
                      <Ionicons
                        name={session && !isGuest ? "compass-outline" : "log-in-outline"}
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.emptyActionBtnText}>
                        {session && !isGuest ? "Explore Musicians" : "Sign In"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )
              }
              ListFooterComponent={
                loadingMore ? (
                  <ActivityIndicator size="small" color={feedColors.primary} style={styles.footerLoader} />
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
  listContent: { paddingHorizontal: 0, paddingBottom: 24, alignItems: "center" },
  listContentWeb: { paddingTop: 18 },
  headerBlock: { gap: 12, marginBottom: 14 },
  liveRadioCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  liveRadioArtworkFrame: {
    width: 46,
    height: 46,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  liveRadioArtwork: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  liveRadioContent: {
    flex: 1,
    minWidth: 0,
  },
  liveRadioEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 5,
  },
  liveRadioLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveRadioEyebrow: {
    fontSize: 10,
    lineHeight: 12,
    fontFamily: "Poppins_700Bold",
    textTransform: "uppercase",
  },
  liveRadioStation: {
    fontSize: 20,
    lineHeight: 25,
    fontFamily: "Poppins_700Bold",
  },
  liveRadioSubtitle: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 2,
    fontFamily: "Poppins_400Regular",
  },
  liveRadioMetaText: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  liveRadioPlayButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  tabRow: { flexDirection: "row", gap: 10 },
  tabButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  tabText: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  composer: { borderWidth: 1, borderRadius: 14, padding: 12 },
  composerInput: { minHeight: 82, fontSize: 14, lineHeight: 20, textAlignVertical: "top" },
  composerFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 10 },
  visibilityToggle: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  visibilityToggleText: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  postButton: { minWidth: 92, minHeight: 38, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  postButtonText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  pageWrap: { flex: 1 },
  pageWrapWeb: {
    alignSelf: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 840,
    paddingHorizontal: 28,
    paddingTop: 0,
  },
  centerColumn: { flex: 1, width: "100%", maxWidth: 640, alignSelf: "center" },
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
    borderRadius: 14,
    padding: 12,
    paddingBottom: 14,
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 14,
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
  socialHeaderActions: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "flex-start",
    gap: 6,
    flexShrink: 0,
    marginTop: 1,
  },
  socialHeaderBadgeChip: {
    height: 28,
    maxWidth: 96,
    borderRadius: 999,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  socialHeaderBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  socialName: {
    fontSize: 18,
    lineHeight: 23,
    fontFamily: "Poppins_700Bold",
  },
  socialMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 1,
  },
  socialMetaText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  socialMetaDot: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: "Poppins_700Bold",
  },
  socialMenuButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Poppins_400Regular",
    marginTop: 10,
  },
  socialMediaWrap: {
    marginTop: 10,
    borderRadius: 10,
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
    borderRadius: 10,
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
  socialQuickInfoRow: {
    marginTop: 12,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    gap: 10,
  },
  socialQuickInfoItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  socialQuickInfoItemStart: {
    justifyContent: "flex-start",
  },
  socialQuickInfoItemEnd: {
    justifyContent: "flex-end",
  },
  socialQuickInfoText: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Poppins_700Bold",
  },
  socialBadgeChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  socialBadgeText: {
    fontSize: 12,
    lineHeight: 16,
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
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Poppins_700Bold",
  },
  socialActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 4,
    minHeight: 40,
    borderTopWidth: 1,
    borderBottomWidth: 1,
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
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 12,
  },
  socialPrimaryCta: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  socialPrimaryCtaText: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Poppins_700Bold",
  },
  socialSecondaryCta: {
    minWidth: 112,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  socialSecondaryCtaText: {
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Poppins_700Bold",
  },
  socialStatsRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  socialStatsText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
    textAlign: "center",
  },
  loading: { marginTop: 40 },
  emptyWrap: { minHeight: 260, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: 14, fontFamily: "Poppins_500Medium" },
  footerLoader: { paddingVertical: 20 },
  // Mobile-parity search trigger row
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchBand: {
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: "#1E293B",
  },
  searchTrigger: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchTriggerText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Poppins_500Medium",
  },
  searchFilterBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mobile-parity composer trigger card
  composerTriggerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
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
    paddingVertical: 9,
    borderRadius: 999,
    justifyContent: "center",
  },
  composerTriggerText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: "Poppins_400Regular",
  },
  composerMediaIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  composerTriggerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  composerTriggerActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(148,163,184,0.08)",
  },
  // Mobile-parity sliding pill tab bar
  pillTabRow: {
    flexDirection: "row",
    marginHorizontal: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    minHeight: 54,
    gap: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  pillTabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 0,
    borderRadius: 0,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
  },
  pillTabText: { fontSize: 16, lineHeight: 22, fontFamily: "Poppins_700Bold" },
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
  emptyStateContainer: {
    minHeight: 320,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 26,
    paddingVertical: 34,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    marginTop: 4,
  },
  emptyIconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    maxWidth: 420,
  },
  emptyActionBtn: {
    marginTop: 20,
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyActionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Poppins_700Bold",
  },
});
