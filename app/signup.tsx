import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

export default function SignupScreen() {
    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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
                // Don't ask to check email yet. Go straight to verification.
                Alert.alert(
                    'Step 1 Complete! 🎵',
                    'Your account is created. Now, let\'s verify your identity to activate it.',
                    [
                        {
                            text: 'Start Verification',
                            onPress: () => startVerification(data.user!.id),
                            style: 'default'
                        }
                    ]
                );
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
            const { data, error } = await supabase.functions.invoke('verify-identity', {
                body: { action: 'create_session', userId }
            });

            if (error) throw error;

            if (data && data.url) {
                // Open Didit verification URL in browser
                await WebBrowser.openBrowserAsync(data.url);

                // After browser closes, show success message
                Alert.alert(
                    'Verification Submitted',
                    'Great job! We are processing your ID.\n\nNow, please check your email inbox to confirm your account.',
                    [{ text: 'Go to Login', onPress: () => router.push('/') }]
                );
            }
        } catch (e) {
            console.log('Verification error:', e);
            Alert.alert(
                'Verification Issue',
                'We couldn\'t start the verification process. You can verify later in your profile settings.',
                [{ text: 'Continue to Login', onPress: () => router.push('/') }]
            );
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
            style={{ backgroundColor: colors.background }}
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                <View className="flex-1 px-8 justify-center min-h-screen py-12">

                    <TouchableOpacity onPress={() => router.back()} className="absolute top-12 left-8 z-10 p-2 -ml-2">
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>

                    <View className="mb-10">
                        <Text className="text-3xl font-bold mb-2" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>
                            Create Account
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                            Join the community today
                        </Text>
                    </View>

                    <View className="gap-5">
                        <View>
                            <Text className="mb-2 text-xs uppercase font-bold tracking-wider" style={{ color: colors.textSecondary }}>
                                Email Address
                            </Text>
                            <View
                                className={`flex-row items-center px-4 h-14 rounded-2xl border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}
                            >
                                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    className="flex-1 ml-3 h-full"
                                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
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
                            <Text className="mb-2 text-xs uppercase font-bold tracking-wider" style={{ color: colors.textSecondary }}>
                                Password
                            </Text>
                            <View
                                className={`flex-row items-center px-4 h-14 rounded-2xl border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}
                            >
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    className="flex-1 ml-3 h-full"
                                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                                    placeholder="Create a password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                            </View>
                        </View>

                        <View>
                            <Text className="mb-2 text-xs uppercase font-bold tracking-wider" style={{ color: colors.textSecondary }}>
                                Confirm Password
                            </Text>
                            <View
                                className={`flex-row items-center px-4 h-14 rounded-2xl border ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}
                            >
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    className="flex-1 ml-3 h-full"
                                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                                    placeholder="Confirm your password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showPassword}
                                />
                            </View>
                        </View>

                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="flex-row items-center mt-2">
                            <Ionicons name={showPassword ? "checkbox" : "square-outline"} size={20} color={colors.primary} />
                            <Text className="ml-2 text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                                Show Password
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => handleSignup()}
                            disabled={loading}
                            className="h-14 rounded-2xl bg-primary items-center justify-center shadow-lg shadow-primary/30 mt-6"
                            style={{ backgroundColor: colors.primary }}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: 'white', fontSize: 16 }}>
                                    Sign Up
                                </Text>
                            )}
                        </TouchableOpacity>

                        <View className="flex-row justify-center mt-6">
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                                Already have an account?{' '}
                            </Text>
                            <TouchableOpacity onPress={() => router.push('/')}>
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>
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
