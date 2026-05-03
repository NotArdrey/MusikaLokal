import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { motion } from "../utils/motion";

type SlidingTabKey = string | number;
type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type SlidingTabItem<T extends SlidingTabKey> = {
  key: T;
  label?: string;
  icon?: IconName;
  activeIcon?: IconName;
  accessibilityLabel?: string;
  disabled?: boolean;
};

type SlidingTabBarProps<T extends SlidingTabKey> = {
  activeKey: T;
  tabs: readonly SlidingTabItem<T>[];
  onChange: (key: T) => void;
  activeColor?: string;
  inactiveColor?: string;
  indicatorColor?: string;
  borderColor?: string;
  backgroundColor?: string;
  iconSize?: number;
  indicatorWidthRatio?: number;
  showTopBorder?: boolean;
  style?: StyleProp<ViewStyle>;
  tabStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export default function SlidingTabBar<T extends SlidingTabKey>({
  activeKey,
  tabs,
  onChange,
  activeColor,
  inactiveColor,
  indicatorColor,
  borderColor,
  backgroundColor,
  iconSize = 21,
  indicatorWidthRatio = 0.42,
  showTopBorder = false,
  style,
  tabStyle,
  textStyle,
}: SlidingTabBarProps<T>) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const activeIndex = useMemo(
    () => Math.max(0, tabs.findIndex((tab) => tab.key === activeKey)),
    [activeKey, tabs],
  );
  const progress = useSharedValue(activeIndex);
  const resolvedActiveColor = activeColor ?? colors.text;
  const resolvedInactiveColor = inactiveColor ?? colors.textSecondary;
  const resolvedIndicatorColor = indicatorColor ?? resolvedActiveColor;
  const resolvedBorderColor = borderColor ?? colors.border;
  const tabWidth = tabs.length > 0 && containerWidth > 0 ? containerWidth / tabs.length : 0;
  const indicatorWidth = tabWidth * indicatorWidthRatio;
  const indicatorInset = (tabWidth - indicatorWidth) / 2;

  useEffect(() => {
    progress.value = withTiming(activeIndex, motion.timing.tab);
  }, [activeIndex, progress]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: tabWidth > 0 ? 1 : 0,
    width: indicatorWidth,
    transform: [
      {
        translateX: progress.value * tabWidth + indicatorInset,
      },
    ],
  }));

  return (
    <View
      onLayout={handleLayout}
      style={[
        styles.container,
        {
          backgroundColor,
          borderBottomColor: resolvedBorderColor,
          borderTopColor: resolvedBorderColor,
          borderTopWidth: showTopBorder ? StyleSheet.hairlineWidth : 0,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          { backgroundColor: resolvedIndicatorColor },
          indicatorAnimatedStyle,
        ]}
      />
      {tabs.map((item) => {
        const isActive = item.key === activeKey;
        const color = isActive ? resolvedActiveColor : resolvedInactiveColor;
        const icon = isActive && item.activeIcon ? item.activeIcon : item.icon;

        return (
          <TouchableOpacity
            activeOpacity={0.76}
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive, disabled: item.disabled }}
            disabled={item.disabled}
            key={String(item.key)}
            onPress={() => {
              if (item.key !== activeKey) {
                onChange(item.key);
              }
            }}
            style={[styles.tab, tabStyle]}
          >
            {icon ? <Ionicons name={icon} size={iconSize} color={color} /> : null}
            {item.label ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  textStyle,
                  {
                    color,
                    fontFamily: isActive ? "Poppins_600SemiBold" : "Poppins_500Medium",
                  },
                ]}
              >
                {item.label}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: -StyleSheet.hairlineWidth,
    height: 2.5,
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
