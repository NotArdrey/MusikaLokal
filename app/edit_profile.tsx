import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';




export default function EditProfileScreen() {
  const name = 'Jared Lopez Bagtas'; // Non-editable
  const [selectedRoles, setSelectedRoles] = useState(['Drummer']);
  const [genres, setGenres] = useState('Rock, Indie, Folk');
  const [bio, setBio] = useState('');

  const availableRoles = [
    'Vocalist',
    'Guitarist',
    'Bassist',
    'Drummer',
    'Keyboardist',
    'DJ',
    'Producer',
    'Sound Engineer',
  ];

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSave = () => {
    // Handle save logic here
    console.log('Profile saved');
  };

  return (
    <View className="flex-1 bg-white">
      <View className="px-6">
        <Header title="Edit Profile"></Header>
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        <View className="pt-5 pb-24">
          {/* Profile Picture Section */}
          <View className="items-center mb-6">
            <View style={{ width: 120, height: 120, borderRadius: 60, overflow: 'hidden', backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: 'https://via.placeholder.com/150' }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <TouchableOpacity className="mt-3 flex-row items-center gap-2">
              <Ionicons name="camera" size={20} color="#3b82f6" />
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: '#3b82f6' }}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          <View className="gap-4">
            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8 }}>Full Name</Text>
              <View className="border border-gray-300 rounded-xl px-4 py-3 bg-gray-50">
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#6b7280' }}>{name}</Text>
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8 }}>Role/Instrument</Text>
              <View className="flex-row flex-wrap gap-2">
                {availableRoles.map((role) => (
                  <TouchableOpacity
                    key={role}
                    onPress={() => toggleRole(role)}
                    className={`flex-row items-center gap-2 border rounded-full px-4 py-2 ${
                      selectedRoles.includes(role) ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
                    }`}
                  >
                    <View className={`w-4 h-4 rounded border ${
                      selectedRoles.includes(role) ? 'bg-white border-white' : 'border-gray-400'
                    } items-center justify-center`}>
                      {selectedRoles.includes(role) && (
                        <Ionicons name="checkmark" size={12} color="#3b82f6" />
                      )}
                    </View>
                    <Text style={{
                      fontFamily: 'Poppins_400Regular',
                      fontSize: 13,
                      color: selectedRoles.includes(role) ? '#ffffff' : '#000000'
                    }}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Genres */}
            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8 }}>Genres</Text>
              <TextInput
                value={genres}
                onChangeText={setGenres}
                className="border border-gray-300 rounded-xl px-4 py-3"
                style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}
                placeholder="e.g., Rock, Jazz, Blues"
              />
            </View>

            {/* Bio */}
            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8 }}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                className="border border-gray-300 rounded-xl px-4 py-3"
                style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 100, textAlignVertical: 'top' }}
                placeholder="Tell us about yourself..."
                multiline
                numberOfLines={4}
              />
            </View>

            {/* My Sample Music */}
            <View className="mt-2">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, marginBottom: 12 }}>My Sample Music</Text>
              <View className="flex-row gap-3">
                <View className="border border-gray-300 rounded-xl overflow-hidden bg-gray-100 items-center justify-center" style={{ width: '48%', height: 150 }}>
                  <Image
                    source={{ uri: 'https://via.placeholder.com/300x200?text=Video+Preview' }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                  <View className="absolute inset-0 items-center justify-center">
                    <View className="w-12 h-12 rounded-full bg-black/50 items-center justify-center">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: 'white' }}>▶</Text>
                    </View>
                  </View>
                  <TouchableOpacity className="absolute top-2 right-2 bg-white rounded-full p-1">
                    <Ionicons name="close" size={16} color="#000" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity className="border-2 border-dashed border-gray-300 rounded-xl items-center justify-center" style={{ width: '48%', height: 150 }}>
                  <Ionicons name="add-circle-outline" size={40} color="#9ca3af" />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Add Video</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-3 mt-8">
            <TouchableOpacity 
              className="flex-1 border border-gray-300 rounded-xl items-center justify-center py-3"
              onPress={() => console.log('Cancel')}
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-1 bg-teal-500 rounded-xl items-center justify-center py-3"
              onPress={handleSave}
            >
              <Text className="text-white" style={{ fontFamily: 'Poppins_500Medium', fontSize: 14 }}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>
    </View>
  );
}