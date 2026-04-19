import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
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
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const CATEGORIES = ["All", "Merch", "Music", "Instruments", "Services", "Digital"];

export default function ShopScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const body: any = { action: "browse_products" };
      if (category !== "All") body.category = category.toLowerCase();
      if (search.trim()) body.search = search.trim();
      const { data } = await supabase.functions.invoke("manage-marketplace", { body });
      if (data?.data) setProducts(data.data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [category, search]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const numColumns = isWebDesktop ? 3 : 2;
  const colWidth = isWebDesktop ? (Math.min(width, 900) - 48) / numColumns : (width - 40) / numColumns;

  const renderProduct = ({ item }: { item: any }) => (
    <TouchableOpacity style={[styles.productCard, { width: colWidth, backgroundColor: cardBg, borderColor: borderCol }]} onPress={() => router.push({ pathname: "/product_details", params: { product_id: item.id } })}>
      {item.thumbnail_url ? <CachedImage uri={item.thumbnail_url } style={[styles.productImg, { width: colWidth - 2 }]} /> : <View style={[styles.productImgPlaceholder, { width: colWidth - 2, backgroundColor: colors.primary + "10" }]}><Ionicons name="bag-outline" size={32} color={colors.primary} /></View>}
      <View style={{ padding: 10 }}>
        <Text style={{ color: colors.text, fontSize: moderateScale(13), fontWeight: "600" }} numberOfLines={2}>{item.title}</Text>
        <Text style={{ color: colors.primary, fontSize: moderateScale(14), fontWeight: "700", marginTop: 4 }}>
          {item.currency || "PHP"} {Number(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>
        {item.seller_name && <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>{item.seller_name}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Shop" onBackPress={() => router.back()} />
      <View style={isWebDesktop ? { flex: 1, alignItems: "center" } : { flex: 1 }}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 900, flex: 1, paddingHorizontal: 16 } : { flex: 1, paddingHorizontal: 12 }}>
          <View style={[styles.searchRow, { borderColor: borderCol, backgroundColor: cardBg }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput style={{ flex: 1, color: colors.text, fontSize: moderateScale(14), marginLeft: 8, paddingVertical: 8 }} placeholder="Search products..." placeholderTextColor={colors.textSecondary} value={search} onChangeText={setSearch} onSubmitEditing={fetchProducts} returnKeyType="search" />
          </View>
          <FlatList
            data={CATEGORIES}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginBottom: 10 }}
            keyExtractor={(i) => i}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => setCategory(item)} style={[styles.catPill, { backgroundColor: category === item ? colors.primary : "transparent", borderColor: category === item ? colors.primary : borderCol }]}>
                <Text style={{ color: category === item ? "#fff" : colors.text, fontSize: 13 }}>{item}</Text>
              </TouchableOpacity>
            )}
          />
          {loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /> : (
            <FlatList
              data={products}
              numColumns={numColumns}
              key={`shop-${numColumns}`}
              keyExtractor={(i) => i.id}
              renderItem={renderProduct}
              contentContainerStyle={{ paddingBottom: 100 }}
              columnWrapperStyle={{ gap: 10, marginBottom: 10 }}
              ListEmptyComponent={<Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 40 }}>No products found</Text>}
            />
          )}
        </View>
      </View>
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 12, marginBottom: 10 },
  catPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  productCard: { borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  productImg: { height: 140, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  productImgPlaceholder: { height: 140, alignItems: "center", justifyContent: "center", borderTopLeftRadius: 12, borderTopRightRadius: 12 },
});
