import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';




export default function SettingsScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title="Settings"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <TouchableOpacity className="flex-row items-center py-4 border-b border-gray-200" onPress ={() => router.push('/account_details')}>
            <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-4">
              <Ionicons name="person-outline" size={20} color="#000" />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#000' }}>
                Account
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280' }}>
                Username
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center py-4 border-b border-gray-200" onPress ={() => router.push('/notification_settings')}>
            <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-4">
              <Ionicons name="notifications-outline" size={20} color="#000" />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#000' }}>
                Notifications
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280' }}>
                Turn alerts on or off for your
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center py-4 border-b border-gray-200" onPress ={() => router.push('/terms_and_conditions')}>
            <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-4">
              <Ionicons name="lock-closed-outline" size={20} color="#000" />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#000' }}>
                Terms and Conditions
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280' }}>
                App usage rules and guidelines
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity className="flex-row items-center py-4 border-b border-gray-200" onPress ={() => router.push('/privacy_policy')}>
            <View className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mr-4">
              <Ionicons name="information-circle-outline" size={20} color="#000" />
            </View>
            <View className="flex-1">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: '#000' }}>
                Privacy Policy
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280' }}>
                Data protection and security
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

        </View>

        <TouchableOpacity 
          className="mt-8 mx-4 mb-6 rounded-lg items-center justify-center py-3"
          style={{ backgroundColor: '#DC2626' }}
          onPress={() => router.push('/')}
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
    
    );
} 