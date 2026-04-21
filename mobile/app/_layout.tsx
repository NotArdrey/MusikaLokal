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
import * as Linking from "expo-linking";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import { supabase } from "../lib/supabase";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import Navbar from "../src/components/navbar";
import { BottomOverlayProvider } from "../src/context/BottomOverlayContext";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import {
  GlobalRadioMiniPlayer,
  RadioPlayerProvider,
} from "../src/context/RadioPlayerContext";
import {
  showTopToast,
  TopToastProvider,
  type TopToastType,
} from "../src/context/TopToastContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import SubscriptionRequiredScreen from "./subscription_required";

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  "AuthApiError: Invalid Refresh Token: Refresh Token Not Found",
  "SafeAreaView has been deprecated and will be removed in a future release.",
  "setLayoutAnimationEnabledExperimental is currently a no-op in the New Architecture.",
  "[expo-av]: Expo AV has been deprecated and will be removed in SDK 54.",
]);

const NOTIFICATION_TOAST_DEDUPE_LIMIT = 120;
const NOTIFICATION_TOAST_BACKFILL_LIMIT = 12;
const NOTIFICATION_TOAST_BACKFILL_SKEW_MS = 15000;
const NOTIFICATION_TOAST_RECONNECT_DELAY_MS = 1500;
const NOTIFICATION_TOAST_DEBUG_LOGS = false;

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
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <TopToastProvider>
          <AuthProvider>
            <PortalProvider>
              <BottomSheetModalProvider>
                <BottomOverlayProvider>
                  <RadioPlayerProvider>
                    <RootContent />
                  </RadioPlayerProvider>
                </BottomOverlayProvider>
              </BottomSheetModalProvider>
            </PortalProvider>
          </AuthProvider>
        </TopToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootContent() {
  const { colors } = useTheme();
  const {
    session,
    loading,
    subscriptionRequired,
    subscriptionChecked,
    identityRequired,
    identityChecked,
  } =
    useAuth();
  usePushNotifications(session?.user?.id ?? null);
  const segments = useSegments();
  const processedDeepLinksRef = useRef<Set<string>>(new Set());
  const shownNotificationToastIdsRef = useRef<Set<string>>(new Set());
  const notificationAppStateRef = useRef(AppState.currentState);
  const notificationBackgroundedAtRef = useRef<number | null>(null);

  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const rememberShownNotificationToast = useCallback((notificationId: string) => {
    if (shownNotificationToastIdsRef.current.has(notificationId)) {
      return false;
    }

    shownNotificationToastIdsRef.current.add(notificationId);
    if (shownNotificationToastIdsRef.current.size > NOTIFICATION_TOAST_DEDUPE_LIMIT) {
      const oldestId = shownNotificationToastIdsRef.current.values().next().value;
      if (oldestId) {
        shownNotificationToastIdsRef.current.delete(oldestId);
      }
    }

    return true;
  }, []);

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

      if (!rememberShownNotificationToast(notificationId)) {
        logNotificationToastDebug("Skipping duplicate notification toast", {
          source,
          notificationId,
        });
        return false;
      }

      const normalizedType = String(nextNotification.type || "info").toLowerCase();
      let toastType: TopToastType = "info";
      if (
        normalizedType === "success" ||
        normalizedType === "error" ||
        normalizedType === "warning" ||
        normalizedType === "info"
      ) {
        toastType = normalizedType;
      }

      showTopToast({
        type: toastType,
        title: String(nextNotification.title || "").trim() || "Notification",
        message,
      });

      logNotificationToastDebug("Displayed notification toast", {
        source,
        notificationId,
        toastType,
      });
      return true;
    },
    [rememberShownNotificationToast],
  );

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
    shownNotificationToastIdsRef.current.clear();
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
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let latestSubscribeStartedAt = Date.now();

    const isNotificationAppActive = () =>
      notificationAppStateRef.current === "active";

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const disposeChannel = (reason: string) => {
      if (activeChannel) {
        const channelToDispose = activeChannel;
        activeChannel = null;
        activeChannelGeneration += 1;
        supabase.removeChannel(channelToDispose);
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
          connectChannel(`retry:${reason}`);
        }
      }, NOTIFICATION_TOAST_RECONNECT_DELAY_MS);
    };

    const connectChannel = (reason: string) => {
      clearReconnectTimer();
      disposeChannel(`connect:${reason}`);

      if (isDisposed || !isNotificationAppActive()) {
        logNotificationToastDebug("Skipping notification toast connect while app inactive", {
          reason,
          activeUserId,
          appState: notificationAppStateRef.current,
        });
        return;
      }

      latestSubscribeStartedAt = Date.now();
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

            showNotificationToastFromRecord(
              (payload as { new?: IncomingNotificationToastRecord })?.new ?? null,
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
            void backfillRecentNotificationToasts(
              activeUserId,
              latestSubscribeStartedAt,
              reason,
            );
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

    connectChannel("initial");

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      const previousState = notificationAppStateRef.current;
      notificationAppStateRef.current = nextState;

      if (previousState === nextState) {
        return;
      }

      if (previousState === "active" && nextState !== "active") {
        notificationBackgroundedAtRef.current = Date.now();
        clearReconnectTimer();
        disposeChannel(`app-state:${nextState}`);
        return;
      }

      if (nextState === "active") {
        const backgroundedAt = notificationBackgroundedAtRef.current;
        notificationBackgroundedAtRef.current = null;

        if (activeChannelStatus !== "SUBSCRIBED") {
          connectChannel("foreground");
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
      disposeChannel("cleanup");
    };
  }, [
    backfillRecentNotificationToasts,
    session?.user?.id,
    showNotificationToastFromRecord,
  ]);

  // Handle global identity/subscription gates
  useEffect(() => {
    if (loading) return;

    if (session && (!subscriptionChecked || !identityChecked)) return;

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
        "subscription_required",
        "payment-result",
        "help_support",
        "privacy_policy",
        "terms_and_conditions",
      ];

      if (!isScreenAllowed(identityAllowedScreens)) {
        console.log("🪪 Identity verification required, redirecting to verification screen");
        router.replace("/identity_verification");
      }
      return;
    }

    // If user is logged in and subscription is required
    if (session && subscriptionRequired) {
      // Allow access to certain screens even without subscription
      const allowedScreens = [
        "subscription_required",
        "identity_verification",
        "account_details",
        "payment-result",
        "settings",
        "wallet",
        "help_support",
        "privacy_policy",
        "terms_and_conditions",
      ];

      console.log(`🔒 Layout Check: Screen=${currentScreen}, Segments=${JSON.stringify(segments)}, SubRequired=${subscriptionRequired}`);

      const isAllowed = isScreenAllowed(allowedScreens);

      if (!isAllowed) {
        console.log("🔒 Subscription required, showing subscription modal");
        setShowSubscriptionModal(true);
      } else {
        setShowSubscriptionModal(false);
      }
    }
  }, [
    session,
    subscriptionRequired,
    subscriptionChecked,
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
    console.log("📱 Deep link received:", url);

    try {
      const { hostname, path, queryParams } = Linking.parse(url);
      console.log("📱 Parsed deep link:", { hostname, path, queryParams });

      // Create a unique key for this deep link to prevent double processing
      const linkKey = `${path}-${queryParams?.booking_id}-${queryParams?.status}-${queryParams?.type}`;
      if (processedDeepLinksRef.current.has(linkKey)) {
        console.log("📱 Deep link already processed, skipping");
        return;
      }
      processedDeepLinksRef.current.add(linkKey);

      // Clear old processed links after a timeout
      setTimeout(() => {
        processedDeepLinksRef.current.delete(linkKey);
      }, 5000);

      // Handle password recovery deep links (from Supabase email)
      if (queryParams?.type === "recovery" || path === "change_password") {
        console.log("🔑 Password recovery deep link detected");
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
        const planId = queryParams?.plan_id as string;

        const normalizedStatus = String(status || "").toLowerCase();
        if (normalizedStatus === "success" || normalizedStatus === "paid" || normalizedStatus === "completed") {
          showTopToast({
            type: "success",
            title: "Payment Successful",
            message: "Your payment was confirmed.",
          });
        } else if (normalizedStatus === "cancelled" || normalizedStatus === "canceled") {
          showTopToast({
            type: "warning",
            title: "Payment Cancelled",
            message: "The payment was cancelled before completion.",
          });
        } else if (normalizedStatus === "failed" || normalizedStatus === "error") {
          showTopToast({
            type: "error",
            title: "Payment Failed",
            message: "The payment did not go through. Please try again.",
          });
        }

        console.log("💳 Payment result deep link:", { status, bookingId, type, planId });

        // Navigate to payment result screen
        router.replace({
          pathname: "/payment-result",
          params: {
            status,
            booking_id: bookingId,
            type,
            plan_id: planId
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
          animation: "fade", // Smooth fade transition for tab switching
        }}
      />

      <Navbar global />
      <GlobalRadioMiniPlayer />

      {showSubscriptionModal && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          zIndex: 9999,
        }}>
          <SubscriptionRequiredScreen />
        </View>
      )}
    </View>
  );
}
