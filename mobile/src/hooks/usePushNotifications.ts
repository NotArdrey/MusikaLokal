import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import {
  getExpoPushProjectId,
  getOrCreatePushInstallationId,
} from '../notifications/pushInstallation';
import {
  isExpoNotificationsAvailable,
  NotificationAndroidImportance,
  Notifications,
} from '../notifications/expoNotifications';
import { resolveNotificationNavigationTarget } from '../utils/notificationNavigation';

const PUSH_NOTIFICATION_CHANNEL_ID = 'musika-lokal-alerts-v2';

let notificationHandlerConfigured = false;
let notificationChannelPromise: Promise<unknown> | null = null;

const ensureAndroidNotificationChannel = () => {
  if (Platform.OS !== 'android') {
    return Promise.resolve();
  }

  const notifications = Notifications;
  if (!notifications?.setNotificationChannelAsync) {
    return Promise.reject(new Error('Android notification channels are unavailable.'));
  }

  if (!notificationChannelPromise) {
    notificationChannelPromise = notifications.setNotificationChannelAsync(PUSH_NOTIFICATION_CHANNEL_ID, {
      name: 'MusikaLokal Alerts',
      importance: NotificationAndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0F172A',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    }).catch((error) => {
      notificationChannelPromise = null;
      throw error;
    });
  }

  return notificationChannelPromise;
};

type ForegroundNotificationHandler = (notification: any) => void;

const ensureNotificationHandler = () => {
  if (notificationHandlerConfigured || Platform.OS === 'web') {
    return;
  }

  const notifications = Notifications;
  if (!notifications?.setNotificationHandler) {
    return;
  }

  notifications.setNotificationHandler({
    // Foreground pushes use the existing deduplicated in-app toast.
    // Background pushes are presented by Android/iOS using the server payload.
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      priority: notifications.AndroidNotificationPriority.MAX,
    }),
  });

  notificationHandlerConfigured = true;
};

const handleNotificationResponse = (response: any) => {
  const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
  const target = resolveNotificationNavigationTarget(data, '/notifications');

  if (!target) {
    return;
  }

  if (target.params && Object.keys(target.params).length > 0) {
    router.push({ pathname: target.pathname as any, params: target.params } as any);
    return;
  }

  router.push(target.pathname as any);
};

export const usePushNotifications = (
  userId: string | null | undefined,
  onForegroundNotification?: ForegroundNotificationHandler,
) => {
  const handledResponseIdsRef = useRef<Set<string>>(new Set());
  const foregroundNotificationHandlerRef = useRef(onForegroundNotification);

  useEffect(() => {
    foregroundNotificationHandlerRef.current = onForegroundNotification;
  }, [onForegroundNotification]);

  useEffect(() => {
    const notifications = Notifications;
    if (Platform.OS === 'web' || !notifications) {
      return;
    }

    ensureNotificationHandler();

    void ensureAndroidNotificationChannel().catch((error) => {
      if (__DEV__) {
        console.warn('[push] Failed to create notification channel', error);
      }
    });
  }, []);

  useEffect(() => {
    const notifications = Notifications;
    if (
      Platform.OS === 'web' ||
      !userId ||
      !notifications?.addNotificationReceivedListener
    ) {
      return;
    }

    const receivedSubscription = notifications.addNotificationReceivedListener((notification: any) => {
      foregroundNotificationHandlerRef.current?.(notification);
    });

    return () => {
      receivedSubscription.remove();
    };
  }, [userId]);

  useEffect(() => {
    const notifications = Notifications;
    if (
      Platform.OS === 'web' ||
      !notifications?.getLastNotificationResponseAsync ||
      !notifications.addNotificationResponseReceivedListener
    ) {
      return;
    }

    let isDisposed = false;

    const rememberHandledResponse = (response: any) => {
      const responseIdentifier = String(
        response.notification.request.identifier || response.actionIdentifier || '',
      ).trim();

      if (!responseIdentifier) {
        return true;
      }

      if (handledResponseIdsRef.current.has(responseIdentifier)) {
        return false;
      }

      handledResponseIdsRef.current.add(responseIdentifier);
      if (handledResponseIdsRef.current.size > 40) {
        const oldestIdentifier = handledResponseIdsRef.current.values().next().value;
        if (oldestIdentifier) {
          handledResponseIdsRef.current.delete(oldestIdentifier);
        }
      }

      return true;
    };

    const consumeResponse = (response: any | null) => {
      if (!response || isDisposed) {
        return;
      }

      if (!rememberHandledResponse(response)) {
        return;
      }

      handleNotificationResponse(response);
      void notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
    };

    void notifications.getLastNotificationResponseAsync()
      .then(consumeResponse)
      .catch(() => undefined);

    const responseSubscription = notifications.addNotificationResponseReceivedListener((response: any) => {
      consumeResponse(response);
    });

    return () => {
      isDisposed = true;
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const notifications = Notifications;
    if (
      Platform.OS === 'web' ||
      !userId ||
      !Device.isDevice ||
      !notifications ||
      !isExpoNotificationsAvailable ||
      !notifications.getPermissionsAsync ||
      !notifications.requestPermissionsAsync ||
      !notifications.getExpoPushTokenAsync
    ) {
      return;
    }

    const getPermissionsAsync = notifications.getPermissionsAsync.bind(notifications);
    const requestPermissionsAsync = notifications.requestPermissionsAsync.bind(notifications);
    const getExpoPushTokenAsync = notifications.getExpoPushTokenAsync.bind(notifications);

    let isDisposed = false;

    const syncPushRegistration = async () => {
      // Android 13+ needs the channel before requesting notification permission.
      // Register only after it exists so incoming pushes can use the alerts channel.
      await ensureAndroidNotificationChannel();
      if (isDisposed) {
        return;
      }

      const installationId = await getOrCreatePushInstallationId();

      const existingPermissions = await getPermissionsAsync();
      let finalStatus = existingPermissions.status;

      if (finalStatus !== 'granted') {
        const requestedPermissions = await requestPermissionsAsync();
        finalStatus = requestedPermissions.status;
      }

      if (isDisposed) {
        return;
      }

      if (finalStatus !== 'granted') {
        await supabase.rpc('unregister_push_device', {
          p_installation_id: installationId,
          p_reason: 'permission_denied',
        });
        return;
      }

      const projectId = getExpoPushProjectId();
      if (!projectId) {
        throw new Error('Missing Expo project ID. Configure EXPO_PUBLIC_EAS_PROJECT_ID before registering push devices.');
      }
      const tokenResponse = await getExpoPushTokenAsync({ projectId });

      if (isDisposed || !tokenResponse.data) {
        return;
      }

      const { error } = await supabase.rpc('register_push_device', {
        p_installation_id: installationId,
        p_push_token: tokenResponse.data,
        p_platform: Platform.OS,
        p_device_name: Device.modelName ?? null,
        p_app_version: Constants.expoConfig?.version ?? null,
        p_project_id: projectId,
      });

      if (error) {
        throw error;
      }
    };

    void syncPushRegistration().catch((error) => {
      if (__DEV__) {
        console.warn('[push] Failed to register push device', error);
      }
    });

    return () => {
      isDisposed = true;
    };
  }, [userId]);
};
