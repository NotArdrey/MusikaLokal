import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { emitToast } from "../events/toastBus";
import CachedImage from "./CachedImage";
import CustomAlert, { AlertType } from "./CustomAlert";
import ReportModal from "./ReportModal";

type Props = {
  productId: string | null;
  visible: boolean;
  onClose: () => void;
};

export default function ProductDetailsModal({ productId, visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const { userId, isGuest } = useAuth();
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

  const cardBg = isDark ? "#0F172A" : "#FFFFFF";
  const borderCol = isDark ? "#1E2C48" : "#D8E3F2";

  useEffect(() => {
    if (!visible) {
      setProduct(null);
      setVariants([]);
      setMedia([]);
      setSelectedVariant(null);
      setLoading(true);
      setAlert(null);
      setShowReportModal(false);
    }
  }, [visible]);

  const fetchProduct = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("manage-marketplace", {
        body: { action: "get_product_details", product_id: productId },
      });
      if (data?.data) {
        setProduct(data.data);
        setVariants(data.data.variants || []);
        setMedia(data.data.media || []);
        if (data.data.variants?.length) setSelectedVariant(data.data.variants[0]);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (visible && productId) fetchProduct();
  }, [visible, productId, fetchProduct]);

  // ESC key on web
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const handler = (event: any) => {
      if (event.key === "Escape") onClose();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [visible, onClose]);

  const currentPrice = selectedVariant?.price ?? product?.price ?? 0;

  const handleBuyNow = async () => {
    if (!product) return;
    if (isGuest || !userId) {
      setAlert({ type: "info", title: "Sign In Required", message: "Sign in to buy this item." });
      return;
    }
    setOrdering(true);
    try {
      const items = [{ product_id: product.id, variant_id: selectedVariant?.id || null, quantity: 1 }];
      const { data } = await supabase.functions.invoke("manage-marketplace", { body: { action: "create_order", items } });
      if (data?.success) {
        emitToast({ type: "success", title: "Ordered", message: "Order placed successfully!" });
        onClose();
        router.push("/orders");
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to place order." });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setOrdering(false);
    }
  };

  const submitProductReport = async (reason: string, details?: string) => {
    if (!userId || isGuest) throw new Error("You need to sign in to report marketplace items.");
    if (!product?.id) throw new Error("Listing details are missing.");
    const body = { action: "report", type: "product", id: product.id, userId, reason, details: details || null };
    const { data, error } = await supabase.functions.invoke("manage-details", { body });
    if (error) throw new Error(error.message || "Failed to submit report.");
    if (data && !Array.isArray(data) && data.already_reported) {
      throw new Error("You already have a pending report for this marketplace item.");
    }
  };

  const isSeller = product?.seller_id === userId;
  const canReportProduct = !isSeller && !!userId && !isGuest;

  const galleryWidth = isWebDesktop ? 620 : Math.min(width, 700) - 64;

  return (
    <>
      <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={[styles.modalBox, { backgroundColor: cardBg, borderColor: borderCol }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.header, { borderBottomColor: borderCol }]}>
              <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {product?.title || "Product"}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {canReportProduct ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowReportModal(true)}
                    style={[styles.iconBtn, { borderColor: borderCol, backgroundColor: isDark ? "#111827" : "#F8FAFC" }]}
                  >
                    <Ionicons name="flag-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity activeOpacity={0.85} onPress={onClose} style={[styles.iconBtn, { borderColor: borderCol, backgroundColor: isDark ? "#111827" : "#F8FAFC" }]}>
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : !product ? (
              <View style={styles.loadingWrap}>
                <Text style={{ color: colors.textSecondary }}>Product not found</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
                  {media.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} pagingEnabled style={{ marginTop: 4 }}>
                      {media.map((m: any, i: number) => (
                        <CachedImage key={i} uri={m.url} style={[styles.galleryImg, { width: galleryWidth }]} />
                      ))}
                    </ScrollView>
                  ) : product.thumbnail_url ? (
                    <CachedImage uri={product.thumbnail_url} style={[styles.galleryImg, { width: "100%" }]} />
                  ) : null}

                  <Text style={{ color: colors.text, fontSize: 20, fontFamily: "Poppins_700Bold", marginTop: 16 }}>{product.title}</Text>
                  <Text style={{ color: colors.primary, fontSize: 22, fontFamily: "Poppins_700Bold", marginTop: 8 }}>
                    ₱{Number(currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  {product.description ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22, marginTop: 10 }}>{product.description}</Text>
                  ) : null}

                  <View style={styles.metaRow}>
                    {product.product_type ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary + "18" }]}>
                        <Text style={{ color: colors.primary, fontSize: 12, textTransform: "capitalize" }}>{product.product_type}</Text>
                      </View>
                    ) : null}
                    {product.category ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary + "12" }]}>
                        <Text style={{ color: colors.primary, fontSize: 12 }}>{product.category}</Text>
                      </View>
                    ) : null}
                  </View>

                  {variants.length > 1 ? (
                    <>
                      <Text style={{ color: colors.text, fontSize: 15, fontFamily: "Poppins_600SemiBold", marginTop: 16 }}>Variants</Text>
                      <View style={styles.variantsRow}>
                        {variants.map((v: any) => {
                          const active = selectedVariant?.id === v.id;
                          return (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              key={v.id}
                              onPress={() => setSelectedVariant(v)}
                              style={[
                                styles.variantPill,
                                { backgroundColor: active ? colors.primary : "transparent", borderColor: active ? colors.primary : borderCol },
                              ]}
                            >
                              <Text style={{ color: active ? "#fff" : colors.text, fontSize: 13 }}>{v.label || v.sku || "Option"}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  ) : null}

                  {product.seller_name ? (
                    <View style={[styles.sellerRow, { borderTopColor: borderCol }]}>
                      <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                      <Text style={{ color: colors.text, fontSize: 14, fontFamily: "Poppins_600SemiBold", marginLeft: 8 }}>{product.seller_name}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                <View style={[styles.buyBar, { borderTopColor: borderCol }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Total</Text>
                    <Text style={{ color: colors.primary, fontSize: 18, fontFamily: "Poppins_700Bold" }}>
                      ₱{Number(currentPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={ordering ? 1 : 0.85}
                    style={[styles.buyBtn, { backgroundColor: colors.primary, opacity: ordering ? 0.6 : 1 }]}
                    onPress={handleBuyNow}
                    disabled={ordering}
                  >
                    {ordering ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 }}>Buy Now</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </RNModal>

      {product ? (
        <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          onSubmit={submitProductReport}
          targetName={product.title}
          title="Report Marketplace Item"
          reportType="product"
        />
      ) : null}

      {alert ? <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 16 },
  modalBox: { width: "100%", maxWidth: 700, maxHeight: "92%" as any, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 16, fontFamily: "Poppins_700Bold", marginRight: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 16, paddingTop: 12 },
  loadingWrap: { padding: 40, alignItems: "center", justifyContent: "center", minHeight: 240 },
  galleryImg: { height: 280, borderRadius: 14, marginRight: 8 },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  variantsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  variantPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1 },
  sellerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderTopWidth: 1, marginTop: 20 },
  buyBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  buyBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
});
