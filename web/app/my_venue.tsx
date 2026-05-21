import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal, { normalizeVisibleInput } from '../src/components/modal';
import MusicianWorkspaceTabs from '../src/components/MusicianWorkspaceTabs';
import Navbar from '../src/components/navbar';
import Skeleton from '../src/components/Skeleton';
import { useAuth, useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { formatDashedNumericDate } from '../src/utils/friendlyDateTime';
import { StaffAssignment, fetchActiveStaffAssignment, getStaffPermissions } from '../src/utils/staffAccess';

const DEFAULT_GIG_IMAGE = 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop';
const JOINED_GIG_APPLICATION_STATUSES = ['accepted', 'approved', 'completed'];

const normalizeStatus = (status: unknown) => String(status || '').trim().toLowerCase();

const isJoinedGigApplicationStatus = (status: unknown) =>
    JOINED_GIG_APPLICATION_STATUSES.includes(normalizeStatus(status));

const collectJoinedGigIdsFromBookingsPayload = (payload: any) => {
    const buckets = payload?.categorized || payload || {};
    const rows = ['Upcoming', 'Ongoing', 'Review']
        .flatMap((key) => Array.isArray(buckets?.[key]) ? buckets[key] : []);

    return Array.from(
        new Set(
            rows
                .filter((item: any) => item?.type_id === 'gig_application' && isJoinedGigApplicationStatus(item?.raw_status))
                .map((item: any) => item?.gig_id)
                .filter((value: any): value is string => typeof value === 'string' && value.length > 0),
        ),
    );
};

const looksLikeDisplayImage = (uri: string) => {
    if (!uri) return false;

    const trimmed = uri.trim();
    const lowered = trimmed.toLowerCase();
    if (!lowered) return false;

    if (lowered.startsWith('data:image/')) return true;

    if (
       lowered.includes('/documents/') ||
        lowered.includes('/contracts/') ||
        lowered.includes('business_permit') ||
        lowered.includes('application/pdf')
    ) {
        return false;
    }

    if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?|$)/i.test(trimmed)) return true;
    if (lowered.includes('/image') || lowered.includes('/images/')) return true;
    return lowered.startsWith('http');
};

const resolveGigImage = (gig: any) => {
    const imageList = Array.isArray(gig?.images) ? gig.images.filter((item: any) => typeof item === 'string') : [];
    const best = imageList.find((img: string) => looksLikeDisplayImage(img));
    return best || imageList[0] || DEFAULT_GIG_IMAGE;
};

const normalizePermitStatus = (permitStatus: string | null | undefined) => {
    const normalizedPermitStatus = String(permitStatus || '').trim().toLowerCase();
    if (!normalizedPermitStatus) return 'pending_review';
    if (['approved', 'approved_by_admin', 'verified'].includes(normalizedPermitStatus)) return 'approved';
    if (['pending', 'pending_review', 'in_review', 'under_review'].includes(normalizedPermitStatus)) return 'pending_review';
    if (['resubmitted', 'resubmit', 'reapplied'].includes(normalizedPermitStatus)) return 'resubmitted';
    if (['rejected', 'declined'].includes(normalizedPermitStatus)) return 'rejected';
    return normalizedPermitStatus;
};

