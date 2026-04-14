import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { screenUploadsWithAi } from '../services/uploadSafetyScreen';
import { useTheme } from '../context/ThemeContext';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};

interface ImageUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  thumbnailIndex?: number;
  onThumbnailChange?: (index: number) => void;
  maxImages?: number;
  bucketName?: string;
  userId: string;
  folder?: string;
}

export default function ImageUploader({
  images,
  onImagesChange,
  thumbnailIndex = 0,
  onThumbnailChange,
  maxImages = 10,
  bucketName = 'listings',
  userId,
  folder = 'general'
}: ImageUploaderProps) {
  const { colors, isDark } = useTheme();
  const [uploading, setUploading] = useState(false);
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

  const pickAndUploadImages = async () => {
    try {
      // Check authentication first
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        showAlert('warning', 'Authentication Required', 'Please log in to upload images.');
        console.error('Auth check failed:', authError?.message || 'No session');
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
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      // Check if adding these images would exceed the limit
      if (images.length + result.assets.length > maxImages) {
        showAlert('error', 'Limit Reached', `You can only upload up to ${maxImages} images.`);
        return;
      }

      const screeningSummary = await screenUploadsWithAi(
        result.assets.map((asset) => {
          const fallbackName = asset.uri.split('/').pop() || 'image-upload.jpg';
          const fileName =
            typeof (asset as any)?.fileName === 'string'
              ? (asset as any).fileName
              : fallbackName;

          return {
            name: fileName || fallbackName,
            mimeType:
              typeof (asset as any)?.mimeType === 'string'
                ? (asset as any).mimeType
                : undefined,
            size:
              typeof (asset as any)?.fileSize === 'number'
                ? (asset as any).fileSize
                : undefined,
            uri: asset.uri,
            kind: 'photo' as const,
          };
        }),
        `image_uploader:${bucketName}:${folder}`,
      );

      if (!screeningSummary.allowed) {
        showAlert(
          'error',
          'Upload Blocked',
          screeningSummary.reason || 'One or more images did not pass safety screening.',
        );
        return;
      }

      setUploading(true);
      const uploadedUrls: string[] = [];
      const errors: string[] = [];

      for (const asset of result.assets) {
        try {
          const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
          const fileName = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

          debugLog(`📤 Uploading to: ${bucketName}/${fileName}`);
          debugLog(`📍 Source URI: ${asset.uri}`);

          // For React Native, we need to use FormData or ArrayBuffer
          const response = await fetch(asset.uri);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const fileSize = arrayBuffer.byteLength;
          debugLog(`📦 File size: ${(fileSize / 1024).toFixed(2)} KB`);

          if (fileSize === 0) {
            throw new Error('File is empty');
          }

          // Upload using ArrayBuffer for better React Native compatibility
          const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(fileName, arrayBuffer, { 
              contentType: `image/${fileExt}`, 
              upsert: false 
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
            
            errors.push(errorMsg);
            continue;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(data.path);

          debugLog(`✅ Upload successful: ${urlData.publicUrl}`);
          uploadedUrls.push(urlData.publicUrl);
        } catch (e: any) {
          console.error('❌ Error processing image:', e.message || e);
          errors.push(e.message || 'Processing error');
        }
      }

      if (uploadedUrls.length > 0) {
        onImagesChange([...images, ...uploadedUrls]);
        const message = uploadedUrls.length === result.assets.length
          ? `${uploadedUrls.length} image(s) uploaded successfully!`
          : `${uploadedUrls.length} of ${result.assets.length} image(s) uploaded. ${errors.length} failed.`;
        showAlert('success', 'Upload Complete', message);
      } else {
        showAlert('error', 'Upload Failed', errors.length > 0 ? errors[0] : 'Please check your internet connection and try again.');
      }
    } catch (e: any) {
      console.error('❌ Upload error:', e.message || e);
      showAlert('error', 'Error', e.message || 'Failed to upload images');
    } finally {
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.imagesRow}>
          {/* Add Image Button */}
          <TouchableOpacity
            style={[styles.addImageButton, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F3F4F6' }]}
            onPress={pickAndUploadImages}
            disabled={uploading || images.length >= maxImages}
            activeOpacity={1}
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
});

