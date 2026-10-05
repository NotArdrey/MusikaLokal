import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { router, Stack, usePathname } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import { supabase } from "../../lib/supabase";
import LoadingState from "../../src/components/LoadingState";
import SidebarNav from "../../src/components/SidebarNav";
import { AuthProvider, useAuth } from "../../src/context/AuthContext";
import { useTheme } from "../../src/context/ThemeContext";

export default function AdminLayout() {
  return (
    <AuthProvider>
      <BottomSheetModalProvider><AdminContent /></BottomSheetModalProvider>
    </AuthProvider>
  );
}

function AdminContent() {
  const { colors } = useTheme();
  const { session, loading, roleResolved, isAdmin } = useAuth();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const rejectingSessionRef = useRef(false);
  const isLoginRoute = pathname === "/admin/login";
  const showSidebar = Platform.OS === "web" && width >= 1024 && !!session && isAdmin && !isLoginRoute;

  useEffect(() => {
    if (loading) return;
    if (!session) {
      rejectingSessionRef.current = false;
      if (!isLoginRoute) router.replace("/admin/login");
      return;
    }
    if (!roleResolved) return;
    if (!isAdmin) {
      if (rejectingSessionRef.current) return;
      rejectingSessionRef.current = true;
      void supabase.auth.signOut({ scope: "local" }).finally(() => {
        if (!isLoginRoute) router.replace("/admin/login");
      });
      return;
    }
    rejectingSessionRef.current = false;
    if (isLoginRoute) router.replace("/admin");
  }, [isAdmin, isLoginRoute, loading, roleResolved, session]);

  if (!isLoginRoute && (loading || !session || !roleResolved || !isAdmin)) {
    return <LoadingState message="Opening the admin portal..." detail="Verifying administrator access." style={{ flex: 1 }} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, flexDirection: showSidebar ? "row" : "column" }}>
      {showSidebar ? <SidebarNav /> : null}
      <View style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "none" }} />
      </View>
    </View>
  );
}
