import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';

export default function RegisterScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('');
  const [imageID, setImageID] = useState<string | null>(null);
  const [userImage, setUserImage] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const roles = [
    { id: 'artist', label: 'Artist', icon: 'musical-notes' },
    { id: 'studio', label: 'Studio', icon: 'business' },
    { id: 'organizer', label: 'Organizer', icon: 'calendar' },
  ];

  const pickImage = async (setImage: (uri: string) => void) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status != 'granted') {
      alert('Permission to access Gallery is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 4],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const renderInput = (
    placeholder: string,
    value: string,
    setValue: (text: string) => void,
    icon: string,
    isPassword = false,
    showPass = false,
    togglePass?: () => void
  ) => (
    <View className={`flex-row items-center rounded-xl border px-4 py-3.5 mb-4 ${isDark ? 'border-gray-700' : 'border-gray-200'}`} style={{ backgroundColor: colors.inputBackground }}>
      <Ionicons name={icon as any} size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
      <TextInput
        className="flex-1 text-base"
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={setValue}
        secureTextEntry={isPassword && !showPass}
        autoCapitalize="none"
        style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
      />
      {isPassword && (
        <TouchableOpacity onPress={togglePass}>
          <Ionicons name={showPass ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <View className="pt-16 pb-6 px-6 items-center">
              <Image
                source={require('../assets/images/green-logo.png')}
                style={{ width: 140, height: 80, tintColor: isDark ? colors.text : undefined }}
                resizeMode="contain"
              />
              <Text className="text-2xl mt-2" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>Create Account</Text>
              <Text className="text-sm mt-1 mb-8" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Join the community today</Text>
            </View>

            <View className="px-6">
              <Text className="text-xs uppercase tracking-wider mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Account Details</Text>
              {renderInput('Email Address', email, setEmail, 'mail-outline')}
              {renderInput('Create Password', password, setPassword, 'lock-closed-outline', true, showPassword, () => setShowPassword(!showPassword))}
              {renderInput('Confirm Password', confirmPassword, setConfirmPassword, 'lock-closed-outline', true, showConfirmPassword, () => setShowConfirmPassword(!showConfirmPassword))}

              <Text className="text-xs uppercase tracking-wider mb-2 mt-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>I am a...</Text>
              <View className="flex-row gap-3 mb-6">
                {roles.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => setRole(r.id)}
                    className={`flex-1 items-center justify-center p-3 rounded-xl border-2 ${role === r.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                    style={{ borderColor: role === r.id ? colors.primary : colors.border }}
                  >
                    <Ionicons name={r.icon as any} size={24} color={role === r.id ? colors.primary : colors.textSecondary} />
                    <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_600SemiBold', color: role === r.id ? colors.primary : colors.textSecondary }}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs uppercase tracking-wider mb-2 mt-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Verification</Text>
              <Text className="text-xs mb-4 leading-5" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                Please upload a valid government ID and a selfie for verification.
              </Text>

              <View className="flex-row gap-4 mb-8">
                <TouchableOpacity
                  onPress={() => pickImage(setImageID)}
                  className="flex-1 border-2 border-dashed rounded-xl p-4 items-center justify-center h-32"
                  style={{ borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F9FAFB' }}
                >
                  {imageID ? (
                    <Image source={{ uri: imageID }} className="w-full h-full rounded-lg" resizeMode="cover" />
                  ) : (
                    <>
                      <Ionicons name="id-card-outline" size={28} color={colors.textSecondary} />
                      <Text className="text-xs mt-2 text-center" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Upload ID</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => pickImage(setUserImage)}
                  className="flex-1 border-2 border-dashed rounded-xl p-4 items-center justify-center h-32"
                  style={{ borderColor: colors.border, backgroundColor: isDark ? colors.card : '#F9FAFB' }}
                >
                  {userImage ? (
                    <Image source={{ uri: userImage }} className="w-full h-full rounded-lg" resizeMode="cover" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
                      <Text className="text-xs mt-2 text-center" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Take Selfie</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                className="rounded-xl py-4 shadow-lg shadow-indigo-500/30"
                style={{ backgroundColor: colors.primary }}
                onPress={() => setModalVisible(true)}
              >
                <Text className="text-white text-center text-base" style={{ fontFamily: 'Poppins_600SemiBold' }}>Create Account</Text>
              </TouchableOpacity>

              <View className="flex-row justify-center mt-6">
                <Text className="text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/' as any)}>
                  <Text className="text-sm" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Log In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Registration"
        message="Are you sure you want to create this account? Please double check your details."
        buttonText="Register"
        onConfirm={() => {
          setModalVisible(false);
          router.replace('/home' as any);
        }}
      />
    </>
  );
}


