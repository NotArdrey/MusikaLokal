import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

const normalizePermitStatus = (permitStatus: string | null | undefined) => {
    const normalizedPermitStatus = String(permitStatus || '').trim().toLowerCase();
    if (!normalizedPermitStatus) return 'approved';
    if (['approved', 'approved_by_admin', 'verified'].includes(normalizedPermitStatus)) return 'approved';
    if (['pending', 'pending_review', 'in_review', 'under_review'].includes(normalizedPermitStatus)) return 'pending_review';
    if (['resubmitted', 'resubmit', 'reapplied'].includes(normalizedPermitStatus)) return 'resubmitted';
    if (['rejected', 'declined'].includes(normalizedPermitStatus)) return 'rejected';
    return normalizedPermitStatus;
};

export default function MyVenueScreen() {
    const { colors, isDark } = useTheme();
    const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
    const params = useLocalSearchParams<{ refresh?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState('');
    const [cancellationReason, setCancellationReason] = useState('');
    const [gigs, setGigs] = useState<any[]>([]);
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
            const { data: baseGigs, error: baseError } = await supabase
                .from('gigs')
                .select('id, organizer_id, name, location, budget, description, event_date, status, created_at, updated_at, permit_status, permit_rejection_reason, permit_reviewed_at')
                .eq('organizer_id', userId)
                .order('created_at', { ascending: false });

            if (baseError) throw baseError;

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
                };
            }));
        } catch (e) {
            console.log('Error fetching gigs:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

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
        if (!isAuthenticated || !userId) return;

        const channel = supabase
            .channel(`my-venue-listings:${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'gigs', filter: `organizer_id=eq.${userId}` },
                () => {
                    fetchGigs();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, userId, fetchGigs]);

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
        if (!cancellationReason.trim()) {
            showAlert('warning', 'Cancellation Reason Required', 'Please provide a cancellation reason before deleting this gig.');
            return;
        }
        setDeleting(true);
        try {
            const { data, error } = await supabase.rpc('delete_gig_safely', {
                p_gig_id: selectedId,
                p_reason: cancellationReason.trim(),
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
                        `This gig still has ${result.accepted_application_count || 0} accepted application(s)${(result.pending_application_count || 0) > 0 ? ` and ${result.pending_application_count} pending application(s)` : ''}. Resolve accepted applicants first before deleting.`
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

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="My Venue" />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    style={styles.flex1}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {loading ? (
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading gigs...</Text>
                    ) : gigs.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No gigs found</Text>
                        </View>
                    ) : (
                        gigs.map((gig) => (
                            <View key={gig.id} style={[styles.cardContainer, {
                                backgroundColor: colors.surface,
                                shadowColor: colors.primary,
                            }]}>
                                {(() => {
                                    const normalizedPermitStatus = normalizePermitStatus(gig.permit_status);
                                    const isRejected = normalizedPermitStatus === 'rejected';
                                    const isApproved = normalizedPermitStatus === 'approved';
                                    const isResubmitted = normalizedPermitStatus === 'resubmitted';

                                    const permitStatusLabel =
                                        isApproved
                                            ? 'Approved by Admin'
                                            : isRejected
                                                ? 'Rejected'
                                                : isResubmitted
                                                    ? 'Resubmitted'
                                                    : 'Pending Review';

                                    const permitBadgeBackground =
                                        isApproved
                                            ? (isDark ? 'rgba(22,163,74,0.22)' : '#DCFCE7')
                                            : isRejected
                                                ? (isDark ? 'rgba(220,38,38,0.22)' : '#FEE2E2')
                                                : isResubmitted
                                                    ? (isDark ? 'rgba(37,99,235,0.22)' : '#DBEAFE')
                                                    : (isDark ? 'rgba(245,158,11,0.22)' : '#FEF3C7');

                                    const permitBadgeColor =
                                        isApproved
                                            ? '#16A34A'
                                            : isRejected
                                                ? '#DC2626'
                                                : isResubmitted
                                                    ? '#2563EB'
                                                    : '#B45309';

                                    return (
                                        <>
                                <View style={styles.imageWrapper}>
                                    <CachedImage
                                        uri={(gig.images && gig.images[0]) || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop'}
                                        style={styles.cardImage}
                                        width={800}
                                        height={384}
                                        quality={72}
                                        cacheVersion={gig.updated_at || gig.created_at || gig.id}
                                    />
                                    <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)' }]}>
                                        <Text style={[styles.statusText, { color: colors.primary }]}>{gig.status || 'Active'}</Text>
                                    </View>
                                    <View style={styles.budgetBadge}>
                                        <Text style={styles.budgetText}>₱{gig.budget?.toLocaleString()}</Text>
                                    </View>
                                </View>

                                <View style={styles.cardContent}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{gig.name}</Text>
                                    <Text style={[styles.cardSubTitle, { color: colors.primary }]}>
                                        {gig.event_date ? new Date(gig.event_date).toLocaleDateString() : 'Date TBA'}
                                        {gig.requirements?.event_start_time && gig.requirements?.event_end_time ? ` • ${gig.requirements.event_start_time} - ${gig.requirements.event_end_time}` : ''} • {gig.location}
                                    </Text>

                                    <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                        {gig.description}
                                    </Text>

                                    <View style={[styles.permitStatusChip, { backgroundColor: permitBadgeBackground }]}>
                                        <Text style={[styles.permitStatusChipText, { color: permitBadgeColor }]}>Permit: {permitStatusLabel}</Text>
                                    </View>

                                    {isRejected && !!gig.permit_rejection_reason && (
                                        <Text style={styles.rejectionReasonText} numberOfLines={3}>
                                            Rejection reason: {gig.permit_rejection_reason}
                                        </Text>
                                    )}

                                    {(normalizedPermitStatus === 'pending' || normalizedPermitStatus === 'pending_review' || normalizedPermitStatus === 'resubmitted') && (
                                        <Text style={[styles.permitHintText, { color: colors.textSecondary }]}>
                                            Hidden from Home until admin permit approval is completed.
                                        </Text>
                                    )}

                                    <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                        <View style={styles.actionLeft}>
                                            <TouchableOpacity activeOpacity={1}
                                                onPress={() => router.push({ pathname: '/manage_gig', params: { id: gig.id } })}
                                                style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                                            >
                                                <Ionicons name="settings-outline" size={18} color="#FFF" />
                                                <Text style={styles.manageBtnText}>Manage</Text>
                                            </TouchableOpacity>

                                            {isRejected ? (
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
                                            ) : (
                                                <TouchableOpacity
                                                    activeOpacity={1}
                                                    onPress={() => router.push({ pathname: '/edit_gig', params: { id: gig.id } })}
                                                    style={[styles.editBtn, { borderColor: colors.border }]}
                                                >
                                                    <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <TouchableOpacity activeOpacity={1}
                                            onPress={() => confirmDelete(gig.id, gig.name)}
                                            style={styles.deleteBtn}
                                        >
                                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                        </>
                                    );
                                })()}
                            </View>
                        ))
                    )}

                </ScrollView>

                <Navbar />
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
                confirmDisabled={!cancellationReason.trim() || deleting}
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
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 180,
        paddingTop: 16,
    },
    loadingText: {
        textAlign: 'center',
        marginTop: 20,
        fontFamily: 'Poppins_400Regular',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
        opacity: 0.5,
    },
    emptyText: {
        marginTop: 16,
        fontFamily: 'Poppins_400Regular',
    },
    cardContainer: {
        marginBottom: 24,
        borderRadius: 24,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
    },
    imageWrapper: {
        height: 192,
        position: 'relative',
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
        padding: 16,
    },
    cardTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        marginBottom: 2,
    },
    cardSubTitle: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
        marginBottom: 6,
    },
    cardDescription: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        lineHeight: 20,
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
        marginTop: 16,
        borderTopWidth: 1,
        paddingTop: 16,
    },
    actionLeft: {
        flexDirection: 'row',
        gap: 12,
    },
    manageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
    },
    manageBtnText: {
        fontFamily: 'Poppins_500Medium',
        color: '#FFF',
    },
    editBtn: {
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
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
        padding: 8,
    },
});

