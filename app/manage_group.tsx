import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function GroupDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');

  const handleAction = (action: string) => {
    if (action === 'accept') {
      setModalTitle('Accept Invitation');
      setModalMessage('Are you sure you want to accept this invitation?');
      setModalButtonText('Accept');
    } else {
      setModalTitle('Decline Invitation');
      setModalMessage('Are you sure you want to decline this invitation?');
      setModalButtonText('Decline');
    }
    setModalVisible(true);
  }

  const tabs = ['About', 'Setup', 'Connect', 'Review'];

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Manage Group" />

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
                source={{ uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=800&fit=crop' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              <View className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
            </View>

            <Text className="text-2xl text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Junction 88 Music Bar</Text>
            <Text className="text-center mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Live Music Venue • Plaridel, Bulacan</Text>
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
                    The Junction 88 Music Bar is a premier live music venue in Plaridel, Bulacan, Philippines, known for its intimate atmosphere and diverse lineup of artists. We offer a full bar, stage lighting, and sound equipment for performers.
                  </Text>
                </View>

                <View className="flex-row gap-4">
                  <View className="flex-1 p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Capacity</Text>
                    <Text className="text-lg" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>69</Text>
                  </View>
                  <View className="flex-1 p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Services</Text>
                    <Text className="text-sm" style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Sound System, Lights</Text>
                  </View>
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Availability Settings</Text>

                  <View className="flex-row items-center justify-between mb-4">
                    <View>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Accepting Bookings</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Allow venues to book this group</Text>
                    </View>
                    <TouchableOpacity className="w-12 h-7 rounded-full bg-primary-500 items-end justify-center px-1">
                      <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                    </TouchableOpacity>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Looking for Members</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Allow musicians to apply to join</Text>
                    </View>
                    <TouchableOpacity className="w-12 h-7 rounded-full bg-gray-300 dark:bg-gray-600 items-start justify-center px-1">
                      <View className="w-5 h-5 rounded-full bg-white shadow-sm" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Completion Rate</Text>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-2xl" style={{ fontFamily: 'Poppins_600SemiBold', color: '#10b981' }}>98%</Text>
                    <View className="flex-1 h-3 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                      <View className="h-full bg-green-500 w-[98%]" />
                    </View>
                  </View>
                </View>

                <View>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-3">
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 20}` }}
                        className="w-40 h-28 rounded-xl"
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Gigs section moved to About - keeping for reference */}
            {false && (
              <View className="gap-4">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.textSecondary, letterSpacing: 0.5 }}>GIG INVITATIONS</Text>

                {/* Invitation Card 1 */}
                <View className="p-4 rounded-3xl mb-2" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&h=100&fit=crop' }} className="w-12 h-12 rounded-xl" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>The Blue Note Bar</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Live Music Venue • Makati City</Text>
                    </View>
                    <View className="px-2 py-1 rounded-lg bg-yellow-400/20">
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">4.9</Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mb-3 bg-gray-50 dark:bg-slate-800/50 p-2 rounded-lg">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 13 }}>Dec 22 • 8:00 PM</Text>
                    </View>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary, fontSize: 14 }}>₱8,000</Text>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"We loved your performance at our sister venue! Would you be interested in a 3-hour set?"</Text>

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

                {/* Invitation Card 2 */}
                <View className="p-4 rounded-3xl" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row items-center gap-3 mb-3">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&h=100&fit=crop' }} className="w-12 h-12 rounded-xl" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Sunset Beach Resort</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Resort • Batangas</Text>
                    </View>
                    <View className="px-2 py-1 rounded-lg bg-yellow-400/20">
                      <View className="flex-row items-center gap-1">
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">4.7</Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mb-3 bg-gray-50 dark:bg-slate-800/50 p-2 rounded-lg">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 13 }}>Dec 31 • 9:00 PM</Text>
                    </View>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary, fontSize: 14 }}>₱15,000</Text>
                  </View>

                  <Text className="mb-4 italic text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>"Hosting a New Year's Eve countdown party. Accommodation and meals included!"</Text>

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

            {activeTab === 'Setup' && (
              <View className="gap-6">
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-lg" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Stage Plot</Text>
                    <TouchableOpacity>
                      <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <View className="h-48 border-2 border-dashed rounded-xl items-center justify-center mb-2" style={{ borderColor: colors.border, backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                    <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
                    <Text className="text-xs mt-2" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Standard 4-Piece Setup</Text>
                  </View>
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-lg" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Input List</Text>
                    <TouchableOpacity>
                      <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Add Input</Text>
                    </TouchableOpacity>
                  </View>

                  {[
                    { ch: 1, name: 'Kick', mic: 'Beta 52', stand: 'Boom' },
                    { ch: 2, name: 'Snare Top', mic: 'SM57', stand: 'Clip' },
                    { ch: 3, name: 'Hi-Hat', mic: 'SM81', stand: 'Boom' },
                    { ch: 4, name: 'Bass DI', mic: 'J48', stand: '-' },
                    { ch: 5, name: 'Gtr SL', mic: 'e609', stand: 'Short' },
                    { ch: 6, name: 'Vox Center', mic: 'SM58', stand: 'Straight' },
                  ].map((item, index) => (
                    <View key={index} className="flex-row items-center py-3 border-b" style={{ borderColor: colors.border }}>
                      <View className="w-8 items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-md mr-3">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{item.ch}</Text>
                      </View>
                      <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item.name}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>{item.mic} • {item.stand}</Text>
                      </View>
                      <TouchableOpacity>
                        <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Hospitality</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                    Allergies: Peanuts (Bass Player).{'\n'}
                    Preferences: 4x Bottled Water, 2x Towels per show.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'Connect' && (
              <View className="gap-6">
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Featured Video</Text>
                  <View className="h-48 rounded-xl overflow-hidden relative">
                    <Image
                      source={{ uri: 'https://images.unsplash.com/photo-1516280440614-6697288d5d38?w=800&fit=crop' }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                    <View className="absolute inset-0 items-center justify-center bg-black/30">
                      <Ionicons name="play-circle" size={64} color="#FFF" />
                    </View>
                  </View>
                  <Text className="mt-3 text-base" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Live at The Grand Theater (2025)</Text>
                  <Text className="text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>1.2M Views</Text>
                </View>

                <View>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Press & EPK</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-6 px-6 gap-4">
                    <View className="w-64 p-4 rounded-2xl border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                      <Text className="text-3xl font-bold mb-1" style={{ fontFamily: 'Poppins_700Bold', color: colors.primary }}>TOP 10</Text>
                      <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>"Acts to Watch in 2026"</Text>
                      <Text className="text-xs mt-2 text-gray-400">- Rolling Stone PH</Text>
                    </View>
                    <View className="w-64 p-4 rounded-2xl border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
                      <Text className="text-3xl font-bold mb-1" style={{ fontFamily: 'Poppins_700Bold', color: colors.primary }}>150+</Text>
                      <Text className="text-sm" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>Shows played last year</Text>
                      <Text className="text-xs mt-2 text-gray-400">- Verified Metric</Text>
                    </View>
                  </ScrollView>
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Audio Demo</Text>
                  {[
                    { title: "Midnight Blues (Demo)", duration: "3:45" },
                    { title: "City Lights (Live)", duration: "4:20" },
                    { title: "Acoustic Session Vol. 1", duration: "12:10" }
                  ].map((track, i) => (
                    <View key={i} className="flex-row items-center py-3 border-b last:border-0" style={{ borderColor: colors.border }}>
                      <TouchableOpacity className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 items-center justify-center mr-3">
                        <Ionicons name="play" size={20} color={colors.primary} />
                      </TouchableOpacity>
                      <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{track.title}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>{track.duration}</Text>
                      </View>
                      <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                    </View>
                  ))}
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
                    Amazing venue! The sound system was top-notch and the staff was incredibly professional.
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

