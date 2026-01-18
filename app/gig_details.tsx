import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  if (!gig) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Gig not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Gig Details" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View
              style={[
                styles.heroImageContainer,
                { shadowColor: colors.primary }
              ]}
            >
              <Image
                source={{ uri: (gig.images && gig.images[0]) || 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=800&fit=crop' }}
                style={styles.heroImage}
                resizeMode="cover"
              />
              {/* Report Button - Hide if Owner */}
              {!isOwner && (
                <TouchableOpacity
                  onPress={handleReport}
                  style={styles.reportButton}
                >
                  <Ionicons name="flag-outline" size={18} color="#fff" />
                </TouchableOpacity>
              )}

              {/* Heart Button */}
              <TouchableOpacity
                onPress={toggleFavorite}
                style={[styles.favButton, !isOwner ? { right: 56 } : { right: 12 }]}
              >
                <Ionicons name={isFavorited ? "heart" : "heart-outline"} size={18} color={isFavorited ? "#EF4444" : "#fff"} />
              </TouchableOpacity>

              <View style={styles.heroOverlay} />
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>{gig.name}</Text>
                <View style={styles.heroLocation}>
                  <Ionicons name="location-outline" size={14} color="#E5E7EB" />
                  <Text style={styles.heroLocationText}>{gig.location || 'Location not set'}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Tab Navigation */}
          <View style={[styles.tabContainer, { backgroundColor: colors.inputBackground }]}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tabButton,
                  {
                    backgroundColor: activeTab === tab ? colors.surface : 'transparent',
                    shadowOpacity: activeTab === tab ? 0.05 : 0,
                    elevation: activeTab === tab ? 2 : 0
                  }
                ]}
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

          <View style={styles.sectionContainer}>
            {activeTab === 'About' && (
              <View style={styles.sectionGap}>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>
                    {gig.description || 'No description provided.'}
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name="people-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Budget</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>₱{gig.budget || '0'}</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name="calendar-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Date</Text>
                    <Text style={[styles.statSubValue, { color: colors.text }]}>
                      {gig.event_date ? new Date(gig.event_date).toLocaleDateString() : 'TBA'}
                    </Text>
                  </View>
                </View>

                {/* The "Deal" Card */}
                <View style={[styles.dealCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                  <View style={styles.dealHeader}>
                    <Ionicons name="cash-outline" size={24} color={colors.primary} />
                    <Text style={[styles.dealTitle, { color: colors.text }]}>The Deal</Text>
                  </View>
                  <View style={[styles.dealContent, { borderColor: colors.border }]}>
                    <View>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Payout Structure</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Guarantee + Door Split</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary, fontSize: 24 }}>₱3,500</Text>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>+ 20% of Door</Text>
                    </View>
                  </View>
                  <View style={styles.dealFooter}>
                    <View style={styles.flex1}>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 12 }}>Time Commitment</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>3 Sets (45m each)</Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 12 }}>Meal Warrant</Text>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Included (₱500 cap)</Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Venue Gallery</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                    {[1, 2, 3].map((i) => (
                      <Image
                        key={i}
                        source={{ uri: `https://picsum.photos/300/200?random=${i + 10}` }}
                        style={styles.galleryImage}
                      />
                    ))}
                  </ScrollView>
                </View>
              </View>

            )}

            {activeTab === 'Info' && (
              <View style={styles.sectionGap}>
                <View style={styles.statsRow}>
                  <View style={styles.infoStatCard}>
                    <Ionicons name="people-outline" size={28} color={colors.primary} />
                    <Text style={styles.infoStatLabel}>Capacity</Text>
                    <Text style={[styles.infoStatValue, { color: colors.text }]}>150</Text>
                  </View>
                  <View style={styles.infoStatCardPurple}>
                    <Ionicons name="mic-outline" size={28} color="#A855F7" />
                    <Text style={styles.infoStatLabelPurple}>PA System</Text>
                    <Text style={[styles.infoStatValue, { color: colors.text }]}>In-House</Text>
                  </View>
                </View>

                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.subTitle, { color: colors.text }]}>Tech Specs</Text>

                  <View style={styles.specList}>
                    <View style={styles.specItem}>
                      <View style={styles.specRow}>
                        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                          <Ionicons name="construct-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={[styles.specName, { color: colors.text }]}>Sound Engineer</Text>
                          <Text style={[styles.specDetail, { color: colors.textSecondary }]}>Available for Soundcheck & Show</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>

                    <View style={styles.specItem}>
                      <View style={styles.specRow}>
                        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                          <Ionicons name="flash-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={[styles.specName, { color: colors.text }]}>Backline Provided</Text>
                          <Text style={[styles.specDetail, { color: colors.textSecondary }]}>Drum Kit, Bass Amp, 2x Gtr Amps</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>

                    <View style={styles.specItem}>
                      <View style={styles.specRow}>
                        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                          <Ionicons name="videocam-outline" size={20} color={colors.text} />
                        </View>
                        <View>
                          <Text style={[styles.specName, { color: colors.text }]}>Projector / Screen</Text>
                          <Text style={[styles.specDetail, { color: colors.textSecondary }]}>HDMI Connection on Stage Left</Text>
                        </View>
                      </View>
                      <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                    </View>
                  </View>
                </View>
              </View>
            )}


            {activeTab === 'Apply' && (
              <View style={styles.sectionGap}>
                <View>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Pitch Message</Text>
                  <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TextInput
                      placeholder='Why should we hire you?'
                      placeholderTextColor={colors.textSecondary}
                      multiline={true}
                      style={[styles.textInput, { color: colors.text }]}
                    />
                  </View>
                </View>

                <View>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Performance Video</Text>

                  <TouchableOpacity style={[styles.uploadBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <View style={styles.uploadIcon}>
                      <Ionicons name="videocam-outline" size={24} color={colors.primary} />
                    </View>
                    <Text style={[styles.uploadText, { color: colors.text }]}>Upload Sample Video</Text>
                    <Text style={[styles.uploadSubText, { color: colors.textSecondary }]}>MP4, MOV (Max 50MB)</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.contractCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.contractIcon}>
                    <Ionicons name="document-text-outline" size={24} color="#3B82F6" />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.contractTitle, { color: colors.text }]}>Gig Contract</Text>
                    <Text style={[styles.contractSubtitle, { color: colors.textSecondary }]}>Review terms and conditions</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={[styles.viewLink, { color: colors.primary }]}>View</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={styles.actionButtonText}>Submit Application</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "Review" && (
              <View>
                <View style={styles.ratingOverview}>
                  <Text style={[styles.ratingBig, { color: colors.text }]}>4.5</Text>
                  <View style={styles.ratingStars}>
                    {[1, 2, 3, 4].map(i => <Ionicons key={i} name="star" size={20} color={colors.primary} />)}
                    <Ionicons name="star-half" size={20} color={colors.primary} />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Based on 25 reviews</Text>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewerInfo}>
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=3' }} style={styles.reviewerAvatar} />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Jared Cariaso</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>1 month ago</Text>
                  </View>
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Amazing venue! The sound system was top-notch and the staff was incredibly professional. Highly recommend!
                  </Text>

                  {/* Review Interactions */}
                  <View style={styles.reviewActions}>
                    <TouchableOpacity style={styles.reviewActionBtn}>
                      <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>12</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.reviewActionBtn}>
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

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBackBtn: {
    marginTop: 16,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  heroSection: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  heroImageContainer: {
    width: '100%',
    height: 224, // h-56
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 8,
    shadowOpacity: 0.2, // Default
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  reportButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  favButton: {
    position: 'absolute',
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    backgroundColor: 'transparent',
  },
  heroContent: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  heroTitle: {
    color: 'white',
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  heroLocationText: {
    color: '#E5E7EB',
    fontSize: 12,
    marginLeft: 4,
    fontFamily: 'Poppins_400Regular',
  },
  tabContainer: {
    marginHorizontal: 24,
    marginTop: 8,
    padding: 4,
    borderRadius: 16,
    flexDirection: 'row',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  sectionContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  sectionGap: {
    gap: 24,
  },
  card: {
    padding: 16,
    borderRadius: 16,
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Poppins_400Regular',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  statSubValue: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  dealCard: {
    marginTop: 16,
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
  dealContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    paddingBottom: 16,
    marginBottom: 16,
  },
  dealFooter: {
    flexDirection: 'row',
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  galleryContainer: {
    paddingRight: 24,
    gap: 12,
  },
  galleryImage: {
    width: 192, // w-48
    height: 128, // h-32
    borderRadius: 16,
    marginRight: 12,
  },
  // Info Tab
  infoStatCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF', // indigo-50
  },
  infoStatLabel: {
    marginTop: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    color: '#818CF8', // indigo-400
  },
  infoStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoStatCardPurple: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF5FF', // purple-50
  },
  infoStatLabelPurple: {
    marginTop: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    color: '#C084FC', // purple-400
  },
  subTitle: {
    fontSize: 18,
    marginBottom: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  specList: {
    gap: 16,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specName: {
    fontFamily: 'Poppins_600SemiBold',
  },
  specDetail: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  // Apply Tab
  inputLabel: {
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  inputContainer: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  textInput: {
    height: 120,
    textAlignVertical: 'top',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF', // primary-50
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  uploadText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
  },
  uploadSubText: {
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
  },
  contractCard: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  contractIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF', // blue-50
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  contractSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  viewLink: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  // Review Tab
  ratingOverview: {
    alignItems: 'center',
    marginBottom: 32,
  },
  ratingBig: {
    fontSize: 48,
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  reviewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reviewStars: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 8,
  },
  reviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  reviewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});

