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
import { Platform, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import SidebarNav from "../src/components/SidebarNav";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";

SplashScreen.preventAutoHideAsync();

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
  } =
    useAuth();
  const segments = useSegments();
  const processedDeepLinksRef = useRef<Set<string>>(new Set());

  // Handle subscription gate for owners
  useEffect(() => {
    if (loading) return;
    // Wait for subscription check to complete before making decisions
    if (!subscriptionChecked) return;

    // If user is logged in and subscription is required
    if (session && subscriptionRequired) {
      // Allow access to certain screens even without subscription
      const allowedScreens = [
        "subscription_required",
        "payment-result",
        "settings",
        "help_support",
        "privacy_policy",
        "terms_and_conditions",
      ];
      const segmentStrings = segments.map((segment) => String(segment));
      // segments array can be empty on initial load or root
      const currentScreen = segmentStrings.length > 0 ? segmentStrings[segmentStrings.length - 1] : "index";

      console.log(`🔒 Layout Check: Screen=${currentScreen}, Segments=${JSON.stringify(segments)}, SubRequired=${subscriptionRequired}`);

      // Check if any part of the path is in allowed screens (better for nested routes)
      const isAllowed =
        allowedScreens.some((screen) => segmentStrings.includes(screen)) ||
        allowedScreens.includes(currentScreen);

      if (!isAllowed) {
        console.log(
          "🔒 Subscription required, redirecting to subscription page",
        );
        router.replace("/subscription_required");
      }
    }
  }, [session, subscriptionRequired, subscriptionChecked, loading, segments]);

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

  const authScreens = [
    "index",
    "signup",
    "forget_password",
    "change_password",
    "subscription_required",
    "payment-result",
  ];
  const segmentStrings = segments.map((segment) => String(segment));
  const currentScreen = segmentStrings.length > 0 ? segmentStrings[segmentStrings.length - 1] : "index";
  const isAuthScreen = authScreens.includes(currentScreen);
  const { width } = useWindowDimensions();
  const showSidebar = Platform.OS === 'web' && width >= 768 && !isAuthScreen;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, flexDirection: showSidebar ? 'row' : 'column' }}>
      {showSidebar && <SidebarNav />}
      <View style={{ flex: 1, overflow: 'hidden', alignItems: showSidebar ? 'center' : undefined }}>
        <View style={{ flex: 1, width: '100%', maxWidth: showSidebar ? 1200 : undefined }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: "fade",
            }}
          />
        </View>
      </View>
    </View>
  );
}
