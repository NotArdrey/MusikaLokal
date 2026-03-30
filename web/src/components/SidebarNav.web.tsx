import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function SidebarNav() {
    const { colors, isDark } = useTheme();
    const { isGuest, userRole } = useAuth();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback

    const fetchUserRole = useCallback(async () => {
        if (isGuest) return; // Skip for guests
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            const { data, error } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId: session.user.id }
            });

            if (error) return;

            if (data && data.role) {
                if (data.role === 'studio-owner') {
                    setManageRoute('/my_studio');
                } else if (data.role === 'manager' || data.role === 'musician-member') {
                    setManageRoute('/my_group');
                } else if (data.role === 'venue-owner') {
                    setManageRoute('/my_venue');
                } else {
                    setManageRoute('/manage');
                }
            } else {
                setManageRoute('/manage');
            }
        } catch (e) {
            setManageRoute('/manage');
        }
    }, [isGuest]);

    useEffect(() => {
        fetchUserRole();
    }, [fetchUserRole]);

    const activeTab = useMemo(() => {
        if (pathname.includes('home')) return 'home';
        if (pathname.includes('bookings')) return 'activity';
        if (pathname.includes('ai_suggestions')) return 'ai-suggest';
        if (pathname.includes('profile') || pathname.includes('settings') || pathname.includes('wallet')) {
            return 'profile';
        }
        if (
            pathname === '/manage' ||
            pathname.startsWith('/manage/') ||
            pathname.includes('my_studio') ||
            pathname.includes('my_venue') ||
            pathname.includes('my_group') ||
            pathname.includes('manage_') ||
            pathname.includes('edit_') ||
            pathname.includes('add_')
        ) {
            return 'manage';
        }
        return 'home';
    }, [pathname]);

    const navItems = useMemo(
        () => [
            { id: 'home', icon: 'home', label: 'Home', route: '/home' },
            { id: 'ai-suggest', icon: 'sparkles', label: 'AI Discovery', route: '/ai_suggestions' },
            { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
            { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
            { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' }
        ],
        [manageRoute],
    );

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.replace('/');
    };

    return (
        <View style={[styles.sidebarContainer, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderRightColor: colors.border }]}>
            {/* Logo area */}
            <View style={styles.logoSection}>
                <Image
                    source={require('../../assets/images/Musika-lokal-logo.png')}
                    style={[styles.logoImage, { tintColor: colors.primary }]}
                    resizeMode="contain"
                />
                <Text style={[styles.brandName, { color: colors.text }]}>MusikaLokal</Text>
            </View>

            {/* Navigation Links */}
            <ScrollView style={styles.navContainer}>
                {navItems.map(item => {
                    const isActive = activeTab === item.id;
                    return (
                        <TouchableOpacity 
                            key={item.id}
                            style={[
                                styles.navItem, 
                                isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
                            ]}
                            onPress={() => item.route && router.replace(item.route as any)}
                        >
                            <Ionicons 
                                name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                size={22} 
                                color={isActive ? colors.primary : colors.textSecondary} 
                                style={{ width: 30 }}
                            />
                            <Text style={[
                                styles.navLabel, 
                                { color: isActive ? colors.primary : colors.text },
                                isActive && { fontFamily: 'Poppins_600SemiBold' }
                            ]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* Footer / User Area */}
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={22} color={colors.textSecondary} style={{ width: 30 }} />
                    <Text style={[styles.navLabel, { color: colors.textSecondary }]}>Log Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    sidebarContainer: {
        width: 260,
        height: '100%',
        borderRightWidth: 1,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
    },
    logoSection: {
        padding: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    logoImage: {
        width: 36,
        height: 36,
    },
    brandName: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    navContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 12,
        marginBottom: 6,
    },
    navLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 10,
    },
    footer: {
        padding: 24,
        borderTopWidth: 1,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
    }
});
