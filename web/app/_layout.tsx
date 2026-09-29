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
import { router, Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "../global.css";
import { supabase } from "../lib/supabase";
import LoadingState from "../src/components/LoadingState";
import SidebarNav from "../src/components/SidebarNav";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { ThemeProvider, useTheme } from "../src/context/ThemeContext";
import { TopToastProvider } from "../src/context/TopToastContext";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_300Light,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <PortalProvider>
          <TopToastProvider>
            <AuthProvider>
              <BottomSheetModalProvider>
                <AdminRootContent />
              </BottomSheetModalProvider>
            </AuthProvider>
          </TopToastProvider>
        </PortalProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function AdminRootContent() {
  const { colors } = useTheme();
  const { session, loading, roleResolved, isAdmin } = useAuth();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const rejectingSessionRef = useRef(false);

  const isLoginRoute = pathname === "/";
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const showSidebar = Platform.OS === "web" && width >= 768 && !!session && isAdmin;

  useEffect(() => {
    if (loading) return;

    if (!session) {
      rejectingSessionRef.current = false;
      if (!isLoginRoute) router.replace("/");
      return;
    }

    if (!roleResolved) return;

    if (!isAdmin) {
      if (rejectingSessionRef.current) return;
      rejectingSessionRef.current = true;
      void supabase.auth.signOut({ scope: "local" }).finally(() => {
        router.replace("/");
      });
      return;
    }

    rejectingSessionRef.current = false;
    if (!isAdminRoute) router.replace("/admin");
  }, [isAdmin, isAdminRoute, isLoginRoute, loading, roleResolved, session]);

  const isResolvingAccess =
    loading ||
    (!!session && !roleResolved) ||
    (!!session && roleResolved && !isAdmin) ||
    (!session && !isLoginRoute);

  if (isResolvingAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoadingState
          message="Opening the admin portal..."
          detail="Verifying administrator access."
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        flexDirection: showSidebar ? "row" : "column",
      }}
    >
      {showSidebar ? <SidebarNav /> : null}
      <View style={{ flex: 1, overflow: "hidden" }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "none",
          }}
        />
      </View>
    </View>
  );
}
