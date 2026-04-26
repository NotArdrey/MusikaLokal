import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CachedImage from '../src/components/CachedImage';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import Skeleton from '../src/components/Skeleton';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useAuth, useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function MyGroupScreen() {
    const { colors, isDark } = useTheme();
    const { contentBottomPadding } = useBottomBarClearance(24);
    const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
    const { userRole } = useAuth();
    const isMusicianView = userRole === 'musician';
    const params = useLocalSearchParams<{ refresh?: string }>();
    const refreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedName, setSelectedName] = useState('');
    const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
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

    const isMissingRelationError = (error: any, relationName: string) => {
        const message = String(error?.message || '').toLowerCase();
        return error?.code === '42P01' && message.includes(relationName.toLowerCase());
    };

    const isMissingFunctionError = (error: any, functionName: string) => {
        const message = String(error?.message || '').toLowerCase();
        return error?.code === '42883' && message.includes(functionName.toLowerCase());
    };

    const fetchGroups = async () => {
        if (!userId) return;
        try {
            let groupRows: any[] = [];
            const membershipRoleByGroupId = new Map<string, string>();

            const fetchOwnedGroups = async () => {
                const { data, error } = await supabase
                    .from('groups_with_stats')
                    .select('*')
                    .eq('owner_id', userId)
                    .order('created_at', { ascending: false });

                if (!error) {
                    return data || [];
                }

                if (isMissingRelationError(error, 'groups_with_stats')) {
                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('groups')
                        .select('id, owner_id, name, genre, description, location, latitude, longitude, rate, created_at, group_type')
                        .eq('owner_id', userId)
                        .order('created_at', { ascending: false });

                    if (fallbackError) throw fallbackError;

                    return (fallbackData || []).map((row: any) => ({
                        ...row,
                        rating: 0,
                        review_count: 0,
                        images: [],
                    }));
                }

                throw error;
            };

            const fetchGroupsByIds = async (groupIds: string[]) => {
                const { data, error } = await supabase
                    .from('groups_with_stats')
                    .select('*')
                    .in('id', groupIds)
                    .order('created_at', { ascending: false });

                if (!error) {
                    return data || [];
                }

                if (isMissingRelationError(error, 'groups_with_stats')) {
                    const { data: fallbackData, error: fallbackError } = await supabase
                        .from('groups')
                        .select('id, owner_id, name, genre, description, location, latitude, longitude, rate, created_at, group_type')
                        .in('id', groupIds)
                        .order('created_at', { ascending: false });

                    if (fallbackError) throw fallbackError;

                    return (fallbackData || []).map((row: any) => ({
                        ...row,
                        rating: 0,
                        review_count: 0,
                        images: [],
                    }));
                }

                throw error;
            };

            if (isMusicianView) {
                const { data: memberRows, error: memberError } = await supabase
                    .from('group_members')
                    .select('group_id, role')
                    .eq('user_id', userId);

                if (memberError) {
                    groupRows = await fetchOwnedGroups();
                    groupRows.forEach((row: any) => {
                        if (row?.id) {
                            membershipRoleByGroupId.set(row.id, row.owner_id === userId ? 'owner' : 'member');
                        }
                    });
                } else {
                    const joinedGroupIds = Array.from(
                        new Set(
                            (memberRows || [])
                                .map((row: any) => row?.group_id)
                                .filter((value: any): value is string => typeof value === 'string' && value.length > 0),
                        ),
                    );

                    (memberRows || []).forEach((row: any) => {
                        if (!row?.group_id) return;
                        membershipRoleByGroupId.set(
                            row.group_id,
                            String(row?.role || '').trim().toLowerCase() || 'member',
                        );
                    });

                    groupRows = joinedGroupIds.length > 0 ? await fetchGroupsByIds(joinedGroupIds) : [];
                }
            } else {
                groupRows = await fetchOwnedGroups();
            }

            const groupIds = groupRows.map((item: any) => item.id).filter(Boolean);

            let mediaByGroupId = new Map<string, string[]>();
            if (groupIds.length > 0) {
                const { data: mediaRows, error: mediaError } = await supabase
                    .from('group_media')
                    .select('group_id, media_url, sort_order, created_at')
                    .in('group_id', groupIds)
                    .eq('media_type', 'image')
                    .order('group_id', { ascending: true })
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true });

                if (mediaError) {
                }

                for (const row of mediaRows || []) {
                    const groupId = row.group_id as string;
                    const url = row.media_url as string;
                    if (!groupId || typeof url !== 'string' || url.trim().length === 0) continue;
                    if (!mediaByGroupId.has(groupId)) mediaByGroupId.set(groupId, []);
                    mediaByGroupId.get(groupId)!.push(url);
                }
            }

            setGroups(groupRows.map((item: any) => {
                const mediaImages = mediaByGroupId.get(item.id) || [];
                const membershipRole = membershipRoleByGroupId.get(item.id) || (item.owner_id === userId ? 'owner' : 'member');
                const isOwnerGroup = membershipRole === 'owner' || item.owner_id === userId;
                return {
                    ...item,
                    images: mediaImages.length > 0
                        ? mediaImages
                        : (Array.isArray(item.images) ? item.images : []),
                    rating: item.rating || 0,
                    review_count: item.review_count || 0,
                    membership_role: membershipRole,
                    is_owner: isOwnerGroup,
                };
            }));
        } catch (e) {
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (!isAuthenticated || !userId) return;

            fetchGroups();
            const refreshInterval = setInterval(() => {
                fetchGroups();
            }, 30000);

            return () => {
                clearInterval(refreshInterval);
            };
        }, [isAuthenticated, userId, refreshKey, isMusicianView])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchGroups();
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

    const normalizeForDeleteConfirmation = (value: string) =>
        String(value || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();

    const isDeleteConfirmed =
        normalizeForDeleteConfirmation(deleteConfirmationText) ===
        normalizeForDeleteConfirmation(selectedName);

    const handleDelete = async () => {
        if (!selectedId || !userId || deleting) return;
        if (!isDeleteConfirmed) {
            showAlert('warning', 'Confirmation Needed', `Please type "${selectedName}" exactly to confirm deletion.`);
            return;
        }
        setDeleting(true);
        try {
            const { data, error } = await supabase.rpc('delete_group_safely', {
                p_group_id: selectedId,
                p_reason: 'Deleted from My Group screen by owner',
            });

            let result: any = data;

            if (error) {
                if (isMissingFunctionError(error, 'delete_group_safely')) {
                    const { error: fallbackDeleteError } = await supabase
                        .from('groups')
                        .delete()
                        .eq('id', selectedId)
                        .eq('owner_id', userId);

                    if (fallbackDeleteError) throw fallbackDeleteError;
                    result = { success: true };
                } else {
                    throw error;
                }
            }

            if (!result?.success) {
                if (result?.code === 'ACTIVE_ACCEPTED_APPLICATIONS_EXIST') {
                    showAlert(
                        'warning',
                        'Delete Blocked',
                        `This group still has ${result.accepted_application_count || 0} accepted application(s)${(result.pending_application_count || 0) > 0 ? ` and ${result.pending_application_count} pending application(s)` : ''}. Resolve accepted applications first before deleting.`
                    );
                    closeDeleteModal();
                    return;
                }

                if (result?.code === 'PENDING_LEADERSHIP_TRANSFER_EXISTS') {
                    showAlert(
                        'warning',
                        'Delete Blocked',
                        `This group has ${result.pending_transfer_count || 0} pending leadership transfer request(s). Cancel pending transfer request(s) first before deleting.`
                    );
                    closeDeleteModal();
                    return;
                }

                if (result?.code === 'GROUP_NOT_FOUND') {
                    showAlert('warning', 'Not Found', 'Group was not found. It may have already been removed.');
                    setGroups(prev => prev.filter(g => g.id !== selectedId));
                    closeDeleteModal();
                    return;
                }

                throw new Error(result?.message || 'Delete failed');
            }

            setGroups(prev => prev.filter(g => g.id !== selectedId));
            closeDeleteModal();
            showAlert('success', 'Group Deleted', 'Group deleted successfully.');
        } catch (e) {
            showAlert('error', 'Error', 'Failed to delete group');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="My Group" />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
                    style={styles.flex1}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                        {isMusicianView && (
                            <View style={[styles.pageTabsWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                                {[{ key: 'group', label: 'My Group', route: '/my_group' }, { key: 'producer', label: 'My Producer', route: '/my_production' }, { key: 'venue', label: 'My Venue', route: '/my_venue' }].map((tab) => {
                                    const isActive = tab.key === 'group';
                                    return (
                                        <TouchableOpacity
                                            activeOpacity={1}
                                            key={tab.key}
                                            onPress={() => {
                                                if (!isActive) {
                                                    router.replace(tab.route as any);
                                                }
                                            }}
                                            style={[
                                                styles.pageTabBtn,
                                                isActive && { backgroundColor: colors.primary + '14', borderColor: colors.primary },
                                            ]}
                                        >
                                            <Text style={[styles.pageTabText, { color: isActive ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {loading ? (
                        <View style={styles.skeletonList}>
                            {[0, 1, 2].map((index) => (
                                <View
                                    key={`group-skeleton-${index}`}
                                    style={[styles.skeletonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                >
                                    <Skeleton width="100%" height={192} borderRadius={18} />
                                    <Skeleton width="62%" height={22} style={{ marginTop: 14 }} />
                                    <Skeleton width="100%" height={14} style={{ marginTop: 10 }} />
                                    <Skeleton width="78%" height={14} style={{ marginTop: 6 }} />
                                    <View style={styles.skeletonActionRow}>
                                        <Skeleton width={124} height={40} borderRadius={12} />
                                        <Skeleton width={40} height={40} borderRadius={12} />
                                        <Skeleton width={40} height={40} borderRadius={12} />
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : groups.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No groups found</Text>
                        </View>
                    ) : (
                        groups.map((group) => {
                            const canManageGroup = !isMusicianView || group.is_owner === true;

                            return (
                                <View key={group.id} style={[styles.cardContainer, {
                                    backgroundColor: colors.surface,
                                    shadowColor: colors.primary,
                                }]}> 
                                    <View style={styles.imageWrapper}>
                                        <CachedImage
                                            uri={(group.images && group.images[0]) || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&fit=crop'}
                                            style={styles.cardImage}
                                            width={800}
                                            height={384}
                                            quality={72}
                                            cacheVersion={group.updated_at || group.created_at || group.id}
                                        />
                                        <View style={[styles.activeBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)' }]}>
                                            <Text style={[styles.activeText, { color: colors.primary }]}>{canManageGroup ? 'Active' : 'Joined'}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.cardContent}>
                                        <Text style={[styles.cardTitle, { color: colors.text }]}>{group.name}</Text>
                                        <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                            {group.description}
                                        </Text>

                                        <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                            <View style={styles.actionLeft}>
                                                <TouchableOpacity activeOpacity={1}
                                                    onPress={() =>
                                                        canManageGroup
                                                            ? router.push({ pathname: '/manage_group', params: { id: group.id } })
                                                            : router.push({ pathname: '/group_details', params: { id: group.id } })
                                                    }
                                                    style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                                                >
                                                    <Ionicons name={canManageGroup ? 'settings-outline' : 'eye-outline'} size={18} color="#FFF" />
                                                    <Text style={styles.manageBtnText}>{canManageGroup ? 'Manage' : 'View'}</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity activeOpacity={1}
                                                    onPress={() => router.push({
                                                        pathname: '/chat',
                                                        params: {
                                                            isGroupChat: 'true',
                                                            groupChatId: group.id
                                                        }
                                                    })}
                                                    style={[styles.editBtn, { borderColor: colors.border }]}
                                                >
                                                    <Ionicons name="chatbubbles-outline" size={20} color={colors.text} />
                                                </TouchableOpacity>

                                                {canManageGroup ? (
                                                    <TouchableOpacity activeOpacity={1}
                                                        onPress={() => router.push({ pathname: '/edit_group', params: { id: group.id } })}
                                                        style={[styles.editBtn, { borderColor: colors.border }]}
                                                    >
                                                        <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>

                                            {canManageGroup ? (
                                                <TouchableOpacity activeOpacity={1}
                                                    onPress={() => confirmDelete(group.id, group.name)}
                                                    style={styles.deleteBtn}
                                                >
                                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </ScrollView>

                <Navbar />
            </View>
            <Modal
                visible={modalVisible}
                onClose={closeDeleteModal}
                title="Delete Group"
                message={`Type "${selectedName}" to confirm deleting this group.`}
                buttonText={deleting ? 'Deleting...' : 'Delete'}
                onConfirm={handleDelete}
                danger
                showInput
                inputMultiline={false}
                inputPlaceholder="Type group name"
                inputValue={deleteConfirmationText}
                onInputChange={setDeleteConfirmationText}
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
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 180,
        paddingTop: 16,
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

