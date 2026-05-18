import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { emitToast } from "../events/toastBus";
import { useTheme } from "../context/ThemeContext";
import { motion } from "../utils/motion";

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
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
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

  const finishDismiss = useCallback(() => {
    setRendered(false);
  }, []);

  useEffect(() => {
    if (shouldUseTopToast) {
      return;
    }

    if (visible) {
      setRendered(true);
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: 220,
        easing: motion.easing.standard,
      });
      return;
    }

    progress.value = withTiming(0, {
      duration: 180,
      easing: motion.easing.exit,
    }, (finished) => {
      if (finished) {
        runOnJS(finishDismiss)();
      }
    });
  }, [finishDismiss, progress, shouldUseTopToast, visible]);

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  if (shouldUseTopToast) {
    return null;
  }

  if (!rendered) {
    return null;
  }

  const usesStackedButtons = buttons.length > 2;
  const normalizeTestId = (value: string) => (
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action'
  );

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
      presentationStyle="overFullScreen"
      hardwareAccelerated
      visible={rendered}
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, overlayAnimatedStyle]}>
        <Animated.View
          style={[
            styles.container,
            modalAnimatedStyle,
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
            <Ionicons name={config.icon} size={40} color={config.color} />
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
                <TouchableOpacity
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
                    !usesStackedButtons && index > 0 && { marginLeft: 12 },
                  ]}
                  activeOpacity={1}
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
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  container: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'Poppins_700Bold',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
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
  },
  buttonContainerStacked: {
    flexDirection: 'column',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    minHeight: 52,
  },
  fullWidthButton: {
    width: '100%',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
});
