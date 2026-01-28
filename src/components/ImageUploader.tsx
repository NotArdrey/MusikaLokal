import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

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

  const pickAndUploadImages = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      // Check if adding these images would exceed the limit
      if (images.length + result.assets.length > maxImages) {
        Alert.alert('Limit Reached', `You can only upload up to ${maxImages} images.`);
        return;
      }

      setUploading(true);
      const uploadedUrls: string[] = [];

      for (const asset of result.assets) {
        try {
          const fileExt = asset.uri.split('.').pop() || 'jpg';
          const fileName = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

          // Fetch the file and convert to blob
          const response = await fetch(asset.uri);
          const blob = await response.blob();

          // Upload to Supabase Storage
          const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(fileName, blob, { contentType: `image/${fileExt}`, upsert: false });

          if (error) {
            console.error('Upload error for file:', error);
            continue;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(data.path);

          uploadedUrls.push(urlData.publicUrl);
        } catch (e) {
          console.error('Error processing image:', e);
        }
      }

      if (uploadedUrls.length > 0) {
        onImagesChange([...images, ...uploadedUrls]);
        Alert.alert('Success', `${uploadedUrls.length} image(s) uploaded successfully!`);
      } else {
        Alert.alert('Error', 'Failed to upload images. Please try again.');
      }
    } catch (e: any) {
      console.log('Upload error:', e);
      Alert.alert('Error', e.message || 'Failed to upload images');
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
      Alert.alert('Thumbnail Set', 'This image will be shown as the main thumbnail.');
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
            activeOpacity={0.7}
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
              <TouchableOpacity onLongPress={() => setAsThumbnail(index)} activeOpacity={0.8} style={{ width: '100%', height: '100%' }}>
                <Image source={{ uri }} style={styles.imageThumbnail} resizeMode="cover" />
                {thumbnailIndex === index && (
                  <View style={[styles.thumbnailBadge, { backgroundColor: colors.primary }]}>
                    <Ionicons name="star" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
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
