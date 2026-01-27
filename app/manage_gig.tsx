import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

import { useLocalSearchParams } from 'expo-router';

export default function GigDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');
  const [modalAction, setModalAction] = useState<() => Promise<void> | void>(() => { });

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [gig, setGig] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
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

      if (profile?.role !== 'venue-owner') {
        Alert.alert('Unauthorized', 'Only venue owners can access this page.');
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
      // Fetch Gig Details
      const { data: gigData, error: gigError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'gig', id: id, userId }
      });
      if (gigError) throw gigError;
      setGig(gigData);

      // Fetch Applications
      const { data: appData, error: appError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_gig_applications', gigId: id, userId }
      });
      if (appError) throw appError;
      setApplications(appData || []);

      // Fetch Reviews
      const { data: reviewData, error: reviewError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_reviews', type: 'gig', id: id, userId }
      });
      if (reviewError) throw reviewError;
      setReviews(reviewData || []);

    } catch (e) {
      console.log('Error fetching data:', e);
      Alert.alert('Error', 'Failed to load gig data');
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = (applicationId: string, status: string) => {
    setModalTitle(status === 'approved' ? 'Accept Application' : 'Decline Application');
    setModalMessage(`Are you sure you want to ${status === 'approved' ? 'accept' : 'decline'} this application?`);
    setModalButtonText(status === 'approved' ? 'Accept' : 'Decline');
    setModalAction(() => async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.functions.invoke('manage-listings', {
          body: { action: 'update_application_status', applicationId, status, userId: user.id }
        });
        if (error) throw error;

        setApplications(applications.map(a => a.id === applicationId ? { ...a, status } : a));
        setModalVisible(false);
      } catch (e) {
        console.log('Error updating application:', e);
        Alert.alert('Error', 'Failed to update application status');
      }
    });
    setModalVisible(true);
  };

  const tabs = ['About', 'Info', 'Applicants', 'Review'];

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
        <Header title="Manage Gig" />

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
                source={{ uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop' }}
                style={styles.headerImage}
                resizeMode="cover"
              />
              <View style={styles.headerImageGradient} />
              {/* Note: In React Native, linear gradient requires expo-linear-gradient.
                 Here we simulated it with a view, but without the library it's just a view.
                 If you want a real gradient, install expo-linear-gradient.
                 For now, keeping it as a styled view (maybe partially transparent black).
               */}
              <View style={[styles.headerImageOverlay, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>{gig?.name || 'Loading...'}</Text>
            <Text style={[styles.headerLocation, { color: colors.textSecondary }]}>{gig?.location || 'Location N/A'}</Text>
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
                    {gig?.description || 'No description available.'}
                  </Text>
                </View>

                {/* The "Deal" Card */}
                <View style={[styles.dealCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                  <View style={styles.dealHeader}>
                    <Ionicons name="cash-outline" size={24} color={colors.primary} />
                    <Text style={[styles.dealTitle, { color: colors.text }]}>The Deal</Text>
                  </View>
                  <View style={[styles.dealInfo, { borderColor: colors.border }]}>
                    <View>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Budget</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Total Payout</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.payoutAmount, { color: colors.primary }]}>₱{(gig?.budget || 0).toLocaleString()}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 12 }}>Time Commitment</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>3 Sets (45m each)</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 12 }}>Meal Warrant</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Included (₱500 cap)</Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Venue Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 30}` }}
                        style={styles.galleryImage}
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {activeTab === 'Info' && (
              <View style={styles.infoContainer}>
                <View style={styles.capacityContainer}>
                  <View style={[styles.capacityCard, { backgroundColor: isDark ? 'rgba(49, 46, 129, 0.3)' : '#EEF2FF' }]}>
                    <Ionicons name="people-outline" size={28} color={colors.primary} />
                    <Text style={{ marginTop: 8, fontSize: 12, textTransform: 'uppercase', fontWeight: 'bold', color: '#818CF8' }}>Capacity</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text }}>150</Text>
                  </View>
                  <View style={[styles.capacityCard, { backgroundColor: isDark ? 'rgba(88, 28, 135, 0.3)' : '#FAF5FF' }]}>
                    <Ionicons name="mic-outline" size={28} color="#A855F7" />
                    <Text style={{ marginTop: 8, fontSize: 12, textTransform: 'uppercase', fontWeight: 'bold', color: '#C084FC' }}>PA System</Text>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text }}>In-House</Text>
                  </View>
                </View>

                <View style={[styles.techSpecsCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.techSpecsTitle, { color: colors.text }]}>Tech Specs</Text>

                  <View style={{ gap: 16 }}>
                    <View style={styles.techSpecItem}>
                      <View style={styles.techSpecInfo}>
                        <View style={[styles.techSpecIcon, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                          <Ionicons name="construct-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Sound Engineer</Text>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Available for Soundcheck & Show</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>

                    <View style={styles.techSpecItem}>
                      <View style={styles.techSpecInfo}>
                        <View style={[styles.techSpecIcon, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                          <Ionicons name="flash-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Backline Provided</Text>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Drum Kit, Bass Amp, 2x Gtr Amps</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>

                    <View style={styles.techSpecItem}>
                      <View style={styles.techSpecInfo}>
                        <View style={[styles.techSpecIcon, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
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

            {activeTab === 'Applicants' && (
              <View style={styles.applicantsContainer}>
                <Text style={[styles.applicantsTitle, { color: colors.textSecondary }]}>APPLICANTS LIST</Text>

                {applications.length === 0 ? (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>No applications yet.</Text>
                ) : (
                  applications.map((app) => (
                    <View key={app.id} style={[styles.applicantCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
                      <View style={styles.applicantHeader}>
                        <Image source={{ uri: app.group?.images?.[0] || app.applicant?.avatar_url || 'https://i.pravatar.cc/100' }} style={styles.applicantImage} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>
                            {app.group?.name || app.applicant?.full_name || 'Unknown Applicant'}
                          </Text>
                          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>
                            {app.group?.genre || 'Musician'} • {app.status}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.applicantMessage, { color: colors.textSecondary }]}>
                        {app.cover_letter || "No cover letter provided."}
                      </Text>

                      {app.status === 'pending' && (
                        <View style={styles.actionButtons}>
                          <TouchableOpacity
                            onPress={() => confirmAction(app.id, 'rejected')}
                            style={[styles.declineButton, { borderColor: colors.border }]}
                          >
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Decline</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => confirmAction(app.id, 'approved')}
                            style={[styles.acceptButton, { backgroundColor: colors.primary }]}
                          >
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#FFF' }}>Accept</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {activeTab === 'Review' && (
              <View>
                <View style={styles.reviewHeader}>
                  <Text style={[styles.ratingText, { color: colors.text }]}>4.5</Text>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4].map(i => <Ionicons key={i} name="star" size={20} color={colors.primary} />)}
                    <Ionicons name="star-half" size={20} color={colors.primary} />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Based on 25 reviews</Text>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.reviewUserHeader}>
                    <View style={styles.userInfo}>
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=3' }} style={styles.userAvatar} />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Jared Cariaso</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>1 month ago</Text>
                  </View>
                  <View style={[styles.starsRow, { marginBottom: 8 }]}>
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={[styles.reviewText, { color: colors.textSecondary }]}>
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
  },
  headerImageOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
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
  dealCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  dealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  dealTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  dealInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    paddingBottom: 16,
    marginBottom: 16,
  },
  payoutAmount: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
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
  infoContainer: {
    gap: 24,
  },
  capacityContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  capacityCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  techSpecsCard: {
    padding: 16,
    borderRadius: 16,
  },
  techSpecsTitle: {
    fontSize: 18,
    marginBottom: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  techSpecItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  techSpecInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  techSpecIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantsContainer: {
    gap: 16,
  },
  applicantsTitle: {
    fontSize: 13,
    letterSpacing: 0.5,
    fontFamily: 'Poppins_600SemiBold',
  },
  applicantCard: {
    padding: 16,
    borderRadius: 24,
  },
  applicantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  applicantImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  starRatingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  applicantMessage: {
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
});

