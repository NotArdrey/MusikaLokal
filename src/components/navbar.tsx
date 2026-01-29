import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
    const { colors, isDark } = useTheme();
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
            // Check session first to avoid unnecessary API calls
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            // Check if token is expired - don't make API call if it is
            const tokenExpiry = session.expires_at ? session.expires_at * 1000 : 0;
            if (tokenExpiry && tokenExpiry < Date.now()) return;

            // Fetch generic profile to get role
            // This can fail with 401 if session is expired, which is fine
            const { data, error } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId: session.user.id }
            });

            // If error (e.g., expired session), just return silently
            if (error) return;

            if (data && data.role) {
                setRole(data.role);
                // Determine route based on role
                if (data.role === 'studio-owner') {
                    setManageRoute('/my_studio');
                } else if (data.role === 'manager' || data.role === 'musician-member') {
                    setManageRoute('/my_group');
                } else if (data.role === 'venue-owner') {
                    setManageRoute('/my_venue');
                } else {
                    setManageRoute('/manage'); // Default fallback page
                }
            } else {
                setManageRoute('/manage');
            }
        } catch (e) {
            // Silently ignore errors - user likely not logged in
            setManageRoute('/manage'); // Fallback on error
        }
    };

    let activeTab = 'home';

    if (pathname.includes('home')) {
        activeTab = 'home';
    } else if (pathname.includes('bookings')) {
        activeTab = 'activity';
    } else if (
        pathname.includes('my_studio') ||
        pathname.includes('my_venue') ||
        pathname.includes('my_group') ||
        pathname.includes('manage_') ||
        pathname.includes('edit_')
    ) {
        activeTab = 'manage';
    } else if (pathname.includes('profile') || pathname.includes('settings') || pathname.includes('wallet')) {
        activeTab = 'profile';
    }

    const navItems = [
        { id: 'home', icon: 'home', label: 'Home', route: '/home' },
        { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
        { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
        { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' }
    ];

    return (
        <View style={styles.navbarWrapper}>
            <BlurView
                intensity={Platform.OS === 'ios' ? 80 : 100}
                tint={isDark ? "systemMaterialDark" : "systemMaterialLight"}
                style={[
                    styles.blurContainer,
                    {
                        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                        borderColor: colors.border
                    }
                ]}
            >
                <View style={styles.container}>
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[
                                    styles.tabButton,
                                    isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                                ]}
                                onPress={() => router.replace(item.route as any)}
                            >
                                <View style={styles.iconWrapper}>
                                    <Ionicons
                                        name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                        size={24}
                                        color={isActive ? colors.primary : colors.textSecondary}
                                    />
                                    {isActive && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    navbarWrapper: {
        position: 'absolute',
        bottom: 24,
        alignSelf: 'center',
        width: '90%',
        maxWidth: 400,
        borderRadius: 24,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
        overflow: 'hidden', // Ensure blur respects border radius
    },
    blurContainer: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
    },
    container: {
        flexDirection: 'row',
        justifyContent: 'space-around', // Equal spacing
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    tabButton: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        borderRadius: 16,
        // width: 64, 
    },
    iconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    activeDot: {
        position: 'absolute',
        bottom: -8,
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    label: {
        fontSize: 10,
        marginTop: 4,
        fontFamily: 'Poppins_500Medium',
    }
});
