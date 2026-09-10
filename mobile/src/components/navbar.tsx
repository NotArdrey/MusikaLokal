import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useBottomOverlay } from '../context/BottomOverlayContext';
import { useTheme } from '../context/ThemeContext';
import { prefetchNavbarColdBootQueries } from '../data/coldBootPrefetch';
import { isE2EFixtureMode } from '../utils/e2eFixtures';
import { logLoadTime } from '../utils/loadTimeLogger';
import { isFanUserRole, resolveRoleManageRoute } from '../utils/roleRouting';

export const NAVBAR_BOTTOM_OFFSET = 24;
export const NAVBAR_HEIGHT = 72;
export const NAVBAR_CLEARANCE = NAVBAR_BOTTOM_OFFSET + NAVBAR_HEIGHT + 16;
export const NAVBAR_WIDTH = '90%' as const;
export const NAVBAR_MAX_WIDTH = 400;

const NAVBAR_DEBUG_LOGS = false;
const NAVBAR_MOTION_MS = 150;
const NAVBAR_ROUTE_PRELOAD_DELAY_MS = 1400;
const NAVBAR_ROUTE_PRELOAD_GAP_MS = 650;
const NAVBAR_LAYER = 50;
const NAVBAR_SURFACE_ELEVATION = 16;
const NAVBAR_DARK_SURFACE = '#121218';
const NAVBAR_DARK_BORDER = '#2A2A33';
const NAVBAR_LIGHT_SURFACE = '#FFFFFF';
const NAVBAR_DARK_ACTIVE_SURFACE = '#262245';
const NAVBAR_DARK_ACTIVE_BORDER = '#3F3B72';
const NAVBAR_LIGHT_ACTIVE_SURFACE = '#EEF2FF';
const NAVBAR_LIGHT_ACTIVE_BORDER = '#C7D2FE';
const AnimatedTouchableOpacity = RNAnimated.createAnimatedComponent(TouchableOpacity);

