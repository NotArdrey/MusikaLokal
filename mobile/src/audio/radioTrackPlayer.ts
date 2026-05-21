import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  isTrackPlayerAvailable,
} from "./safeTrackPlayer";
import { supabase } from "../../lib/supabase";

type RadioQueueEntry = {
  slotIndex: number;
  itemIndex: number;
  slot: any;
  playlist: any;
  item: any;
};

export type RadioQueueTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  description?: string;
  duration?: number;
  genre?: string;
  radioTrackId: string;
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

export type LiveStationCursor = {
  queueIndex: number;
  positionSeconds: number;
  isSynchronized: boolean;
};

const KNOWN_RADIO_MEDIA_BUCKETS = [
  "playlist-assets",
  "post-media",
  "posts",
  "images",
  "listings",
  "documents",
  "avatars",
];

const DEFAULT_SIGNED_URL_SECONDS = 24 * 60 * 60;
const DEFAULT_LIVE_TRACK_DURATION_SECONDS = 180;

let playerSetupPromise: Promise<void> | null = null;
let radioPlayerCapabilitiesKey = "";

type StorageObjectReference = {
  bucket: string;
  path: string;
};

const decodeStoragePath = (value: string) =>
  value
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");

const parseSupabaseStorageObjectReference = (
  value: unknown,
  fallbackBucket?: string,
): StorageObjectReference | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const storageUrlMatch = trimmed.match(
    /(?:^|\/)storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/i,
  );

  if (storageUrlMatch) {
    return {
      bucket: decodeURIComponent(storageUrlMatch[1]),
      path: decodeStoragePath(storageUrlMatch[2]),
    };
  }

  const normalized = trimmed.replace(/^\/+/, "").split(/[?#]/)[0];
  const parts = normalized.split("/");
  const directBucket = parts[0];

  if (parts.length > 1 && KNOWN_RADIO_MEDIA_BUCKETS.includes(directBucket)) {
    return {
      bucket: directBucket,
      path: parts.slice(1).join("/"),
    };
  }

  if (fallbackBucket && normalized) {
    return {
      bucket: fallbackBucket,
      path: normalized,
    };
  }

  return null;
};

const createSignedStorageUrl = async (storageRef: StorageObjectReference) => {
  try {
    const { data, error } = await supabase.storage
      .from(storageRef.bucket)
      .createSignedUrl(storageRef.path, DEFAULT_SIGNED_URL_SECONDS);

    if (data?.signedUrl) {
      return data.signedUrl;
    }

    if (error) {
      console.warn("Radio signed storage URL error:", {
        bucket: storageRef.bucket,
        message: error.message,
      });
    }
  } catch (error: any) {
    console.warn("Radio signed storage URL error:", {
      bucket: storageRef.bucket,
      message: error?.message || String(error),
    });
  }

  return "";
};

const resolveStorageAudioUri = async (value: unknown, fallbackBucket?: string) => {
  const storageRef = parseSupabaseStorageObjectReference(value, fallbackBucket);

  if (storageRef) {
    const signedUrl = await createSignedStorageUrl(storageRef);
    if (signedUrl) {
      return signedUrl;
    }
  }

  return resolveRadioMediaUrl(value);
};

const normalizeRelativeSupabaseStorageUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const envBase = (
    process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ""
  ).trim();

  if (!envBase) {
    return normalizedPath;
  }

  const base = envBase.endsWith("/") ? envBase.slice(0, -1) : envBase;
  return `${base}${normalizedPath}`;
};

export const resolveRadioMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.startsWith("/storage/v1/") || candidate.startsWith("storage/v1/")) {
    return normalizeRelativeSupabaseStorageUrl(candidate);
  }

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace(
      "/storage/v1/object/avatars/",
      "/storage/v1/object/public/avatars/",
    );
  }

  if (candidate.includes("/storage/v1/object/public/")) {
    return candidate.startsWith("/")
      ? normalizeRelativeSupabaseStorageUrl(candidate)
      : candidate;
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

const getTrackArtworkUrl = (stationData: any, slot: any, playlist: any, item: any) => {
  const candidates: unknown[] = [
    item?.cover_image_url,
    playlist?.cover_image_url,
  ];

  for (const value of candidates) {
    const resolved = resolveRadioMediaUrl(value);
    if (resolved) {
      return resolved;
    }
  }

  return "";
};

const normalizeDurationSeconds = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
};

