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
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function CreatePlaylistScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { edit_id } = useLocalSearchParams();
  const isEditing = !!edit_id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  // Load existing playlist for editing
  useEffect(() => {
    if (!isEditing || !edit_id) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("manage-playlists", {
          body: { action: "get_playlist_details", playlist_id: edit_id },
        });
        if (data?.data) {
          setTitle(data.data.title || "");
          setDescription(data.data.description || "");
          setGenre(data.data.genre || "");
          setVisibility(data.data.visibility || "public");
        }
      } catch (e: any) {
        console.error("Load playlist error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [edit_id, isEditing]);

  const handleSave = async () => {
    if (!title.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Please enter a playlist title." });
      return;
    }
    setSaving(true);
    try {
      const action = isEditing ? "update_playlist" : "create_playlist";
      const body: any = {
        action,
        title: title.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
        visibility,
      };
      if (isEditing) body.playlist_id = edit_id;

      const { data } = await supabase.functions.invoke("manage-playlists", { body });

      if (data?.success) {
        showTopToast({
          type: "success",
          title: isEditing ? "Updated" : "Created",
          message: isEditing ? "Playlist updated." : "Playlist created!",
        });
        if (isEditing) {
          router.back();
        } else if (data.data?.id) {
          router.replace({ pathname: "/playlist_details", params: { playlist_id: data.data.id } });
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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={isEditing ? "Edit Playlist" : "Create Playlist"} onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={isEditing ? "Edit Playlist" : "Create Playlist"} onBackPress={() => router.back()} />

      <ScrollView style={styles.content}>
        <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Playlist title"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={[styles.label, { color: colors.text }]}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Describe your playlist..."
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

        <Text style={[styles.label, { color: colors.text }]}>Visibility</Text>
        <View style={styles.visibilityRow}>
          {(["public", "private"] as const).map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.visibilityPill,
                {
                  borderColor: visibility === v ? colors.primary : colors.border,
                  backgroundColor: visibility === v ? colors.primary + "20" : "transparent",
                },
              ]}
              onPress={() => setVisibility(v)}
            >
              <Ionicons
                name={v === "public" ? "globe-outline" : "lock-closed-outline"}
                size={14}
                color={visibility === v ? colors.primary : colors.textSecondary}
              />
              <Text
                style={{
                  color: visibility === v ? colors.primary : colors.textSecondary,
                  fontSize: moderateScale(13),
                  marginLeft: 6,
                }}
              >
                {v === "public" ? "Public" : "Private"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{isEditing ? "Update Playlist" : "Create Playlist"}</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {alert && (
        <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  visibilityRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  visibilityPill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  saveBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  saveBtnText: { color: "#fff", fontSize: moderateScale(16), fontWeight: "700" },
});
