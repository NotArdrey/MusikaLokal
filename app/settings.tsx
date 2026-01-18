import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function SettingsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme, setTheme, colors, isDark } = useTheme();

  const handleLogout = async () => {
    setModalVisible(false);
    await supabase.auth.signOut();
    router.replace('/');
  };

  const SETTINGS_SECTIONS = [
    {
      title: 'Preferences',
      items: [
        { label: 'Account Security', icon: 'shield-outline', route: '/account_details' },
      ]
    },
    {
      title: 'Support & Legal',
      items: [
        { label: 'Help & Support', icon: 'help-circle-outline', route: '/help_support' },
        { label: 'Terms and Conditions', icon: 'document-text-outline', route: '/terms_and_conditions' },
        { label: 'Privacy Policy', icon: 'shield-checkmark-outline', route: '/privacy_policy' },
      ]
    }
  ];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        {/* Custom Header with Back Button */}
        <View className="flex-row items-center px-6 py-4 pt-12" style={{ backgroundColor: colors.background }}>
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 mr-2">
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text className="text-xl" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Settings</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>

          {/* Section: Appearance */}
          <View className="px-6 mt-6 mb-6">
            <Text className="mb-3 text-xs uppercase tracking-wider pl-1" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Appearance</Text>
            <View className="p-4 rounded-2xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <Text className="mb-4 text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Theme Preference</Text>

              <View className="flex-row gap-2">
                {[
                  { id: 'light', icon: 'sunny', label: 'Light' },
                  { id: 'dark', icon: 'moon', label: 'Dark' },
                  { id: 'system', icon: 'phone-portrait-outline', label: 'System' }
                ].map((item) => {
                  const isActive = theme === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setTheme(item.id as any)}
                      className={`flex-1 py-3 rounded-xl items-center border ${isActive ? 'bg-indigo-50 border-indigo-200' : 'bg-transparent border-gray-200'}`}
                      style={{
                        backgroundColor: isActive ? (isDark ? colors.primaryLight : '#EEF2FF') : 'transparent',
                        borderColor: isActive ? colors.primary : colors.border
                      }}
                    >
                      <Ionicons name={item.icon as any} size={20} color={isActive ? colors.primary : colors.textSecondary} />
                      <Text className="mt-1 text-xs" style={{ fontFamily: 'Poppins_500Medium', color: isActive ? colors.primary : colors.textSecondary }}>{item.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </View>

          {SETTINGS_SECTIONS.map((section, index) => (
            <View key={section.title} className="px-6 mb-6">
              <Text className="mb-3 text-xs uppercase tracking-wider pl-1" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>{section.title}</Text>
              <View className="rounded-2xl overflow-hidden border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
                {section.items.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    onPress={() => router.push(item.route as any)}
                    className={`flex-row items-center p-4 active:bg-gray-50`}
                    style={{
                      borderBottomWidth: i === section.items.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border
                    }}
                  >
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
                      <Ionicons name={item.icon as any} size={18} color={colors.text} />
                    </View>
                    <Text className="flex-1 text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <View className="px-6 mt-2">
            <TouchableOpacity
              onPress={() => setModalVisible(true)}
              className="flex-row items-center justify-center p-4 rounded-xl mb-4"
              style={{ backgroundColor: '#FEE2E2' }}
            >
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
              <Text className="ml-2 text-sm text-red-600" style={{ fontFamily: 'Poppins_600SemiBold' }}>Log Out</Text>
            </TouchableOpacity>

            <Text className="text-center text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Version 1.0.0 (Build 52)</Text>
          </View>

        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Log Out"
        message="Are you sure you want to log out of your account?"
        buttonText="Log Out"
        onConfirm={handleLogout}
      />
    </>
  );
}

