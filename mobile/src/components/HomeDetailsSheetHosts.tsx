import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import ListingDetailsSheet from "./ListingDetailsSheet";
import ProductionTeamDetailsSheet from "./ProductionTeamDetailsSheet";

type ListingSelection = {
  requestedId: string;
  activeId: string | null;
  initialListing: any | null;
};

type ProductionTeamSelection = {
  requestedId: string;
  activeId: string | null;
};

export type ListingDetailsSheetHostHandle = {
  open: (listingId: string, initialListing?: any | null) => void;
};

export type ProductionTeamDetailsSheetHostHandle = {
  open: (teamId: string) => void;
};

type SheetHostProps = {
  onDismiss?: () => void;
};

const useScheduledPresentation = (
  sheetRef: React.RefObject<BottomSheetModal | null>,
) => {
  const frameRef = useRef<number | null>(null);

  const cancelScheduledPresentation = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const schedulePresentation = useCallback(() => {
    cancelScheduledPresentation();

    // The closed sheet already owns a memoized loading shell, so the native
    // animation can start immediately without waiting for a React commit.
    if (sheetRef.current) {
      sheetRef.current.present();
      return;
    }

    let attempts = 0;

    const presentWhenReady = () => {
      frameRef.current = null;

      if (sheetRef.current) {
        sheetRef.current.present();
        return;
      }

      attempts += 1;
      if (attempts < 6) {
        frameRef.current = requestAnimationFrame(presentWhenReady);
      }
    };

    frameRef.current = requestAnimationFrame(presentWhenReady);
  }, [cancelScheduledPresentation, sheetRef]);

  useEffect(
    () => cancelScheduledPresentation,
    [cancelScheduledPresentation],
  );

  return schedulePresentation;
};

export const ListingDetailsSheetHost = memo(
  forwardRef<ListingDetailsSheetHostHandle, SheetHostProps>(
    function ListingDetailsSheetHost({ onDismiss }, ref) {
      const sheetRef = useRef<BottomSheetModal>(null);
      const [selection, setSelection] = useState<ListingSelection | null>(null);
      const schedulePresentation = useScheduledPresentation(sheetRef);

      const handleOpened = useCallback(() => {
        setSelection((current) =>
          current && !current.activeId
            ? { ...current, activeId: current.requestedId }
            : current,
        );
      }, []);

      useImperativeHandle(
        ref,
        () => ({
          open: (listingId, initialListing = null) => {
            if (!listingId) return;
            setSelection({
              requestedId: listingId,
              activeId: null,
              initialListing,
            });
            schedulePresentation();
          },
        }),
        [schedulePresentation],
      );

      const handleDismiss = useCallback(() => {
        setSelection(null);
        onDismiss?.();
      }, [onDismiss]);

      return (
        <ListingDetailsSheet
          ref={sheetRef}
          initialListing={selection?.activeId ? selection.initialListing : null}
          listingId={selection?.activeId ?? null}
          opening={!selection?.activeId}
          onOpened={handleOpened}
          onDismiss={handleDismiss}
        />
      );
    },
  ),
);

export const ProductionTeamDetailsSheetHost = memo(
  forwardRef<ProductionTeamDetailsSheetHostHandle, SheetHostProps>(
    function ProductionTeamDetailsSheetHost({ onDismiss }, ref) {
      const sheetRef = useRef<BottomSheetModal>(null);
      const [selection, setSelection] =
        useState<ProductionTeamSelection | null>(null);
      const schedulePresentation = useScheduledPresentation(sheetRef);

      const handleOpened = useCallback(() => {
        setSelection((current) =>
          current && !current.activeId
            ? { ...current, activeId: current.requestedId }
            : current,
        );
      }, []);

      useImperativeHandle(
        ref,
        () => ({
          open: (nextTeamId) => {
            if (!nextTeamId) return;
            setSelection({ requestedId: nextTeamId, activeId: null });
            schedulePresentation();
          },
        }),
        [schedulePresentation],
      );

      const handleDismiss = useCallback(() => {
        setSelection(null);
        onDismiss?.();
      }, [onDismiss]);

      return (
        <ProductionTeamDetailsSheet
          ref={sheetRef}
          teamId={selection?.activeId ?? null}
          opening={!selection?.activeId}
          onOpened={handleOpened}
          onDismiss={handleDismiss}
        />
      );
    },
  ),
);
