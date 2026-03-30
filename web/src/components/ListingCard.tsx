import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { PH_MUSIC_GROUP_TYPES } from "../constants/groupTypes";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import CachedImage from "./CachedImage";

const debugLog = (..._args: unknown[]) => { };

import PagerView from "./PagerView";

interface ListingCardProps {
  item: any;
  onPress: (item: any) => void;
  onInvite?: (item: any) => void;
  onChat?: (item: any) => void;
  variant?: "horizontal" | "vertical";
  style?: any;
  hasGroups?: boolean;
  showGigSummary?: boolean;
}

const ListingCard: React.FC<ListingCardProps> = ({
  item,
  onPress,
  onInvite,
  onChat,
  variant = "horizontal",
  style,
  hasGroups,
  showGigSummary = true,
}) => {
  const { colors, isDark } = useTheme();
  const { userRole, userId } = useAuth(); // To avoid showing warning to owners
  const [isLiked, setIsLiked] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const horizontalWebScrollRef = useRef<ScrollView | null>(null);
  const verticalWebScrollRef = useRef<ScrollView | null>(null);
  const horizontalPagerRef = useRef<any>(null);
  const verticalPagerRef = useRef<any>(null);

  // Check if current user can invite (ONLY venue-owner viewing a musician/Group)
  const canInvite = useMemo(
    () =>
      userRole === "venue-owner" &&
      (item.type === "Group" || item.type === "Artist"),
    [item.type, userRole],
  );

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
    if (item.type !== "Gig" || !item.event_date) return null;
    const eventDate = new Date(item.event_date);
    const eventStartTime = item.requirements?.event_start_time;
    if (eventStartTime) {
      const [time, period] = eventStartTime.split(" ");
      const [hours, minutes] = time.split(":").map(Number);
      let hour24 = hours;
      if (period === "PM" && hours !== 12) hour24 += 12;
      if (period === "AM" && hours === 12) hour24 = 0;
      eventDate.setHours(hour24, minutes, 0, 0);
    }
    const deadline = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const hoursUntilDeadline =
      (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
    return {
      deadline,
      isPassed: hoursUntilDeadline <= 0,
      isUrgent: hoursUntilDeadline > 0 && hoursUntilDeadline < 48,
      hoursLeft: Math.max(0, Math.floor(hoursUntilDeadline)),
    };
  }, [item.event_date, item.requirements?.event_start_time, item.type]);

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
  const { priceLabel, secondaryPriceLabel, isGroup } = useMemo(() => {
    let nextPriceLabel = "";
    let nextSecondaryPriceLabel = "";
    const nextIsGroup = item.type === "Group";
    const rehearsalRateValue =
      item.rehearsal_rate && item.rehearsal_rate !== "0"
        ? parseInt(item.rehearsal_rate)
        : 0;
    const recordingRateValue =
      item.recording_rate && item.recording_rate !== "0"
        ? parseInt(item.recording_rate)
        : 0;
    const isRecordingOnlyStudio =
      item.type === "Studio" && item.studio_type === "Recording";
    const isRehearsalOnlyStudio =
      item.type === "Studio" && item.studio_type === "Rehearsal";
    const hasRehearsalRate = rehearsalRateValue > 0 && !isRecordingOnlyStudio;
    const hasRecordingRate = recordingRateValue > 0 && !isRehearsalOnlyStudio;

    if (nextIsGroup) {
      nextPriceLabel = "";
    } else if (item.type === "Studio") {
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
        nextPriceLabel = "Inquire for rates";
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
      nextPriceLabel = "Inquire for rates";
    }

    return {
      priceLabel: nextPriceLabel,
      secondaryPriceLabel: nextSecondaryPriceLabel,
      isGroup: nextIsGroup,
    };
  }, [item]);

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
    } else {
      nextBadgeLabel = normalizedType;
      nextBadgeColor = "#7C3AED";
    }

    return { badgeLabel: nextBadgeLabel, badgeColor: nextBadgeColor };
  }, [item.hourly_rate, item.studio_type, item.type, item.group_type]);

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

  const toggleLike = useCallback(() => {
    setIsLiked((prev) => !prev);
  }, []);

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
    () => onChat && item.owner_id !== userId && item.organizer_id !== userId,
    [item.organizer_id, item.owner_id, onChat, userId],
  );

  const shouldShowGigSummary = useMemo(
    () =>
      showGigSummary &&
      (item.type === "Group" || item.type === "Artist") &&
      item.show_gig_statuses !== false,
    [item.show_gig_statuses, item.type, showGigSummary],
  );

  const showOpenApplicationsBadge = useMemo(
    () => item.type === "Group" && item.open_group_applications !== false,
    [item.open_group_applications, item.type],
  );

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
  const hasMultipleImages = images.length > 1;
  const imageCacheVersion = useMemo(
    () => item.updated_at || item.created_at || item.id,
    [item.created_at, item.id, item.updated_at],
  );

  useEffect(() => {
    if (!hasMultipleImages) {
      setPageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setPageIndex((prev) => {
        const next = (prev + 1) % images.length;

        if (variant === "horizontal") {
          if (Platform.OS === "web") {
            horizontalWebScrollRef.current?.scrollTo({
              x: next * 280,
              y: 0,
              animated: true,
            });
          } else {
            horizontalPagerRef.current?.setPage?.(next);
          }
        } else {
          if (Platform.OS === "web") {
            verticalWebScrollRef.current?.scrollTo({
              x: next * 320,
              y: 0,
              animated: true,
            });
          } else {
            verticalPagerRef.current?.setPage?.(next);
          }
        }

        return next;
      });
    }, 3200);

    return () => clearInterval(interval);
  }, [hasMultipleImages, images.length, variant]);

  // --- RENDER VARIANTS ---

  // 1. IMMERSIVE HORIZONTAL CARD (For Home Screen)
  if (variant === "horizontal") {
    const cardWidth = 280;
    const cardHeight = 320; // Taller for immersive feel

    return (
      <Pressable
        onPress={() => onPress(item)}
        style={({ pressed, hovered }: any) => [
          styles.card,
          {
            width: Platform.OS === 'web' ? '100%' : cardWidth,
            height: cardHeight,
            flex: Platform.OS === 'web' ? 1 : undefined,
            minWidth: Platform.OS === 'web' ? 260 : undefined,
            maxWidth: Platform.OS === 'web' ? 380 : undefined,
            transform: [{ scale: pressed ? 0.98 : hovered ? 1.02 : 1 }],
            ...(hovered && Platform.OS === 'web' ? {
              shadowOpacity: 0.3,
              shadowRadius: 16,
              zIndex: 10,
            } : {})
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
          {hasMultipleImages ? (
            <View style={StyleSheet.absoluteFillObject}>
              {Platform.OS === "web" ? (
                <ScrollView
                  ref={horizontalWebScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={StyleSheet.absoluteFillObject}
                  nestedScrollEnabled
                  directionalLockEnabled
                  scrollEnabled
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onMomentumScrollEnd={(e) => {
                    const newIndex = Math.round(
                      e.nativeEvent.contentOffset.x / cardWidth,
                    );
                    setPageIndex(newIndex);
                  }}
                >
                  {images.map((img: string, index: number) => (
                    <View
                      key={index}
                      style={[styles.pagerPage, { width: cardWidth }]}
                    >
                      <CachedImage
                        uri={img}
                        style={StyleSheet.absoluteFillObject}
                        width={cardWidth}
                        height={cardHeight}
                        cacheVersion={imageCacheVersion}
                      />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <PagerView
                  ref={horizontalPagerRef}
                  style={StyleSheet.absoluteFillObject}
                  initialPage={0}
                  scrollEnabled
                  onPageSelected={(e: any) =>
                    setPageIndex(e.nativeEvent.position)
                  }
                >
                  {images.map((img: string, index: number) => (
                    <View key={index} style={styles.pagerPage}>
                      <CachedImage
                        uri={img}
                        style={StyleSheet.absoluteFillObject}
                        width={cardWidth}
                        height={cardHeight}
                        cacheVersion={imageCacheVersion}
                      />
                    </View>
                  ))}
                </PagerView>
              )}
            </View>
          ) : (
            <CachedImage
              uri={images.length > 0 ? images[0] : undefined}
              style={StyleSheet.absoluteFillObject}
              width={cardWidth}
              height={cardHeight}
              cacheVersion={imageCacheVersion}
            />
          )}

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
            {/* Rating Glass Badge */}
            <View style={styles.glassBadge}>
              <Ionicons name="star" size={12} color="#FCD34D" />
              <Text style={styles.glassBadgeText}>
                {item.rating > 0 ? item.rating.toFixed(1) : "New"}
              </Text>
            </View>

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

            {/* Like Button Glass */}
            <TouchableOpacity activeOpacity={1} style={styles.glassIconBtn} onPress={toggleLike}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={20}
                color={isLiked ? "#EF4444" : "#FFF"}
              />
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
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <View style={[styles.tagBadge, { backgroundColor: badgeColor }]}>
                <Text style={styles.tagText}>{badgeLabel}</Text>
              </View>
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
                  {item.requirements.slots.band?.preferred_group_types?.length > 0 &&
                    item.requirements.slots.band.preferred_group_types.map((typeId: string) => {
                      const type = PH_MUSIC_GROUP_TYPES.find(t => t.id === typeId);
                      return type ? (
                        <View key={typeId} style={[styles.tagBadge, { backgroundColor: "#6366F1" }]}>
                          <Text style={styles.tagText}>{type.label}</Text>
                        </View>
                      ) : null;
                    })
                  }
                </>
              )}
              {showOpenApplicationsBadge && (
                <View style={[styles.tagBadge, { backgroundColor: "#10B981" }]}>
                  <Text style={styles.tagText}>Open Applications</Text>
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
                  { fontSize: 13, opacity: 0.85, marginTop: 2 },
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
  const imageHeight = 180;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed, hovered }: any) => [
        styles.card,
        { 
          width: "100%", 
          backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
          flex: Platform.OS === 'web' ? 1 : undefined,
          minWidth: Platform.OS === 'web' ? 260 : undefined,
          maxWidth: Platform.OS === 'web' ? 380 : undefined,
          transform: [{ scale: pressed ? 0.99 : hovered ? 1.02 : 1 }],
          ...(hovered && Platform.OS === 'web' ? {
            shadowOpacity: 0.3,
            shadowRadius: 16,
            zIndex: 10,
          } : {})
        },
        style,
      ]}
    >
      <View
        style={[
          styles.cardContent,
          { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
        ]}
      >
        {/* Image Section */}
        <View style={[styles.imageContainer, { height: imageHeight }]}>
          {hasMultipleImages ? (
            <View style={{ flex: 1 }}>
              {Platform.OS === "web" ? (
                <ScrollView
                  ref={verticalWebScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={{ flex: 1 }}
                  nestedScrollEnabled
                  directionalLockEnabled
                  scrollEnabled
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onMomentumScrollEnd={(e) => {
                    const containerWidth =
                      e.nativeEvent.layoutMeasurement.width;
                    const newIndex = Math.round(
                      e.nativeEvent.contentOffset.x / containerWidth,
                    );
                    setPageIndex(newIndex);
                  }}
                >
                  {images.map((img: string, index: number) => (
                    <View
                      key={index}
                      style={[styles.pagerPage, { width: "100%" }]}
                    >
                      <CachedImage
                        uri={img}
                        style={styles.image}
                        width={640}
                        height={360}
                        cacheVersion={imageCacheVersion}
                      />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <PagerView
                  ref={verticalPagerRef}
                  style={{ flex: 1 }}
                  initialPage={0}
                  scrollEnabled
                  onPageSelected={(e: any) =>
                    setPageIndex(e.nativeEvent.position)
                  }
                >
                  {images.map((img: string, index: number) => (
                    <View key={index} style={styles.pagerPage}>
                      <CachedImage
                        uri={img}
                        style={styles.image}
                        width={640}
                        height={360}
                        cacheVersion={imageCacheVersion}
                      />
                    </View>
                  ))}
                </PagerView>
              )}
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
              style={styles.image}
              width={640}
              height={360}
              cacheVersion={imageCacheVersion}
            />
          )}

          {/* Group Required Warning Badge (Vertical) */}
          {showGroupWarning && (
            <View
              style={[
                styles.typeOverlayBadge,
                { top: 45, backgroundColor: "#EF4444" },
              ]}
            >
              <Text style={styles.typeOverlayText}>Group Required</Text>
            </View>
          )}

          {/* Gig Application Deadline Badge (Vertical) */}
          {gigDeadlineInfo && (
            <View
              style={[
                styles.typeOverlayBadge,
                {
                  top: showGroupWarning ? 75 : 45,
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
                  ? "Applications Closed"
                  : gigDeadlineInfo.hoursLeft < 24
                    ? `Apply within ${gigDeadlineInfo.hoursLeft}h`
                    : `Apply within ${Math.ceil(gigDeadlineInfo.hoursLeft / 24)}d`}
              </Text>
            </View>
          )}

          {/* Seasonal Rate Badges (Vertical) - Bottom Left Corner */}
          {(item.has_seasonal_pricing ||
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
          <View style={[styles.topActions]}>
            <View style={{ flex: 1 }} />

            {/* Rating moved to right or kept at top? Keeping original rating logic but ensuring zIndex */}
            {item.rating > 0 && (item.review_count || 0) > 0 ? (
              <View style={[styles.ratingBadge, { marginRight: "auto" }]}>
                <Ionicons name="star" size={12} color="#FBBF24" />
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.ratingBadge,
                  {
                    backgroundColor: "rgba(148, 163, 184, 0.9)",
                    marginRight: "auto",
                  },
                ]}
              >
                <Text style={styles.ratingText}>No ratings yet</Text>
              </View>
            )}

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
              <TouchableOpacity activeOpacity={1} style={styles.iconBtn} onPress={toggleLike}>
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={20}
                  color={isLiked ? "#EF4444" : "#000"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.info}>
          {/* Type & Pax Badges (Moved from Image Overlay) */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 6,
              flexWrap: "wrap",
            }}
          >
            <View
              style={[
                styles.tagBadge,
                {
                  backgroundColor: badgeColor,
                  paddingVertical: 3,
                  paddingHorizontal: 8,
                  marginBottom: 0,
                },
              ]}
            >
              <Text style={[styles.tagText, { fontSize: 10 }]}>
                {badgeLabel}
              </Text>
            </View>
            {item.pax && (item.type === "Studio" || item.hourly_rate) && (
              <View
                style={[
                  styles.tagBadge,
                  {
                    backgroundColor: "#10B981",
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    marginBottom: 0,
                  },
                ]}
              >
                <Text style={[styles.tagText, { fontSize: 10 }]}>
                  {item.pax} pax
                </Text>
              </View>
            )}
            {/* Special Schedule Badge */}
            {item.has_special_dates &&
              (item.type === "Studio" || item.hourly_rate) && (
                <View
                  style={[
                    styles.tagBadge,
                    {
                      backgroundColor: "#F59E0B",
                      paddingVertical: 3,
                      paddingHorizontal: 8,
                      marginBottom: 0,
                    },
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
                  {
                    backgroundColor: "#10B981",
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    marginBottom: 0,
                  },
                ]}
              >
                <Text style={[styles.tagText, { fontSize: 10 }]}>Open Applications</Text>
              </View>
            )}
          </View>

          <View>
            <Text style={[styles.title, { color: colors.text }]}>
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

            {shouldShowGigSummary && (
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
          {!isGroup && (
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
              <View style={{ flexDirection: "column" }}>
                <Text style={[styles.price, { color: colors.primary }]}>
                  {priceLabel}
                </Text>
                {secondaryPriceLabel && (
                  <Text
                    style={[
                      styles.price,
                      { color: colors.primary, fontSize: 13, marginTop: 2 },
                    ]}
                  >
                    {secondaryPriceLabel}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }} />
              {item.review_count > 0 && (
                <Text style={styles.reviewCount}>
                  ({item.review_count} reviews)
                </Text>
              )}
            </View>
          )}

          {/* Instruments Display for Studios/Venues */}
          {item.instruments &&
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
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    // Modern Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 }, // Slightly softer
    shadowOpacity: 0.1, // Reduced opacity
    shadowRadius: 10,
    elevation: 4, // Reduced elevation for Android
  },
  cardContent: {
    // flex: 1 removed to allow auto-height for vertical cards
    borderRadius: 24, // Matches card
    overflow: "hidden", // Clips content
    position: "relative",
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
  },
  glassIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827", // Solid heavy dark for button too
    alignItems: "center",
    justifyContent: "center",
    // Removed border
  },
  tagBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#7C3AED", // Solid Purple
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  tagText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
  },

  // --- Standard Styles ---
  imageContainer: {
    width: "100%",
    backgroundColor: "#f3f4f6",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
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
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    zIndex: 10,
    gap: 12, // Added gap to separate rating and heart
  },
  ratingBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  ratingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "#1F2937",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  info: {
    padding: 16,
    gap: 8, // Better separation
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
    alignItems: "center",
    gap: 6,
    marginTop: 10, // More separation for price
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.05)", // Subtle separator
  },
  price: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  reviewCount: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#9CA3AF",
  },
  inviteBtn: {
    backgroundColor: "#7C3AED",
  },
  // Modern Type Badge (Overlay)
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

