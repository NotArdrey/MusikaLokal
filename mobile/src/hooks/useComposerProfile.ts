import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { supabase } from "../../lib/supabase";
import { queryKeys } from "../data/queryKeys";
import { createRealtimeChannelTopic } from "../utils/realtimeChannel";

export const useComposerProfile = (userId: string | null) => {
  const { data, refetch } = useQuery({
    queryKey: queryKeys.auth.profile(userId),
    enabled: Boolean(userId),
    meta: { persist: false },
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .eq("id", userId!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return profile;
    },
  });

  useFocusEffect(useCallback(() => {
    if (userId) void refetch();
  }, [userId, refetch]));

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(createRealtimeChannelTopic(`composer-profile:${userId}`))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}`,
      }, () => { void refetch(); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refetch();
      });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => {
      subscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, refetch]);

  return userId && data?.id === userId ? data : null;
};
