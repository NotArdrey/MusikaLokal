import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth } from "../src/context/AuthContext";
import { useRadioPlayer } from "../src/context/RadioPlayerContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";
import { formatFriendlyDateTime } from "../src/utils/friendlyDateTime";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const KNOWN_STATION_MEDIA_BUCKETS = [
  "post-media",
  "posts",
  "images",
  "listings",
  "documents",
  "avatars",
];

const resolveStationMediaUrl = (value: unknown) => {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  if (!candidate) return "";

  if (candidate.includes("/storage/v1/object/avatars/")) {
    return candidate.replace("/storage/v1/object/avatars/", "/storage/v1/object/public/avatars/");
  }

  if (/^(https?:\/\/|data:|file:\/\/)/i.test(candidate)) {
    return candidate;
  }

  const normalized = candidate.replace(/^\/+/, "");
  const directParts = normalized.split("/");

  if (directParts.length > 1) {
    const directBucket = directParts[0];
    const directPath = directParts.slice(1).join("/");
    const { data } = supabase.storage.from(directBucket).getPublicUrl(directPath);
    if (data?.publicUrl) return data.publicUrl;
  }

  for (const bucket of KNOWN_STATION_MEDIA_BUCKETS) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(normalized);
    if (data?.publicUrl) return data.publicUrl;
  }

  return normalized;
};

const getStationArtworkUrl = (station: any) => {
  const candidateImages: unknown[] = [
    station?.cover_image_url,
    station?.creator?.avatar_url,
    ...(Array.isArray(station?.slots)
      ? station.slots.map((slot: any) => slot?.playlist?.cover_image_url)
      : []),
  ];

  for (const value of candidateImages) {
    const resolved = resolveStationMediaUrl(value);
    if (resolved) {
      return resolved;
    }
  }

  return "";
};

