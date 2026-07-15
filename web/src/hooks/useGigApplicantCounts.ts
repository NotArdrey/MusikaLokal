import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "../../lib/supabase";

const normalizeRole = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/[_\s]+/g, "-") : "";

const getGigIds = (items: any[]) =>
  Array.from(
    new Set(
      (items || [])
        .filter((item) => ["gig", "venue"].includes(String(item?.type || "").trim().toLowerCase()))
        .map((item) => item?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ).sort();

export const useGigApplicantCounts = (
  items: any[],
  options: { enabled?: boolean; isGuest?: boolean; userRole?: string | null } = {},
) => {
  const [countsByGigId, setCountsByGigId] = useState<Record<string, number>>({});
  const gigIds = useMemo(() => getGigIds(items), [items]);
  const requestKey = gigIds.join(",");
  const canView =
    options.enabled !== false &&
    options.isGuest !== true &&
    normalizeRole(options.userRole) !== "fan";

  useEffect(() => {
    let cancelled = false;
    const requestedGigIds = requestKey ? requestKey.split(",") : [];

    if (!canView || requestedGigIds.length === 0) {
      setCountsByGigId({});
      return () => {
        cancelled = true;
      };
    }

    const loadCounts = async () => {
      const { data, error } = await supabase.rpc("get_visible_gig_application_counts", {
        p_gig_ids: requestedGigIds,
      });

      if (cancelled) return;
      if (error) {
        console.warn("Failed to load gig applicant counts", error.message);
        setCountsByGigId({});
        return;
      }

      const nextCounts: Record<string, number> = {};
      requestedGigIds.forEach((gigId) => {
        nextCounts[gigId] = 0;
      });
      (Array.isArray(data) ? data : []).forEach((row: any) => {
        if (typeof row?.gig_id === "string") {
          nextCounts[row.gig_id] = Math.max(0, Number(row?.applicant_count || 0));
        }
      });
      setCountsByGigId(nextCounts);
    };

    void loadCounts();
    const channel = supabase
      .channel(`gig-applicant-counts-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gig_applications" },
        () => void loadCounts(),
      )
      .subscribe();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadCounts();
    });
    return () => {
      cancelled = true;
      appStateSubscription.remove();
      void supabase.removeChannel(channel);
    };
  }, [canView, requestKey]);

  return countsByGigId;
};
