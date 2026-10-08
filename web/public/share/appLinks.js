import { getActionDestination, normalizeActionDestination } from "./actionLinks.js";
import { getShareDestination } from "./flow.js";
export { PENDING_SHARE_STORAGE_KEY } from "./flow.js";
export const getAppLinkDestination = (raw) => getActionDestination(raw) || getShareDestination(raw) || normalizeActionDestination(raw);
