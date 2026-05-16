import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    type DimensionValue,
    View,
} from "react-native";
import { PH_MUSIC_GROUP_TYPES } from "../constants/groupTypes";
import { useAuth } from "../context/AuthContext";
import { emitToast } from "../events/toastBus";
import { useTheme } from "../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { getGigApplicationDeadlineInfo } from "../utils/gigApplication";
import { addFavoriteChangedListener, emitFavoriteChanged } from "../utils/favoriteEvents";
import { isFanUserRole } from "../utils/roleRouting";
import CachedImage from "./CachedImage";
import PagerView from "./PagerView";

const debugLog = (..._args: unknown[]) => { };

const getFavoriteTargetType = (
  listingType?: string,
): "group" | "studio" | "gig" | "profile" | null => {
  const normalized = (listingType || "").toLowerCase();
  if (normalized === "group") return "group";
  if (normalized === "artist" || normalized === "musician") return "profile";
  if (normalized === "studio" || normalized === "venue") return "studio";
  if (normalized === "gig") return "gig";
  return null;
};

interface ListingCardProps {
  item: any;
  onPress: (item: any) => void;
  onInvite?: (item: any) => void;
  onChat?: (item: any) => void;
  variant?: "horizontal" | "vertical" | "feed";
  style?: any;
  hasGroups?: boolean;
  showGigSummary?: boolean;
  actionSlot?: React.ReactNode;
}

type OptimizedListingImageStripProps = {
  images: string[];
  pageIndex: number;
  onPageIndexChange: (index: number) => void;
  fallbackUri?: string | null;
  cacheVersion?: string | number | null;
  pagerStyle: any;
  imageStyle: any;
  pageWidth: DimensionValue;
  imageWidth: number;
  imageHeight: number;
};

type PriceDisplayItem = {
  key: string;
  amount: string;
  unit?: string;
  label?: string;
};

const PESO_SIGN = "\u20B1";

const getPositiveInteger = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const buildPriceItem = (
  key: string,
  value: unknown,
  unit?: string,
  label?: string,
): PriceDisplayItem | null => {
  const amount = getPositiveInteger(value);
  if (amount <= 0) return null;

  return {
    key,
    amount: `${PESO_SIGN}${amount.toLocaleString()}`,
    unit,
    label,
  };
};

const formatPriceDisplayLabel = (priceItem: PriceDisplayItem) => {
  const unit = priceItem.unit ? priceItem.unit.replace("/", " / ") : "";
  const label = priceItem.label ? ` (${priceItem.label})` : "";
  return `${priceItem.amount}${unit}${label}`;
};

