import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

export type GigRecommendationCriterionMode =
  | "required"
  | "ignore";

export type GigRecommendationSettingsValue = {
  enabled: boolean;
  location_radius_km: number | null;
  criteria: {
    genres: GigRecommendationCriterionMode;
    instruments: GigRecommendationCriterionMode;
    location: GigRecommendationCriterionMode;
    portfolio: GigRecommendationCriterionMode;
  };
};

export const DEFAULT_GIG_RECOMMENDATION_SETTINGS: GigRecommendationSettingsValue =
  {
    enabled: false,
    location_radius_km: null,
    criteria: {
      genres: "required",
      instruments: "required",
      location: "required",
      portfolio: "required",
    },
  };

export const normalizeGigRecommendationSettings = (
  value: any
): GigRecommendationSettingsValue => {
  const readMode = (
    candidate: unknown,
    fallback: GigRecommendationCriterionMode
  ): GigRecommendationCriterionMode =>
    candidate === "preferred"
      ? "required"
      : candidate === "required" || candidate === "ignore"
      ? candidate
      : fallback;
  const locationRadius = Number(value?.location_radius_km);

  return {
    enabled: value?.enabled === true,
    location_radius_km:
      value?.location_radius_km === null || value?.location_radius_km === "any"
        ? null
        : [5, 10, 25, 50, 100].includes(locationRadius)
        ? locationRadius
        : DEFAULT_GIG_RECOMMENDATION_SETTINGS.location_radius_km,
    criteria: {
      genres: readMode(
        value?.criteria?.genres,
        DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.genres
      ),
      instruments: readMode(
        value?.criteria?.instruments,
        DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.instruments
      ),
      location: readMode(
        value?.criteria?.location,
        DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.location
      ),
      portfolio: readMode(
        value?.criteria?.portfolio,
        DEFAULT_GIG_RECOMMENDATION_SETTINGS.criteria.portfolio
      ),
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
  {
    key: "instruments",
    label: "Performer instruments and roles",
    description: "Checks the roles and instruments selected for this slot.",
  },
  {
    key: "genres",
    label: "Genres",
    description: "Checks the genres selected for this slot or gig.",
  },
  {
    key: "location",
    label: "Location",
    description: "Checks whether the applicant is near the gig.",
  },
  {
    key: "portfolio",
    label: "Portfolio or media",
    description: "Checks the submitted performance video for direct performance evidence.",
  },
];

const MODES: GigRecommendationCriterionMode[] = [
  "required",
  "ignore",
];
const LOCATION_RANGES: (number | null)[] = [5, 10, 25, 50, 100, null];

export default function GigRecommendationSettings({ value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const updateCriterion = (
    key: keyof GigRecommendationSettingsValue["criteria"],
    mode: GigRecommendationCriterionMode
  ) => onChange({ ...value, criteria: { ...value.criteria, [key]: mode } });

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#111827" : "#F8FAFC",
          borderColor: colors.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles" size={19} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>
              Gig Match Settings
            </Text>
          </View>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Compare eligible applicants against your saved requirements. Scores
            are advisory; you still make every final decision.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="switch"
          accessibilityState={{ checked: value.enabled }}
          testID="gig-ai-recommendations-toggle"
          onPress={() => onChange({ ...value, enabled: !value.enabled })}
          style={[
            styles.toggle,
            {
              backgroundColor: value.enabled
                ? colors.primary
                : isDark
                ? "#374151"
                : "#CBD5E1",
            },
          ]}
        >
          <View
            style={[styles.toggleThumb, value.enabled && styles.toggleThumbOn]}
          />
        </TouchableOpacity>
      </View>

      {value.enabled ? (
        <View style={styles.settingsBody}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            Applicant location range
          </Text>
          <Text style={[styles.smallCopy, { color: colors.textSecondary }]}>
            Prioritize applicants within the selected distance from the gig
            location. Applicants outside it or without coordinates remain
            reviewable.
          </Text>
          <View style={styles.rangeRow}>
            {LOCATION_RANGES.map((radius) => {
              const selected = value.location_radius_km === radius;
              const label = radius === null ? "Any distance" : `${radius} km`;
              return (
                <TouchableOpacity
                  key={label}
                  testID={`gig-ai-location-${radius ?? "any"}`}
                  onPress={() =>
                    onChange({ ...value, location_radius_km: radius })
                  }
                  style={[
                    styles.rangeOption,
                    {
                      backgroundColor: selected
                        ? colors.primary + "18"
                        : colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      {
                        color: selected ? colors.primary : colors.textSecondary,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            How each criterion is used
          </Text>
          <Text style={[styles.smallCopy, { color: colors.textSecondary }]}>
            Required criteria must match. Ignored criteria are not checked.
          </Text>
          {CRITERIA.map((criterion) => (
            <View
              key={criterion.key}
              style={[styles.criterion, { borderTopColor: colors.border }]}
            >
              <Text style={[styles.criterionTitle, { color: colors.text }]}>
                {criterion.label}
              </Text>
              <Text style={[styles.smallCopy, { color: colors.textSecondary }]}>
                {criterion.description}
              </Text>
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
                          backgroundColor: selected
                            ? colors.primary + "18"
                            : colors.surface,
                          borderColor: selected
                            ? colors.primary
                            : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeText,
                          {
                            color: selected
                              ? colors.primary
                              : colors.textSecondary,
                          },
                        ]}
                      >
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
  description: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  toggleThumbOn: { alignSelf: "flex-end" },
  settingsBody: { marginTop: 16 },
  smallCopy: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 16 },
  sectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginTop: 16,
    marginBottom: 8,
  },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  rangeOption: {
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  criterion: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  criterionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  modeRow: { flexDirection: "row", gap: 6, marginTop: 9 },
  modeOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 7,
    alignItems: "center",
  },
  modeText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
});
