import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
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
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const CATEGORIES = ["Merch", "Vinyl", "Digital", "Instruments", "Tickets"];

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;
  const frameMaxWidth = 980;
  const framePad = isWebDesktop ? 20 : 16;
  const panelBg = isWebDesktop ? (isDark ? "#111C33" : "#FFFFFF") : cardBg;
  const panelBorder = isWebDesktop ? (isDark ? "#24344F" : "#E2E8F0") : borderCol;

  const fetchProducts = useCallback(async (isPullRefresh = false) => {
    if (!isPullRefresh) {
      setLoading(true);
    }

    try {
      const body: any = { action: "browse_products", limit: 40 };
      if (category) body.category = category;
      if (search.trim()) body.search = search.trim();
      const { data } = await supabase.functions.invoke("manage-marketplace", { body });
      setProducts(Array.isArray(data?.data) ? data.data : []);
    } catch (e: any) {
      console.error("Shop fetch error:", e);
      setProducts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, search]);

  useFocusEffect(
    useCallback(() => {
      fetchProducts();
    }, [fetchProducts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts(true);
  };

  const numColumns = isWebDesktop ? 3 : 2;
  const colWidth = isWebDesktop ? (Math.min(width, 900) - 48) / numColumns : (width - 40) / numColumns;

  const renderProduct = ({ item }: { item: any }) => (
    <TouchableOpacity style={[styles.productCard, { width: colWidth, backgroundColor: cardBg, borderColor: borderCol }]} onPress={() => router.push({ pathname: "/product_details", params: { product_id: item.id } })}>
      {item.cover_image_url || item.thumbnail_url ? <CachedImage uri={item.cover_image_url || item.thumbnail_url } style={[styles.productImg, { width: colWidth - 2 }]} /> : <View style={[styles.productImgPlaceholder, { width: colWidth - 2, backgroundColor: colors.primary + "10" }]}><Ionicons name="bag-outline" size={32} color={colors.primary} /></View>}
      <View style={{ padding: 10 }}>
        <Text style={{ color: colors.text, fontSize: moderateScale(13), fontWeight: "600" }} numberOfLines={2}>{item.title}</Text>
        <Text style={{ color: colors.primary, fontSize: moderateScale(14), fontWeight: "700", marginTop: 4 }}>
          ₱{Number(item.price || 0).toLocaleString()}
        </Text>
        {item.seller_name && <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{item.seller_name}</Text>}
      </View>
    </TouchableOpacity>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Header title="Shop" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to browse the marketplace" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Shop" onBackPress={() => router.back()} />
      <View style={[styles.pageWrap, isWebDesktop && styles.pageWrapWeb]}>
        <View style={[styles.pageFrame, { maxWidth: frameMaxWidth, paddingHorizontal: framePad }]}>
          <View style={[styles.panelBody, { borderColor: panelBorder, backgroundColor: panelBg }]}>
            <View style={[styles.introCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.introEyebrow, { color: colors.primary }]}>Marketplace</Text>
                <Text style={[styles.introTitle, { color: colors.text }]}>Browse listings or open Seller Hub to post your own.</Text>
                <Text style={[styles.introSubtitle, { color: colors.textSecondary }]}>Every signed-in account can sell merch, gear, and digital drops.</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push("/seller_hub")}
                style={[styles.introAction, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="storefront-outline" size={16} color="#fff" />
                <Text style={styles.introActionText}>Seller Hub</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.searchRow, { borderColor: borderCol, backgroundColor: cardBg }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput style={{ flex: 1, color: colors.text, fontSize: moderateScale(14), marginLeft: 8, paddingVertical: 8 }} placeholder="Search products..." placeholderTextColor={colors.textSecondary} value={search} onChangeText={setSearch} onSubmitEditing={fetchProducts} returnKeyType="search" />
            </View>
            <FlatList
              data={["All", ...CATEGORIES]}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginBottom: 10 }}
              contentContainerStyle={{ paddingHorizontal: 14 }}
              keyExtractor={(i) => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    if (item === "All") {
                      setCategory(null);
                      return;
                    }
                    setCategory(category === item ? null : item);
                  }}
                  style={[
                    styles.catPill,
                    {
                      backgroundColor: (item === "All" && !category) || category === item ? colors.primary + "20" : "transparent",
                      borderColor: (item === "All" && !category) || category === item ? colors.primary : borderCol,
                    },
                  ]}
                >
                  <Text style={{ color: (item === "All" && !category) || category === item ? colors.primary : colors.textSecondary, fontSize: 13 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
              <FlatList
                data={products}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
                numColumns={numColumns}
                key={`shop-${numColumns}`}
                keyExtractor={(i) => i.id}
                renderItem={renderProduct}
                contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 14 }}
                columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Ionicons name="bag-outline" size={46} color={isDark ? "#334155" : "#CBD5E1"} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No products found</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageWrap: { flex: 1 },
  pageWrapWeb: { alignItems: "center" },
  pageFrame: { width: "100%", flex: 1 },
  panelBody: { flex: 1, marginTop: 10, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  introCard: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14, marginHorizontal: 14, marginBottom: 2, gap: 14 },
  introEyebrow: { fontSize: moderateScale(11), fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  introTitle: { fontSize: moderateScale(18), fontWeight: "700", marginTop: 4 },
  introSubtitle: { fontSize: moderateScale(13), lineHeight: 20, marginTop: 6 },
  introAction: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  introActionText: { color: "#fff", fontSize: moderateScale(13), fontWeight: "700" },
  searchRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 12, marginBottom: 10, marginHorizontal: 14 },
  catPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  productCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  productImg: { height: 140, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  productImgPlaceholder: { height: 140, alignItems: "center", justifyContent: "center", borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  emptyWrap: { minHeight: 320, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 10, fontSize: moderateScale(14), fontFamily: "Poppins_500Medium" },
});
