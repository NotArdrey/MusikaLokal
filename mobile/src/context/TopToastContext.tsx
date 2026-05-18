import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  emitToast,
  toastBus,
  type ToastEvent,
  type ToastPayload,
  type ToastType,
} from "../events/toastBus";
import { isE2EFixtureMode } from "../utils/e2eFixtures";
import { useTheme } from "./ThemeContext";

export type TopToastType = ToastType;
export type TopToastPayload = ToastPayload;

interface TopToastContextValue {
  showToast: (payload: TopToastPayload) => boolean;
  hideToast: () => void;
}

const DEFAULT_DURATION_BY_TYPE: Record<TopToastType, number> = {
  success: 5000,
  info: 5600,
  warning: 6400,
  error: 7200,
};

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
    darkBackground: "#064E3B",
    lightBorder: "#A7F3D0",
    darkBorder: "#34D399",
    lightIconBg: "rgba(16, 185, 129, 0.14)",
    darkIconBg: "rgba(52, 211, 153, 0.18)",
  },
  error: {
    icon: "close-circle",
    accent: "#EF4444",
    lightBackground: "#FEF2F2",
    darkBackground: "#7F1D1D",
    lightBorder: "#FECACA",
    darkBorder: "#F87171",
    lightIconBg: "rgba(239, 68, 68, 0.14)",
    darkIconBg: "rgba(248, 113, 113, 0.18)",
  },
  warning: {
    icon: "warning",
    accent: "#F59E0B",
    lightBackground: "#FFFBEB",
    darkBackground: "#78350F",
    lightBorder: "#FDE68A",
    darkBorder: "#FBBF24",
    lightIconBg: "rgba(245, 158, 11, 0.14)",
    darkIconBg: "rgba(251, 191, 36, 0.18)",
  },
  info: {
    icon: "information-circle",
    accent: "#3B82F6",
    lightBackground: "#EFF6FF",
    darkBackground: "#1E3A8A",
    lightBorder: "#BFDBFE",
    darkBorder: "#60A5FA",
    lightIconBg: "rgba(59, 130, 246, 0.14)",
    darkIconBg: "rgba(96, 165, 250, 0.18)",
  },
};

const TopToastContext = createContext<TopToastContextValue | undefined>(undefined);

const MAX_VISIBLE_TOASTS = 4;
const ENTRY_OFFSET = -28;
const SWIPE_DISMISS_DISTANCE = 88;
const OFFSCREEN_DISTANCE = 420;
const E2E_MIN_VISIBLE_DURATION_MS = 60_000;

const triggerToastHaptic = (type: TopToastType) => {
  if (Platform.OS === "web") {
    return;
  }

  if (type === "info") {
    void Haptics.selectionAsync().catch(() => undefined);
    return;
  }

  const hapticType =
    type === "success"
      ? Haptics.NotificationFeedbackType.Success
      : type === "error"
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Warning;

  void Haptics.notificationAsync(hapticType).catch(() => undefined);
};

export function TopToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const hideToast = useCallback(() => {
    setToasts([]);
  }, []);

  useEffect(() => {
    return toastBus.subscribe((event) => {
      triggerToastHaptic(event.type);
      setToasts((currentToasts) => [
        event,
        ...currentToasts.filter((toast) => toast.id !== event.id),
      ].slice(0, MAX_VISIBLE_TOASTS));
    });
  }, []);

  const value = useMemo<TopToastContextValue>(
    () => ({ showToast: emitToast, hideToast }),
    [hideToast],
  );

  const topOffset = Math.max(insets.top + 8, 16);

  return (
    <TopToastContext.Provider value={value}>
      <View style={styles.root}>
        {children}

        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <View pointerEvents="box-none" style={[styles.toastStack, { top: topOffset }]}>
            {toasts.map((toast, index) => (
              <ToastCard
                colors={colors}
                index={index}
                isDark={isDark}
                key={toast.id}
                onDismiss={dismissToast}
                toast={toast}
              />
            ))}
          </View>
        </View>
      </View>
    </TopToastContext.Provider>
  );
}

