import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal, { normalizeConfirmationInput } from '../src/components/modal';
import Navbar from '../src/components/navbar';
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

export default function MyStudioScreen() {
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
            console.log('Error fetching studios:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userId]);

    useFocusEffect(
        useCallback(() => {
            if (!isAuthenticated || !userId) return;

            fetchStudios();
            const refreshInterval = setInterval(() => {
                fetchStudios();
            }, 30000);

            return () => {
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
        normalizeConfirmationInput(deleteConfirmationText) ===
        normalizeConfirmationInput(selectedName);

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
            console.log('Error deleting studio:', e);
            showAlert('error', 'Error', 'Failed to delete studio');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
                <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
                    <Header title="My Studio" />

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.scrollContentWeb]}
                        style={styles.flex1}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    >
                        {loading ? (
                            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading studios...</Text>
                        ) : studios.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="mic-outline" size={48} color={colors.textSecondary} />
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No studios found</Text>
                            </View>
                        ) : (
                            <View style={[styles.gridWrap, isWebDesktop && styles.gridWrapWeb]}>
                                {studios.map((studio) => {
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
                                    <View key={studio.id} style={[styles.gridItem, isWebDesktop && styles.gridItemWeb]}>
                                        <View key={studio.id} style={[styles.cardContainer, {
                                            backgroundColor: pageCardBackground,
                                            borderColor: borderSoft,
                                        }, isWebDesktop && styles.webSectionCard, {
                                            shadowColor: isWebDesktop ? '#0F172A' : colors.primary,
                                        }]}>
                                            <View style={[styles.imageWrapper, isWebDesktop && styles.imageWrapperWeb]}>
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
                                                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{studio.name}</Text>
                                                <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                                    {studio.description}
                                                </Text>

                                                {isRejected && !!studio.permit_rejection_reason && (
                                                    <Text style={styles.rejectionReasonText} numberOfLines={3}>
                                                        Rejection reason: {studio.permit_rejection_reason}
                                                    </Text>
                                                )}

                                                {(normalizedPermitStatus === 'pending_review' || normalizedPermitStatus === 'resubmitted') && (
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
                                                            <Ionicons name="settings-outline" size={16} color="#FFF" />
                                                            <Text style={styles.manageBtnText}>Manage</Text>
                                                        </TouchableOpacity>

                                                        <TouchableOpacity activeOpacity={1}
                                                            onPress={() => router.push({ pathname: '/edit_studio', params: { id: studio.id } })}
                                                            style={[styles.editBtn, { borderColor: colors.border }]}
                                                        >
                                                            <Ionicons name="pencil-outline" size={18} color={colors.text} />
                                                        </TouchableOpacity>
                                                    </View>

                                                    <TouchableOpacity activeOpacity={1}
                                                        onPress={() => confirmDelete(studio.id, studio.name)}
                                                        style={styles.deleteBtn}
                                                    >
                                                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                                    </TouchableOpacity>
                                                </View>
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
                requiredInputValue={selectedName}
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
    },
    imageWrapperWeb: {
        height: 186,
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
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    cardTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        marginBottom: 4,
    },
    cardDescription: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        lineHeight: 18,
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
        padding: 7,
        borderRadius: 10,
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
        padding: 6,
    },
});

