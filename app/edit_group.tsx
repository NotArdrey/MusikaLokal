import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function EditGroupScreen() {
    const { colors, isDark } = useTheme();
    const [groupName, setGroupName] = useState('The Manila Beats');
    const [genre, setGenre] = useState('OPM Rock');
    const [description, setDescription] = useState('A dynamic music group specializing in contemporary Filipino music with a modern twist. We bring energy and passion to every performance.');
    const [selectedImage, setSelectedImage] = useState('https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=300&fit=crop');
    const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Edit Group"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Group Name
          </Text>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, backgroundColor: colors.card, color: colors.text }}
            placeholder="Enter Group name"
            placeholderTextColor={colors.muted}
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Genre(s)
          </Text>
          <TouchableOpacity style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card }}>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: genre ? colors.text : colors.muted }}>
              {genre || 'Select Preferred genre'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={colors.muted} />
          </TouchableOpacity>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16, backgroundColor: colors.card, color: colors.text }}
            placeholder=""
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Upload Logo/Cover
          </Text>
          <View style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8, padding: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
            {selectedImage ? (
              <View className="relative w-full">
                <Image 
                  source={{ uri: selectedImage }}
                  style={{ width: '100%', height: 150, borderRadius: 8 }}
                  resizeMode="cover"
                />
                <TouchableOpacity 
                  className="absolute top-2 right-2 bg-red-500 rounded-full w-7 h-7 items-center justify-center"
                  onPress={() => setSelectedImage('')}
                >
                  <Ionicons name="close" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={48} color={colors.muted} />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 12 }}>
                  Upload Image
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4, textAlign: 'center' }}>
                  Tap to upload your group's logo or cover image.
                </Text>
                <TouchableOpacity 
                  style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}
                >
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>
                    Upload
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity 
            className="rounded-xl bg-primary-500 items-center justify-center py-3 mb-6"
            onPress={() => setModalVisible(true)}
          >
            <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>
              Save Group Profile
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    
    <Modal
    visible = {modalVisible}
    onClose={() => setModalVisible(false)}
    title="Confirm Changes"
    message="Are you sure you want to save these changes?"
    buttonText="Save">
    </Modal>
    </>
    );
}

