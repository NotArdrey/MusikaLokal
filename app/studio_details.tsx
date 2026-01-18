import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function StudioDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState('About');
  const [modalVisible, setModalVisible] = useState(false);
  const [studio, setStudio] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStudioDetails();
  }, [id]);

  const fetchStudioDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: { action: 'fetch', type: 'studio', id: id || '9d7f3d45-6678-4384-9345-123456789abc', userId } // Fallback ID for demo
      });

      if (error) throw error;
      setStudio(data);
      setIsOwner(data.is_owner);
      setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error fetching studio:', e);
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
        body: { action: 'toggle_favorite', type: 'studio', id: studio.id, userId: user.id }
      });
      if (data) setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error toggling favorite:', e);
      setIsFavorited(!isFavorited);
    }
  };

  const handleReport = () => {
    router.push({ pathname: '/report', params: { type: 'studio', id: studio.id, name: studio.name } } as any);
  };

  const tabs = ['About', 'Setup', 'Book', 'Review'];

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
      </View>
    );
  }

  if (!studio) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Studio not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.goBackBtn}>
          <Text style={{ color: colors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Studio Details" />

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
                source={{ uri: (studio.images && studio.images[0]) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop' }}
                style={styles.heroImage}
                resizeMode="cover"
              />
              {!isOwner && (
                <TouchableOpacity
                  onPress={handleReport}
                  style={styles.reportButton}
                >
                  <Ionicons name="flag-outline" size={18} color="#fff" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={toggleFavorite}
                style={[styles.favButton, !isOwner ? { right: 56 } : { right: 12 }]}
              >
                <Ionicons name={isFavorited ? "heart" : "heart-outline"} size={18} color={isFavorited ? "#EF4444" : "#fff"} />
              </TouchableOpacity>

              <View style={styles.heroOverlay} />
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>{studio.name}</Text>
                <View style={styles.heroLocation}>
                  <Ionicons name="location-outline" size={14} color="#E5E7EB" />
                  <Text style={styles.heroLocationText}>{studio.address || 'Address not set'}</Text>
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
                    {studio.description || 'No description provided.'}
                  </Text>
                </View>

                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name="resize-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rate</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>₱{studio.hourly_rate || '0'}/hr</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Ionicons name="star-outline" size={24} color={colors.primary} style={{ marginBottom: 8 }} />
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{studio.rating || 'N/A'}</Text>
                  </View>
                </View>

                <View>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Studio Gallery</Text>
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

            {activeTab === 'Setup' && (
              <View style={styles.sectionGap}>
                <View style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}>
                  <Ionicons name="search" size={20} color={colors.textSecondary} />
                  <Text style={{ marginLeft: 12, fontSize: 14, fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Search microphones, amps...</Text>
                </View>

                {['Microphones', 'Instruments', 'Monitoring', 'DAW & Interfaces'].map((category, idx) => (
                  <View key={idx}>
                    <Text style={[styles.categoryTitle, { color: colors.primary }]}>{category}</Text>
                    <View style={styles.tagContainer}>
                      {['Shure SM57', 'Neumann U87', 'Fender Twin Reverb', 'Logic Pro X', 'Apollo Twin'].slice(0, 4).map((item, i) => (
                        <View key={i} style={[styles.tag, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                          <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 13 }}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'Book' && (
              <View style={styles.sectionGap}>
                <View style={[styles.card, { backgroundColor: colors.surface }]}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Booking Details</Text>

                  <View style={styles.formGap}>
                    <View>
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date & Time</Text>
                      <View style={styles.dateTimeRow}>
                        <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border }]}>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}>Select Date</Text>
                          <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.timeBtn, { borderColor: colors.border }]}>
                          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}>Time</Text>
                          <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View>
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Duration</Text>
                      <View style={[styles.inputBox, { borderColor: colors.border }]}>
                        <TextInput placeholder="Number of hours" placeholderTextColor={colors.textSecondary} keyboardType="numeric" style={{ fontFamily: 'Poppins_400Regular', color: colors.text }} />
                      </View>
                    </View>

                    <View>
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Notes</Text>
                      <View style={[styles.inputBox, { borderColor: colors.border }]}>
                        <TextInput
                          placeholder="Any specific requirements?"
                          placeholderTextColor={colors.textSecondary}
                          multiline
                          style={{ fontFamily: 'Poppins_400Regular', color: colors.text, height: 60 }}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                <View style={[styles.rentalRow, { backgroundColor: colors.surface }]}>
                  <View style={styles.rentalIcon}>
                    <Ionicons name="document-text-outline" size={24} color="#3B82F6" />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>Rental Agreement</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>Review terms and conditions</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: colors.primary }}>View</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.paymentSummary, { backgroundColor: isDark ? colors.inputBackground : '#F3F4F6' }]}>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text, marginBottom: 12 }}>Payment Summary</Text>
                  <View style={styles.paymentRow}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Hourly Rate</Text>
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>₱500.00</Text>
                  </View>
                  <View style={[styles.paymentRow, { marginBottom: 16 }]}>
                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Service Fee</Text>
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>₱50.00</Text>
                  </View>
                  <View style={[styles.paymentTotal, { borderColor: colors.border }]}>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>Total</Text>
                    <Text style={{ fontFamily: 'Poppins_700Bold', color: colors.primary, fontSize: 18 }}>₱550.00</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#fff' }}>Confirm Booking</Text>
                </TouchableOpacity>
              </View>
            )}

            {activeTab === "Review" && (
              <View>
                <View style={styles.ratingOverview}>
                  <Text style={[styles.ratingBig, { color: colors.text }]}>4.8</Text>
                  <View style={styles.ratingStars}>
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={20} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Based on 42 reviews</Text>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: colors.surface }]}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewerInfo}>
                      <Image source={{ uri: 'https://i.pravatar.cc/100?img=5' }} style={styles.reviewerAvatar} />
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Sarah Geronimo</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>1 month ago</Text>
                  </View>
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>
                    Excellent studio! The acoustic treatment is superb and the equipment is professional-grade. Highly recommend for serious recording projects.
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
        message="Are you sure you want to confirm this booking?"
        buttonText="Confirm">
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
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 96,
    // Tailwind's bg-gradient-to-t from-black/80 to-transparent
    // This is a simplified representation, actual gradient might need a library or SVG
    backgroundColor: 'rgba(0,0,0,0.8)', // Simulating the bottom part of the gradient
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
  },
  heroLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  heroLocationText: {
    color: '#E5E7EB', // gray-200
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
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  sectionTitle: {
    fontSize: 18,
    marginBottom: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  galleryContainer: {
    paddingHorizontal: 24, // Compensate for parent's padding
    gap: 12,
    marginLeft: -24, // Pull to the left to align with screen edge
    marginRight: -24, // Pull to the right
  },
  galleryImage: {
    width: 192,
    height: 128,
    borderRadius: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  categoryTitle: {
    fontSize: 18,
    marginBottom: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  tagContainer: {
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
  formGap: {
    gap: 16,
  },
  inputLabel: {
    marginBottom: 8,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'Poppins_600SemiBold',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  rentalRow: {
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rentalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE', // blue-50
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentSummary: {
    padding: 20,
    borderRadius: 16,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentTotal: {
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
