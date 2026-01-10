import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function SettingsScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme, setTheme, colors, isDark } = useTheme();

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Settings"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <TouchableOpacity className="flex-row items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} onPress ={() => router.push('/account_details')}>
            <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: isDark ? colors.card : '#F3F4F6' }}>
              <Ionicons name="person-outline" size={20} color={colors.text} />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Account
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.secondary }}>
                Username
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} onPress ={() => router.push('/notification_settings')}>
            <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: isDark ? colors.card : '#F3F4F6' }}>
              <Ionicons name="notifications-outline" size={20} color={colors.text} />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Notifications
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.secondary }}>
                Turn alerts on or off for your
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} onPress ={() => router.push('/terms_and_conditions')}>
            <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: isDark ? colors.card : '#F3F4F6' }}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.text} />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Terms and Conditions
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.secondary }}>
                App usage rules and guidelines
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }} onPress ={() => router.push('/privacy_policy')}>
            <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: isDark ? colors.card : '#F3F4F6' }}>
              <Ionicons name="information-circle-outline" size={20} color={colors.text} />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Privacy Policy
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.secondary }}>
                Data protection and security
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          {/* Theme Selection */}
          <View className="py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View className="flex-row items-center mb-3">
              <View className="w-10 h-10 rounded-full items-center justify-center mr-4" style={{ backgroundColor: isDark ? colors.card : '#F3F4F6' }}>
                <Ionicons name="color-palette-outline" size={20} color={colors.text} />
              </View>
              <View className="flex-1">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                  Appearance
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.secondary }}>
                  Choose your preferred theme
                </Text>
              </View>
            </View>
            <View className="flex-row justify-center gap-2 mt-2">
              <TouchableOpacity
                onPress={() => setTheme('light')}
                className="flex-1 py-2 rounded-lg items-center"
                style={{ 
                  backgroundColor: theme === 'light' ? colors.primary : (isDark ? colors.card : '#E5E7EB'),
                  borderWidth: theme === 'light' ? 0 : 1,
                  borderColor: colors.border
                }}
              >
                <Ionicons name="sunny" size={18} color={theme === 'light' ? '#FFF' : colors.text} />
                <Text style={{ 
                  fontFamily: 'Poppins_500Medium', 
                  fontSize: 12, 
                  color: theme === 'light' ? '#FFF' : colors.text,
                  marginTop: 2
                }}>
                  Light
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTheme('dark')}
                className="flex-1 py-2 rounded-lg items-center"
                style={{ 
                  backgroundColor: theme === 'dark' ? colors.primary : (isDark ? colors.card : '#E5E7EB'),
                  borderWidth: theme === 'dark' ? 0 : 1,
                  borderColor: colors.border
                }}
              >
                <Ionicons name="moon" size={18} color={theme === 'dark' ? '#FFF' : colors.text} />
                <Text style={{ 
                  fontFamily: 'Poppins_500Medium', 
                  fontSize: 12, 
                  color: theme === 'dark' ? '#FFF' : colors.text,
                  marginTop: 2
                }}>
                  Dark
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTheme('system')}
                className="flex-1 py-2 rounded-lg items-center"
                style={{ 
                  backgroundColor: theme === 'system' ? colors.primary : (isDark ? colors.card : '#E5E7EB'),
                  borderWidth: theme === 'system' ? 0 : 1,
                  borderColor: colors.border
                }}
              >
                <Ionicons name="phone-portrait-outline" size={18} color={theme === 'system' ? '#FFF' : colors.text} />
                <Text style={{ 
                  fontFamily: 'Poppins_500Medium', 
                  fontSize: 12, 
                  color: theme === 'system' ? '#FFF' : colors.text,
                  marginTop: 2
                }}>
                  System
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>

        <TouchableOpacity 
          className="mt-8 mx-4 mb-6 rounded-lg items-center justify-center py-3"
          style={{ backgroundColor: '#DC2626' }}
          onPress={() => setModalVisible(true)}
        >
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#FFF' }}>
            Logout
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    <Modal
      visible={modalVisible}
      onClose={() => setModalVisible(false)}
      title="Logout"
      message="Are you sure you want to logout?"
      buttonText="Logout"
    />
    </>
    );
} 

