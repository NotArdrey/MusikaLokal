import { router } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
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
  const pendingNavigationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pendingNavigationFrameRef.current !== null) {
        cancelAnimationFrame(pendingNavigationFrameRef.current);
      }
    };
  }, []);

  const handleChange = (nextKey: MusicianWorkspaceTabKey) => {
    if (nextKey === activeKey) {
      return;
    }

    const nextTab = MUSICIAN_WORKSPACE_TABS.find((tab) => tab.key === nextKey);
    if (!nextTab) {
      return;
    }

    if (pendingNavigationFrameRef.current !== null) {
      cancelAnimationFrame(pendingNavigationFrameRef.current);
    }

    pendingNavigationFrameRef.current = requestAnimationFrame(() => {
      pendingNavigationFrameRef.current = null;
      router.replace(nextTab.route as any);
    });
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {MUSICIAN_WORKSPACE_TABS.map((tab) => {
        const isActive = tab.key === activeKey;

        return (
          <TouchableOpacity
            activeOpacity={1}
            key={tab.key}
            onPress={() => handleChange(tab.key)}
            style={[
              styles.tabButton,
              isActive && {
                backgroundColor: `${colors.primary}14`,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.primary : colors.textSecondary },
                textStyle,
              ]}
            >
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
