type ExpoNotificationsModuleLike = {
  AndroidImportance?: {
    MAX?: number;
  };
  setNotificationHandler?: (...args: any[]) => any;
  setNotificationChannelAsync?: (...args: any[]) => Promise<any>;
  getPermissionsAsync?: (...args: any[]) => Promise<any>;
  requestPermissionsAsync?: (...args: any[]) => Promise<any>;
  getExpoPushTokenAsync?: (...args: any[]) => Promise<any>;
  getLastNotificationResponseAsync?: (...args: any[]) => Promise<any>;
  addNotificationReceivedListener?: (...args: any[]) => { remove: () => void };
  addNotificationResponseReceivedListener?: (...args: any[]) => { remove: () => void };
  clearLastNotificationResponseAsync?: (...args: any[]) => Promise<any>;
};

let nativeNotifications: ExpoNotificationsModuleLike | null = null;

try {
  const dynamicRequire = eval("require") as (id: string) => any;
  nativeNotifications = dynamicRequire("expo-notifications");
} catch {
  if (__DEV__) {
    console.info(
      "[push] expo-notifications unavailable; native push registration is disabled until dependencies are installed and Metro is restarted.",
    );
  }
}

export const Notifications = nativeNotifications;
export const isExpoNotificationsAvailable = !!nativeNotifications;
export const NotificationAndroidImportance = {
  MAX: nativeNotifications?.AndroidImportance?.MAX ?? 5,
} as const;
