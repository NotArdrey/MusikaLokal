import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export type ConnectionRecommendationCriterionMode = "required" | "ignore";

export type ConnectionRecommendationSettingsValue = {
  enabled: boolean;
  location_radius_km: number | null;
  criteria: {
    genres: ConnectionRecommendationCriterionMode;
    instruments: ConnectionRecommendationCriterionMode;
    location: ConnectionRecommendationCriterionMode;
    portfolio: ConnectionRecommendationCriterionMode;
  };
  required_genres: string[];
  required_instruments: string[];
};

export const DEFAULT_CONNECTION_RECOMMENDATION_SETTINGS: ConnectionRecommendationSettingsValue = {
  enabled: true,
  location_radius_km: null,
  criteria: {
    genres: "ignore",
    instruments: "ignore",
    location: "ignore",
    portfolio: "required",
  },
  required_genres: [],
  required_instruments: [],
};

const stringList = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
};

export const normalizeConnectionRecommendationSettings = (
  value: any,
  defaults: Partial<ConnectionRecommendationSettingsValue> = {},
): ConnectionRecommendationSettingsValue => {
  const fallback = {
    ...DEFAULT_CONNECTION_RECOMMENDATION_SETTINGS,
    ...defaults,
    criteria: {
      ...DEFAULT_CONNECTION_RECOMMENDATION_SETTINGS.criteria,
      ...(defaults.criteria || {}),
    },
  };
  const readMode = (candidate: unknown, defaultMode: ConnectionRecommendationCriterionMode) =>
    candidate === "required" || candidate === "ignore" ? candidate : defaultMode;
  const parsedRadius = Number(value?.location_radius_km);

  return {
    enabled: typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
    location_radius_km:
      value?.location_radius_km === null || value?.location_radius_km === "any"
        ? null
        : [5, 10, 25, 50, 100].includes(parsedRadius)
          ? parsedRadius
          : fallback.location_radius_km,
    criteria: {
      genres: readMode(value?.criteria?.genres, fallback.criteria.genres),
      instruments: readMode(value?.criteria?.instruments, fallback.criteria.instruments),
      location: readMode(value?.criteria?.location, fallback.criteria.location),
      portfolio: readMode(value?.criteria?.portfolio, fallback.criteria.portfolio),
    },
    required_genres: stringList(value?.required_genres).length > 0
      ? stringList(value.required_genres)
      : stringList(fallback.required_genres),
    required_instruments: stringList(value?.required_instruments).length > 0
      ? stringList(value.required_instruments)
      : stringList(fallback.required_instruments),
  };
};

type Props = {
  value: ConnectionRecommendationSettingsValue;
  onChange: (value: ConnectionRecommendationSettingsValue) => void;
  entityLabel: "group" | "production team";
  supportsLocation?: boolean;
};

const LOCATION_RANGES: (number | null)[] = [5, 10, 25, 50, 100, null];

