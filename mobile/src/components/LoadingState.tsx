import React from "react";
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

type LoadingStateProps = {
  message: string;
  detail?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

type LoadingButtonContentProps = {
  message: string;
  color?: string;
};

export function LoadingButtonContent({ message, color = "#FFFFFF" }: LoadingButtonContentProps) {
  return (
    <View style={styles.buttonContent}>
      <ActivityIndicator size="small" color={color} />
      <Text accessibilityLiveRegion="polite" style={[styles.buttonMessage, { color }]}>{message}</Text>
    </View>
  );
}

export default function LoadingState({
  message,
  detail,
  compact = false,
  style,
}: LoadingStateProps) {
  const { colors } = useTheme();
  const accessibilityLabel = detail ? `${message} ${detail}` : message;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      style={[styles.container, compact && styles.compact, style]}
    >
      <ActivityIndicator size={compact ? "small" : "large"} color={colors.primary} />
      <View style={compact ? styles.compactCopy : styles.copy}>
        <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
        {detail ? (
          <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  compact: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  copy: {
    alignItems: "center",
    marginTop: 12,
  },
  compactCopy: {
    marginLeft: 10,
  },
  message: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    textAlign: "center",
  },
  detail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    maxWidth: 360,
    textAlign: "center",
  },
  buttonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
  },
  buttonMessage: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
});
