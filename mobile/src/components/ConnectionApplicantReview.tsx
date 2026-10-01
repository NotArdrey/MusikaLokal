import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { typography } from "../theme/tokens";

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
  const verification = application?.member_verification;
  const usesVerifiedIdPortrait = ["verified_id_portrait", "verified_id_and_profile_photo"].includes(String(verification?.reference_source || ""));
  const usesDualReference = verification?.reference_source === "verified_id_and_profile_photo";
  const verificationRequested = application?.member_verification_consent === true;
  if (!recommendation && !verification && !verificationRequested) return null;

  const isRecommended = recommendation?.recommendation_status === "recommended";
  const isUnavailable = recommendation?.recommendation_status === "insufficient_data";
  const matched = list(recommendation?.matched_criteria);
  const missing = list(recommendation?.missing_criteria);
  const accent = recommendation
    ? isRecommended ? "#10B981" : isUnavailable ? "#6B7280" : "#F59E0B"
    : verification?.result === "verified" ? "#10B981" : "#D97706";

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
          <Text style={[styles.title, { color: colors.text }]}>{recommendation ? "AI Match Review" : "Registered Member Verification"}</Text>
        </View>
        {recommendation ? <Text style={[styles.score, { color: accent }]}>
          {recommendation?.score === null || recommendation?.score === undefined
            ? "N/A"
            : `${Math.round(Number(recommendation?.score))}%`}
        </Text> : null}
      </View>

      {recommendation ? <Text style={[styles.status, { color: accent }]}>
        {isRecommended ? "Recommended" : isUnavailable ? "Match unavailable" : "Manual review suggested"}
      </Text> : null}

      {verification || verificationRequested ? (
        <View style={styles.verificationRow}>
          <Ionicons
            name={verification?.result === "verified" ? "person-circle" : verification?.status === "processing" || verification?.status === "queued" ? "time-outline" : "warning-outline"}
            size={15}
            color={verification?.result === "verified" ? "#10B981" : "#D97706"}
          />
          <Text style={[styles.verificationText, { color: colors.textSecondary }]}>
            Registered member: {verification?.result === "verified" ? usesDualReference ? "ID verified in video; profile checked separately" : "verified in video" : verification?.status === "processing" ? "verification processing" : verification?.status === "queued" ? "verification queued" : verification?.result === "no_reference" ? usesVerifiedIdPortrait ? "verified ID portrait unavailable" : "registered photo unavailable" : verification ? "manual review needed" : "verification unavailable"}
          </Text>
        </View>
      ) : null}

      {!compact && recommendation?.explanation ? (
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

      {!compact && recommendation ? (
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
  title: { fontFamily: typography.semibold, fontSize: 12 },
  score: { fontFamily: typography.bold, fontSize: 15 },
  status: { fontFamily: typography.semibold, fontSize: 11 },
  verificationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  verificationText: { flex: 1, fontFamily: typography.medium, fontSize: 10, lineHeight: 15 },
  body: { fontFamily: typography.body, fontSize: 11, lineHeight: 17 },
  listBlock: { gap: 2, marginTop: 3 },
  listTitle: { fontFamily: typography.semibold, fontSize: 11 },
  disclaimer: { fontFamily: typography.body, fontSize: 9, lineHeight: 14, marginTop: 3 },
});
