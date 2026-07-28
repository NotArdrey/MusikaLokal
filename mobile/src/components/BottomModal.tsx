import React, { useCallback, useEffect, useState } from "react";
import * as NavigationBar from "expo-navigation-bar";
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useBottomOverlayRegistration } from "../context/BottomOverlayContext";
import { logLoadTime } from "../utils/loadTimeLogger";
import { motion } from "../utils/motion";

type BottomModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropColor?: string;
  bottomInsetBackgroundColor?: string;
  closeOnBackdropPress?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  keyboardAvoidingResetKey?: React.Key;
  keyboardVerticalOffset?: number;
  navigationBarTranslucent?: boolean;
  navigationBarStyleWhileVisible?: "auto" | "inverted" | "light" | "dark";
  overlayLabel?: string;
  statusBarTranslucent?: boolean;
};

const CLOSED_TRANSLATE_Y = 54;
const ANDROID_NAVIGATION_AREA_FALLBACK = 180;

export default function BottomModal({
  visible,
  onClose,
  children,
  backdropColor = "rgba(0,0,0,0.5)",
  bottomInsetBackgroundColor,
  closeOnBackdropPress = false,
  contentContainerStyle,
  keyboardAvoiding = false,
  keyboardAvoidingResetKey,
  keyboardVerticalOffset = 0,
  navigationBarTranslucent = true,
  navigationBarStyleWhileVisible,
  overlayLabel = "BottomModal",
  statusBarTranslucent = true,
}: BottomModalProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const dismissFallbackRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTokenRef = React.useRef(0);
  const wasVisibleRef = React.useRef(visible);
  const visibleRequestedAtRef = React.useRef<number | null>(visible ? Date.now() : null);
  const visibleFrameRef = React.useRef<number | null>(null);
  const { registerOverlay, unregisterOverlay } = useBottomOverlayRegistration(overlayLabel);

  const clearDismissFallback = useCallback(() => {
    if (!dismissFallbackRef.current) {
      return;
    }

    clearTimeout(dismissFallbackRef.current);
    dismissFallbackRef.current = null;
  }, []);

  React.useLayoutEffect(() => {
    if (visible) {
      visibleRequestedAtRef.current = Date.now();
      dismissTokenRef.current += 1;
      clearDismissFallback();
      registerOverlay();
      visibleFrameRef.current = requestAnimationFrame(() => {
        visibleFrameRef.current = null;
        const requestedAt = visibleRequestedAtRef.current;
        if (requestedAt !== null) {
          logLoadTime("Modal", "shell-visible", {
            durationMs: Date.now() - requestedAt,
            overlayLabel,
          });
          visibleRequestedAtRef.current = null;
        }
      });
    }

    return () => {
      if (visibleFrameRef.current !== null) {
        cancelAnimationFrame(visibleFrameRef.current);
        visibleFrameRef.current = null;
      }
    };
  }, [clearDismissFallback, overlayLabel, registerOverlay, visible]);

  useEffect(() => {
    if (Platform.OS !== "android" || !visible || !navigationBarStyleWhileVisible) {
      return undefined;
    }

    NavigationBar.setStyle(navigationBarStyleWhileVisible);

    return () => {
      NavigationBar.setStyle("auto");
    };
  }, [navigationBarStyleWhileVisible, visible]);

  useEffect(() => {
    return clearDismissFallback;
  }, [clearDismissFallback]);

  const finishDismiss = useCallback((dismissToken: number) => {
    if (dismissTokenRef.current !== dismissToken) {
      return;
    }

    dismissTokenRef.current += 1;
    clearDismissFallback();
    setRendered(false);
    unregisterOverlay(`bottom-modal-dismiss:${overlayLabel}`);
  }, [clearDismissFallback, overlayLabel, unregisterOverlay]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (visible) {
      if (!rendered) {
        setRendered(true);
        progress.value = 0;
      }

      if (!wasVisible) {
        progress.value = withTiming(1, {
          duration: 160,
          easing: motion.easing.standard,
        });
      }
      return;
    }

    if (!rendered) {
      unregisterOverlay(`bottom-modal-hidden:${overlayLabel}`);
      return;
    }

    const dismissToken = dismissTokenRef.current + 1;
    dismissTokenRef.current = dismissToken;
    clearDismissFallback();
    progress.value = withTiming(0, {
      duration: 120,
      easing: motion.easing.exit,
    }, (finished) => {
      if (finished) {
        runOnJS(finishDismiss)(dismissToken);
      }
    });

    dismissFallbackRef.current = setTimeout(() => {
      finishDismiss(dismissToken);
    }, 180);
  }, [clearDismissFallback, finishDismiss, overlayLabel, progress, rendered, unregisterOverlay, visible]);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [CLOSED_TRANSLATE_Y, 0]) },
    ],
  }));

  if (!rendered) {
    return null;
  }

  const screenHeight = Dimensions.get("screen").height;
  const androidSystemBarDelta =
    Platform.OS === "android" && navigationBarTranslucent
      ? Math.max(0, screenHeight - windowHeight)
      : 0;
  const bottomInsetFillHeight = bottomInsetBackgroundColor
    ? Math.ceil(Math.max(
        insets.bottom,
        Math.min(androidSystemBarDelta, 240),
        Platform.OS === "android" ? ANDROID_NAVIGATION_AREA_FALLBACK : 0,
      ))
    : 0;

  const content = (
    <View pointerEvents="box-none" style={styles.contentHost}>
      {bottomInsetFillHeight > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.bottomInsetUnderlay,
            {
              backgroundColor: bottomInsetBackgroundColor,
              height: bottomInsetFillHeight,
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.sheetHost,
          bottomInsetFillHeight > 0 ? { marginBottom: -bottomInsetFillHeight } : null,
          contentContainerStyle,
          sheetAnimatedStyle,
        ]}
      >
        {children}
        {bottomInsetFillHeight > 0 ? (
          <View
            pointerEvents="none"
            style={[
              styles.bottomInsetFill,
              {
                backgroundColor: bottomInsetBackgroundColor,
                height: bottomInsetFillHeight,
              },
            ]}
          />
        ) : null}
      </Animated.View>
    </View>
  );

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent={statusBarTranslucent}
      navigationBarTranslucent={navigationBarTranslucent}
      presentationStyle="overFullScreen"
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: backdropColor },
            backdropAnimatedStyle,
          ]}
        />
        {closeOnBackdropPress ? (
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        ) : null}
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
            key={keyboardAvoidingResetKey}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={keyboardVerticalOffset}
            pointerEvents="box-none"
            style={styles.keyboardHost}
          >
            {content}
          </KeyboardAvoidingView>
        ) : (
          content
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    zIndex: 20000,
    elevation: 20000,
  },
  keyboardHost: {
    flex: 1,
  },
  contentHost: {
    flex: 1,
    justifyContent: "flex-end",
  },
  bottomInsetUnderlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetHost: {
    width: "100%",
  },
  bottomInsetFill: {
    width: "100%",
  },
});
