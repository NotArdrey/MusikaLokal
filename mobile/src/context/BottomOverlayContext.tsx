import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Easing } from "react-native";

type BottomOverlayContextValue = {
  isBottomOverlayActive: boolean;
  bottomOverlayAnimation: Animated.Value;
  overlayEpoch: number;
  registerBottomOverlay: (overlayId: string) => void;
  unregisterBottomOverlay: (overlayId: string) => void;
  clearBottomOverlays: () => void;
};

const BottomOverlayContext = createContext<BottomOverlayContextValue | undefined>(undefined);

let nextOverlayId = 0;
const BOTTOM_OVERLAY_DEBUG_LOGS = __DEV__;
const BOTTOM_OVERLAY_ANIMATION_SETTLE_MS = 320;

const createOverlayId = () => {
  nextOverlayId += 1;
  return `bottom-overlay-${nextOverlayId}`;
};

const logBottomOverlayDebug = (event: string, payload: Record<string, unknown>) => {
  if (BOTTOM_OVERLAY_DEBUG_LOGS) {
  }
};

export function BottomOverlayProvider({ children }: { children: ReactNode }) {
  const [activeOverlayIds, setActiveOverlayIds] = useState<string[]>([]);
  const [overlayEpoch, setOverlayEpoch] = useState(0);
  const bottomOverlayAnimation = useRef(new Animated.Value(0)).current;
  const activeOverlayIdsRef = useRef<string[]>([]);
  const overlayEpochRef = useRef(0);
  const isBottomOverlayActive = activeOverlayIds.length > 0;

  useEffect(() => {
    activeOverlayIdsRef.current = activeOverlayIds;
  }, [activeOverlayIds]);

  useEffect(() => {
    overlayEpochRef.current = overlayEpoch;
  }, [overlayEpoch]);

  const registerBottomOverlay = useCallback((overlayId: string) => {
    setActiveOverlayIds((currentIds) => {
      const nextIds = currentIds.includes(overlayId) ? currentIds : [...currentIds, overlayId];
      logBottomOverlayDebug("register", {
        overlayId,
        currentIds,
        nextIds,
        changed: nextIds !== currentIds,
      });

      return nextIds;
    });
  }, []);

  const unregisterBottomOverlay = useCallback((overlayId: string) => {
    setActiveOverlayIds((currentIds) => {
      if (!currentIds.includes(overlayId)) {
        logBottomOverlayDebug("unregister:noop", {
          overlayId,
          currentIds,
        });
        return currentIds;
      }

      const nextIds = currentIds.filter((currentId) => currentId !== overlayId);
      logBottomOverlayDebug("unregister", {
        overlayId,
        currentIds,
        nextIds,
      });

      return nextIds;
    });
  }, []);

  const clearBottomOverlays = useCallback(() => {
    logBottomOverlayDebug("clearRequested", {
      activeOverlayIds: activeOverlayIdsRef.current,
      overlayEpoch: overlayEpochRef.current,
    });
    bottomOverlayAnimation.stopAnimation();
    bottomOverlayAnimation.setValue(0);
    setActiveOverlayIds((currentIds) => {
      logBottomOverlayDebug("clearApplied", {
        clearedOverlayIds: currentIds,
      });
      return currentIds.length > 0 ? [] : currentIds;
    });
    if (activeOverlayIdsRef.current.length > 0) {
      setOverlayEpoch((currentEpoch) => currentEpoch + 1);
    }
  }, [bottomOverlayAnimation]);

  useEffect(() => {
    const toValue = isBottomOverlayActive ? 1 : 0;
    const duration = isBottomOverlayActive ? 260 : 220;

    logBottomOverlayDebug("animation:start", {
      activeOverlayIds,
      isBottomOverlayActive,
      toValue,
      duration,
    });

    bottomOverlayAnimation.stopAnimation();

    Animated.timing(bottomOverlayAnimation, {
      toValue,
      duration,
      easing: isBottomOverlayActive ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        const hasActiveOverlays = activeOverlayIdsRef.current.length > 0;
        const canSnapToTarget = (toValue === 1 && hasActiveOverlays)
          || (toValue === 0 && !hasActiveOverlays);

        if (canSnapToTarget) {
          bottomOverlayAnimation.setValue(toValue);
          logBottomOverlayDebug("animation:snapToValue", {
            activeOverlayIds: activeOverlayIdsRef.current,
            isBottomOverlayActive: hasActiveOverlays,
            toValue,
          });
        }
      }

      logBottomOverlayDebug("animation:end", {
        activeOverlayIds,
        finished,
        isBottomOverlayActive,
        toValue,
      });
    });
  }, [activeOverlayIds, bottomOverlayAnimation, isBottomOverlayActive]);

  useEffect(() => {
    if (isBottomOverlayActive) {
      return undefined;
    }

    const settleTimer = setTimeout(() => {
      if (activeOverlayIdsRef.current.length > 0) {
        return;
      }

      bottomOverlayAnimation.stopAnimation((value) => {
        if (activeOverlayIdsRef.current.length > 0 || value <= 0.001) {
          return;
        }

        logBottomOverlayDebug("animation:forceReset", {
          activeOverlayIds: activeOverlayIdsRef.current,
          fromValue: Number(value.toFixed(2)),
        });
        bottomOverlayAnimation.setValue(0);
      });
    }, BOTTOM_OVERLAY_ANIMATION_SETTLE_MS);

    return () => {
      clearTimeout(settleTimer);
    };
  }, [bottomOverlayAnimation, isBottomOverlayActive]);

  const value = useMemo<BottomOverlayContextValue>(() => ({
    isBottomOverlayActive,
    bottomOverlayAnimation,
    overlayEpoch,
    registerBottomOverlay,
    unregisterBottomOverlay,
    clearBottomOverlays,
  }), [
    bottomOverlayAnimation,
    clearBottomOverlays,
    isBottomOverlayActive,
    overlayEpoch,
    registerBottomOverlay,
    unregisterBottomOverlay,
  ]);

  return (
    <BottomOverlayContext.Provider value={value}>
      {children}
    </BottomOverlayContext.Provider>
  );
}

