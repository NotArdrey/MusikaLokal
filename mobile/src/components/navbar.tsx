import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useBottomOverlay } from '../context/BottomOverlayContext';
import { useTheme } from '../context/ThemeContext';
import { isE2EFixtureMode } from '../utils/e2eFixtures';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';

export const NAVBAR_BOTTOM_OFFSET = 24;
export const NAVBAR_HEIGHT = 72;
export const NAVBAR_CLEARANCE = NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + 16;
export const NAVBAR_WIDTH = '90%' as const;
export const NAVBAR_MAX_WIDTH = 400;

const NAVBAR_DEBUG_LOGS = false;
const NAVBAR_MOTION_MS = 220;
const NAVBAR_LAYER = 50;
const NAVBAR_SURFACE_ELEVATION = 16;
const AnimatedTouchableOpacity = RNAnimated.createAnimatedComponent(TouchableOpacity);

const GLOBAL_NAVBAR_ROUTES = new Set([
    '/account_details',
    '/add_gig',
    '/add_group',
    '/add_production',
    '/add_studio',
    '/add_duo',
    '/ai_suggestions',
    '/bookings',
    '/change_email',
    '/change_password',
    '/chat',
    '/create_playlist',
    '/create_station',
    '/discover',
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
    '/orders',
    '/payment-result',
    '/playlist_details',
    '/privacy_policy',
    '/production_team',
    '/product_details',
    '/profile',
    '/settings',
    '/seller_hub',
    '/shop',
    '/station_details',
    '/submit_review',
    '/terms_and_conditions',
    '/to_review',
    '/wallet',
]);

const E2E_NAVBAR_HIDDEN_ROUTES = new Set([
    '/add_gig',
    '/add_group',
    '/add_production',
    '/add_studio',
    '/create_playlist',
    '/edit_production',
    '/marketplace',
    '/wallet',
]);

const GLOBAL_NAVBAR_ROUTE_NAMES = new Set([
    'account_details',
    'activity',
    'add_duo',
    'add_gig',
    'add_group',
    'add_production',
    'add_studio',
    'ai_suggestions',
    'bookings',
    'change_email',
    'change_password',
    'chat',
    'create_playlist',
    'create_station',
    'discover',
    'edit_gig',
    'edit_group',
    'edit_profile',
    'edit_production',
    'edit_studio',
    'feed',
    'help_support',
    'home',
    'identity_verification',
    'manage',
    'manage_gig',
    'manage_group',
    'manage_studio',
    'marketplace',
    'my_group',
    'my_production',
    'my_studio',
    'my_venue',
    'notification_settings',
    'notifications',
    'orders',
    'payment-result',
    'playlist_details',
    'privacy_policy',
    'production_team',
    'product_details',
    'profile',
    'seller_hub',
    'settings',
    'shop',
    'station_details',
    'submit_review',
    'terms_and_conditions',
    'to_review',
    'wallet',
]);

const logNavbarDebug = (event: string, payload: Record<string, unknown>) => {
    if (NAVBAR_DEBUG_LOGS) {
    }
};

type NavbarProps = {
    global?: boolean;
    forceVisible?: boolean;
};

type NavIconProps = {
    active: boolean;
    color: string;
    icon: string;
    progress: RNAnimated.Value;
};

function NavIcon({ active, color, icon, progress }: NavIconProps) {
    const iconScale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.06],
    });

    return (
        <RNAnimated.View style={{ transform: [{ scale: iconScale }] }}>
            <Ionicons
                name={active ? icon as any : `${icon}-outline` as any}
                size={21}
                color={color}
            />
        </RNAnimated.View>
    );
}

type NavItem = {
    id: string;
    icon: string;
    label: string;
    route: string;
};

type NavTabProps = {
    active: boolean;
    colors: ReturnType<typeof useTheme>['colors'];
    compact?: boolean;
    isDark: boolean;
    item: NavItem;
    onPress: (item: NavItem) => void;
};