const readTrimmedString = (value: unknown) => (
  typeof value === "string" ? value.trim() : ""
);

const readPublicStationArtistName = (stationData: any) => (
  readTrimmedString(stationData?.managed_group?.name) ||
  readTrimmedString(stationData?.managed_profile?.full_name) ||
  readTrimmedString(stationData?.name)
);

const readTimestampMs = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return timestampMs;
};

const readNonNegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const getStationAnchorTimestampMs = (stationData: any) => {
  const liveAnchorMs = readTimestampMs(stationData?.live_anchor_at);
  if (liveAnchorMs !== null) {
    return liveAnchorMs;
  }

  const stationSlots = Array.isArray(stationData?.live_slots)
    ? stationData.live_slots
    : Array.isArray(stationData?.slots)
      ? stationData.slots
      : [];

  const slotTimestamps = stationSlots.length > 0
    ? stationSlots
        .flatMap((slot: any) => [slot?.updated_at, slot?.created_at])
        .map(readTimestampMs)
        .filter((value: number | null): value is number => value !== null)
    : [];

  const stationTimestamps = [
    stationData?.updated_at,
    stationData?.created_at,
  ]
    .map(readTimestampMs)
    .filter((value): value is number => value !== null);

  const candidateTimestamps = [...slotTimestamps, ...stationTimestamps];
  if (candidateTimestamps.length === 0) {
    return null;
  }

  return Math.max(...candidateTimestamps);
};

const getSyncedLiveOffsetSeconds = (
  stationData: any,
  resolvedTrackDurations: number[],
  nowMs: number,
) => {
  const queueIndex = readNonNegativeNumber(stationData?.live_current_queue_index);
  const positionSeconds = readNonNegativeNumber(stationData?.live_position_seconds);

  if (
    queueIndex === null ||
    positionSeconds === null ||
    queueIndex >= resolvedTrackDurations.length
  ) {
    return null;
  }

  const syncedAtMs = readTimestampMs(stationData?.live_synced_at);
  const elapsedSinceSyncSeconds = syncedAtMs === null
    ? 0
    : Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000));
  const offsetBeforeTrack = resolvedTrackDurations
    .slice(0, Math.floor(queueIndex))
    .reduce((total, duration) => total + duration, 0);

  return offsetBeforeTrack + Math.floor(positionSeconds) + elapsedSinceSyncSeconds;
};

const resolveAudioUri = async (item: any) => {
  const directCandidates = [
    item?.audio_url,
    item?.audioUrl,
    item?.public_url,
    item?.publicUrl,
    item?.signed_url,
    item?.signedUrl,
    item?.url,
    item?.teaser?.audio_url,
    item?.teaser?.audioUrl,
    item?.teaser?.public_url,
    item?.teaser?.publicUrl,
    item?.teaser?.signed_url,
    item?.teaser?.signedUrl,
    item?.teaser?.url,
  ];

  for (const candidate of directCandidates) {
    const trimmed = readTrimmedString(candidate);
    if (!trimmed) {
      continue;
    }

    const resolved = /^(https?:\/\/|data:|file:\/\/)/i.test(trimmed)
      ? resolveRadioMediaUrl(trimmed)
      : await resolveStorageAudioUri(trimmed);
    if (resolved) {
      return resolved;
    }
  }

  const storagePath = [
    item?.teaser?.storage_path,
    item?.teaser?.file_path,
    item?.storage_path,
  ]
    .map(readTrimmedString)
    .find(Boolean) || "";

  return storagePath ? await resolveStorageAudioUri(storagePath, "playlist-assets") : "";
};

