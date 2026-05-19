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
import { supabase } from "../../lib/supabase";

export const RADIO_MINI_PLAYER_HEIGHT = 60;
export const RADIO_MINI_PLAYER_STACK_GAP = 8;

type RadioQueueTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  duration?: number;
  artwork?: string;
  stationId: string;
  queueIndex: number;
  slotIndex: number;
  itemIndex: number;
  itemId: string;
  stationName: string;
  playlistTitle: string;
  slotLabel: string;
  sourceArtistName: string;
  isLiveStream?: boolean;
};

type RadioPlayerContextValue = {
  activeStation: any | null;
  currentTrack: RadioQueueTrack | null;
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

const KNOWN_RADIO_MEDIA_BUCKETS = ["post-media", "posts", "images", "listings", "documents", "avatars"];
const DEFAULT_SIGNED_URL_SECONDS = 24 * 60 * 60;

const RadioPlayerContext = createContext<RadioPlayerContextValue | undefined>(undefined);

const normalizeQueueIndex = (queueLength: number, index: number) => {
  if (queueLength <= 0) return 0;
  return ((index % queueLength) + queueLength) % queueLength;
};

const normalizeRelativeSupabaseStorageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const envBase = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  if (!envBase) return normalizedPath;

  const base = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
  return `${base}${normalizedPath}`;
};

const resolveRadioMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.startsWith("/storage/v1/") || candidate.startsWith("storage/v1/")) {
    return normalizeRelativeSupabaseStorageUrl(candidate);
  }

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
  }

  if (candidate.includes("/storage/v1/object/public/")) {
    return candidate.startsWith("/") ? normalizeRelativeSupabaseStorageUrl(candidate) : candidate;
  }

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) {
    return candidate;
  }

  const normalized = candidate.replace(/^\/+/, "");
  const directParts = normalized.split("/");

  if (directParts.length > 1) {
    const directBucket = directParts[0];
    const directPath = directParts.slice(1).join("/");
    const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
    if (data?.publicUrl) return data.publicUrl;
  }

  for (const bucket of KNOWN_RADIO_MEDIA_BUCKETS) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }

  return normalized;
};

const isLikelyBrowserAudioUrl = (value: unknown) => {
  if (typeof value !== "string") return false;
  const candidate = value.trim();
  if (!candidate) return false;
  if (/^data:audio\//i.test(candidate)) return true;
  if (candidate.startsWith("/storage/v1/") || candidate.includes("/storage/v1/object/")) return true;
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm)(?:[?#].*)?$/i.test(candidate);
};

const normalizeDurationSeconds = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
};

const readTimestampMs = (value: unknown) => {
  if (typeof value !== "string") return null;
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : null;
};

const readTrimmedString = (value: unknown) => (
  typeof value === "string" ? value.trim() : ""
);

const getStationBroadcastStreamUrl = (stationData: any) => {
  const streamUrl = readTrimmedString(stationData?.stream_url);
  if (!streamUrl || stationData?.is_active === false) return "";

  const streamStatus = readTrimmedString(stationData?.stream_status).toLowerCase();
  if (streamStatus !== "live") return "";

  return streamUrl;
};

const buildStationBroadcastTrack = (stationData: any): RadioQueueTrack | null => {
  const streamUrl = getStationBroadcastStreamUrl(stationData);
  if (!streamUrl) return null;

  const stationId = readTrimmedString(stationData?.id) || "station";
  const stationName = readTrimmedString(stationData?.name) || "Live Station";
  const artist =
    readTrimmedString(stationData?.now_playing_artist) ||
    readTrimmedString(stationData?.managed_profile?.full_name) ||
    readTrimmedString(stationData?.creator?.full_name) ||
    "MusikaLokal";
  const title = readTrimmedString(stationData?.now_playing_title) || stationName;
  const artwork = resolveRadioMediaUrl(
    stationData?.cover_image_url ||
    stationData?.managed_profile?.avatar_url ||
    stationData?.creator?.avatar_url,
  );

  return {
    id: `${stationId}:live-stream`,
    itemId: `${stationId}:live-stream`,
    stationId,
    queueIndex: 0,
    slotIndex: 0,
    itemIndex: 0,
    stationName,
    playlistTitle: "Live broadcast",
    slotLabel: "Live",
    sourceArtistName: artist,
    url: streamUrl,
    title,
    artist,
    artwork: artwork || undefined,
    isLiveStream: true,
  };
};

const getStationAnchorTimestampMs = (stationData: any) => {
  const stationSlots = Array.isArray(stationData?.live_slots)
    ? stationData.live_slots
    : Array.isArray(stationData?.slots)
      ? stationData.slots
      : [];

  const slotTimestamps = stationSlots
    .flatMap((slot: any) => [slot?.updated_at, slot?.created_at, slot?.starts_at])
    .map(readTimestampMs)
    .filter((value: number | null): value is number => value !== null);

  const stationTimestamps = [stationData?.live_anchor_at, stationData?.updated_at, stationData?.created_at]
    .map(readTimestampMs)
    .filter((value): value is number => value !== null);

  const timestamps = [...slotTimestamps, ...stationTimestamps];
  return timestamps.length > 0 ? Math.max(...timestamps) : null;
};

const getNextRotationRefreshDelayMs = (stationData: any) => {
  const parsed = Number(stationData?.rotation_interval_minutes);
  const intervalMinutes = Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), 5), 120) : 15;
  const intervalMs = intervalMinutes * 60 * 1000;
  const anchorMs = Date.parse(stationData?.live_anchor_at || stationData?.updated_at || stationData?.created_at || "");
  const nowMs = Date.now();

  if (!Number.isFinite(anchorMs)) return intervalMs;

  const elapsedIntervals = anchorMs >= nowMs ? 0 : Math.floor((nowMs - anchorMs) / intervalMs);
  return Math.max((anchorMs + ((elapsedIntervals + 1) * intervalMs)) - nowMs + 1000, 1000);
};

