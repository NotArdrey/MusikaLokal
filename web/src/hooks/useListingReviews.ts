import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

const getReviewTargetColumn = (type: string | null | undefined) => {
  const normalized = (type || "").trim().toLowerCase();
  if (normalized === "studio" || normalized === "venue") return "studio_id";
  if (normalized === "gig") return "gig_id";
  if (["artist", "musician", "profile"].includes(normalized)) return "user_id";
  if (normalized === "group" || normalized === "duo") return "group_id";
  return null;
};

type ReviewState = { key: string; reviews: any[]; loading: boolean; error: string | null };
type ReviewRequest = { key: string; refresh: () => Promise<void> };

export function useListingReviews(type: string | null | undefined, id: string | null | undefined) {
  const column = getReviewTargetColumn(type);
  const key = JSON.stringify([column, id]);
  const [state, setState] = useState<ReviewState>({ key: "", reviews: [], loading: false, error: null });
  const requestRef = useRef<ReviewRequest | null>(null);

  useEffect(() => {
    if (!column || !id) return;
    let active = true;
    let revision = 0;
    let controller: AbortController | null = null;
    let reviews: any[] = [];
    const refresh = async () => {
      const requestRevision = ++revision;
      controller?.abort();
      const nextController = new AbortController();
      controller = nextController;
      // Defer the initial update so changing keys renders the new loading state directly.
      await Promise.resolve();
      if (!active || revision !== requestRevision) return;
      setState({ key, reviews, loading: true, error: null });
      try {
        const { data, error } = await supabase.from("reviews")
          .select("*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url, updated_at)")
          .eq(column, id).order("created_at", { ascending: false }).limit(5)
          .abortSignal(nextController.signal);
        if (error) throw error;
        if (!active || revision !== requestRevision) return;
        reviews = (data || []).map((row: any) => ({
          ...row,
          author: row.author ?? row.profiles ?? null,
          content: [row.content, row.comment, row.feedback, row.body, row.review_text]
            .find((value) => typeof value === "string" && value.trim())?.trim() || null,
          likes_count: Number(row.likes_count ?? row.computed_likes_count ?? 0),
        }));
        setState({ key, reviews, loading: false, error: null });
      } catch {
        if (active && revision === requestRevision) {
          setState({ key, reviews, loading: false, error: "Reviews couldn't be loaded. Please try again." });
        }
      }
    };
    const request = { key, refresh };
    requestRef.current = request;
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      if (requestRef.current === request) requestRef.current = null;
    };
  }, [column, id, key]);

  const refresh = useCallback(async () => {
    if (requestRef.current?.key === key) await requestRef.current.refresh();
  }, [key]);
  const enabled = Boolean(column && id);
  const current = enabled && state.key === key ? state
    : { reviews: [], loading: enabled, error: null };
  return { ...current, refresh };
}
