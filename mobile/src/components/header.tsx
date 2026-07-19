import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname, useSegments } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { InteractionManager, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';
import { fetchActiveStaffAssignment, isStaffRole, normalizeStaffAccessLevel } from '../utils/staffAccess';

const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const normalizeHeaderSegments = (segments: readonly string[]) => {
    const normalizedSegments = segments
        .map((segment) => String(segment || '').trim())
        .filter((segment) => segment && !(segment.startsWith('(') && segment.endsWith(')')));

    return `/${normalizedSegments.join('/')}`;
};

const normalizeHeaderPathname = (value: string, segments: readonly string[] = []) => {
    const normalizedFromSegments = normalizeHeaderSegments(segments);
    if (normalizedFromSegments !== '/') {
        return normalizedFromSegments;
    }

    const normalizedSegments = value
        .split('/')
        .filter((segment) => segment && !(segment.startsWith('(') && segment.endsWith(')')));

    return `/${normalizedSegments.join('/')}`;
};

interface HeaderProps {
    title: string;
    overline?: string;
    transparent?: boolean;
    onBackPress?: () => void;
    showBack?: boolean;
    showMainActions?: boolean;
    leftComponent?: React.ReactNode;
    rightComponent?: React.ReactNode;
    rightIconName?: string;
    rightIconOnPress?: () => void;
}

function Header({ title, overline, transparent, onBackPress, showBack, showMainActions, leftComponent, rightComponent, rightIconName, rightIconOnPress }: HeaderProps) {
    const { colors, isDark } = useTheme();
    const { isGuest, setGuestMode, userId, userRole } = useAuth();
    const insets = useSafeAreaInsets();
    const isFan = isFanUserRole(userRole);

    const pathname = usePathname();
    const segments = useSegments();
    const routePathname = useMemo(() => normalizeHeaderPathname(pathname, segments), [pathname, segments]);
    const [hasUnread, setHasUnread] = useState(false);
    const [hasUnreadChats, setHasUnreadChats] = useState(false);
    const [guestMenuVisible, setGuestMenuVisible] = useState(false);
    const [staffAccessLevel, setStaffAccessLevel] = useState<1 | 2 | 3 | null>(null);
    const isBrandMainHeader = title.trim().toLowerCase() === 'musikalokal';
    const isStaff = isStaffRole(userRole);
    const isMainNavPath = useMemo(
        () => routePathname === "/home" || routePathname === "/feed" || routePathname === "/manage" || routePathname === "/bookings" || routePathname === "/marketplace" || routePathname === "/chat",
        [routePathname],
    );

    const isSettingsOrProfile = useMemo(
        () => routePathname === "/settings" || routePathname === "/profile",
        [routePathname],
    );

    const isMyListingPath = useMemo(
        () => routePathname === "/my_group" || routePathname === "/my_venue" || routePathname === "/my_studio" || routePathname === "/my_production",
        [routePathname],
    );
    const isMainActionHeader = Boolean(showMainActions);
    const isRoundedMainHeader = isMainActionHeader || isMainNavPath || isSettingsOrProfile || isMyListingPath || isBrandMainHeader;

    const computedBackVisible = !!onBackPress || !(isMainActionHeader || isMainNavPath || isSettingsOrProfile || isMyListingPath || isBrandMainHeader);
    const backVisible = showBack === false ? false : showBack === true ? true : computedBackVisible;
    const useMainTitleStyle = !backVisible;
    const useCompactMainTitleStyle = useMainTitleStyle && isRoundedMainHeader;
    const staffCanUseAddButton = !isStaff || staffAccessLevel === 1;
    const addbtnvisible = useMemo(() => {
        if (!isMyListingPath) return false;
        if (!staffCanUseAddButton) return false;
        if (routePathname === "/my_group") return userRole === "musician";
        if (routePathname === "/my_venue") return userRole === "venue-owner";
        if (routePathname === "/my_studio") return userRole === "studio-owner";
        if (routePathname === "/my_production") return userRole === "producer";
        return false;
    }, [isMyListingPath, routePathname, staffCanUseAddButton, userRole]);
    const notifVisible = !isGuest && (showMainActions || isMainNavPath || isBrandMainHeader || (isMyListingPath && !addbtnvisible));
    const rightActionSlots = useMemo(() => {
        if (rightComponent) return -1;
        if (rightIconName || isGuest || addbtnvisible) return 1;
        if (notifVisible) return isFan ? 1 : 2;
        return 0;
    }, [addbtnvisible, isFan, isGuest, notifVisible, rightComponent, rightIconName]);
    const titleOverline = useMemo(() => {
        const explicitOverline = overline?.trim();
        if (explicitOverline) return explicitOverline;

        const normalizedTitle = title.trim().toLowerCase();

        if (normalizedTitle === 'musikalokal') {
            if (routePathname === '/feed') return 'Social Feed';
            if (routePathname === '/home') return 'Discover';
            if (routePathname === '/marketplace') return 'Marketplace';
            if (routePathname === '/bookings') return 'Activity';
            if (routePathname === '/manage') return 'Workspace';
            return 'MusikaLokal';
        }

        if (routePathname.startsWith('/add_')) return 'Create';
        if (routePathname.startsWith('/edit_')) return 'Edit';
        if (routePathname.startsWith('/manage')) return 'Workspace';
        if (routePathname === '/profile') return 'Account';
        if (routePathname === '/production_team') return 'Production';
        if (routePathname === '/notifications') return 'Updates';
        if (routePathname === '/chat') return 'Messages';
        return 'MusikaLokal';
    }, [overline, routePathname, title]);

    const btn = useMemo<'/add_gig' | '/add_studio' | '/add_group' | '/add_production'>(() => {
        if (routePathname === "/my_venue") return '/add_gig';
        if (routePathname === "/my_studio") return '/add_studio';
        if (routePathname === "/my_production") return '/add_production';
        return '/add_group';
    }, [routePathname]);

    useEffect(() => {
        let cancelled = false;

        const loadStaffAccessLevel = async () => {
            if (!isStaff || !userId) {
                setStaffAccessLevel(null);
                return;
            }

            try {
                const assignment = await fetchActiveStaffAssignment(supabase, userId);
                if (!cancelled) {
                    setStaffAccessLevel(normalizeStaffAccessLevel(assignment?.access_level));
                }
            } catch {
                if (!cancelled) {
                    setStaffAccessLevel(null);
                }
            }
        };

        void loadStaffAccessLevel();

        return () => {
            cancelled = true;
        };
    }, [isStaff, userId]);

    const defaultBackRoute = useMemo(() => {
        if (routePathname === "/notifications" && isFan) return "/feed";
        if (routePathname === "/edit_profile") return "/profile";
        if (routePathname === "/add_gig" || routePathname === "/edit_gig") return "/my_venue";
        if (routePathname === "/add_group" || routePathname === "/add_duo" || routePathname === "/edit_group") return "/my_group";
        if (routePathname === "/add_studio" || routePathname === "/edit_studio") return "/my_studio";
        if (routePathname === "/add_production" || routePathname === "/edit_production") return "/my_production";
        if (routePathname === "/manage_gig") return "/my_venue";
        if (routePathname === "/manage_group") return "/my_group";
        if (routePathname === "/manage_studio") return "/my_studio";
        if (routePathname.startsWith("/add_") || routePathname.startsWith("/edit_")) {
            return resolveRoleManageRoute(userRole);
        }
        return null;
    }, [isFan, routePathname, userRole]);

    const handleBackPress = useCallback(() => {
        if (onBackPress) {
            onBackPress();
            return;
        }

        if (defaultBackRoute) {
            router.replace(defaultBackRoute as any);
            return;
        }

        if (!router.canGoBack()) {
            router.replace('/feed');
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
        } catch {
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
    }, [isTransparent, transparent]);

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
                                useMainTitleStyle && styles.mainTitle,
                                useCompactMainTitleStyle && styles.compactMainTitle,
                                titleAnimatedStyle,
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {title}
                        </Animated.Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={[
                        styles.rightContainer,
                        rightActionSlots === 0 && styles.rightContainerEmpty,
                        rightActionSlots === 1 && styles.rightContainerSingle,
                        rightActionSlots >= 2 && styles.rightContainerDouble,
                    ]}>
                        {rightComponent ? (
                            rightComponent
                        ) : rightIconName ? (
                            <AnimatedTouchableOpacity activeOpacity={1} onPress={rightIconOnPress} style={[styles.iconButton, buttonAnimatedStyle]}>
                                <AnimatedIcon name={rightIconName as any} size={20} animatedProps={iconAnimatedProps} style={styles.rightIconGlyph} />
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
        flexShrink: 0,
    },
    rightContainerEmpty: {
        width: 46,
    },
    rightContainerSingle: {
        width: 46,
    },
    rightContainerDouble: {
        width: 98,
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
        minWidth: 0,
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
    compactMainTitle: {
        fontSize: 18,
        lineHeight: 24,
        letterSpacing: 0,
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
    rightIconGlyph: {
        width: 20,
        height: 20,
        lineHeight: 20,
        includeFontPadding: false,
        textAlign: 'center',
        textAlignVertical: 'center',
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
