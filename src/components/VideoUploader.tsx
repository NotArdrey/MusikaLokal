import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

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
  const [uploadProgress, setUploadProgress] = useState(0);

  const pickAndUploadVideo = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your media library.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsMultipleSelection: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      
      // Check file size (approximate)
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const fileSizeMB = blob.size / (1024 * 1024);
      
      if (fileSizeMB > maxSizeMB) {
        Alert.alert('File Too Large', `Video must be under ${maxSizeMB}MB. Your file is ${fileSizeMB.toFixed(1)}MB.`);
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      try {
        // Handle file extension - check if it's a blob URL or regular file path
        let fileExt = 'mp4'; // Default to mp4
        const uri = asset.uri;
        
        // Check if it's NOT a blob URL and has a valid extension
        if (!uri.startsWith('blob:') && uri.includes('.')) {
          const ext = uri.split('.').pop()?.toLowerCase();
          if (ext && ['mp4', 'mov', 'avi', 'webm', 'm4v'].includes(ext)) {
            fileExt = ext;
          }
        }
        
        // Also check the asset's mimeType if available
        if (asset.mimeType) {
          const mimeExt = asset.mimeType.split('/').pop()?.toLowerCase();
          if (mimeExt && ['mp4', 'mov', 'avi', 'webm', 'quicktime'].includes(mimeExt)) {
            fileExt = mimeExt === 'quicktime' ? 'mov' : mimeExt;
          }
        }
        
        const fileName = `${userId}/${folder}/${Date.now()}_video.${fileExt}`;

        console.log('Uploading video:', fileName);
        console.log('File size:', fileSizeMB.toFixed(2), 'MB');
        console.log('File extension:', fileExt);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, blob, { 
            contentType: asset.mimeType || `video/${fileExt}`, 
            upsert: false 
          });

        if (error) {
          console.error('Upload error:', error);
          Alert.alert('Upload Failed', error.message || 'Failed to upload video');
          return;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(data.path);

        console.log('Video uploaded successfully:', urlData.publicUrl);
        onVideoChange(urlData.publicUrl);
        Alert.alert('Success', 'Video uploaded successfully!');
      } catch (e: any) {
        console.error('Error uploading video:', e);
        Alert.alert('Error', e.message || 'Failed to upload video');
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    } catch (e: any) {
      console.log('Video picker error:', e);
      Alert.alert('Error', e.message || 'Failed to select video');
      setUploading(false);
    }
  };

  const removeVideo = () => {
    Alert.alert(
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
          <TouchableOpacity onPress={removeVideo} style={styles.removeButton}>
            <Ionicons name="trash-outline" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.uploadBox, { borderColor: colors.border }]} 
          onPress={pickAndUploadVideo}
          disabled={uploading}
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
                Upload Performance Sample
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Max {maxSizeMB}MB • MP4, MOV
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
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
});
