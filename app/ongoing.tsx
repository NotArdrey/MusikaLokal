import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function OngoingScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();

  // Mock Data
  const ongoingItems = [
    {
      id: 1,
      name: 'Music One Studios Makati',
      date: 'Sat, Dec 14 • 2:00 PM - 4:00 PM',
      image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=300&fit=crop',
      status: 'In Progress',
      type: 'Studio Booking'
    },
    {
      id: 2,
      name: 'Saguijo Cafe + Bar Makati',
      date: 'Fri, Dec 13 • 8:00 PM - 11:00 PM',
      image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=300&fit=crop',
      status: 'Happening Now',
      type: 'Gig'
    }
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Ongoing" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24, paddingTop: 16 }}>
        {ongoingItems.map((item) => (
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
              />
              <View className="absolute top-3 left-3 px-3 py-1 rounded-full bg-indigo-500 shadow-md">
                <Text className="text-white text-[10px] font-medium" style={{ fontFamily: 'Poppins_600SemiBold' }}>{item.type}</Text>
              </View>

              <View className="absolute top-3 right-3 px-3 py-1 rounded-full bg-green-500 shadow-md flex-row items-center animate-pulse">
                <View className="w-2 h-2 rounded-full bg-white mr-1.5" />
                <Text className="text-white text-[10px] font-bold uppercase">Live</Text>
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
                  <Ionicons name="play-circle" size={16} color="#10B981" />
                  <Text className="text-xs ml-1.5" style={{ fontFamily: 'Poppins_500Medium', color: "#10B981" }}>{item.status}</Text>
                </View>

                <TouchableOpacity
                  className="px-4 py-2 rounded-lg bg-indigo-500 shadow-sm shadow-indigo-300"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text className="text-xs text-white" style={{ fontFamily: 'Poppins_600SemiBold' }}>Upload Proof</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <Navbar />
      </View>
    </View>
  );
}
