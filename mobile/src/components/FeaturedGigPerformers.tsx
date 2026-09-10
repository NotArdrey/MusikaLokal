import { Ionicons } from "@expo/vector-icons";
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { GigFeaturedPerformer } from "../hooks/useGigFeaturedPerformers";
import CachedImage from "./CachedImage";

type FeaturedGigPerformersProps = {
  performers: GigFeaturedPerformer[];
  primaryColor: string;
  textColor: string;
  mutedTextColor: string;
  isDark: boolean;
};

export const FeaturedGigPerformers = memo(function FeaturedGigPerformers({
  performers,
  primaryColor,
  textColor,
  mutedTextColor,
  isDark,
}: FeaturedGigPerformersProps) {
  if (performers.length === 0) return null;

  const visiblePerformers = performers.slice(0, 3);
  const remainingCount = Math.max(0, performers.length - visiblePerformers.length);

  return (
    <View
      accessibilityLabel={`${performers.length} featured accepted ${performers.length === 1 ? "performer" : "performers"}`}
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "rgba(16,185,129,0.10)" : "#ECFDF5",
          borderColor: isDark ? "rgba(52,211,153,0.28)" : "#A7F3D0",
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Ionicons name="checkmark-circle" size={17} color="#10B981" />
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: textColor }]}>
            Featured {performers.length === 1 ? "performer" : "performers"}
          </Text>
          <Text style={[styles.subtitle, { color: mutedTextColor }]}>Approved to appear on this gig</Text>
        </View>
      </View>
      <View style={styles.performerRow}>
        {visiblePerformers.map((performer) => (
          <View key={performer.application_id} style={styles.performer}>
            {performer.avatar_url ? (
              <CachedImage uri={performer.avatar_url} style={styles.avatar} width={32} height={32} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: primaryColor + "18" }]}>
                <Ionicons name="musical-notes" size={14} color={primaryColor} />
              </View>
            )}
            <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>{performer.display_name}</Text>
          </View>
        ))}
        {remainingCount > 0 ? <Text style={[styles.more, { color: primaryColor }]}>+{remainingCount} more</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 11, gap: 9 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  headingText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    lineHeight: 17,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    lineHeight: 14,
    includeFontPadding: false,
  },
  performerRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9 },
  performer: { minWidth: 0, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 7 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: {
    minWidth: 0,
    flexShrink: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    lineHeight: 15,
    includeFontPadding: false,
  },
  more: { fontFamily: "Poppins_600SemiBold", fontSize: 10, lineHeight: 15, includeFontPadding: false },
});
