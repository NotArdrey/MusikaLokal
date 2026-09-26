import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import GuestSignInGate from '../../src/components/GuestSignInGate';
import Header from '../../src/components/header';
import Navbar from '../../src/components/navbar';
import Skeleton from '../../src/components/Skeleton';
import { useBottomBarClearance } from '../../src/hooks/useBottomBarClearance';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { resolveRoleManageRoute } from '../../src/utils/roleRouting';
import { fetchActiveStaffAssignment } from '../../src/utils/staffAccess';
import { spacing, typography } from '../../src/theme/tokens';

export default function ManageScreen() {
    const { colors } = useTheme();
    const { contentBottomPadding } = useBottomBarClearance(24);
    const { session, loading: authLoading, userId, userRole, roleResolved, isGuest } = useAuth();
    const isAuthenticated = !!session;
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !isAuthenticated && !isGuest) {
            router.replace('/');
        }
    }, [authLoading, isAuthenticated, isGuest]);

    useEffect(() => {
        // If not authenticated, the hook will redirect
        if (authLoading) return;

        if (isGuest) {
            setLoading(false);
            return;
        }

        if (isAuthenticated && userId) {
            if (!roleResolved) {
                return;
            }

            // Try to get role from context first, or fetch directly
            if (userRole) {
                void handleRedirect(userRole);
            } else {
                // Fallback: Fetch role directly from DB
                fetchRoleAndRedirect();
            }
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [authLoading, isAuthenticated, roleResolved, userRole, userId]);

    const fetchRoleAndRedirect = async () => {
        if (!userId) {
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (error) {
                throw error;
            }

            if (data?.role) {
                void handleRedirect(data.role);
            } else {
                setLoading(false);
            }
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Your workspace could not be loaded.');
            setLoading(false);
        }
    };

    const handleRedirect = async (role: string) => {
        setLoadError(null);
        if (role === 'staff' && userId) {
            try {
                const assignment = await fetchActiveStaffAssignment(supabase, userId);
                if (assignment?.entity_type === 'studio') {
                    router.replace('/my_studio');
                    return;
                }
                if (assignment?.entity_type === 'venue') {
                    router.replace('/my_venue');
                    return;
                }
                if (assignment?.entity_type === 'production') {
                    router.replace('/my_production');
                    return;
                }
                setLoadError('No active staff workspace is assigned to this account.');
            } catch (error) {
                setLoadError(error instanceof Error ? error.message : 'Your staff workspace could not be loaded.');
                // Fall through to the generic manage fallback.
            }
        }

        const destination = resolveRoleManageRoute(role);

        if (destination !== '/manage') {
            router.replace(destination as any);
        } else {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="Manage" overline="MusikaLokal" showTitle={false} />
                <View style={styles.manageSkeletonContainer}>
                    <Skeleton width="72%" height={26} borderRadius={8} />
                    <Skeleton width="100%" height={84} borderRadius={14} style={{ marginTop: 16 }} />
                    <Skeleton width="100%" height={84} borderRadius={14} style={{ marginTop: 12 }} />
                    <Skeleton width="46%" height={16} style={{ marginTop: 24 }} />
                </View>
                <Navbar />
            </View>
        );
    }

    if (isGuest) {
        return (
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="Manage" overline="MusikaLokal" showTitle={false} />
                <GuestSignInGate message="Sign in to access your management dashboard." />
                <Navbar />
            </View>
        );
    }

    return (
        <View style={[styles.flex1, { backgroundColor: colors.background }]}>
            <Header title="Manage" overline="MusikaLokal" showTitle={false} />

            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}>
                <View style={styles.dashboardContainer}>
                    <Text style={[styles.eyebrow, { color: colors.primary }]}>Workspace unavailable</Text>
                    <Text style={[styles.title, { color: colors.text }]}>We couldn&apos;t open your role workspace.</Text>
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        Check that your account has the correct role assigned, or contact support for assistance.
                    </Text>
                    {loadError ? (
                        <Text style={[styles.errorText, { color: colors.danger }]}>{loadError}</Text>
                    ) : null}
                    {userRole ? (
                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={() => {
                                setLoading(true);
                                void handleRedirect(userRole);
                            }}
                            style={[styles.retryButton, { backgroundColor: colors.primary }]}
                        >
                            <Text style={styles.retryButtonText}>Try again</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </ScrollView>
            <Navbar />
        </View>
    );
}

const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manageSkeletonContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 32,
    },
    scrollContent: {
        flexGrow: 1,
    },
    dashboardContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: spacing.lg,
    },
    eyebrow: {
        fontFamily: typography.bold,
        fontSize: 11,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: spacing.xs,
    },
    title: {
        fontFamily: typography.heading,
        fontSize: 20,
        lineHeight: 26,
        marginBottom: spacing.xs,
    },
    description: {
        fontFamily: typography.body,
        fontSize: 14,
        lineHeight: 21,
        marginBottom: spacing.lg,
    },
    errorText: {
        fontFamily: typography.body,
        fontSize: 13,
        lineHeight: 19,
        marginBottom: spacing.md,
    },
    retryButton: {
        alignItems: 'center',
        alignSelf: 'flex-start',
        borderRadius: 12,
        minWidth: 112,
        paddingHorizontal: 18,
        paddingVertical: 11,
    },
    retryButtonText: {
        color: '#FFFFFF',
        fontFamily: typography.semibold,
        fontSize: 14,
    },
});
