
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../src/context/ThemeContext';
import { VerificationStore } from './src/utils/VerificationStore';

// Get the Supabase URL for edge functions
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';



export default function SignupScreen() {
    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');

    const isMounted = React.useRef(true);

    React.useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [selectedRole, setSelectedRole] = useState<'musician' | 'venue-owner' | 'studio-owner' | null>(null);
    const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; role?: string }>({});

    // Role options for the selector
    const roleOptions = [
        { value: 'musician' as const, label: 'Musician', icon: 'musical-notes-outline' as const, description: 'Join bands, find gigs' },
        { value: 'venue-owner' as const, label: 'Venue Owner', icon: 'business-outline' as const, description: 'Host events, hire artists' },
        { value: 'studio-owner' as const, label: 'Studio Owner', icon: 'mic-outline' as const, description: 'Offer recording services' },
    ];

    // Verification Modal State
    const [showVerification, setShowVerification] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');

    /**
     * Check if an existing unverified user can retry verification
     * Returns the auth user ID if they exist and can retry
     */
    const checkExistingUser = async (userEmail: string): Promise<{
        canRetry: boolean;
        userId?: string;
        status?: string;
        needsPassword?: boolean;
    }> => {
        try {
            // Check profiles table for existing user
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('id, is_verified, verification_status')
                .eq('email', userEmail.toLowerCase().trim())
                .single();

            if (error || !profile) {
                // No existing profile, proceed with new signup
                return { canRetry: false };
            }

            if (profile.is_verified) {
                // Already verified, cannot re-register
                return { canRetry: false, status: 'verified' };
            }

            // Check verification status
            const verificationStatus = profile.verification_status || 'NOT_STARTED';

            if (verificationStatus === 'PENDING_REVIEW') {
                // In manual review, cannot retry
                return { canRetry: false, status: 'pending_review' };
            }

            // User exists but not verified - can retry verification
            // They need to provide correct password to authenticate
            return {
                canRetry: true,
                userId: profile.id,
                status: verificationStatus,
                needsPassword: true // They need to authenticate first
            };
        } catch (e) {
            console.log('Error checking existing user:', e);
            return { canRetry: false };
        }
    };

    /**
     * Attempt to authenticate existing unverified user and restart verification
     */
    const retryVerificationForExistingUser = async (userEmail: string, userPassword: string): Promise<boolean> => {
        try {
            // Try to sign in with provided credentials
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email: userEmail.toLowerCase().trim(),
                password: userPassword,
            });

            if (signInError) {
                // Wrong password - they might have forgotten it
                if (signInError.message.includes('Invalid login credentials')) {
                    Alert.alert(
                        'Account Exists',
                        'An unverified account exists with this email but the password doesn\'t match. Please use the correct password or reset it.',
                        [
                            { text: 'Reset Password', onPress: () => router.push('/forget_password') },
                            { text: 'OK', style: 'cancel' }
                        ]
                    );
                    return false;
                }
                throw signInError;
            }

            if (signInData?.user) {
                // Check verification status one more time
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_verified, verification_status')
                    .eq('id', signInData.user.id)
                    .single();

                if (profile?.is_verified) {
                    await supabase.auth.signOut();
                    Alert.alert(
                        'Already Verified',
                        'Your account is already verified! Please sign in.',
                        [{ text: 'Go to Login', onPress: () => router.push('/') }]
                    );
                    return false;
                }

                if (profile?.verification_status === 'PENDING_REVIEW') {
                    await supabase.auth.signOut();
                    Alert.alert(
                        'Manual Review in Progress',
                        'Your verification is being manually reviewed. Please wait.',
                        [{ text: 'OK', style: 'default' }]
                    );
                    return false;
                }

                // Clear session and restart verification
                const userId = signInData.user.id;
                await supabase.auth.signOut();
                await startVerification(userId, userEmail);
                return true;
            }

            return false;
        } catch (e) {
            console.log('Error retrying verification:', e);
            return false;
        }
    };

    const handleSignup = async () => {
        setErrors({}); // Clear previous errors
        const newErrors: { email?: string; password?: string; confirmPassword?: string; role?: string } = {};

        // Email Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) {
            newErrors.email = 'Email is required.';
        } else if (!emailRegex.test(email)) {
            newErrors.email = 'Please enter a valid email address.';
        }

        // Password Validation
        // Min 8 chars, 1 upper, 1 lower, 1 number, 1 special char
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        if (!password) {
            newErrors.password = 'Password is required.';
        } else if (!passwordRegex.test(password)) {
            newErrors.password = 'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.';
        }

        // Confirm Password Validation
        if (!confirmPassword) {
            newErrors.confirmPassword = 'Please confirm your password.';
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match.';
        }

        // Role Validation
        if (!selectedRole) {
            newErrors.role = 'Please select a role.';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);
        try {
            // First check if email exists with unverified status
            const existingCheck = await checkExistingUser(email);

            // Handle special cases for existing users
            if (existingCheck.status === 'verified') {
                Alert.alert(
                    'Email Already Verified',
                    'This email is already associated with a verified account. Please sign in instead.',
                    [{ text: 'Go to Login', onPress: () => router.push('/') }]
                );
                return;
            }

            if (existingCheck.status === 'pending_review') {
                Alert.alert(
                    'Manual Review in Progress',
                    'Your verification is currently being manually reviewed. Please wait for the review to complete (usually 1-2 business days).',
                    [{ text: 'OK', style: 'default' }]
                );
                return;
            }

            // If user exists but unverified, authenticate and restart verification
            if (existingCheck.canRetry && existingCheck.needsPassword) {
                console.log('Existing unverified user found, attempting to authenticate and restart verification');
                const retried = await retryVerificationForExistingUser(email, password);
                if (retried) {
                    return; // Verification started successfully
                }
                // If retry failed (wrong password), the function already showed an alert
                return;
            }

            // Create new user account with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email.toLowerCase().trim(),
                password: password,
                options: {
                    emailRedirectTo: 'https://musikalokal-redirection.vercel.app/',
                    data: {
                        is_verified: false,
                    }
                }
            });

            if (authError) {
                // Handle "already registered" - try to authenticate and check status
                if (authError.message.includes('already registered')) {
                    // User exists in auth but maybe not in profiles (edge case)
                    const retried = await retryVerificationForExistingUser(email, password);
                    if (!retried) {
                        // Password didn't match - alert already shown by retryVerificationForExistingUser
                        // or some other error occurred
                    }
                } else {
                    Alert.alert('Signup Failed', authError.message);
                }
                return;
            }

            // Don't create profile yet - only create after Didit verification is approved
            // Just create a temporary record to track the verification session
            if (authData.user) {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        email: email.toLowerCase().trim(),
                        role: selectedRole,
                        is_verified: false,
                        verification_status: 'NOT_STARTED',
                        created_at: new Date().toISOString(),
                        // Don't store other details yet - will be filled from ID on verification
                    });

                if (profileError) {
                    console.log('Profile creation error:', profileError.message);
                    // Continue anyway - webhook will create profile on approval
                }

                // Start Didit verification with user ID as reference
                // Profile details will be stored only after verification is approved
                await startVerification(authData.user.id, email);
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



    const startVerification = async (userId: string, userEmail: string) => {
        // Reset global success flag for new attempt
        VerificationStore.reset();

        try {
            // This is required because Unilinks don't support passing vendor_data
            console.log('Creating Didit verification session for user:', userId);


            // Generate a deep link that works for both Expo Go and Production
            // We point to '/' (LoginScreen) because that's where the verification logic handles the alert
            const redirectUrl = Linking.createURL('/', { queryParams: { verified: 'true' } });
            console.log('Generated Redirect URL:', redirectUrl);

            const createSessionResponse = await fetch(
                `${SUPABASE_URL}/functions/v1/create-didit-session`,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                        userId: userId,
                        email: userEmail,
                        redirect_url: redirectUrl, // Pass dynamic redirect URL
                    }),
                }
            );

            if (!createSessionResponse.ok) {
                const errorData = await createSessionResponse.json();
                console.error('Failed to create Didit session:', errorData);
                Alert.alert(
                    'Verification Error',
                    'Unable to start identity verification. Please try again.',
                    [{ text: 'OK', style: 'default' }]
                );
                return;
            }

            const sessionData = await createSessionResponse.json();
            console.log('Didit session created:', sessionData);

            if (!sessionData.verificationUrl) {
                console.error('No verification URL returned from session creation');
                Alert.alert(
                    'Verification Error',
                    'Unable to start identity verification. Please try again.',
                    [{ text: 'OK', style: 'default' }]
                );
                return;
            }


            // Use the verification URL returned from the Create Session API
            // We pass the SAME redirectUrl we sent to the server, so the browser catches the return
            const result = await WebBrowser.openAuthSessionAsync(sessionData.verificationUrl, redirectUrl);


            if (result.type === 'success' && result.url) {
                // Check if already verified globally (e.g. by index.tsx deep link handler)
                if (VerificationStore.isSuccess()) {
                    console.log('Verification already handled globally. Returning.');
                    return;
                }
                // Parse the deep link URL to get detailed status
                const resultUrl = new URL(result.url);
                const status = resultUrl.searchParams.get('status');
                const message = resultUrl.searchParams.get('message') || '';
                const canRetry = resultUrl.searchParams.get('can_retry') === 'true';


                switch (status) {

                    case 'approved':
                    case 'success':
                        // Signal global success
                        VerificationStore.setSuccess(true);

                        // Trigger email confirmation resend
                        try {
                            await supabase.auth.resend({
                                type: 'signup',
                                email: userEmail,
                                options: {
                                    emailRedirectTo: 'https://musikalokal-redirection.vercel.app/'
                                }
                            });
                        } catch (e) {
                            console.log('Error resending confirmation email:', e);
                        }

                        Alert.alert(
                            'Verification Complete! 🎉',
                            `Your identity is verified! We've sent a confirmation email to ${userEmail}.\n\nPlease check your inbox (and spam) to confirm your account.`,
                            [{ text: 'Go to Login', onPress: () => router.push('/') }]
                        );
                        break;

                    case 'pending':
                        Alert.alert(
                            'Verification Processing',
                            'Your verification is being processed. This usually takes a few moments. You will receive a notification when complete.',
                            [{ text: 'Go to Login', onPress: () => router.push('/') }]
                        );
                        break;

                    case 'pending_review':
                        Alert.alert(
                            'Manual Review in Progress',
                            'Your verification requires manual review. This usually takes 1-2 business days. We\'ll notify you once complete.',
                            [{ text: 'OK', onPress: () => router.push('/') }]
                        );
                        break;

                    case 'declined':
                        Alert.alert(
                            'Verification Declined',
                            message || 'Your verification was not successful. Please try again with a clear photo of your ID.',
                            [
                                { text: 'Try Again', onPress: () => startVerification(userId, userEmail) },
                                { text: 'Cancel', style: 'cancel' }
                            ]
                        );
                        break;

                    case 'abandoned':
                        Alert.alert(
                            'Verification Incomplete',
                            'You didn\'t complete the verification process. Would you like to try again?',
                            [
                                { text: 'Try Again', onPress: () => startVerification(userId, userEmail) },
                                { text: 'Later', style: 'cancel', onPress: () => router.push('/') }
                            ]
                        );
                        break;


                    default:
                        // Double check global store before showing error
                        if (VerificationStore.isSuccess()) return;

                        // error or unknown status
                        if (canRetry) {
                            Alert.alert(
                                'Verification Issue',
                                message || 'There was an issue with your verification.',
                                [
                                    { text: 'Try Again', onPress: () => startVerification(userId, userEmail) },
                                    { text: 'Cancel', style: 'cancel' }
                                ]
                            );
                        } else {
                            Alert.alert(
                                'Verification Issue',
                                message || 'There was an issue with your verification. Please try again later.',
                                [{ text: 'OK', style: 'default' }]
                            );
                        }
                }
            } else if (result.type === 'cancel' || result.type === 'dismiss') {
                // User closed browser manually - Didit doesn't auto-redirect

                // Check verification status via API with polling
                console.log('Browser closed, polling verification status for session:', sessionData.sessionId);

                // If the deep link already handled success, we stop here immediately.
                if (VerificationStore.isSuccess()) {
                    console.log('Verification already verified by deep link. Suppressing alert.');
                    return;
                }

                let attempts = 0;
                let finalProfile = null;

                while (attempts < 3 && isMounted.current) {
                    if (VerificationStore.isSuccess()) return;

                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s

                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('is_verified, verification_status')
                        .eq('id', userId)
                        .single();

                    finalProfile = profile;

                    if (profile?.is_verified || profile?.verification_status === 'APPROVED') {
                        break;
                    }
                    if (profile?.verification_status === 'DECLINED') {
                        break;
                    }
                    attempts++;
                }

                if (!isMounted.current || VerificationStore.isSuccess()) return;

                const verificationStatus = finalProfile?.verification_status || 'NOT_STARTED';
                const isVerified = finalProfile?.is_verified || false;

                console.log('Verification status after close:', { verificationStatus, isVerified });


                if (isVerified || verificationStatus === 'APPROVED') {
                    // Signal global success just in case
                    VerificationStore.setSuccess(true);

                    // Trigger email confirmation resend
                    try {
                        await supabase.auth.resend({
                            type: 'signup',
                            email: userEmail,
                            options: {
                                emailRedirectTo: 'https://musikalokal-redirection.vercel.app/'
                            }
                        });
                    } catch (e) {
                        console.log('Error resending confirmation email:', e);
                    }

                    Alert.alert(
                        'Verification Complete! 🎉',
                        `Your identity is verified! We've sent a confirmation email to ${userEmail}.\n\nPlease check your inbox (and spam) to confirm your account.`,
                        [{ text: 'Go to Login', onPress: () => router.push('/') }]
                    );
                } else if (verificationStatus === 'PENDING_REVIEW') {
                    Alert.alert(
                        'Manual Review in Progress',
                        'Your verification requires manual review. This usually takes 1-2 business days. We\'ll notify you once complete.',
                        [{ text: 'OK', onPress: () => router.push('/') }]
                    );
                } else if (verificationStatus === 'DECLINED') {
                    Alert.alert(
                        'Verification Declined',
                        'Your verification was not successful. Please try again with a clear photo of your ID.',
                        [
                            { text: 'Try Again', onPress: () => startVerification(userId, userEmail) },
                            { text: 'Cancel', style: 'cancel' }
                        ]
                    );

                } else if (verificationStatus === 'NOT_STARTED') {
                    // User closed without completing
                    Alert.alert(
                        'Verification Incomplete',
                        'You didn\'t complete the verification process. Would you like to try again?',
                        [
                            { text: 'Try Again', onPress: () => startVerification(userId, userEmail) },
                            { text: 'Later', style: 'cancel', onPress: () => router.push('/') }
                        ]
                    );



                } else {
                    // PENDING - webhook might have processed or is in progress
                    // If we are here after polling, and component is still mounted, it means genuinely pending
                    if (isMounted.current) {
                        Alert.alert(
                            'Verification Submitted',
                            'Your verification is being processed. This usually takes a few moments. You can try logging in shortly.',
                            [{ text: 'Go to Login', onPress: () => router.push('/') }]
                        );
                    }
                }
            }
        } catch (e) {
            console.log('Verification error:', e);
            Alert.alert(
                'Verification Issue',
                'We couldn\'t complete the verification process. Your account has been created but is not verified. Please try registering again.',
                [{ text: 'OK', style: 'default' }]
            );
        }
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
                            <View style={[
                                styles.inputContainer,
                                themeStyles.inputContainer,
                                errors.email ? { borderColor: '#EF4444' } : null
                            ]}>
                                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.input, themeStyles.text]}
                                    placeholder="name@email.com"
                                    placeholderTextColor={colors.textSecondary}
                                    value={email}
                                    onChangeText={(text) => {
                                        setEmail(text);
                                        if (errors.email) setErrors({ ...errors, email: undefined });
                                    }}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />
                            </View>
                            {errors.email && (
                                <Text style={styles.errorText}>{errors.email}</Text>
                            )}
                        </View>

                        <View>
                            <Text style={[styles.label, themeStyles.textSecondary]}>
                                Password
                            </Text>
                            <View style={[
                                styles.inputContainer,
                                themeStyles.inputContainer,
                                errors.password ? { borderColor: '#EF4444' } : null
                            ]}>
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.input, themeStyles.text]}
                                    placeholder="Create a password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={password}
                                    onChangeText={(text) => {
                                        setPassword(text);
                                        if (errors.password) setErrors({ ...errors, password: undefined });
                                    }}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            {errors.password && (
                                <Text style={styles.errorText}>{errors.password}</Text>
                            )}
                        </View>

                        <View>
                            <Text style={[styles.label, themeStyles.textSecondary]}>
                                Confirm Password
                            </Text>
                            <View style={[
                                styles.inputContainer,
                                themeStyles.inputContainer,
                                errors.confirmPassword ? { borderColor: '#EF4444' } : null
                            ]}>
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.input, themeStyles.text]}
                                    placeholder="Confirm your password"
                                    placeholderTextColor={colors.textSecondary}
                                    value={confirmPassword}
                                    onChangeText={(text) => {
                                        setConfirmPassword(text);
                                        if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined });
                                    }}
                                    secureTextEntry={!showConfirmPassword}
                                />
                                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                                    <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            {errors.confirmPassword && (
                                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                            )}
                        </View>

                        {/* Role Selector */}
                        <View>
                            <Text style={[styles.label, themeStyles.textSecondary]}>
                                I am a...
                            </Text>
                            <View style={styles.roleContainer}>
                                {roleOptions.map((option) => (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={() => setSelectedRole(option.value)}
                                        style={[
                                            styles.roleCard,
                                            themeStyles.inputContainer,
                                            selectedRole === option.value && {
                                                borderColor: colors.primary,
                                                borderWidth: 2,
                                                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
                                            },
                                            errors.role && !selectedRole ? { borderColor: '#EF4444' } : null
                                        ]}
                                    >
                                        <Ionicons
                                            name={option.icon}
                                            size={24}
                                            color={selectedRole === option.value ? colors.primary : colors.textSecondary}
                                        />
                                        <Text style={[
                                            styles.roleLabel,
                                            themeStyles.text,
                                            selectedRole === option.value && { color: colors.primary, fontWeight: '600' }
                                        ]}>
                                            {option.label}
                                        </Text>
                                        <Text style={[styles.roleDescription, themeStyles.textSecondary]}>
                                            {option.description}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={{ marginTop: 8 }}>
                            {errors.role && (
                                <Text style={styles.errorText}>{errors.role}</Text>
                            )}
                        </View>

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
    errorText: {
        color: '#EF4444',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
        fontFamily: 'Poppins_400Regular',
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
        textAlignVertical: 'center',
        paddingVertical: 0,
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
    roleContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    roleCard: {
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 8,
        borderRadius: 16,
        borderWidth: 1,
        minHeight: 100,
    },
    roleLabel: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
    roleDescription: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 10,
        marginTop: 4,
        textAlign: 'center',
    },
});
