import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = ['All', 'Gigs', 'Musicians', 'Studios'];

  const renderStarRating = (rating: number) => (
    <View className="flex-row items-center bg-yellow-400/20 px-2 py-1 rounded-lg">
      <Ionicons name="star" size={12} color="#FBBF24" />
      <Text className="ml-1 text-xs font-semibold text-yellow-600 dark:text-yellow-400">{rating}</Text>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Discover" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>

        {/* Hero / Search Section */}
        <View className="px-6 mb-6">
          <Text className="text-3xl" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Find your <Text style={{ color: colors.primary }}>rhythm</Text>
          </Text>
          <Text className="text-base mt-1 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Book the best local talent and spaces.
          </Text>

          <View className="flex-row items-center px-4 py-3 rounded-2xl" style={{ backgroundColor: colors.inputBackground }}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              placeholder="Search gigs, bands, studios..."
              placeholderTextColor={colors.textSecondary}
              className="flex-1 ml-3 text-base"
              style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
            />
          </View>
        </View>

        {/* Categories */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 mb-8 gap-3" contentContainerStyle={{ paddingRight: 24 }}>
          {categories.map((cat, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-full mr-2 ${activeCategory === cat ? 'bg-primary-600' : 'bg-transparent border'}`}
              style={{
                backgroundColor: activeCategory === cat ? colors.primary : 'transparent',
                borderColor: activeCategory === cat ? colors.primary : colors.border
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color: activeCategory === cat ? '#FFF' : colors.textSecondary,
                  fontFamily: 'Poppins_500Medium'
                }}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Featured Section */}
        <View className="px-6 mb-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Featured</Text>
            <TouchableOpacity onPress={() => router.push('/find_talent_and_spaces')}>
              <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>See All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-4" contentContainerStyle={{ paddingRight: 24 }}>
            {/* Card 1 */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/gig_details')}
              className="w-72 rounded-3xl p-3 mr-4"
              style={{ backgroundColor: colors.card, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 }}
            >
              <View className="relative">
                <Image
                  source={{ uri: 'https://picsum.photos/400/250?random=10' }}
                  className="w-full h-40 rounded-2xl"
                  resizeMode="cover"
                />
                <View className="absolute bottom-3 right-3 flex-row items-center bg-white/90 rounded-full px-2.5 py-1">
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text className="ml-1 text-xs font-bold text-gray-900" style={{ fontFamily: 'Poppins_600SemiBold' }}>4.9</Text>
                </View>
                <View className="absolute top-3 right-3 bg-white/90 p-2 rounded-full">
                  <Ionicons name="heart-outline" size={18} color={colors.primary} />
                </View>
              </View>

              <View className="mt-3 px-1">
                <Text className="text-base mb-1" numberOfLines={1} style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Summer Jazz Festival</Text>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                  <Text className="text-xs ml-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>Malolos Convention Center</Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                    <Text className="text-[10px] font-medium text-indigo-600 dark:text-indigo-300">Jazz</Text>
                  </View>
                  <View className="px-2 py-1 bg-pink-50 dark:bg-pink-900/30 rounded-lg">
                    <Text className="text-[10px] font-medium text-pink-600 dark:text-pink-300">Live Band</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            {/* Card 2 */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/studio_details')}
              className="w-72 rounded-3xl p-3 mr-4"
              style={{ backgroundColor: colors.card, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 }}
            >
              <View className="relative">
                <Image
                  source={{ uri: 'https://picsum.photos/400/250?random=11' }}
                  className="w-full h-40 rounded-2xl"
                  resizeMode="cover"
                />
                <View className="absolute bottom-3 right-3 flex-row items-center bg-white/90 rounded-full px-2.5 py-1">
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text className="ml-1 text-xs font-bold text-gray-900" style={{ fontFamily: 'Poppins_600SemiBold' }}>5.0</Text>
                </View>
                <View className="absolute top-3 right-3 bg-white/90 p-2 rounded-full">
                  <Ionicons name="heart-outline" size={18} color={colors.primary} />
                </View>
              </View>

              <View className="mt-3 px-1">
                <Text className="text-base mb-1" numberOfLines={1} style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>SoundWave Studio</Text>
                <View className="flex-row items-center mb-2">
                  <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
                  <Text className="text-xs ml-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>Plaridel, Bulacan</Text>
                </View>
                <View className="flex-row gap-2">
                  <View className="px-2 py-1 bg-green-50 dark:bg-green-900/30 rounded-lg">
                    <Text className="text-[10px] font-medium text-green-600 dark:text-green-300">Recording</Text>
                  </View>
                  <View className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <Text className="text-[10px] font-medium text-blue-600 dark:text-blue-300">Mixing</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* New Arrivals List */}
        <View className="px-6">
          <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>New Arrivals</Text>

          {[1, 2, 3].map((item, i) => (
            <TouchableOpacity
              key={i}
              className="flex-row mb-4 p-3 rounded-2xl items-center"
              style={{ backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 2 }}
              onPress={() => router.push('/group_details')}
            >
              <Image
                source={{ uri: `https://picsum.photos/100/100?random=${20 + i}` }}
                className="w-20 h-20 rounded-xl"
              />
              <View className="flex-1 ml-4 justify-center">
                <Text className="text-base font-semibold" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>The Weekenders</Text>
                <Text className="text-xs mt-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>Indie Rock Band • 4 Members</Text>
                <View className="flex-row items-center mt-2">
                  <Ionicons name="star" size={12} color={colors.primary} />
                  <Text className="text-xs ml-1 font-medium" style={{ color: colors.primary }}>4.5 (12 reviews)</Text>
                </View>
              </View>
              <View className="bg-gray-100 dark:bg-gray-800 p-2 rounded-full">
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          ))}

        </View>

      </ScrollView>

      <Navbar />
    </View>
  );
}
