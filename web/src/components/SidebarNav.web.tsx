import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, LayoutAnimation, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import CustomAlert, { AlertType } from './CustomAlert';
import { DEFAULT_AVATAR } from '../constants/Images';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type AlertButton = {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
};

type AdminTab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit';
type ReportsSection = 'reports_list' | 'booking_incidents';

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
    if (pathname.startsWith('/admin/permits')) return 'permits';
    if (pathname.startsWith('/admin/users')) return 'users';
    if (pathname.startsWith('/admin/reports')) return 'reports';
    if (pathname.startsWith('/admin/audit')) return 'audit';
    return 'dashboard';
};

const resolveReportsSection = (search: string): ReportsSection => {
    const params = new URLSearchParams(search);
    return params.get('section') === 'booking_incidents' ? 'booking_incidents' : 'reports_list';
};

const getBrowserSearch = () => {
    if (typeof window === 'undefined') return '';
    return window.location.search;
};

export default function SidebarNav() {
    const { colors, isDark } = useTheme();
    const { isGuest, userRole, session, setGuestMode } = useAuth();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const [activeReportsSection, setActiveReportsSection] = useState<ReportsSection>(() => resolveReportsSection(getBrowserSearch()));
    const [reportsMenuExpanded, setReportsMenuExpanded] = useState(() => resolveAdminTab(pathname) === 'reports');
    const rotateAnim = useRef(new Animated.Value(reportsMenuExpanded ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(rotateAnim, {
            toValue: reportsMenuExpanded ? 1 : 0,
            duration: 200,
            useNativeDriver: false,
        }).start();
    }, [reportsMenuExpanded, rotateAnim]);

    const chevronRotation = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const submenuHeight = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 136], // ~60 per item * 2 + 8px gap + padding
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
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const previousAdminTabRef = useRef<AdminTab>(resolveAdminTab(pathname));
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

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const syncReportsSection = () => {
            setActiveReportsSection(resolveReportsSection(window.location.search));
        };

        syncReportsSection();
        window.addEventListener('popstate', syncReportsSection);

        return () => {
            window.removeEventListener('popstate', syncReportsSection);
        };
    }, []);

    useEffect(() => {
        if (activeAdminTab !== 'reports') {
            setActiveReportsSection('reports_list');
            setReportsMenuExpanded((prev) => {
                if (prev) {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                }
                return false;
            });
        } else {
            setActiveReportsSection(resolveReportsSection(getBrowserSearch()));
        }

        if (activeAdminTab === 'reports' && previousAdminTabRef.current !== 'reports') {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setReportsMenuExpanded(true);
        }

        previousAdminTabRef.current = activeAdminTab;
    }, [activeAdminTab, pathname]);

    const fetchUserRole = useCallback(async () => {
        if (isGuest || !session?.user?.id) {
            setManageRoute('/manage');
            setAvatarUrl(null);
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
        } catch {
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
    }, [isGuest, session?.user?.id]);

    useEffect(() => {
        fetchUserRole();
    }, [fetchUserRole]);

    const activeTab = useMemo(() => {
        if (isAdminContext) return activeAdminTab;

        if (pathname.includes('home')) return 'home';
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
            { id: 'ai-suggest', icon: 'sparkles', label: 'AI Discovery', route: '/ai_suggestions' },
            { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
            { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
        ];
    }, [isAdminContext, manageRoute]);

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
                <View style={styles.logoSection}>
                    <Image
                        source={require('../../assets/images/Musika-lokal-logo.png')}
                        style={[styles.logoImage, { tintColor: colors.primary }]}
                        resizeMode="contain"
                    />
                    <Text style={[styles.brandName, { color: colors.text }]}>MusikaLokal</Text>
                </View>

                <ScrollView style={styles.navContainer}>
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;

                        if (item.id === 'reports') {
                            const showReportsSubmenu = reportsMenuExpanded;

                            return (
                                <View key={item.id} style={styles.navGroup}>
                                    <View
                                        style={[
                                            styles.navItemRow,
                                            showReportsSubmenu && {
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.035)',
                                            },
                                        ]}
                                    >
                                        <TouchableOpacity
                                            style={[
                                                styles.navItem,
                                                styles.navItemMain,
                                                isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
                                            ]}
                                            onPress={() => handleReportsNavigation(activeReportsSection)}
                                            activeOpacity={0.8}
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
                                                {
                                                    backgroundColor: showReportsSubmenu
                                                        ? (isDark ? 'rgba(59,130,246,0.16)' : '#DBEAFE')
                                                        : 'transparent',
                                                },
                                            ]}
                                            onPress={toggleReportsMenu}
                                            activeOpacity={0.8}
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
                                                    height: submenuHeight,
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
                                                        activeOpacity={0.85}
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
                                                                    numberOfLines={1}
                                                                >
                                                                    {subItem.label}
                                                                </Text>
                                                                <Text
                                                                    style={[styles.subNavDescription, { color: colors.textSecondary }]}
                                                                    numberOfLines={2}
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
                            <TouchableOpacity
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
