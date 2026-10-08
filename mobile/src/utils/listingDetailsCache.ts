import { BoundedCache } from './BoundedCache';

export type ListingDetailsCacheEntry = {
  data: any;
  existingBookings: any[];
  fetchedAt: number;
};

export const LISTING_DETAILS_CACHE_TTL_MS = 60_000;

const listingDetailsCache = new BoundedCache<string, ListingDetailsCacheEntry>(40, LISTING_DETAILS_CACHE_TTL_MS);
const listingDetailsInFlight = new Set<string>();

export const getListingDetailsCacheEntry = (
  listingId: string | null | undefined,
) => {
  if (!listingId) return null;
  const cached = listingDetailsCache.get(listingId);
  if (cached && Date.now() - cached.fetchedAt >= LISTING_DETAILS_CACHE_TTL_MS) {
    listingDetailsCache.delete(listingId);
    return null;
  }
  return cached || null;
};

export const setListingDetailsCacheEntry = (
  listingId: string | null | undefined,
  entry: ListingDetailsCacheEntry,
) => {
  if (!listingId) return;
  listingDetailsCache.set(listingId, entry);
};

export const clearListingDetailsCache = (
  listingId?: string | null,
) => {
  if (listingId) {
    listingDetailsCache.delete(listingId);
    listingDetailsInFlight.delete(listingId);
    return;
  }

  listingDetailsCache.clear();
  listingDetailsInFlight.clear();
};

export const hasListingDetailsRequestInFlight = (
  listingId: string | null | undefined,
) => Boolean(listingId && listingDetailsInFlight.has(listingId));

export const markListingDetailsRequestInFlight = (
  listingId: string | null | undefined,
) => {
  if (listingId) listingDetailsInFlight.add(listingId);
};

export const clearListingDetailsRequestInFlight = (
  listingId: string | null | undefined,
) => {
  if (listingId) listingDetailsInFlight.delete(listingId);
};
