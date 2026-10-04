import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleProp, StyleSheet, TextStyle, ViewStyle } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  fetchActiveStaffAssignments,
  getCachedActiveStaffAssignments,
  StaffEntityType,
} from "../utils/staffAccess";
import SlidingTabBar from "./SlidingTabBar";
import { useTheme } from "../context/ThemeContext";

type StaffWorkspaceTabsProps = {
  activeKey: StaffEntityType | "history";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const STAFF_WORKSPACES = [
  { key: "studio", label: "Studios", route: "/my_studio" },
  { key: "venue", label: "Gigs", route: "/my_venue" },
  { key: "production", label: "Productions", route: "/my_production" },
] as const;

const getAssignedEntityTypes = (userId: string | null | undefined) => {
  if (!userId) return [];
  const assignments = getCachedActiveStaffAssignments(userId);
  if (!assignments) return [];
  const assignedTypes = new Set(assignments.map((assignment) => assignment.entity_type));
  return STAFF_WORKSPACES.map((workspace) => workspace.key).filter((key) => assignedTypes.has(key));
};

const haveSameEntityTypes = (
  current: StaffEntityType[],
  next: StaffEntityType[],
) => current.length === next.length && current.every((value, index) => value === next[index]);

export default function StaffWorkspaceTabs({ activeKey, style, textStyle }: StaffWorkspaceTabsProps) {
  const { colors } = useTheme();
  const { userId, userRole } = useAuth();
  const pathname = usePathname();
  const [entityTypes, setEntityTypes] = useState<StaffEntityType[]>(() => getAssignedEntityTypes(userId));

  useEffect(() => {
    let active = true;

    if (userRole !== "staff" || !userId) {
      return () => { active = false; };
    }

    void fetchActiveStaffAssignments(supabase, userId)
      .then((assignments) => {
        if (!active) return;
        const assignedTypes = new Set(assignments.map((assignment) => assignment.entity_type));
        const nextEntityTypes = STAFF_WORKSPACES
          .map((workspace) => workspace.key)
          .filter((key) => assignedTypes.has(key));
        setEntityTypes((current) => (
          haveSameEntityTypes(current, nextEntityTypes) ? current : nextEntityTypes
        ));
      })
      .catch(() => {
        if (active) {
          setEntityTypes((current) => (current.length === 0 ? current : []));
        }
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
  const tabItems = useMemo(
    () => [...visibleTabs.map((tab) => ({ key: tab.key, label: tab.label })), { key: "history" as const, label: "My History" }],
    [visibleTabs],
  );

  if (visibleTabs.length === 0 && activeKey !== "history") return null;

  return (
    <SlidingTabBar
      activeColor={colors.primary}
      activeKey={routeActiveKey}
      backgroundColor={colors.surface}
      borderColor={colors.border}
      indicatorColor={colors.primary}
      indicatorWidthRatio={0.28}
      onChange={(nextKey) => {
        if (nextKey === "history") {
          if (routeActiveKey !== "history") router.replace("/my_history" as any);
          return;
        }
        const nextTab = visibleTabs.find((tab) => tab.key === nextKey);
        if (nextTab && nextKey !== routeActiveKey) router.replace(nextTab.route as any);
      }}
      deferOnChange
      optimisticPress
      style={[styles.container, style]}
      tabs={tabItems}
      textStyle={[styles.label, textStyle]}
      labelNumberOfLines={2}
      tabStyle={{ paddingHorizontal: 2 }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
  },
});