const getStationSlots = (stationData: any) => {
  if (Array.isArray(stationData?.live_slots)) return stationData.live_slots;
  return Array.isArray(stationData?.slots) ? stationData.slots : [];
};

const resolveAudioUri = async (item: any) => {
  const storagePath = typeof item?.teaser?.storage_path === "string" ? item.teaser.storage_path.trim() : "";

  if (storagePath) {
    const { data, error } = await supabase.storage
      .from("playlist-assets")
      .createSignedUrl(storagePath, DEFAULT_SIGNED_URL_SECONDS);

    if (data?.signedUrl) return data.signedUrl;
    if (error) console.warn("Radio signed URL error:", error.message);
  }

  const audioUrl = typeof item?.audio_url === "string" ? item.audio_url.trim() : "";
  return isLikelyBrowserAudioUrl(audioUrl) ? resolveRadioMediaUrl(audioUrl) : "";
};

const buildStationQueue = async (stationData: any): Promise<RadioQueueTrack[]> => {
  const slots = getStationSlots(stationData);
  const entries = slots.flatMap((slot: any, slotIndex: number) => {
    const playlist = slot?.playlist || null;
    const items = Array.isArray(playlist?.items) ? playlist.items : [];

    return items.map((item: any, itemIndex: number) => ({ slot, slotIndex, playlist, item, itemIndex }));
  });

  const tracks = await Promise.all(entries.map(async (entry: any, queueIndex: number) => {
    const url = await resolveAudioUri(entry.item);
    if (!url) return null;

    const itemId = typeof entry.item?.id === "string" && entry.item.id.trim()
      ? entry.item.id.trim()
      : `${entry.slotIndex}-${entry.itemIndex}`;
    const title = typeof entry.item?.title === "string" && entry.item.title.trim()
      ? entry.item.title.trim()
      : entry.playlist?.title || entry.slot?.label || `Track ${queueIndex + 1}`;
    const artist = typeof entry.item?.artist_name === "string" && entry.item.artist_name.trim()
      ? entry.item.artist_name.trim()
      : stationData?.creator?.full_name || stationData?.name || "MusikaLokal";
    const artwork = resolveRadioMediaUrl(
      entry.item?.cover_image_url ||
      entry.playlist?.cover_image_url ||
      stationData?.cover_image_url ||
      stationData?.creator?.avatar_url ||
      entry.slot?.image_url,
    );

    return {
      id: `${stationData?.id || "station"}:${queueIndex}:${itemId}`,
      itemId,
      stationId: typeof stationData?.id === "string" ? stationData.id : "",
      queueIndex,
      slotIndex: entry.slotIndex,
      itemIndex: entry.itemIndex,
      stationName: stationData?.name || "Station",
      playlistTitle: entry.playlist?.title || "",
      slotLabel: entry.slot?.label || "",
      sourceArtistName: entry.item?.artist_name || "",
      url,
      title,
      artist,
      duration: normalizeDurationSeconds(entry.item?.duration_seconds ?? entry.item?.teaser?.duration_seconds),
      artwork: artwork || undefined,
    };
  }));

  return tracks.filter((track): track is RadioQueueTrack => track !== null);
};

