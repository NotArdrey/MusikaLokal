import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
    title: string;
    transparent?: boolean;
}

export default function Header({ title, transparent }: HeaderProps) {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();

    const pathname = usePathname();
    const [backVisible, setBackVisible] = useState(false);
    const [notifVisible, setnotifVisible] = useState(false);
    const [addbtnvisible, setaddbtnvisible] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);
    const addPath = usePathname();
    const [btn, setBtn] = useState<'/add_gig' | '/add_studio' | '/add_group'>('/add_gig');

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

    useEffect(() => {
        if (pathname === "/explore" || pathname === "/home" || pathname === "/manage" || pathname === "/bookings" || pathname === "/ai_suggestions") {
            setnotifVisible(true)
            setBackVisible(false)
            setaddbtnvisible(false)
        } else if (pathname === "/settings" || pathname === "/profile") {
            setnotifVisible(false)
            setBackVisible(false)
            setaddbtnvisible(false)
        } else if (pathname === "/my_group" || pathname === "/my_venue" || pathname === "/my_studio") {
            setnotifVisible(false)
            setBackVisible(false)
            setaddbtnvisible(true)
        } else if (pathname === "/manage_studio" || pathname === "/manage_gig" || pathname === "/manage_group") {
            // No back button for manage detail pages - users navigate via navbar
            setnotifVisible(false)
            setBackVisible(false)
            setaddbtnvisible(false)
        } else {
            setBackVisible(true)
            setnotifVisible(false)
            setaddbtnvisible(false)
        }
    }, [pathname]);


    useEffect(() => {

        if (addPath === "/my_venue") {
            setBtn("/add_gig")
        } else if (addPath === "/my_studio") {
            setBtn("/add_studio")
        } else if (addPath === "/my_group") {
            setBtn("/add_group")
        }

    }, [addPath])

    return (
        <View style={[styles.container, {
            backgroundColor: transparent ? 'transparent' : colors.background,
            paddingTop: insets.top + 8
        }]}>
            {/* Left Container - Only for Back Button */}
            {backVisible && (
                <View style={styles.leftContainer}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[styles.backButton, { backgroundColor: isDark ? colors.surface : '#F3F4F6' }]}
                    >
                        <Ionicons name="arrow-back" size={20} color={colors.text} />
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
                        <TouchableOpacity onPress={() => router.push('/chat')} style={[styles.iconButton, { backgroundColor: isDark ? colors.surface : '#F3F4F6' }]}>
                            <Ionicons name="chatbubbles" size={24} color={colors.text} />
                        </TouchableOpacity>
                        {/* Notifications Button */}
                        <TouchableOpacity onPress={() => router.push('/notifications')} style={[styles.iconButton, { backgroundColor: isDark ? colors.surface : '#F3F4F6' }]}>
                            <Ionicons name="notifications" size={24} color={colors.text} />
                            {hasUnread && (
                                <View style={styles.badge} />
                            )}
                        </TouchableOpacity>
                    </View>
                ) : addbtnvisible ? (
                    <TouchableOpacity
                        onPress={() => router.push(btn)}
                        style={[styles.addButton, { backgroundColor: isDark ? colors.surface : '#F3F4F6' }]}
                    >
                        <Ionicons name="add" size={24} color={colors.text} />
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}

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
        // minWidth: 48, 
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
