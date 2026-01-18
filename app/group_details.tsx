import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: { action: 'fetch', type: 'group', id: id || 'bd9552d7-b827-449e-8c43-2a4439c2c62c', userId } // Fallback ID for demo if param missing
      });

      if (error) throw error;
      setGroup(data);
      setIsOwner(data.is_owner);
      setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error fetching group:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    // Optimistic update
    setIsFavorited(!isFavorited);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.functions.invoke('manage-details', {
        body: { action: 'toggle_favorite', type: 'group', id: group.id, userId: user.id }
      });

      // Sync with server result just in case
      if (data) setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error toggling favorite:', e);
      // Revert
      setIsFavorited(!isFavorited);
    }
  };

  const handleReport = () => {
    router.push({ pathname: '/report', params: { type: 'group', id: group.id, name: group.name } } as any);
  };

  const tabs = ['About', 'Setup', 'Connect', 'Review'];

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Group not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Group Details" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Hero Section */}
          <View className="px-6 mt-4">
            <View
              className="w-full h-56 rounded-3xl overflow-hidden mb-4 relative shadow-lg"
              style={{ shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 }}
            >
              <Image
                source={{ uri: (group.images && group.images[0]) || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&fit=crop' }}
                className="w-full h-full"
                resizeMode="cover"
              />
              {/* Report Button - Hide if Owner */}
              {!isOwner && (
                <TouchableOpacity
                  onPress={handleReport}
                  className="absolute top-3 right-3 w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                >
                  <Ionicons name="flag-outline" size={18} color="#fff" />
                </TouchableOpacity>
              )}

              {/* Heart Button */}
              <TouchableOpacity
                onPress={toggleFavorite}
                className={`absolute top-3 ${!isOwner ? 'right-14' : 'right-3'} w-9 h-9 rounded-full items-center justify-center`}
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <Ionicons name={isFavorited ? "heart" : "heart-outline"} size={18} color={isFavorited ? "#EF4444" : "#fff"} />
              </TouchableOpacity>

              <View className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
              <View className="absolute bottom-4 left-4 right-4">
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'Poppins_700Bold' }}>{group.name}</Text>
                <View className="flex-row items-center mt-1">
                  <Text className="text-gray-200 text-sm ml-1" style={{ fontFamily: 'Poppins_500Medium' }}>{group.genre || 'Band'} • {group.members ? group.members.length : 0} Members</Text>
                </View>
                <View className="flex-row items-center mt-1">
                  <Ionicons name="location-outline" size={14} color="#E5E7EB" />
                  <Text className="text-gray-200 text-xs ml-1" style={{ fontFamily: 'Poppins_400Regular' }}>{group.location || 'Location not set'}</Text>
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
                    {group.description || 'No description provided.'}
                  </Text>
                </View>

                <View className="flex-row gap-4">
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                    <Ionicons name="musical-notes-outline" size={24} color={colors.primary} className="mb-2" />
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Genre</Text>
                    <Text className="text-center text-xs" style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>{group.genre || '-'}</Text>
                  </View>
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                    <Ionicons name="star-outline" size={24} color={colors.primary} className="mb-2" />
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Rating</Text>
                    <Text className="text-lg" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>{group.rating || 'N/A'}</Text>
                  </View>
                </View>

                {/* Owner Profile Link - Placeholder logic for now, assumes we might want to see the contact */}
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-sm uppercase tracking-wider mb-4" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Managed By</Text>
                  <TouchableOpacity onPress={() => router.push('/profile')} className="flex-row items-center gap-4">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop' }} className="w-12 h-12 rounded-full" />
                    <View className="flex-1">
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Owner Profile</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.primary }}>View Profile</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}



            {activeTab === 'Setup' && (
              <View className="gap-6">
                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Stage Plot</Text>
                  <View className="h-48 border-2 border-dashed rounded-xl items-center justify-center mb-2" style={{ borderColor: colors.border, backgroundColor: isDark ? '#1e293b' : '#f8fafc' }}>
                    <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
                    <Text className="text-xs mt-2" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Standard 4-Piece Setup</Text>
                  </View>
                </View>

                <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-lg mb-4" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Input List</Text>
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
                {/* For Venues - Booking */}
                <View>
                  <View className="flex-row items-center gap-2 mb-3">
                    <View className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 items-center justify-center">
                      <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                    </View>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>For Venues</Text>
                  </View>

                  <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <Text className="mb-3" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 13 }}>Send a booking request to hire this band for your event.</Text>

                    <Text className="mb-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Booking Message</Text>
                    <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderWidth: 1, borderColor: colors.border }}>
                      <TextInput
                        placeholder='Introduce yourself and your event details...'
                        placeholderTextColor={colors.textSecondary}
                        multiline={true}
                        style={{ height: 100, textAlignVertical: 'top', fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}
                      />
                    </View>

                    <Text className="mb-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Event Proposal</Text>
                    <TouchableOpacity className="border-2 border-dashed rounded-xl p-5 items-center justify-center mb-4" style={{ borderColor: colors.border }}>
                      <Ionicons name="document-attach-outline" size={28} color={colors.primary} />
                      <Text className="mt-2" style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Upload Event Details</Text>
                      <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>PDF, DOC (Max 10MB)</Text>
                    </TouchableOpacity>

                    <View className="flex-row items-center gap-3 p-3 rounded-xl mb-4" style={{ backgroundColor: isDark ? '#1e293b' : '#f0f9ff' }}>
                      <Ionicons name="newspaper-outline" size={20} color="#3B82F6" />
                      <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Booking Terms</Text>
                      </View>
                      <TouchableOpacity>
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.primary }}>View</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      className="w-full py-3.5 rounded-xl items-center shadow-md"
                      style={{ backgroundColor: colors.primary }}
                      onPress={() => setModalVisible(true)}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Submit Booking Request</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Divider */}
                <View className="flex-row items-center">
                  <View className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-700" />
                  <Text className="mx-4 text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>OR</Text>
                  <View className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-700" />
                </View>

                {/* For Musicians - Apply */}
                <View>
                  <View className="flex-row items-center gap-2 mb-3">
                    <View className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 items-center justify-center">
                      <Ionicons name="person-add-outline" size={18} color="#15803d" />
                    </View>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>Join the Band</Text>
                  </View>

                  {/* Auditioning Banner */}
                  <View className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 mb-4">
                    <View className="flex-row items-start gap-3">
                      <View className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-800 items-center justify-center">
                        <Ionicons name="megaphone-outline" size={20} color="#15803d" />
                      </View>
                      <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>We're Auditioning!</Text>
                        <Text className="mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 13 }}>
                          Looking for a <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Keyboardist</Text> and <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Bass Player</Text>. Send us your demo!
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="p-4 rounded-2xl" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <Text className="mb-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Why do you want to join?</Text>
                    <View className="rounded-xl p-3 mb-4" style={{ backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderWidth: 1, borderColor: colors.border }}>
                      <TextInput
                        placeholder='Tell us about your experience and influences...'
                        placeholderTextColor={colors.textSecondary}
                        multiline={true}
                        style={{ height: 100, textAlignVertical: 'top', fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}
                      />
                    </View>

                    <Text className="mb-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Your Demo</Text>
                    <TouchableOpacity className="border-2 border-dashed rounded-xl p-5 items-center justify-center mb-4" style={{ borderColor: colors.border }}>
                      <Ionicons name="musical-notes" size={28} color={colors.primary} />
                      <Text className="mt-2" style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Link Audio/Video Demo</Text>
                      <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>YouTube, Spotify, SoundCloud, etc.</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      className="w-full py-3.5 rounded-xl items-center shadow-md"
                      style={{ backgroundColor: '#15803d' }}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>Submit Audition</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {activeTab === "Review" && (
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
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=12' }} className="w-8 h-8 rounded-full" />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Mark Santos</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>2 weeks ago</Text>
                  </View>
                  <View className="flex-row gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Ben&Ben exceeded all expectations! Their live performance was absolutely breathtaking. Professional and punctual.
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
        message="Are you sure you want to submit this booking request?"
        buttonText="Submit">
      </Modal>
    </>
  );
}

