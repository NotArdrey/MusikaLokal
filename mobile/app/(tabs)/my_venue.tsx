import ManagedListingContent, { ManagedListingScreenProps } from "../../src/components/ManagedListingContent";
import ManageWorkspaceTabs from "../../src/components/ManageWorkspaceTabs";
import { isGigInHistory } from '../../src/utils/listingHistory';
import { managementCardStyles } from "../../src/theme/managementCards";
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { runAfterUIIdle } from '../../src/utils/idleTask';
import CachedImage from '../../src/components/CachedImage';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import InlineErrorBanner from '../../src/components/InlineErrorBanner';
import Modal, { normalizeVisibleInput } from '../../src/components/modal';
import Navbar from '../../src/components/navbar';
import Skeleton from '../../src/components/Skeleton';
import { useBottomBarClearance } from '../../src/hooks/useBottomBarClearance';
import { useAuth, useRequireAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { getActionErrorMessage, getResultErrorMessage, logActionError } from '../../src/utils/actionError';
import { formatFriendlyDateTime } from '../../src/utils/friendlyDateTime';
import { invalidateListingCaches } from '../../src/utils/listingCacheInvalidation';
import { StaffAssignment, fetchActiveStaffAssignments, getStaffPermissions } from '../../src/utils/staffAccess';
import { createRealtimeChannelTopic } from '../../src/utils/realtimeChannel';
import { palette, typography } from '../../src/theme/tokens';

const DEFAULT_GIG_IMAGE = 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop';
const JOINED_GIG_APPLICATION_STATUSES = ['accepted', 'approved', 'completed'];
const normalizeStatus = (status: unknown) => String(status || '').trim().toLowerCase();
const isJoinedGigApplicationStatus = (status: unknown) => JOINED_GIG_APPLICATION_STATUSES.includes(normalizeStatus(status));

const collectJoinedGigIdsFromBookingsPayload = (payload: any) => {
    const buckets = payload?.categorized || payload || {};
    const rows = ['Upcoming', 'Ongoing', 'Review', 'History']
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

export default function MyVenueScreen({ historyOnly = false, embedded = false }: ManagedListingScreenProps = {}) {
    const { colors, isDark } = useTheme();
    const { contentBottomPadding } = useBottomBarClearance(24);
    const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
    const { userRole } = useAuth();
    const isMusicianView = userRole === 'musician';
    const params = useLocalSearchParams<{ refresh?: string; deleteId?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
    const requestedDeleteId = Array.isArray(params.deleteId) ? params.deleteId[0] : params.deleteId;
    const processedDeleteIdRef = useRef<string | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState('');
    const [cancellationReason, setCancellationReason] = useState('');
    const [gigs, setGigs] = useState<any[]>([]);
    const visibleGigs = gigs.filter((item) => historyOnly ? isGigInHistory(item) : !(isGigInHistory(item)));
    const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);
    const [staffAddOwnerState, setStaffAddOwnerState] = useState<{ userId: string; ownerIds: string[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
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

    const showAlert = useCallback((type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    }, [setAlertConfig, setAlertVisible]);

    const fetchGigs = useCallback(async (options?: { showAlertOnError?: boolean }) => {
        if (!userId) return;
        setLoadError(null);
        try {
            let baseGigs: any[] = [];
            const activeStaffAssignments = userRole === 'staff'
                ? (await fetchActiveStaffAssignments(supabase, userId)).filter((assignment) => assignment.entity_type === 'venue')
                : [];
            setStaffAssignments(activeStaffAssignments);

            if (userRole === 'staff' && activeStaffAssignments.length === 0) {
                setGigs([]);
                setStaffAddOwnerState({ userId, ownerIds: [] });
                return;
            }

            if (isMusicianView) {
                const { data: bookingPayload, error: bookingPayloadError } = await supabase.functions.invoke('manage-bookings', {
                    body: { action: 'fetch' },
                });

                if (bookingPayloadError) {
                    logActionError('MyVenue', 'fetch manage-bookings joined gig applications', bookingPayloadError, { userId });
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
                    const message = getActionErrorMessage(membershipError, 'Group memberships could not be loaded.');
                    logActionError('MyVenue', 'fetch group_members', membershipError, { userId });
                    setLoadError(`Solo gigs loaded, but group gigs could not be checked: ${message}`);
                    if (options?.showAlertOnError) {
                        showAlert('error', 'Could Not Load Group Gigs', message);
                    }
                }

                if (ownedGroupsError) {
                    const message = getActionErrorMessage(ownedGroupsError, 'Owned groups could not be loaded.');
                    logActionError('MyVenue', 'fetch owned groups', ownedGroupsError, { userId });
                    setLoadError(`Solo gigs loaded, but owned group gigs could not be checked: ${message}`);
                    if (options?.showAlertOnError) {
                        showAlert('error', 'Could Not Load Group Gigs', message);
                    }
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
                    .select('id, organizer_id, name, location, budget, description, event_date, status, management_status, created_at, permit_status, permit_rejection_reason, permit_reviewed_at')
                    .in('id', joinedGigIds)
                    .order('created_at', { ascending: false });

                if (joinedGigsError) throw joinedGigsError;
                baseGigs = joinedGigs || [];
            } else {
                let gigsQuery = supabase
                    .from('gigs')
                    .select('id, organizer_id, name, location, budget, description, event_date, status, management_status, created_at, permit_status, permit_rejection_reason, permit_reviewed_at')
                    .order('created_at', { ascending: false });

                const assignedGigIds = activeStaffAssignments.map((assignment) => assignment.gig_id).filter(Boolean) as string[];
                gigsQuery = assignedGigIds.length > 0
                    ? gigsQuery.in('id', assignedGigIds)
                    : gigsQuery.eq('organizer_id', userId);

                const { data, error: baseError } = await gigsQuery;

                if (baseError) throw baseError;
                baseGigs = data || [];
            }

            const addableAssignedGigIds = new Set(
                activeStaffAssignments
                    .filter((assignment) => getStaffPermissions(assignment.access_level, assignment).canAddListing)
                    .map((assignment) => assignment.gig_id)
                    .filter((gigId): gigId is string => typeof gigId === 'string' && gigId.length > 0),
            );
            const staffAddOwnerIds = Array.from(new Set(
                baseGigs
                    .filter((gig: any) => addableAssignedGigIds.has(gig.id))
                    .map((gig: any) => String(gig.organizer_id || '').trim())
                    .filter((ownerId: string) => ownerId.length > 0),
            ));
            setStaffAddOwnerState({
                userId,
                ownerIds: userRole === 'staff' ? staffAddOwnerIds : [],
            });

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

            const hydratedGigs = (baseGigs || []).map((gig: any) => {
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
                    is_owner: gig.organizer_id === userId || activeStaffAssignments.some((assignment) => assignment.gig_id === gig.id),
                };
            });

            setGigs(hydratedGigs);
        } catch (e) {
            const message = getActionErrorMessage(e, 'Failed to load gigs.');
            logActionError('MyVenue', 'fetchGigs', e, { userId, isMusicianView });
            setLoadError(message);
            if (options?.showAlertOnError) {
                showAlert('error', 'Could Not Load Gigs', message);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [isMusicianView, showAlert, userId, userRole]);

    const staffAddOwnerIds = staffAddOwnerState?.userId === userId
        ? staffAddOwnerState.ownerIds
        : [];
    const staffHeaderAddOwnerId = userRole === 'staff' && staffAddOwnerIds.length === 1
        ? staffAddOwnerIds[0]
        : null;
    const openStaffAddGig = useCallback(() => {
        if (!staffHeaderAddOwnerId) return;
        router.push({ pathname: '/add_gig', params: { ownerId: staffHeaderAddOwnerId } });
    }, [staffHeaderAddOwnerId]);

    useFocusEffect(
        useCallback(() => {
            if (!isAuthenticated || !userId) return;

            let isActive = true;
            let fetchStarted = false;
            const startFetch = () => {
                if (!isActive || fetchStarted) return;
                fetchStarted = true;
                void fetchGigs();
            };

            startFetch();
            const focusTask = runAfterUIIdle(startFetch);
            const fallbackTimer = setTimeout(startFetch, 800);
            const refreshInterval = setInterval(() => {
                void fetchGigs();
            }, 60000);

            return () => {
                isActive = false;
                focusTask.cancel();
                clearTimeout(fallbackTimer);
                clearInterval(refreshInterval);
            };
        }, [isAuthenticated, userId, refreshKey, fetchGigs])
    );

    useEffect(() => {
        if (!isAuthenticated || !userId || isMusicianView) return;

        const realtimeFilter = userRole === 'staff' ? undefined : `organizer_id=eq.${userId}`;

        const channel = supabase
            .channel(createRealtimeChannelTopic(`my-venue-listings:${userId}`))
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'gigs', ...(realtimeFilter ? { filter: realtimeFilter } : {}) },
                () => {
                    void fetchGigs();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, userId, fetchGigs, isMusicianView, userRole]);

    const onRefresh = () => {
        setRefreshing(true);
        return fetchGigs({ showAlertOnError: true });
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

    useEffect(() => {
        if (!requestedDeleteId || loading || processedDeleteIdRef.current === requestedDeleteId) return;
        const timer = setTimeout(() => {
            if (processedDeleteIdRef.current === requestedDeleteId) return;
            processedDeleteIdRef.current = requestedDeleteId;

            const gig = gigs.find((item) => item.id === requestedDeleteId);
            if (!gig) return;
            const assignment = staffAssignments.find((item) => item.gig_id === gig.id);
            const canDelete = userRole === 'staff'
                ? getStaffPermissions(assignment?.access_level, assignment).canDeleteListing
                : gig.is_owner === true || gig.organizer_id === userId;
            if (!canDelete) {
                setAlertConfig({ type: 'warning', title: 'Delete Not Allowed', message: 'You do not have permission to delete this gig.' });
                setAlertVisible(true);
                return;
            }

            setSelectedId(gig.id);
            setSelectedName(gig.name || '');
            setCancellationReason('');
            setModalVisible(true);
        }, 0);
        return () => clearTimeout(timer);
    }, [gigs, loading, requestedDeleteId, staffAssignments, userId, userRole]);

    const handleDelete = async () => {
        if (!selectedId || !userId || deleting) return;
        const reason = normalizeVisibleInput(cancellationReason);
        if (!reason) {
            showAlert('warning', 'Cancellation Reason Required', 'Please provide a cancellation reason before deleting this gig.');
            return;
        }
        setDeleting(true);
        try {
            const { data, error } = await supabase.rpc(
                userRole === 'staff' ? 'delete_gig_as_full_access_staff' : 'delete_gig_safely',
                {
                p_gig_id: selectedId,
                p_reason: reason,
                },
            );

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
                    invalidateListingCaches(userId, ['bookings', 'details', 'feed', 'home', 'search']);
                    closeDeleteModal();
                    return;
                }

                throw new Error(getResultErrorMessage(result, 'Delete failed'));
            }

            setGigs(prev => prev.filter(g => g.id !== selectedId));
            invalidateListingCaches(userId, ['bookings', 'details', 'feed', 'home', 'search', 'notifications']);
            closeDeleteModal();
            const cancelledApplications = Number(result?.cancelled_applications || 0);
            const successMessage = cancelledApplications > 0
                ? `Gig deleted successfully. ${cancelledApplications} application(s) were cancelled and notified.`
                : 'Gig deleted successfully.';
            showAlert('success', 'Gig Deleted', successMessage);
        } catch (e) {
            const message = getActionErrorMessage(e, 'Failed to delete gig.');
            logActionError('MyVenue', 'delete gig', e, { gigId: selectedId, userId });
            showAlert('error', 'Delete Failed', message);
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
            <View style={[!embedded && styles.flex1, { backgroundColor: colors.background }]}>
                {!embedded && (<Header
                    title="My Gigs"
                    overline="MusikaLokal"
                    showTitle={false}
                    onAddPress={staffHeaderAddOwnerId ? openStaffAddGig : undefined}
                    addButtonAccessibilityLabel="Add gig"
                />)}

                <ManagedListingContent embedded={embedded} listingType="gig" loading={loading} itemCount={visibleGigs.length} error={loadError}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: embedded ? 16 : contentBottomPadding }]}
                    style={styles.flex1}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {!embedded && <ManageWorkspaceTabs activeKey={historyOnly ? "history" : "venue"} />}

                    {!embedded && (<Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>DATES, TALENT & APPLICANTS</Text>)}

                    {!embedded && (<InlineErrorBanner
                        message={loadError}
                        onRetry={() => {
                            if (gigs.length === 0) setLoading(true);
                            void fetchGigs({ showAlertOnError: true });
                        }}
                    />)}

                    {loading ? (
                        <View style={styles.skeletonList}>
                            {[0, 1].map((index) => (
                                <View
                                    key={`gig-skeleton-${index}`}
                                    style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                >
                                    <View style={styles.cardIdentity}>
                                        <Skeleton width={64} height={64} borderRadius={10} />
                                        <View style={styles.cardHeading}>
                                            <Skeleton width="80%" height={22} />
                                            <Skeleton width="65%" height={14} style={{ marginTop: 6 }} />
                                        </View>
                                    </View>
                                    <Skeleton width="74%" height={14} style={{ marginTop: 10 }} />
                                    <Skeleton width="100%" height={14} style={{ marginTop: 8 }} />
                                    <View style={styles.skeletonActionRow}>
                                        <Skeleton width={124} height={44} borderRadius={9} />
                                        <Skeleton width={44} height={44} borderRadius={9} />
                                        <Skeleton width={44} height={44} borderRadius={9} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : visibleGigs.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>{historyOnly ? 'No past gigs yet' : 'No active gigs'}</Text>
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {historyOnly ? 'Your past and cancelled gigs appear here. Completed gigs keep their original records.' : isMusicianView ? 'Your accepted upcoming and ongoing gigs appear here.' : 'Your upcoming and ongoing gigs appear here.'}
                            </Text>
                        </View>
                    ) : (
                        visibleGigs.map((gig) => (
                            <View
                                key={gig.id}
                                testID={`mobile-gig-card-${gig.id}`}
                                accessibilityLabel={`mobile-gig-card-${gig.id}`}
                                style={[styles.cardContainer, {
                                    backgroundColor: colors.surface,
                                    borderColor: colors.border,
                                }]}
                            >
                                {(() => {
                                    const normalizedPermitStatus = normalizePermitStatus(gig.permit_status);
                                    const isRejected = normalizedPermitStatus === 'rejected';
                                    const isApproved = normalizedPermitStatus === 'approved';
                                    const isResubmitted = normalizedPermitStatus === 'resubmitted';
                                    const staffAssignment = staffAssignments.find((assignment) => assignment.gig_id === gig.id);
                                    const staffPermissions = userRole === 'staff'
                                        ? getStaffPermissions(staffAssignment?.access_level, staffAssignment)
                                        : null;
                                    const canManageBookings = !staffPermissions || staffPermissions.canManageBookings;
                                    const canEditVenue = staffPermissions
                                        ? staffPermissions.canEditListing
                                        : gig.is_owner === true;
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
                                        <>
                                            <View style={styles.cardIdentity}>
                                                <View style={styles.imageWrapper}>
                                                    <CachedImage
                                                        uri={resolveGigImage(gig)}
                                                        style={styles.cardImage}
                                                        width={128}
                                                        height={128}
                                                        quality={68}
                                                        priority="high"
                                                        cacheVersion={gig.updated_at || gig.created_at || gig.id}
                                                    />
                                                </View>
                                                <View style={styles.cardHeading}>
                                                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{gig.name}</Text>
                                                    <Text style={[styles.cardSubTitle, { color: colors.textSecondary }]}>
                                                        {gig.event_date ? formatFriendlyDateTime(gig.event_date, { forceDateOnly: true }) : 'Date TBA'}
                                                        {gig.requirements?.event_start_time && gig.requirements?.event_end_time ? ` · ${gig.requirements.event_start_time} - ${gig.requirements.event_end_time}` : ''}
                                                    </Text>
                                                    <View style={[styles.statusBadge, { backgroundColor: colors.inputBackground }]}>
                                                        <Text style={[styles.statusText, { color: colors.primary }]}>{gig.management_status === 'done' ? 'Done' : isGigInHistory(gig) && gig.status !== 'cancelled' ? 'Past' : gig.status || 'Active'}</Text>
                                                    </View>
                                                </View>
                                            </View>

                                            <View style={styles.cardContent}>
                                                {!!gig.location && (
                                                    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.cardLocation, { color: colors.textSecondary }]}>
                                                        {gig.location}
                                                    </Text>
                                                )}
                                                {gig.budget != null && <Text style={[styles.cardBudget, { color: colors.text }]}>PHP {gig.budget.toLocaleString()} talent fee</Text>}

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

                                                {(normalizedPermitStatus === 'pending' || normalizedPermitStatus === 'pending_review' || normalizedPermitStatus === 'resubmitted') && (
                                                    <Text style={[styles.permitHintText, { color: colors.textSecondary }]}>
                                                        Hidden from Home right now.
                                                    </Text>
                                                )}

                                                <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                                    <View style={styles.actionLeft}>
                                                        <TouchableOpacity
                                                            activeOpacity={1}
                                                            testID={`mobile-gig-manage-${gig.id}`}
                                                            accessibilityLabel={`mobile-gig-manage-${gig.id}`}
                                                            onPress={() => {
                                                                if (canManageGig) {
                                                                    router.push({ pathname: '/manage_gig', params: { id: gig.id } });
                                                                    return;
                                                                }

                                                                router.push({ pathname: '/manage_gig', params: { id: gig.id } });
                                                            }}
                                                            style={[styles.manageBtn, { borderColor: colors.primary }]}
                                                        >
                                                            <Text style={[styles.manageBtnText, { color: colors.primary }]}>{canManageGig ? 'Manage' : 'View'}</Text>
                                                        </TouchableOpacity>

                                                        {canEditVenue && gig.management_status !== 'done' && isRejected ? (
                                                            <TouchableOpacity
                                                                activeOpacity={1}
                                                                onPress={() =>
                                                                    router.push({
                                                                        pathname: '/edit_gig',
                                                                        params: { id: gig.id, reapply: '1' },
                                                                    })
                                                                }
                                                                style={[
                                                                    styles.reapplyBtn,
                                                                    {
                                                                        borderColor: '#F97316',
                                                                        backgroundColor: isDark ? 'rgba(249,115,22,0.12)' : '#FFF7ED',
                                                                    },
                                                                ]}
                                                            >
                                                                <Ionicons name="refresh-outline" size={16} color="#EA580C" />
                                                                <Text style={styles.reapplyBtnText}>Edit & Reapply</Text>
                                                            </TouchableOpacity>
                                                        ) : canEditVenue && gig.management_status !== 'done' ? (
                                                            <TouchableOpacity
                                                                activeOpacity={1}
                                                                testID={`mobile-gig-edit-${gig.id}`}
                                                                accessibilityLabel={`mobile-gig-edit-${gig.id}`}
                                                                onPress={() => router.push({ pathname: '/edit_gig', params: { id: gig.id } })}
                                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                                            >
                                                                <Ionicons name="pencil-outline" size={20} color={colors.text} style={styles.editBtnIcon} />
                                                            </TouchableOpacity>
                                                        ) : !staffPermissions ? (
                                                            <TouchableOpacity
                                                                activeOpacity={1}
                                                                onPress={() => handleOpenGigChat(gig)}
                                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                                            >
                                                                <Ionicons name="chatbubble-outline" size={20} color={colors.text} style={styles.editBtnIcon} />
                                                            </TouchableOpacity>
                                                        ) : null}
                                                        {staffPermissions?.canAddListing && !staffHeaderAddOwnerId ? (
                                                            <TouchableOpacity
                                                                activeOpacity={1}
                                                                testID={`mobile-gig-add-for-owner-${gig.id}`}
                                                                accessibilityLabel={`Add gig for ${gig.name}`}
                                                                onPress={() => router.push({ pathname: '/add_gig', params: { ownerId: gig.organizer_id } })}
                                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                                            >
                                                                <Ionicons name="add-outline" size={20} color={colors.text} />
                                                            </TouchableOpacity>
                                                        ) : null}
                                                    </View>

                                                    {canManageGig && (!staffPermissions || staffPermissions.canDeleteListing) ? (
                                                        <TouchableOpacity
                                                            activeOpacity={1}
                                                            testID={`mobile-gig-delete-${gig.id}`}
                                                            accessibilityLabel={`mobile-gig-delete-${gig.id}`}
                                                            onPress={() => confirmDelete(gig.id, gig.name)}
                                                            style={styles.deleteBtn}
                                                        >
                                                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    ) : null}
                                                </View>

                                                {gig.management_status === 'done' && !isMusicianView && (!staffPermissions || staffPermissions.canAddListing) ? (
                                                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Create a new gig for ${gig.name}`}
                                                        onPress={() => router.push({ pathname: '/add_gig', params: { ownerId: gig.organizer_id } })}
                                                        style={[styles.manageBtn, { borderColor: colors.primary, marginTop: 10 }]}>
                                                        <Text style={[styles.manageBtnText, { color: colors.primary }]}>Create new gig</Text>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        </>
                                    );
                                })()}
                            </View>
                        ))
                    )}

                </ManagedListingContent>

                {!embedded && <Navbar />}
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
                loading={deleting}
                loadingMessage="Deleting gig and notifying applicants..."
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
    scrollContent: { paddingBottom: 180, paddingTop: 0, paddingHorizontal: 16 },
    sectionHeading: {
        fontFamily: typography.bold,
        fontSize: 12,
        letterSpacing: 1.4,
        marginBottom: 16,
    },
    pageTabsWrap: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 4,
        marginBottom: 16,
        flexDirection: 'row',
        gap: 6,
    },
    pageTabBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    pageTabText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
    },
    loadingText: {
        textAlign: 'center',
        marginTop: 20,
        fontFamily: 'Poppins_400Regular',
    },
    skeletonList: {
        gap: 16,
    },
    skeletonCard: { ...managementCardStyles.surface },
    skeletonActionRow: {
        marginTop: 16,
        flexDirection: 'row',
        gap: 10,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyTitle: {
        marginTop: 16,
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 20,
    },
    emptyText: {
        marginTop: 10,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    cardContainer: { ...managementCardStyles.surface, overflow: 'hidden', borderColor: palette.line, marginBottom: 12 },
    imageWrapper: { width: 64, height: 64, borderRadius: 10, overflow: "hidden" },
    cardImage: { ...managementCardStyles.thumbnail },
    statusBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
    statusText: { fontSize: 12, fontFamily: typography.semibold },
    cardContent: { padding: 0, paddingTop: 8 },
    cardTitle: { ...managementCardStyles.title, marginBottom: 0 },
    cardSubTitle: { ...managementCardStyles.metadata },
    cardLocation: { ...managementCardStyles.metadata, marginTop: 2 },
    cardBudget: {
        marginBottom: 8,
        fontFamily: typography.semibold,
        fontSize: 13,
        lineHeight: 20,
        marginTop: 4,
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
        fontSize: 12,
        lineHeight: 17,
        fontFamily: typography.medium,
    },
    permitHintText: { marginTop: 8, fontSize: 12, lineHeight: 17, fontFamily: typography.body },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        gap: 8,
        marginTop: 8,
        paddingTop: 8,
        flexWrap: "wrap",
        alignItems: "flex-start",
    },
    actionLeft: {
        flexDirection: 'row',
        flex: 1,
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
    },
    manageBtn: {
        ...managementCardStyles.button,
        flexDirection: 'row',
        gap: 8,
        borderWidth: 1,
        flex: 1,
        minWidth: 88,
        paddingVertical: 8,
    },
    manageBtnText: { fontFamily: typography.semibold },
    editBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        width: 44,
        height: 44,
        borderRadius: 9,
    },
    editBtnIcon: {
        width: 20,
        height: 20,
        lineHeight: 20,
        includeFontPadding: false,
        textAlign: 'center',
        textAlignVertical: 'center',
    },
    reapplyBtn: {
        ...managementCardStyles.button,
        flexDirection: 'row',
        gap: 6,
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        flex: 1,
        minWidth: 120,
    },
    reapplyBtnText: { color: '#EA580C', fontSize: 12, fontFamily: typography.semibold },
    deleteBtn: {
        width: 44,
        height: 44,
        padding: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    cardIdentity: { ...managementCardStyles.identity },
    cardHeading: { flex: 1, minWidth: 0, gap: 4 },
});

