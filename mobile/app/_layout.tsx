import {
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    useFonts,
} from "@expo-google-fonts/poppins";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import * as Linking from "expo-linking";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";

SplashScreen.preventAutoHideAsync();

LogBox.ignoreLogs([
  "AuthApiError: Invalid Refresh Token: Refresh Token Not Found",
]);

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
        <AuthProvider>
          <BottomSheetModalProvider>
            <RootContent />
          </BottomSheetModalProvider>
        </AuthProvider>
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
  const segments = useSegments();
  const processedDeepLinksRef = useRef<Set<string>>(new Set());

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
        console.log(
          "🔒 Subscription required, redirecting to subscription page",
        );
        router.replace("/subscription_required");
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
    </View>
  );
}
