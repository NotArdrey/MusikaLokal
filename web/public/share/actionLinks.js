// Ordinary email destinations contain record IDs only. Auth callbacks use their
// dedicated verification flow and must never be saved as ordinary destinations.
export const ACTION_GATEWAY_URL = "https://musika-lokal.vercel.app/action";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOSTS = new Set(["musika-lokal.vercel.app", "musikalokal.app"]);
const ROUTES = {
    "/notifications": { params: {} },
    "/bookings": { params: { tab: ["Pending", "Applicants", "Active Musicians", "Upcoming", "Ongoing", "Review", "History"], bookingId: "id", applicationId: "id" } },
    "/group_application_cv": { required: "applicationId", params: { applicationId: "id" } },
    "/gig_feature_consent": { required: "applicationId", params: { applicationId: "id" } },
    "/manage_gig": { required: "id", params: { id: "id", tab: ["Applicants"] } },
    "/production_team": { required: "teamId", params: { teamId: "id", tab: ["Overview", "Members", "Applications", "Reviews"] } },
    "/wallet": { params: { section: ["outstanding"], bookingId: "id" } },
    "/orders": { params: { orderId: "id" } },
    "/feed": { params: { postId: "id", listingId: "id", reopenListingId: "id", listingType: ["profile", "artist", "musician", "group", "duo", "studio", "venue", "gig", "production_team", "production", "product", "playlist"] } },
    "/group_details": { required: "id", params: { id: "id" } },
    "/profile": { required: "userId", params: { userId: "id" } },
    "/post_details": { required: "post_id", params: { post_id: "id" } },
    "/product_details": { required: "product_id", params: { product_id: "id" } },
    "/playlist_details": { required: "playlist_id", params: { playlist_id: "id" } },
    "/station_details": { required: "station_id", params: { station_id: "id" } },
    "/account_details": { params: {} },
};
const DIRECT_ACTION_ROUTES = new Set([
    "/notifications", "/bookings", "/group_application_cv", "/gig_feature_consent", "/manage_gig", "/wallet", "/orders", "/account_details", "/station_details",
]);
export function normalizeActionDestination(raw) {
    try {
        // Nested destinations are local paths, never arbitrary URLs or credentials.
        if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\"))
            return null;
        const url = new URL(raw, ACTION_GATEWAY_URL);
        if (url.origin !== new URL(ACTION_GATEWAY_URL).origin || url.hash)
            return null;
        const route = ROUTES[url.pathname];
        if (!route || (route.required && !url.searchParams.get(route.required)))
            return null;
        const params = new URLSearchParams();
        for (const [key, value] of url.searchParams) {
            const rule = route.params[key];
            if (!rule || url.searchParams.getAll(key).length !== 1)
                return null;
            if (rule === "id" ? !UUID.test(value) : !rule.includes(value))
                return null;
            params.set(key, value);
        }
        if (url.pathname === "/feed" && params.has("listingId") && !params.has("listingType"))
            return null;
        return `${url.pathname}${params.size ? `?${params}` : ""}`;
    }
    catch {
        return null;
    }
}
export function getActionDestination(raw) {
    if (!raw)
        return null;
    try {
        const url = new URL(raw, ACTION_GATEWAY_URL);
        if (url.username || url.password || url.port || url.hash)
            return null;
        if (url.protocol !== "musikalokal:" && !(url.protocol === "https:" && HOSTS.has(url.hostname)))
            return null;
        const route = (url.protocol === "musikalokal:" ? `/${url.hostname}${url.pathname}` : url.pathname)
            .replace(/^\/+/, "/").replace(/^\/\(tabs\)\//, "/");
        if (route === "/action") {
            if (url.searchParams.size !== 1 || url.searchParams.getAll("destination").length !== 1)
                return null;
            return normalizeActionDestination(url.searchParams.get("destination") || "");
        }
        // Existing content shares retain their feed entry. Team application links
        // need their Applications tab rather than the generic team preview.
        if (DIRECT_ACTION_ROUTES.has(route) || (route === "/production_team" && url.searchParams.has("tab"))) {
            return normalizeActionDestination(route + url.search);
        }
    }
    catch {
        return null;
    }
    return null;
}
export function buildActionEmailUrl(meta, gatewayBase) {
    const params = new URLSearchParams();
    if (meta?.route_params && typeof meta.route_params === "object" && !Array.isArray(meta.route_params)) {
        for (const [key, value] of Object.entries(meta.route_params)) {
            if (typeof value === "string" || typeof value === "number")
                params.set(key, String(value));
        }
    }
    const path = typeof meta?.route === "string" ? meta.route : "";
    const destination = normalizeActionDestination(`${path}${params.size ? `?${params}` : ""}`) || "/notifications";
    let base = new URL(ACTION_GATEWAY_URL);
    try {
        const configured = new URL(gatewayBase || ACTION_GATEWAY_URL);
        if (configured.protocol === "https:" && HOSTS.has(configured.hostname) && !configured.username && !configured.password && !configured.port &&
            ["/", "/action"].includes(configured.pathname) && !configured.search && !configured.hash) {
            base = configured;
            base.pathname = "/action";
        }
    }
    catch {
        // Old custom-scheme settings use the HTTPS gateway after it is released.
    }
    base.searchParams.set("destination", destination);
    return base.toString();
}
