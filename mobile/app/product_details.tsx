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
import ReportModal from "../src/components/ReportModal";
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

export default function ProductDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isGuest, userId } = useAuth();
  const { product_id } = useLocalSearchParams();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const invokeMarketplace = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-marketplace", { body });

    if (error) {
      console.warn("manage-marketplace failed", {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        context: (error as any).context,
        body,
      });
      throw error;
    }

    return data;
  }, []);

  const fetchProduct = useCallback(async () => {
    if (!product_id) return;
    try {
      const data = await invokeMarketplace({ action: "get_product_details", product_id });
      if (data?.data) {
        setProduct(data.data);
        if (data.data.variants?.length > 0) {
          setSelectedVariant(data.data.variants[0]);
        }
      }
    } catch (e: any) {
      console.warn("ProductDetails fetch failed", e);
    } finally {
      setLoading(false);
    }
  }, [invokeMarketplace, product_id]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  const handleMessageSeller = async () => {
    if (product?.status === "sold_out") {
      setAlert({ type: "info", title: "Listing Sold", message: "This item has already been marked as sold." });
      return;
    }

    if (!product?.seller_id) {
      setAlert({ type: "error", title: "Unavailable", message: "Seller information is missing for this listing." });
      return;
    }

    if (isGuest || !userId) {
      setAlert({ type: "info", title: "Sign In Required", message: "Sign in to message the seller about this listing." });
      return;
    }

    if (product.seller_id === userId) {
      router.push("/marketplace");
      return;
    }

    router.push({
      pathname: "/chat",
      params: {
        recipientId: product.seller_id,
        recipientName: product.seller_name || "Seller",
      },
    });
  };

  const handleSellerStatus = async (action: "mark_product_sold" | "relist_product" | "publish_product") => {
    if (!product?.id) return;

    setStatusUpdating(true);
    try {
      const data = await invokeMarketplace({ action, product_id: product.id });

      if (data?.success) {
        showTopToast({
          type: "success",
          title: action === "mark_product_sold" ? "Marked as Sold" : action === "relist_product" ? "Listing Relisted" : "Published",
          message: action === "mark_product_sold"
            ? "The listing is now hidden from buyers in browse."
            : action === "relist_product"
              ? "The listing is live again."
              : "The listing is now live.",
        });
        fetchProduct();
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Unable to update listing." });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setStatusUpdating(false);
    }
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

  const formatPrice = (price: number | string | null | undefined) => {
    const amount = Number(price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return "Free";
    return `₱${amount.toLocaleString()}`;
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
  const displayPrice = selectedVariant?.price || product.price || product.base_price;
  const mediaUrls = media
    .map((item: any) => item?.url || item?.storage_path)
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
  const isSold = product.status === "sold_out";
  const isDraft = product.status === "draft";
  const canReportProduct = !isSeller && !!userId && !isGuest;
  const reportHeaderAction = canReportProduct ? (
    <TouchableOpacity
      activeOpacity={1}
      onPress={openReportModal}
      style={[
        styles.headerReportBtn,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Ionicons name="flag-outline" size={20} color="#EF4444" />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={product.title} onBackPress={() => router.back()} rightComponent={reportHeaderAction} />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        {/* Image gallery */}
        {mediaUrls.length > 0 ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {mediaUrls.map((imageUrl: string, idx: number) => (
              <CachedImage key={`${imageUrl}-${idx}`} uri={imageUrl} style={styles.galleryImage} />
            ))}
          </ScrollView>
        ) : product.cover_image_url || product.primary_image ? (
          <CachedImage uri={product.cover_image_url || product.primary_image} style={styles.singleImage} />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.primary + "10" }]}>
            <Ionicons name="bag-outline" size={56} color={colors.primary} />
          </View>
        )}

        {/* Title & Price */}
        <View style={styles.titleSection}>
          <View style={styles.titleRow}>
            <Text style={[styles.productTitle, { color: colors.text, flex: 1 }]}>{product.title}</Text>
            {isSold && (
              <View style={[styles.statusPill, { backgroundColor: "#F97316" + "18", borderColor: "#F97316" + "44" }]}>
                <Text style={[styles.statusPillText, { color: "#F97316" }]}>Sold</Text>
              </View>
            )}
            {isDraft && (
              <View style={[styles.statusPill, { backgroundColor: colors.primary + "14", borderColor: colors.primary + "32" }]}>
                <Text style={[styles.statusPillText, { color: colors.primary }]}>Draft</Text>
              </View>
            )}
          </View>
          <Text style={[styles.price, { color: colors.primary }]}>{formatPrice(displayPrice)}</Text>
          <Text style={[styles.seller, { color: colors.textSecondary }]}>
            Listed by {product.seller_name || "Seller"}
          </Text>
          <Text style={[styles.marketNote, { color: colors.textSecondary }]}>
            {isSeller
              ? isSold
                ? "This listing is marked sold and hidden from browse until you relist it."
                : isDraft
                  ? "Publish this listing when you're ready to start receiving buyer messages."
                  : "Once the item is gone, mark it sold so buyers stop messaging you about it."
              : isSold
                ? "This listing has already been marked as sold."
                : "Questions, offers, and delivery details happen in chat."}
          </Text>
        </View>

        {/* Variants */}
        {variants.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Options</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {variants.map((v: any) => (
                <TouchableOpacity activeOpacity={1}
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
                    {v.stock_qty != null && ` | ${v.stock_qty} left`}
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
            <View style={styles.sellerActionRow}>
              <TouchableOpacity activeOpacity={1}
                style={[styles.sellerBtn, { borderColor: colors.border }]}
                onPress={() => router.push("/marketplace")}
              >
                <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: moderateScale(13), fontWeight: "600", marginLeft: 8 }}>
                  Back to Marketplace
                </Text>
              </TouchableOpacity>

              {product.status === "active" && (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.primarySellerBtn, { backgroundColor: "#F97316", opacity: statusUpdating ? 0.65 : 1 }]}
                  disabled={statusUpdating}
                  onPress={() => handleSellerStatus("mark_product_sold")}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.primarySellerBtnText}>{statusUpdating ? "Updating..." : "Mark as Sold"}</Text>
                </TouchableOpacity>
              )}

              {product.status === "sold_out" && (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.primarySellerBtn, { backgroundColor: colors.primary, opacity: statusUpdating ? 0.65 : 1 }]}
                  disabled={statusUpdating}
                  onPress={() => handleSellerStatus("relist_product")}
                >
                  <Ionicons name="refresh-outline" size={18} color="#fff" />
                  <Text style={styles.primarySellerBtnText}>{statusUpdating ? "Updating..." : "Relist Listing"}</Text>
                </TouchableOpacity>
              )}

              {product.status === "draft" && (
                <TouchableOpacity activeOpacity={1}
                  style={[styles.primarySellerBtn, { backgroundColor: colors.primary, opacity: statusUpdating ? 0.65 : 1 }]}
                  disabled={statusUpdating}
                  onPress={() => handleSellerStatus("publish_product")}
                >
                  <Ionicons name="radio-outline" size={18} color="#fff" />
                  <Text style={styles.primarySellerBtnText}>{statusUpdating ? "Updating..." : "Publish Listing"}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Message seller button (not shown for seller) */}
      {!isSeller && (
        <View style={[styles.buyBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View>
            <Text style={[styles.buyPrice, { color: colors.text }]}>{formatPrice(displayPrice)}</Text>
            {selectedVariant && (
              <Text style={[styles.buyVariant, { color: colors.textSecondary }]}>{selectedVariant.label || selectedVariant.sku}</Text>
            )}
          </View>
          <TouchableOpacity activeOpacity={1}
            style={[styles.buyBtn, { backgroundColor: isSold ? (isDark ? "#334155" : "#CBD5E1") : colors.primary }]}
            onPress={handleMessageSeller}
            disabled={isSold}
          >
            <Ionicons name={isSold ? "checkmark-circle" : "chatbubble-ellipses"} size={18} color="#fff" />
            <Text style={styles.buyBtnText}>{isSold ? "Sold" : "Message Seller"}</Text>
          </TouchableOpacity>
        </View>
      )}

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
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  gallery: { marginTop: 12 },
  galleryImage: { width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH - 32, borderRadius: 12, marginRight: 8 },
  singleImage: { width: "100%", height: SCREEN_WIDTH - 32, borderRadius: 12, marginTop: 12 },
  imagePlaceholder: { width: "100%", height: 240, borderRadius: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  titleSection: { marginTop: 16 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  productTitle: { fontSize: moderateScale(20), fontWeight: "800" },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 3 },
  statusPillText: { fontSize: moderateScale(11), fontWeight: "700" },
  price: { fontSize: moderateScale(22), fontWeight: "800", marginTop: 4 },
  seller: { fontSize: moderateScale(13), marginTop: 4 },
  marketNote: { fontSize: moderateScale(12), marginTop: 8, lineHeight: 18 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: moderateScale(15), fontWeight: "700", marginBottom: 10 },
  variantPill: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginRight: 10, minWidth: 80 },
  description: { fontSize: moderateScale(14), lineHeight: 22 },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  metaBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  sellerActionRow: { gap: 10 },
  sellerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderWidth: 1, borderRadius: 10 },
  primarySellerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 10 },
  primarySellerBtnText: { color: "#fff", fontSize: moderateScale(13), fontWeight: "700" },
  headerReportBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buyBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 24, borderTopWidth: 1 },
  buyPrice: { fontSize: moderateScale(18), fontWeight: "700" },
  buyVariant: { fontSize: moderateScale(11), marginTop: 2 },
  buyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  buyBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
});
