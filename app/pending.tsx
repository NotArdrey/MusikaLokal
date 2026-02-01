import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function PendingScreen() {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [itemToCancel, setItemToCancel] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch My Gig Applications
      const { data: gigApps, error: gigError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_group_applications', userId: user.id }
      });
      if (gigError) throw gigError;

      // 2. Fetch My Studio Bookings
      const { data: studioBookings, error: studioError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_my_bookings', userId: user.id }
      });
      if (studioError) throw studioError;

      // 3. Fetch Pending Leadership Transfers (Incoming)
      const { data: transfers, error: transferError } = await supabase
        .from('leadership_transfer_requests')
        .select(`
          id,
          created_at,
          status,
          message,
          group:group_id (
            id,
            name,
            images
          ),
          from_user:from_user_id (
            full_name
          )
        `)
        .eq('to_user_id', user.id)
        .eq('status', 'pending');

      if (transferError) throw transferError;

      // Combine and Normalize Data
      // Filter for status: 'pending', 'approved' (action required?), 'rejected' (history?)
      // For "Pending" tab specifically, we usually want 'pending' or 'approved' (if payment needed).
      // Let's include 'pending' and 'approved' for now.

      const normalizedTransfers = (transfers || []).map((t: any) => ({
        id: t.id,
        originalId: t.id,
        name: `Leadership: ${t.group?.name || 'Unknown Group'}`,
        date: new Date(t.created_at).toLocaleDateString(),
        image: t.group?.images?.[0] || null,
        status: 'Action Required',
        type: 'Leadership Transfer',
        rawStatus: t.status,
        isGig: false,
        isTransfer: true,
        meta: t // Store full object for actions
      }));

      const normalizedGigApps = (gigApps || []).filter((a: any) => a.status === 'pending' || a.status === 'accepted').map((a: any) => ({
        id: a.id,
        originalId: a.id,
        name: a.gig?.name || 'Unknown Gig',
        date: a.gig?.event_date ? new Date(a.gig.event_date).toLocaleDateString() : 'Date TBA',
        image: a.gig?.images?.[0] || null,
        status: a.status === 'accepted' ? 'Action Required' : 'Waiting for Approval', // Accepted = user might need to sign contract
        type: 'Gig Application',
        rawStatus: a.status,
        isGig: true
      }));

      const normalizedStudioBookings = (studioBookings || []).filter((b: any) => b.status === 'pending' || b.status === 'confirmed').map((b: any) => ({
        id: b.id,
        originalId: b.id,
        name: b.studio?.name || 'Unknown Studio',
        date: b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'Date TBA',
        image: b.studio?.images?.[0] || null,
        status: b.status === 'confirmed' ? 'Confirmed' : 'Waiting for Approval',
        type: 'Studio Booking',
        rawStatus: b.status,
        isGig: false
      }));

      const allItems = [...normalizedTransfers, ...normalizedGigApps, ...normalizedStudioBookings].sort((a, b) => b.id - a.id); // primitive sort, maybe created_at better
      setPendingItems(allItems);

    } catch (e) {
      console.log('Error fetching pending items:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCancelPress = (item: any) => {
    setItemToCancel(item);
    setModalVisible(true);
  };

  // Leadership Transfer Actions
  const handleAcceptTransfer = async (item: any) => {
    Alert.alert(
      'Accept Leadership',
      `Are you sure you want to become the leader of "${item.meta?.group?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.rpc('accept_leadership_transfer', {
                request_id: item.originalId
              });
              if (error) throw error;

              Alert.alert('Success', 'You are now the group leader!');
              fetchData();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to accept transfer');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleDeclineTransfer = async (item: any) => {
    Alert.alert(
      'Decline Leadership',
      'Are you sure you want to decline this leadership transfer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.rpc('decline_leadership_transfer', {
                request_id: item.originalId
              });
              if (error) throw error;

              Alert.alert('Declined', 'Leadership transfer request has been declined.');
              fetchData();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to decline transfer');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const confirmCancel = async () => {
    if (!itemToCancel) return;
    setModalVisible(false); // Close immediately for UX
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (itemToCancel.isGig) {
        // Cancel Gig Application
        const { data, error } = await supabase.functions.invoke('manage-listings', {
          body: { action: 'cancel_application', applicationId: itemToCancel.originalId, userId: user.id }
        });
        if (error) throw error;

        // Show cancellation count warning if available
        if (data && data.cancellation_count !== undefined) {
          Alert.alert(
            'Application Cancelled',
            `Success. You have cancelled ${data.cancellation_count} times with this venue in the last 30 days.\n\nNote: 3 cancellations will result in a temporary block from applying to this venue.`
          );
        } else {
          Alert.alert('Success', 'Application cancelled successfully.');
        }
      } else {
        // Cancel Studio Booking logic...
        Alert.alert('Notice', 'To cancel a studio booking, please contact the studio directly or simple wait for it to expire if not paid.');
        setLoading(false);
        return;
      }

      fetchData(); // Refresh list

    } catch (e) {
      console.log('Error cancelling:', e);
      Alert.alert('Error', 'Failed to cancel application');
      setLoading(false);
    }
  };

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Pending" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        >
          {loading && !refreshing && pendingItems.length === 0 ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            pendingItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 12, fontFamily: 'Poppins_400Regular' }}>No pending applications</Text>
              </View>
            ) : (
              pendingItems.map((item) => (
                <View
                  key={`${item.type}-${item.id}`}
                  style={[
                    styles.card,
                    { backgroundColor: colors.card, borderColor: colors.border }
                  ]}
                >
                  <View>
                    <Image
                      source={{ uri: item.image || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=300&fit=crop' }}
                      style={styles.cardImage}
                      resizeMode="cover"
                    />
                    <View style={styles.badgeContainer}>
                      <Text style={styles.badgeText}>{item.type}</Text>
                    </View>
                  </View>

                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardTitleWrapper}>
                        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.cardDate, { color: colors.textSecondary }]}>{item.date}</Text>
                      </View>
                    </View>

                    <View style={[styles.cardFooter, { borderColor: isDark ? colors.border : '#F3F4F6' }]}>
                      <View style={styles.statusRow}>
                        <Ionicons name="time-outline" size={16} color="#F59E0B" />
                        <Text style={[styles.statusText, { color: "#F59E0B" }]}>{item.status}</Text>
                      </View>

                      {/* Logic for Buttons */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* Cancel Button - Only for Pending Gig Applications or Studio Bookings */}
                        {(item.rawStatus === 'pending') && (
                          <TouchableOpacity
                            onPress={() => handleCancelPress(item)}
                            style={[styles.outlineBtn, { borderColor: '#EF4444' }]}
                          >
                            <Text style={[styles.outlineBtnText, { color: '#EF4444' }]}>Cancel</Text>
                          </TouchableOpacity>
                        )}

                        {item.isTransfer ? (
                          <>
                            <TouchableOpacity
                              onPress={() => handleDeclineTransfer(item)}
                              style={[styles.outlineBtn, { borderColor: colors.border }]}
                            >
                              <Text style={[styles.outlineBtnText, { color: colors.text }]}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleAcceptTransfer(item)}
                              style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                            >
                              <Text style={[styles.actionBtnText, { color: 'white' }]}>Accept</Text>
                            </TouchableOpacity>
                          </>
                        ) : item.status === 'Action Required' ? (
                          <TouchableOpacity
                            onPress={() => {
                              // Navigate to gig details or contract signing
                              if (item.isGig) router.push({ pathname: '/manage_gig', params: { id: item.originalId } }); // Usually internal navigation
                            }}
                            style={[styles.actionBtn, { backgroundColor: '#16A34A' }]}
                          >
                            <Text style={[styles.actionBtnText, { color: 'white' }]}>View</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.outlineBtn, { borderColor: colors.border }]}
                            onPress={() => {
                              // Navigate to details
                            }}
                          >
                            <Text style={[styles.outlineBtnText, { color: colors.textSecondary }]}>Details</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )
          )}
        </ScrollView>

        <View style={styles.navbarContainer}>
          <Navbar />
        </View>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Cancel Application"
        message="Are you sure you want to cancel this application? This action cannot be undone."
        buttonText="Yes, Cancel"
        onConfirm={confirmCancel}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
    paddingHorizontal: 24,
    paddingTop: 16,
    minHeight: '100%',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  card: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardImage: {
    width: '100%',
    height: 144,
  },
  badgeContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
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
  cardTitleWrapper: {
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    marginLeft: 6,
    fontFamily: 'Poppins_500Medium',
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  outlineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  outlineBtnText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
