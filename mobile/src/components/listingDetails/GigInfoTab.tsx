import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

interface GigInfoTabProps {
  group: any;
  colors: any;
  isDark: boolean;
  styles: any;
}

const GigInfoTab = ({ group, colors, isDark, styles }: GigInfoTabProps) => {
  const requirements = group.requirements || {};
  const audioSetup =
    requirements.audio || requirements.sound_system || "Standard PA";

  const techSpecs = [] as string[];
  if (requirements.lighting) techSpecs.push(`Lighting: ${requirements.lighting}`);
  if (requirements.stage_size) techSpecs.push(`Stage Size: ${requirements.stage_size}`);
  if (requirements.backline) techSpecs.push(`Backline: ${requirements.backline}`);
  if (requirements.sound_check) techSpecs.push("Sound Check Available");
  if (requirements.green_room) techSpecs.push("Green Room Available");

  if (techSpecs.length === 0 && group.amenities?.length > 0) {
    group.amenities.forEach((amenity: string) => techSpecs.push(amenity));
  }

  return (
    <View style={styles.tabContent}>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View
          style={[
            styles.infoCard,
            { backgroundColor: isDark ? "#1F2937" : "#F3F4F6", flex: 1 },
          ]}
        >
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Audio</Text>
          <Text
            style={[styles.infoValue, { color: colors.text, fontSize: 13 }]}
            numberOfLines={2}
          >
            {audioSetup}
          </Text>
        </View>
      </View>

      <View style={[styles.section, { marginTop: 24 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Event Details</Text>
        {group.event_date && (
          <View style={styles.checkRow}>
            <Ionicons name="calendar" size={20} color={colors.primary} />
            <Text style={{ color: colors.text, marginLeft: 12 }}>
              {new Date(group.event_date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        )}
        {group.location && (
          <View style={styles.checkRow}>
            <Ionicons name="location" size={20} color={colors.primary} />
            <Text style={{ color: colors.text, marginLeft: 12 }}>{group.location}</Text>
          </View>
        )}
      </View>

      {techSpecs.length > 0 && (
        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tech Specs & Amenities</Text>
          {techSpecs.map((spec: string, i: number) => (
            <View key={i} style={styles.checkRow}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 12 }}>{spec}</Text>
            </View>
          ))}
        </View>
      )}

      {techSpecs.length === 0 && !group.event_date && (
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            No additional specifications provided.
          </Text>
        </View>
      )}
    </View>
  );
};

export default GigInfoTab;
