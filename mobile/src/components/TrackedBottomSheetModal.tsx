import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useBottomOverlayRegistration } from "../context/BottomOverlayContext";
import { logLoadTime } from "../utils/loadTimeLogger";

let nextTrackedBottomSheetDebugId = 0;
const TRACKED_BOTTOM_SHEET_DEBUG_LOGS = __DEV__;

const createTrackedBottomSheetDebugId = () => {
  nextTrackedBottomSheetDebugId += 1;
  return `tracked-bottom-sheet-${nextTrackedBottomSheetDebugId}`;
};

const logTrackedBottomSheetDebug = (
  sheetId: string,
  event: string,
  payload: Record<string, unknown>,
) => {
  if (TRACKED_BOTTOM_SHEET_DEBUG_LOGS) {
  }
};

type TrackedBottomSheetModalProps = BottomSheetModalProps & {
  overlayLabel?: string;
  overlayReleaseFallbackMs?: number;
};

const DEFAULT_OVERLAY_RELEASE_FALLBACK_MS = 500;

const TrackedBottomSheetModal = forwardRef<BottomSheetModal, TrackedBottomSheetModalProps>(
  function TrackedBottomSheetModal({
    onAnimate,
    onChange,
    onDismiss,
    overlayLabel = "TrackedBottomSheetModal",
    overlayReleaseFallbackMs = DEFAULT_OVERLAY_RELEASE_FALLBACK_MS,
    ...props
  }, ref) {
    const modalRef = useRef<BottomSheetModal>(null);
    const isClosingRef = useRef(false);
    const isOpenCommandedRef = useRef(false);
    const lifecycleTokenRef = useRef(0);
    const releaseFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debugSheetIdRef = useRef(createTrackedBottomSheetDebugId());
    const debugSheetId = debugSheetIdRef.current;
    const presentRequestedAtRef = useRef<number | null>(null);
    const { registerOverlay, unregisterOverlay } = useBottomOverlayRegistration(overlayLabel);

    const clearReleaseFallback = useCallback(() => {
      if (!releaseFallbackRef.current) {
        return;
      }

      clearTimeout(releaseFallbackRef.current);
      releaseFallbackRef.current = null;
    }, []);

    const markOverlayOpen = useCallback((source: string) => {
      lifecycleTokenRef.current += 1;
      clearReleaseFallback();
      isClosingRef.current = false;
      isOpenCommandedRef.current = true;
      logTrackedBottomSheetDebug(debugSheetId, "overlay:open", {
        label: overlayLabel,
        source,
        token: lifecycleTokenRef.current,
      });
      registerOverlay();
    }, [clearReleaseFallback, debugSheetId, overlayLabel, registerOverlay]);

    const releaseOverlay = useCallback((source: string) => {
      lifecycleTokenRef.current += 1;
      clearReleaseFallback();
      isClosingRef.current = false;
      isOpenCommandedRef.current = false;
      logTrackedBottomSheetDebug(debugSheetId, "overlay:release", {
        label: overlayLabel,
        source,
        token: lifecycleTokenRef.current,
      });
      unregisterOverlay(`bottom-sheet:${overlayLabel}:${source}`);
    }, [clearReleaseFallback, debugSheetId, overlayLabel, unregisterOverlay]);

    const scheduleOverlayReleaseFallback = useCallback((source: string) => {
      clearReleaseFallback();
      const scheduledToken = lifecycleTokenRef.current;

      releaseFallbackRef.current = setTimeout(() => {
        releaseFallbackRef.current = null;

        if (lifecycleTokenRef.current !== scheduledToken || !isClosingRef.current) {
          return;
        }

        releaseOverlay(`fallback:${source}`);
      }, overlayReleaseFallbackMs);
    }, [clearReleaseFallback, overlayReleaseFallbackMs, releaseOverlay]);

    const markOverlayClosing = useCallback((source: string) => {
      isClosingRef.current = true;
      isOpenCommandedRef.current = false;
      logTrackedBottomSheetDebug(debugSheetId, "overlay:closing", {
        label: overlayLabel,
        source,
        token: lifecycleTokenRef.current,
      });
      scheduleOverlayReleaseFallback(source);
    }, [debugSheetId, overlayLabel, scheduleOverlayReleaseFallback]);

    useEffect(() => {
      return () => {
        clearReleaseFallback();
      };
    }, [clearReleaseFallback]);

    useImperativeHandle(ref, () => ({
      present: (...args: any[]) => {
        presentRequestedAtRef.current = Date.now();
        logTrackedBottomSheetDebug(debugSheetId, "present", {
          argsLength: args.length,
        });
        markOverlayOpen("present");
        modalRef.current?.present(...args);
      },
      dismiss: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "dismiss", {
          argsLength: args.length,
        });
        markOverlayClosing("dismiss");
        modalRef.current?.dismiss(...args);
      },
      close: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "close", {
          argsLength: args.length,
        });
        markOverlayClosing("close");
        (modalRef.current as any)?.close?.(...args);
      },
      forceClose: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "forceClose", {
          argsLength: args.length,
        });
        markOverlayClosing("forceClose");
        (modalRef.current as any)?.forceClose?.(...args);
      },
      expand: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "expand", {
          argsLength: args.length,
        });
        markOverlayOpen("expand");
        (modalRef.current as any)?.expand?.(...args);
      },
      collapse: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "collapse", {
          argsLength: args.length,
        });
        markOverlayOpen("collapse");
        (modalRef.current as any)?.collapse?.(...args);
      },
      snapToIndex: (...args: any[]) => {
        const [index] = args;
        logTrackedBottomSheetDebug(debugSheetId, "snapToIndex", {
          argsLength: args.length,
          index: typeof index === "number" ? index : null,
        });
        if (typeof index === "number" && index >= 0) {
          markOverlayOpen(`snapToIndex:${index}`);
        } else if (typeof index === "number" && index < 0) {
          markOverlayClosing(`snapToIndex:${index}`);
        }
        (modalRef.current as any)?.snapToIndex?.(...args);
      },
      snapToPosition: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "snapToPosition", {
          argsLength: args.length,
        });
        markOverlayOpen("snapToPosition");
        (modalRef.current as any)?.snapToPosition?.(...args);
      },
      minimize: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "minimize", {
          argsLength: args.length,
        });
        markOverlayOpen("minimize");
        (modalRef.current as any)?.minimize?.(...args);
      },
      restore: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "restore", {
          argsLength: args.length,
        });
        markOverlayOpen("restore");
        (modalRef.current as any)?.restore?.(...args);
      },
    }) as BottomSheetModal, [debugSheetId, markOverlayClosing, markOverlayOpen]);

    const handleAnimate = useCallback((
      fromIndex: number,
      toIndex: number,
      fromPosition: number,
      toPosition: number,
    ) => {
      logTrackedBottomSheetDebug(debugSheetId, "onAnimate", {
        fromIndex,
        toIndex,
        fromPosition,
        toPosition,
      });
      if (typeof toIndex === "number" && toIndex >= 0) {
        if (!isClosingRef.current && isOpenCommandedRef.current) {
          markOverlayOpen(`animate:${toIndex}`);
        } else if (isClosingRef.current) {
          logTrackedBottomSheetDebug(debugSheetId, "onAnimate:ignoreWhileClosing", {
            toIndex,
          });
        } else {
          logTrackedBottomSheetDebug(debugSheetId, "onAnimate:ignoreUnexpectedOpen", {
            toIndex,
          });
        }
      } else if (typeof toIndex === "number" && toIndex < 0) {
        markOverlayClosing(`animate:${toIndex}`);
      }
      onAnimate?.(fromIndex, toIndex, fromPosition, toPosition);
    }, [debugSheetId, markOverlayClosing, markOverlayOpen, onAnimate]);

    const handleChange = useCallback((index: number, position: number, type: number) => {
      logTrackedBottomSheetDebug(debugSheetId, "onChange", {
        index,
        position,
        type,
      });
      if (typeof index === "number" && index >= 0) {
        const requestedAt = presentRequestedAtRef.current;
        if (requestedAt !== null) {
          logLoadTime("Modal", "sheet-visible", {
            durationMs: Date.now() - requestedAt,
            overlayLabel,
          });
          presentRequestedAtRef.current = null;
        }
        if (!isClosingRef.current && isOpenCommandedRef.current) {
          markOverlayOpen(`change:${index}`);
        } else if (isClosingRef.current) {
          logTrackedBottomSheetDebug(debugSheetId, "onChange:ignoreWhileClosing", {
            index,
            type,
          });
        } else {
          logTrackedBottomSheetDebug(debugSheetId, "onChange:ignoreUnexpectedOpen", {
            index,
            type,
          });
        }
      } else if (typeof index === "number" && index < 0) {
        markOverlayClosing(`change:${index}`);
      }
      onChange?.(index, position, type);
    }, [debugSheetId, markOverlayClosing, markOverlayOpen, onChange, overlayLabel]);

    const handleDismiss = useCallback(() => {
      logTrackedBottomSheetDebug(debugSheetId, "onDismiss", {});
      releaseOverlay("dismiss");
      onDismiss?.();
    }, [debugSheetId, onDismiss, releaseOverlay]);

    return (
      <BottomSheetModal
        ref={modalRef}
        {...props}
        onAnimate={handleAnimate}
        onChange={handleChange}
        onDismiss={handleDismiss}
      />
    );
  },
);

export default TrackedBottomSheetModal;
