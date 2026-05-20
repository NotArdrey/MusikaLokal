import { router, usePathname } from "expo-router";
import React, { useMemo } from "react";
import { StyleProp, StyleSheet, TextStyle, ViewStyle } from "react-native";
import SlidingTabBar from "./SlidingTabBar";
import { useTheme } from "../context/ThemeContext";

type MusicianWorkspaceTabKey = "group" | "producer" | "venue";

type MusicianWorkspaceTabsProps = {
  activeKey: MusicianWorkspaceTabKey;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const MUSICIAN_WORKSPACE_TABS = [
  { key: "group", label: "My Group", route: "/my_group" },
  { key: "producer", label: "My Production", route: "/my_production" },
  { key: "venue", label: "My Gig", route: "/my_venue" },
] as const;

export default function MusicianWorkspaceTabs({
  activeKey,
  style,
  textStyle,
}: MusicianWorkspaceTabsProps) {
  const { colors } = useTheme();
  const pathname = usePathname();
  const routeActiveKey = useMemo(() => {
    const activeTab = MUSICIAN_WORKSPACE_TABS.find((tab) => pathname.includes(tab.route));
    return activeTab?.key ?? activeKey;
  }, [activeKey, pathname]);

  const handleChange = (nextKey: MusicianWorkspaceTabKey) => {
    if (nextKey === routeActiveKey) {
      return;
    }

    const nextTab = MUSICIAN_WORKSPACE_TABS.find((tab) => tab.key === nextKey);
    if (!nextTab) {
      return;
    }

    router.replace(nextTab.route as any);
  };

  return (
    <SlidingTabBar
      activeColor={colors.primary}
      activeKey={routeActiveKey}
      backgroundColor={colors.surface}
      borderColor={colors.border}
      indicatorColor={colors.primary}
      indicatorWidthRatio={0.28}
      onChange={handleChange}
      optimisticPress={false}
      style={[styles.container, style]}
      tabs={MUSICIAN_WORKSPACE_TABS.map((tab) => ({
        key: tab.key,
        label: tab.label,
      }))}
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
