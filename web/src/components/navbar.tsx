import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';

export const NAVBAR_BOTTOM_OFFSET = Platform.OS === 'web' ? 0 : 24;
export const NAVBAR_HEIGHT = Platform.OS === 'web' ? 0 : 84;
export const NAVBAR_CLEARANCE = NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + 16;

function Navbar() {
    const { colors, isDark } = useTheme();
    const { isAdmin, isGuest, roleResolved, session, userRole } = useAuth();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const isFan = isFanUserRole(userRole);

    useEffect(() => {
        if (isGuest || isFan || !session?.user?.id) {
            setManageRoute('/manage');
            return;
        }

        if (!roleResolved) {
            setManageRoute('/manage');
            return;
        }

        setManageRoute(resolveRoleManageRoute(userRole, { adminRoute: isAdmin ? '/admin' : undefined }));
    }, [isAdmin, isFan, isGuest, roleResolved, session?.user?.id, userRole]);

    const activeTab = useMemo(() => {
        if (pathname.includes('feed') || pathname.includes('home')) return 'home';
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
            pathname.includes('my_production') ||
            pathname.includes('production_team') ||
            pathname.includes('manage_') ||
            pathname.includes('edit_') ||
            pathname.includes('add_')
        ) {
            return 'manage';
        }
        return 'home';
    }, [pathname]);

    const navItems = useMemo(
        () => {
            if (isGuest || isFan) {
                return [
                    { id: 'home', icon: 'home', label: 'Home', route: '/feed' },
                    { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' },
                ];
            }

            return [
                { id: 'home', icon: 'home', label: 'Home', route: '/home' },
                { id: 'ai-suggest', icon: 'sparkles', label: 'AI', route: '/ai_suggestions' },
                { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
                { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
                { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' }
            ];
        },
        [isFan, isGuest, manageRoute],
    );
    const useCompactFanNavbar = isFan && !isGuest;

    if (isGuest || Platform.OS === 'web') {
        return null;
    }

    return (
        <View
            style={[
                styles.navbarWrapper,
                useCompactFanNavbar ? styles.compactNavbarWrapper : null,
                { bottom: NAVBAR_BOTTOM_OFFSET + insets.bottom },
            ]}
        >
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
                <View style={[styles.container, useCompactFanNavbar ? styles.compactContainer : null]}>
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <TouchableOpacity activeOpacity={1}
                                key={item.id}
                                testID={`nav-${item.id}`}
                                accessibilityRole="button"
                                accessibilityLabel={`nav-${item.id}`}
                                style={[
                                    styles.tabButton,
                                    useCompactFanNavbar ? styles.compactTabButton : null,
                                    isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                                ]}
                                onPress={() => {
                                    if (item.route) {
                                        router.replace(item.route as any);
                                    }
                                }}
                            >
                                <View style={styles.iconWrapper}>
                                    <Ionicons
                                        name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                        size={28}
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

export default memo(Navbar);

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
    compactNavbarWrapper: {
        width: 184,
        maxWidth: '58%',
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
    compactContainer: {
        justifyContent: 'center',
        gap: 8,
    },
    tabButton: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 20,
    },
    compactTabButton: {
        width: 72,
        height: 56,
        padding: 0,
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
