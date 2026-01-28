import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

import { useLocalSearchParams } from 'expo-router';

export default function StudioDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams(); // Get Studio ID
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');
  const [modalAction, setModalAction] = useState<() => Promise<void> | void>(() => { });

  // Calendar View State
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState('');

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [studio, setStudio] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, []);

  const checkAuthorization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase.functions.invoke('manage-profile', {
        body: { action: 'fetch', userId: user.id }
      });

      if (profile?.role !== 'studio-owner') {
        Alert.alert('Unauthorized', 'Only studio owners can access this page.');
        router.replace('/home');
        return;
      }

      setAuthorized(true);
      if (id) fetchData(user.id);
    } catch (e) {
      console.error('Authorization check failed:', e);
      router.replace('/home');
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchData = async (userId: string) => {
    setLoading(true);
    try {
      // Ensure id is a string, not an array
      const studioId = Array.isArray(id) ? id[0] : id;
      if (!studioId) {
        Alert.alert('Error', 'Invalid studio ID');
        router.replace('/home');
        return;
      }

      // Fetch Studio Details
      const { data: studioData, error: studioError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'studio', id: studioId, userId }
      });
      if (studioError) throw studioError;
      setStudio(studioData);

      // Fetch Bookings
      const { data: bookingData, error: bookingError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_studio_bookings', studioId: studioId, userId }
      });
      if (bookingError) throw bookingError;
      setBookings(bookingData || []);

      // Fetch Reviews
      const { data: reviewData, error: reviewError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_reviews', type: 'studio', id: studioId, userId }
      });
      if (reviewError) throw reviewError;
      setReviews(reviewData || []);

    } catch (e) {
      console.log('Error fetching data:', e);
      Alert.alert('Error', 'Failed to load studio data');
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = (bookingId: string, status: string) => {
    setModalTitle(status === 'confirmed' ? 'Accept Booking' : 'Decline Booking');
    setModalMessage(`Are you sure you want to ${status === 'confirmed' ? 'accept' : 'decline'} this booking request?`);
    setModalButtonText(status === 'confirmed' ? 'Accept' : 'Decline');
    setModalAction(() => async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.functions.invoke('manage-listings', {
          body: { action: 'update_booking_status', bookingId, status, userId: user.id }
        });
        if (error) throw error;

        // Update local state
        setBookings(bookings.map(b => b.id === bookingId ? { ...b, status } : b));
        setModalVisible(false);
      } catch (e) {
        console.log('Error updating booking:', e);
        Alert.alert('Error', 'Failed to update booking status');
      }
    });
    setModalVisible(true);
  };

  const tabs = ['About', 'Setup', 'Bookings', 'Review'];

  // Show loading while checking authorization
  if (checkingAuth) {
    return (
      <View style={[styles.flex1, styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>
          Checking permissions...
        </Text>
      </View>
    );
  }

  // Don't render if not authorized
  if (!authorized) {
    return null;
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Manage Studio" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Header Image & Info */}
          <View style={styles.headerContainer}>
            <View
              style={[
                styles.headerImageContainer,
                {
                  shadowColor: colors.primary,
                }
              ]}
            >
              <Image
                source={{ uri: (studio?.images && studio.images[0]) || studio?.image || null }}
                style={[styles.headerImage, { backgroundColor: colors.border }]}
                resizeMode="cover"
              />
              <View style={styles.headerImageGradient} />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>{studio?.name || 'Loading...'}</Text>
            <Text style={[styles.headerLocation, { color: colors.textSecondary }]}>{studio?.address || 'Location N/A'}</Text>
          </View>

          {/* Segmented Control Tabs */}
          <View style={[styles.tabsContainer, { backgroundColor: colors.inputBackground }]}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: activeTab === tab ? colors.surface : 'transparent',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: activeTab === tab ? 2 : 0 },
                    shadowOpacity: activeTab === tab ? 0.05 : 0,
                    shadowRadius: 4,
                    elevation: activeTab === tab ? 2 : 0
                  }
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      fontFamily: activeTab === tab ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
                      color: activeTab === tab ? colors.primary : colors.textSecondary,
                    }
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.contentContainer}>
            {activeTab === 'About' && (
              <View style={styles.aboutContainer}>
                <View>
                  <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
                    {studio?.description || 'No description available.'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Rate</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>₱{studio?.hourly_rate}/hr</Text>
                  </View>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Amenities</Text>
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 14, color: colors.text }} numberOfLines={2}>
                      {studio?.amenities?.join(', ') || 'None'}
                    </Text>
                  </View>
                </View>

                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                    {studio?.images && studio.images.length > 0 ? (
                      studio.images.map((img: string, i: number) => (
                        <Image
                          key={i}
                          source={{ uri: img }}
                          style={styles.galleryImage}
                        />
                      ))
                    ) : (
                      <Text style={{ color: colors.textSecondary }}>No images uploaded.</Text>
                    )}
                  </ScrollView>
                </View>

                {/* Contract Section */}
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Contract</Text>
                  {studio?.contract_url ? (
                    <TouchableOpacity 
                      onPress={async () => {
                        try {
                          const supported = await Linking.canOpenURL(studio.contract_url);
                          if (supported) {
                            await Linking.openURL(studio.contract_url);
                          } else {
                            Alert.alert('Error', 'Unable to open contract document');
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to open contract document');
                        }
                      }}
                      style={[styles.contractCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderColor: isDark ? '#374151' : '#E5E7EB' }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View style={[styles.contractIcon, { backgroundColor: colors.primary }]}>
                          <Ionicons name="document-text" size={24} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.contractTitle, { color: colors.text }]}>
                            Studio Contract
                          </Text>
                          <Text style={[styles.contractSubtitle, { color: colors.textSecondary }]}>
                            Musicians will see this before booking
                          </Text>
                        </View>
                        <Ionicons name="open-outline" size={20} color={colors.primary} />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.noContractCard, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                      <Ionicons name="document-text-outline" size={32} color={colors.textSecondary} />
                      <Text style={[styles.noContractText, { color: colors.textSecondary }]}>No contract uploaded</Text>
                      <TouchableOpacity 
                        onPress={() => router.push({ pathname: '/edit_studio', params: { id: studio?.id } })}
                        style={{ marginTop: 8 }}
                      >
                        <Text style={{ color: colors.primary, fontFamily: 'Poppins_500Medium', fontSize: 13 }}>Add Contract</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}

            {activeTab === 'Setup' && (
              <View style={styles.aboutContainer}>
                <Text style={[styles.categoryTitle, { color: colors.primary }]}>Amenities & Equipment</Text>
                <View style={styles.tagsContainer}>
                  {studio?.amenities?.map((item: string, i: number) => (
                    <View key={i} style={[styles.tag, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <Text style={[styles.tagText, { color: colors.text }]}>{item}</Text>
                    </View>
                  ))}
                  {(!studio?.amenities || studio.amenities.length === 0) && (
                    <Text style={{ color: colors.textSecondary }}>No amenities listed.</Text>
                  )}
                </View>

                <TouchableOpacity onPress={() => router.push({ pathname: '/edit_studio', params: { id: studio?.id } })} style={[styles.addGearButton, { borderColor: colors.primary, marginTop: 20 }]}>
                  <Text style={[styles.addGearText, { color: colors.primary }]}>Edit Setup</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Acoustics merged into Setup - keeping for reference */}


            {activeTab === 'Bookings' && (
              <View style={styles.aboutContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.textSecondary, letterSpacing: 0.5 }}>BOOKING REQUESTS</Text>
                  {/* View Toggle */}
                  <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 8, padding: 2 }}>
                    <TouchableOpacity
                      onPress={() => setViewMode('list')}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: viewMode === 'list' ? (isDark ? '#4B5563' : '#FFFFFF') : 'transparent'
                      }}
                    >
                      <Ionicons name="list" size={16} color={viewMode === 'list' ? colors.text : colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setViewMode('calendar')}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: viewMode === 'calendar' ? (isDark ? '#4B5563' : '#FFFFFF') : 'transparent'
                      }}
                    >
                      <Ionicons name="calendar" size={16} color={viewMode === 'calendar' ? colors.text : colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {viewMode === 'calendar' ? (
                  <View>
                    {/* Calendar View */}
                    <View style={{
                      backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                      borderRadius: 16,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      marginBottom: 24
                    }}>
                      <Calendar
                        current={new Date().toISOString().split('T')[0]}
                        markedDates={{
                          ...bookings.reduce((acc, booking) => {
                            const dateStr = new Date(booking.start_time).toISOString().split('T')[0];
                            acc[dateStr] = { marked: true, dotColor: colors.primary };
                            return acc;
                          }, {}),
                          [selectedDate]: {
                            selected: true,
                            selectedColor: colors.primary,
                            selectedTextColor: '#FFFFFF'
                          }
                        }}
                        onDayPress={(day) => {
                          setSelectedDate(day.dateString);
                        }}
                        theme={{
                          backgroundColor: 'transparent',
                          calendarBackground: 'transparent',
                          textSectionTitleColor: colors.textSecondary,
                          selectedDayBackgroundColor: colors.primary,
                          selectedDayTextColor: '#FFFFFF',
                          todayTextColor: colors.primary,
                          dayTextColor: colors.text,
                          textDisabledColor: isDark ? '#4B5563' : '#D1D5DB',
                          dotColor: colors.primary,
                          selectedDotColor: '#FFFFFF',
                          arrowColor: colors.primary,
                          monthTextColor: colors.text,
                          indicatorColor: colors.primary,
                          textDayFontFamily: 'Poppins_500Medium',
                          textMonthFontFamily: 'Poppins_600SemiBold',
                          textDayHeaderFontFamily: 'Poppins_500Medium',
                          textDayFontSize: 14,
                          textMonthFontSize: 16,
                          textDayHeaderFontSize: 12
                        }}
                      />
                    </View>

                    {/* Selected Date Bookings (Slot Grid Style) */}
                    {selectedDate && (
                      <View>
                        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 16, marginBottom: 12 }]}>
                          Schedule for {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </Text>
                        {bookings.filter(b => new Date(b.start_time).toISOString().split('T')[0] === selectedDate).length > 0 ? (
                          <View style={styles.tagsContainer}>
                            {bookings
                              .filter(b => new Date(b.start_time).toISOString().split('T')[0] === selectedDate)
                              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                              .map((booking, index) => (
                                <TouchableOpacity
                                  key={booking.id}
                                  style={[
                                    styles.bookingCard,
                                    {
                                      backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
                                      borderColor: booking.status === 'confirmed' ? colors.primary : colors.border,
                                      borderWidth: booking.status === 'confirmed' ? 2 : 1, // Gold/Neon border for confirmed
                                      width: '100%',
                                      flexDirection: 'row',
                                      justifyContent: 'space-between',
                                      marginBottom: 8
                                    }
                                  ]}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={[styles.timeSlotChip, { backgroundColor: colors.primary, borderWidth: 0 }]}>
                                      <Text style={{ color: '#FFF', fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>
                                        {new Date(booking.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                      </Text>
                                    </View>
                                    <View>
                                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{booking.user?.full_name || 'Generous Patron'}</Text>
                                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{booking.status}</Text>
                                    </View>
                                  </View>
                                  {booking.status === 'confirmed' && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                                </TouchableOpacity>
                              ))}
                          </View>
                        ) : (
                          <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>No bookings for this date.</Text>
                        )}
                      </View>
                    )}
                  </View>
                ) : (
                  // List View (Existing)
                  bookings.length === 0 ? (
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>No bookings found.</Text>
                  ) : (
                    bookings.map((booking) => (
                      <View key={booking.id} style={[styles.bookingCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
                        <View style={styles.bookingHeader}>
                          <Image source={{ uri: booking.user?.avatar_url || 'https://i.pravatar.cc/100' }} style={styles.bookingImage} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.bookingTitle, { color: colors.text }]}>{booking.user?.full_name || 'Unknown User'}</Text>
                            <Text style={[styles.bookingSubtitle, { color: colors.textSecondary }]}>{booking.user?.email}</Text>
                          </View>
                          <View style={styles.bookingPriceContainer}>
                            <Text style={[styles.bookingPrice, { color: colors.primary }]}>₱{(booking.total_price || 0).toLocaleString()}</Text>
                            <Text style={[styles.bookingDuration, { color: colors.textSecondary }]}>{booking.status}</Text>
                          </View>
                        </View>

                        <View style={[styles.bookingDateContainer, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F9FAFB' }]}>
                          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                          <Text style={[styles.bookingDate, { color: colors.text }]}>
                            {new Date(booking.start_time).toLocaleDateString()} • {new Date(booking.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} - {new Date(booking.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                          </Text>
                        </View>

                        {/* Only show buttons if pending */}
                        {booking.status === 'pending' && (
                          <View style={styles.actionButtons}>
                            <TouchableOpacity
                              onPress={() => confirmAction(booking.id, 'cancelled')}
                              style={[styles.declineButton, { borderColor: colors.border }]}
                            >
                              <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => confirmAction(booking.id, 'confirmed')}
                              style={[styles.acceptButton, { backgroundColor: colors.primary }]}
                            >
                              <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#FFF' }}>Accept</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    ))
                  )
                )}
              </View>
            )}

            {activeTab === 'Review' && (
              <View>
                <View style={styles.reviewHeader}>
                  <Text style={[styles.ratingText, { color: colors.text }]}>{studio?.rating?.toFixed(1) || '0.0'}</Text>
                  <View style={styles.starsRow}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons key={i} name={i < Math.round(studio?.rating || 0) ? "star" : "star-outline"} size={20} color={colors.primary} />
                    ))}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Based on {studio?.review_count || 0} reviews</Text>
                </View>

                {reviews.map((review) => (
                  <View key={review.id} style={[styles.reviewCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
                    <View style={styles.reviewUserHeader}>
                      <View style={styles.userInfo}>
                        <Image source={{ uri: review.author?.avatar_url || 'https://i.pravatar.cc/100' }} style={styles.userAvatar} />
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{review.author?.full_name || 'User'}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>{new Date(review.created_at).toLocaleDateString()}</Text>
                    </View>
                    <View style={[styles.starsRow, { marginBottom: 8 }]}>
                      {[...Array(5)].map((_, i) => (
                        <Ionicons key={i} name={i < review.rating ? "star" : "star-outline"} size={14} color={colors.primary} />
                      ))}
                    </View>
                    <Text style={[styles.reviewText, { color: colors.textSecondary }]}>
                      {review.comment}
                    </Text>
                  </View>
                ))}
              </View>
            )}

          </View>
        </ScrollView>

        <Navbar />
      </View>
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={modalAction}
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerContainer: {
    paddingHorizontal: 24,
    marginTop: 16,
    alignItems: 'center',
  },
  headerImageContainer: {
    width: '100%',
    height: 192,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerImageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    // Approximate gradient with transparent black
    backgroundColor: 'rgba(0,0,0,0.4)',
    top: 100, // cheat to make it look like bottom gradient
  },
  headerTitle: {
    fontSize: 24,
    textAlign: 'center',
    fontFamily: 'Poppins_600SemiBold',
  },
  headerLocation: {
    textAlign: 'center',
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  tabsContainer: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 4,
    borderRadius: 16,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontSize: 13,
  },
  contentContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  aboutContainer: {
    gap: 24,
  },
  aboutText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Poppins_400Regular',
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  infoValue: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  searchText: {
    marginLeft: 12,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  categoryTitle: {
    fontSize: 18,
    marginBottom: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
  },
  addGearButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addGearText: {
    fontFamily: 'Poppins_600SemiBold',
  },
  roomProfileCard: {
    padding: 16,
    borderRadius: 16,
  },
  roomProfileTitle: {
    fontSize: 18,
    marginBottom: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  roomProfileTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  roomProfileTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  roomProfileTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  roomProfileStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  roomProfileStatLabel: {
    fontFamily: 'Poppins_400Regular',
  },
  roomProfileStatValue: {
    fontFamily: 'Poppins_600SemiBold',
  },
  graphContainer: {
    height: 160,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphText: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  bookingCard: {
    padding: 16,
    borderRadius: 24,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  bookingImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  bookingTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  bookingSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  bookingPriceContainer: {
    alignItems: 'flex-end',
  },
  bookingPrice: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  bookingDuration: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  bookingDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  bookingDate: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
  },
  bookingMessage: {
    marginBottom: 16,
    fontStyle: 'italic',
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ratingText: {
    fontSize: 48,
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reviewUserHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reviewText: {
    lineHeight: 20,
  },
  timeSlotChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  contractIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 2,
  },
  contractSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  noContractCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noContractText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
    marginTop: 8,
  },
});

