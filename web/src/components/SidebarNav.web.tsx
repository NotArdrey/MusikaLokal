import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, LayoutAnimation, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import CustomAlert, { AlertType } from './CustomAlert';
import ProfileAvatar from './ProfileAvatar';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';
import { formatDashedNumericDate } from '../utils/friendlyDateTime';
import { resolveNotificationNavigationTarget } from '../utils/notificationNavigation';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

type AdminTab = 'dashboard' | 'users' | 'reports' | 'audit' | 'stations' | 'manage';
type UsersSection = 'users_list' | 'identity_reviews';
type ReportsSection = 'reports_list' | 'booking_incidents';

const USERS_SECTION_ITEMS: {
    key: UsersSection;
    label: string;
    description: string;
    icon: string;
}[] = [
        {
            key: 'users_list',
            label: 'User Management',
            description: 'Create, edit, verify, and manage user accounts',
            icon: 'people-outline',
        },
        {
            key: 'identity_reviews',
            label: 'Identity Reviews',
            description: 'Manual identity verification queue',
            icon: 'id-card-outline',
        },
    ];

const REPORTS_SECTION_ITEMS: {
    key: ReportsSection;
    label: string;
    description: string;
    icon: string;
}[] = [
        {
            key: 'reports_list',
            label: 'User Reports',
            description: 'Moderation queue for reported users and listings',
            icon: 'document-text-outline',
        },
        {
            key: 'booking_incidents',
            label: 'Booking Incidents',
            description: 'Disputes, refund reviews, and booking escalations',
            icon: 'alert-circle-outline',
        },
    ];

const resolveAdminTab = (pathname: string): AdminTab => {
    if (pathname.startsWith('/admin/identity-reviews')) return 'users';
    if (pathname.startsWith('/admin/users')) return 'users';
    if (pathname.startsWith('/admin/reports')) return 'reports';
    if (pathname.startsWith('/admin/audit')) return 'audit';
    if (pathname.startsWith('/admin/stations')) return 'stations';
    if (pathname.startsWith('/admin/manage')) return 'manage';
    return 'dashboard';
};

const resolveUsersSection = (pathname: string): UsersSection => {
    return pathname.startsWith('/admin/identity-reviews') ? 'identity_reviews' : 'users_list';
};

const resolveReportsSection = (search: string): ReportsSection => {
    const params = new URLSearchParams(search);
    return params.get('section') === 'booking_incidents' ? 'booking_incidents' : 'reports_list';
};

const getBrowserSearch = () => {
    if (typeof window === 'undefined') return '';
    return window.location.search;
};

const normalizeNotificationsPayload = (payload: unknown): TopbarNotification[] => {
    if (Array.isArray(payload)) {
        return payload as TopbarNotification[];
    }

    if (payload && typeof payload === 'object') {
        const source = payload as Record<string, unknown>;
        if (Array.isArray(source.items)) return source.items as TopbarNotification[];
        if (Array.isArray(source.data)) return source.data as TopbarNotification[];
    }

    return [];
};

