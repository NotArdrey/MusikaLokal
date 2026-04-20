import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
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
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function StationDetailsScreen() {
  const { colors } = useTheme();
  const { session, userId } = useAuth();
  const { station_id } = useLocalSearchParams();

  const [station, setStation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const isOwner = station?.owner_id === userId;

  const fetchStation = useCallback(async () => {
    if (!station_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "get_station_details", station_id },
      });
      if (data?.data) setStation(data.data);
    } catch (e: any) {
      console.error("StationDetails fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [station_id]);

  useEffect(() => { fetchStation(); }, [fetchStation]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Station" onBackPress={() => router.back()} />
        <View style={{ padding: 16 }}>
          <Skeleton width={SCREEN_WIDTH - 32} height={160} style={{ borderRadius: 12, marginBottom: 16 }} />
          <Skeleton width={SCREEN_WIDTH * 0.6} height={24} style={{ borderRadius: 6, marginBottom: 12 }} />
        </View>
        <Navbar />
      </View>
    );
  }

  if (!station) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Station" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>Station not found</Text>
        </View>
        <Navbar />
      </View>
    );
  }

  const slots = station.slots || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={station.name} onBackPress={() => router.back()} />

      <ScrollView style={styles.content}>
        {/* Station art */}
        {station.cover_url ? (
          <CachedImage uri={station.cover_url } style={styles.cover} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="radio" size={56} color={colors.primary} />
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaSection}>
          <Text style={[styles.stationName, { color: colors.text }]}>{station.name}</Text>
          {station.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{station.description}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.badge, {
              backgroundColor: station.status === "live" ? "#22c55e20" : station.status === "scheduled" ? "#3b82f620" : "#f59e0b20"
            }]}>
              <Text style={{
                color: station.status === "live" ? "#22c55e" : station.status === "scheduled" ? "#3b82f6" : "#f59e0b",
                fontSize: moderateScale(11), fontWeight: "600"
              }}>
                {station.status}
              </Text>
            </View>
            {station.genre && (
              <Text style={[styles.genreText, { color: colors.textSecondary }]}>{station.genre}</Text>
            )}
          </View>
        </View>

        {/* Schedule / Slots */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Schedule ({slots.length} slots)</Text>
          {slots.length > 0 ? (
            slots.map((slot: any, idx: number) => (
              <View key={slot.id || idx} style={[styles.slotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="disc" size={20} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.slotPlaylist, { color: colors.text }]}>{slot.playlist_title || "Playlist"}</Text>
                  <Text style={[styles.slotTime, { color: colors.textSecondary }]}>
                    {slot.start_time ? new Date(slot.start_time).toLocaleString() : `Position ${slot.position}`}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No playlists scheduled yet</Text>
          )}
        </View>

        {/* Owner actions */}
        {isOwner && (
          <View style={styles.section}>
            <TouchableOpacity activeOpacity={1}
              style={[styles.editBtn, { backgroundColor: colors.primary }]}
              onPress={() => {/* Future: edit station modal */}}
            >
              <Ionicons name="settings" size={16} color="#fff" />
              <Text style={styles.editBtnText}>Manage Station</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 180, borderRadius: 12, marginTop: 12 },
  coverPlaceholder: { width: "100%", height: 180, borderRadius: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  metaSection: { marginTop: 16 },
  stationName: { fontSize: moderateScale(20), fontWeight: "800" },
  description: { fontSize: moderateScale(13), lineHeight: 20, marginTop: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  genreText: { fontSize: moderateScale(12) },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: "700", marginBottom: 12 },
  slotCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  slotPlaylist: { fontSize: moderateScale(14), fontWeight: "600" },
  slotTime: { fontSize: moderateScale(12), marginTop: 2 },
  editBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  editBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
  emptyText: { textAlign: "center", fontSize: moderateScale(13), marginTop: 12 },
});
