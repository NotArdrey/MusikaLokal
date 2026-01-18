import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../context/ThemeContext';

interface VerificationModalProps {
    visible: boolean;
    url: string;
    onClose: () => void;
    onSuccess: () => void;
}

export default function VerificationModal({ visible, url, onClose, onSuccess }: VerificationModalProps) {
    const { colors, isDark } = useTheme();

    if (!visible || !url) return null;

    // Handle navigation state changes to detect success
    const handleNavigationStateChange = (navState: any) => {
        const { url: currentUrl } = navState;

        // Check if redirected to callback URL (success)
        // We look for 'musikalokal://' or 'localhost' or the callback you set
        if (currentUrl.includes('musikalokal://') ||
            currentUrl.includes('localhost') ||
            currentUrl.includes('10.0.2.2')) {
            onSuccess();
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={false} // Full screen
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: isDark ? '#333' : '#eee' }]}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.text }]}>Identity Verification</Text>
                    <View style={{ width: 40 }} /> {/* Spacer for centering */}
                </View>

                {/* Content */}
                {Platform.OS === 'web' ? (
                    <iframe
                        src={url}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        allow="camera; microphone; fullscreen; autoplay; encrypted-media" // Crucial for Didit
                    />
                ) : (
                    <WebView
                        source={{ uri: url }}
                        style={{ flex: 1 }}
                        startInLoadingState={true}
                        renderLoading={() => (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                            </View>
                        )}
                        onNavigationStateChange={handleNavigationStateChange}
                        // Specific settings for camera/media access
                        mediaPlaybackRequiresUserAction={false}
                        allowsInlineMediaPlayback={true}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                    // Android permission for camera might be needed in manifest, but WebView handles prompt
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    closeButton: {
        padding: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)',
        zIndex: 10
    }
});