export default function SidebarNav() {
    const { colors, isDark } = useTheme();
    const { isAdmin, isGuest, roleResolved, session, setGuestMode, userRole } = useAuth();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const [activeUsersSection, setActiveUsersSection] = useState<UsersSection>(() => resolveUsersSection(pathname));
    const [usersMenuExpanded, setUsersMenuExpanded] = useState(() => resolveAdminTab(pathname) === 'users');
    const [activeReportsSection, setActiveReportsSection] = useState<ReportsSection>(() => resolveReportsSection(getBrowserSearch()));
    const [reportsMenuExpanded, setReportsMenuExpanded] = useState(() => resolveAdminTab(pathname) === 'reports');
    const usersRotateAnim = useRef(new Animated.Value(usersMenuExpanded ? 1 : 0)).current;
    const rotateAnim = useRef(new Animated.Value(reportsMenuExpanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(usersRotateAnim, {
            toValue: usersMenuExpanded ? 1 : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [usersMenuExpanded, usersRotateAnim]);

    useEffect(() => {
        Animated.timing(rotateAnim, {
            toValue: reportsMenuExpanded ? 1 : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [reportsMenuExpanded, rotateAnim]);

    const usersChevronRotation = usersRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const usersSubmenuHeight = usersRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 250],
    });
    const usersSubmenuMarginTop = usersRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 8],
    });
    const usersSubmenuOpacity = usersRotateAnim.interpolate({
        inputRange: [0, 0.4, 1],
        outputRange: [0, 0, 1],
    });

    const chevronRotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const submenuHeight = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 250], // ~60 per item * 2 + 8px gap + padding
    });
    const submenuMarginTop = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 8],
    });
    const submenuOpacity = rotateAnim.interpolate({
        inputRange: [0, 0.4, 1],
        outputRange: [0, 0, 1],
    });

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
    const isFan = isFanUserRole(userRole);

    const activeAdminTab = useMemo(() => resolveAdminTab(pathname), [pathname]);

    useEffect(() => {
        const nextAdminTab = resolveAdminTab(pathname);
        setActiveUsersSection(resolveUsersSection(pathname));

        if (nextAdminTab === 'users') {
            setUsersMenuExpanded(true);
        }
    }, [pathname]);

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

    useEffect(() => {
        if (isGuest || isFan || !session?.user?.id) {
            setManageRoute('/manage');
            return;
        }

        if (!roleResolved) {
            setManageRoute('/manage');
            return;
        }

        setManageRoute(resolveRoleManageRoute(userRole, { adminRoute: isAdmin ? '/admin' : undefined }));
    }, [isAdmin, isFan, isGuest, roleResolved, session?.user?.id, userRole]);

    const refreshSidebarState = useCallback(async () => {
        if (isGuest || !session?.user?.id) {
            setAvatarUrl(null);
            setHasUnreadNotifications(false);
            return;
        }

        const userId = session.user.id;

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
        refreshSidebarState();
    }, [refreshSidebarState]);

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

            const next = normalizeNotificationsPayload(data);
            setNotifications(next);

            const unreadCount =
                data && typeof data === 'object' && !Array.isArray(data)
                    ? Number((data as { unreadCount?: number }).unreadCount ?? NaN)
                    : NaN;

            if (Number.isFinite(unreadCount)) {
                setHasUnreadNotifications(unreadCount > 0);
            } else {
                setHasUnreadNotifications(next.some((n: TopbarNotification) => !n.read));
            }
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

    const handleNotificationItemPress = useCallback(async (notification: any) => {
        try {
            await markNotificationAsRead(notification.id, notification.read);
        } catch (err) {
            console.warn('[SidebarNav] failed to mark notification as read:', err);
        }

        const target = resolveNotificationNavigationTarget(notification);
        if (!target || target.pathname === '/notifications') {
            return;
        }

        closeNotificationsPanel();

        if (target.params && Object.keys(target.params).length > 0) {
            router.push({ pathname: target.pathname as any, params: target.params } as any);
            return;
        }

        router.push(target.pathname as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [closeNotificationsPanel]);

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
        return formatDashedNumericDate(date);
    }, []);

    const panelUnreadCount = useMemo(
        () => notifications.filter((entry) => !entry.read).length,
        [notifications],
    );

    const activeTab = useMemo(() => {
        if (isAdminContext) return activeAdminTab;

        if (pathname.includes('feed')) return 'feed';
        if (pathname === '/home' || pathname.startsWith('/home/')) return 'feed';
        if (pathname.includes('discover')) return 'discover';
        if (pathname.includes('bookings')) return 'activity';
        if (pathname.includes('ai_suggestions')) return 'ai-suggest';
        if (pathname.includes('marketplace')) return 'marketplace';
        if (pathname.includes('profile') || pathname.includes('settings') || pathname.includes('wallet')) {
            return isFan ? (pathname.includes('settings') ? 'settings' : 'profile') : 'profile';
        }
        if (
            pathname === '/manage' ||
            pathname.startsWith('/manage/') ||
            pathname.includes('my_studio') ||
            pathname.includes('my_venue') ||
            pathname.includes('my_group') ||
            pathname.includes('my_production') ||
            pathname.includes('production_team') ||
            pathname.includes('manage_') ||
            pathname.includes('edit_') ||
            pathname.includes('add_')
        ) {
            return 'manage';
        }
        return 'feed';
    }, [isAdminContext, activeAdminTab, pathname]);

    const navItems = useMemo(() => {
        if (isAdminContext) {
            return [
                { id: 'dashboard', icon: 'stats-chart', label: 'Dashboard', route: '/admin' },
                { id: 'users', icon: 'people', label: 'Users', route: '/admin/users' },
                { id: 'reports', icon: 'shield-checkmark', label: 'Reports', route: '/admin/reports' },
                { id: 'stations', icon: 'radio', label: 'Stations', route: '/admin/stations' },
                { id: 'manage', icon: 'briefcase', label: 'Manage', route: '/admin/manage' },
                { id: 'audit', icon: 'time', label: 'Audit', route: '/admin/audit' },
            ];
        }

        if (isFan) {
            return [
                { id: 'home', icon: 'home', label: 'Home', route: '/feed' },
                { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' },
                { id: 'settings', icon: 'settings', label: 'Settings', route: '/settings' },
            ];
        }

        if (isGuest) {
            return [];
        }

        return [
            { id: 'feed', icon: 'newspaper', label: 'Feed', route: '/feed' },
            { id: 'discover', icon: 'compass', label: 'Discover', route: '/discover' },
            { id: 'ai-suggest', icon: 'sparkles', label: 'AI Discovery', route: '/ai_suggestions' },
            { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
            { id: 'marketplace', icon: 'storefront', label: 'Marketplace', route: '/marketplace' },
            { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
        ];
    }, [isAdminContext, isFan, isGuest, manageRoute]);

    const handleUsersNavigation = useCallback((section: UsersSection) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveUsersSection(section);
        setUsersMenuExpanded(true);

        if (section === 'identity_reviews') {
            router.replace('/admin/identity-reviews' as any);
            return;
        }

        router.replace('/admin/users' as any);
    }, []);

    const toggleUsersMenu = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setUsersMenuExpanded((prev) => !prev);
    }, []);

    const handleUsersHeaderPress = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        if (activeAdminTab === 'users') {
            setUsersMenuExpanded((prev) => !prev);
            return;
        }

        setActiveUsersSection('users_list');
        setUsersMenuExpanded(true);
        router.replace('/admin/users' as any);
    }, [activeAdminTab]);

    const handleReportsNavigation = useCallback((section: ReportsSection) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActiveReportsSection(section);
        setReportsMenuExpanded(true);

        if (section === 'booking_incidents') {
            router.replace('/admin/reports?section=booking_incidents' as any);
            return;
        }

        router.replace('/admin/reports' as any);
    }, []);

    const toggleReportsMenu = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setReportsMenuExpanded((prev) => !prev);
    }, []);

    const handleReportsHeaderPress = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

        if (activeAdminTab === 'reports') {
            setReportsMenuExpanded((prev) => !prev);
            return;
        }

        setActiveReportsSection('reports_list');
        setReportsMenuExpanded(true);
        router.replace('/admin/reports' as any);
    }, [activeAdminTab]);

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

    if (isGuest) {
        return (
            <>
                <View style={[styles.sidebarContainer, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderRightColor: colors.border }]}>
                    <View style={[styles.logoSection, styles.sidebarLogoSection]}>
                        <View style={[styles.logoFrame, styles.sidebarLogoFrame]}>
                            <Image
                                source={require('../../assets/images/musika-lokal-logo-modern-wordmark.png')}
                                style={[styles.logoImage, styles.sidebarLogoImage]}
                                resizeMode="contain"
                            />
                        </View>
                    </View>

                    <View style={styles.navContainer} />

                    <View style={[styles.footer, { borderTopColor: colors.border }]}>
                        <TouchableOpacity activeOpacity={1} style={styles.logoutButton} onPress={handleLogout}>
                            <Ionicons name="log-in-outline" size={22} color={colors.textSecondary} style={{ width: 30 }} />
                            <Text style={[styles.navLabel, { color: colors.textSecondary }]}>Sign In</Text>
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
                            <View style={styles.logoFrame}>
                                <Image
                                    source={require('../../assets/images/musika-lokal-logo-modern-wordmark.png')}
                                    style={styles.logoImage}
                                    resizeMode="contain"
                                />
                            </View>
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
                                    <TouchableOpacity activeOpacity={1}
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
                                    {!isFan && (
                                        <TouchableOpacity activeOpacity={1}
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
                                    )}

                                    <TouchableOpacity activeOpacity={1}
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

                            <TouchableOpacity activeOpacity={1}
                                style={[styles.avatarButton, { borderColor: colors.border }]}
                                onPress={() => router.replace('/profile')}
                            >
                                <ProfileAvatar
                                    uri={avatarUrl}
                                    style={styles.avatarImage}
                                    backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                                    iconColor={colors.textSecondary}
                                />
                            </TouchableOpacity>

                            <TouchableOpacity activeOpacity={1} style={styles.topLogoutButton} onPress={handleLogout}>
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
                                                activeOpacity={1}
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
                                                        void handleNotificationItemPress(notification);
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
                                                    <Text style={[styles.notificationItemTitle, { color: colors.text }]}>
                                                        {notification.title || 'Notification'}
                                                    </Text>
                                                    {!notification.read && <View style={[styles.notificationUnreadDot, { backgroundColor: colors.primary }]} />}
                                                </View>

                                                <Text style={[styles.notificationItemMessage, { color: colors.textSecondary }]}>
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
                <View style={[styles.logoSection, styles.sidebarLogoSection]}>
                    <View style={[styles.logoFrame, styles.sidebarLogoFrame]}>
                        <Image
                            source={require('../../assets/images/musika-lokal-logo-modern-wordmark.png')}
                            style={[styles.logoImage, styles.sidebarLogoImage]}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                <ScrollView style={styles.navContainer}>
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;

                        if (item.id === 'users') {
                            const showUsersSubmenu = usersMenuExpanded;

                            return (
                                <View key={item.id} style={styles.navGroup}>
                                    <View
                                        style={[
                                            styles.navItemRow,
                                            (isActive || showUsersSubmenu) && {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.035)',
                                            },
                                        ]}
                                    >
                                        <TouchableOpacity
                                            style={[
                                                styles.navItem,
                                                styles.navItemMain,
                                            ]}
                                            onPress={handleUsersHeaderPress}
                                            activeOpacity={1}
                                            accessibilityRole="button"
                                            accessibilityLabel={showUsersSubmenu ? 'Close users menu' : 'Open users menu'}
                                            accessibilityState={{ expanded: showUsersSubmenu }}
                                        >
                                            <Ionicons
                                                name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                                size={22}
                                                color={isActive ? colors.primary : colors.textSecondary}
                                                style={{ width: 30 }}
                                            />
                                            <View style={styles.navTextBlock}>
                                                <Text
                                                    style={[
                                                        styles.navLabel,
                                                        { color: isActive ? colors.primary : colors.text },
                                                        isActive && { fontFamily: 'Poppins_600SemiBold' },
                                                    ]}
                                                >
                                                    {item.label}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.navToggleButton,
                                                { backgroundColor: 'transparent' },
                                            ]}
                                            onPress={toggleUsersMenu}
                                            activeOpacity={1}
                                            accessibilityRole="button"
                                            accessibilityLabel="Toggle users menu"
                                            accessibilityState={{ expanded: showUsersSubmenu }}
                                        >
                                            <Animated.View style={{ transform: [{ rotate: usersChevronRotation }] }}>
                                                <Ionicons
                                                    name="chevron-down"
                                                    size={18}
                                                    color={showUsersSubmenu ? colors.primary : colors.textSecondary}
                                                />
                                            </Animated.View>
                                        </TouchableOpacity>
                                    </View>

                                    <Animated.View
                                        style={[
                                            styles.subNavContainer,
                                            {
                                                borderLeftColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)',
                                                overflow: 'hidden',
                                                marginTop: usersSubmenuMarginTop,
                                                maxHeight: usersSubmenuHeight,
                                                opacity: usersSubmenuOpacity,
                                            },
                                        ]}
                                    >
                                        {USERS_SECTION_ITEMS.map((subItem) => {
                                            const subActive = activeUsersSection === subItem.key && isActive;

                                            return (
                                                <TouchableOpacity
                                                    key={subItem.key}
                                                    style={[
                                                        styles.subNavItem,
                                                        {
                                                            backgroundColor: subActive
                                                                ? (isDark ? 'rgba(59,130,246,0.22)' : '#DBEAFE')
                                                                : (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.8)'),
                                                            borderColor: subActive
                                                                ? (isDark ? 'rgba(96,165,250,0.45)' : '#93C5FD')
                                                                : 'transparent',
                                                        },
                                                    ]}
                                                    onPress={() => handleUsersNavigation(subItem.key)}
                                                    activeOpacity={1}
                                                >
                                                    <View style={styles.subNavItemMain}>
                                                        <Ionicons
                                                            name={subItem.icon as any}
                                                            size={18}
                                                            color={subActive ? colors.primary : colors.textSecondary}
                                                            style={{ width: 24 }}
                                                        />
                                                        <View style={styles.subNavTextBlock}>
                                                            <Text
                                                                style={[
                                                                    styles.subNavLabel,
                                                                    { color: subActive ? colors.primary : colors.text },
                                                                    subActive && { fontFamily: 'Poppins_600SemiBold' },
                                                                ]}
                                                            >
                                                                {subItem.label}
                                                            </Text>
                                                            <Text
                                                                style={[styles.subNavDescription, { color: colors.textSecondary }]}
                                                            >
                                                                {subItem.description}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    <View
                                                        style={[
                                                            styles.subNavStatusDot,
                                                            {
                                                                backgroundColor: subActive ? colors.primary : 'transparent',
                                                                borderColor: subActive ? colors.primary : colors.border,
                                                            },
                                                        ]}
                                                    />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </Animated.View>
                                </View>
                            );
                        }

                        if (item.id === 'reports') {
                            const showReportsSubmenu = reportsMenuExpanded;

                            return (
                                <View key={item.id} style={styles.navGroup}>
                                    <View
                                        style={[
                                            styles.navItemRow,
                                            (isActive || showReportsSubmenu) && {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.035)',
                                            },
                                        ]}
                                    >
                                        <TouchableOpacity
                                            style={[
                                                styles.navItem,
                                                styles.navItemMain,
                                            ]}
                                            onPress={handleReportsHeaderPress}
                                            activeOpacity={1}
                                            accessibilityRole="button"
                                            accessibilityLabel={showReportsSubmenu ? 'Close reports menu' : 'Open reports menu'}
                                            accessibilityState={{ expanded: showReportsSubmenu }}
                                        >
                                            <Ionicons
                                                name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                                size={22}
                                                color={isActive ? colors.primary : colors.textSecondary}
                                                style={{ width: 30 }}
                                            />
                                            <View style={styles.navTextBlock}>
                                                <Text
                                                    style={[
                                                        styles.navLabel,
                                                        { color: isActive ? colors.primary : colors.text },
                                                        isActive && { fontFamily: 'Poppins_600SemiBold' },
                                                    ]}
                                                >
                                                    {item.label}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.navToggleButton,
                                                { backgroundColor: 'transparent' },
                                            ]}
                                            onPress={toggleReportsMenu}
                                            activeOpacity={1}
                                            accessibilityRole="button"
                                            accessibilityLabel="Toggle reports menu"
                                            accessibilityState={{ expanded: showReportsSubmenu }}
                                        >
                                            <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
                                                <Ionicons
                                                    name="chevron-down"
                                                    size={18}
                                                    color={showReportsSubmenu ? colors.primary : colors.textSecondary}
                                                />
                                            </Animated.View>
                                        </TouchableOpacity>
                                    </View>

                                    <Animated.View
                                        style={[
                                            styles.subNavContainer,
                                            {
                                                borderLeftColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)',
                                                overflow: 'hidden',
                                                marginTop: submenuMarginTop,
                                                maxHeight: submenuHeight,
                                                opacity: submenuOpacity,
                                            },
                                        ]}
                                    >
                                        {REPORTS_SECTION_ITEMS.map((subItem) => {
                                            const subActive = activeReportsSection === subItem.key && isActive;

                                            return (
                                                <TouchableOpacity
                                                    key={subItem.key}
                                                    style={[
                                                        styles.subNavItem,
                                                        {
                                                            backgroundColor: subActive
                                                                ? (isDark ? 'rgba(59,130,246,0.22)' : '#DBEAFE')
                                                                : (isDark ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.8)'),
                                                            borderColor: subActive
                                                                ? (isDark ? 'rgba(96,165,250,0.45)' : '#93C5FD')
                                                                : 'transparent',
                                                        },
                                                    ]}
                                                    onPress={() => handleReportsNavigation(subItem.key)}
                                                    activeOpacity={1}
                                                >
                                                    <View style={styles.subNavItemMain}>
                                                        <Ionicons
                                                            name={subItem.icon as any}
                                                            size={18}
                                                            color={subActive ? colors.primary : colors.textSecondary}
                                                            style={{ width: 24 }}
                                                        />
                                                        <View style={styles.subNavTextBlock}>
                                                            <Text
                                                                style={[
                                                                    styles.subNavLabel,
                                                                    { color: subActive ? colors.primary : colors.text },
                                                                    subActive && { fontFamily: 'Poppins_600SemiBold' },
                                                                ]}
                                                            >
                                                                {subItem.label}
                                                            </Text>
                                                            <Text
                                                                style={[styles.subNavDescription, { color: colors.textSecondary }]}
                                                            >
                                                                {subItem.description}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    <View
                                                        style={[
                                                            styles.subNavStatusDot,
                                                            {
                                                                backgroundColor: subActive ? colors.primary : 'transparent',
                                                                borderColor: subActive ? colors.primary : colors.border,
                                                            },
                                                        ]}
                                                    />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </Animated.View>
                                </View>
                            );
                        }

                        return (
                            <TouchableOpacity activeOpacity={1}
                                key={item.id}
                                style={[
                                    styles.navItem,
                                    { marginBottom: 6 },
                                    isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
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
                                <Text
                                    style={[
                                        styles.navLabel,
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

                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    <TouchableOpacity activeOpacity={1} style={styles.logoutButton} onPress={handleLogout}>
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
        alignItems: 'flex-start',
        gap: 8,
    },
    notificationTypeDot: {
        width: 8,
        height: 8,
        borderRadius: 999,
    },
    notificationItemTitle: {
        flex: 1,
        flexShrink: 1,
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
        gap: 0,
    },
    logoSectionTop: {
        padding: 0,
        gap: 0,
        minWidth: 54,
    },
    sidebarLogoSection: {
        justifyContent: 'center',
    },
    logoFrame: {
        width: 38,
        height: 50,
        overflow: 'hidden',
    },
    logoImage: {
        // Crop the transparent padding baked into the wordmark asset.
        width: 58,
        height: 58,
        marginLeft: -13,
    },
    sidebarLogoFrame: {
        width: 56,
        height: 72,
    },
    sidebarLogoImage: {
        width: 86,
        height: 86,
        marginLeft: -19,
        marginTop: -3,
    },
    navContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    navGroup: {
        marginBottom: 6,
    },
    navItemRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        borderRadius: 12,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 12,
    },
    navItemMain: {
        flex: 1,
    },
    navTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    navLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 10,
    },
    navMetaLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 10,
        marginTop: 2,
    },
    navToggleButton: {
        width: 42,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        alignSelf: 'stretch',
    },
    subNavContainer: {
        marginLeft: 26,
        marginTop: 8,
        paddingLeft: 18,
        paddingRight: 4,
        paddingTop: 2,
        gap: 8,
        borderLeftWidth: 1,
    },
    subNavItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 56,
        borderRadius: 12,
        borderWidth: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    subNavItemMain: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        flex: 1,
        minWidth: 0,
    },
    subNavTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    subNavLabel: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 8,
    },
    subNavDescription: {
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        marginLeft: 8,
        marginTop: 2,
        lineHeight: 16,
    },
    subNavStatusDot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        borderWidth: 1,
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
