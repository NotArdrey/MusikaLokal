import { useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAVBAR_CLEARANCE } from "../components/navbar";
import { useAuth } from "../context/AuthContext";

export const useBottomBarClearance = (extraPadding = 16) => {
  const insets = useSafeAreaInsets();
  const { isGuest } = useAuth();

  return useMemo(() => {
    const baseClearance = isGuest ? 0 : NAVBAR_CLEARANCE;
    const clearance = baseClearance + insets.bottom;

    return {
      clearance,
      contentBottomPadding: clearance + extraPadding,
      hasActiveRadio: false,
    };
  }, [extraPadding, insets.bottom, isGuest]);
};
