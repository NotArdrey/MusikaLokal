import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

// Web stub of mobile/src/context/RadioPlayerContext.tsx.
//
// Mobile depends on react-native-track-player and expo-av background audio,
// which are not available in a desktop web shell. This stub mirrors the
// public hook surface 1:1 so any shared component can call `useRadioPlayer`
// without forking, but every action is a safe no-op. A follow-up slice will
// replace internals with an HTMLAudio + MediaSession backend that talks to
// the same `manage-playlists` `get_station_details` Edge Function action.

export const RADIO_MINI_PLAYER_HEIGHT = 60;
export const RADIO_MINI_PLAYER_STACK_GAP = 8;

type RadioPlayerContextValue = {
  activeStation: any | null;
  currentTrack: any | null;
  isPlaying: boolean;
  isMuted: boolean;
  isAutoplayEnabled: boolean;
  currentSlotIndex: number;
  queueLength: number;
  loadingStationId: string | null;
  tuneIn: (stationData: any, slotIdx?: number) => Promise<void>;
  skipPrevious: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleAutoplay: () => void;
  skipNext: () => Promise<void>;
  stop: () => Promise<void>;
  syncStationData: (stationData: any) => void;
};

const RadioPlayerContext = createContext<RadioPlayerContextValue | undefined>(undefined);

const noopAsync = async () => undefined;
const noop = () => undefined;

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const tuneIn = useCallback(async (_stationData: any, _slotIdx?: number) => {
    // Stub: web playback implementation arrives in a follow-up slice.
  }, []);

  const value = useMemo<RadioPlayerContextValue>(
    () => ({
      activeStation: null,
      currentTrack: null,
      isPlaying: false,
      isMuted: false,
      isAutoplayEnabled: true,
      currentSlotIndex: 0,
      queueLength: 0,
      loadingStationId: null,
      tuneIn,
      skipPrevious: noopAsync,
      togglePlayPause: noopAsync,
      toggleMute: noopAsync,
      toggleAutoplay: noop,
      skipNext: noopAsync,
      stop: noopAsync,
      syncStationData: noop,
    }),
    [tuneIn],
  );

  return (
    <RadioPlayerContext.Provider value={value}>
      {children}
    </RadioPlayerContext.Provider>
  );
}

export function useRadioPlayer() {
  const context = useContext(RadioPlayerContext);
  if (!context) {
    throw new Error("useRadioPlayer must be used within a RadioPlayerProvider");
  }
  return context;
}

// Mobile renders a docked mini-player above the bottom navbar; on web there
// is no playback yet, so this renders nothing. A later slice will replace it
// with a real desktop dock above the sidebar footer.
export function GlobalRadioMiniPlayer() {
  return null;
}
