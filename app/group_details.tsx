import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';

const { width, height } = Dimensions.get('window');
const IMG_HEIGHT = height * 0.5;

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: { action: 'fetch', type: 'group', id: id || 'bd9552d7-b827-449e-8c43-2a4439c2c62c', userId }
      });

      if (error) throw error;
      setGroup(data);
      setIsFavorited(data.is_favorited);
    } catch (e) {
      console.log('Error fetching group:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = () => setIsFavorited(!isFavorited);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!group) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Immersive Hero Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: (group.images && group.images[0]) || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&fit=crop' }}
            style={styles.image}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gradient}
          />

          {/* Header Actions */}
          <View style={[styles.headerActions, { top: insets.top + 10 }]}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.roundBtn}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>

            <View style={styles.rightActions}>
              <TouchableOpacity style={styles.roundBtn}>
                <Ionicons name="share-outline" size={24} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleFavorite}
                style={styles.roundBtn}
              >
                <Ionicons name={isFavorited ? "heart" : "heart-outline"} size={24} color={isFavorited ? "#EF4444" : "#000"} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Content Body */}
        <View style={[styles.contentBody, { backgroundColor: colors.background }]}>
          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={[styles.title, { color: colors.text }]}>{group.name}</Text>
            <View style={styles.ratingLocationRow}>
              <Ionicons name="star" size={16} color={colors.text} />
              <Text style={[styles.ratingText, { color: colors.text }]}>
                {group.rating?.toFixed(2) || '4.95'} · <Text style={{ textDecorationLine: 'underline' }}>{group.review_count || 12} reviews</Text>
              </Text>
            </View>
            <Text style={[styles.locationText, { color: colors.textSecondary }]}>
              {group.location || 'Manila, Philippines'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Host Section */}
          <View style={styles.hostSection}>
            <View style={styles.hostInfo}>
              <Text style={[styles.hostedBy, { color: colors.text }]}>Hosted by {group.owner_name || 'Martin'}</Text>
              <Text style={[styles.hostSub, { color: colors.textSecondary }]}>Joined in 2021</Text>
            </View>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop' }}
              style={styles.hostAvatar}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Description */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>About this artist</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {group.description || 'No description provided. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Features / Amenities */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>What this artist offers</Text>
            <View style={styles.featuresGrid}>
              <View style={styles.featureItem}>
                <Ionicons name="musical-notes-outline" size={24} color={colors.text} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{group.genre || 'Multi-genre'}</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="people-outline" size={24} color={colors.text} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>{group.members?.length || '4'} Members</Text>
              </View>
              {/* Static fillers for demo */}
              <View style={styles.featureItem}>
                <Ionicons name="mic-outline" size={24} color={colors.text} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>Full PA System</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="car-outline" size={24} color={colors.text} />
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>Own Transport</Text>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Reviews Preview (Static for now) */}
          <View style={styles.section}>
            <View style={styles.reviewHeader}>
              <Ionicons name="star" size={20} color={colors.text} />
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                {group.rating?.toFixed(2) || '4.95'} · {group.review_count || 12} reviews
              </Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reviewsScroll}>
              {[1, 2].map((i) => (
                <View key={i} style={[styles.reviewCard, { borderColor: colors.border }]}>
                  <View style={styles.reviewUser}>
                    <Image source={{ uri: `https://i.pravatar.cc/100?img=${i + 5}` }} style={styles.reviewAvatar} />
                    <View>
                      <Text style={[styles.reviewName, { color: colors.text }]}>Jane Doe</Text>
                      <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>Oct 2025</Text>
                    </View>
                  </View>
                  <Text style={[styles.reviewBody, { color: colors.text }]} numberOfLines={3}>
                    Absolutely amazing performance! The crowd loved them and they were super professional to work with.
                  </Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={[styles.showAllBtn, { borderColor: colors.text }]}>
              <Text style={[styles.showAllText, { color: colors.text }]}>Show all reviews</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.priceContainer}>
          <Text style={[styles.priceText, { color: colors.text }]}>
            ₱{group.rate || '1,500'} <Text style={{ fontSize: 14, fontWeight: '400', color: colors.textSecondary }}>night</Text>
          </Text>
          <Text style={{ fontSize: 12, textDecorationLine: 'underline', color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>
            Oct 25 - 30
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.bookBtn, { backgroundColor: colors.primary }]}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.bookBtnText}>Reserve</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Confirm Booking"
        message="This will send a booking request to the artist."
        buttonText="Send Request"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 120, // Space for bottom bar
  },
  imageContainer: {
    height: IMG_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  rightActions: {
    flexDirection: 'row',
    gap: 12,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  contentBody: {
    flex: 1,
    marginTop: -32, // Overlap image
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  titleSection: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 8,
  },
  ratingLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ratingText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
  },
  locationText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 24,
    opacity: 0.5,
  },
  hostSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hostInfo: {
    flex: 1,
  },
  hostedBy: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  hostSub: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  hostAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  section: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_600SemiBold',
  },
  description: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 24,
  },
  featuresGrid: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 15,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reviewsScroll: {
    gap: 16,
    paddingRight: 24,
  },
  reviewCard: {
    width: 280,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  reviewUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  reviewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  reviewName: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  reviewDate: {
    fontSize: 12,
  },
  reviewBody: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  showAllBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  showAllText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 15,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    justifyContent: 'center',
  },
  priceText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 18,
  },
  bookBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookBtnText: {
    color: '#FFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 16,
  },
});
