import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/src/legacy";
import { supabase } from "../../lib/supabase";
import { ensureUploadPassesSafetyScreening } from "../services/uploadSafetyScreen";

export const MAX_PLAYLIST_AUDIO_DURATION_SECONDS = 300;

const PLAYLIST_AUDIO_BUCKET = "documents";
const ACR_CLOUD_AUDIO_SAMPLE_BYTES = 4 * 1024 * 1024;
const PLAYLIST_AUDIO_LOG_PREFIX = "[PlaylistAudio][MP3]";
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3"]);
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
]);
const EXPECTED_UPLOAD_FEEDBACK_PATTERN =
  /(blocked by safety screening|safety check|copyright check|appears to match|appears to be copyrighted|ownership request|identity review|admin approval|permission to share|please upload music you own|licensed to share|playlist tracks must be|tracks must be|only mp3)/i;

export type PlaylistAudioFile = {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number;
  extension: string;
  debugTraceId?: string;
};

type PlaylistAudioLogMeta = Record<string, unknown>;

const createPlaylistAudioTraceId = () =>
  `mp3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatBytesForLog = (bytes: number | null | undefined) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const summarizeUriForLog = (uri: string) => {
  const scheme = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1] || "unknown";
  const parts = uri.split(/[\\/]/).filter(Boolean);
  const tail = parts.slice(-2).join("/");

  return {
    scheme,
    tail: tail ? tail.slice(-96) : "",
  };
};

const logPlaylistAudio = (
  event: string,
  traceId: string | undefined,
  meta: PlaylistAudioLogMeta = {},
) => {
  console.log(PLAYLIST_AUDIO_LOG_PREFIX, event, {
    traceId: traceId || "no-trace",
    ...meta,
  });
};

const logPlaylistAudioError = (
  event: string,
  traceId: string | undefined,
  error: unknown,
  meta: PlaylistAudioLogMeta = {},
) => {
  const err = error as any;
  const message = err?.message || String(error);
  const expectedFeedback = EXPECTED_UPLOAD_FEEDBACK_PATTERN.test(message);
  const log = expectedFeedback
    ? (...args: Parameters<typeof console.warn>) => console.warn(...args)
    : (...args: Parameters<typeof console.error>) => console.error(...args);

  log(PLAYLIST_AUDIO_LOG_PREFIX, event, {
    traceId: traceId || "no-trace",
    message,
    name: err?.name || null,
    status: err?.status || null,
    code: err?.code || null,
    details: err?.details || null,
    expectedFeedback,
    ...meta,
  });
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
  if (ALLOWED_AUDIO_MIME_TYPES.has(normalizedMime)) {
    return normalizedMime;
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

const buildAudioSafetyDataUrl = (base64: string, mimeType: string) => {
  const maxBase64Chars = Math.floor(ACR_CLOUD_AUDIO_SAMPLE_BYTES / 3) * 4;
  const sampleBase64 = base64.length > maxBase64Chars
    ? base64.slice(0, maxBase64Chars)
    : base64;

  return `data:${mimeType};base64,${sampleBase64}`;
};

export const isSupportedPlaylistAudioFile = (name: string, mimeType?: string | null) => {
  const extension = getFileExtension(name);
  const normalizedMime = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";

  if (extension && !ALLOWED_AUDIO_EXTENSIONS.has(extension)) {
    return false;
  }

  if (
    normalizedMime &&
    !ALLOWED_AUDIO_MIME_TYPES.has(normalizedMime) &&
    (normalizedMime.startsWith("audio/") || normalizedMime.startsWith("video/") || normalizedMime.includes("mp4"))
  ) {
    return false;
  }

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
  } catch {
    return false;
  }
};

export const probePlaylistAudioDuration = async (
  uri: string,
  traceId = createPlaylistAudioTraceId(),
) => {
  let sound: Audio.Sound | null = null;
  const startedAt = Date.now();

  logPlaylistAudio("duration_probe_start", traceId, {
    uri: summarizeUriForLog(uri),
  });

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

    const durationSeconds = ensurePlaylistAudioDuration(durationMillis / 1000);
    logPlaylistAudio("duration_probe_done", traceId, {
      durationMillis,
      durationSeconds,
      elapsedMs: Date.now() - startedAt,
    });

    return durationSeconds;
  } catch (error) {
    logPlaylistAudioError("duration_probe_failed", traceId, error, {
      elapsedMs: Date.now() - startedAt,
    });
    throw error;
  } finally {
    if (sound) {
      try {
        await sound.unloadAsync();
        logPlaylistAudio("duration_probe_unloaded", traceId, {
          elapsedMs: Date.now() - startedAt,
        });
      } catch {
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
  } catch {
    if (typeof fallbackDurationSeconds === "number" && Number.isFinite(fallbackDurationSeconds) && fallbackDurationSeconds > 0) {
      return ensurePlaylistAudioDuration(fallbackDurationSeconds);
    }

    throw new Error("We could not verify the length of that URL. Use a direct MP3 link or provide a valid duration up to 5 minutes.");
  }
};

export const pickPlaylistAudioFile = async (): Promise<PlaylistAudioFile | null> => {
  const traceId = createPlaylistAudioTraceId();
  const startedAt = Date.now();

  logPlaylistAudio("picker_open", traceId, {
    acceptedTypes: ["audio/mpeg", "audio/mp3"],
  });

  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["audio/mpeg", "audio/mp3"],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    logPlaylistAudio("picker_cancelled", traceId, {
      elapsedMs: Date.now() - startedAt,
    });
    return null;
  }

  const asset = result.assets[0];
  const fileName = asset.name || `track.${getFileExtension(asset.uri) || "mp3"}`;
  const pickerMimeType = typeof asset.mimeType === "string" ? asset.mimeType : null;
  const extension = getFileExtension(fileName) || getFileExtension(asset.uri) || "mp3";

  logPlaylistAudio("picker_selected", traceId, {
    name: fileName,
    pickerMimeType,
    inferredExtension: extension,
    sizeBytes: typeof asset.size === "number" ? asset.size : null,
    sizeLabel: formatBytesForLog(typeof asset.size === "number" ? asset.size : null),
    uri: summarizeUriForLog(asset.uri),
    elapsedMs: Date.now() - startedAt,
  });

  if (!isSupportedPlaylistAudioFile(fileName, pickerMimeType)) {
    logPlaylistAudio("picker_rejected_unsupported_type", traceId, {
      name: fileName,
      pickerMimeType,
      extension,
    });
    throw new Error("Only MP3 audio files are allowed for playlist tracks.");
  }

  const mimeType = inferMimeType(fileName, pickerMimeType);
  const durationSeconds = await probePlaylistAudioDuration(asset.uri, traceId);

  logPlaylistAudio("picker_ready", traceId, {
    name: fileName,
    mimeType,
    durationSeconds,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    name: fileName,
    uri: asset.uri,
    mimeType,
    sizeBytes: typeof asset.size === "number" ? asset.size : null,
    durationSeconds,
    extension,
    debugTraceId: traceId,
  };
};

export const ensurePlaylistAudioPassesCopyrightScreening = async (
  audioFile: PlaylistAudioFile,
) => {
  const traceId = audioFile.debugTraceId || createPlaylistAudioTraceId();
  const startedAt = Date.now();

  logPlaylistAudio("copyright_screen_start", traceId, {
    name: audioFile.name,
    mimeType: audioFile.mimeType,
    extension: audioFile.extension,
    sizeBytes: audioFile.sizeBytes,
    sizeLabel: formatBytesForLog(audioFile.sizeBytes),
    durationSeconds: audioFile.durationSeconds,
    uri: summarizeUriForLog(audioFile.uri),
  });

  logPlaylistAudio("base64_read_start", traceId, {
    name: audioFile.name,
    sizeBytes: audioFile.sizeBytes,
    sizeLabel: formatBytesForLog(audioFile.sizeBytes),
  });

  let base64 = "";
  try {
    base64 = await FileSystem.readAsStringAsync(audioFile.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    logPlaylistAudioError("base64_read_failed", traceId, error, {
      elapsedMs: Date.now() - startedAt,
    });
    throw error;
  }
  const base64ReadMs = Date.now() - startedAt;
  const estimatedDecodedBytes = Math.floor((base64.replace(/=+$/, "").length * 3) / 4);
  const safetyDataUrl = buildAudioSafetyDataUrl(base64, audioFile.mimeType);
  const safetyBase64Length = safetyDataUrl.split(",")[1]?.length || 0;
  const safetySampleBytes = Math.min(ACR_CLOUD_AUDIO_SAMPLE_BYTES, estimatedDecodedBytes);

  logPlaylistAudio("base64_read_done", traceId, {
    base64Length: base64.length,
    estimatedDecodedBytes,
    estimatedDecodedSizeLabel: formatBytesForLog(estimatedDecodedBytes),
    elapsedMs: base64ReadMs,
  });

  logPlaylistAudio("copyright_screen_invoke_start", traceId, {
    context: "playlist_audio_upload",
    safetySampleBytes,
    safetySampleSizeLabel: formatBytesForLog(safetySampleBytes),
    safetyBase64Length,
    truncatedForScreening: estimatedDecodedBytes > ACR_CLOUD_AUDIO_SAMPLE_BYTES,
  });

  try {
    await ensureUploadPassesSafetyScreening(
      {
        name: audioFile.name,
        mimeType: audioFile.mimeType,
        size: audioFile.sizeBytes || undefined,
        uri: audioFile.uri,
        kind: "audio",
        contentDataUrl: safetyDataUrl,
      },
      "playlist_audio_upload",
    );
  } catch (error) {
    logPlaylistAudioError("copyright_screen_failed", traceId, error, {
      elapsedMs: Date.now() - startedAt,
      base64ReadMs,
    });
    throw error;
  }

  logPlaylistAudio("copyright_screen_done", traceId, {
    elapsedMs: Date.now() - startedAt,
    base64ReadMs,
  });

  return base64;
};

export const uploadPlaylistAudioFile = async (
  audioFile: PlaylistAudioFile,
  playlistId: string,
) => {
  const traceId = audioFile.debugTraceId || createPlaylistAudioTraceId();
  const startedAt = Date.now();

  logPlaylistAudio("upload_start", traceId, {
    playlistId,
    name: audioFile.name,
    mimeType: audioFile.mimeType,
    sizeBytes: audioFile.sizeBytes,
    sizeLabel: formatBytesForLog(audioFile.sizeBytes),
    durationSeconds: audioFile.durationSeconds,
    uri: summarizeUriForLog(audioFile.uri),
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    logPlaylistAudio("upload_blocked_no_session", traceId, {
      elapsedMs: Date.now() - startedAt,
    });
    throw new Error("Your session expired. Please log in again.");
  }

  logPlaylistAudio("upload_session_ready", traceId, {
    userId: session.user.id,
    elapsedMs: Date.now() - startedAt,
  });

  const base64 = await ensurePlaylistAudioPassesCopyrightScreening(audioFile);
  const convertStartedAt = Date.now();

  logPlaylistAudio("base64_to_bytes_start", traceId, {
    base64Length: base64.length,
    elapsedMs: Date.now() - startedAt,
  });

  const bytes = base64ToUint8Array(base64);

  logPlaylistAudio("base64_to_bytes_done", traceId, {
    byteLength: bytes.byteLength,
    sizeLabel: formatBytesForLog(bytes.byteLength),
    convertMs: Date.now() - convertStartedAt,
    elapsedMs: Date.now() - startedAt,
  });

  const safeFileName = sanitizeFileName(audioFile.name, audioFile.extension);
  const storagePath = `playlist-audio/${session.user.id}/${playlistId}/${Date.now()}_${safeFileName}`;

  logPlaylistAudio("storage_upload_start", traceId, {
    bucket: PLAYLIST_AUDIO_BUCKET,
    storagePath,
    contentType: audioFile.mimeType,
    byteLength: bytes.byteLength,
    sizeLabel: formatBytesForLog(bytes.byteLength),
  });

  const storageStartedAt = Date.now();
  const { error } = await supabase.storage
    .from(PLAYLIST_AUDIO_BUCKET)
    .upload(storagePath, bytes, {
      contentType: audioFile.mimeType,
      upsert: false,
    });

  if (error) {
    logPlaylistAudioError("storage_upload_failed", traceId, error, {
      bucket: PLAYLIST_AUDIO_BUCKET,
      storagePath,
      storageMs: Date.now() - storageStartedAt,
      elapsedMs: Date.now() - startedAt,
    });
    throw new Error(error.message || "Failed to upload the audio file.");
  }

  logPlaylistAudio("storage_upload_done", traceId, {
    bucket: PLAYLIST_AUDIO_BUCKET,
    storagePath,
    storageMs: Date.now() - storageStartedAt,
    elapsedMs: Date.now() - startedAt,
  });

  logPlaylistAudio("public_url_resolve_start", traceId, {
    bucket: PLAYLIST_AUDIO_BUCKET,
    storagePath,
  });

  const {
    data: { publicUrl },
  } = supabase.storage.from(PLAYLIST_AUDIO_BUCKET).getPublicUrl(storagePath);

  if (!publicUrl) {
    logPlaylistAudio("public_url_resolve_failed", traceId, {
      bucket: PLAYLIST_AUDIO_BUCKET,
      storagePath,
      elapsedMs: Date.now() - startedAt,
    });
    throw new Error("Failed to resolve the uploaded audio URL.");
  }

  logPlaylistAudio("upload_done", traceId, {
    bucket: PLAYLIST_AUDIO_BUCKET,
    storagePath,
    hasPublicUrl: true,
    durationSeconds: audioFile.durationSeconds,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    publicUrl,
    durationSeconds: audioFile.durationSeconds,
    storagePath,
  };
};
