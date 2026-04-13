import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

interface HeaderProps {
    title: string;
    transparent?: boolean;
    onBackPress?: () => void;
}

function Header({ title, transparent, onBackPress }: HeaderProps) {
    const { colors, isDark } = useTheme();
    const { isGuest, userId } = useAuth();
    const insets = useSafeAreaInsets();

    const pathname = usePathname();
    const [hasUnread, setHasUnread] = useState(false);
    const [hasUnreadChats, setHasUnreadChats] = useState(false);
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
            if (!userId || isGuest) {
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
    }, [isGuest, userId]);

    useFocusEffect(
        useCallback(() => {
            checkUnreadNotifications();
            checkUnreadChats();
        }, [checkUnreadNotifications, checkUnreadChats])
    );

    useEffect(() => {
        if (!userId || isGuest) {
            setHasUnread(false);
            setHasUnreadChats(false);
            return;
        }

        checkUnreadNotifications();
        checkUnreadChats();

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

        const messagesChannel = supabase
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
            supabase.removeChannel(messagesChannel);
        };
    }, [userId, isGuest, checkUnreadNotifications, checkUnreadChats]);

    const isTransparent = useSharedValue(transparent ? 1 : 0);

    useEffect(() => {
        isTransparent.value = withTiming(transparent ? 1 : 0, { duration: 300 });
    }, [transparent]);

    const containerAnimatedStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [colors.background, 'transparent']
        )
    }));

    const titleAnimatedStyle = useAnimatedStyle(() => ({
        color: interpolateColor(
            isTransparent.value,
            [0, 1],
            [colors.text, '#FFFFFF']
        ),
        textShadowColor: 'rgba(0,0,0,0.6)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: isTransparent.value * 6,
    }));

    const buttonAnimatedStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            isTransparent.value,
            [0, 1],
            [isDark ? colors.surface : '#F3F4F6', 'rgba(0,0,0,0.3)']
        )
    }));

    const iconAnimatedProps = useAnimatedProps(() => ({
        color: interpolateColor(
            isTransparent.value,
            [0, 1],
            [colors.text, '#FFFFFF']
        ) as any
    }));

    return (
        <Animated.View style={[styles.container, containerAnimatedStyle, {
            paddingTop: insets.top + 8
        }]}>
            {/* Left Container - Only for Back Button */}
            {backVisible && (
                <View style={styles.leftContainer}>
                    <AnimatedTouchableOpacity activeOpacity={1}
                        onPress={() => (onBackPress ? onBackPress() : router.back())}
                        style={[styles.backButton, buttonAnimatedStyle]}
                    >
                        <AnimatedIcon name="arrow-back" size={20} animatedProps={iconAnimatedProps} />
                    </AnimatedTouchableOpacity>
                </View>
            )}

            {/* Title - Dynamic Alignment */}
            <View style={[
                styles.titleContainer,
                !backVisible && styles.mainTitleContainer
            ]}>
                <Animated.Text style={[
                    styles.title,
                    !backVisible && styles.mainTitle,
                    titleAnimatedStyle
                ]}>
                    {title}
                </Animated.Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.rightContainer}>
                {notifVisible ? (
                    <View style={styles.iconRow}>
                        {/* Chat Button */}
                        <AnimatedTouchableOpacity activeOpacity={1} onPress={() => router.push('/chat')} style={[styles.iconButton, buttonAnimatedStyle]}>
                            <AnimatedIcon name="chatbubbles" size={24} animatedProps={iconAnimatedProps} />
                            {hasUnreadChats && (
                                <View style={[styles.badge, transparent && { borderColor: 'rgba(0,0,0,0.3)' }]} />
                            )}
                        </AnimatedTouchableOpacity>
                        {/* Notifications Button */}
                        <AnimatedTouchableOpacity activeOpacity={1} onPress={() => router.push('/notifications')} style={[styles.iconButton, buttonAnimatedStyle]}>
                            <AnimatedIcon name="notifications" size={24} animatedProps={iconAnimatedProps} />
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
                        <AnimatedIcon name="add" size={24} animatedProps={iconAnimatedProps} />
                    </AnimatedTouchableOpacity>
                ) : null}
            </View>
        </Animated.View>
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
        fontSize: 26,
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
