import { Easing } from "react-native-reanimated";

// Mirror of mobile/src/utils/motion.ts. Keep in lockstep with mobile.
export const motion = {
  easing: {
    standard: Easing.bezier(0.2, 0, 0, 1),
    emphasized: Easing.bezier(0.2, 0, 0, 1),
    exit: Easing.bezier(0.4, 0, 1, 1),
  },
  spring: {
    overlay: {
      damping: 30,
      stiffness: 180,
      mass: 0.85,
      overshootClamping: true,
      restDisplacementThreshold: 0.01,
      restSpeedThreshold: 0.01,
    },
    bottomSheet: {
      damping: 32,
      stiffness: 190,
      mass: 0.9,
      overshootClamping: true,
      restDisplacementThreshold: 0.01,
      restSpeedThreshold: 0.01,
    },
    press: {
      damping: 18,
      stiffness: 280,
      mass: 0.7,
      overshootClamping: false,
    },
    tab: {
      damping: 28,
      stiffness: 190,
      mass: 0.82,
      overshootClamping: true,
      restDisplacementThreshold: 0.01,
      restSpeedThreshold: 0.01,
    },
  },
  timing: {
    fadeIn: {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    },
    fadeOut: {
      duration: 140,
      easing: Easing.in(Easing.cubic),
    },
    tab: {
      duration: 220,
      easing: Easing.bezier(0.2, 0, 0, 1),
    },
  },
};

export const bottomSheetSpringConfig = motion.spring.bottomSheet;
