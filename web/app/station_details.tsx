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
import { useRadioPlayer } from "../src/context/RadioPlayerContext";
import { useTheme } from "../src/context/ThemeContext";
import { getStationLiveTimelineState } from "../src/utils/radioTimeline";

const LIVE_STATION_REFRESH_MS = 30_000;

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const readLiveIndex = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

const getLiveCurrentSlot = (station: any, slots: any[]) => {
  if (station?.live_current_slot) {
    return station.live_current_slot;
  }

  const index = readLiveIndex(station?.live_current_slot_index);
  return slots[index] || slots[0] || null;
};

const getLiveCurrentItem = (station: any, slots: any[]) => {
  if (station?.live_current_item) {
    return station.live_current_item;
  }

  const slot = getLiveCurrentSlot(station, slots);
  const items = Array.isArray(slot?.playlist?.items) ? slot.playlist.items : [];
  const index = readLiveIndex(station?.live_current_item_index);
  return items[index] || items[0] || null;
};

export default function StationDetailsScreen() {
  const { colors, isDark } = useTheme();
  const {
    activeStation,
    currentSlotIndex,
    currentTrack,
    isMuted,
    loadingStationId,
    toggleMute,
    tuneIn,
  } = useRadioPlayer();
  const { station_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [station, setStation] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

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

  useEffect(() => {
    fetchStation();
    const intervalId = setInterval(fetchStation, LIVE_STATION_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [fetchStation]);

  useEffect(() => {
    const liveClockTimer = setInterval(() => {
      setLiveNowMs(Date.now());
    }, 1000);

    return () => clearInterval(liveClockTimer);
  }, []);

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Station" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /><Navbar /></View>;
  if (!station) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Station" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Station not found</Text></View><Navbar /></View>;

  const liveSlots = Array.isArray(station.live_slots) && station.live_slots.length > 0
    ? station.live_slots
    : slots;
  const liveTimelineState = getStationLiveTimelineState(station, liveNowMs);
  const liveCurrentSlot = liveTimelineState.slot || getLiveCurrentSlot(station, liveSlots);
  const liveCurrentItem = liveTimelineState.item || getLiveCurrentItem(station, liveSlots);
  const stationStatus = station?.is_active && liveSlots.length > 0 ? "live" : "offline";
  const isCurrentStation = Boolean(activeStation?.id && activeStation.id === station.id);
  const isCurrentMuted = isCurrentStation && isMuted;
  const isTuneInLoading = Boolean(loadingStationId === station.id);
  const canTuneIn = stationStatus === "live";
  const nowPlayingTitle = isCurrentStation
    ? liveCurrentItem?.title || currentTrack?.title || liveSlots[liveTimelineState.slotIndex ?? currentSlotIndex]?.playlist?.title || station.name
    : liveCurrentItem?.title || liveCurrentSlot?.playlist?.title || liveCurrentSlot?.label || "Shared playlist radio";
  const statusColors: Record<string, string> = { live: "#22c55e", paused: "#eab308", offline: "#64748b" };

  const handlePlayPress = async () => {
    if (!canTuneIn || isTuneInLoading) return;

    if (isCurrentStation) {
      await toggleMute();
      return;
    }

    await tuneIn(station, 0);
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Station" onBackPress={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 700, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          {station.cover_image_url && <CachedImage uri={station.cover_image_url } style={styles.cover} />}
          <View style={styles.titleRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColors[stationStatus] || "#64748b" }]} />
            <Text style={{ color: colors.text, fontSize: moderateScale(20), fontWeight: "800", flex: 1 }}>{station.name}</Text>
          </View>
          {station.description && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginTop: 6 }}>{station.description}</Text>}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: statusColors[stationStatus] + "20" }]}>
              <Text style={{ color: statusColors[stationStatus], fontSize: 12, fontWeight: "600", textTransform: "capitalize" }}>
                {stationStatus === "live" ? "Station Queue" : "Offline"}
              </Text>
            </View>
            {station.genre && <View style={[styles.badge, { backgroundColor: colors.primary + "18" }]}><Text style={{ color: colors.primary, fontSize: 12 }}>{station.genre}</Text></View>}
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(13), marginTop: 10, lineHeight: 20 }}>
            {liveSlots.length > 0
                ? "Shared playlist radio. The app keeps listeners on the same station timeline."
                : "No station queue is available yet."}
          </Text>

          {canTuneIn && (
            <View style={[styles.playerPanel, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", textTransform: "uppercase" }}>
                  Now Playing
                </Text>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
                  {nowPlayingTitle}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={handlePlayPress}
                disabled={isTuneInLoading}
                style={[styles.playBtn, { backgroundColor: colors.primary }]}
              >
                {isTuneInLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={isCurrentStation ? (isCurrentMuted ? "volume-mute" : "volume-high") : "play"}
                    size={18}
                    color="#FFFFFF"
                  />
                )}
                <Text style={{ color: "#FFFFFF", fontWeight: "700", marginLeft: 8 }}>
                  {isTuneInLoading ? "Loading" : isCurrentStation ? (isCurrentMuted ? "Unmute" : "Mute") : "Listen"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={{ color: colors.text, fontSize: moderateScale(16), fontWeight: "700", marginTop: 24, marginBottom: 12 }}>Station Queue</Text>
          {slots.length > 0 ? slots.map((slot: any) => (
            <View key={slot.id} style={[styles.slotCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <View style={styles.slotTime}>
                <Ionicons name="time-outline" size={16} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600", marginLeft: 6 }}>
                  {slot.starts_at ? new Date(slot.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : `Position ${(slot.position || 0) + 1}`}
                  {" - "}
                  {slot.ends_at ? new Date(slot.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "queue"}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginTop: 6 }}>{slot.playlist?.title || slot.label || "Untitled Playlist"}</Text>
            </View>
          )) : <Text style={{ color: colors.textSecondary, textAlign: "center", marginTop: 20 }}>No station playlists yet</Text>}
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
  playerPanel: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, marginTop: 14, padding: 12 },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  slotCard: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  slotTime: { flexDirection: "row", alignItems: "center" },
});
