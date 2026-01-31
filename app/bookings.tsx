import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Dimensions, Image, Linking, Modal as RNModal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
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
  const [modalMode, setModalMode] = useState<'confirm' | 'cancel' | 'decline'>('confirm');

  // QR Check-in State
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [qrValue, setQrValue] = useState<string>('');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

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
      console.log('📤 handleStatusUpdate called with:', {
        bookingId,
        newStatus,
        typeId,
        reason
      });

      const { data, error } = await supabase.functions.invoke('manage-bookings', {
        body: {
          action: 'update_status',
          booking_id: bookingId,
          new_status: newStatus,
          type_id: typeId,
          cancellation_reason: reason
        }
      });

      console.log('📥 handleStatusUpdate response:', { data, error });

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
    // Use 'accepted' for gig applications, 'confirmed' for studio bookings
    const status = selectedItem?.type_id === 'gig_application' ? 'accepted' : 'confirmed';
    await handleStatusUpdate(bookingId, status, selectedItem?.type_id || 'studio_booking');
  };

  const handleCancelBooking = async (bookingId: string) => {
    setCancellationReason('');
    setModalMode('cancel');
    setModalVisible(true);
  };

  const handleDeclineBooking = (item: any) => {
    setSelectedItem(item);
    setCancellationReason('');
    setModalMode('decline');
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

  // QR Code Logic
  const handleShowPass = (item: any) => {
    setQrValue(item.id);
    setShowQRModal(true);
  };

  const handleScanOpen = async () => {
    if (!permission) {
      // Permission status not yet loaded
      return;
    }
    if (!permission.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Required', 'Camera access is required to scan entry passes.');
        return;
      }
    }
    setScanned(false);
    setShowScanModal(true);
  };

  const handleBarCodeScanned = async ({ type, data }: { type: string, data: string }) => {
    setScanned(true);
    setShowScanModal(false);

    // Call backend to verify check-in
    try {
      setLoading(true);
      console.log('📷 Scanning QR code:', { qr_code: data, scanner_id: userId });

      const { data: response, error } = await supabase.functions.invoke('manage-bookings', {
        body: {
          action: 'scan_qr',
          qr_code: data,
          scanner_id: userId
        }
      });

      setLoading(false);

      console.log('📷 Check-in response:', response);
      console.log('📷 Check-in error:', error);

      // When there's a FunctionsHttpError (non-2xx status), the error body is in the response data
      if (error) {
        console.error('Check-in error:', error);

        // The response data contains the error details even when error is set
        if (response?.error) {
          const errorMessage = response.error;
          const details = response.details ? `\n\n${response.details}` : '';
          Alert.alert('Check-In Failed', errorMessage + details);
        } else if (response?.message) {
          // Some responses might have a message field instead
          Alert.alert('Info', response.message);
        } else {
          Alert.alert('Check-In Failed', 'Could not verify booking. Please try again.');
        }
        return;
      }

      // Success responses
      if (response?.message) {
        Alert.alert('Info', response.message);
        // Refresh bookings even for "already checked in" message
        if (userId) fetchBookings(userId);
      } else if (response?.success) {
        Alert.alert('Success', 'Check-in confirmed! Booking is now LIVE.');
        if (userId) fetchBookings(userId);
      } else {
        Alert.alert('Success', 'Check-in processed.');
        if (userId) fetchBookings(userId);
      }

    } catch (e: any) {
      setLoading(false);
      console.error('Scan error:', e);
      Alert.alert('Error', e?.message || 'An error occurred during check-in.');
    }
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

                      {/* Booker Info for Studio/Venue Owners */}
                      {(userRole === 'studio-owner' || userRole === 'venue-owner') && item.customer_name && (
                        <TouchableOpacity
                          style={styles.customerInfoContainer}
                          onPress={() => router.push({ pathname: '/profile', params: { userId: item.user_id } })}
                        >
                          <Image
                            source={{ uri: item.customer_avatar || 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=100&h=100&fit=crop' }}
                            style={styles.customerAvatar}
                          />
                          <Text style={[styles.customerName, { color: colors.textSecondary }]}>
                            {item.type_id === 'gig_application' ? 'Applied by ' : 'Booked by '}
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>{item.customer_name}</Text>
                          </Text>
                          <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}

                      {/* Contact Info (Studio Owners) */}
                      {userRole === 'studio-owner' && item.type_id === 'studio_booking' && (
                        <View style={{ marginTop: 4, gap: 4 }}>
                          {item.customer_contact && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="call-outline" size={12} color={colors.primary} />
                              <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: colors.text }}>
                                {item.customer_contact}
                              </Text>
                            </View>
                          )}
                          {item.customer_address && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Ionicons name="location-outline" size={12} color={colors.primary} />
                              <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: colors.text }} numberOfLines={1}>
                                {item.customer_address}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Video & Note (Venue Owners / Gig Applications) */}
                      {userRole === 'venue-owner' && item.type_id === 'gig_application' && (
                        <View style={{ marginTop: 8, gap: 8 }}>
                          {item.video_url && (
                            <TouchableOpacity
                              onPress={() => Linking.openURL(item.video_url)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF', padding: 8, borderRadius: 8 }}
                            >
                              <Ionicons name="play-circle" size={20} color="#3B82F6" />
                              <Text style={{ fontSize: 12, fontFamily: 'Poppins_500Medium', color: '#3B82F6' }}>Watch Audition Video</Text>
                            </TouchableOpacity>
                          )}

                          {item.note && (
                            <View style={{ backgroundColor: isDark ? '#374151' : '#F9FAFB', padding: 8, borderRadius: 8 }}>
                              <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary, marginBottom: 2 }}>Note:</Text>
                              <Text style={{ fontSize: 12, fontFamily: 'Poppins_400Regular', color: colors.text }}>"{item.note}"</Text>
                            </View>
                          )}
                        </View>
                      )}




                      <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
                        {(() => {
                          const dateStr = item.raw_date
                            ? new Date(item.raw_date).toLocaleDateString()
                            : new Date(item.start_time).toLocaleDateString();

                          let timeStr = '';
                          if (item.start_time) {
                            if (item.start_time.includes('T')) {
                              // Handle ISO timestamp
                              timeStr = new Date(item.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                            } else if (item.start_time.includes(':')) {
                              // Handle HH:MM format
                              const [hours, minutes] = item.start_time.split(':');
                              const h = parseInt(hours);
                              if (!isNaN(h)) {
                                const period = h >= 12 ? 'PM' : 'AM';
                                const h12 = h % 12 || 12;
                                timeStr = `${h12}:${minutes} ${period}`;
                              }
                            }
                          }

                          return `${dateStr}${timeStr ? ` • ${timeStr}` : ''}`;
                        })()}
                      </Text>
                    </View>
                  </View>

                  <View style={[
                    styles.cardFooter,
                    { borderColor: isDark ? colors.border : '#F3F4F6' },
                    // FORCE COLUMN LAYOUT for proper vertical stacking
                    { flexDirection: 'column', alignItems: 'flex-start', gap: moderateScale(12) }
                  ]}>

                    {/* Status Text with Icon - Now at the Top */}
                    <View style={[styles.statusContainer, { marginBottom: 0 }]}>
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


                    <View style={[
                      styles.actionButtonsContainer,
                      { marginTop: 0, width: '100%' }
                    ]}>
                      {activeTab === 'Pending' && item.action === 'Confirm Now' ? (
                        <View style={{ flexDirection: 'row', gap: scale(8), flex: 1 }}>
                          {/* Details Button */}
                          <TouchableOpacity
                            onPress={() => handleDetailsPress(item)}
                            style={[styles.outlineButton, { borderColor: colors.border, flex: 1, justifyContent: 'center', alignItems: 'center' }]}
                          >
                            <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>Details</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleDeclineBooking(item)}
                            style={[styles.actionButton, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2', flex: 1, justifyContent: 'center', alignItems: 'center' }]}
                          >
                            <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Decline</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => { setSelectedItem(item); setModalMode('confirm'); setModalVisible(true); }}
                            style={[styles.actionButton, { backgroundColor: '#16A34A', flex: 1, justifyContent: 'center', alignItems: 'center' }]}
                          >
                            <Text style={[styles.actionButtonText, { color: 'white' }]}>Confirm</Text>
                          </TouchableOpacity>
                        </View>
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
                        <View style={{ width: '100%', gap: moderateScale(8) }}>

                          {/* 1. Primary Action: QR Check-in (Full Width) */}
                          {activeTab === 'Upcoming' && item.type_id === 'studio_booking' && item.status === 'Confirmed' && (
                            userRole === 'studio-owner' ? (
                              <TouchableOpacity
                                onPress={handleScanOpen}
                                style={[styles.actionButton, { backgroundColor: '#7C3AED', width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }]}
                              >
                                <Ionicons name="scan-outline" size={18} color="white" style={{ marginRight: 8 }} />
                                <Text style={[styles.actionButtonText, { color: 'white', fontSize: moderateScale(14) }]}>Scan Entry</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                onPress={() => handleShowPass(item)}
                                style={[styles.actionButton, { backgroundColor: colors.primary, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }]}
                              >
                                <Ionicons name="qr-code-outline" size={18} color="white" style={{ marginRight: 8 }} />
                                <Text style={[styles.actionButtonText, { color: 'white', fontSize: moderateScale(14) }]}>Show Entry Pass</Text>
                              </TouchableOpacity>
                            )
                          )}

                          {/* 2. Secondary Actions: Details & Cancel (Row) */}
                          <View style={{ flexDirection: 'row', gap: scale(8) }}>
                            <TouchableOpacity
                              onPress={() => handleDetailsPress(item)}
                              style={[styles.outlineButton, { borderColor: colors.border, flex: 1, alignItems: 'center' }]}>
                              <Text style={[styles.outlineButtonText, { color: colors.textSecondary }]}>Details</Text>
                            </TouchableOpacity>

                            {activeTab === 'Upcoming' && !item.isCancelled && (
                              <TouchableOpacity onPress={() => {
                                setSelectedItem(item);
                                setModalMode('cancel');
                                setCancellationReason('');
                                setModalVisible(true);
                              }} style={[styles.cancelButton, { backgroundColor: isDark ? 'rgba(127, 29, 29, 0.2)' : '#FEF2F2', flex: 1, alignItems: 'center' }]}>
                                <Text style={[styles.cancelButtonText, isDark ? { color: '#F87171' } : { color: '#DC2626' }]}>Cancel</Text>
                              </TouchableOpacity>
                            )}
                          </View>

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
        title={
          modalMode === 'confirm'
            ? (selectedItem?.type_id === 'gig_application' ? "Accept Application" : "Confirm Booking")
            : modalMode === 'decline'
              ? (selectedItem?.type_id === 'gig_application' ? "Decline Application" : "Decline Booking")
              : (selectedItem?.type_id === 'gig_application' ? "Withdraw from Gig" : "Cancel Booking")
        }
        message={
          modalMode === 'confirm'
            ? (selectedItem?.type_id === 'gig_application'
              ? "Are you sure you want to accept this application? The musician will be notified."
              : "Are you sure you want to confirm this booking?")
            : modalMode === 'decline'
              ? (selectedItem?.type_id === 'gig_application'
                ? "Are you sure you want to decline this application? The musician will be notified and cannot re-apply to this gig."
                : "Are you sure you want to decline this booking? The user will be notified.")
              : (() => {
                // Cancel mode
                if (selectedItem?.type_id === 'gig_application') {
                  // For gig applications
                  if (userRole === 'venue-owner') {
                    return "Are you sure you want to revoke this accepted application? The musician will be notified.";
                  } else {
                    // Musician withdrawing
                    if (selectedItem?.raw_date) {
                      const eventDate = new Date(selectedItem.raw_date);
                      const now = new Date();
                      const diffTime = eventDate.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                      if (diffDays > 7) {
                        return "Warning: You are withdrawing from an accepted gig with more than 7 days notice. This may affect your reputation with this venue.";
                      } else if (diffDays >= 3) {
                        return "Warning: You are withdrawing within 3-7 days. This may significantly affect your reputation with this venue.";
                      }
                      return "You are withdrawing with less than 3 days notice. This may severely damage your reputation with this venue.";
                    }
                    return "Are you sure you want to withdraw from this gig? The venue owner will be notified.";
                  }
                } else {
                  // For studio bookings - show refund policy
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
                }
              })()
        }
        buttonText={
          modalMode === 'confirm'
            ? (selectedItem?.type_id === 'gig_application' ? "Accept" : "Confirm")
            : modalMode === 'decline'
              ? (selectedItem?.type_id === 'gig_application' ? "Decline Application" : "Decline Booking")
              : "Yes, Cancel Booking"
        }
        showInput={modalMode !== 'confirm'} // Show input for cancel AND decline
        onInputChange={setCancellationReason}
        onConfirm={() => {
          if (selectedItem) {
            console.log('🔍 Modal onConfirm - selectedItem:', selectedItem);
            console.log('🔍 Modal onConfirm - modalMode:', modalMode);
            console.log('🔍 Modal onConfirm - selectedItem.type_id:', selectedItem.type_id);

            let status = 'cancelled'; // Default for studio bookings
            if (modalMode === 'confirm') {
              status = selectedItem.type_id === 'gig_application' ? 'accepted' : 'confirmed';
            } else if (modalMode === 'decline') {
              status = selectedItem.type_id === 'gig_application' ? 'rejected' : 'cancelled';
            } else if (modalMode === 'cancel') {
              // Cancel mode (from Upcoming tab)
              status = selectedItem.type_id === 'gig_application' ? 'rejected' : 'cancelled';
            }

            console.log('🔍 Modal onConfirm - Final status:', status);
            console.log('🔍 Modal onConfirm - Calling handleStatusUpdate with:', {
              id: selectedItem.id,
              status,
              type_id: selectedItem?.type_id,
              reason: cancellationReason
            });

            // For decline/cancel, we send cancellationReason
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

      {/* QR Code Modal (Musician) */}
      <RNModal visible={showQRModal} transparent animationType="slide" onRequestClose={() => setShowQRModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.qrContainer, { backgroundColor: 'white' }]}>
            <Text style={styles.qrTitle}>Entry Pass</Text>
            <Text style={styles.qrSubtitle}>Show this to the studio owner</Text>
            <View style={styles.qrWrapper}>
              <QRCode value={qrValue} size={200} />
            </View>
            <TouchableOpacity onPress={() => setShowQRModal(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

      {/* Scanner Modal (Studio Owner) */}
      <RNModal visible={showScanModal} animationType="slide" onRequestClose={() => setShowScanModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scanBox} />
            <Text style={styles.scanText}>Scan Musician's Entry Pass</Text>
            <TouchableOpacity onPress={() => setShowScanModal(false)} style={styles.closeScannerButton}>
              <Ionicons name="close-circle" size={48} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

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
    paddingBottom: SCREEN_HEIGHT < 700 ? verticalScale(150) : verticalScale(180),
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
  customerInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: moderateScale(4),
    marginBottom: moderateScale(2),
  },
  customerAvatar: {
    width: moderateScale(20),
    height: moderateScale(20),
    borderRadius: moderateScale(10),
    marginRight: scale(6),
  },
  customerName: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_400Regular',
    marginRight: scale(4),
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: moderateScale(4),
    gap: scale(4),
  },
  locationText: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    marginTop: moderateScale(12),
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  qrContainer: {
    width: '100%',
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
  },
  qrTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: 'black'
  },
  qrSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20
  },
  qrWrapper: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    overflow: 'hidden'
  },
  closeButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 30,
    backgroundColor: 'black',
    borderRadius: 10
  },
  closeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scanBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 20,
    backgroundColor: 'transparent'
  },
  scanText: {
    color: 'white',
    fontSize: 16,
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5
  },
  closeScannerButton: {
    position: 'absolute',
    bottom: 50
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
