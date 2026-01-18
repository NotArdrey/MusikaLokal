import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from "expo-router";
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
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
        <View className="flex-row justify-between items-center pt-12 pb-4 px-2" style={{ backgroundColor: colors.background }}>
            <View className="w-12 justify-center items-center">
                {backVisible ? (
                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="p-2 rounded-full"
                        style={{ backgroundColor: isDark ? colors.surface : '#F3F4F6' }}
                    >
                        <Ionicons name="arrow-back" size={20} color={colors.text} />
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Title */}
            <View className="flex-1 justify-center items-center">
                <Text className="text-lg font-semibold tracking-wide" style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>
                    {title}
                </Text>
            </View>

            {/* Action Button */}
            <View className="w-12 justify-center items-center">
                {notifVisible ? (
                    <TouchableOpacity onPress={() => router.push('/notifications')} className="p-2 relative">
                        <Ionicons name="notifications-outline" size={24} color={colors.text} />
                        {hasUnread && (
                            <View className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-500 border border-white dark:border-black" />
                        )}
                    </TouchableOpacity>
                ) : addbtnvisible ? (
                    <TouchableOpacity
                        onPress={() => router.push(btn)}
                        className="p-1 rounded-full"
                    >
                        <Ionicons name="add" size={28} color={colors.primary} />
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}
