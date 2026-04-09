import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
