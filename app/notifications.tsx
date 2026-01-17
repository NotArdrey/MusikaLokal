import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function NotificationsScreen() {
    const { colors, isDark } = useTheme();
    const [notifications, setNotifications] = useState([
        { id: 1, read: false, type: 'success', title: 'Booking Confirmed', message: 'Your booking at The Jazz Club is confirmed for June 15, 2024.', time: '2h ago', image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop', section: 'Today' },
        { id: 2, read: false, type: 'info', title: 'Payment Received', message: '₱15,000 has been added to your wallet from Barasoain Church Wedding.', time: '5h ago', image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&h=100&fit=crop', section: 'Today' },
        { id: 3, read: true, type: 'warning', title: 'New Booking Request', message: 'The Manila Sound Collective wants to book you for a corporate event.', time: 'Yesterday', image: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=100&h=100&fit=crop', section: 'Yesterday' },
        { id: 4, read: true, type: 'info', title: 'Event Reminder', message: 'Your gig at BGC starts tomorrow at 8:00 PM. Don\'t forget your equipment!', time: 'Yesterday', image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&h=100&fit=crop', section: 'Yesterday' },
        { id: 5, read: true, type: 'success', title: 'Review Submitted', message: 'You received a 5-star review from The Acoustic Lounge.', time: 'Yesterday', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', section: 'Yesterday' },
    ]);

    const markAsRead = (id: number) => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    // Group notifications by section (Today, Yesterday, etc)
    const sections = ['Today', 'Yesterday'];

    return (
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
            <Header title="Notifications" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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

                {sections.map(section => {
                    const sectionNotifications = notifications.filter(n => n.section === section);
                    if (sectionNotifications.length === 0) return null;

                    return (
                        <View key={section} className="mb-2">
                            <Text className="px-6 mb-3 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>
                                {section}
                            </Text>

                            {sectionNotifications.map((notification) => (
                                <TouchableOpacity
                                    key={notification.id}
                                    className={`flex-row items-center px-6 py-4 mx-2 rounded-2xl mb-2 border ${notification.read ? 'border-transparent' : 'border-indigo-100 bg-indigo-50/50'}`}
                                    style={{
                                        backgroundColor: notification.read ? 'transparent' : (isDark ? 'rgba(30, 41, 59, 0.5)' : '#F5F7FF'),
                                        borderColor: notification.read ? 'transparent' : (isDark ? colors.border : '#E0E7FF')
                                    }}
                                    onPress={() => markAsRead(notification.id)}
                                >
                                    <View className="relative mr-4">
                                        <View className="w-12 h-12 rounded-full overflow-hidden border" style={{ borderColor: colors.border }}>
                                            <Image
                                                source={{ uri: notification.image }}
                                                className="w-full h-full"
                                                resizeMode="cover"
                                            />
                                        </View>
                                        {/* Status indicator badge based on type */}
                                        <View className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center border-[2px]" style={{ backgroundColor: colors.card, borderColor: colors.card }}>
                                            {notification.type === 'success' && <Ionicons name="checkmark-circle" size={14} color="#10B981" />}
                                            {notification.type === 'warning' && <Ionicons name="alert-circle" size={14} color="#F59E0B" />}
                                            {notification.type === 'info' && <Ionicons name="information-circle" size={14} color="#3B82F6" />}
                                        </View>
                                    </View>

                                    <View className="flex-1">
                                        <View className="flex-row justify-between items-start">
                                            <Text className="flex-1 mr-2 text-sm" numberOfLines={1} style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                                {notification.title}
                                            </Text>
                                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 10, color: colors.textSecondary }}>
                                                {notification.time}
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
                })}
            </ScrollView>

            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
                <Navbar />
            </View>
        </View>
    );
}
