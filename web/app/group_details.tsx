import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
  Share,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Modal from '../src/components/modal';
import ReportModal from '../src/components/ReportModal';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { getGroupMembersLabel, getGroupTypeLabel, isGroupLeaderMember } from '../src/utils/groupMembers';
import {
    hasValidCoordinates,
    openNavigationDirections,
} from '../src/utils/navigation';

const { width, height } = Dimensions.get('window');
const IMG_HEIGHT = height * 0.5;
export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { userId, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: 'info',
    title: '',
    message: '',
  });

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      const finalId = groupId || 'bd9552d7-b827-449e-8c43-2a4439c2c62c';

      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: { action: 'fetch', type: 'group', id: finalId, userId }
      });

      if (error) throw error;
      setGroup(data);
      setIsFavorited(Boolean(data?.is_favorited));
      setFavoriteCount(Number(data?.favorites_count || 0));
    } catch (e) {
      console.log('Error fetching group:', e);
    } finally {
      setLoading(false);
    }
  };

  const buildShareUrl = () => {
    if (!group?.id) {
      return ExpoLinking.createURL('/feed');
    }

    return ExpoLinking.createURL('/group_details', {
      queryParams: { id: group.id },
    });
  };

  const handleShare = async () => {
    try {
      const shareUrl = buildShareUrl();
      await Share.share({
        message: `Check out ${group?.name || 'this group'} on MusikaLokal!\n${shareUrl}`,
        url: shareUrl,
      });
    } catch {
      // No-op if cancelled
    }
  };

  const toggleFavorite = async () => {
    if (!userId) {
      showAlert('warning', 'Login Required', 'Please sign in to bookmark this listing.');
      return;
    }

    if (!group?.id) {
      showAlert('error', 'Bookmark Unavailable', 'Missing group details.');
      return;
    }

    const previousState = isFavorited;
    const previousCount = favoriteCount;
    const optimisticState = !previousState;
    const optimisticCount = Math.max(0, previousCount + (optimisticState ? 1 : -1));

    setIsFavorited(optimisticState);
    setFavoriteCount(optimisticCount);

    try {
      const { data, error } = await supabase.functions.invoke('manage-details', {
        body: {
          action: 'toggle_favorite',
          type: 'group',
          id: group.id,
          userId,
        },
      });

      if (error) throw error;

      if (typeof data?.is_favorited === 'boolean') {
        setIsFavorited(data.is_favorited);
      }
      if (typeof data?.favorites_count === 'number') {
        setFavoriteCount(Math.max(0, data.favorites_count));
      }
    } catch (e: any) {
      setIsFavorited(previousState);
      setFavoriteCount(previousCount);
      showAlert('error', 'Bookmark Failed', e?.message || 'Unable to update bookmark right now.');
    }
  };

  const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const submitGroupReport = async (reason: string, details?: string) => {
    if (!userId) {
      showAlert('warning', 'Login Required', 'You need to be logged in to submit a report.');
      return;
    }
    if (!group?.id) {
      showAlert('error', 'Unable to Report', 'Missing group details.');
      return;
    }

    const { error } = await supabase.functions.invoke('manage-details', {
      body: {
        action: 'report',
        type: 'group',
        id: group.id,
        userId,
        reason,
        details: details || null,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to submit report.');
    }
  };

  const openReportModal = () => {
    if (!group?.id) {
      showAlert('error', 'Unable to Report', 'Missing group details.');
      return;
    }
    setShowReportModal(true);
  };

  const handleNavigate = async () => {
    try {
      await openNavigationDirections({
        latitude: group?.latitude,
        longitude: group?.longitude,
        label: group?.location || group?.name || 'Group location',
      });
    } catch (error) {
      console.log('[group_details] Navigation error:', error);
      showAlert(
        'warning',
        'Navigation Unavailable',
        'This group does not have pinned coordinates yet.',
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.emptyState, { backgroundColor: colors.background }]}>
        <Ionicons name="musical-notes-outline" size={42} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Group unavailable</Text>
        <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>
          We could not load this group right now.
        </Text>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => router.replace('/feed')}
          style={[styles.emptyButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.emptyButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = !!userId && group?.owner_id === userId;

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
            source={{ uri: (group.images && group.images[0]) || group.image || null }}
            style={[styles.image, { backgroundColor: colors.border }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.8)']}
            style={styles.gradient}
          />

          {/* Header Actions */}
          <View style={[styles.headerActions, { top: insets.top + 10 }]}>
            <TouchableOpacity activeOpacity={1}
              onPress={() => router.back()}
              style={styles.roundBtn}
            >
              <Ionicons name="arrow-back" size={24} color="#000" />
            </TouchableOpacity>

            <View style={styles.rightActions}>
              <TouchableOpacity activeOpacity={1} style={styles.roundBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={24} color="#000" />
              </TouchableOpacity>
              {!isOwner && userId && !isGuest ? (
              <TouchableOpacity activeOpacity={1}
                  testID="group-report-button"
                  accessibilityLabel="group-report-button"
                  onPress={openReportModal}
                  style={styles.roundBtn}
                >
                  <Ionicons name="flag-outline" size={24} color="#EF4444" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity activeOpacity={1}
                onPress={toggleFavorite}
                style={styles.roundBtn}
              >
                <Ionicons name={isFavorited ? "bookmark" : "bookmark-outline"} size={24} color={isFavorited ? colors.primary : "#000"} />
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
            <Text style={[styles.locationText, { color: colors.textSecondary, marginTop: 4 }]}>
              {favoriteCount} bookmarked
            </Text>
            {hasValidCoordinates(group?.latitude, group?.longitude) && (
              <TouchableOpacity activeOpacity={1}
                style={[styles.navigatePill, { backgroundColor: colors.primary }]}
                onPress={handleNavigate}
              >
                <Ionicons name="navigate-outline" size={15} color="#FFF" />
                <Text style={styles.navigatePillText}>Navigate</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Host Section */}
          <View style={styles.hostSection}>
            <View style={styles.hostInfo}>
              <Text style={[styles.hostedBy, { color: colors.text }]}>Hosted by {group.owner_name || 'Martin'}</Text>
              <Text style={[styles.hostSub, { color: colors.textSecondary }]}>Joined in 2021</Text>
            </View>
            <Image
              source={{ uri: group.owner_avatar || null }}
              style={[styles.hostAvatar, { backgroundColor: colors.border }]}
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
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                  {getGroupTypeLabel(group.group_type)} ({group.members?.length || '2'} Members)
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Group Members Section */}
          {group.members && group.members.length > 0 && (
            <>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{getGroupMembersLabel(group.group_type)}</Text>
                <View style={{ gap: 12 }}>
                  {group.members.map((member: any, index: number) => {
                    const isLeader = isGroupLeaderMember(member, group.owner_id);
                    const memberName = typeof member === 'string' ? member : member.name;
                    const memberInstrument = typeof member === 'string' ? member : member.instrument;
                    return (
                      <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ 
                          width: 44, height: 44, borderRadius: 22, 
                          backgroundColor: isLeader ? colors.primary : '#E0E7FF',
                          alignItems: 'center', justifyContent: 'center'
                        }}>
                          {member.avatar_url ? (
                            <Image source={{ uri: member.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                          ) : (
                            <Text style={{ color: isLeader ? '#fff' : '#4F46E5', fontWeight: 'bold', fontSize: 16 }}>{memberName?.charAt(0)}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium', fontSize: 15 }}>{memberName}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="musical-note" size={12} color={colors.primary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{memberInstrument}</Text>
                            {isLeader && <Text style={{ color: colors.primary, fontSize: 11, marginLeft: 4 }}>• Leader</Text>}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </>
          )}

          {/* Reviews Section */}
          <View style={styles.section}>
            <View style={styles.reviewHeader}>
              <Ionicons name="star" size={20} color={colors.text} />
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>
                {group.rating?.toFixed(2) || '0.0'} · {group.review_count || 0} reviews
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>
              Reviews are not available in this preview.
            </Text>
          </View>

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
            <TouchableOpacity activeOpacity={1}
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
          <CustomAlert
            visible={alertVisible}
            type={alertConfig.type}
            title={alertConfig.title}
            message={alertConfig.message}
            buttons={alertConfig.buttons}
            onClose={() => setAlertVisible(false)}
          />
          <ReportModal
            visible={showReportModal}
            onClose={() => setShowReportModal(false)}
            onSubmit={submitGroupReport}
            targetName={group?.name || 'this group'}
            title="Report Group"
            reportType="group"
          />
        </View>
      </ScrollView>
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
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_600SemiBold',
    marginTop: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
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
  navigatePill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  navigatePillText: {
    color: '#FFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
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
