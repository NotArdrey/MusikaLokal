import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import { memo, useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
    title: string;
    transparent?: boolean;
    onBackPress?: () => void;
}

function Header({ title, transparent, onBackPress }: HeaderProps) {
    const { colors, isDark } = useTheme();
    const { isGuest } = useAuth();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isWebDesktop = Platform.OS === 'web' && width >= 768;

    const pathname = usePathname();
    const [hasUnread, setHasUnread] = useState(false);
    const isMainNavPath = useMemo(
        () => pathname === "/explore" || pathname === "/home" || pathname === "/manage" || pathname === "/bookings" || pathname === "/ai_suggestions",
        [pathname],
    );

    const isSettingsOrProfile = useMemo(
        () => pathname === "/settings" || pathname === "/profile",
        [pathname],
    );

    const isMyListingPath = useMemo(
        () => pathname === "/my_group" || pathname === "/my_venue" || pathname === "/my_studio",
        [pathname],
    );

    const isManageDetailPath = useMemo(
        () => pathname === "/manage_studio" || pathname === "/manage_gig" || pathname === "/manage_group",
        [pathname],
    );

    const backVisible = !!onBackPress || !(isMainNavPath || isSettingsOrProfile || isMyListingPath || isManageDetailPath);
    const notifVisible = isMainNavPath && !isGuest;
    const addbtnvisible = isMyListingPath;

    const btn = useMemo<'/add_gig' | '/add_studio' | '/add_group'>(() => {
        if (pathname === "/my_venue") return '/add_gig';
        if (pathname === "/my_studio") return '/add_studio';
        return '/add_group';
    }, [pathname]);

    useFocusEffect(
        useCallback(() => {
            checkUnreadNotifications();
        }, [])
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
        } catch (e) {
            // Silently ignore errors - user likely not logged in
        }
    };

    return (
        <View style={[styles.container, {
            backgroundColor: transparent ? 'transparent' : colors.background,
            paddingTop: isWebDesktop ? 16 : (insets.top + 8),
            paddingHorizontal: isWebDesktop ? 32 : 16,
            paddingBottom: isWebDesktop ? 20 : 16,
        }]}>
            {/* Left Container - Only for Back Button */}
            {backVisible && (
                <View style={styles.leftContainer}>
                    <TouchableOpacity activeOpacity={1}
                        onPress={() => (onBackPress ? onBackPress() : router.back())}
                        style={[styles.backButton, {
                            backgroundColor: isDark ? colors.surface : '#F3F4F6',
                            padding: isWebDesktop ? 12 : 8,
                        }]}
                    >
                        <Ionicons name="arrow-back" size={isWebDesktop ? 24 : 20} color={colors.text} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Title - Dynamic Alignment */}
            <View style={[
                styles.titleContainer,
                !backVisible && styles.mainTitleContainer
            ]}>
                <Text style={[
                    styles.title,
                    { color: colors.text },
                    !backVisible && styles.mainTitle
                ]}>
                    {title}
                </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.rightContainer}>
                {notifVisible ? (
                    <View style={styles.iconRow}>
                        {/* Chat Button */}
                        <TouchableOpacity activeOpacity={1} onPress={() => router.push('/chat')} style={[styles.iconButton, {
                            backgroundColor: isDark ? colors.surface : '#F3F4F6',
                            padding: isWebDesktop ? 12 : 8,
                        }]}>
                            <Ionicons name="chatbubbles" size={isWebDesktop ? 26 : 24} color={colors.text} />
                        </TouchableOpacity>
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
                        onPress={() => router.push(btn)}
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
});
