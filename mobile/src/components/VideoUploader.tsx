import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/src/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { screenUploadsWithAiDecisions, UploadSafetyFileDecision } from '../services/uploadSafetyScreen';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'webm', 'm4v']);
const VIDEO_UPLOAD_RECOVERY_CHECKS = 3;
const VIDEO_UPLOAD_RECOVERY_DELAY_MS = 1200;
const COPYRIGHT_SAMPLE_BYTES = 4 * 1024 * 1024;

const sanitizeVideoExtension = (rawExt?: string | null): string => {
  const cleaned = (rawExt || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleaned === 'quicktime') return 'mov';
  return ALLOWED_VIDEO_EXTENSIONS.has(cleaned) ? cleaned : 'mp4';
};

const getVideoOriginalName = (asset: ImagePicker.ImagePickerAsset): string => {
  const fallbackName = asset.uri.split('/').pop() || 'video-upload.mp4';
  return typeof (asset as any)?.fileName === 'string' ? (asset as any).fileName : fallbackName;
};

const resolveVideoExtension = (asset: ImagePicker.ImagePickerAsset, originalName: string): string => {
  const uri = asset.uri || '';
  const nameExt = originalName.includes('.') ? originalName.split('.').pop() : '';
  const uriExt = !uri.startsWith('blob:') && uri.includes('.') ? uri.split('.').pop() : '';
  const mimeExt = asset.mimeType?.split('/').pop();
  return sanitizeVideoExtension(mimeExt || nameExt || uriExt);
};

const resolveVideoMimeType = (asset: ImagePicker.ImagePickerAsset, ext: string): string => {
  const maybeMime = asset.mimeType?.trim().toLowerCase();
  if (maybeMime?.startsWith('video/')) {
    return maybeMime;
  }

  const map: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
  };
  return map[ext] || 'video/mp4';
};


const getAssetSizeBytes = async (asset: ImagePicker.ImagePickerAsset): Promise<number | null> => {
  const directSize = (asset as any)?.fileSize;
  if (typeof directSize === 'number' && Number.isFinite(directSize) && directSize > 0) {
    return directSize;
  }

  if (Platform.OS === 'web') {
    const webFile = (asset as any)?.file;
    return typeof webFile?.size === 'number' && Number.isFinite(webFile.size)
      ? webFile.size
      : null;
  }

  try {
    const info = await FileSystem.getInfoAsync(asset.uri);
    return info.exists && typeof info.size === 'number' ? info.size : null;
  } catch {
    return null;
  }
};

const encodeStoragePath = (path: string): string =>
  path.split('/').map((segment) => encodeURIComponent(segment)).join('/');

const readStorageUploadError = (status: number, body: string): string => {
  if (!body) {
    return `Storage upload failed with status ${status}.`;
  }

  try {
    const parsed = JSON.parse(body);
    return parsed?.message || parsed?.error || body;
  } catch {
    return body;
  }
};

const delay = async (ms: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const isTimeoutUploadError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  return (
    message === 'timeout' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket closed') ||
    message.includes('network request failed')
  );
};

const isDuplicateStorageError = (error: unknown): boolean => {
  const message = String((error as any)?.message || error || '').toLowerCase();
  const status = Number((error as any)?.statusCode || (error as any)?.status || 0);
  return status === 409 || message.includes('already exists') || message.includes('duplicate');
};

const getStoragePathParts = (fileName: string) => {
  const normalized = fileName.replace(/^\/+/, '');
  const lastSlashIndex = normalized.lastIndexOf('/');

  if (lastSlashIndex < 0) {
    return { directory: '', baseName: normalized };
  }

  return {
    directory: normalized.slice(0, lastSlashIndex),
    baseName: normalized.slice(lastSlashIndex + 1),
  };
};

const storageObjectExists = async (bucketName: string, fileName: string): Promise<boolean> => {
  const { directory, baseName } = getStoragePathParts(fileName);

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(directory, {
        limit: 20,
        search: baseName,
      });

    if (error || !data) {
      return false;
    }

    return data.some((item) => item.name === baseName);
  } catch {
    return false;
  }
};

const waitForStorageObject = async (bucketName: string, fileName: string): Promise<boolean> => {
  for (let attempt = 0; attempt < VIDEO_UPLOAD_RECOVERY_CHECKS; attempt += 1) {
    if (attempt > 0) {
      await delay(VIDEO_UPLOAD_RECOVERY_DELAY_MS);
    }

    if (await storageObjectExists(bucketName, fileName)) {
      return true;
    }
  }

  return false;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i += 1) {
    lookup[chars.charCodeAt(i)] = i;
  }

  let bufferLength = base64.length * 0.75;
  if (base64.endsWith('==')) bufferLength -= 2;
  else if (base64.endsWith('=')) bufferLength -= 1;

  const bytes = new Uint8Array(Math.floor(bufferLength));
  let p = 0;

  for (let i = 0; i < base64.length; i += 4) {
    const e1 = lookup[base64.charCodeAt(i)];
    const e2 = lookup[base64.charCodeAt(i + 1)];
    const e3 = lookup[base64.charCodeAt(i + 2)];
    const e4 = lookup[base64.charCodeAt(i + 3)];

    if (p < bytes.length) bytes[p++] = (e1 << 2) | (e2 >> 4);
    if (p < bytes.length) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < bytes.length) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
  }

  return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return globalThis.btoa(binary);
};

