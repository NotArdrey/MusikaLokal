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
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import TrackPlayer, { Event, RepeatMode, State, isTrackPlayerAvailable } from "../audio/safeTrackPlayer";
import {
  buildStationQueue,
  ensureRadioPlayerSetup,
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
import { getStationLiveTimelineState } from "../utils/radioTimeline";

export const RADIO_MINI_PLAYER_HEIGHT = 60;
export const RADIO_MINI_PLAYER_STACK_GAP = 8;
const RADIO_MINI_PLAYER_DEBUG_LOGS = __DEV__;
const RADIO_TUNE_IN_DEBUG_LOGS = __DEV__;
const RADIO_PLAYER_START_QUEUE_SIZE = 1;
const RADIO_PREPARED_QUEUE_TTL_MS = 45_000;
const RADIO_PREPARE_TAP_WAIT_MS = 300;
const RADIO_FALLBACK_PREARM_SLOW_MS = 3_000;
const RADIO_FALLBACK_PREARM_COOLDOWN_MS = 120_000;
const PLAYLIST_RADIO_ID_PREFIX = "playlist-radio:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const logRadioMiniPlayerDebug = (event: string, payload: Record<string, unknown>) => {
  if (RADIO_MINI_PLAYER_DEBUG_LOGS) {
  }
};

const logRadioTuneInDebug = (event: string, payload: Record<string, unknown> = {}) => {
  if (!RADIO_TUNE_IN_DEBUG_LOGS) {
    return;
  }

  console.log(`[RadioTuneIn] ${event}`, payload);
};

const normalizeQueueIndex = (queueLength: number, index: number) => {
  if (queueLength <= 0) return 0;
  return ((index % queueLength) + queueLength) % queueLength;
};

const normalizePrepareQueueIndex = (queueIndex: unknown) => (
  Math.max(0, Math.floor(Number(queueIndex) || 0))
);

const getRadioPrepareKey = (stationId: string, queueIndex: unknown) => (
  `${stationId}:${normalizePrepareQueueIndex(queueIndex)}`
);

const readUuidString = (value: unknown) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return UUID_PATTERN.test(trimmed) ? trimmed : "";
};

const getStationTuneInEventIds = (stationData: any) => {
  const slots = Array.isArray(stationData?.live_slots)
    ? stationData.live_slots
    : Array.isArray(stationData?.slots)
      ? stationData.slots
      : [];
  const playlistId = slots
    .map((slot: any) => readUuidString(slot?.playlist?.id ?? slot?.playlist_id))
    .find(Boolean) || "";

  const stationId = readUuidString(stationData?.id);
  if (stationId) {
    return { playlistId, stationId };
  }

  const syntheticId = typeof stationData?.id === "string" ? stationData.id.trim() : "";
  const syntheticPlaylistId = syntheticId.startsWith(PLAYLIST_RADIO_ID_PREFIX)
    ? readUuidString(syntheticId.slice(PLAYLIST_RADIO_ID_PREFIX.length))
    : "";
  if (syntheticPlaylistId) {
    return { playlistId: syntheticPlaylistId, stationId: "" };
  }

  return { playlistId, stationId: "" };
};

const summarizeRadioStationForDebug = (stationData: any) => {
  if (!stationData) {
    return null;
  }

  const slots = Array.isArray(stationData?.live_slots)
    ? stationData.live_slots
    : Array.isArray(stationData?.slots)
      ? stationData.slots
      : [];
  const eventIds = getStationTuneInEventIds(stationData);

  return {
    id: stationData?.id || "",
    name: stationData?.name || "",
    isActive: stationData?.is_active !== false,
    queueReady: stationData?.__queueReady === true,
    eventStationId: eventIds.stationId,
    eventPlaylistId: eventIds.playlistId,
    slotCount: slots.length,
    slotSummaries: slots.map((slot: any, index: number) => ({
      index,
      slotId: slot?.id || "",
      playlistId: slot?.playlist?.id || slot?.playlist_id || "",
      playlistTitle: slot?.playlist?.title || "",
      itemCount: Array.isArray(slot?.playlist?.items) ? slot.playlist.items.length : 0,
    })),
  };
};

const summarizeRadioQueueForDebug = (queue: RadioQueueTrack[]) => ({
  length: queue.length,
  first: queue[0]
    ? {
        id: queue[0].id,
        title: queue[0].title,
        urlPresent: Boolean(queue[0].url),
        stationId: queue[0].stationId,
        playlistTitle: queue[0].playlistTitle,
        queueIndex: queue[0].queueIndex,
        slotIndex: queue[0].slotIndex,
        itemIndex: queue[0].itemIndex,
      }
    : null,
});

const buildInitialPlayerQueue = (
  fullQueue: RadioQueueTrack[],
  startIndex: number,
  autoplayEnabled: boolean,
) => {
  if (fullQueue.length === 0) {
    return {
      initialQueue: [],
      remainingQueue: [],
    };
  }

  const safeIndex = normalizeQueueIndex(fullQueue.length, startIndex);

  if (!autoplayEnabled) {
    return {
      initialQueue: [fullQueue[safeIndex]],
      remainingQueue: [],
    };
  }

  const orderedQueue = fullQueue.map((_, offset) => (
    fullQueue[normalizeQueueIndex(fullQueue.length, safeIndex + offset)]
  ));
  const initialQueueLength = Math.min(RADIO_PLAYER_START_QUEUE_SIZE, orderedQueue.length);

  return {
    initialQueue: orderedQueue.slice(0, initialQueueLength),
    remainingQueue: orderedQueue.slice(initialQueueLength),
  };
};

const deriveIsPlaying = (playWhenReady: boolean, playbackState: string | null) => {
  if (!playWhenReady) return false;

  return (
    playbackState === State.Playing ||
    playbackState === State.Buffering ||
    playbackState === State.Loading
  );
};

const readNonNegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const readTimestampMs = (value: unknown) => {
  if (typeof value !== "string") return null;
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : null;
};

const getFastStationLiveCursor = (stationData: any, fallbackQueueIndex: number) => {
  const timelineState = getStationLiveTimelineState(stationData);
  if (timelineState.synchronized) {
    return {
      isSynchronized: true,
      positionSeconds: Math.floor(timelineState.positionSeconds),
      queueIndex: Math.floor(timelineState.queueIndex),
    };
  }

  const liveQueueIndex = readNonNegativeNumber(stationData?.live_current_queue_index);
  const livePositionSeconds = readNonNegativeNumber(stationData?.live_position_seconds);
  const syncedAtMs = readTimestampMs(stationData?.live_synced_at);
  const elapsedSinceSyncSeconds = syncedAtMs === null
    ? 0
    : Math.max(0, Math.floor((Date.now() - syncedAtMs) / 1000));

  return {
    isSynchronized: liveQueueIndex !== null || livePositionSeconds !== null,
    positionSeconds: Math.floor((livePositionSeconds ?? 0) + elapsedSinceSyncSeconds),
    queueIndex: Math.floor(liveQueueIndex ?? Math.max(0, fallbackQueueIndex)),
  };
};

type PreparedRadioStationQueue = {
  fallbackPreparedAt?: number;
  fallbackPreparedPositionSeconds?: number;
  key: string;
  playerPreparedAt?: number;
  playerPreparedPositionSeconds?: number;
  preparedAt: number;
  queue: RadioQueueTrack[];
  queueIndex: number;
  stationId: string;
};

