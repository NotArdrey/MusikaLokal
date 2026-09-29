import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import ThemeModeToggle from "./ThemeModeToggle";

const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", icon: "stats-chart-outline", route: "/admin" },
  { label: "Users", icon: "people-outline", route: "/admin/users" },
  { label: "Identity reviews", icon: "id-card-outline", route: "/admin/identity-reviews" },
  { label: "Manage", icon: "briefcase-outline", route: "/admin/manage" },
  { label: "Stations", icon: "radio-outline", route: "/admin/stations" },
  { label: "Reports", icon: "shield-checkmark-outline", route: "/admin/reports" },
  { label: "Audit", icon: "time-outline", route: "/admin/audit" },
  { label: "Posts", icon: "newspaper-outline", route: "/admin/posts" },
  { label: "Products", icon: "storefront-outline", route: "/admin/products" },
] as const;

export default function SidebarNav() {
  const pathname = usePathname();
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const activeRoute = useMemo(() => {
    const exact = ADMIN_NAV_ITEMS.find((item) => item.route === pathname);
    if (exact) return exact.route;
    return ADMIN_NAV_ITEMS.find(
      (item) => item.route !== "/admin" && pathname.startsWith(`${item.route}/`),
    )?.route || "/admin";
  }, [pathname]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: "local" });
      router.replace("/");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: isDark ? "#111827" : "#FFFFFF",
          borderRightColor: colors.border,
        },
      ]}
    >
      <View style={[styles.brand, { borderBottomColor: colors.border }]}>
        <Image
          source={
            isDark
              ? require("../../assets/images/musika-lokal-logo-modern-wordmark-dark.png")
              : require("../../assets/images/musika-lokal-logo-modern-wordmark.png")
          }
          resizeMode="contain"
          style={styles.logo}
        />
        <Text style={[styles.portalLabel, { color: colors.textSecondary }]}>ADMIN PORTAL</Text>
      </View>

      <ScrollView contentContainerStyle={styles.navigation} showsVerticalScrollIndicator={false}>
        {ADMIN_NAV_ITEMS.map((item) => {
          const active = activeRoute === item.route;
          return (
            <TouchableOpacity
              key={item.route}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              activeOpacity={0.82}
              onPress={() => router.replace(item.route as any)}
              style={[
                styles.navItem,
                active && { backgroundColor: isDark ? "rgba(255,255,255,0.09)" : `${colors.primary}12` },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={active ? colors.primary : colors.textSecondary}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: active ? colors.primary : colors.text },
                  active && styles.navLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.adminIdentity}>
          <View style={[styles.adminIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
          </View>
          <View style={styles.adminIdentityText}>
            <Text style={[styles.adminRole, { color: colors.text }]}>Administrator</Text>
            <Text numberOfLines={1} style={[styles.adminEmail, { color: colors.textSecondary }]}>
              {session?.user.email || "Admin account"}
            </Text>
          </View>
          <ThemeModeToggle compact showLabel={false} variant="button" />
        </View>

        <TouchableOpacity
          accessibilityLabel="Log out"
          activeOpacity={0.82}
          disabled={loggingOut}
          onPress={() => void handleLogout()}
          style={[styles.logoutButton, { borderColor: colors.border }]}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Ionicons name="log-out-outline" size={19} color={colors.textSecondary} />
          )}
          <Text style={[styles.logoutText, { color: colors.textSecondary }]}>
            {loggingOut ? "Logging out..." : "Log out"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { borderRightWidth: 1, width: 248 },
  brand: { borderBottomWidth: 1, paddingHorizontal: 22, paddingVertical: 22 },
  logo: { height: 42, width: 172 },
  portalLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 10, letterSpacing: 1.5, marginTop: 5 },
  navigation: { gap: 5, paddingHorizontal: 12, paddingVertical: 18 },
  navItem: { alignItems: "center", borderRadius: 10, flexDirection: "row", gap: 12, minHeight: 44, paddingHorizontal: 13 },
  navLabel: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  navLabelActive: { fontFamily: "Poppins_600SemiBold" },
  footer: { borderTopWidth: 1, gap: 13, marginTop: "auto", padding: 14 },
  adminIdentity: { alignItems: "center", flexDirection: "row", gap: 9 },
  adminIcon: { alignItems: "center", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  adminIdentityText: { flex: 1, minWidth: 0 },
  adminRole: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  adminEmail: { fontFamily: "Poppins_400Regular", fontSize: 10, marginTop: 1 },
  logoutButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 9, justifyContent: "center", minHeight: 42 },
  logoutText: { fontFamily: "Poppins_500Medium", fontSize: 12 },
});
