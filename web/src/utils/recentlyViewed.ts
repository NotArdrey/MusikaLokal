export const RECENTLY_VIEWED_STORAGE_KEY = "recently_viewed_items";

export const getRecentlyViewedStorageKey = (
  userId?: string | null,
  isGuest = false,
) => {
  const ownerKey =
    !isGuest && typeof userId === "string" && userId.trim().length > 0
      ? userId.trim()
      : "guest";

  return `${RECENTLY_VIEWED_STORAGE_KEY}:${ownerKey}`;
};
