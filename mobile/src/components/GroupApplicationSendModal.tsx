import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { typography } from "../theme/tokens";
import GroupApplicationCvForm from "./GroupApplicationCvForm";

type Props = {
  applicationId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export default function GroupApplicationSendModal({ applicationId, onClose, onUpdated }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => { if (!busy) onClose(); }}
    >
      <View style={[styles.overlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Send application</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close application"
              disabled={busy}
              onPress={onClose}
              style={[styles.close, { opacity: busy ? 0.5 : 1 }]}
            >
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <GroupApplicationCvForm applicationId={applicationId} onUpdated={onUpdated} onBusyChange={setBusy} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  dialog: { width: "100%", maxWidth: 600, height: "90%", borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontFamily: typography.heading, fontSize: 18, lineHeight: 25 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