function NavTab({ active, colors, compact = false, isDark, item, onPress }: NavTabProps) {
    const progress = useRef(new RNAnimated.Value(active ? 1 : 0)).current;

    useEffect(() => {
        RNAnimated.timing(progress, {
            toValue: active ? 1 : 0,
            duration: NAVBAR_MOTION_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [active, progress]);

    const tabScale = progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.98, 1],
    });
    const iconColor = active ? colors.primary : colors.textSecondary;

    return (
        <AnimatedTouchableOpacity
            activeOpacity={active ? 1 : 0.82}
            key={item.id}
            testID={`nav-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            style={[
                styles.tabButton,
                compact ? styles.compactTabButton : null,
                { transform: [{ scale: tabScale }] },
                active ? [
                    styles.activeTabButton,
                    compact ? styles.compactActiveTabButton : null,
                    {
                        backgroundColor: isDark ? 'rgba(99, 102, 241, 0.18)' : colors.primaryLight,
                        borderColor: isDark ? 'rgba(129, 140, 248, 0.32)' : 'rgba(79, 70, 229, 0.16)',
                    },
                ] : null,
            ]}
            onPress={() => onPress(item)}
        >
            <NavIcon
                active={active}
                color={iconColor}
                icon={item.icon}
                progress={progress}
            />
            {active ? (
                <Text
                    numberOfLines={1}
                    style={[styles.activeLabel, { color: colors.primary }]}
                >
                    {item.label}
                </Text>
            ) : null}
        </AnimatedTouchableOpacity>
    );
}

export function Navbar(_props: NavbarProps) {
    return null;
}

export function GlobalNavbar({ forceVisible = false }: Pick<NavbarProps, 'forceVisible'>) {
    const { colors, isDark } = useTheme();
    const { isGuest, roleResolved, session, userRole } = useAuth();
    const { isBottomOverlayActive } = useBottomOverlay();
    const insets = useSafeAreaInsets();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const [optimisticActiveTab, setOptimisticActiveTab] = useState<string | null>(null);
    const pendingNavigationFrameRef = useRef<number | null>(null);
    const isFan = isFanUserRole(userRole);
    const routeName = pathname.replace(/^\/+/, '').split('/')[0] || '';
    const hideForE2EForm = isE2EFixtureMode() && E2E_NAVBAR_HIDDEN_ROUTES.has(pathname);
    const shouldRenderGlobalNavbar = !isBottomOverlayActive && (forceVisible
        || (!hideForE2EForm && (
            GLOBAL_NAVBAR_ROUTES.has(pathname)
            || GLOBAL_NAVBAR_ROUTE_NAMES.has(routeName)
        )));

    useEffect(() => {
        if (isGuest || isFan || !session?.user?.id) {
            setManageRoute('/manage');
            return;
        }

        if (!roleResolved) {
            setManageRoute('/manage');
            return;
        }

        setManageRoute(resolveRoleManageRoute(userRole));
    }, [isFan, isGuest, roleResolved, session?.user?.id, userRole]);

    const activeTab = useMemo(() => {
        if (pathname.includes('feed') || pathname.includes('home')) return 'home';
        if (pathname.includes('marketplace') || pathname.includes('shop') || pathname.includes('seller_hub') || pathname.includes('orders') || pathname.includes('product_details')) return 'marketplace';
        if (pathname.includes('ai_suggestions')) return 'ai';
        if (pathname.includes('bookings') || pathname.includes('chat') || pathname.includes('notification') || pathname.includes('payment-result') || pathname.includes('submit_review') || pathname.includes('to_review')) return 'activity';
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
                { id: 'home', icon: 'home', label: 'Home', route: '/feed' },
                { id: 'ai', icon: 'sparkles', label: 'AI', route: '/ai_suggestions' },
                { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings' },
                { id: 'marketplace', icon: 'storefront', label: 'Shop', route: '/marketplace' },
                { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute },
                { id: 'profile', icon: 'person', label: 'Profile', route: '/profile' }
            ];
        },
        [isFan, isGuest, manageRoute],
    );
    const useCompactFanNavbar = isFan && !isGuest;
    const displayedActiveTab = optimisticActiveTab ?? activeTab;

    useEffect(() => {
        setOptimisticActiveTab(null);
    }, [pathname]);

    useEffect(() => {
        return () => {
            if (pendingNavigationFrameRef.current !== null) {
                cancelAnimationFrame(pendingNavigationFrameRef.current);
            }
        };
    }, []);

    const handleNavPress = useCallback((item: NavItem) => {
        if (!item.route) {
            return;
        }

        if (displayedActiveTab !== item.id) {
            setOptimisticActiveTab(item.id);
        }

        if (pathname !== item.route) {
            if (pendingNavigationFrameRef.current !== null) {
                cancelAnimationFrame(pendingNavigationFrameRef.current);
            }

            pendingNavigationFrameRef.current = requestAnimationFrame(() => {
                pendingNavigationFrameRef.current = null;
                router.navigate(item.route as any);
            });
        }
    }, [displayedActiveTab, pathname]);

    useEffect(() => {
        logNavbarDebug('state', {
            activeTab,
            bottomOffset: NAVBAR_BOTTOM_OFFSET + insets.bottom,
            displayedActiveTab,
            forceVisible,
            global: true,
            isBottomOverlayActive,
            manageRoute,
            optimisticActiveTab,
            pathname,
            pointerEvents: 'auto',
            visible: shouldRenderGlobalNavbar,
        });
    }, [activeTab, displayedActiveTab, forceVisible, insets.bottom, isBottomOverlayActive, manageRoute, optimisticActiveTab, pathname, shouldRenderGlobalNavbar]);

    if (isGuest || !shouldRenderGlobalNavbar) {
        return null;
    }

    return (
        <RNAnimated.View
            collapsable={false}
            pointerEvents="auto"
            style={[
                styles.globalNavbarHost,
                { bottom: NAVBAR_BOTTOM_OFFSET + insets.bottom },
            ]}
        >
            <View
                collapsable={false}
                style={[
                    styles.navbarSurface,
                    useCompactFanNavbar ? styles.compactNavbarSurface : null,
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
                            const isActive = displayedActiveTab === item.id;
                            return (
                                <NavTab
                                    active={isActive}
                                    compact={useCompactFanNavbar}
                                    colors={colors}
                                    isDark={isDark}
                                    item={item}
                                    key={item.id}
                                    onPress={handleNavPress}
                                />
                            );
                        })}
                    </View>
                </BlurView>
            </View>
        </RNAnimated.View>
    );
}

export default memo(Navbar);

const styles = StyleSheet.create({
    globalNavbarHost: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 24,
        zIndex: NAVBAR_LAYER,
        elevation: NAVBAR_LAYER,
        overflow: 'visible',
    },
    navbarSurface: {
        alignSelf: 'center',
        width: NAVBAR_WIDTH,
        maxWidth: NAVBAR_MAX_WIDTH,
        borderRadius: 22,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.14,
        shadowRadius: 18,
        elevation: NAVBAR_SURFACE_ELEVATION,
        overflow: 'visible',
    },
    compactNavbarSurface: {
        width: 216,
        maxWidth: '62%',
    },
    blurContainer: {
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
    },
    container: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 9,
        paddingHorizontal: 8,
        gap: 3,
    },
    compactContainer: {
        justifyContent: 'center',
        paddingHorizontal: 7,
        gap: 6,
    },
    tabButton: {
        minWidth: 40,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    compactTabButton: {
        minWidth: 48,
        paddingHorizontal: 11,
    },
    activeTabButton: {
        minWidth: 84,
        maxWidth: 108,
        paddingHorizontal: 12,
        gap: 6,
    },
    compactActiveTabButton: {
        minWidth: 96,
        maxWidth: 116,
    },
    activeLabel: {
        flexShrink: 1,
        fontSize: 11,
        lineHeight: 14,
        fontFamily: 'Poppins_600SemiBold',
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
});

