import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function ManageScreen() {
    const { colors } = useTheme();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);

    const checkRoleAndRedirect = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                // Not logged in?
                setLoading(false);
                return;
            }

            const { data, error } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId: user.id }
            });

            if (data && data.role) {
                setRole(data.role);
                // Attempt redirect
                if (data.role === 'studio-owner') {
                    router.replace('/my_studio');
                } else if (data.role === 'manager' || data.role === 'musician-member') {
                    router.replace('/my_group');
                } else if (data.role === 'venue-owner') {
                    router.replace('/my_gig');
                } else {
                    // Role exists but unknown? Stay here.
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        } catch (e) {
            console.log('Error in manage screen:', e);
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            checkRoleAndRedirect();
        }, [])
    );

    if (loading) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 20, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>
                    Loading your dashboard...
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.flex1, { backgroundColor: colors.background }]}>
            <Header title="Manage" />

            <View style={styles.dashboardContainer}>
                <Text style={[styles.title, { color: colors.text }]}>
                    Management Dashboard
                </Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    It seems we couldn't automatically direct you to your specific dashboard.
                    Please ensure your account has the correct role assigned or contact support for assistance.
                </Text>


                {role && (
                    <Text style={[styles.roleText, { color: colors.textSecondary }]}>
                        Detected Role: {role}
                    </Text>
                )}
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