type PendingPreparedRadioStationQueue = {
  key: string;
  promise: Promise<PreparedRadioStationQueue | null>;
  resolve: (preparedQueue: PreparedRadioStationQueue | null) => void;
};

const waitForPreparedQueue = async (
  promise: Promise<PreparedRadioStationQueue | null>,
  timeoutMs: number,
) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), timeoutMs);
  });

  const result = await Promise.race([
    promise.catch(() => null),
    timeoutPromise,
  ]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
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
  prepareStation: (stationData: any, slotIdx?: number) => Promise<void>;
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
  isMuted: boolean;
  isPlaying: boolean;
  loadingStationId: string | null;
};

type RadioPlayerActionsContextValue = {
  prepareStation: (stationData: any, slotIdx?: number) => Promise<void>;
  tuneIn: (stationData: any, slotIdx?: number) => Promise<void>;
  toggleMute: () => Promise<void>;
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
  const preparedQueueRef = useRef<PreparedRadioStationQueue | null>(null);
  const preparingPlayerStationRef = useRef<{ queueIndex: number; stationId: string } | null>(null);
  const prepareRequestIdRef = useRef(0);
  const pendingPrepareKeyRef = useRef<string | null>(null);
  const pendingPreparedQueueRef = useRef<PendingPreparedRadioStationQueue | null>(null);
  const preparedFallbackSoundRef = useRef<Audio.Sound | null>(null);
  const fallbackSoundRef = useRef<Audio.Sound | null>(null);
  const fallbackAudioModePromiseRef = useRef<Promise<void> | null>(null);
  const fallbackPrearmCooldownUntilRef = useRef(0);
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
      const preparedFallbackSound = preparedFallbackSoundRef.current;
      preparedFallbackSoundRef.current = null;
      if (preparedFallbackSound) {
        void preparedFallbackSound.unloadAsync().catch(() => {
          // Ignore cleanup failures for abandoned prepared fallback sounds.
        });
      }
      fullQueueRef.current = [];
      preparedQueueRef.current = null;
      preparingPlayerStationRef.current = null;
      pendingPrepareKeyRef.current = null;
      pendingPreparedQueueRef.current?.resolve(null);
      pendingPreparedQueueRef.current = null;
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

  const setupFallbackAudioModeOnce = useCallback(() => {
    if (!fallbackAudioModePromiseRef.current) {
      fallbackAudioModePromiseRef.current = Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: true,
      }).catch((error) => {
        fallbackAudioModePromiseRef.current = null;
        throw error;
      });
    }

    return fallbackAudioModePromiseRef.current;
  }, []);

  const cancelPendingPrepareForDirectStart = useCallback((prepareKey: string, reason: string) => {
    const pendingPrepareKey = pendingPrepareKeyRef.current || pendingPreparedQueueRef.current?.key || "";
    if (!pendingPrepareKey) {
      return false;
    }

    prepareRequestIdRef.current += 1;
    fallbackPrearmCooldownUntilRef.current = Math.max(
      fallbackPrearmCooldownUntilRef.current,
      Date.now() + RADIO_FALLBACK_PREARM_COOLDOWN_MS,
    );
    pendingPrepareKeyRef.current = null;
    pendingPreparedQueueRef.current?.resolve(null);
    pendingPreparedQueueRef.current = null;
    logRadioTuneInDebug("prepare-cancelled-for-direct-start", {
      cooldownMs: RADIO_FALLBACK_PREARM_COOLDOWN_MS,
      nextPrepareRequestId: prepareRequestIdRef.current,
      pendingPrepareKey,
      prepareKey,
      reason,
    });
    return true;
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

  const getPreparedQueueForStation = useCallback((stationData: any, queueIndex: number) => {
    const stationId = typeof stationData?.id === "string" ? stationData.id : "";
    const preparedQueue = preparedQueueRef.current;
    const safeQueueIndex = Math.max(0, Math.floor(Number(queueIndex) || 0));
    const prepareKey = getRadioPrepareKey(stationId, safeQueueIndex);

    if (
      !stationId ||
      !preparedQueue ||
      preparedQueue.key !== prepareKey ||
      preparedQueue.stationId !== stationId ||
      preparedQueue.queueIndex !== safeQueueIndex ||
      preparedQueue.queue.length === 0
    ) {
      return null;
    }

    const ageMs = Date.now() - preparedQueue.preparedAt;
    if (ageMs > RADIO_PREPARED_QUEUE_TTL_MS) {
      logRadioTuneInDebug("prepared-queue-expired", {
        ageMs,
        queueIndex: safeQueueIndex,
        stationId,
      });
      preparedQueueRef.current = null;
      const preparedFallbackSound = preparedFallbackSoundRef.current;
      preparedFallbackSoundRef.current = null;
      if (pendingPreparedQueueRef.current?.key === preparedQueue.key) {
        pendingPreparedQueueRef.current.resolve(null);
        pendingPreparedQueueRef.current = null;
      }
      if (preparedFallbackSound) {
        void preparedFallbackSound.unloadAsync().catch(() => {
          // Ignore cleanup failures for abandoned prepared fallback sounds.
        });
      }
      return null;
    }

    return preparedQueue.queue;
  }, []);

  const getPreparedPlayerQueueForStation = useCallback((stationData: any, queueIndex: number) => {
    const queue = getPreparedQueueForStation(stationData, queueIndex);
    const preparedQueue = preparedQueueRef.current;
    if (!queue || !preparedQueue?.playerPreparedAt) {
      return null;
    }

    return {
      playerPreparedAt: preparedQueue.playerPreparedAt,
      playerPreparedPositionSeconds: preparedQueue.playerPreparedPositionSeconds ?? 0,
      queue,
    };
  }, [getPreparedQueueForStation]);

  const getPreparedFallbackQueueForStation = useCallback((stationData: any, queueIndex: number) => {
    const queue = getPreparedQueueForStation(stationData, queueIndex);
    const preparedQueue = preparedQueueRef.current;
    if (!queue || !preparedQueue?.fallbackPreparedAt || !preparedFallbackSoundRef.current) {
      return null;
    }

    return {
      fallbackPreparedAt: preparedQueue.fallbackPreparedAt,
      fallbackPreparedPositionSeconds: preparedQueue.fallbackPreparedPositionSeconds ?? 0,
      key: preparedQueue.key,
      queue,
      sound: preparedFallbackSoundRef.current,
    };
  }, [getPreparedQueueForStation]);

  const prepareStation = useCallback(async (stationData: any, slotIdx = 0) => {
    const stationId = typeof stationData?.id === "string" ? stationData.id : "";
    if (!stationId) {
      logRadioTuneInDebug("prepare-skip", {
        reason: "missing-station-id",
        station: summarizeRadioStationForDebug(stationData),
      });
      return;
    }

    if (activeStationRef.current?.id === stationId) {
      logRadioTuneInDebug("prepare-skip", {
        reason: "already-active-station",
        stationId,
      });
      return;
    }

    let playableStation = stationData;
    let fastCursor = getFastStationLiveCursor(playableStation, slotIdx);
    const safeQueueIndex = normalizePrepareQueueIndex(fastCursor.queueIndex);
    const existingPreparedQueue = getPreparedQueueForStation(playableStation, safeQueueIndex);
    const existingPreparedSnapshot = preparedQueueRef.current;
    if (existingPreparedQueue) {
      const canUpgradePreparedQueue =
        !activeStationRef.current &&
        (
          (isTrackPlayerAvailable && !existingPreparedSnapshot?.playerPreparedAt) ||
          (!isTrackPlayerAvailable && !existingPreparedSnapshot?.fallbackPreparedAt)
        );

      if (!canUpgradePreparedQueue) {
        logRadioTuneInDebug("prepare-skip", {
          fallbackPrepared: Boolean(existingPreparedSnapshot?.fallbackPreparedAt),
          playerPrepared: Boolean(existingPreparedSnapshot?.playerPreparedAt),
          reason: "prepared-cache-hit",
          queue: summarizeRadioQueueForDebug(existingPreparedQueue),
          queueIndex: safeQueueIndex,
          stationId,
        });
        return;
      }

      logRadioTuneInDebug("prepare-upgrade-start", {
        fallbackPrepared: Boolean(existingPreparedSnapshot?.fallbackPreparedAt),
        playerPrepared: Boolean(existingPreparedSnapshot?.playerPreparedAt),
        queue: summarizeRadioQueueForDebug(existingPreparedQueue),
        queueIndex: safeQueueIndex,
        stationId,
      });
    }

    const prepareKey = getRadioPrepareKey(stationId, safeQueueIndex);
    const pendingPrepareKey = pendingPrepareKeyRef.current || pendingPreparedQueueRef.current?.key || "";
    if (pendingPrepareKey) {
      logRadioTuneInDebug("prepare-skip", {
        pendingPrepareKey,
        prepareKey,
        reason: pendingPrepareKey === prepareKey ? "already-in-flight" : "another-prepare-in-flight",
      });
      return;
    }

    let resolvePendingPreparedQueue: (preparedQueue: PreparedRadioStationQueue | null) => void = () => undefined;
    const pendingPreparedQueuePromise = new Promise<PreparedRadioStationQueue | null>((resolve) => {
      resolvePendingPreparedQueue = resolve;
    });
    let pendingPreparedQueueSettled = false;
    const settlePendingPreparedQueue = (preparedQueue: PreparedRadioStationQueue | null) => {
      if (pendingPreparedQueueSettled) {
        return;
      }

      pendingPreparedQueueSettled = true;
      resolvePendingPreparedQueue(preparedQueue);
    };

    pendingPrepareKeyRef.current = prepareKey;
    pendingPreparedQueueRef.current = {
      key: prepareKey,
      promise: pendingPreparedQueuePromise,
      resolve: settlePendingPreparedQueue,
    };
    const requestId = prepareRequestIdRef.current + 1;
    prepareRequestIdRef.current = requestId;
    const startedAt = Date.now();
    logRadioTuneInDebug("prepare-start", {
      fastCursor,
      prepareKey,
      requestId,
      station: summarizeRadioStationForDebug(playableStation),
    });

    try {
      if (isTrackPlayerAvailable) {
        const setupStartedAt = Date.now();
        await ensureRadioPlayerSetup();
        logRadioTuneInDebug("prepare-player-setup-ready", {
          durationMs: Date.now() - setupStartedAt,
          elapsedMs: Date.now() - startedAt,
          requestId,
        });
      }

      let queue = existingPreparedQueue || [];
      if (queue.length === 0) {
        const queueStartedAt = Date.now();
        queue = await buildStationQueue(playableStation, { onlyQueueIndex: safeQueueIndex });
        logRadioTuneInDebug("prepare-queue-built", {
          durationMs: Date.now() - queueStartedAt,
          elapsedMs: Date.now() - startedAt,
          fastCursor,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
        });
      } else {
        logRadioTuneInDebug("prepare-queue-reused", {
          elapsedMs: Date.now() - startedAt,
          fastCursor,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
        });
      }

      if (queue.length === 0 && playableStation.__queueReady !== true) {
        const hydrateStartedAt = Date.now();
        playableStation = await ensureStationData(stationData);
        fastCursor = getFastStationLiveCursor(playableStation, slotIdx);
        const hydratedQueueIndex = Math.max(0, Math.floor(fastCursor.queueIndex));
        logRadioTuneInDebug("prepare-hydrate-complete", {
          durationMs: Date.now() - hydrateStartedAt,
          elapsedMs: Date.now() - startedAt,
          fastCursor,
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });

        const queueStartedAt = Date.now();
        queue = await buildStationQueue(playableStation, { onlyQueueIndex: hydratedQueueIndex });
        logRadioTuneInDebug("prepare-queue-built-after-hydrate", {
          durationMs: Date.now() - queueStartedAt,
          elapsedMs: Date.now() - startedAt,
          fastCursor,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
        });
      }

      if (prepareRequestIdRef.current !== requestId) {
        logRadioTuneInDebug("prepare-discarded-stale", {
          requestId,
          stationId,
        });
        return;
      }

      if (queue.length === 0) {
        logRadioTuneInDebug("prepare-empty-queue", {
          elapsedMs: Date.now() - startedAt,
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
        return;
      }

      const preparedQueueIndex = Math.max(0, Math.floor(queue[0]?.queueIndex ?? fastCursor.queueIndex));
      let fallbackPreparedAt = existingPreparedSnapshot?.fallbackPreparedAt;
      let fallbackPreparedPositionSeconds = existingPreparedSnapshot?.fallbackPreparedPositionSeconds;
      let playerPreparedAt = existingPreparedSnapshot?.playerPreparedAt;
      let playerPreparedPositionSeconds = existingPreparedSnapshot?.playerPreparedPositionSeconds;
      if (isTrackPlayerAvailable && !activeStationRef.current && queue[0]) {
        preparingPlayerStationRef.current = {
          queueIndex: preparedQueueIndex,
          stationId,
        };
        queueTransitionInFlightRef.current = true;

        try {
          const playerPrepareStartedAt = Date.now();
          await ensureRadioPlayerSetup();
          logRadioTuneInDebug("prepare-player-prearm-setup-ready", {
            durationMs: Date.now() - playerPrepareStartedAt,
            elapsedMs: Date.now() - startedAt,
            requestId,
          });

          if (prepareRequestIdRef.current !== requestId || activeStationRef.current) {
            logRadioTuneInDebug("prepare-player-prearm-aborted", {
              reason: activeStationRef.current ? "active-station-started" : "stale-prepare",
              requestId,
              stationId,
            });
          } else {
            const resetStartedAt = Date.now();
            playerQueueLengthRef.current = 0;
            await TrackPlayer.reset();
            logRadioTuneInDebug("prepare-player-prearm-reset-complete", {
              durationMs: Date.now() - resetStartedAt,
              elapsedMs: Date.now() - startedAt,
              requestId,
            });

            if (prepareRequestIdRef.current === requestId && !activeStationRef.current) {
              const loadStartedAt = Date.now();
              await TrackPlayer.load(queue[0]);
              playerQueueLengthRef.current = 1;
              logRadioTuneInDebug("prepare-player-prearm-load-complete", {
                durationMs: Date.now() - loadStartedAt,
                elapsedMs: Date.now() - startedAt,
                requestId,
                trackId: queue[0].id,
              });
            }

            if (prepareRequestIdRef.current === requestId && !activeStationRef.current) {
              const volumeStartedAt = Date.now();
              await TrackPlayer.setVolume(isMutedRef.current ? 0 : 1);
              logRadioTuneInDebug("prepare-player-prearm-volume-complete", {
                durationMs: Date.now() - volumeStartedAt,
                elapsedMs: Date.now() - startedAt,
                requestId,
              });
            }

            if (
              prepareRequestIdRef.current === requestId &&
              !activeStationRef.current &&
              fastCursor.isSynchronized &&
              fastCursor.positionSeconds > 0
            ) {
              const seekStartedAt = Date.now();
              await TrackPlayer.seekTo(fastCursor.positionSeconds);
              playerPreparedPositionSeconds = fastCursor.positionSeconds;
              logRadioTuneInDebug("prepare-player-prearm-seek-complete", {
                durationMs: Date.now() - seekStartedAt,
                elapsedMs: Date.now() - startedAt,
                positionSeconds: fastCursor.positionSeconds,
                requestId,
              });
            }

            if (prepareRequestIdRef.current === requestId && !activeStationRef.current) {
              playerPreparedAt = Date.now();
              logRadioTuneInDebug("prepare-player-prearm-complete", {
                elapsedMs: Date.now() - playerPrepareStartedAt,
                queueIndex: preparedQueueIndex,
                requestId,
                stationId,
              });
            }
          }
        } catch (error) {
          logRadioTuneInDebug("prepare-player-prearm-error", {
            elapsedMs: Date.now() - startedAt,
            message: error instanceof Error ? error.message : String(error),
            requestId,
            stationId,
          });
        } finally {
          if (preparingPlayerStationRef.current?.stationId === stationId) {
            preparingPlayerStationRef.current = null;
          }
          if (!activeStationRef.current) {
            queueTransitionInFlightRef.current = false;
          }
        }
      }

      if (!isTrackPlayerAvailable && !activeStationRef.current && queue[0] && !fallbackPreparedAt) {
        const fallbackPrearmCooldownRemainingMs = fallbackPrearmCooldownUntilRef.current - Date.now();
        if (fallbackPrearmCooldownRemainingMs > 0) {
          logRadioTuneInDebug("prepare-fallback-prearm-skipped", {
            cooldownRemainingMs: fallbackPrearmCooldownRemainingMs,
            reason: "slow-prearm-cooldown",
            requestId,
            stationId,
          });
        } else {
          try {
            const previousPreparedSound = preparedFallbackSoundRef.current;
            preparedFallbackSoundRef.current = null;
            if (previousPreparedSound) {
              void previousPreparedSound.unloadAsync().catch(() => {
                // Ignore cleanup failures for replaced prepared fallback sounds.
              });
            }

            const fallbackPrepareStartedAt = Date.now();
            await setupFallbackAudioModeOnce();
            logRadioTuneInDebug("prepare-fallback-prearm-audio-mode-complete", {
              durationMs: Date.now() - fallbackPrepareStartedAt,
              elapsedMs: Date.now() - startedAt,
              requestId,
            });

            if (
              prepareRequestIdRef.current !== requestId ||
              pendingPrepareKeyRef.current !== prepareKey ||
              activeStationRef.current
            ) {
              logRadioTuneInDebug("prepare-fallback-prearm-aborted", {
                reason: activeStationRef.current ? "active-station-started" : "stale-prepare-before-create",
                requestId,
                stationId,
              });
              return;
            }

            const createStartedAt = Date.now();
            const fallbackStartPositionSeconds = fastCursor.isSynchronized
              ? Math.max(0, Math.floor(fastCursor.positionSeconds))
              : 0;
            const { sound } = await Audio.Sound.createAsync(
              { uri: queue[0].url },
              {
                positionMillis: fallbackStartPositionSeconds * 1000,
                shouldPlay: false,
                progressUpdateIntervalMillis: 1000,
                volume: isMutedRef.current ? 0 : 1,
              },
              undefined,
              true,
            );
            const createDurationMs = Date.now() - createStartedAt;
            if (createDurationMs > RADIO_FALLBACK_PREARM_SLOW_MS) {
              fallbackPrearmCooldownUntilRef.current = Date.now() + RADIO_FALLBACK_PREARM_COOLDOWN_MS;
            }
            logRadioTuneInDebug("prepare-fallback-prearm-create-complete", {
              cooldownMs: createDurationMs > RADIO_FALLBACK_PREARM_SLOW_MS
                ? RADIO_FALLBACK_PREARM_COOLDOWN_MS
                : 0,
              durationMs: createDurationMs,
              elapsedMs: Date.now() - startedAt,
              positionSeconds: fallbackStartPositionSeconds,
              requestId,
              trackId: queue[0].id,
            });

            if (
              prepareRequestIdRef.current !== requestId ||
              pendingPrepareKeyRef.current !== prepareKey ||
              activeStationRef.current
            ) {
              logRadioTuneInDebug("prepare-fallback-prearm-aborted", {
                reason: activeStationRef.current ? "active-station-started" : "stale-prepare",
                requestId,
                stationId,
              });
              void sound.unloadAsync().catch(() => {
                // Ignore cleanup failures for stale prepared sounds.
              });
              return;
            } else {
              fallbackPreparedPositionSeconds = fallbackStartPositionSeconds;

              preparedFallbackSoundRef.current = sound;
              fallbackPreparedAt = Date.now();
              logRadioTuneInDebug("prepare-fallback-prearm-complete", {
                elapsedMs: Date.now() - fallbackPrepareStartedAt,
                queueIndex: preparedQueueIndex,
                requestId,
                stationId,
              });
            }
          } catch (error) {
            logRadioTuneInDebug("prepare-fallback-prearm-error", {
              elapsedMs: Date.now() - startedAt,
              message: error instanceof Error ? error.message : String(error),
              requestId,
              stationId,
            });
          }
        }
      }

      if (!activeStationRef.current && queue[0] && isTrackPlayerAvailable && !playerPreparedAt) {
        logRadioTuneInDebug("prepare-player-prearm-skipped", {
          playerPrepared: Boolean(playerPreparedAt),
          reason: "track-player-prearm-not-ready",
          requestId,
          stationId,
        });
      }

      const preparedSnapshot = {
        fallbackPreparedAt,
        fallbackPreparedPositionSeconds,
        key: getRadioPrepareKey(stationId, preparedQueueIndex),
        playerPreparedAt,
        playerPreparedPositionSeconds,
        preparedAt: Date.now(),
        queue,
        queueIndex: preparedQueueIndex,
        stationId,
      };
      preparedQueueRef.current = preparedSnapshot;
      settlePendingPreparedQueue(preparedSnapshot);
      logRadioTuneInDebug("prepare-complete", {
        elapsedMs: Date.now() - startedAt,
        prepareKey: preparedSnapshot.key,
        queue: summarizeRadioQueueForDebug(queue),
        queueIndex: preparedQueueIndex,
        requestId,
        stationId,
      });
    } catch (error) {
      logRadioTuneInDebug("prepare-error", {
        elapsedMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
        requestId,
        stationId,
      });
    } finally {
      settlePendingPreparedQueue(null);
      if (pendingPrepareKeyRef.current === prepareKey) {
        pendingPrepareKeyRef.current = null;
      }
      if (pendingPreparedQueueRef.current?.key === prepareKey) {
        pendingPreparedQueueRef.current = null;
      }
    }
  }, [ensureStationData, getPreparedQueueForStation, setupFallbackAudioModeOnce]);

  const updatePlaybackControlAvailability = useCallback(async (
    fullQueue: RadioQueueTrack[],
    queueIndex: number,
  ) => {
    const hasPrevious = fullQueue.length > 1 || queueIndex > 0;
    const hasNext = isAutoplayEnabledRef.current ? fullQueue.length > 1 : queueIndex < fullQueue.length - 1;

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
    if (isAutoplayEnabledRef.current && queue.length > 0) {
      void playQueueIndexRef.current(normalizeQueueIndex(queue.length, currentIndex + 1), true);
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
      await setupFallbackAudioModeOnce();

      if (!isCurrentRequest()) {
        return;
      }

      await unloadFallbackSound();
      if (!isCurrentRequest()) {
        return;
      }

      const startPositionMillis = Math.max(0, Math.floor(startPositionSeconds * 1000));
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: fullQueue[safeIndex].url },
        {
          positionMillis: startPositionMillis,
          shouldPlay,
          progressUpdateIntervalMillis: 1000,
          volume: isMutedRef.current ? 0 : 1,
        },
        (nextStatus) => {
          handleFallbackStatusUpdate(nextStatus, requestId);
        },
        true,
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
  }, [clearLocalPlaybackState, handleFallbackStatusUpdate, isPlaybackRequestCurrent, setupFallbackAudioModeOnce, unloadFallbackSound, updateSharedQueueState]);

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
      } catch {
        // Ignore reset failures while clearing an empty queue.
      }

      if (!isCurrentRequest()) {
        return;
      }

      clearLocalPlaybackState(true);
      return;
    }

    const safeIndex = normalizeQueueIndex(fullQueue.length, targetIndex);
    const { initialQueue: playerQueue, remainingQueue } = buildInitialPlayerQueue(
      fullQueue,
      safeIndex,
      isAutoplayEnabledRef.current,
    );

    queueTransitionInFlightRef.current = true;

    try {
      const setupStartedAt = Date.now();
      await ensureRadioPlayerSetup();
      logRadioTuneInDebug("player-setup-ready", {
        durationMs: Date.now() - setupStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return;
      }

      const resetStartedAt = Date.now();
      playerQueueLengthRef.current = 0;
      await TrackPlayer.reset();
      logRadioTuneInDebug("player-reset-complete", {
        durationMs: Date.now() - resetStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return;
      }

      const addStartedAt = Date.now();
      await TrackPlayer.add(playerQueue);
      logRadioTuneInDebug("player-add-initial-complete", {
        durationMs: Date.now() - addStartedAt,
        requestId,
        tracks: playerQueue.length,
      });
      if (!isCurrentRequest()) {
        return;
      }

      playerQueueLengthRef.current = playerQueue.length;
      const volumeStartedAt = Date.now();
      await TrackPlayer.setVolume(isMutedRef.current ? 0 : 1);
      logRadioTuneInDebug("player-volume-complete", {
        durationMs: Date.now() - volumeStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return;
      }

      logRadioTuneInDebug("player-skip-initial-skipped", {
        reason: "queue-starts-at-live-track",
        requestId,
      });

      if (!shouldPlay && startPositionSeconds > 0) {
        await TrackPlayer.seekTo(startPositionSeconds);
        if (!isCurrentRequest()) {
          return;
        }
      }

      playWhenReadyRef.current = shouldPlay;
      playbackStateRef.current = shouldPlay ? State.Playing : State.Paused;
      updateSharedQueueState(stationData, fullQueue, safeIndex);

      if (shouldPlay) {
        const playStartedAt = Date.now();
        await TrackPlayer.play();
        logRadioTuneInDebug("player-play-complete", {
          durationMs: Date.now() - playStartedAt,
          requestId,
        });
        if (!isCurrentRequest()) {
          return;
        }

        setIsPlaying(true);
        if (startPositionSeconds > 0) {
          void TrackPlayer.seekTo(startPositionSeconds).then(() => {
            logRadioTuneInDebug("player-live-seek-complete", {
              positionSeconds: startPositionSeconds,
              requestId,
            });
          }).catch((error: unknown) => {
            console.warn("Radio live seek error:", error);
          });
        }
      } else {
        setIsPlaying(false);
      }

      void TrackPlayer.setRepeatMode(isAutoplayEnabledRef.current ? RepeatMode.Queue : RepeatMode.Off).catch((error: unknown) => {
        console.warn("Radio set repeat mode error:", error);
      });

      if (remainingQueue.length > 0) {
        void (async () => {
          if (!isCurrentRequest()) {
            return;
          }

          try {
            await TrackPlayer.add(remainingQueue);
            if (isCurrentRequest()) {
              playerQueueLengthRef.current = playerQueue.length + remainingQueue.length;
            }
          } catch (error) {
            console.warn("Radio append remaining queue error:", error);
          }
        })();
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
  }, [applyFallbackQueue, beginPlaybackRequest, clearLocalPlaybackState, isPlaybackRequestCurrent, updateSharedQueueState]);

  const playPreparedPlayerQueue = useCallback(async (
    stationData: any,
    fullQueue: RadioQueueTrack[],
    requestId: number,
    startPositionSeconds = 0,
  ) => {
    if (!isTrackPlayerAvailable || fullQueue.length === 0) {
      return false;
    }

    const isCurrentRequest = () => isPlaybackRequestCurrent(requestId);
    queueTransitionInFlightRef.current = true;

    try {
      const setupStartedAt = Date.now();
      await ensureRadioPlayerSetup();
      logRadioTuneInDebug("prepared-player-setup-ready", {
        durationMs: Date.now() - setupStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return false;
      }

      playerQueueLengthRef.current = Math.max(1, playerQueueLengthRef.current);
      const volumeStartedAt = Date.now();
      await TrackPlayer.setVolume(isMutedRef.current ? 0 : 1);
      logRadioTuneInDebug("prepared-player-volume-complete", {
        durationMs: Date.now() - volumeStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return false;
      }

      playWhenReadyRef.current = true;
      playbackStateRef.current = State.Playing;
      updateSharedQueueState(stationData, fullQueue, 0);

      const playStartedAt = Date.now();
      await TrackPlayer.play();
      logRadioTuneInDebug("prepared-player-play-complete", {
        durationMs: Date.now() - playStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return false;
      }

      setIsPlaying(true);
      if (startPositionSeconds > 0) {
        void TrackPlayer.seekTo(startPositionSeconds).then(() => {
          logRadioTuneInDebug("prepared-player-live-seek-complete", {
            positionSeconds: startPositionSeconds,
            requestId,
          });
        }).catch((error: unknown) => {
          console.warn("Radio prepared live seek error:", error);
        });
      }

      void TrackPlayer.setRepeatMode(isAutoplayEnabledRef.current ? RepeatMode.Queue : RepeatMode.Off).catch((error: unknown) => {
        console.warn("Radio prepared set repeat mode error:", error);
      });

      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        logRadioTuneInDebug("prepared-player-play-error", {
          message: error instanceof Error ? error.message : String(error),
          requestId,
          stationId: stationData?.id || "",
        });
      }
      return false;
    } finally {
      queueTransitionInFlightRef.current = false;
    }
  }, [isPlaybackRequestCurrent, updateSharedQueueState]);

  const playPreparedFallbackQueue = useCallback(async (
    stationData: any,
    fullQueue: RadioQueueTrack[],
    preparedSound: Audio.Sound,
    requestId: number,
    startPositionSeconds = 0,
  ) => {
    if (isTrackPlayerAvailable || fullQueue.length === 0) {
      return false;
    }

    const isCurrentRequest = () => isPlaybackRequestCurrent(requestId);

    try {
      const adoptStartedAt = Date.now();
      preparedFallbackSoundRef.current = null;
      await unloadFallbackSound();
      if (!isCurrentRequest()) {
        void preparedSound.unloadAsync().catch(() => {
          // Ignore cleanup failures for stale prepared sounds.
        });
        return false;
      }

      fallbackSoundRef.current = preparedSound;
      preparedSound.setOnPlaybackStatusUpdate((status) => {
        handleFallbackStatusUpdate(status, requestId);
      });
      updateSharedQueueState(stationData, fullQueue, 0);
      logRadioTuneInDebug("prepared-fallback-adopt-complete", {
        durationMs: Date.now() - adoptStartedAt,
        requestId,
      });

      const volumeStartedAt = Date.now();
      await preparedSound.setVolumeAsync(isMutedRef.current ? 0 : 1);
      logRadioTuneInDebug("prepared-fallback-volume-complete", {
        durationMs: Date.now() - volumeStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return false;
      }

      playWhenReadyRef.current = true;
      playbackStateRef.current = State.Playing;
      const playStartedAt = Date.now();
      await preparedSound.playAsync();
      logRadioTuneInDebug("prepared-fallback-play-complete", {
        durationMs: Date.now() - playStartedAt,
        requestId,
      });
      if (!isCurrentRequest()) {
        return false;
      }

      setIsPlaying(true);
      if (startPositionSeconds > 0) {
        void preparedSound.setPositionAsync(startPositionSeconds * 1000).then(() => {
          logRadioTuneInDebug("prepared-fallback-live-seek-complete", {
            positionSeconds: startPositionSeconds,
            requestId,
          });
        }).catch((error: unknown) => {
          console.warn("Radio prepared fallback live seek error:", error);
        });
      }

      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        logRadioTuneInDebug("prepared-fallback-play-error", {
          message: error instanceof Error ? error.message : String(error),
          requestId,
          stationId: stationData?.id || "",
        });
      }
      return false;
    }
  }, [handleFallbackStatusUpdate, isPlaybackRequestCurrent, unloadFallbackSound, updateSharedQueueState]);

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

  const hydrateFullQueueAfterFastStart = useCallback(async (
    stationData: any,
    requestId: number,
    currentOriginalQueueIndex: number,
    tuneInStartedAt: number,
  ) => {
    try {
      let hydratedStation = stationData;
      let fullQueueStartedAt = Date.now();
      let fullQueue = await buildStationQueue(hydratedStation);
      logRadioTuneInDebug("background-full-queue-built", {
        durationMs: Date.now() - fullQueueStartedAt,
        elapsedMs: Date.now() - tuneInStartedAt,
        queue: summarizeRadioQueueForDebug(fullQueue),
        requestId,
      });

      if (fullQueue.length === 0 && hydratedStation.__queueReady !== true) {
        const hydrateStartedAt = Date.now();
        hydratedStation = await ensureStationData(stationData);
        logRadioTuneInDebug("background-hydrate-complete", {
          durationMs: Date.now() - hydrateStartedAt,
          elapsedMs: Date.now() - tuneInStartedAt,
          requestId,
          station: summarizeRadioStationForDebug(hydratedStation),
        });

        fullQueueStartedAt = Date.now();
        fullQueue = await buildStationQueue(hydratedStation);
        logRadioTuneInDebug("background-full-queue-built-after-hydrate", {
          durationMs: Date.now() - fullQueueStartedAt,
          elapsedMs: Date.now() - tuneInStartedAt,
          queue: summarizeRadioQueueForDebug(fullQueue),
          requestId,
        });
      }

      if (!isPlaybackRequestCurrent(requestId) || fullQueue.length <= 1) {
        return;
      }

      fullQueueRef.current = fullQueue;
      activeStationRef.current = hydratedStation;
      setActiveStation(hydratedStation);
      setQueueLength(fullQueue.length);
      currentQueueIndexRef.current = currentOriginalQueueIndex;
      setCurrentQueueIndex(currentOriginalQueueIndex);

      if (!isTrackPlayerAvailable) {
        return;
      }

      const currentTrackIndex = fullQueue.findIndex((track) => track.queueIndex === currentOriginalQueueIndex);
      const safeCurrentIndex = currentTrackIndex >= 0 ? currentTrackIndex : 0;
      const remainingQueue = fullQueue
        .map((_, offset) => fullQueue[normalizeQueueIndex(fullQueue.length, safeCurrentIndex + offset + 1)])
        .filter((track) => track.queueIndex !== currentOriginalQueueIndex);

      if (remainingQueue.length === 0) {
        return;
      }

      const appendStartedAt = Date.now();
      await TrackPlayer.add(remainingQueue);
      playerQueueLengthRef.current = 1 + remainingQueue.length;
      logRadioTuneInDebug("background-queue-appended", {
        durationMs: Date.now() - appendStartedAt,
        elapsedMs: Date.now() - tuneInStartedAt,
        requestId,
        tracks: remainingQueue.length,
      });
    } catch (error) {
      logRadioTuneInDebug("background-full-queue-failed", {
        elapsedMs: Date.now() - tuneInStartedAt,
        message: error instanceof Error ? error.message : String(error),
        requestId,
      });
    }
  }, [ensureStationData, isPlaybackRequestCurrent]);

  const recordStationTuneIn = useCallback((stationData: any) => {
    const { playlistId, stationId } = getStationTuneInEventIds(stationData);
    if (!stationId && !playlistId) {
      logRadioTuneInDebug("record-event-skipped", {
        reason: "missing-station-and-playlist-id",
        station: summarizeRadioStationForDebug(stationData),
      });
      return;
    }

    const eventPayload = {
      action: "record_play_event",
      event_type: "station_tune_in",
      station_id: stationId || null,
      playlist_id: playlistId || null,
      item_id: null,
      platform: Platform.OS,
    };
    logRadioTuneInDebug("record-event-start", {
      payload: eventPayload,
      station: summarizeRadioStationForDebug(stationData),
    });

    void supabase.functions.invoke("manage-playlists", {
      body: eventPayload,
    }).then(({ error }) => {
      if (error) {
        logRadioTuneInDebug("record-event-error", {
          message: error.message,
          payload: eventPayload,
        });
        console.warn("Radio station tune-in event error:", error);
        return;
      }
      logRadioTuneInDebug("record-event-complete", {
        payload: eventPayload,
      });
    }).catch((error) => {
      logRadioTuneInDebug("record-event-exception", {
        message: error instanceof Error ? error.message : String(error),
        payload: eventPayload,
      });
      console.warn("Radio station tune-in event error:", error);
    });
  }, []);

  const tuneIn = useCallback(async (stationData: any, slotIdx = 0) => {
    if (!stationData) return;

    const stationId = typeof stationData?.id === "string" ? stationData.id : "";
    logRadioTuneInDebug("start", {
      activeStationId: activeStationRef.current?.id || "",
      currentQueueLength: fullQueueRef.current.length,
      isPlaying,
      requestedSlotIndex: slotIdx,
      station: summarizeRadioStationForDebug(stationData),
      stationId,
    });

    if (activeStationRef.current?.id === stationId && fullQueueRef.current.length > 0) {
      if (isPlaying) {
        logRadioTuneInDebug("current-station-already-playing", {
          stationId,
        });
        return;
      }

      if (isTrackPlayerAvailable) {
        logRadioTuneInDebug("resume-current-track-player", {
          stationId,
          playbackState: playbackStateRef.current,
        });
        if (playbackStateRef.current === State.Ended) {
          await TrackPlayer.seekTo(0);
        }

        playWhenReadyRef.current = true;
        await TrackPlayer.play();
        setIsPlaying(true);
        logRadioTuneInDebug("resume-current-track-player-complete", {
          stationId,
        });
        return;
      }

      const sound = fallbackSoundRef.current;
      if (!sound) {
        logRadioTuneInDebug("resume-current-fallback-missing-sound", {
          stationId,
        });
        return;
      }

      logRadioTuneInDebug("resume-current-fallback", {
        stationId,
      });
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.didJustFinish) {
        await sound.setPositionAsync(0);
      }

      playWhenReadyRef.current = true;
      playbackStateRef.current = State.Playing;
      await sound.playAsync();
      setIsPlaying(true);
      logRadioTuneInDebug("resume-current-fallback-complete", {
        stationId,
      });
      return;
    }

    const requestId = beginPlaybackRequest();
    if (stationId) {
      setLoadingStationId(stationId);
    }

    try {
      const tuneInStartedAt = Date.now();
      let playableStation = stationData;
      let fastCursor = getFastStationLiveCursor(playableStation, slotIdx);
      const prepareKey = getRadioPrepareKey(stationId, fastCursor.queueIndex);
      let preparedPlayerQueue = getPreparedPlayerQueueForStation(playableStation, fastCursor.queueIndex);
      let preparedFallbackQueue = preparedPlayerQueue
        ? null
        : getPreparedFallbackQueueForStation(playableStation, fastCursor.queueIndex);
      let preparedQueue =
        preparedPlayerQueue?.queue ||
        preparedFallbackQueue?.queue ||
        getPreparedQueueForStation(playableStation, fastCursor.queueIndex);

      const pendingPreparedQueueSnapshot = pendingPreparedQueueRef.current;
      if (!preparedQueue && pendingPreparedQueueSnapshot?.key === prepareKey) {
        const waitStartedAt = Date.now();
        logRadioTuneInDebug("pending-prepare-wait-start", {
          prepareKey,
          requestId,
          stationId,
          timeoutMs: RADIO_PREPARE_TAP_WAIT_MS,
        });
        const pendingPreparedQueue = await waitForPreparedQueue(
          pendingPreparedQueueSnapshot.promise,
          RADIO_PREPARE_TAP_WAIT_MS,
        );
        logRadioTuneInDebug("pending-prepare-wait-complete", {
          durationMs: Date.now() - waitStartedAt,
          prepareKey,
          prepared: Boolean(pendingPreparedQueue),
          preparedKey: pendingPreparedQueue?.key || "",
          requestId,
          stationId,
        });
        if (!isPlaybackRequestCurrent(requestId)) {
          logRadioTuneInDebug("aborted-stale-after-pending-prepare", {
            requestId,
          });
          return;
        }

        fastCursor = getFastStationLiveCursor(playableStation, slotIdx);
        preparedPlayerQueue = getPreparedPlayerQueueForStation(playableStation, fastCursor.queueIndex);
        preparedFallbackQueue = preparedPlayerQueue
          ? null
          : getPreparedFallbackQueueForStation(playableStation, fastCursor.queueIndex);
        preparedQueue =
          preparedPlayerQueue?.queue ||
          preparedFallbackQueue?.queue ||
          getPreparedQueueForStation(playableStation, fastCursor.queueIndex);
      }

      let queue: RadioQueueTrack[] = preparedQueue || [];
      if (preparedPlayerQueue) {
        logRadioTuneInDebug("prepared-player-hit", {
          elapsedMs: Date.now() - tuneInStartedAt,
          fastCursor,
          playerPreparedAgeMs: Date.now() - preparedPlayerQueue.playerPreparedAt,
          playerPreparedPositionSeconds: preparedPlayerQueue.playerPreparedPositionSeconds,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
      } else if (preparedFallbackQueue) {
        logRadioTuneInDebug("prepared-fallback-hit", {
          elapsedMs: Date.now() - tuneInStartedAt,
          fallbackPreparedAgeMs: Date.now() - preparedFallbackQueue.fallbackPreparedAt,
          fallbackPreparedPositionSeconds: preparedFallbackQueue.fallbackPreparedPositionSeconds,
          fastCursor,
          prepareKey: preparedFallbackQueue.key,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
      } else if (preparedQueue) {
        logRadioTuneInDebug("prepared-queue-hit", {
          elapsedMs: Date.now() - tuneInStartedAt,
          fastCursor,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
      } else {
        const initialQueueStartedAt = Date.now();
        queue = await buildStationQueue(playableStation, { onlyQueueIndex: fastCursor.queueIndex });
        logRadioTuneInDebug("queue-built-fast-current", {
          durationMs: Date.now() - initialQueueStartedAt,
          elapsedMs: Date.now() - tuneInStartedAt,
          fastCursor,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
      }
      if (!isPlaybackRequestCurrent(requestId)) {
        logRadioTuneInDebug("aborted-stale-after-initial-queue", {
          requestId,
        });
        return;
      }

      if (queue.length === 0 && playableStation.__queueReady !== true) {
        logRadioTuneInDebug("hydrate-station-details-start", {
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
        const hydrateStartedAt = Date.now();
        playableStation = await ensureStationData(stationData);
        logRadioTuneInDebug("hydrate-station-details-complete", {
          durationMs: Date.now() - hydrateStartedAt,
          elapsedMs: Date.now() - tuneInStartedAt,
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
        if (!isPlaybackRequestCurrent(requestId)) {
          logRadioTuneInDebug("aborted-stale-after-hydrate", {
            requestId,
          });
          return;
        }

        fastCursor = getFastStationLiveCursor(playableStation, slotIdx);
        const hydratedQueueStartedAt = Date.now();
        queue = await buildStationQueue(playableStation, { onlyQueueIndex: fastCursor.queueIndex });
        logRadioTuneInDebug("queue-built-fast-current-after-hydrate", {
          durationMs: Date.now() - hydratedQueueStartedAt,
          elapsedMs: Date.now() - tuneInStartedAt,
          fastCursor,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
        });
        if (!isPlaybackRequestCurrent(requestId)) {
          logRadioTuneInDebug("aborted-stale-after-hydrated-queue", {
            requestId,
          });
          return;
        }
      }

      if (queue.length === 0) {
        const fallbackFirstQueueStartedAt = Date.now();
        queue = await buildStationQueue(playableStation, { onlyQueueIndex: 0 });
        logRadioTuneInDebug("queue-built-fallback-first", {
          durationMs: Date.now() - fallbackFirstQueueStartedAt,
          elapsedMs: Date.now() - tuneInStartedAt,
          queue: summarizeRadioQueueForDebug(queue),
          requestId,
        });
        if (!isPlaybackRequestCurrent(requestId)) {
          logRadioTuneInDebug("aborted-stale-after-fallback-first-queue", {
            requestId,
          });
          return;
        }
      }

      if (queue.length === 0) {
        logRadioTuneInDebug("blocked-empty-queue", {
          requestId,
          station: summarizeRadioStationForDebug(playableStation),
        });
        clearLocalPlaybackState(true);
        return;
      }

      const currentOriginalQueueIndex = queue[0]?.queueIndex ?? fastCursor.queueIndex;
      const startIndex = 0;
      const startPositionSeconds = fastCursor.isSynchronized ? fastCursor.positionSeconds : 0;
      const currentPrepareKey = getRadioPrepareKey(stationId, currentOriginalQueueIndex);
      const cancelledPendingPrepareForDirectStart = !preparedPlayerQueue && !preparedFallbackQueue
        ? cancelPendingPrepareForDirectStart(currentPrepareKey, "no-prepared-fallback")
        : false;
      logRadioTuneInDebug("apply-player-queue-start", {
        cancelledPendingPrepareForDirectStart,
        fastCursor,
        currentOriginalQueueIndex,
        preparedFallbackReady: Boolean(preparedFallbackQueue),
        preparedPlayerReady: Boolean(preparedPlayerQueue),
        prepareKey: currentPrepareKey,
        queue: summarizeRadioQueueForDebug(queue),
        requestId,
        startIndex,
        startPositionSeconds,
        station: summarizeRadioStationForDebug(playableStation),
      });

      const playerApplyStartedAt = Date.now();
      const usedPreparedPlayer = preparedPlayerQueue
        ? await playPreparedPlayerQueue(
            playableStation,
            queue,
            requestId,
            startPositionSeconds,
          )
        : false;
      const usedPreparedFallback = !usedPreparedPlayer && preparedFallbackQueue
        ? await playPreparedFallbackQueue(
            playableStation,
            queue,
            preparedFallbackQueue.sound,
            requestId,
            startPositionSeconds,
          )
        : false;
      if (!usedPreparedPlayer && !usedPreparedFallback) {
        await applyPlayerQueue(
          playableStation,
          queue,
          startIndex,
          true,
          requestId,
          startPositionSeconds,
        );
      }
      logRadioTuneInDebug("apply-player-queue-complete", {
        cancelledPendingPrepareForDirectStart,
        durationMs: Date.now() - playerApplyStartedAt,
        elapsedMs: Date.now() - tuneInStartedAt,
        usedPreparedFallback,
        usedPreparedPlayer,
        requestId,
        stationId: playableStation?.id || "",
      });
      recordStationTuneIn(playableStation);
      setTimeout(() => {
        void hydrateFullQueueAfterFastStart(
          playableStation,
          requestId,
          currentOriginalQueueIndex,
          tuneInStartedAt,
        );
      }, 0);
    } catch (error) {
      logRadioTuneInDebug("error", {
        message: error instanceof Error ? error.message : String(error),
        requestId,
        station: summarizeRadioStationForDebug(stationData),
      });
      throw error;
    } finally {
      if (preparedQueueRef.current?.stationId === stationId) {
        preparedQueueRef.current = null;
      }
      if (stationId) {
        setLoadingStationId((currentId) => (currentId === stationId ? null : currentId));
      }
      logRadioTuneInDebug("finish", {
        requestId,
        stationId,
      });
    }
  }, [applyPlayerQueue, beginPlaybackRequest, cancelPendingPrepareForDirectStart, clearLocalPlaybackState, ensureStationData, getPreparedFallbackQueueForStation, getPreparedPlayerQueueForStation, getPreparedQueueForStation, hydrateFullQueueAfterFastStart, isPlaybackRequestCurrent, isPlaying, playPreparedFallbackQueue, playPreparedPlayerQueue, recordStationTuneIn]);

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
      } catch {
        // Fall through to queue-based previous-track playback.
      }
    } else {
      try {
        const status = await fallbackSoundRef.current?.getStatusAsync();
        if (status && status.isLoaded && status.positionMillis > 3000) {
          await fallbackSoundRef.current?.setPositionAsync(0);
          return;
        }
      } catch {
        // Fall through to queue-based previous-track playback.
      }
    }

    const previousIdx = normalizeQueueIndex(queue.length, currentQueueIndexRef.current - 1);
    await playQueueIndex(previousIdx);
  }, [playQueueIndex]);

  const togglePlayPause = useCallback(async () => {
    if (activeStationRef.current && fullQueueRef.current.length > 0 && isPlaying) {
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
  }, [isPlaying, playQueueIndex]);

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
    } catch {
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
    } catch {
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
          if (!activeStationRef.current && preparingPlayerStationRef.current) {
            return;
          }

          if (queueTransitionInFlightRef.current || playerQueueLengthRef.current > 0) {
            return;
          }

          setCurrentTrack(null);
          setCurrentSlotIndex(0);
          setCurrentQueueIndex(0);
          currentQueueIndexRef.current = 0;
          return;
        }

        const preparedQueue = preparedQueueRef.current;
        if (
          !activeStationRef.current &&
          (
            preparingPlayerStationRef.current ||
            (preparedQueue?.playerPreparedAt && nextTrack.stationId === preparedQueue.stationId)
          )
        ) {
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
      const preparedFallbackSound = preparedFallbackSoundRef.current;
      preparedFallbackSoundRef.current = null;
      if (preparedFallbackSound) {
        void preparedFallbackSound.unloadAsync().catch(() => {
          // Ignore teardown failures during unmount.
        });
      }
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
    prepareStation,
    tuneIn,
    skipPrevious,
    togglePlayPause,
    toggleMute,
    toggleAutoplay,
    skipNext,
    stop,
    syncStationData,
  }), [activeStation, currentTrack, currentSlotIndex, isAutoplayEnabled, isMuted, isPlaying, loadingStationId, prepareStation, queueLength, skipNext, skipPrevious, stop, syncStationData, toggleAutoplay, toggleMute, togglePlayPause, tuneIn]);

  const presenceValue = useMemo<RadioPlayerPresenceContextValue>(() => ({
    activeStation,
  }), [activeStation]);

  const playbackValue = useMemo<RadioPlayerPlaybackContextValue>(() => ({
    isMuted,
    isPlaying,
    loadingStationId,
  }), [isMuted, isPlaying, loadingStationId]);

  const actionsValue = useMemo<RadioPlayerActionsContextValue>(() => ({
    prepareStation,
    tuneIn,
    toggleMute,
    togglePlayPause,
    syncStationData,
  }), [prepareStation, syncStationData, toggleMute, togglePlayPause, tuneIn]);

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
        activeOpacity={1}
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

      <TouchableOpacity activeOpacity={1} onPress={() => void toggleMute()} style={styles.radioPlayerBtn}>
        <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={18} color={isMuted ? "#ef4444" : colors.text} />
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={1} onPress={() => void stop()} style={styles.radioPlayerBtn}>
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
