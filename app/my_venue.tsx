import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useRequireAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function MyVenueScreen() {
    const { colors, isDark } = useTheme();
    const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [gigs, setGigs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchGigs = async () => {
        if (!userId) return;
        try {
            const { data, error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'fetch_my_gigs', userId }
            });

            if (error) throw error;
            setGigs(data || []);
        } catch (e) {
            console.log('Error fetching gigs:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (isAuthenticated && userId) {
                fetchGigs();
            }
        }, [isAuthenticated, userId])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchGigs();
    };

    const confirmDelete = (id: string) => {
        setSelectedId(id);
        setModalVisible(true);
    };

    const handleDelete = async () => {
        if (!selectedId || !userId) return;
        try {
            const { error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'delete', type: 'gig', id: selectedId, userId }
            });

            if (error) throw error;
            setGigs(gigs.filter(g => g.id !== selectedId));
            setModalVisible(false);
        } catch (e) {
            console.log('Error deleting gig:', e);
            Alert.alert('Error', 'Failed to delete gig');
        }
    };

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="My Venue" />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    style={styles.flex1}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                >
                    {loading ? (
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading gigs...</Text>
                    ) : gigs.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No gigs found</Text>
                        </View>
                    ) : (
                        gigs.map((gig) => (
                            <View key={gig.id} style={[styles.cardContainer, {
                                backgroundColor: colors.surface,
                                shadowColor: colors.primary,
                            }]}>
                                <View style={styles.imageWrapper}>
                                    <Image
                                        source={{ uri: (gig.images && gig.images[0]) || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop' }}
                                        style={styles.cardImage}
                                        resizeMode="cover"
                                    />
                                    <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)' }]}>
                                        <Text style={[styles.statusText, { color: colors.primary }]}>{gig.status || 'Active'}</Text>
                                    </View>
                                    <View style={styles.budgetBadge}>
                                        <Text style={styles.budgetText}>₱{gig.budget?.toLocaleString()}</Text>
                                    </View>
                                </View>

                                <View style={styles.cardContent}>
                                    <Text style={[styles.cardTitle, { color: colors.text }]}>{gig.name}</Text>
                                    <Text style={[styles.cardSubTitle, { color: colors.primary }]}>
                                        {gig.event_date ? new Date(gig.event_date).toLocaleDateString() : 'Date TBA'} • {gig.location}
                                    </Text>

                                    <Text style={[styles.cardDescription, { color: colors.textSecondary }]} numberOfLines={2}>
                                        {gig.description}
                                    </Text>

                                    <View style={[styles.actionRow, { borderColor: colors.border }]}>
                                        <View style={styles.actionLeft}>
                                            <TouchableOpacity
                                                onPress={() => router.push({ pathname: '/manage_gig', params: { id: gig.id } })}
                                                style={[styles.manageBtn, { backgroundColor: colors.primary }]}
                                            >
                                                <Ionicons name="settings-outline" size={18} color="#FFF" />
                                                <Text style={styles.manageBtnText}>Manage</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={() => router.push({ pathname: '/edit_gig', params: { id: gig.id } })}
                                                style={[styles.editBtn, { borderColor: colors.border }]}
                                            >
                                                <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                            </TouchableOpacity>
                                        </View>

                                        <TouchableOpacity
                                            onPress={() => confirmDelete(gig.id)}
                                            style={styles.deleteBtn}
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
                title="Delete Gig"
                message="Are you sure you want to delete this gig?"
                buttonText="Delete"
                onConfirm={handleDelete}
            />
        </>
    );
}

const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 150,
        paddingTop: 16,
    },
    loadingText: {
        textAlign: 'center',
        marginTop: 20,
        fontFamily: 'Poppins_400Regular',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
        opacity: 0.5,
    },
    emptyText: {
        marginTop: 16,
        fontFamily: 'Poppins_400Regular',
    },
    cardContainer: {
        marginBottom: 24,
        borderRadius: 24,
        overflow: 'hidden',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 4,
    },
    imageWrapper: {
        height: 192,
        position: 'relative',
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    statusBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 100,
    },
    statusText: {
        fontSize: 12,
        fontFamily: 'Poppins_600SemiBold',
    },
    budgetBadge: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    budgetText: {
        fontSize: 13,
        fontFamily: 'Poppins_600SemiBold',
        color: '#FFF',
    },
    cardContent: {
        padding: 16,
    },
    cardTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        marginBottom: 2,
    },
    cardSubTitle: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
        marginBottom: 6,
    },
    cardDescription: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        lineHeight: 20,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 16,
        borderTopWidth: 1,
        paddingTop: 16,
    },
    actionLeft: {
        flexDirection: 'row',
        gap: 12,
    },
    manageBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
    },
    manageBtnText: {
        fontFamily: 'Poppins_500Medium',
        color: '#FFF',
    },
    editBtn: {
        padding: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    deleteBtn: {
        padding: 8,
    },
});

