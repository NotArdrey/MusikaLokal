import { DeviceEventEmitter, type EmitterSubscription } from "react-native";

export type FavoriteTargetType = "group" | "studio" | "gig" | "profile" | "production_team";

export type FavoriteChangedPayload = {
  id: string;
  isFavorited: boolean;
  targetType: FavoriteTargetType;
  favoriteCount?: number;
  userId?: string;
};

export const getFavoriteTargetType = (listingType?: string): FavoriteTargetType | null => {
  const normalized = (listingType || "").trim().toLowerCase();
  if (normalized === "group" || normalized === "duo") return "group";
  if (["artist", "musician", "profile", "user"].includes(normalized)) return "profile";
  if (normalized === "studio" || normalized === "venue") return "studio";
  if (normalized === "gig") return "gig";
  if (["production", "production team", "production-team", "production_team"].includes(normalized)) {
    return "production_team";
  }
  return null;
};

const FAVORITE_CHANGED_EVENT = "musikalokal:favorite-changed";

export const emitFavoriteChanged = (payload: FavoriteChangedPayload) => {
  DeviceEventEmitter.emit(FAVORITE_CHANGED_EVENT, payload);
};

export const addFavoriteChangedListener = (
  listener: (payload: FavoriteChangedPayload) => void,
): EmitterSubscription =>
  DeviceEventEmitter.addListener(FAVORITE_CHANGED_EVENT, listener);
