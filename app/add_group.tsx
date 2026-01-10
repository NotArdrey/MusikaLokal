import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function AddGroupScreen() {
    const { colors } = useTheme();
    const [groupName, setGroupName] = useState('');
    const [genre, setGenre] = useState('');
    const [description, setDescription] = useState('');
    const [selectedImage, setSelectedImage] = useState('');
    const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Add Group"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Group Name
          </Text>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
            placeholder="Enter Group name"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Genre(s)
          </Text>
          <TouchableOpacity className="border border-gray-300 rounded-lg px-4 py-3 mb-4 flex-row items-center justify-between">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: genre ? '#000' : '#9CA3AF' }}>
              {genre || 'Select Preferred genre'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Description
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 120 }}
            placeholder=""
            multiline
            textAlignVertical="top"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 8 }}>
            Upload Logo/Cover
          </Text>
          <View className="border-2 border-dashed border-gray-300 rounded-lg p-6 items-center justify-center mb-4">
            <Ionicons name="image-outline" size={40} color="#9CA3AF" />
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 8 }}>
              Upload Logo/Cover
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
              Tap to upload your group's logo or cover image.
            </Text>
            <TouchableOpacity 
              className="mt-4 px-6 py-2 border border-gray-300 rounded-lg"
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>
                Upload
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            className="rounded-xl bg-primary-500 items-center justify-center py-3 mb-6"
            onPress={() => setModalVisible(true)}
          >
            <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>
              Create Group Profile
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
    title="Confirm Group"
    message="Are you ready to create this group profile?"
    buttonText="Confirm">
    </Modal>
    </>
    );
}

