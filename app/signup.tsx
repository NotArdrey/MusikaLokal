import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import VerificationModal from '../src/components/VerificationModal';
import { useTheme } from '../src/context/ThemeContext';

export default function SignupScreen() {
    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Verification Modal State
    const [showVerification, setShowVerification] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');

    const handleSignup = async () => {
        if (!email || !password || !confirmPassword) {
            Alert.alert(
                'Missing Information',
                'Please fill in all fields to create your account.',
                [{ text: 'OK', style: 'default' }]
            );
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Alert.alert(
                'Invalid Email',
                'Please enter a valid email address.',
                [{ text: 'OK', style: 'default' }]
            );
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert(
                'Passwords Don\'t Match',
                'Please make sure both passwords are the same.',
                [{ text: 'OK', style: 'default' }]
            );
            return;
        }

        if (password.length < 6) {
            Alert.alert(
                'Password Too Short',
                'Your password must be at least 6 characters long.',
                [{ text: 'OK', style: 'default' }]
            );
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) {
                // Handle specific error cases
                if (error.message.includes('rate') || error.status === 429) {
                    Alert.alert(
                        'Too Many Attempts',
                        'You\'ve made too many signup requests. Please wait a minute and try again.',
                        [{ text: 'OK', style: 'default' }]
                    );
                } else if (error.message.includes('already registered') || error.message.includes('already exists')) {
                    Alert.alert(
                        'Email Already Used',
                        'This email is already registered. Try logging in instead.',
                        [
                            { text: 'Go to Login', onPress: () => router.push('/'), style: 'default' },
                            { text: 'Cancel', style: 'cancel' }
                        ]
                    );
                } else if (error.message.includes('password')) {
                    Alert.alert(
                        'Weak Password',
                        'Please choose a stronger password with at least 6 characters.',
                        [{ text: 'OK', style: 'default' }]
                    );
                } else {
                    Alert.alert('Signup Failed', error.message);
                }
                return;
            }

            // Account created successfully - now trigger identity verification
            if (data.user) {
                // Auto-redirect to Didit verification
                // We use a small timeout to allow the UI to update slightly (optional, but good for UX)
                setTimeout(() => {
                    startVerification(data.user!.id);
                }, 500);
            }
        } catch (e) {
            Alert.alert(
                'Connection Error',
                'Unable to connect to the server. Please check your internet connection and try again.',
                [{ text: 'OK', style: 'default' }]
            );
            console.log(e);
        } finally {
            setLoading(false);
        }
    };

    const startVerification = async (userId: string) => {
        try {
            // Direct URL construction
            const DIDIT_VERIFICATION_URL = 'https://verify.didit.me/verify/kxYhKHgC1LESNW-TQEmPcw';
            const url = `${DIDIT_VERIFICATION_URL}?reference=${userId}`;

            setVerificationUrl(url);
            setShowVerification(true);

            // Note: The success alert will be triggered by the modal's onSuccess callback
        } catch (e) {
            console.log('Verification error:', e);
            Alert.alert(
                'Verification Issue',
                'We couldn\'t start the verification process. You can verify later in your profile settings.',
                [{ text: 'Continue to Login', onPress: () => router.push('/') }]
            );
        }
    };

    const handleVerificationSuccess = () => {
        setShowVerification(false);
        Alert.alert(
            'Verification Submitted',
            'Great job! We are processing your ID.\n\nNow, please check your email inbox to confirm your account.',
            [{ text: 'Go to Login', onPress: () => router.push('/') }]
        );
    };

    // Derived styles based on theme
    const themeStyles = {
        container: { backgroundColor: colors.background },
        text: { color: colors.text },
        textSecondary: { color: colors.textSecondary },
        inputContainer: {
            backgroundColor: isDark ? '#1F2937' : '#F9FAFB',
            borderColor: isDark ? '#374151' : '#E5E7EB',
        },
        primaryButton: { backgroundColor: colors.primary },
        primaryText: { color: colors.primary },
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.flex1, themeStyles.container]}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.contentContainer}>

                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View style={styles.headerContainer}>
                        <Text style={[styles.headerTitle, themeStyles.text]}>
                            Create Account
                        </Text>
                        <Text style={[styles.headerSubtitle, themeStyles.textSecondary]}>
                            Join the community today
                        </Text>
                    </View>

                    <View style={styles.formContainer}>
                        <View>
                            <Text style={[styles.label, themeStyles.textSecondary]}>
                                Email Address
                            </Text>
                            <View style={[styles.inputContainer, themeStyles.inputContainer]}>
                                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.input, themeStyles.text]}
                                    placeholder="name@email.com"
                                    placeholderTextColor={colors.textSecondary}
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>
                        </View>

                        <View>
                            <Text style={[styles.label, themeStyles.textSecondary]}>
                                Password
                            </Text>
                            <View style={[styles.inputContainer, themeStyles.inputContainer]}>
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.input, themeStyles.text]}
                                    placeholder="Create a password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                            </View>
                        </View>

                        <View>
                            <Text style={[styles.label, themeStyles.textSecondary]}>
                                Confirm Password
                            </Text>
                            <View style={[styles.inputContainer, themeStyles.inputContainer]}>
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.input, themeStyles.text]}
                                    placeholder="Confirm your password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showPassword}
                                />
                            </View>
                        </View>

                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.showPasswordContainer}>
                            <Ionicons name={showPassword ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
                            <Text style={[styles.showPasswordText, themeStyles.textSecondary]}>
                                Show Password
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => handleSignup()}
                            disabled={loading}
                            style={[styles.signupButton, themeStyles.primaryButton]}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.signupButtonText}>
                                    Sign Up
                                </Text>
                            )}
                        </TouchableOpacity>

                        <View style={styles.loginLinkContainer}>
                            <Text style={[styles.loginLinkText, themeStyles.textSecondary]}>
                                Already have an account?{' '}
                            </Text>
                            <TouchableOpacity onPress={() => router.push('/')}>
                                <Text style={[styles.loginLinkHighlight, themeStyles.primaryText]}>
                                    Sign In
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </ScrollView>

            <VerificationModal
                visible={showVerification}
                url={verificationUrl}
                onClose={() => setShowVerification(false)}
                onSuccess={handleVerificationSuccess}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 32, // px-8
        justifyContent: 'center',
        paddingVertical: 48, // py-12
    },
    backButton: {
        position: 'absolute',
        top: 48, // top-12
        left: 32, // left-8
        zIndex: 10,
        padding: 8,
        marginLeft: -8, // -ml-2
    },
    headerContainer: {
        marginBottom: 40, // mb-10
    },
    headerTitle: {
        fontSize: 30, // text-3xl
        fontWeight: 'bold',
        marginBottom: 8, // mb-2
        fontFamily: 'Poppins_700Bold',
    },
    headerSubtitle: {
        fontFamily: 'Poppins_400Regular',
    },
    formContainer: {
        gap: 20, // gap-5
    },
    label: {
        marginBottom: 8, // mb-2
        fontSize: 12, // text-xs
        textTransform: 'uppercase',
        fontWeight: 'bold',
        letterSpacing: 1, // tracking-wider
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16, // px-4
        height: 56, // h-14
        borderRadius: 16, // rounded-2xl
        borderWidth: 1,
    },
    input: {
        flex: 1,
        marginLeft: 12, // ml-3
        height: '100%',
        fontFamily: 'Poppins_400Regular',
    },
    showPasswordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8, // mt-2
    },
    showPasswordText: {
        marginLeft: 8, // ml-2
        fontSize: 12, // text-xs
        fontFamily: 'Poppins_400Regular',
    },
    signupButton: {
        height: 56, // h-14
        borderRadius: 16, // rounded-2xl
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24, // mt-6
        // Pre-calculated shadow (shadow-lg)
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 10,
    },
    signupButtonText: {
        fontFamily: 'Poppins_600SemiBold',
        color: 'white',
        fontSize: 16,
    },
    loginLinkContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24, // mt-6
    },
    loginLinkText: {
        fontFamily: 'Poppins_400Regular',
    },
    loginLinkHighlight: {
        fontFamily: 'Poppins_600SemiBold',
    },
});
