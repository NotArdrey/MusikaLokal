import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
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

export default function EditGigScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [gigName, setGigName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [cost, setCost] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('06:00 PM');
  const [eventEndTime, setEventEndTime] = useState('11:00 PM');
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Mock Data
  const [documents, setDocuments] = useState(['Contract.pdf', 'Rider_v2.pdf']);
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

  // Contract state
  const [contractUrl, setContractUrl] = useState<string>('');
  const [contractFileName, setContractFileName] = useState<string>('');
  const [uploadingContract, setUploadingContract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      if (profile?.role !== 'venue-owner') {
        Alert.alert('Unauthorized', 'Only venue owners can edit gigs.');
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
      fetchGigDetails();
    }
  }, [id, authorized]);

  const fetchGigDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      // Ensure id is a string, not an array
      const gigId = Array.isArray(id) ? id[0] : id;
      if (!gigId) {
        Alert.alert('Error', 'Invalid gig ID');
        router.replace('/home');
        return;
      }

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'gig', id: gigId, userId: user.id }
      });

      if (error) throw error;

      // If no data returned, user doesn't own this gig
      if (!data) {
        Alert.alert('Not Found', 'Gig not found or you do not have permission to edit it.');
        router.replace('/home');
        return;
      }

      setGigName(data.name);
      setDescription(data.description);
      setAddress(data.location);
      setLatitude(data.latitude || null);
      setLongitude(data.longitude || null);
      setCost(data.budget?.toString() || '');
      setEventDate(data.event_date || '');
      // Read event times from requirements JSONB field
      setEventStartTime(data.requirements?.event_start_time || '06:00 PM');
      setEventEndTime(data.requirements?.event_end_time || '11:00 PM');
      setContractUrl(data.contract_url || '');
      if (data.contract_url) {
        const fileName = data.contract_url.split('/').pop() || 'Contract.pdf';
        setContractFileName(decodeURIComponent(fileName));
      }
      setImages(data.images || []);
      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      }
    } catch (e) {
      console.log('Error fetching gig details:', e);
      Alert.alert('Error', 'Failed to load gig details.');
      router.replace('/home');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    if (!gigName.trim()) {
      Alert.alert('Required Field', 'Please enter a gig name');
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
      Alert.alert('Required Field', 'Please enter a valid budget/fee');
      return false;
    }
    if (images.length === 0) {
      Alert.alert('Required Field', 'Please upload at least one event photo');
      return false;
    }
    if (!eventDate.trim()) {
      Alert.alert('Required Field', 'Please select an event date');
      return false;
    }
    if (!eventStartTime || !eventEndTime) {
      Alert.alert('Required Field', 'Please set event start and end times');
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
      const gigId = Array.isArray(id) ? id[0] : id;
      if (!gigId) {
        alert('Invalid gig ID');
        return;
      }

      const payload = {
        name: gigName,
        description,
        location: address,
        budget: parseFloat(cost) || 0,
        images: images,
        contract_url: contractUrl || null,
        latitude,
        longitude,
        event_date: eventDate,
        requirements: {
          event_start_time: eventStartTime,
          event_end_time: eventEndTime,
        },
      };

      console.log('🔵 Updating gig with payload:', JSON.stringify({ action: 'update', type: 'gig', id: gigId, userId: user.id, payload }, null, 2));

      const response = await supabase.functions.invoke('manage-listings', {
        body: { action: 'update', type: 'gig', id: gigId, userId: user.id, payload }
      });

      console.log('🔵 Full response:', response);
      console.log('🔵 Response data:', response.data);
      console.log('🔵 Response error:', response.error);

      // Try to read response body if available
      if ((response as any).response) {
        try {
          const rawResponse = (response as any).response as Response;
          const clonedResponse = rawResponse.clone();
          const responseText = await clonedResponse.text();
          console.log('🔵 Raw response body:', responseText);
          try {
            const responseJson = JSON.parse(responseText);
            console.log('🔵 Parsed response JSON:', responseJson);
          } catch (parseErr) {
            console.log('🔵 Could not parse response as JSON');
          }
        } catch (readErr) {
          console.log('🔵 Could not read raw response:', readErr);
        }
      }

      if (response.error) {
        console.error('❌ Error details:', JSON.stringify(response.error, null, 2));
        // Try to get more error info from data
        if (response.data) {
          console.error('❌ Error data from response:', JSON.stringify(response.data, null, 2));
          throw new Error(JSON.stringify(response.data));
        }
        throw response.error;
      }

      const { data, error } = response;

      setModalVisible(false);
      console.log('✅ Gig Updated successfully');
      if (router.canGoBack()) {
        router.back();
      } else {
        router.push('/manage_gig');
      }
    } catch (e: any) {
      console.error('❌ Error updating gig:', e);
      console.error('❌ Error message:', e?.message);
      console.error('❌ Error stack:', e?.stack);
      console.error('❌ Full error object:', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
      alert(`Failed to update gig: ${e?.message || 'Unknown error'}`);
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
            const arrayBuffer = await response.arrayBuffer();

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
          Loading gig details...
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
        <Header title="Edit Gig" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} style={styles.flex1}>

          {renderSectionHeader('Basic Details', 'information-circle')}
          {renderInput('Gig Title', gigName, setGigName)}
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
          {renderInput('Budget (₱)', cost, setCost, false, true)}

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Event Date</Text>
            <View style={[styles.calendarContainer, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border }]}>
              <Calendar
                current={eventDate || new Date().toISOString().split('T')[0]}
                minDate={new Date().toISOString().split('T')[0]}
                markedDates={{
                  [eventDate]: {
                    selected: true,
                    selectedColor: colors.primary,
                    selectedTextColor: '#FFFFFF'
                  }
                }}
                onDayPress={(day) => {
                  setEventDate(day.dateString);
                }}
                theme={{
                  backgroundColor: 'transparent',
                  calendarBackground: 'transparent',
                  textSectionTitleColor: colors.textSecondary,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: '#FFFFFF',
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: isDark ? '#4B5563' : '#D1D5DB',
                  dotColor: colors.primary,
                  selectedDotColor: '#FFFFFF',
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  indicatorColor: colors.primary,
                  textDayFontFamily: 'Poppins_500Medium',
                  textMonthFontFamily: 'Poppins_600SemiBold',
                  textDayHeaderFontFamily: 'Poppins_500Medium',
                  textDayFontSize: 14,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 12
                }}
              />
              {eventDate && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>
                    Selected: {new Date(eventDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Event Time</Text>
            <View style={[styles.dayCard, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: colors.border, padding: 16 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: 'Poppins_600SemiBold' }}>START TIME</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      value={eventStartTime.split(' ')[0]}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text);
                        const period = eventStartTime.split(' ')[1];
                        setEventStartTime(`${formatted} ${period}`);
                      }}
                      placeholder="06:00"
                      keyboardType="numeric"
                      maxLength={5}
                      style={[styles.timeInput, { backgroundColor: isDark ? '#374151' : 'white', borderColor: colors.border, color: colors.text, flex: 1 }]}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const [time, period] = eventStartTime.split(' ');
                        setEventStartTime(`${time} ${period === 'AM' ? 'PM' : 'AM'}`);
                      }}
                      style={[styles.ampmBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                        {eventStartTime.split(' ')[1]}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} style={{ marginTop: 20 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: 'Poppins_600SemiBold' }}>END TIME</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <TextInput
                      value={eventEndTime.split(' ')[0]}
                      onChangeText={(text) => {
                        const formatted = formatTimeInput(text);
                        const period = eventEndTime.split(' ')[1];
                        setEventEndTime(`${formatted} ${period}`);
                      }}
                      placeholder="11:00"
                      keyboardType="numeric"
                      maxLength={5}
                      style={[styles.timeInput, { backgroundColor: isDark ? '#374151' : 'white', borderColor: colors.border, color: colors.text, flex: 1 }]}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const [time, period] = eventEndTime.split(' ');
                        setEventEndTime(`${time} ${period === 'AM' ? 'PM' : 'AM'}`);
                      }}
                      style={[styles.ampmBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                    >
                      <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                        {eventEndTime.split(' ')[1]}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {renderSectionHeader('Visuals', 'image')}
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            thumbnailIndex={thumbnailIndex}
            onThumbnailChange={setThumbnailIndex}
            maxImages={10}
            bucketName="listings"
            userId={id as string}
            folder="gigs"
          />

          {renderSectionHeader('Contract', 'document-text')}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputSubLabel, { color: colors.textSecondary }]}>
              Upload a PDF contract that musicians will see before applying
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
        message="Are you sure you want to update this gig profile?"
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
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    marginLeft: 8,
    fontFamily: 'Poppins_600SemiBold',
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
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  timeInput: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  ampmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  calendarContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
});