export default function MyVenueScreen() {
    const { colors, isDark } = useTheme();
    const { width } = useWindowDimensions();
    const isWebDesktop = Platform.OS === 'web' && width >= 768;
    const pageBackground = isWebDesktop
        ? isDark
            ? '#0A1224'
            : '#E9EEF8'
        : colors.background;
    const pageCardBackground = isWebDesktop
        ? isDark
            ? '#0F172A'
            : '#FFFFFF'
        : colors.surface;
    const borderSoft = isWebDesktop
        ? isDark
            ? '#1E2C48'
            : '#D8E3F2'
        : colors.border;
    const { isAuthenticated, userId } = useRequireAuth();
    const { userRole } = useAuth();
    const isMusicianView = userRole === 'musician';
    const params = useLocalSearchParams<{ refresh?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState('');
    const [cancellationReason, setCancellationReason] = useState('');
    const [gigs, setGigs] = useState<any[]>([]);
    const [staffAssignment, setStaffAssignment] = useState<StaffAssignment | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
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

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const fetchGigs = useCallback(async () => {
        if (!userId) return;
        try {
            let baseGigs: any[] = [];
            const activeStaffAssignment = userRole === 'staff'
                ? await fetchActiveStaffAssignment(supabase, userId)
                : null;
            setStaffAssignment(activeStaffAssignment);

            if (userRole === 'staff' && (!activeStaffAssignment || activeStaffAssignment.entity_type !== 'venue' || !activeStaffAssignment.gig_id)) {
                setGigs([]);
                return;
            }

            if (isMusicianView) {
                const { data: bookingPayload, error: bookingPayloadError } = await supabase.functions.invoke('manage-bookings', {
                    body: { action: 'fetch', userId },
                });

                if (bookingPayloadError) {
                    console.log('Error fetching joined gig applications from manage-bookings:', bookingPayloadError);
                }

                let joinedGigIds = bookingPayloadError ? [] : collectJoinedGigIdsFromBookingsPayload(bookingPayload);

                const [
                    { data: groupMembershipRows, error: membershipError },
                    { data: ownedGroupRows, error: ownedGroupsError },
                ] = await Promise.all([
                    supabase
                        .from('group_members')
                        .select('group_id')
                        .eq('user_id', userId),
                    supabase
                        .from('groups')
                        .select('id')
                        .eq('owner_id', userId),
                ]);

                if (membershipError) {
                    console.log('Error fetching musician group memberships:', membershipError);
                }

                if (ownedGroupsError) {
                    console.log('Error fetching musician owned groups:', ownedGroupsError);
                }

                const joinedGroupIds = Array.from(
                    new Set(
                        [
                            ...(groupMembershipRows || []).map((row: any) => row?.group_id),
                            ...(ownedGroupRows || []).map((row: any) => row?.id),
                        ].filter((value: any): value is string => typeof value === 'string' && value.length > 0),
                    ),
                );

                const [soloAppsResult, groupAppsResult] = await Promise.all([
                    supabase
                        .from('gig_applications')
                        .select('gig_id')
                        .eq('applicant_id', userId)
                        .is('group_id', null)
                        .in('status', JOINED_GIG_APPLICATION_STATUSES),
                    joinedGroupIds.length > 0
                        ? supabase
                            .from('gig_applications')
                            .select('gig_id')
                            .in('group_id', joinedGroupIds)
                            .in('status', JOINED_GIG_APPLICATION_STATUSES)
                        : Promise.resolve({ data: [] as any[], error: null }),
                ]);

                if (soloAppsResult.error) throw soloAppsResult.error;
                if (groupAppsResult.error) throw groupAppsResult.error;

                joinedGigIds = Array.from(
                    new Set(
                        [
                            ...joinedGigIds,
                            ...(soloAppsResult.data || []).map((row: any) => row?.gig_id),
                            ...(groupAppsResult.data || []).map((row: any) => row?.gig_id),
                        ].filter((value: any): value is string => typeof value === 'string' && value.length > 0),
                    ),
                );

                if (joinedGigIds.length === 0) {
                    setGigs([]);
                    return;
                }

                const { data: joinedGigs, error: joinedGigsError } = await supabase
                    .from('gigs')
                    .select('id, organizer_id, name, location, budget, description, event_date, status, created_at, permit_status, permit_rejection_reason, permit_reviewed_at')
                    .in('id', joinedGigIds)
                    .order('created_at', { ascending: false });

                if (joinedGigsError) throw joinedGigsError;
                baseGigs = joinedGigs || [];
            } else {
                let gigsQuery = supabase
                    .from('gigs')
                    .select('id, organizer_id, name, location, budget, description, event_date, status, created_at, permit_status, permit_rejection_reason, permit_reviewed_at')
                    .order('created_at', { ascending: false });

                gigsQuery = activeStaffAssignment?.entity_type === 'venue' && activeStaffAssignment.gig_id
                    ? gigsQuery.eq('id', activeStaffAssignment.gig_id)
                    : gigsQuery.eq('organizer_id', userId);

                const { data, error: baseError } = await gigsQuery;

                if (baseError) throw baseError;
                baseGigs = data || [];
            }

            const gigIds = (baseGigs || []).map((gig: any) => gig.id);

            if (gigIds.length === 0) {
                setGigs([]);
                return;
            }

            const [
                { data: requirementRows, error: requirementsError },
                { data: mediaRows, error: mediaError },
                { data: reviewRows, error: reviewsError },
            ] = await Promise.all([
                supabase
                    .from('gig_requirements')
                    .select('gig_id, requirement_key, requirement_value')
                    .in('gig_id', gigIds),
                supabase
                    .from('gig_media')
                    .select('gig_id, media_type, media_url, sort_order, created_at')
                    .in('gig_id', gigIds)
                    .eq('media_type', 'image')
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true }),
                supabase
                    .from('reviews')
                    .select('gig_id, rating')
                    .in('gig_id', gigIds),
            ]);

            if (requirementsError) throw requirementsError;
            if (mediaError) throw mediaError;
            if (reviewsError) throw reviewsError;

            const requirementsByGigId = (requirementRows || []).reduce((acc: Record<string, Record<string, any>>, row: any) => {
                if (!row?.gig_id || !row?.requirement_key) return acc;
                if (!acc[row.gig_id]) acc[row.gig_id] = {};
                acc[row.gig_id][row.requirement_key] = row.requirement_value;
                return acc;
            }, {});

            const imagesByGigId = (mediaRows || []).reduce((acc: Record<string, string[]>, row: any) => {
                if (!row?.gig_id || !row?.media_url) return acc;
                if (!acc[row.gig_id]) acc[row.gig_id] = [];
                acc[row.gig_id].push(row.media_url);
                return acc;
            }, {});

            const reviewsByGigId = (reviewRows || []).reduce((acc: Record<string, { sum: number; count: number }>, row: any) => {
                if (!row?.gig_id) return acc;
                if (!acc[row.gig_id]) acc[row.gig_id] = { sum: 0, count: 0 };
                const rating = Number(row.rating || 0);
                acc[row.gig_id].sum += rating;
                acc[row.gig_id].count += 1;
                return acc;
            }, {});

            setGigs((baseGigs || []).map((gig: any) => {
                const reviewStats = reviewsByGigId[gig.id] || { sum: 0, count: 0 };
                const reviewCount = reviewStats.count;
                const rating = reviewCount > 0 ? reviewStats.sum / reviewCount : 0;
                const normalizedPermitStatus = normalizePermitStatus(gig.permit_status);

                return {
                    ...gig,
                    requirements: requirementsByGigId[gig.id] || {},
                    images: imagesByGigId[gig.id] || [],
                    rating,
                    review_count: reviewCount,
                    permit_status: normalizedPermitStatus,
                    permit_rejection_reason: gig.permit_rejection_reason || null,
                    permit_reviewed_at: gig.permit_reviewed_at || null,
                    is_owner: gig.organizer_id === userId || activeStaffAssignment?.gig_id === gig.id,
                };
            }));
        } catch (e) {
            console.log('Error fetching gigs:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isMusicianView, userId, userRole]);

    useFocusEffect(
        useCallback(() => {
            if (!isAuthenticated || !userId) return;

            fetchGigs();
            const refreshInterval = setInterval(() => {
                fetchGigs();
            }, 30000);

            return () => {
                clearInterval(refreshInterval);
            };
        }, [isAuthenticated, userId, refreshKey, fetchGigs])
    );

    useEffect(() => {
        if (!isAuthenticated || !userId || isMusicianView) return;

        const realtimeFilter = staffAssignment?.entity_type === 'venue' && staffAssignment.gig_id
            ? `id=eq.${staffAssignment.gig_id}`
            : `organizer_id=eq.${userId}`;

        const channel = supabase
            .channel(`my-venue-listings:${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'gigs', filter: realtimeFilter },
                () => {
                    fetchGigs();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, userId, fetchGigs, isMusicianView, staffAssignment]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchGigs();
    };

    const closeDeleteModal = () => {
        setModalVisible(false);
        setSelectedId(null);
        setSelectedName('');
        setCancellationReason('');
    };

    const confirmDelete = (id: string, name: string) => {
        setSelectedId(id);
        setSelectedName(name || '');
        setCancellationReason('');
        setModalVisible(true);
    };

    const handleDelete = async () => {
        if (!selectedId || !userId || deleting) return;
        if (userRole === 'staff') {
            showAlert('warning', 'Action blocked', 'Staff accounts cannot delete gigs.');
            return;
        }
        const reason = normalizeVisibleInput(cancellationReason);
        if (!reason) {
            showAlert('warning', 'Cancellation Reason Required', 'Please provide a cancellation reason before deleting this gig.');
            return;
        }
        setDeleting(true);
        try {
            const { data, error } = await supabase.rpc('delete_gig_safely', {
                p_gig_id: selectedId,
                p_reason: reason,
            });

            if (error) throw error;

            const result: any = data;
            if (!result?.success) {
                if (result?.code === 'CANCELLATION_REASON_REQUIRED') {
                    showAlert('warning', 'Cancellation Reason Required', result?.message || 'Please provide a cancellation reason.');
                    return;
                }

                if (result?.code === 'ACTIVE_ACCEPTED_APPLICATIONS_EXIST') {
                    showAlert(
                        'warning',
                        'Delete Blocked',
                        `This gig still has ${result.accepted_application_count || 0} accepted/approved application(s)${(result.pending_application_count || 0) > 0 ? ` and ${result.pending_application_count} pending application(s)` : ''}. Resolve accepted or approved applicants first before deleting.`
                    );
                    closeDeleteModal();
                    return;
                }

                if (result?.code === 'GIG_NOT_FOUND') {
                    showAlert('warning', 'Not Found', 'Gig was not found. It may have already been removed.');
                    setGigs(prev => prev.filter(g => g.id !== selectedId));
                    closeDeleteModal();
                    return;
                }

                throw new Error(result?.message || 'Delete failed');
            }

            setGigs(prev => prev.filter(g => g.id !== selectedId));
            closeDeleteModal();
            const cancelledApplications = Number(result?.cancelled_applications || 0);
            const successMessage = cancelledApplications > 0
                ? `Gig deleted successfully. ${cancelledApplications} application(s) were cancelled and notified.`
                : 'Gig deleted successfully.';
            showAlert('success', 'Gig Deleted', successMessage);
        } catch (e) {
            console.log('Error deleting gig:', e);
            showAlert('error', 'Error', 'Failed to delete gig');
        } finally {
            setDeleting(false);
        }
    };

    const handleOpenGigChat = (gig: any) => {
        if (!gig?.organizer_id) {
            showAlert('warning', 'Chat Unavailable', 'Gig organizer is unavailable for this gig.');
            return;
        }

        router.push({
            pathname: '/chat',
            params: {
                recipientId: gig.organizer_id,
                gigId: gig.id,
            },
        });
    };

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
                <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
                    <Header title="My Gig" />

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.scrollContentWeb]}
                        style={styles.flex1}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    >
                        {isMusicianView && (
                            <MusicianWorkspaceTabs activeKey="venue" />
                        )}

                        {loading ? (
                            <View style={[styles.gridWrap, isWebDesktop && styles.gridWrapWeb]}>
                                {[0, 1].map((index) => (
                                    <View key={`venue-skeleton-${index}`} style={[styles.gridItem, isWebDesktop && styles.gridItemWeb]}>
                                        <View style={[styles.cardContainer, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
                                            <Skeleton width="100%" height={isWebDesktop ? 186 : 170} borderRadius={0} />
                                            <View style={styles.cardContent}>
                                                <Skeleton width="56%" height={16} />
                                                <Skeleton width="100%" height={12} style={{ marginTop: 8 }} />
                                                <Skeleton width="78%" height={12} style={{ marginTop: 6 }} />
                                                <View style={styles.skeletonActionRow}>
                                                    <Skeleton width={92} height={32} borderRadius={10} />
                                                    <Skeleton width={32} height={32} borderRadius={10} />
                                                </View>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : gigs.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} />
                                <Text style={[styles.emptyTitle, { color: colors.text }]}>{isMusicianView ? 'No joined gigs yet' : 'No gigs yet'}</Text>
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    {isMusicianView ? 'Accepted gigs will appear here.' : 'Create your first gig to manage applications and event details.'}
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.gridWrap, isWebDesktop && styles.gridWrapWeb]}>
                                {gigs.map((gig) => {
                                    const staffPermissions = userRole === 'staff'
                                        ? getStaffPermissions(staffAssignment?.access_level)
                                        : null;
                                    const canShowActions = !staffPermissions?.canViewOnly;
                                    const canManageBookings = !staffPermissions || staffPermissions.canManageBookings;
                                    const canEditVenue = !staffPermissions || staffPermissions.canEditListing;
                                    const normalizedPermitStatus = normalizePermitStatus(gig.permit_status);
                                    const isRejected = normalizedPermitStatus === 'rejected';
                                    const isApproved = normalizedPermitStatus === 'approved';
                                    const isResubmitted = normalizedPermitStatus === 'resubmitted';
                                    const canManageGig = (!isMusicianView || gig.is_owner === true) && canManageBookings;

                                    const permitStatusLabel = isRejected
                                        ? 'Rejected'
                                        : isResubmitted
                                            ? 'Resubmitted'
                                            : 'Pending Review';

                                    const permitBadgeBackground = isRejected
                                        ? (isDark ? 'rgba(220,38,38,0.22)' : '#FEE2E2')
                                        : isResubmitted
                                            ? (isDark ? 'rgba(37,99,235,0.22)' : '#DBEAFE')
                                            : (isDark ? 'rgba(245,158,11,0.22)' : '#FEF3C7');

                                    const permitBadgeColor = isRejected
                                        ? '#DC2626'
                                        : isResubmitted
                                            ? '#2563EB'
                                            : '#B45309';

                                    return (
                                    <View key={gig.id} style={[styles.gridItem, isWebDesktop && styles.gridItemWeb]}>
                                        <View style={[styles.cardContainer, {
                                            backgroundColor: pageCardBackground,
                                            borderColor: borderSoft,
                                        }, isWebDesktop && styles.webSectionCard, {
                                            shadowColor: isWebDesktop ? '#0F172A' : colors.primary,
                                        }]}>
                                            <View style={[styles.imageWrapper, isWebDesktop && styles.imageWrapperWeb]}>
                                                <CachedImage
                                                    uri={resolveGigImage(gig)}
                                                    style={styles.cardImage}
                                                    width={800}
                                                    height={384}
                                                    quality={72}
                                                    cacheVersion={gig.updated_at || gig.created_at || gig.id}
                                                    contentFit="cover"
                                                />
                                                <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)' }]}>
                                                    <Text style={[styles.statusText, { color: colors.primary }]}>{gig.status || 'Active'}</Text>
                                                </View>
                                                <View style={styles.budgetBadge}>
                                                    <Text style={styles.budgetText}>₱{gig.budget?.toLocaleString()}</Text>
                                                </View>
                                            </View>

                                            <View style={styles.cardContent}>
                                                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{gig.name}</Text>
                                                <Text style={[styles.cardSubTitle, { color: colors.primary }]} numberOfLines={1}>
                                                    {gig.event_date ? formatDashedNumericDate(gig.event_date) : 'Date TBA'}
                                                    {gig.requirements?.event_start_time && gig.requirements?.event_end_time ? ` • ${gig.requirements.event_start_time} - ${gig.requirements.event_end_time}` : ''} • {gig.location}
                                                </Text>

                                                <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                                    {gig.description}
                                                </Text>

                                                {!isApproved && (
                                                    <View style={[styles.permitStatusChip, { backgroundColor: permitBadgeBackground }]}>
                                                        <Text style={[styles.permitStatusChipText, { color: permitBadgeColor }]}>Permit: {permitStatusLabel}</Text>
                                                    </View>
                                                )}

                                                {isRejected && !!gig.permit_rejection_reason && (
                                                    <Text style={styles.rejectionReasonText} numberOfLines={3}>
                                                        Rejection reason: {gig.permit_rejection_reason}
                                                    </Text>
                                                )}

                                                {(normalizedPermitStatus === 'pending_review' || normalizedPermitStatus === 'resubmitted') && (
                                                    <Text style={[styles.permitHintText, { color: colors.textSecondary }]}> 
                                                        Hidden from Home right now.
                                                    </Text>
                                                )}

                                                {canShowActions ? (
                                                <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                                    <View style={styles.actionLeft}>
                                                        <TouchableOpacity activeOpacity={1}
                                                            onPress={() => {
                                                                if (canManageGig) {
                                                                    router.push({ pathname: '/manage_gig', params: { id: gig.id } });
                                                                    return;
                                                                }

                                                                router.push({ pathname: '/manage_gig', params: { id: gig.id } });
                                                            }}
                                                            style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                                                        >
                                                            <Ionicons name={canManageGig ? 'settings-outline' : 'eye-outline'} size={16} color="#FFF" />
                                                            <Text style={styles.manageBtnText}>{canManageGig ? 'Manage' : 'View'}</Text>
                                                        </TouchableOpacity>

                                                        {canEditVenue ? (
                                                            <TouchableOpacity activeOpacity={1}
                                                                onPress={() => router.push({ pathname: '/edit_gig', params: { id: gig.id } })}
                                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                                            >
                                                                <Ionicons name="pencil-outline" size={18} color={colors.text} style={styles.editBtnIcon} />
                                                            </TouchableOpacity>
                                                        ) : !staffPermissions ? (
                                                            <TouchableOpacity activeOpacity={1}
                                                                onPress={() => handleOpenGigChat(gig)}
                                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                                            >
                                                                <Ionicons name="chatbubble-outline" size={18} color={colors.text} style={styles.editBtnIcon} />
                                                            </TouchableOpacity>
                                                        ) : null}
                                                    </View>

                                                    {canManageGig && !staffPermissions ? (
                                                        <TouchableOpacity activeOpacity={1}
                                                            onPress={() => confirmDelete(gig.id, gig.name)}
                                                            style={styles.deleteBtn}
                                                        >
                                                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    ) : null}
                                                </View>
                                                ) : null}
                                            </View>
                                        </View>
                                    </View>
                                    );
                                })}
                            </View>
                        )}

                    </ScrollView>

                    <Navbar />
                </View>
            </View>
            <Modal
                visible={modalVisible}
                onClose={closeDeleteModal}
                title="Delete Gig"
                message={deleting ? 'Deleting gig...' : `Provide a cancellation reason for "${selectedName}". All accepted and pending applicants will be cancelled and notified before this gig is archived.`}
                buttonText={deleting ? 'Deleting...' : 'Delete'}
                onConfirm={handleDelete}
                danger
                showInput
                inputMultiline
                inputPlaceholder="Cancellation reason"
                inputValue={cancellationReason}
                onInputChange={setCancellationReason}
                confirmDisabled={deleting}
            />
            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    pageFrame: {
        flex: 1,
        width: '100%',
    },
    pageFrameWeb: {
        maxWidth: 1240,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 180,
        paddingTop: 12,
    },
    scrollContentWeb: {
        maxWidth: 1120,
        width: '100%',
        alignSelf: 'center',
        paddingTop: 10,
    },
    gridWrap: {
        width: '100%',
    },
    gridWrapWeb: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    gridItem: {
        width: '100%',
        marginBottom: 14,
    },
    gridItemWeb: {
        width: '49%',
        marginBottom: 18,
    },
    skeletonActionRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyTitle: {
        marginTop: 16,
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
    },
    emptyText: {
        marginTop: 8,
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        textAlign: 'center',
    },
    cardContainer: {
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
    },
    webSectionCard: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
    },
    imageWrapper: {
        height: 170,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#0F172A',
    },
    imageWrapperWeb: {
        height: 186,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    statusBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 100,
    },
    statusText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    budgetBadge: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    budgetText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    cardContent: {
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    cardTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        marginBottom: 2,
    },
    cardSubTitle: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        marginBottom: 5,
    },
    cardDescription: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        lineHeight: 18,
    },
    permitStatusChip: {
        marginTop: 10,
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    permitStatusChipText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 11,
    },
    rejectionReasonText: {
        marginTop: 8,
        color: '#DC2626',
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        lineHeight: 17,
    },
    permitHintText: {
        marginTop: 8,
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        lineHeight: 17,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        borderTopWidth: 1,
        paddingTop: 12,
    },
    actionLeft: {
        flexDirection: 'row',
        gap: 8,
    },
    manageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
    },
    manageBtnText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        color: '#FFF',
    },
    editBtn: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        borderWidth: 1,
    },
    editBtnIcon: {
        width: 18,
        height: 18,
        lineHeight: 18,
        includeFontPadding: false,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    reapplyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    reapplyBtnText: {
        color: '#EA580C',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
    },
    deleteBtn: {
        padding: 6,
    },
});

