import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import CustomAlert, { AlertType } from './CustomAlert';
import { DEFAULT_AVATAR } from '../constants/Images';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

type TopbarNotification = {
    id: string;
    title: string;
    message: string;
    read: boolean;
    type?: 'success' | 'warning' | 'error' | 'info';
    created_at: string;
    meta?: any;
};

type AdminTab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit';

const resolveAdminTab = (pathname: string): AdminTab => {
    if (pathname.startsWith('/admin/permits')) return 'permits';
    if (pathname.startsWith('/admin/users')) return 'users';
    if (pathname.startsWith('/admin/reports')) return 'reports';
    if (pathname.startsWith('/admin/audit')) return 'audit';
    return 'dashboard';
};

export default function SidebarNav() {
    const { colors, isDark } = useTheme();
    const { isGuest, userRole, session, setGuestMode } = useAuth();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
    const [isNotificationsPanelOpen, setIsNotificationsPanelOpen] = useState(false);
    const [notifications, setNotifications] = useState<TopbarNotification[]>([]);
    const [loadingNotifications, setLoadingNotifications] = useState(false);
    const [processingTransferId, setProcessingTransferId] = useState<string | null>(null);
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: AlertType;
        title: string;
        message: string;
        buttons?: AlertButton[];
    }>({
        type: 'info',
        title: '',
        message: '',
    });

    const isAdminContext = useMemo(
        () => userRole === 'admin' || pathname === '/admin' || pathname.startsWith('/admin/'),
        [userRole, pathname],
    );

    const activeAdminTab = useMemo(() => resolveAdminTab(pathname), [pathname]);

    const fetchUnreadCount = useCallback(async (userId: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('manage-notifications', {
                body: { action: 'unread_count', userId }
            });

            if (!error) {
                setHasUnreadNotifications((data?.count || 0) > 0);
            } else {
                setHasUnreadNotifications(false);
            }
        } catch {
            setHasUnreadNotifications(false);
        }
    }, []);

    const fetchUserRole = useCallback(async () => {
        if (isGuest || !session?.user?.id) {
            setManageRoute('/manage');
            setAvatarUrl(null);
            setHasUnreadNotifications(false);
            return;
        }

        const userId = session.user.id;

        try {
            const { data, error } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId }
            });

            if (!error && data?.role) {
                if (data.role === 'studio-owner') {
                    setManageRoute('/my_studio');
                } else if (data.role === 'manager' || data.role === 'musician-member') {
                    setManageRoute('/my_group');
                } else if (data.role === 'venue-owner') {
                    setManageRoute('/my_venue');
                } else if (data.role === 'admin') {
                    setManageRoute('/admin');
                } else {
                    setManageRoute('/manage');
                }
            } else {
                setManageRoute('/manage');
            }
        } catch (e) {
            setManageRoute('/manage');
        }

        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('avatar_url')
                .eq('id', userId)
                .maybeSingle();

            setAvatarUrl(profile?.avatar_url || null);
        } catch {
            setAvatarUrl(null);
        }

        await fetchUnreadCount(userId);
    }, [fetchUnreadCount, isGuest, session?.user?.id]);

    useEffect(() => {
        fetchUserRole();
    }, [fetchUserRole]);

    const fetchNotifications = useCallback(async () => {
        if (isGuest || !session?.user?.id) {
            setNotifications([]);
            setLoadingNotifications(false);
            return;
        }

        setLoadingNotifications(true);

        try {
            const { data, error } = await supabase.functions.invoke('manage-notifications', {
                body: { action: 'fetch', userId: session.user.id }
            });

            if (error) throw error;

            const next = Array.isArray(data) ? data : [];
            setNotifications(next);
            setHasUnreadNotifications(next.some((n: TopbarNotification) => !n.read));
        } catch {
            setNotifications([]);
        } finally {
            setLoadingNotifications(false);
        }
    }, [isGuest, session?.user?.id]);

    useEffect(() => {
        if (isGuest || !session?.user?.id) return;

        const userId = session.user.id;
        const channel = supabase
            .channel(`topbar-notifications:${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
                () => {
                    fetchUnreadCount(userId);
                    if (isNotificationsPanelOpen) {
                        fetchNotifications();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchNotifications, fetchUnreadCount, isGuest, isNotificationsPanelOpen, session?.user?.id]);

    const openNotificationsPanel = useCallback(() => {
        setIsNotificationsPanelOpen(true);
        fetchNotifications();
    }, [fetchNotifications]);

    const closeNotificationsPanel = useCallback(() => {
        setIsNotificationsPanelOpen(false);
    }, []);

    const markNotificationAsRead = useCallback(async (notificationId: string, currentReadStatus: boolean) => {
        if (currentReadStatus || !session?.user?.id) return;

        setNotifications((prev) => prev.map((entry) =>
            entry.id === notificationId ? { ...entry, read: true } : entry
        ));

        try {
            await supabase.functions.invoke('manage-notifications', {
                body: { action: 'mark_read', userId: session.user.id, notificationId }
            });
            await fetchUnreadCount(session.user.id);
        } catch {
            fetchNotifications();
        }
    }, [fetchNotifications, fetchUnreadCount, session?.user?.id]);

    const markAllNotificationsAsRead = useCallback(async () => {
        if (!session?.user?.id) return;

        setNotifications((prev) => prev.map((entry) => ({ ...entry, read: true })));
        setHasUnreadNotifications(false);

        try {
            await supabase.functions.invoke('manage-notifications', {
                body: { action: 'mark_read', userId: session.user.id, all: true }
            });
        } catch {
            fetchNotifications();
        }
    }, [fetchNotifications, session?.user?.id]);

    const isLeadershipTransfer = useCallback((notification: TopbarNotification) => {
        return notification?.meta?.type === 'leadership_transfer';
    }, []);

    const handleAcceptTransfer = useCallback((notification: TopbarNotification) => {
        const requestId = notification?.meta?.request_id;
        if (!requestId) {
            showAlert('error', 'Error', 'Invalid transfer request.');
            return;
        }

        showAlert(
            'warning',
            'Accept Leadership',
            `Accept leadership for "${notification?.meta?.group_name || 'this group'}"?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Accept',
                    onPress: async () => {
                        setProcessingTransferId(requestId);
                        try {
                            const { error } = await supabase.rpc('accept_leadership_transfer', { request_id: requestId });
                            if (error) throw error;

                            await markNotificationAsRead(notification.id, false);
                            fetchNotifications();
                            showAlert('success', 'Success', 'You are now the group leader.');
                        } catch (e: any) {
                            showAlert('error', 'Error', e?.message || 'Failed to accept transfer request.');
                        } finally {
                            setProcessingTransferId(null);
                        }
                    }
                }
            ]
        );
    }, [fetchNotifications, markNotificationAsRead]);

    const handleDeclineTransfer = useCallback((notification: TopbarNotification) => {
        const requestId = notification?.meta?.request_id;
        if (!requestId) {
            showAlert('error', 'Error', 'Invalid transfer request.');
            return;
        }

        showAlert(
            'warning',
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
                            const { error } = await supabase.rpc('decline_leadership_transfer', { request_id: requestId });
                            if (error) throw error;

                            await markNotificationAsRead(notification.id, false);
                            fetchNotifications();
                            showAlert('success', 'Declined', 'Leadership transfer request declined.');
                        } catch (e: any) {
                            showAlert('error', 'Error', e?.message || 'Failed to decline transfer request.');
                        } finally {
                            setProcessingTransferId(null);
                        }
                    }
                }
            ]
        );
    }, [fetchNotifications, markNotificationAsRead]);

    const formatNotificationTime = useCallback((dateString?: string) => {
        if (!dateString) return '';

        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        return date.toLocaleDateString();
    }, []);

    const panelUnreadCount = useMemo(
        () => notifications.filter((entry) => !entry.read).length,
        [notifications],
    );

    const activeTab = useMemo(() => {
        if (isAdminContext) return activeAdminTab;

        if (pathname.includes('home')) return 'home';
        if (pathname.includes('discover')) return 'discover';
        if (pathname.includes('bookings')) return 'activity';
        if (pathname.includes('ai_suggestions')) return 'ai-suggest';
        if (pathname.includes('profile') || pathname.includes('settings') || pathname.includes('wallet')) {
            return 'profile';
        }
        if (
            pathname === '/manage' ||
            pathname.startsWith('/manage/') ||
            pathname.includes('my_studio') ||
            pathname.includes('my_venue') ||
            pathname.includes('my_group') ||
            pathname.includes('manage_') ||
            pathname.includes('edit_') ||
            pathname.includes('add_')
        ) {
            return 'manage';
        }
        return 'home';
    }, [isAdminContext, activeAdminTab, pathname]);

    const navItems = useMemo(() => {
        if (isAdminContext) {
            return [
                { id: 'dashboard', icon: 'stats-chart', label: 'Dashboard', route: '/admin' },
                { id: 'permits', icon: 'document-text', label: 'Permits', route: '/admin/permits' },
                { id: 'users', icon: 'people', label: 'Users', route: '/admin/users' },
                { id: 'reports', icon: 'shield-checkmark', label: 'Reports', route: '/admin/reports' },
                { id: 'audit', icon: 'time', label: 'Audit', route: '/admin/audit' },
            ];
        }

        return [
            { id: 'home', icon: 'home', label: 'Home', route: '/home' },
            { id: 'discover', icon: 'compass', label: 'Discover', route: '/discover' },
            { id: 'ai-suggest', icon: 'sparkles', label: 'AI Discovery', route: '/ai_suggestions' },
            { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
            { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
        ];
    }, [isAdminContext, manageRoute]);

    const showAlert = (
        type: AlertType,
        title: string,
        message: string,
        buttons?: AlertButton[],
    ) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const performLogout = async () => {
        if (isLoggingOut) return;

        setIsLoggingOut(true);
        try {
            if (isGuest) {
                await setGuestMode(false);
                router.replace('/');
                return;
            }

            const { error } = await supabase.auth.signOut();
            if (error) {
                // Fallback to local sign-out when refresh token is already invalid.
                const { error: localError } = await supabase.auth.signOut({ scope: 'local' });
                if (localError) {
                    showAlert(
                        'error',
                        'Logout Failed',
                        localError.message || 'Unable to log out right now. Please try again.',
                    );
                    return;
                }
            }

            router.replace('/');
        } catch {
            showAlert('error', 'Logout Failed', 'Unable to log out right now. Please try again.');
        } finally {
            setIsLoggingOut(false);
        }
    };

    const handleLogout = () => {
        showAlert(
            'warning',
            isGuest ? 'Sign In' : 'Log Out',
            isGuest
                ? 'Leave guest mode and return to the sign-in page?'
                : 'Are you sure you want to log out of your account?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: isGuest ? 'Sign In' : 'Log Out',
                    style: 'destructive',
                    onPress: performLogout,
                },
            ],
        );
    };

    if (!isAdminContext) {
        return (
            <>
                <View
                    style={[
                        styles.topBarContainer,
                        {
                            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                            borderBottomColor: colors.border,
                        },
                    ]}
                >
                    <View style={styles.topBarContent}>
                        <View style={[styles.logoSection, styles.logoSectionTop]}>
                            <Image
                                source={require('../../assets/images/Musika-lokal-logo.png')}
                                style={[styles.logoImage, { tintColor: colors.primary }]}
                                resizeMode="contain"
                            />
                            <Text style={[styles.brandName, { color: colors.text }]}>MusikaLokal</Text>
                        </View>

                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.topNavContainer}
                            style={styles.topNavScroll}
                        >
                            {navItems.map((item) => {
                                const isActive = activeTab === item.id;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={[
                                            styles.topNavItem,
                                            isActive && {
                                                backgroundColor: isDark
                                                    ? 'rgba(255,255,255,0.08)'
                                                    : 'rgba(0,0,0,0.05)',
                                            },
                                        ]}
                                        onPress={() => {
                                            if (!item.route) return;
                                            router.replace(item.route as any);
                                        }}
                                    >
                                        <Ionicons
                                            name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                            size={18}
                                            color={isActive ? colors.primary : colors.textSecondary}
                                        />
                                        <Text
                                            style={[
                                                styles.topNavLabel,
                                                { color: isActive ? colors.primary : colors.text },
                                                isActive && { fontFamily: 'Poppins_600SemiBold' },
                                            ]}
                                        >
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <View style={styles.topActions}>
                            {!isGuest && (
                                <View style={styles.topCommActions}>
                                    <TouchableOpacity
                                        style={[
                                            styles.topIconButton,
                                            {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                                                borderColor: colors.border,
                                            },
                                        ]}
                                        onPress={() => router.push('/chat')}
                                    >
                                        <Ionicons name="chatbubbles-outline" size={19} color={colors.textSecondary} />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[
                                            styles.topIconButton,
                                            {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
                                                borderColor: colors.border,
                                            },
                                        ]}
                                        onPress={openNotificationsPanel}
                                    >
                                        <Ionicons name="notifications-outline" size={19} color={colors.textSecondary} />
                                        {hasUnreadNotifications && (
                                            <View style={[styles.topIconBadge, { borderColor: isDark ? '#1F2937' : '#FFFFFF' }]} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}

                            <TouchableOpacity
                                style={[styles.avatarButton, { borderColor: colors.border }]}
                                onPress={() => router.replace('/profile')}
                            >
                                <Image
                                    source={avatarUrl ? { uri: avatarUrl } : DEFAULT_AVATAR}
                                    style={styles.avatarImage}
                                />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.topLogoutButton} onPress={handleLogout}>
                                <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
                                <Text style={[styles.topLogoutLabel, { color: colors.textSecondary }]}>
                                    {isGuest ? 'Sign In' : 'Log Out'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <Modal
                    visible={isNotificationsPanelOpen}
                    transparent
                    animationType="fade"
                    onRequestClose={closeNotificationsPanel}
                >
                    <View style={styles.notificationModalRoot}>
                        <TouchableOpacity
                            activeOpacity={1}
                            style={styles.notificationBackdrop}
                            onPress={closeNotificationsPanel}
                        />

                        <View
                            style={[
                                styles.notificationPanel,
                                {
                                    backgroundColor: isDark ? '#111827' : '#FFFFFF',
                                    borderLeftColor: colors.border,
                                    borderTopColor: colors.border,
                                },
                            ]}
                        >
                            <View style={styles.notificationPanelHeader}>
                                <View style={styles.notificationPanelTitleWrap}>
                                    <Ionicons name="notifications" size={18} color={colors.primary} />
                                    <Text style={[styles.notificationPanelTitle, { color: colors.text }]}>Notifications</Text>
                                    {panelUnreadCount > 0 && (
                                        <View style={[styles.notificationCountBadge, { backgroundColor: `${colors.primary}20` }]}>
                                            <Text style={[styles.notificationCountText, { color: colors.primary }]}> 
                                                {panelUnreadCount}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <TouchableOpacity activeOpacity={1} onPress={closeNotificationsPanel} style={styles.notificationCloseButton}>
                                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>

                            {panelUnreadCount > 0 && (
                                <TouchableOpacity activeOpacity={1} onPress={markAllNotificationsAsRead} style={styles.notificationMarkAllButton}>
                                    <Text style={[styles.notificationMarkAllText, { color: colors.primary }]}>Mark all as read</Text>
                                </TouchableOpacity>
                            )}

                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.notificationListContent}>
                                {loadingNotifications ? (
                                    <View style={styles.notificationLoadingWrap}>
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    </View>
                                ) : notifications.length === 0 ? (
                                    <View style={styles.notificationEmptyWrap}>
                                        <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
                                        <Text style={[styles.notificationEmptyTitle, { color: colors.text }]}>No notifications yet</Text>
                                        <Text style={[styles.notificationEmptySubtitle, { color: colors.textSecondary }]}>Updates will show up here instantly.</Text>
                                    </View>
                                ) : (
                                    notifications.map((notification) => {
                                        const isTransfer = isLeadershipTransfer(notification);
                                        const transferRequestId = notification?.meta?.request_id;

                                        return (
                                            <TouchableOpacity
                                                activeOpacity={isTransfer ? 1 : 0.78}
                                                key={notification.id}
                                                style={[
                                                    styles.notificationItem,
                                                    {
                                                        backgroundColor: notification.read
                                                            ? (isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC')
                                                            : (isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'),
                                                        borderColor: colors.border,
                                                    },
                                                ]}
                                                onPress={() => {
                                                    if (!isTransfer) {
                                                        markNotificationAsRead(notification.id, notification.read);
                                                    }
                                                }}
                                            >
                                                <View style={styles.notificationItemHeader}>
                                                    <View style={[styles.notificationTypeDot, {
                                                        backgroundColor:
                                                            notification.type === 'success' ? '#10B981' :
                                                                notification.type === 'warning' ? '#F59E0B' :
                                                                    notification.type === 'error' ? '#EF4444' : '#3B82F6',
                                                    }]} />
                                                    <Text style={[styles.notificationItemTitle, { color: colors.text }]} numberOfLines={1}>
                                                        {notification.title || 'Notification'}
                                                    </Text>
                                                    {!notification.read && <View style={[styles.notificationUnreadDot, { backgroundColor: colors.primary }]} />}
                                                </View>

                                                <Text style={[styles.notificationItemMessage, { color: colors.textSecondary }]} numberOfLines={isTransfer ? undefined : 2}>
                                                    {notification.message || 'You have a new update.'}
                                                </Text>

                                                <Text style={[styles.notificationItemTime, { color: colors.textSecondary }]}>
                                                    {formatNotificationTime(notification.created_at)}
                                                </Text>

                                                {isTransfer && !notification.read && (
                                                    <View style={styles.notificationActionRow}>
                                                        {processingTransferId === transferRequestId ? (
                                                            <ActivityIndicator size="small" color={colors.primary} />
                                                        ) : (
                                                            <>
                                                                <TouchableOpacity
                                                                    activeOpacity={1}
                                                                    style={[styles.notificationActionButton, { borderColor: colors.border, backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
                                                                    onPress={() => handleDeclineTransfer(notification)}
                                                                >
                                                                    <Text style={[styles.notificationActionText, { color: colors.text }]}>Decline</Text>
                                                                </TouchableOpacity>

                                                                <TouchableOpacity
                                                                    activeOpacity={1}
                                                                    style={[styles.notificationActionButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                                                                    onPress={() => handleAcceptTransfer(notification)}
                                                                >
                                                                    <Text style={[styles.notificationActionText, { color: '#FFFFFF' }]}>Accept</Text>
                                                                </TouchableOpacity>
                                                            </>
                                                        )}
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

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

    return (
        <>
            <View style={[styles.sidebarContainer, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderRightColor: colors.border }]}>
                {/* Logo area */}
                <View style={styles.logoSection}>
                    <Image
                        source={require('../../assets/images/Musika-lokal-logo.png')}
                        style={[styles.logoImage, { tintColor: colors.primary }]}
                        resizeMode="contain"
                    />
                    <Text style={[styles.brandName, { color: colors.text }]}>MusikaLokal</Text>
                </View>

                {/* Navigation Links */}
                <ScrollView style={styles.navContainer}>
                    {navItems.map(item => {
                        const isActive = activeTab === item.id;
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[
                                    styles.navItem,
                                    isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                                ]}
                                onPress={() => {
                                    if (!item.route) return;
                                    router.replace(item.route as any);
                                }}
                            >
                                <Ionicons
                                    name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                    size={22}
                                    color={isActive ? colors.primary : colors.textSecondary}
                                    style={{ width: 30 }}
                                />
                                <Text style={[
                                    styles.navLabel,
                                    { color: isActive ? colors.primary : colors.text },
                                    isActive && { fontFamily: 'Poppins_600SemiBold' }
                                ]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Footer / User Area */}
                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} style={{ width: 30 }} />
                        <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
                            {isGuest ? 'Sign In' : 'Log Out'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

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
    topBarContainer: {
        width: '100%',
        borderBottomWidth: 1,
        zIndex: 100,
    },
    topBarContent: {
        minHeight: 74,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        gap: 14,
    },
    topNavScroll: {
        flex: 1,
    },
    topNavContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingRight: 12,
    },
    topNavItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    topNavLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    topActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    topCommActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    topIconButton: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    topIconBadge: {
        position: 'absolute',
        top: 7,
        right: 7,
        width: 9,
        height: 9,
        borderRadius: 999,
        backgroundColor: '#EF4444',
        borderWidth: 1.5,
    },
    notificationModalRoot: {
        flex: 1,
        position: 'relative',
    },
    notificationBackdrop: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(2, 6, 23, 0.45)',
    },
    notificationPanel: {
        position: 'absolute',
        right: 0,
        top: 74,
        bottom: 0,
        width: '92%',
        maxWidth: 430,
        borderLeftWidth: 1,
        borderTopWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 18,
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 20,
    },
    notificationPanelHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    notificationPanelTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notificationPanelTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    notificationCountBadge: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    notificationCountText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    notificationCloseButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationMarkAllButton: {
        alignSelf: 'flex-end',
        marginBottom: 8,
    },
    notificationMarkAllText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    notificationListContent: {
        paddingBottom: 20,
        gap: 10,
    },
    notificationLoadingWrap: {
        paddingTop: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationEmptyWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 28,
        paddingHorizontal: 12,
    },
    notificationEmptyTitle: {
        marginTop: 8,
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    notificationEmptySubtitle: {
        marginTop: 4,
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    notificationItem: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    notificationItemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    notificationTypeDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
    },
    notificationItemTitle: {
        flex: 1,
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
    },
    notificationUnreadDot: {
        width: 7,
        height: 7,
        borderRadius: 999,
    },
    notificationItemMessage: {
        marginTop: 5,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: 'Poppins_400Regular',
    },
    notificationItemTime: {
        marginTop: 6,
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    notificationActionRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    notificationActionButton: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    notificationActionText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    avatarButton: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    topLogoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
    },
    topLogoutLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    sidebarContainer: {
        width: 260,
        height: '100%',
        borderRightWidth: 1,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
    },
    logoSection: {
        padding: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    logoSectionTop: {
        padding: 0,
        gap: 10,
        minWidth: 190,
    },
    logoImage: {
        width: 36,
        height: 36,
    },
    brandName: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    navContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 12,
        marginBottom: 6,
    },
    navLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 10,
    },
    footer: {
        padding: 24,
        borderTopWidth: 1,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
    }
});
