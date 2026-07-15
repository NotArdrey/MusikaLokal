import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export type GigRecommendationCriterionMode = "required" | "preferred" | "ignore";

export type GigRecommendationSettingsValue = {
  enabled: boolean;
  minimum_score: number;
  verified_only: true;
  criteria: {
    genres: GigRecommendationCriterionMode;
    instruments: GigRecommendationCriterionMode;
    location: GigRecommendationCriterionMode;
    portfolio: GigRecommendationCriterionMode;
  };
};

export const DEFAULT_GIG_RECOMMENDATION_SETTINGS: GigRecommendationSettingsValue = {
  enabled: false,
  minimum_score: 75,
  verified_only: true,
  criteria: {
    genres: "preferred",
    instruments: "required",
    location: "preferred",
    portfolio: "preferred",
  },
};

export const normalizeGigRecommendationSettings = (
  value: any,
): GigRecommendationSettingsValue => {
  const readMode = (
    candidate: unknown,
    fallback: GigRecommendationCriterionMode,
  ): GigRecommendationCriterionMode =>
    candidate === "required" || candidate === "preferred" || candidate === "ignore"
      ? candidate
      : fallback;
  const minimumScore = Number(value?.minimum_score);

  return {
    enabled: value?.enabled === true,
    minimum_score: Number.isFinite(minimumScore)
      ? Math.max(50, Math.min(95, Math.round(minimumScore)))
      : DEFAULT_GIG_RECOMMENDATION_SETTINGS.minimum_score,
    verified_only: true,
    criteria: {
      genres: readMode(value?.criteria?.genres, DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.genres),
      instruments: readMode(
        value?.criteria?.instruments,
        DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.instruments,
      ),
      location: readMode(value?.criteria?.location, DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.location),
      portfolio: readMode(value?.criteria?.portfolio, DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.portfolio),
    },
  };
};

type Props = {
  value: GigRecommendationSettingsValue;
  onChange: (value: GigRecommendationSettingsValue) => void;
};

const CRITERIA: {
  key: keyof GigRecommendationSettingsValue["criteria"];
  label: string;
  description: string;
}[] = [
  { key: "instruments", label: "Instruments and roles", description: "Uses the instruments and slot roles saved above." },
  { key: "genres", label: "Genres", description: "Compares preferred gig genres with the performer profile." },
  { key: "location", label: "Location", description: "Rewards applicants whose listed location matches the gig area." },
  { key: "portfolio", label: "Portfolio or media", description: "Checks for a portfolio link, video, or CV." },
];

const MODES: GigRecommendationCriterionMode[] = ["required", "preferred", "ignore"];

export default function GigRecommendationSettings({ value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const updateCriterion = (
    key: keyof GigRecommendationSettingsValue["criteria"],
    mode: GigRecommendationCriterionMode,
  ) => onChange({ ...value, criteria: { ...value.criteria, [key]: mode } });

  return (
    <View style={[styles.card, { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles" size={19} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>AI Applicant Recommendations</Text>
          </View>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Rank verified applicants against your saved requirements. You still make every final decision.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="switch"
          accessibilityState={{ checked: value.enabled }}
          testID="gig-ai-recommendations-toggle"
          onPress={() => onChange({ ...value, enabled: !value.enabled })}
          style={[
            styles.toggle,
            { backgroundColor: value.enabled ? colors.primary : isDark ? "#374151" : "#CBD5E1" },
          ]}
        >
          <View style={[styles.toggleThumb, value.enabled && styles.toggleThumbOn]} />
        </TouchableOpacity>
      </View>

      {value.enabled ? (
        <View style={styles.settingsBody}>
          <View style={[styles.lockedRow, { borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark" size={18} color="#10B981" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.lockedTitle, { color: colors.text }]}>Verified applicants only</Text>
              <Text style={[styles.smallCopy, { color: colors.textSecondary }]}>Always required for an AI recommendation.</Text>
            </View>
            <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>Minimum recommendation score</Text>
          <View style={styles.optionRow}>
            {[60, 75, 85].map((score) => {
              const selected = value.minimum_score === score;
              return (
                <TouchableOpacity
                  key={score}
                  testID={`gig-ai-minimum-score-${score}`}
                  onPress={() => onChange({ ...value, minimum_score: score })}
                  style={[
                    styles.scoreOption,
                    {
                      backgroundColor: selected ? colors.primary : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.scoreText, { color: selected ? "#FFFFFF" : colors.text }]}>{score}%</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>How each criterion is used</Text>
          {CRITERIA.map((criterion) => (
            <View key={criterion.key} style={[styles.criterion, { borderTopColor: colors.border }]}>
              <Text style={[styles.criterionTitle, { color: colors.text }]}>{criterion.label}</Text>
              <Text style={[styles.smallCopy, { color: colors.textSecondary }]}>{criterion.description}</Text>
              <View style={styles.modeRow}>
                {MODES.map((mode) => {
                  const selected = value.criteria[criterion.key] === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      testID={`gig-ai-${criterion.key}-${mode}`}
                      onPress={() => updateCriterion(criterion.key, mode)}
                      style={[
                        styles.modeOption,
                        {
                          backgroundColor: selected ? colors.primary + "18" : colors.surface,
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.modeText, { color: selected ? colors.primary : colors.textSecondary }]}>
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  headerCopy: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  description: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18, marginTop: 5 },
  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: "center" },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },
  toggleThumbOn: { alignSelf: "flex-end" },
  settingsBody: { marginTop: 16 },
  lockedRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  lockedTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  smallCopy: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 16 },
  sectionLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 13, marginTop: 16, marginBottom: 8 },
  optionRow: { flexDirection: "row", gap: 8 },
  scoreOption: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  scoreText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  criterion: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  criterionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  modeRow: { flexDirection: "row", gap: 6, marginTop: 9 },
  modeOption: { flex: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 7, alignItems: "center" },
  modeText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
});
