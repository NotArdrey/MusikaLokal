import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cancelAnimation,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { motion } from "../utils/motion";

type BottomOverlayContextValue = {
  isBottomOverlayActive: boolean;
  bottomOverlayProgress: SharedValue<number>;
  activeBottomOverlayCount: number;
  activeBottomOverlayLabels: string[];
  overlayResetSignal: number;
  registerBottomOverlay: (overlayId: BottomOverlayId, label?: string) => void;
  unregisterBottomOverlay: (overlayId: BottomOverlayId) => void;
  clearBottomOverlays: () => void;
  reportLingeringBottomOverlays: (source: string) => void;
};

type BottomOverlayId = symbol;

const BottomOverlayContext = createContext<BottomOverlayContextValue | undefined>(undefined);

let nextOverlayId = 0;
const BOTTOM_OVERLAY_DEBUG_LOGS = false;
const BOTTOM_OVERLAY_VISIBILITY_LOGS = __DEV__;
const BOTTOM_OVERLAY_ANIMATION_SETTLE_MS = 320;
const BOTTOM_OVERLAY_EXIT_DURATION_MS = 180;
const BOTTOM_OVERLAY_LINGERING_REPORT_MS = 650;
const DEFAULT_OVERLAY_LABEL = "BottomOverlay";

const createOverlayId = () => {
  nextOverlayId += 1;
  return Symbol(`bottom-overlay-${nextOverlayId}`);
};

const normalizeOverlayLabel = (label?: string) => {
  const normalizedLabel = String(label || "").trim();
  return normalizedLabel || DEFAULT_OVERLAY_LABEL;
};

const getActiveOverlayLabels = (activeOverlays: Map<BottomOverlayId, string>) =>
  Array.from(activeOverlays.values());

const logBottomOverlayDebug = (event: string, payload: Record<string, unknown>) => {
  if (BOTTOM_OVERLAY_DEBUG_LOGS) {
    console.log("[bottom-overlay]", event, payload);
  }
};

const logBottomOverlayVisibility = (event: string, payload: Record<string, unknown>) => {
  if (BOTTOM_OVERLAY_VISIBILITY_LOGS) {
    console.log("[bottom-overlay:navbar]", event, {
      ...payload,
      at: new Date().toISOString(),
    });
  }
};

const warnLingeringBottomOverlays = (
  source: string,
  activeOverlays: Map<BottomOverlayId, string>,
) => {
  if (!__DEV__ || activeOverlays.size === 0) {
    return;
  }

  console.warn("[bottom-overlay] Navbar still hidden after close signal", {
    activeCount: activeOverlays.size,
    labels: getActiveOverlayLabels(activeOverlays),
    source,
  });
};

