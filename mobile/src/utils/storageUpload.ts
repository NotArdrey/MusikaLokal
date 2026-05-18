import * as FileSystem from "expo-file-system/src/legacy";
import { Platform } from "react-native";
import { supabase, supabaseAnonKey, supabaseUrl } from "../../lib/supabase";

type UploadBody = ArrayBuffer | Blob | Uint8Array;

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

    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
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