const LISTING_FALLBACK_IMAGES: Record<string, string[]> = {
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

const getListingFallbackImage = (type?: string, id?: string | number | null) => {
  const normalizedType = typeof type === "string" && type.length > 0 ? type : "Group";
  const images = LISTING_FALLBACK_IMAGES[normalizedType] || LISTING_FALLBACK_IMAGES.Group;
  const seed = String(id || normalizedType)
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return images[seed % images.length];
};

const shouldMountListingImagePage = (
  index: number,
  activeIndex: number,
  total: number,
) => {
  if (Math.abs(index - activeIndex) <= 1) return true;

  return (
    (activeIndex === 0 && index === total - 1) ||
    (activeIndex === total - 1 && index === 0)
  );
};

const OptimizedListingImageStrip = memo(
  function OptimizedListingImageStrip({
    images,
    pageIndex,
    onPageIndexChange,
    fallbackUri,
    cacheVersion,
    pagerStyle,
    imageStyle,
    pageWidth,
    imageWidth,
    imageHeight,
  }: OptimizedListingImageStripProps) {
    const safePageIndex = Math.min(Math.max(pageIndex, 0), images.length - 1);

    if (images.length <= 1) {
      return (
        <CachedImage
          uri={images.length > 0 ? images[0] : undefined}
          fallbackUri={fallbackUri}
          style={imageStyle}
          width={imageWidth}
          height={imageHeight}
          cacheVersion={cacheVersion}
        />
      );
    }

    if (Platform.OS === "web") {
      return (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={pagerStyle}
          nestedScrollEnabled
          directionalLockEnabled
          scrollEnabled
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onMomentumScrollEnd={(e) => {
            const containerWidth =
              typeof pageWidth === "number"
                ? pageWidth
                : e.nativeEvent.layoutMeasurement.width;
            const nextIndex = Math.round(
              e.nativeEvent.contentOffset.x / Math.max(containerWidth, 1),
            );
            onPageIndexChange(Math.min(Math.max(nextIndex, 0), images.length - 1));
          }}
        >
          {images.map((img: string, index: number) => (
            <View key={`${img}-${index}`} style={[styles.pagerPage, { width: pageWidth }]}>
              {shouldMountListingImagePage(index, safePageIndex, images.length) ? (
                <CachedImage
                  uri={img}
                  fallbackUri={fallbackUri}
                  style={imageStyle}
                  width={imageWidth}
                  height={imageHeight}
                  cacheVersion={cacheVersion}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
      );
    }

    return (
      <PagerView
        style={pagerStyle}
        initialPage={safePageIndex}
        scrollEnabled
        onPageSelected={(e: any) => {
          onPageIndexChange(e.nativeEvent.position);
        }}
      >
        {images.map((img: string, index: number) => (
          <View key={`${img}-${index}`} style={styles.pagerPage}>
            {shouldMountListingImagePage(index, safePageIndex, images.length) ? (
              <CachedImage
                uri={img}
                fallbackUri={fallbackUri}
                style={imageStyle}
                width={imageWidth}
                height={imageHeight}
                cacheVersion={cacheVersion}
              />
            ) : null}
          </View>
        ))}
      </PagerView>
    );
  },
);

const ListingCard: React.FC<ListingCardProps> = ({
  item,
  onPress,
  onInvite,
  onChat,
  variant = "horizontal",
  style,
  hasGroups,
  showGigSummary = true,
  actionSlot,
}) => {
  const { colors, isDark } = useTheme();
  const { userRole, userId } = useAuth(); // To avoid showing warning to owners
  const isFan = isFanUserRole(userRole);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const isFeedVariant = variant === "feed";

  // Check if current user can invite (ONLY venue-owner viewing a musician/Group)
  const canInvite = useMemo(
    () =>
      userRole === "venue-owner" &&
      (item.type === "Group" || item.type === "Artist"),
    [item.type, userRole],
  );

  const favoriteTargetType = useMemo(
    () => getFavoriteTargetType(item?.type),
    [item?.type],
  );

  useEffect(() => {
    if (typeof item?.is_favorited === "boolean") {
      setIsBookmarked(item.is_favorited);
    }
  }, [item?.id, item?.is_favorited]);

  useEffect(() => {
    if (!favoriteTargetType || !item?.id) return;

    const subscription = addFavoriteChangedListener((payload) => {
      if (payload.targetType !== favoriteTargetType || payload.id !== item.id) {
        return;
      }

      setIsBookmarked(payload.isFavorited);
    });

    return () => {
      subscription.remove();
    };
  }, [favoriteTargetType, item?.id]);

  // Group Warning Logic
  const showGroupWarning = useMemo(
    () =>
      item.type === "Gig" &&
      item.requirements?.musician_type === "group" &&
      hasGroups === false &&
      userRole === "musician",
    [hasGroups, item.requirements?.musician_type, item.type, userRole],
  );

  // Gig Application Deadline Logic (24hrs before event)
  const gigDeadlineInfo = useMemo(() => {
    return getGigApplicationDeadlineInfo(item);
  }, [item]);

  const getPreferenceTagText = useCallback((label: string, values: unknown) => {
    if (!Array.isArray(values) || values.length === 0) return null;
    const cleaned = values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (cleaned.length === 0) return null;
    const first = cleaned[0];
    const remaining = cleaned.length - 1;
    return `${label}: ${first}${remaining > 0 ? ` +${remaining}` : ""}`;
  }, []);

  const preferredBandTypeBadges = useMemo(() => {
    const types = item?.requirements?.slots?.band?.preferred_group_types;
    if (!Array.isArray(types) || types.length === 0) return [] as string[];

    const counts = new Map<string, number>();
    types.forEach((typeId: unknown) => {
      if (typeof typeId !== "string" || !typeId) return;
      counts.set(typeId, (counts.get(typeId) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([typeId, count]) => {
      const type = PH_MUSIC_GROUP_TYPES.find((entry) => entry.id === typeId);
      const label = type?.label || "Group";
      return count > 1 ? `${label} (${count})` : label;
    });
  }, [item?.requirements?.slots?.band?.preferred_group_types]);

  // Determine "Subtitle" (Location or Genre)
  const subtitle = useMemo(() => {
    const baseSubtitle = item.location || item.address;
    if ((item.type === "Group" || item.type === "Artist") && item.genre) {
      return item.genre;
    }
    return baseSubtitle;
  }, [item.address, item.genre, item.location, item.type]);

  // Determine "Price/Rate" Label - handle dynamic pricing for studios
  // Skip pricing for Groups
  const { priceLabel, secondaryPriceLabel, priceItems, isGroup } = useMemo(() => {
    const nextPriceItems: PriceDisplayItem[] = [];
    let nextPriceLabel = "";
    let nextSecondaryPriceLabel = "";
    const nextIsGroup = item.type === "Group";
    const rehearsalRateValue = getPositiveInteger(item.rehearsal_rate);
    const recordingRateValue = getPositiveInteger(item.recording_rate);
    const isRecordingOnlyStudio =
      item.type === "Studio" && item.studio_type === "Recording";
    const isRehearsalOnlyStudio =
      item.type === "Studio" && item.studio_type === "Rehearsal";
    const hasRehearsalRate = rehearsalRateValue > 0 && !isRecordingOnlyStudio;
    const hasRecordingRate = recordingRateValue > 0 && !isRehearsalOnlyStudio;

    if (!nextIsGroup && item.type === "Studio") {
      if (hasRehearsalRate && hasRecordingRate) {
        nextPriceLabel = `₱${rehearsalRateValue.toLocaleString()} / hr (Rehearsal)`;
        nextSecondaryPriceLabel = `₱${recordingRateValue.toLocaleString()} / song (Recording)`;
      } else if (hasRehearsalRate) {
        nextPriceLabel = `₱${rehearsalRateValue.toLocaleString()} / hr`;
      } else if (hasRecordingRate) {
        nextPriceLabel = `₱${recordingRateValue.toLocaleString()} / song`;
      } else if (item.hourly_rate && item.hourly_rate !== "0") {
        nextPriceLabel = `₱${parseInt(item.hourly_rate).toLocaleString()} / hr`;
      } else {
        nextPriceLabel = "";
      }
    } else if (item.hourly_rate && item.hourly_rate !== "0") {
      nextPriceLabel = `₱${parseInt(item.hourly_rate).toLocaleString()} / hr`;
    } else if (item.rehearsal_rate && item.rehearsal_rate !== "0") {
      nextPriceLabel = `₱${parseInt(item.rehearsal_rate).toLocaleString()} / hr`;
    } else if (item.recording_rate && item.recording_rate !== "0") {
      nextPriceLabel = `₱${parseInt(item.recording_rate).toLocaleString()} / song`;
    } else if (item.budget && item.budget !== "0") {
      nextPriceLabel = `₱${parseInt(item.budget).toLocaleString()}`;
    } else if (item.rate && item.rate !== "0") {
      if (typeof item.rate === "string" && item.rate.includes("/")) {
        nextPriceLabel = `₱${item.rate}`;
      } else {
        nextPriceLabel = `₱${parseInt(item.rate).toLocaleString()}`;
      }
    } else {
      nextPriceLabel = "";
    }

    if (!nextIsGroup && item.type === "Studio") {
      if (hasRehearsalRate && hasRecordingRate) {
        nextPriceItems.push(
          buildPriceItem("rehearsal", rehearsalRateValue, "/hr", "Rehearsal")!,
          buildPriceItem("recording", recordingRateValue, "/song", "Recording")!,
        );
      } else if (hasRehearsalRate) {
        nextPriceItems.push(
          buildPriceItem("rehearsal", rehearsalRateValue, "/hr", "Rehearsal")!,
        );
      } else if (hasRecordingRate) {
        nextPriceItems.push(
          buildPriceItem("recording", recordingRateValue, "/song", "Recording")!,
        );
      } else {
        const hourlyPrice = buildPriceItem("hourly", item.hourly_rate, "/hr");
        if (hourlyPrice) nextPriceItems.push(hourlyPrice);
      }
    } else if (!nextIsGroup) {
      const hourlyPrice = buildPriceItem("hourly", item.hourly_rate, "/hr");
      const rehearsalPrice = buildPriceItem("rehearsal", item.rehearsal_rate, "/hr", "Rehearsal");
      const recordingPrice = buildPriceItem("recording", item.recording_rate, "/song", "Recording");
      const budgetPrice = buildPriceItem("budget", item.budget, undefined, "Budget");
      const numericRatePrice = buildPriceItem("rate", item.rate, undefined, "Rate");

      if (hourlyPrice) {
        nextPriceItems.push(hourlyPrice);
      } else if (rehearsalPrice) {
        nextPriceItems.push(rehearsalPrice);
      } else if (recordingPrice) {
        nextPriceItems.push(recordingPrice);
      } else if (budgetPrice) {
        nextPriceItems.push(budgetPrice);
      } else if (typeof item.rate === "string" && item.rate.trim() && item.rate !== "0") {
        const rawRate = item.rate.trim();
        nextPriceItems.push({
          key: "rate",
          amount: rawRate.startsWith(PESO_SIGN) ? rawRate : `${PESO_SIGN}${rawRate}`,
          label: "Rate",
        });
      } else if (numericRatePrice) {
        nextPriceItems.push(numericRatePrice);
      }
    }

    return {
      priceLabel: nextPriceItems[0] ? formatPriceDisplayLabel(nextPriceItems[0]) : nextPriceLabel,
      secondaryPriceLabel: nextPriceItems[1]
        ? formatPriceDisplayLabel(nextPriceItems[1])
        : nextSecondaryPriceLabel,
      priceItems: nextPriceItems,
      isGroup: nextIsGroup,
    };
  }, [item]);

  const renderPriceItems = useCallback(
    (compact = false) => (
      <View style={[styles.priceList, compact && styles.feedPriceList]}>
        {priceItems.map((priceItem) => (
          <View key={priceItem.key} style={styles.priceItemRow}>
            <View
              style={[
                styles.priceChip,
                {
                  backgroundColor: isDark
                    ? "rgba(139,92,246,0.16)"
                    : "rgba(124,58,237,0.09)",
                  borderColor: isDark
                    ? "rgba(167,139,250,0.26)"
                    : "rgba(124,58,237,0.16)",
                },
              ]}
            >
              <Text style={[styles.priceAmount, { color: colors.primary }]}>
                {priceItem.amount}
              </Text>
              {priceItem.unit ? (
                <Text style={[styles.priceUnit, { color: colors.textSecondary }]}>
                  {priceItem.unit}
                </Text>
              ) : null}
            </View>
            {priceItem.label ? (
              <Text
                style={[styles.priceLabelText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {priceItem.label}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    ),
    [colors.primary, colors.textSecondary, isDark, priceItems],
  );

  // Determine Badge Color & Label
  const { badgeLabel, badgeColor } = useMemo(() => {
    let nextBadgeLabel = item.type;
    let nextBadgeColor = "#7C3AED";

    const normalizedType = item.type || (item.hourly_rate ? "Studio" : "Artist");

    if (normalizedType === "Studio") {
      nextBadgeLabel =
        item.studio_type === "Both"
          ? "Rehearsal & Recording"
          : item.studio_type || "Studio";
      nextBadgeColor = "#7C3AED";
    } else if (normalizedType === "Gig") {
      nextBadgeLabel = "Gig";
      nextBadgeColor = "#10B981";
    } else if (normalizedType === "Group") {
      const specificType = PH_MUSIC_GROUP_TYPES.find(t => t.id === item.group_type);
      nextBadgeLabel = specificType ? specificType.label : "Group";
      nextBadgeColor = "#3B82F6";
    } else if (normalizedType === "Artist") {
      nextBadgeLabel = "Artist";
      nextBadgeColor = "#EC4899";
    } else if (normalizedType === "Production") {
      nextBadgeLabel = "Production Team";
      nextBadgeColor = "#F97316";
    } else {
      nextBadgeLabel = normalizedType;
      nextBadgeColor = "#7C3AED";
    }

    return { badgeLabel: nextBadgeLabel, badgeColor: nextBadgeColor };
  }, [item.hourly_rate, item.studio_type, item.type, item.group_type]);

  const completionRate = useMemo(() => {
    if (item?.completion_rate === null || item?.completion_rate === undefined || item?.completion_rate === "") {
      return null;
    }

    const parsed = Number(item?.completion_rate);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }, [item?.completion_rate]);
  const showCompletionBadge =
    completionRate !== null &&
    ["Artist", "Group"].includes(String(item.type || ""));

  // Shared actions
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${item.name} on MusikaLokal!`,
      });
    } catch (error) {
      debugLog("Error sharing:", error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const syncBookmarkState = async () => {
      if (!favoriteTargetType || !item?.id || !userId) {
        if (isMounted) {
          setIsBookmarked(false);
        }
        return;
      }

      try {
        const { count, error } = await supabase
          .from("favorites")
          .select("id", { count: "exact", head: true })
          .eq(`${favoriteTargetType}_id`, item.id)
          .eq("user_id", userId);

        if (error) throw error;
        if (isMounted) {
          setIsBookmarked((count || 0) > 0);
        }
      } catch {
        if (isMounted) {
          setIsBookmarked(false);
        }
      }
    };

    void syncBookmarkState();

    return () => {
      isMounted = false;
    };
  }, [favoriteTargetType, item?.id, userId]);

  const handleBookmarkAction = useCallback(
    async (e: any) => {
      e?.stopPropagation?.();

      if (bookmarkBusy) {
        return;
      }

      if (!favoriteTargetType || !item?.id) {
        emitToast({
          type: "info",
          title: "Bookmark unavailable",
          message: "Bookmarking is currently available for artists, groups, studios, and gigs.",
        });
        return;
      }

      if (!userId) {
        emitToast({
          type: "warning",
          title: "Login required",
          message: "Please sign in to bookmark listings.",
        });
        return;
      }

      const previousState = isBookmarked;
      const optimisticState = !previousState;

      setBookmarkBusy(true);
      setIsBookmarked(optimisticState);

      try {
        const { data, error } = await supabase.functions.invoke("manage-details", {
          body: {
            action: "toggle_favorite",
            type: favoriteTargetType,
            id: item.id,
            userId,
          },
        });

        if (error) throw error;

        const resolvedFavorited =
          typeof data?.is_favorited === "boolean"
            ? data.is_favorited
            : optimisticState;

        setIsBookmarked(resolvedFavorited);
        emitFavoriteChanged({
          id: item.id,
          isFavorited: resolvedFavorited,
          targetType: favoriteTargetType,
          favoriteCount: typeof data?.favorites_count === "number" ? data.favorites_count : undefined,
        });
      } catch (error: any) {
        setIsBookmarked(previousState);
        emitFavoriteChanged({
          id: item.id,
          isFavorited: previousState,
          targetType: favoriteTargetType,
        });
        emitToast({
          type: "error",
          title: "Bookmark failed",
          message: error?.message || "Unable to update bookmark right now.",
        });
      } finally {
        setBookmarkBusy(false);
      }
    },
    [bookmarkBusy, favoriteTargetType, isBookmarked, item?.id, userId],
  );

  const handleInviteAction = useCallback(
    (e: any) => {
      e.stopPropagation();
      onInvite?.(item);
    },
    [item, onInvite],
  );

  const handleChatAction = useCallback(
    (e: any) => {
      e.stopPropagation();
      onChat?.(item);
    },
    [item, onChat],
  );

  // Determine if chat button should be shown (not for own items)
  const canChat = useMemo(
    () => !isFan && onChat && item.owner_id !== userId && item.organizer_id !== userId,
    [isFan, item.organizer_id, item.owner_id, onChat, userId],
  );

  const shouldShowGigSummary = useMemo(
    () =>
      showGigSummary &&
      (item.type === "Group" || item.type === "Artist") &&
      item.show_gig_statuses !== false,
    [item.show_gig_statuses, item.type, showGigSummary],
  );

  const showOpenApplicationsBadge = useMemo(
    () =>
      ((item.type === "Group" && item.open_group_applications === true) ||
        (item.type === "Production" && item.open_production_applications === true)) &&
      !!userId &&
      userRole === "musician" &&
      item.owner_id !== userId,
    [item.open_group_applications, item.open_production_applications, item.owner_id, item.type, userId, userRole],
  );

  const showCustomContractBadge = Boolean(item?.contract_url);
  const showAgreementBadge = item.type === "Gig";

  const viewActionLabel = useMemo(() => {
    if (item.type === "Artist") return "View Musician";
    if (item.type === "Group") return "View Group";
    if (item.type === "Studio") return "View Studio";
    if (item.type === "Gig") return "View Gig";
    if (item.type === "Production") return "View Team";
    return "View Details";
  }, [item.type]);

  const gigSummary = useMemo(
    () => [
      { label: "Active", value: item.active_gigs || 0, color: "#10B981" },
      { label: "Upcoming", value: item.upcoming_gigs || 0, color: "#3B82F6" },
      { label: "Done", value: item.done_gigs || 0, color: "#6B7280" },
    ],
    [item.active_gigs, item.done_gigs, item.upcoming_gigs],
  );

  // Robust Image Logic
  const images = useMemo(() => {
    if (item.images && Array.isArray(item.images) && item.images.length > 0) {
      return item.images.filter(
        (img: any) => typeof img === "string" && img.length > 0,
      );
    }
    if (item.image && typeof item.image === "string" && item.image.length > 0) {
      return [item.image];
    }
    return [];
  }, [item.image, item.images]);
  const fallbackImageUri = useMemo(() => {
    if (typeof item.owner_avatar_url === "string" && item.owner_avatar_url.length > 0) {
      return item.owner_avatar_url;
    }

    if (typeof item.avatar_url === "string" && item.avatar_url.length > 0) {
      return item.avatar_url;
    }

    if (item.type === "Artist") {
      return null;
    }

    return getListingFallbackImage(item.type, item.id || item.name);
  }, [item.avatar_url, item.id, item.name, item.owner_avatar_url, item.type]);
  const showProfileImagePlaceholder = item.type === "Artist";
  const hasMultipleImages = images.length > 1;
  const imageCacheVersion = useMemo(
    () => item.updated_at || item.created_at || item.id,
    [item.created_at, item.id, item.updated_at],
  );
  const imageStripKey = useMemo(
    () =>
      [
        item?.type || "listing",
        item?.id || item?.name || "unknown",
        images.length,
        images[0] || "",
        images[images.length - 1] || "",
      ].join(":"),
    [images, item?.id, item?.name, item?.type],
  );

  useEffect(() => {
    setPageIndex(0);
  }, [imageStripKey]);

  // --- RENDER VARIANTS ---

  // 1. IMMERSIVE HORIZONTAL CARD (For Home Screen)
  if (variant === "horizontal") {
    const cardWidth = 280;
    const cardHeight = 320; // Taller for immersive feel

    return (
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.card,
          {
            width: cardWidth,
            height: cardHeight,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
          style,
        ]}
      >
        <View
          style={[
            styles.cardContent,
            { flex: 1, backgroundColor: isDark ? "#374151" : "#E5E7EB" },
          ]}
        >
          {/* Full Background Image / Slideshow */}
          {showProfileImagePlaceholder && (
            <View style={[styles.profileImagePlaceholder, StyleSheet.absoluteFillObject]}>
              <Ionicons
                name="person"
                size={84}
                color={isDark ? "rgba(226,232,240,0.72)" : "rgba(71,85,105,0.5)"}
              />
            </View>
          )}
          <OptimizedListingImageStrip
            key={imageStripKey}
            images={images}
            pageIndex={pageIndex}
            onPageIndexChange={setPageIndex}
            fallbackUri={fallbackImageUri}
            pagerStyle={StyleSheet.absoluteFillObject}
            imageStyle={StyleSheet.absoluteFillObject}
            pageWidth={cardWidth}
            imageWidth={cardWidth}
            imageHeight={cardHeight}
            cacheVersion={imageCacheVersion}
          />

          {/* Gradient Overlay */}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.85)"]}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0.5, y: 0.3 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none" // Allow touches to pass through
          />

          {/* Top Row: Floating Badges */}
          <View style={styles.immersiveTopRow}>
            {/* Group Required Warning Badge (Horizontal) */}
            {showGroupWarning && (
              <View
                style={[
                  styles.glassBadge,
                  { backgroundColor: "#EF4444", marginLeft: 8 },
                ]}
              >
                <Ionicons name="people" size={12} color="#FFF" />
                <Text style={styles.glassBadgeText}>Group Req.</Text>
              </View>
            )}

            {/* Gig Application Deadline Badge (Horizontal) */}
            {gigDeadlineInfo && (
              <View
                style={[
                  styles.glassBadge,
                  {
                    backgroundColor: gigDeadlineInfo.isPassed
                      ? "#6B7280"
                      : gigDeadlineInfo.isUrgent
                        ? "#F59E0B"
                        : "#10B981",
                    marginLeft: 8,
                  },
                ]}
              >
                <Ionicons name="time" size={12} color="#FFF" />
                <Text style={styles.glassBadgeText}>
                  {gigDeadlineInfo.isPassed
                    ? "Closed"
                    : gigDeadlineInfo.hoursLeft < 24
                      ? `${gigDeadlineInfo.hoursLeft}h left`
                      : `${Math.ceil(gigDeadlineInfo.hoursLeft / 24)}d left`}
                </Text>
              </View>
            )}

            <View style={{ flex: 1 }} />

            {/* Invite Button Glass */}
            {canInvite && (
              <TouchableOpacity activeOpacity={1}
                style={[
                  styles.glassIconBtn,
                  { marginRight: 8, backgroundColor: colors.primary },
                ]}
                onPress={handleInviteAction}
              >
                <Ionicons name="mail" size={18} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* Chat Button Glass */}
            {canChat && (
              <TouchableOpacity activeOpacity={1}
                style={[styles.glassIconBtn, { marginRight: 8 }]}
                onPress={handleChatAction}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
              </TouchableOpacity>
            )}

            {/* Bookmark Button Glass */}
            <TouchableOpacity
              activeOpacity={1}
              disabled={bookmarkBusy}
              style={styles.glassIconBtn}
              onPress={handleBookmarkAction}
            >
              {bookmarkBusy ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons
                  name={isBookmarked ? "bookmark" : "bookmark-outline"}
                  size={20}
                  color={isBookmarked ? colors.primary : "#FFF"}
                />
              )}
            </TouchableOpacity>
          </View>

          {/* Pagination Dots */}
          {hasMultipleImages && (
            <View style={styles.paginationContainer}>
              {images.map((_: any, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    {
                      backgroundColor:
                        i === pageIndex ? "#FFF" : "rgba(255,255,255,0.5)",
                    },
                  ]}
                />
              ))}
            </View>
          )}

          {/* Bottom Content Area */}
          <View style={styles.immersiveBottomContent}>
            {/* Type Badge with Pax for Studios */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  flex: 1,
                  paddingRight: 8,
                }}
              >
                <View style={[styles.tagBadge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.tagText}>{badgeLabel}</Text>
                </View>
                {showCompletionBadge && (
                  <View style={[styles.tagBadge, { backgroundColor: completionRate === 100 ? "#10B981" : "#2563EB" }]}>
                    <Text style={styles.tagText}>Completion {completionRate}%</Text>
                  </View>
                )}
                {item.pax && (item.type === "Studio" || item.hourly_rate) && (
                  <View style={[styles.tagBadge, { backgroundColor: "#10B981" }]}>
                    <Text style={styles.tagText}>{item.pax} pax</Text>
                  </View>
                )}
                {/* Special Schedule Badge for Studios with date overrides */}
                {item.has_special_dates &&
                  (item.type === "Studio" || item.hourly_rate) && (
                    <View
                      style={[styles.tagBadge, { backgroundColor: "#F59E0B" }]}
                    >
                      <Text style={styles.tagText}>Special Hours</Text>
                    </View>
                  )}
                {/* Seasonal Pricing Badge for Studios */}
                {item.has_seasonal_pricing &&
                  (item.type === "Studio" || item.hourly_rate) && (
                    <View
                      style={[styles.tagBadge, { backgroundColor: "#8B5CF6" }]}
                    >
                      <Text style={styles.tagText}>Seasonal Rates</Text>
                    </View>
                  )}
                {/* Weekend Rate Badge */}
                {item.weekend_multiplier &&
                  parseFloat(item.weekend_multiplier) > 1 &&
                  (item.type === "Studio" || item.hourly_rate) && (
                    <View
                      style={[styles.tagBadge, { backgroundColor: "#EC4899" }]}
                    >
                      <Text style={styles.tagText}>
                        Weekend +
                        {Math.round(
                          (parseFloat(item.weekend_multiplier) - 1) * 100,
                        )}
                        %
                      </Text>
                    </View>
                  )}
                {/* Promo Badge for Studios */}
                {item.has_active_promotion &&
                  (item.type === "Studio" || item.hourly_rate) && (
                    <View
                      style={[styles.tagBadge, { backgroundColor: "#10B981" }]}
                    >
                      <Text style={styles.tagText}>Promo</Text>
                    </View>
                  )}
                {/* Slots Needed Badge for Gigs */}
                {item.type === "Gig" && item.requirements?.slots && (
                  <>
                    {item.requirements.slots.solo?.needed > 0 && (
                      <View style={[styles.tagBadge, { backgroundColor: "#EC4899" }]}>
                        <Text style={styles.tagText}>
                          {item.requirements.slots.solo.needed} Solo
                        </Text>
                      </View>
                    )}
                    {item.requirements.slots.duo?.needed > 0 && (
                      <View style={[styles.tagBadge, { backgroundColor: "#8B5CF6" }]}>
                        <Text style={styles.tagText}>
                          {item.requirements.slots.duo.needed} Duo{item.requirements.slots.duo.needed > 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                    {item.requirements.slots.band?.needed > 0 && (
                      <View style={[styles.tagBadge, { backgroundColor: "#3B82F6" }]}>
                        <Text style={styles.tagText}>
                          {item.requirements.slots.band.needed} Group{item.requirements.slots.band.needed > 1 ? "s" : ""}
                        </Text>
                      </View>
                    )}
                    {/* Preferred Group Types */}
                    {preferredBandTypeBadges.map((label, index) => (
                      <View key={`${label}-${index}`} style={[styles.tagBadge, { backgroundColor: "#6366F1" }]}>
                        <Text style={styles.tagText}>{label}</Text>
                      </View>
                    ))}
                    {getPreferenceTagText("Solo Genre", item.requirements.slots.solo?.preferred_genres) && (
                      <View style={[styles.tagBadge, { backgroundColor: "#BE185D" }]}>
                        <Text style={styles.tagText}>{getPreferenceTagText("Solo Genre", item.requirements.slots.solo?.preferred_genres)}</Text>
                      </View>
                    )}
                    {getPreferenceTagText("Solo Inst", item.requirements.slots.solo?.preferred_instruments) && (
                      <View style={[styles.tagBadge, { backgroundColor: "#9D174D" }]}>
                        <Text style={styles.tagText}>{getPreferenceTagText("Solo Inst", item.requirements.slots.solo?.preferred_instruments)}</Text>
                      </View>
                    )}
                    {getPreferenceTagText("Duo Genre", item.requirements.slots.duo?.preferred_genres) && (
                      <View style={[styles.tagBadge, { backgroundColor: "#6D28D9" }]}>
                        <Text style={styles.tagText}>{getPreferenceTagText("Duo Genre", item.requirements.slots.duo?.preferred_genres)}</Text>
                      </View>
                    )}
                    {getPreferenceTagText("Duo Inst", item.requirements.slots.duo?.preferred_instruments) && (
                      <View style={[styles.tagBadge, { backgroundColor: "#5B21B6" }]}>
                        <Text style={styles.tagText}>{getPreferenceTagText("Duo Inst", item.requirements.slots.duo?.preferred_instruments)}</Text>
                      </View>
                    )}
                    {getPreferenceTagText("Group Genre", item.requirements.slots.band?.preferred_genres) && (
                      <View style={[styles.tagBadge, { backgroundColor: "#1D4ED8" }]}>
                        <Text style={styles.tagText}>{getPreferenceTagText("Group Genre", item.requirements.slots.band?.preferred_genres)}</Text>
                      </View>
                    )}
                    {getPreferenceTagText("Group Inst", item.requirements.slots.band?.preferred_instruments) && (
                      <View style={[styles.tagBadge, { backgroundColor: "#1E40AF" }]}>
                        <Text style={styles.tagText}>{getPreferenceTagText("Group Inst", item.requirements.slots.band?.preferred_instruments)}</Text>
                      </View>
                    )}
                  </>
                )}
                {showOpenApplicationsBadge && (
                  <View style={[styles.tagBadge, { backgroundColor: "#10B981" }]}>
                    <Text style={styles.tagText}>Open Applications</Text>
                  </View>
                )}
                {showCustomContractBadge && (
                  <View style={[styles.tagBadge, styles.contractBadge]}>
                    <Ionicons name="document-text-outline" size={11} color="#FFFFFF" />
                    <Text style={styles.tagText}>Custom Contract</Text>
                  </View>
                )}
                {showAgreementBadge && (
                  <View style={[styles.tagBadge, styles.agreementBadge]}>
                    <Ionicons name="shield-checkmark-outline" size={11} color="#FFFFFF" />
                    <Text style={styles.tagText}>Agreement Required</Text>
                  </View>
                )}
                {/* Total Slots Badge for Gigs without detailed slots */}
                {item.type === "Gig" && item.requirements?.total_slots_needed > 0 && !item.requirements?.slots && (
                  <View style={[styles.tagBadge, { backgroundColor: "#10B981" }]}>
                    <Text style={styles.tagText}>
                      {item.requirements.total_slots_needed} Slot{item.requirements.total_slots_needed > 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
              </View>

              {item.rating > 0 && (item.review_count || 0) > 0 && (
                <View style={styles.glassBadge}>
                  <Ionicons name="star" size={12} color="#FCD34D" />
                  <Text style={styles.glassBadgeText}>{item.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>

            <Text style={styles.immersiveTitle} numberOfLines={2}>
              {item.name}
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 8,
                opacity: 0.9,
              }}
            >
              <Ionicons
                name="location"
                size={12}
                color="#FFF"
                style={{ marginRight: 4 }}
              />
              <Text style={styles.immersiveSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>

            {shouldShowGigSummary && (
              <View style={styles.gigSummaryRowImmersive}>
                {gigSummary.map((summary) => (
                  <View
                    key={summary.label}
                    style={[
                      styles.gigSummaryChip,
                      { backgroundColor: `${summary.color}CC` },
                    ]}
                  >
                    <Text style={styles.gigSummaryChipText}>
                      {summary.label}: {summary.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Instruments/Equipment Display for Studios/Venues */}
            {item.instruments &&
              Array.isArray(item.instruments) &&
              item.instruments.length > 0 && (
                <View style={styles.instrumentsRow}>
                  {item.instruments
                    .slice(0, 4)
                    .map(
                      (inst: { name: string; image: string }, idx: number) => (
                        <CachedImage
                          key={inst.name + idx}
                          uri={inst.image}
                          style={styles.instrumentBadge}
                          width={48}
                          height={48}
                          quality={68}
                          cacheVersion={imageCacheVersion}
                        />
                      ),
                    )}
                  {item.instruments.length > 4 && (
                    <View style={styles.moreInstrumentsBadge}>
                      <Text style={styles.moreInstrumentsText}>
                        +{item.instruments.length - 4}
                      </Text>
                    </View>
                  )}
                </View>
              )}

            {/* Display pricing - show both if available, hide for Groups */}
            {!isGroup && priceLabel && (
              <Text style={styles.immersivePrice}>{priceLabel}</Text>
            )}
            {!isGroup && secondaryPriceLabel && (
              <Text
                style={[
                  styles.immersivePrice,
                  { marginTop: 2 },
                ]}
              >
                {secondaryPriceLabel}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  }

  // 2. STANDARD VERTICAL CARD (For Search / Lists)
  // Legacy Layout: Image Top, White Info Box Bottom
  const imageHeight = isFeedVariant ? 212 : 180;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.card,
        isFeedVariant && styles.feedCard,
        {
          width: "100%",
          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
          borderColor: isFeedVariant ? (isDark ? "#334155" : "#EEF0F4") : undefined,
        },
        style,
        { transform: [{ scale: pressed ? 0.99 : 1 }] },
      ]}
    >
      <View
        style={[
          styles.cardContent,
          isFeedVariant && styles.feedCardContent,
          { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
        ]}
      >
        {/* Image Section */}
        <View style={[styles.imageContainer, isFeedVariant && styles.feedImageContainer, { height: imageHeight }]}>
          {showProfileImagePlaceholder && (
            <View style={[styles.profileImagePlaceholder, StyleSheet.absoluteFillObject]}>
              <Ionicons
                name="person"
                size={72}
                color={isDark ? "rgba(226,232,240,0.72)" : "rgba(71,85,105,0.5)"}
              />
            </View>
          )}
          {hasMultipleImages ? (
            <View style={{ flex: 1 }}>
              <OptimizedListingImageStrip
                key={imageStripKey}
                images={images}
                pageIndex={pageIndex}
                onPageIndexChange={setPageIndex}
                fallbackUri={fallbackImageUri}
                pagerStyle={{ flex: 1 }}
                imageStyle={styles.image}
                pageWidth="100%"
                imageWidth={640}
                imageHeight={360}
                cacheVersion={imageCacheVersion}
              />
              {/* Pagination Dots for Vertical Card */}
              <View style={[styles.paginationContainer, { bottom: 10 }]}>
                {images.map((_: any, i: number) => (
                  <View
                    key={i}
                    style={[
                      styles.paginationDot,
                      {
                        backgroundColor:
                          i === pageIndex ? "#FFF" : "rgba(255,255,255,0.5)",
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          ) : (
            <CachedImage
              uri={images.length > 0 ? images[0] : undefined}
              fallbackUri={fallbackImageUri}
              style={styles.image}
              width={640}
              height={360}
              cacheVersion={imageCacheVersion}
            />
          )}

          {isFeedVariant && (
            <LinearGradient
              colors={["transparent", "rgba(15,23,42,0.34)"]}
              style={styles.feedMediaGradient}
              pointerEvents="none"
            />
          )}

          {/* Seasonal Rate Badges (Vertical) - Bottom Left Corner */}
          {!isFeedVariant && (item.has_seasonal_pricing ||
            (item.weekend_multiplier &&
              parseFloat(item.weekend_multiplier) > 1)) &&
            (item.type === "Studio" || item.hourly_rate) && (
              <View
                style={{
                  position: "absolute",
                  bottom: 10,
                  left: 10,
                  flexDirection: "row",
                  gap: 4,
                }}
              >
                {item.has_seasonal_pricing && (
                  <View
                    style={[
                      styles.typeOverlayBadge,
                      { position: "relative", top: 0 },
                    ]}
                  >
                    <Text style={styles.typeOverlayText}>Seasonal Rates</Text>
                  </View>
                )}
                {item.weekend_multiplier &&
                  parseFloat(item.weekend_multiplier) > 1 && (
                    <View
                      style={[
                        styles.typeOverlayBadge,
                        {
                          position: "relative",
                          top: 0,
                          backgroundColor: "#EC4899",
                        },
                      ]}
                    >
                      <Text style={styles.typeOverlayText}>
                        Weekend +
                        {Math.round(
                          (parseFloat(item.weekend_multiplier) - 1) * 100,
                        )}
                        %
                      </Text>
                    </View>
                  )}
              </View>
            )}

          {/* Top Actions for Standard Card */}
          {!isFeedVariant && (
          <View style={[styles.topActions]}>
            {/* Left: Warning + Deadline badges */}
            <View style={{ flexDirection: "column", gap: 6, flex: 1, alignItems: "flex-start" }}>
              {showGroupWarning && (
                <View style={[styles.overlayBadgeInline, { backgroundColor: "#EF4444" }]}>
                  <Text style={styles.typeOverlayText}>Group Req.</Text>
                </View>
              )}
              {gigDeadlineInfo && (
                <View
                  style={[
                    styles.overlayBadgeInline,
                    {
                      backgroundColor: gigDeadlineInfo.isPassed
                        ? "#6B7280"
                        : gigDeadlineInfo.isUrgent
                          ? "#F59E0B"
                          : "#10B981",
                    },
                  ]}
                >
                  <Text style={styles.typeOverlayText}>
                    {gigDeadlineInfo.isPassed
                      ? "Closed"
                      : gigDeadlineInfo.hoursLeft < 24
                        ? `${gigDeadlineInfo.hoursLeft}h left`
                        : `${Math.ceil(gigDeadlineInfo.hoursLeft / 24)}d left`}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* Invite Button Vertical */}
              {canInvite && (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.iconBtn, { backgroundColor: colors.primary }]}
                  onPress={handleInviteAction}
                >
                  <Ionicons name="mail" size={20} color="#FFF" />
                </TouchableOpacity>
              )}
              {/* Chat Button Vertical */}
              {canChat && (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.iconBtn, { backgroundColor: colors.primary }]}
                  onPress={handleChatAction}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                activeOpacity={1}
                disabled={bookmarkBusy}
                style={styles.iconBtn}
                onPress={handleBookmarkAction}
              >
                {bookmarkBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={isBookmarked ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={isBookmarked ? colors.primary : "#0F172A"}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
          )}
        </View>

        {/* Info Section */}
        <View style={[styles.info, isFeedVariant && styles.feedInfo]}>
          {/* Type & Pax Badges (Moved from Image Overlay) */}
          <View style={[styles.metaHeaderRow, isFeedVariant && styles.feedMetaHeaderRow]}>
            <View style={styles.metaHeaderLeft}>
              <View
                style={[
                  styles.tagBadge,
                  isFeedVariant ? styles.feedStatusBadge : styles.tagBadgeSmall,
                  { backgroundColor: badgeColor },
                ]}
              >
                <Text style={[styles.tagText, { fontSize: isFeedVariant ? 11 : 10 }]}>
                  {badgeLabel}
                </Text>
              </View>
              {isFeedVariant && gigDeadlineInfo && (
                <View
                  style={[
                    styles.feedStatusBadge,
                    {
                      backgroundColor: gigDeadlineInfo.isPassed
                        ? "#6B7280"
                        : gigDeadlineInfo.isUrgent
                          ? "#F59E0B"
                          : "#10B981",
                    },
                  ]}
                >
                  <Text style={[styles.tagText, { fontSize: 11 }]}>
                    {gigDeadlineInfo.isPassed
                      ? "Closed"
                      : gigDeadlineInfo.hoursLeft < 24
                        ? `${gigDeadlineInfo.hoursLeft}h left`
                        : `${Math.ceil(gigDeadlineInfo.hoursLeft / 24)}d left`}
                  </Text>
                </View>
              )}
              {!isFeedVariant && showCompletionBadge && (
                <View
                  style={[
                    styles.tagBadge,
                    styles.tagBadgeSmall,
                    { backgroundColor: completionRate === 100 ? "#10B981" : "#2563EB" },
                  ]}
                >
                  <Text style={[styles.tagText, { fontSize: 10 }]}>
                    Completion {completionRate}%
                  </Text>
                </View>
              )}
              {!isFeedVariant && item.pax && (item.type === "Studio" || item.hourly_rate) && (
                <View
                  style={[
                    styles.tagBadge,
                    styles.tagBadgeSmall,
                    { backgroundColor: "#10B981" },
                  ]}
                >
                  <Text style={[styles.tagText, { fontSize: 10 }]}>
                    {item.pax} pax
                  </Text>
                </View>
              )}

              {item.rating > 0 && (item.review_count || 0) > 0 && (
                <View style={styles.ratingInlineRow}>
                  <Ionicons name="star" size={14} color="#FBBF24" />
                  <Text style={[styles.ratingText, { color: colors.textSecondary }]}>
                    {item.rating.toFixed(1)}
                  </Text>
                </View>
              )}

            </View>

            {isFeedVariant ? (
              <TouchableOpacity
                activeOpacity={1}
                accessibilityLabel={isBookmarked ? "Remove saved listing" : "Save listing"}
                accessibilityRole="button"
                disabled={bookmarkBusy}
                style={[
                  styles.feedSaveBtn,
                  {
                    backgroundColor: isDark ? "#0F172A" : "#F8FAFC",
                    borderColor: isDark ? "#334155" : "#E2E8F0",
                  },
                ]}
                onPress={handleBookmarkAction}
              >
                {bookmarkBusy ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons
                    name={isBookmarked ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={isBookmarked ? colors.primary : colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            ) : actionSlot ? (
              <View style={styles.metaHeaderRight}>
                {actionSlot}
              </View>
            ) : null}
          </View>

          <View style={[styles.metaBadgeFlow, isFeedVariant && styles.hidden]}>
              {/* Special Schedule Badge */}
              {item.has_special_dates &&
                (item.type === "Studio" || item.hourly_rate) && (
                  <View
                    style={[
                      styles.tagBadge,
                      styles.tagBadgeSmall,
                      { backgroundColor: "#F59E0B" },
                    ]}
                  >
                    <Text style={[styles.tagText, { fontSize: 10 }]}>
                      Special Hours
                    </Text>
                  </View>
                )}
              {showOpenApplicationsBadge && (
                <View
                  style={[
                    styles.tagBadge,
                    styles.tagBadgeSmall,
                    { backgroundColor: "#10B981" },
                  ]}
                >
                  <Text style={[styles.tagText, { fontSize: 10 }]}>Open Applications</Text>
                </View>
              )}
              {showCustomContractBadge && (
                <View
                  style={[
                    styles.tagBadge,
                    styles.tagBadgeSmall,
                    styles.contractBadge,
                  ]}
                >
                  <Ionicons name="document-text-outline" size={11} color="#FFFFFF" />
                  <Text style={[styles.tagText, { fontSize: 10 }]}>Custom Contract</Text>
                </View>
              )}
              {showAgreementBadge && (
                <View
                  style={[
                    styles.tagBadge,
                    styles.tagBadgeSmall,
                    styles.agreementBadge,
                  ]}
                >
                  <Ionicons name="shield-checkmark-outline" size={11} color="#FFFFFF" />
                  <Text style={[styles.tagText, { fontSize: 10 }]}>Agreement Required</Text>
                </View>
              )}

              {/* Seasonal Pricing Badge for Studios - Vertical */}
              {item.has_seasonal_pricing &&
                (item.type === "Studio" || item.hourly_rate) && (
                  <View
                    style={[
                      styles.tagBadge,
                      styles.tagBadgeSmall,
                      { backgroundColor: "#8B5CF6" },
                    ]}
                  >
                    <Text style={[styles.tagText, { fontSize: 10 }]}>
                      Seasonal Rates
                    </Text>
                  </View>
                )}

              {/* Weekend Rate Badge for Studios - Vertical */}
              {item.weekend_multiplier &&
                parseFloat(item.weekend_multiplier) > 1 &&
                (item.type === "Studio" || item.hourly_rate) && (
                  <View
                    style={[
                      styles.tagBadge,
                      styles.tagBadgeSmall,
                      { backgroundColor: "#EC4899" },
                    ]}
                  >
                    <Text style={[styles.tagText, { fontSize: 10 }]}>
                      Weekend +{Math.round((parseFloat(item.weekend_multiplier) - 1) * 100)}%
                    </Text>
                  </View>
                )}

              {/* Promo Badge for Studios - Vertical */}
              {item.has_active_promotion &&
                (item.type === "Studio" || item.hourly_rate) && (
                  <View
                    style={[
                      styles.tagBadge,
                      styles.tagBadgeSmall,
                      { backgroundColor: "#10B981" },
                    ]}
                  >
                    <Text style={[styles.tagText, { fontSize: 10 }]}>
                      Promo
                    </Text>
                  </View>
                )}

              {/* Gig Slot Badges - present in horizontal, now added to vertical */}
              {item.type === "Gig" && item.requirements?.slots && (
                <>
                  {item.requirements.slots.solo?.needed > 0 && (
                    <View
                      style={[
                        styles.tagBadge,
                        styles.tagBadgeSmall,
                        { backgroundColor: "#EC4899" },
                      ]}
                    >
                      <Text style={[styles.tagText, { fontSize: 10 }]}>
                        {item.requirements.slots.solo.needed} Solo
                      </Text>
                    </View>
                  )}
                  {item.requirements.slots.duo?.needed > 0 && (
                    <View
                      style={[
                        styles.tagBadge,
                        styles.tagBadgeSmall,
                        { backgroundColor: "#8B5CF6" },
                      ]}
                    >
                      <Text style={[styles.tagText, { fontSize: 10 }]}>
                        {item.requirements.slots.duo.needed} Duo{item.requirements.slots.duo.needed > 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                  {item.requirements.slots.band?.needed > 0 && (
                    <View
                      style={[
                        styles.tagBadge,
                        styles.tagBadgeSmall,
                        { backgroundColor: "#3B82F6" },
                      ]}
                    >
                      <Text style={[styles.tagText, { fontSize: 10 }]}>
                        {item.requirements.slots.band.needed} Group{item.requirements.slots.band.needed > 1 ? "s" : ""}
                      </Text>
                    </View>
                  )}
                  {preferredBandTypeBadges.map((label, index) => (
                    <View
                      key={`${label}-${index}`}
                      style={[
                        styles.tagBadge,
                        styles.tagBadgeSmall,
                        { backgroundColor: "#6366F1" },
                      ]}
                    >
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{label}</Text>
                    </View>
                  ))}
                  {getPreferenceTagText("Solo Genre", item.requirements.slots.solo?.preferred_genres) && (
                    <View style={[styles.tagBadge, styles.tagBadgeSmall, { backgroundColor: "#BE185D" }]}>
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{getPreferenceTagText("Solo Genre", item.requirements.slots.solo?.preferred_genres)}</Text>
                    </View>
                  )}
                  {getPreferenceTagText("Solo Inst", item.requirements.slots.solo?.preferred_instruments) && (
                    <View style={[styles.tagBadge, styles.tagBadgeSmall, { backgroundColor: "#9D174D" }]}>
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{getPreferenceTagText("Solo Inst", item.requirements.slots.solo?.preferred_instruments)}</Text>
                    </View>
                  )}
                  {getPreferenceTagText("Duo Genre", item.requirements.slots.duo?.preferred_genres) && (
                    <View style={[styles.tagBadge, styles.tagBadgeSmall, { backgroundColor: "#6D28D9" }]}>
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{getPreferenceTagText("Duo Genre", item.requirements.slots.duo?.preferred_genres)}</Text>
                    </View>
                  )}
                  {getPreferenceTagText("Duo Inst", item.requirements.slots.duo?.preferred_instruments) && (
                    <View style={[styles.tagBadge, styles.tagBadgeSmall, { backgroundColor: "#5B21B6" }]}>
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{getPreferenceTagText("Duo Inst", item.requirements.slots.duo?.preferred_instruments)}</Text>
                    </View>
                  )}
                  {getPreferenceTagText("Group Genre", item.requirements.slots.band?.preferred_genres) && (
                    <View style={[styles.tagBadge, styles.tagBadgeSmall, { backgroundColor: "#1D4ED8" }]}>
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{getPreferenceTagText("Group Genre", item.requirements.slots.band?.preferred_genres)}</Text>
                    </View>
                  )}
                  {getPreferenceTagText("Group Inst", item.requirements.slots.band?.preferred_instruments) && (
                    <View style={[styles.tagBadge, styles.tagBadgeSmall, { backgroundColor: "#1E40AF" }]}>
                      <Text style={[styles.tagText, { fontSize: 10 }]}>{getPreferenceTagText("Group Inst", item.requirements.slots.band?.preferred_instruments)}</Text>
                    </View>
                  )}
                </>
              )}

              {/* Total Slots Badge for Gigs without detailed slots - Vertical */}
              {item.type === "Gig" &&
                item.requirements?.total_slots_needed > 0 &&
                !item.requirements?.slots && (
                  <View
                    style={[
                      styles.tagBadge,
                      styles.tagBadgeSmall,
                      { backgroundColor: "#10B981" },
                    ]}
                  >
                    <Text style={[styles.tagText, { fontSize: 10 }]}>
                      {item.requirements.total_slots_needed} Slot{item.requirements.total_slots_needed > 1 ? "s" : ""}
                    </Text>
                  </View>
                )}
          </View>

          <View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 2,
              }}
            >
              <Ionicons
                name="location-outline"
                size={14}
                color={colors.textSecondary}
              />
              <Text
                style={[
                  styles.subtitle,
                  { color: colors.textSecondary, flex: 1, marginTop: 0 },
                ]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>

            {!isFeedVariant && shouldShowGigSummary && (
              <View style={styles.gigSummaryRowVertical}>
                {gigSummary.map((summary) => (
                  <View
                    key={summary.label}
                    style={[
                      styles.gigSummaryChip,
                      { backgroundColor: `${summary.color}22` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.gigSummaryChipText,
                        { color: summary.color, textShadowColor: "transparent" },
                      ]}
                    >
                      {summary.label}: {summary.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Hide entire price row for Groups */}
          {!isGroup && isFeedVariant && priceItems.length > 0 && (
            <View style={styles.feedPriceBlock}>
              {renderPriceItems(true)}
            </View>
          )}

          {isFeedVariant && (
            <View style={styles.feedActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                accessibilityLabel={viewActionLabel}
                accessibilityRole="button"
                style={[
                  styles.feedViewBtn,
                  {
                    backgroundColor: isDark ? "#111827" : "#FFFFFF",
                    borderColor: isDark ? "#334155" : "#CBD5E1",
                  },
                ]}
                onPress={() => onPress(item)}
              >
                <Text style={[styles.feedViewText, { color: colors.text }]}>
                  {viewActionLabel}
                </Text>
              </TouchableOpacity>
              {actionSlot ? <View style={styles.feedActionSlot}>{actionSlot}</View> : null}
            </View>
          )}

          {!isFeedVariant && !isGroup && (priceItems.length > 0 || item.review_count > 0) && (
            <View
              style={[
                styles.priceRow,
                {
                  borderColor: isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
                },
              ]}
            >
              {priceItems.length > 0 ? renderPriceItems() : null}
              <View style={{ flex: 1 }} />
              {item.review_count > 0 && (
                <Text style={styles.reviewCount}>
                  ({item.review_count} reviews)
                </Text>
              )}
            </View>
          )}

          {/* Instruments Display for Studios/Venues */}
          {!isFeedVariant && item.instruments &&
            Array.isArray(item.instruments) &&
            item.instruments.length > 0 && (
              <View
                style={[
                  styles.instrumentsRowVertical,
                  {
                    borderColor: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.05)",
                  },
                ]}
              >
                {item.instruments
                  .slice(0, 4)
                  .map((inst: { name: string; image: string }, idx: number) => (
                    <CachedImage
                      key={inst.name + idx}
                      uri={inst.image}
                      style={styles.instrumentBadgeSmall}
                      width={36}
                      height={36}
                      quality={68}
                      cacheVersion={imageCacheVersion}
                    />
                  ))}
                {item.instruments.length > 4 && (
                  <View style={styles.moreInstrumentsBadgeSmall}>
                    <Text style={styles.moreInstrumentsTextSmall}>
                      +{item.instruments.length - 4}
                    </Text>
                  </View>
                )}
              </View>
            )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 20,
    marginRight: 0,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 5,
  },
  feedCard: {
    marginBottom: 12,
    borderRadius: 22,
    borderColor: "#EEF0F4",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  cardContent: {
    borderRadius: 26,
    overflow: "hidden",
    position: "relative",
  },
  feedCardContent: {
    borderRadius: 22,
  },
  // --- Immersive Styles ---
  immersiveTopRow: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
    alignItems: "center", // Fix vertical alignment
  },
  immersiveBottomContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    justifyContent: "flex-end",
  },
  immersiveTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#FFF",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 4,
  },
  immersiveSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.95)",
  },
  immersivePrice: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFF",
    marginTop: 4,
  },
  glassBadge: {
    backgroundColor: "#111827", // Solid heavy dark
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // No border
    // No opacity
  },
  glassBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    lineHeight: 13,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  glassIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  tagBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#7C3AED", // Solid Purple
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  // Smaller variant used in vertical list cards
  tagBadgeSmall: {
    alignSelf: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 0,
  },
  contractBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0F766E",
  },
  agreementBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#475569",
  },
  tagText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: "center",
    textTransform: "uppercase",
  },

  // --- Standard Styles ---
  imageContainer: {
    width: "100%",
    backgroundColor: "#f3f4f6",
    position: "relative",
  },
  profileImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  feedImageContainer: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  feedMediaGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 76,
  },
  pagerPage: {
    width: "100%",
    height: "100%",
  },
  paginationContainer: {
    position: "absolute",
    bottom: 80, // Above content
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    zIndex: 20,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  topActions: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    zIndex: 10,
    gap: 10,
  },
  ratingBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  ratingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#1F2937",
    includeFontPadding: false,
    lineHeight: 16,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.24)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  info: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 10,
  },
  feedInfo: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
  },
  metaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  feedMetaHeaderRow: {
    marginBottom: 2,
  },
  metaHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    flex: 1,
    minWidth: 0,
  },
  metaHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  metaBadgeFlow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  hidden: {
    display: "none",
  },
  feedStatusBadge: {
    alignSelf: "center",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 0,
  },
  feedSaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 2,
  },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    lineHeight: 22,
    marginRight: 8,
  },
  typeMini: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "right",
    opacity: 0.7,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13, // Standardized
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },
  price: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  priceList: {
    flexShrink: 1,
    gap: 6,
  },
  feedPriceList: {
    gap: 7,
  },
  priceItemRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minHeight: 30,
  },
  priceChip: {
    minHeight: 28,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  priceAmount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  priceUnit: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: "center",
    marginLeft: 2,
  },
  priceLabelText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    flexShrink: 1,
  },
  feedPriceBlock: {
    marginTop: 0,
  },
  feedActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  feedViewBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  feedViewText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  feedActionSlot: {
    flex: 1,
  },
  reviewCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#9CA3AF",
  },
  inviteBtn: {
    backgroundColor: "#7C3AED",
  },
  // Modern Type Badge (Overlay) - used for bottom-corner badges
  typeOverlayBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.6)", // Dark translucent
    zIndex: 11,
  },
  typeOverlayText: {
    color: "white",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Inline badge used inside topActions row (non-absolute)
  overlayBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  // Instruments styles for horizontal (immersive) cards
  instrumentsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 4,
  },
  instrumentBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
  },
  moreInstrumentsBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreInstrumentsText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
  },
  // Instruments styles for vertical cards
  instrumentsRowVertical: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  instrumentBadgeSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.1)",
  },
  moreInstrumentsBadgeSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  moreInstrumentsTextSmall: {
    color: "#6B7280",
    fontSize: 9,
    fontFamily: "Poppins_600SemiBold",
  },
  gigSummaryRowImmersive: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  gigSummaryRowVertical: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  gigSummaryChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gigSummaryChipText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export default memo(ListingCard);

