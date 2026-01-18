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

export default function EditStudioScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [studioName, setStudioName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [cost, setCost] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

  const [amenities, setAmenities] = useState<string[]>([]);
  const [newAmenity, setNewAmenity] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  React.useEffect(() => {
    fetchStudioDetails();
  }, [id]);

  const fetchStudioDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'studio', id, userId: user.id }
      });

      if (error) throw error;
      if (data) {
        setStudioName(data.name);
        setDescription(data.description);
        setAddress(data.address);
        setCost(data.hourly_rate?.toString() || '');
        setAmenities(data.amenities || []);
        // setSelectedImages(data.images || []);
      }
    } catch (e) {
      console.log('Error fetching studio details:', e);
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
        // images: selectedImages,
      };

      const { error } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'update', type: 'studio', id, userId: user.id, payload }
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
    <View className="flex-row items-center gap-2 mb-4 mt-6">
      <Ionicons name={icon as any} size={18} color={colors.primary} />
      <Text className="text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{title}</Text>
    </View>
  );

  const renderInput = (label: string, value: string, setValue: (text: string) => void, multiline = false, numeric = false) => (
    <View className="mb-4">
      <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>{label}</Text>
      <View className={`rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline={multiline}
          numberOfLines={multiline ? 4 : 1}
          keyboardType={numeric ? 'numeric' : 'default'}
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
        <Header title="Edit Studio" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}>

          {renderSectionHeader('Studio Details', 'business')}
          {renderInput('Studio Name', studioName, setStudioName)}
          {renderInput('Description', description, setDescription, true)}
          {renderInput('Location', address, setAddress)}
          {renderInput('Hourly Rate (₱)', cost, setCost, false, true)}

          {renderSectionHeader('Facilities & Equipment', 'mic')}
          <View className="flex-row gap-2 mb-4">
            <View className={`flex-1 rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
              <TextInput
                value={newAmenity}
                onChangeText={setNewAmenity}
                placeholder="e.g. Drum Kit"
                placeholderTextColor={colors.textSecondary}
                className="p-4"
                style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
              />
            </View>
            <TouchableOpacity
              onPress={addAmenity}
              className="w-14 items-center justify-center rounded-xl bg-indigo-500"
              style={{ backgroundColor: colors.primary }}
            >
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {amenities.map((item, index) => (
              <View key={index} className="flex-row items-center px-3 py-2 rounded-full border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                <Text className="mr-2" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item}</Text>
                <TouchableOpacity onPress={() => removeAmenity(index)}>
                  <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {renderSectionHeader('Visuals', 'image')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="w-24 h-24 rounded-xl items-center justify-center border border-dashed"
                style={{ borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F3F4F6' }}
              >
                <Ionicons name="add" size={24} color={colors.textSecondary} />
                <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Add Photo</Text>
              </TouchableOpacity>

              {selectedImages.map((uri, index) => (
                <View key={index} className="relative">
                  <Image source={{ uri }} className="w-24 h-24 rounded-xl bg-gray-200" />
                  <TouchableOpacity
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 items-center justify-center border-2 border-white dark:border-gray-900"
                    onPress={() => setSelectedImages(selectedImages.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
          <Text className="text-xs mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Hold images to reorder or tap to view.</Text>

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
        message="Are you sure you want to update this studio profile?"
        buttonText="Save & Update"
        onConfirm={handleSave}
      />
    </>
  );
}

