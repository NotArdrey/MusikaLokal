import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../../lib/supabase";

export type GigFeaturedPerformer = {
  application_id: string;
  gig_id: string;
  display_name: string;
  avatar_url?: string | null;
  entity_type: "group" | "musician";
  profile_id?: string | null;
  group_id?: string | null;
  consented_at?: string | null;
};

const getGigIds = (items: any[]) =>
  Array.from(
    new Set(
      (items || [])
        .filter((item) => ["gig", "venue"].includes(String(item?.type || "").trim().toLowerCase()))
        .map((item) => item?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ).sort();

export const useGigFeaturedPerformers = (
  items: any[],
  options: { enabled?: boolean } = {},
) => {
  const [performersByGigId, setPerformersByGigId] = useState<Record<string, GigFeaturedPerformer[]>>({});
  const gigIds = useMemo(() => getGigIds(items), [items]);
  const requestKey = gigIds.join(",");
  const enabled = options.enabled !== false;

  useEffect(() => {
    let cancelled = false;
    const requestedGigIds = requestKey ? requestKey.split(",") : [];

    if (!enabled || requestedGigIds.length === 0) {
      setPerformersByGigId({});
      return () => {
        cancelled = true;
      };
    }

    const loadPerformers = async () => {
      const { data, error } = await supabase.rpc("get_gig_featured_performers_for_feed", {
        p_gig_ids: requestedGigIds,
      });

      let performerRows = Array.isArray(data) ? data : [];
      if (error) {
        const fallbackResults = await Promise.all(
          requestedGigIds.map((gigId) =>
            supabase.rpc("get_gig_featured_performers", { p_gig_id: gigId }),
          ),
        );
        performerRows = fallbackResults.flatMap((result) => Array.isArray(result.data) ? result.data : []);

        if (fallbackResults.every((result) => result.error)) {
          if (!cancelled) {
            console.warn("Failed to load featured gig performers for Feed", error.message);
            setPerformersByGigId({});
          }
          return;
        }
      }

      if (cancelled) return;

      const nextPerformers: Record<string, GigFeaturedPerformer[]> = {};
      performerRows.forEach((row: GigFeaturedPerformer) => {
        if (!row?.gig_id || !row?.application_id) return;
        const gigPerformers = nextPerformers[row.gig_id] || [];
        gigPerformers.push(row);
        nextPerformers[row.gig_id] = gigPerformers;
      });
      setPerformersByGigId(nextPerformers);
    };

    void loadPerformers();
    const channel = supabase
      .channel(`feed-featured-performers-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gig_applications" },
        () => void loadPerformers(),
      )
      .subscribe();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadPerformers();
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [enabled, requestKey]);

  return performersByGigId;
};