const readCopyrightVideoSample = async (
  asset: ImagePicker.ImagePickerAsset,
  mimeType: string,
): Promise<string> => {
  if (Platform.OS === 'web') {
    const webFile = (asset as any)?.file as Blob | undefined;
    const source = webFile || await (await fetch(asset.uri)).blob();
    const sample = source.slice(0, Math.min(source.size, COPYRIGHT_SAMPLE_BYTES), mimeType);
    return `data:${mimeType};base64,${arrayBufferToBase64(await sample.arrayBuffer())}`;
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: 'base64',
    position: 0,
    length: COPYRIGHT_SAMPLE_BYTES,
  });
  return `data:${mimeType};base64,${base64}`;
};

const createWebReviewFrame = async (uri: string, timeMs: number): Promise<Blob> => {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = uri;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => {
      const requestedSeconds = Math.max(0, timeMs / 1000);
      video.currentTime = Math.min(requestedSeconds, Math.max(0, (video.duration || requestedSeconds) - 0.1));
    };
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('Unable to read a representative video frame.'));
  });

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, 1));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to encode the video frame.')), 'image/jpeg', 0.82);
  });
};

const uploadReviewFrame = async (input: {
  assetUri: string;
  userId: string;
  bucketName: string;
  folder: string;
  timeMs: number;
  frameIndex: number;
}): Promise<string> => {
  let body: Blob | Uint8Array;
  if (Platform.OS === 'web') {
    body = await createWebReviewFrame(input.assetUri, input.timeMs);
  } else {
    const thumbnail = await VideoThumbnails.getThumbnailAsync(input.assetUri, {
      time: input.timeMs,
      quality: 0.82,
    });
    body = base64ToUint8Array(await FileSystem.readAsStringAsync(thumbnail.uri, { encoding: 'base64' }));
  }

  const path = `${input.userId}/${input.folder}/${Date.now()}_ai-review-frame-${input.frameIndex}.jpg`;
  const { data, error } = await supabase.storage.from(input.bucketName).upload(path, body, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(input.bucketName).getPublicUrl(data.path).data.publicUrl;
};

const getReviewFrameTimes = (asset: ImagePicker.ImagePickerAsset): number[] => {
  const durationMs = Number(asset.duration || 0);
  if (!Number.isFinite(durationMs) || durationMs <= 2_000) return [1_000];
  return Array.from(new Set([
    1_000,
    Math.max(1_000, Math.floor(durationMs / 2)),
    Math.max(1_000, durationMs - 1_000),
  ])).slice(0, 3);
};

const uploadVideoWithSupabaseClient = async (input: {
  assetUri: string;
  bucketName: string;
  fileName: string;
  mimeType: string;
}): Promise<{ path: string }> => {
  const body =
    Platform.OS === 'web'
      ? await (await fetch(input.assetUri)).arrayBuffer()
      : base64ToUint8Array(
        await FileSystem.readAsStringAsync(input.assetUri, {
          encoding: 'base64',
        }),
      );

  const { data, error } = await supabase.storage
    .from(input.bucketName)
    .upload(input.fileName, body, {
      contentType: input.mimeType,
      upsert: false,
    });

  if (error) {
    if (isDuplicateStorageError(error) && await waitForStorageObject(input.bucketName, input.fileName)) {
      return { path: input.fileName };
    }

    throw error;
  }

  return { path: data.path };
};

const uploadVideoFile = async (input: {
  accessToken: string;
  assetUri: string;
  bucketName: string;
  fileName: string;
  mimeType: string;
  onMessage?: (message: string) => void;
  onProgress?: (progress: number) => void;
}): Promise<{ path: string }> => {
  if (Platform.OS !== 'web') {
    const baseUrl = supabaseUrl.replace(/\/+$/, '');
    const uploadUrl = `${baseUrl}/storage/v1/object/${encodeURIComponent(input.bucketName)}/${encodeStoragePath(input.fileName)}`;

    try {
      const uploadTask = FileSystem.createUploadTask(
        uploadUrl,
        input.assetUri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            apikey: supabaseAnonKey,
            'Content-Type': input.mimeType,
            'x-upsert': 'false',
          },
        },
        ({ totalBytesExpectedToSend, totalBytesSent }) => {
          if (totalBytesExpectedToSend > 0) {
            input.onProgress?.(
              Math.min(99, Math.max(1, Math.round((totalBytesSent / totalBytesExpectedToSend) * 100))),
            );
          }
        },
      );

      const uploadResponse = await uploadTask.uploadAsync();

      if (!uploadResponse) {
        throw new Error('Video upload was cancelled.');
      }

      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        throw new Error(readStorageUploadError(uploadResponse.status, uploadResponse.body || ''));
      }

      return { path: input.fileName };
    } catch (error) {
      if (!isTimeoutUploadError(error)) {
        throw error;
      }

      input.onMessage?.('Checking upload status...');
      if (await waitForStorageObject(input.bucketName, input.fileName)) {
        return { path: input.fileName };
      }

      input.onMessage?.('Retrying upload...');
      input.onProgress?.(0);
      return uploadVideoWithSupabaseClient(input);
    }
  }

  return uploadVideoWithSupabaseClient(input);
};

