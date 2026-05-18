import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
    hasNavigationDestination,
    openNavigationDirections,
} from "../../utils/navigation";
import {
  formatRecordingHours,
  resolveRecordingRule,
} from "../../utils/recordingRule";
import CachedImage from "../CachedImage";
import ListingMediaCarousel from "./ListingMediaCarousel";

const PROMOTION_CRITERIA_PREFIX = "how to get promo:";
const PROMOTION_MIN_HOURS_PREFIX = "minimum booking hours:";
const PROMOTION_MIN_SPEND_PREFIX = "minimum spend:";

interface StudioGigVenueAboutTabProps {
  group: any;
  colors: any;
  isDark: boolean;
  styles: any;
  hasDualPricing: boolean;
  rehearsalRate: string;
  recordingRate: string;
  displayRate: string;
  labels: { aboutTitle: string };
  currentUserId: string | null;
  handleProfileNavigation: () => void;
  promotions?: any[];
}

const StudioGigVenueAboutTab = ({
  group,
  colors,
  isDark,
  styles,
  hasDualPricing,
  rehearsalRate,
  recordingRate,
  displayRate,
  labels,
  currentUserId,
  handleProfileNavigation,
  promotions = [],
}: StudioGigVenueAboutTabProps) => {
  const managerId = group.owner_id || group.organizer_id;
  const destinationText =
    group?.location || group?.address || group?.name || "Destination";
  const canNavigate = hasNavigationDestination({
    latitude: group?.latitude,
    longitude: group?.longitude,
    destinationText,
  });
  const isStudioOrVenue = group.type === "Studio" || group.type === "Venue";
  const normalizedStudioType =
    typeof group?.studio_type === "string"
      ? group.studio_type.toLowerCase()
      : "";
  const supportsRecordingPricing =
    Boolean(recordingRate) || normalizedStudioType.includes("recording");
  const supportsRecording = group.type === "Studio" && supportsRecordingPricing;
  const recordingRule = supportsRecording
    ? resolveRecordingRule(group?.settings)
    : null;
  const recordingBlockHoursLabel = recordingRule
    ? `${formatRecordingHours(recordingRule.hoursPerBlock)} hr${recordingRule.hoursPerBlock === 1 ? "" : "s"}`
    : "";
  const recordingSongBlockLabel = recordingRule
    ? `${recordingRule.songsPerBlock} song${recordingRule.songsPerBlock === 1 ? "" : "s"}`
    : "";
  const recordingExtraBlockLabel = recordingRule
    ? recordingRule.songsPerBlock === 1
      ? `Each additional song adds another ${recordingBlockHoursLabel}.`
      : `Each additional ${recordingSongBlockLabel} adds another ${recordingBlockHoursLabel}.`
    : "";
  const recordingMinimumLabel = recordingRule
    ? `${recordingBlockHoursLabel} minimum for up to ${recordingSongBlockLabel}`
    : "";
  const isMediaCarouselType =
    group.type === "Studio" || group.type === "Venue" || group.type === "Gig";

  const activePromotions = useMemo(() => {
    if (!promotions || promotions.length === 0) return [];
    const today = new Date().toISOString().split("T")[0];
    return promotions.filter((p: any) => {
      if (!p.is_active) return false;
      if (p.is_permanent) return true;
      return p.start_date <= today && p.end_date >= today;
    });
  }, [promotions]);

  const parsePositivePromotionNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const formatPromotionNumber = (value: number): string => {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
  };

  const extractPromotionMetadata = (promo: any) => {
    const rawDescription: string =
      typeof promo?.description === "string" ? promo.description : "";
    const lines = rawDescription
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter(Boolean);

    const remainingLines: string[] = [];
    let fallbackCriteria = "";
    let fallbackMinimumHours: number | null = null;
    let fallbackMinimumSpend: number | null = null;

    lines.forEach((line: string) => {
      const normalizedLine = line.toLowerCase();

      if (normalizedLine.startsWith(PROMOTION_CRITERIA_PREFIX)) {
        fallbackCriteria = line.slice(PROMOTION_CRITERIA_PREFIX.length).trim();
        return;
      }

      if (normalizedLine.startsWith(PROMOTION_MIN_HOURS_PREFIX)) {
        const parsed = parsePositivePromotionNumber(
          line.slice(PROMOTION_MIN_HOURS_PREFIX.length).trim(),
        );
        if (parsed !== null) fallbackMinimumHours = parsed;
        return;
      }

      if (normalizedLine.startsWith(PROMOTION_MIN_SPEND_PREFIX)) {
        const parsed = parsePositivePromotionNumber(
          line.slice(PROMOTION_MIN_SPEND_PREFIX.length).trim(),
        );
        if (parsed !== null) fallbackMinimumSpend = parsed;
        return;
      }

      remainingLines.push(line);
    });

    return {
      description: remainingLines.join("\n"),
      criteria:
        (typeof promo?.criteria === "string" ? promo.criteria.trim() : "") ||
        fallbackCriteria,
      minimumBookingHours:
        parsePositivePromotionNumber(promo?.minimum_booking_hours) ??
        fallbackMinimumHours,
      minimumSpend:
        parsePositivePromotionNumber(promo?.minimum_spend) ?? fallbackMinimumSpend,
    };
  };
  const mediaItems = useMemo(() => {
    if (!isMediaCarouselType) return [];

    const normalizeMedia = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return [];

        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return parsed
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter((item) => item.length > 0);
            }
          } catch {
            // fallback to single value below
          }
        }

        return [trimmed];
      }

      return [];
    };

    const merged = [group?.images, group?.media_urls, group?.media].flatMap(
      (value) => normalizeMedia(value),
    );

    return merged.filter((value, index, arr) => arr.indexOf(value) === index);
  }, [group?.images, group?.media_urls, group?.media, isMediaCarouselType]);

  const handleNavigate = async () => {
    try {
      await openNavigationDirections({
        latitude: group?.latitude,
        longitude: group?.longitude,
        label: group?.name || `${group?.type || "Listing"} location`,
        destinationText,
      });
    } catch {
    }
  };

  return (
    <View style={styles.tabContent}>
    {group.type === "Gig" && (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{labels.aboutTitle}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {group.description || "No description provided."}
        </Text>
        {canNavigate && (
          <TouchableOpacity
            activeOpacity={1}
            style={{
              marginTop: 12,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: colors.primary,
            }}
            onPress={handleNavigate}
          >
            <Ionicons name="navigate-outline" size={15} color="#FFF" />
            <Text
              style={{
                color: "#FFF",
                fontFamily: "Poppins_600SemiBold",
                fontSize: 12,
              }}
            >
              Navigate
            </Text>
          </TouchableOpacity>
        )}
      </View>
    )}

    {group.type === "Gig" && (
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
              flexBasis: "47%",
              flexGrow: 1,
            },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Budget</Text>
          <Text
            style={[styles.statValue, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            ₱{group.budget || "5,000"}
          </Text>
        </View>
        <View
          style={[
            styles.statCard,
            {
              backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
              flexBasis: "47%",
              flexGrow: 1,
            },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Event Date</Text>
          <Text
            style={[styles.statValue, { color: colors.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {group.event_date
              ? new Date(group.event_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "TBA"}
          </Text>
        </View>
      </View>
    )}

    {isStudioOrVenue && (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{labels.aboutTitle}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {group.description || "No description provided."}
        </Text>
        {canNavigate && (
          <TouchableOpacity
            activeOpacity={1}
            style={{
              marginTop: 12,
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: colors.primary,
            }}
            onPress={handleNavigate}
          >
            <Ionicons name="navigate-outline" size={15} color="#FFF" />
            <Text
              style={{
                color: "#FFF",
                fontFamily: "Poppins_600SemiBold",
                fontSize: 12,
              }}
            >
              Navigate
            </Text>
          </TouchableOpacity>
        )}
      </View>
    )}

    {isStudioOrVenue && (
      <View style={{ gap: 12, marginBottom: 24 }}>
        {/* Rate row — always full width so numbers never get squeezed */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {hasDualPricing ? (
            <>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rehearsal Rate</Text>
                <Text
                  style={[styles.statValue, { color: colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {`₱${rehearsalRate}/hr`}
                </Text>
              </View>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Recording Rate</Text>
                <Text
                  style={[styles.statValue, { color: colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {`₱${recordingRate}/song`}
                </Text>
              </View>
            </>
          ) : (
            <View
              style={[
                styles.statCard,
                { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
              ]}
            >
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                {group.type === "Venue"
                  ? "Venue Rate"
                  : recordingRate && !rehearsalRate
                    ? "Recording Rate"
                    : rehearsalRate && !recordingRate
                      ? "Rehearsal Rate"
                      : "Hourly Rate"}
              </Text>
              <Text
                style={[styles.statValue, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {recordingRate && !rehearsalRate
                  ? `₱${recordingRate}/song`
                  : `₱${displayRate}/hr`}
              </Text>
            </View>
          )}
        </View>

        {/* Rating */}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View
            style={[
              styles.statCard,
              { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
            <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
              {group.rating ? group.rating.toFixed(1) : "-"}
            </Text>
          </View>
        </View>

        {/* Type + Capacity */}
        {((group.type === "Studio" && group.studio_type) ||
          ((group.type === "Studio" || group.type === "Venue") && group.pax)) && (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {group.type === "Studio" && group.studio_type && (
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Type</Text>
                <Text
                  style={[styles.statValue, { color: colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {group.studio_type === "Both" ? "Rehearsal & Recording" : group.studio_type}
                </Text>
              </View>
            )}
            {(group.type === "Studio" || group.type === "Venue") && group.pax && (
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Capacity</Text>
                <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                  {group.pax} pax
                </Text>
              </View>
            )}
          </View>
        )}

        {supportsRecording && recordingRule && (
          <View
            style={{
              backgroundColor: isDark ? "#111827" : "#F8FAFC",
              borderColor: isDark ? "#374151" : "#E5E7EB",
              borderRadius: 12,
              borderWidth: 1,
              gap: 12,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: isDark ? colors.primary + "22" : colors.primary + "14",
                  borderRadius: 10,
                  height: 40,
                  justifyContent: "center",
                  width: 40,
                }}
              >
                <Ionicons name="time-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Recording time minimum
                </Text>
                <Text
                  style={[styles.statValue, { color: colors.text }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {recordingMinimumLabel}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Minimum", recordingBlockHoursLabel],
                ["Covers", recordingSongBlockLabel],
                ["Rate", "Per song"],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
                    borderColor: isDark ? "#374151" : "#E5E7EB",
                    borderRadius: 10,
                    borderWidth: 1,
                    flexGrow: 1,
                    minWidth: 104,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={[styles.statLabel, { color: colors.textSecondary, marginBottom: 2 }]}>
                    {label}
                  </Text>
                  <Text style={[styles.statValue, { color: colors.text, fontSize: 14 }]}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>

            <Text
              style={[
                styles.description,
                {
                  color: colors.textSecondary,
                  fontSize: 12,
                  lineHeight: 18,
                },
              ]}
            >
              Musicians can split the minimum across available dates and time slots. {recordingExtraBlockLabel}
            </Text>
          </View>
        )}
      </View>
    )}

    {isStudioOrVenue && activePromotions.length > 0 && (
      <View style={{ marginBottom: 24 }}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 10 }]}>
          Active Promotions
        </Text>
        {activePromotions.map((promo: any) => {
          const metadata = extractPromotionMetadata(promo);
          const conditionLabels: string[] = [];

          if (metadata.criteria) {
            conditionLabels.push(`How to get promo: ${metadata.criteria}`);
          }
          if (metadata.minimumBookingHours !== null) {
            conditionLabels.push(
              `Min ${formatPromotionNumber(metadata.minimumBookingHours)} hr${
                metadata.minimumBookingHours === 1 ? "" : "s"
              }`,
            );
          }
          if (metadata.minimumSpend !== null) {
            conditionLabels.push(`Min spend ₱${metadata.minimumSpend.toLocaleString()}`);
          }

          return (
            <View
              key={promo.id}
              style={{
                backgroundColor: isDark ? "#1e1b4b" : "#EEF2FF",
                borderWidth: 1,
                borderColor: isDark ? "#4338ca" : colors.primary + "40",
                borderRadius: 12,
                padding: 14,
                marginBottom: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Ionicons name="pricetag-outline" size={16} color={colors.primary} />
                <Text
                  style={{
                    fontFamily: "Poppins_600SemiBold",
                    color: isDark ? "#c7d2fe" : "#3730a3",
                    fontSize: 14,
                  }}
                >
                  {promo.name}
                </Text>
              </View>
              {conditionLabels.length > 0 ? (
                <Text
                  style={{
                    fontFamily: "Poppins_400Regular",
                    color: isDark ? "#a5b4fc" : "#4338ca",
                    fontSize: 11,
                    marginBottom: 2,
                  }}
                >
                  {conditionLabels.join(" • ")}
                </Text>
              ) : null}
              <Text
                style={{
                  fontFamily: "Poppins_500Medium",
                  color: isDark ? "#a5b4fc" : "#4338ca",
                  fontSize: 13,
                }}
              >
                {promo.discount_type === "percentage"
                  ? `${promo.discount_value}% off`
                  : `₱${promo.discount_value}/hr off`}
                {" "}on {promo.applies_to === "both" ? "all" : promo.applies_to} bookings
              </Text>
              {metadata.description ? (
                <Text
                  style={{
                    fontFamily: "Poppins_400Regular",
                    color: isDark ? "#a5b4fc" : "#4338ca",
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {metadata.description}
                </Text>
              ) : null}
              <Text
                style={{
                  fontFamily: "Poppins_400Regular",
                  color: isDark ? "#818cf8" : "#6366f1",
                  fontSize: 11,
                  marginTop: 4,
                }}
              >
                {promo.is_permanent
                  ? "Always available"
                  : `Valid: ${new Date(promo.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${new Date(promo.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
              </Text>
            </View>
          );
        })}
      </View>
    )}

    {isMediaCarouselType && (
      <View style={[styles.section, { marginBottom: 24 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Gallery</Text>
        <ListingMediaCarousel
          mediaItems={mediaItems}
          colors={colors}
          isDark={isDark}
          styles={styles}
          cacheVersion={group.updated_at || group.created_at || group.id}
        />
      </View>
    )}

    {isStudioOrVenue && (
      <View
        style={[
          styles.managerCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <CachedImage
              uri={group.owner_avatar || null}
              style={[styles.hostAvatar, { backgroundColor: colors.border }]}
              width={96}
              height={96}
              quality={68}
              cacheVersion={group.updated_at || group.created_at || group.owner_id}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.managerLabel, { color: colors.textSecondary }]}>Managed by</Text>
              <Text style={[styles.managerName, { color: colors.text }]}>
                {group.owner_name || "Unknown User"}
              </Text>
            </View>
          </View>

        </View>

        <TouchableOpacity
          activeOpacity={1}
          style={[styles.visitBtn, { borderColor: colors.primary }]}
          onPress={handleProfileNavigation}
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: 12,
              fontFamily: "Poppins_600SemiBold",
            }}
          >
            {managerId === currentUserId ? "Manage Profile" : "Visit Profile"}
          </Text>
        </TouchableOpacity>
      </View>
    )}

    {group.type === "Gig" && (
      <View
        style={[
          styles.managerCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            marginBottom: 24,
          },
        ]}
      >
        <View style={{ flex: 1, marginRight: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <CachedImage
              uri={group.owner_avatar || undefined}
              style={[styles.hostAvatar, { backgroundColor: colors.border }]}
              width={96}
              height={96}
              quality={68}
              cacheVersion={group.updated_at || group.created_at || group.owner_id}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.managerLabel, { color: colors.textSecondary }]}>Organized by</Text>
              <Text style={[styles.managerName, { color: colors.text }]}>
                {group.owner_name || "Unknown User"}
              </Text>
            </View>
          </View>

        </View>

        <TouchableOpacity
          activeOpacity={1}
          style={[styles.visitBtn, { borderColor: colors.primary }]}
          onPress={handleProfileNavigation}
        >
          <Text
            style={{
              color: colors.primary,
              fontSize: 12,
              fontFamily: "Poppins_600SemiBold",
            }}
          >
            {managerId === currentUserId ? "Manage Profile" : "Visit Profile"}
          </Text>
        </TouchableOpacity>
      </View>
    )}

    </View>
  );
};

export default StudioGigVenueAboutTab;
