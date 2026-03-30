import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface GlassCardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    intensity?: number;
}

export default function GlassCard({ children, style, intensity = 20 }: GlassCardProps) {
    const { isDark } = useTheme();

    return (
        <View style={[styles.container, style]}>
            <BlurView
                intensity={intensity}
                tint={isDark ? 'dark' : 'light'}
                style={styles.blur}
            >
                <View style={[
                    styles.content,
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
                    }
                ]}>
                    {children}
                </View>
            </BlurView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 8,
    },
    blur: {
        borderRadius: 24,
        overflow: 'hidden',
    },
    content: {
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
    },
});
