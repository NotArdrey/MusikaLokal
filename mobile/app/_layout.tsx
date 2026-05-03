import {
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    useFonts,
} from "@expo-google-fonts/poppins";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalProvider } from "@gorhom/portal";
import { useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as Linking from "expo-linking";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef } from "react";
import { AppState, LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import { prepareRealtimeAuth, supabase } from "../lib/supabase";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { GlobalNavbar } from "../src/components/navbar";
import { BottomOverlayProvider } from "../src/context/BottomOverlayContext";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import {
  GlobalRadioMiniPlayer,
  RadioPlayerProvider,
} from "../src/context/RadioPlayerContext";
import {
  TopToastProvider,
} from "../src/context/TopToastContext";
import { emitToast, toastBus, type ToastType } from "../src/events/toastBus";
import {
  persistQueryClientOptions,
  queryClient,
  resetPrivateQueryStateForAuthChange,
  setupReactQueryFocusManager,
} from "../src/data/queryClient";
import { useGlobalRealtimeInvalidation } from "../src/data/realtime";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { logLoadTime } from "../src/utils/loadTimeLogger";

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  "AuthApiError: Invalid Refresh Token: Refresh Token Not Found",
  "SafeAreaView has been deprecated and will be removed in a future release.",
  "setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture.",
  "[expo-av]: Expo AV has been deprecated and will be removed in SDK 54.",
  "Unable to activate keep awake",
]);

const NOTIFICATION_TOAST_BACKFILL_LIMIT = 12;
const NOTIFICATION_TOAST_BACKFILL_SKEW_MS = 15000;
const NOTIFICATION_TOAST_RECONNECT_DELAY_MS = 1500;
const NOTIFICATION_TOAST_DEBUG_LOGS = __DEV__;

type IncomingNotificationToastRecord = {
  id?: string | null;
  title?: string | null;
  message?: string | null;
  type?: string | null;
  created_at?: string | null;
  read?: boolean | null;
};

const logNotificationToastDebug = (...args: unknown[]) => {
  if (__DEV__ && NOTIFICATION_TOAST_DEBUG_LOGS) {
    console.log("[notification-toast]", ...args);
  }
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    setupReactQueryFocusManager();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistQueryClientOptions}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <PortalProvider>
            <TopToastProvider>
              <AuthProvider>
                <QueryAuthLifecycle />
                <BottomOverlayProvider>
                  <BottomSheetModalProvider>
                    <RadioPlayerProvider>
                      <RootContent />
                    </RadioPlayerProvider>
                  </BottomSheetModalProvider>
                </BottomOverlayProvider>
              </AuthProvider>
            </TopToastProvider>
          </PortalProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}

function QueryAuthLifecycle() {
  const { session } = useAuth();
  const activeUserId = session?.user?.id ?? null;
  const queryClientInstance = useQueryClient();
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

  useGlobalRealtimeInvalidation(queryClientInstance, activeUserId);

  useEffect(() => {
    if (previousUserIdRef.current === undefined) {
      previousUserIdRef.current = activeUserId;
      return;
    }

    if (previousUserIdRef.current !== activeUserId) {
      previousUserIdRef.current = activeUserId;
      void resetPrivateQueryStateForAuthChange();
    }
  }, [activeUserId]);

  return null;
}

