import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';




export default function AddGroupScreen() {
    const [groupName, setGroupName] = useState('');
    const [genre, setGenre] = useState('');
    const [description, setDescription] = useState('');
    const [selectedImage, setSelectedImage] = useState('');

    return (
    <View className="flex-1 bg-white px-6">
      <Header title="Add Group"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Group Name
          </Text>
          <TextInput
            value={groupName}
            onChangeText={setGroupName}
            className="border border-gray-300 rounded-lg px-4 py-3 mb-4"
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
            placeholder="Enter Group name"
          />

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Genre(s)
          </Text>
          <TouchableOpacity className="border border-gray-300 rounded-lg px-4 py-3 mb-4 flex-row items-center justify-between">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: genre ? '#000' : '#9CA3AF' }}>
              {genre || 'Select Preferred genre'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
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

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 8 }}>
            Upload Logo/Cover
          </Text>
          <View className="border-2 border-dashed border-gray-300 rounded-lg p-8 items-center justify-center mb-6">
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
                <Ionicons name="cloud-upload-outline" size={48} color="#9CA3AF" />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginTop: 12 }}>
                  Upload Image
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'center' }}>
                  Tap to upload your group's logo or cover image.
                </Text>
                <TouchableOpacity 
                  className="mt-4 px-6 py-2 border border-gray-300 rounded-lg"
                >
                  <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: '#000' }}>
                    Upload
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity 
            className="rounded-xl bg-teal-500 items-center justify-center py-3 mb-6"
            onPress={() => router.back()}
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
    
    );
}
