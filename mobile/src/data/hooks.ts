import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { invokeEdgeFunction } from "./api";
import { queryKeys } from "./queryKeys";
import { logLoadTime } from "../utils/loadTimeLogger";

export type PaginatedResponse<T> = {
  data?: T[];
  items?: T[];
  nextCursor?: string | null;
  nextOffset?: number | null;
  unreadCount?: number;
  [key: string]: unknown;
};

const isApprovedProfile = (profile: any) =>
  profile?.is_verified === true &&
  String(profile?.verification_status || "").toUpperCase() === "APPROVED";

export const useHomeDataQuery = (params: {
  enabled?: boolean;
  isGuest: boolean;
  userId?: string | null;
  userRole?: string | null;
}) => {
  return useQuery({
    enabled: params.enabled ?? true,
    meta: { persist: params.isGuest || !params.userId },
    placeholderData: keepPreviousData,
    queryFn: () =>
      invokeEdgeFunction("home-feed", {
        body: {
          action: "mobile_home",
          isGuest: params.isGuest,
          userId: params.userId || null,
          userRole: params.userRole || null,
        },
      }),
    queryKey: queryKeys.home.mobile(params.userId, params.userRole, params.isGuest),
    staleTime: 60_000,
  });
};

export const useSearchResultsQuery = <TItem = any>(params: {
  activeFilter: string;
  enabled?: boolean;
  isGuest: boolean;
  isOwner: boolean;
  minRating: number;
  pageSize: number;
  priceRange: string;
  query: string;
  selectedGenre: string;
  sortBy: string;
}) => {
  const body = {
    activeFilter: params.activeFilter,
    isGuest: params.isGuest,
    isOwner: params.isOwner,
    limit: params.pageSize,
    minRating: params.minRating,
    priceRange: params.priceRange,
    query: params.query,
    selectedGenre: params.selectedGenre,
    sortBy: params.sortBy,
  };

  return useInfiniteQuery({
    enabled: params.enabled ?? true,
    getNextPageParam: (lastPage: PaginatedResponse<TItem>) => lastPage.nextCursor || undefined,
    initialPageParam: null as string | null,
    meta: { persist: true },
    queryFn: ({ pageParam }) =>
      invokeEdgeFunction<PaginatedResponse<TItem>>("search-content", {
        body: {
          ...body,
          cursor: pageParam,
        },
      }),
    queryKey: queryKeys.search.results(body),
    staleTime: 60_000,
  });
};

export const useNotificationsQuery = <TItem = any>(
  userId: string | null | undefined,
  options?: { enabled?: boolean; limit?: number },
) => {
  const limit = options?.limit ?? 30;

  return useInfiniteQuery({
    enabled: Boolean(userId) && (options?.enabled ?? true),
    getNextPageParam: (lastPage: PaginatedResponse<TItem>) => lastPage.nextCursor || undefined,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      invokeEdgeFunction<PaginatedResponse<TItem>>("manage-notifications", {
        body: {
          action: "fetch",
          cursor: pageParam,
          limit,
          userId,
        },
      }),
    queryKey: queryKeys.notifications.list(userId),
    staleTime: 30_000,
  });
};

export const useWalletSummaryQuery = <TData = any>(
  userId: string | null | undefined,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    enabled: Boolean(userId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    queryFn: () =>
      invokeEdgeFunction<TData>("withdrawals", {
        body: { action: "get_wallet_summary" },
      }),
    queryKey: queryKeys.wallet.summary(userId),
    staleTime: 30_000,
  });
};

export const useBookingsSummaryQuery = <TData = any>(
  userId: string | null | undefined,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    enabled: Boolean(userId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    queryFn: () =>
      invokeEdgeFunction<TData>("manage-bookings", {
        body: { action: "fetch", includeScreenPayload: true, userId },
      }),
    queryKey: queryKeys.bookings.summary(userId),
    staleTime: 30_000,
  });
};

export const useListingDetailsQuery = <TData = any>(params: {
  enabled?: boolean;
  id: string | null | undefined;
  type: string | null | undefined;
  userId?: string | null;
}) => {
  return useQuery({
    enabled: Boolean(params.id && params.type) && (params.enabled ?? true),
    meta: { persist: !params.userId },
    placeholderData: keepPreviousData,
    queryFn: () =>
      invokeEdgeFunction<TData>("manage-details", {
        body: {
          action: "fetch",
          id: params.id,
          type: String(params.type || "").toLowerCase(),
          userId: params.userId || null,
        },
      }),
    queryKey: queryKeys.details.listing(params.type, params.id, params.userId),
    staleTime: 60_000,
  });
};

