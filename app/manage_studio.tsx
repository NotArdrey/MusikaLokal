import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');

  const handleAction = (action: string) => {
    if (action === 'accept') {
      setModalTitle('Accept Booking');
      setModalMessage('Are you sure you want to accept this booking request?');
      setModalButtonText('Accept');
    } else {
      setModalTitle('Decline Booking');
      setModalMessage('Are you sure you want to decline this booking request?');
      setModalButtonText('Decline');
    }
    setModalVisible(true);
  }

  const tabs = ['About', 'Setup', 'Bookings', 'Review'];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Manage Studio" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Header Image & Info */}
          <View className="px-6 mt-4 items-center">
            <View
              className="w-full h-48 rounded-3xl overflow-hidden mb-4 relative"
              style={{
                elevation: 10, shadowColor: colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16
              }}
            >
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              <View className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
            </View>

            <Text className="text-2xl text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>SoundWave Recording Studio</Text>
            <Text className="text-center mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Professional Recording Studio • Malolos City</Text>
          </View>

          {/* Segmented Control Tabs */}
          <View className="mx-6 mt-6 p-1 rounded-2xl flex-row" style={{ backgroundColor: colors.inputBackground }}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 rounded-xl items-center justify-center`}
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
                <View>
                  <Text className="text-base leading-6" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                    SoundWave Recording Studio is a professional recording facility located in Malolos City, Bulacan. We offer state-of-the-art equipment including condenser microphones, acoustic treatment, mixing console, and monitoring systems. Perfect for musicians, bands, podcasters, and voice-over artists.
                  </Text>
                </View>

                <View className="flex-row gap-4">
                  <View className="flex-1 p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Size</Text>
                    <Text className="text-lg" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>30 sqm</Text>
                  </View>
                  <View className="flex-1 p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Equipment</Text>
                    <Text className="text-sm" style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Full Suite, Mixing Board</Text>
                  </View>
                </View>

                <View>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-3">
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 10}` }}
                        className="w-40 h-28 rounded-xl"
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

                <TouchableOpacity className="py-3 rounded-xl items-center border border-dashed" style={{ borderColor: colors.primary }}>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>+ Add Gear Item</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Acoustics merged into Setup - keeping for reference */}
            {false && (
              <View className="gap-6">
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Room Profile</Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {['#DeadRoom', '#VocalBooth', '#FloatingFloor', '#DiffusedHighs'].map((tag, i) => (
                      <View key={i} className="px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30">
                        <Text className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{tag}</Text>
                      </View>
                    ))}
                  </View>

                  <View className="flex-row justify-between py-3 border-t" style={{ borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Reverb Time (RT60)</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>0.4s (Dry)</Text>
                  </View>
                  <View className="flex-row justify-between py-3 border-t" style={{ borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Dimensions</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>5m x 4m x 3m</Text>
                  </View>
                  <View className="flex-row justify-between py-3 border-t" style={{ borderColor: colors.border }}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Isolation</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>-60dB</Text>
                  </View>
                </View>

                <View className="h-40 rounded-2xl items-center justify-center bg-gray-100 dark:bg-slate-800">
                  <Ionicons name="bar-chart-outline" size={48} color={colors.textSecondary} />
                  <Text className="mt-2 text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Frequency Response Graph Placeholder</Text>
                </View>
              </View>
            )}

            {activeTab === 'Bookings' && (
              <View className="gap-4">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.textSecondary, letterSpacing: 0.5 }}>PENDING REQUESTS</Text>

                {/* Booking Card 1 */}
                <View className="p-4 rounded-3xl mb-2" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://i.pravatar.cc/100?img=3' }} className="w-12 h-12 rounded-full" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Marcus Rivera</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Solo Artist • Singer-Songwriter</Text>
                    </View>
                    <View className="items-end">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary, fontSize: 16 }}>₱2,000</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 11 }}>4 hours</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mb-3 bg-gray-50 dark:bg-slate-800/50 p-2 rounded-lg">
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 13 }}>Dec 15, 2025 • 2:00 PM - 6:00 PM</Text>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"I'd like to record my upcoming EP. I have 5 songs ready."</Text>

                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => handleAction('decline')}
                      className="flex-1 py-3 rounded-xl border items-center justify-center"
                      style={{ borderColor: colors.border }}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAction('accept')}
                      className="flex-1 py-3 rounded-xl items-center justify-center"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#FFF' }}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Booking Card 2 */}
                <View className="p-4 rounded-3xl" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://i.pravatar.cc/100?img=5' }} className="w-12 h-12 rounded-full" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>The Midnight Echoes</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Band • Indie Rock</Text>
                    </View>
                    <View className="items-end">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary, fontSize: 16 }}>₱3,000</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 11 }}>6 hours</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mb-3 bg-gray-50 dark:bg-slate-800/50 p-2 rounded-lg">
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 13 }}>Dec 18, 2025 • 10:00 AM - 4:00 PM</Text>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"Recording our debut single. We need full suite."</Text>

                  <View className="flex-row gap-3">
                    <TouchableOpacity
                      onPress={() => handleAction('decline')}
                      className="flex-1 py-3 rounded-xl border items-center justify-center"
                      style={{ borderColor: colors.border }}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAction('accept')}
                      className="flex-1 py-3 rounded-xl items-center justify-center"
                      style={{ backgroundColor: colors.primary }}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#FFF' }}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {activeTab === 'Review' && (
              <View>
                <View className="items-center mb-8">
                  <Text className="text-5xl mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>4.5</Text>
                  <View className="flex-row gap-1 mb-2">
                    {[1, 2, 3, 4].map(i => <Ionicons key={i} name="star" size={20} color={colors.primary} />)}
                    <Ionicons name="star-half" size={20} color={colors.primary} />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Based on 25 reviews</Text>
                </View>

                <View className="p-4 rounded-2xl mb-4" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-row items-center gap-2">
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=3' }} className="w-8 h-8 rounded-full" />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Jared Cariaso</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>1 month ago</Text>
                  </View>
                  <View className="flex-row gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Excellent studio! The acoustic treatment is superb and the equipment is professional-grade.
                  </Text>
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
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
      />
    </>
  );
}

