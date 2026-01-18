import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
    const { colors } = useTheme();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const [role, setRole] = useState('');

    useFocusEffect(
        useCallback(() => {
            fetchUserRole();
        }, [])
    );

    const fetchUserRole = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Fetch generic profile to get role
            const { data, error } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId: user.id }
            });

            if (data && data.role) {
                setRole(data.role);
                // Determine route based on role
                if (data.role === 'studio-owner') {
                    setManageRoute('/my_studio');
                } else if (data.role === 'manager' || data.role === 'musician-member') {
                    setManageRoute('/my_group');
                } else if (data.role === 'venue-owner') {
                    setManageRoute('/my_gig');
                } else {
                    setManageRoute('/manage'); // Default fallback page
                }
            } else {
                setManageRoute('/manage');
            }
        } catch (e) {
            console.log('Error fetching role for navbar:', e);
            setManageRoute('/manage'); // Fallback on error
        }
    };

    let activeTab = '';
    const ACTIVE_COLOR = colors.primary;
    const INACTIVE_COLOR = colors.muted;

    if (pathname.includes('home')) {
        activeTab = 'home';
    } else if (pathname.includes('bookings')) {
        activeTab = 'activity';
    } else if (
        pathname.includes('my_studio') ||
        pathname.includes('my_gig') ||
        pathname.includes('my_group') ||
        pathname.includes('manage_') ||
        pathname.includes('edit_')
    ) {
        activeTab = 'manage';
    } else if (pathname.includes('profile') || pathname.includes('settings') || pathname.includes('wallet')) {
        activeTab = 'profile';
    }

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: colors.surface,
                    shadowColor: "#000",
                    shadowOffset: {
                        width: 0,
                        height: 4,
                    },
                    shadowOpacity: 0.1,
                    shadowRadius: 12,
                    elevation: 10,
                }
            ]}
        >

            <TouchableOpacity
                style={[styles.tabButton, activeTab !== "home" && styles.inactiveTab]}
                onPress={() => router.push("/home")}>
                <View style={[styles.iconContainer, activeTab === "home" ? { backgroundColor: 'rgba(99, 102, 241, 0.1)' } : null]}>
                    <Ionicons
                        name={activeTab === "home" ? "home" : "home-outline"}
                        size={22}
                        color={activeTab === "home" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "home" && (
                    <Text style={[styles.label, { color: colors.primary }]}>Home</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.tabButton, activeTab !== "activity" && styles.inactiveTab]}
                onPress={() => router.push("/bookings")}>
                <View style={[styles.iconContainer, activeTab === "activity" ? { backgroundColor: 'rgba(99, 102, 241, 0.1)' } : null]}>
                    <Ionicons
                        name={activeTab === "activity" ? "calendar" : "calendar-outline"}
                        size={22}
                        color={activeTab === "activity" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "activity" && (
                    <Text style={[styles.label, { color: colors.primary }]}>Activity</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.tabButton, activeTab !== "manage" && styles.inactiveTab]}
                onPress={() => router.push(manageRoute as any)}>
                <View style={[styles.iconContainer, activeTab === "manage" ? { backgroundColor: 'rgba(99, 102, 241, 0.1)' } : null]}>
                    <Ionicons
                        name={activeTab === "manage" ? "briefcase" : "briefcase-outline"}
                        size={22}
                        color={activeTab === "manage" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "manage" && (
                    <Text style={[styles.label, { color: colors.primary }]}>Manage</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.tabButton, activeTab !== "profile" && styles.inactiveTab]}
                onPress={() => router.push("/profile")}>
                <View style={[styles.iconContainer, activeTab === "profile" ? { backgroundColor: 'rgba(99, 102, 241, 0.1)' } : null]}>
                    <Ionicons
                        name={activeTab === "profile" ? "person" : "person-outline"}
                        size={22}
                        color={activeTab === "profile" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "profile" && (
                    <Text style={[styles.label, { color: colors.primary }]}>Profile</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 24, // bottom-6 (6 * 4 = 24)
        left: 16,   // left-4
        right: 16,  // right-4
        borderRadius: 24, // rounded-3xl
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24, // px-6
        paddingVertical: 16,   // py-4
    },
    tabButton: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4, // gap-1
    },
    inactiveTab: {
        opacity: 0.6,
    },
    iconContainer: {
        padding: 8, // p-2
        borderRadius: 12, // rounded-xl
    },
    label: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 10,
    },
});
