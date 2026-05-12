import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { emitToast } from "../events/toastBus";
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
  forceModal?: boolean;
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
  forceModal = false,
  onClose,
}: CustomAlertProps) {
  const { colors, isDark } = useTheme();
  const config = alertConfig[type];
  const hasStructuredMessage = useMemo(() => {
    return message.includes("\n") || message.includes("•") || message.includes("- ");
  }, [message]);

  const shouldUseTopToast = useMemo(() => {
    const firstButton = buttons[0];
    const hasSingleButton = buttons.length === 1;
    const isDefaultOkButton =
      !!firstButton &&
      firstButton.text.trim().toLowerCase() === "ok" &&
      !firstButton.onPress &&
      (!firstButton.style || firstButton.style === "default");

    return (
      !forceModal &&
      (type === "success" || type === "info") &&
      !hasStructuredMessage &&
      hasSingleButton &&
      isDefaultOkButton
    );
  }, [buttons, forceModal, hasStructuredMessage, type]);

  useEffect(() => {
    if (!visible || !shouldUseTopToast) return;

    emitToast({
      type,
      title,
      message,
    });

    onClose();
  }, [message, onClose, shouldUseTopToast, title, type, visible]);

  if (shouldUseTopToast) {
    return null;
  }

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

  const usesStackedButtons = buttons.length > 2;
  const normalizeTestId = (value: string) => (
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action'
  );

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      hardwareAccelerated
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
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
          <Text
            style={[
              styles.message,
              { color: colors.textSecondary },
              hasStructuredMessage ? styles.messageStructured : null,
            ]}
          >
            {message}
          </Text>

          {/* Buttons */}
          <View style={[styles.buttonContainer, usesStackedButtons && styles.buttonContainerStacked]}>
            {buttons.map((button, index) => {
              const btnStyle = getButtonStyle(button.style);
              return (
                <TouchableOpacity activeOpacity={1}
                  key={index}
                  testID={`custom-alert-button-${normalizeTestId(button.text)}`}
                  accessibilityLabel={`custom-alert-button-${normalizeTestId(button.text)}`}
                  onPress={() => handleButtonPress(button)}
                  style={[
                    styles.button,
                    { backgroundColor: btnStyle.backgroundColor },
                    buttons.length === 1 || usesStackedButtons ? styles.fullWidthButton : null,
                    buttons.length === 2 && { flex: 1 },
                    usesStackedButtons && index > 0 && { marginTop: 10 },
                  ]}
                >
                  <Text
                    style={[styles.buttonText, { color: btnStyle.textColor }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
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
    backgroundColor: 'rgba(15,23,42,0.58)',
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
  messageStructured: {
    width: '100%',
    textAlign: 'left',
  },
  buttonContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
    gap: 10,
  },
  buttonContainerStacked: {
    flexDirection: 'column',
    gap: 0,
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
  fullWidthButton: {
    width: '100%',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
});
