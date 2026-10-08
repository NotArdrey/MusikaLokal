type ExpoNotificationsModule = typeof import('expo-notifications');

let nativeNotifications: ExpoNotificationsModule | null = null;

try {
  // Metro needs a literal require to include the notification library in native bundles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nativeNotifications = require('expo-notifications') as ExpoNotificationsModule;
} catch {
  if (__DEV__) {
    console.info(
      '[push] expo-notifications unavailable; use a native build with the notification module installed.',
    );
  }
}

export const Notifications = nativeNotifications;
export const isExpoNotificationsAvailable = !!nativeNotifications;
export const NotificationAndroidImportance = {
  MAX: nativeNotifications?.AndroidImportance.MAX ?? 7,
} as const;
