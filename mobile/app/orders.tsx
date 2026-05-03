import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Dimensions,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import SlidingTabBar from "../src/components/SlidingTabBar";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { formatFriendlyDateTime } from "../src/utils/friendlyDateTime";
import { getSmoothTabIndex, setSmoothTab } from "../src/utils/smoothTabs";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type OrderTab = "my_orders" | "seller_orders";

export default function OrdersScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, userRole, isGuest } = useAuth();
  const isSeller = userRole === "producer" || userRole === "musician";

  const [tab, setTab] = useState<OrderTab>("my_orders");
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [sellerOrders, setSellerOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!session) return;
    try {
      const { data: myData } = await supabase.functions.invoke("manage-marketplace", {
        body: { action: "list_my_orders" },
      });
      if (myData?.data) setMyOrders(myData.data);

      if (isSeller) {
        const { data: sellerData } = await supabase.functions.invoke("manage-marketplace", {
          body: { action: "list_seller_orders" },
        });
        if (sellerData?.data) setSellerOrders(sellerData.data);
      }
    } catch (e: any) {
      console.error("Orders fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, isSeller]);

  useFocusEffect(useCallback(() => {
    let isActive = true;
    const focusTask = InteractionManager.runAfterInteractions(() => {
      if (isActive) {
        void fetchOrders();
      }
    });

    return () => {
      isActive = false;
      focusTask.cancel();
    };
  }, [fetchOrders]));

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const formatPrice = (price: number | null) => {
    if (!price) return "₱0";
    return `₱${price.toLocaleString()}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "#3b82f6";
      case "processing": return "#f59e0b";
      case "shipped": return "#8b5cf6";
      case "delivered": return "#22c55e";
      case "cancelled": case "refunded": return "#ef4444";
      default: return "#6b7280";
    }
  };

  const renderOrder = (order: any, isSelling = false) => (
    <TouchableOpacity activeOpacity={1}
      key={order.id}
      style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
    >
      <View style={styles.orderHeader}>
        <Text style={[styles.orderNumber, { color: colors.text }]}>#{order.order_number || "..."}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + "20" }]}>
          <Text style={{ color: getStatusColor(order.status), fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
            {order.status}
          </Text>
        </View>
      </View>
      <Text style={[styles.orderDate, { color: colors.textSecondary }]}>
        {formatFriendlyDateTime(order.created_at)}
      </Text>
      {isSelling && order.buyer_name && (
        <Text style={[styles.orderBuyer, { color: colors.textSecondary }]}>Buyer: {order.buyer_name}</Text>
      )}
      <View style={styles.orderFooter}>
        <Text style={[styles.orderItems, { color: colors.textSecondary }]}>
          {order.item_count || 0} item{(order.item_count || 0) > 1 ? "s" : ""}
        </Text>
        <Text style={[styles.orderTotal, { color: colors.text }]}>{formatPrice(order.total_amount)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Orders" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to view your orders" />
        
      </View>
    );
  }

  const tabs: { key: OrderTab; label: string }[] = [
    { key: "my_orders", label: "My Orders" },
    ...(isSeller ? [{ key: "seller_orders" as OrderTab, label: "Sales" }] : []),
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Orders" onBackPress={() => router.back()} />

      {tabs.length > 1 && (
        <SlidingTabBar
          activeColor={colors.primary}
          activeKey={tab}
          borderColor={isDark ? "#334155" : "#E2E8F0"}
          indicatorColor={colors.primary}
          indicatorWidthRatio={0.32}
          onChange={(nextTab) => setSmoothTab(setTab, nextTab)}
          tabs={tabs}
          textStyle={styles.tabText}
        />
      )}

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <SmoothTabTransition
          activeKey={tab}
          activeIndex={getSmoothTabIndex(tabs.map((item) => item.key), tab)}
          renderOutgoing={false}
        >
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} width={SCREEN_WIDTH - 32} height={100} style={{ marginBottom: 10, borderRadius: 12 }} />)
        ) : (
          <>
            {tab === "my_orders" && (
              myOrders.length > 0
                ? myOrders.map((o) => renderOrder(o))
                : <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No orders yet</Text>
     </View>
            )}
            {tab === "seller_orders" && (
              sellerOrders.length > 0
                ? sellerOrders.map((o) => renderOrder(o, true))
                : <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No sales yet</Text>
     </View>
            )}
          </>
        )}
        </SmoothTabTransition>

        <View style={{ height: 100 }} />
      </ScrollView>

      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  tabText: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  orderCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  orderDate: { fontSize: moderateScale(12), marginTop: 4 },
  orderBuyer: { fontSize: moderateScale(12), marginTop: 2 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  orderItems: { fontSize: moderateScale(12) },
  orderTotal: { fontSize: moderateScale(16), fontFamily: "Poppins_700Bold" },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
});

