import { router, usePathname } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  fetchActiveStaffAssignments,
  getCachedActiveStaffAssignments,
  StaffEntityType,
} from "../utils/staffAccess";

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
  const [pendingSelection, setPendingSelection] = useState<{
    key: StaffEntityType;
    fromRouteKey: StaffEntityType;
  } | null>(null);
  const pendingFrameRef = useRef<number | null>(null);

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
    const routeTab = visibleTabs.find((tab) => pathname.includes(tab.route));
    return routeTab?.key ?? activeKey;
  }, [activeKey, pathname, visibleTabs]);
  const displayedActiveKey = pendingSelection?.fromRouteKey === routeActiveKey
    ? pendingSelection.key
    : routeActiveKey;

  useEffect(() => () => {
    if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
  }, []);

  const navigateToWorkspace = (key: StaffEntityType, route: string) => {
    if (key === displayedActiveKey) return;
    setPendingSelection({ key, fromRouteKey: routeActiveKey });
    if (pendingFrameRef.current !== null) cancelAnimationFrame(pendingFrameRef.current);
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      router.replace(route as any);
    });
  };

  if (visibleTabs.length <= 1) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {visibleTabs.map((tab) => {
        const isActive = tab.key === displayedActiveKey;
        return (
          <TouchableOpacity
            activeOpacity={1}
            key={tab.key}
            onPress={() => navigateToWorkspace(tab.key, tab.route)}
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
