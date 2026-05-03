import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
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
import Header from "../src/components/header";
import Skeleton from "../src/components/Skeleton";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const SHOP_PAGE_SIZE = 20;
const SHOP_FOCUS_REFRESH_COOLDOWN_MS = 30000;

type ShopCachePayload = {
  products: any[];
  fetchedAt: number;
  hasMoreProducts: boolean;
};

const shopScreenCache = new Map<string, ShopCachePayload>();

const mergeProductsById = (currentProducts: any[], nextProducts: any[]) => {
  const merged = new Map<string, any>();

  currentProducts.forEach((product) => {
    if (product?.id) {
      merged.set(product.id, product);
    }
  });

  nextProducts.forEach((product) => {
    if (product?.id) {
      merged.set(product.id, product);
    }
  });

  return Array.from(merged.values());
};

export default function ShopScreen() {
  const { colors, isDark } = useTheme();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const shopCacheKey = category || "all";

  const categories = ["Merch", "Vinyl", "Digital", "Instruments", "Tickets"];

  const fetchProducts = useCallback(async (options: { append?: boolean; offset?: number; showLoading?: boolean } = {}) => {
    const append = options.append === true;
    const offset = Math.max(0, options.offset || 0);

    if (append) {
      setLoadingMore(true);
    } else if (options.showLoading) {
      setLoading(true);
    }

    try {
      const body: any = { action: "browse_products", limit: SHOP_PAGE_SIZE + 1, offset };
      if (category) body.category = category;

      const { data } = await supabase.functions.invoke("manage-marketplace", { body });
      const fetchedProducts = Array.isArray(data?.data) ? data.data : [];
      const pageProducts = fetchedProducts.slice(0, SHOP_PAGE_SIZE);
      const nextHasMoreProducts = fetchedProducts.length > SHOP_PAGE_SIZE;

      setProducts((currentProducts) => {
        const nextProducts = append
          ? mergeProductsById(currentProducts, pageProducts)
          : pageProducts;

        shopScreenCache.set(shopCacheKey, {
          products: nextProducts,
          fetchedAt: Date.now(),
          hasMoreProducts: nextHasMoreProducts,
        });

        return nextProducts;
      });
      setHasMoreProducts(nextHasMoreProducts);
    } catch (e: any) {
      console.error("Shop fetch error:", e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [category, shopCacheKey]);

  useFocusEffect(useCallback(() => {
    const cached = shopScreenCache.get(shopCacheKey);
    const cacheIsFresh =
      cached &&
      Date.now() - cached.fetchedAt < SHOP_FOCUS_REFRESH_COOLDOWN_MS;

    if (cached) {
      setProducts(cached.products);
      setHasMoreProducts(Boolean(cached.hasMoreProducts));
      setLoading(false);
      setRefreshing(false);
    } else {
      setLoading(true);
    }

    let focusRefreshTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;

    if (!cacheIsFresh) {
      focusRefreshTask = InteractionManager.runAfterInteractions(() => {
        void fetchProducts({ showLoading: !cached });
      });
    }

    return () => {
      focusRefreshTask?.cancel();
    };
  }, [fetchProducts, shopCacheKey]));

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const loadMoreProducts = () => {
    if (loading || loadingMore || !hasMoreProducts) return;
    fetchProducts({ append: true, offset: products.length });
  };

  const visibleProducts = React.useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return products;

    return products.filter((product) =>
      [product?.title, product?.seller_name, product?.category, product?.product_type]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(needle)),
    );
  }, [products, searchQuery]);

  const formatPrice = (price: number | null) => {
    if (!price) return "Free";
    return `₱${price.toLocaleString()}`;
  };

  const renderProductSkeletonGrid = () => (
    <View style={styles.grid}>
      {[1, 2, 3, 4].map((item) => (
        <View
          key={`shop-product-skeleton-${item}`}
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
            <Skeleton width="48%" height={16} />
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Shop" onBackPress={() => router.back()} />

      <View style={[styles.introCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.introEyebrow, { color: colors.primary }]}>Marketplace</Text>
          <Text style={[styles.introTitle, { color: colors.text }]}>Browse listings or open Seller Hub to post your own.</Text>
          <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>Every signed-in account can sell merch, gear, and digital drops.</Text>
        </View>
        <TouchableOpacity activeOpacity={1}
          style={[styles.introAction, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/seller_hub")}
        >
          <Ionicons name="storefront-outline" size={16} color="#fff" />
          <Text style={styles.introActionText}>Seller Hub</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: isDark ? "#374151" : "#F3F4F6", marginHorizontal: 16, marginTop: 12 }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search products..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => fetchProducts()}
          returnKeyType="search"
        />
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
        <TouchableOpacity activeOpacity={1}
          style={[styles.categoryPill, {
            borderColor: !category ? colors.primary : colors.border,
            backgroundColor: !category ? colors.primary + "20" : "transparent",
          }]}
          onPress={() => setCategory(null)}
        >
          <Text style={{ color: !category ? colors.primary : colors.textSecondary, fontSize: moderateScale(12) }}>All</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity activeOpacity={1}
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

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading ? (
          renderProductSkeletonGrid()
        ) : visibleProducts.length > 0 ? (
          <>
            <View style={styles.grid}>
              {visibleProducts.map((product) => (
                <TouchableOpacity activeOpacity={1}
                  key={product.id}
                  style={[styles.productCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
                  onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
                >
                  {product.cover_image_url ? (
                    <CachedImage uri={product.cover_image_url } style={styles.productImage} />
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
          <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products found</Text>
     </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  introCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginHorizontal: 16, marginTop: 12, marginBottom: 4, gap: 14 },
  introEyebrow: { fontSize: moderateScale(11), fontFamily: "Poppins_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  introTitle: { fontSize: moderateScale(18), fontFamily: "Poppins_700Bold", marginTop: 4 },
  introSubtitle: { fontSize: moderateScale(13), lineHeight: 20, marginTop: 6 },
  introAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  introActionText: { color: "#fff", fontSize: moderateScale(13), fontFamily: "Poppins_700Bold", includeFontPadding: false, textAlignVertical: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 48, borderRadius: 16 },
  searchInput: { flex: 1, height: 24, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium", lineHeight: 20, includeFontPadding: false, padding: 0, textAlignVertical: "center" },
  categoryRow: { marginTop: 12, maxHeight: 44 },
  categoryPill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginRight: 8 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  productCard: { width: CARD_WIDTH, borderRadius: 12, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  productImage: { width: "100%", height: CARD_WIDTH },
  productImagePlaceholder: { width: "100%", height: CARD_WIDTH, alignItems: "center", justifyContent: "center" },
  productInfo: { padding: 10 },
  productTitle: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  productSeller: { fontSize: moderateScale(11), marginTop: 2 },
  productPrice: { fontSize: moderateScale(14), fontFamily: "Poppins_700Bold", marginTop: 4 },
  variantCount: { fontSize: moderateScale(10), marginTop: 2 },
  loadMoreButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, marginTop: 4, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadMoreText: { fontSize: moderateScale(13), fontFamily: "Poppins_700Bold" },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
});
