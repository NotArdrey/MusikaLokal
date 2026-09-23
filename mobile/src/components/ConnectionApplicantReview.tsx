import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  application: any;
  colors: {
    border: string;
    card?: string;
    inputBackground?: string;
    primary: string;
    surface?: string;
    text: string;
    textSecondary: string;
  };
  compact?: boolean;
};

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

export default function ConnectionApplicantReview({
  application,
  colors,
  compact = false,
}: Props) {
  const recommendation = application?.ai_recommendation;
  if (!recommendation) return null;

  const isRecommended = recommendation.recommendation_status === "recommended";
  const matched = list(recommendation.matched_criteria);
  const missing = list(recommendation.missing_criteria);
  const accent = isRecommended ? "#10B981" : "#F59E0B";

  return (
    <View
      testID={`connection-ai-review-${application?.id || "application"}`}
      style={[
        styles.container,
        compact && styles.compactContainer,
        {
          backgroundColor: colors.inputBackground || colors.card || colors.surface,
          borderColor: accent,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Ionicons name="sparkles" size={16} color={accent} />
          <Text style={[styles.title, { color: colors.text }]}>AI Match Review</Text>
        </View>
        <Text style={[styles.score, { color: accent }]}>
          {Math.round(Number(recommendation.score || 0))}%
        </Text>
      </View>

      <Text style={[styles.status, { color: accent }]}>
        {isRecommended ? "Recommended" : "Manual review suggested"}
      </Text>

      {!compact && recommendation.explanation ? (
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {recommendation.explanation}
        </Text>
      ) : null}

      {!compact && matched.length > 0 ? (
        <View style={styles.listBlock}>
          <Text style={[styles.listTitle, { color: "#10B981" }]}>Requirements met</Text>
          {matched.map((item, index) => (
            <Text key={`${item}-${index}`} style={[styles.body, { color: colors.textSecondary }]}>• {item}</Text>
          ))}
        </View>
      ) : null}

      {!compact && missing.length > 0 ? (
        <View style={styles.listBlock}>
          <Text style={[styles.listTitle, { color: "#F59E0B" }]}>Missing or unclear</Text>
          {missing.map((item, index) => (
            <Text key={`${item}-${index}`} style={[styles.body, { color: colors.textSecondary }]}>• {item}</Text>
          ))}
        </View>
      ) : null}

      {!compact ? (
        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>Advisory only. The owner or manager makes the final decision.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  compactContainer: { padding: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  score: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  status: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17 },
  listBlock: { gap: 2, marginTop: 3 },
  listTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  disclaimer: { fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14, marginTop: 3 },
});
