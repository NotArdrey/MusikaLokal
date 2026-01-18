import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
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
  const [selectedImage, setSelectedImage] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  // Members
  const [members, setMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState('');

  React.useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'group', id, userId: user.id }
      });

      if (error) throw error;
      if (data) {
        setGroupName(data.name);
        setGenre(data.genre);
        setDescription(data.description);
        setMembers(data.members || []);
        // setSelectedImage(data.images?.[0] || '');
      }
    } catch (e) {
      console.log('Error fetching group details:', e);
    }
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        name: groupName,
        genre,
        description,
        members,
      };

      const { error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'update', type: 'group', id, userId: user.id, payload }
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
    <View className="flex-row items-center gap-2 mb-4 mt-6">
      <Ionicons name={icon as any} size={18} color={colors.primary} />
      <Text className="text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{title}</Text>
    </View>
  );

  const renderInput = (label: string, value: string, setValue: (text: string) => void, multiline = false) => (
    <View className="mb-4">
      <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>{label}</Text>
      <View className={`rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          className="p-4"
          style={{
            fontFamily: 'Poppins_400Regular',
            color: colors.text,
            height: multiline ? 120 : 'auto',
            textAlignVertical: multiline ? 'top' : 'center'
          }}
        />
      </View>
    </View>
  );

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Edit Group" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}>

          {renderSectionHeader('Group Details', 'people')}
          {renderInput('Group Name', groupName, setGroupName)}

          <View className="mb-4">
            <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Genre</Text>
            <TouchableOpacity
              className={`flex-row items-center justify-between p-4 rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
              style={{ backgroundColor: colors.inputBackground }}
            >
              <Text style={{ fontFamily: 'Poppins_400Regular', color: genre ? colors.text : colors.textSecondary }}>
                {genre || 'Select Genre'}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {renderInput('Description', description, setDescription, true)}

          {renderSectionHeader('Visuals', 'image')}
          {selectedImage ? (
            <View className="relative mb-4">
              <Image source={{ uri: selectedImage }} className="w-full h-48 rounded-2xl" resizeMode="cover" />
              <TouchableOpacity
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 items-center justify-center border-2 border-white"
                onPress={() => setSelectedImage('')}
              >
                <Ionicons name="trash" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              className="border-2 border-dashed rounded-xl p-8 items-center justify-center mb-4"
              style={{ borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F9FAFB' }}
              onPress={() => setSelectedImage('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=300&fit=crop')} // Simulating upload
            >
              <Ionicons name="cloud-upload-outline" size={32} color={colors.textSecondary} />
              <Text className="mt-2 text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Upload Group Photo</Text>
            </TouchableOpacity>
          )}

          {renderSectionHeader('Band Members', 'person')}
          <View className="flex-row gap-2 mb-4">
            <View className={`flex-1 rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
              <TextInput
                value={newMember}
                onChangeText={setNewMember}
                placeholder="Enter member name"
                placeholderTextColor={colors.textSecondary}
                className="p-4"
                style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
              />
            </View>
            <TouchableOpacity
              onPress={addMember}
              className="w-14 items-center justify-center rounded-xl bg-indigo-500"
              style={{ backgroundColor: colors.primary }}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {members.map((member, index) => (
              <View key={index} className="flex-row items-center px-3 py-2 rounded-lg border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <Text className="mr-2" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{member}</Text>
                <TouchableOpacity onPress={() => removeMember(index)}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>


          <View className="mt-8">
            <TouchableOpacity
              className="rounded-xl items-center justify-center py-4 mb-4 shadow-lg"
              style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8 }}
              onPress={() => setModalVisible(true)}
            >
              <Text className="text-white text-base" style={{ fontFamily: 'Poppins_600SemiBold' }}>Save Changes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="rounded-xl items-center justify-center py-4 border"
              style={{ borderColor: colors.border }}
              onPress={() => router.back()}
            >
              <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Cancel</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Save Changes"
        message="Are you sure you want to update this group profile?"
        buttonText="Save & Update"
        onConfirm={handleSave}
      />
    </>
  );
}