const E2E_NAVBAR_HIDDEN_ROUTES = new Set([
    '/add_gig',
    '/add_group',
    '/add_production',
    '/add_studio',
    '/create_playlist',
    '/edit_production',
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

type GlobalNavbarProps = Pick<NavbarProps, 'forceVisible'> & Partial<BottomTabBarProps>;

const TAB_BAR_HOSTED_PATHS = new Set([
    '/feed',
    '/home',
    '/bookings',
    '/marketplace',
    '/manage',
    '/profile',
    '/chat',
    '/notifications',
    '/my_group',
    '/my_production',
    '/my_studio',
    '/my_venue',
]);

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
    routeName: string;
};

type NavTabProps = {
    active: boolean;
    colors: ReturnType<typeof useTheme>['colors'];
    compact?: boolean;
    iconOnly?: boolean;
    isDark: boolean;
    item: NavItem;
    onPress: (item: NavItem) => void;
};

function NavTab({ active, colors, compact = false, iconOnly = false, isDark, item, onPress }: NavTabProps) {
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
    const showActiveLabel = active && !iconOnly;

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
                iconOnly ? styles.iconOnlyTabButton : null,
                { transform: [{ scale: tabScale }] },
                active ? [
                    iconOnly ? styles.iconOnlyActiveTabButton : styles.activeTabButton,
                    compact ? styles.compactActiveTabButton : null,
                    {
                        backgroundColor: isDark ? NAVBAR_DARK_ACTIVE_SURFACE : NAVBAR_LIGHT_ACTIVE_SURFACE,
                        borderColor: isDark ? NAVBAR_DARK_ACTIVE_BORDER : NAVBAR_LIGHT_ACTIVE_BORDER,
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
            {showActiveLabel ? (
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
    const pathname = usePathname();

    if (TAB_BAR_HOSTED_PATHS.has(pathname)) {
        return null;
    }

    return <GlobalNavbar forceVisible />;
}

const getTabIdFromRouteName = (routeName: string | undefined) => {
    if (!routeName) return null;
    if (routeName === 'feed' || routeName === 'home') return 'home';
    if (routeName === 'bookings' || routeName === 'chat' || routeName === 'notifications') return 'activity';
    if (routeName === 'marketplace') return 'marketplace';
    if (
        routeName === 'manage' ||
        routeName === 'my_group' ||
        routeName === 'my_production' ||
        routeName === 'my_studio' ||
        routeName === 'my_venue'
    ) {
        return 'manage';
    }
    if (routeName === 'profile') return 'profile';
    return null;
};

const getTabIdFromPathname = (pathname: string) => {
    if (pathname.includes('feed') || pathname.includes('home')) return 'home';
    if (pathname.includes('marketplace') || pathname.includes('shop') || pathname.includes('seller_hub') || pathname.includes('orders') || pathname.includes('product_details')) return 'marketplace';
    if (pathname.includes('bookings') || pathname.includes('chat') || pathname.includes('notification') || pathname.includes('payment-result') || pathname.includes('submit_review') || pathname.includes('to_review') || pathname.includes('gig_feature_consent')) return 'activity';
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
        pathname.includes('production_team') ||
        pathname.includes('manage_') ||
        pathname.includes('edit_') ||
        pathname.includes('add_')
    ) {
        return 'manage';
    }
    return 'home';
};

const getRouteNameFromPath = (path: string) => path.replace(/^\/+/, '').split('/')[0] || 'manage';

export function GlobalNavbar({ forceVisible = false, navigation, state }: GlobalNavbarProps) {
    const { colors, isDark } = useTheme();
    const { isGuest, roleResolved, session, userRole } = useAuth();
    const { isBottomOverlayActive } = useBottomOverlay();
    const insets = useSafeAreaInsets();
    const { width: windowWidth } = useWindowDimensions();
    const queryClient = useQueryClient();
    const pathname = usePathname();
    const [manageRoute, setManageRoute] = useState('/manage'); // Fallback
    const [pendingTab, setPendingTab] = useState<string | null>(null);
    const navigationFrameRef = useRef<number | null>(null);
    const pendingTabResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const preloadedRouteNamesRef = useRef<Set<string>>(new Set());
    const tabPressTimingRef = useRef<{ startedAt: number; targetTab: string } | null>(null);
    const isFan = isFanUserRole(userRole);
    const hideForE2EForm = isE2EFixtureMode() && E2E_NAVBAR_HIDDEN_ROUTES.has(pathname);
    const hasTabNavigator = Boolean(state && navigation);
    const focusedRoute = state?.routes[state.index];
    const shouldRenderGlobalNavbar =
        !isBottomOverlayActive && !hideForE2EForm && (forceVisible || hasTabNavigator);

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
        return getTabIdFromRouteName(focusedRoute?.name) ?? getTabIdFromPathname(pathname);
    }, [focusedRoute?.name, pathname]);

    const navItems = useMemo(
        () => {
            if (isGuest || isFan) {
                return [
                    { id: 'home', icon: 'home', label: 'Home', route: '/feed', routeName: 'feed' },
                    { id: 'profile', icon: 'person', label: 'Profile', route: '/profile', routeName: 'profile' },
                ];
            }

            const manageRouteName = getRouteNameFromPath(manageRoute);

            return [
                { id: 'home', icon: 'home', label: 'Home', route: '/feed', routeName: 'feed' },
                { id: 'activity', icon: 'calendar', label: 'Activity', route: '/bookings', routeName: 'bookings' },
                { id: 'marketplace', icon: 'storefront', label: 'Shop', route: '/marketplace', routeName: 'marketplace' },
                { id: 'manage', icon: 'briefcase', label: 'Manage', route: manageRoute, routeName: manageRouteName },
                { id: 'profile', icon: 'person', label: 'Profile', route: '/profile', routeName: 'profile' }
            ];
        },
        [isFan, isGuest, manageRoute],
    );
    const useCompactFanNavbar = isFan && !isGuest;
    const hasMainTabSet = navItems.length >= 6;
    const useNarrowMainNavbar = !useCompactFanNavbar && hasMainTabSet && windowWidth < 430;
    const useIconOnlyNavbar = useNarrowMainNavbar && windowWidth < 390;

    const handleNavPress = useCallback((item: NavItem) => {
        const targetRoute = navigation && state
            ? state.routes.find((route) => route.name === item.routeName)
            : null;

        if (navigation && targetRoute) {
            const event = navigation.emit({
                type: 'tabPress',
                target: targetRoute.key,
                canPreventDefault: true,
            });

            if (event.defaultPrevented || activeTab === item.id) {
                return;
            }
        } else if (activeTab === item.id) {
            return;
        }

        if (navigationFrameRef.current !== null) {
            cancelAnimationFrame(navigationFrameRef.current);
        }
        if (pendingTabResetTimerRef.current) {
            clearTimeout(pendingTabResetTimerRef.current);
        }

        // Paint the selected tab before mounting a potentially expensive screen.
        setPendingTab(item.id);
        tabPressTimingRef.current = {
            startedAt: Date.now(),
            targetTab: item.id,
        };

        const resetPendingTab = () => {
            pendingTabResetTimerRef.current = setTimeout(() => {
                setPendingTab(null);
                pendingTabResetTimerRef.current = null;
            }, 1200);
        };

        if (!navigation || !state) {
            navigationFrameRef.current = requestAnimationFrame(() => {
                navigationFrameRef.current = null;
                router.replace(item.route as any);
                resetPendingTab();
            });
            return;
        }

        if (!targetRoute) {
            navigationFrameRef.current = requestAnimationFrame(() => {
                navigationFrameRef.current = null;
                router.replace(item.route as any);
                resetPendingTab();
            });
            return;
        }

        navigationFrameRef.current = requestAnimationFrame(() => {
            navigationFrameRef.current = null;
            navigation.navigate(targetRoute.name, targetRoute.params);
            resetPendingTab();
        });
    }, [activeTab, navigation, state]);

    useEffect(() => {
        const timing = tabPressTimingRef.current;
        if (!timing || timing.targetTab !== activeTab) {
            return;
        }

        logLoadTime('Navigation', 'tab-interactive', {
            durationMs: Date.now() - timing.startedAt,
            tab: activeTab,
        });
        setPendingTab(null);
        if (pendingTabResetTimerRef.current) {
            clearTimeout(pendingTabResetTimerRef.current);
            pendingTabResetTimerRef.current = null;
        }
        tabPressTimingRef.current = null;
    }, [activeTab]);

    useEffect(() => () => {
        if (navigationFrameRef.current !== null) {
            cancelAnimationFrame(navigationFrameRef.current);
        }
        if (pendingTabResetTimerRef.current) {
            clearTimeout(pendingTabResetTimerRef.current);
        }
    }, []);

    useEffect(() => {
        if (focusedRoute?.name) {
            preloadedRouteNamesRef.current.add(focusedRoute.name);
        }
    }, [focusedRoute?.name]);

    useEffect(() => {
        logNavbarDebug('state', {
            activeTab,
            bottomOffset: NAVBAR_BOTTOM_OFFSET + insets.bottom,
            forceVisible,
            focusedRoute: focusedRoute?.name,
            global: true,
            isBottomOverlayActive,
            manageRoute,
            pathname,
            pointerEvents: 'auto',
            visible: shouldRenderGlobalNavbar,
        });
    }, [activeTab, focusedRoute?.name, forceVisible, insets.bottom, isBottomOverlayActive, manageRoute, pathname, shouldRenderGlobalNavbar]);

    useEffect(() => {
        if (!shouldRenderGlobalNavbar || isGuest || !session?.user?.id) {
            return;
        }

        let warmupTimer: ReturnType<typeof setTimeout> | null = null;
        const idleCallbackId = requestIdleCallback(() => {
            warmupTimer = setTimeout(() => {
                prefetchNavbarColdBootQueries(queryClient, {
                    isGuest,
                    roleResolved,
                    sessionReady: Boolean(session?.user?.id),
                    userId: session?.user?.id,
                });
            }, 900);
        });

        return () => {
            cancelIdleCallback(idleCallbackId);
            if (warmupTimer) clearTimeout(warmupTimer);
        };
    }, [isGuest, queryClient, roleResolved, session?.user?.id, shouldRenderGlobalNavbar]);

    useEffect(() => {
        if (!shouldRenderGlobalNavbar || !navigation || !state || !roleResolved) {
            return;
        }

        const timers: ReturnType<typeof setTimeout>[] = [];
        const idleCallbackId = requestIdleCallback(() => {
            const routesToPreload = navItems
                .filter((item) => item.id !== activeTab)
                .map((item) => state.routes.find((route) => route.name === item.routeName))
                .filter((route): route is NonNullable<typeof route> => Boolean(route))
                .filter((route) => !preloadedRouteNamesRef.current.has(route.name));

            routesToPreload.forEach((route, index) => {
                const timer = setTimeout(() => {
                    preloadedRouteNamesRef.current.add(route.name);
                    navigation.preload(route.name, route.params);
                }, NAVBAR_ROUTE_PRELOAD_DELAY_MS + index * NAVBAR_ROUTE_PRELOAD_GAP_MS);
                timers.push(timer);
            });
        }, { timeout: 1200 });

        return () => {
            cancelIdleCallback(idleCallbackId);
            timers.forEach(clearTimeout);
        };
    }, [activeTab, navItems, navigation, roleResolved, shouldRenderGlobalNavbar, state]);

    if (!shouldRenderGlobalNavbar) {
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
                    useNarrowMainNavbar ? styles.narrowMainNavbarSurface : null,
                ]}
            >
                <View
                    style={[
                        styles.blurContainer,
                        {
                            backgroundColor: isDark ? NAVBAR_DARK_SURFACE : NAVBAR_LIGHT_SURFACE,
                            borderColor: isDark ? NAVBAR_DARK_BORDER : colors.border
                        }
                    ]}
                >
                    <View
                        style={[
                            styles.container,
                            useCompactFanNavbar ? styles.compactContainer : null,
                            useIconOnlyNavbar ? styles.iconOnlyContainer : null,
                        ]}
                    >
                        {navItems.map((item) => {
                            const isActive = (pendingTab ?? activeTab) === item.id;
                            return (
                                <NavTab
                                    active={isActive}
                                    compact={useCompactFanNavbar}
                                    colors={colors}
                                    iconOnly={useIconOnlyNavbar}
                                    isDark={isDark}
                                    item={item}
                                    key={item.id}
                                    onPress={handleNavPress}
                                />
                            );
                        })}
                    </View>
                </View>
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
    narrowMainNavbarSurface: {
        width: '94%',
        maxWidth: 420,
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
    iconOnlyContainer: {
        gap: 2,
        paddingHorizontal: 6,
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
    iconOnlyTabButton: {
        flex: 1,
        minWidth: 0,
        paddingHorizontal: 0,
    },
    activeTabButton: {
        minWidth: 84,
        maxWidth: 108,
        paddingHorizontal: 12,
        gap: 6,
    },
    iconOnlyActiveTabButton: {
        flex: 1,
        minWidth: 0,
        paddingHorizontal: 0,
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

