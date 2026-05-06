import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';

const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface HeaderProps {
    title: string;
    transparent?: boolean;
    onBackPress?: () => void;
    showBack?: boolean;
    leftComponent?: React.ReactNode;
    rightComponent?: React.ReactNode;
    rightIconName?: string;
    rightIconOnPress?: () => void;
}

function Header({ title, transparent, onBackPress, showBack, leftComponent, rightComponent, rightIconName, rightIconOnPress }: HeaderProps) {
    const { colors, isDark } = useTheme();
    const { isGuest, setGuestMode, userId, userRole } = useAuth();
    const insets = useSafeAreaInsets();
    const isFan = isFanUserRole(userRole);

    const pathname = usePathname();
    const [hasUnread, setHasUnread] = useState(false);
    const [hasUnreadChats, setHasUnreadChats] = useState(false);
    const [guestMenuVisible, setGuestMenuVisible] = useState(false);
    const isMainNavPath = useMemo(
        () => pathname === "/home" || pathname === "/feed" || pathname === "/manage" || pathname === "/bookings" || pathname === "/ai_suggestions" || pathname === "/marketplace" || pathname === "/chat",
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

    const computedBackVisible = !!onBackPress || !(isMainNavPath || isSettingsOrProfile || isMyListingPath);
    const backVisible = showBack === false ? false : showBack === true ? true : computedBackVisible;
    const addbtnvisible = useMemo(() => {
        if (!isMyListingPath) return false;
        if (pathname === "/my_group") return userRole === "musician";
        if (pathname === "/my_venue") return userRole === "venue-owner";
        if (pathname === "/my_studio") return userRole === "studio-owner";
        if (pathname === "/my_production") return userRole === "producer";
        return false;
    }, [isMyListingPath, pathname, userRole]);
    const notifVisible = !isGuest && (isMainNavPath || (isMyListingPath && !addbtnvisible));
    const titleOverline = useMemo(() => {
        const normalizedTitle = title.trim().toLowerCase();

        if (normalizedTitle === 'musikalokal') {
            if (pathname === '/feed') return 'Social Feed';
            if (pathname === '/home') return 'Discover';
            if (pathname === '/marketplace') return 'Marketplace';
            if (pathname === '/bookings') return 'Activity';
            if (pathname === '/manage') return 'Workspace';
            return 'MusikaLokal';
        }

        if (pathname.startsWith('/add_')) return 'Create';
        if (pathname.startsWith('/edit_')) return 'Edit';
        if (pathname.startsWith('/manage')) return 'Workspace';
        if (pathname === '/profile') return 'Account';
        if (pathname === '/production_team') return 'Production';
        if (pathname === '/notifications') return 'Updates';
        if (pathname === '/chat') return 'Messages';
        return 'MusikaLokal';
    }, [pathname, title]);

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

    const checkUnreadNotifications = useCallback(async () => {
        try {
            if (!userId || isGuest) {
                setHasUnread(false);
                return;
            }

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
    }, [isGuest, userId]);

    const checkUnreadChats = useCallback(async () => {
        try {
            if (!userId || isGuest || isFan) {
                setHasUnreadChats(false);
                return;
            }

            const { data: participations, error: participationError } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', userId);

            if (participationError) return;

            const conversationIds = (participations || []).map((item) => item.conversation_id);
            if (conversationIds.length === 0) {
                setHasUnreadChats(false);
                return;
            }

            const { count, error: unreadCountError } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .in('conversation_id', conversationIds)
                .neq('sender_id', userId)
                .is('read_at', null);

            if (unreadCountError) return;
            setHasUnreadChats((count || 0) > 0);
        } catch {
            // Silently ignore errors
        }
    }, [isFan, isGuest, userId]);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            const focusTask = InteractionManager.runAfterInteractions(() => {
                if (!isActive) {
                    return;
                }

                void checkUnreadNotifications();
                if (!isFan) {
                    void checkUnreadChats();
                }
            });

            return () => {
                isActive = false;
                focusTask.cancel();
            };
        }, [checkUnreadNotifications, checkUnreadChats, isFan])
    );

    useEffect(() => {
        if (!userId || isGuest) {
            setHasUnread(false);
            setHasUnreadChats(false);
            return;
        }

        checkUnreadNotifications();
        if (isFan) {
            setHasUnreadChats(false);
        } else {
            checkUnreadChats();
        }

        const channel = supabase
            .channel(`header-notifications:${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
                () => {
                    checkUnreadNotifications();
                }
            )
            .subscribe();

        const messagesChannel = isFan
            ? null
            : supabase
                .channel(`header-messages:${userId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'messages' },
                    () => {
                        checkUnreadChats();
                    }
                )
                .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (messagesChannel) {
                supabase.removeChannel(messagesChannel);
            }
        };
    }, [userId, isGuest, isFan, checkUnreadNotifications, checkUnreadChats]);

    const isTransparent = useSharedValue(transparent ? 1 : 0);

    useEffect(() => {
        isTransparent.value = withTiming(transparent ? 1 : 0, { duration: 300 });
    }, [transparent]);

    const surfaceAnimatedStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [isDark ? '#162033F2' : '#FFFFFFF0', 'rgba(10,16,28,0.18)']
        ),
        borderColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [isDark ? '#47556999' : '#E5E7EBE0', 'rgba(255,255,255,0.18)']
        )
    }));

    const titleAnimatedStyle = useAnimatedStyle(() => ({
        color: interpolateColor(
            isTransparent.value,
            [0, 1],
            [isDark ? '#CBD5E1' : '#6B7280', '#FFFFFF']
        ),
        textShadowColor: 'rgba(15,23,42,0.35)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: isTransparent.value * 10,
    }));

    const overlineAnimatedStyle = useAnimatedStyle(() => ({
        color: interpolateColor(
            isTransparent.value,
            [0, 1],
            [colors.textSecondary, 'rgba(255,255,255,0.78)']
        ),
    }));

    const accentDotAnimatedStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [colors.primary, 'rgba(255,255,255,0.92)']
        ),
    }));

    const buttonAnimatedStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [isDark ? '#0F172AB8' : '#FFFFFFD9', 'rgba(15,23,42,0.26)']
        ),
        borderColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [isDark ? '#47556980' : '#E5E7EB', 'rgba(255,255,255,0.16)']
        )
    }));

    const iconAnimatedProps = useAnimatedProps(() => ({
        color: interpolateColor(
            isTransparent.value,
            [0, 1],
            [colors.text, '#FFFFFF']
        ) as any
    }));

    const surfaceShadowStyle = useMemo(() => ({
        shadowColor: isDark ? '#020617' : '#0F172A',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: transparent ? 0 : (isDark ? 0.32 : 0.1),
        shadowRadius: transparent ? 0 : 24,
        elevation: transparent ? 0 : 7,
    }), [isDark, transparent]);

    return (
        <>
            <View style={[styles.container, {
                paddingTop: insets.top + 8
            }]}>
                <Animated.View style={[styles.surface, surfaceAnimatedStyle, surfaceShadowStyle]}>
                    <Animated.View pointerEvents="none" style={[styles.surfaceGlowPrimary, accentDotAnimatedStyle]} />
                    <View pointerEvents="none" style={[styles.surfaceGlowSecondary, { backgroundColor: transparent ? 'rgba(255,255,255,0.08)' : (isDark ? '#1E3A8A33' : colors.primary + '14') }]} />

                    {/* Left Container - Only for Back Button or leftComponent */}
                    {(backVisible || leftComponent) && (
                        <View style={styles.leftContainer}>
                            {leftComponent ? (
                                leftComponent
                            ) : (
                                <AnimatedTouchableOpacity activeOpacity={1}
                                    onPress={handleBackPress}
                                    style={[styles.backButton, buttonAnimatedStyle]}
                                >
                                    <AnimatedIcon name="chevron-back" size={20} animatedProps={iconAnimatedProps} />
                                </AnimatedTouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Title - Dynamic Alignment */}
                    <View style={[
                        styles.titleContainer,
                        !(backVisible || leftComponent) && styles.mainTitleContainer
                    ]}>
                        <View style={styles.overlineRow}>
                            <Animated.Text style={[styles.overlineText, overlineAnimatedStyle]}>
                                {titleOverline}
                            </Animated.Text>
                        </View>
                        <Animated.Text
                            style={[
                                styles.title,
                                !backVisible && styles.mainTitle,
                                titleAnimatedStyle
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {title}
                        </Animated.Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.rightContainer}>
                        {rightComponent ? (
                            rightComponent
                        ) : rightIconName ? (
                            <AnimatedTouchableOpacity activeOpacity={1} onPress={rightIconOnPress} style={[styles.iconButton, buttonAnimatedStyle]}>
                                <AnimatedIcon name={rightIconName as any} size={20} animatedProps={iconAnimatedProps} />
                            </AnimatedTouchableOpacity>
                        ) : isGuest ? (
                            <AnimatedTouchableOpacity
                                activeOpacity={1}
                                onPress={() => setGuestMenuVisible(true)}
                                style={[styles.iconButton, buttonAnimatedStyle]}
                            >
                                <AnimatedIcon name="menu-outline" size={22} animatedProps={iconAnimatedProps} />
                            </AnimatedTouchableOpacity>
                        ) : notifVisible ? (
                            <View style={styles.iconRow}>
                                {!isFan && (
                                    <AnimatedTouchableOpacity activeOpacity={1} onPress={() => router.push('/chat')} style={[styles.iconButton, buttonAnimatedStyle]}>
                                        <AnimatedIcon name="chatbubble-ellipses" size={20} animatedProps={iconAnimatedProps} />
                                        {hasUnreadChats && (
                                            <View style={[styles.badge, transparent && { borderColor: 'rgba(0,0,0,0.3)' }]} />
                                        )}
                                    </AnimatedTouchableOpacity>
                                )}
                                {/* Notifications Button */}
                                <AnimatedTouchableOpacity activeOpacity={1} onPress={() => router.push('/notifications')} style={[styles.iconButton, buttonAnimatedStyle]}>
                                    <AnimatedIcon name="notifications" size={20} animatedProps={iconAnimatedProps} />
                                    {hasUnread && (
                                        <View style={[styles.badge, transparent && { borderColor: 'rgba(0,0,0,0.3)' }]} />
                                    )}
                                </AnimatedTouchableOpacity>
                            </View>
                        ) : addbtnvisible ? (
                            <AnimatedTouchableOpacity activeOpacity={1}
                                onPress={() => router.push(btn)}
                                style={[styles.addButton, buttonAnimatedStyle]}
                            >
                                <AnimatedIcon name="add" size={22} animatedProps={iconAnimatedProps} />
                            </AnimatedTouchableOpacity>
                        ) : null}
                    </View>
                </Animated.View>
            </View>

            <Modal
                visible={guestMenuVisible}
                transparent
                animationType="fade"
                hardwareAccelerated
                statusBarTranslucent
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
        paddingBottom: 14,
        paddingHorizontal: 16,
    },
    surface: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 28,
        borderWidth: 1,
        overflow: 'hidden',
    },
    leftContainer: {
        width: 46,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    rightContainer: {
        minWidth: 46,
        justifyContent: 'center',
        alignItems: 'flex-end',
        zIndex: 1,
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 10,
        zIndex: 1,
    },
    mainTitleContainer: {
        alignItems: 'flex-start',
        paddingLeft: 2,
    },
    overlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 3,
    },
    overlineText: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: -0.3,
    },
    mainTitle: {
        fontSize: 28,
        fontWeight: '700',
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.9,
    },
    iconButton: {
        width: 44,
        height: 44,
        position: 'relative',
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: 'white',
    },
    addButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    surfaceGlowPrimary: {
        position: 'absolute',
        width: 116,
        height: 116,
        borderRadius: 58,
        top: -58,
        left: -18,
        opacity: 0.12,
    },
    surfaceGlowSecondary: {
        position: 'absolute',
        width: 92,
        height: 92,
        borderRadius: 46,
        bottom: -40,
        right: 10,
        opacity: 1,
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
        maxWidth: 320,
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
