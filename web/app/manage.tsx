import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function ManageScreen() {
    const { colors, isDark } = useTheme();
    const { width } = useWindowDimensions();
    const isWebDesktop = Platform.OS === 'web' && width >= 768;
    const pageBackground = isWebDesktop
        ? isDark
            ? '#0A1224'
            : '#E9EEF8'
        : colors.background;
    const pageCardBackground = isWebDesktop
        ? isDark
            ? '#0F172A'
            : '#FFFFFF'
        : colors.card;
    const borderSoft = isWebDesktop
        ? isDark
            ? '#1E2C48'
            : '#D8E3F2'
        : colors.border;
    const textPrimary = isWebDesktop
        ? isDark
            ? '#E2E8F0'
            : '#0F172A'
        : colors.text;
    const textSecondary = isWebDesktop
        ? isDark
            ? '#94A3B8'
            : '#475569'
        : colors.textSecondary;
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
        } else if (role === 'admin') {
            router.replace('/admin');
        } else {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: pageBackground }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 20, color: textSecondary, fontFamily: 'Poppins_400Regular' }}>
                    Loading your dashboard...
                </Text>
            </View>
        );
    }

    if (isGuest) {
        return (
            <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
                <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
                    <Header title="Manage" />
                    <GuestSignInGate message="Sign in to access your management dashboard." />
                    <Navbar />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
            <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
                <Header title="Manage" />

                <ScrollView contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.scrollContentWeb]}>
                    <View
                        style={[
                            styles.dashboardContainer,
                            styles.dashboardCard,
                            isWebDesktop && styles.webSectionCard,
                            {
                                backgroundColor: pageCardBackground,
                                borderColor: borderSoft,
                            },
                        ]}
                    >
                        <Text style={[styles.title, { color: textPrimary }]}>
                            Management Dashboard
                        </Text>
                        <Text style={[styles.description, { color: textSecondary }]}>
                            It seems we couldn't automatically direct you to your specific dashboard.
                            Please ensure your account has the correct role assigned or contact support for assistance.
                        </Text>


                        {(userRole || fetchedRole) && (
                            <Text style={[styles.roleText, { color: textSecondary }]}>
                                Detected Role: {userRole || fetchedRole}
                            </Text>
                        )}
                    </View>
                </ScrollView>
            </View>
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
    pageFrame: {
        flex: 1,
        width: '100%',
    },
    pageFrameWeb: {
        maxWidth: 1240,
        alignSelf: 'center',
        paddingTop: 12,
        paddingHorizontal: 20,
    },
    scrollContent: {
        paddingBottom: 180,
    },
    scrollContentWeb: {
        maxWidth: 1120,
        width: '100%',
        alignSelf: 'center',
        paddingTop: 12,
    },
    dashboardContainer: {
        paddingHorizontal: 24,
        paddingTop: 32,
    },
    dashboardCard: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 28,
    },
    webSectionCard: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
        elevation: 3,
    },
    title: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 24,
        marginBottom: 8,
    },
    description: {
        fontFamily: 'Poppins_400Regular',
        lineHeight: 22,
        marginBottom: 32,
    },
    roleText: {
        marginTop: 20,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
});
