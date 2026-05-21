import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import GroupLinkedPlaylistsSection from '../src/components/GroupLinkedPlaylistsSection';
import ProfileAvatar from '../src/components/ProfileAvatar';
import ReportModal from '../src/components/ReportModal';
import Skeleton from '../src/components/Skeleton';
import { useAuth } from '../src/context/AuthContext';
import { useListingDetailsQuery } from '../src/data/hooks';
import { useTheme } from '../src/context/ThemeContext';
import { usePageLoadLogger } from '../src/utils/loadTimeLogger';
import { getGroupMembersLabel, getGroupTypeLabel, isGroupLeaderMember } from '../src/utils/groupMembers';
import { fetchGroupLinkedPlaylists } from '../src/utils/groupPlaylists';
import {
    hasValidCoordinates,
    openNavigationDirections,
} from '../src/utils/navigation';

const { width: SCREEN_WIDTH, height } = Dimensions.get('window');
const IMG_HEIGHT = height * 0.5;

const getOwnerDisplayName = (group: any): string => {
  const candidates = [
    group?.owner_name,
    group?.owner_profile?.full_name,
    group?.owner?.full_name,
  ];

  const displayName = candidates.find(
    (name) => typeof name === 'string' && name.trim().length > 0,
  );

  return displayName ? displayName.trim() : 'Unknown User';
};

const getOwnerAvatarUri = (group: any): string | null => {
  const candidates = [
    group?.owner_avatar,
    group?.owner_profile?.avatar_url,
    group?.owner?.avatar_url,
  ];

  return (
    candidates.find((uri) => typeof uri === 'string' && uri.trim().length > 0)?.trim() ||
    null
  );
};

const getReviews = (group: any): any[] => (Array.isArray(group?.reviews) ? group.reviews : []);