interface VideoUploaderProps {
  videoUrl: string | null;
  onVideoChange: (url: string | null) => void;
  userId: string;
  bucketName?: string;
  folder?: string;
  maxSizeMB?: number;
  enableReviewFrame?: boolean;
  onReviewFrameChange?: (url: string | null) => void;
  onReviewFramesChange?: (urls: string[]) => void;
  enableCopyrightScreening?: boolean;
  copyrightAcknowledged?: boolean;
  onCopyrightDecisionChange?: (decision: UploadSafetyFileDecision | null) => void;
}

export default function VideoUploader({
  videoUrl,
  onVideoChange,
  userId,
  bucketName = 'documents',
  folder = 'performance-videos',
  maxSizeMB = 50,
  enableReviewFrame = false,
  onReviewFrameChange,
  onReviewFramesChange,
  enableCopyrightScreening = false,
  copyrightAcknowledged = false,
  onCopyrightDecisionChange,
}: VideoUploaderProps) {
  const { colors, isDark } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('Preparing video...');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const pickAndUploadVideo = async () => {
    try {
      if (enableCopyrightScreening && !copyrightAcknowledged) {
        showAlert('warning', 'Permission Confirmation Required', 'Confirm that you own this performance or have permission to submit it before choosing a video.');
        return;
      }

      // Check authentication first
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        showAlert('warning', 'Authentication Required', 'Please log in to upload videos.');
        debugLog('Auth check failed:', authError?.message || 'No session');
        return;
      }

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('warning', 'Permission needed', 'Please allow access to your media library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos',
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];

      const fileSizeBytes = await getAssetSizeBytes(asset);
      const fileSizeMB = (fileSizeBytes || 0) / (1024 * 1024);

      if (fileSizeBytes && fileSizeMB > maxSizeMB) {
        showAlert('error', 'File Too Large', `Video must be under ${maxSizeMB}MB. Your file is ${fileSizeMB.toFixed(1)}MB.`);
        return;
      }

      setUploading(true);
      setUploadMessage('Preparing video...');
      setUploadProgress(0);

      try {
        const originalName = getVideoOriginalName(asset);
        const fileExt = resolveVideoExtension(asset, originalName);
        const mimeType = resolveVideoMimeType(asset, fileExt);
        const fileName = `${userId}/${folder}/${Date.now()}_video.${fileExt}`;

        let copyrightDecision: UploadSafetyFileDecision | null = null;
        if (enableCopyrightScreening) {
          setUploadMessage('Checking released-recording matches...');
          const contentDataUrl = await readCopyrightVideoSample(asset, mimeType);
          const [decision] = await screenUploadsWithAiDecisions([{
            name: originalName,
            mimeType,
            size: fileSizeBytes || undefined,
            uri: asset.uri,
            kind: 'video',
            contentDataUrl,
          }], 'gig_application_performance_video');

          if (!decision?.allowed) {
            throw new Error(decision?.reason || 'The performance video could not pass copyright screening.');
          }
          copyrightDecision = decision;
          onCopyrightDecisionChange?.(decision);
        } else {
          onCopyrightDecisionChange?.(null);
        }

        setUploadMessage('Uploading video...');

        debugLog('📤 Uploading video:', fileName);
        debugLog('📦 File size:', fileSizeMB.toFixed(2), 'MB');
        debugLog('📍 File extension:', fileExt);

        const data = await uploadVideoFile({
          accessToken: session.access_token,
          assetUri: asset.uri,
          bucketName,
          fileName,
          mimeType,
          onMessage: setUploadMessage,
          onProgress: setUploadProgress,
        });

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(data.path);

        debugLog('Video uploaded successfully:', urlData.publicUrl);
        if (copyrightDecision?.copyrightReviewId) {
          try {
            const { error: linkError } = await supabase.functions.invoke('upload-safety-screen', {
              body: {
                action: 'link_copyright_review_media',
                reviewId: copyrightDecision.copyrightReviewId,
                mediaUrl: urlData.publicUrl,
              },
            });
            if (linkError) throw linkError;
          } catch (linkError) {
            console.warn('Video uploaded, but the ownership review media link could not be saved:', linkError);
          }
        }
        setUploadProgress(100);
        if (enableReviewFrame && onReviewFrameChange) {
          try {
            setUploadMessage('Preparing representative review frames...');
            const frameUrls: string[] = [];
            for (const [frameIndex, timeMs] of getReviewFrameTimes(asset).entries()) {
              try {
                frameUrls.push(await uploadReviewFrame({
                  assetUri: asset.uri,
                  userId,
                  bucketName,
                  folder,
                  timeMs,
                  frameIndex,
                }));
              } catch (frameError) {
                console.warn(`Unable to prepare AI review frame ${frameIndex + 1}:`, frameError);
              }
            }
            if (frameUrls.length === 0) throw new Error('No representative frames could be prepared.');
            onReviewFrameChange(frameUrls[0]);
            onReviewFramesChange?.(frameUrls);
          } catch (frameError) {
            console.warn('Unable to prepare AI review frame:', frameError);
            onReviewFrameChange(null);
            onReviewFramesChange?.([]);
          }
        } else {
          onReviewFrameChange?.(null);
          onReviewFramesChange?.([]);
        }
        onVideoChange(urlData.publicUrl);
        showAlert(
          copyrightDecision?.requiresAdminReview ? 'warning' : 'success',
          copyrightDecision?.requiresAdminReview ? 'Video Uploaded — Review Pending' : 'Success',
          copyrightDecision?.requiresAdminReview
            ? 'The video matched a released recording. Your application can continue while an admin reviews your ownership or permission claim.'
            : 'Video uploaded successfully!',
        );
      } catch (e: any) {
        console.warn('Error uploading video:', e);
        const rawMessage = e.message || 'Failed to upload video';
        const message = isTimeoutUploadError(e)
          ? 'The upload took too long on this connection. Please try again with a stronger connection or a shorter video.'
          : rawMessage;
        showAlert('error', 'Upload failed', message);
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    } catch (e: any) {
      debugLog('Video picker error:', e);
      const message = e.message || 'Failed to select video';
      showAlert('error', 'Upload failed', message);
      setUploading(false);
    }
  };

  const removeVideo = () => {
    showAlert(
      'warning',
      'Remove Video',
      'Are you sure you want to remove this video?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onReviewFrameChange?.(null);
            onReviewFramesChange?.([]);
            onCopyrightDecisionChange?.(null);
            onVideoChange(null);
          }
        }
      ]
    );
  };

  return (
    <View>
      <Modal visible={uploading} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingTitle, { color: colors.text }]}>{uploadMessage}</Text>
            <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
              Please wait while your video is uploaded.
            </Text>
          </View>
        </View>
      </Modal>

      {videoUrl ? (
        <View style={[styles.videoContainer, { borderColor: colors.border, backgroundColor: isDark ? '#374151' : '#F9FAFB' }]}>
          <View style={styles.videoInfo}>
            <Ionicons name="videocam" size={32} color={colors.primary} />
            <View style={styles.videoDetails}>
              <Text style={[styles.videoText, { color: colors.text }]}>Video Uploaded</Text>
              <Text style={[styles.videoSubtext, { color: colors.textSecondary }]} numberOfLines={1}>
                {videoUrl.split('/').pop()}
              </Text>
            </View>
          </View>
          <TouchableOpacity activeOpacity={1} onPress={removeVideo} style={styles.removeButton}>
            <Ionicons name="trash-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.uploadBox, { borderColor: colors.border, opacity: uploading ? 0.6 : 1 }]}
          onPress={pickAndUploadVideo}
          disabled={uploading}
          activeOpacity={uploading ? 1 : 0.78}
        >
          {uploading ? (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.text, marginTop: 8, fontFamily: 'Poppins_500Medium' }}>
                Uploading... {uploadProgress}%
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="videocam-outline" size={32} color={colors.primary} />
              <Text style={{ color: colors.text, marginTop: 8, fontFamily: 'Poppins_500Medium' }}>
                Upload Performance Video (Required)
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Max {maxSizeMB}MB • MP4, MOV
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  videoContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  videoDetails: {
    marginLeft: 12,
    flex: 1,
  },
  videoText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    marginBottom: 4,
  },
  videoSubtext: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  removeButton: {
    padding: 8,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  loadingTitle: {
    marginTop: 14,
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
});

