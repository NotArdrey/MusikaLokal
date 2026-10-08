import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAppLinkDestination, PENDING_SHARE_STORAGE_KEY } from "../src/utils/appLinks";
import { getPasswordRecoveryRoute } from "../src/utils/passwordRecovery";

export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  const recoveryRoute = getPasswordRecoveryRoute(path);
  if (recoveryRoute) return recoveryRoute;
  const destination = getAppLinkDestination(path);
  if (!destination) return path;
  // Keep the destination through sign-in, identity verification and app restarts.
  try {
    await AsyncStorage.setItem(PENDING_SHARE_STORAGE_KEY, destination);
  } catch {
    // Signed-in users can still open the content if device storage is unavailable.
  }
  return `/shared?destination=${encodeURIComponent(destination)}`;
}
