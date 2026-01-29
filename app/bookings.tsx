import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { supabase } from '../lib/supabase';
import BookingDetailsSheet from '../src/components/BookingDetailsSheet';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scale = (size: number) => {
  const newSize = (SCREEN_WIDTH / 375) * size;
  return Math.max(newSize, size * 0.85); // Minimum 85% of original size
};
const verticalScale = (size: number) => {
  const baseHeight = 812;
  const ratio = SCREEN_HEIGHT / baseHeight;
  const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

type Tab = 'Pending' | 'Upcoming' | 'Ongoing' | 'Review';

export default function BookingsScreen() {
  const { colors, isDark } = useTheme();
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Pending');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const bookingDetailsRef = React.useRef<import('@gorhom/bottom-sheet').BottomSheetModal>(null);
  const { width } = useWindowDimensions();

  // State for fetched data
  const [data, setData] = useState({
    Pending: [],
    Upcoming: [],
    Ongoing: [],
    Review: []
  });
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState<string>('');

  React.useEffect(() => {
    if (isAuthenticated && userId) {
      fetchBookings(userId);
    }
  }, [isAuthenticated, userId]);

  async function fetchBookings(targetUserId: string) {
    try {
      setLoading(true);

      // Fetch user role first
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', targetUserId)
        .single();

      if (profile?.role) {
        setUserRole(profile.role);
      }

      const { data: bookings, error } = await supabase.functions.invoke('manage-bookings', {
        body: { action: 'fetch', userId: targetUserId }
      });
      if (error) throw error;
      console.log('Fetched bookings data sample:', bookings?.Upcoming?.[0] || bookings?.Pending?.[0]);
      setData(bookings || { Pending: [], Upcoming: [], Ongoing: [], Review: [] });
    } catch (e) {
      console.log('Error fetching bookings:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(bookingId: string, newStatus: string, typeId: string = 'studio_booking', reason?: string) {
    try {
      const { error } = await supabase.functions.invoke('manage-bookings', {
        body: {
          action: 'update_status',
          booking_id: bookingId,
          new_status: newStatus,
          type_id: typeId,
          cancellation_reason: reason
        }
      });
      if (error) throw error;

      // Refresh list
      if (userId) fetchBookings(userId);
      setModalVisible(false);
    } catch (e) {
      console.log('Error updating status:', e);
      alert('Failed to update booking status.');
    }
  }

  const handleDetailsPress = (item: any) => {
    setSelectedItem(item);
    bookingDetailsRef.current?.present();
  };

  const handleConfirmBooking = async (bookingId: string) => {
    await handleStatusUpdate(bookingId, 'confirmed', selectedItem?.type_id || 'studio_booking');
  };

  const handleCancelBooking = async (bookingId: string) => {
    setCancellationReason('');
    setModalVisible(true);
  };

  // Upload Proof handler
  const handleUploadProof = async (item: any) => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library to upload proof.');
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled) return;

      const image = result.assets[0];

      // Upload to Supabase Storage
      const fileName = `proof_${item.id}_${Date.now()}.jpg`;
      const filePath = `booking-proofs/${fileName}`;

      // Read file as base64
      const response = await fetch(image.uri);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);
      const proofUrl = urlData.publicUrl;

      // Update booking with proof URL
      const { error: updateError } = await supabase.functions.invoke('manage-bookings', {
        body: {
          action: 'upload_proof',
          bookingId: item.id,
          proofUrl
        }
      });

      if (updateError) throw updateError;

      Alert.alert('Success', 'Proof uploaded successfully!');
      if (userId) fetchBookings(userId);
    } catch (e: any) {
      console.error('Upload proof error:', e);
      Alert.alert('Error', 'Failed to upload proof. Please try again.');
    }
  };

  // Leave Review handler with proper params
  const handleLeaveReview = (item: any) => {
    // Determine reviewer role based on user role and item type
    const isOwner = item.type_id === 'studio_booking' && userRole === 'studio-owner';
    const isOrganizer = item.type_id === 'gig_application' && userRole === 'venue-owner';

    const reviewerRole = item.type_id === 'studio_booking'
      ? (isOwner ? 'owner' : 'customer')
      : (isOrganizer ? 'organizer' : 'applicant');

    // For studio owners reviewing musicians, target the user
    // For musicians reviewing studios, target the studio
    const params: any = {
      bookingId: item.id,
      bookingType: item.type_id,
      entityName: item.name,
      reviewerRole
    };

    if (item.type_id === 'studio_booking') {
      if (isOwner) {
        // Owner reviews the musician (user)
        params.targetUserId = item.user_id;
      } else {
        // Musician reviews the studio
        params.studioId = item.studio_id;
      }
    } else if (item.type_id === 'gig_application') {
      if (isOrganizer) {
        // Venue owner reviews the applicant
        params.targetUserId = item.applicant_id;
      } else {
        // Musician reviews the gig
        params.gigId = item.gig_id;
      }
    }

    router.push({
      pathname: '/submit_review',
      params
    } as any);
  };

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
            {['Pending', 'Upcoming', 'Ongoing', 'Review'].map((tab) => renderTab(tab as Tab))}
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
                      <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                        {item.raw_date ? new Date(item.raw_date).toLocaleDateString() : new Date(item.start_time).toLocaleDateString()} • {item.start_time && item.start_time.includes(':') ? (() => {
                          const [hours, minutes] = item.start_time.split(':');
                          const h = parseInt(hours);
                          const period = h >= 12 ? 'PM' : 'AM';
                          const h12 = h % 12 || 12;
                          return `${h12}:${minutes} ${period}`;
                        })() : new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </Text>
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
                        <TouchableOpacity
                          onPress={() => handleUploadProof(item)}
                          style={[styles.actionButton, { backgroundColor: colors.primary }]}
                        >
                          <Text style={[styles.actionButtonText, { color: 'white' }]}>Upload Proof</Text>
                        </TouchableOpacity>
                      ) : activeTab === 'Review' ? (
                        <TouchableOpacity
                          onPress={() => handleLeaveReview(item)}
                          style={[styles.outlineButton, { borderColor: colors.primary }]}
                        >
                          <Text style={[styles.outlineButtonText, { color: colors.primary }]}>Leave Review</Text>
                        </TouchableOpacity>
                      ) : (
                        // Default / Upcoming Buttons
                        <View style={styles.defaultButtons}>
                          <TouchableOpacity
                            onPress={() => handleDetailsPress(item)}
                            style={[styles.outlineButton, { borderColor: colors.border }]}>
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
        message={
          activeTab === 'Pending'
            ? "Are you sure you want to confirm this booking?"
            : (() => {
              if (selectedItem?.raw_date) {
                const eventDate = new Date(selectedItem.raw_date);
                const now = new Date();
                const diffTime = eventDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays > 7) return "Cancellation Policy: You are cancelling with more than 7 days notice. You will receive an 80% refund.";
                if (diffDays >= 3) return "Cancellation Policy: You are cancelling within 3-7 days. You will receive a 70% refund.";
                return "Cancellation Policy: You are cancelling with less than 3 days notice. This is non-refundable (0% refund).";
              }
              return "Are you sure you want to cancel this booking? This action cannot be undone.";
            })()
        }
        buttonText={activeTab === 'Pending' ? "Confirm" : "Yes, Cancel Booking"}
        showInput={activeTab !== 'Pending'} // Show input only for cancellation
        onInputChange={setCancellationReason}
        onConfirm={() => {
          if (selectedItem) {
            // If Pending, confirm. If Upcoming/other, cancel.
            const status = activeTab === 'Pending' ? 'confirmed' : 'cancelled';
            handleStatusUpdate(selectedItem.id, status, selectedItem?.type_id, cancellationReason);
          }
        }}
      />

      <BookingDetailsSheet
        ref={bookingDetailsRef}
        booking={selectedItem}
        onConfirm={handleConfirmBooking}
        onCancel={handleCancelBooking}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  tabContainer: {
    paddingTop: moderateScale(16),
    paddingBottom: moderateScale(8),
  },
  tabScrollContent: {
    paddingHorizontal: scale(24),
  },
  tabButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(9999),
    marginRight: scale(8),
    borderWidth: 1,
  },
  tabText: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_600SemiBold',
  },
  scrollContent: {
    paddingBottom: SCREEN_HEIGHT < 700 ? verticalScale(120) : verticalScale(150),
    paddingHorizontal: scale(24),
    paddingTop: moderateScale(16),
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: verticalScale(80),
  },
  loadingText: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_400Regular',
  },
  emptyTitle: {
    marginTop: moderateScale(16),
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_400Regular',
  },
  cardContainer: {
    marginBottom: SCREEN_HEIGHT < 700 ? moderateScale(12) : moderateScale(16),
    borderRadius: moderateScale(16),
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
    height: SCREEN_HEIGHT < 700 ? verticalScale(110) : verticalScale(144),
  },
  typeBadge: {
    position: 'absolute',
    top: moderateScale(12),
    left: scale(12),
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(9999),
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  typeBadgeText: {
    color: 'white',
    fontSize: moderateScale(10),
    fontFamily: 'Poppins_600SemiBold',
  },
  liveBadge: {
    position: 'absolute',
    top: moderateScale(12),
    right: scale(12),
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(4),
    borderRadius: moderateScale(9999),
    backgroundColor: '#22C55E', // green-500
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: moderateScale(8),
    height: moderateScale(8),
    borderRadius: moderateScale(4),
    backgroundColor: 'white',
    marginRight: scale(6),
  },
  liveText: {
    color: 'white',
    fontSize: moderateScale(10),
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
    paddingHorizontal: scale(12),
    paddingVertical: moderateScale(4),
    backgroundColor: '#EF4444', // red-500
    borderRadius: moderateScale(8),
  },
  cancelledText: {
    color: 'white',
    fontSize: moderateScale(12),
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  cardContent: {
    padding: SCREEN_HEIGHT < 700 ? moderateScale(12) : moderateScale(16),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: moderateScale(8),
  },
  cardTitleContainer: {
    flex: 1,
    marginRight: scale(8),
  },
  cardTitle: {
    fontSize: moderateScale(16),
    fontFamily: 'Poppins_600SemiBold',
  },
  cardDate: {
    fontSize: moderateScale(12),
    marginTop: moderateScale(4),
    fontFamily: 'Poppins_400Regular',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: moderateScale(8),
    paddingTop: moderateScale(12),
    borderTopWidth: 1,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: moderateScale(12),
    marginLeft: scale(6),
    fontFamily: 'Poppins_500Medium',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: scale(8),
  },
  actionButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(8),
  },
  actionButtonText: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_600SemiBold',
  },
  outlineButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(8),
    borderWidth: 1,
  },
  outlineButtonText: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_500Medium',
  },
  defaultButtons: {
    flexDirection: 'row',
    gap: scale(8),
  },
  cancelButton: {
    paddingHorizontal: scale(16),
    paddingVertical: moderateScale(8),
    borderRadius: moderateScale(8),
  },
  cancelButtonText: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_600SemiBold',
  },
  navbarPosition: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
