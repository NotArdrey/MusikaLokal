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

// Web port of mobile/src/context/BottomOverlayContext.tsx with an identical
// public API so shared components that import the hooks compile unchanged.
// Desktop web has no bottom navbar to coordinate; the visible side-effects
// are inert but the registration bookkeeping and shared-value progress are
// preserved for components that observe them.

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

  const syncOverlayState = useCallback(() => {
    const activeOverlays = activeOverlaysRef.current;
    const hasOverlay = activeOverlays.size > 0;
    const labels = getActiveOverlayLabels(activeOverlays);
    lastOverlaySnapshotRef.current = { active: hasOverlay, labels };
    setActiveBottomOverlayCount(activeOverlays.size);
    setActiveBottomOverlayLabels(labels);
    setIsBottomOverlayActive(hasOverlay);
    cancelAnimation(bottomOverlayProgress);
    bottomOverlayProgress.value = hasOverlay
      ? withSpring(1, motion.spring.bottomSheet)
      : withTiming(0, {
          duration: BOTTOM_OVERLAY_EXIT_DURATION_MS,
          easing: motion.easing.exit,
        });
  }, [bottomOverlayProgress]);

  const reportLingeringBottomOverlays = useCallback(() => {
    clearLingeringReportTimer();
    lingeringReportTimerRef.current = setTimeout(() => {
      lingeringReportTimerRef.current = null;
      // No-op on web; mobile uses this to warn about navbar-hide leaks.
    }, BOTTOM_OVERLAY_LINGERING_REPORT_MS);
  }, [clearLingeringReportTimer]);

  const registerBottomOverlay = useCallback(
    (overlayId: BottomOverlayId, label?: string) => {
      const activeOverlays = activeOverlaysRef.current;
      const previousActiveCount = activeOverlays.size;
      const nextLabel = normalizeOverlayLabel(label || overlayId.description);
      const previousLabel = activeOverlays.get(overlayId);
      if (previousLabel === nextLabel) return;
      activeOverlays.set(overlayId, nextLabel);
      clearLingeringReportTimer();
      if (previousActiveCount === 0 || previousLabel !== nextLabel) {
        syncOverlayState();
      }
    },
    [clearLingeringReportTimer, syncOverlayState],
  );

  const unregisterBottomOverlay = useCallback(
    (overlayId: BottomOverlayId) => {
      const activeOverlays = activeOverlaysRef.current;
      const previousActiveCount = activeOverlays.size;
      if (!activeOverlays.delete(overlayId)) return;
      if (previousActiveCount !== activeOverlays.size) {
        syncOverlayState();
      }
      reportLingeringBottomOverlays();
    },
    [reportLingeringBottomOverlays, syncOverlayState],
  );

  const clearBottomOverlays = useCallback(() => {
    const activeOverlays = activeOverlaysRef.current;
    clearLingeringReportTimer();
    activeOverlays.clear();
    lastOverlaySnapshotRef.current = { active: false, labels: [] };
    cancelAnimation(bottomOverlayProgress);
    bottomOverlayProgress.value = 0;
    setActiveBottomOverlayCount(0);
    setActiveBottomOverlayLabels([]);
    setIsBottomOverlayActive(false);
    setOverlayResetSignal((currentSignal) => currentSignal + 1);
  }, [bottomOverlayProgress, clearLingeringReportTimer]);

  useEffect(() => {
    if (isBottomOverlayActive) return undefined;
    const settleTimer = setTimeout(() => {
      if (activeOverlaysRef.current.size > 0) return;
      const currentValue = bottomOverlayProgress.value;
      if (currentValue <= 0.001) return;
      cancelAnimation(bottomOverlayProgress);
      bottomOverlayProgress.value = 0;
    }, BOTTOM_OVERLAY_ANIMATION_SETTLE_MS);
    return () => clearTimeout(settleTimer);
  }, [bottomOverlayProgress, isBottomOverlayActive]);

  useEffect(() => clearLingeringReportTimer, [clearLingeringReportTimer]);

  const value = useMemo<BottomOverlayContextValue>(
    () => ({
      activeBottomOverlayCount,
      activeBottomOverlayLabels,
      bottomOverlayProgress,
      clearBottomOverlays,
      isBottomOverlayActive,
      overlayResetSignal,
      registerBottomOverlay,
      reportLingeringBottomOverlays,
      unregisterBottomOverlay,
    }),
    [
      activeBottomOverlayCount,
      activeBottomOverlayLabels,
      bottomOverlayProgress,
      clearBottomOverlays,
      isBottomOverlayActive,
      overlayResetSignal,
      registerBottomOverlay,
      reportLingeringBottomOverlays,
      unregisterBottomOverlay,
    ],
  );

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
    if (resetSignalRef.current === overlayResetSignal) return;
    resetSignalRef.current = overlayResetSignal;
    isRegisteredRef.current = false;
  }, [overlayResetSignal]);

  useEffect(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId) return undefined;
    return () => {
      if (isRegisteredRef.current) {
        isRegisteredRef.current = false;
        unregisterBottomOverlay(overlayId);
      }
    };
  }, [unregisterBottomOverlay]);

  const registerOverlay = useCallback(() => {
    const overlayId = overlayIdRef.current;
    if (!overlayId) return;
    const nextLabel = labelRef.current;
    if (isRegisteredRef.current) {
      registerBottomOverlay(overlayId, nextLabel);
      return;
    }
    isRegisteredRef.current = true;
    registerBottomOverlay(overlayId, nextLabel);
  }, [registerBottomOverlay]);

  const unregisterOverlay = useCallback(
    (source?: string) => {
      const overlayId = overlayIdRef.current;
      if (!overlayId || !isRegisteredRef.current) return;
      isRegisteredRef.current = false;
      unregisterBottomOverlay(overlayId);
      reportLingeringBottomOverlays(source || `hook:${labelRef.current}`);
    },
    [reportLingeringBottomOverlays, unregisterBottomOverlay],
  );

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
      return () => unregisterOverlay(`visibility-cleanup:${normalizeOverlayLabel(label)}`);
    }
    unregisterOverlay(`visibility-hidden:${normalizeOverlayLabel(label)}`);
    return undefined;
  }, [label, registerOverlay, unregisterOverlay, visible]);
}
