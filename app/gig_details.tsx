import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function GigDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [gig, setGig] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGigDetails();
  }, [id]);

  const fetchGigDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: { action: 'fetch', type: 'gig', id: id || 'g84f3d45-6678-4384-9345-123456789abc', userId } // Fallback ID for demo
      });

      if (error) throw error;
      setGig(data);
      setIsOwner(data.is_owner);
      setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error fetching gig:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    setIsFavorited(!isFavorited);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.functions.invoke('manage-details', {
        body: { action: 'toggle_favorite', type: 'gig', id: gig.id, userId: user.id }
      });
      if (data) setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error toggling favorite:', e);
      setIsFavorited(!isFavorited);
    }
  };

  const handleReport = () => {
    router.push({ pathname: '/report', params: { type: 'gig', id: gig.id, name: gig.name } } as any);
  };

  const tabs = ['About', 'Info', 'Apply', 'Review'];

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  if (!gig) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>Gig not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Gig Details" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Hero Section */}
          <View className="px-6 mt-4">
            <View
              className="w-full h-56 rounded-3xl overflow-hidden mb-4 relative shadow-lg"
              style={{ shadowColor: colors.primary, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 }}
            >
              <Image
                source={{ uri: (gig.images && gig.images[0]) || 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=800&fit=crop' }}
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
                <Text className="text-white text-2xl font-bold" style={{ fontFamily: 'Poppins_700Bold' }}>{gig.name}</Text>
                <View className="flex-row items-center mt-1">
                  <Ionicons name="location-outline" size={14} color="#E5E7EB" />
                  <Text className="text-gray-200 text-xs ml-1" style={{ fontFamily: 'Poppins_400Regular' }}>{gig.location || 'Location not set'}</Text>
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
                    {gig.description || 'No description provided.'}
                  </Text>
                </View>

                <View className="flex-row gap-4">
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                    <Ionicons name="people-outline" size={24} color={colors.primary} className="mb-2" />
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Budget</Text>
                    <Text className="text-lg" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>₱{gig.budget || '0'}</Text>
                  </View>
                  <View className="flex-1 p-4 rounded-2xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                    <Ionicons name="calendar-outline" size={24} color={colors.primary} className="mb-2" />
                    <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textSecondary, fontFamily: 'Poppins_600SemiBold' }}>Date</Text>
                    <Text className="text-center text-xs" style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>
                      {gig.event_date ? new Date(gig.event_date).toLocaleDateString() : 'TBA'}
                    </Text>
                  </View>
                </View>

                {/* The "Deal" Card */}
                <View className="mt-4 p-5 rounded-3xl" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary }}>
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
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 10}` }}
                        className="w-48 h-32 rounded-2xl"
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



            {activeTab === 'Apply' && (
              <View className="gap-5">
                <View>
                  <Text className="mb-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Pitch Message</Text>
                  <View className="rounded-2xl p-4" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                    <TextInput
                      placeholder='Why should we hire you?'
                      placeholderTextColor={colors.textSecondary}
                      multiline={true}
                      style={{ height: 120, textAlignVertical: 'top', fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}
                    />
                  </View>
                </View>

                <View>
                  <Text className="mb-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>Performance Video</Text>

                  <TouchableOpacity className="border-2 border-dashed rounded-2xl p-8 items-center justify-center" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
                    <View className="w-12 h-12 rounded-full bg-primary-50 items-center justify-center mb-3">
                      <Ionicons name="videocam-outline" size={24} color={colors.primary} />
                    </View>
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }}>Upload Sample Video</Text>
                    <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>MP4, MOV (Max 50MB)</Text>
                  </TouchableOpacity>
                </View>

                <View className="p-4 rounded-2xl flex-row items-center gap-4" style={{ backgroundColor: colors.surface }}>
                  <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center">
                    <Ionicons name="document-text-outline" size={24} color="#3B82F6" />
                  </View>
                  <View className="flex-1">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Gig Contract</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Review terms and conditions</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.primary }}>View</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  className="w-full py-4 rounded-xl items-center mt-4 shadow-lg"
                  style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8 }}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#fff' }}>Submit Application</Text>
                </TouchableOpacity>
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
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=3' }} className="w-8 h-8 rounded-full" />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Jared Cariaso</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>1 month ago</Text>
                  </View>
                  <View className="flex-row gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Amazing venue! The sound system was top-notch and the staff was incredibly professional. Highly recommend!
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
        title="Confirm Application"
        message="Are you sure you want to submit your application for this gig?"
        buttonText="Submit">
      </Modal>
    </>
  );
}

