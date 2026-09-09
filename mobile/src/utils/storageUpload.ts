import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase";

type UploadBody = ArrayBuffer | Blob | Uint8Array;

type UploadFileAsset = {
  uri: string;
  name?: string | null;
  [key: string]: unknown;
};

export type TemporaryUploadFile = {
  uri: string;
  remove: () => Promise<void>;
};

type UploadStorageObjectInput = {
  bucket: string;
  path: string;
  contentType: string;
  upsert?: boolean;
  uri?: string;
  body?: UploadBody;
};

const encodeStoragePath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const NATIVE_UPLOAD_DIRECTORY = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}musika-uploads/`
  : null;
const PENDING_UPLOAD_DIRECTORY = NATIVE_UPLOAD_DIRECTORY
  ? `${NATIVE_UPLOAD_DIRECTORY}pending/`
  : null;
const WORKING_UPLOAD_DIRECTORY = NATIVE_UPLOAD_DIRECTORY
  ? `${NATIVE_UPLOAD_DIRECTORY}working/`
  : null;
const STALE_PENDING_UPLOAD_AGE_SECONDS = 24 * 60 * 60;
const FILE_READ_RETRY_DELAY_MS = 75;
const FILE_READ_ATTEMPTS = 3;

// Expo Go 56+ isolates FileSystem paths per experience, but Android's
// DocumentPicker cache URI can still point at the host-level cache. Keeping the
// provider URI lets us copy it directly into the experience-owned directory.
// iOS keeps the picker copy so security-scoped Files/iCloud URLs remain usable.
export const DOCUMENT_PICKER_COPY_TO_CACHE_DIRECTORY = Platform.OS !== "android";

const createLocalUploadUri = (directory: string, fileName?: string | null) => {
  const safeName = sanitizeStorageFileName(fileName || "upload", "upload");
  const nonce = Math.random().toString(36).slice(2, 10);
  return `${directory}${Date.now()}_${nonce}_${safeName}`;
};

const isAppOwnedUploadUri = (uri: string) =>
  Boolean(NATIVE_UPLOAD_DIRECTORY && uri.startsWith(NATIVE_UPLOAD_DIRECTORY));

const assertReadableFile = async (uri: string) => {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) {
    throw new Error("The selected file is no longer available. Please select it again.");
  }
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const removeLocalFile = async (uri?: string | null) => {
  if (!uri) return;

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Cleanup must never hide the upload result.
  }
};

const removeStalePendingUploads = async () => {
  if (!PENDING_UPLOAD_DIRECTORY) return;

  try {
    const files = await FileSystem.readDirectoryAsync(PENDING_UPLOAD_DIRECTORY);
    const cutoff = Date.now() / 1000 - STALE_PENDING_UPLOAD_AGE_SECONDS;

    await Promise.all(
      files.map(async (fileName) => {
        const uri = `${PENDING_UPLOAD_DIRECTORY}${fileName}`;
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && typeof info.modificationTime === "number" && info.modificationTime < cutoff) {
          await removeLocalFile(uri);
        }
      }),
    );
  } catch {
    // The directory does not exist on the first run, or cleanup is unavailable.
  }
};

const parseStorageUploadError = (status: number, body?: string) => {
  let message = `Storage upload failed with status ${status}.`;

  try {
    const parsed = JSON.parse(body || "{}");
    message = parsed?.message || parsed?.error || message;
  } catch {
    if (body) {
      message = body;
    }
  }

  return new Error(message);
};

export const sanitizeStorageFileName = (name: string, fallback = "upload") => {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || fallback;
};

/**
 * Android DocumentPicker callers intentionally keep `copyToCacheDirectory`
 * disabled. In Expo Go, the picker cache can resolve outside the experience's
 * FileSystem scope and be rejected as unreadable. Copy the granted content URI
 * immediately into app-owned storage instead.
 */
export const persistUploadAsset = async <T extends UploadFileAsset>(asset: T): Promise<T> => {
  if (Platform.OS === "web" || !PENDING_UPLOAD_DIRECTORY) {
    return asset;
  }

  if (asset.uri.startsWith(PENDING_UPLOAD_DIRECTORY)) {
    await assertReadableFile(asset.uri);
    return asset;
  }

  await FileSystem.makeDirectoryAsync(PENDING_UPLOAD_DIRECTORY, { intermediates: true });
  await removeStalePendingUploads();

  const persistedUri = createLocalUploadUri(PENDING_UPLOAD_DIRECTORY, asset.name);
  try {
    // Do not probe the picker URI with File.exists first. Android content
    // providers can return false for a valid URI even though copyAsync can
    // consume the one-time read grant successfully.
    await FileSystem.copyAsync({ from: asset.uri, to: persistedUri });
    await assertReadableFile(persistedUri);
  } catch (error) {
    await removeLocalFile(persistedUri);
    throw error;
  }

  return { ...asset, uri: persistedUri };
};

export const removePersistedUploadAsset = async (asset?: Pick<UploadFileAsset, "uri"> | null) => {
  if (!asset?.uri || !PENDING_UPLOAD_DIRECTORY || !asset.uri.startsWith(PENDING_UPLOAD_DIRECTORY)) {
    return;
  }

  await removeLocalFile(asset.uri);
};

/**
 * Move a short-lived picker/generated file into app-owned storage for the
 * duration of a native media operation. Some Android/Expo cache providers
 * expose file:// URIs that native upload/read methods cannot open reliably.
 */
export const createTemporaryUploadFile = async (
  uri: string,
  fileName?: string | null,
): Promise<TemporaryUploadFile> => {
  if (Platform.OS === "web" || !WORKING_UPLOAD_DIRECTORY) {
    return { uri, remove: async () => undefined };
  }

  if (isAppOwnedUploadUri(uri)) {
    await assertReadableFile(uri);
    return { uri, remove: async () => undefined };
  }

  await FileSystem.makeDirectoryAsync(WORKING_UPLOAD_DIRECTORY, { intermediates: true });
  const temporaryUri = createLocalUploadUri(WORKING_UPLOAD_DIRECTORY, fileName);
  try {
    await FileSystem.copyAsync({ from: uri, to: temporaryUri });
    await assertReadableFile(temporaryUri);
  } catch (error) {
    await removeLocalFile(temporaryUri);
    throw error;
  }

  return {
    uri: temporaryUri,
    remove: () => removeLocalFile(temporaryUri),
  };
};

export const readLocalFileAsBase64 = async (uri: string, fileName?: string | null) => {
  let temporaryFile: TemporaryUploadFile;
  try {
    temporaryFile = await createTemporaryUploadFile(uri, fileName);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("The selected file could not be read. Please select it again.");
  }

  let lastReadError: unknown;
  try {
    for (let attempt = 0; attempt < FILE_READ_ATTEMPTS; attempt += 1) {
      try {
        return await FileSystem.readAsStringAsync(temporaryFile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (error) {
        lastReadError = error;
        if (attempt < FILE_READ_ATTEMPTS - 1) {
          await delay(FILE_READ_RETRY_DELAY_MS);
        }
      }
    }

    throw lastReadError instanceof Error
      ? lastReadError
      : new Error("The selected file could not be read. Please select it again.");
  } finally {
    await temporaryFile.remove();
  }
};

export const uploadStorageObject = async ({
  bucket,
  path,
  contentType,
  upsert = false,
  uri,
  body,
}: UploadStorageObjectInput) => {
  if (Platform.OS !== "web" && uri) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Your session expired. Please log in again before uploading.");
    }

    let temporaryFile: TemporaryUploadFile | null = null;

    try {
      // Android's DocumentPicker cache can be readable to FileSystem.copyAsync
      // but rejected by uploadAsync. Uploading an app-owned copy avoids that
      // provider/cache permission edge case.
      temporaryFile = await createTemporaryUploadFile(uri, path.split("/").pop());
      await assertReadableFile(temporaryFile.uri);

      const baseUrl = supabaseUrl.replace(/\/+$/, "");
      const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
      const result = await FileSystem.uploadAsync(uploadUrl, temporaryFile.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: supabaseAnonKey,
          "Content-Type": contentType,
          "x-upsert": String(upsert),
        },
      });

      if (result.status < 200 || result.status >= 300) {
        throw parseStorageUploadError(result.status, result.body);
      }

      return {
        data: { path },
        error: null,
      };
    } finally {
      await temporaryFile?.remove();
    }
  }

  const uploadBody = body || (uri ? await fetch(uri).then((response) => response.arrayBuffer()) : null);

  if (!uploadBody) {
    throw new Error("No upload body was provided.");
  }

  return supabase.storage.from(bucket).upload(path, uploadBody, {
    contentType,
    upsert,
  });
};
