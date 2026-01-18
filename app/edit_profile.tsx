import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function EditProfileScreen() {
  const { colors, isDark } = useTheme();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [genres, setGenres] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Expanded role list
  const availableRoles = [
    'Vocalist', 'Guitarist', 'Bassist', 'Drummer',
    'Keyboardist', 'DJ', 'Producer', 'Sound Engineer'
  ];

  const handleVerifyIdentity = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      Alert.alert('Starting Verification', 'Redirecting to Didit secure verification...');

      const { data, error } = await supabase.functions.invoke('verify-identity', {
        body: { action: 'create_session', userId: user.id }
      });

      if (error) throw error;

      if (data && data.url) {
        // In a real app, use WebBrowser.openBrowserAsync(data.url)
        console.log('Verification URL:', data.url);
        Alert.alert('Mock Success', `Opened verification URL: ${data.url}\n\n(In production this opens the browser)`);
      }
    } catch (e: any) {
      console.log('Verification error:', e);
      Alert.alert('Error', 'Failed to start verification');
    }
  };

  const pickAndUploadAvatar = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission needed', 'Please allow access to your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      setUploading(true);
      const file = result.assets[0];
      const fileExt = file.uri.split('.').pop() || 'jpg';
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      // Fetch the file and convert to blob
      const response = await fetch(file.uri);
      const blob = await response.blob();

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, { contentType: `image/${fileExt}`, upsert: true });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(data.path);

      setAvatarUrl(urlData.publicUrl);

      // Update profile with new avatar URL
      await supabase.functions.invoke('manage-profile', {
        body: { action: 'update', userId, avatar_url: urlData.publicUrl }
      });

      Alert.alert('Success', 'Profile picture updated!');
    } catch (e: any) {
      console.log('Upload error:', e);
      Alert.alert('Error', e.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  React.useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase.functions.invoke('manage-profile', {
        body: { action: 'fetch', userId: user.id }
      });
      if (error) throw error;

      setName(data?.full_name || '');
      setSelectedRoles(data?.skills || []);
      setGenres(data?.genres?.join(', ') || '');
      setBio(data?.bio || '');
      setAvatarUrl(data?.avatar_url || '');
    } catch (e) {
      console.log('Error fetching profile:', e);
    }
  }

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const genreArray = genres.split(',').map(g => g.trim()).filter(g => g);
      const { error } = await supabase.functions.invoke('manage-profile', {
        body: {
          action: 'update',
          userId,
          skills: selectedRoles,
          genres: genreArray,
          bio
        }
      });
      if (error) throw error;
      setModalVisible(false);
      router.back();
    } catch (e) {
      console.log('Error saving profile:', e);
      alert('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Edit Profile" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          <View className="px-6 mt-6">

            {/* Profile Image */}
            <View className="items-center mb-8">
              <View className="relative">
                <View
                  style={{
                    width: 120, height: 120, borderRadius: 60, overflow: 'hidden',
                    borderWidth: 4, borderColor: colors.surface
                  }}
                >
                  <Image
                    source={{ uri: avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                </View>
                <TouchableOpacity
                  onPress={pickAndUploadAvatar}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 p-3 rounded-full shadow-lg"
                  style={{ backgroundColor: uploading ? colors.textSecondary : colors.primary }}
                >
                  <Ionicons name={uploading ? "hourglass" : "camera"} size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text className="mt-3 text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>
                {uploading ? 'Uploading...' : 'Change Photo'}
              </Text>
            </View>

            {/* Identity Verification Section */}
            <View className="mb-8 p-4 rounded-2xl border border-blue-100 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Identity Verification</Text>
                </View>
                <View className="px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 10, color: '#EAB308' }}>Unverified</Text>
                </View>
              </View>
              <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
                Verify your government ID and face liveliness to get a "Verified" badge and boost trust.
              </Text>
              <TouchableOpacity
                onPress={handleVerifyIdentity}
                className="py-3 rounded-xl items-center border border-blue-200 dark:border-blue-700 bg-white dark:bg-blue-900/10"
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Verify with Didit</Text>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View className="gap-6">
              <View>
                <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Display Name</Text>
                <View className="p-4 rounded-xl border border-gray-200" style={{ backgroundColor: colors.inputBackground, borderColor: colors.border }}>
                  <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.muted }}>{name}</Text>
                </View>
                <Text className="mt-1 text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Display Name cannot be changed.</Text>
              </View>

              <View>
                <Text className="mb-3 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Roles & Instruments</Text>
                <View className="flex-row flex-wrap gap-2">
                  {availableRoles.map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => toggleRole(role)}
                        className={`px-4 py-2 rounded-full border ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-transparent'}`}
                        style={{
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? (isDark ? colors.primaryLight : '#EEF2FF') : 'transparent'
                        }}
                      >
                        <Text style={{
                          fontFamily: 'Poppins_500Medium',
                          fontSize: 13,
                          color: isSelected ? colors.primary : colors.textSecondary
                        }}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Genres</Text>
                <View className="p-3 rounded-xl border border-gray-200" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                  <TextInput
                    value={genres}
                    onChangeText={setGenres}
                    placeholder="e.g. Rock, Indie, Pop"
                    placeholderTextColor={colors.textSecondary}
                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                  />
                </View>
              </View>

              <View>
                <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Bio</Text>
                <View className="p-3 rounded-xl border border-gray-200" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                  <TextInput
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Tell us a bit about yourself..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text, height: 100, textAlignVertical: 'top' }}
                  />
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="mt-8 gap-3">
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                className="w-full py-4 rounded-xl items-center shadow-lg"
                style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 }}
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#fff' }}>Save Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                className="w-full py-4 rounded-xl items-center"
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Save Changes"
        message="Are you sure you want to update your profile?"
        buttonText="Save Changes"
        onConfirm={handleSave}
      />
    </>
  );
}

