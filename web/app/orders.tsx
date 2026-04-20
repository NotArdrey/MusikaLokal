import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
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
  const { session, userRole, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const isSeller = userRole === "producer" || userRole === "musician";

  const [tab, setTab] = useState<Tab>("my_orders");
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [sellerOrders, setSellerOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;
  const frameMaxWidth = 980;
  const framePad = isWebDesktop ? 20 : 16;
  const panelBg = isWebDesktop ? (isDark ? "#111C33" : "#FFFFFF") : cardBg;
  const panelBorder = isWebDesktop ? (isDark ? "#24344F" : "#E2E8F0") : borderCol;

  const fetchOrders = useCallback(async () => {
    if (!session) {
      setMyOrders([]);
      setSellerOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    try {
      const { data: myData } = await supabase.functions.invoke("manage-marketplace", {
        body: { action: "list_my_orders" },
      });
      setMyOrders(Array.isArray(myData?.data) ? myData.data : []);

      if (isSeller) {
        const { data: sellerData } = await supabase.functions.invoke("manage-marketplace", {
          body: { action: "list_seller_orders" },
        });
        setSellerOrders(Array.isArray(sellerData?.data) ? sellerData.data : []);
      } else {
        setSellerOrders([]);
      }
    } catch (e: any) {
      console.error("Orders fetch error:", e);
      setMyOrders([]);
      setSellerOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, isSeller]);

  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const statusColors: Record<string, string> = {
    pending: "#f59e0b",
    confirmed: "#3b82f6",
    paid: "#3b82f6",
    processing: "#f59e0b",
    shipped: "#8b5cf6",
    delivered: "#22c55e",
    cancelled: "#ef4444",
    refunded: "#ef4444",
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "my_orders", label: "My Orders" },
    ...(isSeller ? [{ key: "sales" as Tab, label: "Sales" }] : []),
  ];

  const activeOrders = tab === "my_orders" ? myOrders : sellerOrders;

  const formatTotal = (order: any) => {
    const amount = Number(order?.total_amount ?? order?.total ?? 0);
    if (order?.currency && order.currency !== "PHP") {
      return `${order.currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    }
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const renderOrder = (item: any, isSelling = false) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.orderCard, { backgroundColor: cardBg, borderColor: borderCol }]}
      onPress={() => router.push({ pathname: "/deal_details", params: { order_id: item.id } })}
    >
      <View style={styles.orderHeader}>
        <Text style={[styles.orderTitle, { color: colors.text }]}>#{item.order_number || item.id?.slice(0, 8) || "..."}</Text>
        <View style={[styles.statusBadge, { backgroundColor: (statusColors[item.status] || "#64748b") + "20" }]}>
          <Text style={{ color: statusColors[item.status] || "#64748b", fontSize: 11, fontFamily: "Poppins_600SemiBold", textTransform: "capitalize" }}>
            {item.status}
          </Text>
        </View>
      </View>

      <Text style={[styles.orderMeta, { color: colors.textSecondary }]}>{new Date(item.created_at).toLocaleDateString()}</Text>

      {isSelling && item.buyer_name && (
        <Text style={[styles.orderMeta, { color: colors.textSecondary }]}>Buyer: {item.buyer_name}</Text>
      )}

      <View style={styles.orderFooter}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{item.item_count || 0} item{(item.item_count || 0) > 1 ? "s" : ""}</Text>
        <Text style={[styles.orderTotal, { color: colors.text }]}>{formatTotal(item)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Header title="Orders" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to view your orders" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Orders" onBackPress={() => router.back()} />
      <View style={[styles.pageWrap, isWebDesktop && styles.pageWrapWeb]}>
        <View style={[styles.pageFrame, { maxWidth: frameMaxWidth, paddingHorizontal: framePad }]}>
          {tabs.length > 1 && (
            <View style={[styles.tabs, { borderColor: panelBorder, backgroundColor: panelBg }]}>
              {tabs.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={[
                    styles.tabBtn,
                    tab === t.key && {
                      borderBottomWidth: 2,
                      borderBottomColor: colors.primary,
                      backgroundColor: colors.primary + "14",
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: tab === t.key ? colors.primary : colors.textSecondary,
                      fontFamily: tab === t.key ? "Poppins_700Bold" : "Poppins_500Medium",
                      fontSize: moderateScale(14),
                    }}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
            ))}
            </View>
          )}

          <ScrollView
            style={[styles.content, { borderColor: panelBorder, backgroundColor: panelBg }]}
            contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 14, paddingTop: 10 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 42 }} />
            ) : activeOrders.length > 0 ? (
              activeOrders.map((order) => renderOrder(order, tab === "sales"))
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#CBD5E1"} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{tab === "my_orders" ? "No orders yet" : "No sales yet"}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageWrap: { flex: 1 },
  pageWrapWeb: { alignItems: "center" },
  pageFrame: { width: "100%", flex: 1 },
  tabs: { flexDirection: "row", borderWidth: 1, borderRadius: 14, marginTop: 10, overflow: "hidden" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  content: { flex: 1, marginTop: 10, borderWidth: 1, borderRadius: 14 },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderTitle: { fontSize: moderateScale(14.5), fontFamily: "Poppins_700Bold" },
  orderMeta: { fontSize: moderateScale(12), marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  orderTotal: { fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
  emptyWrap: { minHeight: 360, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
});
