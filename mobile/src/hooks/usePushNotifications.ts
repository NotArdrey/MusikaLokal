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

let notificationHandlerConfigured = false;

const ensureNotificationHandler = () => {
  if (notificationHandlerConfigured || Platform.OS === 'web') {
    return;
  }

  if (!Notifications) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
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

export const usePushNotifications = (userId: string | null | undefined) => {
  const handledResponseIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === 'web' || !Notifications) {
      return;
    }

    ensureNotificationHandler();

    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: NotificationAndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0F172A',
        sound: 'default',
      });
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !Notifications) {
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
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then(consumeResponse)
      .catch(() => undefined);

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      consumeResponse(response);
    });

    return () => {
      isDisposed = true;
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !Device.isDevice || !Notifications || !isExpoNotificationsAvailable) {
      return;
    }

    let isDisposed = false;

    const syncPushRegistration = async () => {
      const installationId = await getOrCreatePushInstallationId();

      const existingPermissions = await Notifications.getPermissionsAsync();
      let finalStatus = existingPermissions.status;

      if (finalStatus !== 'granted') {
        const requestedPermissions = await Notifications.requestPermissionsAsync();
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
      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

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
