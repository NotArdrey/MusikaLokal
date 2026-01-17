import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();

  const MENU_ITEMS = [
    { label: 'Edit Profile', icon: 'person-outline', route: '/edit_profile' },
    { label: 'Wallet', icon: 'wallet-outline', route: '/wallet' },
    { label: 'Settings', icon: 'settings-outline', route: '/settings' },
  ];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="My Profile" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>

          {/* Profile Header */}
          <View className="px-6 pt-2 pb-6 items-center">
            <View className="relative">
              <View
                className="w-28 h-28 rounded-full overflow-hidden mb-4 border-4"
                style={{ borderColor: colors.surface }}
              >
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&fit=crop' }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              </View>
              <TouchableOpacity
                onPress={() => router.push('/edit_profile')}
                className="absolute bottom-4 right-0 p-2 rounded-full shadow-sm"
                style={{ backgroundColor: colors.primary }}
              >
                <Ionicons name="pencil" size={16} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text className="text-xl mb-1 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Jared Lopez Bagtas</Text>
            <Text className="text-sm mb-4 text-center" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Session Drummer • Manila</Text>

            <View className="flex-row gap-2 flex-wrap justify-center mb-6">
              {['Rock', 'Indie', 'Folk'].map((genre) => (
                <View key={genre} className="px-3 py-1 rounded-full" style={{ backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>{genre}</Text>
                </View>
              ))}
            </View>

            <View className="flex-row w-full justify-between px-2">
              <View className="items-center flex-1">
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: colors.text }}>98%</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Rating</Text>
              </View>
              <View className="w-[1px] h-full bg-gray-200" style={{ backgroundColor: colors.border }} />
              <View className="items-center flex-1">
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: colors.text }}>15</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Gigs</Text>
              </View>
              <View className="w-[1px] h-full bg-gray-200" style={{ backgroundColor: colors.border }} />
              <View className="items-center flex-1">
                <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 18, color: colors.text }}>5</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Active</Text>
              </View>
            </View>
          </View>

          {/* Menu Items */}
          <View className="px-6 gap-3">
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => router.push(item.route as any)}
                className="flex-row items-center p-4 rounded-2xl mb-1 shadow-sm"
                style={{ backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}
              >
                <View className="p-2 rounded-xl mr-4" style={{ backgroundColor: isDark ? '#1E293B' : '#F3F4F6' }}>
                  <Ionicons name={item.icon as any} size={22} color={colors.text} />
                </View>
                <Text className="flex-1 text-base relative top-[1px]" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Media Section */}
          <View className="px-6 mt-6">
            <Text className="mb-4 text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Media & Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-3">
              {[1, 2, 3].map((i) => (
                <View key={i} className="w-64 h-40 rounded-2xl overflow-hidden relative shadow-sm" style={{ backgroundColor: colors.surface }}>
                  <Image
                    source={{ uri: `https://picsum.photos/400/300?random=${i + 50}` }}
                    className="w-full h-full"
                    style={{ opacity: 0.9 }}
                  />
                  <View className="absolute inset-0 items-center justify-center bg-black/20">
                    <Ionicons name="play-circle" size={40} color="#fff" />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

        </ScrollView>
        <Navbar />
      </View>
    </>
  );
}

