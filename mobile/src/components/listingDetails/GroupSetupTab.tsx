import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

interface GroupSetupTabProps {
  colors: any;
  isDark: boolean;
  styles: any;
}

const GroupSetupTab = ({ colors, isDark, styles }: GroupSetupTabProps) => (
  <View style={styles.tabContent}>
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Stage Plot</Text>
      <View
        style={[
          styles.stagePlotPlaceholder,
          {
            borderColor: colors.border,
            backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
          },
        ]}
      >
        <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
          Stage Layout Visual
        </Text>
      </View>
    </View>

    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Hospitality Rider</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>
        No specific hospitality requirements listed.
      </Text>
    </View>
  </View>
);

export default GroupSetupTab;
