// @ts-nocheck

export const MUSICIAN_VIDEO_BUCKET = "musician-verification-videos";
export const MUSICIAN_VIDEO_REVIEW_SOURCE = "MUSICIAN_VIDEO";
export const MUSICIAN_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const MUSICIAN_VIDEO_PORTFOLIO_BUCKET = "portfolio";
export const MUSICIAN_VIDEO_ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
];

const allowedMimeTypes = new Set(MUSICIAN_VIDEO_ALLOWED_MIME_TYPES);

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeMimeType(value: unknown) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "video/mov") return "video/quicktime";
  return normalized;
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value));
}

function getPathParts(path: string) {
  const normalized = normalizeText(path).replace(/^\/+/, "");
  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex < 0) {
    return { directory: "", baseName: normalized };
  }

  return {
    directory: normalized.slice(0, lastSlashIndex),
    baseName: normalized.slice(lastSlashIndex + 1),
  };
}

function resolveVideoExtension(mimeType: string, originalName: string) {
  const extensionFromName = normalizeText(originalName).split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  if (extensionFromName === "mov" || extensionFromName === "quicktime") return "mov";
  if (["mp4", "webm", "m4v"].includes(extensionFromName)) return extensionFromName;

  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-m4v": "m4v",
  };
  return map[mimeType] || "mp4";
}

function resolvePortfolioVideoExtension(mimeType: string, originalName: string, objectPath: string) {
  return resolveVideoExtension(mimeType, originalName || objectPath);
}

function validateVideoMetadata({ mimeType, sizeBytes }: { mimeType: string; sizeBytes: number }) {
  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error("Please upload an MP4, MOV, M4V, or WebM music video.");
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MUSICIAN_VIDEO_MAX_BYTES) {
    throw new Error("Music video must be 50MB or smaller.");
  }
}

async function storageObjectExists(client: any, bucketName: string, objectPath: string) {
  const { directory, baseName } = getPathParts(objectPath);
  if (!baseName) return false;

  const { data, error } = await client.storage
    .from(bucketName)
    .list(directory, { limit: 10, search: baseName });

  if (error) {
    throw new Error(`Unable to verify uploaded music video: ${error.message}`);
  }

  return (data || []).some((item: any) => String(item?.name || "") === baseName);
}

