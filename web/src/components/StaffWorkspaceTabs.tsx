import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { fetchActiveStaffAssignments, StaffEntityType } from "../utils/staffAccess";

type StaffWorkspaceTabsProps = {
  activeKey: StaffEntityType;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const STAFF_WORKSPACES = [
  { key: "studio", label: "Studios", route: "/my_studio" },
  { key: "venue", label: "Gigs", route: "/my_venue" },
  { key: "production", label: "Productions", route: "/my_production" },
] as const;

export default function StaffWorkspaceTabs({ activeKey, style, textStyle }: StaffWorkspaceTabsProps) {
  const { colors } = useTheme();
  const { userId, userRole } = useAuth();
  const [entityTypes, setEntityTypes] = useState<StaffEntityType[]>([]);

  useEffect(() => {
    let active = true;
    if (userRole !== "staff" || !userId) {
      return () => { active = false; };
    }

    void fetchActiveStaffAssignments(supabase, userId)
      .then((assignments) => {
        if (!active) return;
        const assignedTypes = new Set(assignments.map((assignment) => assignment.entity_type));
        setEntityTypes(STAFF_WORKSPACES.map((workspace) => workspace.key).filter((key) => assignedTypes.has(key)));
      })
      .catch(() => {
        if (active) setEntityTypes([]);
      });

    return () => { active = false; };
  }, [userId, userRole]);

  const visibleTabs = STAFF_WORKSPACES.filter((workspace) => entityTypes.includes(workspace.key));
  if (visibleTabs.length <= 1) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {visibleTabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <TouchableOpacity
            activeOpacity={1}
            key={tab.key}
            onPress={() => !isActive && router.replace(tab.route as any)}
            style={[styles.tabButton, isActive && { backgroundColor: `${colors.primary}14`, borderColor: colors.primary }]}
          >
            <Text style={[styles.label, { color: isActive ? colors.primary : colors.textSecondary }, textStyle]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    flexDirection: "row",
    gap: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "transparent",
  },
  label: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
});
