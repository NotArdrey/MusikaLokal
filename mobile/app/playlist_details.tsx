import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
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
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";
import {
  MAX_PLAYLIST_AUDIO_DURATION_SECONDS,
  ensurePlaylistAudioDuration,
  pickPlaylistAudioFile,
  resolvePlaylistAudioUrlDuration,
  uploadPlaylistAudioFile,
  type PlaylistAudioFile,
} from "../src/utils/playlistAudio";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function PlaylistDetailsScreen() {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { playlist_id } = useLocalSearchParams();
  const { contentBottomPadding } = useBottomBarClearance(24);

  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  // Add track modal state
  const [addTrackVisible, setAddTrackVisible] = useState(false);
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [newTrackArtist, setNewTrackArtist] = useState("");
  const [newTrackAudioUrl, setNewTrackAudioUrl] = useState("");
  const [newTrackDurationSeconds, setNewTrackDurationSeconds] = useState("");
  const [newTrackAudioFile, setNewTrackAudioFile] = useState<PlaylistAudioFile | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);

  const isOwner = playlist?.creator_id === userId;

  const fetchPlaylist = useCallback(async () => {
    if (!playlist_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "get_playlist_details", playlist_id },
      });
      if (data?.data) setPlaylist(data.data);
    } catch (e: any) {
      console.error("PlaylistDetails fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [playlist_id]);

  useEffect(() => { fetchPlaylist(); }, [fetchPlaylist]);

  const resetAddTrackForm = useCallback(() => {
    setAddTrackVisible(false);
    setNewTrackTitle("");
    setNewTrackArtist("");
    setNewTrackAudioUrl("");
    setNewTrackDurationSeconds("");
    setNewTrackAudioFile(null);
  }, []);

  const handleRecordPlay = async () => {
    if (!playlist) return;
    try {
      await supabase.functions.invoke("manage-playlists", {
        body: { action: "record_play_event", playlist_id: playlist.id },
      });
    } catch (e: any) {
      console.error("Play record error:", e);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "remove_playlist_item", item_id: itemId },
      });
      if (data?.success) {
        showTopToast({ type: "info", title: "Removed", message: "Track removed from playlist." });
        fetchPlaylist();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleDelete = async () => {
    try {
      const { data } = await supabase.functions.invoke("manage-playlists", {
        body: { action: "delete_playlist", playlist_id: playlist.id },
      });
      if (data?.success) {
        showTopToast({ type: "info", title: "Deleted", message: "Playlist deleted." });
        router.back();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleAddTrack = async () => {
    if (!newTrackTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Please enter a track title." });
      return;
    }

    setAddingTrack(true);
    try {
      let durationSeconds = newTrackDurationSeconds.trim() ? Number(newTrackDurationSeconds.trim()) : null;
      if (durationSeconds !== null) {
        durationSeconds = ensurePlaylistAudioDuration(durationSeconds);
      }

      let sourceUrl = newTrackAudioUrl.trim() || null;
      if (newTrackAudioFile) {
        const upload = await uploadPlaylistAudioFile(newTrackAudioFile, playlist.id);
        sourceUrl = upload.publicUrl;
        durationSeconds = upload.durationSeconds;
      } else if (sourceUrl) {
        durationSeconds = await resolvePlaylistAudioUrlDuration(sourceUrl, durationSeconds);
      }

      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "add_playlist_item",
          playlist_id: playlist.id,
          title: newTrackTitle.trim(),
          artist_name: newTrackArtist.trim() || null,
          audio_url: sourceUrl,
          duration_seconds: durationSeconds,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        showTopToast({ type: "success", title: "Track Added", message: "Track added to playlist." });
        resetAddTrackForm();
        fetchPlaylist();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to add track" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setAddingTrack(false);
    }
  };

  const handlePickTrackAudio = useCallback(async () => {
    try {
      const audioFile = await pickPlaylistAudioFile();
      if (!audioFile) return;

      setNewTrackAudioFile(audioFile);
      setNewTrackAudioUrl("");
      setNewTrackDurationSeconds(String(audioFile.durationSeconds));
    } catch (error: any) {
      setAlert({
        type: "warning",
        title: "Audio Not Allowed",
        message: error?.message || "Only MP3 or MP4 audio files up to 5 minutes are allowed.",
      });
    }
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Playlist" onBackPress={() => router.back()} />
        <View style={{ padding: 16 }}>
          <Skeleton width={SCREEN_WIDTH - 32} height={200} style={{ borderRadius: 12, marginBottom: 16 }} />
          <Skeleton width={SCREEN_WIDTH * 0.5} height={24} style={{ borderRadius: 6, marginBottom: 12 }} />
          <Skeleton width={SCREEN_WIDTH - 32} height={60} style={{ borderRadius: 8, marginBottom: 8 }} />
          <Skeleton width={SCREEN_WIDTH - 32} height={60} style={{ borderRadius: 8 }} />
        </View>
        <Navbar />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Playlist" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>Playlist not found</Text>
        </View>
        <Navbar />
      </View>
    );
  }

  const items = playlist.items || [];
  const teaserAssets = playlist.teaser_assets || [];
  const externalLinks = playlist.external_links || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={playlist.title} onBackPress={() => router.back()} />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        {/* Cover */}
        {playlist.cover_url ? (
          <CachedImage uri={playlist.cover_url } style={styles.cover} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="disc" size={56} color={colors.primary} />
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaSection}>
          <Text style={[styles.title, { color: colors.text }]}>{playlist.title}</Text>
          <Text style={[styles.creator, { color: colors.textSecondary }]}>
            by {playlist.creator_name || "Unknown"} â€¢ {items.length} tracks
          </Text>
          {playlist.description && (
            <Text style={[styles.description, { color: colors.textSecondary }]}>{playlist.description}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: playlist.visibility === "public" ? "#22c55e20" : "#f59e0b20" }]}>
              <Text style={{ color: playlist.visibility === "public" ? "#22c55e" : "#f59e0b", fontSize: moderateScale(11) }}>
                {playlist.visibility}
              </Text>
            </View>
            {playlist.genre && (
              <Text style={[styles.genreText, { color: colors.textSecondary }]}>{playlist.genre}</Text>
            )}
          </View>
        </View>

        {/* Play button */}
        <TouchableOpacity activeOpacity={1}
          style={[styles.playBtn, { backgroundColor: colors.primary }]}
          onPress={handleRecordPlay}
        >
          <Ionicons name="play" size={22} color="#fff" />
          <Text style={styles.playBtnText}>Play Teaser</Text>
        </TouchableOpacity>

        {/* Tracks */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Tracks</Text>
            {isOwner && (
              <TouchableOpacity activeOpacity={0.8} onPress={() => setAddTrackVisible(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: moderateScale(13), fontWeight: "600" }}>Add Track</Text>
              </TouchableOpacity>
            )}
          </View>
          {items.length > 0 ? (
            items.map((item: any, idx: number) => (
              <View key={item.id} style={[styles.trackRow, { borderColor: colors.border }]}>
                <Text style={[styles.trackNum, { color: colors.textSecondary }]}>{idx + 1}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={1}>{item.title || "Untitled"}</Text>
                  <Text style={[styles.trackArtist, { color: colors.textSecondary }]}>{item.artist_name || ""}</Text>
                </View>
                {item.audio_url ? (
                  <Ionicons name="musical-note" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                ) : null}
                {item.duration_seconds && (
                  <Text style={[styles.trackDuration, { color: colors.textSecondary }]}>
                    {Math.floor(item.duration_seconds / 60)}:{String(item.duration_seconds % 60).padStart(2, "0")}
                  </Text>
                )}
                {isOwner && (
                  <TouchableOpacity activeOpacity={1} onPress={() => handleRemoveItem(item.id)} style={{ marginLeft: 10 }}>
                    <Ionicons name="remove-circle-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No tracks added yet</Text>
          )}
        </View>

        {/* Teaser assets */}
        {teaserAssets.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Teaser Assets</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {teaserAssets.map((asset: any) => (
                <View key={asset.id} style={[styles.assetCard, { borderColor: colors.border }]}>
                  {asset.asset_type === "image" ? (
                    <CachedImage uri={asset.url } style={styles.assetImage} />
                  ) : (
                    <View style={[styles.assetImage, { backgroundColor: colors.primary + "10", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name={asset.asset_type === "audio" ? "musical-note" : "videocam"} size={24} color={colors.primary} />
                    </View>
                  )}
                  <Text style={[styles.assetLabel, { color: colors.textSecondary }]}>{asset.label || asset.asset_type}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* External links */}
        {externalLinks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Listen On</Text>
            <View style={styles.linksRow}>
              {externalLinks.map((link: any) => (
                <TouchableOpacity activeOpacity={1}
                  key={link.id}
                  style={[styles.linkChip, { borderColor: colors.border }]}
                >
                  <Ionicons name="link" size={14} color={colors.primary} />
                  <Text style={[styles.linkText, { color: colors.primary }]}>{link.platform}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Owner actions */}
        {isOwner && (
          <View style={styles.section}>
            <View style={styles.ownerActions}>
              <TouchableOpacity activeOpacity={1}
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push({ pathname: "/create_playlist", params: { edit_id: playlist.id } })}
              >
                <Ionicons name="create" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={1}
                style={[styles.actionBtn, { backgroundColor: "#ef4444" }]}
                onPress={handleDelete}
              >
                <Ionicons name="trash" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>

      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}

      {/* Add Track Modal */}
      <Modal visible={addTrackVisible} transparent animationType="slide" onRequestClose={resetAddTrackForm}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card || colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Add Track</Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Title *</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Track title"
              placeholderTextColor={colors.textSecondary}
              value={newTrackTitle}
              onChangeText={setNewTrackTitle}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Artist Name</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Artist or band name (optional)"
              placeholderTextColor={colors.textSecondary}
              value={newTrackArtist}
              onChangeText={setNewTrackArtist}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Audio URL</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="Paste a public MP3 or audio URL"
              placeholderTextColor={colors.textSecondary}
              value={newTrackAudioUrl}
              onChangeText={(value) => {
                setNewTrackAudioUrl(value);
                if (value.trim().length > 0) {
                  setNewTrackAudioFile(null);
                }
              }}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text style={[{ fontSize: moderateScale(11), marginTop: -8, marginBottom: 12, color: colors.textSecondary }]}>
              Used as the audio source when your track plays on radio stations.
            </Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.uploadAudioBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={() => void handlePickTrackAudio()}
              disabled={addingTrack}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
              <Text style={[styles.uploadAudioBtnText, { color: colors.primary }]}>Upload MP3 / MP4</Text>
            </TouchableOpacity>
            <Text style={[styles.audioHelperText, { color: colors.textSecondary }]}>MP4 is treated as audio only. URL or uploaded file must be 5 minutes or less.</Text>

            {newTrackAudioFile ? (
              <View style={[styles.audioFileChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                <Ionicons name="musical-note" size={14} color={colors.primary} />
                <Text style={[styles.audioFileChipText, { color: colors.text }]} numberOfLines={1}>
                  {newTrackAudioFile.name} • {newTrackAudioFile.durationSeconds}s
                </Text>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setNewTrackAudioFile(null)}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : null}

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Duration in Seconds</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={`Max ${MAX_PLAYLIST_AUDIO_DURATION_SECONDS}`}
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={newTrackDurationSeconds}
              onChangeText={setNewTrackDurationSeconds}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.modalBtn, { backgroundColor: colors.border, flex: 1 }]}
                onPress={resetAddTrackForm}
                disabled={addingTrack}
              >
                <Text style={{ color: colors.text, fontWeight: "600", fontSize: moderateScale(14) }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleAddTrack}
                disabled={addingTrack}
              >
                {addingTrack ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: moderateScale(14) }}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 220, borderRadius: 12, marginTop: 12 },
  coverPlaceholder: { width: "100%", height: 220, borderRadius: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  metaSection: { marginTop: 16 },
  title: { fontSize: moderateScale(20), fontWeight: "800" },
  creator: { fontSize: moderateScale(13), marginTop: 4 },
  description: { fontSize: moderateScale(13), lineHeight: 20, marginTop: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  genreText: { fontSize: moderateScale(12) },
  playBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  playBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: "700", marginBottom: 12 },
  trackRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 0.5 },
  trackNum: { fontSize: moderateScale(13), width: 24, textAlign: "center" },
  trackTitle: { fontSize: moderateScale(14), fontWeight: "600" },
  trackArtist: { fontSize: moderateScale(12), marginTop: 2 },
  trackDuration: { fontSize: moderateScale(12) },
  assetCard: { borderWidth: 1, borderRadius: 10, marginRight: 10, overflow: "hidden", width: 120 },
  assetImage: { width: 120, height: 90, borderRadius: 0 },
  assetLabel: { fontSize: moderateScale(11), padding: 6, textAlign: "center" },
  linksRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  linkChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  linkText: { fontSize: moderateScale(12), fontWeight: "500" },
  ownerActions: { flexDirection: "row", gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: "#fff", fontSize: moderateScale(13), fontWeight: "600" },
  emptyText: { textAlign: "center", fontSize: moderateScale(13), marginTop: 12 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, padding: 20, paddingBottom: 36 },
  modalTitle: { fontSize: moderateScale(18), fontWeight: "800", marginBottom: 16 },
  inputLabel: { fontSize: moderateScale(12), fontWeight: "600", marginBottom: 4 },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14), marginBottom: 12 },
  uploadAudioBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 12, marginBottom: 10 },
  uploadAudioBtnText: { fontSize: moderateScale(13), fontWeight: "700" },
  audioHelperText: { fontSize: moderateScale(11), lineHeight: 16, marginTop: -2, marginBottom: 12 },
  audioFileChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 },
  audioFileChipText: { flex: 1, fontSize: moderateScale(12), fontWeight: "500" },
  modalBtn: { paddingVertical: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
