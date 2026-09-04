import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/src/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { screenUploadsWithAiDecisions } from '../services/uploadSafetyScreen';
import { createE2EImageFixtureUrls, isE2EFixtureMode } from '../utils/e2eFixtures';
import { uploadStorageObject } from '../utils/storageUpload';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};
const MAX_CONCURRENT_IMAGE_UPLOADS = 3;

const sanitizeExtension = (rawExt?: string | null): string => {
  const cleaned = (rawExt || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned || 'jpg';
};

const getExtensionFromName = (name: string): string => {
  const cleanedName = name.split('?')[0];
  const ext = cleanedName.includes('.') ? cleanedName.split('.').pop() : '';
  return sanitizeExtension(ext);
};

const mimeFromExtension = (ext: string): string => {
  const normalized = sanitizeExtension(ext);
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
  };
  return map[normalized] || 'image/jpeg';
};

const resolveMimeType = (asset: ImagePicker.ImagePickerAsset, ext: string): string => {
  const maybeMime = (asset as any)?.mimeType;
  if (typeof maybeMime === 'string') {
    const normalized = maybeMime.trim().toLowerCase();
    if (/^image\/[a-z0-9.+-]+$/.test(normalized)) {
      return normalized;
    }
  }
  return mimeFromExtension(ext);
};

