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
import { useEffect, useRef } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import SidebarNav from "../src/components/SidebarNav";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { TopToastProvider } from "../src/context/TopToastContext";

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
        <PortalProvider>
          <TopToastProvider>
            <AuthProvider>
              <BottomSheetModalProvider>
                <RootContent />
              </BottomSheetModalProvider>
            </AuthProvider>
          </TopToastProvider>
        </PortalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function RootContent() {
  const { colors } = useTheme();
  const {
    session,
    loading,
    identityRequired,
    identityChecked,
    isGuest,
    userRole,
  } =
    useAuth();
  const segments = useSegments();
  const processedDeepLinksRef = useRef<Set<string>>(new Set());

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
        console.log("🪪 Identity verification required, redirecting to verification screen");
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

        console.log("💳 Payment result deep link:", { status, bookingId, type });

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

  const authScreens = [
    "index",
    "signup",
    "forget_password",
    "change_password",
    "payment-result",
  ];
  const segmentStrings = segments.map((segment) => String(segment));
  const currentScreen = segmentStrings.length > 0 ? segmentStrings[segmentStrings.length - 1] : "index";
  const isAuthScreen = authScreens.includes(currentScreen);
  const { width } = useWindowDimensions();
  const showSidebar = Platform.OS === 'web' && width >= 768 && !isAuthScreen;
  const isAdminContext = userRole === 'admin' || segmentStrings.includes('admin');
  const useSidebarLayout = showSidebar && (isAdminContext || isGuest);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, flexDirection: useSidebarLayout ? 'row' : 'column' }}>
      {showSidebar && <SidebarNav />}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <View style={{ flex: 1, width: '100%' }}>
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
