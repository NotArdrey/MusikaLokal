import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function MyGroupScreen() {
    const { colors, isDark } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchGroups = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'fetch_my_groups', userId: user.id }
            });

            if (error) throw error;
            setGroups(data || []);
        } catch (e) {
            console.log('Error fetching groups:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchGroups();
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchGroups();
    };

    const confirmDelete = (id: string) => {
        setSelectedId(id);
        setModalVisible(true);
    };

    const handleDelete = async () => {
        if (!selectedId) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'delete', type: 'group', id: selectedId, userId: user.id }
            });

            if (error) throw error;
            setGroups(groups.filter(g => g.id !== selectedId));
            setModalVisible(false);
        } catch (e) {
            console.log('Error deleting group:', e);
            Alert.alert('Error', 'Failed to delete group');
        }
    };

    return (
        <>
            <View className="flex-1" style={{ backgroundColor: colors.background }}>
                <Header title="My Group" />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 150, paddingTop: 16 }}
                    className="flex-1"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {loading ? (
                        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>Loading groups...</Text>
                    ) : groups.length === 0 ? (
                        <View className="items-center py-10 opacity-50">
                            <Ionicons name="people-outline" size={48} color={colors.textSecondary} />
                            <Text className="mt-4" style={{ color: colors.textSecondary }}>No groups found</Text>
                        </View>
                    ) : (
                        groups.map((group) => (
                            <View key={group.id} className="mb-6 rounded-3xl overflow-hidden" style={{
                                backgroundColor: colors.surface,
                                shadowColor: colors.primary,
                                shadowOffset: { width: 0, height: 8 },
                                shadowOpacity: 0.1,
                                shadowRadius: 16,
                                elevation: 4,
                            }}>
                                <View className="h-48 relative">
                                    <Image
                                        source={{ uri: (group.images && group.images[0]) || 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=800&fit=crop' }}
                                        className="w-full h-full"
                                        resizeMode="cover"
                                    />
                                    <View className="absolute top-4 right-4 bg-white/90 dark:bg-black/60 px-3 py-1 rounded-full">
                                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.primary }}>Active</Text>
                                    </View>
                                </View>

                                <View className="p-4">
                                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text, marginBottom: 4 }}>{group.name}</Text>
                                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, lineHeight: 20 }} numberOfLines={2}>
                                        {group.description}
                                    </Text>

                                    <View className="flex-row items-center justify-between mt-4 border-t pt-4" style={{ borderColor: colors.border }}>
                                        <View className="flex-row gap-3">
                                            <TouchableOpacity
                                                onPress={() => router.push({ pathname: '/manage_group', params: { id: group.id } })}
                                                className="flex-row items-center gap-2 px-4 py-2 rounded-xl"
                                                style={{ backgroundColor: colors.primary }}
                                            >
                                                <Ionicons name="settings-outline" size={18} color="#FFF" />
                                                <Text style={{ fontFamily: 'Poppins_500Medium', color: '#FFF' }}>Manage</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={() => router.push({ pathname: '/edit_group', params: { id: group.id } })}
                                                className="p-2 rounded-xl border"
                                                style={{ borderColor: colors.border }}
                                            >
                                                <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                            </TouchableOpacity>
                                        </View>

                                        <TouchableOpacity
                                            onPress={() => confirmDelete(group.id)}
                                            className="p-2"
                                        >
                                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>
                <Navbar />
            </View>
            <Modal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                title="Delete Group"
                message="Are you sure you want to delete this group?"
                buttonText="Delete"
                onConfirm={handleDelete}
            />
        </>
    );
}

