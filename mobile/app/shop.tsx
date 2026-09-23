import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import { useTheme } from "../src/context/ThemeContext";
import { useMarketplaceProductsQuery } from "../src/data/hooks";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { radius, typography } from "../src/theme/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const PAGE_HORIZONTAL_PADDING = 20;
const PRODUCT_GRID_GAP = 12;
const PRODUCT_IMAGE_HEIGHT_RATIO = 0.82;
const SHOP_PAGE_SIZE = 20;

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { width: viewportWidth } = useWindowDimensions();
  const productCardWidth = Math.max(0, (viewportWidth - (PAGE_HORIZONTAL_PADDING * 2) - PRODUCT_GRID_GAP) / 2);
  const productImageHeight = Math.round(productCardWidth * PRODUCT_IMAGE_HEIGHT_RATIO);

  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = ["Merch", "Vinyl", "Digital", "Instruments", "Tickets"];

  const productsQuery = useMarketplaceProductsQuery<any>({
    category,
    includeSold: true,
    limit: SHOP_PAGE_SIZE,
  });

  const products = useMemo(
    () => productsQuery.data?.pages.flatMap((page) => page.items || page.data || []) ?? [],
    [productsQuery.data],
  );
  const loading = productsQuery.isLoading;
  const loadingMore = productsQuery.isFetchingNextPage;
  const hasMoreProducts = productsQuery.hasNextPage;
  const refreshing = productsQuery.isRefetching;

  const onRefresh = () => {
    void productsQuery.refetch();
  };

  const loadMoreProducts = () => {
    if (loading || loadingMore || !hasMoreProducts) return;
    void productsQuery.fetchNextPage();
  };

  const visibleProducts = useMemo(() => {
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
              width: productCardWidth,
              backgroundColor: colors.surface,
              borderColor: isDark ? "#334155" : "#E2E8F0",
            },
          ]}
        >
          <Skeleton width="100%" height={productImageHeight} borderRadius={0} />
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
      <Header title="Marketplace" showTitle={false} />

      <View style={[styles.modeTabs, { borderBottomColor: colors.border }]}>
        <View style={styles.modeTab} accessible accessibilityRole="tab" accessibilityState={{ selected: true }}>
          <Text style={[styles.modeTabText, { color: colors.primary }]}>Browse</Text>
          <View style={[styles.modeIndicator, { backgroundColor: colors.primary }]} />
        </View>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modeTab}
          accessibilityRole="tab"
          accessibilityState={{ selected: false }}
          accessibilityLabel="Sell"
          onPress={() => router.push("/seller_hub")}
        >
          <Text style={[styles.modeTabText, { color: colors.textSecondary }]}>Sell</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search products..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => {
            void productsQuery.refetch();
          }}
          returnKeyType="search"
        />
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow} contentContainerStyle={styles.categoryContent}>
        <TouchableOpacity activeOpacity={1}
          style={[styles.categoryPill, {
            borderColor: !category ? colors.primary : colors.border,
            backgroundColor: !category ? colors.primary + "20" : "transparent",
          }]}
          onPress={() => setCategory(null)}
        >
          <Text style={{ color: !category ? colors.primary : colors.textSecondary, fontSize: moderateScale(12), fontFamily: typography.medium }}>All</Text>
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
            <Text style={{ color: category === c ? colors.primary : colors.textSecondary, fontSize: moderateScale(12), fontFamily: typography.medium }}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
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
                  style={[styles.productCard, { width: productCardWidth, backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
                  onPress={() => router.push({ pathname: "/product_details", params: { product_id: product.id } })}
                >
                  {product.cover_image_url ? (
                    <CachedImage uri={product.cover_image_url } style={[styles.productImage, { height: productImageHeight }]} width={Math.round(productCardWidth)} height={productImageHeight} />
                  ) : (
                    <View style={[styles.productImagePlaceholder, { height: productImageHeight, backgroundColor: colors.primary + "10" }]}>
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

      </ScrollView>
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modeTabs: { flexDirection: "row", borderBottomWidth: 1 },
  modeTab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", position: "relative" },
  modeTabText: { fontSize: moderateScale(13), fontFamily: typography.semibold },
  modeIndicator: { position: "absolute", bottom: 0, width: "30%", height: 3, borderRadius: 999 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: PAGE_HORIZONTAL_PADDING, marginTop: 18, marginBottom: 12, paddingHorizontal: 16, height: 54, borderRadius: radius.input },
  searchInput: { flex: 1, height: 24, fontSize: moderateScale(15), fontFamily: typography.medium, lineHeight: 20, includeFontPadding: false, padding: 0, textAlignVertical: "center" },
  categoryRow: { maxHeight: 40 },
  categoryContent: { paddingHorizontal: PAGE_HORIZONTAL_PADDING },
  categoryPill: { minHeight: 38, justifyContent: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  content: { flex: 1, paddingHorizontal: PAGE_HORIZONTAL_PADDING, paddingTop: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: PRODUCT_GRID_GAP },
  productCard: { borderRadius: radius.card, borderWidth: 1, marginBottom: 2, overflow: "hidden" },
  productImage: { width: "100%" },
  productImagePlaceholder: { width: "100%", alignItems: "center", justifyContent: "center" },
  productInfo: { padding: 10 },
  productTitle: { fontSize: moderateScale(13), fontFamily: typography.semibold },
  productSeller: { fontSize: moderateScale(11), fontFamily: typography.body, marginTop: 2 },
  productPrice: { fontSize: moderateScale(14), fontFamily: typography.bold, marginTop: 4 },
  variantCount: { fontSize: moderateScale(10), fontFamily: typography.body, marginTop: 2 },
  loadMoreButton: { minHeight: 46, borderWidth: 1, borderRadius: 14, marginTop: 4, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  loadMoreText: { fontSize: moderateScale(13), fontFamily: typography.bold },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: typography.medium },
});
