import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import ImageUploader from '../src/components/ImageUploader';
import LocationPicker from '../src/components/LocationPicker';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AddGroupScreen() {
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Musician search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchMusicians = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .eq('role', 'musician')
        .ilike('full_name', `%${query}%`)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching musicians:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const selectMember = (musician: any) => {
    if (!members.includes(musician.full_name)) {
      setMembers([...members, musician.full_name]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  // Images state
  const [images, setImages] = useState<string[]>([]);
  const [thumbnailIndex, setThumbnailIndex] = useState(0);

  const steps = [
    { id: 1, title: 'Group Info', icon: 'people' },
    { id: 2, title: 'Members', icon: 'person-add' },
    { id: 3, title: 'Review', icon: 'checkmark-circle' },
  ];

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
        Alert.alert('Unauthorized', 'Only musicians can create groups.');
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

  const [creating, setCreating] = useState(false);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);

  const validateStep = (currentStep: number): boolean => {
    if (currentStep === 1) {
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
      if (!hourlyRate.trim() || parseFloat(hourlyRate) <= 0) {
        Alert.alert('Required Field', 'Please enter a valid hourly rate');
        return false;
      }
      if (images.length === 0) {
        Alert.alert('Required Field', 'Please upload at least one group photo');
        return false;
      }
    }
    return true;
  };

  const handleNext = async () => {
    if (!validateStep(step)) {
      return;
    }
    
    if (step < 3) {
      setStep(step + 1);
    } else {
      await createGroup();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const createGroup = async () => {
    if (creating) return;
    setCreating(true);

    try {
      // Refresh session to ensure valid token
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !session || !session.user) {
        Alert.alert('Session Expired', 'Please log in again.');
        router.replace('/');
        return;
      }

      const payload = {
        name: groupName,
        location: address,
        genre,
        description,
        members,
        rate: parseFloat(hourlyRate) || 0,
        images: images,
        latitude,
        longitude,
      };

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'create', type: 'group', userId: session.user.id, payload }
      });

      if (error) throw error;

      setNewGroupId(data.id);
      setModalVisible(true);
      console.log('Group Created');
    } catch (e) {
      console.log('Error creating group:', e);
      Alert.alert('Error', 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleSuccessRedirect = () => {
    setModalVisible(false);
    if (newGroupId) {
      router.replace({ pathname: '/manage_group', params: { id: newGroupId } });
    } else {
      router.back();
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

  const addMember = () => {
    if (newMember.trim()) {
      setMembers([...members, newMember.trim()]);
      setNewMember('');
    }
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false, keyboardType: any = 'default') => (
    <View style={styles.inputContainer}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={keyboardType}
          style={[
            styles.textInput,
            {
              color: colors.text,
              minHeight: multiline ? 120 : 56, // Ensure consistent height
              textAlignVertical: multiline ? 'top' : 'center',
              paddingVertical: multiline ? 16 : 0, // Symmetric vertical padding
            }
          ]}
        />
      </View>
    </View>
  );

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Create Group" />

        {/* Enhanced Step Indicator (Fixed at top) */}
        <View style={styles.stepIndicatorContainer}>
          <View style={styles.stepIndicatorContent}>
            {/* Progress Line Background */}
            <View style={[styles.progressLineBg, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

            {/* Active Progress Line */}
            <View
              style={[
                styles.activeProgressLine,
                {
                  width: `${((step - 1) / (steps.length - 1)) * 100}%`,
                  backgroundColor: colors.primary
                }
              ]}
            />

            {steps.map((s) => {
              const isActive = step >= s.id;
              const isCurrent = step === s.id;
              return (
                <View key={s.id} style={styles.stepItem}>
                  <View
                    style={[
                      styles.stepCircle,
                      {
                        backgroundColor: isActive ? colors.primary : (isDark ? '#334155' : '#E5E7EB'),
                        borderColor: isActive ? '#818cf8' : (isDark ? '#1E293B' : '#F3F4F6')
                      }
                    ]}
                  >
                    <Ionicons
                      name={isActive ? "checkmark" : s.icon as any}
                      size={18}
                      color={isActive ? "#fff" : colors.textSecondary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.stepText,
                      {
                        fontFamily: isCurrent ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                        color: isActive ? colors.text : colors.textSecondary,
                        fontWeight: isCurrent ? 'bold' : 'normal'
                      }
                    ]}
                  >
                    {s.title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView
          style={styles.formContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Tell us about your group
              </Text>
              {renderInput('Group Name', groupName, setGroupName, 'e.g. The Sunday Collective')}
              {renderInput('Genre', genre, setGenre, 'e.g. Indie Folk, Jazz')}
              {renderInput('Description', description, setDescription, 'Brief bio about your band...', true)}

              {/* Image Upload */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Group Photos</Text>
                <ImageUploader
                  images={images}
                  onImagesChange={setImages}
                  thumbnailIndex={thumbnailIndex}
                  onThumbnailChange={setThumbnailIndex}
                  maxImages={10}
                  bucketName="listings"
                  userId={newGroupId || 'temp'}
                  folder="groups"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Based Location</Text>
                <TouchableOpacity
                  onPress={() => setLocationPickerVisible(true)}
                  style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB', height: 56, justifyContent: 'center', paddingHorizontal: 16 }]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
                    <Text style={{
                      flex: 1,
                      color: address ? colors.text : colors.textSecondary,
                      fontFamily: 'Poppins_400Regular',
                      textAlignVertical: 'center'
                    }}>
                      {address || 'Tap to select location on map'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {renderInput('Hourly Rate (PHP)', hourlyRate, setHourlyRate, 'e.g. 3000', false, 'numeric')}
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Who's in the band?
              </Text>

              <View style={[styles.addMemberRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
                    <Ionicons name="search" size={20} color={colors.textSecondary} />
                    <TextInput
                      value={searchQuery}
                      onChangeText={searchMusicians}
                      placeholder="Search musicians by name..."
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.textInput, { color: colors.text, flex: 1, height: 50 }]}
                    />
                    {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
                  </View>
                </View>

                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <View style={[styles.searchResultsContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {searchResults.map((musician) => (
                      <TouchableOpacity
                        key={musician.id}
                        onPress={() => selectMember(musician)}
                        style={[styles.searchResultItem, { borderBottomColor: colors.border }]}
                      >
                        <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20', marginRight: 12 }]}>
                          {musician.avatar_url ? (
                            <Image source={{ uri: musician.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                          ) : (
                            <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{musician.full_name.charAt(0)}</Text>
                          )}
                        </View>
                        <View>
                          <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>{musician.full_name}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Musician</Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={24} color={colors.primary} style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {members.length === 0 ? (
                <View style={[styles.dashedBox, { borderColor: isDark ? '#374151' : '#D1D5DB' }]}>
                  <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                  <Text style={[styles.dashedBoxText, { color: colors.textSecondary }]}>
                    No members added yet
                  </Text>
                </View>
              ) : (
                <View style={styles.membersList}>
                  {members.map((member, index) => (
                    <View key={index} style={[styles.memberItem, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#F3F4F6' }]}>
                      <View style={styles.memberInfo}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: '#E0E7FF' }]}>
                          <Text style={styles.avatarText}>{member.charAt(0)}</Text>
                        </View>
                        <Text style={[styles.memberName, { color: colors.text }]}>{member}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeMember(index)}>
                        <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Review Details
              </Text>

              <View style={[styles.reviewContainer, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                <View>
                  <Text style={styles.reviewLabel}>Group Info</Text>
                  <Text style={[styles.reviewValue, { color: colors.text }]}>{groupName || 'No Name'}</Text>
                  <Text style={{ color: colors.textSecondary }}>{genre || 'No Genre'}</Text>
                  <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', marginTop: 4 }}>Rate: ₱{hourlyRate || '0'}/hr</Text>
                </View>

                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                <View>
                  <Text style={styles.reviewLabel}>Members ({members.length})</Text>
                  <View style={styles.tagsWrapper}>
                    {members.map((m, i) => (
                      <View key={i} style={[styles.tag, { backgroundColor: isDark ? '#374151' : 'white', borderColor: isDark ? '#4B5563' : '#E5E7EB' }]}>
                        <Text style={{ fontSize: 12, color: colors.text }}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={styles.termsText}>
                By tapping Create Group, you agree to our Terms and Conditions.
              </Text>
            </View>
          )}

          {/* Navigation Buttons */}
          <View style={styles.navigationButtons}>
            {step > 1 && (
              <TouchableOpacity
                onPress={handleBack}
                disabled={creating}
                style={[styles.backBtn, { borderColor: isDark ? '#374151' : '#E5E7EB', opacity: creating ? 0.5 : 1 }]}
              >
                <Text style={[styles.backBtnText, { color: colors.text }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleNext}
              disabled={creating}
              style={[styles.nextBtn, { backgroundColor: colors.primary, shadowColor: colors.primary, opacity: creating ? 0.7 : 1 }]}
            >
              {creating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.nextBtnText}>
                  {step === 3 ? 'Create Group' : 'Next'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        title="Success!"
        message={`Group "${groupName}" has been successfully created.`}
        buttonText="Manage Group"
        onClose={handleSuccessRedirect}
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
  stepIndicatorContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  stepIndicatorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  progressLineBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  activeProgressLine: {
    position: 'absolute',
    left: 0,
    height: 4,
    top: 20,
    zIndex: 0,
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 10,
    width: 80,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
  },
  stepText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  scrollContent: {
    paddingBottom: 150,
  },
  sectionTitle: {
    fontSize: 20,
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
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
  textInput: {
    paddingHorizontal: 16,
    fontFamily: 'Poppins_400Regular',
  },
  addMemberRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginBottom: 24,
  },
  dashedBoxText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
  membersList: {
    gap: 8,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: 'bold',
    color: '#312E81', // primaryDark approx
  },
  memberName: {
    fontFamily: 'Poppins_500Medium',
  },
  reviewContainer: {
    padding: 16,
    borderRadius: 16,
    gap: 16,
    marginBottom: 16,
  },
  reviewLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#9CA3AF',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  reviewValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
  },
  tagsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    paddingHorizontal: 16,
  },
  navigationButtons: {
    marginTop: 32,
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  backBtnText: {
    fontFamily: 'Poppins_600SemiBold',
  },
  nextBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#fff',
  },
  searchResultsContainer: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
});
