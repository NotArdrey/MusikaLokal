import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

interface HeaderProps {
    title: string;
}

export default function Header({ title }: HeaderProps) {
    const { colors, isDark } = useTheme();

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
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase.functions.invoke('manage-notifications', {
                body: { action: 'unread_count', userId: user.id }
            });

            if (!error && data) {
                setHasUnread(data.count > 0);
            }
        } catch (e) {
            console.log('Error checking notifications:', e);
        }
    };

    useEffect(() => {
        if (pathname === "/explore" || pathname === "/home" || pathname === "/manage" || pathname === "/bookings") {
            setnotifVisible(true)
            setBackVisible(false)
            setaddbtnvisible(false)
        } else if (pathname === "/settings" || pathname === "/profile") {
            setnotifVisible(false)
            setBackVisible(false)
            setaddbtnvisible(false)
        } else if (pathname === "/my_group" || pathname === "/my_gig" || pathname === "/my_studio") {
            setnotifVisible(false)
            setBackVisible(false)
            setaddbtnvisible(true)
        } else {
            setBackVisible(true)
            setnotifVisible(false)
            setaddbtnvisible(false)
        }
    }, [pathname]);


    useEffect(() => {

        if (addPath === "/my_gig") {
            setBtn("/add_gig")
        } else if (addPath === "/my_studio") {
            setBtn("/add_studio")
        } else if (addPath === "/my_group") {
            setBtn("/add_group")
        }

    }, [addPath])

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.leftContainer}>
                {backVisible ? (
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={[styles.backButton, { backgroundColor: isDark ? colors.surface : '#F3F4F6' }]}
                    >
                        <Ionicons name="arrow-back" size={20} color={colors.text} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Title */}
            <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: colors.text }]}>
                    {title}
                </Text>
            </View>

            {/* Action Button */}
            <View style={styles.rightContainer}>
                {notifVisible ? (
                    <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.iconButton}>
                        <Ionicons name="notifications-outline" size={24} color={colors.text} />
                        {hasUnread && (
                            <View style={styles.badge} />
                        )}
                    </TouchableOpacity>
                ) : addbtnvisible ? (
                    <TouchableOpacity
                        onPress={() => router.push(btn)}
                        style={styles.addButton}
                    >
                        <Ionicons name="add" size={28} color={colors.primary} />
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
        paddingTop: 48, // pt-12 (safe area approx)
        paddingBottom: 16, // pb-4
        paddingHorizontal: 8, // px-2
    },
    leftContainer: {
        width: 48, // w-12
        justifyContent: 'center',
        alignItems: 'center',
    },
    rightContainer: {
        width: 48, // w-12
        justifyContent: 'center',
        alignItems: 'center',
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
    title: {
        fontSize: 18, // text-lg
        fontWeight: '600', // font-semibold
        letterSpacing: 0.5, // tracking-wide
        fontFamily: 'Poppins_600SemiBold',
    },
    iconButton: {
        padding: 8,
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444', // red-500
        borderWidth: 1,
        borderColor: 'white',
    },
    addButton: {
        padding: 4,
        borderRadius: 9999,
    },
});
