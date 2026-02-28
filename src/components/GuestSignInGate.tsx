import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";

type GuestSignInGateProps = {
  message: string;
};

export default function GuestSignInGate({ message }: GuestSignInGateProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: insets.bottom + 110, paddingTop: 20 },
      ]}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Ionicons name="lock-closed-outline" size={40} color={colors.textSecondary} />
        <Text style={[styles.title, { color: colors.text }]}>Sign in first</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => router.replace("/")}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  title: {
    marginTop: 12,
    fontSize: 20,
    fontFamily: "Poppins_600SemiBold",
  },
  message: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  button: {
    marginTop: 18,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
});
