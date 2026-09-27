import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { PH_MUSIC_GROUP_TYPES } from "../constants/groupTypes";
import type { GigSpecificSlotRequirement } from "../utils/gigSlotRequirements";
import GigPresetDropdown, {
  GIG_GENRE_OPTIONS,
  GIG_INSTRUMENT_OPTIONS,
  GIG_ROLE_OPTIONS,
} from "./GigPresetDropdown";

type SlotType = "solo" | "duo" | "band";
type RequirementKey = "roles" | "preferred_genres" | "preferred_instruments";
type MemberRequirementKey = "roles" | "preferred_instruments";

type Props = {
  slotType: SlotType;
  count: number;
  onCountChange: (count: number) => void;
  value: GigSpecificSlotRequirement[];
  onChange: (value: GigSpecificSlotRequirement[]) => void;
};

const fieldConfig: {
  key: RequirementKey;
  label: string;
  placeholder: string;
  options: string[];
}[] = [
  { key: "roles", label: "Role", placeholder: "Add a specific role", options: GIG_ROLE_OPTIONS },
  { key: "preferred_genres", label: "Genre", placeholder: "Add a specific genre", options: GIG_GENRE_OPTIONS },
  { key: "preferred_instruments", label: "Instrument", placeholder: "Add a specific instrument", options: GIG_INSTRUMENT_OPTIONS },
];

const categoryConfig: Record<SlotType, { title: string; singular: string; accent: string }> = {
  solo: { title: "Solo Artists", singular: "solo artist", accent: "#EC4899" },
  duo: { title: "Duos (2 members)", singular: "duo", accent: "#8B5CF6" },
  band: { title: "Groups", singular: "group", accent: "#3B82F6" },
};