export function useBottomOverlay() {
  const context = useContext(BottomOverlayContext);
  if (!context) {
    throw new Error("useBottomOverlay must be used within a BottomOverlayProvider");
  }

  return context;
}

export function useBottomOverlayRegistration() {
  const { overlayEpoch, registerBottomOverlay, unregisterBottomOverlay } = useBottomOverlay();
  const overlayIdRef = useRef<string | undefined>(undefined);
  const isRegisteredRef = useRef(false);

  if (!overlayIdRef.current) {
    overlayIdRef.current = createOverlayId();
  }

  useEffect(() => {
    if (!isRegisteredRef.current) {
      return;
    }

    const overlayId = overlayIdRef.current;
    if (!overlayId) {
      return;
    }

    logBottomOverlayDebug("registration:epochSync", {
      overlayEpoch,
      overlayId,
    });
    registerBottomOverlay(overlayId);
  }, [overlayEpoch, registerBottomOverlay]);

  useEffect(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId) {
      return undefined;
    }

    return () => {
      isRegisteredRef.current = false;
      unregisterBottomOverlay(overlayId);
    };
  }, [unregisterBottomOverlay]);

  const registerOverlay = useCallback(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId || isRegisteredRef.current) {
      return;
    }

    isRegisteredRef.current = true;
    logBottomOverlayDebug("registration:manualRegister", {
      overlayId,
      overlayEpoch,
    });
    registerBottomOverlay(overlayId);
  }, [overlayEpoch, registerBottomOverlay]);

  const unregisterOverlay = useCallback(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId || !isRegisteredRef.current) {
      return;
    }

    isRegisteredRef.current = false;
    logBottomOverlayDebug("registration:manualUnregister", {
      overlayId,
      overlayEpoch,
    });
    unregisterBottomOverlay(overlayId);
  }, [overlayEpoch, unregisterBottomOverlay]);

  return {
    overlayId: overlayIdRef.current,
    registerOverlay,
    unregisterOverlay,
  };
}