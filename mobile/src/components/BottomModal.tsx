import React, { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useBottomOverlayRegistration } from "../context/BottomOverlayContext";
import { motion } from "../utils/motion";

type BottomModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropColor?: string;
  closeOnBackdropPress?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  keyboardAvoidingResetKey?: React.Key;
  keyboardVerticalOffset?: number;
  navigationBarTranslucent?: boolean;
  overlayLabel?: string;
  statusBarTranslucent?: boolean;
};

const CLOSED_TRANSLATE_Y = 54;

export default function BottomModal({
  visible,
  onClose,
  children,
  backdropColor = "rgba(0,0,0,0.5)",
  closeOnBackdropPress = false,
  contentContainerStyle,
  keyboardAvoiding = false,
  keyboardAvoidingResetKey,
  keyboardVerticalOffset = 0,
  navigationBarTranslucent = true,
  overlayLabel = "BottomModal",
  statusBarTranslucent = true,
}: BottomModalProps) {
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const dismissFallbackRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTokenRef = React.useRef(0);
  const wasVisibleRef = React.useRef(visible);
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
      dismissTokenRef.current += 1;
      clearDismissFallback();
      registerOverlay();
    }
  }, [clearDismissFallback, registerOverlay, visible]);

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
          duration: 240,
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
      duration: 200,
      easing: motion.easing.exit,
    }, (finished) => {
      if (finished) {
        runOnJS(finishDismiss)(dismissToken);
      }
    });

    dismissFallbackRef.current = setTimeout(() => {
      finishDismiss(dismissToken);
    }, 260);
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

  const content = (
    <View pointerEvents="box-none" style={styles.contentHost}>
      <Animated.View
        style={[
          styles.sheetHost,
          contentContainerStyle,
          sheetAnimatedStyle,
        ]}
      >
        {children}
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
  sheetHost: {
    width: "100%",
  },
});
