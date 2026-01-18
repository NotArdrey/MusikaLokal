import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
            <Header title="Notifications" />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Mark all as read button */}
                {unreadCount > 0 && (
                    <View className="px-6 py-2 flex-row justify-end">
                        <TouchableOpacity
                            className="flex-row items-center justify-center py-2 px-4 rounded-full"
                            style={{ backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF' }}
                            onPress={markAllAsRead}
                        >
                            <Ionicons name="checkmark-done" size={16} color={colors.primary} />
                            <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 12, color: colors.primary, marginLeft: 6 }}>
                                Mark all as read
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {loading && notifications.length === 0 ? (
                    <View className="py-10 items-center">
                        <Text style={{ color: colors.textSecondary }}>Loading...</Text>
                    </View>
                ) : (
                    sections.map(section => {
                        if (section.data.length === 0) return null;

                        return (
                            <View key={section.title} className="mb-2">
                                <Text className="px-6 mb-3 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>
                                    {section.title}
                                </Text>

                                {section.data.map((notification) => (
                                    <TouchableOpacity
                                        key={notification.id}
                                        className={`flex-row items-center px-6 py-4 mx-2 rounded-2xl mb-2 border ${notification.read ? 'border-transparent' : 'border-indigo-100 bg-indigo-50/50'}`}
                                        style={{
                                            backgroundColor: notification.read ? 'transparent' : (isDark ? 'rgba(30, 41, 59, 0.5)' : '#F5F7FF'),
                                            borderColor: notification.read ? 'transparent' : (isDark ? colors.border : '#E0E7FF')
                                        }}
                                        onPress={() => markAsRead(notification.id, notification.read)}
                                    >
                                        <View className="relative mr-4">
                                            <View className="w-12 h-12 rounded-full overflow-hidden border" style={{ borderColor: colors.border }}>
                                                <Image
                                                    source={{ uri: notification.image || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop' }}
                                                    className="w-full h-full"
                                                    resizeMode="cover"
                                                />
                                            </View>
                                            {/* Status indicator badge based on type */}
                                            <View className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center border-[2px]" style={{ backgroundColor: colors.card, borderColor: colors.card }}>
                                                {notification.type === 'success' && <Ionicons name="checkmark-circle" size={14} color="#10B981" />}
                                                {notification.type === 'warning' && <Ionicons name="alert-circle" size={14} color="#F59E0B" />}
                                                {notification.type === 'info' && <Ionicons name="information-circle" size={14} color="#3B82F6" />}
                                                {(!notification.type || notification.type === 'error') && <Ionicons name="information-circle" size={14} color="#EF4444" />}
                                            </View>
                                        </View>

                                        <View className="flex-1">
                                            <View className="flex-row justify-between items-start">
                                                <Text className="flex-1 mr-2 text-sm" numberOfLines={1} style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                                    {notification.title}
                                                </Text>
                                                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 10, color: colors.textSecondary }}>
                                                    {formatTime(notification.created_at)}
                                                </Text>
                                            </View>

                                            <Text className="text-xs mt-1 leading-5" numberOfLines={2} style={{ fontFamily: 'Poppins_400Regular', color: notification.read ? colors.textSecondary : colors.text }}>
                                                {notification.message}
                                            </Text>
                                        </View>

                                        {!notification.read && (
                                            <View className="w-2 h-2 rounded-full bg-primary-500 ml-2" />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        );
                    })
                )}

                {!loading && notifications.length === 0 && (
                    <View className="items-center justify-center py-10 opacity-50">
                        <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} />
                        <Text className="mt-2" style={{ color: colors.textSecondary }}>No notifications yet</Text>
                    </View>
                )}
            </ScrollView>

            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                <Navbar />
            </View>
        </View>
    );
}