export function BottomOverlayProvider({ children }: { children: ReactNode }) {
  const [isBottomOverlayActive, setIsBottomOverlayActive] = useState(false);
  const [activeBottomOverlayCount, setActiveBottomOverlayCount] = useState(0);
  const [activeBottomOverlayLabels, setActiveBottomOverlayLabels] = useState<string[]>([]);
  const [overlayResetSignal, setOverlayResetSignal] = useState(0);
  const bottomOverlayProgress = useSharedValue(0);
  const activeOverlaysRef = useRef(new Map<BottomOverlayId, string>());
  const lastOverlaySnapshotRef = useRef({ active: false, labels: [] as string[] });
  const lingeringReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLingeringReportTimer = useCallback(() => {
    if (!lingeringReportTimerRef.current) {
      return;
    }

    clearTimeout(lingeringReportTimerRef.current);
    lingeringReportTimerRef.current = null;
  }, []);

  const syncOverlayState = useCallback((source: string) => {
    const activeOverlays = activeOverlaysRef.current;
    const hasOverlay = activeOverlays.size > 0;
    const labels = getActiveOverlayLabels(activeOverlays);
    const previousSnapshot = lastOverlaySnapshotRef.current;
    const labelsChanged = previousSnapshot.labels.join("|") !== labels.join("|");

    lastOverlaySnapshotRef.current = { active: hasOverlay, labels };
    setActiveBottomOverlayCount(activeOverlays.size);
    setActiveBottomOverlayLabels(labels);
    setIsBottomOverlayActive(hasOverlay);

    if (previousSnapshot.active !== hasOverlay || labelsChanged) {
      logBottomOverlayVisibility(
        hasOverlay ? "hide-requested" : "show-requested",
        {
          activeCount: activeOverlays.size,
          labels,
          previousActive: previousSnapshot.active,
          previousLabels: previousSnapshot.labels,
          source,
        },
      );
    }

    cancelAnimation(bottomOverlayProgress);
    bottomOverlayProgress.value = hasOverlay
      ? withSpring(1, motion.spring.bottomSheet)
      : withTiming(0, {
          duration: BOTTOM_OVERLAY_EXIT_DURATION_MS,
          easing: motion.easing.exit,
        });
  }, [bottomOverlayProgress]);

  const reportLingeringBottomOverlays = useCallback((source: string) => {
    clearLingeringReportTimer();

    lingeringReportTimerRef.current = setTimeout(() => {
      lingeringReportTimerRef.current = null;
      warnLingeringBottomOverlays(source, activeOverlaysRef.current);
    }, BOTTOM_OVERLAY_LINGERING_REPORT_MS);
  }, [clearLingeringReportTimer]);

  const registerBottomOverlay = useCallback((overlayId: BottomOverlayId, label?: string) => {
    const activeOverlays = activeOverlaysRef.current;
    const previousActiveCount = activeOverlays.size;
    const nextLabel = normalizeOverlayLabel(label || overlayId.description);
    const previousLabel = activeOverlays.get(overlayId);

    if (previousLabel === nextLabel) {
      logBottomOverlayDebug("register:noop", {
        activeCount: activeOverlays.size,
        label: nextLabel,
        overlayId: overlayId.description,
      });
      return;
    }

    activeOverlays.set(overlayId, nextLabel);
    clearLingeringReportTimer();

    logBottomOverlayDebug(previousLabel ? "register:update" : "register:add", {
      activeCount: activeOverlays.size,
      label: nextLabel,
      overlayId: overlayId.description,
      previousLabel,
    });

    if (previousActiveCount === 0 || previousLabel !== nextLabel) {
      syncOverlayState(`register:${nextLabel}`);
    }
  }, [clearLingeringReportTimer, syncOverlayState]);

  const unregisterBottomOverlay = useCallback((overlayId: BottomOverlayId) => {
    const activeOverlays = activeOverlaysRef.current;
    const previousActiveCount = activeOverlays.size;
    const previousLabel = activeOverlays.get(overlayId);

    if (!activeOverlays.delete(overlayId)) {
      logBottomOverlayDebug("unregister:noop", {
        activeCount: activeOverlays.size,
        overlayId: overlayId.description,
      });
      return;
    }

    logBottomOverlayDebug("unregister:remove", {
      activeCount: activeOverlays.size,
      label: previousLabel,
      overlayId: overlayId.description,
    });

    if (previousActiveCount !== activeOverlays.size) {
      syncOverlayState(`unregister:${previousLabel || overlayId.description || "unknown"}`);
    }

    reportLingeringBottomOverlays(`unregister:${previousLabel || overlayId.description || "unknown"}`);
  }, [reportLingeringBottomOverlays, syncOverlayState]);

  const clearBottomOverlays = useCallback(() => {
    const activeOverlays = activeOverlaysRef.current;
    const clearedLabels = getActiveOverlayLabels(activeOverlays);

    logBottomOverlayDebug("clear", {
      activeCount: activeOverlays.size,
      labels: clearedLabels,
    });

    clearLingeringReportTimer();
    activeOverlays.clear();
    if (lastOverlaySnapshotRef.current.active || clearedLabels.length > 0) {
      lastOverlaySnapshotRef.current = { active: false, labels: [] };
      logBottomOverlayVisibility("show-requested", {
        activeCount: 0,
        labels: [],
        previousLabels: clearedLabels,
        source: "clearBottomOverlays",
      });
    }
    cancelAnimation(bottomOverlayProgress);
    bottomOverlayProgress.value = 0;
    setActiveBottomOverlayCount(0);
    setActiveBottomOverlayLabels([]);
    setIsBottomOverlayActive(false);
    setOverlayResetSignal((currentSignal) => currentSignal + 1);
  }, [bottomOverlayProgress, clearLingeringReportTimer]);

  useEffect(() => {
    if (isBottomOverlayActive) {
      return undefined;
    }

    const settleTimer = setTimeout(() => {
      if (activeOverlaysRef.current.size > 0) {
        return;
      }

      const currentValue = bottomOverlayProgress.value;
      if (currentValue <= 0.001) {
        return;
      }

      logBottomOverlayDebug("animation:forceReset", {
        activeCount: activeOverlaysRef.current.size,
        fromValue: Number(currentValue.toFixed(2)),
      });
      cancelAnimation(bottomOverlayProgress);
      bottomOverlayProgress.value = 0;
    }, BOTTOM_OVERLAY_ANIMATION_SETTLE_MS);

    return () => {
      clearTimeout(settleTimer);
    };
  }, [bottomOverlayProgress, isBottomOverlayActive]);

  useEffect(() => clearLingeringReportTimer, [clearLingeringReportTimer]);

  const value = useMemo<BottomOverlayContextValue>(() => ({
    activeBottomOverlayCount,
    activeBottomOverlayLabels,
    bottomOverlayProgress,
    clearBottomOverlays,
    isBottomOverlayActive,
    overlayResetSignal,
    registerBottomOverlay,
    reportLingeringBottomOverlays,
    unregisterBottomOverlay,
  }), [
    activeBottomOverlayCount,
    activeBottomOverlayLabels,
    bottomOverlayProgress,
    clearBottomOverlays,
    isBottomOverlayActive,
    overlayResetSignal,
    registerBottomOverlay,
    reportLingeringBottomOverlays,
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

export function useBottomOverlayRegistration(label?: string) {
  const {
    overlayResetSignal,
    registerBottomOverlay,
    reportLingeringBottomOverlays,
    unregisterBottomOverlay,
  } = useBottomOverlay();
  const overlayIdRef = useRef<BottomOverlayId | undefined>(undefined);
  const isRegisteredRef = useRef(false);
  const labelRef = useRef(normalizeOverlayLabel(label));
  const resetSignalRef = useRef(overlayResetSignal);

  labelRef.current = normalizeOverlayLabel(label);

  if (!overlayIdRef.current) {
    overlayIdRef.current = createOverlayId();
  }

  useEffect(() => {
    if (resetSignalRef.current === overlayResetSignal) {
      return;
    }

    resetSignalRef.current = overlayResetSignal;
    isRegisteredRef.current = false;
  }, [overlayResetSignal]);

  useEffect(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId) {
      return undefined;
    }

    return () => {
      if (isRegisteredRef.current) {
        isRegisteredRef.current = false;
        unregisterBottomOverlay(overlayId);
      }
    };
  }, [unregisterBottomOverlay]);

  const registerOverlay = useCallback(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId) {
      return;
    }

    const nextLabel = labelRef.current;
    if (isRegisteredRef.current) {
      registerBottomOverlay(overlayId, nextLabel);
      return;
    }

    isRegisteredRef.current = true;
    registerBottomOverlay(overlayId, nextLabel);
  }, [registerBottomOverlay]);

  const unregisterOverlay = useCallback((source?: string) => {
    const overlayId = overlayIdRef.current;
    if (!overlayId || !isRegisteredRef.current) {
      return;
    }

    const currentLabel = labelRef.current;
    isRegisteredRef.current = false;
    unregisterBottomOverlay(overlayId);
    reportLingeringBottomOverlays(source || `hook:${currentLabel}`);
  }, [reportLingeringBottomOverlays, unregisterBottomOverlay]);

  return {
    overlayId: overlayIdRef.current,
    registerOverlay,
    unregisterOverlay,
  };
}

export function useBottomOverlayVisibility(visible: boolean, label?: string) {
  const { registerOverlay, unregisterOverlay } = useBottomOverlayRegistration(label);

  useLayoutEffect(() => {
    if (visible) {
      registerOverlay();
      return () => {
        unregisterOverlay(`visibility-cleanup:${normalizeOverlayLabel(label)}`);
      };
    }

    unregisterOverlay(`visibility-hidden:${normalizeOverlayLabel(label)}`);
    return undefined;
  }, [label, registerOverlay, unregisterOverlay, visible]);
}
