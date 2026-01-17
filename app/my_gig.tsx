import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function MyGigScreen() {
    const { colors, isDark } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);

    return (
        <>
            <View className="flex-1" style={{ backgroundColor: colors.background }}>
                <Header title="My Gig" />

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 150, paddingTop: 16 }} className="flex-1">

                    {/* Gig Card 1 */}
                    <View className="mb-6 rounded-3xl overflow-hidden" style={{
                        backgroundColor: colors.surface,
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.1,
                        shadowRadius: 16,
                        elevation: 4,
                    }}>
                        <View className="h-48 relative">
                            <Image
                                source={{ uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&fit=crop' }}
                                className="w-full h-full"
                                resizeMode="cover"
                            />
                            <View className="absolute top-4 right-4 bg-white/90 dark:bg-black/60 px-3 py-1 rounded-full">
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.primary }}>Upcoming</Text>
                            </View>
                            <View className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-xl">
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#FFF' }}>₱15,000</Text>
                            </View>
                        </View>

                        <View className="p-4">
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text, marginBottom: 2 }}>Barasoain Church Wedding</Text>
                            <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.primary, marginBottom: 6 }}>June 15, 2024 • Malolos, Bulacan</Text>

                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                                Wedding ceremony music for 3 hours. Play classical, contemporary Christian, and OPM love songs.
                            </Text>

                            <View className="flex-row items-center justify-between mt-4 border-t pt-4" style={{ borderColor: colors.border }}>
                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        onPress={() => router.push('/manage_gig')}
                                        className="flex-row items-center gap-2 px-4 py-2 rounded-xl"
                                        style={{ backgroundColor: colors.primary }}
                                    >
                                        <Ionicons name="settings-outline" size={18} color="#FFF" />
                                        <Text style={{ fontFamily: 'Poppins_500Medium', color: '#FFF' }}>Manage</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => router.push('/edit_gig')}
                                        className="p-2 rounded-xl border"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    onPress={() => setModalVisible(true)}
                                    className="p-2"
                                >
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Gig Card 2 */}
                    <View className="mb-6 rounded-3xl overflow-hidden" style={{
                        backgroundColor: colors.surface,
                        shadowColor: colors.primary,
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.1,
                        shadowRadius: 16,
                        elevation: 4,
                    }}>
                        <View className="h-48 relative">
                            <Image
                                source={{ uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&fit=crop' }}
                                className="w-full h-full"
                                resizeMode="cover"
                            />
                            <View className="absolute top-4 right-4 bg-white/90 dark:bg-black/60 px-3 py-1 rounded-full">
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: colors.primary }}>Upcoming</Text>
                            </View>
                            <View className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-xl">
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 13, color: '#FFF' }}>₱25,000</Text>
                            </View>
                        </View>

                        <View className="p-4">
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text, marginBottom: 2 }}>Makati Corporate Event</Text>
                            <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.primary, marginBottom: 6 }}>July 20, 2024 • BGC, Taguig</Text>

                            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                                Corporate anniversary celebration at BGC. Jazz and lounge music for 4 hours. Audience of 200+ guests.
                            </Text>

                            <View className="flex-row items-center justify-between mt-4 border-t pt-4" style={{ borderColor: colors.border }}>
                                <View className="flex-row gap-3">
                                    <TouchableOpacity
                                        onPress={() => router.push('/manage_gig')}
                                        className="flex-row items-center gap-2 px-4 py-2 rounded-xl"
                                        style={{ backgroundColor: colors.primary }}
                                    >
                                        <Ionicons name="settings-outline" size={18} color="#FFF" />
                                        <Text style={{ fontFamily: 'Poppins_500Medium', color: '#FFF' }}>Manage</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={() => router.push('/edit_gig')}
                                        className="p-2 rounded-xl border"
                                        style={{ borderColor: colors.border }}
                                    >
                                        <Ionicons name="pencil-outline" size={20} color={colors.text} />
                                    </TouchableOpacity>
                                </View>

                                <TouchableOpacity
                                    onPress={() => setModalVisible(true)}
                                    className="p-2"
                                >
                                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                </ScrollView>

                <Navbar />
            </View>
            <Modal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                title="Delete Gig"
                message="Are you sure you want to delete this gig?"
                buttonText="Delete"
            />
        </>
    );
}

