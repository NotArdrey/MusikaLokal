export const MUSIKALOKAL_WEB_URL = "https://musikalokal.app";
export const PENDING_SHARE_STORAGE_KEY = "pending_share_destination";

const normalizeType = (type: string) => {
  const normalized = type.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["artist", "musician", "profile"].includes(normalized)) return "profile";
  if (normalized === "duo") return "group";
  if (["production", "production_team"].includes(normalized)) return "production_team";
  if (normalized === "music") return "playlist";
  return normalized;
};

const LISTING_TYPES = new Set([
  "profile", "group", "studio", "venue", "gig", "production_team", "product", "playlist",
]);

export const buildPostShareUrl = (postId: string) =>
  `${MUSIKALOKAL_WEB_URL}/feed?postId=${encodeURIComponent(postId)}`;

export const buildListingShareUrl = (id: string, type: string) =>
  `${MUSIKALOKAL_WEB_URL}/feed?listingId=${encodeURIComponent(id)}&listingType=${encodeURIComponent(normalizeType(type))}`;

// Normalize current shares and links sent by older APKs to the same feed entry.
export function getShareDestination(path: string): string | null {
  try {
    const url = new URL(path, MUSIKALOKAL_WEB_URL);
    if (url.username || url.password || url.port) return null;
    if (url.protocol !== "musikalokal:" &&
        !(["https:", "http:"].includes(url.protocol) && url.hostname === "musikalokal.app")) return null;
    const route = (url.protocol === "musikalokal:"
      ? `${url.hostname}${url.pathname}` : url.pathname).replace(/^\/+|\/+$/g, "").replace(/^\(tabs\)\//, "");
    let postId: string | null = null;
    let id: string | null = null;
    let type = "";
    if (route === "feed" || route === "home") {
      postId = url.searchParams.get("postId");
      id = url.searchParams.get("listingId") || url.searchParams.get("reopenListingId");
      type = normalizeType(url.searchParams.get("listingType") || "");
    } else if (route === "group_details") {
      id = url.searchParams.get("id");
      type = "group";
    } else if (route === "profile") {
      id = url.searchParams.get("userId");
      type = "profile";
    } else if (route === "production_team") {
      id = url.searchParams.get("teamId");
      type = "production_team";
    } else if (route === "product_details") {
      id = url.searchParams.get("product_id");
      type = "product";
    } else if (route === "playlist_details") {
      id = url.searchParams.get("playlist_id");
      type = "playlist";
    }
    if (postId?.trim()) return `/feed?postId=${encodeURIComponent(postId)}`;
    if (id?.trim() && LISTING_TYPES.has(type)) {
      return `/feed?listingId=${encodeURIComponent(id)}&listingType=${encodeURIComponent(type)}`;
    }
  } catch {
    // Invalid incoming links should fall through to the router.
  }
  return null;
}
