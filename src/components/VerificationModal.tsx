import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { ActivityIndicator, Modal, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

    // Request camera permissions when modal becomes visible (Android only)
    useEffect(() => {
        if (visible && Platform.OS === 'android') {
            requestCameraPermission();
        }
    }, [visible]);

    const requestCameraPermission = async () => {
        try {
            const granted = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.CAMERA,
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            ]);
            console.log('Camera permission:', granted);
        } catch (err) {
            console.warn('Permission error:', err);
        }
    };

    if (!visible || !url) return null;

    const handleNavigationStateChange = (navState: { url: string }) => {
        const currentUrl = navState.url;
        if (currentUrl.includes('musikalokal://') ||
            currentUrl.includes('localhost') ||
            currentUrl.includes('10.0.2.2')) {
            onSuccess();
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={false}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <View style={[styles.header, { borderBottomColor: isDark ? '#333' : '#eee' }]}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: colors.text }]}>Identity Verification</Text>
                    <View style={{ width: 40 }} />
                </View>

                {Platform.OS === 'web' ? (
                    <iframe
                        src={url}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        allow="camera; microphone; fullscreen; autoplay; encrypted-media"
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
                        mediaPlaybackRequiresUserAction={false}
                        allowsInlineMediaPlayback={true}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        androidLayerType="hardware"
                        allowFileAccess={true}
                        allowFileAccessFromFileURLs={true}
                        allowUniversalAccessFromFileURLs={true}
                        geolocationEnabled={true}
                        setSupportMultipleWindows={false}
                        onPermissionRequest={(event: any) => {
                            if (event.nativeEvent && event.nativeEvent.grant) {
                                event.nativeEvent.grant();
                            }
                        }}
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
