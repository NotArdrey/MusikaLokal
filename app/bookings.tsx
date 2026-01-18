import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

type Tab = 'Pending' | 'Upcoming' | 'Ongoing' | 'Review';

export default function BookingsScreen() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('Upcoming');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const { width } = useWindowDimensions();

  // State for fetched data
  const [data, setData] = useState({
    Pending: [],
    Upcoming: [],
    Ongoing: [],
    Review: []
  });
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  React.useEffect(() => {
    fetchUserAndBookings();
  }, []);

  async function fetchUserAndBookings() {
    try {
      setLoading(true);
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user logged in');
        return;
      }
      setCurrentUser(user);

      // Fetch bookings
      await fetchBookings(user.id);
    } catch (e) {
      console.log('Error initializing:', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBookings(userId: string) {
    try {
      const { data: bookings, error } = await supabase.functions.invoke('manage-bookings', {
        body: { action: 'fetch', userId }
      });
      if (error) throw error;
      setData(bookings || { Pending: [], Upcoming: [], Ongoing: [], Review: [] });
    } catch (e) {
      console.log('Error fetching bookings:', e);
    }
  }

  async function handleStatusUpdate(bookingId: string, newStatus: string) {
    try {
      const { error } = await supabase.functions.invoke('manage-bookings', {
        body: { action: 'update_status', booking_id: bookingId, new_status: newStatus }
      });
      if (error) throw error;

      // Refresh list
      if (currentUser) fetchBookings(currentUser.id);
      setModalVisible(false);
    } catch (e) {
      console.log('Error updating status:', e);
      alert('Failed to update booking status.');
    }
  }

  const currentItems = data[activeTab] || [];

  const renderTab = (tab: Tab) => (
    <TouchableOpacity
      key={tab}
      onPress={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded-full mr-2 border ${activeTab === tab ? 'bg-primary-500 border-primary-500' : 'bg-transparent border-gray-200'}`}
      style={{
        backgroundColor: activeTab === tab ? colors.primary : 'transparent',
        borderColor: activeTab === tab ? colors.primary : colors.border
      }}
    >
      <Text
        className="text-xs font-semibold"
        style={{
          fontFamily: 'Poppins_600SemiBold',
          color: activeTab === tab ? '#FFF' : colors.textSecondary
        }}
      >
        {tab}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="My Activity" />

        {/* Tab Navigation */}
        <View className="pt-4 pb-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24 }}>
            {['Upcoming', 'Pending', 'Ongoing', 'Review'].map((tab) => renderTab(tab as Tab))}
          </ScrollView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150, paddingHorizontal: 24, paddingTop: 16 }}>
          {loading ? (
            <View className="items-center justify-center py-20">
              <Text className="text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Loading bookings...</Text>
            </View>
          ) : currentItems.length === 0 ? (
            <View className="items-center justify-center py-20">
              <Ionicons name="calendar-outline" size={48} color={colors.border} />
              <Text className="mt-4 text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>No {activeTab.toLowerCase()} bookings</Text>
            </View>
          ) : (
            currentItems.map((item: any) => (
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
                    style={{ opacity: item.isCancelled ? 0.6 : 1 }}
                  />
                  <View className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md">
                    <Text className="text-white text-[10px] font-medium" style={{ fontFamily: 'Poppins_600SemiBold' }}>{item.type}</Text>
                  </View>

                  {/* Status Overlays */}
                  {activeTab === 'Ongoing' && (
                    <View className="absolute top-3 right-3 px-3 py-1 rounded-full bg-green-500 shadow-md flex-row items-center animate-pulse">
                      <View className="w-2 h-2 rounded-full bg-white mr-1.5" />
                      <Text className="text-white text-[10px] font-bold uppercase">Live</Text>
                    </View>
                  )}

                  {item.isCancelled && (
                    <View className="absolute inset-0 items-center justify-center bg-black/20">
                      <View className="px-3 py-1 bg-red-500 rounded-lg">
                        <Text className="text-white text-xs font-bold uppercase">Cancelled</Text>
                      </View>
                    </View>
                  )}
                </View>

                <View className="p-4">
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 mr-2">
                      <Text className="text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }} numberOfLines={1}>{item.name}</Text>
                      <Text className="text-xs mt-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>{item.date}</Text>
                    </View>
                  </View>

                  <View className="flex-row items-center justify-between mt-2 pt-3 border-t" style={{ borderColor: isDark ? colors.border : '#F3F4F6' }}>

                    {/* Status Text with Icon */}
                    <View className="flex-row items-center">
                      {item.isCancelled ? (
                        <Ionicons name="close-circle" size={16} color="#EF4444" />
                      ) : activeTab === 'Ongoing' ? (
                        <Ionicons name="play-circle" size={16} color="#10B981" />
                      ) : activeTab === 'Review' ? (
                        <Ionicons name="checkmark-done-circle" size={16} color={colors.textSecondary} />
                      ) : activeTab === 'Pending' ? (
                        <Ionicons name="time-outline" size={16} color="#F59E0B" />
                      ) : (
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      )}

                      <Text
                        className="text-xs ml-1.5"
                        style={{
                          fontFamily: 'Poppins_500Medium',
                          color: item.isCancelled ? "#EF4444" : activeTab === 'Pending' ? "#F59E0B" : activeTab === 'Ongoing' ? "#10B981" : activeTab === 'Review' ? colors.textSecondary : "#10B981"
                        }}
                      >
                        {item.status}
                      </Text>
                    </View>


                    {/* Action Buttons */}
                    <View className="flex-row gap-2">
                      {activeTab === 'Pending' && item.action === 'Confirm Now' ? (
                        <TouchableOpacity onPress={() => { setSelectedItem(item); setModalVisible(true); }} className="px-4 py-2 rounded-lg bg-green-600">
                          <Text className="text-xs text-white" style={{ fontFamily: 'Poppins_600SemiBold' }}>Confirm Now</Text>
                        </TouchableOpacity>
                      ) : activeTab === 'Ongoing' ? (
                        <TouchableOpacity className="px-4 py-2 rounded-lg bg-indigo-500 shadow-sm shadow-indigo-300" style={{ backgroundColor: colors.primary }}>
                          <Text className="text-xs text-white" style={{ fontFamily: 'Poppins_600SemiBold' }}>Upload Proof</Text>
                        </TouchableOpacity>
                      ) : activeTab === 'Review' ? (
                        <TouchableOpacity onPress={() => router.push('/submit_review' as any)} className="px-4 py-2 rounded-lg border-2" style={{ borderColor: colors.primary }}>
                          <Text className="text-xs" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Leave Review</Text>
                        </TouchableOpacity>
                      ) : (
                        // Default / Upcoming Buttons
                        <View className="flex-row gap-2">
                          <TouchableOpacity className="px-4 py-2 rounded-lg border" style={{ borderColor: colors.border }}>
                            <Text className="text-xs" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Details</Text>
                          </TouchableOpacity>

                          {activeTab === 'Upcoming' && !item.isCancelled && (
                            <TouchableOpacity onPress={() => { setSelectedItem(item); setModalVisible(true); }} className="px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                              <Text className="text-xs text-red-600 dark:text-red-400" style={{ fontFamily: 'Poppins_600SemiBold' }}>Cancel</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>

                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0">
          <Navbar />
        </View>

      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={activeTab === 'Pending' ? "Confirm Booking" : "Cancel Booking"}
        message={activeTab === 'Pending' ? "Are you sure you want to confirm this booking?" : "Are you sure you want to cancel this booking? This action cannot be undone."}
        buttonText={activeTab === 'Pending' ? "Confirm" : "Yes, Cancel Booking"}
        onConfirm={() => {
          if (selectedItem) {
            // If Pending, confirm. If Upcoming/other, cancel.
            const status = activeTab === 'Pending' ? 'confirmed' : 'cancelled';
            handleStatusUpdate(selectedItem.id, status);
          }
        }}
      />
    </>
  );
}