const buildStationQueueEntries = (stationData: any): RadioQueueEntry[] => {
  const slots = Array.isArray(stationData?.live_slots)
    ? stationData.live_slots
    : Array.isArray(stationData?.slots)
      ? stationData.slots
      : [];

  return slots.flatMap((slot: any, slotIndex: number) => {
    const playlist = slot?.playlist || null;
    const items = Array.isArray(playlist?.items) ? playlist.items : [];

    return items.map((item: any, itemIndex: number) => ({
      slotIndex,
      itemIndex,
      slot,
      playlist,
      item,
    }));
  });
};

const buildPlayerOptions = (_canSkipPrevious: boolean, _canSkipNext: boolean) => {
  return {
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      stopForegroundGracePeriod: 0,
    },
    capabilities: [Capability.Stop],
    notificationCapabilities: [Capability.Stop],
    compactCapabilities: [],
    progressUpdateEventInterval: 1,
  };
};

const getRadioPlayerCapabilitiesKey = (_canSkipPrevious: boolean, _canSkipNext: boolean) => "radio-stop-only";

export const ensureRadioPlayerSetup = async () => {
  if (!isTrackPlayerAvailable) {
    return;
  }

  if (!playerSetupPromise) {
    playerSetupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer({
          iosCategory: IOSCategory.Playback,
          autoHandleInterruptions: true,
          autoUpdateMetadata: true,
        });
      } catch (error: any) {
        const code = typeof error?.code === "string" ? error.code : "";
        const message = typeof error?.message === "string" ? error.message : "";
        const alreadyInitialized =
          code === "player_already_initialized" ||
          /already been initialized/i.test(message);

        if (!alreadyInitialized) {
          playerSetupPromise = null;
          throw error;
        }
      }

      await TrackPlayer.updateOptions(buildPlayerOptions(false, false));
      radioPlayerCapabilitiesKey = getRadioPlayerCapabilitiesKey(false, false);
    })();
  }

  return playerSetupPromise;
};

export const updateRadioPlayerCapabilities = async (
  canSkipPrevious: boolean,
  canSkipNext: boolean,
) => {
  if (!isTrackPlayerAvailable) {
    return;
  }

  const nextCapabilitiesKey = getRadioPlayerCapabilitiesKey(canSkipPrevious, canSkipNext);
  await ensureRadioPlayerSetup();
  if (radioPlayerCapabilitiesKey === nextCapabilitiesKey) {
    return;
  }

  await TrackPlayer.updateOptions(buildPlayerOptions(canSkipPrevious, canSkipNext));
  radioPlayerCapabilitiesKey = nextCapabilitiesKey;
};

type BuildStationQueueOptions = {
  onlyQueueIndex?: number | null;
};

