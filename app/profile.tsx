import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';


export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const [showEdit, setShowEdit] = useState(true);

  return (
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="My Profile"></Header>

      <View className="flex-row flex justify-center gap-5 pt-5 items-center">
        <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: colors.inputBackground, alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={{ uri: 'https://via.placeholder.com/150' }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
        <View className="flex-col justify-center items-start" >

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text }}>Jared Lopez Bagtas</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Drummer</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>Rock, Indie, Folk</Text>
          {showEdit ? (
            <TouchableOpacity onPress={() => router.push('/edit_profile')} className="rounded-xl items-center justify-center py-2 px-3 flex-row gap-2 mt-2" style={{ width: '100%', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>Edit Profile</Text>
              <Ionicons name="pencil" size={16} color={colors.text} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>


      <View className="mt-5 flex gap-2 pt-3" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Completion Rate</Text>
        <View className="flex flex-row gap-2 items-center">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: '#10b981' }}>98%</Text>
          <View className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: isDark ? colors.inputBackground : '#D1D5DB' }}>
            <View className="h-full bg-green-500 rounded-full" style={{ width: '98%' }} />
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap mt-5 gap-3">
        <View className="rounded-xl flex-col justify-center items-center p-4" style={{ width: '48%', borderWidth: 1, borderColor: colors.border }}>
          <MaterialCommunityIcons name="microphone-variant" size={24} color={colors.primary} />
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Active Gigs</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 24, color: colors.primary }}>5</Text>
        </View>

        <View className="rounded-xl flex-col justify-center items-center p-4" style={{ width: '48%', borderWidth: 1, borderColor: colors.border }}>
          <MaterialCommunityIcons name="check-circle" size={24} color="#10b981" />
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Completed</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 24, color: '#10b981' }}>5</Text>
        </View>

        <View className="rounded-xl flex-col justify-center items-center p-4" style={{ width: '48%', borderWidth: 1, borderColor: colors.border }}>
          <MaterialCommunityIcons name="star-half-full" size={24} color="#D97706" />
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Reviews Pending</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 24, color: '#D97706' }}>5</Text>
        </View>
      </View>

      <View className="mt-5">
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="playlist-music" size={20} color={colors.primary} />
          <Text className="ml-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>My Sample Music</Text>
        </View>
      </View>

      <View className="flex flex-row mt-3">
        <View className="rounded-xl overflow-hidden items-center justify-center" style={{ width: '48%', height: 150, borderWidth: 1, borderColor: colors.border, backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
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
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>
    </View>
  );
}

