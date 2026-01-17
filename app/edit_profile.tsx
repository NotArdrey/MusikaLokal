import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

  // Expanded role list
  const availableRoles = [
    'Vocalist', 'Guitarist', 'Bassist', 'Drummer',
    'Keyboardist', 'DJ', 'Producer', 'Sound Engineer'
  ];

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter(r => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleSave = () => {
    setModalVisible(false);
    console.log('Profile saved');
    router.back();
  };

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Edit Profile" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          <View className="px-6 mt-6">

            {/* Profile Image */}
            <View className="items-center mb-8">
              <View className="relative">
                <View
                  style={{
                    width: 120, height: 120, borderRadius: 60, overflow: 'hidden',
                    borderWidth: 4, borderColor: colors.surface
                  }}
                >
                  <Image
                    source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                    className="w-full h-full"
                    resizeMode="cover"
                  />
                </View>
                <TouchableOpacity
                  className="absolute bottom-0 right-0 p-3 rounded-full shadow-lg"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Ionicons name="camera" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text className="mt-3 text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Change Photo</Text>
            </View>

            {/* Form Fields */}
            <View className="gap-6">
              <View>
                <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Display Name</Text>
                <View className="p-4 rounded-xl border border-gray-200" style={{ backgroundColor: colors.inputBackground, borderColor: colors.border }}>
                  <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.muted }}>{name}</Text>
                </View>
                <Text className="mt-1 text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Display Name cannot be changed.</Text>
              </View>

              <View>
                <Text className="mb-3 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Roles & Instruments</Text>
                <View className="flex-row flex-wrap gap-2">
                  {availableRoles.map((role) => {
                    const isSelected = selectedRoles.includes(role);
                    return (
                      <TouchableOpacity
                        key={role}
                        onPress={() => toggleRole(role)}
                        className={`px-4 py-2 rounded-full border ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-transparent'}`}
                        style={{
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? (isDark ? colors.primaryLight : '#EEF2FF') : 'transparent'
                        }}
                      >
                        <Text style={{
                          fontFamily: 'Poppins_500Medium',
                          fontSize: 13,
                          color: isSelected ? colors.primary : colors.textSecondary
                        }}>
                          {role}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Genres</Text>
                <View className="p-3 rounded-xl border border-gray-200" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                  <TextInput
                    value={genres}
                    onChangeText={setGenres}
                    placeholder="e.g. Rock, Indie, Pop"
                    placeholderTextColor={colors.textSecondary}
                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                  />
                </View>
              </View>

              <View>
                <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Bio</Text>
                <View className="p-3 rounded-xl border border-gray-200" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
                  <TextInput
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Tell us a bit about yourself..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text, height: 100, textAlignVertical: 'top' }}
                  />
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="mt-8 gap-3">
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                className="w-full py-4 rounded-xl items-center shadow-lg"
                style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 }}
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#fff' }}>Save Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                className="w-full py-4 rounded-xl items-center"
              >
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
            </View>

          </View>
        </ScrollView>
        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Save Changes"
        message="Are you sure you want to update your profile?"
        buttonText="Save Changes"
        onConfirm={handleSave}
      />
    </>
  );
}

