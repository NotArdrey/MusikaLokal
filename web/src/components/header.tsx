import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import { memo, useCallback, useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';

interface HeaderProps {
    title: string;
    transparent?: boolean;
    onBackPress?: () => void;
    hideBackButton?: boolean;
    leftComponent?: React.ReactNode;
    rightComponent?: React.ReactNode;
}

function Header({ title, transparent, onBackPress, hideBackButton = false, leftComponent, rightComponent }: HeaderProps) {
    const { colors, isDark } = useTheme();
    const { isGuest, setGuestMode, userRole } = useAuth();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isWebDesktop = Platform.OS === 'web' && width >= 768;
    const isFan = isFanUserRole(userRole);

    const pathname = usePathname();
    const [hasUnread, setHasUnread] = useState(false);
    const [guestMenuVisible, setGuestMenuVisible] = useState(false);
    const isAdminPath = useMemo(
        () => pathname === "/admin" || pathname.startsWith("/admin/"),
        [pathname],
    );
    const isMainNavPath = useMemo(
        () => pathname === "/explore" || pathname === "/feed" || pathname === "/manage" || pathname === "/bookings" || pathname === "/ai_suggestions",
        [pathname],
    );

    const isSettingsOrProfile = useMemo(
        () => pathname === "/settings" || pathname === "/profile",
        [pathname],
    );

    const isMyListingPath = useMemo(
        () => pathname === "/my_group" || pathname === "/my_venue" || pathname === "/my_studio" || pathname === "/my_production",
        [pathname],
    );

    const backVisible = !hideBackButton && (!!onBackPress || !(isMainNavPath || isSettingsOrProfile || isMyListingPath));
    const notifVisible = isMainNavPath && !isGuest && !isWebDesktop;
    const addbtnvisible = isMyListingPath;

    const btn = useMemo<'/add_gig' | '/add_studio' | '/add_group' | '/add_production'>(() => {
        if (pathname === "/my_venue") return '/add_gig';
        if (pathname === "/my_studio") return '/add_studio';
        if (pathname === "/my_production") return '/add_production';
        return '/add_group';
    }, [pathname]);

    const defaultBackRoute = useMemo(() => {
        if (pathname === "/edit_profile") return "/profile";
        if (pathname === "/add_gig" || pathname === "/edit_gig") return "/my_venue";
        if (pathname === "/add_group" || pathname === "/add_duo" || pathname === "/edit_group") return "/my_group";
        if (pathname === "/add_studio" || pathname === "/edit_studio") return "/my_studio";
        if (pathname === "/add_production" || pathname === "/edit_production") return "/my_production";
        if (pathname === "/manage_gig") return "/my_venue";
        if (pathname === "/manage_group") return "/my_group";
        if (pathname === "/manage_studio") return "/my_studio";
        if (pathname.startsWith("/add_") || pathname.startsWith("/edit_")) {
            return resolveRoleManageRoute(userRole);
        }
        return null;
    }, [pathname, userRole]);

    const handleBackPress = useCallback(() => {
        if (onBackPress) {
            onBackPress();
            return;
        }

        if (defaultBackRoute) {
            router.replace(defaultBackRoute as any);
            return;
        }

        router.back();
    }, [defaultBackRoute, onBackPress]);

    const closeGuestMenu = useCallback(() => {
        setGuestMenuVisible(false);
    }, []);

    const handleGuestSignIn = useCallback(async () => {
        closeGuestMenu();
        await setGuestMode(false);
        router.replace('/');
    }, [closeGuestMenu, setGuestMode]);

    useFocusEffect(
        useCallback(() => {
            if (!isWebDesktop) {
                checkUnreadNotifications();
            }
        }, [isWebDesktop])
    );

    const checkUnreadNotifications = async () => {
        try {
            // Check session first to avoid unnecessary API calls
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            // Check if token is expired - don't make API call if it is
            const tokenExpiry = session.expires_at ? session.expires_at * 1000 : 0;
            if (tokenExpiry && tokenExpiry < Date.now()) return;

            // This can fail with 401 if session is expired, which is fine
            const { data, error } = await supabase.functions.invoke('manage-notifications', {
                body: { action: 'unread_count', userId: session.user.id }
            });

            // If error (e.g., expired session), do nothing
            if (error) return;

            if (data) {
                setHasUnread(data.count > 0);
            }
        } catch {
            // Silently ignore errors - user likely not logged in
        }
    };

    if (isAdminPath && isWebDesktop && title.trim().startsWith("Admin")) {
        return null;
    }

    return (
        <>
            <View style={[styles.container, {
                backgroundColor: transparent ? 'transparent' : colors.background,
                paddingTop: isWebDesktop ? 16 : (insets.top + 8),
                paddingHorizontal: isWebDesktop ? 32 : 16,
                paddingBottom: isWebDesktop ? 20 : 16,
                borderRadius: transparent ? 0 : (isWebDesktop ? 18 : 14),
            }]}>
                {/* Left Container - Only for Back Button or left component */}
                {(backVisible || leftComponent) && (
                    <View style={styles.leftContainer}>
                        {leftComponent ? (
                            leftComponent
                        ) : (
                            <TouchableOpacity activeOpacity={1}
                                onPress={handleBackPress}
                                style={[styles.backButton, {
                                    backgroundColor: isDark ? colors.surface : '#F3F4F6',
                                    padding: isWebDesktop ? 12 : 8,
                                }]}
                            >
                                <Ionicons name="arrow-back" size={isWebDesktop ? 24 : 20} color={colors.text} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Title - Dynamic Alignment */}
                <View style={[
                    styles.titleContainer,
                    !(backVisible || leftComponent) && styles.mainTitleContainer
                ]}>
                <Text style={[
                    styles.title,
                    { color: transparent ? '#FFFFFF' : colors.text },
                    !backVisible && styles.mainTitle
                ]}>
                        {title}
                    </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.rightContainer}>
                    {rightComponent ? (
                        rightComponent
                    ) : isGuest ? (
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => setGuestMenuVisible(true)}
                            style={[styles.iconButton, {
                                backgroundColor: isDark ? colors.surface : '#F3F4F6',
                                padding: isWebDesktop ? 12 : 8,
                            }]}
                        >
                            <Ionicons name="menu-outline" size={isWebDesktop ? 26 : 24} color={colors.text} />
                        </TouchableOpacity>
                    ) : notifVisible ? (
                        <View style={styles.iconRow}>
                            {!isFan && (
                                <TouchableOpacity activeOpacity={1} onPress={() => router.push('/chat')} style={[styles.iconButton, {
                                    backgroundColor: isDark ? colors.surface : '#F3F4F6',
                                    padding: isWebDesktop ? 12 : 8,
                                }]}>
                                    <Ionicons name="chatbubbles" size={isWebDesktop ? 26 : 24} color={colors.text} />
                                </TouchableOpacity>
                            )}
                            {/* Notifications Button */}
                            <TouchableOpacity activeOpacity={1} onPress={() => router.push('/notifications')} style={[styles.iconButton, {
                                backgroundColor: isDark ? colors.surface : '#F3F4F6',
                                padding: isWebDesktop ? 12 : 8,
                            }]}>
                                <Ionicons name="notifications" size={isWebDesktop ? 26 : 24} color={colors.text} />
                                {hasUnread && (
                                    <View style={styles.badge} />
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : addbtnvisible ? (
                        <TouchableOpacity activeOpacity={1}
                            onPress={() => router.push(btn as any)}
                            style={[styles.addButton, {
                                backgroundColor: isDark ? colors.surface : '#F3F4F6',
                                padding: isWebDesktop ? 12 : 8,
                            }]}
                        >
                            <Ionicons name="add" size={isWebDesktop ? 28 : 24} color={colors.text} />
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            <Modal
                visible={guestMenuVisible}
                transparent
                animationType="fade"
                onRequestClose={closeGuestMenu}
            >
                <View style={styles.guestMenuOverlay}>
                    <TouchableOpacity activeOpacity={1} style={styles.guestMenuBackdrop} onPress={closeGuestMenu} />
                    <View style={[styles.guestMenuPanel, { backgroundColor: colors.background, borderLeftColor: colors.border }]}>
                        <View style={[styles.guestMenuHeader, { borderBottomColor: colors.border }]}>
                            <View>
                                <Text style={[styles.guestMenuTitle, { color: colors.text }]}>Guest Menu</Text>
                                <Text style={[styles.guestMenuSubtitle, { color: colors.textSecondary }]}>Browsing as guest</Text>
                            </View>
                            <TouchableOpacity activeOpacity={1} onPress={closeGuestMenu} style={styles.guestMenuClose}>
                                <Ionicons name="close" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.guestMenuList}>
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={handleGuestSignIn}
                                style={[styles.guestMenuItem, { borderBottomColor: "transparent" }]}
                            >
                                <View style={[styles.guestMenuIcon, { backgroundColor: isDark ? "#1E293B" : "#F1F5F9" }]}>
                                    <Ionicons name="log-in-outline" size={19} color={colors.primary} />
                                </View>
                                <Text style={[styles.guestMenuLabel, { color: colors.text }]}>Sign In</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

export default memo(Header);

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 16, // pb-4
        paddingHorizontal: 16, // px-4
    },
    // Simplified Left Container logic - if not visible, it shouldn't take space in FB layout
    leftContainer: {
        width: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    rightContainer: {
        minWidth: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    backButton: {
        padding: 8,
        borderRadius: 9999, // rounded-full
    },
    titleContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainTitleContainer: {
        alignItems: 'flex-start',
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    mainTitle: {
        fontSize: 28,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.5,
    },
    iconButton: {
        padding: 8,
        position: 'relative',
        backgroundColor: '#F3F4F6', // light gray bg for icons
        borderRadius: 9999,
    },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: 'white',
    },
    addButton: {
        padding: 8,
        borderRadius: 9999,
    },
    guestMenuOverlay: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(15, 23, 42, 0.36)',
    },
    guestMenuBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    guestMenuPanel: {
        width: '78%',
        maxWidth: 340,
        height: '100%',
        borderLeftWidth: 1,
        paddingTop: 56,
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.16,
        shadowRadius: 18,
        elevation: 18,
    },
    guestMenuHeader: {
        paddingHorizontal: 20,
        paddingBottom: 18,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    guestMenuTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
    },
    guestMenuSubtitle: {
        marginTop: 2,
        fontSize: 12,
        fontFamily: 'Poppins_500Medium',
    },
    guestMenuClose: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestMenuList: {
        paddingTop: 8,
    },
    guestMenuItem: {
        minHeight: 58,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
    },
    guestMenuIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    guestMenuLabel: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
});