const estimateBase64Bytes = (base64: string): number => {
  let padding = 0;
  if (base64.endsWith('==')) padding = 2;
  else if (base64.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  if (typeof FileReader === 'undefined') {
    return `data:${blob.type || 'application/octet-stream'};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Could not read the selected image.'));
    reader.onerror = () => reject(reader.error || new Error('Could not read the selected image.'));
    reader.readAsDataURL(blob);
  });
};

interface PreparedImageUpload {
  asset: ImagePicker.ImagePickerAsset;
  originalName: string;
  extension: string;
  mimeType: string;
  size: number;
  contentDataUrl: string;
  uploadBody?: Blob;
}

interface SkippedImageFeedback {
  name: string;
  reason: string;
}

const getAssetDisplayName = (asset: ImagePicker.ImagePickerAsset, index: number): string => {
  const fallbackName = asset.uri.split('/').pop() || `Selected image ${index + 1}`;
  return typeof (asset as any)?.fileName === 'string' ? (asset as any).fileName : fallbackName;
};

const formatSkippedImageFeedback = (skippedItems: SkippedImageFeedback[]): string => {
  if (skippedItems.length === 0) {
    return '';
  }

  const visibleItems = skippedItems.slice(0, 4);
  const details = visibleItems
    .map((item) => `${item.name}: ${item.reason}`)
    .join('\n');
  const remainingCount = skippedItems.length - visibleItems.length;
  const remainingText =
    remainingCount > 0 ? `\n+ ${remainingCount} more image(s) skipped.` : '';

  return `\n\nBlocked/skipped:\n${details}${remainingText}`;
};

const prepareImageForUpload = async (
  asset: ImagePicker.ImagePickerAsset,
): Promise<PreparedImageUpload> => {
  const fallbackName = asset.uri.split('/').pop() || 'image-upload.jpg';
  const originalName =
    typeof (asset as any)?.fileName === 'string' ? (asset as any).fileName : fallbackName;
  const extension = getExtensionFromName(originalName || fallbackName);
  const mimeType = resolveMimeType(asset, extension);
  let base64 = '';
  let contentDataUrl = '';
  let size = typeof (asset as any)?.fileSize === 'number' ? (asset as any).fileSize : 0;
  let uploadBody: Blob | undefined;

  const webFile = Platform.OS === 'web' ? (asset as any)?.file : null;
  if (typeof Blob !== 'undefined' && webFile instanceof Blob) {
    contentDataUrl = await blobToDataUrl(webFile);
    base64 = contentDataUrl.split(',')[1] || '';
    size = webFile.size || estimateBase64Bytes(base64);
    uploadBody = webFile;
  } else {
    base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: 'base64',
    });
    size = size || estimateBase64Bytes(base64);
    contentDataUrl = `data:${mimeType};base64,${base64}`;
  }

  if (!base64 || size <= 0) {
    throw new Error('Could not read the selected image. Please try a different photo.');
  }

  return {
    asset,
    originalName: originalName || fallbackName,
    extension,
    mimeType,
    size,
    contentDataUrl,
    uploadBody,
  };
};

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  thumbnailIndex?: number;
  onThumbnailChange?: (index: number) => void;
  maxImages?: number;
  bucketName?: string;
  userId: string;
  folder?: string;
  safetyContext?: string;
}

type ImageUploadAlertConfig = {
  type: AlertType;
  title: string;
  message: string;
  buttons?: any[];
};

export default function ImageUploader({
  images,
  onImagesChange,
  thumbnailIndex = 0,
  onThumbnailChange,
  maxImages = 10,
  bucketName = 'listings',
  userId,
  folder = 'general',
  safetyContext = 'add_edit_upload',
}: ImageUploaderProps) {
  const { colors, isDark } = useTheme();
  const uploadingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('Preparing photos...');
  const [pendingAlert, setPendingAlert] = useState<ImageUploadAlertConfig | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<ImageUploadAlertConfig>({
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
    const nextAlert = { type, title, message, buttons };
    if (uploadingRef.current) {
      setPendingAlert(nextAlert);
      return;
    }

    setAlertConfig(nextAlert);
    setAlertVisible(true);
  };

  useEffect(() => {
    if (uploading || !pendingAlert) {
      return;
    }

    const nextAlert = pendingAlert;
    const timeoutId = setTimeout(() => {
      setAlertConfig(nextAlert);
      setAlertVisible(true);
      setPendingAlert(null);
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [pendingAlert, uploading]);

  const pickAndUploadImages = async () => {
    try {
      // Check authentication first
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        showAlert('warning', 'Authentication Required', 'Please log in to upload images.');
        debugLog('Auth check failed:', authError?.message || 'No session');
        return;
      }

      if (isE2EFixtureMode()) {
        if (images.length >= maxImages) {
          showAlert('error', 'Limit Reached', `You can only upload up to ${maxImages} images.`);
          return;
        }

        const fixtureUrls = createE2EImageFixtureUrls(Math.min(1, maxImages - images.length));
        onImagesChange([...images, ...fixtureUrls]);
        showAlert('success', 'Upload Complete', `${fixtureUrls.length} E2E fixture image(s) added.`);
        return;
      }

      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('warning', 'Permission needed', 'Please allow access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: Math.max(1, maxImages - images.length),
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      // Check if adding these images would exceed the limit
      if (images.length + result.assets.length > maxImages) {
        showAlert('error', 'Limit Reached', `You can only upload up to ${maxImages} images.`);
        return;
      }

      uploadingRef.current = true;
      setUploading(true);
      setUploadMessage('Preparing photos...');

      const preparedResults = await Promise.allSettled(
        result.assets.map((asset) => prepareImageForUpload(asset)),
      );
      const preparedUploads = preparedResults
        .filter((result): result is PromiseFulfilledResult<PreparedImageUpload> => result.status === 'fulfilled')
        .map((result) => result.value);
      const skippedBeforeScreening = preparedResults
        .map((settledResult, index): SkippedImageFeedback | null => {
          if (settledResult.status !== 'rejected') {
            return null;
          }

          return {
            name: getAssetDisplayName(result.assets[index], index),
            reason: settledResult.reason?.message || 'Could not prepare this selected image.',
          };
        })
        .filter((item): item is SkippedImageFeedback => item !== null);

      if (preparedUploads.length === 0) {
        showAlert(
          'error',
          'Upload Failed',
          `Could not upload the selected images.${formatSkippedImageFeedback(skippedBeforeScreening)}`,
        );
        return;
      }

      setUploadMessage('Checking photos...');
      const safetyDecisions = await screenUploadsWithAiDecisions(
        preparedUploads.map((item) => ({
          name: item.originalName,
          mimeType: item.mimeType,
          size: item.size,
          uri: item.asset.uri,
          kind: 'photo' as const,
          contentDataUrl: item.contentDataUrl,
        })),
        safetyContext,
      );

      const skippedImages: SkippedImageFeedback[] = [...skippedBeforeScreening];
      const approvedUploads = preparedUploads.filter((item, index) => {
        const decision = safetyDecisions[index];
        if (decision?.allowed === true) {
          return true;
        }

        skippedImages.push({
          name: item.originalName,
          reason: decision?.reason || 'This image did not pass safety screening.',
        });
        return false;
      });

      if (approvedUploads.length === 0) {
        showAlert(
          'error',
          'Upload Blocked',
          `No images were uploaded.${formatSkippedImageFeedback(skippedImages)}`,
        );
        return;
      }

      setUploadMessage('Uploading photos...');
      let completedUploads = 0;
      const uploadOne = async (item: PreparedImageUpload): Promise<string> => {
        try {
          const fileName = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${item.extension}`;

          debugLog(`📤 Uploading to: ${bucketName}/${fileName}`);
          debugLog(`📍 Source URI: ${item.asset.uri}`);
          debugLog(`📦 File size: ${(item.size / 1024).toFixed(2)} KB`);

          if (item.size === 0) {
            throw new Error('File is empty');
          }

          const { data, error } = await uploadStorageObject({
            bucket: bucketName,
            path: fileName,
            contentType: item.mimeType,
            upsert: false,
            uri: Platform.OS === 'web' ? undefined : item.asset.uri,
            body: item.uploadBody,
          });

          if (error) {
            console.error('❌ Upload error for file:', error.message);
            console.error('Error details:', JSON.stringify(error, null, 2));
            
            // Provide specific error messages
            let errorMsg = error.message || 'Unknown error';
            if (errorMsg.includes('row-level security') || errorMsg.includes('policy')) {
              errorMsg = 'Permission denied. Storage policies may not be configured.';
            } else if (errorMsg.includes('Bucket not found')) {
              errorMsg = `Storage bucket "${bucketName}" does not exist.`;
            } else if (errorMsg.includes('Network')) {
              errorMsg = 'Network error. Check your internet connection.';
            }
            
            skippedImages.push({ name: item.originalName, reason: errorMsg });
            return '';
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(data.path);

          debugLog(`✅ Upload successful: ${urlData.publicUrl}`);
          return urlData.publicUrl;
        } catch (e: any) {
          console.error('❌ Error processing image:', e.message || e);
          skippedImages.push({
            name: item.originalName,
            reason: e.message || 'Processing error',
          });
          return '';
        } finally {
          completedUploads += 1;
          setUploadMessage(`Uploading photos (${completedUploads}/${approvedUploads.length})...`);
        }
      };

      const uploadResults: string[] = [];
      for (let index = 0; index < approvedUploads.length; index += MAX_CONCURRENT_IMAGE_UPLOADS) {
        const batch = approvedUploads.slice(index, index + MAX_CONCURRENT_IMAGE_UPLOADS);
        uploadResults.push(...await Promise.all(batch.map(uploadOne)));
      }
      const uploadedUrls = uploadResults.filter(Boolean);

      if (uploadedUrls.length > 0) {
        onImagesChange([...images, ...uploadedUrls]);
        const totalSkipped = skippedImages.length;
        const message = totalSkipped === 0
          ? `${uploadedUrls.length} image(s) uploaded successfully!`
          : `${uploadedUrls.length} image(s) uploaded. ${totalSkipped} selected image(s) were skipped.${formatSkippedImageFeedback(skippedImages)}`;
        showAlert(
          totalSkipped === 0 ? 'success' : 'warning',
          totalSkipped === 0 ? 'Upload Complete' : 'Some Photos Skipped',
          message,
        );
      } else {
        showAlert(
          'error',
          'Upload Failed',
          skippedImages.length > 0
            ? `No images were uploaded.${formatSkippedImageFeedback(skippedImages)}`
            : 'Please check your internet connection and try again.',
        );
      }
    } catch (e: any) {
      console.error('❌ Upload error:', e.message || e);
      const message = e.message || 'Failed to upload images';
      showAlert('error', 'Upload failed', message);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);

    // Update thumbnail index if necessary
    if (onThumbnailChange) {
      if (thumbnailIndex === index) {
        onThumbnailChange(0);
      } else if (thumbnailIndex > index) {
        onThumbnailChange(thumbnailIndex - 1);
      }
    }
  };

  const setAsThumbnail = (index: number) => {
    if (onThumbnailChange) {
      onThumbnailChange(index);
      showAlert('success', 'Thumbnail Set', 'This image will be shown as the main thumbnail.');
    }
  };

  return (
    <View style={styles.container}>
      <Modal visible={uploading} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.loadingOverlay}>
          <View style={[styles.loadingCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingTitle, { color: colors.text }]}>{uploadMessage}</Text>
            <Text style={[styles.loadingSubtitle, { color: colors.textSecondary }]}>
              Please wait while your media is uploaded.
            </Text>
          </View>
        </View>
      </Modal>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.imagesRow}>
          {/* Add Image Button */}
          <TouchableOpacity activeOpacity={uploading || images.length >= maxImages ? 1 : 0.78}
            testID="e2e-image-upload-button"
            accessibilityLabel="e2e-image-upload-button"
            style={[styles.addImageButton, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F3F4F6', opacity: uploading || images.length >= maxImages ? 0.6 : 1 }]}
            onPress={pickAndUploadImages}
            disabled={uploading || images.length >= maxImages}
          >
            {uploading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="add" size={24} color={colors.textSecondary} />
                <Text style={[styles.addImageText, { color: colors.textSecondary }]}>Add Photo</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Display uploaded images */}
          {images.map((uri, index) => (
            <View key={`${uri}-${index}`} style={styles.imageWrapper}>
              <TouchableOpacity activeOpacity={1} onLongPress={() => setAsThumbnail(index)} style={{ width: '100%', height: '100%' }}>
                <Image source={{ uri }} style={styles.imageThumbnail} resizeMode="cover" />
                {thumbnailIndex === index && (
                  <View style={[styles.thumbnailBadge, { backgroundColor: colors.primary }]}>
                    <Ionicons name="star" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={1}
                testID={`e2e-image-remove-${index}`}
                accessibilityLabel={`e2e-image-remove-${index}`}
                style={[styles.removeImageButton, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                onPress={() => removeImage(index)}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={[styles.helpText, { color: colors.textSecondary }]}>
        {images.length > 0 
          ? `${images.length}/${maxImages} images • Long press to set as thumbnail`
          : `Add up to ${maxImages} images`}
      </Text>

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
  container: {
    marginVertical: 12,
  },
  scrollView: {
    marginBottom: 8,
  },
  imagesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  addImageButton: {
    width: 120,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  addImageText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  imageWrapper: {
    width: 120,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helpText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
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

