import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function MyStudioScreen() {
    const { colors, isDark } = useTheme();
    const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
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

    const fetchStudios = async () => {
        if (!userId) return;
        try {
            const { data: baseStudios, error: baseError } = await supabase
                .from('studios')
                .select('id, owner_id, name, description, created_at')
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

                return {
                    ...studio,
                    images: imagesByStudioId[studio.id] || [],
                    rating,
                    review_count: reviewCount,
                };
            }));
        } catch (e) {
            console.log('Error fetching studios:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (isAuthenticated && userId) {
                fetchStudios();
            }
        }, [isAuthenticated, userId])
    );

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

    const isDeleteConfirmed = deleteConfirmationText.trim() === selectedName.trim();

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
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="My Studio" />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
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
                        studios.map((studio) => (
                            <View key={studio.id} style={[styles.cardContainer, {
                                backgroundColor: colors.surface,
                                shadowColor: colors.primary,
                            }]}>
                                <View style={styles.imageWrapper}>
                                    <CachedImage
                                        uri={(studio.images && studio.images[0]) || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop'}
                                        style={styles.cardImage}
                                        width={800}
                                        height={384}
                                        quality={72}
                                        cacheVersion={studio.updated_at || studio.created_at || studio.id}
                                    />
                                    <View style={[styles.activeBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)' }]}>
                                        <Text style={[styles.activeText, { color: colors.primary }]}>Active</Text>
                                    </View>
                                </View>

                                <View style={styles.cardContent}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{studio.name}</Text>
                                    <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                        {studio.description}
                                    </Text>

                                    <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                        <View style={styles.actionLeft}>
                                            <TouchableOpacity activeOpacity={1}
                                                onPress={() => router.push({ pathname: '/manage_studio', params: { id: studio.id } })}
                                                style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                                            >
                                                <Ionicons name="settings-outline" size={18} color="#FFF" />
                                                <Text style={styles.manageBtnText}>Manage</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity activeOpacity={1}
                                                onPress={() => router.push({ pathname: '/edit_studio', params: { id: studio.id } })}
                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                            >
                                                <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                            </TouchableOpacity>
                                        </View>

                                        <TouchableOpacity activeOpacity={1}
                                            onPress={() => confirmDelete(studio.id, studio.name)}
                                            style={styles.deleteBtn}
                                        >
                                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
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
    deleteBtn: {
        padding: 8,
    },
});

