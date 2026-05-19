import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function CreateStationScreen() {
  const { colors } = useTheme();
  const { session, userRole } = useAuth();
  const { edit_id, profile_id } = useLocalSearchParams();
  const isEditing = !!edit_id;
  const canManageStations = userRole === "admin";
  const { contentBottomPadding } = useBottomBarClearance(24);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  // Load existing station for editing
  useEffect(() => {
    if (!isEditing || !edit_id) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("manage-playlists", {
          body: { action: "get_station_details", station_id: edit_id },
        });
        if (data?.data) {
          setName(data.data.name || "");
          setDescription(data.data.description || "");
          setGenre(data.data.genre || "");
        }
      } catch (e: any) {
        console.error("Load station error:", e);
      } finally {
        setLoading(false);
      }
    })();
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
        rotation_interval_minutes: 15,
        stream_url: null,
        stream_status: "offline",
        now_playing_title: null,
        now_playing_artist: null,
      };
      const managedProfileId = typeof profile_id === "string" && profile_id.trim().length > 0
        ? profile_id.trim()
        : session?.user?.id || null;

      if (managedProfileId) {
        body.managed_profile_id = managedProfileId;
      }

      if (isEditing) body.station_id = edit_id;

      const { data } = await supabase.functions.invoke("manage-playlists", { body });

      if (data?.success) {
        emitToast({
          type: "success",
          title: isEditing ? "Updated" : "Created",
          message: isEditing ? "Station updated." : "Station created!",
        });
        if (isEditing) {
          router.back();
        } else if (data.data?.id) {
          router.replace({ pathname: "/station_details", params: { station_id: data.data.id } });
        } else {
          router.back();
        }
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to save" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const isSaveReady = canManageStations && name.trim().length > 0;
  const isSaveDisabled = saving || !isSaveReady;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={isEditing ? "Edit Station" : "Create Station"} onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!canManageStations) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={isEditing ? "Edit Station" : "Create Station"} onBackPress={() => router.back()} />
        <View style={[styles.centered, { paddingHorizontal: 24 }]}> 
          <Ionicons name="shield-checkmark-outline" size={44} color={colors.primary} />
          <Text style={[styles.lockedTitle, { color: colors.text }]}>Admin Managed</Text>
          <Text style={[styles.lockedText, { color: colors.textSecondary }]}>Stations can only be created or edited by admins.</Text>
        </View>
        {alert && (
          <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
        )}
        <Navbar />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={isEditing ? "Edit Station" : "Create Station"} onBackPress={() => router.back()} />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="radio" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.heroText, { color: colors.textSecondary }]}>
            {isEditing
              ? "Update the station details. Playback and now playing are handled by the selected playlists."
              : "Create a playlist radio station. After saving, add playlists to build the shared queue."}
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Station name"
          placeholderTextColor={colors.textSecondary}
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.label, { color: colors.text }]}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Describe your station..."
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={[styles.label, { color: colors.text }]}>Genre</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="e.g. OPM, Jazz, Rock"
          placeholderTextColor={colors.textSecondary}
          value={genre}
          onChangeText={setGenre}
        />

        <TouchableOpacity activeOpacity={isSaveDisabled ? 1 : 0.78}
          style={[styles.saveBtn, { backgroundColor: isSaveReady ? colors.primary : colors.border, opacity: isSaveDisabled ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={isSaveDisabled}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.saveBtnText, { color: isSaveReady ? "#FFFFFF" : colors.textSecondary }]}>{isEditing ? "Update Station" : "Create Station"}</Text>
          )}
        </TouchableOpacity>

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
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  heroSection: { alignItems: "center", marginBottom: 8 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  heroText: { fontSize: moderateScale(13), textAlign: "center", lineHeight: 20 },
  label: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14), textAlignVertical: "center" },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  saveBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  saveBtnText: { color: "#fff", fontSize: moderateScale(16), fontWeight: "700" },
  lockedTitle: { fontSize: moderateScale(18), fontWeight: "700", marginTop: 14 },
  lockedText: { fontSize: moderateScale(13), textAlign: "center", lineHeight: 20, marginTop: 8 },
});
