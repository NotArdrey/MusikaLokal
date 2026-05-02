import { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { prepareRealtimeAuth, supabase } from "../../lib/supabase";
import { queryKeys } from "./queryKeys";

const INVALIDATION_DEBOUNCE_MS = 600;

type InvalidateScope =
  | "bookings"
  | "details"
  | "feed"
  | "home"
  | "notifications"
  | "search"
  | "wallet";

const tableScopes: Record<string, InvalidateScope[]> = {
  booking_requests: ["bookings", "details"],
  feed_posts: ["feed"],
  follows: ["feed", "search"],
  gig_applications: ["bookings", "details", "home"],
  gig_media: ["details", "home", "search"],
  gigs: ["bookings", "details", "home", "search"],
  group_media: ["details", "home", "search"],
  groups: ["bookings", "details", "home", "search"],
  notifications: ["notifications"],
  payout_methods: ["wallet"],
  post_media: ["feed"],
  post_reactions: ["feed"],
  profile_genres: ["home", "search"],
  profile_skills: ["home", "search"],
  profiles: ["bookings", "details", "feed", "home", "search", "wallet"],
  studio_bookings: ["bookings", "details", "wallet"],
  studio_date_overrides: ["details", "home", "search"],
  studio_media: ["details", "home", "search"],
  studio_promotions: ["home", "search"],
  studios: ["bookings", "details", "home", "search", "wallet"],
  wallet_transactions: ["wallet"],
  wallets: ["wallet"],
  withdrawal_requests: ["wallet"],
};

const invalidateScope = (
  queryClient: QueryClient,
  scope: InvalidateScope,
  userId: string | null | undefined,
) => {
  if (scope === "bookings") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.summary(userId) });
    return;
  }

  if (scope === "details") {
    void queryClient.invalidateQueries({ queryKey: ["details"] });
    return;
  }

  if (scope === "feed") {
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
    return;
  }

  if (scope === "home") {
    void queryClient.invalidateQueries({ queryKey: ["home"] });
    return;
  }

  if (scope === "notifications") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
    return;
  }

  if (scope === "search") {
    void queryClient.invalidateQueries({ queryKey: ["search"] });
    return;
  }

  if (scope === "wallet") {
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.summary(userId) });
  }
};

export const useGlobalRealtimeInvalidation = (
  queryClient: QueryClient,
  userId: string | null | undefined,
) => {
  const pendingScopesRef = useRef<Set<InvalidateScope>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      appStateSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const pendingScopes = pendingScopesRef.current;

    const clearFlushTimer = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };

    const flushInvalidations = () => {
      flushTimerRef.current = null;
      if (disposed || appStateRef.current !== "active") {
        pendingScopes.clear();
        return;
      }

      const scopes = Array.from(pendingScopes);
      pendingScopes.clear();
      scopes.forEach((scope) => invalidateScope(queryClient, scope, userId));
    };

    const queueInvalidation = (table: string) => {
      const scopes = tableScopes[table];
      if (!scopes) {
        return;
      }

      scopes.forEach((scope) => pendingScopes.add(scope));

      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(flushInvalidations, INVALIDATION_DEBOUNCE_MS);
      }
    };

    const connect = async () => {
      const authReady = await prepareRealtimeAuth();
      if (disposed || !authReady) {
        return;
      }

      channel = supabase.channel(`mobile-query-invalidation:${userId}`);

      Object.keys(tableScopes).forEach((table) => {
        channel?.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => queueInvalidation(table),
        );
      });

      channel.subscribe();
    };

    void connect();

    return () => {
      disposed = true;
      clearFlushTimer();
      pendingScopes.clear();
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [queryClient, userId]);
};
