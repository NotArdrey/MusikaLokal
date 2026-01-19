import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
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
            // Store in pending_signups table (account NOT created yet)
            const { data: pending, error: pendingError } = await supabase
                .from('pending_signups')
                .insert({
                    email: email.toLowerCase().trim(),
                    password_hash: password, // Will be hashed by Admin API on creation
                })
                .select()
                .single();

            if (pendingError) {
                if (pendingError.message.includes('duplicate') || pendingError.message.includes('unique')) {
                    Alert.alert(
                        'Email Already Pending',
                        'This email is already awaiting verification. Please complete the verification or try again later.',
                        [{ text: 'OK', style: 'default' }]
                    );
                } else {
                    Alert.alert('Signup Failed', pendingError.message);
                }
                return;
            }

            // Now start Didit verification with pending signup ID
            if (pending?.id) {
                await startVerification(pending.id, email);
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

    const startVerification = async (pendingId: string, userEmail: string) => {
        try {
            const DIDIT_VERIFICATION_URL = 'https://verify.didit.me/verify/kxYhKHgC1LESNW-TQEmPcw';
            const redirectUri = 'musikalokal://verification-complete';
            const timestamp = Date.now(); // Cache buster to force new session
            const url = `${DIDIT_VERIFICATION_URL}?reference=${pendingId}&redirect_uri=${encodeURIComponent(redirectUri)}&t=${timestamp}`;

            // Use openAuthSessionAsync for automatic return to app
            const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);

            if (result.type === 'success') {
                // User was auto-redirected back
                Alert.alert(
                    'Verification Submitted',
                    'Your ID is being processed. You will receive a confirmation email at ' + userEmail,
                    [{ text: 'Go to Login', onPress: () => router.push('/') }]
                );
            } else {
                // User closed browser manually - verification may still be complete
                Alert.alert(
                    'Verification Submitted',
                    'If you completed the ID verification, your account will be created shortly.\n\nCheck your email at ' + userEmail + ' for confirmation.',
                    [{ text: 'Go to Login', onPress: () => router.push('/') }]
                );
            }
        } catch (e) {
            console.log('Verification error:', e);
            Alert.alert(
                'Verification Issue',
                'We couldn\'t start the verification process. Please try again.',
                [{ text: 'OK', style: 'default' }]
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
