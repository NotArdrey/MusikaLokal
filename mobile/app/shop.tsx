import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import GuestSignInGate from "../src/components/GuestSignInGate";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { session, isGuest } = useAuth();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = ["Merch", "Vinyl", "Digital", "Instruments", "Tickets"];

  const fetchProducts = useCallback(async () => {
    try {
      const body: any = { action: "browse_products", limit: 40 };
      if (category) body.category = category;
      if (searchQuery.trim()) body.search = searchQuery.trim();

      const { data } = await supabase.functions.invoke("manage-marketplace", { body });
      if (data?.data) setProducts(data.data);
    } catch (e: any) {
      console.error("Shop fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, searchQuery]);

  useFocusEffect(useCallback(() => { fetchProducts(); }, [fetchProducts]));

  const onRefresh = () => { setRefreshing(true); fetchProducts(); };

  const formatPrice = (price: number | null) => {
    if (!price) return "Free";
    return `â‚±${price.toLocaleString()}`;
  };

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Shop" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to browse the marketplace" />
        
      </View>
    );
  }

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
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0", marginHorizontal: 16, marginTop: 12 }]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search products..."
          placeholderTextColor={colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={fetchProducts}
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
          <View style={styles.grid}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} width={CARD_WIDTH} height={200} style={{ borderRadius: 12, marginBottom: 12 }} />
            ))}
          </View>
        ) : products.length > 0 ? (
          <View style={styles.grid}>
            {products.map((product) => (
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
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: moderateScale(14) },
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
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
});
