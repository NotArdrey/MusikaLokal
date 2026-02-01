import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal as RNModal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

  // Rate
  const [rate, setRate] = useState('');

  // Leadership Transfer State
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [pendingTransfer, setPendingTransfer] = useState<any>(null);
  const [selectedNewLeader, setSelectedNewLeader] = useState<any>(null);
  const [transferMessage, setTransferMessage] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

      // Store user ID for leadership transfer
      setCurrentUserId(user.id);

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
      setImages(data.images || []);
      setRate(data.rate?.toString() || '');
      if (data.images && data.images.length > 0) {
        setThumbnailIndex(0);
      }
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
    if (!rate.trim() || parseFloat(rate) <= 0) {
      Alert.alert('Required Field', 'Please enter a valid hourly rate');
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
        rate: parseFloat(rate) || 0,
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
    members.filter((_, i) => i !== index);
    setMembers(members.filter((_, i) => i !== index));
  };

  // ============================================================
  // Leadership Transfer Functions
  // ============================================================

  // Fetch actual group members from group_members table
  const fetchGroupMembers = async () => {
    if (!id) return;

    try {
      const groupId = Array.isArray(id) ? id[0] : id;
      const { data, error } = await supabase
        .from('group_members')
        .select('user_id, role, profiles:user_id(id, full_name, avatar_url)')
        .eq('group_id', groupId);

      if (error) {
        console.log('Error fetching group members:', error);
        return;
      }

      // Only include members who aren't the current user (can't transfer to yourself)
      const filteredMembers = (data || [])
        .filter((m: any) => m.user_id !== currentUserId)
        .map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          full_name: m.profiles?.full_name || 'Unknown',
          avatar_url: m.profiles?.avatar_url
        }));

      setGroupMembers(filteredMembers);
    } catch (e) {
      console.error('Error fetching group members:', e);
    }
  };

  // Fetch pending transfer request for this group
  const fetchPendingTransfer = async () => {
    if (!id) return;

    try {
      const groupId = Array.isArray(id) ? id[0] : id;
      const { data, error } = await supabase
        .from('leadership_transfer_requests')
        .select('*, to_user:to_user_id(full_name, avatar_url)')
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) {
        console.log('Error fetching pending transfer:', error);
        return;
      }

      setPendingTransfer(data);
    } catch (e) {
      console.error('Error fetching pending transfer:', e);
    }
  };

  // Initiate leadership transfer
  const initiateTransfer = async () => {
    if (!selectedNewLeader || !id || !currentUserId) return;

    setIsTransferring(true);
    try {
      const groupId = Array.isArray(id) ? id[0] : id;

      // Create transfer request
      const { data, error } = await supabase
        .from('leadership_transfer_requests')
        .insert({
          group_id: groupId,
          from_user_id: currentUserId,
          to_user_id: selectedNewLeader.user_id,
          message: transferMessage || null,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating transfer request:', error);
        Alert.alert('Error', 'Failed to send transfer request. ' + (error.message || ''));
        return;
      }

      // Send notification to new leader
      await supabase.from('notifications').insert({
        user_id: selectedNewLeader.user_id,
        type: 'info',
        title: 'Leadership Transfer Request',
        message: `You have been invited to become the leader of "${groupName}". Open to accept or decline.`,
        meta: {
          type: 'leadership_transfer',
          request_id: data.id,
          group_id: groupId,
          group_name: groupName
        }
      });

      Alert.alert(
        'Request Sent',
        `Leadership transfer request sent to ${selectedNewLeader.full_name}. They must accept to complete the transfer.`
      );

      // Reset and refresh
      setTransferModalVisible(false);
      setSelectedNewLeader(null);
      setTransferMessage('');
      fetchPendingTransfer();

    } catch (e) {
      console.error('Error initiating transfer:', e);
      Alert.alert('Error', 'Failed to send transfer request.');
    } finally {
      setIsTransferring(false);
    }
  };

  // Cancel pending transfer
  const cancelTransfer = async () => {
    if (!pendingTransfer) return;

    Alert.alert(
      'Cancel Transfer',
      'Are you sure you want to cancel this leadership transfer request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('cancel_leadership_transfer', {
                request_id: pendingTransfer.id
              });

              if (error) throw error;

              Alert.alert('Cancelled', 'Transfer request has been cancelled.');
              setPendingTransfer(null);
            } catch (e) {
              console.error('Error cancelling transfer:', e);
              Alert.alert('Error', 'Failed to cancel transfer request.');
            }
          }
        }
      ]
    );
  };

  // Fetch group members and pending transfer when group loads
  useEffect(() => {
    if (authorized && id && currentUserId) {
      fetchGroupMembers();
      fetchPendingTransfer();
    }
  }, [authorized, id, currentUserId]);

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

          {renderInput('Genre', genre, setGenre)}

          {renderInput('Description', description, setDescription, true)}

          {renderSectionHeader('Pricing', 'cash')}
          <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Hourly Rate (PHP)</Text>
            <View style={[styles.inputWrapper, { borderColor: isDark ? '#374151' : '#E5E7EB', backgroundColor: colors.inputBackground }]}>
              <TextInput
                value={rate}
                onChangeText={setRate}
                keyboardType="numeric"
                placeholder="e.g. 3000"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  {
                    fontFamily: 'Poppins_400Regular',
                    color: colors.text,
                  }
                ]}
              />
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

          {/* Leadership Transfer Section */}
          {renderSectionHeader('Leadership', 'shield-checkmark')}

          {/* Pending Transfer Warning */}
          {pendingTransfer && (
            <View style={[styles.warningBox, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Ionicons name="time-outline" size={20} color="#F59E0B" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.warningTitle, { color: colors.text }]}>
                    Transfer Pending
                  </Text>
                  <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                    Waiting for {pendingTransfer.to_user?.full_name || 'member'} to accept
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={cancelTransfer} style={styles.cancelTransferButton}>
                <Text style={{ color: '#EF4444', fontFamily: 'Poppins_600SemiBold', fontSize: 12 }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Transfer Leadership Button */}
          {!pendingTransfer && (
            <TouchableOpacity
              style={[styles.transferButton, { borderColor: '#F59E0B' }]}
              onPress={() => {
                if (groupMembers.length === 0) {
                  Alert.alert(
                    'No Eligible Members',
                    'There are no other members in the group_members table to transfer leadership to. Add members to the group first.'
                  );
                  return;
                }
                setTransferModalVisible(true);
              }}
            >
              <Ionicons name="swap-horizontal" size={20} color="#F59E0B" />
              <Text style={[styles.transferButtonText, { color: '#F59E0B' }]}>
                Transfer Leadership
              </Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.transferHint, { color: colors.textSecondary }]}>
            Transfer ownership requires the new leader to accept the request.
          </Text>

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

      {/* Leadership Transfer Modal */}
      <RNModal
        visible={transferModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTransferModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={[styles.transferModalContent, { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]}>
            <Text style={[styles.transferModalTitle, { color: colors.text }]}>
              Transfer Leadership
            </Text>
            <Text style={[styles.transferModalSubtitle, { color: colors.textSecondary }]}>
              Select a group member to become the new leader
            </Text>

            {/* Member List */}
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {groupMembers.length === 0 ? (
                <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 }}>
                  No other members available. Add members to the group first.
                </Text>
              ) : (
                groupMembers.map((member) => (
                  <TouchableOpacity
                    key={member.user_id}
                    style={[
                      styles.memberSelectItem,
                      {
                        backgroundColor: selectedNewLeader?.user_id === member.user_id ? colors.primary + '20' : colors.surface,
                        borderColor: selectedNewLeader?.user_id === member.user_id ? colors.primary : 'transparent'
                      }
                    ]}
                    onPress={() => setSelectedNewLeader(member)}
                  >
                    <Image
                      source={{ uri: member.avatar_url || 'https://via.placeholder.com/44' }}
                      style={[styles.memberAvatar, { backgroundColor: colors.border }]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.memberName, { color: colors.text }]}>{member.full_name}</Text>
                      <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
                        {member.role === 'admin' ? 'Admin' : 'Member'}
                      </Text>
                    </View>
                    {selectedNewLeader?.user_id === member.user_id && (
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            {/* Optional Message */}
            {selectedNewLeader && (
              <TextInput
                placeholder="Add a message (optional)"
                placeholderTextColor={colors.textSecondary}
                value={transferMessage}
                onChangeText={setTransferMessage}
                multiline
                style={[styles.transferMessageInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBackground }]}
              />
            )}

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.cancelButton, { flex: 1, borderColor: colors.border }]}
                onPress={() => {
                  setTransferModalVisible(false);
                  setSelectedNewLeader(null);
                  setTransferMessage('');
                }}
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.transferConfirmButton,
                  { flex: 1, backgroundColor: selectedNewLeader ? '#F59E0B' : colors.border }
                ]}
                onPress={initiateTransfer}
                disabled={!selectedNewLeader || isTransferring}
              >
                {isTransferring ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.transferConfirmButtonText}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </RNModal>
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
    paddingBottom: 160,
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
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
  // Leadership Transfer Styles
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  warningTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  warningText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  cancelTransferButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  transferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  transferButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  transferHint: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  transferModalContent: {
    padding: 24,
  },
  transferModalTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 18,
    marginBottom: 8,
  },
  transferModalSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    marginBottom: 24,
  },
  memberSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  memberName: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
  },
  memberRole: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  transferMessageInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: 'Poppins_400Regular',
  },
  transferConfirmButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  transferConfirmButtonText: {
    color: 'white',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
});
