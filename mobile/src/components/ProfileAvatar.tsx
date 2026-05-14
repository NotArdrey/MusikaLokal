import { Ionicons } from "@expo/vector-icons";
import React, { memo, useMemo } from "react";
import { ImageStyle, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import CachedImage from "./CachedImage";

type ProfileAvatarProps = {
  uri?: string | null;
  size?: number;
  style?: StyleProp<ImageStyle>;
  iconName?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  backgroundColor?: string;
  iconColor?: string;
};

const ProfileAvatar = ({
  uri,
  size = 40,
  style,
  iconName = "person",
  iconSize,
  backgroundColor = "#E5E7EB",
  iconColor = "#64748B",
}: ProfileAvatarProps) => {
  const flattenedStyle = useMemo(() => StyleSheet.flatten(style) || {}, [style]);
  const width = typeof flattenedStyle.width === "number" ? flattenedStyle.width : size;
  const height = typeof flattenedStyle.height === "number" ? flattenedStyle.height : size;
  const radius =
    typeof flattenedStyle.borderRadius === "number"
      ? flattenedStyle.borderRadius
      : Math.min(width, height) / 2;

  return (
    <View
      style={[
        styles.wrap,
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor,
        },
        style as StyleProp<ViewStyle>,
      ]}
    >
      <Ionicons
        name={iconName}
        size={iconSize || Math.max(14, Math.round(Math.min(width, height) * 0.52))}
        color={iconColor}
      />
      <CachedImage
        uri={uri}
        style={StyleSheet.absoluteFillObject}
        width={width}
        height={height}
        quality={76}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});

export default memo(ProfileAvatar);
