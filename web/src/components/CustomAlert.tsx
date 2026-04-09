import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../context/ThemeContext";

export type AlertType = "error" | "success" | "warning" | "info";

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface CustomAlertProps {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  buttons?: AlertButton[];
  onClose: () => void;
}

const IS_WEB = Platform.OS === "web";

const alertConfig = {
  error: {
    icon: "alert-circle" as const,
    color: "#EF4444",
    bgColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  success: {
    icon: "checkmark-circle" as const,
    color: "#10B981",
    bgColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  warning: {
    icon: "warning" as const,
    color: "#F59E0B",
    bgColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  info: {
    icon: "information-circle" as const,
    color: "#3B82F6",
    bgColor: "rgba(59, 130, 246, 0.1)",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
};

export default function CustomAlert({
  visible,
  type = "info",
  title,
  message,
  buttons = [{ text: "OK", style: "default" }],
  onClose,
}: CustomAlertProps) {
  const { colors, isDark } = useTheme();
  const config = alertConfig[type];

  const handleButtonPress = (button: AlertButton) => {
    // Call the onPress callback first, then close the alert
    // This ensures async operations start immediately
    if (button.onPress) {
      button.onPress();
    }
    onClose();
  };

  const getButtonStyle = (style?: string) => {
    switch (style) {
      case "cancel":
        return {
          backgroundColor: isDark ? "#374151" : "#F3F4F6",
          textColor: colors.textSecondary,
        };
      case "destructive":
        return {
          backgroundColor: "#EF4444",
          textColor: "#FFFFFF",
        };
      default:
        return {
          backgroundColor: colors.primary,
          textColor: "#FFFFFF",
        };
    }
  };

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <BlurView intensity={60} tint="dark" style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
            },
          ]}
        >
          {/* Icon Circle */}
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: config.bgColor,
                borderColor: config.borderColor,
              },
            ]}
          >
            <Ionicons name={config.icon} size={IS_WEB ? 34 : 38} color={config.color} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {/* Message */}
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            {buttons.map((button, index) => {
              const btnStyle = getButtonStyle(button.style);
              return (
                <TouchableOpacity activeOpacity={1}
                  key={index}
                  onPress={() => handleButtonPress(button)}
                  style={[
                    styles.button,
                    { backgroundColor: btnStyle.backgroundColor },
                    buttons.length > 1 && { flex: 1 },
                  ]}
                >
                  <Text
                    style={[styles.buttonText, { color: btnStyle.textColor }]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: IS_WEB ? 16 : 24,
    paddingVertical: 20,
  },
  container: {
    width: IS_WEB ? '92%' : '100%',
    maxWidth: IS_WEB ? 380 : 340,
    borderRadius: IS_WEB ? 18 : 24,
    padding: IS_WEB ? 22 : 26,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
  iconCircle: {
    width: IS_WEB ? 68 : 74,
    height: IS_WEB ? 68 : 74,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
  },
  title: {
    fontSize: IS_WEB ? 18 : 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    fontFamily: 'Poppins_700Bold',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: IS_WEB ? 21 : 22,
    marginBottom: IS_WEB ? 20 : 24,
    fontFamily: 'Poppins_400Regular',
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: IS_WEB ? 110 : 100,
    minHeight: 44,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
});
