import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
    const { colors } = useTheme();
    const pathname = usePathname();
    let activeTab = '';

    // Active/Inactive colors from theme
    const ACTIVE_COLOR = colors.primary;
    const INACTIVE_COLOR = colors.muted;


    if (pathname.includes('home')) {
        activeTab = 'home';
    } else if (pathname.includes('bookings')) {
        activeTab = 'activity';
    } else if (pathname.includes('my_studio') || pathname.includes('my_gig') || pathname.includes('my_group')) {
        activeTab = 'manage';
    } else if (pathname.includes('profile') || pathname.includes('settings') || pathname.includes('wallet')) {
        activeTab = 'profile';
    }

    return (
        <View className="absolute bottom-6 left-4 right-4 rounded-3xl flex-row justify-between items-center px-6 py-4"
            style={{
                backgroundColor: colors.surface,
                shadowColor: "#000",
                shadowOffset: {
                    width: 0,
                    height: 4,
                },
                shadowOpacity: 0.1,
                shadowRadius: 12,
                elevation: 10,
            }}>

            <TouchableOpacity
                className={`justify-center items-center gap-1 ${activeTab === "home" ? "opacity-100" : "opacity-60"}`}
                onPress={() => router.push("/home")}>
                <View className={`p-2 rounded-xl ${activeTab === "home" ? "bg-primary-50" : "bg-transparent"}`}>
                    <Ionicons
                        name={activeTab === "home" ? "home" : "home-outline"}
                        size={22}
                        color={activeTab === "home" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "home" && (
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: colors.primary }}>Home</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                className={`justify-center items-center gap-1 ${activeTab === "activity" ? "opacity-100" : "opacity-60"}`}
                onPress={() => router.push("/bookings")}>
                <View className={`p-2 rounded-xl ${activeTab === "activity" ? "bg-primary-50" : "bg-transparent"}`}>
                    <Ionicons
                        name={activeTab === "activity" ? "calendar" : "calendar-outline"}
                        size={22}
                        color={activeTab === "activity" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "activity" && (
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: colors.primary }}>Activity</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                className={`justify-center items-center gap-1 ${activeTab === "manage" ? "opacity-100" : "opacity-60"}`}
                onPress={() => router.push("/my_studio")}>
                <View className={`p-2 rounded-xl ${activeTab === "manage" ? "bg-primary-50" : "bg-transparent"}`}>
                    <Ionicons
                        name={activeTab === "manage" ? "briefcase" : "briefcase-outline"}
                        size={22}
                        color={activeTab === "manage" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "manage" && (
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: colors.primary }}>Manage</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                className={`justify-center items-center gap-1 ${activeTab === "profile" ? "opacity-100" : "opacity-60"}`}
                onPress={() => router.push("/profile")}>
                <View className={`p-2 rounded-xl ${activeTab === "profile" ? "bg-primary-50" : "bg-transparent"}`}>
                    <Ionicons
                        name={activeTab === "profile" ? "person" : "person-outline"}
                        size={22}
                        color={activeTab === "profile" ? colors.primary : colors.textSecondary}
                    />
                </View>
                {activeTab === "profile" && (
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 10, color: colors.primary }}>Profile</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}
