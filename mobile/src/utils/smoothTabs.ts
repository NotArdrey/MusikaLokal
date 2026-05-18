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
