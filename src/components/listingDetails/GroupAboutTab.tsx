import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { getGroupMembersLabel, isGroupLeaderMember } from "../../utils/groupMembers";
import CachedImage from "../CachedImage";
import ListingMediaCarousel from "./ListingMediaCarousel";

interface GroupAboutTabProps {
  group: any;
  colors: any;
  isDark: boolean;
  styles: any;
  currentUserId: string | null;
  onProfilePress: () => void;
  calculateCompletion: () => number;
  sheetRef?: any;
  listingId?: string | null;
}

const GroupAboutTab = ({
  group,
  colors,
  isDark,
  styles,
  currentUserId,
  onProfilePress,
  calculateCompletion,
  sheetRef,
  listingId,
}: GroupAboutTabProps) => {
  const completionRate = calculateCompletion();
  const managerId = group.owner_id || group.organizer_id;
  const mediaItems = useMemo(() => {
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
  }, [group?.images, group?.media_urls, group?.media]);

  // Navigate to a member's profile
  const handleMemberProfilePress = (memberId: string) => {
    if (!memberId) return;

    // Dismiss the bottom sheet first
    if (sheetRef && "current" in sheetRef && sheetRef.current) {
      sheetRef.current.dismiss();
    }

    setTimeout(() => {
      router.push({
        pathname: "/profile",
        params: {
          userId: memberId,
          returnToHome: "1",
          returnListingId: listingId || "",
        },
      });
    }, 200);
  };

  // Calculate a member's profile completion
  const getMemberCompletion = (member: any) => {
    let score = 0;
    const total = 4;
    if (member.name) score++;
    if (member.avatar_url) score++;
    if (member.instrument) score++;
    if (member.user_id) score++;
    return Math.round((score / total) * 100);
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {group.description || "No description provided."}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginBottom: 24 }}>
        <View
          style={[
            styles.statCard,
            { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Genre
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {group.genre || "Multi-Genre"}
          </Text>
        </View>
        <View
          style={[
            styles.statCard,
            { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
          ]}
        >
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
            Rating
          </Text>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {group.rating ? group.rating.toFixed(1) : "-"}
          </Text>
        </View>
      </View>

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

      {group.members && group.members.length > 0 && (
        <View style={[styles.section, { marginBottom: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {getGroupMembersLabel(group.group_type)} ({group.members.length})
          </Text>
          <View style={{ gap: 12 }}>
            {group.members.map((member: any, index: number) => {
              const isLeader = isGroupLeaderMember(member, group.owner_id);
              const memberName =
                typeof member === "string" ? member : member.name;
              const memberInstrument =
                typeof member === "string" ? member : member.instrument;
              const memberId = member.user_id || null;
              const memberCompletion = getMemberCompletion(member);
              return (
                <View
                  key={index}
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
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      {member.avatar_url ? (
                        <CachedImage
                          uri={member.avatar_url}
                          style={[styles.hostAvatar, { backgroundColor: colors.border }]}
                          width={96}
                          height={96}
                          quality={68}
                          cacheVersion={group.updated_at || member.updated_at || member.user_id || memberName}
                        />
                      ) : (
                        <View
                          style={[
                            styles.hostAvatar,
                            {
                              backgroundColor: isLeader ? colors.primary : "#E0E7FF",
                              alignItems: "center",
                              justifyContent: "center",
                            }
                          ]}
                        >
                          <Text
                            style={{
                              color: isLeader ? "#fff" : "#4F46E5",
                              fontWeight: "bold",
                              fontSize: 16,
                            }}
                          >
                            {memberName?.charAt(0)}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1, flexShrink: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Ionicons
                            name="musical-note"
                            size={12}
                            color={colors.textSecondary}
                          />
                          <Text style={[styles.managerLabel, { color: colors.textSecondary }]}>
                            {memberInstrument}
                            {isLeader && (
                              <Text
                                style={{
                                  color: colors.primary,
                                  fontFamily: "Poppins_600SemiBold",
                                }}
                              >
                                {" "}
                                • Leader
                              </Text>
                            )}
                          </Text>
                        </View>
                        <Text style={[styles.managerName, { color: colors.text, marginTop: 2 }]}>
                          {memberName}
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
                            width: `${memberCompletion}%`,
                            height: "100%",
                            backgroundColor:
                              memberCompletion === 100 ? "#10B981" : colors.primary,
                          }}
                        />
                      </View>
                      <Text
                        style={{
                          fontSize: 11,
                          fontFamily: "Poppins_600SemiBold",
                          color:
                            memberCompletion === 100 ? "#10B981" : colors.textSecondary,
                        }}
                      >
                        {`${memberCompletion}% Complete`}
                      </Text>
                    </View>
                  </View>

                  {memberId ? (
                    <TouchableOpacity
                      activeOpacity={1}
                      style={[styles.visitBtn, { borderColor: colors.primary }]}
                      onPress={() => handleMemberProfilePress(memberId)}
                    >
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 12,
                          fontFamily: "Poppins_600SemiBold",
                        }}
                      >
                        {memberId === currentUserId ? "My Profile" : "Visit Profile"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[styles.visitBtn, { borderColor: colors.border, opacity: 0.5 }]}
                    >
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 12,
                          fontFamily: "Poppins_600SemiBold",
                        }}
                      >
                        No Profile Linked
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

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

        <TouchableOpacity activeOpacity={1}
          style={[styles.visitBtn, { borderColor: colors.primary }]}
          onPress={onProfilePress}
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
    </View>
  );
};

export default GroupAboutTab;
