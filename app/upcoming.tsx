import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function UpcomingScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;
  const imageWidth = Math.min(Math.max(width * 0.38, 130), 170);

  return (
    <>
      <View className="flex-1 px-4" style={{ backgroundColor: colors.background }}>
        <Header title="Upcoming" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <View className="flex flex-col gap-2 mt-3">
            {/* Card 1 */}
            <View
              className={`p-3 rounded-xl mx-1 my-2 shadow-md ${isNarrow ? 'flex-col' : 'flex-row items-stretch'}`}
              style={{ backgroundColor: colors.card, borderWidth: isDark ? 1 : 0, borderColor: colors.border }}
            >
              <View className="flex-1 flex justify-between gap-2 py-2 pr-3">
                <Text className="text-green-600" style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
                  Active
                </Text>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }} numberOfLines={2}>
                  Echo Music Hub San Jose
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                  Sun, Nov 17 - 4:30 PM - 5:00 PM
                </Text>
                <TouchableOpacity className="bg-[#009c8d] rounded-lg px-3 py-2 justify-center items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: '#fff' }}>View Details</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setModalVisible(true)}
                  className="bg-red-700 rounded-lg px-3 py-2 justify-center items-center"
                >
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: '#fff' }}>Cancel</Text>
                </TouchableOpacity>
              </View>

              <View
                className={`rounded-xl overflow-hidden ${isNarrow ? 'w-full mt-3' : ''}`}
                style={isNarrow ? { aspectRatio: 16 / 9 } : { width: imageWidth, aspectRatio: 16 / 9 }}
              >
                <Image
                  className="rounded-xl h-full w-full"
                  source={{ uri: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=130&fit=crop' }}
                  resizeMode="cover"
                />
              </View>
            </View>

            {/* Card 2 */}
            <View
              className={`p-3 rounded-xl mx-1 my-2 shadow-md ${isNarrow ? 'flex-col' : 'flex-row items-stretch'}`}
              style={{ backgroundColor: colors.card, borderWidth: isDark ? 1 : 0, borderColor: colors.border }}
            >
              <View className="flex-1 flex justify-between gap-2 py-2 pr-3">
                <Text className="text-red-600" style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>
                  Cancelled
                </Text>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }} numberOfLines={2}>
                  Echo Music Hub San Jose
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
                  Sun, Nov 17 - 4:30 PM - 5:00 PM
                </Text>
                <TouchableOpacity className="bg-[#009c8d] rounded-lg px-3 py-2 justify-center items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 11, color: '#fff' }}>View Details</Text>
                </TouchableOpacity>
              </View>

              <View
                className={`rounded-xl overflow-hidden ${isNarrow ? 'w-full mt-3' : ''}`}
                style={isNarrow ? { aspectRatio: 16 / 9 } : { width: imageWidth, aspectRatio: 16 / 9 }}
              >
                <Image
                  className="rounded-xl h-full w-full"
                  source={{ uri: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=130&fit=crop' }}
                  resizeMode="cover"
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0">
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Cancel Booking"
        message="Are you sure you want to cancel this booking?"
        buttonText="Cancel Booking"
      />
    </>
  );
}
