export type StationQueueEntry = {
  slot: any;
  playlist: any;
  item: any;
  slotIndex: number;
  itemIndex: number;
};

export const isStationTrackPlayable = (item: any) => (
  ['not_required', 'approved'].includes(String(item?.copyright_status || 'not_required').toLowerCase()) &&
  item?.teaser?.screen_result !== 'failed' && Boolean(
    item?.audio_url?.trim() || item?.audioUrl?.trim() || item?.storage_path?.trim() ||
    item?.teaser?.storage_path?.trim() || item?.teaser?.file_path?.trim()
  )
);

export const getStationQueueEntries = (station: any): StationQueueEntry[] => {
  const slots = Array.isArray(station?.live_slots) ? station.live_slots : station?.slots || [];
  if (Array.isArray(station?.playback_queue)) {
    return station.playback_queue.map((entry: any) => {
      const slotIndex = slots.findIndex((slot: any) => slot.id === entry.slot_id);
      const slot = slots[slotIndex] || null;
      return {slot, playlist: slot?.playlist, item: entry.item, slotIndex, itemIndex: entry.item_index};
    });
  }
  const entries = slots.flatMap((slot: any, slotIndex: number) => (
    slot.is_active === false || slot.playlist?.is_hidden === true ? [] :
      (slot.playlist?.items || []).flatMap((item: any, itemIndex: number) => (
        isStationTrackPlayable(item) ? [{slot, playlist: slot.playlist, item, slotIndex, itemIndex}] : []
      ))
  ));
  if (!Array.isArray(station?.queue_item_ids)) return entries;
  const byId = new Map<string, StationQueueEntry>(entries.map((entry: StationQueueEntry) => [entry.item.id, entry]));
  return station.queue_item_ids.flatMap((id: string) => byId.has(id) ? [byId.get(id)!] : []);
};

export const getStationQueueFingerprint = (station: any) => JSON.stringify([
  station?.queue_revision || 0, station?.is_active !== false,
  getStationQueueEntries(station).map(entry => [entry.item.id, String(entry.item.audio_url || '').split('?')[0], entry.item.duration_seconds, entry.item.teaser?.storage_path]),
]);

export const mergeStationSnapshot = (previous: any, incoming: any) => {
  if (Number(incoming?.queue_revision || 0) < Number(previous?.queue_revision || 0)) return previous;
  if (previous?.__queueReady && !incoming?.__queueReady) {
    // A summary cannot replace or relabel a loaded playback revision.
    const next = {...previous};
    for (const key of ['name', 'description', 'genre', 'cover_image_url', 'is_active', 'is_featured', 'listener_count', 'creator', 'managed_profile', 'managed_group']) {
      if (key in incoming) next[key] = incoming[key];
    }
    return next;
  }
  return {...previous, ...incoming};
};
