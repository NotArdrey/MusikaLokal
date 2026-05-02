import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

type BottomModalProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropColor?: string;
  closeOnBackdropPress?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  navigationBarTranslucent?: boolean;
  statusBarTranslucent?: boolean;
};

const OPEN_TRANSLATE_Y = 0;
const CLOSED_TRANSLATE_Y = 48;
const ANIMATION_DURATION = 220;

export default function BottomModal({
  visible,
  onClose,
  children,
  backdropColor = "rgba(0,0,0,0.5)",
  closeOnBackdropPress = false,
  contentContainerStyle,
  keyboardAvoiding = false,
  keyboardVerticalOffset = 0,
  navigationBarTranslucent = true,
  statusBarTranslucent = true,
}: BottomModalProps) {
  const [rendered, setRendered] = useState(visible);
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const sheetTranslateY = useRef(
    new Animated.Value(visible ? OPEN_TRANSLATE_Y : CLOSED_TRANSLATE_Y),
  ).current;

  useEffect(() => {
    if (visible) {
      backdropOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(CLOSED_TRANSLATE_Y);
      setRendered(true);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(sheetTranslateY, {
            toValue: OPEN_TRANSLATE_Y,
            duration: ANIMATION_DURATION,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start();
      });
      return;
    }

    if (!rendered) {
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: CLOSED_TRANSLATE_Y,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setRendered(false);
      }
    });
  }, [backdropOpacity, rendered, sheetTranslateY, visible]);

  if (!rendered) {
    return null;
  }

  const content = (
    <View pointerEvents="box-none" style={styles.contentHost}>
      <Animated.View
        style={[
          styles.sheetHost,
          contentContainerStyle,
          { transform: [{ translateY: sheetTranslateY }] },
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
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: backdropColor, opacity: backdropOpacity },
          ]}
        />
        {closeOnBackdropPress ? (
          <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        ) : null}
        {keyboardAvoiding ? (
          <KeyboardAvoidingView
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
