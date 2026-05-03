import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { InteractionManager, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import Skeleton from '../src/components/Skeleton';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

const normalizePermitStatus = (permitStatus: string | null | undefined) => {
    const normalizedPermitStatus = String(permitStatus || '').trim().toLowerCase();
    if (!normalizedPermitStatus) return 'pending_review';
    if (['approved', 'approved_by_admin', 'verified'].includes(normalizedPermitStatus)) return 'approved';
    if (['pending', 'pending_review', 'in_review', 'under_review'].includes(normalizedPermitStatus)) return 'pending_review';
    if (['resubmitted', 'resubmit', 'reapplied'].includes(normalizedPermitStatus)) return 'resubmitted';
    if (['rejected', 'declined'].includes(normalizedPermitStatus)) return 'rejected';
    return normalizedPermitStatus;
};

const normalizeDeleteConfirmation = (value: string) =>
    String(value || '')
        .normalize('NFKC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

export default function MyStudioScreen() {
    const { colors, isDark } = useTheme();
    const { contentBottomPadding } = useBottomBarClearance(24);
    const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
    const params = useLocalSearchParams<{ refresh?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState('');
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [studios, setStudios] = useState<any[]>([]);
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

    const fetchStudios = useCallback(async () => {
        if (!userId) return;
        try {
            const { data: baseStudios, error: baseError } = await supabase
                .from('studios')
                .select('id, owner_id, name, description, created_at, permit_status, permit_rejection_reason, permit_reviewed_at')
                .eq('owner_id', userId)
                .in('permit_status', ['approved', 'approved_by_admin', 'verified'])
                .order('created_at', { ascending: false });

            if (baseError) throw baseError;

            const studioIds = (baseStudios || []).map((studio: any) => studio.id);

            if (studioIds.length === 0) {
                setStudios([]);
                return;
            }

            const [
                { data: mediaRows, error: mediaError },
                { data: reviewRows, error: reviewsError },
            ] = await Promise.all([
                supabase
                    .from('studio_media')
                    .select('studio_id, media_url, sort_order, created_at')
                    .in('studio_id', studioIds)
                    .eq('media_type', 'image')
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true }),
                supabase
                    .from('reviews')
                    .select('studio_id, rating')
                    .in('studio_id', studioIds),
            ]);

            if (mediaError) throw mediaError;
            if (reviewsError) throw reviewsError;

            const imagesByStudioId = (mediaRows || []).reduce((acc: Record<string, string[]>, row: any) => {
                if (!row?.studio_id || !row?.media_url) return acc;
                if (!acc[row.studio_id]) acc[row.studio_id] = [];
                acc[row.studio_id].push(row.media_url);
                return acc;
            }, {});

            const reviewsByStudioId = (reviewRows || []).reduce((acc: Record<string, { sum: number; count: number }>, row: any) => {
                if (!row?.studio_id) return acc;
                if (!acc[row.studio_id]) acc[row.studio_id] = { sum: 0, count: 0 };
                const rating = Number(row.rating || 0);
                acc[row.studio_id].sum += rating;
                acc[row.studio_id].count += 1;
                return acc;
            }, {});

            setStudios((baseStudios || []).map((studio: any) => {
                const reviewStats = reviewsByStudioId[studio.id] || { sum: 0, count: 0 };
                const reviewCount = reviewStats.count;
                const rating = reviewCount > 0 ? reviewStats.sum / reviewCount : 0;
                const normalizedPermitStatus = normalizePermitStatus(studio.permit_status);

                return {
                    ...studio,
                    images: imagesByStudioId[studio.id] || [],
                    rating,
                    review_count: reviewCount,
                    permit_status: normalizedPermitStatus,
                    permit_rejection_reason: studio.permit_rejection_reason || null,
                    permit_reviewed_at: studio.permit_reviewed_at || null,
                };
            }));
        } catch (e) {
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    useFocusEffect(
        useCallback(() => {
            if (!isAuthenticated || !userId) return;

            let isActive = true;
            const focusTask = InteractionManager.runAfterInteractions(() => {
                if (isActive) {
                    void fetchStudios();
                }
            });
            const refreshInterval = setInterval(() => {
                fetchStudios();
            }, 30000);

            return () => {
                isActive = false;
                focusTask.cancel();
                clearInterval(refreshInterval);
            };
        }, [isAuthenticated, userId, refreshKey, fetchStudios])
    );

    useEffect(() => {
        if (!isAuthenticated || !userId) return;

        const channel = supabase
            .channel(`my-studio-listings:${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'studios', filter: `owner_id=eq.${userId}` },
                () => {
                    fetchStudios();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [isAuthenticated, userId, fetchStudios]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchStudios();
    };

    const closeDeleteModal = () => {
        setModalVisible(false);
        setSelectedId(null);
        setSelectedName('');
        setDeleteConfirmationText('');
    };

    const confirmDelete = (id: string, name: string) => {
        setSelectedId(id);
        setSelectedName(name || '');
        setDeleteConfirmationText('');
        setModalVisible(true);
    };

    const isDeleteConfirmed =
        normalizeDeleteConfirmation(deleteConfirmationText) ===
        normalizeDeleteConfirmation(selectedName);

    const handleDelete = async () => {
        if (!selectedId || !userId || deleting) return;
        if (!isDeleteConfirmed) {
            showAlert('warning', 'Confirmation Needed', `Please type "${selectedName}" exactly to confirm deletion.`);
            return;
        }
        setDeleting(true);
        try {
            let result: any = null;
            let invokeError: any = null;
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const accessToken = session?.access_token;

            if (accessToken) {
                try {
                    const { data, error } = await supabase.functions.invoke('delete-studio-with-storage', {
                        body: {
                            studioId: selectedId,
                            reason: 'Deleted from My Studio screen by owner',
                        },
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    });

                    result = data;
                    invokeError = error;
                } catch (e) {
                    invokeError = e;
                }
            } else {
                invokeError = new Error('No active session token for edge invoke.');
            }

            if (invokeError) {
                const { data: rpcData, error: rpcError } = await supabase.rpc('delete_studio_safely', {
                    p_studio_id: selectedId,
                    p_reason: 'Deleted from My Studio screen by owner (RPC fallback)',
                });
                if (rpcError) throw rpcError;
                result = rpcData;
            }

            if (!result?.success) {
                if (result?.code === 'ACTIVE_BOOKINGS_EXIST') {
                    showAlert(
                        'warning',
                        'Delete Blocked',
                        `This studio still has ${result.active_booking_count || 0} active booking(s)${(result.pending_relocation_count || 0) > 0 ? `, including ${result.pending_relocation_count} pending relocation request(s)` : ''}. Resolve booking cancellations/relocations first so musician notifications and refunds are handled correctly.`
                    );
                    closeDeleteModal();
                    return;
                }

                if (result?.code === 'STUDIO_NOT_FOUND') {
                    showAlert('warning', 'Not Found', 'Studio was not found. It may have already been removed.');
                    setStudios(prev => prev.filter(s => s.id !== selectedId));
                    closeDeleteModal();
                    return;
                }

                throw new Error(result?.message || 'Delete failed');
            }

            setStudios(prev => prev.filter(s => s.id !== selectedId));
            closeDeleteModal();
            showAlert('success', 'Studio Deleted', 'Studio deleted successfully.');
        } catch (e) {
            showAlert('error', 'Error', 'Failed to delete studio');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="My Studio" />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
                    style={styles.flex1}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {loading ? (
                        <View style={styles.skeletonList}>
                            {[0, 1, 2].map((index) => (
                                <View
                                    key={`studio-skeleton-${index}`}
                                    style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                >
                                    <Skeleton width="100%" height={192} borderRadius={18} />
                                    <Skeleton width="64%" height={22} style={{ marginTop: 14 }} />
                                    <Skeleton width="100%" height={14} style={{ marginTop: 10 }} />
                                    <Skeleton width="82%" height={14} style={{ marginTop: 6 }} />
                                    <View style={styles.skeletonActionRow}>
                                        <Skeleton width={124} height={40} borderRadius={12} />
                                        <Skeleton width={40} height={40} borderRadius={12} />
                                        <Skeleton width={40} height={40} borderRadius={12} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : studios.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="mic-outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No studios found</Text>
                        </View>
                    ) : (
                        studios.map((studio) => (
                            <View
                                key={studio.id}
                                style={[
                                    styles.cardContainer,
                                    {
                                        backgroundColor: colors.surface,
                                        shadowColor: colors.primary,
                                    },
                                ]}
                            >
                                {(() => {
                                    const normalizedPermitStatus = normalizePermitStatus(studio.permit_status);
                                    const isRejected = normalizedPermitStatus === 'rejected';
                                    const isApproved = normalizedPermitStatus === 'approved';
                                    const isResubmitted = normalizedPermitStatus === 'resubmitted';

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
                                <View style={styles.imageWrapper}>
                                    <CachedImage
                                        uri={(studio.images && studio.images[0]) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop'}
                                        style={styles.cardImage}
                                        width={800}
                                        height={384}
                                        quality={72}
                                        cacheVersion={studio.updated_at || studio.created_at || studio.id}
                                    />
                                    {!isApproved && (
                                        <View style={[styles.activeBadge, { backgroundColor: permitBadgeBackground }]}>
                                            <Text style={[styles.activeText, { color: permitBadgeColor }]}>{permitStatusLabel}</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.cardContent}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{studio.name}</Text>
                                    <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                        {studio.description}
                                    </Text>

                                    {isRejected && !!studio.permit_rejection_reason && (
                                        <Text style={styles.rejectionReasonText} numberOfLines={3}>
                                            Rejection reason: {studio.permit_rejection_reason}
                                        </Text>
                                    )}

                                    {(normalizedPermitStatus === 'pending' || normalizedPermitStatus === 'pending_review' || normalizedPermitStatus === 'resubmitted') && (
                                        <Text style={[styles.permitHintText, { color: colors.textSecondary }]}>
                                            Hidden from Home right now.
                                        </Text>
                                    )}

                                    <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                        <View style={styles.actionLeft}>
                                            <TouchableOpacity activeOpacity={1}
                                                onPress={() => router.push({ pathname: '/manage_studio', params: { id: studio.id } })}
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
                                                            pathname: '/edit_studio',
                                                            params: { id: studio.id, reapply: '1' },
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
                                                    onPress={() => router.push({ pathname: '/edit_studio', params: { id: studio.id } })}
                                                    style={[styles.editBtn, { borderColor: colors.border }]}
                                                >
                                                    <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        <TouchableOpacity activeOpacity={1}
                                            onPress={() => confirmDelete(studio.id, studio.name)}
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
                title="Delete Studio"
                message={deleting ? 'Deleting studio...' : `Type "${selectedName}" to confirm deleting this studio.`}
                buttonText={deleting ? 'Deleting...' : 'Delete'}
                onConfirm={handleDelete}
                danger
                showInput
                inputMultiline={false}
                inputPlaceholder="Type studio name"
                inputValue={deleteConfirmationText}
                onInputChange={setDeleteConfirmationText}
                confirmDisabled={!isDeleteConfirmed || deleting}
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
    skeletonList: {
        gap: 16,
    },
    skeletonCard: {
        borderRadius: 24,
        borderWidth: 1,
        padding: 16,
    },
    skeletonActionRow: {
        marginTop: 16,
        flexDirection: 'row',
        gap: 10,
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
    activeBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 100,
    },
    activeText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    cardContent: {
        padding: 16,
    },
    cardTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        marginBottom: 4,
    },
    cardDescription: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        lineHeight: 20,
    },
    rejectionReasonText: {
        marginTop: 8,
        color: '#DC2626',
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        lineHeight: 18,
    },
    permitHintText: {
        marginTop: 8,
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        lineHeight: 18,
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
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
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

