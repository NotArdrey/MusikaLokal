import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function EditProfileScreen() {
  const { colors, isDark } = useTheme();
  const name = 'Jared Lopez Bagtas'; // Non-editable
  const [selectedRoles, setSelectedRoles] = useState(['Drummer']);
  const [genres, setGenres] = useState('Rock, Indie, Folk');
  const [bio, setBio] = useState('');
  const [modalVisible, setModalVisible] = useState(false);

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
    <>
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="px-6">
        <Header title="Edit Profile"></Header>
      </View>

      <ScrollView className="flex-1 px-6" showsVerticalScrollIndicator={false}>
        <View className="pt-5 pb-24">
          {/* Profile Picture Section */}
          <View className="items-center mb-6">
            <View style={{ width: 120, height: 120, borderRadius: 60, overflow: 'hidden', backgroundColor: colors.inputBackground, alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: 'https://via.placeholder.com/150' }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>
            <TouchableOpacity className="mt-3 flex-row items-center gap-2">
              <Ionicons name="camera" size={20} color={colors.primary} />
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.primary }}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          <View className="gap-4">
            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8, color: colors.text }}>Full Name</Text>
              <View style={{ backgroundColor: colors.inputBackground, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>{name}</Text>
              </View>
            </View>

            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8, color: colors.text }}>Role/Instrument</Text>
              <View className="flex-row flex-wrap gap-2">
                {availableRoles.map((role) => (
                  <TouchableOpacity
                    key={role}
                    onPress={() => toggleRole(role)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      borderWidth: 1,
                      borderRadius: 9999,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      backgroundColor: selectedRoles.includes(role) ? colors.primary : colors.card,
                      borderColor: selectedRoles.includes(role) ? colors.primary : colors.border
                    }}
                  >
                    <View style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      borderWidth: 1,
                      backgroundColor: selectedRoles.includes(role) ? '#fff' : 'transparent',
                      borderColor: selectedRoles.includes(role) ? '#fff' : colors.muted,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {selectedRoles.includes(role) && (
                        <Ionicons name="checkmark" size={12} color={colors.primary} />
                      )}
                    </View>
                    <Text style={{
                      fontFamily: 'Poppins_400Regular',
                      fontSize: 13,
                      color: selectedRoles.includes(role) ? '#ffffff' : colors.text
                    }}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Genres */}
            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8, color: colors.text }}>Genres</Text>
              <TextInput
                value={genres}
                onChangeText={setGenres}
                style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, color: colors.text }}
                placeholder="e.g., Rock, Jazz, Blues"
                placeholderTextColor={colors.muted}
              />
            </View>

            {/* Bio */}
            <View>
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, marginBottom: 8, color: colors.text }}>Bio</Text>
              <TextInput
                value={bio}
                onChangeText={setBio}
                style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, color: colors.text }}
                placeholder="Tell us about yourself..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* My Sample Music */}
            <View className="mt-2">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, marginBottom: 12, color: colors.text }}>My Sample Music</Text>
              <View className="flex-row gap-3">
                <View style={{ width: '48%', height: 150, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.inputBackground, alignItems: 'center', justifyContent: 'center' }}>
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

                <TouchableOpacity style={{ width: '48%', height: 150, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add-circle-outline" size={40} color={colors.muted} />
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>Add Video</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-3 mt-8">
            <TouchableOpacity 
              style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
              onPress={() => console.log('Cancel')}
            >
              <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              className="flex-1 bg-primary-500 rounded-xl items-center justify-center py-3"
              onPress={() => setModalVisible(true)}
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