export default function ConnectionRecommendationSettings({
  value,
  onChange,
  entityLabel,
  supportsLocation = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const [instrumentDraft, setInstrumentDraft] = useState("");
  const [genreDraft, setGenreDraft] = useState("");
  const updateMode = (
    key: keyof ConnectionRecommendationSettingsValue["criteria"],
    mode: ConnectionRecommendationCriterionMode,
  ) => onChange({ ...value, criteria: { ...value.criteria, [key]: mode } });
  const renderMode = (
    key: keyof ConnectionRecommendationSettingsValue["criteria"],
    label: string,
    description: string,
  ) => (
    <View style={[styles.criterion, { borderTopColor: colors.border }]}>
      <Text style={[styles.criterionTitle, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.smallCopy, { color: colors.textSecondary }]}>{description}</Text>
      <View style={styles.modeRow}>
        {(["required", "ignore"] as const).map((mode) => {
          const selected = value.criteria[key] === mode;
          return (
            <TouchableOpacity
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`connection-match-${key}-${mode}`}
              onPress={() => updateMode(key, mode)}
              style={[
                styles.modeOption,
                {
                  backgroundColor: selected ? colors.primary + "18" : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.modeText, { color: selected ? colors.primary : colors.textSecondary }]}>
                {mode === "required" ? "Required" : "Ignore"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
  const renderTagEditor = (
    key: "required_instruments" | "required_genres",
    values: string[],
    draft: string,
    setDraft: (value: string) => void,
    placeholder: string,
  ) => {
    const addValues = () => {
      const additions = stringList(draft);
      if (additions.length === 0) return;
      onChange({ ...value, [key]: Array.from(new Set([...values, ...additions])) });
      setDraft("");
    };
    return (
      <View style={styles.tagEditor}>
        {values.length > 0 ? (
          <View style={styles.tagRow}>
            {values.map((item) => (
              <TouchableOpacity
                key={item}
                accessibilityLabel={`Remove ${item}`}
                onPress={() => onChange({ ...value, [key]: values.filter((current) => current !== item) })}
                style={[styles.tag, { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}
              >
                <Text style={[styles.tagText, { color: colors.primary }]}>{item}</Text>
                <Ionicons name="close" size={13} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <View style={styles.tagInputRow}>
          <TextInput
            testID={`connection-match-${key.replace("required_", "required-")}`}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={addValues}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { flex: 1, color: colors.text, backgroundColor: colors.inputBackground, borderColor: colors.border }]}
          />
          <TouchableOpacity
            accessibilityLabel={`Add ${key === "required_genres" ? "genre" : "role or instrument"}`}
            onPress={addValues}
            style={[styles.addButton, { backgroundColor: draft.trim() ? colors.primary : colors.border }]}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: colors.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}>
            <Ionicons name="sparkles" size={19} color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>Applicant Match Settings</Text>
          </View>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Rank applications against this {entityLabel}&rsquo;s saved requirements. Scores are advisory and never make the final decision.
          </Text>
        </View>
        <TouchableOpacity
          accessibilityRole="switch"
          accessibilityState={{ checked: value.enabled }}
          testID="connection-match-toggle"
          onPress={() => onChange({ ...value, enabled: !value.enabled })}
          style={[styles.toggle, { backgroundColor: value.enabled ? colors.primary : isDark ? "#374151" : "#CBD5E1" }]}
        >
          <View style={[styles.toggleThumb, value.enabled && styles.toggleThumbOn]} />
        </TouchableOpacity>
      </View>

      {value.enabled ? (
        <View style={styles.settingsBody}>
          {renderMode("instruments", "Roles and instruments", "Require applicants to match at least one saved role or instrument.")}
          {value.criteria.instruments === "required"
            ? renderTagEditor("required_instruments", value.required_instruments, instrumentDraft, setInstrumentDraft, "e.g. Lead guitar or vocals")
            : null}

          {renderMode("genres", "Genres", "Require applicants to match at least one saved genre.")}
          {value.criteria.genres === "required"
            ? renderTagEditor("required_genres", value.required_genres, genreDraft, setGenreDraft, "e.g. OPM or rock")
            : null}

          {supportsLocation ? (
            <>
              {renderMode("location", "Location", "Require applicants to be within the selected distance of the saved location.")}
              {value.criteria.location === "required" ? (
                <View style={styles.rangeRow}>
                  {LOCATION_RANGES.map((radius) => {
                    const selected = value.location_radius_km === radius;
                    const label = radius === null ? "Any distance" : `${radius} km`;
                    return (
                      <TouchableOpacity
                        key={label}
                        testID={`connection-match-location-${radius ?? "any"}`}
                        onPress={() => onChange({ ...value, location_radius_km: radius })}
                        style={[styles.rangeOption, { backgroundColor: selected ? colors.primary + "18" : colors.surface, borderColor: selected ? colors.primary : colors.border }]}
                      >
                        <Text style={[styles.modeText, { color: selected ? colors.primary : colors.textSecondary }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          {renderMode("portfolio", "Performance video or reel", "Require submitted performance evidence; owners still review the media manually.")}
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
  settingsBody: { marginTop: 4 },
  criterion: { borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  criterionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  smallCopy: { fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2 },
  modeRow: { flexDirection: "row", gap: 7, marginTop: 9 },
  modeOption: { flex: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 8, alignItems: "center" },
  modeText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  tagEditor: { marginTop: 9, gap: 8 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  tagText: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  tagInputRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 12 },
  addButton: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  rangeOption: { borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 11 },
});
