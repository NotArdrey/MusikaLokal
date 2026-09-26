import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleProp, StyleSheet, TextStyle, ViewStyle } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { fetchActiveStaffAssignments, StaffEntityType } from "../utils/staffAccess";
import SlidingTabBar from "./SlidingTabBar";
import { useTheme } from "../context/ThemeContext";

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
  const pathname = usePathname();
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

  const visibleTabs = useMemo(
    () => STAFF_WORKSPACES.filter((workspace) => entityTypes.includes(workspace.key)),
    [entityTypes],
  );
  const routeActiveKey = useMemo(() => {
    const activeTab = visibleTabs.find((tab) => pathname.includes(tab.route));
    return activeTab?.key ?? activeKey;
  }, [activeKey, pathname, visibleTabs]);

  if (visibleTabs.length <= 1) return null;

  return (
    <SlidingTabBar
      activeColor={colors.primary}
      activeKey={routeActiveKey}
      backgroundColor={colors.surface}
      borderColor={colors.border}
      indicatorColor={colors.primary}
      indicatorWidthRatio={0.28}
      onChange={(nextKey) => {
        const nextTab = visibleTabs.find((tab) => tab.key === nextKey);
        if (nextTab && nextKey !== routeActiveKey) router.replace(nextTab.route as any);
      }}
      optimisticPress={false}
      style={[styles.container, style]}
      tabs={visibleTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
      textStyle={[styles.label, textStyle]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
  },
});
