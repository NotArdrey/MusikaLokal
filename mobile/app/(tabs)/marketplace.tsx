import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import BottomModal from "../../src/components/BottomModal";
import CachedImage from "../../src/components/CachedImage";
import Header from "../../src/components/header";
import ImageUploader from "../../src/components/ImageUploader";
import Navbar from "../../src/components/navbar";
import Skeleton from "../../src/components/Skeleton";
import SlidingTabBar from "../../src/components/SlidingTabBar";
import SmoothTabTransition from "../../src/components/SmoothTabTransition";
import CustomAlert, { AlertType } from "../../src/components/CustomAlert";
import { useBottomBarClearance } from "../../src/hooks/useBottomBarClearance";
import { useAuth } from "../../src/context/AuthContext";
import { useBottomOverlay } from "../../src/context/BottomOverlayContext";
import { emitToast } from "../../src/events/toastBus";
import { useTheme } from "../../src/context/ThemeContext";
import {
  useMarketplaceProductsQuery,
  useSellerProductsQuery,
} from "../../src/data/hooks";
import { prefetchMarketplaceProductDetails } from "../../src/data/coldBootPrefetch";
import { createE2EImageFixtureUrls, isE2EFixtureMode } from "../../src/utils/e2eFixtures";
import { getSmoothTabIndex, setSmoothTab } from "../../src/utils/smoothTabs";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const MARKETPLACE_PAGE_SIZE = 20;
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
  const { session, isGuest, userId, userRole, roleResolved, loading: authLoading } = useAuth();
  const { clearBottomOverlays } = useBottomOverlay();
  const queryClient = useQueryClient();
  const e2eProductSubmitInFlightRef = useRef(false);
  const resolvedUserId = session?.user?.id ?? userId ?? null;
  const normalizedUserRole = (userRole || "").toLowerCase();
  const isFan = normalizedUserRole === "fan";
  const isMusician = normalizedUserRole === "musician";
  const canSell = Boolean(session && resolvedUserId) && roleResolved && !isMusician;

  const [tab, setTab] = useState<MarketTab>("browse");

  useEffect(() => {
    if (!canSell && tab === "sell") {
      setTab("browse");
    }
  }, [canSell, tab]);

  // Browse state
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
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string; buttons?: any[] } | null>(null);

  useFocusEffect(useCallback(() => {
    if (!showAddProduct) {
      clearBottomOverlays();
    }
  }, [clearBottomOverlays, showAddProduct]));

  const productsQuery = useMarketplaceProductsQuery<any>({
    category,
    enabled: !authLoading && Boolean(session || isGuest),
    includeSold: true,
    limit: MARKETPLACE_PAGE_SIZE,
  });
  const sellerProductsQuery = useSellerProductsQuery<any>(resolvedUserId, {
    enabled: !authLoading && canSell,
  });

  const products = useMemo(
    () => productsQuery.data?.pages.flatMap((page) => page.items || page.data || []) ?? [],
    [productsQuery.data],
  );
  const sellerProducts = useMemo(
    () => Array.isArray(sellerProductsQuery.data?.data) ? sellerProductsQuery.data.data : [],
    [sellerProductsQuery.data],
  );
  const loading = authLoading || productsQuery.isLoading || (canSell && sellerProductsQuery.isLoading);
  const loadingMore = productsQuery.isFetchingNextPage;
  const hasMoreProducts = productsQuery.hasNextPage;
  const refreshing =
    productsQuery.isRefetching || (canSell && sellerProductsQuery.isRefetching);

  const invalidateMarketplaceQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["marketplace"] });
  }, [queryClient]);

  const invokeMarketplace = useCallback(async (body: Record<string, unknown>) => {
    const requestBody = {
      ...body,
      ...(resolvedUserId ? { userId: resolvedUserId } : {}),
    };
    const { data, error } = await supabase.functions.invoke("manage-marketplace", { body: requestBody });

    if (error) {
      console.warn("manage-marketplace failed", {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        context: (error as any).context,
        body: requestBody,
      });
      throw error;
    }

    return data;
  }, [resolvedUserId]);

  const onRefresh = () => {
    void productsQuery.refetch();
    if (canSell) {
      void sellerProductsQuery.refetch();
    }
  };

  const loadMoreProducts = () => {
    if (loading || loadingMore || !hasMoreProducts) return;
    void productsQuery.fetchNextPage();
  };

  const warmProductDetails = useCallback((productId: string | null | undefined) => {
    void prefetchMarketplaceProductDetails(queryClient, productId);
  }, [queryClient]);

  const browseProducts = useMemo(() => {
    const merged = new Map<string, any>();

    products.forEach((product: any) => {
      if (product?.id) {
        merged.set(product.id, product);
      }
    });

    sellerProducts.forEach((product: any) => {
      if (product?.id && product?.status === "sold_out") {
        merged.set(product.id, product);
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const aSold = a?.status === "sold_out";
      const bSold = b?.status === "sold_out";

      if (aSold !== bSold) {
        return aSold ? 1 : -1;
      }

      return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime();
    });
  }, [products, sellerProducts]);

  const filteredProducts = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return browseProducts;

    return browseProducts.filter((product: any) =>
      [product?.title, product?.seller_name, product?.category, product?.product_type]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [browseProducts, searchQuery]);

  const listingStats = useMemo(() => ({
    total: sellerProducts.length,
    live: sellerProducts.filter((item: any) => item?.status === "active").length,
    sold: sellerProducts.filter((item: any) => item?.status === "sold_out").length,
  }), [sellerProducts]);

  const formatPrice = (price: number | string | null | undefined) => {
    const amount = Number(price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Free";
    return `₱${amount.toLocaleString()}`;
  };

  const resetCreateListingForm = useCallback(() => {
    setEditingProductId(null);
    setNewTitle("");
    setNewDescription("");
    setNewPrice("");
    setNewCategory("");
    setListingImages([]);
    setListingThumbnailIndex(0);
  }, []);

  const openCreateListing = useCallback(() => {
    setEditingProductId(null);
    if (isE2EFixtureMode()) {
      setNewPrice("1234");
      setNewCategory("other");
      setListingImages(createE2EImageFixtureUrls(1));
      setListingThumbnailIndex(0);
    }
    setShowAddProduct(true);
  }, []);

  const openEditListing = async (productId: string) => {
    if (statusUpdatingId) return;

    setStatusUpdatingId(productId);
    try {
      const data = await invokeMarketplace({ action: "get_product_details", product_id: productId });
      const product = data?.data;

      if (!product) {
        throw new Error("Product not found");
      }

      const mediaUrls = (product.media || [])
        .map((item: any) => item?.url || item?.storage_path)
        .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0);

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

      if (!data?.success) {
        throw new Error(data?.error || "Unable to delete listing");
      }

      emitToast({
        type: "success",
        title: "Listing Deleted",
        message: "The product has been removed from your seller inventory.",
      });
      invalidateMarketplaceQueries();
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
      message: `Delete \"${product.title || "this listing"}\"? This cannot be undone.`,
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => handleDeleteProduct(product.id) },
      ],
    });
  };

  const handleSubmitProduct = async () => {
    if (adding) return;

    if (!canSell) {
      setAlert({
        type: "warning",
        title: "Selling Unavailable",
        message: "Only non-musician accounts can create marketplace listings.",
      });
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
      const orderedImages = listingImages.length > 0
        ? [
            listingImages[listingThumbnailIndex] || listingImages[0],
            ...listingImages.filter((_, index) => index !== listingThumbnailIndex),
          ].filter((imageUrl, index, array) => Boolean(imageUrl) && array.indexOf(imageUrl) === index)
        : [];

      const listingBody = {
        action: editingProductId ? "update_product" : "create_product",
        ...(editingProductId ? { product_id: editingProductId } : {}),
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          base_price: price || 0,
          category: newCategory || null,
          currency: "PHP",
          media: orderedImages.map((imageUrl) => ({
            media_type: "image",
            storage_path: imageUrl,
          })),
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
              ? "Buyers can now message you about this item."
              : "Your listing was saved. Publish it from Sell when you're ready.",
        });
        setShowAddProduct(false);
        resetCreateListingForm();
        setTab("sell");
        invalidateMarketplaceQueries();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create listing" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setAdding(false);
    }
  };

  const handleSubmitProductE2E = async () => {
    if (!isE2EFixtureMode() || editingProductId) {
      await handleSubmitProduct();
      return;
    }

    if (adding || e2eProductSubmitInFlightRef.current) return;

    if (!canSell || !resolvedUserId) {
      setAlert({
        type: "warning",
        title: "Selling Unavailable",
        message: "Only non-musician accounts can create marketplace listings.",
      });
      return;
    }

    if (!newTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Enter a listing title." });
      return;
    }

    const price = Number.parseFloat(newPrice);
    if (newPrice && !Number.isFinite(price)) {
      setAlert({ type: "warning", title: "Invalid Price", message: "Enter a valid price." });
      return;
    }

    e2eProductSubmitInFlightRef.current = true;
    setAdding(true);
    try {
      const { error } = await supabase.from("products").insert({
        seller_id: resolvedUserId,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        product_type: "merch",
        category: newCategory || "other",
        base_price: Number.isFinite(price) ? price : 1234,
        currency: "PHP",
        status: "active",
      });

      if (error) throw error;

      emitToast({
        type: "success",
        title: "Listing Live",
        message: "Buyers can now message you about this item.",
      });
      setShowAddProduct(false);
      resetCreateListingForm();
      setTab("sell");
      invalidateMarketplaceQueries();
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message || "Unable to create listing." });
    } finally {
      e2eProductSubmitInFlightRef.current = false;
      setAdding(false);
    }
  };

  const parsedListingPrice = Number.parseFloat(newPrice);
  const isProductFormReady =
    newTitle.trim().length > 0 &&
    (!newPrice.trim() || Number.isFinite(parsedListingPrice));

  const handleListingStatus = async (productId: string, action: "publish_product" | "mark_product_sold" | "relist_product") => {
    if (statusUpdatingId) return;

    setStatusUpdatingId(productId);
    try {
      const data = await invokeMarketplace({ action, product_id: productId });

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
        emitToast({ type: "success", title, message });
        invalidateMarketplaceQueries();
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Unable to update listing" });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handlePublishProduct = (productId: string) => {
    void handleListingStatus(productId, "publish_product");
  };

  const tabs: { key: MarketTab; label: string; icon: string }[] = [
    { key: "browse", label: "Browse", icon: "storefront-outline" },
    ...(canSell ? [{ key: "sell" as MarketTab, label: "Sell", icon: "pricetags-outline" }] : []),
  ];

  const renderProductSkeletonGrid = () => (
    <View style={styles.grid}>
      {[1, 2, 3, 4].map((item) => (
        <View
          key={`marketplace-product-skeleton-${item}`}
          style={[
            styles.productCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDark ? "#334155" : "#E2E8F0",
            },
          ]}
        >
          <Skeleton width="100%" height={CARD_WIDTH} borderRadius={0} />
          <View style={styles.productInfo}>
            <Skeleton width="86%" height={16} style={{ marginBottom: 8 }} />
            <Skeleton width="62%" height={13} style={{ marginBottom: 8 }} />
            <Skeleton width="48%" height={16} style={{ marginBottom: 8 }} />
            <Skeleton width="78%" height={20} borderRadius={999} />
          </View>
        </View>
      ))}
    </View>
  );

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
            {canSell
              ? "Post merch, gear, and digital drops. Buyers contact you through chat instead of checking out in-app."
              : "Open any listing to ask questions, negotiate, and arrange the sale with the seller."}
          </Text>
        </View>

        {canSell ? (
          <TouchableOpacity
            testID="mobile-marketplace-create-listing-hero-button"
            accessibilityLabel="mobile-marketplace-create-listing-hero-button"
            activeOpacity={1}
            style={[styles.introAction, { backgroundColor: colors.primary }]}
            onPress={() => {
              setTab("sell");
              openCreateListing();
            }}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.introActionText}>Create listing</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          testID="mobile-marketplace-search-input"
          accessibilityLabel="mobile-marketplace-search-input"
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

      {loading ? (
        renderProductSkeletonGrid()
      ) : filteredProducts.length > 0 ? (
        <>
          <View style={styles.grid}>
            {filteredProducts.map((product) => {
              const isSold = product?.status === "sold_out";
              const cardBorderColor = isSold ? "#F97316" + "55" : isDark ? "#334155" : "#E2E8F0";
              const categoryLabel = getCategoryLabel(product.category);

              return (
                <TouchableOpacity
                  testID={`mobile-marketplace-product-card-${product.id}`}
                  accessibilityLabel={`mobile-marketplace-product-card-${product.id}`}
                  activeOpacity={1}
                  key={product.id}
                  style={[
                    styles.productCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: cardBorderColor,
                      opacity: isSold ? 0.78 : 1,
                    },
                  ]}
                  onPressIn={() => warmProductDetails(product.id)}
                  onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
                >
                  <View style={styles.productImageWrap}>
                    {getProductImage(product) ? (
                      <CachedImage
                        uri={getProductImage(product)}
                        style={styles.productImage}
                        width={Math.round(CARD_WIDTH)}
                        height={Math.round(CARD_WIDTH)}
                        priority="high"
                      />
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
                    <Text style={[styles.productTitle, { color: isSold ? colors.textSecondary : colors.text }]} numberOfLines={2}>{product.title}</Text>
                    <Text style={[styles.productSeller, { color: colors.textSecondary }]} numberOfLines={1}>
                      {product.seller_name || "Seller"}
                    </Text>
                    <Text style={[styles.productPrice, { color: isSold ? "#F97316" : colors.primary }]}>{formatPrice(product.price)}</Text>
                    <View style={styles.cardFooterRow}>
                      {categoryLabel ? (
                        <Text style={[styles.variantCount, { color: colors.textSecondary }]} numberOfLines={1}>
                          {categoryLabel}
                        </Text>
                      ) : <View />}
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
          {hasMoreProducts && (
            <TouchableOpacity
              activeOpacity={1}
              disabled={loadingMore}
              onPress={loadMoreProducts}
              style={[styles.loadMoreButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                  <Text style={[styles.loadMoreText, { color: colors.primary }]}>Load more</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </>
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

      <TouchableOpacity
        testID="mobile-marketplace-create-listing-button"
        accessibilityLabel="mobile-marketplace-create-listing-button"
        activeOpacity={1}
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        onPress={openCreateListing}
      >
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
              testID={`mobile-marketplace-seller-product-card-${product.id}`}
              accessibilityLabel={`mobile-marketplace-seller-product-card-${product.id}`}
              activeOpacity={1}
              key={product.id}
              style={[styles.sellerProductCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
              onPressIn={() => warmProductDetails(product.id)}
              onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
            >
              {getProductImage(product) ? (
                <CachedImage
                  uri={getProductImage(product)}
                  style={styles.productThumb}
                  width={56}
                  height={56}
                  priority="high"
                />
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
                  <TouchableOpacity
                    testID={`mobile-marketplace-product-publish-${product.id}`}
                    accessibilityLabel={`mobile-marketplace-product-publish-${product.id}`}
                    activeOpacity={1}
                    disabled={isBusy}
                    onPress={() => handlePublishProduct(product.id)}
                  >
                    <Text style={{ color: colors.primary, fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
                      {isBusy ? "Updating..." : "Publish"}
                    </Text>
                  </TouchableOpacity>
                )}
                {isLive && (
                  <TouchableOpacity
                    testID={`mobile-marketplace-product-mark-sold-${product.id}`}
                    accessibilityLabel={`mobile-marketplace-product-mark-sold-${product.id}`}
                    activeOpacity={1}
                    disabled={isBusy}
                    onPress={() => handleListingStatus(product.id, "mark_product_sold")}
                  >
                    <Text style={{ color: "#F97316", fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
                      {isBusy ? "Updating..." : "Mark Sold"}
                    </Text>
                  </TouchableOpacity>
                )}
                {isSold && (
                  <TouchableOpacity
                    testID={`mobile-marketplace-product-relist-${product.id}`}
                    accessibilityLabel={`mobile-marketplace-product-relist-${product.id}`}
                    activeOpacity={1}
                    disabled={isBusy}
                    onPress={() => handleListingStatus(product.id, "relist_product")}
                  >
                    <Text style={{ color: colors.primary, fontSize: moderateScale(11), fontFamily: "Poppins_600SemiBold" }}>
                      {isBusy ? "Updating..." : "Relist"}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={styles.sellerActionButtons}>
                  <TouchableOpacity
                    testID={`mobile-marketplace-product-edit-${product.id}`}
                    accessibilityLabel={`mobile-marketplace-product-edit-${product.id}`}
                    activeOpacity={1}
                    disabled={isBusy}
                    onPress={() => openEditListing(product.id)}
                    style={[styles.iconActionBtn, { borderColor: colors.border }]}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.text} style={styles.iconActionIcon} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID={`mobile-marketplace-product-delete-${product.id}`}
                    accessibilityLabel={`mobile-marketplace-product-delete-${product.id}`}
                    activeOpacity={1}
                    disabled={isBusy}
                    onPress={() => promptDeleteProduct(product)}
                    style={[styles.iconActionBtn, { borderColor: "#FCA5A5", backgroundColor: "#FEE2E2" }]}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" style={styles.iconActionIcon} />
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
    <View
      testID="mobile-marketplace-page"
      accessibilityLabel="mobile-marketplace-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title="Marketplace" />

      {/* Main Tabs */}
      {tabs.length > 1 && (
        <SlidingTabBar
          activeColor={colors.primary}
          activeKey={tab}
          borderColor={isDark ? "#334155" : "#E2E8F0"}
          iconSize={moderateScale(16)}
          indicatorColor={colors.primary}
          indicatorWidthRatio={0.3}
          onChange={(nextTab) => setSmoothTab(setTab, nextTab)}
          tabs={tabs.map((item) => ({
            key: item.key,
            label: item.label,
            icon: item.icon as any,
          }))}
          textStyle={styles.mainTabText}
        />
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <SmoothTabTransition
          activeKey={tab}
          activeIndex={getSmoothTabIndex(tabs.map((item) => item.key), tab)}
          renderOutgoing={false}
        >
          {tab === "browse" ? (
            renderBrowse()
          ) : loading ? (
            renderProductSkeletonGrid()
          ) : (
            renderSell()
          )}
        </SmoothTabTransition>

      </ScrollView>

      {/* Add Product Modal */}
      <BottomModal
        visible={showAddProduct}
        overlayLabel="MarketplaceAddProductModal"
        onClose={() => {
          setShowAddProduct(false);
          resetCreateListingForm();
        }}
      >
          <View
            testID="mobile-marketplace-listing-modal"
            accessibilityLabel="mobile-marketplace-listing-modal"
            style={[styles.modalBox, { backgroundColor: colors.surface }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{editingProductId ? "Edit Listing" : "Create Listing"}</Text>
              <TouchableOpacity
                testID="mobile-marketplace-listing-modal-close-button"
                accessibilityLabel="mobile-marketplace-listing-modal-close-button"
                activeOpacity={1}
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
                userId={resolvedUserId || "marketplace-user"}
                folder="marketplace"
              />

              <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
              <TextInput
                testID="mobile-marketplace-title-input"
                accessibilityLabel="mobile-marketplace-title-input"
                style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
                placeholder="What are you selling?"
                placeholderTextColor={colors.textSecondary}
                value={newTitle}
                onChangeText={setNewTitle}
              />
              {isE2EFixtureMode() && (
                <TouchableOpacity
                  testID="mobile-marketplace-submit-button"
                  accessibilityLabel="mobile-marketplace-submit-button"
                  activeOpacity={adding || !isProductFormReady ? 1 : 0.78}
                  style={[styles.submitBtn, { backgroundColor: isProductFormReady ? colors.primary : colors.border, opacity: adding || !isProductFormReady ? 0.6 : 1 }]}
                  onPressIn={() => {
                    if (isProductFormReady) void handleSubmitProductE2E();
                  }}
                  onPress={handleSubmitProductE2E}
                  disabled={adding || !isProductFormReady}
                >
                  {adding ? <ActivityIndicator color="#fff" /> : <Text style={[styles.submitBtnText, { color: isProductFormReady ? "#FFFFFF" : colors.textSecondary }]}>Post Listing</Text>}
                </TouchableOpacity>
              )}
              <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                testID="mobile-marketplace-description-input"
                accessibilityLabel="mobile-marketplace-description-input"
                style={[styles.input, styles.textArea, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
                placeholder="Add details buyers should know..."
                placeholderTextColor={colors.textSecondary}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
              />
              <Text style={[styles.inputLabel, { color: colors.text }]}>Price (₱)</Text>
              <TextInput
                testID="mobile-marketplace-price-input"
                accessibilityLabel="mobile-marketplace-price-input"
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
                    <TouchableOpacity
                      testID={`mobile-marketplace-category-${option.value}`}
                      accessibilityLabel={`mobile-marketplace-category-${option.value}`}
                      activeOpacity={1}
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
              <TouchableOpacity
                testID={isE2EFixtureMode() ? "mobile-marketplace-submit-button-bottom" : "mobile-marketplace-submit-button"}
                accessibilityLabel={isE2EFixtureMode() ? "mobile-marketplace-submit-button-bottom" : "mobile-marketplace-submit-button"}
                activeOpacity={adding || !isProductFormReady ? 1 : 0.78}
                style={[styles.submitBtn, { backgroundColor: isProductFormReady ? colors.primary : colors.border, opacity: adding || !isProductFormReady ? 0.6 : 1 }]}
                onPress={handleSubmitProduct}
                disabled={adding || !isProductFormReady}
              >
                {adding ? <ActivityIndicator color="#fff" /> : <Text style={[styles.submitBtnText, { color: isProductFormReady ? "#FFFFFF" : colors.textSecondary }]}>{editingProductId ? "Save Changes" : "Post Listing"}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
      </BottomModal>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} buttons={alert.buttons} onClose={() => setAlert(null)} />}
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
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 48, borderRadius: 16, marginBottom: 8 },
  searchInput: { flex: 1, height: 24, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium", lineHeight: 20, includeFontPadding: false, padding: 0, textAlignVertical: "center" },
  categoryRow: { marginBottom: 12, maxHeight: 44 },
  categoryPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginRight: 8 },
  modalCategoryRow: { gap: 8, paddingVertical: 4, paddingRight: 16 },
  modalCategoryPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  productCard: { width: CARD_WIDTH, borderRadius: 12, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  productImageWrap: { position: "relative", width: "100%", height: CARD_WIDTH },
  productImage: { width: "100%", height: CARD_WIDTH },
  productImagePlaceholder: { width: "100%", height: CARD_WIDTH, alignItems: "center", justifyContent: "center" },
  soldOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.42)" },
  soldBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: "#F97316", paddingHorizontal: 10, paddingVertical: 6 },
  soldBadgeText: { color: "#fff", fontSize: moderateScale(11), fontFamily: "Poppins_700Bold" },
  productInfo: { padding: 10 },
  productTitle: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  productSeller: { fontSize: moderateScale(11), marginTop: 2 },
  productPrice: { fontSize: moderateScale(14), fontFamily: "Poppins_700Bold", marginTop: 4 },
  variantCount: { flex: 1, minWidth: 0, fontSize: moderateScale(10) },
  cardFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, gap: 6 },
  chatHint: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  chatHintText: { fontSize: moderateScale(10), fontFamily: "Poppins_600SemiBold" },
  loadMoreButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, marginTop: 4, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadMoreText: { fontSize: moderateScale(13), fontFamily: "Poppins_700Bold" },
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
  sellerActionButtons: { flexDirection: "row", gap: 8 },
  iconActionBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  iconActionIcon: { width: 16, height: 16, lineHeight: 16, includeFontPadding: false, textAlign: "center", textAlignVertical: "center" },
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
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14), textAlignVertical: "center" },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20, marginBottom: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
});
