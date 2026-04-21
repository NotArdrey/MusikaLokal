import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export const PUSH_INSTALLATION_ID_STORAGE_KEY = 'push-installation-id';

const createPushInstallationId = () => {
  const randomSegment = Math.random().toString(36).slice(2, 12);
  return `push-${Date.now()}-${randomSegment}`;
};

export const getStoredPushInstallationId = async () => {
  return AsyncStorage.getItem(PUSH_INSTALLATION_ID_STORAGE_KEY);
};

export const getOrCreatePushInstallationId = async () => {
  const existingInstallationId = await getStoredPushInstallationId();
  if (existingInstallationId) {
    return existingInstallationId;
  }

  const nextInstallationId = createPushInstallationId();
  await AsyncStorage.setItem(PUSH_INSTALLATION_ID_STORAGE_KEY, nextInstallationId);
  return nextInstallationId;
};

export const getExpoPushProjectId = () => {
  const easConfigProjectId = (Constants as any).easConfig?.projectId;
  const expoExtraProjectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const envProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  return easConfigProjectId || expoExtraProjectId || envProjectId || null;
};
