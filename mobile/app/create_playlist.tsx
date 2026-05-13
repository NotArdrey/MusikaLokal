import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth } from "../src/context/AuthContext";
import { emitToast } from "../src/events/toastBus";
import { useTheme } from "../src/context/ThemeContext";
import {
  ensurePlaylistAudioPassesCopyrightScreening,
  pickPlaylistAudioFile,
  uploadPlaylistAudioFile,
  type PlaylistAudioFile,
} from "../src/utils/playlistAudio";
import {
  createE2EPlaylistAudioFixture,
  isE2EFixtureMode,
} from "../src/utils/e2eFixtures";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

type PlaylistDraftTrack = {
  id: string;
  title: string;
  artist_name: string;
  audio_file: PlaylistAudioFile | null;
};

const createTrackDraft = (): PlaylistDraftTrack => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  artist_name: "",
  audio_file: null,
});

type DraftTrackPayload = {
  id: string;
  title: string;
  artist_name: string | null;
  duration_seconds: number | null;
  audio_file: PlaylistAudioFile | null;
};

type PlaylistAlert = {
  type: AlertType;
  title: string;
  message: string;
  forceModal?: boolean;
  buttons?: {
    text: string;
    onPress?: () => void;
    style?: "default" | "cancel" | "destructive";
  }[];
};

const getFriendlyUploadErrorMessage = (error: any) => {
  const message = typeof error?.message === "string" ? error.message : "";
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("different document picking in progress") ||
    normalizedMessage.includes("document picking in progress")
  ) {
    return "Another file picker is already open. Please finish or close it, then tap Upload MP3 again.";
  }

  if (normalizedMessage.includes("cancel") || normalizedMessage.includes("dismiss")) {
    return "No file was selected. Tap Upload MP3 when you're ready to choose a track.";
  }

  return message || "Please choose an MP3 file that is 5 minutes or less.";
};

