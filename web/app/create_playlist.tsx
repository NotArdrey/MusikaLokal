import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
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

const PLAYLIST_COVER_BUCKET = "post-media";
const PLAYLIST_COVER_FOLDER = "playlist-covers";
const COPYRIGHT_MATCH_PATTERN = /this (?:audio|track) appears to match|appears to be copyrighted|permission to share/i;
const EXPECTED_UPLOAD_FEEDBACK_PATTERN =
  /(blocked by safety screening|safety check|copyright check|appears to match|appears to be copyrighted|permission to share|please upload music you own|licensed to share|playlist tracks must be|tracks must be|only mp3)/i;

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const GENRES = ["Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic", "OPM", "Indie", "Other"];

type PlaylistDraftTrack = {
  id: string;
  title: string;
  artist_name: string;
  audio_file: PlaylistAudioFile | null;
};

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

const createTrackDraft = (): PlaylistDraftTrack => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: "",
  artist_name: "",
  audio_file: null,
});

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

const isExpectedUploadFeedback = (message: string) =>
  EXPECTED_UPLOAD_FEEDBACK_PATTERN.test(message);

const formatUploadFeedbackMessage = (message: string) =>
  message.replace(/^.+? was blocked by safety screening\.\s*/i, "").trim() || message;

const logCreatePlaylistMp3 = (event: string, payload: Record<string, unknown> = {}) => {
  console.log("[CreatePlaylist][MP3]", event, payload);
};

const logCreatePlaylistMp3Error = (
  event: string,
  error: unknown,
  payload: Record<string, unknown> = {},
) => {
  const err = error as any;
  const message = err?.message || String(error);
  const expectedFeedback = isExpectedUploadFeedback(message);
  const log = expectedFeedback
    ? (...args: Parameters<typeof console.warn>) => console.warn(...args)
    : (...args: Parameters<typeof console.error>) => console.error(...args);

  log("[CreatePlaylist][MP3]", event, {
    message,
    name: err?.name || null,
    status: err?.status || null,
    code: err?.code || null,
    details: err?.details || null,
    expectedFeedback,
    ...payload,
  });
};

