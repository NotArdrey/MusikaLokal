import { BottomSheetModal, type BottomSheetModalProps } from "@gorhom/bottom-sheet";
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from "react";
import { useBottomOverlayRegistration } from "../context/BottomOverlayContext";

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
    console.log(`[TrackedBottomSheetModal:${sheetId}]`, event, payload);
  }
};

const TrackedBottomSheetModal = forwardRef<BottomSheetModal, BottomSheetModalProps>(
  function TrackedBottomSheetModal({ onAnimate, onChange, onDismiss, ...props }, ref) {
    const modalRef = useRef<BottomSheetModal>(null);
    const isClosingRef = useRef(false);
    const isOpenCommandedRef = useRef(false);
    const debugSheetIdRef = useRef(createTrackedBottomSheetDebugId());
    const debugSheetId = debugSheetIdRef.current;
    const { registerOverlay, unregisterOverlay } = useBottomOverlayRegistration();

    useImperativeHandle(ref, () => ({
      present: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "present", {
          argsLength: args.length,
        });
        isClosingRef.current = false;
        isOpenCommandedRef.current = true;
        registerOverlay();
        modalRef.current?.present(...args);
      },
      dismiss: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "dismiss", {
          argsLength: args.length,
        });
        isClosingRef.current = true;
        isOpenCommandedRef.current = false;
        unregisterOverlay();
        modalRef.current?.dismiss(...args);
      },
      close: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "close", {
          argsLength: args.length,
        });
        isClosingRef.current = true;
        isOpenCommandedRef.current = false;
        unregisterOverlay();
        (modalRef.current as any)?.close?.(...args);
      },
      forceClose: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "forceClose", {
          argsLength: args.length,
        });
        isClosingRef.current = true;
        isOpenCommandedRef.current = false;
        unregisterOverlay();
        (modalRef.current as any)?.forceClose?.(...args);
      },
      expand: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "expand", {
          argsLength: args.length,
        });
        isClosingRef.current = false;
        isOpenCommandedRef.current = true;
        registerOverlay();
        (modalRef.current as any)?.expand?.(...args);
      },
      collapse: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "collapse", {
          argsLength: args.length,
        });
        isClosingRef.current = false;
        isOpenCommandedRef.current = true;
        registerOverlay();
        (modalRef.current as any)?.collapse?.(...args);
      },
      snapToIndex: (...args: any[]) => {
        const [index] = args;
        logTrackedBottomSheetDebug(debugSheetId, "snapToIndex", {
          argsLength: args.length,
          index: typeof index === "number" ? index : null,
        });
        if (typeof index === "number" && index >= 0) {
          isClosingRef.current = false;
          isOpenCommandedRef.current = true;
          registerOverlay();
        } else if (typeof index === "number" && index < 0) {
          isClosingRef.current = true;
          isOpenCommandedRef.current = false;
          unregisterOverlay();
        }
        (modalRef.current as any)?.snapToIndex?.(...args);
      },
      snapToPosition: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "snapToPosition", {
          argsLength: args.length,
        });
        isClosingRef.current = false;
        isOpenCommandedRef.current = true;
        registerOverlay();
        (modalRef.current as any)?.snapToPosition?.(...args);
      },
      minimize: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "minimize", {
          argsLength: args.length,
        });
        isClosingRef.current = false;
        isOpenCommandedRef.current = true;
        registerOverlay();
        (modalRef.current as any)?.minimize?.(...args);
      },
      restore: (...args: any[]) => {
        logTrackedBottomSheetDebug(debugSheetId, "restore", {
          argsLength: args.length,
        });
        isClosingRef.current = false;
        isOpenCommandedRef.current = true;
        registerOverlay();
        (modalRef.current as any)?.restore?.(...args);
      },
    }) as BottomSheetModal, [debugSheetId, registerOverlay, unregisterOverlay]);

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
        if (isClosingRef.current) {
          logTrackedBottomSheetDebug(debugSheetId, "onAnimate:ignoreWhileClosing", {
            toIndex,
          });
          return;
        }

        if (!isOpenCommandedRef.current) {
          logTrackedBottomSheetDebug(debugSheetId, "onAnimate:ignoreUnexpectedOpen", {
            toIndex,
          });
          return;
        }

        registerOverlay();
      } else if (typeof toIndex === "number" && toIndex < 0) {
        isClosingRef.current = true;
        isOpenCommandedRef.current = false;
        unregisterOverlay();
      }
      onAnimate?.(fromIndex, toIndex, fromPosition, toPosition);
    }, [debugSheetId, onAnimate, registerOverlay, unregisterOverlay]);

    const handleChange = useCallback((index: number, position: number, type: number) => {
      logTrackedBottomSheetDebug(debugSheetId, "onChange", {
        index,
        position,
        type,
      });
      if (typeof index === "number" && index >= 0) {
        if (isClosingRef.current) {
          logTrackedBottomSheetDebug(debugSheetId, "onChange:ignoreWhileClosing", {
            index,
            type,
          });
          return;
        }

        if (!isOpenCommandedRef.current) {
          logTrackedBottomSheetDebug(debugSheetId, "onChange:ignoreUnexpectedOpen", {
            index,
            type,
          });
          return;
        }

        registerOverlay();
      } else if (typeof index === "number" && index < 0) {
        isClosingRef.current = true;
        isOpenCommandedRef.current = false;
        unregisterOverlay();
      }
      onChange?.(index, position, type);
    }, [debugSheetId, onChange, registerOverlay, unregisterOverlay]);

    const handleDismiss = useCallback(() => {
      logTrackedBottomSheetDebug(debugSheetId, "onDismiss", {});
      isClosingRef.current = false;
      isOpenCommandedRef.current = false;
      unregisterOverlay();
      onDismiss?.();
    }, [debugSheetId, onDismiss, unregisterOverlay]);

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