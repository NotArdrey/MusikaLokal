export const getStationArtistName = (station: any): string =>
  station?.managed_group?.name || station?.managed_profile?.full_name || station?.creator?.full_name || "";

export const getStationArtwork = (station: any): string =>
  station?.cover_image_url || station?.managed_profile?.avatar_url || station?.creator?.avatar_url ||
  station?.slots?.find((slot: any) => slot?.playlist?.cover_image_url)?.playlist?.cover_image_url || "";

export const getStationUpcomingEntries = <T,>(entries: T[], currentIndex: number): T[] => {
  if (entries.length <= 1) return [];
  const index = Math.max(0, Math.min(entries.length - 1, currentIndex));
  return entries.slice(index + 1).concat(entries.slice(0, index));
};
