import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { invokeEdgeFunction } from "./api";
import { queryKeys } from "./queryKeys";

const FEED_PAGE_SIZE = 12;
const MARKETPLACE_PAGE_SIZE = 20;
const NAVBAR_PREFETCH_STALE_MS = 30_000;

type PaginatedResponse<T = any> = {
  data?: T[];
  items?: T[];
  nextCursor?: string | null;
  nextOffset?: number | null;
};

type NavbarColdBootPrefetchParams = {
  isGuest: boolean;
  roleResolved: boolean;
  sessionReady: boolean;
  userId?: string | null;
};

const startedAtByKey = new Map<string, number>();

const keyId = (queryKey: QueryKey) => JSON.stringify(queryKey);

const shouldPrefetch = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  staleMs = NAVBAR_PREFETCH_STALE_MS,
) => {
  const now = Date.now();
  const id = keyId(queryKey);
  const startedAt = startedAtByKey.get(id);

  if (startedAt && now - startedAt < staleMs) {
    return false;
  }

  const state = queryClient.getQueryState(queryKey);
  if (state?.dataUpdatedAt && now - state.dataUpdatedAt < staleMs) {
    return false;
  }

  startedAtByKey.set(id, now);
  return true;
};

const prefetchMarketplaceProducts = (queryClient: QueryClient) => {
  const queryKey = queryKeys.marketplace.products(null, true, MARKETPLACE_PAGE_SIZE);

  if (!shouldPrefetch(queryClient, queryKey)) {
    return Promise.resolve();
  }

  return queryClient.prefetchInfiniteQuery({
    getNextPageParam: (lastPage: PaginatedResponse) =>
      lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = Math.max(0, Number(pageParam) || 0);
      const response = await invokeEdgeFunction<PaginatedResponse>(
        "manage-marketplace",
        {
          body: {
            action: "browse_products",
            include_sold: true,
            limit: MARKETPLACE_PAGE_SIZE + 1,
            offset,
          },
        },
      );
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.items)
          ? response.items
          : [];
      const items = rows.slice(0, MARKETPLACE_PAGE_SIZE);

      return {
        ...response,
        data: items,
        items,
        nextOffset: rows.length > MARKETPLACE_PAGE_SIZE ? offset + MARKETPLACE_PAGE_SIZE : null,
      };
    },
    queryKey,
    staleTime: 30_000,
  });
};

const prefetchFeed = (queryClient: QueryClient, userId: string | null) => {
  const personalize = Boolean(userId);
  const queryKey = queryKeys.feed.list("for_you", userId, FEED_PAGE_SIZE, personalize);

  if (!shouldPrefetch(queryClient, queryKey)) {
    return Promise.resolve();
  }

  return queryClient.prefetchInfiniteQuery({
    getNextPageParam: (lastPage: PaginatedResponse) =>
      lastPage.nextCursor || undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      invokeEdgeFunction<PaginatedResponse>("manage-social-feed", {
        body: {
          action: "get_feed",
          cursor: pageParam,
          feed_type: personalize ? "for_you" : "public",
          include_entities: true,
          limit: FEED_PAGE_SIZE,
          personalize,
          ...(userId ? { userId } : {}),
        },
      }),
    queryKey,
    staleTime: 30_000,
  });
};

const prefetchBookings = (queryClient: QueryClient, userId: string | null) => {
  if (!userId) {
    return Promise.resolve();
  }

  const queryKey = queryKeys.bookings.summary(userId);
  if (!shouldPrefetch(queryClient, queryKey)) {
    return Promise.resolve();
  }

  return queryClient.prefetchQuery({
    queryFn: () =>
      invokeEdgeFunction("manage-bookings", {
        body: { action: "fetch", includeScreenPayload: true, userId },
      }),
    queryKey,
    staleTime: 30_000,
  });
};

export const prefetchMarketplaceProductDetails = (
  queryClient: QueryClient,
  productId: string | null | undefined,
) => {
  if (!productId) {
    return Promise.resolve();
  }

  const queryKey = queryKeys.marketplace.product(productId);
  if (!shouldPrefetch(queryClient, queryKey, 60_000)) {
    return Promise.resolve();
  }

  return queryClient.prefetchQuery({
    queryFn: () =>
      invokeEdgeFunction("manage-marketplace", {
        body: { action: "get_product_details", product_id: productId },
      }),
    queryKey,
    staleTime: 60_000,
  });
};

export const prefetchNavbarColdBootQueries = (
  queryClient: QueryClient,
  params: NavbarColdBootPrefetchParams,
) => {
  if (!params.sessionReady || params.isGuest) {
    return;
  }

  const userId = params.userId || null;
  void Promise.allSettled([
    prefetchMarketplaceProducts(queryClient),
    prefetchFeed(queryClient, userId),
    params.roleResolved ? prefetchBookings(queryClient, userId) : Promise.resolve(),
  ]);
};
