import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  testID?: string;
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
  deferOnChange?: boolean;
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
  deferOnChange = false,
  iconSize = 21,
  indicatorWidthRatio = 0.42,
  showTopBorder = false,
  style,
  tabStyle,
  textStyle,
}: SlidingTabBarProps<T>) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const [pressedActiveKey, setPressedActiveKey] = useState<T | null>(null);
  const pendingFrameRef = useRef<number | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedActiveKey = pressedActiveKey ?? activeKey;
  const activeIndex = useMemo(
    () => Math.max(0, tabs.findIndex((tab) => tab.key === displayedActiveKey)),
    [displayedActiveKey, tabs],
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

  useEffect(() => {
    setPressedActiveKey(null);
  }, [activeKey]);

  useEffect(() => () => {
    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
    }

    if (pendingTimeoutRef.current !== null) {
      clearTimeout(pendingTimeoutRef.current);
    }
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setContainerWidth((currentWidth) => (
      Math.abs(currentWidth - nextWidth) > 0.5 ? nextWidth : currentWidth
    ));
  }, []);

  const commitChange = useCallback((key: T) => {
    if (!deferOnChange) {
      onChange(key);
      return;
    }

    if (pendingFrameRef.current !== null) {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = null;
    }

    if (pendingTimeoutRef.current !== null) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }

    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = null;
      pendingTimeoutRef.current = setTimeout(() => {
        pendingTimeoutRef.current = null;
        onChange(key);
      }, 0);
    });
  }, [deferOnChange, onChange]);

  const handlePress = useCallback((key: T) => {
    if (key === displayedActiveKey) {
      return;
    }

    const nextIndex = tabs.findIndex((tab) => tab.key === key);
    if (nextIndex >= 0) {
      progress.value = withTiming(nextIndex, motion.timing.tab);
    }

    setPressedActiveKey(key);
    commitChange(key);
  }, [commitChange, displayedActiveKey, progress, tabs]);

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
        const isActive = item.key === displayedActiveKey;
        const color = isActive ? resolvedActiveColor : resolvedInactiveColor;
        const icon = isActive && item.activeIcon ? item.activeIcon : item.icon;

        return (
          <TouchableOpacity
            activeOpacity={0.76}
            accessibilityLabel={item.accessibilityLabel ?? item.testID ?? item.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive, disabled: item.disabled }}
            disabled={item.disabled}
            key={String(item.key)}
            onPress={() => handlePress(item.key)}
            style={[styles.tab, tabStyle]}
            testID={item.testID}
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