export default function GigSpecificSlotRequirements({ slotType, count, onCountChange, value, onChange }: Props) {
  const { colors, isDark } = useTheme();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const category = categoryConfig[slotType];
  const borderColor = isDark ? "#374151" : "#E5E7EB";

  const updateSlot = (slotIndex: number, updater: (slot: GigSpecificSlotRequirement) => GigSpecificSlotRequirement) => {
    onChange(value.map((slot, index) => index === slotIndex ? updater(slot) : slot));
  };

  const updateList = (
    slotIndex: number,
    key: RequirementKey,
    updater: (items: string[]) => string[],
  ) => updateSlot(slotIndex, (slot) => ({ ...slot, [key]: updater(slot[key]) }));

  const updateMemberList = (
    slotIndex: number,
    memberIndex: number,
    key: MemberRequirementKey,
    updater: (items: string[]) => string[],
  ) => updateSlot(slotIndex, (slot) => ({
    ...slot,
    members: Array.from({ length: slotType === "duo" ? 2 : Math.max(slot.members?.length || 0, memberIndex + 1) }, (_, index) => {
      const member = slot.members?.[index] || { label: `Member ${index + 1}`, roles: [], preferred_instruments: [] };
      return index === memberIndex ? { ...member, [key]: updater(member[key]) } : member;
    }),
  }));

  const updateBandMemberCount = (slotIndex: number, count: number) => updateSlot(slotIndex, (slot) => ({
    ...slot,
    members: Array.from({ length: Math.max(0, count) }, (_, index) =>
      slot.members?.[index] || { label: `Member ${index + 1}`, roles: [], preferred_instruments: [] }),
  }));

  const removeBandMember = (slotIndex: number, memberIndex: number) => updateSlot(slotIndex, (slot) => ({
    ...slot,
    members: (slot.members || [])
      .filter((_, index) => index !== memberIndex)
      .map((member, index) => ({ ...member, label: `Member ${index + 1}` })),
  }));

  const addListValue = (slotIndex: number, key: RequirementKey, raw: string) => {
    const next = raw.trim();
    if (!next) return;
    updateList(slotIndex, key, (items) => items.some((item) => item.toLowerCase() === next.toLowerCase())
      ? items
      : [...items, next]);
    setDrafts((current) => ({ ...current, [`${slotIndex}:${key}`]: "" }));
  };

  const addMemberValue = (slotIndex: number, memberIndex: number, key: MemberRequirementKey, raw: string) => {
    const next = raw.trim();
    if (!next) return;
    updateMemberList(slotIndex, memberIndex, key, (items) => items.some((item) => item.toLowerCase() === next.toLowerCase())
      ? items
      : [...items, next]);
    setDrafts((current) => ({ ...current, [`${slotIndex}:member:${memberIndex}:${key}`]: "" }));
  };

  const renderField = (slotIndex: number, key: RequirementKey, memberIndex?: number) => {
    const field = fieldConfig.find((item) => item.key === key)!;
    const draftKey = memberIndex === undefined
      ? `${slotIndex}:${field.key}`
      : `${slotIndex}:member:${memberIndex}:${field.key}`;
    const items = memberIndex === undefined
      ? value[slotIndex][field.key]
      : value[slotIndex].members?.[memberIndex]?.[field.key === "roles" ? "roles" : "preferred_instruments"] || [];
    const addValue = (raw: string) => memberIndex === undefined
      ? addListValue(slotIndex, field.key, raw)
      : addMemberValue(slotIndex, memberIndex, field.key === "roles" ? "roles" : "preferred_instruments", raw);
    const removeValue = (item: string) => memberIndex === undefined
      ? updateList(slotIndex, field.key, (current) => current.filter((entry) => entry !== item))
      : updateMemberList(slotIndex, memberIndex, field.key === "roles" ? "roles" : "preferred_instruments", (current) => current.filter((entry) => entry !== item));
    const label = memberIndex === undefined ? field.label : field.key === "roles" ? "Role" : "Instrument";

    return (
      <View key={`${memberIndex ?? "slot"}:${field.key}`} style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        <GigPresetDropdown
          options={field.options}
          selectedValues={items}
          onSelect={(selected) => addValue(selected)}
          placeholder={`Choose ${label.toLowerCase()}`}
        />
        <View style={styles.manualRow}>
          <TextInput
            value={drafts[draftKey] || ""}
            onChangeText={(text) => setDrafts((current) => ({ ...current, [draftKey]: text }))}
            onSubmitEditing={() => addValue(drafts[draftKey] || "")}
            placeholder={field.placeholder}
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
          <TouchableOpacity
            accessibilityLabel={`Add ${label.toLowerCase()} to ${value[slotIndex].label}${memberIndex === undefined ? "" : ` member ${memberIndex + 1}`}`}
            onPress={() => addValue(drafts[draftKey] || "")}
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {items.length > 0 && (
          <View style={styles.chips}>
            {items.map((item) => (
              <View key={item} style={[styles.chip, { backgroundColor: `${category.accent}20` }]}>
                <Text style={[styles.chipText, { color: category.accent }]}>{item}</Text>
                <TouchableOpacity
                  accessibilityLabel={`Remove ${item} from ${value[slotIndex].label}`}
                  onPress={() => removeValue(item)}
                >
                  <Ionicons name="close-circle" size={16} color={category.accent} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderGroupType = (slotIndex: number) => {
    const slot = value[slotIndex];
    const draftKey = `${slotIndex}:group_type`;
    const selectedType = PH_MUSIC_GROUP_TYPES.find((type) => type.id === slot.group_type);
    const groupTypeLabel = selectedType?.label || slot.group_type || "";

    return (
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Group Type</Text>
        <GigPresetDropdown
          options={PH_MUSIC_GROUP_TYPES.map((type) => ({ label: type.label, value: type.id }))}
          selectedValues={slot.group_type ? [slot.group_type] : []}
          onSelect={(groupType) => updateSlot(slotIndex, (current) => ({ ...current, group_type: groupType }))}
          placeholder="Choose a group type"
        />
        <View style={styles.manualRow}>
          <TextInput
            value={drafts[draftKey] || ""}
            onChangeText={(text) => setDrafts((current) => ({ ...current, [draftKey]: text }))}
            onSubmitEditing={() => {
              const groupType = drafts[draftKey]?.trim();
              if (groupType) updateSlot(slotIndex, (current) => ({ ...current, group_type: groupType }));
              setDrafts((current) => ({ ...current, [draftKey]: "" }));
            }}
            placeholder="Add a specific group type"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
          />
          <TouchableOpacity
            accessibilityLabel={`Add group type to ${slot.label}`}
            onPress={() => {
              const groupType = drafts[draftKey]?.trim();
              if (groupType) updateSlot(slotIndex, (current) => ({ ...current, group_type: groupType }));
              setDrafts((current) => ({ ...current, [draftKey]: "" }));
            }}
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {groupTypeLabel ? (
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: `${category.accent}20` }]}>
              <Text style={[styles.chipText, { color: category.accent }]}>{groupTypeLabel}</Text>
              <TouchableOpacity
                accessibilityLabel={`Remove group type from ${slot.label}`}
                onPress={() => updateSlot(slotIndex, (current) => ({ ...current, group_type: "" }))}
              >
                <Ionicons name="close-circle" size={16} color={category.accent} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.categoryCard, { backgroundColor: isDark ? "#1F2937" : "#F9FAFB", borderColor }]}>
      <View style={styles.categoryHeader}>
        <View style={styles.categoryTitleRow}>
          <Ionicons name={slotType === "solo" ? "person" : slotType === "duo" ? "people" : "musical-notes"} size={20} color={category.accent} />
          <Text style={[styles.categoryTitle, { color: colors.text }]}>{category.title}</Text>
        </View>
        <View style={styles.counter}>
          <TouchableOpacity
            accessibilityLabel={`Remove ${category.singular} slot`}
            disabled={count === 0}
            onPress={() => onCountChange(Math.max(0, count - 1))}
            style={[styles.counterButton, { backgroundColor: isDark ? "#374151" : "#E5E7EB", opacity: count === 0 ? 0.45 : 1 }]}
          >
            <Ionicons name="remove" size={18} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.counterValue, { color: colors.text }]}>{count}</Text>
          <TouchableOpacity
            accessibilityLabel={`Add ${category.singular} slot`}
            onPress={() => onCountChange(count + 1)}
            style={[styles.counterButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {count > 0 && (
        <>
          <Text style={[styles.help, { color: colors.textSecondary }]}>Select different requirements for each {category.singular} slot.</Text>
          {value.map((slot, slotIndex) => (
            <View
              key={slot.slot_id}
              style={[styles.slotCard, { backgroundColor: colors.inputBackground, borderColor }]}
            >
              <View style={styles.slotHeader}>
                <View style={[styles.numberBadge, { backgroundColor: `${category.accent}20` }]}>
                  <Text style={[styles.numberText, { color: category.accent }]}>{slotIndex + 1}</Text>
                </View>
                <Text style={[styles.slotTitle, { color: colors.text }]}>{slot.label}</Text>
              </View>

              {slotType === "band" && renderGroupType(slotIndex)}
              {slotType === "duo" ? (
                <>
                  {renderField(slotIndex, "preferred_genres")}
                  {[0, 1].map((memberIndex) => (
                    <View key={memberIndex} style={[styles.memberCard, { borderColor }]}>
                      <Text style={[styles.memberTitle, { color: colors.text }]}>Member {memberIndex + 1}</Text>
                      {renderField(slotIndex, "roles", memberIndex)}
                      {renderField(slotIndex, "preferred_instruments", memberIndex)}
                    </View>
                  ))}
                </>
              ) : (
                <>
                  {fieldConfig.map((field) => renderField(slotIndex, field.key))}
                  {slotType === "band" ? (
                    <View style={[styles.memberSection, { borderTopColor: borderColor }]}>
                      <Text style={[styles.memberTitle, { color: colors.text }]}>Member-specific requirements</Text>
                      <Text style={[styles.help, { color: colors.textSecondary }]}>Optional. Add separate performer requirements when different band members must cover different roles.</Text>
                      {(slot.members || []).map((_, memberIndex) => (
                        <View key={memberIndex} style={[styles.memberCard, { borderColor }]}>
                          <View style={styles.memberHeader}>
                            <Text style={[styles.memberTitle, { color: colors.text }]}>Member {memberIndex + 1}</Text>
                            <TouchableOpacity
                              accessibilityLabel={`Remove member ${memberIndex + 1} requirement from ${slot.label}`}
                              onPress={() => removeBandMember(slotIndex, memberIndex)}
                            >
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                          {renderField(slotIndex, "roles", memberIndex)}
                          {renderField(slotIndex, "preferred_instruments", memberIndex)}
                        </View>
                      ))}
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Add member-specific requirement to ${slot.label}`}
                        onPress={() => updateBandMemberCount(slotIndex, (slot.members?.length || 0) + 1)}
                        style={[styles.addMemberButton, { borderColor: category.accent }]}
                      >
                        <Ionicons name="person-add-outline" size={18} color={category.accent} />
                        <Text style={[styles.addMemberText, { color: category.accent }]}>Add member requirement</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  categoryCard: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginTop: 12 },
  categoryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  categoryTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  categoryTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  counter: { flexDirection: "row", alignItems: "center", gap: 12 },
  counterButton: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  counterValue: { minWidth: 16, textAlign: "center", fontFamily: "Poppins_600SemiBold", fontSize: 18 },
  help: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },
  slotCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  slotHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  numberBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  slotTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  memberCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 10 },
  memberSection: { borderTopWidth: 1, paddingTop: 12, gap: 10 },
  memberHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  memberTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  addMemberButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  addMemberText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  field: { gap: 4 },
  label: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  manualRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontFamily: "Poppins_400Regular", fontSize: 13 },
  addButton: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6 },
  chipText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
});
