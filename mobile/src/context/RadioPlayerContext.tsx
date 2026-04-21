import { Ionicons } from "@expo/vector-icons";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { router } from "expo-router";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import TrackPlayer, { Event, State, isTrackPlayerAvailable } from "../audio/safeTrackPlayer";
import {
  buildStationQueue,
  ensureRadioPlayerSetup,
  getLiveStationCursor,
  type RadioQueueTrack,
  updateRadioPlayerCapabilities,
} from "../audio/radioTrackPlayer";
import {
  NAVBAR_BOTTOM_OFFSET,
  NAVBAR_HEIGHT,
  NAVBAR_MAX_WIDTH,
  NAVBAR_WIDTH,
} from "../components/navbar";
import { useBottomOverlay } from "./BottomOverlayContext";
import { useTheme } from "./ThemeContext";

export const RADIO_MINI_PLAYER_HEIGHT = 60;
export const RADIO_MINI_PLAYER_STACK_GAP = 8;
const RADIO_MINI_PLAYER_DEBUG_LOGS = __DEV__;

const logRadioMiniPlayerDebug = (event: string, payload: Record<string, unknown>) => {
  if (RADIO_MINI_PLAYER_DEBUG_LOGS) {
    console.log("[RadioMiniPlayer]", event, payload);
  }
};

const clampRotationIntervalMinutes = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 15;
  }

  return Math.min(Math.max(Math.round(parsed), 5), 120);
};

const getNextRotationRefreshDelayMs = (stationData: any) => {
  const intervalMs = clampRotationIntervalMinutes(stationData?.rotation_interval_minutes) * 60 * 1000;
  const anchorMs = Date.parse(stationData?.live_anchor_at || stationData?.updated_at || stationData?.created_at || "");
  const nowMs = Date.now();

  if (!Number.isFinite(anchorMs)) {
    return intervalMs;
  }

  const elapsedIntervals = anchorMs >= nowMs ? 0 : Math.floor((nowMs - anchorMs) / intervalMs);
  return Math.max((anchorMs + ((elapsedIntervals + 1) * intervalMs)) - nowMs + 1000, 1000);
};

type RadioQueueEntry = {
  slotIndex: number;
  itemIndex: number;
  slot: any;
  playlist: any;
  item: any;
};

const normalizeQueueIndex = (queueLength: number, index: number) => {
  if (queueLength <= 0) return 0;
  return ((index % queueLength) + queueLength) % queueLength;
};

const deriveIsPlaying = (playWhenReady: boolean, playbackState: string | null) => {
  if (!playWhenReady) return false;

  return (
    playbackState === State.Playing ||
    playbackState === State.Buffering ||
    playbackState === State.Loading
  );
};

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

type RadioPlayerPresenceContextValue = {
  activeStation: any | null;
};

type RadioPlayerPlaybackContextValue = {
  isPlaying: boolean;
  loadingStationId: string | null;
};

type RadioPlayerActionsContextValue = {
  tuneIn: (stationData: any, slotIdx?: number) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  syncStationData: (stationData: any) => void;
};

