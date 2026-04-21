import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NAVBAR_BOTTOM_OFFSET, NAVBAR_CLEARANCE, NAVBAR_HEIGHT } from '../components/navbar';
import {
  RADIO_MINI_PLAYER_HEIGHT,
  RADIO_MINI_PLAYER_STACK_GAP,
  useRadioPlayerPresence,
} from '../context/RadioPlayerContext';

export function useBottomBarClearance(extraPadding = 0) {
  const insets = useSafeAreaInsets();
  const { activeStation } = useRadioPlayerPresence();

  return useMemo(() => {
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
  }, [activeStation, extraPadding, insets.bottom]);
}