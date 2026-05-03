import { DeviceEventEmitter, type EmitterSubscription } from "react-native";

export type FavoriteTargetType = "group" | "studio" | "gig" | "profile" | "production_team";

export type FavoriteChangedPayload = {
  id: string;
  isFavorited: boolean;
  targetType: FavoriteTargetType;
  favoriteCount?: number;
};

const FAVORITE_CHANGED_EVENT = "musikalokal:favorite-changed";

export const emitFavoriteChanged = (payload: FavoriteChangedPayload) => {
  DeviceEventEmitter.emit(FAVORITE_CHANGED_EVENT, payload);
};

export const addFavoriteChangedListener = (
  listener: (payload: FavoriteChangedPayload) => void,
): EmitterSubscription =>
  DeviceEventEmitter.addListener(FAVORITE_CHANGED_EVENT, listener);
