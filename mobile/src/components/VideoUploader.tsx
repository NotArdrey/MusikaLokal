import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};

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

        debugLog('📤 Uploading video:', fileName);
        debugLog('📦 File size:', fileSizeMB.toFixed(2), 'MB');
        debugLog('📍 File extension:', fileExt);

        // Upload using ArrayBuffer for better React Native compatibility
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, arrayBuffer, {
            contentType: asset.mimeType || `video/${fileExt}`,
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
        showAlert('error', 'Error', e.message || 'Failed to upload video');
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    } catch (e: any) {
      debugLog('Video picker error:', e);
      showAlert('error', 'Error', e.message || 'Failed to select video');
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
});

