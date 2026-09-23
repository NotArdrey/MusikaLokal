import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { GigSpecificSlotRequirement } from "../utils/gigSlotRequirements";
import GigPresetDropdown, {
  GIG_GENRE_OPTIONS,
  GIG_INSTRUMENT_OPTIONS,
  GIG_ROLE_OPTIONS,
} from "./GigPresetDropdown";

type RequirementKey = "roles" | "preferred_genres" | "preferred_instruments";

type Props = {
  slotType: "solo" | "duo";
  value: GigSpecificSlotRequirement[];
  onChange: (value: GigSpecificSlotRequirement[]) => void;
};

const fieldConfig: {
  key: RequirementKey;
  label: string;
  placeholder: string;
  options: string[];
}[] = [
  { key: "roles", label: "Role or instrument", placeholder: "Add a specific role", options: [...GIG_ROLE_OPTIONS, ...GIG_INSTRUMENT_OPTIONS] },
  { key: "preferred_genres", label: "Genre", placeholder: "Add a specific genre", options: GIG_GENRE_OPTIONS },
  { key: "preferred_instruments", label: "Instrument", placeholder: "Add a specific instrument", options: GIG_INSTRUMENT_OPTIONS },
];

export default function GigSpecificSlotRequirements({ slotType, value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const accent = slotType === "solo" ? "#EC4899" : "#8B5CF6";

  const updateSlot = (
    slotIndex: number,
    key: RequirementKey,
    updater: (items: string[]) => string[],
  ) => onChange(value.map((slot, index) => index === slotIndex
    ? { ...slot, [key]: updater(slot[key]) }
    : slot));

  const addValue = (slotIndex: number, key: RequirementKey, raw: string) => {
    const next = raw.trim();
    if (!next) return;
    updateSlot(slotIndex, key, (items) => items.some((item) => item.toLowerCase() === next.toLowerCase())
      ? items
      : [...items, next]);
    setDrafts((current) => ({ ...current, [`${slotIndex}:${key}`]: "" }));
  };

  if (value.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.help, { color: colors.textSecondary }]}>Select different requirements for each {slotType === "solo" ? "solo artist" : "duo"} slot.</Text>
      {value.map((slot, slotIndex) => (
        <View
          key={slot.slot_id}
          style={[styles.slotCard, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}
        >
          <View style={styles.slotHeader}>
            <View style={[styles.numberBadge, { backgroundColor: `${accent}20` }]}>
              <Text style={[styles.numberText, { color: accent }]}>{slotIndex + 1}</Text>
            </View>
            <Text style={[styles.slotTitle, { color: colors.text }]}>{slot.label}</Text>
          </View>

          {fieldConfig.map((field) => {
            const draftKey = `${slotIndex}:${field.key}`;
            return (
              <View key={field.key} style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{field.label}</Text>
                <GigPresetDropdown
                  options={field.options}
                  selectedValues={slot[field.key]}
                  onSelect={(selected) => addValue(slotIndex, field.key, selected)}
                  placeholder={`Choose ${field.label.toLowerCase()}`}
                />
                <View style={styles.manualRow}>
                  <TextInput
                    value={drafts[draftKey] || ""}
                    onChangeText={(text) => setDrafts((current) => ({ ...current, [draftKey]: text }))}
                    onSubmitEditing={() => addValue(slotIndex, field.key, drafts[draftKey] || "")}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
                  />
                  <TouchableOpacity
                    accessibilityLabel={`Add ${field.label.toLowerCase()} to ${slot.label}`}
                    onPress={() => addValue(slotIndex, field.key, drafts[draftKey] || "")}
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                {slot[field.key].length > 0 && (
                  <View style={styles.chips}>
                    {slot[field.key].map((item) => (
                      <View key={item} style={[styles.chip, { backgroundColor: `${accent}20` }]}>
                        <Text style={[styles.chipText, { color: accent }]}>{item}</Text>
                        <TouchableOpacity
                          accessibilityLabel={`Remove ${item} from ${slot.label}`}
                          onPress={() => updateSlot(slotIndex, field.key, (items) => items.filter((entry) => entry !== item))}
                        >
                          <Ionicons name="close-circle" size={16} color={accent} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16, gap: 12 },
  help: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },
  slotCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  slotHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  numberBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  slotTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  field: { gap: 4 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: "Poppins_400Regular", fontSize: 13 },
  addButton: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6 },
  chipText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
});