function RootContent() {
  const { colors } = useTheme();
  const {
    session,
    loading,
    identityRequired,
    identityChecked,
  } =
    useAuth();
  const segments = useSegments();
  const routeName = segments.length > 0 ? `/${segments.join("/")}` : "/";
  const processedDeepLinksRef = useRef<Set<string>>(new Set());
  const notificationAppStateRef = useRef(AppState.currentState);
  const notificationBackgroundedAtRef = useRef<number | null>(null);

  useEffect(() => {
    const startedAt = Date.now();
    logLoadTime("Route", "enter", {
      route: routeName,
      startedAt: new Date(startedAt).toISOString(),
    });

    return () => {
      logLoadTime("Route", "leave", {
        durationMs: Date.now() - startedAt,
        route: routeName,
      });
    };
  }, [routeName]);

  const showNotificationToastFromRecord = useCallback(
    (
      incomingRecord: IncomingNotificationToastRecord | null | undefined,
      source: string,
    ) => {
      const nextNotification = incomingRecord || {};
      const notificationId = String(nextNotification.id || "").trim();
      if (!notificationId) {
        logNotificationToastDebug("Skipping notification toast with missing id", {
          source,
          nextNotification,
        });
        return false;
      }

      const message = String(nextNotification.message || "").trim();
      if (!message) {
        logNotificationToastDebug("Skipping notification toast with empty message", {
          source,
          notificationId,
        });
        return false;
      }

      const normalizedType = String(nextNotification.type || "info").toLowerCase();
      let toastType: ToastType = "info";
      if (
        normalizedType === "success" ||
        normalizedType === "error" ||
        normalizedType === "warning" ||
        normalizedType === "info"
      ) {
        toastType = normalizedType;
      }

      const emitted = emitToast({
        dedupeKey: `notification:${notificationId}`,
        id: notificationId,
        type: toastType,
        title: String(nextNotification.title || "").trim() || "Notification",
        message,
        source,
      });

      logNotificationToastDebug("Displayed notification toast", {
        source,
        notificationId,
        toastType,
        emitted,
      });
      return emitted;
    },
    [],
  );

  const showNotificationToastFromPush = useCallback(
    (notification: any) => {
      const content = notification?.request?.content || {};
      const data =
        content.data && typeof content.data === "object"
          ? (content.data as Record<string, unknown>)
          : {};
      const meta =
        data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
          ? (data.meta as Record<string, unknown>)
          : {};

      const firstText = (...values: unknown[]) => {
        for (const value of values) {
          if (typeof value !== "string" && typeof value !== "number") {
            continue;
          }

          const normalizedValue = String(value).trim();
          if (normalizedValue) {
            return normalizedValue;
          }
        }

        return "";
      };

      showNotificationToastFromRecord(
        {
          id: firstText(
            data.notificationId,
            data.notification_id,
            data.id,
            meta.notificationId,
            meta.notification_id,
            notification?.request?.identifier,
          ),
          title: firstText(content.title, data.title, meta.title),
          message: firstText(content.body, data.message, meta.message),
          type: firstText(data.type, meta.type),
        },
        "push",
      );
    },
    [showNotificationToastFromRecord],
  );

  usePushNotifications(session?.user?.id ?? null, showNotificationToastFromPush);

  const backfillRecentNotificationToasts = useCallback(
    async (userId: string, sinceMs: number, reason: string) => {
      const queryFloorIso = new Date(
        Math.max(0, sinceMs - NOTIFICATION_TOAST_BACKFILL_SKEW_MS),
      ).toISOString();

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, type, created_at, read")
        .eq("user_id", userId)
        .eq("read", false)
        .gte("created_at", queryFloorIso)
        .order("created_at", { ascending: true })
        .limit(NOTIFICATION_TOAST_BACKFILL_LIMIT);

      if (error) {
        console.warn("[notification-toast] Failed to backfill recent notifications", {
          reason,
          message: error.message,
        });
        return;
      }

      for (const notification of data || []) {
        showNotificationToastFromRecord(notification, `backfill:${reason}`);
      }

      logNotificationToastDebug("Backfilled recent notifications", {
        reason,
        count: data?.length ?? 0,
        queryFloorIso,
      });
    },
    [showNotificationToastFromRecord],
  );

  useEffect(() => {
    toastBus.clearDedupe();
    notificationBackgroundedAtRef.current = null;
    notificationAppStateRef.current = AppState.currentState;
  }, [session?.user?.id]);

  useEffect(() => {
    const activeUserId = session?.user?.id;
    if (!activeUserId) return;

    let isDisposed = false;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;
    let activeChannelStatus = "INITIAL";
    let activeChannelGeneration = 0;
    let connectAttemptGeneration = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const isNotificationAppActive = () =>
      notificationAppStateRef.current === "active";

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const disposeChannel = async (reason: string) => {
      if (activeChannel) {
        const channelToDispose = activeChannel;
        activeChannel = null;
        activeChannelGeneration += 1;

        try {
          await supabase.removeChannel(channelToDispose);
        } catch {
          // Ignore remove failures; reconnect logic continues to self-heal.
        }
      }

      logNotificationToastDebug("Disposed notification toast channel", {
        reason,
        activeUserId,
      });
      activeChannelStatus = "CLOSED";
    };

    const scheduleReconnect = (reason: string) => {
      if (isDisposed || reconnectTimer || !isNotificationAppActive()) return;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!isDisposed) {
          void connectChannel(`retry:${reason}`);
        }
      }, NOTIFICATION_TOAST_RECONNECT_DELAY_MS);
    };

    const connectChannel = async (reason: string) => {
      clearReconnectTimer();
      const connectAttempt = ++connectAttemptGeneration;
      await disposeChannel(`connect:${reason}`);

      if (isDisposed || connectAttempt !== connectAttemptGeneration) {
        return;
      }

      if (isDisposed || !isNotificationAppActive()) {
        logNotificationToastDebug("Skipping notification toast connect while app inactive", {
          reason,
          activeUserId,
          appState: notificationAppStateRef.current,
        });
        return;
      }

      const realtimeAuthReady = await prepareRealtimeAuth();
      if (isDisposed || connectAttempt !== connectAttemptGeneration) {
        return;
      }

      if (!realtimeAuthReady) {
        console.warn("[notification-toast] Realtime auth unavailable; retrying", {
          reason,
          activeUserId,
        });
        scheduleReconnect("auth-unavailable");
        return;
      }

      activeChannelStatus = "CONNECTING";
      const channelGeneration = ++activeChannelGeneration;

      activeChannel = supabase
        .channel(`root-notification-toast:${activeUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${activeUserId}`,
          },
          (payload) => {
            if (isDisposed || channelGeneration !== activeChannelGeneration) {
              return;
            }

            const nextRecord =
              (payload as { new?: IncomingNotificationToastRecord })?.new ?? null;

            logNotificationToastDebug("Received notification realtime payload", {
              reason,
              notification: nextRecord,
            });

            showNotificationToastFromRecord(
              nextRecord,
              "realtime",
            );
          },
        )
        .subscribe((status) => {
          if (isDisposed || channelGeneration !== activeChannelGeneration) {
            return;
          }

          activeChannelStatus = status;
          logNotificationToastDebug("Notification toast channel status", {
            reason,
            status,
            activeUserId,
          });

          if (status === "SUBSCRIBED") {
            clearReconnectTimer();
            return;
          }

          if (status === "CLOSED") {
            logNotificationToastDebug("Notification toast channel closed; reconnecting", {
              reason,
              status,
              activeUserId,
            });
            scheduleReconnect("closed");
            return;
          }

          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[notification-toast] Realtime channel unavailable", {
              reason,
              status,
              activeUserId,
            });
            scheduleReconnect(status.toLowerCase());
          }
        });
    };

    void connectChannel("initial");

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      const previousState = notificationAppStateRef.current;
      notificationAppStateRef.current = nextState;

      if (previousState === nextState) {
        return;
      }

      if (previousState === "active" && nextState !== "active") {
        notificationBackgroundedAtRef.current = Date.now();
        clearReconnectTimer();
        void disposeChannel(`app-state:${nextState}`);
        return;
      }

      if (nextState === "active") {
        const backgroundedAt = notificationBackgroundedAtRef.current;
        notificationBackgroundedAtRef.current = null;

        if (activeChannelStatus !== "SUBSCRIBED") {
          void connectChannel("foreground");
        }

        if (backgroundedAt) {
          void backfillRecentNotificationToasts(
            activeUserId,
            backgroundedAt,
            "foreground",
          );
        }
      }
    });

    return () => {
      isDisposed = true;
      clearReconnectTimer();
      appStateSub.remove();
      void disposeChannel("cleanup");
    };
  }, [
    backfillRecentNotificationToasts,
    session?.user?.id,
    showNotificationToastFromRecord,
  ]);

  // Handle global identity gate
  useEffect(() => {
    if (loading) return;

    if (session && !identityChecked) return;

    const segmentStrings = segments.map((segment) => String(segment));
    const currentScreen =
      segmentStrings.length > 0
        ? segmentStrings[segmentStrings.length - 1]
        : "index";

    const isScreenAllowed = (allowedScreens: string[]) => {
      return (
        allowedScreens.some((screen) => segmentStrings.includes(screen)) ||
        allowedScreens.includes(currentScreen)
      );
    };

    if (session && identityRequired) {
      const identityAllowedScreens = [
        "identity_verification",
        "account_details",
        "settings",
        "wallet",
        "payment-result",
        "help_support",
        "privacy_policy",
        "terms_and_conditions",
      ];

      if (!isScreenAllowed(identityAllowedScreens)) {
        router.replace("/identity_verification");
      }
      return;
    }
  }, [
    session,
    identityRequired,
    identityChecked,
    loading,
    segments,
  ]);

  // Handle deep links for payment redirects
  useEffect(() => {
    // Handle initial deep link (app opened via link)
    const handleInitialDeepLink = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    handleInitialDeepLink();

    // Handle deep links while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {

    try {
      const { hostname, path, queryParams } = Linking.parse(url);

      // Create a unique key for this deep link to prevent double processing
      const linkKey = `${path}-${queryParams?.booking_id}-${queryParams?.status}-${queryParams?.type}`;
      if (processedDeepLinksRef.current.has(linkKey)) {
        return;
      }
      processedDeepLinksRef.current.add(linkKey);

      // Clear old processed links after a timeout
      setTimeout(() => {
        processedDeepLinksRef.current.delete(linkKey);
      }, 5000);

      // Handle password recovery deep links (from Supabase email)
      if (queryParams?.type === "recovery" || path === "change_password") {
        router.replace({
          pathname: "/change_password",
          params: {
            type: "recovery",
            access_token: queryParams?.access_token as string,
            refresh_token: queryParams?.refresh_token as string,
          },
        });
        return;
      }

      // Handle payment result deep links
      if (hostname === "payment-result" || path === "payment-result") {
        const status = queryParams?.status as string;
        const bookingId = queryParams?.booking_id as string;
        const type = queryParams?.type as string;

        const normalizedStatus = String(status || "").toLowerCase();
        if (normalizedStatus === "success" || normalizedStatus === "paid" || normalizedStatus === "completed") {
          emitToast({
            type: "success",
            title: "Payment Successful",
            message: "Your payment was confirmed.",
            source: "deep-link",
          });
        } else if (normalizedStatus === "cancelled" || normalizedStatus === "canceled") {
          emitToast({
            type: "warning",
            title: "Payment Cancelled",
            message: "The payment was cancelled before completion.",
            source: "deep-link",
          });
        } else if (normalizedStatus === "failed" || normalizedStatus === "error") {
          emitToast({
            type: "error",
            title: "Payment Failed",
            message: "The payment did not go through. Please try again.",
            source: "deep-link",
          });
        }


        // Navigate to payment result screen
        router.replace({
          pathname: "/payment-result",
          params: {
            status,
            booking_id: bookingId,
            type,
          },
        });
      }
    } catch (e) {
      console.error("Error parsing deep link:", e);
    }
  };

  // Profile check is now handled via components and action-gates (e.g. Booking) rather than a hard app-lock.
  // This allows users to browse even if profile is incomplete.

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }, // Also ensure stack content has background
          animation: Platform.OS === "ios" ? "simple_push" : "fade_from_bottom",
          animationDuration: 240,
          freezeOnBlur: true,
        }}
      />

      <GlobalRadioMiniPlayer />
      <GlobalNavbar />
    </View>
  );
}
