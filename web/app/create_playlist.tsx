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
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import ImageUploader from "../src/components/ImageUploader";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";

const PLAYLIST_COVER_BUCKET = "post-media";
const PLAYLIST_COVER_FOLDER = "playlist-covers";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const GENRES = ["Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic", "OPM", "Indie", "Other"];

export default function CreatePlaylistScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId } = useAuth();
  const params = useLocalSearchParams<{
    edit_id?: string | string[];
    owner_group_id?: string | string[];
    group_id?: string | string[];
    return_group_id?: string | string[];
    return_to?: string | string[];
  }>();
  const rawEditId = Array.isArray(params.edit_id) ? params.edit_id[0] : params.edit_id;
  const edit_id = typeof rawEditId === "string" ? rawEditId.trim() : "";
  const ownerGroupParam = params.owner_group_id || params.group_id;
  const rawOwnerGroupId = Array.isArray(ownerGroupParam) ? ownerGroupParam[0] : ownerGroupParam;
  const ownerGroupId = typeof rawOwnerGroupId === "string" ? rawOwnerGroupId.trim() : "";
  const rawReturnGroupId = Array.isArray(params.return_group_id) ? params.return_group_id[0] : params.return_group_id;
  const returnGroupId = typeof rawReturnGroupId === "string" ? rawReturnGroupId.trim() : "";
  const rawReturnTo = Array.isArray(params.return_to) ? params.return_to[0] : params.return_to;
  const returnTo = typeof rawReturnTo === "string" ? rawReturnTo.trim() : "";
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const isEdit = !!edit_id;
  const isGroupPlaylistCreate = !isEdit && ownerGroupId.length > 0;
  const screenTitle = isEdit ? "Edit Playlist" : isGroupPlaylistCreate ? "Upload Group Playlist" : "Create Playlist";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [coverImages, setCoverImages] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("manage-playlists", { body: { action: "get_playlist_details", playlist_id: edit_id } });
        if (data?.data) { setTitle(data.data.title || ""); setDescription(data.data.description || ""); setGenre(data.data.genre || ""); setCoverImages(data.data.cover_image_url ? [data.data.cover_image_url] : []); setVisibility(data.data.visibility || "public"); }
      } catch (e: any) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [edit_id, isEdit]);

  const returnAfterCreate = () => {
    const groupId = returnGroupId || ownerGroupId;
    if (returnTo === "manage_group" && groupId) {
      router.replace({
        pathname: "/manage_group",
        params: { id: groupId, refresh: Date.now().toString() },
      });
      return;
    }

    if (returnTo === "edit_group" && groupId) {
      router.replace({
        pathname: "/edit_group",
        params: { id: groupId, refresh: Date.now().toString() },
      });
      return;
    }

    router.back();
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setAlert({ type: "error", title: "Validation", message: "Title is required." }); return; }
    setSubmitting(true);
    try {
      const action = isEdit ? "update_playlist" : "create_playlist";
      const body: any = { action, title: title.trim(), description: description.trim(), genre, cover_image_url: coverImages[0] || null, visibility };
      if (isEdit) body.playlist_id = edit_id;
      else if (ownerGroupId) body.owner_group_id = ownerGroupId;
      const { data } = await supabase.functions.invoke("manage-playlists", { body });
      if (data?.success) {
        emitToast({ type: "success", title: isEdit ? "Updated" : "Created", message: `Playlist ${isEdit ? "updated" : "created"}.` });
        returnAfterCreate();
      } else { setAlert({ type: "error", title: "Error", message: data?.error || "Failed." }); }
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setSubmitting(false); }
  };

  const isSubmitReady = title.trim().length > 0;
  const isSubmitDisabled = submitting || !isSubmitReady;

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title={screenTitle} onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /></View>;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title={screenTitle} onBackPress={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 600, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          <Text style={[styles.label, { color: colors.text }]}>Album Cover</Text>
          {userId ? (
            <ImageUploader
              images={coverImages}
              onImagesChange={(images) => setCoverImages(images.slice(0, 1))}
              maxImages={1}
              bucketName={PLAYLIST_COVER_BUCKET}
              userId={userId}
              folder={PLAYLIST_COVER_FOLDER}
            />
          ) : null}

          <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
          <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]} value={title} onChangeText={setTitle} placeholder="Playlist title" placeholderTextColor={colors.textSecondary} maxLength={100} />
          <Text style={[styles.label, { color: colors.text }]}>Description</Text>
          <TextInput style={[styles.input, styles.multiline, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]} value={description} onChangeText={setDescription} placeholder="Describe your playlist" placeholderTextColor={colors.textSecondary} multiline numberOfLines={4} maxLength={500} />
          <Text style={[styles.label, { color: colors.text }]}>Genre</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            {GENRES.map((g) => (
              <TouchableOpacity activeOpacity={1} key={g} onPress={() => setGenre(genre === g ? "" : g)} style={[styles.chip, { backgroundColor: genre === g ? colors.primary : "transparent", borderColor: genre === g ? colors.primary : borderCol }]}>
                <Text style={{ color: genre === g ? "#fff" : colors.text, fontSize: 13 }}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={[styles.label, { color: colors.text }]}>Visibility</Text>
          <View style={styles.visRow}>
            {(["public", "private", "unlisted"] as const).map((v) => (
              <TouchableOpacity activeOpacity={1} key={v} onPress={() => setVisibility(v)} style={[styles.visBtn, { backgroundColor: visibility === v ? colors.primary : "transparent", borderColor: visibility === v ? colors.primary : borderCol }]}>
                <Text style={{ color: visibility === v ? "#fff" : colors.text, fontSize: 13, textTransform: "capitalize" }}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity activeOpacity={isSubmitDisabled ? 1 : 0.78} style={[styles.submitBtn, { backgroundColor: isSubmitReady ? colors.primary : colors.border, opacity: isSubmitDisabled ? 0.6 : 1 }]} onPress={handleSubmit} disabled={isSubmitDisabled}>
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.submitText, { color: isSubmitReady ? "#FFFFFF" : colors.textSecondary }]}>{isEdit ? "Update Playlist" : isGroupPlaylistCreate ? "Create Group Playlist" : "Create Playlist"}</Text>}
          </TouchableOpacity>
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: { fontSize: moderateScale(14), fontWeight: "600", marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, marginRight: 8 },
  visRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  visBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  submitBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 24 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: moderateScale(15) },
});
