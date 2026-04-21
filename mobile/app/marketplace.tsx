import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import ImageUploader from "../src/components/ImageUploader";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const MARKETPLACE_CATEGORIES = [
  { value: "apparel", label: "Apparel" },
  { value: "accessories", label: "Accessories" },
  { value: "vinyl", label: "Vinyl" },
  { value: "cd", label: "CD" },
  { value: "poster", label: "Poster" },
  { value: "sticker", label: "Sticker" },
  { value: "digital", label: "Digital" },
  { value: "bundle", label: "Bundle" },
  { value: "other", label: "Other" },
];

type MarketTab = "browse" | "sell";

const getCategoryLabel = (category: string | null | undefined) => {
  if (!category) return null;
  const match = MARKETPLACE_CATEGORIES.find((option) => option.value === category);
  return match?.label || category;
};

const getProductImage = (product: any) => product?.cover_image_url || product?.primary_image || null;

export default function MarketplaceScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { session, userRole, isGuest, userId } = useAuth();
  const isSeller = userRole === "producer" || userRole === "musician";

  const [tab, setTab] = useState<MarketTab>("browse");

  // Browse state
  const [products, setProducts] = useState<any[]>([]);
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  // Add product modal
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [listingImages, setListingImages] = useState<string[]>([]);
  const [listingThumbnailIndex, setListingThumbnailIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const fetchAll = useCallback(async () => {
    if (!session) {
      setProducts([]);
      setSellerProducts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const browseBody: any = { action: "browse_products", limit: 40 };
      if (category) browseBody.category = category;

      const promises: Promise<any>[] = [supabase.functions.invoke("manage-marketplace", { body: browseBody })];

      if (isSeller) {
        promises.push(supabase.functions.invoke("manage-marketplace", { body: { action: "list_my_products" } }));
      }

      const results = await Promise.all(promises);
      setProducts(results[0]?.data?.data || []);
      setSellerProducts(isSeller ? results[1]?.data?.data || [] : []);
    } catch (e: any) {
      console.error("Marketplace fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, category, isSeller]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]));

  const onRefresh = () => { setRefreshing(true); fetchAll(); };

  const filteredProducts = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return products;

    return products.filter((product) =>
      [product?.title, product?.seller_name, product?.category, product?.product_type]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [products, searchQuery]);

  const listingStats = useMemo(() => ({
    total: sellerProducts.length,
    live: sellerProducts.filter((item) => item?.status === "active").length,
    sold: sellerProducts.filter((item) => item?.status === "sold_out").length,
  }), [sellerProducts]);

  const formatPrice = (price: number | string | null | undefined) => {
    const amount = Number(price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Free";
    return `â‚±${amount.toLocaleString()}`;
  };

  const resetCreateListingForm = useCallback(() => {
    setNewTitle("");
    setNewDescription("");
    setNewPrice("");
    setNewCategory("");
    setListingImages([]);
    setListingThumbnailIndex(0);
  }, []);

  const handleAddProduct = async () => {
    if (!newTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Enter a listing title." });
      return;
    }

    const price = parseFloat(newPrice);
    if (newPrice && isNaN(price)) {
      setAlert({ type: "warning", title: "Invalid Price", message: "Enter a valid price." });
      return;
    }

    setAdding(true);
    try {
      const orderedImages = listingImages.length > 0
        ? [
            listingImages[listingThumbnailIndex] || listingImages[0],
            ...listingImages.filter((_, index) => index !== listingThumbnailIndex),
          ].filter((imageUrl, index, array) => Boolean(imageUrl) && array.indexOf(imageUrl) === index)
        : [];

      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: {
          action: "create_product",
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          base_price: price || 0,
          category: newCategory || null,
          currency: "PHP",
          media: orderedImages.map((imageUrl) => ({
            media_type: "image",
            storage_path: imageUrl,
          })),
        },
      });

      if (data?.success) {
        const createdProductId = data?.data?.id;
        let listingIsLive = false;

        if (createdProductId) {
          const { data: publishData } = await supabase.functions.invoke("manage-marketplace", {
            body: { action: "publish_product", product_id: createdProductId },
          });
          listingIsLive = Boolean(publishData?.success);
        }

        showTopToast({
          type: "success",
          title: listingIsLive ? "Listing Live" : "Listing Saved",
          message: listingIsLive
            ? "Buyers can now message you about this item."
            : "Your listing was saved. Publish it from Sell when you're ready.",
        });
        setShowAddProduct(false);
        resetCreateListingForm();
        setTab("sell");
        fetchAll();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create listing" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setAdding(false);
    }
  };

  const handleListingStatus = async (productId: string, action: "publish_product" | "mark_product_sold" | "relist_product") => {
    setStatusUpdatingId(productId);
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: { action, product_id: productId },
      });

      if (data?.success) {
        const title = action === "mark_product_sold"
          ? "Marked as Sold"
          : action === "relist_product"
            ? "Listing Relisted"
            : "Published";
        const message = action === "mark_product_sold"
          ? "This listing is now hidden from buyers."
          : action === "relist_product"
            ? "Buyers can message you about this item again."
            : "Product is now live.";
        showTopToast({ type: "success", title, message });
        fetchAll();
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Unable to update listing" });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handlePublishProduct = async (productId: string) => {
    handleListingStatus(productId, "publish_product");
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
    ...(isSeller ? [{ key: "sell" as MarketTab, label: "Sell", icon: "pricetags-outline" }] : []),
  ];

  // ==========================================
  // Browse Tab Content
  // ==========================================
  const renderBrowse = () => (
    <>
      <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.introEyebrow, { color: colors.primary }]}>Marketplace</Text>
          <Text style={[styles.introTitle, { color: colors.text }]}>Browse listings and message sellers directly.</Text>
          <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}> 
            {isSeller
              ? "Post merch, gear, and digital drops. Buyers contact you through chat instead of checking out in-app."
              : "Open any listing to ask questions, negotiate, and arrange the sale with the seller."}
          </Text>
        </View>

        {isSeller ? (
          <TouchableOpacity activeOpacity={1}
            style={[styles.introAction, { backgroundColor: colors.primary }]}
            onPress={() => {
              setTab("sell");
              setShowAddProduct(true);
            }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.introActionText}>Create listing</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.introIconWrap, { backgroundColor: colors.primary + "14" }]}>
            <Ionicons name="chatbubbles-outline" size={22} color={colors.primary} />
          </View>
        )}
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search listings..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={{ paddingHorizontal: 0 }}>
        <TouchableOpacity activeOpacity={1}
          style={[styles.categoryPill, {
            borderColor: !category ? colors.primary : colors.border,
            backgroundColor: !category ? colors.primary + "20" : "transparent",
          }]}
          onPress={() => setCategory(null)}
        >
          <Text style={{ color: !category ? colors.primary : colors.textSecondary, fontSize: moderateScale(12) }}>All</Text>
        </TouchableOpacity>
        {MARKETPLACE_CATEGORIES.map((c) => (
          <TouchableOpacity activeOpacity={1}
            key={c.value}
            style={[styles.categoryPill, {
              borderColor: category === c.value ? colors.primary : colors.border,
              backgroundColor: category === c.value ? colors.primary + "20" : "transparent",
            }]}
            onPress={() => setCategory(category === c.value ? null : c.value)}
          >
            <Text style={{ color: category === c.value ? colors.primary : colors.textSecondary, fontSize: moderateScale(12) }}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filteredProducts.length > 0 ? (
        <View style={styles.grid}>
          {filteredProducts.map((product) => (
            <TouchableOpacity activeOpacity={1}
              key={product.id}
              style={[styles.productCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
              onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
            >
              {getProductImage(product) ? (
                <CachedImage uri={getProductImage(product)} style={styles.productImage} />
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
                <View style={styles.cardFooterRow}>
                  {getCategoryLabel(product.category) ? (
                    <Text style={[styles.variantCount, { color: colors.textSecondary }]} numberOfLines={1}>
                      {getCategoryLabel(product.category)}
                    </Text>
                  ) : <View />}
                  <View style={[styles.chatHint, { backgroundColor: colors.primary + "12" }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={12} color={colors.primary} />
                    <Text style={[styles.chatHintText, { color: colors.primary }]}>Message</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No listings found</Text>
        </View>
      )}
    </>
  );

  // ==========================================
  // Sell Tab Content
  // ==========================================
  const renderSell = () => (
    <>
      <View style={styles.sellStatsRow}>
        {[
          { label: "All", value: listingStats.total, icon: "apps-outline", tone: colors.primary },
          { label: "Live", value: listingStats.live, icon: "radio-outline", tone: "#10B981" },
          { label: "Sold", value: listingStats.sold, icon: "checkmark-circle-outline", tone: "#F97316" },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[styles.sellStatCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
          >
            <Ionicons name={stat.icon as any} size={18} color={stat.tone} />
            <Text style={[styles.sellStatValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.sellStatLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity activeOpacity={1}
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        onPress={() => setShowAddProduct(true)}
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>Create Listing</Text>
      </TouchableOpacity>

      {sellerProducts.length > 0 ? (
        sellerProducts.map((product) => {
          const isLive = product.status === "active";
          const isSold = product.status === "sold_out";
          const isBusy = statusUpdatingId === product.id;
          const statusColor = isLive ? "#22c55e" : isSold ? "#f97316" : "#f59e0b";
          const statusLabel = isLive ? "Live" : isSold ? "Sold" : product.status || "Draft";
          const categoryLabel = getCategoryLabel(product.category);

          return (
            <TouchableOpacity activeOpacity={1}
              key={product.id}
              style={[styles.sellerProductCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
              onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
            >
              {getProductImage(product) ? (
                <CachedImage uri={getProductImage(product)} style={styles.productThumb} />
              ) : (
                <View style={[styles.productThumbPlaceholder, { backgroundColor: colors.primary + "10" }]}>
                  <Ionicons name="bag-outline" size={20} color={colors.primary} />
                </View>
              )}

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.sellerProductTitle, { color: colors.text }]} numberOfLines={1}>{product.title}</Text>
                <Text style={[styles.sellerProductPrice, { color: colors.primary }]}>{formatPrice(product.price)}</Text>
                <Text style={[styles.sellerProductMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {categoryLabel || "General listing"}
                </Text>
              </View>

              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}> 
                  <Text style={{ color: statusColor, fontSize: moderateScale(10), fontFamily: "Poppins_600SemiBold", textTransform: "capitalize" }}>
                    {statusLabel}
                  </Text>
                </View>
                {product.status === "draft" && (
                  <TouchableOpacity activeOpacity={1} disabled={isBusy} onPress={() => handlePublishProduct(product.id)}>
                    <Text style={{ color: colors.primary, fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
                      {isBusy ? "Updating..." : "Publish"}
                    </Text>
                  </TouchableOpacity>
                )}
                {isLive && (
                  <TouchableOpacity activeOpacity={1} disabled={isBusy} onPress={() => handleListingStatus(product.id, "mark_product_sold")}>
                    <Text style={{ color: "#F97316", fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
                      {isBusy ? "Updating..." : "Mark Sold"}
                    </Text>
                  </TouchableOpacity>
                )}
                {isSold && (
                  <TouchableOpacity activeOpacity={1} disabled={isBusy} onPress={() => handleListingStatus(product.id, "relist_product")}>
                    <Text style={{ color: colors.primary, fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
                      {isBusy ? "Updating..." : "Relist"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="pricetags-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No listings yet. Create your first one.</Text>
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Marketplace" />

      {/* Main Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
        {tabs.map((t) => (
          <TouchableOpacity activeOpacity={1}
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
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={SCREEN_WIDTH - 32} height={100} style={{ marginBottom: 12, borderRadius: 12 }} />
          ))
        ) : (
          <>
            {tab === "browse" && renderBrowse()}
            {tab === "sell" && renderSell()}
          </>
        )}

      </ScrollView>

      {/* Add Product Modal */}
      <Modal
        visible={showAddProduct}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowAddProduct(false);
          resetCreateListingForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Create Listing</Text>
              <TouchableOpacity activeOpacity={1}
                onPress={() => {
                  setShowAddProduct(false);
                  resetCreateListingForm();
                }}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Photos</Text>
              <ImageUploader
                images={listingImages}
                onImagesChange={setListingImages}
                thumbnailIndex={listingThumbnailIndex}
                onThumbnailChange={setListingThumbnailIndex}
                maxImages={10}
                bucketName="listings"
                userId={userId || session?.user?.id || "marketplace-user"}
                folder="marketplace"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
                placeholder="What are you selling?"
                placeholderTextColor={colors.textSecondary}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
                placeholder="Add details buyers should know..."
                placeholderTextColor={colors.textSecondary}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />
              <Text style={[styles.inputLabel, { color: colors.text }]}>Price (â‚±)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
                placeholder="0.00"
                placeholderTextColor={colors.textSecondary}
                value={newPrice}
                onChangeText={setNewPrice}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.inputLabel, { color: colors.text }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalCategoryRow}>
                {MARKETPLACE_CATEGORIES.map((option) => {
                  const isSelected = newCategory === option.value;
                  return (
                    <TouchableOpacity activeOpacity={1}
                      key={option.value}
                      style={[
                        styles.modalCategoryPill,
                        {
                          borderColor: isSelected ? colors.primary : isDark ? "#334155" : "#E2E8F0",
                          backgroundColor: isSelected ? colors.primary + "16" : "transparent",
                        },
                      ]}
                      onPress={() => setNewCategory(isSelected ? "" : option.value)}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.primary : colors.textSecondary,
                          fontSize: moderateScale(12),
                          fontFamily: "Poppins_500Medium",
                        }}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity activeOpacity={1}
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: adding ? 0.6 : 1 }]}
                onPress={handleAddProduct}
                disabled={adding}
              >
                {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Post Listing</Text>}
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
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  introCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12, gap: 14 },
  introEyebrow: { fontSize: moderateScale(11), fontFamily: "Poppins_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  introTitle: { fontSize: moderateScale(18), fontFamily: "Poppins_700Bold", marginTop: 4 },
  introSubtitle: { fontSize: moderateScale(13), lineHeight: 20, marginTop: 6 },
  introAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  introActionText: {
    color: "#fff",
    fontSize: moderateScale(13),
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  introIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: moderateScale(14) },
  categoryRow: { marginBottom: 12, maxHeight: 44 },
  categoryPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginRight: 8 },
  modalCategoryRow: { gap: 8, paddingVertical: 4, paddingRight: 16 },
  modalCategoryPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  productCard: { width: CARD_WIDTH, borderRadius: 12, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  productImage: { width: "100%", height: CARD_WIDTH },
  productImagePlaceholder: { width: "100%", height: CARD_WIDTH, alignItems: "center", justifyContent: "center" },
  productInfo: { padding: 10 },
  productTitle: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  productSeller: { fontSize: moderateScale(11), marginTop: 2 },
  productPrice: { fontSize: moderateScale(14), fontFamily: "Poppins_700Bold", marginTop: 4 },
  variantCount: { fontSize: moderateScale(10), marginTop: 2 },
  cardFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 },
  chatHint: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  chatHintText: { fontSize: moderateScale(10), fontFamily: "Poppins_600SemiBold" },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sellStatsRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  sellStatCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center" },
  sellStatValue: { fontSize: moderateScale(18), fontFamily: "Poppins_700Bold", marginTop: 8 },
  sellStatLabel: { fontSize: moderateScale(11), marginTop: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 16, gap: 6 },
  addBtnText: {
    color: "#fff",
    fontSize: moderateScale(15),
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  sellerProductCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  productThumb: { width: 56, height: 56, borderRadius: 8 },
  productThumbPlaceholder: { width: 56, height: 56, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sellerProductTitle: { fontSize: moderateScale(14), fontFamily: "Poppins_600SemiBold" },
  sellerProductPrice: { fontSize: moderateScale(13), marginTop: 2, fontFamily: "Poppins_700Bold" },
  sellerProductMeta: { fontSize: moderateScale(11), marginTop: 4 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400 },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: {
    fontSize: moderateScale(17),
    fontFamily: "Poppins_700Bold",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  inputLabel: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20, marginBottom: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
});
