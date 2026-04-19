import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
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
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
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
  const { session, userId } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productTitle, setProductTitle] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productType, setProductType] = useState<"physical" | "digital">("physical");
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, prodRes, ordRes] = await Promise.all([
        supabase.functions.invoke("manage-marketplace", { body: { action: "get_seller_dashboard" } }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "get_my_products" } }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "get_seller_orders" } }),
      ]);
      if (dashRes.data?.data) setStats(dashRes.data.data);
      if (prodRes.data?.data) setProducts(prodRes.data.data);
      if (ordRes.data?.data) setOrders(ordRes.data.data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddProduct = async () => {
    if (!productTitle.trim()) { setAlert({ type: "error", title: "Validation", message: "Title is required." }); return; }
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", { body: { action: "create_product", title: productTitle.trim(), price: parseFloat(productPrice) || 0, product_type: productType, currency: "PHP" } });
      if (data?.success) { showTopToast({ type: "success", title: "Created", message: "Product created." }); setShowAddProduct(false); setProductTitle(""); setProductPrice(""); fetchData(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setSubmitting(false); }
  };

  const handlePublish = async (productId: string) => {
    const { data } = await supabase.functions.invoke("manage-marketplace", { body: { action: "update_product", product_id: productId, status: "active" } });
    if (data?.success) { showTopToast({ type: "success", title: "Published", message: "Product is now live." }); fetchData(); }
  };

  const statusColors: Record<string, string> = { pending: "#eab308", confirmed: "#3b82f6", shipped: "#8b5cf6", delivered: "#22c55e", cancelled: "#ef4444" };

  const statGrid = [
    { label: "Total Orders", value: stats?.total_orders || 0, icon: "receipt-outline" as const, color: "#3b82f6" },
    { label: "Revenue", value: `₱${Number(stats?.total_revenue || 0).toLocaleString()}`, icon: "cash-outline" as const, color: "#22c55e" },
    { label: "Active Products", value: stats?.active_products || 0, icon: "cube-outline" as const, color: "#8b5cf6" },
    { label: "Pending Orders", value: stats?.pending_orders || 0, icon: "time-outline" as const, color: "#eab308" },
  ];

  const renderDashboard = () => (
    <ScrollView contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
      <View style={isWebDesktop ? { width: "100%", maxWidth: 800, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
        <View style={styles.statGrid}>
          {statGrid.map((s, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Ionicons name={s.icon} size={24} color={s.color} />
              <Text style={{ color: colors.text, fontSize: moderateScale(18), fontWeight: "800", marginTop: 6 }}>{s.value}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 100 }} />
      </View>
    </ScrollView>
  );

  const renderProducts = () => (
    <View style={{ flex: 1 }}>
      <View style={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 800, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddProduct(true)}>
            <Ionicons name="add" size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", marginLeft: 6 }}>Add Product</Text>
          </TouchableOpacity>
        </View>
      </View>
      <FlatList
        data={products}
        keyExtractor={(i) => i.id}
        contentContainerStyle={isWebDesktop ? { alignItems: "center", paddingBottom: 100 } : { paddingHorizontal: 16, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <View style={[styles.productRow, { backgroundColor: cardBg, borderColor: borderCol, maxWidth: isWebDesktop ? 800 : undefined, width: isWebDesktop ? "100%" : undefined }]}>
            {item.thumbnail_url && <CachedImage uri={item.thumbnail_url } style={styles.thumbImg} />}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", marginTop: 2 }}>PHP {Number(item.price || 0).toFixed(2)}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, textTransform: "capitalize" }}>{item.status}</Text>
            </View>
            {item.status === "draft" && <TouchableOpacity style={[styles.publishBtn, { backgroundColor: "#22c55e" }]} onPress={() => handlePublish(item.id)}><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Publish</Text></TouchableOpacity>}
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>No products yet</Text>}
      />
    </View>
  );

  const renderOrders = () => (
    <FlatList
      data={orders}
      keyExtractor={(i) => i.id}
      contentContainerStyle={isWebDesktop ? { alignItems: "center", paddingBottom: 100 } : { paddingHorizontal: 16, paddingBottom: 100 }}
      renderItem={({ item }) => (
        <View style={[styles.orderCard, { backgroundColor: cardBg, borderColor: borderCol, maxWidth: isWebDesktop ? 800 : undefined, width: isWebDesktop ? "100%" : undefined }]}>
          <View style={styles.orderHeader}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>#{item.id?.slice(0, 8)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: (statusColors[item.status] || "#64748b") + "20" }]}>
              <Text style={{ color: statusColors[item.status] || "#64748b", fontSize: 11, fontWeight: "600", textTransform: "capitalize" }}>{item.status}</Text>
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>{new Date(item.created_at).toLocaleDateString()}</Text>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700", marginTop: 6 }}>PHP {Number(item.total || 0).toFixed(2)}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>No orders yet</Text>}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Seller Hub" onBackPress={() => router.back()} />
      <View style={[styles.tabs, { borderColor: borderCol }]}>
        {(["dashboard", "products", "orders"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && { borderBottomWidth: 2, borderBottomColor: colors.primary }]}>
            <Text style={{ color: tab === t ? colors.primary : colors.textSecondary, fontWeight: tab === t ? "700" : "500", fontSize: moderateScale(13), textTransform: "capitalize" }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : tab === "dashboard" ? renderDashboard() : tab === "products" ? renderProducts() : renderOrders()}

      <Modal visible={showAddProduct} transparent animationType="slide" onRequestClose={() => setShowAddProduct(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontSize: moderateScale(17), fontWeight: "700" }}>Add Product</Text>
              <TouchableOpacity onPress={() => setShowAddProduct(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 4 }}>Title *</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol }]} value={productTitle} onChangeText={setProductTitle} placeholder="Product name" placeholderTextColor={colors.textSecondary} maxLength={100} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 4, marginTop: 10 }}>Price (PHP)</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol }]} value={productPrice} onChangeText={setProductPrice} placeholder="0.00" placeholderTextColor={colors.textSecondary} keyboardType="decimal-pad" />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", marginBottom: 8, marginTop: 10 }}>Type</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
              {(["physical", "digital"] as const).map((t) => (
                <TouchableOpacity key={t} onPress={() => setProductType(t)} style={[styles.typeBtn, { backgroundColor: productType === t ? colors.primary : "transparent", borderColor: productType === t ? colors.primary : borderCol }]}>
                  <Text style={{ color: productType === t ? "#fff" : colors.text, textTransform: "capitalize" }}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={handleAddProduct} disabled={submitting}>
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
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const },
  modalBox: { borderRadius: 16, padding: 24, width: "90%" as any, maxWidth: 480, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  statCard: { width: "48%", padding: 16, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, marginTop: 12, marginBottom: 10 },
  productRow: { flexDirection: "row", padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 8, alignItems: "center" },
  thumbImg: { width: 50, height: 50, borderRadius: 8 },
  publishBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  typeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  submitBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center" },
});
