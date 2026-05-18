import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVBAR_BOTTOM_OFFSET, NAVBAR_CLEARANCE, NAVBAR_HEIGHT } from '../components/navbar';
import {
  RADIO_MINI_PLAYER_HEIGHT,
  RADIO_MINI_PLAYER_STACK_GAP,
  useRadioPlayerPresence,
} from '../context/RadioPlayerContext';
import { useAuth } from '../context/AuthContext';

export function useBottomBarClearance(extraPadding = 0) {
  const insets = useSafeAreaInsets();
  const { activeStation } = useRadioPlayerPresence();
  const { isGuest } = useAuth();

  return useMemo(() => {
    if (isGuest) {
      return {
        bottomBarClearance: insets.bottom,
        contentBottomPadding: insets.bottom + extraPadding,
        hasActiveRadio: false,
      };
    }

    const radioPlayerBottom =
      NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + RADIO_MINI_PLAYER_STACK_GAP + insets.bottom;
    const bottomBarClearance = activeStation
      ? radioPlayerBottom + RADIO_MINI_PLAYER_HEIGHT
      : NAVBAR_CLEARANCE + insets.bottom;

    return {
      bottomBarClearance,
      contentBottomPadding: bottomBarClearance + extraPadding,
      hasActiveRadio: Boolean(activeStation),
    };
  }, [activeStation, extraPadding, insets.bottom, isGuest]);
}
