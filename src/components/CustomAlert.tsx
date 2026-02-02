import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Animated, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface CustomAlertProps {
    visible: boolean;
    type?: AlertType;
    title: string;
    message: string;
    buttons?: AlertButton[];
    onClose: () => void;
}

const alertConfig = {
    error: {
        icon: 'alert-circle' as const,
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    success: {
        icon: 'checkmark-circle' as const,
        color: '#10B981',
        bgColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    warning: {
        icon: 'warning' as const,
        color: '#F59E0B',
        bgColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
    },
    info: {
        icon: 'information-circle' as const,
        color: '#3B82F6',
        bgColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
};

// useNativeDriver is not supported on web
const useNativeDriver = Platform.OS !== 'web';

export default function CustomAlert({
    visible,
    type = 'info',
    title,
    message,
    buttons = [{ text: 'OK', style: 'default' }],
    onClose,
}: CustomAlertProps) {
    const { colors, isDark } = useTheme();
    const config = alertConfig[type];

    const scaleAnim = React.useRef(new Animated.Value(0.9)).current;
    const opacityAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver,
                    tension: 100,
                    friction: 8,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.9);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    const handleButtonPress = (button: AlertButton) => {
        // Call the onPress callback first, then close the alert
        // This ensures async operations start immediately
        if (button.onPress) {
            button.onPress();
        }
        onClose();
    };

    const getButtonStyle = (style?: string) => {
        switch (style) {
            case 'cancel':
                return {
                    backgroundColor: isDark ? '#374151' : '#F3F4F6',
                    textColor: colors.textSecondary,
                };
            case 'destructive':
                return {
                    backgroundColor: '#EF4444',
                    textColor: '#FFFFFF',
                };
            default:
                return {
                    backgroundColor: colors.primary,
                    textColor: '#FFFFFF',
                };
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Animated.View
                    style={[
                        styles.container,
                        {
                            backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                            transform: [{ scale: scaleAnim }],
                            opacity: opacityAnim,
                        },
                    ]}
                >
                    {/* Icon Circle */}
                    <View
                        style={[
                            styles.iconCircle,
                            {
                                backgroundColor: config.bgColor,
                                borderColor: config.borderColor,
                            },
                        ]}
                    >
                        <Ionicons name={config.icon} size={40} color={config.color} />
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

                    {/* Message */}
                    <Text style={[styles.message, { color: colors.textSecondary }]}>
                        {message}
                    </Text>

                    {/* Buttons */}
                    <View style={styles.buttonContainer}>
                        {buttons.map((button, index) => {
                            const btnStyle = getButtonStyle(button.style);
                            return (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => handleButtonPress(button)}
                                    style={[
                                        styles.button,
                                        { backgroundColor: btnStyle.backgroundColor },
                                        buttons.length > 1 && { flex: 1 },
                                        index > 0 && { marginLeft: 12 },
                                    ]}
                                    activeOpacity={0.8}
                                >
                                    <Text
                                        style={[
                                            styles.buttonText,
                                            { color: btnStyle.textColor },
                                        ]}
                                    >
                                        {button.text}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    container: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 15,
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 3,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 12,
        fontFamily: 'Poppins_700Bold',
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
        fontFamily: 'Poppins_400Regular',
    },
    buttonContainer: {
        flexDirection: 'row',
        width: '100%',
    },
    button: {
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 100,
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '600',
        fontFamily: 'Poppins_600SemiBold',
    },
});
