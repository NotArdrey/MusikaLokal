export const queryKeys = {
  auth: {
    profile: (userId: string | null | undefined) => ["auth", "profile", userId || "guest"] as const,
  },
  bookings: {
    summary: (userId: string | null | undefined) => ["bookings", "summary", userId || "guest"] as const,
  },
  details: {
    listing: (
      type: string | null | undefined,
      id: string | null | undefined,
      userId: string | null | undefined,
    ) => ["details", "listing", type || "unknown", id || "none", userId || "guest"] as const,
  },
  feed: {
    list: (tab: string, userId: string | null | undefined, limit?: number, personalize?: boolean) =>
      [
        "feed",
        tab,
        personalize === false ? "public" : userId || "guest",
        limit || "default",
        personalize === false ? "public-lite" : "personalized",
      ] as const,
    liveStations: (userId: string | null | undefined) => ["feed", "live-stations", userId || "guest"] as const,
  },
  home: {
    mobile: (
      userId: string | null | undefined,
      userRole: string | null | undefined,
      isGuest: boolean,
    ) => ["home", "mobile", userId || "guest", userRole || "guest", isGuest] as const,
  },
  notifications: {
    list: (userId: string | null | undefined) => ["notifications", userId || "guest"] as const,
  },
  search: {
    results: (params: Record<string, unknown>) => ["search", "results", params] as const,
  },
  wallet: {
    summary: (userId: string | null | undefined) => ["wallet", "summary", userId || "guest"] as const,
  },
} as const;

export const publicPersistQueryPrefixes = new Set(["search"]);
