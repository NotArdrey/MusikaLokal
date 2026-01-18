import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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
      style={[
        styles.tabButton,
        {
          backgroundColor: activeTab === tab ? colors.primary : 'transparent',
          borderColor: activeTab === tab ? colors.primary : colors.border
        }
      ]}
    >
      <Text
        style={[
          styles.tabText,
          {
            color: activeTab === tab ? '#FFF' : colors.textSecondary
          }
        ]}
      >
        {tab}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="My Activity" />

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
            {['Upcoming', 'Pending', 'Ongoing', 'Review'].map((tab) => renderTab(tab as Tab))}
          </ScrollView>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <View style={styles.centerContainer}>
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading bookings...</Text>
            </View>
          ) : currentItems.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="calendar-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No {activeTab.toLowerCase()} bookings</Text>
            </View>
          ) : (
            currentItems.map((item: any) => (
              <View
                key={item.id}
                style={[
                  styles.cardContainer,
                  { backgroundColor: colors.card, borderColor: colors.border }
                ]}
              >
                <View>
                  <Image
                    source={{ uri: item.image }}
                    style={[styles.cardImage, { opacity: item.isCancelled ? 0.6 : 1 }]}
                    resizeMode="cover"
                  />
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{item.type}</Text>
                  </View>

                  {/* Status Overlays */}
                  {activeTab === 'Ongoing' && (
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>Live</Text>
                    </View>
                  )}

                  {item.isCancelled && (
                    <View style={styles.cancelledOverlay}>
                      <View style={styles.cancelledBadge}>
                        <Text style={styles.cancelledText}>Cancelled</Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.cardContent}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleContainer}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{item.date}</Text>
                    </View>
                  </View>

                  <View style={[styles.cardFooter, { borderColor: isDark ? colors.border : '#F3F4F6' }]}>

                    {/* Status Text with Icon */}
                    <View style={styles.statusContainer}>
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
                        style={[
                          styles.statusText,
                          {
                            color: item.isCancelled ? "#EF4444" : activeTab === 'Pending' ? "#F59E0B" : activeTab === 'Ongoing' ? "#10B981" : activeTab === 'Review' ? colors.textSecondary : "#10B981"
                          }
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>


                    {/* Action Buttons */}
                    <View style={styles.actionButtonsContainer}>
                      {activeTab === 'Pending' && item.action === 'Confirm Now' ? (
                        <TouchableOpacity onPress={() => { setSelectedItem(item); setModalVisible(true); }} style={[styles.actionButton, { backgroundColor: '#16A34A' }]}>
                          <Text style={[styles.actionButtonText, { color: 'white' }]}>Confirm Now</Text>
                        </TouchableOpacity>
                      ) : activeTab === 'Ongoing' ? (
                        <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]}>
                          <Text style={[styles.actionButtonText, { color: 'white' }]}>Upload Proof</Text>
                        </TouchableOpacity>
                      ) : activeTab === 'Review' ? (
                        <TouchableOpacity onPress={() => router.push('/submit_review' as any)} style={[styles.outlineButton, { borderColor: colors.primary }]}>
                          <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Leave Review</Text>
                        </TouchableOpacity>
                      ) : (
                        // Default / Upcoming Buttons
                        <View style={styles.defaultButtons}>
                          <TouchableOpacity style={[styles.outlineButton, { borderColor: colors.border }]}>
                            <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>Details</Text>
                          </TouchableOpacity>

                          {activeTab === 'Upcoming' && !item.isCancelled && (
                            <TouchableOpacity onPress={() => { setSelectedItem(item); setModalVisible(true); }} style={[styles.cancelButton, { backgroundColor: isDark ? 'rgba(127, 29, 29, 0.2)' : '#FEF2F2' }]}>
                              <Text style={[styles.cancelButtonText, isDark ? { color: '#F87171' } : { color: '#DC2626' }]}>Cancel</Text>
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

        <View style={styles.navbarPosition}>
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

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  tabContainer: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  tabScrollContent: {
    paddingHorizontal: 24,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
    marginRight: 8,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  scrollContent: {
    paddingBottom: 150,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  cardContainer: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardImage: {
    width: '100%',
    height: 144, // h-36
  },
  typeBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
  },
  liveBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: '#22C55E', // green-500
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 6,
  },
  liveText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  cancelledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  cancelledBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#EF4444', // red-500
    borderRadius: 8,
  },
  cancelledText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  cardDate: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    marginLeft: 6,
    fontFamily: 'Poppins_500Medium',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  outlineButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1, // Default border width for outline buttons
  },
  outlineButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  defaultButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  navbarPosition: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
