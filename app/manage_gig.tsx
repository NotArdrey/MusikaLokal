import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function GigDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');

  const handleAction = (action: string) => {
    if (action === 'accept') {
      setModalTitle('Accept Application');
      setModalMessage('Are you sure you want to accept this application?');
      setModalButtonText('Accept');
    } else {
      setModalTitle('Decline Application');
      setModalMessage('Are you sure you want to decline this application?');
      setModalButtonText('Decline');
    }
    setModalVisible(true);
  }

  const tabs = ['About', 'Info', 'Applicants', 'Review'];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Manage Gig" />

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
                source={{ uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              <View className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
            </View>

            <Text className="text-2xl text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Acoustic Sunset Session</Text>
            <Text className="text-center mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Junction 88 Music Bar • Plaridel, Bulacan</Text>
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
                    We are looking for an acoustic duo or trio to perform at our weekly Sunset Session. The vibe is chill and laid back. Performers must have their own instruments. Sound system provided.
                  </Text>
                </View>

                {/* The "Deal" Card */}
                <View className="p-5 rounded-3xl" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary }}>
                  <View className="flex-row items-center gap-2 mb-2">
                    <Ionicons name="cash-outline" size={24} color={colors.primary} />
                    <Text className="text-lg" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>The Deal</Text>
                  </View>
                  <View className="flex-row justify-between items-end border-b pb-4 mb-4" style={{ borderColor: colors.border }}>
                    <View>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Payout Structure</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Guarantee + Door Split</Text>
                    </View>
                    <View className="items-end">
                      <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary, fontSize: 24 }}>₱3,500</Text>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>+ 20% of Door</Text>
                    </View>
                  </View>
                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 12 }}>Time Commitment</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>3 Sets (45m each)</Text>
                    </View>
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 12 }}>Meal Warrant</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Included (₱500 cap)</Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Venue Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-3">
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 30}` }}
                        className="w-40 h-28 rounded-xl"
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {activeTab === 'Info' && (
              <View className="gap-6">
                <View className="flex-row gap-4">
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center bg-indigo-50 dark:bg-indigo-900/30">
                    <Ionicons name="people-outline" size={28} color={colors.primary} />
                    <Text className="mt-2 text-xs uppercase font-bold text-indigo-400">Capacity</Text>
                    <Text className="text-xl font-bold" style={{ color: colors.text }}>150</Text>
                  </View>
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center bg-purple-50 dark:bg-purple-900/30">
                    <Ionicons name="mic-outline" size={28} color="#A855F7" />
                    <Text className="mt-2 text-xs uppercase font-bold text-purple-400">PA System</Text>
                    <Text className="text-xl font-bold" style={{ color: colors.text }}>In-House</Text>
                  </View>
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Tech Specs</Text>

                  <View className="space-y-4">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
                          <Ionicons name="construct-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Sound Engineer</Text>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Available for Soundcheck & Show</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>

                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
                          <Ionicons name="flash-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Backline Provided</Text>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Drum Kit, Bass Amp, 2x Gtr Amps</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>

                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 items-center justify-center">
                          <Ionicons name="videocam-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Projector / Screen</Text>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>HDMI Connection on Stage Left</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Timeline merged into Info - keeping for reference */}
            {false && (
              <View className="gap-6 px-4">
                <View className="border-l-2 ml-4 space-y-8 py-2" style={{ borderColor: colors.primary }}>
                  <View className="relative pl-8">
                    <View className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 bg-white dark:bg-black" style={{ borderColor: colors.primary }} />
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary }}>4:00 PM</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 18 }}>Load In</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Artist Arrival & Gear Setup</Text>
                  </View>

                  <View className="relative pl-8">
                    <View className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 bg-white dark:bg-black" style={{ borderColor: colors.primary }} />
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary }}>5:00 PM</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 18 }}>Soundcheck</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Line Check & Monitor Mix</Text>
                  </View>

                  <View className="relative pl-8">
                    <View className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 bg-white dark:bg-black" style={{ borderColor: colors.primary }} />
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary }}>7:00 PM</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 18 }}>Doors Open</Text>
                  </View>

                  <View className="relative pl-8">
                    <View className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-primary-500 shadow-md shadow-primary-500/50" style={{ backgroundColor: colors.primary }} />
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary }}>8:00 PM</Text>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 18 }}>Show Time</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Set 1 starts</Text>
                  </View>
                </View>

                <View className="p-4 rounded-2xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
                  <View className="flex-row gap-2">
                    <Ionicons name="warning-outline" size={20} color="#EAB308" />
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#EAB308' }}>Curfew</Text>
                  </View>
                  <Text className="mt-1 text-sm text-yellow-800 dark:text-yellow-200" style={{ fontFamily: 'Poppins_400Regular' }}>
                    Strict noise curfew at 11:00 PM. All amplified music must stop.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'Applicants' && (
              <View className="gap-4">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.textSecondary, letterSpacing: 0.5 }}>APPLICANTS LIST</Text>

                {/* Applicant Card 1 */}
                <View className="p-4 rounded-3xl mb-2" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://i.pravatar.cc/100?img=12' }} className="w-12 h-12 rounded-full" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>The Rock Band</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Rock • 5 members</Text>
                    </View>
                    <View className="px-2 py-1 rounded-lg bg-yellow-400/20">
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">4.8</Text>
                      </View>
                    </View>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"We're a professional rock band with 5 years of experience. We'd love to perform at your event!"</Text>

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

                {/* Applicant Card 2 */}
                <View className="p-4 rounded-3xl" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://i.pravatar.cc/100?img=24' }} className="w-12 h-12 rounded-full" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Jazz Vibes Collective</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Jazz • 4 members</Text>
                    </View>
                    <View className="px-2 py-1 rounded-lg bg-yellow-400/20">
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">4.9</Text>
                      </View>
                    </View>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"Smooth jazz quartet specializing in contemporary and classic jazz. We bring sophistication to any event."</Text>

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

                {/* Applicant Card 3 */}
                <View className="p-4 rounded-3xl mt-2" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://i.pravatar.cc/100?img=33' }} className="w-12 h-12 rounded-full" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Acoustic Souls</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Acoustic • 3 members</Text>
                    </View>
                    <View className="px-2 py-1 rounded-lg bg-yellow-400/20">
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">4.7</Text>
                      </View>
                    </View>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"Intimate acoustic performances perfect for creating a cozy atmosphere."</Text>

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