export async function createMusicianVideoUploadSlot(
  client: any,
  {
    emailHash = null,
    originalName,
    mimeType,
    sizeBytes,
  }: Record<string, unknown>,
) {
  const uploadId = crypto.randomUUID();
  const normalizedMimeType = normalizeMimeType(mimeType);
  const normalizedSize = Number(sizeBytes || 0);
  const safeOriginalName = normalizeText(originalName).slice(0, 240) || "music-video.mp4";
  validateVideoMetadata({ mimeType: normalizedMimeType, sizeBytes: normalizedSize });

  const extension = resolveVideoExtension(normalizedMimeType, safeOriginalName);
  const objectPath = `${uploadId}/music-video.${extension}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: insertError } = await client
    .from("musician_verification_uploads")
    .insert({
      id: uploadId,
      email_hash: emailHash || null,
      signup_role: "musician",
      bucket_id: MUSICIAN_VIDEO_BUCKET,
      object_path: objectPath,
      original_name: safeOriginalName,
      mime_type: normalizedMimeType,
      size_bytes: normalizedSize,
      status: "PENDING",
      expires_at: expiresAt,
    });

  if (insertError) {
    throw new Error(`Unable to prepare music video upload: ${insertError.message}`);
  }

  const { data: signedUpload, error: signedUploadError } = await client.storage
    .from(MUSICIAN_VIDEO_BUCKET)
    .createSignedUploadUrl(objectPath);

  if (signedUploadError || !signedUpload?.signedUrl || !signedUpload?.token) {
    throw new Error(signedUploadError?.message || "Unable to create a secure music video upload URL.");
  }

  return {
    uploadId,
    bucketName: MUSICIAN_VIDEO_BUCKET,
    path: objectPath,
    signedUrl: signedUpload.signedUrl,
    token: signedUpload.token,
    expiresAt,
    maxBytes: MUSICIAN_VIDEO_MAX_BYTES,
    allowedMimeTypes: MUSICIAN_VIDEO_ALLOWED_MIME_TYPES,
  };
}

export async function consumeMusicianVideoUpload(
  client: any,
  uploadId: unknown,
  {
    userId = null,
    manualReviewId = null,
  }: Record<string, unknown> = {},
) {
  const normalizedUploadId = normalizeText(uploadId);
  if (!isUuid(normalizedUploadId)) {
    throw new Error("A valid music video proof upload is required for musician signup.");
  }

  const { data: upload, error: uploadError } = await client
    .from("musician_verification_uploads")
    .select("*")
    .eq("id", normalizedUploadId)
    .maybeSingle();

  if (uploadError) {
    throw new Error(`Unable to load music video proof: ${uploadError.message}`);
  }

  if (!upload) {
    throw new Error("Music video proof upload was not found. Please upload the video again.");
  }

  const uploadStatus = normalizeText(upload.status).toUpperCase();
  const normalizedUserId = normalizeText(userId);
  const normalizedReviewId = normalizeText(manualReviewId);
  if (uploadStatus === "CONSUMED") {
    const sameUser = !upload.user_id || !normalizedUserId || String(upload.user_id) === normalizedUserId;
    const sameReview = !upload.manual_review_id || !normalizedReviewId || String(upload.manual_review_id) === normalizedReviewId;
    if (!sameUser || !sameReview) {
      throw new Error("This music video proof was already used by another signup.");
    }
  } else {
    const expiresAt = new Date(upload.expires_at || 0).getTime();
    if (!expiresAt || expiresAt < Date.now()) {
      await client
        .from("musician_verification_uploads")
        .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
        .eq("id", normalizedUploadId)
        .eq("status", "PENDING");
      throw new Error("Music video upload expired. Please upload it again.");
    }
  }

  const mimeType = normalizeMimeType(upload.mime_type);
  const sizeBytes = Number(upload.size_bytes || 0);
  validateVideoMetadata({ mimeType, sizeBytes });

  if (!await storageObjectExists(client, MUSICIAN_VIDEO_BUCKET, upload.object_path)) {
    throw new Error("Music video proof was not uploaded completely. Please upload it again.");
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await client
    .from("musician_verification_uploads")
    .update({
      status: "CONSUMED",
      user_id: normalizedUserId || upload.user_id || null,
      manual_review_id: normalizedReviewId || upload.manual_review_id || null,
      consumed_at: upload.consumed_at || nowIso,
      updated_at: nowIso,
    })
    .eq("id", normalizedUploadId);

  if (updateError) {
    throw new Error(`Unable to attach music video proof: ${updateError.message}`);
  }

  return {
    uploadId: normalizedUploadId,
    bucketName: MUSICIAN_VIDEO_BUCKET,
    objectPath: upload.object_path,
    originalName: upload.original_name || "music-video",
    mimeType,
    sizeBytes,
    uploadedAt: upload.created_at || nowIso,
    reviewColumns: {
      music_video_path: upload.object_path,
      music_video_original_name: upload.original_name || "music-video",
      music_video_mime_type: mimeType,
      music_video_size_bytes: sizeBytes,
      music_video_uploaded_at: upload.created_at || nowIso,
    },
  };
}

export async function publishMusicianVideoToProfilePortfolio(
  client: any,
  {
    userId,
    reviewId,
    objectPath,
    mimeType,
    originalName,
  }: Record<string, unknown>,
) {
  const normalizedUserId = normalizeText(userId);
  const normalizedReviewId = normalizeText(reviewId);
  const normalizedObjectPath = normalizeText(objectPath).replace(/^\/+/, "");
  const normalizedMimeType = normalizeMimeType(mimeType);
  const normalizedOriginalName = normalizeText(originalName) || "music-video";

  if (!isUuid(normalizedUserId) || !isUuid(normalizedReviewId) || !normalizedObjectPath) {
    throw new Error("A valid musician video review is required before publishing to the profile gallery.");
  }

  if (!allowedMimeTypes.has(normalizedMimeType)) {
    throw new Error("Approved musician video has an unsupported video format.");
  }

  const { data: privateVideo, error: downloadError } = await client.storage
    .from(MUSICIAN_VIDEO_BUCKET)
    .download(normalizedObjectPath);

  if (downloadError || !privateVideo) {
    throw new Error(downloadError?.message || "Unable to read approved musician video proof.");
  }

  const extension = resolvePortfolioVideoExtension(normalizedMimeType, normalizedOriginalName, normalizedObjectPath);
  const portfolioPath = `${normalizedUserId}/portfolio/musician-verification-${normalizedReviewId}.${extension}`;

  const { error: uploadError } = await client.storage
    .from(MUSICIAN_VIDEO_PORTFOLIO_BUCKET)
    .upload(portfolioPath, privateVideo, {
      contentType: normalizedMimeType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Unable to publish musician video to profile gallery: ${uploadError.message}`);
  }

  const { data: publicUrlData } = client.storage
    .from(MUSICIAN_VIDEO_PORTFOLIO_BUCKET)
    .getPublicUrl(portfolioPath);

  const portfolioUrl = publicUrlData?.publicUrl || "";
  if (!portfolioUrl) {
    throw new Error("Unable to build the public musician video gallery URL.");
  }

  const { data: lastPortfolioRow, error: sortOrderError } = await client
    .from("profile_portfolio_urls")
    .select("sort_order")
    .eq("profile_id", normalizedUserId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sortOrderError) {
    throw new Error(`Unable to prepare musician video gallery entry: ${sortOrderError.message}`);
  }

  const nextSortOrder = lastPortfolioRow?.sort_order !== undefined && lastPortfolioRow?.sort_order !== null
    ? Number(lastPortfolioRow.sort_order) + 1
    : 0;

  const { error: portfolioInsertError } = await client
    .from("profile_portfolio_urls")
    .upsert({
      profile_id: normalizedUserId,
      portfolio_url: portfolioUrl,
      sort_order: nextSortOrder,
    }, {
      onConflict: "profile_id,portfolio_url",
      ignoreDuplicates: true,
    });

  if (portfolioInsertError) {
    throw new Error(`Unable to add musician video to profile gallery: ${portfolioInsertError.message}`);
  }

  return {
    bucketName: MUSICIAN_VIDEO_PORTFOLIO_BUCKET,
    path: portfolioPath,
    publicUrl: portfolioUrl,
  };
}
