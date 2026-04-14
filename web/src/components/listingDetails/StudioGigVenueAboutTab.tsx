import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  hasNavigationDestination,
  openNavigationDirections,
} from "../../utils/navigation";
import {
  formatRecordingHours,
  formatRecordingRuleSentence,
  formatRecordingRuleShort,
  resolveRecordingRule,
} from "../../utils/recordingRule";
import CachedImage from "../CachedImage";
import ListingMediaCarousel from "./ListingMediaCarousel";

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
  calculateCompletion: () => number;
  handleProfileNavigation: () => void;
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
  calculateCompletion,
  handleProfileNavigation,
}: StudioGigVenueAboutTabProps) => {
  const parsedCompletionRate = Number(group.completion_rate);
  const baseCompletionRate = Number.isFinite(parsedCompletionRate)
    ? parsedCompletionRate
    : calculateCompletion();
  const completionRate = Math.max(0, Math.min(100, Math.round(baseCompletionRate)));
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
  const recordingRuleSummary = recordingRule
    ? formatRecordingRuleShort(recordingRule)
    : null;
  const recordingRuleSentence = recordingRule
    ? formatRecordingRuleSentence(recordingRule)
    : null;
  const recordingRuleScaling = recordingRule
    ? `+${formatRecordingHours(recordingRule.hoursPerBlock)} hr${recordingRule.hoursPerBlock === 1 ? "" : "s"} for every ${recordingRule.songsPerBlock} song${recordingRule.songsPerBlock === 1 ? "" : "s"}`
    : null;
  const isMediaCarouselType =
    group.type === "Studio" || group.type === "Venue" || group.type === "Gig";
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
    } catch (error) {
      console.log("[StudioGigVenueAboutTab] Navigation error:", error);
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
            activeOpacity={0.9}
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
              {group.date
                ? new Date(group.date).toLocaleDateString("en-US", {
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
            activeOpacity={0.9}
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

        {/* Row 1: Rating + Completion — always shown */}
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
          <View
            style={[
              styles.statCard,
              { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
            ]}
          >
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completion</Text>
            <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
              {`${completionRate}%`}
            </Text>
          </View>
        </View>

        {/* Row 2: Type + Capacity — only render row if at least one exists */}
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

        {supportsRecording && (
          <>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View
                style={[
                  styles.statCard,
                  { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  Recording Rule
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1}>
                  {recordingRuleSummary}
                </Text>
              </View>

              <View
                style={[
                  styles.statCard,
                  { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
                ]}
              >
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
                  How Time Scales
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]} numberOfLines={2}>
                  {recordingRuleScaling}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.description,
                { color: colors.textSecondary, marginTop: 10, marginBottom: 0 },
              ]}
            >
              {recordingRuleSentence}. Musicians can split the required hours across any available dates and time slots.
            </Text>
          </>
        )}
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

          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                flex: 1,
                height: 6,
                backgroundColor: isDark ? "#374151" : "#E5E7EB",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${completionRate}%`,
                  height: "100%",
                  backgroundColor:
                    completionRate === 100 ? "#10B981" : colors.primary,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Poppins_600SemiBold",
                color:
                  completionRate === 100 ? "#10B981" : colors.textSecondary,
              }}
            >
              {`${completionRate}% Complete`}
            </Text>
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

          <View
            style={{
              marginTop: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                flex: 1,
                height: 6,
                backgroundColor: isDark ? "#374151" : "#E5E7EB",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${completionRate}%`,
                  height: "100%",
                  backgroundColor:
                    completionRate === 100
                      ? "#10B981"
                      : colors.primary,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Poppins_600SemiBold",
                color:
                  completionRate === 100
                    ? "#10B981"
                    : colors.textSecondary,
              }}
            >
              {`${completionRate}% Complete`}
            </Text>
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
          styles.dealCard,
          {
            backgroundColor: isDark ? "#1e293b" : "#ECFDF5",
            borderColor: isDark ? "#064e3b" : "#10B981",
          },
        ]}
      >
        <Text
          style={{
            fontFamily: "Poppins_600SemiBold",
            color: isDark ? "#6ee7b7" : "#047857",
            marginBottom: 8,
          }}
        >
          The Deal
        </Text>
        <Text
          style={{
            fontFamily: "Poppins_500Medium",
            color: isDark ? "#d1fae5" : "#065F46",
          }}
        >
          Guarantee + Door Split
        </Text>
        <Text
          style={{
            fontFamily: "Poppins_400Regular",
            color: isDark ? "#d1fae5" : "#065F46",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          45 min set • Meal Included
        </Text>
      </View>
    )}

    </View>
  );
};

export default StudioGigVenueAboutTab;
