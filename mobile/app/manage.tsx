import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import Skeleton from '../src/components/Skeleton';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function ManageScreen() {
    const { colors } = useTheme();
    const { session, loading: authLoading, userId, userRole, isGuest } = useAuth();
    const isAuthenticated = !!session;
    const [loading, setLoading] = useState(true);
    const [fetchedRole, setFetchedRole] = useState<string | null>(null);

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
            // Try to get role from context first, or fetch directly
            if (userRole) {
                handleRedirect(userRole);
            } else {
                // Fallback: Fetch role directly from DB
                fetchRoleAndRedirect();
            }
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [authLoading, isAuthenticated, userRole, userId]);

    const fetchRoleAndRedirect = async () => {
        console.log('🎯 Manage - User ID from context:', userId);
        if (!userId) {
            console.log('❌ Manage - No userId available');
            setLoading(false);
            return;
        }

        try {
            console.log('🔍 Manage - Fetching role for user:', userId);
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (error) {
                console.log('❌ Manage - Error fetching role:', error.message);
                throw error;
            }

            if (data?.role) {
                console.log('✅ Manage - Role fetched:', data.role);
                setFetchedRole(data.role);
                handleRedirect(data.role);
            } else {
                console.log('⚠️ Manage - No role data found');
                setLoading(false);
            }
        } catch (error) {
            console.log('❌ Manage - Exception:', error);
            setLoading(false);
        }
    };

    const handleRedirect = (role: string) => {
        if (role === 'studio-owner') {
            router.replace('/my_studio');
        } else if (role === 'musician') {
            router.replace('/my_group');
        } else if (role === 'venue-owner') {
            router.replace('/my_venue');
        } else {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.flex1, { backgroundColor: colors.background }]}> 
                <Header title="Manage" />
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
                <Header title="Manage" />
                <GuestSignInGate message="Sign in to access your management dashboard." />
                <Navbar />
            </View>
        );
    }

    return (
        <View style={[styles.flex1, { backgroundColor: colors.background }]}>
            <Header title="Manage" />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.dashboardContainer}>
                    <Text style={[styles.title, { color: colors.text }]}>
                        Management Dashboard
                    </Text>
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        It seems we couldn't automatically direct you to your specific dashboard.
                        Please ensure your account has the correct role assigned or contact support for assistance.
                    </Text>


                    {(userRole || fetchedRole) && (
                        <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                            Detected Role: {userRole || fetchedRole}
                        </Text>
                    )}
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
        paddingBottom: 180,
    },
    dashboardContainer: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 32,
    },
    title: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 24,
        marginBottom: 8,
    },
    description: {
        fontFamily: 'Poppins_400Regular',
        marginBottom: 32,
    },
    roleText: {
        marginTop: 40,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
});
