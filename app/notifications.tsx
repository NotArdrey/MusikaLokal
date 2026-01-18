import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function NotificationsScreen() {
    const { colors, isDark } = useTheme();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        fetchNotifications();
    }, []);

    const fetchNotifications = async () => {
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
    };

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
            // Revert on error? For now, keep it simple.
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

    const unreadCount = notifications.filter(n => !n.read).length;

    // Helper to format time (simple version)
    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHrs = diffMs / (1000 * 60 * 60);

        if (diffHrs < 24) {
            if (diffHrs < 1) return 'Just now';
            return `${Math.floor(diffHrs)}h ago`;
        }
        return date.toLocaleDateString();
    };

    // Group notifications (Simplified: Just listing them for now, or group by date if needed)
    // For simplicity, let's just show them in a single list or group strictly by "Today" vs "Earlier"
    const today = new Date().toDateString();

    const todayNotifications = notifications.filter(n => new Date(n.created_at).toDateString() === today);
    const earlierNotifications = notifications.filter(n => new Date(n.created_at).toDateString() !== today);

    const sections = [
        { title: 'Today', data: todayNotifications },
        { title: 'Earlier', data: earlierNotifications }
    ];

    return (
        <View style={[styles.flex1, { backgroundColor: colors.background }]}>
            <Header title="Notifications" />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Mark all as read button */}
                {unreadCount > 0 && (
                    <View style={styles.markAllContainer}>
                        <TouchableOpacity
                            style={[
                                styles.markAllBtn,
                                { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF' }
                            ]}
                            onPress={markAllAsRead}
                        >
                            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
                            <Text style={[styles.markAllText, { color: colors.primary }]}>
                                Mark all as read
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {loading && notifications.length === 0 ? (
                    <View style={styles.loadingContainer}>
                        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
                    </View>
                ) : (
                    sections.map(section => {
                        if (section.data.length === 0) return null;

                        return (
                            <View key={section.title} style={{ marginBottom: 8 }}>
                                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                                    {section.title}
                                </Text>

                                {section.data.map((notification) => (
                                    <TouchableOpacity
                                        key={notification.id}
                                        style={[
                                            styles.notificationItem,
                                            {
                                                backgroundColor: notification.read ? 'transparent' : (isDark ? 'rgba(30, 41, 59, 0.5)' : '#F5F7FF'),
                                                borderColor: notification.read ? 'transparent' : (isDark ? colors.border : '#E0E7FF')
                                            }
                                        ]}
                                        onPress={() => markAsRead(notification.id, notification.read)}
                                    >
                                        <View style={styles.avatarWrapper}>
                                            <View style={[styles.avatarContainer, { borderColor: colors.border }]}>
                                                <Image
                                                    source={{ uri: notification.image || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop' }}
                                                    style={styles.avatarImage}
                                                    resizeMode="cover"
                                                />
                                            </View>
                                            {/* Status indicator badge based on type */}
                                            <View style={[styles.statusBadge, { backgroundColor: colors.card, borderColor: colors.card }]}>
                                                {notification.type === 'success' && <Ionicons name="checkmark-circle" size={14} color="#10B981" />}
                                                {notification.type === 'warning' && <Ionicons name="alert-circle" size={14} color="#F59E0B" />}
                                                {notification.type === 'info' && <Ionicons name="information-circle" size={14} color="#3B82F6" />}
                                                {(!notification.type || notification.type === 'error') && <Ionicons name="information-circle" size={14} color="#EF4444" />}
                                            </View>
                                        </View>

                                        <View style={styles.textContainer}>
                                            <View style={styles.headerRow}>
                                                <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={1}>
                                                    {notification.title}
                                                </Text>
                                                <Text style={[styles.timeText, { color: colors.textSecondary }]}>
                                                    {formatTime(notification.created_at)}
                                                </Text>
                                            </View>

                                            <Text style={[styles.messageText, { color: notification.read ? colors.textSecondary : colors.text }]} numberOfLines={2}>
                                                {notification.message}
                                            </Text>
                                        </View>

                                        {!notification.read && (
                                            <View style={styles.unreadDot} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        );
                    })
                )}

                {!loading && notifications.length === 0 && (
                    <View style={styles.emptyState}>
                        <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
                        <Text style={{ marginTop: 8, color: colors.textSecondary }}>No notifications yet</Text>
                    </View>
                )}
            </ScrollView>

            <View style={styles.navbarContainer}>
                <Navbar />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 100,
    },
    markAllContainer: {
        paddingHorizontal: 24,
        paddingVertical: 8,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    markAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 100,
    },
    markAllText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        marginLeft: 6,
    },
    loadingContainer: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    sectionTitle: {
        paddingHorizontal: 24,
        marginBottom: 12,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontFamily: 'Poppins_600SemiBold',
    },
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 16,
        marginHorizontal: 8,
        borderRadius: 16,
        marginBottom: 8,
        borderWidth: 1,
    },
    avatarWrapper: {
        position: 'relative',
        marginRight: 16,
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    statusBadge: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
    },
    textContainer: {
        flex: 1,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    titleText: {
        flex: 1,
        marginRight: 8,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    timeText: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 10,
    },
    messageText: {
        fontSize: 12,
        marginTop: 4,
        lineHeight: 20,
        fontFamily: 'Poppins_400Regular',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#6366F1', // primary-500
        marginLeft: 8,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
        opacity: 0.5,
    },
    navbarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
});
