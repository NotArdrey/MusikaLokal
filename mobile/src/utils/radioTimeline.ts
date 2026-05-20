const DEFAULT_LIVE_TRACK_DURATION_SECONDS = 180;

type TimelineEntry = {
  durationSeconds: number;
  item: any | null;
  itemIndex: number;
  queueIndex: number;
  slot: any | null;
  slotIndex: number;
};

export type StationLiveTimelineState = {
  durationSeconds: number;
  item: any | null;
  itemIndex: number;
  loopDurationSeconds: number;
  positionSeconds: number;
  queueIndex: number;
  slot: any | null;
  slotIndex: number;
  synchronized: boolean;
};

const readTimestampMs = (value: unknown) => {
  if (typeof value !== "string") return null;
  const timestampMs = Date.parse(value);
  return Number.isFinite(timestampMs) ? timestampMs : null;
};

const readNonNegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const readNonNegativeIndex = (value: unknown) => {
  const parsed = readNonNegativeNumber(value);
  return parsed === null ? null : Math.floor(parsed);
};

const normalizeLiveDurationSeconds = (value: unknown, fallback = DEFAULT_LIVE_TRACK_DURATION_SECONDS) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.round(parsed))
    : fallback;
};

const getStationSlots = (station: any) => {
  if (Array.isArray(station?.live_slots) && station.live_slots.length > 0) return station.live_slots;
  return Array.isArray(station?.slots) ? station.slots : [];
};

const hasPlaylistItemAudioSource = (item: any) => Boolean(
  (typeof item?.audio_url === "string" && item.audio_url.trim().length > 0) ||
  (typeof item?.audioUrl === "string" && item.audioUrl.trim().length > 0) ||
  (typeof item?.storage_path === "string" && item.storage_path.trim().length > 0) ||
  (typeof item?.teaser?.storage_path === "string" && item.teaser.storage_path.trim().length > 0) ||
  (typeof item?.teaser?.file_path === "string" && item.teaser.file_path.trim().length > 0)
);

const getSlotFallbackDurationSeconds = (slot: any, station: any) => {
  const playlist = slot?.playlist || {};
  const playlistDuration = readNonNegativeNumber(playlist?.total_duration_seconds);
  if (playlistDuration && playlistDuration > 0) {
    return Math.max(1, Math.round(playlistDuration));
  }

  const trackCount = readNonNegativeNumber(playlist?.track_count);
  if (trackCount && trackCount > 0) {
    return Math.max(1, Math.round(trackCount) * DEFAULT_LIVE_TRACK_DURATION_SECONDS);
  }

  const rotationMinutes = readNonNegativeNumber(station?.rotation_interval_minutes);
  return Math.max(1, Math.round(rotationMinutes || 15) * 60);
};

const getTimelineEntries = (station: any): TimelineEntry[] => {
  const slots = getStationSlots(station);
  const entries = slots.flatMap((slot: any, slotIndex: number) => {
    const playlist = slot?.playlist || {};
    const playlistItems = Array.isArray(playlist?.items) ? playlist.items : [];
    const playableItems = playlistItems.filter(hasPlaylistItemAudioSource);

    if (playableItems.length === 0) {
      return [{
        durationSeconds: getSlotFallbackDurationSeconds(slot, station),
        item: null,
        itemIndex: 0,
        queueIndex: 0,
        slot,
        slotIndex,
      }];
    }

    return playableItems.map((item: any, itemIndex: number) => ({
      durationSeconds: normalizeLiveDurationSeconds(item?.duration_seconds ?? item?.teaser?.duration_seconds),
      item,
      itemIndex,
      queueIndex: 0,
      slot,
      slotIndex,
    }));
  });

  return entries.map((entry: TimelineEntry, queueIndex: number) => ({ ...entry, queueIndex }));
};

const sumDurationsBeforeIndex = (entries: TimelineEntry[], queueIndex: number) => (
  entries.slice(0, Math.max(0, queueIndex)).reduce((total, entry) => total + entry.durationSeconds, 0)
);

