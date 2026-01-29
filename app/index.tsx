import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import VerificationModal from '../src/components/VerificationModal';
import { useTheme } from '../src/context/ThemeContext';



interface AlertState {
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
    buttons: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[];
}

export default function LoginScreen() {
    const { colors, isDark } = useTheme();
    const { verified } = useLocalSearchParams();

    // Initialize and clear any stale sessions on mount
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Check if there's a valid session
                const { data: { session }, error } = await supabase.auth.getSession();
                
                // If there's an error or no valid session, clear everything
                if (error || !session) {
                    console.log('Clearing stale session on login page mount');
                    await supabase.auth.signOut({ scope: 'local' });
                }
            } catch (e) {
                console.log('Error initializing auth:', e);
                // Clear on error to ensure clean state
                await supabase.auth.signOut({ scope: 'local' });
            }
        };
        
        initializeAuth();
    }, []);

    // Check for verification success from deep link
    useEffect(() => {
        if (verified === 'true') {
            const checkPendingSignup = async () => {
                try {
                    const savedState = await import('@react-native-async-storage/async-storage').then(m => m.default.getItem('signup_current_session'));
                    if (savedState) {
                        console.log('Pending signup detected, redirecting to signup flow...');
                        // Clear the param from here to prevent loops if we come back, though router.replace should handle it
                        router.replace({ pathname: '/signup', params: { verified: 'true' } });
                        return;
                    }
                } catch (e) {
                    console.log('Error checking pending signup:', e);
                }

                // Only show this alert if we are NOT in a signup flow (e.g. standalone verification)
                // But user requested to remove it entirely for now to avoid the confusion.
                // VerificationStore.setSuccess(true);
            };
            checkPendingSignup();
        }
    }, [verified]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

    // Verification Modal State
    const [showVerification, setShowVerification] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');
    const [loginMessage, setLoginMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    // Custom Alert State
    const [alertState, setAlertState] = useState<AlertState>({
        visible: false,
        type: 'info',
        title: '',
        message: '',
        buttons: [{ text: 'OK' }],
    });

    // Helper function to show alert
    const showAlert = (
        type: AlertType,
        title: string,
        message: string,
        buttons?: AlertState['buttons']
    ) => {
        setAlertState({
            visible: true,
            type,
            title,
            message,
            buttons: buttons || [{ text: 'OK' }],
        });
    };

    const closeAlert = () => {
        setAlertState(prev => ({ ...prev, visible: false }));
    };

    // Check for verification success from deep link
    useEffect(() => {
        if (verified === 'true') {
            showAlert(
                'success',
                'Verification Successful! 🎉',
                'Your account has been verified. You can now log in.'
            );
        }
    }, [verified]);

    const handleLogin = async () => {
        setErrors({}); // Clear previous errors
        setLoginMessage(null);
        const newErrors: { email?: string; password?: string } = {};

        if (!email) {
            newErrors.email = 'Email is required.';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            newErrors.email = 'Please enter a valid email address.';
        }

        if (!password) {
            newErrors.password = 'Password is required.';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);
        try {
            // Clear any stale session first to prevent refresh token errors
            console.log('Clearing any existing session...');
            await supabase.auth.signOut({ scope: 'local' });
            
            console.log('Attempting login for:', email);
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                console.log('Login error:', error.message);
                // Handle specific error cases
                if (error.message.includes('Invalid login credentials')) {
                    setLoginMessage({ type: 'error', text: 'Invalid email or password.' });
                } else if (error.message.includes('Email not confirmed')) {
                    setLoginMessage({ type: 'error', text: 'Email not confirmed. Check your inbox.' });
                } else if (error.message.includes('rate') || error.status === 429) {
                    setLoginMessage({ type: 'error', text: 'Too many attempts. Please wait.' });
                } else if (error.message.includes('refresh') || error.message.includes('token')) {
                    // Clear storage and retry once
                    console.log('Token error detected, clearing storage and retrying...');
                    await supabase.auth.signOut({ scope: 'local' });
                    setLoginMessage({ type: 'error', text: 'Session expired. Please try again.' });
                } else {
                    setLoginMessage({ type: 'error', text: error.message });
                }
            } else {
                // Login succeeded - VALIDATE VERIFICATION STATUS
                console.log('Auth success. Validating verification status...');
                const { data: { user } } = await supabase.auth.getUser();

                if (user) {
                    // 1. Check Metadata (Fastest)
                    const metaVerified = user.user_metadata?.is_verified;
                    console.log('Metadata check:', { metaVerified });

                    if (metaVerified === false) {
                        console.log('Blocked by metadata check.');
                        await supabase.auth.signOut();
                        setLoginMessage({ type: 'error', text: 'Account not verified. Please complete verification.' });
                        Alert.alert(
                            'Verification Required',
                            'Your account is not verified. Please complete verification to continue.',
                            [
                                { text: 'Verify Now', onPress: () => startVerification(user.id) },
                                { text: 'Cancel', style: 'cancel' }
                            ]
                        );
                        return;
                    }

                    // 2. Check Profile (Source of Truth)
                    let { data: profile, error: profileError } = await supabase
                        .from('profiles')
                        .select('is_verified, id_document_expiry')
                        .eq('id', user.id)
                        .maybeSingle();

                    console.log('Profile check:', { profile, profileError });

                    // SELF-HEALING: If profile is missing but Auth Metadata says verified, recreate the profile
                    if (!profile && metaVerified) {
                        console.log('Profile missing but Metadata Verified. Attempting to repair profile...');
                        const { error: upsertError } = await supabase
                            .from('profiles')
                            .upsert({
                                id: user.id,
                                email: user.email,
                                full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                                role: user.user_metadata?.role || 'musician',
                                is_verified: true,
                                verification_status: 'APPROVED',
                                didit_session_id: user.user_metadata?.didit_session_id
                            });

                        if (upsertError) {
                            console.error('Failed to repair profile:', upsertError);
                        } else {
                            console.log('Profile repaired successfully. Re-fetching...');
                            const { data: newProfile } = await supabase
                                .from('profiles')
                                .select('is_verified, id_document_expiry')
                                .eq('id', user.id)
                                .maybeSingle();
                            profile = newProfile;
                        }
                    }

                    // If profile is STILL missing OR unverified -> BLOCK
                    if (!profile || !profile.is_verified) {
                        console.log('Blocked by profile check. Profile Missing:', !profile, 'Verified:', profile?.is_verified);
                        await supabase.auth.signOut();

                        setLoginMessage({ type: 'error', text: !profile ? 'Account setup incomplete. Verify identity.' : 'Identity verification required.' });

                        Alert.alert(
                            'Verification Required',
                            !profile ? 'Account setup incomplete. Please verify your identity.' : 'You need to verify your identity before accessing the app.',
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
                    } else if (profile?.id_document_expiry && new Date(profile.id_document_expiry) < new Date()) {
                        // Check for expired ID
                        await supabase.auth.signOut();

                        showAlert(
                            'warning',
                            'ID Document Expired',
                            'Your identification document has expired. Please update your verification documents to continue using the app.',
                            [
                                {
                                    text: 'Update Now',
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
                        // Verified & Profile Exists -> Allow Entry
                        console.log('Verification passed. Redirecting to Home.');
                        router.replace('/home');
                    }
                }
            }
        } catch (e) {
            showAlert(
                'error',
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
            // Direct URL construction with unique reference to prevent stale sessions
            const DIDIT_VERIFICATION_URL = 'https://verify.didit.me/verify/kxYhKHgC1LESNW-TQEmPcw';

            // CRITICAL: Randomize BOTH reference and vendor_data to bypass Didit's caching
            const uniqueRef = `${userId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

            // Use uniqueRef for vendor_data to force new session perception
            const url = `${DIDIT_VERIFICATION_URL}?reference=${uniqueRef}&vendor_data=${uniqueRef}`;

            setVerificationUrl(url);
            setShowVerification(true);

            // Success alert handled by Modal onSuccess
        } catch (e) {
            console.log('Verification error:', e);
            showAlert('error', 'Error', 'Failed to start verification.');
        }
    };

    const handleVerificationSuccess = () => {
        setShowVerification(false);
        // Silent
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
                    {/* Logo Section */}
                    <View style={styles.logoSection}>
                        <View style={[styles.logoWrapper, styles.shadow]}>
                            <Image
                                source={require('../assets/images/Musika-lokal-logo.png')}
                                style={styles.logoImage}
                                resizeMode="contain"
                            />
                        </View>
                        <Text style={[styles.appName, themeStyles.text]}>
                            MusikaLokal
                        </Text>
                        <Text style={[styles.appTagline, themeStyles.textSecondary]}>
                            Connect with the local music scene
                        </Text>
                    </View>

                    {/* Form Section */}
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
                                    placeholder="Enter your password"
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
                            {errors.password ? (
                                <Text style={styles.errorText}>{errors.password}</Text>
                            ) : (
                                <TouchableOpacity onPress={() => router.push('/forget_password')} style={styles.forgotPasswordButton}>
                                    <Text style={[styles.forgotPasswordText, themeStyles.primaryText]}>
                                        Forgot Password?
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity
                            onPress={handleLogin}
                            disabled={loading}
                            style={[styles.loginButton, themeStyles.primaryButton, styles.shadow]}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.loginButtonText}>
                                    Sign In
                                </Text>
                            )}
                        </TouchableOpacity>

                        {loginMessage && (
                            <View style={{ marginTop: 16, backgroundColor: loginMessage.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', padding: 12, borderRadius: 8 }}>
                                <Text style={{ color: loginMessage.type === 'error' ? '#EF4444' : '#10B981', textAlign: 'center', fontFamily: 'Poppins_500Medium' }}>
                                    {loginMessage.text}
                                </Text>
                            </View>
                        )}

                        <View style={styles.signupLinkContainer}>
                            <Text style={[styles.signupLinkText, themeStyles.textSecondary]}>
                                Don't have an account?{' '}
                            </Text>
                            <TouchableOpacity onPress={() => router.push('/signup')}>
                                <Text style={[styles.signupLinkHighlight, themeStyles.primaryText]}>
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

            <CustomAlert
                visible={alertState.visible}
                type={alertState.type}
                title={alertState.title}
                message={alertState.message}
                buttons={alertState.buttons}
                onClose={closeAlert}
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
    logoSection: {
        alignItems: 'center',
        marginBottom: 48, // mb-12
    },
    logoWrapper: {
        width: 96, // w-24
        height: 96, // h-24
        borderRadius: 24, // rounded-3xl
        backgroundColor: '#4F46E5', // primary color fallback/base
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24, // mb-6
        // Shadow props
    },
    logoImage: {
        width: 100,
        height: 100,
        tintColor: 'white',
    },
    appName: {
        fontSize: 30, // text-3xl
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8, // mb-2
        fontFamily: 'Poppins_700Bold',
    },
    appTagline: {
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    formContainer: {
        gap: 20, // gap-5 (approx)
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
        textAlignVertical: 'center',
        paddingVertical: 0,
    },
    forgotPasswordButton: {
        alignItems: 'flex-end',
        marginTop: 8, // mt-2
    },
    forgotPasswordText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
    },
    loginButton: {
        height: 56, // h-14
        borderRadius: 16, // rounded-2xl
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16, // mt-4
    },
    loginButtonText: {
        fontFamily: 'Poppins_600SemiBold',
        color: 'white',
        fontSize: 16,
    },
    shadow: {
        shadowColor: "#4F46E5", // shadow-primary
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    signupLinkContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24, // mt-6
    },
    signupLinkText: {
        fontFamily: 'Poppins_400Regular',
    },
    signupLinkHighlight: {
        fontFamily: 'Poppins_600SemiBold',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
        fontFamily: 'Poppins_400Regular',
    },
});
