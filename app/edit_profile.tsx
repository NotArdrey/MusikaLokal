import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
        mediaTypes: 'images',
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

  const validateForm = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Name cannot be empty');
      return false;
    }
    if (selectedRoles.length === 0) {
      Alert.alert('Required Field', 'Please select at least one role/instrument');
      return false;
    }
    if (!bio.trim()) {
      Alert.alert('Required Field', 'Please enter a bio');
      return false;
    }
    if (!avatarUrl) {
      Alert.alert('Required Field', 'Please upload a profile picture');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }
    
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
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Profile" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={styles.flex1}>

          <View style={styles.contentContainer}>

            {/* Profile Image */}
            <View style={styles.profileImageContainer}>
              <View style={styles.imageWrapper}>
                <View
                  style={[
                    styles.imageContainer,
                    {
                      borderColor: colors.surface
                    }
                  ]}
                >
                  <Image
                    source={{ uri: avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                </View>
                <TouchableOpacity
                  onPress={pickAndUploadAvatar}
                  disabled={uploading}
                  style={[styles.uploadButton, { backgroundColor: uploading ? colors.textSecondary : colors.primary }]}
                >
                  <Ionicons name={uploading ? "hourglass" : "camera"} size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={[styles.uploadText, { color: colors.primary }]}>
                {uploading ? 'Uploading...' : 'Change Photo'}
              </Text>
            </View>

            {/* Identity Verification Section */}
            <View style={[styles.verificationContainer, { backgroundColor: isDark ? 'rgba(30, 58, 138, 0.2)' : '#EFF6FF', borderColor: isDark ? '#1E40AF' : '#DBEAFE' }]}>
              <View style={styles.verificationHeader}>
                <View style={styles.verificationTitleWrapper}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                  <Text style={[styles.verificationTitle, { color: colors.text }]}>Identity Verification</Text>
                </View>
                <View style={[styles.unverifiedBadge, { backgroundColor: isDark ? 'rgba(113, 63, 18, 0.3)' : '#FEF9C3' }]}>
                  <Text style={styles.unverifiedText}>Unverified</Text>
                </View>
              </View>
              <Text style={[styles.verificationDescription, { color: colors.textSecondary }]}>
                Verify your government ID and face liveliness to get a "Verified" badge and boost trust.
              </Text>
              <TouchableOpacity
                onPress={handleVerifyIdentity}
                style={[styles.verifyButton, { borderColor: isDark ? '#1D4ED8' : '#BFDBFE', backgroundColor: isDark ? 'rgba(30, 58, 138, 0.1)' : '#FFFFFF' }]}
              >
                <Text style={[styles.verifyButtonText, { color: colors.primary }]}>Verify with Didit</Text>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View style={styles.formContainer}>
              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Display Name</Text>
                <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                  <Text style={[styles.inputValue, { color: colors.muted }]}>{name}</Text>
                </View>
                <Text style={[styles.inputHelper, { color: colors.textSecondary }]}>Display Name cannot be changed.</Text>
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Roles & Instruments</Text>
                <View style={styles.rolesWrapper}>
                  {availableRoles.map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => toggleRole(role)}
                        style={[
                          styles.roleItem,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? (isDark ? colors.primaryLight : '#EEF2FF') : 'transparent'
                          }
                        ]}
                      >
                        <Text style={[
                          styles.roleText,
                          {
                            color: isSelected ? colors.primary : colors.textSecondary
                          }
                        ]}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Genres</Text>
                <View style={[styles.inputWrapper, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
                  <TextInput
                    value={genres}
                    onChangeText={setGenres}
                    placeholder="e.g. Rock, Indie, Pop"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.textInput, { color: colors.text }]}
                  />
                </View>
              </View>

              <View>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Bio</Text>
                <View style={[styles.inputWrapper, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
                  <TextInput
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Tell us a bit about yourself..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={[styles.textInput, { color: colors.text, height: 120, textAlignVertical: 'top' }]}
                  />
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                style={[styles.saveButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
              >
                <Text style={styles.saveButtonText}>Save Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                style={[styles.cancelButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
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

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  contentContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  imageWrapper: {
    position: 'relative',
  },
  imageContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 4,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  uploadButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    padding: 12,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  uploadText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  verificationContainer: {
    marginBottom: 32,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  verificationTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verificationTitle: {
    fontFamily: 'Poppins_600SemiBold',
  },
  unverifiedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  unverifiedText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 10,
    color: '#EAB308',
  },
  verificationDescription: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    marginBottom: 12,
  },
  verifyButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  verifyButtonText: {
    fontFamily: 'Poppins_600SemiBold',
  },
  formContainer: {
    gap: 24,
  },
  inputLabel: {
    marginBottom: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: 'Poppins_600SemiBold',
  },
  inputWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  inputValue: {
    fontFamily: 'Poppins_500Medium',
    padding: 16,
  },
  inputHelper: {
    marginTop: 4,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  rolesWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  roleText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
  },
  textInput: {
    fontFamily: 'Poppins_400Regular',
    textAlignVertical: 'center',
    padding: 16,
  },
  actionsContainer: {
    marginTop: 32,
    marginBottom: 20,
    gap: 12,
  },
  saveButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  cancelButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
});

