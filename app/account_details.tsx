import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AccountDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  const renderSection = (title: string, children: React.ReactNode) => (
    <View className="mb-6">
      <Text className="text-sm font-semibold uppercase tracking-wider mb-3 ml-1" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>
        {title}
      </Text>
      <View
        className="rounded-2xl overflow-hidden shadow-sm"
        style={{ backgroundColor: colors.card, borderWidth: isDark ? 1 : 0, borderColor: colors.border }}
      >
        {children}
      </View>
    </View>
  );

  const renderItem = (label: string, value: string | null, onPress?: () => void, isLast: boolean = false, icon?: any, showArrow: boolean = true) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      className={`flex-row items-center justify-between p-4 ${!isLast ? 'border-b' : ''}`}
      style={{ borderColor: isDark ? colors.border : '#F3F4F6' }}
    >
      <View className="flex-row items-center">
        {icon && <View className="mr-3 w-8 h-8 rounded-full items-center justify-center bg-gray-100 dark:bg-gray-800">{icon}</View>}
        <View>
          <Text className="text-sm font-medium" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{label}</Text>
          {value && <Text className="text-xs mt-0.5" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{value}</Text>}
        </View>
      </View>
      {onPress && showArrow && <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
    </TouchableOpacity>
  );

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Account Details" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 24, paddingBottom: 100 }}>

          <View className="items-center mb-8">
            <View className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden mb-3 border-4" style={{ borderColor: colors.card }}>
              <Image
                source={{ uri: 'https://picsum.photos/200' }}
                className="w-full h-full"
                resizeMode="cover"
              />
            </View>
            <Text className="text-xl font-bold" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>Jared Carioso</Text>
            <Text className="text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Artist Account</Text>
          </View>

          {renderSection('Personal Information', (
            <>
              {renderItem('Full Name', 'Jared Carioso', undefined, false, <Ionicons name="person-outline" size={16} color={colors.text} />)}
              {renderItem('Email', 'Jaredcarioso69@gmail.com', undefined, true, <Ionicons name="mail-outline" size={16} color={colors.text} />)}
            </>
          ))}

          {renderSection('Security', (
            <>
              {renderItem('Change Email', 'Update your email address', () => router.push('/change_email'), false, <Ionicons name="at-outline" size={16} color={colors.text} />)}
              {renderItem('Change Password', 'Update your password', () => router.push('/change_password'), true, <Ionicons name="lock-closed-outline" size={16} color={colors.text} />)}
            </>
          ))}

          {renderSection('Actions', (
            <>
              <TouchableOpacity
                className="flex-row items-center justify-between p-4"
                onPress={() => setModalVisible(true)}
              >
                <View className="flex-row items-center">
                  <View className="mr-3 w-8 h-8 rounded-full items-center justify-center bg-red-50 dark:bg-red-900/20">
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </View>
                  <Text className="text-sm font-medium" style={{ fontFamily: 'Poppins_500Medium', color: '#EF4444' }}>Close Account</Text>
                </View>
              </TouchableOpacity>
            </>
          ))}

          <Text className="text-center text-xs mt-4 mb-8" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Member since November 2026
          </Text>

        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0">
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Close Account"
        message="Are you sure you want to close your account? This action cannot be undone and you will lose all your data."
        buttonText="Close Account"
        onConfirm={() => {
          setModalVisible(false);
          // Add close account logic
          router.replace('/');
        }}
      />
    </>
  );
}

