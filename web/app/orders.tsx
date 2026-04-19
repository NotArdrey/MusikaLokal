import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type Tab = "my_orders" | "sales";

export default function OrdersScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<Tab>("my_orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const action = tab === "my_orders" ? "get_my_orders" : "get_seller_orders";
      const { data } = await supabase.functions.invoke("manage-marketplace", { body: { action } });
      if (data?.data) setOrders(data.data);
      else setOrders([]);
    } catch (e: any) { console.error(e); setOrders([]); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const statusColors: Record<string, string> = {
    pending: "#eab308", confirmed: "#3b82f6", shipped: "#8b5cf6", delivered: "#22c55e", cancelled: "#ef4444", refunded: "#64748b",
  };

  const renderOrder = ({ item }: { item: any }) => (
    <View style={[styles.orderCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
      <View style={styles.orderHeader}>
        <Text style={{ color: colors.text, fontSize: moderateScale(14), fontWeight: "700" }}>Order #{item.id?.slice(0, 8)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: (statusColors[item.status] || "#64748b") + "20" }]}>
          <Text style={{ color: statusColors[item.status] || "#64748b", fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>{item.status}</Text>
        </View>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{new Date(item.created_at).toLocaleDateString()}</Text>
      <View style={styles.orderFooter}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.item_count || 0} item(s)</Text>
        <Text style={{ color: colors.primary, fontSize: moderateScale(15), fontWeight: "700" }}>
          {item.currency || "PHP"} {Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Orders" onBackPress={() => router.back()} />
      <View style={isWebDesktop ? { flex: 1, alignItems: "center" } : { flex: 1 }}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 700, flex: 1, paddingHorizontal: 16 } : { flex: 1, paddingHorizontal: 16 }}>
          <View style={[styles.tabs, { borderColor: borderCol }]}>
            {(["my_orders", "sales"] as Tab[]).map((t) => (
              <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}>
                <Text style={{ color: tab === t ? colors.primary : colors.textSecondary, fontWeight: tab === t ? "700" : "500", fontSize: moderateScale(14) }}>
                  {t === "my_orders" ? "My Orders" : "Sales"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
            <FlatList
              data={orders}
              keyExtractor={(i) => i.id}
              renderItem={renderOrder}
              contentContainerStyle={{ paddingBottom: 100 }}
              ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>No orders found</Text>}
            />
          )}
        </View>
      </View>
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, marginTop: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
});
