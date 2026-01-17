import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function EditGigScreen() {
  const { colors, isDark } = useTheme();
  const [gigName, setGigName] = useState('BarRocks Music Lounge');
  const [description, setDescription] = useState('A vibrant music venue in the heart of downtown, known for its eclectic mix of genres and lively atmosphere.');
  const [address, setAddress] = useState('Floridel, Bulacan');
  const [cost, setCost] = useState('6000');
  const [modalVisible, setModalVisible] = useState(false);

  // Mock Data
  const [documents, setDocuments] = useState(['Contract.pdf', 'Rider_v2.pdf']);
  const [images, setImages] = useState([
    'https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=300&h=200&fit=crop',
    'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=300&h=200&fit=crop',
    'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=300&h=200&fit=crop'
  ]);

  const handleSave = () => {
    setModalVisible(false);
    console.log('Gig Updated');
    router.back();
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
        <Header title="Edit Gig" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24 }}>

          {renderSectionHeader('Basic Details', 'information-circle')}
          {renderInput('Gig Title', gigName, setGigName)}
          {renderInput('Description', description, setDescription, true)}
          {renderInput('Location', address, setAddress)}
          {renderInput('Budget (₱)', cost, setCost, false, true)}

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

              {images.map((uri, index) => (
                <View key={index} className="relative">
                  <Image source={{ uri }} className="w-24 h-24 rounded-xl bg-gray-200" />
                  <TouchableOpacity
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 items-center justify-center border-2 border-white dark:border-gray-900"
                    onPress={() => setImages(images.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
          <Text className="text-xs mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Hold images to reorder or tap to view.</Text>

          {renderSectionHeader('Documents', 'document-text')}
          {documents.map((doc, i) => (
            <View key={i} className="flex-row items-center justify-between p-4 mb-3 rounded-xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <View className="flex-row items-center gap-3">
                <Ionicons name="document" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{doc}</Text>
              </View>
              <TouchableOpacity onPress={() => setDocuments(documents.filter((_, idx) => idx !== i))}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity className="flex-row items-center justify-center py-3 rounded-xl border border-dashed" style={{ borderColor: colors.border }}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            <Text className="ml-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Upload Document</Text>
          </TouchableOpacity>

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
        message="Are you sure you want to update this gig profile?"
        buttonText="Save & Update"
        onConfirm={handleSave}
      />
    </>
  );
}

