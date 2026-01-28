import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import ImageUploader from '../src/components/ImageUploader';
import LocationPicker from '../src/components/LocationPicker';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';

// Helper function to format time input
const formatTimeInput = (text: string): string => {
    // Remove all non-digit characters except colon
    let cleaned = text.replace(/[^0-9:]/g, '');
    
    // Limit to 5 characters (HH:MM)
    if (cleaned.length > 5) cleaned = cleaned.substring(0, 5);
    
    // Auto-add colon after 2 digits
    if (cleaned.length === 2 && !cleaned.includes(':')) {
        cleaned = cleaned + ':';
    }
    
    // If user types more than 2 digits before colon, insert colon
    if (cleaned.length > 2 && !cleaned.includes(':')) {
        cleaned = cleaned.substring(0, 2) + ':' + cleaned.substring(2);
    }
    
    // Validate hour (01-12)
    const parts = cleaned.split(':');
    if (parts[0] && parts[0].length === 2) {
        const hour = parseInt(parts[0]);
        if (hour < 1 || hour > 12) {
            return cleaned.substring(0, 1);
        }
    }
    
    // Validate minute (00-59)
    if (parts[1] && parts[1].length === 2) {
        const minute = parseInt(parts[1]);
        if (minute > 59) {
            return parts[0] + ':' + parts[1].substring(0, 1);
        }
    }
    
    return cleaned;
};

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
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

  // Contract state
  const [contractUrl, setContractUrl] = useState<string>('');
  const [contractFileName, setContractFileName] = useState<string>('');
  const [uploadingContract, setUploadingContract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Availability state
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const [availability, setAvailability] = useState<{ day: string; slots: { start: string; end: string }[] }[]>(
    daysOfWeek.map(day => ({ day, slots: [] }))
  );

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

      // Ensure id is a string, not an array
      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        Alert.alert('Error', 'Invalid studio ID');
        router.replace('/home');
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'studio', id: studioId, userId: user.id }
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
      setContractUrl(data.contract_url || '');
      if (data.contract_url) {
        const fileName = data.contract_url.split('/').pop() || 'Contract.pdf';
        setContractFileName(decodeURIComponent(fileName));
      }
      
      // Load availability
      if (data.availability && Array.isArray(data.availability)) {
        const loadedAvailability = daysOfWeek.map(day => {
          const dayData = data.availability.find((a: any) => a.day === day);
          return {
            day,
            slots: dayData?.slots || []
          };
        });
        setAvailability(loadedAvailability);
      }
      // setSelectedImages(data.images || []);
    } catch (e) {
      console.log('Error fetching studio details:', e);
      Alert.alert('Error', 'Failed to load studio details.');
      router.replace('/home');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (!studioName.trim()) {
      Alert.alert('Required Field', 'Please enter a studio name');
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
    if (!cost.trim() || parseFloat(cost) <= 0) {
      Alert.alert('Required Field', 'Please enter a valid hourly rate');
      return false;
    }
    if (selectedImages.length === 0) {
      Alert.alert('Required Field', 'Please upload at least one studio photo');
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
      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        alert('Invalid studio ID');
        return;
      }

      const payload = {
        name: studioName,
        description,
        address,
        hourly_rate: parseFloat(cost) || 0,
        amenities,
        latitude,
        longitude,
        images: selectedImages,
        contract_url: contractUrl || null,
        availability: availability
          .filter(day => day.slots.length > 0)
          .map(day => ({
            day: day.day,
            slots: day.slots.map(slot => ({
              start: slot.start,
              end: slot.end
            }))
          }))
      };

      console.log('🔵 Updating studio with payload:', JSON.stringify({ action: 'update', type: 'studio', id: studioId, userId: user.id, payload }, null, 2));

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'update', type: 'studio', id: studioId, userId: user.id, payload }
      });

      console.log('🔵 Response:', { data, error });

      if (error) {
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      setModalVisible(false);
      console.log('✅ Studio Updated successfully');
      if (router.canGoBack()) {
        router.back();
      } else {
        router.push('/manage_studio');
      }
    } catch (e: any) {
      console.error('❌ Error updating studio:', e);
      console.error('❌ Error message:', e?.message);
      console.error('❌ Error stack:', e?.stack);
      console.error('❌ Full error object:', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      alert(`Failed to update studio: ${e?.message || 'Unknown error'}`);
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

  const handleContractUpload = async () => {
    try {
      setUploadingContract(true);
      
      if (Platform.OS === 'web') {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
        setUploadingContract(false);
        return;
      }
      
      // Dynamic import for native platforms only
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setUploadingContract(false);
        return;
      }

      const file = result.assets[0];
      const fileName = file.name;
      const fileUri = file.uri;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        setUploadingContract(false);
        return;
      }

      const response = await fetch(fileUri);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, bytes, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setContractUrl(publicUrl);
      setContractFileName(fileName);
      Alert.alert('Success', 'Contract uploaded successfully!');
    } catch (error) {
      console.error('Error uploading contract:', error);
      Alert.alert('Error', 'Failed to upload contract. Please try again.');
    } finally {
      setUploadingContract(false);
    }
  };

  const removeContract = () => {
    setContractUrl('');
    setContractFileName('');
  };

  const handleWebFileSelect = async (event: any) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingContract(true);
      const fileName = file.name;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        setUploadingContract(false);
        return;
      }

      const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setContractUrl(publicUrl);
      setContractFileName(fileName);
      Alert.alert('Success', 'Contract uploaded successfully!');
    } catch (error) {
      console.error('Error uploading contract:', error);
      Alert.alert('Error', 'Failed to upload contract. Please try again.');
    } finally {
      setUploadingContract(false);
      if (event.target) {
        event.target.value = '';
      }
    }
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
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef as any}
          type="file"
          accept="application/pdf"
          onChange={handleWebFileSelect}
          style={{ display: 'none' }}
        />
      )}
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Edit Studio" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={styles.flex1}>

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

          {/* Contract Upload */}
          {renderSectionHeader('Contract', 'document-text')}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputSubLabel, { color: colors.textSecondary }]}>
              Upload a PDF contract that musicians will see before booking
            </Text>
            {contractUrl ? (
              <View style={[styles.contractPreview, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={[styles.pdfIcon, { backgroundColor: colors.primary }]}>
                    <Ionicons name="document-text" size={24} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.contractFileName, { color: colors.text }]} numberOfLines={1}>
                      {contractFileName}
                    </Text>
                    <Text style={[styles.contractFileSize, { color: colors.textSecondary }]}>
                      PDF Document
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={removeContract} style={styles.removeContractBtn}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleContractUpload}
                disabled={uploadingContract}
                style={[styles.uploadContractBtn, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}
              >
                {uploadingContract ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={32} color={colors.textSecondary} />
                    <Text style={[styles.uploadText, { color: colors.text }]}>
                      Upload Contract (PDF)
                    </Text>
                    <Text style={[styles.uploadSubText, { color: colors.textSecondary }]}>
                      Tap to browse files
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

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

          {renderSectionHeader('Availability', 'time')}
          <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: 16 }]}>
            Set your studio availability for bookings
          </Text>

          {availability.map((daySchedule, dayIndex) => (
            <View key={daySchedule.day} style={[styles.dayCard, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: colors.border, marginBottom: 12 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.dayLabel, { color: colors.text }]}>{daySchedule.day}</Text>
                <TouchableOpacity
                  onPress={() => {
                    const newAvailability = [...availability];
                    if (newAvailability[dayIndex].slots.length === 0) {
                      newAvailability[dayIndex].slots.push({ start: '09:00 AM', end: '05:00 PM' });
                    } else {
                      newAvailability[dayIndex].slots = [];
                    }
                    setAvailability(newAvailability);
                  }}
                  style={[styles.toggleBtn, { backgroundColor: daySchedule.slots.length > 0 ? colors.primary : (isDark ? '#374151' : '#E5E7EB') }]}
                >
                  <Text style={{ color: daySchedule.slots.length > 0 ? '#FFFFFF' : colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>
                    {daySchedule.slots.length > 0 ? 'Available' : 'Closed'}
                  </Text>
                </TouchableOpacity>
              </View>

              {daySchedule.slots.map((slot, slotIndex) => {
                const toggleAmPm = (timeStr: string) => {
                  const [time, period] = timeStr.split(' ');
                  return `${time} ${period === 'AM' ? 'PM' : 'AM'}`;
                };

                return (
                  <View key={slotIndex} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: 'Poppins_600SemiBold' }}>START</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <TextInput
                          value={slot.start.split(' ')[0]}
                          onChangeText={(text) => {
                            const formatted = formatTimeInput(text);
                            const newAvailability = [...availability];
                            const period = slot.start.split(' ')[1];
                            newAvailability[dayIndex].slots[slotIndex].start = `${formatted} ${period}`;
                            setAvailability(newAvailability);
                          }}
                          placeholder="09:00"
                          keyboardType="numeric"
                          maxLength={5}
                          style={[styles.timeInput, { backgroundColor: isDark ? '#374151' : 'white', borderColor: colors.border, color: colors.text, flex: 1 }]}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            const newAvailability = [...availability];
                            newAvailability[dayIndex].slots[slotIndex].start = toggleAmPm(slot.start);
                            setAvailability(newAvailability);
                          }}
                          style={[styles.ampmBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                        >
                          <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                            {slot.start.split(' ')[1]}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} style={{ marginTop: 20 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: 'Poppins_600SemiBold' }}>END</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <TextInput
                          value={slot.end.split(' ')[0]}
                          onChangeText={(text) => {
                            const formatted = formatTimeInput(text);
                            const newAvailability = [...availability];
                            const period = slot.end.split(' ')[1];
                            newAvailability[dayIndex].slots[slotIndex].end = `${formatted} ${period}`;
                            setAvailability(newAvailability);
                          }}
                          placeholder="05:00"
                          keyboardType="numeric"
                          maxLength={5}
                          style={[styles.timeInput, { backgroundColor: isDark ? '#374151' : 'white', borderColor: colors.border, color: colors.text, flex: 1 }]}
                        />
                        <TouchableOpacity
                          onPress={() => {
                            const newAvailability = [...availability];
                            newAvailability[dayIndex].slots[slotIndex].end = toggleAmPm(slot.end);
                            setAvailability(newAvailability);
                          }}
                          style={[styles.ampmBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                        >
                          <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                            {slot.end.split(' ')[1]}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {daySchedule.slots.length > 1 && (
                      <TouchableOpacity
                        onPress={() => {
                          const newAvailability = [...availability];
                          newAvailability[dayIndex].slots.splice(slotIndex, 1);
                          setAvailability(newAvailability);
                        }}
                        style={{ marginTop: 20 }}
                      >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}

              {daySchedule.slots.length > 0 && daySchedule.slots.length < 3 && (
                <TouchableOpacity
                  onPress={() => {
                    const newAvailability = [...availability];
                    newAvailability[dayIndex].slots.push({ start: '06:00 PM', end: '09:00 PM' });
                    setAvailability(newAvailability);
                  }}
                  style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>Add Time Slot</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {renderSectionHeader('Visuals', 'image')}
          <ImageUploader
            images={selectedImages}
            onImagesChange={setSelectedImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={10}
            bucketName="listings"
            userId={id as string}
            folder="studios"
          />

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
  inputSubLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 8,
  },
  uploadContractBtn: {
    padding: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadText: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    marginTop: 8,
  },
  uploadSubText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  contractPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  pdfIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractFileName: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  contractFileSize: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  removeContractBtn: {
    padding: 8,
  },
  dayCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  dayLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeInput: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
  },
  ampmBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
});

