import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import LocationPicker from '../src/components/LocationPicker';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function EditStudioScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [studioName, setStudioName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [cost, setCost] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [amenities, setAmenities] = useState<string[]>([]);
  const [newAmenity, setNewAmenity] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

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

      if (profile?.role !== 'studio-owner') {
        Alert.alert('Unauthorized', 'Only studio owners can edit studios.');
        router.replace('/home');
        return;
      }

      setAuthorized(true);
      // Now fetch the studio details
      // fetchStudioDetails(); // This will be called by the other useEffect now
    } catch (e) {
      console.error('Authorization check failed:', e);
      router.replace('/home');
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    // Only refetch if id changes and we're already authorized
    if (authorized && id) {
      fetchStudioDetails();
    }
  }, [id, authorized]);

  const fetchStudioDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'studio', id, userId: user.id }
      });

      if (error) throw error;

      // If no data returned, user doesn't own this studio
      if (!data) {
        Alert.alert('Not Found', 'Studio not found or you do not have permission to edit it.');
        router.replace('/home');
        return;
      }

      setStudioName(data.name);
      setDescription(data.description);
      setAddress(data.address);
      setLatitude(data.latitude || null);
      setLongitude(data.longitude || null);
      setCost(data.hourly_rate?.toString() || '');
      setAmenities(data.amenities || []);
      // setSelectedImages(data.images || []);
    } catch (e) {
      console.log('Error fetching studio details:', e);
      Alert.alert('Error', 'Failed to load studio details.');
      router.replace('/home');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        name: studioName,
        description,
        address,
        hourly_rate: parseFloat(cost) || 0,
        amenities,
        latitude,
        longitude,
        // images: selectedImages,
      };

      const { error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'update', type: 'studio', id: id, userId: user.id, payload }
      });

      if (error) throw error;

      setModalVisible(false);
      console.log('Studio Updated');
      router.back();
    } catch (e) {
      console.log('Error updating studio:', e);
      alert('Failed to update studio');
    }
  };

  const addAmenity = () => {
    if (newAmenity.trim()) {
      setAmenities([...amenities, newAmenity.trim()]);
      setNewAmenity('');
    }
  };

  const removeAmenity = (index: number) => {
    setAmenities(amenities.filter((_, i) => i !== index));
  };

  const renderSectionHeader = (title: string, icon: string) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );

  const renderInput = (label: string, value: string, setValue: (text: string) => void, multiline = false, numeric = false) => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrapper, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={numeric ? 'numeric' : 'default'}
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
          Loading studio details...
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Studio" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {renderSectionHeader('Studio Details', 'business')}
          {renderInput('Studio Name', studioName, setStudioName)}
          {renderInput('Description', description, setDescription, true)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Location</Text>
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
          {renderInput('Hourly Rate (₱)', cost, setCost, false, true)}

          {renderSectionHeader('Facilities & Equipment', 'mic')}
          <View style={styles.addAmenityContainer}>
            <View style={[styles.addAmenityInput, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
              <TextInput
                value={newAmenity}
                onChangeText={setNewAmenity}
                placeholder="e.g. Drum Kit"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { fontFamily: 'Poppins_400Regular', color: colors.text }]}
              />
            </View>
            <TouchableOpacity
              onPress={addAmenity}
              style={[styles.addAmenityButton, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.amenitiesList}>
            {amenities.map((item, index) => (
              <View key={index} style={[styles.amenityItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.amenityText, { color: colors.text }]}>{item}</Text>
                <TouchableOpacity onPress={() => removeAmenity(index)}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {renderSectionHeader('Visuals', 'image')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesContainer}>
            <View style={styles.imagesRow}>
              <TouchableOpacity
                style={[styles.addImageButton, { borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F3F4F6' }]}
              >
                <Ionicons name="add" size={24} color={colors.textSecondary} />
                <Text style={[styles.addImageText, { color: colors.textSecondary }]}>Add Photo</Text>
              </TouchableOpacity>

              {selectedImages.map((uri, index) => (
                <View key={index} style={styles.imageWrapper}>
                  <Image source={{ uri }} style={styles.imageThumbnail} />
                  <TouchableOpacity
                    style={[styles.removeImageButton, { borderColor: isDark ? '#111827' : '#FFFFFF' }]}
                    onPress={() => setSelectedImages(selectedImages.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={[styles.imageHelpText, { color: colors.textSecondary }]}>Hold images to reorder or tap to view.</Text>

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

        <View style={styles.bottomNavbarOverlay}>
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Save Changes"
        message="Are you sure you want to update this studio profile?"
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
    paddingBottom: 100,
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
    paddingVertical: 0,
  },
  addAmenityContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addAmenityInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  addAmenityButton: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  amenitiesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  amenityText: {
    marginRight: 8,
    fontFamily: 'Poppins_500Medium',
  },
  imagesContainer: {
    marginBottom: 8,
  },
  imagesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  addImageButton: {
    width: 96,
    height: 96,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addImageText: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Poppins_500Medium',
  },
  imageWrapper: {
    position: 'relative',
  },
  imageThumbnail: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  imageHelpText: {
    fontSize: 12,
    marginBottom: 16,
    fontFamily: 'Poppins_400Regular',
  },
  footerActions: {
    marginTop: 32,
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
  bottomNavbarOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

