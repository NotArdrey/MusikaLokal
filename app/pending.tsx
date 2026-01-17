import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function PendingScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const { width } = useWindowDimensions();

  // Mock Data
  const pendingItems = [
    {
      id: 1,
      name: 'SoundWave Studio Malolos',
      date: 'Sat, Nov 16 • 2:00 PM - 3:00 PM',
      image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=300&fit=crop',
      status: 'Waiting for Approval',
      type: 'Studio Booking'
    },
    {
      id: 2,
      name: 'Echo Music Hub San Jose',
      date: 'Sun, Nov 17 • 4:30 PM - 5:30 PM',
      image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=300&fit=crop',
      status: 'Action Required',
      type: 'Gig Application'
    }
  ];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Pending" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 24, paddingTop: 16 }}>
          {pendingItems.map((item) => (
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
                <View className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md">
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
                    <Ionicons name="time-outline" size={16} color="#F59E0B" />
                    <Text className="text-xs ml-1.5" style={{ fontFamily: 'Poppins_500Medium', color: "#F59E0B" }}>{item.status}</Text>
                  </View>

                  {item.status === 'Action Required' ? (
                    <TouchableOpacity
                      onPress={() => setModalVisible(true)}
                      className="px-4 py-2 rounded-lg bg-green-600"
                    >
                      <Text className="text-xs text-white" style={{ fontFamily: 'Poppins_600SemiBold' }}>Confirm Now</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      className="px-4 py-2 rounded-lg border"
                      style={{ borderColor: colors.border }}
                    >
                      <Text className="text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>View Details</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0">
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Booking"
        message="Are you sure you want to confirm this booking?"
        buttonText="Confirm"
        onConfirm={() => setModalVisible(false)}
      />
    </>
  );
}
