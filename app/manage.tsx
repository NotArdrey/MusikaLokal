import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
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
            <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 20, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>
                    Loading your dashboard...
                </Text>
            </View>
        );
    }

    return (
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
            <Header title="Manage" />

            <View className="flex-1 px-6 pt-8">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 24, color: colors.text, marginBottom: 8 }}>
                    Management Dashboard
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, marginBottom: 32 }}>
                    It seems we couldn't automatically direct you to your specific dashboard.
                    Select an option below or ensure your account has the correct role.
                </Text>

                <View className="gap-4">
                    <TouchableOpacity
                        onPress={() => router.push('/my_group')}
                        className="p-4 rounded-2xl flex-row items-center gap-4"
                        style={{ backgroundColor: colors.surface }}
                    >
                        <View className="w-12 h-12 rounded-full items-center justify-center bg-blue-100 dark:bg-blue-900">
                            <Ionicons name="people" size={24} color="#3B82F6" />
                        </View>
                        <View>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Manage Groups</Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>For Bands & Artists</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.push('/my_studio')}
                        className="p-4 rounded-2xl flex-row items-center gap-4"
                        style={{ backgroundColor: colors.surface }}
                    >
                        <View className="w-12 h-12 rounded-full items-center justify-center bg-purple-100 dark:bg-purple-900">
                            <Ionicons name="mic" size={24} color="#8B5CF6" />
                        </View>
                        <View>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Manage Studios</Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>For Studio Owners</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.push('/my_gig')}
                        className="p-4 rounded-2xl flex-row items-center gap-4"
                        style={{ backgroundColor: colors.surface }}
                    >
                        <View className="w-12 h-12 rounded-full items-center justify-center bg-orange-100 dark:bg-orange-900">
                            <Ionicons name="calendar" size={24} color="#F97316" />
                        </View>
                        <View>
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 16 }}>Manage Gigs</Text>
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>For Event Organizers</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {role && (
                    <Text style={{ marginTop: 40, fontFamily: 'Poppins_400Regular', color: colors.textSecondary, textAlign: 'center' }}>
                        Detected Role: {role}
                    </Text>
                )}
            </View>
            <Navbar />
        </View>
    );
}
