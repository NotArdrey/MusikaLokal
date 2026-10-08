import { useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import GroupApplicationCvForm from "../src/components/GroupApplicationCvForm";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useRequireAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

export default function GroupApplicationCvScreen() {
  const { colors } = useTheme();
  useRequireAuth();
  const params = useLocalSearchParams<{ applicationId?: string }>();
  const applicationId = typeof params.applicationId === "string" ? params.applicationId : "";

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Header title="Group Application" overline="Member CVs" />
      <GroupApplicationCvForm key={applicationId} applicationId={applicationId} />
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 96 },
});