const getLiveStationCursor = (stationData: any, fullQueue: RadioQueueTrack[]) => {
  if (fullQueue.length === 0) return { queueIndex: 0, positionSeconds: 0, isSynchronized: false };

  const durations = fullQueue.map((track) => normalizeDurationSeconds(track.duration));
  if (durations.some((duration) => duration === undefined)) {
    return { queueIndex: 0, positionSeconds: 0, isSynchronized: false };
  }

  const anchorTimestampMs = getStationAnchorTimestampMs(stationData);
  if (!anchorTimestampMs) return { queueIndex: 0, positionSeconds: 0, isSynchronized: false };

  const resolvedDurations = durations as number[];
  const loopDurationSeconds = resolvedDurations.reduce((sum, duration) => sum + duration, 0);
  if (loopDurationSeconds <= 0) return { queueIndex: 0, positionSeconds: 0, isSynchronized: false };

  let remainingOffsetSeconds = Math.max(0, Math.floor((Date.now() - anchorTimestampMs) / 1000)) % loopDurationSeconds;

  for (let index = 0; index < resolvedDurations.length; index += 1) {
    if (remainingOffsetSeconds < resolvedDurations[index]) {
      return { queueIndex: index, positionSeconds: remainingOffsetSeconds, isSynchronized: true };
    }

    remainingOffsetSeconds -= resolvedDurations[index];
  }

  return { queueIndex: 0, positionSeconds: 0, isSynchronized: true };
};

const seekAudioWhenReady = async (audio: HTMLAudioElement, positionSeconds: number) => {
  const applySeek = () => {
    if (positionSeconds <= 0) return;

    try {
      audio.currentTime = Math.max(0, positionSeconds);
    } catch (error) {
      console.warn("Radio seek error:", error);
    }
  };

  if (audio.readyState >= 1) {
    applySeek();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      audio.removeEventListener("loadedmetadata", finish);
      audio.removeEventListener("error", finish);
      resolve();
    };
    const fail = () => {
      audio.removeEventListener("loadedmetadata", finish);
      audio.removeEventListener("error", fail);
      reject(new Error(audio.error?.message || "The element has no supported sources."));
    };

    audio.addEventListener("loadedmetadata", finish, { once: true });
    audio.addEventListener("error", fail, { once: true });
  });

  applySeek();
};

