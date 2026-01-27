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

export default function GroupDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtonText, setModalButtonText] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [group, setGroup] = useState<any>(null);
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

      if (profile?.role !== 'musician') {
        Alert.alert('Unauthorized', 'Only musicians can access this page.');
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
      // Fetch Group Details
      const { data: groupData, error: groupError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_one', type: 'group', id: id, userId }
      });
      if (groupError) throw groupError;
      setGroup(groupData);

      // Fetch Group Applications (Sent)
      const { data: appData, error: appError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_group_applications', groupId: id, userId }
      });
      if (appError) throw appError;
      setApplications(appData || []);

      // Fetch Reviews
      const { data: reviewData, error: reviewError } = await supabase.functions.invoke('manage-listings', {
        body: { action: 'fetch_reviews', type: 'group', id: id, userId }
      });
      if (reviewError) throw reviewError;
      setReviews(reviewData || []);

    } catch (e) {
      console.log('Error fetching data:', e);
      Alert.alert('Error', 'Failed to load group data');
    } finally {
      setLoading(false);
    }
  };

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

  const tabs = ['About', 'Setup', 'Applications', 'Review'];

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
        <Header title="Manage Group" />

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
                source={{ uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=800&fit=crop' }}
                style={styles.headerImage}
                resizeMode="cover"
              />
              <View style={styles.headerImageGradient} />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>{group?.name || 'Loading...'}</Text>
            <Text style={[styles.headerLocation, { color: colors.textSecondary }]}>{group?.genre || 'Genre N/A'} • {group?.location || 'Location N/A'}</Text>
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
                    {group?.description || 'No description available.'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Members</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{group?.members?.length || 0}</Text>
                  </View>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Genre</Text>
                    <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium', fontSize: 14 }}>{group?.genre || 'N/A'}</Text>
                  </View>
                </View>

                <View style={[styles.availabilityCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Availability Settings</Text>

                  <View style={[styles.availabilityItem, { marginBottom: 16 }]}>
                    <View>
                      <Text style={[styles.availabilityTitle, { color: colors.text }]}>Accepting Bookings</Text>
                      <Text style={[styles.availabilitySubtitle, { color: colors.textSecondary }]}>Allow venues to book this group</Text>
                    </View>
                    <TouchableOpacity style={[styles.toggleSwitch, { backgroundColor: colors.primary, alignItems: 'flex-end' }]}>
                      <View style={styles.toggleThumb} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.availabilityItem}>
                    <View>
                      <Text style={[styles.availabilityTitle, { color: colors.text }]}>Looking for Members</Text>
                      <Text style={[styles.availabilitySubtitle, { color: colors.textSecondary }]}>Allow musicians to apply to join</Text>
                    </View>
                    <TouchableOpacity style={[styles.toggleSwitch, { backgroundColor: isDark ? '#4B5563' : '#D1D5DB', alignItems: 'flex-start' }]}>
                      <View style={styles.toggleThumb} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.completionCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Completion Rate</Text>
                  <View style={styles.completionHeader}>
                    <Text style={[styles.completionValue, { color: '#10b981' }]}>98%</Text>
                    <View style={[styles.progressBarContainer, { backgroundColor: isDark ? '#334155' : '#F3F4F6' }]}>
                      <View style={[styles.progressBarFill, { width: '98%' }]} />
                    </View>
                  </View>
                </View>

                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 20}` }}
                        style={styles.galleryImage}
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}

            {/* Gigs section moved to About - keeping for reference */}
            {false && (
              <View style={{ gap: 16 }}>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.textSecondary, letterSpacing: 0.5 }}>GIG INVITATIONS</Text>

                {/* Invitation Card 1 */}
                <View style={[styles.invitationCard, { backgroundColor: colors.surface, marginBottom: 8 }]}>
                  <View style={styles.invitationHeader}>
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&h=100&fit=crop' }} style={styles.invitationImage} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.invitationTitle, { color: colors.text }]}>The Blue Note Bar</Text>
                      <Text style={[styles.invitationSubtitle, { color: colors.textSecondary }]}>Live Music Venue • Makati City</Text>
                    </View>
                    <View style={[styles.starRatingBadge, { backgroundColor: 'rgba(250, 204, 21, 0.2)' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FACC15' : '#D97706' }}>4.9</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.invitationDetails, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F9FAFB' }]}>
                    <View style={styles.invitationDetailItem}>
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={[styles.detailText, { color: colors.text }]}>Dec 22 • 8:00 PM</Text>
                    </View>
                    <Text style={[styles.invitationPrice, { color: colors.primary }]}>₱8,000</Text>
                  </View>

                  <Text style={[styles.invitationMessage, { color: colors.textSecondary }]}>"We loved your performance at our sister venue! Would you be interested in a 3-hour set?"</Text>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={() => handleAction('decline')}
                      style={[styles.declineButton, { borderColor: colors.border }]}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAction('accept')}
                      style={[styles.acceptButton, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#FFF' }}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Invitation Card 2 */}
                <View style={[styles.invitationCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.invitationHeader}>
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&h=100&fit=crop' }} style={styles.invitationImage} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.invitationTitle, { color: colors.text }]}>Sunset Beach Resort</Text>
                      <Text style={[styles.invitationSubtitle, { color: colors.textSecondary }]}>Resort • Batangas</Text>
                    </View>
                    <View style={[styles.starRatingBadge, { backgroundColor: 'rgba(250, 204, 21, 0.2)' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="star" size={12} color="#FBBF24" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#FACC15' : '#D97706' }}>4.7</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.invitationDetails, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F9FAFB' }]}>
                    <View style={styles.invitationDetailItem}>
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={[styles.detailText, { color: colors.text }]}>Dec 31 • 9:00 PM</Text>
                    </View>
                    <Text style={[styles.invitationPrice, { color: colors.primary }]}>₱15,000</Text>
                  </View>

                  <Text style={[styles.invitationMessage, { color: colors.textSecondary }]}>"Hosting a New Year's Eve countdown party. Accommodation and meals included!"</Text>

                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      onPress={() => handleAction('decline')}
                      style={[styles.declineButton, { borderColor: colors.border }]}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleAction('accept')}
                      style={[styles.acceptButton, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#FFF' }}>Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>

              </View>
            )}

            {activeTab === 'Setup' && (
              <View style={styles.aboutContainer}>
                <View style={[styles.setupCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.setupHeader}>
                    <Text style={[styles.setupTitle, { color: colors.text }]}>Stage Plot</Text>
                    <TouchableOpacity>
                      <Text style={[styles.editLink, { color: colors.primary }]}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.stagePlotContainer, { borderColor: colors.border, backgroundColor: isDark ? '#1e293b' : '#f8fafc' }]}>
                    <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
                    <Text style={[styles.stagePlotText, { color: colors.textSecondary }]}>Standard 4-Piece Setup</Text>
                  </View>
                </View>

                <View style={[styles.setupCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.setupHeader}>
                    <Text style={[styles.setupTitle, { color: colors.text }]}>Input List</Text>
                    <TouchableOpacity>
                      <Text style={[styles.editLink, { color: colors.primary }]}>Add Input</Text>
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
                    <View key={index} style={[styles.inputListItem, { borderColor: colors.border }]}>
                      <View style={[styles.channelNumber, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{item.ch}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inputName, { color: colors.text }]}>{item.name}</Text>
                        <Text style={[styles.inputDetails, { color: colors.textSecondary }]}>{item.mic} • {item.stand}</Text>
                      </View>
                      <TouchableOpacity>
                        <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>

                <View style={[styles.hospitalityCard, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.setupTitle, { color: colors.text, marginBottom: 8 }]}>Hospitality</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                    Allergies: Peanuts (Bass Player).{'\n'}
                    Preferences: 4x Bottled Water, 2x Towels per show.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'Applications' && (
              <View style={styles.aboutContainer}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Sent Applications</Text>

                {applications.length === 0 ? (
                  <Text style={{ color: colors.textSecondary }}>No applications sent yet.</Text>
                ) : (
                  applications.map((app) => (
                    <View key={app.id} style={[styles.setupCard, { backgroundColor: colors.surface, marginBottom: 12 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={[styles.setupTitle, { color: colors.text }]}>{app.gig?.name || 'Unknown Gig'}</Text>
                        <Text style={{ color: app.status === 'approved' ? 'green' : app.status === 'pending' ? 'orange' : 'red', fontWeight: 'bold' }}>
                          {app.status.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textSecondary, marginBottom: 4 }}>{app.gig?.location}</Text>
                      <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Budget: ₱{(app.gig?.budget || 0).toLocaleString()}</Text>
                      <Text style={{ color: colors.textSecondary }}>Applied on: {new Date(app.created_at).toLocaleDateString()}</Text>
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
  availabilityCard: {
    padding: 16,
    borderRadius: 16,
  },
  availabilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  availabilityTitle: {
    fontFamily: 'Poppins_500Medium',
  },
  availabilitySubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  completionCard: {
    padding: 16,
    borderRadius: 16,
  },
  completionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completionValue: {
    fontSize: 24,
    fontFamily: 'Poppins_600SemiBold',
  },
  progressBarContainer: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 6,
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
  invitationCard: {
    padding: 16,
    borderRadius: 24,
  },
  invitationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  invitationImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  invitationTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  invitationSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  starRatingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  invitationDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  invitationDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
  },
  invitationPrice: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  invitationMessage: {
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
  setupCard: {
    padding: 16,
    borderRadius: 16,
  },
  setupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  editLink: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  stagePlotContainer: {
    height: 192,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stagePlotText: {
    fontSize: 12,
    marginTop: 8,
    fontFamily: 'Poppins_400Regular',
  },
  inputListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  channelNumber: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginRight: 12,
  },
  inputName: {
    fontFamily: 'Poppins_500Medium',
  },
  inputDetails: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  hospitalityCard: {
    padding: 16,
    borderRadius: 16,
  },
  featuredVideoContainer: {
    padding: 16,
    borderRadius: 16,
  },
  featuredVideo: {
    height: 192,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  playIconOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 4,
  },
  videoViews: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  pressCard: {
    width: 256,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 16,
  },
  pressMetric: {
    fontSize: 30,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  pressLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  pressSource: {
    fontSize: 12,
    marginTop: 8,
    color: '#9CA3AF',
  },
  audioDemoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  trackTitle: {
    fontFamily: 'Poppins_500Medium',
  },
  trackDuration: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
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

