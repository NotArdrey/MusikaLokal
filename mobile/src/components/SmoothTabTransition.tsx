import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion } from "../utils/motion";

type SmoothTabTransitionProps = {
  activeKey: string | number;
  activeIndex?: number;
  children: React.ReactNode;
  renderOutgoing?: boolean;
  slideDistance?: number;
  style?: StyleProp<ViewStyle>;
};

const SmoothTabTransition = ({
  activeKey,
  activeIndex,
  children,
  renderOutgoing = false,
  slideDistance = 24,
  style,
}: SmoothTabTransitionProps) => {
  const progress = useSharedValue(1);
  const direction = useSharedValue(0);
  const resolvedSlideDistance = Math.max(0, slideDistance);
  const reduceMotionRef = useRef(false);
  const previousKeyRef = useRef(activeKey);
  const previousIndexRef = useRef(activeIndex);
  const currentChildrenRef = useRef(children);
  const [currentChildren, setCurrentChildren] = useState(children);
  const [previousChildren, setPreviousChildren] = useState<React.ReactNode>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const finishTransition = useCallback(() => {
    setPreviousChildren(null);
    setIsTransitioning(false);
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      reduceMotionRef.current = enabled;
    });
  }, []);

  useLayoutEffect(() => {
    if (reduceMotionRef.current) {
      previousKeyRef.current = activeKey;
      previousIndexRef.current = activeIndex;
      currentChildrenRef.current = children;
      if (renderOutgoing) {
        setCurrentChildren(children);
        finishTransition();
      }
      progress.value = 1;
      return;
    }

    if (previousKeyRef.current === activeKey) {
      previousIndexRef.current = activeIndex;
      currentChildrenRef.current = children;
      if (renderOutgoing) {
        setCurrentChildren(children);
      }
      return;
    }

    const previousIndex = previousIndexRef.current;
    if (typeof previousIndex === "number" && typeof activeIndex === "number") {
      direction.value = activeIndex > previousIndex ? 1 : activeIndex < previousIndex ? -1 : 0;
    } else if (typeof previousKeyRef.current === "number" && typeof activeKey === "number") {
      direction.value = activeKey > previousKeyRef.current ? 1 : activeKey < previousKeyRef.current ? -1 : 0;
    } else {
      direction.value = 1;
    }

    previousKeyRef.current = activeKey;
    previousIndexRef.current = activeIndex;
    setPreviousChildren(renderOutgoing ? currentChildrenRef.current : null);
    currentChildrenRef.current = children;
    if (renderOutgoing) {
      setCurrentChildren(children);
      setIsTransitioning(true);
    }
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = withTiming(1, motion.timing.tab, (finished) => {
      if (finished && renderOutgoing) {
        runOnJS(finishTransition)();
      }
    });
  }, [activeIndex, activeKey, children, direction, finishTransition, progress, renderOutgoing]);

  const incomingStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [direction.value * resolvedSlideDistance, 0]) },
    ],
  }));

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0.94]),
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [0, -direction.value * (resolvedSlideDistance * 0.5)]) },
    ],
  }));

  return (
    <Animated.View style={[style, styles.container]}>
      {renderOutgoing && isTransitioning && previousChildren ? (
        <Animated.View pointerEvents="none" style={[outgoingStyle, styles.outgoing]}>
          {previousChildren}
        </Animated.View>
      ) : null}
      <Animated.View style={incomingStyle}>
        {renderOutgoing ? currentChildren : children}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  outgoing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});

export default SmoothTabTransition;
