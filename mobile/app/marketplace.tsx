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

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

type MarketTab = "browse" | "my_orders" | "seller";

export default function MarketplaceScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, userRole, isGuest } = useAuth();
  const isSeller = userRole === "producer" || userRole === "musician";

  const [tab, setTab] = useState<MarketTab>("browse");

  // Browse state
  const [products, setProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const categories = ["Merch", "Vinyl", "Digital", "Instruments", "Tickets"];

  // Orders state
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [sellerOrders, setSellerOrders] = useState<any[]>([]);

  // Seller state
  const [dashboard, setDashboard] = useState<any>(null);
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);
  const [sellerTab, setSellerTab] = useState<"dashboard" | "products" | "orders">("dashboard");

  // Add product modal
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newProductType, setNewProductType] = useState<"physical" | "digital">("physical");
  const [adding, setAdding] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!session) return;
    try {
      const browseBody: any = { action: "browse_products", limit: 40 };
      if (category) browseBody.category = category;
      if (searchQuery.trim()) browseBody.search = searchQuery.trim();

      const promises: Promise<any>[] = [
        supabase.functions.invoke("manage-marketplace", { body: browseBody }),
        supabase.functions.invoke("manage-marketplace", { body: { action: "list_my_orders" } }),
      ];

      if (isSeller) {
        promises.push(
          supabase.functions.invoke("manage-marketplace", { body: { action: "get_seller_dashboard" } }),
          supabase.functions.invoke("manage-marketplace", { body: { action: "list_my_products" } }),
          supabase.functions.invoke("manage-marketplace", { body: { action: "list_seller_orders" } }),
        );
      }

      const results = await Promise.all(promises);
      if (results[0]?.data?.data) setProducts(results[0].data.data);
      if (results[1]?.data?.data) setMyOrders(results[1].data.data);
      if (isSeller && results.length > 2) {
        if (results[2]?.data?.data) setDashboard(results[2].data.data);
        if (results[3]?.data?.data) setSellerProducts(results[3].data.data);
        if (results[4]?.data?.data) setSellerOrders(results[4].data.data);
      }
    } catch (e: any) {
      console.error("Marketplace fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, category, searchQuery, isSeller]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const formatPrice = (price: number | null) => {
    if (!price) return "Free";
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
        fetchAll();
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
        fetchAll();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Marketplace" />
        <GuestSignInGate message="Sign in to access the marketplace" />
        <Navbar />
      </View>
    );
  }

  const tabs: { key: MarketTab; label: string; icon: string }[] = [
    { key: "browse", label: "Browse", icon: "storefront-outline" },
    { key: "my_orders", label: "My Orders", icon: "receipt-outline" },
    ...(isSeller ? [{ key: "seller" as MarketTab, label: "Seller Hub", icon: "briefcase-outline" }] : []),
  ];

  // ==========================================
  // Browse Tab Content
  // ==========================================
  const renderBrowse = () => (
    <>
      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search products..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => { setLoading(true); fetchAll(); }}
          returnKeyType="search"
        />
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={{ paddingHorizontal: 0 }}>
        <TouchableOpacity
          style={[styles.categoryPill, {
            borderColor: !category ? colors.primary : colors.border,
            backgroundColor: !category ? colors.primary + "20" : "transparent",
          }]}
          onPress={() => setCategory(null)}
        >
          <Text style={{ color: !category ? colors.primary : colors.textSecondary, fontSize: moderateScale(12) }}>All</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.categoryPill, {
              borderColor: category === c ? colors.primary : colors.border,
              backgroundColor: category === c ? colors.primary + "20" : "transparent",
            }]}
            onPress={() => setCategory(category === c ? null : c)}
          >
            <Text style={{ color: category === c ? colors.primary : colors.textSecondary, fontSize: moderateScale(12) }}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {products.length > 0 ? (
        <View style={styles.grid}>
          {products.map((product) => (
            <TouchableOpacity
              key={product.id}
              style={[styles.productCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
              onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
            >
              {product.cover_image_url ? (
                <CachedImage uri={product.cover_image_url} style={styles.productImage} />
              ) : (
                <View style={[styles.productImagePlaceholder, { backgroundColor: colors.primary + "10" }]}>
                  <Ionicons name="bag-outline" size={28} color={colors.primary} />
                </View>
              )}
              <View style={styles.productInfo}>
                <Text style={[styles.productTitle, { color: colors.text }]} numberOfLines={2}>{product.title}</Text>
                <Text style={[styles.productSeller, { color: colors.textSecondary }]} numberOfLines={1}>
                  {product.seller_name || "Seller"}
                </Text>
                <Text style={[styles.productPrice, { color: colors.primary }]}>{formatPrice(product.price)}</Text>
                {product.variant_count > 0 && (
                  <Text style={[styles.variantCount, { color: colors.textSecondary }]}>
                    {product.variant_count} variant{product.variant_count > 1 ? "s" : ""}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products found</Text>
        </View>
      )}
    </>
  );

  // ==========================================
  // My Orders Tab Content
  // ==========================================
  const renderMyOrders = () => (
    <>
      {myOrders.length > 0 ? (
        myOrders.map((order) => (
          <TouchableOpacity
            key={order.id}
            style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
            onPress={() => router.push({ pathname: "/deal_details", params: { order_id: order.id } })}
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
              {new Date(order.created_at).toLocaleDateString()}
            </Text>
            <View style={styles.orderFooter}>
              <Text style={[styles.orderItems, { color: colors.textSecondary }]}>
                {order.item_count || 0} item{(order.item_count || 0) > 1 ? "s" : ""}
              </Text>
              <Text style={[styles.orderTotal, { color: colors.text }]}>{formatPrice(order.total_amount)}</Text>
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No orders yet</Text>
        </View>
      )}
    </>
  );

  // ==========================================
  // Seller Hub Tab Content
  // ==========================================
  const renderSeller = () => (
    <>
      {/* Seller sub-tabs */}
      <View style={[styles.subTabRow, { borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
        {(["dashboard", "products", "orders"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.subTab, sellerTab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setSellerTab(t)}
          >
            <Text style={[styles.subTabText, { color: sellerTab === t ? colors.primary : colors.textSecondary }]}>
              {t === "dashboard" ? "Dashboard" : t === "products" ? "Products" : "Sales"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Dashboard */}
      {sellerTab === "dashboard" && dashboard && (
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
      )}
      {sellerTab === "dashboard" && !dashboard && (
        <View style={styles.emptyContainer}>
          <Ionicons name="analytics-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Start selling to see your dashboard stats</Text>
        </View>
      )}

      {/* Products */}
      {sellerTab === "products" && (
        <>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowAddProduct(true)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>Add Product</Text>
          </TouchableOpacity>
          {sellerProducts.length > 0 ? (
            sellerProducts.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.sellerProductCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
                onPress={() => router.push({ pathname: "/product_details", params: { product_id: p.id } })}
              >
                {p.cover_image_url ? (
                  <CachedImage uri={p.cover_image_url} style={styles.productThumb} />
                ) : (
                  <View style={[styles.productThumbPlaceholder, { backgroundColor: colors.primary + "10" }]}>
                    <Ionicons name="bag-outline" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.sellerProductTitle, { color: colors.text }]} numberOfLines={1}>{p.title}</Text>
                  <Text style={[styles.sellerProductPrice, { color: colors.primary }]}>{formatPrice(p.price)}</Text>
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
                    <TouchableOpacity style={{ marginTop: 6 }} onPress={() => handlePublishProduct(p.id)}>
                      <Text style={{ color: colors.primary, fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>Publish</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products yet. Add your first!</Text>
            </View>
          )}
        </>
      )}

      {/* Seller Orders */}
      {sellerTab === "orders" && (
        sellerOrders.length > 0 ? (
          sellerOrders.map((o) => (
            <View key={o.id} style={[styles.orderCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
              <View style={styles.orderHeader}>
                <Text style={[styles.orderNumber, { color: colors.text }]}>#{o.order_number}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(o.status) + "20" }]}>
                  <Text style={{ color: getStatusColor(o.status), fontSize: moderateScale(10) }}>{o.status}</Text>
                </View>
              </View>
              <Text style={[styles.orderDate, { color: colors.textSecondary }]}>
                {o.buyer_name || "Buyer"} • {new Date(o.created_at).toLocaleDateString()}
              </Text>
              <Text style={[styles.orderTotal, { color: colors.text }]}>{formatPrice(o.total_amount)}</Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No sales received yet</Text>
          </View>
        )
      )}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Marketplace" />

      {/* Main Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
        {tabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.mainTab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <Ionicons
              name={t.icon as any}
              size={moderateScale(16)}
              color={tab === t.key ? colors.primary : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.mainTabText, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={SCREEN_WIDTH - 32} height={100} style={{ marginBottom: 12, borderRadius: 12 }} />
          ))
        ) : (
          <>
            {tab === "browse" && renderBrowse()}
            {tab === "my_orders" && renderMyOrders()}
            {tab === "seller" && renderSeller()}
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
              <TouchableOpacity onPress={() => setShowAddProduct(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
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
                  <TouchableOpacity
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
              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: adding ? 0.6 : 1 }]}
                onPress={handleAddProduct}
                disabled={adding}
              >
                {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create Product</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  mainTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  mainTabText: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  subTabRow: { flexDirection: "row", borderBottomWidth: 1, marginBottom: 12 },
  subTab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  subTabText: { fontSize: moderateScale(12), fontFamily: "Poppins_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: moderateScale(14) },
  categoryRow: { marginBottom: 12, maxHeight: 44 },
  categoryPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginRight: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  productCard: { width: CARD_WIDTH, borderRadius: 12, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  productImage: { width: "100%", height: CARD_WIDTH },
  productImagePlaceholder: { width: "100%", height: CARD_WIDTH, alignItems: "center", justifyContent: "center" },
  productInfo: { padding: 10 },
  productTitle: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  productSeller: { fontSize: moderateScale(11), marginTop: 2 },
  productPrice: { fontSize: moderateScale(14), fontFamily: "Poppins_700Bold", marginTop: 4 },
  variantCount: { fontSize: moderateScale(10), marginTop: 2 },
  orderCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
  orderDate: { fontSize: moderateScale(12), marginTop: 4 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  orderItems: { fontSize: moderateScale(12) },
  orderTotal: { fontSize: moderateScale(16), fontFamily: "Poppins_700Bold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10, marginTop: 4 },
  statCard: { width: (SCREEN_WIDTH - 48) / 2 - 5, borderRadius: 12, borderWidth: 1, padding: 14, alignItems: "center" },
  statValue: { fontSize: moderateScale(18), fontFamily: "Poppins_700Bold", marginTop: 8 },
  statLabel: { fontSize: moderateScale(11), marginTop: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 16, gap: 6 },
  addBtnText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
  sellerProductCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  productThumb: { width: 56, height: 56, borderRadius: 8 },
  productThumbPlaceholder: { width: 56, height: 56, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sellerProductTitle: { fontSize: moderateScale(14), fontFamily: "Poppins_600SemiBold" },
  sellerProductPrice: { fontSize: moderateScale(13), marginTop: 2, fontFamily: "Poppins_700Bold" },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400 },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: moderateScale(17), fontFamily: "Poppins_700Bold" },
  inputLabel: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  typeRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  typePill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20, marginBottom: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
});
