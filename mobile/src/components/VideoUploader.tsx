import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { screenUploadsWithAi } from '../services/uploadSafetyScreen';
import { useTheme } from '../context/ThemeContext';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};
const MAX_INLINE_SCREEN_BYTES = 4 * 1024 * 1024;
const SAFETY_CHECK_TIMEOUT_MS = 6000;
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'webm', 'm4v']);

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

const estimateBase64Bytes = (base64: string): number => {
  let padding = 0;
  if (base64.endsWith('==')) padding = 2;
  else if (base64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const ensureScreenableFrameSize = (dataUrl: string): string => {
  const base64 = dataUrl.split(',')[1] || '';
  if (!base64 || estimateBase64Bytes(base64) > MAX_INLINE_SCREEN_BYTES) {
    throw new Error('Could not create a small enough video preview for safety screening.');
  }
  return dataUrl;
};

const extractWebVideoFrameDataUrl = async (
  asset: ImagePicker.ImagePickerAsset,
  mimeType: string,
  arrayBuffer: ArrayBuffer,
  targetTimeSeconds: number,
): Promise<string> => {
  const webFile = (asset as any)?.file;
  const sourceBlob =
    typeof Blob !== 'undefined' && webFile instanceof Blob
      ? webFile
      : new Blob([arrayBuffer], { type: mimeType });

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(sourceBlob);
    const video = document.createElement('video');
    let settled = false;
    const timeoutId = window.setTimeout(
      () => fail('Video preview generation timed out during safety screening.'),
      8000,
    );

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const capture = () => {
      if (settled) return;
      const sourceWidth = video.videoWidth || 640;
      const sourceHeight = video.videoHeight || 360;
      const maxDimension = 960;
      const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        fail('Could not read a video preview frame for safety screening.');
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      settled = true;
      cleanup();
      resolve(ensureScreenableFrameSize(dataUrl));
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration <= 0) {
        capture();
        return;
      }

      try {
        const latestUsefulTime = Math.max(0.05, duration - 0.05);
        video.currentTime = Math.min(Math.max(0.05, targetTimeSeconds), latestUsefulTime);
      } catch {
        capture();
      }
    };
    video.onloadeddata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        capture();
      }
    };
    video.onseeked = capture;
    video.onerror = () => fail('Could not read the selected video for safety screening.');
    video.src = objectUrl;
    video.load();
  });
};

const extractVideoFrameDataUrl = async (
  asset: ImagePicker.ImagePickerAsset,
  mimeType: string,
  arrayBuffer: ArrayBuffer,
  targetTimeMs: number,
): Promise<string> => {
  if (Platform.OS === 'web') {
    return extractWebVideoFrameDataUrl(asset, mimeType, arrayBuffer, targetTimeMs / 1000);
  }

  const thumbnail = await VideoThumbnails.getThumbnailAsync(asset.uri, {
    time: targetTimeMs,
    quality: 0.65,
  });
  const base64 = await FileSystem.readAsStringAsync(thumbnail.uri, {
    encoding: 'base64',
  });
  return ensureScreenableFrameSize(`data:image/jpeg;base64,${base64}`);
};

const extractVideoFrameDataUrls = async (
  asset: ImagePicker.ImagePickerAsset,
  mimeType: string,
  arrayBuffer: ArrayBuffer,
): Promise<string[]> => {
  const attempts = await Promise.allSettled(
    [1000, 4000, 8000].map((timeMs) =>
      extractVideoFrameDataUrl(asset, mimeType, arrayBuffer, timeMs),
    ),
  );
  const frameDataUrls = Array.from(
    new Set(
      attempts
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value),
    ),
  );

  if (frameDataUrls.length === 0) {
    const firstFailure = attempts.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    throw firstFailure?.reason instanceof Error
      ? firstFailure.reason
      : new Error('Could not create a video preview for safety screening.');
  }

  return frameDataUrls;
};

