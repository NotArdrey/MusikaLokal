import { Ionicons } from "@expo/vector-icons";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Modal,
  Platform,
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
import ReportModal from "../src/components/ReportModal";
import Skeleton from "../src/components/Skeleton";
import { resolveRadioMediaUrl } from "../src/audio/radioTrackPlayer";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";
import {
  pickPlaylistAudioFile,
  uploadPlaylistAudioFile,
  type PlaylistAudioFile,
} from "../src/utils/playlistAudio";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

const PLAYLIST_ASSET_BUCKET = "playlist-assets";
const PLAYLIST_ASSET_SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

type PlaylistAlert = {
  type: AlertType;
  title: string;
  message: string;
  forceModal?: boolean;
};

const COPYRIGHT_MATCH_PATTERN = /this (?:audio|track) appears to match|appears to be copyrighted|permission to share/i;
const EXPECTED_UPLOAD_FEEDBACK_PATTERN =
  /(blocked by safety screening|safety check|copyright check|appears to match|appears to be copyrighted|permission to share|please upload music you own|licensed to share|playlist tracks must be|tracks must be|only mp3)/i;

const isExpectedUploadFeedback = (message: string) =>
  EXPECTED_UPLOAD_FEEDBACK_PATTERN.test(message);

const formatUploadFeedbackMessage = (message: string) =>
  message.replace(/^.+? was blocked by safety screening\.\s*/i, "").trim() || message;

