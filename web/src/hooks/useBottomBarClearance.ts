import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NAVBAR_CLEARANCE } from "../components/navbar";
import { useAuth } from "../context/AuthContext";

export const useBottomBarClearance = (extraPadding = 16) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isGuest } = useAuth();

  return useMemo(() => {
    const isWebDesktop = Platform.OS === "web" && width >= 768;
    const baseClearance = isGuest || isWebDesktop ? 0 : NAVBAR_CLEARANCE;
    const clearance = baseClearance + insets.bottom;

    return {
      clearance,
      contentBottomPadding: clearance + extraPadding,
      hasActiveRadio: false,
    };
  }, [extraPadding, insets.bottom, isGuest, width]);
};
