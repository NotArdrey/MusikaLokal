export const MUSIKALOKAL_WEB_URL = "https://musika-lokal.vercel.app";

const normalizeType = (type: string) => {
  const normalized = type.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["artist", "musician", "profile"].includes(normalized)) return "profile";
  if (normalized === "duo") return "group";
  if (["production", "production_team"].includes(normalized)) return "production_team";
  if (normalized === "music") return "playlist";
  return normalized;
};

export const buildListingShareUrl = (id: string, type: string) =>
  `${MUSIKALOKAL_WEB_URL}/feed?listingId=${encodeURIComponent(id)}&listingType=${encodeURIComponent(normalizeType(type))}`;
