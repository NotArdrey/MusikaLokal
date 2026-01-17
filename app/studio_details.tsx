import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);

  const tabs = ['About', 'Setup', 'Book', 'Review'];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Studio Details" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Hero Section */}
          <View className="px-6 mt-4">
            <View
              className="w-full h-56 rounded-3xl overflow-hidden mb-4 relative shadow-lg"
              style={{ shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 }}
            >
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              {/* Report Button */}
              <TouchableOpacity
                onPress={() => router.push('/report?type=studio&name=SoundWave%20Studio' as any)}
                className="absolute top-3 right-3 w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <Ionicons name="flag-outline" size={18} color="#fff" />
              </TouchableOpacity>
              {/* Heart Button */}
              <TouchableOpacity
                className="absolute top-3 right-14 w-9 h-9 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <Ionicons name="heart-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <View className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
              <View className="absolute bottom-4 left-4 right-4">
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'Poppins_700Bold' }}>SoundWave Studio</Text>
                <View className="flex-row items-center mt-1">
                  <Ionicons name="location-outline" size={14} color="#E5E7EB" />
                  <Text className="text-gray-200 text-xs ml-1" style={{ fontFamily: 'Poppins_400Regular' }}>Malolos City, Bulacan, Philippines</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Tab Navigation */}
          <View className="mx-6 mt-2 p-1 rounded-2xl flex-row" style={{ backgroundColor: colors.inputBackground }}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center transition-all`}
                style={{
                  backgroundColor: activeTab === tab ? colors.surface : 'transparent',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: activeTab === tab ? 2 : 0 },
                  shadowOpacity: activeTab === tab ? 0.05 : 0,
                  shadowRadius: 4,
                  elevation: activeTab === tab ? 2 : 0
                }}
              >
                <Text
                  style={{
                    fontFamily: activeTab === tab ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
                    color: activeTab === tab ? colors.primary : colors.textSecondary,
                    fontSize: 13
                  }}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="px-6 mt-6">
            {activeTab === 'About' && (
              <View className="gap-6">
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-base leading-6" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                    SoundWave Recording Studio is a professional recording facility located in Malolos City, Bulacan. We offer state-of-the-art equipment including condenser microphones, acoustic treatment, mixing console, and monitoring systems.
                  </Text>
                </View>

                <View className="flex-row gap-4">
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                    <Ionicons name="resize-outline" size={24} color={colors.primary} className="mb-2" />
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Size</Text>
                    <Text className="text-lg" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>30 sqm</Text>
                  </View>
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                    <Ionicons name="mic-outline" size={24} color={colors.primary} className="mb-2" />
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Gear</Text>
                    <Text className="text-center text-xs" style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Pro Suite</Text>
                  </View>
                </View>

                <View>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Studio Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-3">
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 30}` }}
                        className="w-48 h-32 rounded-2xl"
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>

            )}

            {activeTab === 'Setup' && (
              <View className="gap-6">
                {/* Search / Filter Placeholder */}
                <View className="flex-row items-center px-4 py-2 rounded-xl" style={{ backgroundColor: colors.inputBackground }}>
                  <Ionicons name="search" size={20} color={colors.textSecondary} />
                  <Text className="ml-3 text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Search microphones, amps...</Text>
                </View>

                {['Microphones', 'Instruments', 'Monitoring', 'DAW & Interfaces'].map((category, idx) => (
                  <View key={idx}>
                    <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>{category}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {['Shure SM57', 'Neumann U87', 'Fender Twin Reverb', 'Logic Pro X', 'Apollo Twin'].slice(0, 4).map((item, i) => (
                        <View key={i} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                          <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 13 }}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}



            {activeTab === 'Book' && (
              <View className="gap-5">
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="mb-4 text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Booking Details</Text>

                  <View className="gap-4">
                    <View>
                      <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Date & Time</Text>
                      <View className="flex-row gap-2">
                        <TouchableOpacity className="flex-1 p-3 rounded-xl border border-gray-200 flex-row items-center justify-between" style={{ borderColor: colors.border }}>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}>Select Date</Text>
                          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity className="flex-1 p-3 rounded-xl border border-gray-200 flex-row items-center justify-between" style={{ borderColor: colors.border }}>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}>Time</Text>
                          <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View>
                      <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Duration</Text>
                      <View className="p-3 rounded-xl border border-gray-200" style={{ borderColor: colors.border }}>
                        <TextInput placeholder="Number of hours" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={{ fontFamily: 'Poppins_400Regular', color: colors.text }} />
                      </View>
                    </View>

                    <View>
                      <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>Notes</Text>
                      <View className="p-3 rounded-xl border border-gray-200" style={{ borderColor: colors.border }}>
                        <TextInput
                          placeholder="Any specific requirements?"
                          placeholderTextColor={colors.textSecondary}
                          multiline
                          style={{ fontFamily: 'Poppins_400Regular', color: colors.text, height: 60 }}
                        />
                      </View>
                    </View>
                  </View>
                </View>


                <View className="p-4 rounded-2xl flex-row items-center gap-4" style={{ backgroundColor: colors.surface }}>
                  <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center">
                    <Ionicons name="document-text-outline" size={24} color="#3B82F6" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Rental Agreement</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Review terms and conditions</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.primary }}>View</Text>
                  </TouchableOpacity>
                </View>

                <View className="p-5 rounded-2xl" style={{ backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }}>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text, marginBottom: 12 }}>Payment Summary</Text>
                  <View className="flex-row justify-between mb-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Hourly Rate</Text>
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>₱500.00</Text>
                  </View>
                  <View className="flex-row justify-between mb-4">
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Service Fee</Text>
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>₱50.00</Text>
                  </View>
                  <View className="pt-3 border-t border-gray-200 flex-row justify-between items-center" style={{ borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>Total</Text>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary, fontSize: 18 }}>₱550.00</Text>
                  </View>
                </View>

                <TouchableOpacity
                  className="w-full py-4 rounded-xl items-center mt-2 shadow-lg"
                  style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 }}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#fff' }}>Confirm Booking</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "Review" && (
              <View>
                <View className="items-center mb-8">
                  <Text className="text-5xl mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>4.8</Text>
                  <View className="flex-row gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={20} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Based on 42 reviews</Text>
                </View>

                <View className="p-4 rounded-2xl mb-4" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-row items-center gap-2">
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=5' }} className="w-8 h-8 rounded-full" />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Sarah Geronimo</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>1 month ago</Text>
                  </View>
                  <View className="flex-row gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Excellent studio! The acoustic treatment is superb and the equipment is professional-grade. Highly recommend for serious recording projects.
                  </Text>

                  {/* Review Interactions */}
                  <View className="flex-row items-center gap-4 mt-3">
                    <TouchableOpacity className="flex-row items-center gap-1">
                      <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>12</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-row items-center gap-1">
                      <Ionicons name="chatbubble-outline" size={16} color={colors.textSecondary} />
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

          </View>
        </ScrollView>

        <Navbar />
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Booking"
        message="Are you sure you want to confirm this booking?"
        buttonText="Confirm">
      </Modal>
    </>
  );
}

