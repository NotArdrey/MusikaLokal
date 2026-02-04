import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    RefreshControl,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';


export default function NotificationsScreen() {
    const { colors, isDark } = useTheme();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase.functions.invoke('manage-notifications', {
                body: { action: 'fetch', userId: user.id }
            });

            if (error) throw error;
            setNotifications(data || []);
        } catch (e) {
            console.log('Error fetching notifications:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            fetchNotifications();
        }, [fetchNotifications])
    );

    const onRefresh = React.useCallback(() => {
        setRefreshing(true);
        fetchNotifications();
    }, []);

    const markAsRead = async (id: string, currentReadStatus: boolean) => {
        if (currentReadStatus) return; // Already read

        // Optimistic update
        setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            await supabase.functions.invoke('manage-notifications', {
                body: { action: 'mark_read', userId: user.id, notificationId: id }
            });
        } catch (e) {
            console.log('Error marking as read:', e);
        }
    };

    const markAllAsRead = async () => {
        // Optimistic update
        setNotifications(notifications.map(n => ({ ...n, read: true })));

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            await supabase.functions.invoke('manage-notifications', {
                body: { action: 'mark_read', userId: user.id, all: true }
            });
        } catch (e) {
            console.log('Error marking all as read:', e);
        }
    };

    // Leadership Transfer Handlers
    const handleAcceptTransfer = async (notification: any) => {
        const requestId = notification.meta?.request_id;
        if (!requestId) {
            Alert.alert('Error', 'Invalid transfer request');
            return;
        }

        Alert.alert(
            'Accept Leadership',
            `Are you sure you want to become the leader of "${notification.meta?.group_name || 'this group'}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Accept',
                    onPress: async () => {
                        setProcessingTransferId(requestId);
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            const { error } = await supabase.rpc('accept_leadership_transfer', {
                                request_id: requestId
                            });

                            if (error) throw error;

                            // Send notifications
                            const { data: request } = await supabase
                                .from('leadership_transfer_requests')
                                .select('from_user_id, group_id, groups:group_id(name, images)')
                                .eq('id', requestId)
                                .single();

                            if (request) {
                                // Get current user's profile for the avatar
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('avatar_url')
                                    .eq('id', user?.id)
                                    .single();

                                const groupImage = (request.groups as any)?.images?.[0];
                                const userAvatar = profile?.avatar_url;

                                // Notify old leader
                                await supabase.functions.invoke('manage-listings', {
                                    body: {
                                        action: 'create_notification',
                                        userId: user?.id,
                                        targetUserId: request.from_user_id,
                                        type: 'success',
                                        title: 'Leadership Transfer Accepted',
                                        message: `Your leadership transfer request for "${(request.groups as any)?.name}" was accepted.`,
                                        image: userAvatar || groupImage,
                                        meta: { type: 'leadership_transfer_accepted', group_id: request.group_id }
                                    }
                                });

                                // Notify group members
                                const { data: members } = await supabase
                                    .from('group_members')
                                    .select('user_id')
                                    .eq('group_id', request.group_id)
                                    .neq('user_id', request.from_user_id);

                                if (members && members.length > 0 && user) {
                                    const memberNotifications = members
                                        .filter(m => m.user_id !== user.id)
                                        .map(m => ({
                                            user_id: m.user_id,
                                            type: 'info',
                                            title: 'Group Leadership Changed',
                                            message: `"${(request.groups as any)?.name}" has a new leader.`,
                                            image: groupImage || userAvatar,
                                            meta: { type: 'leadership_changed', group_id: request.group_id }
                                        }));

                                    if (memberNotifications.length > 0) {
                                        await supabase.functions.invoke('manage-listings', {
                                            body: {
                                                action: 'create_notifications',
                                                userId: user?.id,
                                                notifications: memberNotifications
                                            }
                                        });
                                    }
                                }
                            }

                            Alert.alert('Success', 'You are now the group leader!');

                            // Mark notification as processed/read
                            markAsRead(notification.id, false);
                            fetchNotifications();

                        } catch (e: any) {
                            console.error('Error accepting transfer:', e);
                            Alert.alert('Error', e.message || 'Failed to accept transfer');
                        } finally {
                            setProcessingTransferId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleDeclineTransfer = async (notification: any) => {
        const requestId = notification.meta?.request_id;
        if (!requestId) {
            Alert.alert('Error', 'Invalid transfer request');
            return;
        }

        Alert.alert(
            'Decline Leadership',
            'Are you sure you want to decline this leadership transfer?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Decline',
                    style: 'destructive',
                    onPress: async () => {
                        setProcessingTransferId(requestId);
                        try {
                            const { data: { user } } = await supabase.auth.getUser();
                            const { error } = await supabase.rpc('decline_leadership_transfer', {
                                request_id: requestId
                            });

                            if (error) throw error;

                            // Notify old leader
                            const { data: request } = await supabase
                                .from('leadership_transfer_requests')
                                .select('from_user_id, group_id, groups:group_id(name, images)')
                                .eq('id', requestId)
                                .single();

                            if (request) {
                                // Get current user's profile for the avatar
                                const { data: profile } = await supabase
                                    .from('profiles')
                                    .select('avatar_url')
                                    .eq('id', user?.id)
                                    .single();

                                const groupImage = (request.groups as any)?.images?.[0];
                                const userAvatar = profile?.avatar_url;

                                await supabase.functions.invoke('manage-listings', {
                                    body: {
                                        action: 'create_notification',
                                        userId: user?.id,
                                        targetUserId: request.from_user_id,
                                        type: 'warning',
                                        title: 'Leadership Transfer Declined',
                                        message: `Your leadership transfer request for "${(request.groups as any)?.name}" was declined.`,
                                        image: userAvatar || groupImage,
                                        meta: { type: 'leadership_transfer_declined' }
                                    }
                                });
                            }

                            Alert.alert('Declined', 'Leadership transfer request has been declined.');
                            markAsRead(notification.id, false);
                            fetchNotifications();

                        } catch (e: any) {
                            console.error('Error declining transfer:', e);
                            Alert.alert('Error', e.message || 'Failed to decline transfer');
                        } finally {
                            setProcessingTransferId(null);
                        }
                    }
                }
            ]
        );
    };

    const isLeadershipTransfer = (notification: any) => {
        return notification.meta?.type === 'leadership_transfer';
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);

        if (diffHrs < 24) {
            if (diffHrs < 1) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
            }
            return `${Math.floor(diffHrs)}h ago`;
        }
        return date.toLocaleDateString();
    };

    const today = new Date().toDateString();
    const todayNotifications = notifications.filter(n => new Date(n.created_at).toDateString() === today);
    const earlierNotifications = notifications.filter(n => new Date(n.created_at).toDateString() !== today);

    const sections = [
        { title: 'Today', data: todayNotifications },
        { title: 'Earlier', data: earlierNotifications }
    ].filter(section => section.data.length > 0);

    const NotificationItem = ({ item }: { item: any }) => {
        const isTransfer = isLeadershipTransfer(item);
        const isRead = item.read;

        return (
            <TouchableOpacity
                style={[
                    styles.notificationItem,
                    {
                        backgroundColor: isRead ? 'transparent' : (isDark ? 'rgba(99, 102, 241, 0.05)' : '#F0F4FF'),
                        borderLeftWidth: isRead ? 0 : 4,
                        borderLeftColor: colors.primary,
                        opacity: isRead ? 0.7 : 1,
                    }
                ]}
                onPress={() => !isTransfer && markAsRead(item.id, item.read)}
                activeOpacity={isTransfer ? 1 : 0.7}
            >
                <View style={styles.notificationContent}>
                    <View style={styles.leftContent}>
                        <View style={[styles.avatarContainer, { borderColor: colors.border }]}>
                            <Image
                                source={{ uri: item.image || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop' }}
                                style={styles.avatarImage}
                                resizeMode="cover"
                            />
                            {/* Icon Badge */}
                            <View style={[styles.iconBadge, {
                                backgroundColor: item.type === 'success' ? '#10B981' :
                                    item.type === 'warning' ? '#F59E0B' :
                                        item.type === 'error' ? '#EF4444' : '#3B82F6',
                                borderColor: colors.card
                            }]}>
                                <Ionicons
                                    name={
                                        item.type === 'success' ? "checkmark" :
                                            item.type === 'warning' ? "alert" :
                                                item.type === 'error' ? "warning" : "information"
                                    }
                                    size={8}
                                    color="white"
                                />
                            </View>
                        </View>
                    </View>

                    <View style={styles.rightContent}>
                        <View style={styles.headerRow}>
                            <Text
                                style={[
                                    styles.titleText,
                                    {
                                        color: colors.text,
                                        fontFamily: isRead ? 'Poppins_500Medium' : 'Poppins_600SemiBold'
                                    }
                                ]}
                                numberOfLines={1}
                            >
                                {item.title}
                            </Text>
                            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                                {formatTime(item.created_at)}
                            </Text>
                        </View>

                        <Text
                            style={[
                                styles.messageText,
                                { color: colors.textSecondary }
                            ]}
                            numberOfLines={isTransfer ? undefined : 2}
                        >
                            {item.message}
                        </Text>

                        {isTransfer && !isRead && (
                            <View style={styles.actionButtonsContainer}>
                                {processingTransferId === item.meta?.request_id ? (
                                    <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
                                ) : (
                                    <View style={styles.actionButtonsRow}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.declineButton, { borderColor: colors.border }]}
                                            onPress={() => handleDeclineTransfer(item)}
                                        >
                                            <Text style={[styles.actionButtonText, { color: colors.text }]}>Decline</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.acceptButton]}
                                            onPress={() => handleAcceptTransfer(item)}
                                        >
                                            <Text style={[styles.actionButtonText, { color: 'white' }]}>Accept</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Header title="Notifications" />

            {unreadCount > 0 && (
                <View style={[styles.toolbar, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.unreadText, { color: colors.primary }]}>{unreadCount} unread</Text>
                    <TouchableOpacity onPress={markAllAsRead}>
                        <Text style={[styles.markReadText, { color: colors.textSecondary }]}>Mark all as read</Text>
                    </TouchableOpacity>
                </View>
            )}

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <NotificationItem item={item} />}
                renderSectionHeader={({ section: { title } }) => (
                    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                        <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>{title}</Text>
                    </View>
                )}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.emptyState}>
                            <View style={[styles.emptyIconContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F5F5' }]}>
                                <Ionicons name="notifications-outline" size={32} color={colors.textSecondary} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Notifications</Text>
                            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>We'll let you know when something update!</Text>
                        </View>
                    ) : null
                }
                ListFooterComponent={loading ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} /> : <View style={{ height: 100 }} />}
            />

            <View style={styles.navbarContainer}>
                <Navbar />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    unreadText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    markReadText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
    },
    listContent: {
        paddingTop: 10,
        paddingBottom: 100,
    },
    sectionHeader: {
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    sectionHeaderText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    notificationItem: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 1, // Separator line effect if distinct backgrounds, or just spacing
    },
    notificationContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    leftContent: {
        marginRight: 16,
    },
    rightContent: {
        flex: 1,
    },
    avatarContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        position: 'relative',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 22,
    },
    iconBadge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    titleText: {
        fontSize: 14,
        flex: 1,
        marginRight: 8,
    },
    timeText: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    messageText: {
        fontSize: 13,
        lineHeight: 20,
        fontFamily: 'Poppins_400Regular',
    },
    actionButtonsContainer: {
        marginTop: 12,
        width: '100%',
    },
    actionButtonsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    declineButton: {
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
    acceptButton: {
        backgroundColor: '#10B981',
    },
    actionButtonText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        fontFamily: 'Poppins_400Regular',
    },
    navbarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
});