export default function StationDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { userId, userRole } = useAuth();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const {
    activeStation,
    currentTrack,
    currentSlotIndex,
    isAutoplayEnabled,
    isMuted,
    isPlaying,
    queueLength,
    skipPrevious,
    skipNext,
    syncStationData,
    toggleAutoplay,
    toggleMute,
    togglePlayPause,
    tuneIn,
  } = useRadioPlayer();
  const { station_id } = useLocalSearchParams();

  const [station, setStation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  // Owner management state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editRotationIntervalMinutes, setEditRotationIntervalMinutes] = useState("15");
  const [saving, setSaving] = useState(false);

  // Slot management state
  const [addSlotModalVisible, setAddSlotModalVisible] = useState(false);
  const [ownerPlaylists, setOwnerPlaylists] = useState<any[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [removingSlotId, setRemovingSlotId] = useState<string | null>(null);
  const [togglingPlaylistId, setTogglingPlaylistId] = useState<string | null>(null);

  const canManageStation = userRole === "admin";
  const isActiveStation = activeStation?.id === station?.id;
  const playerIsPlaying = isActiveStation && isPlaying;
  const playerIsMuted = isActiveStation && isMuted;
  const playerSlotIndex = isActiveStation ? currentSlotIndex : 0;

  const fetchStation = useCallback(async () => {
    if (!station_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "get_station_details", station_id },
      });
      if (data?.data) {
        setStation(data.data);
        syncStationData(data.data);
      }
    } catch (e: any) {
      console.error("StationDetails fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [station_id, syncStationData]);

  useEffect(() => { fetchStation(); }, [fetchStation]);

  useEffect(() => {
    if (!station?.id || station?.is_active === false) {
      return undefined;
    }

    const intervalMinutes = Math.min(
      Math.max(Math.round(Number(station?.rotation_interval_minutes) || 15), 5),
      120,
    );
    const intervalMs = intervalMinutes * 60 * 1000;
    const anchorMs = Date.parse(station?.live_anchor_at || station?.updated_at || station?.created_at || "");
    const nowMs = Date.now();
    const nextRefreshMs = Number.isFinite(anchorMs)
      ? (() => {
          const elapsedIntervals = anchorMs >= nowMs ? 0 : Math.floor((nowMs - anchorMs) / intervalMs);
          return Math.max((anchorMs + ((elapsedIntervals + 1) * intervalMs)) - nowMs + 1000, 1000);
        })()
      : intervalMs;

    const timeoutId = setTimeout(() => {
      void fetchStation();
    }, nextRefreshMs);

    return () => clearTimeout(timeoutId);
  }, [fetchStation, station?.created_at, station?.id, station?.is_active, station?.live_anchor_at, station?.rotation_interval_minutes, station?.updated_at]);

  const fetchOwnerPlaylists = useCallback(async () => {
    const targetProfileId = typeof station?.managed_profile_id === "string" && station.managed_profile_id.trim().length > 0
      ? station.managed_profile_id.trim()
      : typeof station?.creator_id === "string" && station.creator_id.trim().length > 0
        ? station.creator_id.trim()
        : userId;

    if (!targetProfileId) return;
    setLoadingPlaylists(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "list_user_playlists", user_id: targetProfileId },
      });
      setOwnerPlaylists(data?.data || []);
    } catch (_) {
      setOwnerPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  }, [station?.creator_id, station?.managed_profile_id, userId]);

  const handleEditOpen = () => {
    setEditName(station?.name || "");
    setEditDescription(station?.description || "");
    setEditGenre(station?.genre || "");
    setEditRotationIntervalMinutes(String(station?.rotation_interval_minutes || 15));
    setEditModalVisible(true);
  };

  const handleEditSave = async () => {
    if (!editName.trim()) {
      setAlert({ type: "warning", title: "Missing Name", message: "Station name is required." });
      return;
    }
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "update_station",
          station_id,
          name: editName.trim(),
          description: editDescription.trim() || null,
          genre: editGenre.trim() || null,
          rotation_interval_minutes: Math.min(
            Math.max(Number.parseInt(editRotationIntervalMinutes, 10) || 15, 5),
            120,
          ),
        },
      });
      if (data?.success) {
        emitToast({ type: "success", title: "Updated", message: "Station updated." });
        setEditModalVisible(false);
        fetchStation();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to update" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setSaving(false);
    }
  };
  const isEditStationReady = editName.trim().length > 0;

  const handleToggleActive = async () => {
    if (!station) return;
    setSaving(true);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "update_station", station_id, is_active: !station.is_active },
      });
      if (data?.success) {
        emitToast({ type: "success", title: station.is_active ? "Deactivated" : "Activated", message: `Station is now ${station.is_active ? "offline" : "live"}.` });
        fetchStation();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSlot = async (playlistId: string) => {
    setTogglingPlaylistId(playlistId);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "add_station_slot", station_id, playlist_id: playlistId },
      });
      if (data?.success) {
        emitToast({ type: "success", title: "Added", message: "Playlist added to station rotation." });
        fetchStation();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to add slot" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setTogglingPlaylistId(null);
    }
  };

  const handleRemoveSlot = async (slotId: string) => {
    setRemovingSlotId(slotId);
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "remove_station_slot", slot_id: slotId },
      });
      if (data?.success) {
        emitToast({ type: "success", title: "Removed", message: "Playlist removed from rotation." });
        fetchStation();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to remove slot" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setRemovingSlotId(null);
    }
  };

  const handleTogglePlaylist = async (playlistId: string, currentlyEnabled: boolean) => {
    if (currentlyEnabled) {
      // Find the slot for this playlist and remove it
      const matchingSlot = (station?.slots || []).find((s: any) => s.playlist_id === playlistId);
      if (matchingSlot) {
        setTogglingPlaylistId(playlistId);
        await handleRemoveSlot(matchingSlot.id);
        setTogglingPlaylistId(null);
      }
    } else {
      await handleAddSlot(playlistId);
    }
  };

  const openAddSlotModal = () => {
    fetchOwnerPlaylists();
    setAddSlotModalVisible(true);
  };

  const handlePlayPause = useCallback(async () => {
    if (!station) return;

    if (isActiveStation) {
      await togglePlayPause();
      return;
    }

    await tuneIn(station, 0);
  }, [isActiveStation, station, togglePlayPause, tuneIn]);

  const handleMuteToggle = useCallback(async () => {
    if (!isActiveStation) return;
    await toggleMute();
  }, [isActiveStation, toggleMute]);

  const handleAutoplayToggle = useCallback(() => {
    toggleAutoplay();
  }, [toggleAutoplay]);

  const handleSkipPrevious = useCallback(async () => {
    if (!isActiveStation) return;
    await skipPrevious();
  }, [isActiveStation, skipPrevious]);

  const handleSkipNext = useCallback(async () => {
    if (!isActiveStation) return;
    await skipNext();
  }, [isActiveStation, skipNext]);

  // Derive status from is_active field
  const stationStatus = station?.is_active ? "live" : "offline";

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
  const liveSlots = Array.isArray(station.live_slots) && station.live_slots.length > 0
    ? station.live_slots
    : slots;
  const liveSlotIds = new Set(liveSlots.map((slot: any) => slot.id));
  const rotationIntervalMinutes = Number.isFinite(Number(station.rotation_interval_minutes))
    ? Math.max(Math.round(Number(station.rotation_interval_minutes)), 1)
    : 15;
  const concurrentSlotLimit = Number.isFinite(Number(station.concurrent_slot_limit))
    ? Math.max(Math.round(Number(station.concurrent_slot_limit)), 1)
    : 4;
  const existingPlaylistIds = new Set(slots.map((s: any) => s.playlist_id));
  const canSkipTrack = isActiveStation && queueLength > 1;
  const playerTrackTitle = isActiveStation
    ? currentTrack?.title || liveSlots[playerSlotIndex]?.playlist?.title || liveSlots[playerSlotIndex]?.label || `Track ${playerSlotIndex + 1}`
    : liveSlots[playerSlotIndex]?.playlist?.title || liveSlots[playerSlotIndex]?.label || `Slot ${playerSlotIndex + 1}`;
  const stationArtworkUrl = getStationArtworkUrl(station);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={station.name} onBackPress={() => router.back()} />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        {/* Station art */}
        <View style={[
          styles.coverFrame,
          {
            backgroundColor: isDark ? "#111827" : "#F8FAFC",
            borderColor: isDark ? "#334155" : "#E2E8F0",
          },
        ]}>
          {stationArtworkUrl ? (
            <CachedImage uri={stationArtworkUrl} style={styles.cover} transition={180} />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "12" }]}>
              <Ionicons name="radio" size={72} color={colors.primary} />
            </View>
          )}
        </View>

        {/* Meta */}
        <View style={styles.metaSection}>
          <Text style={[styles.stationName, { color: colors.text }]}>{station.name}</Text>
          {station.creator && (
            <Text style={[styles.creatorName, { color: colors.textSecondary }]}>
              by {station.creator.full_name}
            </Text>
          )}
          {station.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{station.description}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.badge, {
              backgroundColor: stationStatus === "live" ? "#22c55e20" : "#f59e0b20"
            }]}>
              <Text style={{
                color: stationStatus === "live" ? "#22c55e" : "#f59e0b",
                fontSize: moderateScale(11), fontWeight: "600"
              }}>
                {stationStatus === "live" ? "Live" : "Offline"}
              </Text>
            </View>
            {station.genre && (
              <Text style={[styles.genreText, { color: colors.textSecondary }]}>{station.genre}</Text>
            )}
          </View>
          {slots.length > 0 && (
            <Text style={[styles.rotationSummary, { color: colors.textSecondary }]}>
              Rotates up to {Math.min(concurrentSlotLimit, slots.length)} playlists every {rotationIntervalMinutes} minutes.
            </Text>
          )}
        </View>

        {/* Player Controls */}
        {stationStatus === "live" && liveSlots.length > 0 && (
          <View style={[styles.playerBar, { backgroundColor: isDark ? "#1E293B" : "#F8FAFC", borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
            <TouchableOpacity activeOpacity={1} onPress={handlePlayPause} style={styles.playerBtn}>
              <Ionicons name={playerIsPlaying ? "pause" : "play"} size={28} color={colors.primary} />
            </TouchableOpacity>

            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text style={{ fontSize: moderateScale(11), color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {playerIsPlaying ? "Now Playing" : "Tap to Play"}
              </Text>
              <Text style={{ fontSize: moderateScale(13), fontWeight: "600", color: colors.text }} numberOfLines={1}>
                {playerTrackTitle}
              </Text>
            </View>

            <View style={styles.playerTransportGroup}>
              <TouchableOpacity activeOpacity={1} onPress={handleSkipPrevious} style={styles.playerBtn}>
                <Ionicons name="play-skip-back" size={22} color={colors.text} />
              </TouchableOpacity>

              {canSkipTrack && (
                <TouchableOpacity activeOpacity={1} onPress={handleSkipNext} style={styles.playerBtn}>
                  <Ionicons name="play-skip-forward" size={22} color={colors.text} />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity activeOpacity={1} onPress={handleMuteToggle} style={styles.playerBtn}>
              <Ionicons
                name={playerIsMuted ? "volume-mute" : "volume-high"}
                size={22}
                color={playerIsMuted ? "#ef4444" : colors.text}
              />
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={1} onPress={handleAutoplayToggle} style={styles.playerBtn}>
              <Ionicons
                name={isAutoplayEnabled ? "repeat" : "repeat-outline"}
                size={22}
                color={isAutoplayEnabled ? colors.primary : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Schedule / Slots */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
              Rotation ({slots.length} {slots.length === 1 ? "playlist" : "playlists"})
              </Text>
              {slots.length > 0 && (
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}> 
                  {liveSlots.length} on air now. The live lineup advances every {rotationIntervalMinutes} minutes.
                </Text>
              )}
            </View>
            {canManageStation && (
              <TouchableOpacity activeOpacity={1} onPress={openAddSlotModal} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="options" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: moderateScale(13), fontWeight: "600" }}>Manage Music</Text>
              </TouchableOpacity>
            )}
          </View>
          {slots.length > 0 ? (
            slots.map((slot: any, idx: number) => (
              <View key={slot.id || idx} style={[styles.slotCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
                <Ionicons name="disc" size={20} color={colors.primary} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.slotPlaylist, { color: colors.text }]}>
                    {slot.playlist?.title || slot.label || "Playlist"}
                  </Text>
                  <Text style={[styles.slotTime, { color: colors.textSecondary }]}>
                    {slot.starts_at
                      ? formatFriendlyDateTime(slot.starts_at)
                      : `Position ${slot.position + 1}`}
                  </Text>
                </View>
                {liveSlotIds.has(slot.id) && (
                  <View style={styles.liveNowBadge}>
                    <Text style={styles.liveNowBadgeText}>On Air</Text>
                  </View>
                )}
                {canManageStation && (
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => handleRemoveSlot(slot.id)}
                    disabled={removingSlotId === slot.id}
                    style={{ padding: 6 }}
                  >
                    {removingSlotId === slot.id ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                      <Ionicons name="close-circle" size={20} color="#ef4444" />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {canManageStation ? "No playlists in rotation yet. Tap Add to get started." : "No playlists scheduled yet"}
            </Text>
          )}
        </View>

        {/* Owner actions */}
        {canManageStation && (
          <View style={styles.section}>
            <TouchableOpacity activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              onPress={handleEditOpen}
            >
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Edit Station</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={1}
              style={[styles.actionBtn, { backgroundColor: station.is_active ? "#f59e0b" : "#22c55e", marginTop: 10 }]}
              onPress={handleToggleActive}
              disabled={saving}
            >
              <Ionicons name={station.is_active ? "pause-circle-outline" : "play-circle-outline"} size={16} color="#fff" />
              <Text style={styles.actionBtnText}>{station.is_active ? "Go Offline" : "Go Live"}</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

      {/* Edit Station Modal */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Station</Text>

            <Text style={[styles.modalLabel, { color: colors.text }]}>Name *</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.background }]}
              placeholder="Station name"
              placeholderTextColor={colors.textSecondary}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={[styles.modalLabel, { color: colors.text }]}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.background }]}
              placeholder="Describe your station..."
              placeholderTextColor={colors.textSecondary}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={3}
            />

            <Text style={[styles.modalLabel, { color: colors.text }]}>Genre</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.background }]}
              placeholder="e.g. OPM, Jazz, Rock"
              placeholderTextColor={colors.textSecondary}
              value={editGenre}
              onChangeText={setEditGenre}
            />

            <Text style={[styles.modalLabel, { color: colors.text }]}>Rotation Interval (minutes)</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.background }]}
              placeholder="15"
              placeholderTextColor={colors.textSecondary}
              value={editRotationIntervalMinutes}
              onChangeText={setEditRotationIntervalMinutes}
              keyboardType="number-pad"
            />
            <Text style={[styles.modalHelper, { color: colors.textSecondary }]}>Only admins can change this. Range: 5 to 120 minutes.</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity activeOpacity={1} style={[styles.modalBtn, { borderColor: isDark ? "#334155" : "#E2E8F0" }]} onPress={() => setEditModalVisible(false)}>
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={saving || !isEditStationReady ? 1 : 0.78} style={[styles.modalBtn, { backgroundColor: isEditStationReady ? colors.primary : colors.border, opacity: saving || !isEditStationReady ? 0.6 : 1 }]} onPress={handleEditSave} disabled={saving || !isEditStationReady}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: isEditStationReady ? "#fff" : colors.textSecondary, fontWeight: "700" }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Manage Music Modal – toggle playlists on/off for station rotation */}
      <Modal visible={addSlotModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, maxHeight: "75%" }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Manage Music</Text>
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), marginBottom: 16, marginTop: -8 }}>
              Toggle which playlists play on this station
            </Text>

            {loadingPlaylists ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
            ) : ownerPlaylists.length > 0 ? (
              <ScrollView style={{ maxHeight: 400 }}>
                {ownerPlaylists.map((pl: any) => {
                  const isEnabled = existingPlaylistIds.has(pl.id);
                  const isToggling = togglingPlaylistId === pl.id;
                  return (
                    <View
                      key={pl.id}
                      style={[styles.playlistPickItem, {
                        borderColor: isEnabled ? colors.primary + "40" : (isDark ? "#334155" : "#E2E8F0"),
                        backgroundColor: isEnabled ? (colors.primary + "08") : colors.background,
                      }]}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={isEnabled ? "musical-notes" : "musical-notes-outline"} size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ fontSize: moderateScale(14), fontWeight: "600", color: colors.text }} numberOfLines={1}>{pl.title}</Text>
                        {pl.genre && <Text style={{ fontSize: moderateScale(11), color: colors.textSecondary }}>{pl.genre}</Text>}
                      </View>
                      {isToggling ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Switch
                          value={isEnabled}
                          onValueChange={() => handleTogglePlaylist(pl.id, isEnabled)}
                          trackColor={{ false: isDark ? "#475569" : "#D1D5DB", true: colors.primary + "60" }}
                          thumbColor={isEnabled ? colors.primary : (isDark ? "#94A3B8" : "#F3F4F6")}
                        />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: "center", paddingVertical: 24 }}>
                <Ionicons name="musical-notes-outline" size={40} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 8, textAlign: "center" }}>
                  No playlists yet. Create a playlist first.
                </Text>
              </View>
            )}

            <TouchableOpacity activeOpacity={1} style={[styles.modalBtn, { borderColor: isDark ? "#334155" : "#E2E8F0", marginTop: 16, alignSelf: "stretch" }]} onPress={() => setAddSlotModalVisible(false)}>
              <Text style={{ color: colors.textSecondary, fontWeight: "600", textAlign: "center" }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverFrame: {
    width: "100%",
    height: 216,
    borderRadius: 24,
    marginTop: 12,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  cover: { width: "100%", height: "100%" },
  coverPlaceholder: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  metaSection: { marginTop: 16 },
  stationName: { fontSize: moderateScale(20), fontWeight: "800" },
  creatorName: { fontSize: moderateScale(13), marginTop: 4 },
  description: { fontSize: moderateScale(13), lineHeight: 20, marginTop: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  rotationSummary: { fontSize: moderateScale(12), marginTop: 10, lineHeight: 18 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  genreText: { fontSize: moderateScale(12) },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: "700", marginBottom: 12 },
  sectionSubtitle: { fontSize: moderateScale(12), marginTop: 4, lineHeight: 18 },
  slotCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  slotPlaylist: { fontSize: moderateScale(14), fontWeight: "600" },
  slotTime: { fontSize: moderateScale(12), marginTop: 2 },
  liveNowBadge: { backgroundColor: "#22c55e20", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, marginRight: 8 },
  liveNowBadgeText: { color: "#16a34a", fontSize: moderateScale(11), fontWeight: "700" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  actionBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
  emptyText: { textAlign: "center", fontSize: moderateScale(13), marginTop: 12 },
  // Player bar
  playerBar: { flexDirection: "row", alignItems: "center", marginTop: 20, padding: 12, borderRadius: 14, borderWidth: 1 },
  playerBtn: { padding: 6 },
  playerTransportGroup: { flexDirection: "row", alignItems: "center" },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalContent: { width: "100%", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: moderateScale(18), fontWeight: "700", marginBottom: 16 },
  modalLabel: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 12 },
  modalHelper: { fontSize: moderateScale(12), lineHeight: 18, marginTop: 8 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  modalTextArea: { minHeight: 80, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  playlistPickItem: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
});
