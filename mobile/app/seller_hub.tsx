import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";
import { formatFriendlyDateTime } from "../src/utils/friendlyDateTime";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type SellerTab = "products" | "orders" | "dashboard";

export default function SellerHubScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, isGuest } = useAuth();

  const [tab, setTab] = useState<SellerTab>("dashboard");
  const [dashboard, setDashboard] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add product modal
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newProductType, setNewProductType] = useState<"physical" | "digital">("physical");
  const [adding, setAdding] = useState(false);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!session) return;
    try {
      const [dashRes, prodRes, ordRes] = await Promise.all([
        supabase.functions.invoke("manage-marketplace", { body: { action: "get_seller_dashboard" } }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "list_my_products" } }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "list_seller_orders" } }),
      ]);
      if (dashRes.data?.data) setDashboard(dashRes.data.data);
      if (prodRes.data?.data) setProducts(prodRes.data.data);
      if (ordRes.data?.data) setOrders(ordRes.data.data);
    } catch (e: any) {
      console.error("SellerHub fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const formatPrice = (price: number | null) => {
    if (!price) return "₱0";
    return `₱${price.toLocaleString()}`;
  };

  const handleAddProduct = async () => {
    if (!newTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Enter a product title." });
      return;
    }
    const price = parseFloat(newPrice);
    if (newPrice && isNaN(price)) {
      setAlert({ type: "warning", title: "Invalid Price", message: "Enter a valid price." });
      return;
    }
    setAdding(true);
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: {
          action: "create_product",
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          price: price || 0,
          category: newCategory.trim() || null,
          product_type: newProductType,
        },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Product Created", message: "Your product has been created as a draft." });
        setShowAddProduct(false);
        setNewTitle(""); setNewDescription(""); setNewPrice(""); setNewCategory("");
        fetchData();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create product" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setAdding(false);
    }
  };

  const handlePublishProduct = async (productId: string) => {
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

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Seller Hub" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to manage your shop" />
        
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Seller Hub" onBackPress={() => router.back()} />

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomWidth: 1, borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
        {(["dashboard", "products", "orders"] as SellerTab[]).map((t) => (
          <TouchableOpacity activeOpacity={1}
            key={t}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 }]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.textSecondary }]}>
              {t === "dashboard" ? "Dashboard" : t === "products" ? "Products" : "Orders"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          [1, 2, 3].map((i) => <Skeleton key={i} width={SCREEN_WIDTH - 32} height={100} style={{ marginBottom: 12, borderRadius: 12 }} />)
        ) : (
          <>
            {/* Dashboard */}
            {tab === "dashboard" && dashboard && (
              <>
                <View style={styles.statGrid}>
                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
                    <Ionicons name="bag-check" size={24} color="#22c55e" />
                    <Text style={[styles.statValue, { color: colors.text }]}>{dashboard.total_orders || 0}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Orders</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
                    <Ionicons name="cash" size={24} color={colors.primary} />
                    <Text style={[styles.statValue, { color: colors.text }]}>{formatPrice(dashboard.total_revenue)}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Revenue</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
                    <Ionicons name="cube" size={24} color="#8b5cf6" />
                    <Text style={[styles.statValue, { color: colors.text }]}>{dashboard.active_products || 0}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active Products</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
                    <Ionicons name="time" size={24} color="#f59e0b" />
                    <Text style={[styles.statValue, { color: colors.text }]}>{dashboard.pending_orders || 0}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pending</Text>
                  </View>
                </View>
              </>
            )}

            {tab === "dashboard" && !dashboard && (
              <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Start selling to see your dashboard stats
              </Text>
     </View>
            )}

            {/* Products */}
            {tab === "products" && (
              <>
                <TouchableOpacity activeOpacity={1}
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowAddProduct(true)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.addBtnText}>Add Product</Text>
                </TouchableOpacity>
                {products.length > 0 ? (
                  products.map((p) => (
                    <TouchableOpacity activeOpacity={1}
                      key={p.id}
                      style={[styles.productCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
                      onPress={() => router.push({ pathname: "/product_details", params: { product_id: p.id } })}
                    >
                      {p.cover_image_url ? (
                        <CachedImage uri={p.cover_image_url } style={styles.productThumb} />
                      ) : (
                        <View style={[styles.productThumbPlaceholder, { backgroundColor: colors.primary + "10" }]}>
                          <Ionicons name="bag-outline" size={20} color={colors.primary} />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.productTitle, { color: colors.text }]} numberOfLines={1}>{p.title}</Text>
                        <Text style={[styles.productPrice, { color: colors.primary }]}>{formatPrice(p.price)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <View style={[styles.statusBadge, {
                          backgroundColor: p.status === "active" ? "#22c55e20" : "#f59e0b20"
                        }]}>
                          <Text style={{
                            color: p.status === "active" ? "#22c55e" : "#f59e0b",
                            fontSize: moderateScale(10)
                          }}>
                            {p.status}
                          </Text>
                        </View>
                        {p.status === "draft" && (
                          <TouchableOpacity activeOpacity={1}
                            style={{ marginTop: 6 }}
                            onPress={() => handlePublishProduct(p.id)}
                          >
                            <Text style={{ color: colors.primary, fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>Publish</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products yet. Add your first!</Text>
     </View>
                )}
              </>
            )}

            {/* Orders */}
            {tab === "orders" && (
              orders.length > 0 ? (
                orders.map((o) => (
                  <View key={o.id} style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
                    <View style={styles.orderHeader}>
                      <Text style={[styles.orderNumber, { color: colors.text }]}>#{o.order_number}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: "#3b82f620" }]}>
                        <Text style={{ color: "#3b82f6", fontSize: moderateScale(10) }}>{o.status}</Text>
                      </View>
                    </View>
                    <Text style={[styles.orderBuyer, { color: colors.textSecondary }]}>
                      {o.buyer_name || "Buyer"} | {formatFriendlyDateTime(o.created_at)}
                    </Text>
                    <Text style={[styles.orderTotal, { color: colors.text }]}>{formatPrice(o.total_amount)}</Text>
                  </View>
                ))
              ) : (
                <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No orders received yet</Text>
     </View>
              )
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add Product Modal */}
      <Modal visible={showAddProduct} transparent animationType="slide" onRequestClose={() => setShowAddProduct(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Add Product</Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowAddProduct(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
          <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="Product title"
            placeholderTextColor={colors.textSecondary}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="Product description..."
            placeholderTextColor={colors.textSecondary}
            value={newDescription}
            onChangeText={setNewDescription}
            multiline
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Price (₱)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            value={newPrice}
            onChangeText={setNewPrice}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Category</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="e.g. Merch, Vinyl, Digital"
            placeholderTextColor={colors.textSecondary}
            value={newCategory}
            onChangeText={setNewCategory}
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Type</Text>
          <View style={styles.typeRow}>
            {(["physical", "digital"] as const).map((t) => (
              <TouchableOpacity activeOpacity={1}
                key={t}
                style={[styles.typePill, {
                  borderColor: newProductType === t ? colors.primary : colors.border,
                  backgroundColor: newProductType === t ? colors.primary + "20" : "transparent",
                }]}
                onPress={() => setNewProductType(t)}
              >
                <Ionicons
                  name={t === "physical" ? "cube-outline" : "cloud-download-outline"}
                  size={14}
                  color={newProductType === t ? colors.primary : colors.textSecondary}
                />
                <Text style={{ color: newProductType === t ? colors.primary : colors.textSecondary, fontSize: moderateScale(12), marginLeft: 6 }}>
                  {t === "physical" ? "Physical" : "Digital"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity activeOpacity={1}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: adding ? 0.6 : 1 }]}
            onPress={handleAddProduct}
            disabled={adding}
          >
            {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create Product</Text>}
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
  tabRow: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  tabText: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 },
  statCard: { width: (SCREEN_WIDTH - 48) / 2 - 5, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center" },
  statValue: { fontSize: moderateScale(18), fontFamily: "Poppins_700Bold", marginTop: 8 },
  statLabel: { fontSize: moderateScale(11), marginTop: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 16, gap: 6 },
  addBtnText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
  productCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  productThumb: { width: 56, height: 56, borderRadius: 8 },
  productThumbPlaceholder: { width: 56, height: 56, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  productTitle: { fontSize: moderateScale(14), fontFamily: "Poppins_600SemiBold" },
  productPrice: { fontSize: moderateScale(13), marginTop: 2, fontFamily: "Poppins_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  orderCard: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: moderateScale(14), fontFamily: "Poppins_700Bold" },
  orderBuyer: { fontSize: moderateScale(12), marginTop: 4 },
  orderTotal: { fontSize: moderateScale(15), fontFamily: "Poppins_700Bold", marginTop: 6 },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
  modalContent: { padding: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" as const },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  sectionTitle: { fontSize: moderateScale(17), fontFamily: "Poppins_700Bold" as const },
  inputLabel: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  typePill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
});