function ToastCard({
  colors,
  index,
  isDark,
  onDismiss,
  toast,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  index: number;
  isDark: boolean;
  onDismiss: (id: string) => void;
  toast: ToastEvent;
}) {
  const isE2EToast = isE2EFixtureMode();
  const translateY = useRef(new Animated.Value(isE2EToast ? 0 : ENTRY_OFFSET)).current;
  const opacity = useRef(new Animated.Value(isE2EToast ? 1 : 0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const exitStartedRef = useRef(false);
  const config = toastTypeConfig[toast.type];
  const baseDuration = Math.max(toast.duration ?? DEFAULT_DURATION_BY_TYPE[toast.type], 1200);
  const duration = isE2EToast
    ? Math.max(baseDuration, E2E_MIN_VISIBLE_DURATION_MS)
    : baseDuration;
  const title = toast.title?.trim() || defaultTitleByType[toast.type];

  const finishDismiss = useCallback(
    (direction = 0) => {
      if (exitStartedRef.current) {
        return;
      }

      exitStartedRef.current = true;
      progress.stopAnimation();

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 170,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -16,
          duration: 170,
          useNativeDriver: true,
        }),
        Animated.timing(dragX, {
          toValue: direction === 0 ? 0 : direction * OFFSCREEN_DISTANCE,
          duration: 190,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss(toast.id));
    },
    [dragX, onDismiss, opacity, progress, toast.id, translateY],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        },
        onPanResponderMove: (_, gestureState) => {
          dragX.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (Math.abs(gestureState.dx) >= SWIPE_DISMISS_DISTANCE) {
            finishDismiss(gestureState.dx > 0 ? 1 : -1);
            return;
          }

          Animated.spring(dragX, {
            toValue: 0,
            tension: 120,
            friction: 14,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragX, {
            toValue: 0,
            tension: 120,
            friction: 14,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dragX, finishDismiss],
  );

  useEffect(() => {
    if (isE2EToast) {
      const dismissTimer = setTimeout(() => finishDismiss(), duration);

      return () => {
        clearTimeout(dismissTimer);
      };
    }

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 130,
        friction: 16,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 0,
        duration,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        finishDismiss();
      }
    });

    return () => {
      progress.stopAnimation();
    };
  }, [duration, finishDismiss, isE2EToast, opacity, progress, translateY]);

  return (
    <Animated.View
      pointerEvents="box-none"
      testID={`top-toast-${toast.id}`}
      style={[
        styles.toast,
        {
          backgroundColor: isDark ? config.darkBackground : config.lightBackground,
          borderColor: isDark ? config.darkBorder : config.lightBorder,
        },
        {
          opacity,
          zIndex: 99999 - index,
          transform: [
            { translateX: dragX },
            { translateY },
            { scale: index === 0 ? 1 : 0.985 },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        accessibilityLabel={toast.message ? `${title}. ${toast.message}` : title}
        accessibilityRole="alert"
        onPress={() => finishDismiss()}
        style={styles.touchableArea}
      >
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: isDark ? config.darkIconBg : config.lightIconBg,
            },
          ]}
        >
          <Ionicons name={config.icon as any} size={18} color={config.accent} />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {toast.message ? (
            <Text
              style={[styles.message, { color: colors.textSecondary }]}
              numberOfLines={3}
            >
              {toast.message}
            </Text>
          ) : null}
        </View>

        <Ionicons
          name="close"
          size={16}
          color={colors.textSecondary}
          style={styles.closeIcon}
        />
      </Pressable>

      <View style={[styles.progressTrack, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)" }]}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              backgroundColor: config.accent,
              transform: [{ scaleX: progress }],
            },
          ]}
        />
      </View>
    </Animated.View>
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
  root: {
    flex: 1,
  },
  toastStack: {
    position: "absolute",
    left: 14,
    right: 14,
    gap: 8,
    zIndex: 99999,
  },
  toast: {
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  touchableArea: {
    paddingHorizontal: 14,
    paddingBottom: 13,
    paddingTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
    marginTop: 4,
  },
  progressTrack: {
    bottom: 0,
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
  },
  progressFill: {
    height: "100%",
    transformOrigin: "left center",
    width: "100%",
  },
});
