export type StationQueueSelection = {playlistIds: string[]; trackIds: string[]};

export const moveQueueItem = (ids: string[], id: string, direction: number) => {
  const index = ids.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
};

export const shuffleStationQueue = (ids: string[], random = Math.random) => {
  const next = [...ids];
  for (let index = next.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
};

export const createStationSelection = (playlistIds: string[], playlists: any[], savedTrackIds?: string[] | null): StationQueueSelection => {
  const available = playlistIds.flatMap(id => (playlists.find(playlist => playlist.id === id)?.items || []).map((item: any) => item.id));
  return {playlistIds, trackIds: Array.isArray(savedTrackIds) ? savedTrackIds.filter(id => available.includes(id)) : available};
};

export const toggleStationPlaylist = (selection: StationQueueSelection, playlist: any): StationQueueSelection => {
  const trackIds = (playlist.items || []).map((item: any) => item.id);
  return selection.playlistIds.includes(playlist.id)
    ? {playlistIds: selection.playlistIds.filter(id => id !== playlist.id), trackIds: selection.trackIds.filter(id => !trackIds.includes(id))}
    : {playlistIds: [...selection.playlistIds, playlist.id], trackIds: [...selection.trackIds, ...trackIds.filter((id: string) => !selection.trackIds.includes(id))]};
};

export const moveStationPlaylist = (selection: StationQueueSelection, playlists: any[], id: string, direction: number): StationQueueSelection => {
  const playlistIds = moveQueueItem(selection.playlistIds, id, direction);
  if (playlistIds === selection.playlistIds) return selection;
  const trackPlaylist = new Map<string, string>(playlists.flatMap(playlist => (playlist.items || []).map((item: any) => [item.id, playlist.id])));
  return {playlistIds, trackIds: playlistIds.flatMap(playlistId => selection.trackIds.filter(trackId => trackPlaylist.get(trackId) === playlistId))};
};