const getNumberCandidate = (...candidates: unknown[]): number | null => {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;

    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const getRatingValue = (group: any): number => {
  const reviews = getReviews(group);
  const rating = getNumberCandidate(group?.rating, group?.computed_rating);

  if (rating !== null && (rating > 0 || reviews.length === 0)) {
    return rating;
  }

  const reviewRatings = reviews
    .map((review) => Number(review?.rating))
    .filter((value) => Number.isFinite(value));

  if (reviewRatings.length === 0) return rating || 0;

  const total = reviewRatings.reduce((sum, value) => sum + value, 0);
  return total / reviewRatings.length;
};

const getReviewCount = (group: any): number => {
  const reviews = getReviews(group);
  const reviewCount = getNumberCandidate(group?.review_count, group?.computed_review_count);

  return Math.max(0, Math.trunc(Math.max(reviewCount ?? 0, reviews.length)));
};

const getReviewLabel = (count: number): string => `${count} ${count === 1 ? 'review' : 'reviews'}`;

const getReviewContent = (review: any): string => {
  const candidates = [
    review?.content,
    review?.comment,
    review?.feedback,
    review?.body,
    review?.review_text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return 'No written review.';
};

const formatReviewDate = (rawDate: unknown): string => {
  if (typeof rawDate !== 'string' || rawDate.trim().length === 0) return '';

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return '';

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams();
  const { colors, isDark } = useTheme();
  const { userId, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const [groupState, setGroup] = useState<any>(null);
  const [groupPlaylists, setGroupPlaylists] = useState<any[]>([]);
  const [loadingGroupPlaylists, setLoadingGroupPlaylists] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCount, setFavoriteCount] = useState(0);
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

  const groupId = useMemo(() => {
    const routeId = Array.isArray(id) ? id[0] : id;
    return routeId || 'bd9552d7-b827-449e-8c43-2a4439c2c62c';
  }, [id]);
  const groupDetailsQuery = useListingDetailsQuery({
    id: groupId,
    type: 'group',
    userId,
  });

  const applyGroupDetails = useCallback((nextGroup: any) => {
    setGroup(nextGroup);
    setIsFavorited(Boolean(nextGroup?.is_favorited));
    setFavoriteCount(Number(nextGroup?.favorites_count || 0));
  }, []);

  useEffect(() => {
    if (groupDetailsQuery.data?.id === groupId) {
      applyGroupDetails(groupDetailsQuery.data);
    }
  }, [applyGroupDetails, groupDetailsQuery.data, groupId]);

  const queryGroup = groupDetailsQuery.data?.id === groupId ? groupDetailsQuery.data : null;
  const group = groupState?.id === groupId ? groupState : queryGroup;
  const loading = (groupDetailsQuery.isLoading || groupDetailsQuery.isFetching) && !group;

  usePageLoadLogger({
    counts: {
      playlists: groupPlaylists.length,
    },
    details: {
      groupId: groupId ? 'present' : 'missing',
      isFavorited,
    },
    loading: loading || groupDetailsQuery.isLoading || loadingGroupPlaylists,
    page: 'GroupDetails',
    queries: { groupDetails: groupDetailsQuery },
    ready: !loading && Boolean(group),
  });

  useEffect(() => {
    let isActive = true;

    if (!group?.id) {
      setGroupPlaylists([]);
      setLoadingGroupPlaylists(false);
      return () => {
        isActive = false;
      };
    }

    setLoadingGroupPlaylists(true);

    fetchGroupLinkedPlaylists(group.id)
      .then((playlistRows) => {
        if (!isActive) return;
        setGroupPlaylists(playlistRows);
      })
      .catch((playlistError) => {
        if (!isActive) return;
        setGroupPlaylists([]);
      })
      .finally(() => {
        if (!isActive) return;
        setLoadingGroupPlaylists(false);
      });

    return () => {
      isActive = false;
    };
  }, [group?.id]);

  const buildShareUrl = () => {
    if (!group?.id) {
      return ExpoLinking.createURL('/home');
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

  const handlePlaylistPress = (playlistId: string) => {
    if (!playlistId) return;

    router.push({
      pathname: '/playlist_details',
      params: { playlist_id: playlistId },
    });
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
    } catch {
      showAlert(
        'warning',
        'Navigation Unavailable',
        'This group does not have pinned coordinates yet.',
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.imageContainer, { backgroundColor: colors.border }]}>
            <Skeleton width="100%" height={IMG_HEIGHT} borderRadius={0} />

            <View style={[styles.headerActions, { top: insets.top + 10 }]}>
              <TouchableOpacity activeOpacity={1} onPress={() => router.back()} style={styles.roundBtn}>
                <Ionicons name="arrow-back" size={24} color="#000" />
              </TouchableOpacity>

              <View style={styles.rightActions}>
                {[1, 2].map((item) => (
                  <View key={`group-details-action-skeleton-${item}`} style={styles.roundBtn}>
                    <Skeleton width={20} height={20} borderRadius={10} />
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.contentBody, { backgroundColor: colors.background }]}>
            <View style={styles.titleSection}>
              <Skeleton width={SCREEN_WIDTH * 0.62} height={32} style={{ marginBottom: 12 }} />
              <Skeleton width={SCREEN_WIDTH * 0.45} height={16} style={{ marginBottom: 10 }} />
              <Skeleton width={SCREEN_WIDTH * 0.55} height={16} />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.hostSection}>
              <View style={{ flex: 1 }}>
                <Skeleton width={SCREEN_WIDTH * 0.52} height={18} style={{ marginBottom: 8 }} />
                <Skeleton width={SCREEN_WIDTH * 0.34} height={14} />
              </View>
              <Skeleton width={56} height={56} borderRadius={28} />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.section}>
              <Skeleton width={SCREEN_WIDTH * 0.48} height={22} />
              <Skeleton width="100%" height={16} />
              <Skeleton width="92%" height={16} />
              <Skeleton width="74%" height={16} />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <View style={styles.section}>
              <Skeleton width={SCREEN_WIDTH * 0.5} height={22} />
              {[1, 2].map((item) => (
                <View key={`group-details-feature-skeleton-${item}`} style={styles.featureItem}>
                  <Skeleton width={24} height={24} borderRadius={12} />
                  <Skeleton width={SCREEN_WIDTH * 0.5} height={16} />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!group) return null;

  const isOwner = !!userId && group?.owner_id === userId;
  const normalizedLinkedMembers = Array.isArray(group?.auxiliary?.group_members)
    ? group.auxiliary.group_members.map((row: any) => {
        const legacyMember = Array.isArray(group?.members)
          ? group.members.find((member: any) => member?.user_id === row?.user_id)
          : null;
        const isLeader = row?.role === 'owner' || row?.user_id === group?.owner_id;

        return {
          user_id: row?.user_id,
          name: row?.profiles?.full_name || legacyMember?.name || 'Member',
          avatar_url: row?.profiles?.avatar_url || legacyMember?.avatar_url || null,
          instrument: legacyMember?.instrument || (isLeader ? 'Leader' : row?.role || 'Member'),
          role: isLeader ? 'Leader' : 'Member',
        };
      })
    : [];
  const displayMembers =
    normalizedLinkedMembers.length > 0
      ? normalizedLinkedMembers.sort((a: any, b: any) => (a.role === 'Leader' ? -1 : 1) - (b.role === 'Leader' ? -1 : 1))
      : Array.isArray(group.members)
        ? group.members
        : [];
  const displayMemberCount = displayMembers.length || Number(group.member_count || group.members_count || 0) || 0;
  const reviews = getReviews(group);
  const ratingValue = getRatingValue(group);
  const reviewCount = getReviewCount(group);
  const reviewLabel = getReviewLabel(reviewCount);

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
                {ratingValue.toFixed(2)} - <Text style={{ textDecorationLine: 'underline' }}>{reviewLabel}</Text>
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
              <Text style={[styles.hostSub, { color: colors.textSecondary }]}>Managed by</Text>
              <Text style={[styles.hostedBy, { color: colors.text }]}>{getOwnerDisplayName(group)}</Text>
            </View>
            <ProfileAvatar
              uri={getOwnerAvatarUri(group)}
              style={[styles.hostAvatar, { backgroundColor: colors.border }]}
              backgroundColor={isDark ? '#374151' : '#E5E7EB'}
              iconColor={colors.textSecondary}
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
                  {getGroupTypeLabel(group.group_type)} ({displayMemberCount} Member{displayMemberCount === 1 ? '' : 's'})
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.section}>
            <GroupLinkedPlaylistsSection
              colors={colors}
              isDark={isDark}
              playlists={groupPlaylists}
              loading={loadingGroupPlaylists}
              onPlaylistPress={handlePlaylistPress}
              title="Featured Playlists"
              emptyMessage="This group has not linked any playlists yet."
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          {/* Group Members Section */}
          {displayMembers.length > 0 && (
            <>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{getGroupMembersLabel(group.group_type)}</Text>
                <View style={{ gap: 12 }}>
                  {displayMembers.map((member: any, index: number) => {
                    const isLeader = isGroupLeaderMember(member, group.owner_id);
                    const memberName = typeof member === 'string' ? member : member.name;
                    const memberInstrument = typeof member === 'string' ? 'Member' : member.instrument;
                    return (
                      <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <ProfileAvatar
                          uri={typeof member === 'string' ? null : member.avatar_url}
                          style={{ width: 44, height: 44, borderRadius: 22 }}
                          backgroundColor={isLeader ? colors.primary : (isDark ? '#374151' : '#E5E7EB')}
                          iconColor={isLeader ? '#FFF' : colors.textSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium', fontSize: 15 }}>{memberName}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="musical-note" size={12} color={colors.primary} />
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{memberInstrument}</Text>
                            {isLeader && <Text style={{ color: colors.primary, fontSize: 11, marginLeft: 4 }}>| Leader</Text>}
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
                {ratingValue.toFixed(2)} - {reviewLabel}
              </Text>
            </View>
            <View style={styles.reviewsScroll}>
              {reviews.length > 0 ? (
                reviews.map((review: any) => {
                  const reviewDate = formatReviewDate(review.created_at);

                  return (
                    <View
                      key={review.id || `${review.created_at}-${review.author_id || 'review'}`}
                      style={[styles.reviewCard, { borderColor: colors.border, width: '100%' }]}
                    >
                      <View style={styles.reviewUser}>
                        <ProfileAvatar
                          uri={review.author?.avatar_url || null}
                          style={styles.reviewAvatar}
                          backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                          iconColor={colors.textSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.reviewName, { color: colors.text }]}>
                            {review.author?.full_name || 'Anonymous'}
                          </Text>
                          {reviewDate ? (
                            <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                              {reviewDate}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={[styles.reviewBody, { color: colors.text }]}>{getReviewContent(review)}</Text>
                    </View>
                  );
                })
              ) : (
                <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>No reviews yet.</Text>
              )}
            </View>
          </View>

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
  scrollContent: {
    paddingBottom: 32,
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
  },
  hostSub: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 4,
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
    justifyContent: 'center',
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
