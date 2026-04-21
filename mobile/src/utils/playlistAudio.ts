import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";

export const MAX_PLAYLIST_AUDIO_DURATION_SECONDS = 300;

const PLAYLIST_AUDIO_BUCKET = "documents";
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3", "mp4", "m4a"]);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "video/mp4",
  "application/mp4",
]);

export type PlaylistAudioFile = {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number;
  extension: string;
};

const getFileExtension = (value: string) => {
  const normalized = String(value || "").split(/[?#]/)[0];
  const extension = normalized.split(".").pop()?.trim().toLowerCase() || "";
  return extension;
};

const sanitizeFileName = (fileName: string, fallbackExtension: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const extension = getFileExtension(fileName) || fallbackExtension || "mp3";
  return `${baseName || "track"}.${extension}`;
};

const inferMimeType = (name: string, mimeType?: string | null) => {
  const normalizedMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (normalizedMime) {
    return normalizedMime;
  }

  const extension = getFileExtension(name);
  if (extension === "mp4" || extension === "m4a") {
    return "audio/mp4";
  }

  return "audio/mpeg";
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let index = 0; index < chars.length; index += 1) {
    lookup[chars.charCodeAt(index)] = index;
  }

  const normalizedBase64 = base64.replace(/=/g, "");
  const bytes = new Uint8Array(Math.floor(normalizedBase64.length * 0.75));
  let pointer = 0;

  for (let index = 0; index < normalizedBase64.length; index += 4) {
    const e1 = lookup[normalizedBase64.charCodeAt(index)];
    const e2 = lookup[normalizedBase64.charCodeAt(index + 1)];
    const e3 = lookup[normalizedBase64.charCodeAt(index + 2)];
    const e4 = lookup[normalizedBase64.charCodeAt(index + 3)];

    bytes[pointer++] = (e1 << 2) | (e2 >> 4);
    if (!Number.isNaN(e3)) {
      bytes[pointer++] = ((e2 & 15) << 4) | (e3 >> 2);
    }
    if (!Number.isNaN(e4)) {
      bytes[pointer++] = ((e3 & 3) << 6) | e4;
    }
  }

  return bytes;
};

export const isSupportedPlaylistAudioFile = (name: string, mimeType?: string | null) => {
  const extension = getFileExtension(name);
  const normalizedMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";

  return ALLOWED_AUDIO_EXTENSIONS.has(extension) || ALLOWED_AUDIO_MIME_TYPES.has(normalizedMime);
};

export const ensurePlaylistAudioDuration = (durationSeconds: number) => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("We could not read the track duration.");
  }

  const roundedDuration = Math.round(durationSeconds);
  if (roundedDuration > MAX_PLAYLIST_AUDIO_DURATION_SECONDS) {
    throw new Error("Playlist tracks must be 5 minutes or less.");
  }

  return roundedDuration;
};

export const isValidPlaylistAudioUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
};

export const probePlaylistAudioDuration = async (uri: string) => {
  let sound: Audio.Sound | null = null;

  try {
    const created = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, progressUpdateIntervalMillis: 0 },
    );

    sound = created.sound;
    const durationMillis = created.status.isLoaded ? created.status.durationMillis ?? null : null;

    if (!durationMillis) {
      throw new Error("We could not read the track duration.");
    }

    return ensurePlaylistAudioDuration(durationMillis / 1000);
  } finally {
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch (_) {
        // Ignore cleanup failures for validation-only probes.
      }
    }
  }
};

export const resolvePlaylistAudioUrlDuration = async (
  audioUrl: string,
  fallbackDurationSeconds?: number | null,
) => {
  const trimmedUrl = audioUrl.trim();
  if (!trimmedUrl) {
    throw new Error("Please provide an audio URL.");
  }

  if (!isValidPlaylistAudioUrl(trimmedUrl)) {
    throw new Error("Audio URL must start with http:// or https://.");
  }

  try {
    return await probePlaylistAudioDuration(trimmedUrl);
  } catch (_) {
    if (typeof fallbackDurationSeconds === "number" && Number.isFinite(fallbackDurationSeconds) && fallbackDurationSeconds > 0) {
      return ensurePlaylistAudioDuration(fallbackDurationSeconds);
    }

    throw new Error("We could not verify the length of that URL. Use a direct MP3/MP4 link or provide a valid duration up to 5 minutes.");
  }
};

export const pickPlaylistAudioFile = async (): Promise<PlaylistAudioFile | null> => {
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["audio/*", "video/mp4"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  const fileName = asset.name || `track.${getFileExtension(asset.uri) || "mp3"}`;
  const mimeType = inferMimeType(fileName, typeof asset.mimeType === "string" ? asset.mimeType : null);

  if (!isSupportedPlaylistAudioFile(fileName, mimeType)) {
    throw new Error("Only MP3 or MP4 audio files are allowed for playlist tracks.");
  }

  const durationSeconds = await probePlaylistAudioDuration(asset.uri);

  return {
    name: fileName,
    uri: asset.uri,
    mimeType,
    sizeBytes: typeof asset.size === "number" ? asset.size : null,
    durationSeconds,
    extension: getFileExtension(fileName) || getFileExtension(asset.uri) || "mp3",
  };
};

export const uploadPlaylistAudioFile = async (
  audioFile: PlaylistAudioFile,
  playlistId: string,
) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    throw new Error("Your session expired. Please log in again.");
  }

  const base64 = await FileSystem.readAsStringAsync(audioFile.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToUint8Array(base64);

  const safeFileName = sanitizeFileName(audioFile.name, audioFile.extension);
  const storagePath = `playlist-audio/${session.user.id}/${playlistId}/${Date.now()}_${safeFileName}`;

  const { error } = await supabase.storage
    .from(PLAYLIST_AUDIO_BUCKET)
    .upload(storagePath, bytes, {
      contentType: audioFile.mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message || "Failed to upload the audio file.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(PLAYLIST_AUDIO_BUCKET).getPublicUrl(storagePath);

  if (!publicUrl) {
    throw new Error("Failed to resolve the uploaded audio URL.");
  }

  return {
    publicUrl,
    durationSeconds: audioFile.durationSeconds,
    storagePath,
  };
};