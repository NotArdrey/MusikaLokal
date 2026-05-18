import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

type InlineErrorBannerProps = {
  message: string | null;
  onRetry?: () => void;
  retryLabel?: string;
};

export default function InlineErrorBanner({
  message,
  onRetry,
  retryLabel = "Retry",
}: InlineErrorBannerProps) {
  const { colors, isDark } = useTheme();

  if (!message) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? "rgba(127,29,29,0.22)" : "#FEF2F2",
          borderColor: isDark ? "rgba(248,113,113,0.38)" : "#FECACA",
        },
      ]}
    >
      <Ionicons name="alert-circle-outline" size={18} color="#DC2626" />
      <Text style={[styles.message, { color: colors.text }]}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity activeOpacity={1} onPress={onRetry} style={styles.retryButton}>
          <Text style={[styles.retryText, { color: colors.primary }]}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  message: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  retryText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
});
