import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ToReviewScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();

  // Mock Data
  const reviewItems = [
    {
      id: 1,
      name: 'SoundWave Studio Malolos',
      date: 'Sat, Nov 16 • 2:00 PM - 3:00 PM',
      image: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=300&fit=crop',
      status: 'Completed',
      type: 'Studio Booking'
    }
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Review" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24, paddingTop: 16 }}>
        {reviewItems.map((item) => (
          <View
            key={item.id}
            className="mb-4 rounded-2xl overflow-hidden shadow-sm border"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <View>
              <Image
                source={{ uri: item.image }}
                className="w-full h-36"
                resizeMode="cover"
                style={{ opacity: 0.8 }}
              />
              <View className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60">
                <Text className="text-white text-[10px] font-medium" style={{ fontFamily: 'Poppins_600SemiBold' }}>{item.type}</Text>
              </View>
            </View>

            <View className="p-4">
              <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 mr-2">
                  <Text className="text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }} numberOfLines={1}>{item.name}</Text>
                  <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{item.date}</Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between mt-2 pt-3 border-t" style={{ borderColor: isDark ? colors.border : '#F3F4F6' }}>
                <View className="flex-row items-center">
                  <Ionicons name="checkmark-done-circle" size={16} color={colors.textSecondary} />
                  <Text className="text-xs ml-1.5" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>{item.status}</Text>
                </View>

                <TouchableOpacity
                  className="px-4 py-2 rounded-lg border-2"
                  style={{ borderColor: colors.primary }}
                  onPress={() => router.push('/submit_review' as any)}
                >
                  <Text className="text-xs" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Leave Review</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        {reviewItems.length === 0 && (
          <View className="items-center justify-center py-20">
            <Ionicons name="star-outline" size={48} color={colors.border} />
            <Text className="mt-4 text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>No bookings to review</Text>
          </View>
        )}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <Navbar />
      </View>
    </View>
  );
}
