import { startTransition, useEffect, useState } from "react";
import { InteractionManager } from "react-native";
import type { Dispatch, SetStateAction } from "react";

type NoInferValue<T> = [T][T extends unknown ? 0 : never];

export const setSmoothTab = <T,>(
  setTab: Dispatch<SetStateAction<T>>,
  nextTab: NoInferValue<T>,
) => {
  setTab(nextTab);
};

export const getSmoothTabIndex = <T,>(
  tabs: readonly T[],
  activeTab: T,
) => {
  const index = tabs.indexOf(activeTab);
  return index < 0 ? 0 : index;
};

export const useStagedTabRows = <T,>(
  rows: readonly T[],
  active: boolean,
  initialCount = 8,
  chunkSize = initialCount,
) => {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(rows.length, initialCount),
  );

  useEffect(() => {
    const initialVisibleCount = Math.min(rows.length, initialCount);

    if (!active || rows.length <= initialCount) {
      setVisibleCount(initialVisibleCount);
      return;
    }

    let cancelled = false;
    let started = false;
    let visibleCountCursor = initialVisibleCount;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setVisibleCount(initialVisibleCount);

    const revealNextChunk = () => {
      if (cancelled) {
        return;
      }

      visibleCountCursor = Math.min(rows.length, visibleCountCursor + chunkSize);
      startTransition(() => {
        setVisibleCount(visibleCountCursor);
      });

      if (visibleCountCursor < rows.length) {
        timer = setTimeout(revealNextChunk, 70);
      }
    };

    const startReveal = () => {
      if (cancelled || started) {
        return;
      }

      started = true;
      timer = setTimeout(revealNextChunk, 80);
    };

    const task = InteractionManager.runAfterInteractions(startReveal);
    const fallback = setTimeout(startReveal, 650);

    return () => {
      cancelled = true;
      task.cancel();
      clearTimeout(fallback);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [active, chunkSize, initialCount, rows.length]);

  return rows.slice(0, Math.min(rows.length, visibleCount));
};