export const useFeedQuery = <TItem = any>(params: {
  enabled?: boolean;
  feedTab: string;
  feedType: string;
  limit: number;
  personalize?: boolean;
  userId?: string | null;
}) => {
  const resolvedUserId = params.userId || null;
  const personalize = (params.personalize ?? true) && Boolean(resolvedUserId);
  const feedType =
    params.feedTab === "for_you" && personalize
      ? "for_you"
      : params.feedType;
  const usePublicDirectRead = feedType === "public" && !personalize;
  const getPageItems = (page: PaginatedResponse<TItem>) =>
    Array.isArray(page?.items)
      ? page.items
      : Array.isArray(page?.data)
        ? page.data
        : [];
  const fetchFeedPage = (body: Record<string, unknown>) =>
    invokeEdgeFunction<PaginatedResponse<TItem>>("manage-social-feed", {
      body,
    });

  return useInfiniteQuery({
    enabled: (feedType === "public" || Boolean(resolvedUserId)) && (params.enabled ?? true),
    getNextPageParam: (lastPage: PaginatedResponse<TItem>) => lastPage.nextCursor || undefined,
    initialPageParam: null as string | null,
    meta: { persist: feedType === "public" && !personalize },
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      if (usePublicDirectRead) {
        const startedAt = Date.now();
        let query = supabase
          .from("feed_posts")
          .select(
            "id, author_id, post_type, content, visibility, is_pinned, linked_playlist_id, linked_product_id, reaction_count, comment_count, share_count, created_at, updated_at, author:profiles!author_id(id, full_name, avatar_url, role, is_verified, verification_status), media:post_media(id, post_id, media_type, storage_path, mime_type, width, height, duration_seconds, display_order)",
          )
          .eq("visibility", "public")
          .eq("is_hidden", false)
          .order("created_at", { ascending: false })
          .limit(params.limit + 1);

        if (typeof pageParam === "string" && pageParam.trim().length > 0) {
          query = query.lt("created_at", pageParam);
        }

        const { data, error } = await query;
        const durationMs = Date.now() - startedAt;

        if (error) {
          logLoadTime("PostgREST:feed_posts", "failed", {
            durationMs,
            limit: params.limit,
            message: error.message,
          });
          throw error;
        }

        const rows = data || [];
        const visibleRows = rows.filter((row: any) => isApprovedProfile(row?.author));
        const items = visibleRows.slice(0, params.limit) as TItem[];
        const cursorRow = visibleRows.length > 0
          ? visibleRows[Math.min(visibleRows.length, params.limit) - 1]
          : rows[Math.min(rows.length, params.limit) - 1];
        const nextCursor =
          rows.length > params.limit
            ? (cursorRow as any)?.created_at || null
            : null;

        logLoadTime("PostgREST:feed_posts", "complete", {
          cursor: pageParam ? "present" : undefined,
          durationMs,
          limit: params.limit,
          returned: items.length,
        });

        return {
          data: items,
          items,
          nextCursor,
        } as PaginatedResponse<TItem>;
      }

      const feedPayload = {
        action: "get_feed",
        cursor: pageParam,
        feed_type: feedType,
        include_entities: true,
        limit: params.limit,
        personalize,
        ...(resolvedUserId ? { userId: resolvedUserId } : {}),
      };
      const firstPage = await fetchFeedPage(feedPayload);
      const firstPosts = getPageItems(firstPage);

      if (params.feedTab === "for_you" && !pageParam && firstPosts.length === 0) {
        logLoadTime("Feed", "public-fallback-start", {
          userId: resolvedUserId,
        });

        const publicFallback = await fetchFeedPage({
          action: "get_feed",
          cursor: undefined,
          feed_type: "public",
          include_entities: true,
          limit: params.limit,
          personalize: false,
          ...(resolvedUserId ? { userId: resolvedUserId } : {}),
        });
        const fallbackPosts = getPageItems(publicFallback);

        logLoadTime("Feed", "public-fallback-complete", {
          posts: fallbackPosts.length,
        });

        if (fallbackPosts.length > 0) {
          return publicFallback;
        }
      }

      return firstPage;
    },
    queryKey: queryKeys.feed.list(params.feedTab, resolvedUserId, params.limit, personalize),
    staleTime: 30_000,
  });
};

export const useMarketplaceProductsQuery = <TItem = any>(params: {
  category?: string | null;
  enabled?: boolean;
  includeSold?: boolean;
  limit: number;
}) => {
  const includeSold = params.includeSold ?? true;

  return useInfiniteQuery({
    enabled: params.enabled ?? true,
    getNextPageParam: (lastPage: PaginatedResponse<TItem>) =>
      lastPage.nextOffset ?? undefined,
    initialPageParam: 0,
    meta: { persist: true },
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const offset = Math.max(0, Number(pageParam) || 0);
      const body: Record<string, unknown> = {
        action: "browse_products",
        include_sold: includeSold,
        limit: params.limit + 1,
        offset,
      };

      if (params.category) {
        body.category = params.category;
      }

      const response = await invokeEdgeFunction<PaginatedResponse<TItem>>(
        "manage-marketplace",
        { body },
      );
      const rows = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.items)
          ? response.items
          : [];
      const items = rows.slice(0, params.limit);

      return {
        ...response,
        data: items,
        items,
        nextOffset: rows.length > params.limit ? offset + params.limit : null,
      } as PaginatedResponse<TItem>;
    },
    queryKey: queryKeys.marketplace.products(params.category, includeSold, params.limit),
    staleTime: 30_000,
  });
};

export const useSellerProductsQuery = <TData = any>(
  userId: string | null | undefined,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    enabled: Boolean(userId) && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    queryFn: () =>
      invokeEdgeFunction<TData>("manage-marketplace", {
        body: { action: "list_my_products", userId },
      }),
    queryKey: queryKeys.marketplace.sellerProducts(userId),
    staleTime: 30_000,
  });
};

export const useMarketplaceProductDetailsQuery = <TData = any>(
  productId: string | null | undefined,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    enabled: Boolean(productId) && (options?.enabled ?? true),
    meta: { persist: true },
    placeholderData: keepPreviousData,
    queryFn: () =>
      invokeEdgeFunction<TData>("manage-marketplace", {
        body: { action: "get_product_details", product_id: productId },
      }),
    queryKey: queryKeys.marketplace.product(productId),
    staleTime: 60_000,
  });
};
