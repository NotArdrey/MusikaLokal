import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function CreateStationScreen() {
  const { colors, isDark } = useTheme();
  const { session, userRole } = useAuth();
  const { edit_id, profile_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();

  const isEditing = !!edit_id;
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const canManageStations = userRole === "admin";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [rotationIntervalMinutes, setRotationIntervalMinutes] = useState("15");
  const [streamUrl, setStreamUrl] = useState("");
  const [streamStatus, setStreamStatus] = useState<"offline" | "live" | "autoplay">("offline");
  const [nowPlayingTitle, setNowPlayingTitle] = useState("");
  const [nowPlayingArtist, setNowPlayingArtist] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const normalizedRotationIntervalMinutes = useMemo(
    () => Math.min(Math.max(Number.parseInt(rotationIntervalMinutes, 10) || 15, 5), 120),
    [rotationIntervalMinutes],
  );

  useEffect(() => {
    if (!isEditing || !edit_id) return;

    let mounted = true;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("manage-playlists", {
          body: { action: "get_station_details", station_id: edit_id },
        });
        if (error) throw error;

        if (mounted && data?.data) {
          setName(data.data.name || "");
          setDescription(data.data.description || "");
          setGenre(data.data.genre || "");
          setRotationIntervalMinutes(String(data.data.rotation_interval_minutes || 15));
          setStreamUrl(data.data.stream_url || "");
          setStreamStatus(
            ["offline", "live", "autoplay"].includes(data.data.stream_status)
              ? data.data.stream_status
              : "offline",
          );
          setNowPlayingTitle(data.data.now_playing_title || "");
          setNowPlayingArtist(data.data.now_playing_artist || "");
        }
      } catch (e: any) {
        if (mounted) {
          setAlert({ type: "error", title: "Error", message: e?.message || "Failed to load station." });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [edit_id, isEditing]);

  const handleSave = async () => {
    if (!canManageStations) {
      setAlert({ type: "warning", title: "Admin Only", message: "Stations are managed by admins." });
      return;
    }

    if (!name.trim()) {
      setAlert({ type: "warning", title: "Missing Name", message: "Please enter a station name." });
      return;
    }

    setSaving(true);

    try {
      const action = isEditing ? "update_station" : "create_station";
      const body: any = {
        action,
        name: name.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
        rotation_interval_minutes: normalizedRotationIntervalMinutes,
        stream_url: streamUrl.trim() || null,
        stream_status: streamStatus,
        now_playing_title: nowPlayingTitle.trim() || null,
        now_playing_artist: nowPlayingArtist.trim() || null,
      };
      const managedProfileId =
        typeof profile_id === "string" && profile_id.trim().length > 0
          ? profile_id.trim()
          : session?.user?.id || null;

      if (managedProfileId) body.managed_profile_id = managedProfileId;
      if (isEditing) body.station_id = edit_id;

      const { data, error } = await supabase.functions.invoke("manage-playlists", { body });
      if (error) throw error;

      if (data?.success) {
        emitToast({
          type: "success",
          title: isEditing ? "Updated" : "Created",
          message: isEditing ? "Station updated." : "Station created!",
        });

        if (!isEditing && data.data?.id) {
          router.replace({ pathname: "/station_details", params: { station_id: data.data.id } });
          return;
        }

        router.back();
        return;
      }

      setAlert({ type: "error", title: "Error", message: data?.error || "Failed to save station." });
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e?.message || "Failed to save station." });
    } finally {
      setSaving(false);
    }
  };

  const isSaveReady = canManageStations && name.trim().length > 0;
  const isSaveDisabled = saving || !isSaveReady;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Header title={isEditing ? "Edit Station" : "Create Station"} onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Navbar />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title={isEditing ? "Edit Station" : "Create Station"} onBackPress={() => router.back()} />

      <ScrollView style={styles.content} contentContainerStyle={isWebDesktop ? styles.webContent : styles.mobileContent}>
        <View style={[styles.formShell, isWebDesktop && { backgroundColor: cardBg, borderColor: borderCol }]}>
          {!canManageStations ? (
            <View style={styles.lockedBox}>
              <Ionicons name="shield-checkmark-outline" size={44} color={colors.primary} />
              <Text style={[styles.lockedTitle, { color: colors.text }]}>Admin Managed</Text>
              <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
                Stations can only be created or edited by admins.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.heroSection}>
                <View style={[styles.heroIcon, { backgroundColor: colors.primary + "15" }]}>
                  <Ionicons name="radio" size={40} color={colors.primary} />
                </View>
                <Text style={[styles.heroText, { color: colors.textSecondary }]}>
                  {isEditing
                    ? "Update your station details below."
                    : "Create a station and add playlists to build a rotation."}
                </Text>
              </View>

              <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                placeholder="Station name"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.label, { color: colors.text }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                placeholder="Describe your station..."
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
              />

              <Text style={[styles.label, { color: colors.text }]}>Genre</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                placeholder="e.g. OPM, Jazz, Rock"
                placeholderTextColor={colors.textSecondary}
                value={genre}
                onChangeText={setGenre}
              />

              <Text style={[styles.label, { color: colors.text }]}>Rotation Interval</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                placeholder="15"
                placeholderTextColor={colors.textSecondary}
                value={rotationIntervalMinutes}
                onChangeText={setRotationIntervalMinutes}
                keyboardType="number-pad"
              />
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                How often the live lineup changes. Allowed range: 5 to 120 minutes.
              </Text>

              <Text style={[styles.label, { color: colors.text }]}>Continuous Stream URL</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                placeholder="https://your-radio.example/live"
                placeholderTextColor={colors.textSecondary}
                value={streamUrl}
                onChangeText={setStreamUrl}
                autoCapitalize="none"
                keyboardType="url"
              />
              <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                Optional. Add a real broadcast stream for live radio. Without it, the station uses shared playlist radio.
              </Text>

              <Text style={[styles.label, { color: colors.text }]}>Stream Status</Text>
              <View style={styles.segmentRow}>
                {(["offline", "live", "autoplay"] as const).map((status) => {
                  const selected = streamStatus === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      activeOpacity={1}
                      onPress={() => setStreamStatus(status)}
                      style={[
                        styles.segmentButton,
                        {
                          borderColor: selected ? colors.primary : borderCol,
                          backgroundColor: selected ? colors.primary : cardBg,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? "#FFFFFF" : colors.text, fontSize: moderateScale(12), fontWeight: "700", textTransform: "capitalize" }}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.inputRow}>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.text }]}>Now Playing Title</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textSecondary}
                    value={nowPlayingTitle}
                    onChangeText={setNowPlayingTitle}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.label, { color: colors.text }]}>Now Playing Artist</Text>
                  <TextInput
                    style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]}
                    placeholder="Optional"
                    placeholderTextColor={colors.textSecondary}
                    value={nowPlayingArtist}
                    onChangeText={setNowPlayingArtist}
                  />
                </View>
              </View>

              <TouchableOpacity
                activeOpacity={isSaveDisabled ? 1 : 0.78}
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: isSaveReady ? colors.primary : colors.border,
                    opacity: isSaveDisabled ? 0.6 : 1,
                  },
                ]}
                onPress={handleSave}
                disabled={isSaveDisabled}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.saveBtnText, { color: isSaveReady ? "#FFFFFF" : colors.textSecondary }]}>
                    {isEditing ? "Update Station" : "Create Station"}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      {alert && (
        <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  mobileContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  webContent: { alignItems: "center", paddingHorizontal: 24, paddingVertical: 24 },
  formShell: { width: "100%", maxWidth: 640, borderWidth: Platform.OS === "web" ? 1 : 0, borderRadius: 16, padding: 18 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroSection: { alignItems: "center", marginBottom: 8 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  heroText: { fontSize: moderateScale(13), textAlign: "center", lineHeight: 20 },
  label: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14), textAlignVertical: "center" },
  helperText: { fontSize: moderateScale(12), lineHeight: 18, marginTop: 8 },
  inputRow: { flexDirection: Platform.OS === "web" ? "row" : "column", gap: 12 },
  halfField: { flex: 1 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segmentButton: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingVertical: 10 },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  saveBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  saveBtnText: { fontSize: moderateScale(16), fontWeight: "700" },
  lockedBox: { minHeight: 280, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  lockedTitle: { fontSize: moderateScale(18), fontWeight: "700", marginTop: 14 },
  lockedText: { fontSize: moderateScale(13), textAlign: "center", lineHeight: 20, marginTop: 8 },
});