const getLiveOffsetSeconds = (station: any, entries: TimelineEntry[], nowMs: number) => {
  const syncedQueueIndex = readNonNegativeIndex(station?.live_current_queue_index);
  const syncedPositionSeconds = readNonNegativeNumber(station?.live_position_seconds);

  if (
    syncedQueueIndex !== null &&
    syncedQueueIndex < entries.length &&
    syncedPositionSeconds !== null
  ) {
    const syncedAtMs = readTimestampMs(station?.live_synced_at);
    const elapsedSinceSyncSeconds = syncedAtMs === null
      ? 0
      : Math.max(0, Math.floor((nowMs - syncedAtMs) / 1000));

    return sumDurationsBeforeIndex(entries, syncedQueueIndex) +
      Math.floor(syncedPositionSeconds) +
      elapsedSinceSyncSeconds;
  }

  const anchorMs = readTimestampMs(station?.live_anchor_at);
  if (anchorMs !== null) {
    return Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
  }

  return null;
};

export const getStationLiveTimelineState = (
  station: any,
  nowMs = Date.now(),
): StationLiveTimelineState => {
  const entries = getTimelineEntries(station);
  const fallbackSlot = station?.live_current_slot || getStationSlots(station)[0] || null;
  const fallbackItem = station?.live_current_item || null;

  if (entries.length === 0) {
    return {
      durationSeconds: normalizeLiveDurationSeconds(station?.live_duration_seconds ?? station?.live_current_duration_seconds),
      item: fallbackItem,
      itemIndex: readNonNegativeIndex(station?.live_current_item_index) ?? 0,
      loopDurationSeconds: normalizeLiveDurationSeconds(station?.live_loop_duration_seconds, 0),
      positionSeconds: Math.floor(readNonNegativeNumber(station?.live_position_seconds) ?? 0),
      queueIndex: readNonNegativeIndex(station?.live_current_queue_index) ?? 0,
      slot: fallbackSlot,
      slotIndex: readNonNegativeIndex(station?.live_current_slot_index) ?? 0,
      synchronized: false,
    };
  }

  const loopDurationSeconds = entries.reduce((total, entry) => total + entry.durationSeconds, 0);
  const offsetSeconds = getLiveOffsetSeconds(station, entries, nowMs);

  if (!loopDurationSeconds || offsetSeconds === null) {
    const fallbackQueueIndex = readNonNegativeIndex(station?.live_current_queue_index) ?? 0;
    const entry = entries[fallbackQueueIndex] || entries[0];

    return {
      durationSeconds: entry.durationSeconds,
      item: station?.live_current_item || entry.item,
      itemIndex: readNonNegativeIndex(station?.live_current_item_index) ?? entry.itemIndex,
      loopDurationSeconds,
      positionSeconds: Math.floor(readNonNegativeNumber(station?.live_position_seconds) ?? 0),
      queueIndex: entry.queueIndex,
      slot: station?.live_current_slot || entry.slot,
      slotIndex: readNonNegativeIndex(station?.live_current_slot_index) ?? entry.slotIndex,
      synchronized: false,
    };
  }

  let remainingOffsetSeconds = offsetSeconds % loopDurationSeconds;
  for (const entry of entries) {
    if (remainingOffsetSeconds < entry.durationSeconds) {
      return {
        durationSeconds: entry.durationSeconds,
        item: entry.item,
        itemIndex: entry.itemIndex,
        loopDurationSeconds,
        positionSeconds: remainingOffsetSeconds,
        queueIndex: entry.queueIndex,
        slot: entry.slot,
        slotIndex: entry.slotIndex,
        synchronized: true,
      };
    }

    remainingOffsetSeconds -= entry.durationSeconds;
  }

  const firstEntry = entries[0];
  return {
    durationSeconds: firstEntry.durationSeconds,
    item: firstEntry.item,
    itemIndex: firstEntry.itemIndex,
    loopDurationSeconds,
    positionSeconds: 0,
    queueIndex: firstEntry.queueIndex,
    slot: firstEntry.slot,
    slotIndex: firstEntry.slotIndex,
    synchronized: true,
  };
};
