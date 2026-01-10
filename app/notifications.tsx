import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';


export default function NotificationsScreen() {
    const { colors, isDark } = useTheme();
    const [notifications, setNotifications] = useState([
        { id: 1, read: false, title: 'Booking Confirmed', message: 'Your booking at The Jazz Club is confirmed for June 15, 2024.', time: '2 hours ago', image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop', section: 'today' },
        { id: 2, read: false, title: 'Payment Received', message: '₱15,000 has been added to your wallet from Barasoain Church Wedding.', time: '5 hours ago', image: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&h=100&fit=crop', section: 'today' },
        { id: 3, read: true, title: 'New Booking Request', message: 'The Manila Sound Collective wants to book you for a corporate event.', time: 'Yesterday at 3:30 PM', image: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=100&h=100&fit=crop', section: 'yesterday' },
        { id: 4, read: true, title: 'Event Reminder', message: 'Your gig at BGC starts tomorrow at 8:00 PM. Don\'t forget your equipment!', time: 'Yesterday at 10:00 AM', image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&h=100&fit=crop', section: 'yesterday' },
        { id: 5, read: true, title: 'Review Submitted', message: 'You received a 5-star review from The Acoustic Lounge.', time: 'Yesterday at 9:15 AM', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop', section: 'yesterday' },
    ]);

    const markAsRead = (id: number) => {
        setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = () => {
        setNotifications(notifications.map(n => ({ ...n, read: true })));
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const todayNotifications = notifications.filter(n => n.section === 'today');
    const yesterdayNotifications = notifications.filter(n => n.section === 'yesterday');

    const getNotificationBg = (read: boolean) => {
        if (read) {
            return { backgroundColor: 'transparent' };
        }
        return { 
            backgroundColor: isDark ? 'rgba(29, 185, 84, 0.1)' : '#EFF6FF'
        };
    };

    return (
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Notifications"/>
        <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
            {/* Mark all as read button */}
            {unreadCount > 0 && (
                <TouchableOpacity 
                    className="flex-row items-center justify-end py-3"
                    onPress={markAllAsRead}
                >
                    <Ionicons name="checkmark-done" size={18} color={colors.primary} />
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.primary, marginLeft: 6 }}>
                        Mark all as read ({unreadCount})
                    </Text>
                </TouchableOpacity>
            )}

            <View className="pt-2">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.textSecondary, marginBottom: 12 }}>
                    Today
                </Text>

                {todayNotifications.map((notification) => (
                    <TouchableOpacity 
                        key={notification.id}
                        className="flex-row items-start gap-3 mb-4 p-3 rounded-lg"
                        style={getNotificationBg(notification.read)}
                        onPress={() => markAsRead(notification.id)}
                    >
                        {!notification.read && (
                            <View style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                        )}
                        <View className="w-16 h-16 rounded-lg overflow-hidden" style={{ backgroundColor: colors.inputBackground }}>
                            <Image 
                                source={{uri: notification.image}} 
                                style={{width: 64, height: 64}}
                                resizeMode="cover"
                            />
                        </View>
                        <View className="flex-1">
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>
                                {notification.title}
                            </Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                                {notification.message}
                            </Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>
                                {notification.time}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            <View className="pt-4">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.textSecondary, marginBottom: 12 }}>
                    Yesterday
                </Text>

                {yesterdayNotifications.map((notification) => (
                    <TouchableOpacity 
                        key={notification.id}
                        className="flex-row items-start gap-3 mb-4 p-3 rounded-lg"
                        style={getNotificationBg(notification.read)}
                        onPress={() => markAsRead(notification.id)}
                    >
                        {!notification.read && (
                            <View style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                        )}
                        <View className="w-16 h-16 rounded-lg overflow-hidden" style={{ backgroundColor: colors.inputBackground }}>
                            <Image 
                                source={{uri: notification.image}} 
                                style={{width: 64, height: 64}}
                                resizeMode="cover"
                            />
                        </View>
                        <View className="flex-1">
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>
                                {notification.title}
                            </Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                                {notification.message}
                            </Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: colors.muted, marginTop: 4 }}>
                                {notification.time}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>
    </View>
    );
}
