import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import ReportModal from "../src/components/ReportModal";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function ProductDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { userId, isGuest } = useAuth();
  const { product_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [product, setProduct] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchProduct = useCallback(async () => {
    if (!product_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", { body: { action: "get_product", product_id } });
      if (data?.data) {
        setProduct(data.data);
        setVariants(data.data.variants || []);
        setMedia(data.data.media || []);
        if (data.data.variants?.length) setSelectedVariant(data.data.variants[0]);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [product_id]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  const currentPrice = selectedVariant?.price ?? product?.price ?? 0;

  const handleBuyNow = async () => {
    if (!product) return;
    setOrdering(true);
    try {
      const items = [{ product_id: product.id, variant_id: selectedVariant?.id || null, quantity: 1 }];
      const { data } = await supabase.functions.invoke("manage-marketplace", { body: { action: "create_order", items } });
      if (data?.success) {
        showTopToast({ type: "success", title: "Ordered", message: "Order placed successfully!" });
        router.push("/orders");
      } else { setAlert({ type: "error", title: "Error", message: data?.error || "Failed to place order." }); }
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setOrdering(false); }
  };

  const openReportModal = () => {
    if (!product?.id) {
      setAlert({ type: "error", title: "Unable to Report", message: "Listing details are missing." });
      return;
    }

    setShowReportModal(true);
  };

  const submitProductReport = async (reason: string, details?: string) => {
    if (!userId || isGuest) {
      throw new Error("You need to sign in to report marketplace items.");
    }

    if (!product?.id) {
      throw new Error("Listing details are missing.");
    }

    const body = {
      action: "report",
      type: "product",
      id: product.id,
      userId,
      reason,
      details: details || null,
    };

    const { data, error } = await supabase.functions.invoke("manage-details", { body });

    if (error) {
      console.error("manage-details report failed", {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        context: (error as any).context,
        body,
      });
      throw new Error(error.message || "Failed to submit report.");
    }

    if (data && !Array.isArray(data) && data.already_reported) {
      throw new Error("You already have a pending report for this marketplace item.");
    }
  };

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Product" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /><Navbar /></View>;
  if (!product) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Product" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Product not found</Text></View><Navbar /></View>;

  const isSeller = product?.seller_id === userId;
  const canReportProduct = !isSeller && !!userId && !isGuest;
  const reportHeaderAction = canReportProduct ? (
    <TouchableOpacity
      activeOpacity={1}
      onPress={openReportModal}
      style={[
        styles.headerReportBtn,
        { backgroundColor: isDark ? "#111827" : "#F8FAFC", borderColor: borderCol },
      ]}
    >
      <Ionicons name="flag-outline" size={18} color="#EF4444" />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Product" onBackPress={() => router.back()} rightComponent={reportHeaderAction} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 700, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} pagingEnabled style={{ marginTop: 12 }}>
              {media.map((m: any, i: number) => <CachedImage key={i} uri={m.url } style={[styles.galleryImg, { width: isWebDesktop ? 668 : width - 32 }]} />)}
            </ScrollView>
          ) : product.thumbnail_url ? (
            <CachedImage uri={product.thumbnail_url } style={[styles.galleryImg, { width: "100%", marginTop: 12 }]} />
          ) : null}

          <Text style={{ color: colors.text, fontSize: moderateScale(20), fontWeight: "800", marginTop: 16 }}>{product.title}</Text>
          <Text style={{ color: colors.primary, fontSize: moderateScale(22), fontWeight: "800", marginTop: 8 }}>
            ₱{Number(currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
          {product.description && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(14), lineHeight: 22, marginTop: 10 }}>{product.description}</Text>}

          <View style={styles.metaRow}>
            {product.product_type && <View style={[styles.badge, { backgroundColor: colors.primary + "18" }]}><Text style={{ color: colors.primary, fontSize: 12, textTransform: "capitalize" }}>{product.product_type}</Text></View>}
            {product.category && <View style={[styles.badge, { backgroundColor: colors.primary + "12" }]}><Text style={{ color: colors.primary, fontSize: 12 }}>{product.category}</Text></View>}
          </View>

          {variants.length > 1 && (
            <>
              <Text style={{ color: colors.text, fontSize: moderateScale(15), fontWeight: "700", marginTop: 16 }}>Variants</Text>
              <View style={styles.variantsRow}>
                {variants.map((v: any) => (
                  <TouchableOpacity activeOpacity={1} key={v.id} onPress={() => setSelectedVariant(v)} style={[styles.variantPill, { backgroundColor: selectedVariant?.id === v.id ? colors.primary : "transparent", borderColor: selectedVariant?.id === v.id ? colors.primary : borderCol }]}>
                    <Text style={{ color: selectedVariant?.id === v.id ? "#fff" : colors.text, fontSize: 13 }}>{v.label || v.sku || "Option"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {product.seller_name && (
            <TouchableOpacity activeOpacity={1} style={[styles.sellerRow, { borderColor: borderCol }]} onPress={() => router.push("/seller_hub")}>
              <Ionicons name="storefront-outline" size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginLeft: 8 }}>{product.seller_name}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          )}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <View style={[styles.buyBar, { backgroundColor: cardBg, borderTopColor: borderCol }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Total</Text>
          <Text style={{ color: colors.primary, fontSize: moderateScale(18), fontWeight: "800" }}>₱{Number(currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
        </View>
        <TouchableOpacity activeOpacity={1} style={[styles.buyBtn, { backgroundColor: colors.primary, opacity: ordering ? 0.6 : 1 }]} onPress={handleBuyNow} disabled={ordering}>
          {ordering ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: moderateScale(15) }}>Buy Now</Text>}
        </TouchableOpacity>
      </View>

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitProductReport}
        targetName={product.title}
        title="Report Marketplace Item"
        reportType="product"
      />

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  galleryImg: { height: 260, borderRadius: 14 },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  variantsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  variantPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  headerReportBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sellerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderTopWidth: 1, marginTop: 20 },
  buyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, paddingBottom: 16, borderTopWidth: 1 },
  buyBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
});