export function RadioPlayerProvider({ children }: { children: ReactNode }) {
  const [activeStation, setActiveStation] = useState<any | null>(null);
  const [currentTrack, setCurrentTrack] = useState<RadioQueueTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [queueLength, setQueueLength] = useState(0);
  const [loadingStationId, setLoadingStationId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeStationRef = useRef<any | null>(null);
  const queueRef = useRef<RadioQueueTrack[]>([]);
  const currentQueueIndexRef = useRef(0);
  const isMutedRef = useRef(false);
  const isAutoplayEnabledRef = useRef(true);
  const requestIdRef = useRef(0);

  const ensureAudio = useCallback(() => {
    if (audioRef.current || typeof Audio === "undefined") return audioRef.current;

    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    return audio;
  }, []);

  const beginRequest = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  const fetchStationDetails = useCallback(async (stationId: string) => {
    const { data, error } = await supabase.functions.invoke("manage-playlists", {
      body: { action: "get_station_details", station_id: stationId },
    });

    if (error) throw error;
    return data?.data ? { ...data.data, __queueReady: true } : null;
  }, []);

  const ensureStationData = useCallback(async (stationData: any) => {
    if (!stationData?.id || stationData?.__queueReady) return stationData;

    try {
      return await fetchStationDetails(stationData.id) || stationData;
    } catch (error) {
      console.warn("Radio station detail fetch error:", error);
      return stationData;
    }
  }, [fetchStationDetails]);

  const setQueueState = useCallback((stationData: any, queue: RadioQueueTrack[], queueIndex: number) => {
    const safeIndex = normalizeQueueIndex(queue.length, queueIndex);
    const track = queue[safeIndex] || null;

    activeStationRef.current = stationData;
    queueRef.current = queue;
    currentQueueIndexRef.current = safeIndex;
    setActiveStation(stationData);
    setCurrentTrack(track);
    setCurrentSlotIndex(track?.slotIndex ?? 0);
    setQueueLength(queue.length);
  }, []);

  const playQueueIndex = useCallback(async (queueIndex: number, shouldPlay = true, startPositionSeconds = 0) => {
    const stationData = activeStationRef.current;
    const queue = queueRef.current;
    const audio = ensureAudio();
    if (!stationData || queue.length === 0 || !audio) return;

    const requestId = beginRequest();
    let lastError: unknown = null;

    for (let attempt = 0; attempt < queue.length; attempt += 1) {
      const safeIndex = normalizeQueueIndex(queue.length, queueIndex + attempt);
      const track = queue[safeIndex];
      const seekSeconds = attempt === 0 ? startPositionSeconds : 0;

      try {
        setQueueState(stationData, queue, safeIndex);
        audio.pause();
        audio.src = track.url;
        audio.volume = isMutedRef.current ? 0 : 1;
        audio.load();
        await seekAudioWhenReady(audio, seekSeconds);

        if (!shouldPlay) {
          setIsPlaying(false);
          return;
        }

        await audio.play();
        if (requestId === requestIdRef.current) setIsPlaying(true);
        return;
      } catch (error) {
        lastError = error;
        console.warn("Radio track failed, trying next source:", {
          title: track.title,
          url: track.url,
          message: error instanceof Error ? error.message : String(error),
        });

        if (requestId !== requestIdRef.current) return;
      }
    }

    setIsPlaying(false);
    throw lastError instanceof Error
      ? lastError
      : new Error("No playable radio tracks are available.");
  }, [beginRequest, ensureAudio, setQueueState]);

  const tuneIn = useCallback(async (stationData: any, slotIdx = 0) => {
    if (!stationData) return;

    const stationId = typeof stationData?.id === "string" ? stationData.id : "";
    const audio = ensureAudio();

    if (activeStationRef.current?.id === stationId && queueRef.current.length > 0 && audio) {
      if (!audio.paused) {
        audio.pause();
        setIsPlaying(false);
        return;
      }

      await audio.play();
      setIsPlaying(true);
      return;
    }

    const requestId = beginRequest();
    if (stationId) setLoadingStationId(stationId);

    try {
      const playableStation = await ensureStationData(stationData);
      if (requestId !== requestIdRef.current) return;

      const broadcastTrack = buildStationBroadcastTrack(playableStation);
      if (broadcastTrack) {
        activeStationRef.current = playableStation;
        queueRef.current = [broadcastTrack];
        setQueueLength(1);
        setActiveStation(playableStation);
        await playQueueIndex(0, true, 0);
        return;
      }

      const queue = await buildStationQueue(playableStation);
      if (requestId !== requestIdRef.current) return;

      if (queue.length === 0) {
        queueRef.current = [];
        setQueueLength(0);
        setCurrentTrack(null);
        setIsPlaying(false);
        return;
      }

      activeStationRef.current = playableStation;
      queueRef.current = queue;
      setQueueLength(queue.length);
      setActiveStation(playableStation);

      const liveCursor = getLiveStationCursor(playableStation, queue);
      const slotIndexMatch = Math.max(queue.findIndex((entry) => entry.slotIndex === slotIdx), 0);
      await playQueueIndex(
        liveCursor.isSynchronized ? liveCursor.queueIndex : slotIndexMatch,
        true,
        liveCursor.isSynchronized ? liveCursor.positionSeconds : 0,
      );
    } finally {
      if (stationId) {
        setLoadingStationId((currentId) => (currentId === stationId ? null : currentId));
      }
    }
  }, [beginRequest, ensureAudio, ensureStationData, playQueueIndex]);

  const togglePlayPause = useCallback(async () => {
    const audio = ensureAudio();
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (!audio.src && queueRef.current.length > 0) {
      await playQueueIndex(currentQueueIndexRef.current);
      return;
    }

    await audio.play();
    setIsPlaying(true);
  }, [ensureAudio, playQueueIndex]);

  const skipNext = useCallback(async () => {
    if (queueRef.current.length === 0) return;
    await playQueueIndex(currentQueueIndexRef.current + 1);
  }, [playQueueIndex]);

  const skipPrevious = useCallback(async () => {
    const audio = ensureAudio();
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (queueRef.current.length === 0) return;
    await playQueueIndex(currentQueueIndexRef.current - 1);
  }, [ensureAudio, playQueueIndex]);

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) audioRef.current.volume = nextMuted ? 0 : 1;
  }, []);

  const toggleAutoplay = useCallback(() => {
    const nextAutoplay = !isAutoplayEnabledRef.current;
    isAutoplayEnabledRef.current = nextAutoplay;
    setIsAutoplayEnabled(nextAutoplay);
  }, []);

  const stop = useCallback(async () => {
    beginRequest();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    activeStationRef.current = null;
    queueRef.current = [];
    currentQueueIndexRef.current = 0;
    setActiveStation(null);
    setCurrentTrack(null);
    setCurrentSlotIndex(0);
    setQueueLength(0);
    setIsPlaying(false);
  }, [beginRequest]);

  const syncStationData = useCallback((stationData: any) => {
    if (!stationData?.id) return;

    setActiveStation((previous: any) => {
      if (!previous || previous.id !== stationData.id) return previous;
      const nextStation = {
        ...previous,
        ...stationData,
        live_slots: previous.__queueReady && !stationData.__queueReady
          ? previous.live_slots || stationData.live_slots || []
          : stationData.live_slots || previous.live_slots || [],
        slots: previous.__queueReady && !stationData.__queueReady
          ? previous.slots || stationData.slots || []
          : stationData.slots || previous.slots || [],
        __queueReady: previous.__queueReady || stationData.__queueReady,
      };
      activeStationRef.current = nextStation;
      return nextStation;
    });
  }, []);

  useEffect(() => {
    const audio = ensureAudio();
    if (!audio) return undefined;

    const handleEnded = () => {
      if (isAutoplayEnabledRef.current && queueRef.current.length > 0) {
        void playQueueIndex(currentQueueIndexRef.current + 1).catch((error) => {
          console.warn("Radio autoplay error:", error);
          setIsPlaying(false);
        });
        return;
      }

      setIsPlaying(false);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
    };
  }, [ensureAudio, playQueueIndex]);

  useEffect(() => {
    if (!activeStation?.id || queueRef.current.length === 0 || activeStation?.is_active === false) {
      return undefined;
    }

    if (getStationBroadcastStreamUrl(activeStation)) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      const stationId = activeStation.id;

      void (async () => {
        try {
          const refreshedStation = await fetchStationDetails(stationId);
          if (!refreshedStation) return;

          const queue = await buildStationQueue(refreshedStation);
          if (queue.length === 0) return;

          const liveCursor = getLiveStationCursor(refreshedStation, queue);
          activeStationRef.current = refreshedStation;
          queueRef.current = queue;
          setQueueState(refreshedStation, queue, liveCursor.queueIndex);
          await playQueueIndex(liveCursor.queueIndex, isPlaying, liveCursor.positionSeconds);
        } catch (error) {
          console.warn("Radio live rotation refresh error:", error);
        }
      })();
    }, getNextRotationRefreshDelayMs(activeStation));

    return () => clearTimeout(timeoutId);
  }, [activeStation, fetchStationDetails, isPlaying, playQueueIndex, setQueueState]);

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
  }), [
    activeStation,
    currentSlotIndex,
    currentTrack,
    isAutoplayEnabled,
    isMuted,
    isPlaying,
    loadingStationId,
    queueLength,
    skipNext,
    skipPrevious,
    stop,
    syncStationData,
    toggleAutoplay,
    toggleMute,
    togglePlayPause,
    tuneIn,
  ]);

  return <RadioPlayerContext.Provider value={value}>{children}</RadioPlayerContext.Provider>;
}

export function useRadioPlayer() {
  const context = useContext(RadioPlayerContext);
  if (!context) {
    throw new Error("useRadioPlayer must be used within a RadioPlayerProvider");
  }
  return context;
}

export function GlobalRadioMiniPlayer() {
  return null;
}
