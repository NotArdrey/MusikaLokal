import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type Tab = "dashboard" | "products" | "orders";

export default function SellerHubScreen() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productTitle, setProductTitle] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productType, setProductType] = useState<"physical" | "digital">("physical");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;
  const frameMaxWidth = 980;
  const framePad = isWebDesktop ? 20 : 16;
  const panelBg = isWebDesktop ? (isDark ? "#111C33" : "#FFFFFF") : cardBg;
  const panelBorder = isWebDesktop ? (isDark ? "#24344F" : "#E2E8F0") : borderCol;

  const fetchData = useCallback(async () => {
    if (!session) {
      setStats(null);
      setProducts([]);
      setOrders([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    try {
      const [dashRes, prodRes, ordRes] = await Promise.all([
        supabase.functions.invoke("manage-marketplace", { body: { action: "get_seller_dashboard" } }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "list_my_products" } }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "list_seller_orders" } }),
      ]);
      setStats(dashRes.data?.data || null);
      setProducts(Array.isArray(prodRes.data?.data) ? prodRes.data.data : []);
      setOrders(Array.isArray(ordRes.data?.data) ? ordRes.data.data : []);
    } catch (e: any) {
      console.error("SellerHub fetch error:", e);
      setStats(null);
      setProducts([]);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleAddProduct = async () => {
    if (!productTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Enter a product title." });
      return;
    }
    const parsedPrice = parseFloat(productPrice);
    if (productPrice && Number.isNaN(parsedPrice)) {
      setAlert({ type: "warning", title: "Invalid Price", message: "Enter a valid price." });
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: {
          action: "create_product",
          title: productTitle.trim(),
          description: productDescription.trim() || null,
          price: parsedPrice || 0,
          category: productCategory.trim() || null,
          product_type: productType,
        },
      });

      if (data?.success) {
        showTopToast({ type: "success", title: "Product Created", message: "Your product has been created as a draft." });
        setShowAddProduct(false);
        setProductTitle("");
        setProductDescription("");
        setProductPrice("");
        setProductCategory("");
        fetchData();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create product" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (productId: string) => {
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: { action: "publish_product", product_id: productId },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Published", message: "Product is now live." });
        fetchData();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
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

  const statGrid = [
    { label: "Total Orders", value: stats?.total_orders || 0, icon: "receipt-outline" as const, color: "#3b82f6" },
    { label: "Revenue", value: `₱${Number(stats?.total_revenue || 0).toLocaleString()}`, icon: "cash-outline" as const, color: "#22c55e" },
    { label: "Active Products", value: stats?.active_products || 0, icon: "cube-outline" as const, color: "#8b5cf6" },
    { label: "Pending Orders", value: stats?.pending_orders || 0, icon: "time-outline" as const, color: "#eab308" },
  ];

  const renderDashboard = () => (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
        {stats ? (
          <View style={styles.statGrid}>
            {statGrid.map((s, i) => (
              <View key={i} style={[styles.statCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                <Ionicons name={s.icon} size={24} color={s.color} />
                <Text style={{ color: colors.text, fontSize: moderateScale(18), fontWeight: "800", marginTop: 6 }}>{s.value}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#CBD5E1"} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Start selling to see your dashboard stats</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );

  const renderProducts = () => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
        <TouchableOpacity activeOpacity={1} style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddProduct(true)}>
          <Ionicons name="add" size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>Add Product</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={products}
        keyExtractor={(i) => i.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <TouchableOpacity activeOpacity={1}
            style={[styles.productRow, { backgroundColor: cardBg, borderColor: borderCol }]}
            onPress={() => router.push({ pathname: "/product_details", params: { product_id: item.id } })}
          >
            {item.cover_image_url || item.thumbnail_url ? (
              <CachedImage uri={item.cover_image_url || item.thumbnail_url } style={styles.thumbImg} />
            ) : (
              <View style={[styles.thumbPlaceholder, { backgroundColor: colors.primary + "10" }]}>
                <Ionicons name="bag-outline" size={20} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", marginTop: 2 }}>₱{Number(item.price || 0).toLocaleString()}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={[styles.statusBadge, { backgroundColor: item.status === "active" ? "#22c55e20" : "#f59e0b20" }]}> 
                <Text style={{ color: item.status === "active" ? "#22c55e" : "#f59e0b", fontSize: 11, textTransform: "capitalize" }}>
                  {item.status}
                </Text>
              </View>
              {item.status === "draft" && (
                <TouchableOpacity activeOpacity={1} style={{ marginTop: 6 }} onPress={() => handlePublish(item.id)}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>Publish</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#CBD5E1"} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products yet. Add your first!</Text>
          </View>
        }
      />
    </View>
  );

  const renderOrders = () => (
    <FlatList
      data={orders}
      keyExtractor={(i) => i.id}
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100 }}
      renderItem={({ item }) => (
        <TouchableOpacity activeOpacity={1}
          style={[styles.orderCard, { backgroundColor: cardBg, borderColor: borderCol }]}
        >
          <View style={styles.orderHeader}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>#{item.order_number || item.id?.slice(0, 8)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: (statusColors[item.status] || "#64748b") + "20" }]}>
              <Text style={{ color: statusColors[item.status] || "#64748b", fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>{item.status}</Text>
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
            {(item.buyer_name || "Buyer") + " • " + new Date(item.created_at).toLocaleDateString()}
          </Text>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 6 }}>₱{Number(item.total_amount || item.total || 0).toLocaleString()}</Text>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#CBD5E1"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No orders received yet</Text>
        </View>
      }
    />
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Header title="Seller Hub" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to manage your shop" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Seller Hub" onBackPress={() => router.back()} />
      <View style={[styles.pageWrap, isWebDesktop && styles.pageWrapWeb]}>
        <View style={[styles.pageFrame, { maxWidth: frameMaxWidth, paddingHorizontal: framePad }]}>
          <View style={[styles.tabs, { borderColor: panelBorder, backgroundColor: panelBg }]}>
            {(["dashboard", "products", "orders"] as Tab[]).map((t) => (
              <TouchableOpacity activeOpacity={1}
                key={t}
                onPress={() => setTab(t)}
                style={[
                  styles.tabBtn,
                  tab === t && { borderBottomWidth: 2, borderBottomColor: colors.primary, backgroundColor: colors.primary + "14" },
                ]}
              >
                <Text
                  style={{
                    color: tab === t ? colors.primary : colors.textSecondary,
                    fontFamily: tab === t ? "Poppins_700Bold" : "Poppins_500Medium",
                    fontSize: moderateScale(13),
                    textTransform: "capitalize",
                  }}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.panelBody, { borderColor: panelBorder, backgroundColor: panelBg }]}>
            {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 48 }} /> : tab === "dashboard" ? renderDashboard() : tab === "products" ? renderProducts() : renderOrders()}
          </View>
        </View>
      </View>

      <Modal visible={showAddProduct} transparent animationType="slide" onRequestClose={() => setShowAddProduct(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontSize: moderateScale(17), fontWeight: "700" }}>Add Product</Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowAddProduct(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 4 }}>Title *</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol }]} value={productTitle} onChangeText={setProductTitle} placeholder="Product name" placeholderTextColor={colors.textSecondary} maxLength={100} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 4, marginTop: 10 }}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.text, borderColor: borderCol }]}
              value={productDescription}
              onChangeText={setProductDescription}
              placeholder="Product description..."
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 4, marginTop: 10 }}>Price (₱)</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol }]} value={productPrice} onChangeText={setProductPrice} placeholder="0.00" placeholderTextColor={colors.textSecondary} keyboardType="decimal-pad" />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 4, marginTop: 10 }}>Category</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: borderCol }]}
              value={productCategory}
              onChangeText={setProductCategory}
              placeholder="e.g. Merch, Vinyl, Digital"
              placeholderTextColor={colors.textSecondary}
            />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 8, marginTop: 10 }}>Type</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {(["physical", "digital"] as const).map((t) => (
                <TouchableOpacity activeOpacity={1} key={t} onPress={() => setProductType(t)} style={[styles.typeBtn, { backgroundColor: productType === t ? colors.primary : "transparent", borderColor: productType === t ? colors.primary : borderCol }]}>
                  <Text style={{ color: productType === t ? "#fff" : colors.text, textTransform: "capitalize" }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity activeOpacity={1} style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={handleAddProduct} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Create Product</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageWrap: { flex: 1 },
  pageWrapWeb: { alignItems: "center" },
  pageFrame: { width: "100%", flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const },
  modalBox: { borderRadius: 16, padding: 24, width: "90%" as any, maxWidth: 480, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  tabs: { flexDirection: "row", borderWidth: 1, borderRadius: 14, marginTop: 10, overflow: "hidden" },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  panelBody: { flex: 1, marginTop: 10, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  statCard: { width: "48%", padding: 16, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, marginBottom: 10 },
  productRow: { flexDirection: "row", padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8, alignItems: "center" },
  thumbImg: { width: 50, height: 50, borderRadius: 8 },
  thumbPlaceholder: { width: 50, height: 50, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  publishBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  typeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  submitBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  emptyWrap: { minHeight: 360, alignItems: "center", justifyContent: "center" },
  emptyText: { textAlign: "center", marginTop: 10, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
});