const readFunctionErrorBody = async (error: any) => {
  const response = error?.context;
  if (!response || typeof response !== "object") {
    return null;
  }

  try {
    const readableResponse = typeof response.clone === "function" ? response.clone() : response;
    if (typeof readableResponse.json === "function") {
      return await readableResponse.json();
    }

    if (typeof readableResponse.text === "function") {
      const text = await readableResponse.text();
      if (!text) return null;

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  } catch (bodyReadError: any) {
    return {
      error: "Unable to read function error response body",
      message: bodyReadError?.message || String(bodyReadError),
    };
  }

  return null;
};

const getFunctionErrorMessage = (error: any, responseBody: any, fallback: string) => {
  if (typeof responseBody === "string" && responseBody.trim()) {
    return responseBody.trim();
  }

  if (responseBody && typeof responseBody === "object") {
    const message = responseBody.error || responseBody.message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return error?.message || fallback;
};

const coerceSingleRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
};

const dedupeById = (entries: any[]) => {
  const seen = new Set<string>();
  const result: any[] = [];

  for (const entry of entries) {
    if (!entry) continue;

    const key = typeof entry.id === "string" && entry.id.trim().length > 0
      ? entry.id.trim()
      : JSON.stringify(entry);

    if (seen.has(key)) continue;

    seen.add(key);
    result.push(entry);
  }

  return result;
};

const normalizePlaylistDetails = (rawPlaylist: any) => {
  const creator = coerceSingleRelation(rawPlaylist?.creator);
  const items = Array.isArray(rawPlaylist?.items)
    ? rawPlaylist.items.map((item: any) => ({
        ...item,
        teaser: coerceSingleRelation(item?.teaser),
        external_link: coerceSingleRelation(item?.external_link),
      }))
    : [];

  const teaserAssets = dedupeById([
    ...(Array.isArray(rawPlaylist?.teaser_assets) ? rawPlaylist.teaser_assets : []),
    ...items.map((item: any) => item?.teaser).filter(Boolean),
  ]);

  const coverAsset = teaserAssets.find((asset: any) => asset?.asset_type === "cover_art");

  const externalLinks = dedupeById([
    ...(Array.isArray(rawPlaylist?.external_links) ? rawPlaylist.external_links : []),
    ...items
      .map((item: any) => {
        if (!item?.external_link) return null;

        return {
          ...item.external_link,
          linked_item_id: item.external_link.linked_item_id || item.id || null,
        };
      })
      .filter(Boolean),
  ]);

  return {
    ...rawPlaylist,
    cover_url: resolveRadioMediaUrl(
      rawPlaylist?.cover_image_url || rawPlaylist?.cover_url || coverAsset?.public_url || coverAsset?.url || "",
    ),
    creator_name: rawPlaylist?.creator_name || creator?.full_name || rawPlaylist?.owner_name || "Unknown",
    items,
    teaser_assets: teaserAssets,
    external_links: externalLinks,
  };
};

export default function PlaylistDetailsScreen() {
  const { colors } = useTheme();
  const { userId, isGuest } = useAuth();
  const { playlist_id } = useLocalSearchParams();
  const { contentBottomPadding } = useBottomBarClearance(24);

  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<PlaylistAlert | null>(null);

  // Add track modal state
  const [addTrackVisible, setAddTrackVisible] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [newTrackArtist, setNewTrackArtist] = useState("");
  const [newTrackAudioUrl, setNewTrackAudioUrl] = useState("");
  const [newTrackDurationSeconds, setNewTrackDurationSeconds] = useState("");
  const [newTrackAudioFile, setNewTrackAudioFile] = useState<PlaylistAudioFile | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const isOwner = (playlist?.creator_id || playlist?.owner_id) === userId;

  const logAddTrackModal = useCallback((event: string, payload?: Record<string, unknown>) => {
    console.log("[PlaylistDetails][AddTrackModal]", event, {
      playlistId: playlist?.id || null,
      editingTrackId,
      hasPickedAudioFile: Boolean(newTrackAudioFile),
      pickedAudioName: newTrackAudioFile?.name || null,
      pickedAudioMimeType: newTrackAudioFile?.mimeType || null,
      pickedAudioSizeBytes: newTrackAudioFile?.sizeBytes || null,
      pickedAudioDurationSeconds: newTrackAudioFile?.durationSeconds || null,
      hasExistingAudioUrl: newTrackAudioUrl.trim().length > 0,
      ...payload,
    });
  }, [editingTrackId, newTrackAudioFile, newTrackAudioUrl, playlist?.id]);

  const logPlaylistInvokeError = useCallback(async (context: string, error: any, body: Record<string, unknown>) => {
    const responseBody = await readFunctionErrorBody(error);

    console.error(`manage-playlists ${context} failed`, {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      responseBody,
      context: error?.context,
      body,
    });

    return responseBody;
  }, []);

  const unloadPreviewSound = useCallback(async () => {
    const sound = previewSoundRef.current;
    previewSoundRef.current = null;
    setActivePreviewUrl(null);
    setPreviewLoading(false);
    setPreviewPlaying(false);

    if (!sound) {
      return;
    }

    try {
      sound.setOnPlaybackStatusUpdate(null);
    } catch {
      // Ignore cleanup failures for already-disposed sounds.
    }

    try {
      await sound.stopAsync();
    } catch {
      // Ignore stop failures for already-stopped sounds.
    }

    try {
      await sound.unloadAsync();
    } catch {
      // Ignore unload failures for already-disposed sounds.
    }
  }, []);

  useEffect(() => {
    return () => {
      void unloadPreviewSound();
    };
  }, [unloadPreviewSound]);

  const resolvePlaylistAssetUrl = useCallback(async (asset: any) => {
    const directUrl = resolveRadioMediaUrl(
      asset?.public_url || asset?.url || asset?.thumbnail_url || asset?.cover_image_url || "",
    );
    if (directUrl) {
      return directUrl;
    }

    const storagePath = typeof asset?.storage_path === "string" ? asset.storage_path.trim() : "";
    if (!storagePath) {
      return "";
    }

    const { data, error } = await supabase.storage
      .from(PLAYLIST_ASSET_BUCKET)
      .createSignedUrl(storagePath, PLAYLIST_ASSET_SIGNED_URL_TTL_SECONDS);

    if (data?.signedUrl) {
      return data.signedUrl;
    }

    if (error) {
      console.warn("PlaylistDetails signed URL failed", error.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(PLAYLIST_ASSET_BUCKET).getPublicUrl(storagePath);

    return publicUrl || "";
  }, []);

  useEffect(() => {
    let isActive = true;

    const resolveCoverImage = async () => {
      const directCoverUrl = typeof playlist?.cover_url === "string" ? playlist.cover_url.trim() : "";
      if (directCoverUrl) {
        if (isActive) {
          setResolvedCoverUrl(directCoverUrl);
        }
        return;
      }

      const coverAsset = Array.isArray(playlist?.teaser_assets)
        ? playlist.teaser_assets.find((asset: any) => asset?.asset_type === "cover_art") || null
        : null;

      if (!coverAsset) {
        if (isActive) {
          setResolvedCoverUrl(null);
        }
        return;
      }

      const assetUrl = await resolvePlaylistAssetUrl(coverAsset);
      if (isActive) {
        setResolvedCoverUrl(assetUrl || null);
      }
    };

    void resolveCoverImage();

    return () => {
      isActive = false;
    };
  }, [playlist, resolvePlaylistAssetUrl]);

  const recordPlaylistEvent = useCallback(async (body: Record<string, unknown>) => {
    const payload = {
      action: "record_play_event",
      platform: Platform.OS,
      ...body,
    };

    const { error } = await supabase.functions.invoke("manage-playlists", { body: payload });
    if (error) {
      void logPlaylistInvokeError("record_play_event", error, payload);
    }
  }, [logPlaylistInvokeError]);

  const fetchPlaylist = useCallback(async () => {
    if (!playlist_id) return;
    try {
      const body = { action: "get_playlist_details", playlist_id };
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body,
      });

      if (error) {
        const responseBody = await logPlaylistInvokeError("get_playlist_details", error, body);
        throw new Error(getFunctionErrorMessage(error, responseBody, "Failed to load this playlist."));
      }

      if (data?.data) {
        setPlaylist(normalizePlaylistDetails(data.data));
      } else {
        setPlaylist(null);
      }
    } catch (e: any) {
      console.warn("PlaylistDetails fetch failed", e);
      setAlert({ type: "error", title: "Playlist Unavailable", message: e?.message || "Failed to load this playlist." });
    } finally {
      setLoading(false);
    }
  }, [logPlaylistInvokeError, playlist_id]);

  useEffect(() => { fetchPlaylist(); }, [fetchPlaylist]);

  const resetAddTrackForm = useCallback(() => {
    setAddTrackVisible(false);
    setEditingTrackId(null);
    setNewTrackTitle("");
    setNewTrackArtist("");
    setNewTrackAudioUrl("");
    setNewTrackDurationSeconds("");
    setNewTrackAudioFile(null);
  }, []);

  const handlePlayTeaser = useCallback(async (preferredAsset?: any) => {
    if (!playlist) return;

    const playlistItems = Array.isArray(playlist.items) ? playlist.items : [];
    const playlistTeaserAssets = Array.isArray(playlist.teaser_assets) ? playlist.teaser_assets : [];
    const fallbackAsset = playlistTeaserAssets.find((asset: any) => (
      asset?.asset_type === "teaser_clip" || asset?.asset_type === "track_preview"
    )) || playlistTeaserAssets[0] || null;
    const selectedAsset = preferredAsset || fallbackAsset;

    const linkedAssetItem = selectedAsset
      ? playlistItems.find((item: any) => item?.teaser?.id === selectedAsset.id) || null
      : null;

    const fallbackItem = linkedAssetItem || playlistItems.find((item: any) => {
      return typeof item?.audio_url === "string" && item.audio_url.trim().length > 0;
    }) || null;

    let previewUrl = "";

    try {
      if (selectedAsset) {
        previewUrl = await resolvePlaylistAssetUrl(selectedAsset);
      }

      if (!previewUrl && fallbackItem?.audio_url) {
        previewUrl = resolveRadioMediaUrl(fallbackItem.audio_url);
      }

      if (!previewUrl) {
        setAlert({
          type: "warning",
          title: "Teaser Unavailable",
          message: "Add a teaser clip or track audio before playing a preview.",
        });
        return;
      }

      const existingSound = previewSoundRef.current;
      if (existingSound && activePreviewUrl === previewUrl) {
        const status = await existingSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await existingSound.pauseAsync();
          setPreviewPlaying(false);
          return;
        }

        if (status.isLoaded) {
          await existingSound.playAsync();
          setPreviewPlaying(true);
          return;
        }
      }

      await unloadPreviewSound();
      setPreviewLoading(true);

      const { sound } = await Audio.Sound.createAsync(
        { uri: previewUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
      );

      previewSoundRef.current = sound;
      setActivePreviewUrl(previewUrl);
      setPreviewLoading(false);
      setPreviewPlaying(true);

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
          if (status.error) {
            console.warn("Playlist teaser playback failed", status.error);
          }
          setPreviewLoading(false);
          setPreviewPlaying(false);
          return;
        }

        setPreviewLoading(false);
        setPreviewPlaying(status.isPlaying);

        if (status.didJustFinish) {
          void unloadPreviewSound();
        }
      });

      void recordPlaylistEvent({
        playlist_id: playlist.id,
        item_id: linkedAssetItem?.id || fallbackItem?.id || null,
        event_type: "teaser_play",
      });
    } catch (e: any) {
      await unloadPreviewSound();
      setAlert({
        type: "error",
        title: "Playback Failed",
        message: e?.message || "We could not start the teaser.",
      });
    }
  }, [activePreviewUrl, playlist, recordPlaylistEvent, resolvePlaylistAssetUrl, unloadPreviewSound]);

  const handleOpenExternalLink = useCallback(async (link: any, itemId?: string | null) => {
    const rawUrl = typeof link?.url === "string" ? link.url.trim() : "";
    if (!rawUrl) {
      setAlert({ type: "warning", title: "Link Unavailable", message: "This playlist link is missing a URL." });
      return;
    }

    const normalizedUrl = /^(https?:\/\/|mailto:|tel:)/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;

    try {
      await Linking.openURL(normalizedUrl);
      if (playlist?.id) {
        void recordPlaylistEvent({
          playlist_id: playlist.id,
          item_id: itemId || link?.linked_item_id || null,
          event_type: "outbound_click",
        });
      }
    } catch (e: any) {
      setAlert({
        type: "error",
        title: "Link Unavailable",
        message: e?.message || "We could not open that link.",
      });
    }
  }, [playlist?.id, recordPlaylistEvent]);

  const handleRemoveItem = async (itemId: string) => {
    try {
      const body = { action: "remove_playlist_item", item_id: itemId, playlist_id: playlist?.id };
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body,
      });

      if (error) {
        const responseBody = await logPlaylistInvokeError("remove_playlist_item", error, body);
        throw new Error(getFunctionErrorMessage(error, responseBody, "Failed to remove track."));
      }

      if (data?.success) {
        showTopToast({ type: "info", title: "Removed", message: "Track removed from playlist." });
        fetchPlaylist();
        return;
      }

      throw new Error(data?.error || "Failed to remove track.");
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleDelete = async () => {
    try {
      const body = { action: "delete_playlist", playlist_id: playlist.id };
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body,
      });

      if (error) {
        const responseBody = await logPlaylistInvokeError("delete_playlist", error, body);
        throw new Error(getFunctionErrorMessage(error, responseBody, "Failed to delete playlist."));
      }

      if (data?.success) {
        showTopToast({ type: "info", title: "Deleted", message: "Playlist deleted." });
        router.back();
        return;
      }

      throw new Error(data?.error || "Failed to delete playlist.");
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const openEditTrackModal = useCallback((item: any) => {
    setEditingTrackId(item.id);
    setNewTrackTitle(item.title || "");
    setNewTrackArtist(item.artist_name || "");
    setNewTrackAudioUrl(item.audio_url || "");
    setNewTrackDurationSeconds(
      typeof item.duration_seconds === "number" && Number.isFinite(item.duration_seconds)
        ? String(item.duration_seconds)
        : "",
    );
    setNewTrackAudioFile(null);
    setAddTrackVisible(true);
  }, []);

  const handleSaveTrack = async () => {
    logAddTrackModal("save_pressed", {
      titleLength: newTrackTitle.trim().length,
      artistLength: newTrackArtist.trim().length,
    });

    if (!newTrackTitle.trim()) {
      logAddTrackModal("save_blocked_missing_title");
      setAlert({ type: "warning", title: "Missing Title", message: "Please enter a track title." });
      return;
    }

    setAddingTrack(true);
    try {
      let sourceUrl = newTrackAudioUrl.trim() || null;
      let durationSeconds = newTrackDurationSeconds.trim() ? Number(newTrackDurationSeconds.trim()) : null;
      if (newTrackAudioFile) {
        logAddTrackModal("copyright_check_upload_start", {
          fileName: newTrackAudioFile.name,
          mimeType: newTrackAudioFile.mimeType,
          sizeBytes: newTrackAudioFile.sizeBytes,
        });

        const upload = await uploadPlaylistAudioFile(newTrackAudioFile, playlist.id);
        sourceUrl = upload.publicUrl;
        durationSeconds = upload.durationSeconds;

        logAddTrackModal("copyright_check_upload_passed", {
          storagePath: upload.storagePath,
          uploadedDurationSeconds: upload.durationSeconds,
          hasPublicUrl: Boolean(upload.publicUrl),
        });
      } else {
        logAddTrackModal("save_without_new_audio_file", {
          reason: sourceUrl ? "using_existing_audio_url" : "metadata_only_track",
        });
      }

      const itemBody = {
        action: editingTrackId ? "update_playlist_item" : "add_playlist_item",
        ...(editingTrackId ? { item_id: editingTrackId } : { playlist_id: playlist.id }),
        title: newTrackTitle.trim(),
        artist_name: newTrackArtist.trim() || null,
        audio_url: sourceUrl,
        duration_seconds: durationSeconds,
      };

      logAddTrackModal("manage_playlists_invoke_start", {
        action: itemBody.action,
        hasAudioUrl: Boolean(sourceUrl),
        durationSeconds,
      });

      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: itemBody,
      });

      if (error) {
        logAddTrackModal("manage_playlists_invoke_failed", {
          message: error.message,
          status: (error as any).status,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
          body: itemBody,
        });
        throw error;
      }

      if (data?.success) {
        logAddTrackModal("save_success", {
          action: itemBody.action,
          returnedId: data?.data?.id || null,
        });
        showTopToast({
          type: "success",
          title: editingTrackId ? "Track Updated" : "Track Added",
          message: editingTrackId ? "Track changes saved." : "Track added to playlist.",
        });
        resetAddTrackForm();
        fetchPlaylist();
      } else {
        logAddTrackModal("save_rejected_by_manage_playlists", {
          responseError: data?.error || null,
        });
        setAlert({
          type: "error",
          title: "Error",
          message: data?.error || (editingTrackId ? "Failed to update track" : "Failed to add track"),
        });
      }
    } catch (e: any) {
      const saveErrorMessage = e?.message || String(e);
      const isUploadFeedback = isExpectedUploadFeedback(saveErrorMessage);
      const displayMessage = isUploadFeedback
        ? formatUploadFeedbackMessage(saveErrorMessage)
        : saveErrorMessage;

      if (isUploadFeedback) {
        logAddTrackModal("upload_feedback", {
          reason: displayMessage,
          feedbackKind: COPYRIGHT_MATCH_PATTERN.test(saveErrorMessage) ? "copyright_match" : "upload_rejected",
        });
      } else {
        logAddTrackModal("save_failed", {
          reason: saveErrorMessage,
          message: e?.message,
          name: e?.name,
          playlistId: playlist?.id || null,
          editingTrackId,
          pickedAudioName: newTrackAudioFile?.name || null,
          unexpected: true,
        });
      }

      setAlert({
        type: isUploadFeedback || newTrackAudioFile ? "warning" : "error",
        title: COPYRIGHT_MATCH_PATTERN.test(saveErrorMessage)
          ? "Copyright Match Found"
          : isUploadFeedback || newTrackAudioFile
            ? "Upload Feedback"
            : "Error",
        message: displayMessage || "We could not save this track.",
        forceModal: Boolean(newTrackAudioFile),
      });
    } finally {
      logAddTrackModal("save_finished");
      setAddingTrack(false);
    }
  };

  const handlePickTrackAudio = useCallback(async () => {
    try {
      console.log("[PlaylistDetails][AddTrackModal] audio_picker_open", {
        playlistId: playlist?.id || null,
        editingTrackId,
      });

      const audioFile = await pickPlaylistAudioFile();
      if (!audioFile) {
        console.log("[PlaylistDetails][AddTrackModal] audio_picker_cancelled", {
          playlistId: playlist?.id || null,
          editingTrackId,
        });
        return;
      }

      console.log("[PlaylistDetails][AddTrackModal] audio_picker_selected", {
        playlistId: playlist?.id || null,
        editingTrackId,
        name: audioFile.name,
        mimeType: audioFile.mimeType,
        sizeBytes: audioFile.sizeBytes,
        durationSeconds: audioFile.durationSeconds,
        extension: audioFile.extension,
      });

      setNewTrackAudioFile(audioFile);
      setNewTrackAudioUrl("");
      setNewTrackDurationSeconds(String(audioFile.durationSeconds));
    } catch (error: any) {
      const pickerErrorMessage = error?.message || String(error);
      const isUploadFeedback = isExpectedUploadFeedback(pickerErrorMessage);
      const displayMessage = isUploadFeedback
        ? formatUploadFeedbackMessage(pickerErrorMessage)
        : pickerErrorMessage;

      if (isUploadFeedback) {
        logAddTrackModal("audio_picker_feedback", {
          reason: displayMessage,
          feedbackKind: COPYRIGHT_MATCH_PATTERN.test(pickerErrorMessage) ? "copyright_match" : "upload_rejected",
        });
      } else {
        logAddTrackModal("audio_picker_failed", {
          message: error?.message,
          name: error?.name,
          unexpected: true,
        });
      }

      setAlert({
        type: "warning",
        title: "Upload Feedback",
        message: displayMessage || "Only MP3 audio files up to 5 minutes are allowed.",
        forceModal: true,
      });
    }
  }, [editingTrackId, logAddTrackModal, playlist?.id]);

  const openReportModal = () => {
    if (!playlist?.id) {
      setAlert({ type: "error", title: "Unable to Report", message: "Playlist details are missing." });
      return;
    }

    setShowReportModal(true);
  };

  const submitPlaylistReport = async (reason: string, details?: string) => {
    if (!userId || isGuest) {
      throw new Error("You need to sign in to report music.");
    }

    if (!playlist?.id) {
      throw new Error("Playlist details are missing.");
    }

    const body = {
      action: "report",
      type: "playlist",
      id: playlist.id,
      userId,
      reason,
      details: details || null,
    };

    const { data, error } = await supabase.functions.invoke("manage-details", { body });

    if (error) {
      console.error("manage-details report failed", {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        context: (error as any).context,
        body,
      });
      throw new Error(error.message || "Failed to submit report.");
    }

    if (data && !Array.isArray(data) && data.already_reported) {
      throw new Error("You already have a pending report for this music release.");
    }
  };

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
  const isEditingTrack = editingTrackId !== null;
  const canReportPlaylist = !isOwner && !!userId && !isGuest;
  const reportHeaderAction = canReportPlaylist ? (
    <TouchableOpacity
      activeOpacity={1}
      onPress={openReportModal}
      hitSlop={8}
      style={[
        styles.headerReportBtn,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Ionicons name="flag-outline" size={20} color="#EF4444" />
    </TouchableOpacity>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={playlist.title} onBackPress={() => router.back()} rightComponent={reportHeaderAction} />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: contentBottomPadding }}>
        {/* Cover */}
        {resolvedCoverUrl ? (
          <CachedImage uri={resolvedCoverUrl } style={styles.cover} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="disc" size={56} color={colors.primary} />
          </View>
        )}

        {/* Meta */}
        <View style={styles.metaSection}>
          <Text style={[styles.title, { color: colors.text }]}>{playlist.title}</Text>
          <Text style={[styles.creator, { color: colors.textSecondary }]}>
            by {playlist.creator_name || "Unknown"} - {items.length} tracks
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
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.playBtn, { backgroundColor: colors.primary }]}
          onPress={() => void handlePlayTeaser()}
          disabled={previewLoading}
        >
          {previewLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name={previewPlaying ? "pause" : "play"} size={22} color="#fff" />
          )}
          <Text style={styles.playBtnText}>{previewLoading ? "Loading..." : previewPlaying ? "Pause Teaser" : "Play Teaser"}</Text>
        </TouchableOpacity>

        {/* Tracks */}
        <View style={styles.section}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Tracks</Text>
            {isOwner && (
              <TouchableOpacity activeOpacity={1} hitSlop={8} onPress={() => setAddTrackVisible(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
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
                {item.external_link?.url ? (
                  <TouchableOpacity
                    activeOpacity={1}
                    hitSlop={8}
                    onPress={() => void handleOpenExternalLink(item.external_link, item.id)}
                    style={{ marginLeft: 10 }}
                  >
                    <Ionicons name="open-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                ) : null}
                {isOwner && (
                  <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 10, gap: 10 }}>
                    <TouchableOpacity activeOpacity={1} hitSlop={8} onPress={() => openEditTrackModal(item)}>
                      <Ionicons name="create-outline" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={1} hitSlop={8} onPress={() => handleRemoveItem(item.id)}>
                      <Ionicons name="remove-circle-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
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
                <TouchableOpacity
                  key={asset.id}
                  activeOpacity={1}
                  disabled={asset.asset_type === "cover_art"}
                  onPress={() => void handlePlayTeaser(asset)}
                  style={[styles.assetCard, { borderColor: colors.border }]}
                >
                  {asset.asset_type === "cover_art" && asset.storage_path ? (
                    <CachedImage uri={resolveRadioMediaUrl(`${PLAYLIST_ASSET_BUCKET}/${asset.storage_path}`)} style={styles.assetImage} />
                  ) : asset.asset_type === "cover_art" && asset.url ? (
                    <CachedImage uri={asset.url } style={styles.assetImage} />
                  ) : (
                    <View style={[styles.assetImage, { backgroundColor: colors.primary + "10", alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name={asset.asset_type === "track_preview" || asset.asset_type === "teaser_clip" ? "play-circle" : "image-outline"} size={24} color={colors.primary} />
                    </View>
                  )}
                  <Text style={[styles.assetLabel, { color: colors.textSecondary }]}>{asset.label || asset.asset_type}</Text>
                </TouchableOpacity>
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
                  onPress={() => void handleOpenExternalLink(link)}
                  style={[styles.linkChip, { borderColor: colors.border }]}
                >
                  <Ionicons name="link" size={14} color={colors.primary} />
                  <Text style={[styles.linkText, { color: colors.primary }]}>{link.label || link.platform}</Text>
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

      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitPlaylistReport}
        targetName={playlist.title}
        title="Report Music"
        reportType="music"
      />

      {alert && (
        <CustomAlert
          visible
          type={alert.type}
          title={alert.title}
          message={alert.message}
          forceModal={alert.forceModal}
          onClose={() => setAlert(null)}
        />
      )}

      {/* Add Track Modal */}
      <Modal visible={addTrackVisible} transparent animationType="slide" onRequestClose={resetAddTrackForm}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card || colors.background, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{isEditingTrack ? "Edit Track" : "Add Track"}</Text>

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

            <TouchableOpacity
              activeOpacity={1}
              style={[styles.uploadAudioBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={() => void handlePickTrackAudio()}
              disabled={addingTrack}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
              <Text style={[styles.uploadAudioBtnText, { color: colors.primary }]}>Upload MP3</Text>
            </TouchableOpacity>
            <Text style={[styles.audioHelperText, { color: colors.textSecondary }]}>Uploaded MP3 files must be 5 minutes or less.</Text>

            {newTrackAudioFile ? (
              <View style={[styles.audioFileChip, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "30" }]}>
                <Ionicons name="musical-note" size={14} color={colors.primary} />
                <Text style={[styles.audioFileChipText, { color: colors.text }]} numberOfLines={1}>
                  {newTrackAudioFile.name}
                </Text>
                <TouchableOpacity activeOpacity={1} onPress={() => setNewTrackAudioFile(null)}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                activeOpacity={1}
                style={[styles.modalBtn, { backgroundColor: colors.border, flex: 1 }]}
                onPress={resetAddTrackForm}
                disabled={addingTrack}
              >
                <Text style={{ color: colors.text, fontWeight: "600", fontSize: moderateScale(14) }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={1}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleSaveTrack}
                disabled={addingTrack}
              >
                {addingTrack ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: moderateScale(14) }}>{isEditingTrack ? "Save" : "Add"}</Text>}
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
  headerReportBtn: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
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
