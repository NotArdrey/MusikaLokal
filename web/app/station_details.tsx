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
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function StationDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const { station_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [station, setStation] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchStation = useCallback(async () => {
    if (!station_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", { body: { action: "get_station_details", station_id } });
      if (data?.data) { setStation(data.data); setSlots(data.data.slots || []); }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [station_id]);

  useEffect(() => { fetchStation(); }, [fetchStation]);

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Station" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /><Navbar /></View>;
  if (!station) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Station" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Station not found</Text></View><Navbar /></View>;

  const isOwner = station.owner_id === userId;
  const statusColors: Record<string, string> = { live: "#22c55e", paused: "#eab308", offline: "#64748b" };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Station" onBackPress={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 700, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          {station.cover_url && <CachedImage uri={station.cover_url } style={styles.cover} />}
          <View style={styles.titleRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColors[station.status] || "#64748b" }]} />
            <Text style={{ color: colors.text, fontSize: moderateScale(20), fontWeight: "800", flex: 1 }}>{station.name}</Text>
          </View>
          {station.description && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginTop: 6 }}>{station.description}</Text>}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: statusColors[station.status] + "20" }]}>
              <Text style={{ color: statusColors[station.status], fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>{station.status}</Text>
            </View>
            {station.genre && <View style={[styles.badge, { backgroundColor: colors.primary + "18" }]}><Text style={{ color: colors.primary, fontSize: 12 }}>{station.genre}</Text></View>}
          </View>

          {isOwner && (
            <TouchableOpacity activeOpacity={1} style={[styles.manageBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="settings-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "600", marginLeft: 8 }}>Manage Station</Text>
            </TouchableOpacity>
          )}

          <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700", marginTop: 24, marginBottom: 12 }}>Schedule</Text>
          {slots.length > 0 ? slots.map((slot: any) => (
            <View key={slot.id} style={[styles.slotCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <View style={styles.slotTime}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600", marginLeft: 6 }}>
                  {slot.start_time ? new Date(slot.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                  {" - "}
                  {slot.end_time ? new Date(slot.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBD"}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginTop: 6 }}>{slot.playlist_title || "Untitled Playlist"}</Text>
              {slot.day_of_week && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{slot.day_of_week}</Text>}
            </View>
          )) : <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 20 }}>No schedule slots yet</Text>}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 200, borderRadius: 14, marginTop: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  manageBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, marginTop: 16 },
  slotCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  slotTime: { flexDirection: "row", alignItems: "center" },
});
