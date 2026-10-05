import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import LoadingState from "../src/components/LoadingState";
import { useAuth } from "../src/context/AuthContext";
import { getShareDestination, PENDING_SHARE_STORAGE_KEY } from "../src/utils/shareLinks";

export default function SharedContentEntry() {
  const { destination } = useLocalSearchParams<{ destination?: string }>();
  const { session, loading, roleResolved, identityChecked, identityRequired } = useAuth();

  useEffect(() => {
    if (loading || (session && (!roleResolved || !identityChecked))) return;
    if (!session) {
      router.replace("/");
      return;
    }
    if (session && identityRequired) {
      router.replace("/identity_verification");
      return;
    }
    const target = getShareDestination(destination || "") || "/feed";
    let active = true;
    void AsyncStorage.removeItem(PENDING_SHARE_STORAGE_KEY).catch(() => {}).then(() => {
      if (active) router.replace(target as any);
    });
    return () => { active = false; };
  }, [destination, identityChecked, identityRequired, loading, roleResolved, session]);

  return <LoadingState message="Opening shared content..." style={{ flex: 1 }} />;
}
