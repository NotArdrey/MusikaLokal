import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";

export type TopToastType = "success" | "error" | "warning" | "info";

export interface TopToastPayload {
  title?: string;
  message: string;
  type?: TopToastType;
  duration?: number;
}

interface ActiveToast {
  title: string;
  message: string;
  type: TopToastType;
  duration: number;
}

interface TopToastContextValue {
  showToast: (payload: TopToastPayload) => void;
  hideToast: () => void;
}

const DEFAULT_DURATION_BY_TYPE: Record<TopToastType, number> = {
  success: 1800,
  info: 2400,
  warning: 2800,
  error: 3200,
};
const HIDDEN_OFFSET = -140;

const defaultTitleByType: Record<TopToastType, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Notice",
};

const toastTypeConfig: Record<
  TopToastType,
  {
    icon: string;
    accent: string;
    lightBackground: string;
    darkBackground: string;
    lightBorder: string;
    darkBorder: string;
    lightIconBg: string;
    darkIconBg: string;
  }
> = {
  success: {
    icon: "checkmark-circle",
    accent: "#10B981",
    lightBackground: "#ECFDF5",
    darkBackground: "rgba(16, 185, 129, 0.16)",
    lightBorder: "#A7F3D0",
    darkBorder: "rgba(16, 185, 129, 0.4)",
    lightIconBg: "rgba(16, 185, 129, 0.14)",
    darkIconBg: "rgba(16, 185, 129, 0.22)",
  },
  error: {
    icon: "close-circle",
    accent: "#EF4444",
    lightBackground: "#FEF2F2",
    darkBackground: "rgba(239, 68, 68, 0.16)",
    lightBorder: "#FECACA",
    darkBorder: "rgba(239, 68, 68, 0.4)",
    lightIconBg: "rgba(239, 68, 68, 0.14)",
    darkIconBg: "rgba(239, 68, 68, 0.22)",
  },
  warning: {
    icon: "warning",
    accent: "#F59E0B",
    lightBackground: "#FFFBEB",
    darkBackground: "rgba(245, 158, 11, 0.16)",
    lightBorder: "#FDE68A",
    darkBorder: "rgba(245, 158, 11, 0.4)",
    lightIconBg: "rgba(245, 158, 11, 0.14)",
    darkIconBg: "rgba(245, 158, 11, 0.22)",
  },
  info: {
    icon: "information-circle",
    accent: "#3B82F6",
    lightBackground: "#EFF6FF",
    darkBackground: "rgba(59, 130, 246, 0.16)",
    lightBorder: "#BFDBFE",
    darkBorder: "rgba(59, 130, 246, 0.4)",
    lightIconBg: "rgba(59, 130, 246, 0.14)",
    darkIconBg: "rgba(59, 130, 246, 0.22)",
  },
};

const TopToastContext = createContext<TopToastContextValue | undefined>(undefined);

let externalShowToast: ((payload: TopToastPayload) => void) | null = null;

export const showTopToast = (payload: TopToastPayload) => {
  externalShowToast?.(payload);
};

export function TopToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeToast, setActiveToast] = useState<ActiveToast | null>(null);
  const translateY = useRef(new Animated.Value(HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hideToast = useCallback(() => {
    clearHideTimer();

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: HIDDEN_OFFSET,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setActiveToast(null);
      }
    });
  }, [clearHideTimer, opacity, translateY]);

  const showToast = useCallback(
    (payload: TopToastPayload) => {
      const normalizedMessage = payload.message?.trim();
      if (!normalizedMessage) return;

      const type = payload.type ?? "info";
      const duration = Math.max(
        payload.duration ?? DEFAULT_DURATION_BY_TYPE[type],
        1200,
      );
      const title = payload.title?.trim() || defaultTitleByType[type];

      clearHideTimer();
      setActiveToast({
        title,
        message: normalizedMessage,
        type,
        duration,
      });

      translateY.setValue(HIDDEN_OFFSET);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimerRef.current = setTimeout(() => {
        hideToast();
      }, duration);
    },
    [clearHideTimer, hideToast, opacity, translateY],
  );

  useEffect(() => {
    externalShowToast = showToast;

    return () => {
      if (externalShowToast === showToast) {
        externalShowToast = null;
      }
    };
  }, [showToast]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  const value = useMemo<TopToastContextValue>(
    () => ({ showToast, hideToast }),
    [hideToast, showToast],
  );

  const topOffset = Math.max(insets.top, 12);
  const config = activeToast ? toastTypeConfig[activeToast.type] : null;

  return (
    <TopToastContext.Provider value={value}>
      {children}

      <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
        {activeToast && config ? (
          <Animated.View
            style={[
              styles.toast,
              {
                top: topOffset,
                transform: [{ translateY }],
                opacity,
                backgroundColor: isDark
                  ? config.darkBackground
                  : config.lightBackground,
                borderColor: isDark ? config.darkBorder : config.lightBorder,
              },
            ]}
          >
            <Pressable
              onPress={hideToast}
              style={styles.touchableArea}
              accessibilityRole="alert"
              accessibilityLabel={`${activeToast.title}. ${activeToast.message}`}
            >
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: isDark
                      ? config.darkIconBg
                      : config.lightIconBg,
                  },
                ]}
              >
                <Ionicons name={config.icon as any} size={18} color={config.accent} />
              </View>

              <View style={styles.textContainer}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {activeToast.title}
                </Text>
                <Text
                  style={[styles.message, { color: colors.textSecondary }]}
                  numberOfLines={3}
                >
                  {activeToast.message}
                </Text>
              </View>

              <Ionicons
                name="close"
                size={16}
                color={colors.textSecondary}
                style={styles.closeIcon}
              />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </TopToastContext.Provider>
  );
}

export function useTopToast() {
  const context = useContext(TopToastContext);
  if (!context) {
    throw new Error("useTopToast must be used within a TopToastProvider");
  }

  return context;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 14,
    right: 14,
    minHeight: 70,
    borderRadius: 16,
    borderWidth: 1,
    zIndex: 99999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 12,
  },
  touchableArea: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  textContainer: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  message: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "Poppins_400Regular",
  },
  closeIcon: {
    opacity: 0.85,
    marginTop: 3,
  },
});
