import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../src/context/ThemeContext';

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = () => {
    // Mock login logic
    router.replace('/home' as any);
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
          <View className="px-8">
            {/* Logo Section */}
            <View className="items-center mb-12">
              <Image
                source={require('../assets/images/green-logo.png')}
                style={{ width: 180, height: 120, tintColor: isDark ? colors.text : undefined }}
                resizeMode="contain"
              />
              <Text className="text-2xl mt-4" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>
                Welcome Back!
              </Text>
              <Text className="text-sm mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                Sign in to continue to MusikaLokal
              </Text>
            </View>

            {/* Inputs */}
            <View className="gap-4 mb-6">
              <View className={`flex-row items-center rounded-xl border px-4 py-3.5 ${isDark ? 'border-gray-700' : 'border-gray-200'}`} style={{ backgroundColor: colors.inputBackground }}>
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <TextInput
                  className="flex-1 text-base"
                  placeholder="Email Address"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                />
              </View>

              <View className={`flex-row items-center rounded-xl border px-4 py-3.5 ${isDark ? 'border-gray-700' : 'border-gray-200'}`} style={{ backgroundColor: colors.inputBackground }}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={{ marginRight: 12 }} />
                <TextInput
                  className="flex-1 text-base"
                  placeholder="Password"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity className="self-end mb-8" onPress={() => router.push('forget-password' as any)}>
              <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>
                Forgot Password?
              </Text>
            </TouchableOpacity>

            {/* Error Message */}
            {error ? <Text className="text-red-500 text-center mb-4" style={{ fontFamily: 'Poppins_400Regular' }}>{error}</Text> : null}

            {/* Buttons */}
            <TouchableOpacity
              onPress={handleLogin}
              className="rounded-xl py-4 mb-4 shadow-lg shadow-indigo-500/30"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white text-center text-base" style={{ fontFamily: 'Poppins_600SemiBold' }}>Log In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push('home' as any)}
              className="rounded-xl py-4 mb-8 border"
              style={{ borderColor: colors.border }}
            >
              <Text className="text-center text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Continue as Guest</Text>
            </TouchableOpacity>

            {/* Footer */}
            <View className="flex-row justify-center">
              <Text className="text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                Don't have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => router.push('register' as any)}>
                <Text className="text-sm" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