export default function CreatePlaylistScreen() {
  const { colors } = useTheme();
  const { loading: authLoading, isGuest } = useAuth();
  const params = useLocalSearchParams<{ edit_id?: string | string[]; return_to?: string | string[]; return_user_id?: string | string[] }>();
  const editId = useMemo(() => {
    const raw = Array.isArray(params.edit_id) ? params.edit_id[0] : params.edit_id;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.edit_id]);
  const returnTo = useMemo(() => {
    const raw = Array.isArray(params.return_to) ? params.return_to[0] : params.return_to;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.return_to]);
  const returnUserId = useMemo(() => {
    const raw = Array.isArray(params.return_user_id) ? params.return_user_id[0] : params.return_user_id;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.return_user_id]);
  const isEditing = editId.length > 0;
  const { contentBottomPadding } = useBottomBarClearance(24);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [trackDrafts, setTrackDrafts] = useState<PlaylistDraftTrack[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [alert, setAlert] = useState<PlaylistAlert | null>(null);
  const [uploadingTrackAudioId, setUploadingTrackAudioId] = useState<string | null>(null);
  const [audioUploadMessage, setAudioUploadMessage] = useState<string | null>(null);

  const logPlaylistInvokeError = useCallback((context: string, error: any, body: Record<string, unknown>) => {
    console.error(`manage-playlists ${context} failed`, {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      context: error?.context,
      body,
    });
  }, []);

  const ensurePlaylistMutationSession = useCallback(async () => {
    if (isGuest) {
      throw new Error("You need to sign in to manage playlists.");
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (session?.access_token) {
      return session;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw refreshError;
    }

    if (!refreshed.session?.access_token) {
      throw new Error("Your session expired. Please sign in again.");
    }

    return refreshed.session;
  }, [isGuest]);

  // Load existing playlist for editing
  useEffect(() => {
    if (!isEditing || !editId) return;
    (async () => {
      try {
        const body = { action: "get_playlist_details", playlist_id: editId };
        const { data, error } = await supabase.functions.invoke("manage-playlists", {
          body,
        });

        if (error) {
          logPlaylistInvokeError("get_playlist_details", error, body);
          throw error;
        }

        if (data?.data) {
          setTitle(data.data.title || "");
          setDescription(data.data.description || "");
          setGenre(data.data.genre || "");
          setVisibility(data.data.visibility || "public");
        }
      } catch (e: any) {
        console.error("Load playlist error:", e);
        setAlert({ type: "error", title: "Playlist Unavailable", message: e?.message || "Failed to load this playlist." });
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, isEditing, logPlaylistInvokeError]);

  const addTrackDraft = useCallback(() => {
    setTrackDrafts((current) => [...current, createTrackDraft()]);
  }, []);

  const updateTrackDraft = useCallback((trackId: string, field: "title" | "artist_name", value: string) => {
    setTrackDrafts((current) => current.map((track) => (
      track.id === trackId
        ? {
            ...track,
            [field]: value,
          }
        : track
    )));
  }, []);

  const setTrackAudioFile = useCallback((trackId: string, audioFile: PlaylistAudioFile | null) => {
    setTrackDrafts((current) => current.map((track) => (
      track.id === trackId
        ? {
            ...track,
            audio_file: audioFile,
          }
        : track
    )));
  }, []);

  const removeTrackDraft = useCallback((trackId: string) => {
    setTrackDrafts((current) => current.filter((track) => track.id !== trackId));
  }, []);

  const handlePickTrackAudio = useCallback(async (trackId: string) => {
    try {
      if (isE2EFixtureMode()) {
        setTrackAudioFile(trackId, createE2EPlaylistAudioFixture());
        return;
      }

      setUploadingTrackAudioId(trackId);
      setAudioUploadMessage("Preparing MP3...");
      const audioFile = await pickPlaylistAudioFile();
      if (!audioFile) return;

      setAudioUploadMessage("Checking MP3...");
      await ensurePlaylistAudioPassesCopyrightScreening(audioFile);
      setTrackAudioFile(trackId, audioFile);
    } catch (error: any) {
      setAlert({
        type: "warning",
        title: "Upload MP3",
        message: getFriendlyUploadErrorMessage(error),
        forceModal: true,
      });
    } finally {
      setUploadingTrackAudioId(null);
      setAudioUploadMessage(null);
    }
  }, [setTrackAudioFile]);

  const prepareDraftTrackPayloads = useCallback(async (): Promise<DraftTrackPayload[]> => {
    const items = trackDrafts
      .map((track) => ({
        id: track.id,
        title: track.title.trim(),
        artist_name: track.artist_name.trim() || null,
        audio_file: track.audio_file,
      }))
      .filter((track) => track.title || track.artist_name || track.audio_file);

    if (items.some((track) => !track.title)) {
      throw new Error("Each added music needs a title before you save the playlist.");
    }

    return Promise.all(items.map(async (track) => {
      return {
        id: track.id,
        title: track.title,
        artist_name: track.artist_name,
        duration_seconds: track.audio_file?.durationSeconds || null,
        audio_file: track.audio_file,
      };
    }));
  }, [trackDrafts]);

  const handleSave = async () => {
    if (!title.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Please enter a playlist title." });
      return;
    }

    if (authLoading) {
      setAlert({ type: "info", title: "Please Wait", message: "Your session is still loading. Try again in a moment." });
      return;
    }

    setSaving(true);
    try {
      await ensurePlaylistMutationSession();

      const draftItems = !isEditing ? await prepareDraftTrackPayloads() : [];
      const action = isEditing ? "update_playlist" : "create_playlist";
      const body: any = {
        action,
        title: title.trim(),
        description: description.trim() || null,
        genre: genre.trim() || null,
        visibility,
      };
      if (isEditing) {
        if (!editId) {
          throw new Error("Missing playlist ID.");
        }

        body.playlist_id = editId;
      }

      const { data, error } = await supabase.functions.invoke("manage-playlists", { body });

      if (error) {
        logPlaylistInvokeError(action, error, body);
        throw error;
      }

      if (data?.success) {
        const playlistId = data.data?.id || editId;

        if (!isEditing && playlistId && draftItems.length > 0) {
          const failedTracks: { title: string; reason?: string }[] = [];

          for (const track of draftItems) {
            try {
              let sourceUrl: string | null = null;
              if (track.audio_file) {
                if (isE2EFixtureMode()) {
                  sourceUrl = track.audio_file.uri;
                } else {
                  setUploadingTrackAudioId(track.id);
                  setAudioUploadMessage(`Uploading ${track.title}...`);
                  const upload = await uploadPlaylistAudioFile(track.audio_file, playlistId);
                  sourceUrl = upload.publicUrl;
                }
              }

              const itemBody = {
                action: "add_playlist_item",
                playlist_id: playlistId,
                title: track.title,
                artist_name: track.artist_name,
                audio_url: sourceUrl,
                duration_seconds: track.duration_seconds,
              };

              const { error: itemError } = await supabase.functions.invoke("manage-playlists", {
                body: itemBody,
              });

              if (itemError) {
                logPlaylistInvokeError("add_playlist_item", itemError, itemBody);
                throw itemError;
              }
            } catch (trackError: any) {
              failedTracks.push({
                title: track.title,
                reason: typeof trackError?.message === "string" ? trackError.message : undefined,
              });
            }
          }

          if (failedTracks.length > 0) {
            const firstReason = failedTracks.find((track) => track.reason)?.reason;
            setAlert({
              type: "warning",
              title: "Track Upload Feedback",
              message: firstReason || `${failedTracks.length} track${failedTracks.length === 1 ? "" : "s"} could not be uploaded.`,
              forceModal: true,
              buttons: [
                {
                  text: "View Playlist",
                  onPress: () => {
                    router.replace({ pathname: "/playlist_details", params: { playlist_id: playlistId } });
                  },
                },
              ],
            });
            return;
          }
        }

        emitToast({
          type: "success",
          title: isEditing ? "Updated" : "Created",
          message: isEditing ? "Playlist updated." : "Playlist created!",
        });
        if (isEditing) {
          if (returnTo === "profile") {
            router.replace({
              pathname: "/profile",
              params: returnUserId ? { userId: returnUserId, refresh: Date.now().toString() } : { refresh: Date.now().toString() },
            });
          } else {
            router.back();
          }
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
      setUploadingTrackAudioId(null);
      setAudioUploadMessage(null);
      setSaving(false);
    }
  };

  const hasValidTrackDrafts = trackDrafts.every((track) => {
    const hasAnyDraftValue =
      track.title.trim().length > 0 ||
      track.artist_name.trim().length > 0 ||
      Boolean(track.audio_file);
    return !hasAnyDraftValue || track.title.trim().length > 0;
  });
  const isSaveReady = title.trim().length > 0 && hasValidTrackDrafts;
  const isSaveDisabled = saving || authLoading || !isSaveReady;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={isEditing ? "Edit Playlist" : "Create Playlist"} onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Navbar />
      </View>
    );
  }

  return (
    <View
      testID="mobile-create-playlist-page"
      accessibilityLabel="mobile-create-playlist-page"
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Header title={isEditing ? "Edit Playlist" : "Create Playlist"} onBackPress={() => router.back()} />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
        <TextInput
          testID="mobile-playlist-title-input"
          accessibilityLabel="mobile-playlist-title-input"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Playlist title"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={[styles.label, { color: colors.text }]}>Description</Text>
        <TextInput
          testID="mobile-playlist-description-input"
          accessibilityLabel="mobile-playlist-description-input"
          style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          placeholder="Describe your playlist..."
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          autoCapitalize={isE2EFixtureMode() ? "none" : "sentences"}
        />

        <Text style={[styles.label, { color: colors.text }]}>Genre</Text>
        <TextInput
          testID="mobile-playlist-genre-input"
          accessibilityLabel="mobile-playlist-genre-input"
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
              testID={`mobile-playlist-visibility-${v}`}
              accessibilityLabel={`mobile-playlist-visibility-${v}`}
              activeOpacity={1}
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

        {!isEditing ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, styles.sectionLabel, { color: colors.text }]}>Musics</Text>
              <TouchableOpacity
                testID="mobile-playlist-add-track-button"
                accessibilityLabel="mobile-playlist-add-track-button"
                activeOpacity={1}
                style={[styles.addTrackBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "30" }]}
                onPress={addTrackDraft}
              >
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={[styles.addTrackBtnText, { color: colors.primary }]}>Add Music</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.helperText, { color: colors.textSecondary }]}>Add the tracks now so the playlist is ready as soon as it is created.</Text>

            {trackDrafts.length === 0 ? (
              <View style={[styles.trackEmptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="musical-notes-outline" size={20} color={colors.textSecondary} />
                <Text style={[styles.trackEmptyTitle, { color: colors.text }]}>No musics added yet</Text>
                <Text style={[styles.trackEmptyText, { color: colors.textSecondary }]}>Tap Add Music to include a title and an MP3 audio file up to 5 minutes.</Text>
              </View>
            ) : (
              trackDrafts.map((track, index) => (
                <View
                  key={track.id}
                  testID={`mobile-playlist-track-card-${index}`}
                  accessibilityLabel={`mobile-playlist-track-card-${index}`}
                  style={[styles.trackCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={styles.trackCardHeader}>
                    <Text style={[styles.trackCardTitle, { color: colors.text }]}>Music {index + 1}</Text>
                    <TouchableOpacity
                      testID={`mobile-playlist-track-remove-${index}`}
                      accessibilityLabel={`mobile-playlist-track-remove-${index}`}
                      activeOpacity={1}
                      onPress={() => removeTrackDraft(track.id)}
                      style={styles.trackRemoveBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    testID={`mobile-playlist-track-title-${index}`}
                    accessibilityLabel={`mobile-playlist-track-title-${index}`}
                    style={[styles.input, styles.trackInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Track title"
                    placeholderTextColor={colors.textSecondary}
                    value={track.title}
                    onChangeText={(value) => updateTrackDraft(track.id, "title", value)}
                  />
                  <TextInput
                    testID={`mobile-playlist-track-artist-${index}`}
                    accessibilityLabel={`mobile-playlist-track-artist-${index}`}
                    style={[styles.input, styles.trackInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                    placeholder="Artist name"
                    placeholderTextColor={colors.textSecondary}
                    value={track.artist_name}
                    onChangeText={(value) => updateTrackDraft(track.id, "artist_name", value)}
                  />
                  <TouchableOpacity
                    testID={`mobile-playlist-track-audio-${index}`}
                    accessibilityLabel={`mobile-playlist-track-audio-${index}`}
                    activeOpacity={uploadingTrackAudioId === track.id || saving ? 1 : 0.78}
                    style={[
                      styles.audioPickerBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        opacity: uploadingTrackAudioId === track.id || saving ? 0.65 : 1,
                      },
                    ]}
                    onPress={() => void handlePickTrackAudio(track.id)}
                    disabled={Boolean(uploadingTrackAudioId) || saving}
                  >
                    {uploadingTrackAudioId === track.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                    )}
                    <Text style={[styles.audioPickerBtnText, { color: colors.primary }]}>
                      {uploadingTrackAudioId === track.id ? "Working..." : "Upload MP3"}
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.audioHelperText, { color: colors.textSecondary }]}>
                    Uploaded MP3 files must be 5 minutes or less.
                  </Text>
                  {track.audio_file ? (
                    <View style={[styles.audioFileChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                      <Ionicons name="musical-note" size={14} color={colors.primary} />
                      <Text style={[styles.audioFileChipText, { color: colors.text }]} numberOfLines={1}>
                        {track.audio_file.name}
                      </Text>
                      <TouchableOpacity activeOpacity={1} onPress={() => setTrackAudioFile(track.id, null)}>
                        <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : (
          <View style={[styles.editHintCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.editHintText, { color: colors.textSecondary }]}>Track management for existing playlists stays in the playlist details screen.</Text>
          </View>
        )}

        <TouchableOpacity
          testID="mobile-playlist-save-button"
          accessibilityLabel="mobile-playlist-save-button"
          activeOpacity={isSaveDisabled ? 1 : 0.78}
          style={[styles.saveBtn, { backgroundColor: isSaveReady ? colors.primary : colors.border, opacity: isSaveDisabled ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={isSaveDisabled}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.saveBtnText, { color: isSaveReady ? "#FFFFFF" : colors.textSecondary }]}>{isEditing ? "Update Playlist" : "Create Playlist"}</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {alert && (
        <CustomAlert
          visible
          type={alert.type}
          title={alert.title}
          message={alert.message}
          buttons={alert.buttons}
          forceModal={alert.forceModal}
          onClose={() => setAlert(null)}
        />
      )}

      <Modal visible={Boolean(audioUploadMessage)} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingTitle, { color: colors.text }]}>{audioUploadMessage}</Text>
            <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
              Please wait while your MP3 is prepared for the playlist.
            </Text>
          </View>
        </View>
      </Modal>

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 6 },
  sectionLabel: { marginTop: 0, marginBottom: 0 },
  helperText: { fontSize: moderateScale(12), lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14), textAlignVertical: "center" },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  visibilityRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  visibilityPill: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  addTrackBtn: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  addTrackBtnText: { fontSize: moderateScale(12), fontWeight: "700" },
  trackEmptyCard: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 12, alignItems: "center" },
  trackEmptyTitle: { fontSize: moderateScale(14), fontWeight: "700", marginTop: 8 },
  trackEmptyText: { fontSize: moderateScale(12), lineHeight: 18, marginTop: 4, textAlign: "center" },
  trackCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  trackCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  trackCardTitle: { fontSize: moderateScale(13), fontWeight: "700" },
  trackRemoveBtn: { padding: 4 },
  trackInput: { marginTop: 10 },
  audioPickerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 10, marginTop: 10 },
  audioPickerBtnText: { fontSize: moderateScale(13), fontWeight: "700" },
  audioHelperText: { fontSize: moderateScale(11), lineHeight: 16, marginTop: 8 },
  audioFileChip: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  audioFileChipText: { flex: 1, fontSize: moderateScale(12), fontWeight: "500" },
  editHintCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18 },
  editHintText: { flex: 1, fontSize: moderateScale(12), lineHeight: 18 },
  loadingOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)", padding: 24 },
  loadingCard: { width: "100%", maxWidth: 320, borderWidth: 1, borderRadius: 16, padding: 22, alignItems: "center" },
  loadingTitle: { fontSize: moderateScale(16), fontWeight: "800", marginTop: 14, textAlign: "center" },
  loadingSubtitle: { fontSize: moderateScale(12), lineHeight: 18, marginTop: 6, textAlign: "center" },
  saveBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 12, marginTop: 32 },
  saveBtnText: { color: "#fff", fontSize: moderateScale(16), fontWeight: "700" },
});
