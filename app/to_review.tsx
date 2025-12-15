import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';

export default function ToReviewScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;
  const imageWidth = Math.min(Math.max(width * 0.38, 130), 170);

  return (
    <View className="flex-1 bg-white px-6">
      <Header title="Review" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="flex justify-between gap-1 mt-3">
          {/* Card */}
          <View
            className={`p-3 rounded-xl bg-white mx-1 my-2 shadow-md ${
              isNarrow ? 'flex-col' : 'flex-row items-stretch'
            }`}
          >
            <View className="flex-1 flex justify-between gap-2 py-2 pr-3">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }} numberOfLines={2}>
                SoundWave Studio Malolos
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#666' }} numberOfLines={1}>
                Sat, Nov 16 - 2:00 PM - 3:00 PM
              </Text>
              <TouchableOpacity
                className="bg-teal-500 rounded-lg px-3 py-2 mt-1 justify-center items-center"
                onPress={() => router.push('/submit_review')}
              >
                <Text className="text-white" style={{ fontFamily: 'Poppins_500Medium', fontSize: 12 }}>
                  Leave Review
                </Text>
              </TouchableOpacity>
            </View>

            <View
              className={`rounded-xl overflow-hidden ${isNarrow ? 'w-full mt-3' : ''}`}
              style={isNarrow ? { aspectRatio: 16 / 9 } : { width: imageWidth, aspectRatio: 16 / 9 }}
            >
              <Image
                className="rounded-xl h-full w-full"
                source={{ uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop' }}
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
  );
}