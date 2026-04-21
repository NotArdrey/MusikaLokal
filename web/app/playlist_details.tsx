import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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

export default function PlaylistDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { userId, isGuest } = useAuth();
  const { playlist_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [playlist, setPlaylist] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [teaserAssets, setTeaserAssets] = useState<any[]>([]);
  const [externalLinks, setExternalLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchPlaylist = useCallback(async () => {
    if (!playlist_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", { body: { action: "get_playlist_details", playlist_id } });
      if (data?.data) {
        setPlaylist(data.data);
        setItems(data.data.items || []);
        setTeaserAssets(data.data.teaser_assets || []);
        setExternalLinks(data.data.external_links || []);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [playlist_id]);

  useEffect(() => { fetchPlaylist(); }, [fetchPlaylist]);

  const handleDelete = async () => {
    const { data } = await supabase.functions.invoke("manage-playlists", { body: { action: "delete_playlist", playlist_id: playlist.id } });
    if (data?.success) { showTopToast({ type: "info", title: "Deleted", message: "Playlist deleted." }); router.back(); }
  };

  const handleRemoveItem = async (itemId: string) => {
    const { data } = await supabase.functions.invoke("manage-playlists", { body: { action: "remove_playlist_item", item_id: itemId } });
    if (data?.success) { setItems((prev) => prev.filter((i) => i.id !== itemId)); showTopToast({ type: "info", title: "Removed", message: "Item removed." }); }
  };

  const handlePlayTeaser = async (assetId: string) => {
    await supabase.functions.invoke("manage-playlists", { body: { action: "record_play_event", playlist_id: playlist.id, play_type: "teaser" } });
    showTopToast({ type: "info", title: "Playing", message: "Teaser playing..." });
  };

  const openReportModal = () => {
    if (!playlist?.id) {
      setAlert({ type: "error", title: "Unable to Report", message: "Playlist details are missing." });
      return;
    }

    setShowReportModal(true);
  };

  const submitPlaylistReport = async (reason: string, details?: string) => {
    if (!userId || isGuest) {
      throw new Error("You need to sign in to report music.");
    }

    if (!playlist?.id) {
      throw new Error("Playlist details are missing.");
    }

    const body = {
      action: "report",
      type: "playlist",
      id: playlist.id,
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
      throw new Error("You already have a pending report for this music release.");
    }
  };

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Playlist" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /><Navbar /></View>;
  if (!playlist) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Playlist" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Playlist not found</Text></View><Navbar /></View>;

  const isOwner = (playlist.owner_id || playlist.creator_id) === userId;
  const canReportPlaylist = !isOwner && !!userId && !isGuest;
  const reportHeaderAction = canReportPlaylist ? (
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
      <Header title="Playlist" onBackPress={() => router.back()} rightComponent={reportHeaderAction} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 700, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          {playlist.cover_url && <CachedImage uri={playlist.cover_url } style={styles.cover} />}
          <Text style={{ color: colors.text, fontSize: moderateScale(20), fontWeight: "800", marginTop: 16 }}>{playlist.title}</Text>
          {playlist.description && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginTop: 6 }}>{playlist.description}</Text>}
          <View style={styles.metaRow}>
            {playlist.genre && <View style={[styles.badge, { backgroundColor: colors.primary + "20" }]}><Text style={{ color: colors.primary, fontSize: 12 }}>{playlist.genre}</Text></View>}
            <View style={[styles.badge, { backgroundColor: colors.primary + "15" }]}><Text style={{ color: colors.primary, fontSize: 12 }}>{playlist.visibility || "public"}</Text></View>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{items.length} tracks</Text>
          </View>

          {isOwner && (
            <View style={styles.ownerRow}>
              <TouchableOpacity style={[styles.ownerBtn, { backgroundColor: colors.primary }]} onPress={() => router.push({ pathname: "/create_playlist", params: { edit_id: playlist.id } })}>
                <Ionicons name="pencil" size={16} color="#fff" /><Text style={styles.ownerBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ownerBtn, { backgroundColor: "#ef4444" }]} onPress={handleDelete}>
                <Ionicons name="trash" size={16} color="#fff" /><Text style={styles.ownerBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}

          {teaserAssets.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700", marginTop: 20 }}>Teaser Assets</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                {teaserAssets.map((a: any) => (
                  <TouchableOpacity key={a.id} style={[styles.teaserCard, { backgroundColor: cardBg, borderColor: borderCol }]} onPress={() => handlePlayTeaser(a.id)}>
                    {a.thumbnail_url && <CachedImage uri={a.thumbnail_url } style={styles.teaserThumb} />}
                    <Ionicons name="play-circle" size={28} color={colors.primary} style={{ marginTop: 4 }} />
                    <Text style={{ color: colors.text, fontSize: 12, marginTop: 4 }} numberOfLines={1}>{a.asset_type}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {externalLinks.length > 0 && (
            <>
              <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700", marginTop: 20 }}>Listen On</Text>
              <View style={styles.linksRow}>
                {externalLinks.map((l: any) => (
                  <TouchableOpacity key={l.id} style={[styles.linkChip, { backgroundColor: colors.primary + "18" }]}>
                    <Ionicons name="link" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, marginLeft: 6 }}>{l.platform_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700", marginTop: 24, marginBottom: 10 }}>Tracks</Text>
          {items.length > 0 ? items.map((item: any, idx: number) => (
            <View key={item.id} style={[styles.trackRow, { borderBottomColor: borderCol }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 14, width: 28 }}>{idx + 1}</Text>
              {item.thumbnail_url && <CachedImage uri={item.thumbnail_url } style={styles.trackThumb} />}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{item.title || "Untitled"}</Text>
                {item.artist_name && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.artist_name}</Text>}
              </View>
              {isOwner && <TouchableOpacity onPress={() => handleRemoveItem(item.id)}><Ionicons name="close-circle" size={20} color="#ef4444" /></TouchableOpacity>}
            </View>
          )) : <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 20 }}>No tracks yet</Text>}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitPlaylistReport}
        targetName={playlist.title}
        title="Report Music"
        reportType="music"
      />

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 200, borderRadius: 14, marginTop: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  headerReportBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  ownerRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  ownerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  ownerBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  teaserCard: { width: 110, padding: 10, borderRadius: 10, borderWidth: 1, marginRight: 10, alignItems: "center" },
  teaserThumb: { width: 80, height: 60, borderRadius: 8 },
  linksRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 10 },
  linkChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  trackRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5 },
  trackThumb: { width: 40, height: 40, borderRadius: 6 },
});