export default function CreatePlaylistScreen() {
  const { colors, isDark } = useTheme();
  const { loading: authLoading, isGuest, userId } = useAuth();
  const params = useLocalSearchParams<{
    edit_id?: string | string[];
    owner_group_id?: string | string[];
    group_id?: string | string[];
    return_group_id?: string | string[];
    return_user_id?: string | string[];
    return_to?: string | string[];
  }>();
  const edit_id = useMemo(() => {
    const raw = Array.isArray(params.edit_id) ? params.edit_id[0] : params.edit_id;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.edit_id]);
  const ownerGroupId = useMemo(() => {
    const ownerGroupParam = params.owner_group_id || params.group_id;
    const raw = Array.isArray(ownerGroupParam) ? ownerGroupParam[0] : ownerGroupParam;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.group_id, params.owner_group_id]);
  const returnGroupId = useMemo(() => {
    const raw = Array.isArray(params.return_group_id) ? params.return_group_id[0] : params.return_group_id;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.return_group_id]);
  const returnUserId = useMemo(() => {
    const raw = Array.isArray(params.return_user_id) ? params.return_user_id[0] : params.return_user_id;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.return_user_id]);
  const returnTo = useMemo(() => {
    const raw = Array.isArray(params.return_to) ? params.return_to[0] : params.return_to;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.return_to]);
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
  const [trackDrafts, setTrackDrafts] = useState<PlaylistDraftTrack[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<PlaylistAlert | null>(null);
  const [uploadingTrackAudioId, setUploadingTrackAudioId] = useState<string | null>(null);
  const [audioUploadMessage, setAudioUploadMessage] = useState<string | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  useEffect(() => {
    if (!isE2EFixtureMode() || isEdit) return;
    setGenre((current) => current.trim() ? current : "OPM");
    setTrackDrafts((current) => current.length > 0 ? current : [{
      id: "e2e-track-fixture",
      title: "E2E Track Fixture",
      artist_name: "E2E Artist",
      audio_file: createE2EPlaylistAudioFixture(),
    }]);
  }, [isEdit]);

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

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const body = { action: "get_playlist_details", playlist_id: edit_id };
        const { data, error } = await supabase.functions.invoke("manage-playlists", { body });
        if (error) {
          logPlaylistInvokeError("get_playlist_details", error, body);
          throw error;
        }
        if (data?.data) { setTitle(data.data.title || ""); setDescription(data.data.description || ""); setGenre(data.data.genre || ""); setCoverImages(data.data.cover_image_url ? [data.data.cover_image_url] : []); setVisibility(data.data.visibility || "public"); }
      } catch (e: any) {
        console.error(e);
        setAlert({ type: "error", title: "Playlist Unavailable", message: e?.message || "Failed to load this playlist." });
      }
      finally { setLoading(false); }
    })();
  }, [edit_id, isEdit, logPlaylistInvokeError]);

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
    const startedAt = Date.now();
    logCreatePlaylistMp3("pick_pressed", {
      trackId,
      currentTrackCount: trackDrafts.length,
    });

    try {
      if (isE2EFixtureMode()) {
        setTrackAudioFile(trackId, createE2EPlaylistAudioFixture());
        logCreatePlaylistMp3("pick_e2e_fixture_applied", {
          trackId,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      setUploadingTrackAudioId(trackId);
      setAudioUploadMessage("Preparing MP3...");
      const audioFile = await pickPlaylistAudioFile();
      if (!audioFile) {
        logCreatePlaylistMp3("pick_cancelled", {
          trackId,
          elapsedMs: Date.now() - startedAt,
        });
        return;
      }

      logCreatePlaylistMp3("pick_file_ready", {
        trackId,
        traceId: audioFile.debugTraceId || null,
        name: audioFile.name,
        mimeType: audioFile.mimeType,
        sizeBytes: audioFile.sizeBytes,
        durationSeconds: audioFile.durationSeconds,
        extension: audioFile.extension,
        elapsedMs: Date.now() - startedAt,
      });

      setAudioUploadMessage("Checking MP3...");
      await ensurePlaylistAudioPassesCopyrightScreening(audioFile);
      setTrackAudioFile(trackId, audioFile);
    } catch (error: any) {
      const pickerErrorMessage = getFriendlyUploadErrorMessage(error);
      const displayMessage = isExpectedUploadFeedback(pickerErrorMessage)
        ? formatUploadFeedbackMessage(pickerErrorMessage)
        : pickerErrorMessage;

      logCreatePlaylistMp3Error("pick_or_check_failed", error, {
        trackId,
        elapsedMs: Date.now() - startedAt,
      });
      setAlert({
        type: "warning",
        title: COPYRIGHT_MATCH_PATTERN.test(pickerErrorMessage) ? "Copyright Match Found" : "Upload MP3",
        message: displayMessage,
        forceModal: true,
      });
    } finally {
      setUploadingTrackAudioId(null);
      setAudioUploadMessage(null);
      logCreatePlaylistMp3("pick_flow_finished", {
        trackId,
        elapsedMs: Date.now() - startedAt,
      });
    }
  }, [setTrackAudioFile, trackDrafts.length]);

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

    return Promise.all(items.map(async (track) => ({
      id: track.id,
      title: track.title,
      artist_name: track.artist_name,
      duration_seconds: track.audio_file?.durationSeconds || null,
      audio_file: track.audio_file,
    })));
  }, [trackDrafts]);

  const returnAfterCreate = useCallback((fallbackPlaylistId?: string) => {
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

    if (returnTo === "profile") {
      router.replace({
        pathname: "/profile",
        params: returnUserId ? { userId: returnUserId, refresh: Date.now().toString() } : { refresh: Date.now().toString() },
      });
      return;
    }

    if (fallbackPlaylistId) {
      router.replace({ pathname: "/playlist_details", params: { playlist_id: fallbackPlaylistId } });
      return;
    }

    router.back();
  }, [ownerGroupId, returnGroupId, returnTo, returnUserId]);

  const handleSubmit = async () => {
    if (!title.trim()) { setAlert({ type: "error", title: "Validation", message: "Title is required." }); return; }
    if (authLoading) {
      setAlert({ type: "info", title: "Please Wait", message: "Your session is still loading. Try again in a moment." });
      return;
    }

    setSubmitting(true);
    try {
      await ensurePlaylistMutationSession();
      const draftItems = !isEdit ? await prepareDraftTrackPayloads() : [];
      const action = isEdit ? "update_playlist" : "create_playlist";
      const body: any = { action, title: title.trim(), description: description.trim() || null, genre: genre.trim() || null, cover_image_url: coverImages[0] || null, visibility };
      if (isEdit) body.playlist_id = edit_id;
      else if (ownerGroupId) body.owner_group_id = ownerGroupId;
      const { data, error } = await supabase.functions.invoke("manage-playlists", { body });
      if (error) {
        logPlaylistInvokeError(action, error, body);
        throw error;
      }
      if (data?.success) {
        const playlistId = data.data?.id || edit_id;

        if (!isEdit && playlistId && draftItems.length > 0) {
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

              const { data: itemData, error: itemError } = await supabase.functions.invoke("manage-playlists", {
                body: itemBody,
              });

              if (itemError) {
                logPlaylistInvokeError("add_playlist_item", itemError, itemBody);
                throw itemError;
              }

              if (!itemData?.success) {
                throw new Error(itemData?.error || "Failed to add playlist item.");
              }
            } catch (trackError: any) {
              logCreatePlaylistMp3Error("save_track_failed", trackError, {
                trackId: track.id,
                title: track.title,
                traceId: track.audio_file?.debugTraceId || null,
                playlistId,
              });
              failedTracks.push({
                title: track.title,
                reason: typeof trackError?.message === "string" ? trackError.message : undefined,
              });
            }
          }

          if (failedTracks.length > 0) {
            const firstReason = failedTracks.find((track) => track.reason)?.reason;
            const displayReason = firstReason && isExpectedUploadFeedback(firstReason)
              ? formatUploadFeedbackMessage(firstReason)
              : firstReason;
            setAlert({
              type: "warning",
              title: firstReason && COPYRIGHT_MATCH_PATTERN.test(firstReason)
                ? "Copyright Match Found"
                : "Track Upload Feedback",
              message: displayReason || `${failedTracks.length} track${failedTracks.length === 1 ? "" : "s"} could not be uploaded.`,
              forceModal: true,
              buttons: [
                {
                  text: isGroupPlaylistCreate ? "Back to Group" : "View Playlist",
                  onPress: () => returnAfterCreate(playlistId),
                },
              ],
            });
            return;
          }
        }

        emitToast({ type: "success", title: isEdit ? "Updated" : "Created", message: `Playlist ${isEdit ? "updated" : "created"}.` });
        returnAfterCreate(playlistId);
      } else { setAlert({ type: "error", title: "Error", message: data?.error || "Failed." }); }
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally {
      setUploadingTrackAudioId(null);
      setAudioUploadMessage(null);
      setSubmitting(false);
    }
  };

  const hasValidTrackDrafts = trackDrafts.every((track) => {
    const hasAnyDraftValue =
      track.title.trim().length > 0 ||
      track.artist_name.trim().length > 0 ||
      Boolean(track.audio_file);
    return !hasAnyDraftValue || track.title.trim().length > 0;
  });
  const isSubmitReady = title.trim().length > 0 && hasValidTrackDrafts;
  const isSubmitDisabled = submitting || authLoading || !isSubmitReady;

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
          {!isEdit ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.label, styles.sectionLabel, { color: colors.text }]}>Musics</Text>
                <TouchableOpacity
                  testID="web-playlist-add-track-button"
                  accessibilityLabel="web-playlist-add-track-button"
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
                <View style={[styles.trackEmptyCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <Ionicons name="musical-notes-outline" size={20} color={colors.textSecondary} />
                  <Text style={[styles.trackEmptyTitle, { color: colors.text }]}>No musics added yet</Text>
                  <Text style={[styles.trackEmptyText, { color: colors.textSecondary }]}>Tap Add Music to include a title and an MP3 audio file up to 5 minutes.</Text>
                </View>
              ) : (
                trackDrafts.map((track, index) => (
                  <View
                    key={track.id}
                    testID={`web-playlist-track-card-${index}`}
                    accessibilityLabel={`web-playlist-track-card-${index}`}
                    style={[styles.trackCard, { backgroundColor: cardBg, borderColor: borderCol }]}
                  >
                    <View style={styles.trackCardHeader}>
                      <Text style={[styles.trackCardTitle, { color: colors.text }]}>Music {index + 1}</Text>
                      <TouchableOpacity
                        testID={`web-playlist-track-remove-${index}`}
                        accessibilityLabel={`web-playlist-track-remove-${index}`}
                        activeOpacity={1}
                        onPress={() => removeTrackDraft(track.id)}
                        style={styles.trackRemoveBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      testID={`web-playlist-track-title-${index}`}
                      accessibilityLabel={`web-playlist-track-title-${index}`}
                      style={[styles.input, styles.trackInput, { color: colors.text, borderColor: borderCol, backgroundColor: bg }]}
                      placeholder="Track title"
                      placeholderTextColor={colors.textSecondary}
                      value={track.title}
                      onChangeText={(value) => updateTrackDraft(track.id, "title", value)}
                      maxLength={120}
                    />
                    <TextInput
                      testID={`web-playlist-track-artist-${index}`}
                      accessibilityLabel={`web-playlist-track-artist-${index}`}
                      style={[styles.input, styles.trackInput, { color: colors.text, borderColor: borderCol, backgroundColor: bg }]}
                      placeholder="Artist name"
                      placeholderTextColor={colors.textSecondary}
                      value={track.artist_name}
                      onChangeText={(value) => updateTrackDraft(track.id, "artist_name", value)}
                      maxLength={120}
                    />
                    <TouchableOpacity
                      testID={`web-playlist-track-audio-${index}`}
                      accessibilityLabel={`web-playlist-track-audio-${index}`}
                      activeOpacity={uploadingTrackAudioId === track.id || submitting ? 1 : 0.78}
                      style={[
                        styles.audioPickerBtn,
                        {
                          borderColor: borderCol,
                          backgroundColor: bg,
                          opacity: uploadingTrackAudioId === track.id || submitting ? 0.65 : 1,
                        },
                      ]}
                      onPress={() => void handlePickTrackAudio(track.id)}
                      disabled={Boolean(uploadingTrackAudioId) || submitting}
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
            <View style={[styles.editHintCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={[styles.editHintText, { color: colors.textSecondary }]}>Track management for existing playlists stays in the playlist details screen.</Text>
            </View>
          )}
          <TouchableOpacity activeOpacity={isSubmitDisabled ? 1 : 0.78} style={[styles.submitBtn, { backgroundColor: isSubmitReady ? colors.primary : colors.border, opacity: isSubmitDisabled ? 0.6 : 1 }]} onPress={handleSubmit} disabled={isSubmitDisabled}>
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.submitText, { color: isSubmitReady ? "#FFFFFF" : colors.textSecondary }]}>{isEdit ? "Update Playlist" : isGroupPlaylistCreate ? "Create Group Playlist" : "Create Playlist"}</Text>}
          </TouchableOpacity>
          <View style={{ height: 100 }} />
        </View>
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
          <View style={[styles.loadingCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingTitle, { color: colors.text }]}>{audioUploadMessage}</Text>
            <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
              Please wait while your MP3 is prepared for the playlist.
            </Text>
          </View>
        </View>
      </Modal>
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
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 6 },
  sectionLabel: { marginTop: 0, marginBottom: 0 },
  helperText: { fontSize: moderateScale(12), lineHeight: 18 },
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
  submitBtn: { paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 24 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: moderateScale(15) },
});
