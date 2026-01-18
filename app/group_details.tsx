import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [group, setGroup] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: { action: 'fetch', type: 'group', id: id || 'bd9552d7-b827-449e-8c43-2a4439c2c62c', userId } // Fallback ID for demo if param missing
      });

      if (error) throw error;
      setGroup(data);
      setIsOwner(data.is_owner);
      setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error fetching group:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    // Optimistic update
    setIsFavorited(!isFavorited);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.functions.invoke('manage-details', {
        body: { action: 'toggle_favorite', type: 'group', id: group.id, userId: user.id }
      });

      // Sync with server result just in case
      if (data) setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error toggling favorite:', e);
      // Revert
      setIsFavorited(!isFavorited);
    }
  };

  const handleReport = () => {
    router.push({ pathname: '/report', params: { type: 'group', id: group.id, name: group.name } } as any);
  };

  const tabs = ['About', 'Setup', 'Connect', 'Review'];

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Group not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Group Details" />

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
                source={{ uri: (group.images && group.images[0]) || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&fit=crop' }}
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
                <Text style={styles.heroTitle}>{group.name}</Text>
                <View style={styles.heroLocation}>
                  <Text style={styles.heroSubtitle}>{group.genre || 'Band'} • {group.members ? group.members.length : 0} Members</Text>
                </View>
                <View style={styles.heroLocation}>
                  <Ionicons name="location-outline" size={14} color="#E5E7EB" />
                  <Text style={styles.heroLocationText}>{group.location || 'Location not set'}</Text>
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
                    {group.description || 'No description provided.'}
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name="musical-notes-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Genre</Text>
                    <Text style={[styles.statSubValue, { color: colors.text }]}>{group.genre || '-'}</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name="star-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{group.rating || 'N/A'}</Text>
                  </View>
                </View>

                {/* Owner Profile Link */}
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary, marginBottom: 16 }]}>Managed By</Text>
                  <TouchableOpacity onPress={() => router.push('/profile')} style={styles.profileLink}>
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop' }} style={styles.profileAvatar} />
                    <View style={styles.flex1}>
                      <Text style={[styles.profileName, { color: colors.text }]}>Owner Profile</Text>
                      <Text style={[styles.viewProfileText, { color: colors.primary }]}>View Profile</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeTab === 'Setup' && (
              <View style={styles.sectionGap}>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Stage Plot</Text>
                  <View style={[styles.plotBox, { borderColor: colors.border, backgroundColor: isDark ? '#1e293b' : '#f8fafc' }]}>
                    <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
                    <Text style={{ marginTop: 8, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>Standard 4-Piece Setup</Text>
                  </View>
                </View>

                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Input List</Text>
                  {[
                    { ch: 1, name: 'Kick', mic: 'Beta 52', stand: 'Boom' },
                    { ch: 2, name: 'Snare Top', mic: 'SM57', stand: 'Clip' },
                    { ch: 3, name: 'Hi-Hat', mic: 'SM81', stand: 'Boom' },
                    { ch: 4, name: 'Bass DI', mic: 'J48', stand: '-' },
                    { ch: 5, name: 'Gtr SL', mic: 'e609', stand: 'Short' },
                    { ch: 6, name: 'Vox Center', mic: 'SM58', stand: 'Straight' },
                  ].map((item, index) => (
                    <View key={index} style={[styles.inputRow, { borderColor: colors.border }]}>
                      <View style={[styles.inputCh, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>{item.ch}</Text>
                      </View>
                      <View style={styles.flex1}>
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item.name}</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>{item.mic} • {item.stand}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { marginBottom: 8, color: colors.text }]}>Hospitality</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                    Allergies: Peanuts (Bass Player).{'\n'}
                    Preferences: 4x Bottled Water, 2x Towels per show.
                  </Text>
                </View>
              </View>
            )}

            {activeTab === 'Connect' && (
              <View style={styles.sectionGap}>
                {/* For Venues - Booking */}
                <View>
                  <View style={styles.roleHeader}>
                    <View style={[styles.roleIcon, { backgroundColor: isDark ? 'rgba(79, 70, 229, 0.3)' : '#E0E7FF' }]}>
                      <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                    </View>
                    <Text style={[styles.roleTitle, { color: colors.text }]}>For Venues</Text>
                  </View>

                  <View style={[styles.bookingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ marginBottom: 12, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 13 }}>Send a booking request to hire this band for your event.</Text>

                    <Text style={[styles.inputLabel, { color: colors.text, fontSize: 14 }]}>Booking Message</Text>
                    <View style={[styles.inputContainer, { backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderColor: colors.border, marginBottom: 16 }]}>
                      <TextInput
                        placeholder='Introduce yourself and your event details...'
                        placeholderTextColor={colors.textSecondary}
                        multiline={true}
                        style={[styles.textInputShort, { color: colors.text }]}
                      />
                    </View>

                    <Text style={[styles.inputLabel, { color: colors.text, fontSize: 14 }]}>Event Proposal</Text>
                    <TouchableOpacity style={[styles.uploadBoxSmall, { borderColor: colors.border }]}>
                      <Ionicons name="document-attach-outline" size={28} color={colors.primary} />
                      <Text style={{ marginTop: 8, fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Upload Event Details</Text>
                      <Text style={{ fontSize: 12, marginTop: 4, fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>PDF, DOC (Max 10MB)</Text>
                    </TouchableOpacity>

                    <View style={[styles.termsRow, { backgroundColor: isDark ? '#1e293b' : '#f0f9ff' }]}>
                      <Ionicons name="newspaper-outline" size={20} color="#3B82F6" />
                      <View style={styles.flex1}>
                        <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Booking Terms</Text>
                      </View>
                      <TouchableOpacity>
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.primary }}>View</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.primary }]}
                      onPress={() => setModalVisible(true)}
                    >
                      <Text style={styles.actionButtonText}>Submit Booking Request</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Divider */}
                <View style={styles.dividerContainer}>
                  <View style={[styles.dividerLine, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />
                  <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
                  <View style={[styles.dividerLine, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />
                </View>

                {/* For Musicians - Apply */}
                <View>
                  <View style={styles.roleHeader}>
                    <View style={[styles.roleIcon, { backgroundColor: isDark ? 'rgba(21, 128, 61, 0.3)' : '#DCFCE7' }]}>
                      <Ionicons name="person-add-outline" size={18} color="#15803d" />
                    </View>
                    <Text style={[styles.roleTitle, { color: colors.text }]}>Join the Band</Text>
                  </View>

                  {/* Auditioning Banner */}
                  <View style={[styles.auditionBanner, { backgroundColor: isDark ? 'rgba(21, 128, 61, 0.2)' : '#F0FDF4', borderColor: isDark ? '#166534' : '#DCFCE7' }]}>
                    <View style={styles.auditionContent}>
                      <View style={[styles.auditionIcon, { backgroundColor: isDark ? '#166534' : '#DCFCE7' }]}>
                        <Ionicons name="megaphone-outline" size={20} color="#15803d" />
                      </View>
                      <View style={styles.flex1}>
                        <Text style={[styles.auditionTitle, { color: colors.text }]}>We're Auditioning!</Text>
                        <Text style={[styles.auditionText, { color: colors.textSecondary }]}>
                          Looking for a <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Keyboardist</Text> and <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Bass Player</Text>. Send us your demo!
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.bookingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.inputLabel, { color: colors.text, fontSize: 14 }]}>Why do you want to join?</Text>
                    <View style={[styles.inputContainer, { backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderColor: colors.border, marginBottom: 16 }]}>
                      <TextInput
                        placeholder='Tell us about your experience and influences...'
                        placeholderTextColor={colors.textSecondary}
                        multiline={true}
                        style={[styles.textInputShort, { color: colors.text }]}
                      />
                    </View>

                    <Text style={[styles.inputLabel, { color: colors.text, fontSize: 14 }]}>Your Demo</Text>
                    <TouchableOpacity style={[styles.uploadBoxSmall, { borderColor: colors.border }]}>
                      <Ionicons name="musical-notes" size={28} color={colors.primary} />
                      <Text style={{ marginTop: 8, fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Link Audio/Video Demo</Text>
                      <Text style={{ fontSize: 12, marginTop: 4, fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>YouTube, Spotify, SoundCloud, etc.</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#15803d' }]}
                    >
                      <Text style={styles.actionButtonText}>Submit Audition</Text>
                    </TouchableOpacity>
                  </View>
                </View>
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
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=12' }} style={styles.reviewerAvatar} />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Mark Santos</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>2 weeks ago</Text>
                  </View>
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Ben&Ben exceeded all expectations! Their live performance was absolutely breathtaking. Professional and punctual.
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
        title="Confirm Booking"
        message="Are you sure you want to submit this booking request?"
        buttonText="Submit">
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  goBackBtn: {
    marginTop: 16,
  },
  heroSection: {
    paddingHorizontal: 24,
    marginTop: 16,
  },
  heroImageContainer: {
    width: '100%',
    height: 224,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
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
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  heroContent: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    fontWeight: 'bold',
  },
  heroSubtitle: {
    color: '#E5E7EB',
    fontSize: 14,
    marginLeft: 4,
    fontFamily: 'Poppins_500Medium',
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
    letterSpacing: 0.5,
    marginBottom: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  statSubValue: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  profileName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  viewProfileText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  plotBox: {
    height: 192,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  inputCh: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginRight: 12,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  roleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
  bookingCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  inputLabel: {
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
  },
  inputContainer: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  textInputShort: {
    height: 100,
    textAlignVertical: 'top',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  uploadBoxSmall: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    color: '#fff',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  auditionBanner: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  auditionContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  auditionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditionTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  auditionText: {
    marginTop: 4,
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
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

