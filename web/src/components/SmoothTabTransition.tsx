import React, { useLayoutEffect, useRef } from "react";
import {
  Animated,
  Easing,
  StyleProp,
  ViewStyle,
} from "react-native";

type SmoothTabTransitionProps = {
  activeKey: string | number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

const SmoothTabTransition = ({
  activeKey,
  children,
  style,
}: SmoothTabTransitionProps) => {
  const translateX = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    translateX.stopAnimation();
    translateX.setValue(18);

    Animated.timing(translateX, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeKey, translateX]);

  return (
    <Animated.View
      style={[
        style,
        {
          transform: [{ translateX }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

export default SmoothTabTransition;