const withSafetyTimeout = async <T,>(promise: Promise<T>): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Safety screening timed out. Upload blocked. Please try again.')),
      SAFETY_CHECK_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

interface VideoUploaderProps {
  videoUrl: string | null;
  onVideoChange: (url: string | null) => void;
  userId: string;
  bucketName?: string;
  folder?: string;
  maxSizeMB?: number;
}

export default function VideoUploader({
  videoUrl,
  onVideoChange,
  userId,
  bucketName = 'documents',
  folder = 'performance-videos',
  maxSizeMB = 50
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

  const showUploadBlockedAlert = (message?: string) => {
    showAlert(
      'warning',
      'Upload blocked',
      message || 'This video did not pass safety screening.',
      [{ text: 'Choose another', style: 'default' }],
    );
  };

  const pickAndUploadVideo = async () => {
    try {
      // Check authentication first
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        showAlert('warning', 'Authentication Required', 'Please log in to upload videos.');
        console.error('Auth check failed:', authError?.message || 'No session');
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

      // Check file size using ArrayBuffer
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileSizeMB = arrayBuffer.byteLength / (1024 * 1024);

      if (fileSizeMB > maxSizeMB) {
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
        setUploadMessage('Checking video...');

        const screeningResult = await withSafetyTimeout((async () => {
          const frameDataUrls = await extractVideoFrameDataUrls(asset, mimeType, arrayBuffer);
          return screenUploadsWithAi(
            frameDataUrls.map((contentDataUrl, index) => ({
              name: originalName,
              mimeType,
              size: arrayBuffer.byteLength,
              uri: `${asset.uri}#frame-${index + 1}`,
              contentDataUrl,
              kind: 'video',
            })),
            `video_uploader:${bucketName}:${folder}`,
          );
        })());

        if (!screeningResult.allowed) {
          showUploadBlockedAlert(screeningResult.reason);
          return;
        }

        const fileName = `${userId}/${folder}/${Date.now()}_video.${fileExt}`;
        setUploadMessage('Uploading video...');

        debugLog('📤 Uploading video:', fileName);
        debugLog('📦 File size:', fileSizeMB.toFixed(2), 'MB');
        debugLog('📍 File extension:', fileExt);

        // Upload using ArrayBuffer for better React Native compatibility
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, arrayBuffer, {
            contentType: mimeType,
            upsert: false
          });

        if (error) {
          console.error('❌ Upload error:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));

          let errorMsg = error.message || 'Unknown error';
          if (errorMsg.includes('row-level security') || errorMsg.includes('policy')) {
            errorMsg = 'Permission denied. Storage policies may not be configured.';
          } else if (errorMsg.includes('Bucket not found')) {
            errorMsg = `Storage bucket "${bucketName}" does not exist.`;
          } else if (errorMsg.includes('Network')) {
            errorMsg = 'Network error. Check your internet connection.';
          }

          showAlert('error', 'Upload Failed', errorMsg);
          return;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(data.path);

        debugLog('Video uploaded successfully:', urlData.publicUrl);
        onVideoChange(urlData.publicUrl);
        showAlert('success', 'Success', 'Video uploaded successfully!');
      } catch (e: any) {
        console.error('Error uploading video:', e);
        const message = e.message || 'Failed to upload video';
        if (String(message).toLowerCase().includes('safety screen')) {
          showUploadBlockedAlert(message);
        } else {
          showAlert('error', 'Upload failed', message);
        }
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    } catch (e: any) {
      debugLog('Video picker error:', e);
      const message = e.message || 'Failed to select video';
      if (String(message).toLowerCase().includes('safety screen')) {
        showUploadBlockedAlert(message);
      } else {
        showAlert('error', 'Upload failed', message);
      }
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
          onPress: () => onVideoChange(null)
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
              Please wait while your video is checked and uploaded.
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
          style={[styles.uploadBox, { borderColor: colors.border }]}
          onPress={pickAndUploadVideo}
          disabled={uploading}
          activeOpacity={1}
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

