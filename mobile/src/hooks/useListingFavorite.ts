import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  addFavoriteChangedListener,
  emitFavoriteChanged,
  type FavoriteTargetType,
} from "../utils/favoriteEvents";

type FavoriteState = { isFavorited: boolean; favoriteCount: number; busy: boolean };
type FavoriteContext = {
  active: boolean;
  key: string;
  revision: number;
  state: FavoriteState;
};
const emptyState: FavoriteState = { isFavorited: false, favoriteCount: 0, busy: false };

export function useListingFavorite(
  targetType: FavoriteTargetType | null,
  targetId: string | null | undefined,
  userId: string | null | undefined,
  includeCount = false,
) {
  const key = JSON.stringify([targetType, targetId, userId]);
  const [snapshot, setSnapshot] = useState({ key, ...emptyState });
  const contextRef = useRef<FavoriteContext | null>(null);

  useEffect(() => {
    const context: FavoriteContext = { active: true, key, revision: 0, state: { ...emptyState } };
    contextRef.current = context;
    const update = (next: Partial<FavoriteState>) => {
      context.state = { ...context.state, ...next };
      if (context.active) setSnapshot({ key, ...context.state });
    };

    const subscription = addFavoriteChangedListener((payload) => {
      if (!userId || payload.targetType !== targetType || payload.id !== targetId ||
          (payload.userId && payload.userId !== userId)) return;
      context.revision += 1;
      update({
        isFavorited: payload.isFavorited,
        favoriteCount: payload.favoriteCount ?? Math.max(0, context.state.favoriteCount +
          (payload.isFavorited === context.state.isFavorited ? 0 : payload.isFavorited ? 1 : -1)),
      });
    });

    const revision = context.revision;
    if (targetType && targetId) {
      void (async () => {
        try {
          const [personal, total] = await Promise.all([
            userId ? supabase.from("favorites").select("id", { count: "exact", head: true })
              .eq(`${targetType}_id`, targetId).eq("user_id", userId)
              : Promise.resolve({ count: 0, error: null }),
            includeCount ? supabase.from("favorites").select("id", { count: "exact", head: true })
              .eq(`${targetType}_id`, targetId)
              : Promise.resolve({ count: 0, error: null }),
          ]);
          if (personal.error) throw personal.error;
          if (total.error) throw total.error;
          if (context.active && context.revision === revision) {
            update({ isFavorited: (personal.count || 0) > 0, favoriteCount: total.count || 0 });
          }
        } catch {
          // Keep the current state if a metadata refresh fails.
        }
      })();
    }

    return () => {
      context.active = false;
      subscription.remove();
    };
  }, [includeCount, key, targetId, targetType, userId]);

  const toggle = useCallback(async () => {
    const context = contextRef.current;
    if (!context?.active || context.key !== key || context.state.busy || !targetType || !targetId || !userId) return;
    const previous = { ...context.state };
    const update = (next: Partial<FavoriteState>) => {
      context.state = { ...context.state, ...next };
      if (context.active) setSnapshot({ key, ...context.state });
    };
    context.revision += 1;
    update({
      busy: true,
      isFavorited: !previous.isFavorited,
      favoriteCount: Math.max(0, previous.favoriteCount + (previous.isFavorited ? -1 : 1)),
    });
    try {
      const { data, error } = await supabase.functions.invoke("manage-details", {
        body: { action: "toggle_favorite", type: targetType, id: targetId, userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (typeof data?.is_favorited !== "boolean") throw new Error("Unable to confirm the bookmark update.");
      const favoriteCount = typeof data.favorites_count === "number"
        ? Math.max(0, data.favorites_count) : context.state.favoriteCount;
      update({ isFavorited: data.is_favorited, favoriteCount });
      emitFavoriteChanged({ id: targetId, targetType, userId, isFavorited: data.is_favorited, favoriteCount });
    } catch (error) {
      update(previous);
      throw error;
    } finally {
      update({ busy: false });
    }
  }, [key, targetId, targetType, userId]);

  return { ...(snapshot.key === key ? snapshot : emptyState), toggle };
}
