
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useProfileCompletion } from '../hooks/useProfileCompletion';

export const ProfileCompletionBanner = () => {
    const { isProfileComplete, checking } = useProfileCompletion();
    const { colors } = useTheme();
    const router = useRouter();

    if (checking || isProfileComplete) return null;

    return (
        <View style={[styles.container, { backgroundColor: colors.primaryLight, borderLeftColor: colors.primary }]}>
            <View style={styles.content}>
                <Ionicons name="alert-circle" size={24} color={colors.primary} />
                <View style={styles.textContainer}>
                    <Text style={[styles.title, { color: colors.primaryDark }]}>Profile Incomplete</Text>
                    <Text style={[styles.subtitle, { color: colors.secondary }]}>
                        You need to complete your profile to book or list items.
                    </Text>
                </View>
            </View>
            <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/edit_profile')}
            >
                <Text style={styles.buttonText}>Complete Now</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        margin: 16,
        padding: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        flexDirection: 'column',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    textContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
        fontFamily: 'Poppins_600SemiBold',
    },
    subtitle: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    button: {
        alignSelf: 'flex-end',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    buttonText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
});
