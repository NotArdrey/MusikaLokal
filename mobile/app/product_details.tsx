import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
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

export default function ProductDetailsScreen() {
  const { colors } = useTheme();
  const { session, userId } = useAuth();
  const { product_id } = useLocalSearchParams();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [ordering, setOrdering] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const fetchProduct = useCallback(async () => {
    if (!product_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: { action: "get_product_details", product_id },
      });
      if (data?.data) {
        setProduct(data.data);
        if (data.data.variants?.length > 0) {
          setSelectedVariant(data.data.variants[0]);
        }
      }
    } catch (e: any) {
      console.error("ProductDetails fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [product_id]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  const handleOrder = async () => {
    if (!product) return;
    setOrdering(true);
    try {
      const items = [{
        product_id: product.id,
        variant_id: selectedVariant?.id || null,
        quantity: 1,
        unit_price: selectedVariant?.price || product.price,
      }];
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: { action: "create_order", items },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Order Placed!", message: `Order #${data.data?.order_number || ""} created.` });
        router.push("/orders");
      } else {
        setAlert({ type: "error", title: "Order Failed", message: data?.error || "Could not place order" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setOrdering(false);
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price) return "Free";
    return `₱${price.toLocaleString()}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Product" onBackPress={() => router.back()} />
        <View style={{ padding: 16 }}>
          <Skeleton width={SCREEN_WIDTH - 32} height={300} style={{ borderRadius: 12, marginBottom: 16 }} />
          <Skeleton width={SCREEN_WIDTH * 0.7} height={28} style={{ borderRadius: 6, marginBottom: 12 }} />
          <Skeleton width={SCREEN_WIDTH * 0.4} height={20} style={{ borderRadius: 6 }} />
        </View>
        <Navbar />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Product" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>Product not found</Text>
        </View>
        <Navbar />
      </View>
    );
  }

  const variants = product.variants || [];
  const media = product.media || [];
  const isSeller = product.seller_id === userId;
  const displayPrice = selectedVariant?.price || product.price;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={product.title} onBackPress={() => router.back()} />

      <ScrollView style={styles.content}>
        {/* Image gallery */}
        {media.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {media.map((m: any, idx: number) => (
              <CachedImage key={idx} uri={m.url } style={styles.galleryImage} />
            ))}
          </ScrollView>
        ) : product.cover_image_url ? (
          <CachedImage uri={product.cover_image_url } style={styles.singleImage} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.primary + "10" }]}>
            <Ionicons name="bag-outline" size={56} color={colors.primary} />
          </View>
        )}

        {/* Title & Price */}
        <View style={styles.titleSection}>
          <Text style={[styles.productTitle, { color: colors.text }]}>{product.title}</Text>
          <Text style={[styles.price, { color: colors.primary }]}>{formatPrice(displayPrice)}</Text>
          <Text style={[styles.seller, { color: colors.textSecondary }]}>
            Sold by {product.seller_name || "Seller"}
          </Text>
        </View>

        {/* Variants */}
        {variants.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Options</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {variants.map((v: any) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.variantPill,
                    {
                      borderColor: selectedVariant?.id === v.id ? colors.primary : colors.border,
                      backgroundColor: selectedVariant?.id === v.id ? colors.primary + "20" : "transparent",
                    },
                  ]}
                  onPress={() => setSelectedVariant(v)}
                >
                  <Text
                    style={{
                      color: selectedVariant?.id === v.id ? colors.primary : colors.text,
                      fontSize: moderateScale(12),
                      fontWeight: "600",
                    }}
                  >
                    {v.label || v.sku}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: moderateScale(11), marginTop: 2 }}>
                    {formatPrice(v.price)}
                    {v.stock_qty != null && ` • ${v.stock_qty} left`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Description */}
        {product.description && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Description</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>{product.description}</Text>
          </View>
        )}

        {/* Category / Tags */}
        <View style={styles.metaRow}>
          {product.category && (
            <View style={[styles.metaBadge, { backgroundColor: colors.primary + "15" }]}>
              <Text style={{ color: colors.primary, fontSize: moderateScale(11) }}>{product.category}</Text>
            </View>
          )}
          {product.product_type && (
            <View style={[styles.metaBadge, { backgroundColor: "#f59e0b20" }]}>
              <Text style={{ color: "#f59e0b", fontSize: moderateScale(11) }}>{product.product_type}</Text>
            </View>
          )}
        </View>

        {/* Seller info */}
        {isSeller && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.sellerBtn, { borderColor: colors.border }]}
              onPress={() => router.push("/seller_hub")}
            >
              <Ionicons name="storefront-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: moderateScale(13), fontWeight: "600", marginLeft: 8 }}>
                Manage in Seller Hub
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Buy button (not shown for seller) */}
      {!isSeller && (
        <View style={[styles.buyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View>
            <Text style={[styles.buyPrice, { color: colors.text }]}>{formatPrice(displayPrice)}</Text>
            {selectedVariant && (
              <Text style={[styles.buyVariant, { color: colors.textSecondary }]}>{selectedVariant.label || selectedVariant.sku}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.buyBtn, { backgroundColor: colors.primary, opacity: ordering ? 0.6 : 1 }]}
            onPress={handleOrder}
            disabled={ordering}
          >
            {ordering ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cart" size={18} color="#fff" />
                <Text style={styles.buyBtnText}>Buy Now</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  gallery: { marginTop: 12 },
  galleryImage: { width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH - 32, borderRadius: 12, marginRight: 8 },
  singleImage: { width: "100%", height: SCREEN_WIDTH - 32, borderRadius: 12, marginTop: 12 },
  imagePlaceholder: { width: "100%", height: 240, borderRadius: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  titleSection: { marginTop: 16 },
  productTitle: { fontSize: moderateScale(20), fontWeight: "800" },
  price: { fontSize: moderateScale(22), fontWeight: "800", marginTop: 4 },
  seller: { fontSize: moderateScale(13), marginTop: 4 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: moderateScale(15), fontWeight: "700", marginBottom: 10 },
  variantPill: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginRight: 10, minWidth: 80 },
  description: { fontSize: moderateScale(14), lineHeight: 22 },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  metaBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  sellerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 1, borderRadius: 10 },
  buyBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 24, borderTopWidth: 1 },
  buyPrice: { fontSize: moderateScale(18), fontWeight: "700" },
  buyVariant: { fontSize: moderateScale(11), marginTop: 2 },
  buyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  buyBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
});
