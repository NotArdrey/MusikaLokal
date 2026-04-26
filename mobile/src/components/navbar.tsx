import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useBottomOverlay } from '../context/BottomOverlayContext';
import { useTheme } from '../context/ThemeContext';
import { resolveRoleManageRoute } from '../utils/roleRouting';

export const NAVBAR_BOTTOM_OFFSET = 24;
export const NAVBAR_HEIGHT = 84;
export const NAVBAR_CLEARANCE = NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + 16;
export const NAVBAR_WIDTH = '90%' as const;
export const NAVBAR_MAX_WIDTH = 400;

const NAVBAR_DEBUG_LOGS = false;
const GLOBAL_NAVBAR_ROUTES = new Set([
    '/account_details',
    '/add_gig',
    '/add_group',
    '/add_production',
    '/add_studio',
    '/ai_suggestions',
    '/bookings',
    '/create_playlist',
    '/create_station',
    '/edit_gig',
    '/edit_group',
    '/edit_profile',
    '/edit_production',
    '/edit_studio',
    '/feed',
    '/help_support',
    '/home',
    '/identity_verification',
    '/manage',
    '/manage_gig',
    '/manage_group',
    '/manage_studio',
    '/marketplace',
    '/my_group',
    '/my_production',
    '/my_studio',
    '/my_venue',
    '/notification_settings',
    '/notifications',
    '/playlist_details',
    '/post_details',
    '/privacy_policy',
    '/producer_project_details',
    '/production_team',
    '/product_details',
    '/profile',
    '/settings',
    '/station_details',
    '/submit_review',
    '/terms_and_conditions',
    '/to_review',
    '/wallet',
]);

const logNavbarDebug = (event: string, payload: Record<string, unknown>) => {
    if (NAVBAR_DEBUG_LOGS) {
    }
};

type NavbarProps = {
    global?: boolean;
    forceVisible?: boolean;
};

function Navbar({ global = false, forceVisible = false }: NavbarProps) {
    const { colors, isDark } = useTheme();
    const { isGuest, roleResolved, session, userRole } = useAuth();
    const { isBottomOverlayActive } = useBottomOverlay();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const shouldRenderGlobalNavbar = global && (forceVisible || GLOBAL_NAVBAR_ROUTES.has(pathname));

    useEffect(() => {
        if (isGuest || !session?.user?.id) {
            setManageRoute('/manage');
            return;
        }

        if (!roleResolved) {
            setManageRoute('/manage');
            return;
        }

        setManageRoute(resolveRoleManageRoute(userRole));
    }, [isGuest, roleResolved, session?.user?.id, userRole]);

    const activeTab = useMemo(() => {
        if (pathname.includes('feed') || pathname.includes('home')) return 'home';
        if (pathname.includes('marketplace') || pathname.includes('shop') || pathname.includes('seller_hub') || pathname.includes('orders') || pathname.includes('product_details')) return 'marketplace';
        if (pathname.includes('ai_suggestions')) return 'ai';
        if (pathname.includes('bookings') || pathname.includes('chat') || pathname.includes('notification') || pathname.includes('submit_review') || pathname.includes('to_review')) return 'activity';
        if (
            pathname.includes('profile') ||
            pathname.includes('settings') ||
            pathname.includes('wallet') ||
            pathname.includes('account_details') ||
            pathname.includes('change_email') ||
            pathname.includes('change_password') ||
            pathname.includes('help_support') ||
            pathname.includes('privacy_policy') ||
            pathname.includes('terms_and_conditions') ||
            pathname.includes('identity_verification') ||
            pathname.includes('playlist_details') ||
            pathname.includes('create_playlist') ||
            pathname.includes('station_details') ||
            pathname.includes('create_station')
        ) {
            return 'profile';
        }
        if (
            pathname === '/manage' ||
            pathname.startsWith('/manage/') ||
            pathname.includes('my_production') ||
            pathname.includes('producer_projects') ||
            pathname.includes('producer_project_details') ||
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
        () => [
            { id: 'home', icon: 'home', label: 'Home', route: '/feed' },
            { id: 'ai', icon: 'sparkles', label: 'AI', route: '/ai_suggestions' },
            { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
            { id: 'marketplace', icon: 'storefront', label: 'Shop', route: '/marketplace' },
            { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
            { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' }
        ],
        [manageRoute],
    );

    useEffect(() => {
        logNavbarDebug('state', {
            activeTab,
            bottomOffset: NAVBAR_BOTTOM_OFFSET + insets.bottom,
            forceVisible,
            global,
            isBottomOverlayActive,
            manageRoute,
            pathname,
            pointerEvents: 'auto',
            visible: shouldRenderGlobalNavbar,
        });
    }, [activeTab, forceVisible, global, insets.bottom, isBottomOverlayActive, manageRoute, pathname, shouldRenderGlobalNavbar]);

    if (!global || !shouldRenderGlobalNavbar) {
        return null;
    }

    return (
        <View
            pointerEvents="auto"
            style={[
                styles.navbarWrapper,
                { bottom: NAVBAR_BOTTOM_OFFSET + insets.bottom },
                isBottomOverlayActive ? styles.navbarOverlayActive : null,
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
                <View style={styles.container}>
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <TouchableOpacity activeOpacity={1}
                                key={item.id}
                                style={[
                                    styles.tabButton,
                                    isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
                                ]}
                                onPress={() => {
                                    if (item.route && pathname !== item.route) {
                                        router.navigate(item.route as any);
                                    }
                                }}
                            >
                                <View style={styles.iconWrapper}>
                                    <Ionicons
                                        name={isActive ? item.icon as any : `${item.icon}-outline` as any}
                                        size={22}
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
        width: NAVBAR_WIDTH,
        maxWidth: NAVBAR_MAX_WIDTH,
        zIndex: 1200,
        borderRadius: 24,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 1200,
        overflow: 'hidden', // Ensure blur respects border radius
    },
    navbarOverlayActive: {
        opacity: 0.98,
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
        padding: 10,
        borderRadius: 16,
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