export const buildStationQueue = async (
  stationData: any,
  options: BuildStationQueueOptions = {},
): Promise<RadioQueueTrack[]> => {
  const queueEntries = buildStationQueueEntries(stationData);
  const onlyQueueIndex = typeof options.onlyQueueIndex === "number"
    && Number.isFinite(options.onlyQueueIndex)
    && options.onlyQueueIndex >= 0
    ? Math.floor(options.onlyQueueIndex)
    : null;
  const entriesToResolve = onlyQueueIndex === null
    ? queueEntries.map((entry, queueIndex) => ({ entry, queueIndex }))
    : queueEntries[onlyQueueIndex]
      ? [{ entry: queueEntries[onlyQueueIndex], queueIndex: onlyQueueIndex }]
      : [];

  const tracks: Array<RadioQueueTrack | null> = await Promise.all(entriesToResolve.map(async ({ entry, queueIndex }) => {
    const url = await resolveAudioUri(entry.item);
    if (!url) {
      return null;
    }

    const itemId = typeof entry.item?.id === "string" && entry.item.id.trim().length > 0
      ? entry.item.id.trim()
      : `${entry.slotIndex}-${entry.itemIndex}`;
    const trackId = `${stationData?.id || "station"}:${queueIndex}:${itemId}`;
    const title = typeof entry.item?.title === "string" && entry.item.title.trim().length > 0
      ? entry.item.title.trim()
      : typeof entry.playlist?.title === "string" && entry.playlist.title.trim().length > 0
        ? entry.playlist.title.trim()
        : typeof entry.slot?.label === "string" && entry.slot.label.trim().length > 0
          ? entry.slot.label.trim()
          : `Track ${queueIndex + 1}`;
    const stationArtistName = readPublicStationArtistName(stationData);
    const artist = typeof entry.item?.artist_name === "string" && entry.item.artist_name.trim().length > 0
      ? entry.item.artist_name.trim()
      : stationArtistName || "MusikaLokal";
    const artwork = getTrackArtworkUrl(stationData, entry.slot, entry.playlist, entry.item);
    const track: RadioQueueTrack = {
      id: trackId,
      radioTrackId: trackId,
      stationId: typeof stationData?.id === "string" ? stationData.id : "",
      queueIndex,
      slotIndex: entry.slotIndex,
      itemIndex: entry.itemIndex,
      itemId,
      stationName: typeof stationData?.name === "string" ? stationData.name : "Station",
      playlistTitle: typeof entry.playlist?.title === "string" ? entry.playlist.title : "",
      slotLabel: typeof entry.slot?.label === "string" ? entry.slot.label : "",
      sourceArtistName: typeof entry.item?.artist_name === "string" ? entry.item.artist_name : "",
      url,
      title,
      artist,
      album: typeof entry.playlist?.title === "string" && entry.playlist.title.trim().length > 0
        ? entry.playlist.title.trim()
        : typeof stationData?.name === "string" && stationData.name.trim().length > 0
          ? stationData.name.trim()
          : "Live Station",
      artwork: artwork || undefined,
      description: typeof entry.slot?.label === "string" && entry.slot.label.trim().length > 0
        ? entry.slot.label.trim()
        : typeof stationData?.description === "string" && stationData.description.trim().length > 0
          ? stationData.description.trim()
          : undefined,
      duration: normalizeDurationSeconds(
        entry.item?.duration_seconds ?? entry.item?.teaser?.duration_seconds,
      ),
      genre: typeof stationData?.genre === "string" ? stationData.genre : undefined,
    };

    return track;
  }));

  return tracks
    .filter((track): track is RadioQueueTrack => track !== null)
    .sort((a, b) => a.queueIndex - b.queueIndex);
};

export const getLiveStationCursor = (
  stationData: any,
  fullQueue: RadioQueueTrack[],
  nowMs = Date.now(),
): LiveStationCursor => {
  if (fullQueue.length === 0) {
    return {
      queueIndex: 0,
      positionSeconds: 0,
      isSynchronized: false,
    };
  }

  const resolvedTrackDurations = fullQueue.map(
    (track) => normalizeDurationSeconds(track.duration) ?? DEFAULT_LIVE_TRACK_DURATION_SECONDS,
  );

  const loopDurationSeconds = resolvedTrackDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  if (loopDurationSeconds <= 0) {
    return {
      queueIndex: 0,
      positionSeconds: 0,
      isSynchronized: false,
    };
  }

  const syncedOffsetSeconds = getSyncedLiveOffsetSeconds(stationData, resolvedTrackDurations, nowMs);
  const anchorTimestampMs = getStationAnchorTimestampMs(stationData);
  if (syncedOffsetSeconds === null && !anchorTimestampMs) {
    return {
      queueIndex: 0,
      positionSeconds: 0,
      isSynchronized: false,
    };
  }

  const elapsedSeconds = syncedOffsetSeconds ?? Math.max(0, Math.floor((nowMs - anchorTimestampMs!) / 1000));
  let remainingOffsetSeconds = elapsedSeconds % loopDurationSeconds;

  for (let index = 0; index < resolvedTrackDurations.length; index += 1) {
    const durationSeconds = resolvedTrackDurations[index];
    if (remainingOffsetSeconds < durationSeconds) {
      return {
        queueIndex: index,
        positionSeconds: remainingOffsetSeconds,
        isSynchronized: true,
      };
    }

    remainingOffsetSeconds -= durationSeconds;
  }

  return {
    queueIndex: 0,
    positionSeconds: 0,
    isSynchronized: true,
  };
};