const RadioPlayerContext = createContext<RadioPlayerContextValue | undefined>(undefined);
const RadioPlayerPresenceContext = createContext<RadioPlayerPresenceContextValue | undefined>(undefined);
const RadioPlayerPlaybackContext = createContext<RadioPlayerPlaybackContextValue | undefined>(undefined);
const RadioPlayerActionsContext = createContext<RadioPlayerActionsContextValue | undefined>(undefined);

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const [activeStation, setActiveStation] = useState<any | null>(null);
  const [currentTrack, setCurrentTrack] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [queueLength, setQueueLength] = useState(0);
  const [loadingStationId, setLoadingStationId] = useState<string | null>(null);

  const activeStationRef = useRef<any | null>(null);
  const isMutedRef = useRef(false);
  const isAutoplayEnabledRef = useRef(true);
  const currentQueueIndexRef = useRef(0);
  const fullQueueRef = useRef<RadioQueueTrack[]>([]);
  const playerQueueLengthRef = useRef(0);
  const playWhenReadyRef = useRef(false);
  const playbackStateRef = useRef<string | null>(State.None);
  const queueTransitionInFlightRef = useRef(false);
  const playbackRequestIdRef = useRef(0);
  const fallbackSoundRef = useRef<Audio.Sound | null>(null);
  const playQueueIndexRef = useRef<(queueIndex: number, shouldPlay?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    activeStationRef.current = activeStation;
  }, [activeStation]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isAutoplayEnabledRef.current = isAutoplayEnabled;
  }, [isAutoplayEnabled]);

  useEffect(() => {
    currentQueueIndexRef.current = currentQueueIndex;
  }, [currentQueueIndex]);

  const clearLocalPlaybackState = useCallback((clearStation = false) => {
    playWhenReadyRef.current = false;
    playbackStateRef.current = State.None;
    currentQueueIndexRef.current = 0;
    playerQueueLengthRef.current = 0;
    setLoadingStationId(null);
    setIsPlaying(false);
    setCurrentTrack(null);
    setCurrentSlotIndex(0);
    setCurrentQueueIndex(0);
    setQueueLength(0);

    if (clearStation) {
      fullQueueRef.current = [];
      setActiveStation(null);
      activeStationRef.current = null;
    }
  }, []);

  const beginPlaybackRequest = useCallback(() => {
    playbackRequestIdRef.current += 1;
    return playbackRequestIdRef.current;
  }, []);

  const invalidatePlaybackRequests = useCallback(() => {
    playbackRequestIdRef.current += 1;
  }, []);

  const isPlaybackRequestCurrent = useCallback(
    (requestId: number) => playbackRequestIdRef.current === requestId,
    [],
  );

  const unloadFallbackSound = useCallback(async () => {
    const sound = fallbackSoundRef.current;
    fallbackSoundRef.current = null;

    if (!sound) {
      return;
    }

    try {
      sound.setOnPlaybackStatusUpdate(null);
    } catch {
      // Ignore cleanup failures for already-disposed sounds.
    }

    try {
      await sound.stopAsync();
    } catch {
      // Ignore stop failures for already-stopped sounds.
    }

    try {
      await sound.unloadAsync();
    } catch {
      // Ignore unload failures for already-disposed sounds.
    }
  }, []);

  const updateSharedQueueState = useCallback((
    stationData: any,
    fullQueue: RadioQueueTrack[],
    safeIndex: number,
  ) => {
    fullQueueRef.current = fullQueue;
    currentQueueIndexRef.current = safeIndex;
    setQueueLength(fullQueue.length);
    setActiveStation(stationData);
    activeStationRef.current = stationData;
    setCurrentQueueIndex(safeIndex);
    setCurrentSlotIndex(fullQueue[safeIndex]?.slotIndex ?? 0);
    setCurrentTrack(fullQueue[safeIndex] ?? null);
  }, []);

  const fetchStationDetails = useCallback(async (stationId: string) => {
    const { data, error } = await supabase.functions.invoke("manage-playlists", {
      body: { action: "get_station_details", station_id: stationId },
    });

    if (error) {
      throw error;
    }

    if (data?.data) {
      return {
        ...data.data,
        __queueReady: true,
      };
    }

    return null;
  }, []);

  const ensureStationData = useCallback(async (stationData: any) => {
    if (!stationData?.id || stationData?.__queueReady) {
      return stationData;
    }

    try {
      const hydratedStation = await fetchStationDetails(stationData.id);

      if (hydratedStation) {
        return hydratedStation;
      }
    } catch (error) {
      console.warn("Radio ensureStationData error:", error);
    }

    return stationData;
  }, [fetchStationDetails]);

  const updatePlaybackControlAvailability = useCallback(async (
    fullQueue: RadioQueueTrack[],
    queueIndex: number,
  ) => {
    const hasPrevious = queueIndex > 0;
    const hasNext = isAutoplayEnabledRef.current && queueIndex < fullQueue.length - 1;

    try {
      await updateRadioPlayerCapabilities(hasPrevious, hasNext);
    } catch (error) {
      console.warn("Radio updatePlaybackControlAvailability error:", error);
    }
  }, []);

  const handleFallbackStatusUpdate = useCallback((status: AVPlaybackStatus, requestId: number) => {
    if (!isPlaybackRequestCurrent(requestId)) {
      return;
    }

    if (!status.isLoaded) {
      if (status.error) {
        playWhenReadyRef.current = false;
        playbackStateRef.current = State.Error;
        setIsPlaying(false);
      }
      return;
    }

    playWhenReadyRef.current = status.shouldPlay;
    playbackStateRef.current = status.isPlaying
      ? State.Playing
      : status.didJustFinish
        ? State.Ended
        : State.Paused;

    setIsPlaying(status.isPlaying);

    if (!status.didJustFinish) {
      return;
    }

    const queue = fullQueueRef.current;
    const currentIndex = currentQueueIndexRef.current;
    const hasNext = currentIndex < queue.length - 1;

    if (isAutoplayEnabledRef.current && hasNext) {
      void playQueueIndexRef.current(currentIndex + 1, true);
      return;
    }

    playWhenReadyRef.current = false;
    setIsPlaying(false);
  }, [isPlaybackRequestCurrent]);

  const applyFallbackQueue = useCallback(async (
    stationData: any,
    fullQueue: RadioQueueTrack[],
    targetIndex: number,
    shouldPlay: boolean,
    requestId: number,
    startPositionSeconds = 0,
  ) => {
    const isCurrentRequest = () => isPlaybackRequestCurrent(requestId);

    if (fullQueue.length === 0) {
      await unloadFallbackSound();
      if (!isCurrentRequest()) {
        return;
      }

      clearLocalPlaybackState(true);
      return;
    }

    const safeIndex = normalizeQueueIndex(fullQueue.length, targetIndex);

    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: true,
      });

      if (!isCurrentRequest()) {
        return;
      }

      await unloadFallbackSound();
      if (!isCurrentRequest()) {
        return;
      }

      const { sound, status } = await Audio.Sound.createAsync(
        { uri: fullQueue[safeIndex].url },
        {
          shouldPlay,
          progressUpdateIntervalMillis: 300,
          volume: isMutedRef.current ? 0 : 1,
        },
        (nextStatus) => {
          handleFallbackStatusUpdate(nextStatus, requestId);
        },
      );

      if (!isCurrentRequest()) {
        try {
          await sound.unloadAsync();
        } catch {
          // Ignore cleanup failures for stale requests.
        }
        return;
      }

      fallbackSoundRef.current = sound;
      updateSharedQueueState(stationData, fullQueue, safeIndex);

      if (status.isLoaded && startPositionSeconds > 0) {
        await sound.setPositionAsync(startPositionSeconds * 1000);
      }

      playWhenReadyRef.current = shouldPlay;
      playbackStateRef.current = status.isLoaded
        ? status.isPlaying
          ? State.Playing
          : State.Paused
        : State.None;
      setIsPlaying(status.isLoaded ? status.isPlaying : false);
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      console.error("Radio applyFallbackQueue error:", error);
      clearLocalPlaybackState(true);
    }
  }, [clearLocalPlaybackState, handleFallbackStatusUpdate, isPlaybackRequestCurrent, unloadFallbackSound, updateSharedQueueState]);

  const applyPlayerQueue = useCallback(async (
    stationData: any,
    fullQueue: RadioQueueTrack[],
    targetIndex: number,
    shouldPlay: boolean,
    requestId = beginPlaybackRequest(),
    startPositionSeconds = 0,
  ) => {
    if (!isTrackPlayerAvailable) {
      await applyFallbackQueue(stationData, fullQueue, targetIndex, shouldPlay, requestId, startPositionSeconds);
      return;
    }

    const isCurrentRequest = () => isPlaybackRequestCurrent(requestId);

    if (fullQueue.length === 0) {
      try {
        await ensureRadioPlayerSetup();
        await TrackPlayer.reset();
      } catch (_) {
        // Ignore reset failures while clearing an empty queue.
      }

      if (!isCurrentRequest()) {
        return;
      }

      clearLocalPlaybackState(true);
      return;
    }

    const safeIndex = normalizeQueueIndex(fullQueue.length, targetIndex);
    const playerQueue = isAutoplayEnabledRef.current
      ? fullQueue
      : fullQueue.slice(0, safeIndex + 1);

    queueTransitionInFlightRef.current = true;

    try {
      await ensureRadioPlayerSetup();
      if (!isCurrentRequest()) {
        return;
      }

      await updatePlaybackControlAvailability(fullQueue, safeIndex);
      if (!isCurrentRequest()) {
        return;
      }

      playerQueueLengthRef.current = 0;
      await TrackPlayer.reset();
      if (!isCurrentRequest()) {
        return;
      }

      await TrackPlayer.add(playerQueue);
      if (!isCurrentRequest()) {
        return;
      }

      playerQueueLengthRef.current = playerQueue.length;
      await TrackPlayer.setVolume(isMutedRef.current ? 0 : 1);
      if (!isCurrentRequest()) {
        return;
      }

      await TrackPlayer.skip(safeIndex);
      if (!isCurrentRequest()) {
        return;
      }

      if (startPositionSeconds > 0) {
        await TrackPlayer.seekTo(startPositionSeconds);
        if (!isCurrentRequest()) {
          return;
        }
      }

      playWhenReadyRef.current = shouldPlay;
      playbackStateRef.current = shouldPlay ? State.Playing : State.Paused;
      updateSharedQueueState(stationData, fullQueue, safeIndex);

      if (shouldPlay) {
        await TrackPlayer.play();
        if (!isCurrentRequest()) {
          return;
        }

        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
    } catch (error) {
      if (!isCurrentRequest()) {
        return;
      }

      console.error("Radio applyPlayerQueue error:", error);
      clearLocalPlaybackState(true);
    } finally {
      queueTransitionInFlightRef.current = false;
    }
  }, [applyFallbackQueue, beginPlaybackRequest, clearLocalPlaybackState, isPlaybackRequestCurrent, updatePlaybackControlAvailability, updateSharedQueueState]);

  const playQueueIndex = useCallback(async (queueIndex: number, shouldPlay = true) => {
    const stationData = activeStationRef.current;
    const fullQueue = fullQueueRef.current;
    if (!stationData || fullQueue.length === 0) return;

    const requestId = beginPlaybackRequest();
    await applyPlayerQueue(stationData, fullQueue, queueIndex, shouldPlay, requestId);
  }, [applyPlayerQueue, beginPlaybackRequest]);

  useEffect(() => {
    playQueueIndexRef.current = playQueueIndex;
  }, [playQueueIndex]);

  const tuneIn = useCallback(async (stationData: any, slotIdx = 0) => {
    if (!stationData) return;

    const stationId = typeof stationData?.id === "string" ? stationData.id : "";

    if (activeStationRef.current?.id === stationId && fullQueueRef.current.length > 0) {
      if (isPlaying) {
        invalidatePlaybackRequests();
        playWhenReadyRef.current = false;
        if (isTrackPlayerAvailable) {
          await TrackPlayer.pause();
        } else {
          await fallbackSoundRef.current?.pauseAsync();
        }
        setIsPlaying(false);
        return;
      }

      if (isTrackPlayerAvailable) {
        if (playbackStateRef.current === State.Ended) {
          await TrackPlayer.seekTo(0);
        }

        playWhenReadyRef.current = true;
        await TrackPlayer.play();
        setIsPlaying(true);
        return;
      }

      const sound = fallbackSoundRef.current;
      if (!sound) {
        return;
      }

      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.didJustFinish) {
        await sound.setPositionAsync(0);
      }

      playWhenReadyRef.current = true;
      playbackStateRef.current = State.Playing;
      await sound.playAsync();
      setIsPlaying(true);
      return;
    }

    const requestId = beginPlaybackRequest();
    if (stationId) {
      setLoadingStationId(stationId);
    }

    try {
      const playableStation = await ensureStationData(stationData);
      if (!isPlaybackRequestCurrent(requestId)) {
        return;
      }

      const queue = await buildStationQueue(playableStation);
      if (!isPlaybackRequestCurrent(requestId)) {
        return;
      }

      if (queue.length === 0) {
        clearLocalPlaybackState(true);
        return;
      }

      const liveCursor = getLiveStationCursor(playableStation, queue);
      const slotIndexMatch = Math.max(
        queue.findIndex((entry) => entry.slotIndex === slotIdx),
        0,
      );
      const startIndex = liveCursor.isSynchronized ? liveCursor.queueIndex : slotIndexMatch;
      const startPositionSeconds = liveCursor.isSynchronized ? liveCursor.positionSeconds : 0;

      await applyPlayerQueue(
        playableStation,
        queue,
        startIndex,
        true,
        requestId,
        startPositionSeconds,
      );
    } finally {
      if (stationId) {
        setLoadingStationId((currentId) => (currentId === stationId ? null : currentId));
      }
    }
  }, [applyPlayerQueue, beginPlaybackRequest, clearLocalPlaybackState, ensureStationData, invalidatePlaybackRequests, isPlaybackRequestCurrent, isPlaying]);

  const skipPrevious = useCallback(async () => {
    const stationData = activeStationRef.current;
    if (!stationData) return;

    const queue = fullQueueRef.current;
    if (queue.length === 0) return;

    if (isTrackPlayerAvailable) {
      try {
        const progress = await TrackPlayer.getProgress();
        if ((progress.position || 0) > 3) {
          await TrackPlayer.seekTo(0);
          return;
        }
      } catch (_) {
        // Fall through to queue-based previous-track playback.
      }
    } else {
      try {
        const status = await fallbackSoundRef.current?.getStatusAsync();
        if (status && status.isLoaded && status.positionMillis > 3000) {
          await fallbackSoundRef.current?.setPositionAsync(0);
          return;
        }
      } catch (_) {
        // Fall through to queue-based previous-track playback.
      }
    }

    const previousIdx = normalizeQueueIndex(queue.length, currentQueueIndexRef.current - 1);
    await playQueueIndex(previousIdx);
  }, [playQueueIndex]);

  const togglePlayPause = useCallback(async () => {
    if (activeStationRef.current && fullQueueRef.current.length > 0 && isPlaying) {
      invalidatePlaybackRequests();
      playWhenReadyRef.current = false;
      if (isTrackPlayerAvailable) {
        await TrackPlayer.pause();
      } else {
        await fallbackSoundRef.current?.pauseAsync();
      }
      setIsPlaying(false);
      return;
    }

    if (activeStationRef.current && fullQueueRef.current.length > 0 && !isPlaying) {
      if (isTrackPlayerAvailable) {
        if (playbackStateRef.current === State.Ended) {
          await TrackPlayer.seekTo(0);
        }

        playWhenReadyRef.current = true;
        await TrackPlayer.play();
        setIsPlaying(true);
        return;
      }

      const sound = fallbackSoundRef.current;
      if (!sound) {
        await playQueueIndex(currentQueueIndexRef.current);
        return;
      }

      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.didJustFinish) {
        await sound.setPositionAsync(0);
      }

      playWhenReadyRef.current = true;
      playbackStateRef.current = State.Playing;
      await sound.playAsync();
      setIsPlaying(true);
      return;
    }

    if (activeStationRef.current) {
      await playQueueIndex(currentQueueIndexRef.current);
    }
  }, [invalidatePlaybackRequests, isPlaying, playQueueIndex]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMutedRef.current;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    try {
      if (isTrackPlayerAvailable) {
        await ensureRadioPlayerSetup();
        await TrackPlayer.setVolume(nextMuted ? 0 : 1);
      } else {
        await fallbackSoundRef.current?.setVolumeAsync(nextMuted ? 0 : 1);
      }
    } catch (_) {
      // Ignore mute failures to avoid breaking playback controls.
    }
  }, []);

  const toggleAutoplay = useCallback(() => {
    const nextAutoplayEnabled = !isAutoplayEnabledRef.current;
    isAutoplayEnabledRef.current = nextAutoplayEnabled;
    setIsAutoplayEnabled(nextAutoplayEnabled);

    if (!isTrackPlayerAvailable) {
      return;
    }

    const stationData = activeStationRef.current;
    const fullQueue = fullQueueRef.current;

    if (stationData && fullQueue.length > 0) {
      const requestId = beginPlaybackRequest();
      void applyPlayerQueue(
        stationData,
        fullQueue,
        currentQueueIndexRef.current,
        playWhenReadyRef.current,
        requestId,
      );
      return;
    }

    void updateRadioPlayerCapabilities(false, false);
  }, [applyPlayerQueue, beginPlaybackRequest]);

  const skipNext = useCallback(async () => {
    const queue = fullQueueRef.current;
    if (queue.length === 0) return;

    const nextIdx = normalizeQueueIndex(queue.length, currentQueueIndexRef.current + 1);
    await playQueueIndex(nextIdx);
  }, [playQueueIndex]);

  const stop = useCallback(async () => {
    if (!isTrackPlayerAvailable) {
      invalidatePlaybackRequests();
      fullQueueRef.current = [];
      queueTransitionInFlightRef.current = false;
      void unloadFallbackSound();
      clearLocalPlaybackState(true);
      return;
    }

    invalidatePlaybackRequests();
    fullQueueRef.current = [];
    queueTransitionInFlightRef.current = false;

    try {
      await ensureRadioPlayerSetup();
      await TrackPlayer.reset();
    } catch (_) {
      // Ignore cleanup failures so the next tune-in can recover cleanly.
    }

    clearLocalPlaybackState(true);
  }, [clearLocalPlaybackState, invalidatePlaybackRequests, unloadFallbackSound]);

  const syncStationData = useCallback((stationData: any) => {
    if (!stationData?.id) return;

    setActiveStation((previous: any) => {
      if (!previous || previous.id !== stationData.id) return previous;

      const previousHasQueueData = previous.__queueReady === true;
      const incomingHasQueueData = stationData.__queueReady === true;
      const previousLiveSlots = Array.isArray(previous.live_slots) ? previous.live_slots : [];
      const incomingLiveSlots = Array.isArray(stationData.live_slots) ? stationData.live_slots : [];

      const nextStation = {
        ...previous,
        ...stationData,
        live_slots: previousHasQueueData && !incomingHasQueueData
          ? previousLiveSlots.length > 0 ? previousLiveSlots : incomingLiveSlots
          : incomingLiveSlots.length > 0 ? incomingLiveSlots : previousLiveSlots,
        slots: previousHasQueueData && !incomingHasQueueData
          ? previous.slots || stationData.slots || []
          : stationData.slots || previous.slots || [],
        __queueReady: previousHasQueueData || incomingHasQueueData,
      };

      activeStationRef.current = nextStation;

      return nextStation;
    });
  }, []);

  useEffect(() => {
    if (!activeStation?.id || fullQueueRef.current.length === 0 || activeStation?.is_active === false) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      const stationId = activeStation.id;

      void (async () => {
        const requestId = beginPlaybackRequest();

        try {
          const refreshedStation = await fetchStationDetails(stationId);
          if (!refreshedStation || !isPlaybackRequestCurrent(requestId)) {
            return;
          }

          const queue = await buildStationQueue(refreshedStation);
          if (!isPlaybackRequestCurrent(requestId) || queue.length === 0) {
            return;
          }

          const liveCursor = getLiveStationCursor(refreshedStation, queue);
          await applyPlayerQueue(
            refreshedStation,
            queue,
            liveCursor.queueIndex,
            playWhenReadyRef.current,
            requestId,
            liveCursor.positionSeconds,
          );
        } catch (error) {
          console.warn("Radio live rotation refresh error:", error);
        }
      })();
    }, getNextRotationRefreshDelayMs(activeStation));

    return () => clearTimeout(timeoutId);
  }, [activeStation, applyPlayerQueue, beginPlaybackRequest, fetchStationDetails, isPlaybackRequestCurrent]);

  useEffect(() => {
    if (!isTrackPlayerAvailable) {
      return undefined;
    }

    void ensureRadioPlayerSetup().catch((error) => {
      console.warn("Radio player setup error:", error);
    });

    const stateSubscription = TrackPlayer.addEventListener(Event.PlaybackState, (playbackState: { state: string }) => {
      playbackStateRef.current = playbackState.state;
      setIsPlaying(deriveIsPlaying(playWhenReadyRef.current, playbackState.state));
    });

    const playWhenReadySubscription = TrackPlayer.addEventListener(
      Event.PlaybackPlayWhenReadyChanged,
      (event: { playWhenReady: boolean }) => {
        playWhenReadyRef.current = event.playWhenReady;
        setIsPlaying(deriveIsPlaying(event.playWhenReady, playbackStateRef.current));
      },
    );

    const activeTrackSubscription = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      (event: { track?: RadioQueueTrack | null; index?: number }) => {
        const nextTrack = event.track as RadioQueueTrack | undefined;

        if (!nextTrack) {
          if (queueTransitionInFlightRef.current || playerQueueLengthRef.current > 0) {
            return;
          }

          setCurrentTrack(null);
          setCurrentSlotIndex(0);
          setCurrentQueueIndex(0);
          currentQueueIndexRef.current = 0;
          return;
        }

        const nextQueueIndex = typeof nextTrack.queueIndex === "number"
          ? nextTrack.queueIndex
          : typeof event.index === "number"
            ? event.index
            : 0;

        currentQueueIndexRef.current = nextQueueIndex;
        setCurrentQueueIndex(nextQueueIndex);
        setCurrentSlotIndex(typeof nextTrack.slotIndex === "number" ? nextTrack.slotIndex : 0);
        setCurrentTrack(nextTrack);

        void updatePlaybackControlAvailability(fullQueueRef.current, nextQueueIndex);
      },
    );

    const playbackErrorSubscription = TrackPlayer.addEventListener(Event.PlaybackError, (event: unknown) => {
      playWhenReadyRef.current = false;
      setIsPlaying(false);
      console.error("Radio playback error:", event);
    });

    return () => {
      invalidatePlaybackRequests();
      stateSubscription.remove();
      playWhenReadySubscription.remove();
      activeTrackSubscription.remove();
      playbackErrorSubscription.remove();
      void TrackPlayer.reset().catch(() => {
        // Ignore teardown failures during unmount.
      });
    };
  }, [invalidatePlaybackRequests, updatePlaybackControlAvailability]);

  useEffect(() => {
    return () => {
      void unloadFallbackSound();
    };
  }, [unloadFallbackSound]);

  const value = useMemo<RadioPlayerContextValue>(() => ({
    activeStation,
    currentTrack,
    isPlaying,
    isMuted,
    isAutoplayEnabled,
    currentSlotIndex,
    queueLength,
    loadingStationId,
    tuneIn,
    skipPrevious,
    togglePlayPause,
    toggleMute,
    toggleAutoplay,
    skipNext,
    stop,
    syncStationData,
  }), [activeStation, currentTrack, currentSlotIndex, isAutoplayEnabled, isMuted, isPlaying, loadingStationId, queueLength, skipNext, skipPrevious, stop, syncStationData, toggleAutoplay, toggleMute, togglePlayPause, tuneIn]);

  const presenceValue = useMemo<RadioPlayerPresenceContextValue>(() => ({
    activeStation,
  }), [activeStation]);

  const playbackValue = useMemo<RadioPlayerPlaybackContextValue>(() => ({
    isPlaying,
    loadingStationId,
  }), [isPlaying, loadingStationId]);

  const actionsValue = useMemo<RadioPlayerActionsContextValue>(() => ({
    tuneIn,
    togglePlayPause,
    syncStationData,
  }), [syncStationData, togglePlayPause, tuneIn]);

  return (
    <RadioPlayerPresenceContext.Provider value={presenceValue}>
      <RadioPlayerPlaybackContext.Provider value={playbackValue}>
        <RadioPlayerActionsContext.Provider value={actionsValue}>
          <RadioPlayerContext.Provider value={value}>
            {children}
          </RadioPlayerContext.Provider>
        </RadioPlayerActionsContext.Provider>
      </RadioPlayerPlaybackContext.Provider>
    </RadioPlayerPresenceContext.Provider>
  );
}

