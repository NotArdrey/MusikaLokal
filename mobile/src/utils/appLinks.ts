import { getActionDestination, normalizeActionDestination } from "./actionLinks";
import { getShareDestination } from "./shareLinks";
export { PENDING_SHARE_STORAGE_KEY } from "./shareLinks";

export const getAppLinkDestination = (raw: string) =>
  getActionDestination(raw) || getShareDestination(raw) || normalizeActionDestination(raw);
