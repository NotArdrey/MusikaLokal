import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import VerificationModal from '../src/components/VerificationModal';
import { useTheme } from '../src/context/ThemeContext';

export default function LoginScreen() {
    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Verification Modal State
    const [showVerification, setShowVerification] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert(
                'Missing Information',
                'Please enter both your email and password to continue.',
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

        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                // Handle specific error cases
                if (error.message.includes('Invalid login credentials')) {
                    Alert.alert(
                        'Login Failed',
                        'The email or password you entered is incorrect. Please try again.',
                        [{ text: 'Try Again', style: 'default' }]
                    );
                } else if (error.message.includes('Email not confirmed')) {
                    Alert.alert(
                        'Email Not Verified',
                        'Please check your inbox and click the verification link we sent you.',
                        [{ text: 'OK', style: 'default' }]
                    );
                } else if (error.message.includes('rate') || error.status === 429) {
                    Alert.alert(
                        'Too Many Attempts',
                        'You\'ve tried logging in too many times. Please wait a minute and try again.',
                        [{ text: 'OK', style: 'default' }]
                    );
                } else {
                    Alert.alert('Login Failed', error.message);
                }
            } else {
                // Check if user is verified
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('is_verified')
                        .eq('id', user.id)
                        .single();

                    if (profile && !profile.is_verified) {
                        // Sign out immediately to prevent access
                        await supabase.auth.signOut();

                        Alert.alert(
                            'Verification Required',
                            'You need to verify your identity before accessing the app.',
                            [
                                {
                                    text: 'Verify Now',
                                    onPress: () => startVerification(user.id),
                                    style: 'default'
                                },
                                {
                                    text: 'Cancel',
                                    style: 'cancel'
                                }
                            ]
                        );
                    } else {
                        router.replace('/home');
                    }
                }
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

            // Success alert handled by Modal onSuccess
        } catch (e) {
            console.log('Verification error:', e);
            Alert.alert('Error', 'Failed to start verification.');
        }
    };

    const handleVerificationSuccess = () => {
        setShowVerification(false);
        Alert.alert(
            'Verification Submitted',
            'Processing your ID. Please confirm your email if you haven\'t already.',
            [{ text: 'OK' }]
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="flex-1"
            style={{ backgroundColor: colors.background }}
        >
            <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                <View className="flex-1 px-8 justify-center min-h-screen">
                    {/* Logo Section */}
                    <View className="items-center mb-12">
                        <View className="w-24 h-24 rounded-3xl bg-primary items-center justify-center mb-6 shadow-xl shadow-primary/30">
                            <Image
                                source={require('../assets/images/Musika-lokal-logo.png')}
                                style={{ width: 100, height: 100, tintColor: 'white' }}
                                resizeMode="contain"
                            />
                        </View>
                        <Text className="text-3xl font-bold text-center mb-2" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>
                            MusikaLokal
                        </Text>
                        <Text className="text-center" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                            Connect with the local music scene
                        </Text>
                    </View>

                    {/* Form Section */}
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
                                    placeholder="Enter your password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => router.push('/forget_password')} className="items-end mt-2">
                                <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary, fontSize: 12 }}>
                                    Forgot Password?
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={handleLogin}
                            disabled={loading}
                            className="h-14 rounded-2xl bg-primary items-center justify-center shadow-lg shadow-primary/30 mt-4"
                            style={{ backgroundColor: colors.primary }}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: 'white', fontSize: 16 }}>
                                    Sign In
                                </Text>
                            )}
                        </TouchableOpacity>

                        <View className="flex-row justify-center mt-6">
                            <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                                Don't have an account?{' '}
                            </Text>
                            <TouchableOpacity onPress={() => router.push('/signup')}>
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>
                                    Create Account
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
