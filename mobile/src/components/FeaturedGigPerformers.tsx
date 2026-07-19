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
  borderColor: string;
  isDark: boolean;
};

export const FeaturedGigPerformers = memo(function FeaturedGigPerformers({
  performers,
  primaryColor,
  textColor,
  mutedTextColor,
  borderColor,
  isDark,
}: FeaturedGigPerformersProps) {
  if (performers.length === 0) return null;

  const visiblePerformers = performers.slice(0, 3);
  const remainingCount = Math.max(0, performers.length - visiblePerformers.length);

  return (
    <View
      accessibilityLabel={`${performers.length} featured accepted ${performers.length === 1 ? "performer" : "performers"}`}
      style={[styles.container, { backgroundColor: isDark ? "rgba(16,185,129,0.10)" : "#ECFDF5", borderColor }]}
    >
      <View style={styles.titleRow}>
        <Ionicons name="checkmark-circle" size={17} color="#10B981" />
        <Text style={[styles.title, { color: textColor }]}>Featured accepted {performers.length === 1 ? "performer" : "performers"}</Text>
      </View>
      <Text style={[styles.subtitle, { color: mutedTextColor }]}>These performers approved being featured on this gig.</Text>
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
  container: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { flex: 1, fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15 },
  performerRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9, marginTop: 2 },
  performer: { maxWidth: 138, flexDirection: "row", alignItems: "center", gap: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { flexShrink: 1, fontFamily: "Poppins_500Medium", fontSize: 10 },
  more: { fontFamily: "Poppins_600SemiBold", fontSize: 10 },
});
