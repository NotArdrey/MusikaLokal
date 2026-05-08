import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  Platform,
  Pressable,
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
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import Navbar from "../src/components/navbar";
import ProductDetailsModal from "../src/components/ProductDetailsModal";
import Skeleton from "../src/components/Skeleton";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { emitToast } from "../src/events/toastBus";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";

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

const getProductImage = (product: any) =>
  product?.cover_image_url || product?.primary_image || product?.thumbnail_url || null;

const formatPrice = (price: number | string | null | undefined) => {
  const amount = Number(price ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "Free";
  return `₱${amount.toLocaleString()}`;
};

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { session, isGuest, userId, userRole, roleResolved } = useAuth();
  const normalizedUserRole = (userRole || "").toLowerCase();
  const isFan = normalizedUserRole === "fan";
  const isMusician = normalizedUserRole === "musician";
  const canSell = Boolean(session) && roleResolved && !isMusician;

  const pageBackground = isWebDesktop ? (isDark ? "#0A1224" : "#E9EEF8") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#0F172A" : "#FFFFFF") : colors.surface;
  const borderSoft = isWebDesktop ? (isDark ? "#1E2C48" : "#D8E3F2") : colors.border;
  const inputBg = isDark ? "#1F2A44" : "#F3F4F6";

  const [tab, setTab] = useState<MarketTab>("browse");

  useEffect(() => {
    if (!canSell && tab === "sell") {
      setTab("browse");
    }
  }, [canSell, tab]);

  const [products, setProducts] = useState<any[]>([]);
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [listingImages, setListingImages] = useState<string[]>([]);
  const [listingThumbnailIndex, setListingThumbnailIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string; buttons?: any[] } | null>(null);
  const [detailsProductId, setDetailsProductId] = useState<string | null>(null);

  const invokeMarketplace = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-marketplace", { body });
    if (error) {
      console.warn("manage-marketplace failed", { message: error.message, body });
      throw error;
    }
    return data;
  }, []);

  const fetchBrowse = useCallback(async () => {
    try {
      const body: any = { action: "browse_products", limit: 40 };
      if (category) body.category = category;
      if (search.trim()) body.search = search.trim();
      const data = await invokeMarketplace(body);
      setProducts(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setProducts([]);
    }
  }, [category, search, invokeMarketplace]);

  const fetchSeller = useCallback(async () => {
    if (!canSell || !userId) {
      setSellerProducts([]);
      return;
    }
    try {
      const data = await invokeMarketplace({ action: "list_seller_products", seller_id: userId });
      setSellerProducts(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setSellerProducts([]);
    }
  }, [canSell, userId, invokeMarketplace]);

  const fetchAll = useCallback(
    async (isPullRefresh = false) => {
      if (!isPullRefresh) setLoading(true);
      await Promise.all([fetchBrowse(), fetchSeller()]);
      setLoading(false);
      setRefreshing(false);
    },
    [fetchBrowse, fetchSeller],
  );

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAll(true);
  };

  const browseProducts = useMemo(() => {
    const merged = new Map<string, any>();
    products.forEach((p: any) => p?.id && merged.set(p.id, p));
    sellerProducts.forEach((p: any) => {
      if (p?.id && p?.status === "sold_out") merged.set(p.id, p);
    });
    return Array.from(merged.values()).sort((a, b) => {
      const aSold = a?.status === "sold_out";
      const bSold = b?.status === "sold_out";
      if (aSold !== bSold) return aSold ? 1 : -1;
      return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    });
  }, [products, sellerProducts]);

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return browseProducts;
    return browseProducts.filter((p: any) =>
      [p?.title, p?.seller_name, p?.category, p?.product_type]
        .filter((v): v is string => typeof v === "string")
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [browseProducts, search]);

  const listingStats = useMemo(
    () => ({
      total: sellerProducts.length,
      live: sellerProducts.filter((i: any) => i?.status === "active").length,
      sold: sellerProducts.filter((i: any) => i?.status === "sold_out").length,
    }),
    [sellerProducts],
  );

  const resetCreateListingForm = useCallback(() => {
    setEditingProductId(null);
    setNewTitle("");
    setNewDescription("");
    setNewPrice("");
    setNewCategory("");
    setListingImages([]);
    setListingThumbnailIndex(0);
  }, []);

  const openEditListing = async (productId: string) => {
    if (statusUpdatingId) return;
    setStatusUpdatingId(productId);
    try {
      const data = await invokeMarketplace({ action: "get_product_details", product_id: productId });
      const product = data?.data;
      if (!product) throw new Error("Product not found");
      const mediaUrls = (product.media || [])
        .map((item: any) => item?.url || item?.storage_path)
        .filter((v: unknown): v is string => typeof v === "string" && v.trim().length > 0);
      setEditingProductId(product.id);
      setNewTitle(product.title || "");
      setNewDescription(product.description || "");
      setNewPrice(String(product.price || product.base_price || ""));
      setNewCategory(product.category || "");
      setListingImages(mediaUrls);
      setListingThumbnailIndex(0);
      setShowAddProduct(true);
      setTab("sell");
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message || "Unable to load listing." });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (deleteLoadingId) return;
    setDeleteLoadingId(productId);
    try {
      const data = await invokeMarketplace({ action: "delete_product", product_id: productId });
      if (!data?.success) throw new Error(data?.error || "Unable to delete listing");
      emitToast({ type: "success", title: "Listing Deleted", message: "The product has been removed." });
      fetchAll(true);
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message || "Unable to delete listing." });
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const promptDeleteProduct = (product: any) => {
    setAlert({
      type: "warning",
      title: "Delete Listing",
      message: `Delete "${product.title || "this listing"}"? This cannot be undone.`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDeleteProduct(product.id) },
      ],
    });
  };

  const handleListingStatus = async (
    productId: string,
    action: "publish_product" | "mark_product_sold" | "relist_product",
  ) => {
    if (statusUpdatingId) return;
    setStatusUpdatingId(productId);
    try {
      const data = await invokeMarketplace({ action, product_id: productId });
      if (data?.success) {
        const title =
          action === "mark_product_sold" ? "Marked as Sold" : action === "relist_product" ? "Listing Relisted" : "Published";
        emitToast({ type: "success", title, message: "Listing updated." });
        fetchAll(true);
        return;
      }
      setAlert({ type: "error", title: "Error", message: data?.error || "Unable to update listing" });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const parsedListingPrice = Number.parseFloat(newPrice);
  const isProductFormReady = newTitle.trim().length > 0 && (!newPrice.trim() || Number.isFinite(parsedListingPrice));

  const handleSubmitProduct = async () => {
    if (adding) return;
    if (!canSell) {
      setAlert({ type: "warning", title: "Selling Unavailable", message: "Only non-musician accounts can create listings." });
      return;
    }
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
      const orderedImages =
        listingImages.length > 0
          ? [
              listingImages[listingThumbnailIndex] || listingImages[0],
              ...listingImages.filter((_, i) => i !== listingThumbnailIndex),
            ].filter((url, i, arr) => Boolean(url) && arr.indexOf(url) === i)
          : [];

      const listingBody: Record<string, unknown> = {
        action: editingProductId ? "update_product" : "create_product",
        ...(editingProductId ? { product_id: editingProductId } : {}),
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        base_price: price || 0,
        category: newCategory || null,
        currency: "PHP",
        media: orderedImages.map((url) => ({ media_type: "image", storage_path: url })),
      };

      const data = await invokeMarketplace(listingBody);
      if (data?.success) {
        const createdProductId = data?.data?.id;
        let listingIsLive = false;
        if (!editingProductId && createdProductId) {
          const publishData = await invokeMarketplace({ action: "publish_product", product_id: createdProductId });
          listingIsLive = Boolean(publishData?.success);
        }
        emitToast({
          type: "success",
          title: editingProductId ? "Listing Updated" : listingIsLive ? "Listing Live" : "Listing Saved",
          message: editingProductId
            ? "Your listing changes are now saved."
            : listingIsLive
              ? "Buyers can now message you."
              : "Saved. Publish from Sell when ready.",
        });
        setShowAddProduct(false);
        resetCreateListingForm();
        setTab("sell");
        fetchAll(true);
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create listing" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setAdding(false);
    }
  };

  const tabs: { key: MarketTab; label: string; icon: any }[] = [
    { key: "browse", label: "Browse", icon: "storefront-outline" },
    ...(canSell ? [{ key: "sell" as MarketTab, label: "Sell", icon: "pricetags-outline" as any }] : []),
  ];

  const numColumns = isWebDesktop ? (width >= 1180 ? 4 : 3) : 2;

  // ---------- Browse ----------
  const renderBrowse = () => (
    <>
      <View style={[styles.introCard, { backgroundColor: cardBg, borderColor: borderSoft }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.introEyebrow, { color: colors.primary }]}>Marketplace</Text>
          <Text style={[styles.introTitle, { color: colors.text }]}>Browse listings and message sellers directly.</Text>
          <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>
            {canSell
              ? "Post merch, gear, and digital drops. Buyers contact you through chat instead of checking out in-app."
              : "Open any listing to ask questions, negotiate, and arrange the sale with the seller."}
          </Text>
        </View>
        {canSell ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.introAction, { backgroundColor: colors.primary }]}
            onPress={() => {
              setTab("sell");
              setShowAddProduct(true);
            }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.introActionText}>Create listing</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search listings..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={{ paddingRight: 12 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.categoryPill,
            {
              borderColor: !category ? colors.primary : borderSoft,
              backgroundColor: !category ? colors.primary + "20" : "transparent",
            },
          ]}
          onPress={() => setCategory(null)}
        >
          <Text style={{ color: !category ? colors.primary : colors.textSecondary, fontSize: 12 }}>All</Text>
        </TouchableOpacity>
        {MARKETPLACE_CATEGORIES.map((c) => (
          <TouchableOpacity
            activeOpacity={0.85}
            key={c.value}
            style={[
              styles.categoryPill,
              {
                borderColor: category === c.value ? colors.primary : borderSoft,
                backgroundColor: category === c.value ? colors.primary + "20" : "transparent",
              },
            ]}
            onPress={() => setCategory(category === c.value ? null : c.value)}
          >
            <Text style={{ color: category === c.value ? colors.primary : colors.textSecondary, fontSize: 12 }}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.grid}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={`skeleton-${i}`}
              style={[styles.productCard, gridItemStyle(numColumns), { backgroundColor: cardBg, borderColor: borderSoft }]}
            >
              <Skeleton width="100%" height={180} borderRadius={0} />
              <View style={styles.productInfo}>
                <Skeleton width="86%" height={14} style={{ marginBottom: 8 }} />
                <Skeleton width="50%" height={12} style={{ marginBottom: 8 }} />
                <Skeleton width="40%" height={14} />
              </View>
            </View>
          ))}
        </View>
      ) : filteredProducts.length > 0 ? (
        <View style={styles.grid}>
          {filteredProducts.map((product) => {
            const isSold = product?.status === "sold_out";
            const cardBorderColor = isSold ? "#F97316" + "55" : borderSoft;
            const categoryLabel = getCategoryLabel(product.category);
            return (
              <TouchableOpacity
                activeOpacity={0.88}
                key={product.id}
                style={[
                  styles.productCard,
                  gridItemStyle(numColumns),
                  { backgroundColor: cardBg, borderColor: cardBorderColor, opacity: isSold ? 0.78 : 1 },
                ]}
                onPress={() => setDetailsProductId(product.id)}
              >
                <View style={styles.productImageWrap}>
                  {getProductImage(product) ? (
                    <CachedImage uri={getProductImage(product)} style={styles.productImage} />
                  ) : (
                    <View style={[styles.productImagePlaceholder, { backgroundColor: colors.primary + "10" }]}>
                      <Ionicons name="bag-outline" size={28} color={colors.primary} />
                    </View>
                  )}
                  {isSold && (
                    <View style={styles.soldOverlay}>
                      <View style={styles.soldBadge}>
                        <Ionicons name="checkmark-circle" size={13} color="#fff" />
                        <Text style={styles.soldBadgeText}>Sold</Text>
                      </View>
                    </View>
                  )}
                </View>
                <View style={styles.productInfo}>
                  <Text style={[styles.productTitle, { color: isSold ? colors.textSecondary : colors.text }]} numberOfLines={2}>
                    {product.title}
                  </Text>
                  <Text style={[styles.productSeller, { color: colors.textSecondary }]} numberOfLines={1}>
                    {product.seller_name || "Seller"}
                  </Text>
                  <Text style={[styles.productPrice, { color: isSold ? "#F97316" : colors.primary }]}>{formatPrice(product.price)}</Text>
                  <View style={styles.cardFooterRow}>
                    {categoryLabel ? (
                      <Text style={[styles.variantCount, { color: colors.textSecondary }]} numberOfLines={1}>
                        {categoryLabel}
                      </Text>
                    ) : (
                      <View />
                    )}
                    {(isSold || !isFan) && (
                      <View style={[styles.chatHint, { backgroundColor: isSold ? "#F97316" + "14" : colors.primary + "12" }]}>
                        <Ionicons
                          name={isSold ? "ban-outline" : "chatbubble-ellipses-outline"}
                          size={12}
                          color={isSold ? "#F97316" : colors.primary}
                        />
                        <Text style={[styles.chatHintText, { color: isSold ? "#F97316" : colors.primary }]}>
                          {isSold ? "Sold" : "Message"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No listings found</Text>
        </View>
      )}
    </>
  );

  // ---------- Sell ----------
  const renderSell = () => (
    <>
      <View style={styles.sellStatsRow}>
        {[
          { label: "All", value: listingStats.total, icon: "apps-outline", tone: colors.primary },
          { label: "Live", value: listingStats.live, icon: "radio-outline", tone: "#10B981" },
          { label: "Sold", value: listingStats.sold, icon: "checkmark-circle-outline", tone: "#F97316" },
        ].map((stat) => (
          <View key={stat.label} style={[styles.sellStatCard, { backgroundColor: cardBg, borderColor: borderSoft }]}>
            <Ionicons name={stat.icon as any} size={18} color={stat.tone} />
            <Text style={[styles.sellStatValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.sellStatLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity activeOpacity={0.85} style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setShowAddProduct(true)}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addBtnText}>Create Listing</Text>
      </TouchableOpacity>

      {sellerProducts.length > 0 ? (
        sellerProducts.map((product: any) => {
          const isLive = product.status === "active";
          const isSold = product.status === "sold_out";
          const isBusy = statusUpdatingId === product.id || deleteLoadingId === product.id;
          const statusColor = isLive ? "#22c55e" : isSold ? "#f97316" : "#f59e0b";
          const statusLabel = isLive ? "Live" : isSold ? "Sold" : product.status || "Draft";
          const categoryLabel = getCategoryLabel(product.category);
          return (
            <TouchableOpacity
              activeOpacity={0.88}
              key={product.id}
              style={[styles.sellerProductCard, { backgroundColor: cardBg, borderColor: borderSoft }]}
              onPress={() => setDetailsProductId(product.id)}
            >
              {getProductImage(product) ? (
                <CachedImage uri={getProductImage(product)} style={styles.productThumb} />
              ) : (
                <View style={[styles.productThumbPlaceholder, { backgroundColor: colors.primary + "10" }]}>
                  <Ionicons name="bag-outline" size={20} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.sellerProductTitle, { color: colors.text }]} numberOfLines={1}>
                  {product.title}
                </Text>
                <Text style={[styles.sellerProductPrice, { color: colors.primary }]}>{formatPrice(product.price)}</Text>
                <Text style={[styles.sellerProductMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  {categoryLabel || "General listing"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 8 }}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
                  <Text style={{ color: statusColor, fontSize: 10, fontFamily: "Poppins_600SemiBold", textTransform: "capitalize" }}>{statusLabel}</Text>
                </View>
                {product.status === "draft" && (
                  <TouchableOpacity activeOpacity={0.85} disabled={isBusy} onPress={() => handleListingStatus(product.id, "publish_product")}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>{isBusy ? "Updating..." : "Publish"}</Text>
                  </TouchableOpacity>
                )}
                {isLive && (
                  <TouchableOpacity activeOpacity={0.85} disabled={isBusy} onPress={() => handleListingStatus(product.id, "mark_product_sold")}>
                    <Text style={{ color: "#F97316", fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>{isBusy ? "Updating..." : "Mark Sold"}</Text>
                  </TouchableOpacity>
                )}
                {isSold && (
                  <TouchableOpacity activeOpacity={0.85} disabled={isBusy} onPress={() => handleListingStatus(product.id, "relist_product")}>
                    <Text style={{ color: colors.primary, fontSize: 11, fontFamily: "Poppins_600SemiBold" }}>{isBusy ? "Updating..." : "Relist"}</Text>
                  </TouchableOpacity>
                )}
                <View style={styles.sellerActionButtons}>
                  <TouchableOpacity activeOpacity={0.85} disabled={isBusy} onPress={() => openEditListing(product.id)} style={[styles.iconActionBtn, { borderColor: borderSoft }]}>
                    <Ionicons name="pencil-outline" size={16} color={colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} disabled={isBusy} onPress={() => promptDeleteProduct(product)} style={[styles.iconActionBtn, { borderColor: "#FCA5A5", backgroundColor: "#FEE2E2" }]}>
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
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
    <View style={[styles.container, { backgroundColor: pageBackground }]}>
      <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header title="Marketplace" cardStyle hideBackButton />

        {tabs.length > 1 && (
          <View style={[styles.tabBar, { backgroundColor: cardBg, borderColor: borderSoft }]}>
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  activeOpacity={0.85}
                  style={[styles.tabBtn, active && { backgroundColor: colors.primary + "18", borderColor: colors.primary }]}
                  onPress={() => setTab(t.key)}
                >
                  <Ionicons name={t.icon} size={16} color={active ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tabText, { color: active ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <ScrollView
          style={styles.flex1}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {tab === "browse" ? renderBrowse() : renderSell()}
        </ScrollView>
      </View>

      <RNModal visible={showAddProduct} transparent animationType="fade" onRequestClose={() => { setShowAddProduct(false); resetCreateListingForm(); }}>
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowAddProduct(false);
            resetCreateListingForm();
          }}
        >
          <Pressable style={[styles.modalBox, { backgroundColor: cardBg, borderColor: borderSoft }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{editingProductId ? "Edit Listing" : "Create Listing"}</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => { setShowAddProduct(false); resetCreateListingForm(); }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 600 }}>
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
                style={[styles.input, { color: colors.text, borderColor: borderSoft, backgroundColor: pageBackground }]}
                placeholder="What are you selling?"
                placeholderTextColor={colors.textSecondary}
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.text, borderColor: borderSoft, backgroundColor: pageBackground }]}
                placeholder="Add details buyers should know..."
                placeholderTextColor={colors.textSecondary}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Price (₱)</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: borderSoft, backgroundColor: pageBackground }]}
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
                    <TouchableOpacity
                      activeOpacity={0.85}
                      key={option.value}
                      style={[
                        styles.modalCategoryPill,
                        { borderColor: isSelected ? colors.primary : borderSoft, backgroundColor: isSelected ? colors.primary + "16" : "transparent" },
                      ]}
                      onPress={() => setNewCategory(isSelected ? "" : option.value)}
                    >
                      <Text style={{ color: isSelected ? colors.primary : colors.textSecondary, fontSize: 12, fontFamily: "Poppins_500Medium" }}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                activeOpacity={adding || !isProductFormReady ? 1 : 0.85}
                style={[styles.submitBtn, { backgroundColor: isProductFormReady ? colors.primary : borderSoft, opacity: adding || !isProductFormReady ? 0.6 : 1 }]}
                onPress={handleSubmitProduct}
                disabled={adding || !isProductFormReady}
              >
                {adding ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.submitBtnText, { color: isProductFormReady ? "#FFFFFF" : colors.textSecondary }]}>{editingProductId ? "Save Changes" : "Post Listing"}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </RNModal>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} buttons={alert.buttons} onClose={() => setAlert(null)} />}
      <ProductDetailsModal
        productId={detailsProductId}
        visible={!!detailsProductId}
        onClose={() => setDetailsProductId(null)}
      />
      <Navbar />
    </View>
  );
}

const gridItemStyle = (cols: number) => ({
  width: `${100 / cols - 2}%` as any,
});

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  container: { flex: 1 },
  pageFrame: { flex: 1, width: "100%" },
  pageFrameWeb: { maxWidth: 1240, width: "100%", alignSelf: "center", paddingHorizontal: 20, paddingTop: 12 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12 },

  tabBar: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  introCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12, gap: 14 },
  introEyebrow: { fontSize: 11, fontFamily: "Poppins_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  introTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", marginTop: 4 },
  introSubtitle: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  introAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  introActionText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_700Bold" },

  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 48, borderRadius: 16, marginBottom: 8 },
  searchInput: { flex: 1, height: 24, fontSize: 15, fontFamily: "Poppins_500Medium", padding: 0 },

  categoryRow: { marginBottom: 12, maxHeight: 44 },
  categoryPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginRight: 8 },

  modalCategoryRow: { gap: 8, paddingVertical: 4, paddingRight: 16 },
  modalCategoryPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 12 },
  productCard: { borderRadius: 12, borderWidth: 1, marginBottom: 4, overflow: "hidden" },
  productImageWrap: { position: "relative", width: "100%", aspectRatio: 1 },
  productImage: { width: "100%", height: "100%" },
  productImagePlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  soldOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.42)" },
  soldBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "#F97316", paddingHorizontal: 10, paddingVertical: 6 },
  soldBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Poppins_700Bold" },
  productInfo: { padding: 10 },
  productTitle: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  productSeller: { fontSize: 11, marginTop: 2 },
  productPrice: { fontSize: 14, fontFamily: "Poppins_700Bold", marginTop: 4 },
  variantCount: { fontSize: 10, marginTop: 2 },
  cardFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 8 },
  chatHint: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  chatHintText: { fontSize: 10, fontFamily: "Poppins_600SemiBold" },

  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sellStatsRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 14 },
  sellStatCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center" },
  sellStatValue: { fontSize: 18, fontFamily: "Poppins_700Bold", marginTop: 8 },
  sellStatLabel: { fontSize: 11, marginTop: 4 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 16, gap: 6 },
  addBtnText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  sellerProductCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  productThumb: { width: 56, height: 56, borderRadius: 8 },
  productThumbPlaceholder: { width: 56, height: 56, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sellerProductTitle: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  sellerProductPrice: { fontSize: 13, marginTop: 2, fontFamily: "Poppins_700Bold" },
  sellerProductMeta: { fontSize: 11, marginTop: 4 },
  sellerActionButtons: { flexDirection: "row", gap: 8 },
  iconActionBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  emptyContainer: { alignItems: "center", justifyContent: "center", minHeight: 300, paddingVertical: 40 },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: 15, fontFamily: "Poppins_500Medium" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalBox: { width: "100%", maxWidth: 560, borderRadius: 18, borderWidth: 1, padding: 20, maxHeight: "90%" as any },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  inputLabel: { fontSize: 13, fontFamily: "Poppins_600SemiBold", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20, marginBottom: 8 },
  submitBtnText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
});
