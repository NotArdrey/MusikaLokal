import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import ImageUploader from '../src/components/ImageUploader';
import LocationPicker from '../src/components/LocationPicker';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function AddGroupScreen() {
  const { colors, isDark } = useTheme();
  const { isSystemLocked, showLockAlert } = useAuth();
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
  // Group type: duo (exactly 2 members) or band (3+ members)
  const [groupType, setGroupType] = useState<'duo' | 'band'>('band');
  // Enhanced member structure: { name, instrument, role?, user_id?, avatar_url? }
  interface MemberDetail {
    name: string;
    instrument: string;
    role?: string;  // "Leader" for group creator
    user_id?: string;
    avatar_url?: string;
  }
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberInstrument, setNewMemberInstrument] = useState('');
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Custom Alert State
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

  // Pending member to add (need to select instrument first)
  const [pendingMember, setPendingMember] = useState<any>(null);

  const selectMember = (musician: any) => {
    // Check if already added
    if (members.some(m => m.user_id === musician.id || m.name === musician.full_name)) {
      showAlert('warning', 'Already Added', 'This musician is already in the group.');
      setSearchQuery('');
      setSearchResults([]);
      return;
    }
    // Set as pending and prompt for instrument
    setPendingMember(musician);
    setSearchQuery('');
    setSearchResults([]);
  };

  const confirmAddMember = (instrument: string) => {
    if (pendingMember && instrument.trim()) {
      const newMember: MemberDetail = {
        name: pendingMember.full_name,
        instrument: instrument.trim(),
        user_id: pendingMember.id,
        avatar_url: pendingMember.avatar_url
      };
      setMembers([...members, newMember]);
      setPendingMember(null);
      setNewMemberInstrument('');
    }
  };

  const addManualMember = () => {
    if (newMemberName.trim() && newMemberInstrument.trim()) {
      const newMember: MemberDetail = {
        name: newMemberName.trim(),
        instrument: newMemberInstrument.trim()
      };
      setMembers([...members, newMember]);
      setNewMemberName('');
      setNewMemberInstrument('');
      setShowAddMemberForm(false);
    }
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

      // Store current user info and add them as first member with Leader role
      setCurrentUserId(user.id);
      const userName = profile?.full_name || 'Me';
      setCurrentUserName(userName);
      // Add as first member with Leader role - instrument to be filled in step 2
      setMembers([{
        name: userName,
        instrument: '', // Will prompt to fill in step 2
        role: 'Leader',
        user_id: user.id,
        avatar_url: profile?.avatar_url
      }]);

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
        showAlert('error', 'Required Field', 'Please enter a group name');
        return false;
      }
      if (!genre.trim()) {
        showAlert('error', 'Required Field', 'Please enter a genre');
        return false;
      }
      if (!description.trim()) {
        showAlert('error', 'Required Field', 'Please enter a description');
        return false;
      }
      if (!address || !latitude || !longitude) {
        showAlert('error', 'Required Field', 'Please select a location on the map');
        return false;
      }
      if (!hourlyRate.trim() || parseFloat(hourlyRate) <= 0) {
        showAlert('error', 'Required Field', 'Please enter a valid hourly rate');
        return false;
      }
      if (images.length === 0) {
        showAlert('error', 'Required Field', 'Please upload at least one group photo');
        return false;
      }
    }
    if (currentStep === 2) {
      // Validate leader (first member) has an instrument/role
      const leader = members.find(m => m.role === 'Leader');
      if (!leader?.instrument?.trim()) {
        showAlert('error', 'Leader Instrument Required', 'Please enter your instrument/role as the group leader.');
        return false;
      }
      // Validate all members have instruments
      const memberWithoutInstrument = members.find(m => !m.instrument?.trim());
      if (memberWithoutInstrument) {
        showAlert('error', 'Missing Instrument', `Please enter an instrument for ${memberWithoutInstrument.name}`);
        return false;
      }
      // Validate member count based on group type
      if (groupType === 'duo') {
        if (members.length !== 2) {
          showAlert('warning', 'Duo Requirement', 'A duo must have exactly 2 members (including yourself).');
          return false;
        }
      } else {
        // Band requires 3 or more members
        if (members.length < 3) {
          showAlert('warning', 'Band Requirement', 'A band must have at least 3 members. Add more members or switch to "Duo" type.');
          return false;
        }
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
      // System lock check
      if (isSystemLocked) {
        showLockAlert();
        return;
      }

      // Confirmation before creating - use native Alert for reliability
      Alert.alert(
        'Confirm Group Creation',
        'Are you sure you want to create this group? Please review all details before proceeding.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create', onPress: () => createGroup() }
        ]
      );
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
        showAlert('error', 'Session Expired', 'Please log in again.');
        router.replace('/');
        return;
      }

      const orderedImages = images.length > 0 && images[thumbnailIndex]
        ? [images[thumbnailIndex], ...images.filter((_, i) => i !== thumbnailIndex)]
        : images;

      const payload = {
        name: groupName,
        location: address,
        genre,
        description,
        members,
        rate: parseFloat(hourlyRate) || 0,
        images: orderedImages,
        latitude,
        longitude,
        group_type: groupType, // 'duo' or 'band'
      };

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'create', type: 'group', userId: session.user.id, payload }
      });

      if (error) throw error;

      setNewGroupId(data.id);
      setModalVisible(true);
      console.log('Group Created');
    } catch (e: any) {
      console.log('Error creating group:', e);
      showAlert('error', 'Error', 'Failed to create group');
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

  const removeMember = (index: number) => {
    // Prevent removing yourself (first member)
    if (index === 0) {
      Alert.alert('Cannot Remove', 'You cannot remove yourself from the group.');
      return;
    }
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

              {/* Group Type Selection */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Group Type</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setGroupType('duo')}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor: groupType === 'duo' ? colors.primary : colors.inputBackground,
                        borderColor: groupType === 'duo' ? colors.primary : (isDark ? '#374151' : '#E5E7EB'),
                        flex: 1
                      }
                    ]}
                  >
                    <Ionicons
                      name="people-outline"
                      size={24}
                      color={groupType === 'duo' ? '#FFF' : colors.text}
                    />
                    <Text style={{
                      color: groupType === 'duo' ? '#FFF' : colors.text,
                      fontFamily: 'Poppins_600SemiBold',
                      fontSize: 16,
                      marginTop: 4
                    }}>
                      Duo
                    </Text>
                    <Text style={{
                      color: groupType === 'duo' ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
                      fontFamily: 'Poppins_400Regular',
                      fontSize: 12
                    }}>
                      Exactly 2 members
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setGroupType('band')}
                    style={[
                      styles.typeButton,
                      {
                        backgroundColor: groupType === 'band' ? colors.primary : colors.inputBackground,
                        borderColor: groupType === 'band' ? colors.primary : (isDark ? '#374151' : '#E5E7EB'),
                        flex: 1
                      }
                    ]}
                  >
                    <Ionicons
                      name="musical-notes-outline"
                      size={24}
                      color={groupType === 'band' ? '#FFF' : colors.text}
                    />
                    <Text style={{
                      color: groupType === 'band' ? '#FFF' : colors.text,
                      fontFamily: 'Poppins_600SemiBold',
                      fontSize: 16,
                      marginTop: 4
                    }}>
                      Band
                    </Text>
                    <Text style={{
                      color: groupType === 'band' ? 'rgba(255,255,255,0.8)' : colors.textSecondary,
                      fontFamily: 'Poppins_400Regular',
                      fontSize: 12
                    }}>
                      3 or more members
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

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
                Who's in the {groupType === 'duo' ? 'duo' : 'band'}?
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16, fontFamily: 'Poppins_400Regular' }}>
                {groupType === 'duo' 
                  ? 'Add yourself and one other member (exactly 2 members required).'
                  : 'Add yourself and at least 2 other members (minimum 3 members required).'}
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

              {/* Pending Member Instrument Selection */}
              {pendingMember && (
                <View style={[styles.memberItem, { backgroundColor: colors.primary + '10', borderColor: colors.primary, marginBottom: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary + '20', marginRight: 12 }]}>
                        {pendingMember.avatar_url ? (
                          <Image source={{ uri: pendingMember.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                        ) : (
                          <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{pendingMember.full_name?.charAt(0)}</Text>
                        )}
                      </View>
                      <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>{pendingMember.full_name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={newMemberInstrument}
                        onChangeText={setNewMemberInstrument}
                        placeholder="Enter instrument (e.g., Vocals, Guitar)"
                        placeholderTextColor={colors.textSecondary}
                        style={[styles.textInput, { flex: 1, backgroundColor: colors.inputBackground, borderRadius: 8, height: 40, paddingHorizontal: 12, color: colors.text }]}
                      />
                      <TouchableOpacity
                        onPress={() => confirmAddMember(newMemberInstrument)}
                        style={[styles.addBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { setPendingMember(null); setNewMemberInstrument(''); }}
                        style={[styles.addBtn, { backgroundColor: '#EF4444' }]}
                      >
                        <Ionicons name="close" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {/* Manual Add Member Form */}
              {!pendingMember && (
                <TouchableOpacity
                  onPress={() => setShowAddMemberForm(!showAddMemberForm)}
                  style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}
                >
                  <Ionicons name={showAddMemberForm ? "chevron-down" : "chevron-forward"} size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontFamily: 'Poppins_500Medium' }}>
                    {showAddMemberForm ? 'Hide manual entry' : 'Or add member manually'}
                  </Text>
                </TouchableOpacity>
              )}

              {showAddMemberForm && !pendingMember && (
                <View style={[styles.memberItem, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB', marginBottom: 16 }]}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <TextInput
                      value={newMemberName}
                      onChangeText={setNewMemberName}
                      placeholder="Member name"
                      placeholderTextColor={colors.textSecondary}
                      style={[styles.textInput, { backgroundColor: colors.inputBackground, borderRadius: 8, height: 40, paddingHorizontal: 12, color: colors.text }]}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={newMemberInstrument}
                        onChangeText={setNewMemberInstrument}
                        placeholder="Instrument (e.g., Drums, Bass)"
                        placeholderTextColor={colors.textSecondary}
                        style={[styles.textInput, { flex: 1, backgroundColor: colors.inputBackground, borderRadius: 8, height: 40, paddingHorizontal: 12, color: colors.text }]}
                      />
                      <TouchableOpacity
                        onPress={addManualMember}
                        disabled={!newMemberName.trim() || !newMemberInstrument.trim()}
                        style={[styles.addBtn, { backgroundColor: (!newMemberName.trim() || !newMemberInstrument.trim()) ? '#9CA3AF' : colors.primary }]}
                      >
                        <Ionicons name="add" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {members.length === 0 ? (
                <View style={[styles.dashedBox, { borderColor: isDark ? '#374151' : '#D1D5DB' }]}>
                  <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                  <Text style={[styles.dashedBoxText, { color: colors.textSecondary }]}>
                    No members added yet
                  </Text>
                </View>
              ) : (
                <View style={styles.membersList}>
                  {members.map((member, index) => {
                    const isLeader = member.role === 'Leader';
                    const needsInstrument = isLeader && !member.instrument;
                    return (
                      <View key={index} style={[styles.memberItem, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: needsInstrument ? '#F59E0B' : (isDark ? '#374151' : '#F3F4F6') }]}>
                        <View style={styles.memberInfo}>
                          <View style={[styles.avatarPlaceholder, { backgroundColor: isLeader ? colors.primary : '#E0E7FF' }]}>
                            {member.avatar_url ? (
                              <Image source={{ uri: member.avatar_url }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                            ) : (
                              <Text style={[styles.avatarText, { color: isLeader ? '#fff' : '#4F46E5' }]}>{member.name?.charAt(0)}</Text>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.memberName, { color: colors.text }]}>{member.name}</Text>
                            {needsInstrument ? (
                              <TextInput
                                placeholder="Enter your instrument..."
                                placeholderTextColor={colors.textSecondary}
                                value={members[0]?.instrument || ''}
                                onChangeText={(text) => {
                                  const updated = [...members];
                                  updated[0] = { ...updated[0], instrument: text };
                                  setMembers(updated);
                                }}
                                style={{ fontSize: 12, color: colors.primary, fontFamily: 'Poppins_400Regular', paddingVertical: 2, borderBottomWidth: 1, borderBottomColor: '#F59E0B' }}
                              />
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="musical-note" size={12} color={colors.primary} />
                                <Text style={{ fontSize: 11, color: colors.primary, fontFamily: 'Poppins_500Medium' }}>{member.instrument}</Text>
                                {isLeader && <Text style={{ fontSize: 10, color: colors.textSecondary }}> • Leader</Text>}
                              </View>
                            )}
                          </View>
                        </View>
                        {!isLeader && (
                          <TouchableOpacity onPress={() => removeMember(index)}>
                            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
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
                  <View style={{ gap: 8 }}>
                    {members.map((m, i) => (
                      <View key={i} style={[styles.tag, { backgroundColor: isDark ? '#374151' : 'white', borderColor: isDark ? '#4B5563' : '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 }]}>
                        <Ionicons name={m.role === 'Leader' ? 'star' : 'person'} size={14} color={m.role === 'Leader' ? colors.primary : colors.textSecondary} style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, color: colors.text, fontFamily: 'Poppins_500Medium' }}>{m.name}</Text>
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>{m.instrument}{m.role === 'Leader' ? ' • Leader' : ''}</Text>
                        </View>
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
                activeOpacity={0.8}
                style={[
                  styles.backBtn, 
                  { 
                    borderColor: isDark ? '#6366F1' : '#E5E7EB',
                    backgroundColor: isDark ? 'transparent' : '#fff',
                    opacity: creating ? 0.5 : 1 
                  }
                ]}
              >
                <Text style={[styles.backBtnText, { color: isDark ? '#A5B4FC' : colors.text }]}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleNext}
              disabled={creating}
              activeOpacity={0.8}
              style={[
                styles.nextBtn, 
                { 
                  backgroundColor: creating ? (isDark ? '#4338CA' : '#9CA3AF') : colors.primary,
                  opacity: creating ? 0.7 : 1,
                },
                step > 1 ? { flex: 1 } : { width: '100%' }
              ]}
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
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
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
    justifyContent: 'center',
    borderWidth: 1,
    height: 56,
  },
  backBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  nextBtn: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
  },
  nextBtnText: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#fff',
    fontSize: 16,
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
  typeButton: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
