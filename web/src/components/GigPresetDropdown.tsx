import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export type GigPresetOption = string | { label: string; value: string };
type Props = { options: GigPresetOption[]; selectedValues?: string[]; onSelect: (value: string) => void; placeholder?: string; allowDuplicates?: boolean };

export const GIG_GENRE_OPTIONS = ["Rock", "Pop", "Jazz", "Blues", "Hip Hop", "R&B", "Country", "Electronic", "Classical", "Reggae", "Metal", "Punk", "Folk", "Soul", "Funk", "Disco", "Indie", "Alternative", "Latin", "World Music", "Gospel", "EDM", "House", "Techno", "Dubstep", "Acoustic", "Instrumental", "Ambient", "Lo-Fi", "OPM"];
export const GIG_INSTRUMENT_OPTIONS = ["Vocals", "Acoustic Guitar", "Electric Guitar", "Bass Guitar", "Drums", "Keyboard", "Piano", "Violin", "Viola", "Cello", "Double Bass", "Saxophone", "Trumpet", "Trombone", "Flute", "Clarinet", "Harmonica", "Ukulele", "Cajon", "Percussion", "DJ Controller", "Turntables", "Synthesizer", "Bandurria", "Octavina", "Laud", "PA System", "Microphones", "Amplifiers", "Drum Kit", "Music Stands"];
export const GIG_ROLE_OPTIONS = ["Lead Vocalist", "Backing Vocalist", "Singer-Songwriter", "Guitarist", "Bassist", "Drummer", "Keyboardist", "Pianist", "Percussionist", "Violinist", "Saxophonist", "Trumpeter", "DJ", "Music Producer", "Rapper", "Dancer", "Conductor", "Sound Engineer"];

const normalizeOption = (option: GigPresetOption) => typeof option === "string" ? { label: option, value: option } : option;

export default function GigPresetDropdown({ options, selectedValues = [], onSelect, placeholder = "Choose from preset options", allowDuplicates = false }: Props) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = React.useState(false);
  const selectedKeys = new Set(selectedValues.map((value) => value.trim().toLowerCase()));
  const availableOptions = options.map(normalizeOption).filter((option) => allowDuplicates || !selectedKeys.has(option.value.trim().toLowerCase()));

  return (
    <View style={styles.container}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((current) => !current)} style={[styles.trigger, { backgroundColor: colors.inputBackground, borderColor: isDark ? "#374151" : "#E5E7EB" }]}>
        <Text style={[styles.triggerText, { color: colors.text }]}>{placeholder}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
      </TouchableOpacity>
      {expanded && (
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={[styles.menu, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {availableOptions.length > 0 ? availableOptions.map((option) => (
            <TouchableOpacity key={`${option.value}-${option.label}`} onPress={() => { onSelect(option.value); if (!allowDuplicates) setExpanded(false); }} style={[styles.option, { borderBottomColor: colors.border }]}>
              <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )) : <Text style={[styles.emptyText, { color: colors.textSecondary }]}>All preset options are selected.</Text>}
        </ScrollView>
      )}
      <Text style={[styles.manualLabel, { color: colors.textSecondary }]}>Or add manually</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  trigger: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  triggerText: { flex: 1, fontSize: 13, fontFamily: "Poppins_400Regular" },
  menu: { maxHeight: 210, borderWidth: 1, borderRadius: 10, marginTop: 6 },
  option: { minHeight: 42, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  optionText: { flex: 1, fontSize: 13, fontFamily: "Poppins_400Regular" },
  emptyText: { padding: 12, fontSize: 12, fontFamily: "Poppins_400Regular" },
  manualLabel: { marginTop: 8, fontSize: 11, fontFamily: "Poppins_500Medium" },
});
