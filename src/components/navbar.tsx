import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
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
        <View style={styles.navbarWrapper}>
            <BlurView intensity={90} tint="dark" style={styles.blurContainer}>
                <View style={[styles.container, {
                    backgroundColor: 'rgba(20, 20, 25, 0.85)',
                }]}>
                    <TouchableOpacity
                        style={[styles.tabButton, activeTab !== "home" && styles.inactiveTab]}
                        onPress={() => router.replace("/home")}>
                        <View style={[styles.iconContainer, activeTab === "home" ? styles.activeIconContainer : null]}>
                            <Ionicons
                                name={activeTab === "home" ? "home" : "home-outline"}
                                size={22}
                                color={activeTab === "home" ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)"}
                            />
                        </View>
                        {activeTab === "home" && (
                            <Text style={styles.label}>Home</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tabButton, activeTab !== "activity" && styles.inactiveTab]}
                        onPress={() => router.replace("/bookings")}>
                        <View style={[styles.iconContainer, activeTab === "activity" ? styles.activeIconContainer : null]}>
                            <Ionicons
                                name={activeTab === "activity" ? "calendar" : "calendar-outline"}
                                size={22}
                                color={activeTab === "activity" ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)"}
                            />
                        </View>
                        {activeTab === "activity" && (
                            <Text style={styles.label}>Activity</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tabButton, activeTab !== "manage" && styles.inactiveTab]}
                        onPress={() => router.replace(manageRoute as any)}>
                        <View style={[styles.iconContainer, activeTab === "manage" ? styles.activeIconContainer : null]}>
                            <Ionicons
                                name={activeTab === "manage" ? "briefcase" : "briefcase-outline"}
                                size={22}
                                color={activeTab === "manage" ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)"}
                            />
                        </View>
                        {activeTab === "manage" && (
                            <Text style={styles.label}>Manage</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.tabButton, activeTab !== "profile" && styles.inactiveTab]}
                        onPress={() => router.replace("/profile")}>
                        <View style={[styles.iconContainer, activeTab === "profile" ? styles.activeIconContainer : null]}>
                            <Ionicons
                                name={activeTab === "profile" ? "person" : "person-outline"}
                                size={22}
                                color={activeTab === "profile" ? "#FFFFFF" : "rgba(255, 255, 255, 0.5)"}
                            />
                        </View>
                        {activeTab === "profile" && (
                            <Text style={styles.label}>Profile</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    navbarWrapper: {
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: [{ translateX: -180 }], // Approximate half width centered
        width: 360,
        borderRadius: 100,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 12,
        },
        shadowOpacity: 0.5,
        shadowRadius: 24,
        elevation: 24,
    },
    blurContainer: {
        borderRadius: 100,
        overflow: 'hidden',
    },
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    tabButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 50,
    },
    inactiveTab: {
        opacity: 0.8,
    },
    iconContainer: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
    },
    activeIconContainer: {
        backgroundColor: '#6366F1', // Indigo Primary
    },
    label: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        color: '#FFFFFF',
    },
});