export function useRadioPlayer() {
  const context = useContext(RadioPlayerContext);
  if (!context) {
    throw new Error("useRadioPlayer must be used within a RadioPlayerProvider");
  }
  return context;
}

export function useRadioPlayerPresence() {
  const context = useContext(RadioPlayerPresenceContext);
  if (!context) {
    throw new Error("useRadioPlayerPresence must be used within a RadioPlayerProvider");
  }

  return context;
}

export function useRadioPlayerPlayback() {
  const context = useContext(RadioPlayerPlaybackContext);
  if (!context) {
    throw new Error("useRadioPlayerPlayback must be used within a RadioPlayerProvider");
  }

  return context;
}

export function useRadioPlayerActions() {
  const context = useContext(RadioPlayerActionsContext);
  if (!context) {
    throw new Error("useRadioPlayerActions must be used within a RadioPlayerProvider");
  }

  return context;
}

export function GlobalRadioMiniPlayer() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { isBottomOverlayActive } = useBottomOverlay();
  const {
    activeStation,
    currentTrack,
    currentSlotIndex,
    isMuted,
    stop,
    toggleMute,
  } = useRadioPlayer();

  const radioPlayerBottom = NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + RADIO_MINI_PLAYER_STACK_GAP + insets.bottom;

  const stationId = activeStation?.id ?? null;
  const stationName = activeStation?.name ?? null;
  const currentTrackTitle = currentTrack?.title ?? null;

  useEffect(() => {
    logRadioMiniPlayerDebug("state", {
      currentSlotIndex,
      currentTrackTitle,
      hasActiveStation: Boolean(activeStation),
      isBottomOverlayActive,
      isMuted,
      pointerEvents: "auto",
      radioPlayerBottom: Number(radioPlayerBottom.toFixed(2)),
      stationId,
      stationName,
    });
  }, [
    activeStation,
    currentSlotIndex,
    currentTrackTitle,
    isBottomOverlayActive,
    isMuted,
    radioPlayerBottom,
    stationId,
    stationName,
  ]);

  if (!activeStation) return null;

  const activeLiveSlots = Array.isArray(activeStation.live_slots) && activeStation.live_slots.length > 0
    ? activeStation.live_slots
    : Array.isArray(activeStation.slots)
      ? activeStation.slots
      : [];

  const activeTrackTitle = currentTrack?.title
    || activeLiveSlots[currentSlotIndex]?.playlist?.title
    || `Track ${currentSlotIndex + 1}`;

  const radioPlayerNode = (
    <View
      pointerEvents="auto"
      style={[
        styles.radioPlayerBar,
        {
          backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
          borderColor: isDark ? "#334155" : "#E2E8F0",
          bottom: radioPlayerBottom,
        },
        isBottomOverlayActive ? styles.radioPlayerOverlayActive : null,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        style={{ flex: 1, marginRight: 10 }}
        onPress={() => router.push({ pathname: "/station_details" as any, params: { station_id: activeStation.id } })}
      >
        <Text style={{ fontSize: 10, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {activeStation.name}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }} numberOfLines={1}>
          {activeTrackTitle}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.7} onPress={() => void toggleMute()} style={styles.radioPlayerBtn}>
        <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={18} color={isMuted ? "#ef4444" : colors.text} />
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.7} onPress={() => void stop()} style={styles.radioPlayerBtn}>
        <Ionicons name="close" size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return radioPlayerNode;
}

const styles = StyleSheet.create({
  radioPlayerBar: {
    position: "absolute",
    alignSelf: "center",
    width: NAVBAR_WIDTH,
    maxWidth: NAVBAR_MAX_WIDTH,
    zIndex: 1201,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: RADIO_MINI_PLAYER_HEIGHT,
    borderWidth: 1,
    borderRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 1201,
  },
  radioPlayerOverlayActive: {
    opacity: 0.98,
  },
  radioPlayerBtn: {
    padding: 6,
  },
});