import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ExploreScreen() {
  const { colors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const services = [
    { title: 'Gigs', icon: 'microphone-variant', color: '#8B5CF6', image: 'https://picsum.photos/300/200?random=20' },
    { title: 'Studios', icon: 'headphones', color: '#10B981', image: 'https://picsum.photos/300/200?random=21' },
    { title: 'Musicians', icon: 'account-music', color: '#F59E0B', image: 'https://picsum.photos/300/200?random=22' },
    { title: 'Events', icon: 'ticket-confirmation', color: '#EF4444', image: 'https://picsum.photos/300/200?random=23' },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Explore" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* Search Bar */}
        <View className="px-6 mb-6">
          <View className="flex-row items-center px-4 py-3.5 rounded-2xl" style={{ backgroundColor: colors.inputBackground }}>
            <Ionicons name="search" size={20} color={colors.textSecondary} />
            <TextInput
              placeholder="What are you looking for?"
              placeholderTextColor={colors.textSecondary}
              className="flex-1 ml-3 text-base"
              style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Categories Grid */}
        <View className="px-6 mb-8">
          <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Browse Categories</Text>
          <View className="flex-row flex-wrap justify-between gap-y-4">
            {services.map((service, index) => (
              <TouchableOpacity
                key={index}
                className="w-[48%] rounded-3xl overflow-hidden h-36 relative"
                onPress={() => router.push('/find_talent_and_spaces')}
                style={{ elevation: 4, shadowColor: service.color, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 }}
              >
                <Image
                  source={{ uri: service.image }}
                  className="absolute w-full h-full"
                  style={{ opacity: 0.8 }}
                />
                <View className="absolute inset-0 bg-black/30" />
                <View className="absolute bottom-3 left-3">
                  <View className="p-2 rounded-full self-start mb-2 bg-white/20 backdrop-blur-md">
                    <MaterialCommunityIcons name={service.icon as any} size={20} color="#FFF" />
                  </View>
                  <Text className="text-white font-bold text-lg" style={{ fontFamily: 'Poppins_600SemiBold' }}>{service.title}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Trending Section */}
        <View className="px-6 mb-6">
          <View className="flex-row items-center mb-4">
            <Ionicons name="trending-up" size={20} color={colors.primary} />
            <Text className="text-lg ml-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Trending Near You</Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-4" contentContainerStyle={{ paddingRight: 24 }}>
            {[1, 2, 3].map((item, i) => (
              <TouchableOpacity
                key={i}
                className="w-64 p-3 rounded-2xl mr-4"
                style={{ backgroundColor: colors.card, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 }}
                onPress={() => { }}
              >
                <Image
                  source={{ uri: `https://picsum.photos/300/200?random=${30 + i}` }}
                  className="w-full h-32 rounded-xl mb-3"
                />
                <Text className="text-sm px-1 mb-1 font-semibold" style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold' }}>POPULAR</Text>
                <Text className="text-base px-1 mb-1" numberOfLines={1} style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>Bulacan State University Field</Text>
                <Text className="text-xs px-1 text-gray-500" style={{ fontFamily: 'Poppins_400Regular' }}>Available for Concerts</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

      </ScrollView>

      <Navbar />
    </View>
  );
}
