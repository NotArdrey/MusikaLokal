import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import ImageUploader from '../src/components/ImageUploader';
import LocationPicker from '../src/components/LocationPicker';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function EditGroupScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [groupName, setGroupName] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Members
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState('');

  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase.functions.invoke('manage-profile', {
        body: { action: 'fetch', userId: user.id }
      });

      if (profile?.role !== 'musician') {
        Alert.alert('Unauthorized', 'Only musicians can edit groups.');
        router.replace('/home');
        return;
      }

      setAuthorized(true);
    } catch (e) {
      console.error('Authorization check failed:', e);
      router.replace('/home');
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    if (authorized && id) {
      fetchGroupDetails();
    }
  }, [id, authorized]);

  const fetchGroupDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      if (!groupId) {
        Alert.alert('Error', 'Invalid group ID');
        router.replace('/home');
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'group', id: groupId, userId: user.id }
      });

      if (error) throw error;

      // If no data returned, user doesn't own this group
      if (!data) {
        Alert.alert('Not Found', 'Group not found or you do not have permission to edit it.');
        router.replace('/home');
        return;
      }

      setGroupName(data.name);
      setGenre(data.genre);
      setDescription(data.description);
      setAddress(data.location || '');
      setLatitude(data.latitude || null);
      setLongitude(data.longitude || null);
      setMembers(data.members || []);
      // setSelectedImage(data.images?.[0] || '');
    } catch (e) {
      console.log('Error fetching group details:', e);
      Alert.alert('Error', 'Failed to load group details.');
      router.replace('/home');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (!groupName.trim()) {
      Alert.alert('Required Field', 'Please enter a group name');
      return false;
    }
    if (!genre.trim()) {
      Alert.alert('Required Field', 'Please enter a genre');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('Required Field', 'Please enter a description');
      return false;
    }
    if (!address || !latitude || !longitude) {
      Alert.alert('Required Field', 'Please select a location on the map');
      return false;
    }
    if (images.length === 0) {
      Alert.alert('Required Field', 'Please upload at least one group photo');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      if (!groupId) {
        alert('Invalid group ID');
        return;
      }

      const payload = {
        name: groupName,
        genre,
        description,
        location: address,
        latitude,
        longitude,
        members,
        images: images,
      };

      const { error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'update', type: 'group', id: groupId, userId: user.id, payload }
      });

      if (error) throw error;

      setModalVisible(false);
      console.log('Group Updated');
      router.back();
    } catch (e) {
      console.log('Error updating group:', e);
      alert('Failed to update group');
    }
  };

  const addMember = () => {
    if (newMember.trim()) {
      setMembers([...members, newMember.trim()]);
      setNewMember('');
    }
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const renderSectionHeader = (title: string, icon: string) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );

  const renderInput = (label: string, value: string, setValue: (text: string) => void, multiline = false) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrapper, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          style={[
            styles.input,
            {
              fontFamily: 'Poppins_400Regular',
              color: colors.text,
              height: multiline ? 120 : 'auto',
              textAlignVertical: multiline ? 'top' : 'center'
            }
          ]}
        />
      </View>
    </View>
  );

  // Show loading while checking authorization
  if (checkingAuth) {
    return (
      <View style={[styles.flex1, styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>
          Checking permissions...
        </Text>
      </View>
    );
  }

  // Don't render if not authorized
  if (!authorized) {
    return null;
  }

  // Show loading while fetching data
  if (loading) {
    return (
      <View style={[styles.flex1, styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>
          Loading group details...
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Group" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={styles.flex1}>

          {renderSectionHeader('Group Details', 'people')}
          {renderInput('Group Name', groupName, setGroupName)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Based Location</Text>
            <TouchableOpacity
              onPress={() => setLocationPickerVisible(true)}
              style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB', padding: 16 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
                <Text style={{
                  flex: 1,
                  color: address ? colors.text : colors.textSecondary,
                  fontFamily: 'Poppins_400Regular'
                }}>
                  {address || 'Tap to select location on map'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Genre</Text>
            <TouchableOpacity
              style={[
                styles.genreSelector,
                {
                  borderColor: isDark ? '#374151' : '#E5E7EB',
                  backgroundColor: colors.inputBackground
                }
              ]}
            >
              <Text style={[styles.genreText, { color: genre ? colors.text : colors.textSecondary }]}>
                {genre || 'Select Genre'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {renderInput('Description', description, setDescription, true)}

          {renderSectionHeader('Visuals', 'image')}
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={10}
            bucketName="listings"
            userId={id as string}
            folder="groups"
          />

          {renderSectionHeader('Band Members', 'person')}
          <View style={styles.addMemberContainer}>
            <View style={[styles.addMemberInput, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
              <TextInput
                value={newMember}
                onChangeText={setNewMember}
                placeholder="Enter member name"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { fontFamily: 'Poppins_400Regular', color: colors.text }]}
              />
            </View>
            <TouchableOpacity
              onPress={addMember}
              style={[styles.addMemberButton, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.membersList}>
            {members.map((member, index) => (
              <View key={index} style={[styles.memberItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.memberText, { color: colors.text }]}>{member}</Text>
                <TouchableOpacity onPress={() => removeMember(index)}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>


          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={() => router.back()}
            >
              <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Cancel</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Save Changes"
        message="Are you sure you want to update this group profile?"
        buttonText="Save & Update"
        onConfirm={handleSave}
      />

      <LocationPicker
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onSelect={(location) => {
          setAddress(location.address);
          setLatitude(location.lat);
          setLongitude(location.lng);
          setLocationPickerVisible(false);
        }}
        initialLocation={latitude && longitude ? { lat: latitude, lng: longitude } : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  inputContainer: {
    marginBottom: 16,
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
  input: {
    padding: 16,
    textAlignVertical: 'center',
  },
  genreSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  genreText: {
    fontFamily: 'Poppins_400Regular',
  },
  addMemberContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addMemberInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  addMemberButton: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  membersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberText: {
    marginRight: 8,
    fontFamily: 'Poppins_500Medium',
  },
  footerActions: {
    marginTop: 32,
    marginBottom: 20,
  },
  saveButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 16,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 16,
    color: 'white',
    fontFamily: 'Poppins_600SemiBold',
  },
  cancelButton: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderWidth: 1,
  },
});
