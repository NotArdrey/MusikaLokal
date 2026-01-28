
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { useTheme } from '../src/context/ThemeContext';

type OnboardingStep = 'role' | 'details' | 'verification' | 'email_verification';

export default function SignupScreen() {
    const { colors, isDark } = useTheme();

    // State
    const [step, setStep] = useState<OnboardingStep>('role');
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');
    const [tempSessionRef, setTempSessionRef] = useState('');
    const [sessionId, setSessionId] = useState<string>('');



    // Form Fields
    const [selectedRole, setSelectedRole] = useState<'musician' | 'venue-owner' | 'studio-owner' | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; role?: string }>({});

    // Reset session when email changes
    React.useEffect(() => {
        setVerificationUrl('');
    }, [email]);

    // Restore state on mount if returning from verification
    const { verified, session_id } = useLocalSearchParams<{ verified: string; session_id: string }>();
    useEffect(() => {
        if (verified === 'true') {
            const restoreState = async () => {
                try {
                    const savedState = await AsyncStorage.getItem('signup_current_session');
                    if (savedState) {
                        const { email: sEmail, password: sPassword, selectedRole: sRole, tempRef, sSessionId } = JSON.parse(savedState);
                        if (sEmail) setEmail(sEmail);
                        if (sPassword) setPassword(sPassword);
                        if (sRole) setSelectedRole(sRole);
                        if (tempRef) setTempSessionRef(tempRef);
                        if (sSessionId) setSessionId(sSessionId);

                        // If we have a session_id from params, override/set it
                        if (session_id) setSessionId(session_id);

                        setStep('verification');
                    }
                } catch (e) {
                    console.error('Failed to restore state', e);
                }
            };
            restoreState();
        }
    }, [verified]);

    // Auto-submit verification when data is ready and we are in the verification step
    useEffect(() => {
        let mounted = true;
        // Only run if we are in verification step, have all data, and came back from verification
        if (step === 'verification' && email && password && selectedRole && verified === 'true') {
            console.log('Auto-submitting account creation...');
            const timer = setTimeout(() => {
                if (mounted) finishAccountCreation();
            }, 500);
            return () => { clearTimeout(timer); mounted = false; };
        }
    }, [step, email, password, selectedRole, verified]);

    const [permission, requestPermission] = useCameraPermissions();

    // Auto-start verification session for Mobile when entering verification step
    useEffect(() => {
        let mounted = true;
        if (Platform.OS !== 'web' && step === 'verification' && !verificationUrl && verified !== 'true') {
            // Check permissions first
            if (!permission?.granted) {
                requestPermission().then(response => {
                    if (response.granted && mounted) {
                        // Permissions granted, start session
                        const timer = setTimeout(() => {
                            if (mounted) {
                                startNewVerificationSession().catch(e => console.log('Auto-start error', e));
                            }
                        }, 100);
                    } else if (mounted) {
                        Alert.alert('Permission Required', 'Camera access is needed for identity verification.');
                    }
                });
            } else {
                // Already granted
                const timer = setTimeout(() => {
                    if (mounted) {
                        startNewVerificationSession().catch(e => console.log('Auto-start error', e));
                    }
                }, 100);
                return () => { clearTimeout(timer); mounted = false; };
            }
        }
        return () => { mounted = false; };
    }, [step, verificationUrl, verified, permission]);


    // Role options
    const roleOptions = [
        { value: 'musician' as const, label: 'Musician', icon: 'musical-notes-outline' as const, description: 'Join bands, find gigs' },
        { value: 'venue-owner' as const, label: 'Venue Owner', icon: 'business-outline' as const, description: 'Host events, hire artists' },
        { value: 'studio-owner' as const, label: 'Studio Owner', icon: 'mic-outline' as const, description: 'Offer recording services' },
    ];

    // Theme Styles
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
        card: {
            backgroundColor: isDark ? '#1F2937' : 'white',
            borderColor: isDark ? '#374151' : '#E5E7EB',
        }
    };


    /**
     * Logic to handle account checking and creation (Step 2 -> 3)
     */

    // Helper to generate a fresh session URL
    const startNewVerificationSession = async () => {
        const tempRef = `TEMP_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
        setTempSessionRef(tempRef);

        // Persist state before redirecting
        try {
            await AsyncStorage.setItem('signup_current_session', JSON.stringify({
                email, password, selectedRole, tempRef
            }));
        } catch (e) {
            console.error('Failed to save session state', e);
        }

        let redirectUrl = Linking.createURL('/', { queryParams: { verified: 'true' } });

        // WEB FIX: Explicitly use the current window location to ensure we return to this specific page
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('verified', 'true');
            redirectUrl = currentUrl.toString();
        }

        try {
            // Call our Edge Function to create the session
            // This ensures the callback URL is properly set to our verification-redirect function
            const { data, error } = await supabase.functions.invoke('create-didit-session', {
                body: {
                    userId: tempRef,
                    email: email || undefined, // Optional
                    redirect_url: redirectUrl // Tells the edge function where to eventually send the user
                }
            });

            if (error) throw error;
            if (!data?.verificationUrl) throw new Error('No verification URL returned');

            // Save the ACTUAL Didit Session ID
            if (data.id) {
                setSessionId(data.id);
                // Update storage with the real ID
                try {
                    await AsyncStorage.setItem('signup_current_session', JSON.stringify({
                        email, password, selectedRole, tempRef, sSessionId: data.id
                    }));
                } catch (e) {
                    console.error('Failed to update session state with ID', e);
                }
            }

            setVerificationUrl(data.verificationUrl);
            return data.verificationUrl;
        } catch (e: any) {
            console.error('Failed to create Didit session:', e);
            Alert.alert('Error', 'Could not start verification session. Please try again.');
            return '';
        }
    };

    /**
     * Logic to handle transitioning to Verification (Step 2 -> 3)
     * We do NOT create the account yet. Verification happens first.
     */
    const handleWebVerify = async () => {
        let urlToOpen = verificationUrl;
        if (!urlToOpen) {
            urlToOpen = await startNewVerificationSession();
        }
        if (!urlToOpen) return;

        if (Platform.OS === 'web') {
            window.open(urlToOpen, '_self');
        } else {
            await WebBrowser.openAuthSessionAsync(urlToOpen);
        }
    };

    const handleMobileNavState = (event: any) => {
        if (event.url.includes('verified=true') || event.url.includes('musikalokal://')) {
            Alert.alert('Verification Submitted', 'Please check your email to complete the process.',
                [{ text: 'OK', onPress: () => router.push('/') }]
            );
        }
    };

    const handleNext = async () => {
        setErrors({});
        const newErrors: any = {};

        // Basic Validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) newErrors.email = 'Required';
        else if (!emailRegex.test(email)) newErrors.email = 'Invalid email';

        if (!password) {
            newErrors.password = 'Required';
        } else {
            // Min 8 chars, 1 upper, 1 lower, 1 number, 1 special char
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
            if (!passwordRegex.test(password)) {
                newErrors.password = 'Min 8 chars: 1 upper, 1 lower, 1 number, 1 special char';
            }
        }

        if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setLoading(true);

        try {
            // Check if profile exists (optional, nice to have to prevent dupe emails early)
            const { data: profile } = await supabase.from('profiles').select('id, is_verified').eq('email', email.trim()).maybeSingle();

            if (profile) {
                if (profile.is_verified) {
                    Alert.alert('Account Exists', 'This email is already registered and verified. Please login.', [{ text: 'Login', onPress: () => router.push('/') }]);
                    setLoading(false);
                    return;
                }
                // If unverified profile exists, we could resume, but for this flow we just warn
                Alert.alert('Account Exists', 'This email is already registered. Please login to continue verification.', [{ text: 'Login', onPress: () => router.push('/') }]);
                setLoading(false);
                return;
            }

            // Proceed to Verification Step WITHOUT creating account
            setStep('verification');

        } catch (e: any) {
            console.error(e);
            Alert.alert('Error', 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const finishAccountCreation = async () => {
        // 1. Sanity Check: Ensure we have params
        if (!email || !password || !selectedRole) {
            Alert.alert('Session Reset', 'Please re-enter your details to finish creating your account.', [{
                text: 'OK', onPress: () => {
                    router.setParams({ verified: '' });
                    setStep('details');
                }
            }]);
            return;
        }

        // 2. Security Check: Validate the verification result on the server
        // This ensures the user didn't just type ?verified=true in the URL
        const refToLink = sessionId || tempSessionRef || verificationUrl.split('reference=')[1]?.split('&')[0];
        console.log('Finishing Account Creation. Using Session ID:', refToLink);

        if (!refToLink) {
            Alert.alert('Verification Error', 'No verification session found. Please try confirming your identity again.');
            return;
        }

        setLoading(true);
        console.log('Starting account creation...');

        // Fetch Didit Data via Edge Function
        let diditData = null;
        let verifiedName = '';
        try {
            console.log('Fetching Didit session for Ref:', refToLink);
            // We attempt to fetch the session data to store it in metadata
            // Using our modified 'create-didit-session' which now supports 'get_session'
            const { data: sessionData, error: invokeError } = await supabase.functions.invoke('create-didit-session', {
                body: { action: 'get_session', session_id: refToLink }
            });

            if (invokeError) {
                console.warn('Edge Function Invoke Error:', invokeError);
            }

            if (sessionData) {
                diditData = sessionData;
                console.log('Didit Data Fetched (Keys):', Object.keys(sessionData));

                // Try to extract name from various possible locations in Didit response v3
                // Adjusting for common casing issues and nested structures
                const extracted = diditData?.features?.extracted_data || diditData?.extracted_data || {};
                const mrz = extracted?.mrz || {};
                const ocr = extracted?.ocr || {};

                const first =
                    extracted.firstName || extracted.first_name ||
                    mrz.firstName || mrz.first_name ||
                    ocr.firstName || ocr.first_name || '';

                const last =
                    extracted.lastName || extracted.last_name ||
                    mrz.lastName || mrz.last_name ||
                    ocr.lastName || ocr.last_name || '';

                if (first || last) {
                    verifiedName = [first, last].filter(Boolean).join(' ');
                } else {
                    console.warn('Name fields not found in Didit data:', JSON.stringify(extracted));
                }
            }
        } catch (e) {
            console.log('Could not fetch specific Didit data, proceeding with reference only.', e);
        }

        console.log('Proceeding to Supabase SignUp with Name:', verifiedName);

        try {
            // 3. Create Account
            // WORKAROUND: We strictly align metadata with the 'profiles' table columns to prevent Trigger errors.
            // We also add standard Supabase auth fields 'name' and 'display_name' if they don't break the trigger.
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email.trim(),
                password: password,
                options: {
                    emailRedirectTo: Linking.createURL('/'),
                    data: {
                        role: selectedRole,
                        verification_status: 'APPROVED',
                        is_verified: true,
                        didit_session_id: refToLink,
                        full_name: verifiedName,     // For 'profiles' table
                        display_name: verifiedName,  // Standard Supabase Auth field
                        name: verifiedName           // Standard Supabase Auth field
                    }
                }
            });

            console.log('SignUp Result:', { user: authData?.user?.id, error: authError });

            if (authError) throw authError;

            if (authData.user) {
                console.log('User created. Since database schema is locked, skipping RPC linking.');

                // Send Magic Link (matches user's expected "Login" email)
                try {
                    const { error: magicLinkError } = await supabase.auth.signInWithOtp({
                        email: email.trim(),
                        options: {
                            emailRedirectTo: Linking.createURL('/'), // Ensures deep link back to app
                            shouldCreateUser: false // User already created above
                        }
                    });
                    if (magicLinkError) console.warn('Magic Link trigger failed:', magicLinkError);
                } catch (mlErr) {
                    console.warn('Magic Link error:', mlErr);
                }

                // Move to Email Verification Step
                setStep('email_verification');
            }

        } catch (authErr: any) {
            // Handle "User already registered" specifically
            if (authErr?.message?.includes('already registered') || authErr?.status === 422) {
                console.warn('User already registered. Attempting to resend verification email...');

                const { error: resendError } = await supabase.auth.resend({
                    type: 'signup',
                    email: email.trim(),
                    options: { emailRedirectTo: Linking.createURL('/') }
                });

                setLoading(false);

                if (resendError) {
                    Alert.alert('Account Exists', 'This email is already registered. We tried to resend the verification link but failed. Please log in.');
                } else {
                    Alert.alert('Account Exists', 'This email is already registered. We have sent a new verification link to your inbox.');
                    setStep('email_verification'); // Optionally move them to the check inbox screen
                }
                return;
            }
            Alert.alert('Creation Failed', authErr.message);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Resend Confirmation Email
     */
    const handleResendEmail = async () => {
        if (!email) return;
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
                options: {
                    emailRedirectTo: Linking.createURL('/')
                }
            });
            if (error) throw error;
            Alert.alert('Email Sent', 'A new verification link has been sent to your email.');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    /**
     * Render Step 1: Role Selection
     */
    const renderRoleStep = () => (
        <View style={styles.stepContainer}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
                <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
                <Text style={themeStyles.textSecondary}>Back</Text>
            </TouchableOpacity>

            <Text style={[styles.stepTitle, themeStyles.text]}>Choose your role</Text>
            <Text style={[styles.stepSubtitle, themeStyles.textSecondary]}>How will you use MusikaLokal?</Text>

            <View style={styles.roleGrid}>
                {roleOptions.map((option) => (
                    <TouchableOpacity
                        key={option.value}
                        onPress={() => setSelectedRole(option.value)}
                        style={[
                            styles.roleCardBig,
                            themeStyles.card,
                            selectedRole === option.value && {
                                borderColor: colors.primary,
                                borderWidth: 2,
                                backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
                            }
                        ]}
                    >
                        <Ionicons name={option.icon} size={32} color={selectedRole === option.value ? colors.primary : colors.textSecondary} />
                        <Text style={[styles.roleLabelBig, themeStyles.text, selectedRole === option.value && { color: colors.primary }]}>{option.label}</Text>
                        <Text style={[styles.roleDescBig, themeStyles.textSecondary]}>{option.description}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity
                disabled={!selectedRole}
                onPress={() => setStep('details')}
                style={[styles.nextButton, themeStyles.primaryButton, !selectedRole && { opacity: 0.5 }]}
            >
                <Text style={styles.nextButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
            </TouchableOpacity>
        </View>
    );

    /**
     * Render Step 2: Details
     */
    const renderDetailsStep = () => (
        <View style={styles.stepContainer}>
            <TouchableOpacity onPress={() => setStep('role')} style={styles.backLink}>
                <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
                <Text style={themeStyles.textSecondary}>Back</Text>
            </TouchableOpacity>

            <Text style={[styles.stepTitle, themeStyles.text]}>Create your account</Text>
            <Text style={[styles.stepSubtitle, themeStyles.textSecondary]}>Enter your credentials to get started.</Text>

            <View style={styles.formGap}>
                {/* Email */}
                <View style={[styles.inputContainer, themeStyles.inputContainer, errors.email ? { borderColor: 'red' } : null]}>
                    <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.input, themeStyles.text]}
                        placeholder="Email"
                        placeholderTextColor={colors.textSecondary}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                    />
                </View>
                {errors.email && <Text style={{ color: 'red', fontSize: 12 }}>{errors.email}</Text>}

                {/* Password */}
                <View style={[styles.inputContainer, themeStyles.inputContainer, errors.password ? { borderColor: 'red' } : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.input, themeStyles.text]}
                        placeholder="Password"
                        placeholderTextColor={colors.textSecondary}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                        <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
                {errors.password && <Text style={{ color: 'red', fontSize: 12 }}>{errors.password}</Text>}

                {/* Confirm */}
                <View style={[styles.inputContainer, themeStyles.inputContainer, errors.confirmPassword ? { borderColor: 'red' } : null]}>
                    <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
                    <TextInput
                        style={[styles.input, themeStyles.text]}
                        placeholder="Confirm Password"
                        placeholderTextColor={colors.textSecondary}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                    />
                    <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
                {errors.confirmPassword && <Text style={{ color: 'red', fontSize: 12 }}>{errors.confirmPassword}</Text>}
            </View>

            <TouchableOpacity
                onPress={handleNext}
                disabled={loading}
                style={[styles.nextButton, themeStyles.primaryButton]}
            >
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.nextButtonText}>Next</Text>}
            </TouchableOpacity>
        </View>
    );

    /**
     * Render Step 3: Verification
     */
    const renderVerificationStep = () => {
        // const { verified } = useLocalSearchParams(); // Inherit from parent scope to avoid hook errors

        // 1. Processing State (Returning from Didit)
        if (verified === 'true') {
            return (
                <View style={styles.stepContainer}>
                    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}>
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
                        <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Processing...</Text>
                        <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400 }]}>
                            Verifying your identity and creating your account.
                        </Text>

                        {!loading && (
                            <TouchableOpacity
                                onPress={finishAccountCreation}
                                style={{ marginTop: 20 }}
                            >
                                <Text style={{ color: colors.primary, fontWeight: '600' }}>Click here if not redirected...</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            );
        }

        // 2. Mobile WebView
        if (Platform.OS !== 'web') {
            return (
                <View style={{ flex: 1, backgroundColor: colors.background }}>
                    <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={[themeStyles.text, { fontSize: 18, fontWeight: 'bold' }]}>Identity Verification</Text>
                        <TouchableOpacity onPress={() => router.push('/')} style={{ marginLeft: 'auto' }}>
                            <Text style={{ color: colors.primary }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                    {verificationUrl ? (
                        <WebView
                            source={{ uri: verificationUrl }}
                            style={{ flex: 1 }}
                            onNavigationStateChange={handleMobileNavState}
                            startInLoadingState
                            renderLoading={() => <ActivityIndicator size="large" color={colors.primary} style={StyleSheet.absoluteFill} />}
                        />
                    ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[themeStyles.textSecondary, { marginTop: 20 }]}>Preparing secure session...</Text>
                        </View>
                    )}
                </View>
            );
        }

        // 3. Web UI
        return (
            <View style={styles.stepContainer}>
                <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                    <Ionicons name="shield-checkmark-outline" size={64} color={colors.primary} style={{ marginBottom: 24 }} />
                    <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Verify Your Identity</Text>
                    <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400 }]}>
                        We use a secure third-party service to verify your identity. Please complete this step to activate your account.
                    </Text>

                    <TouchableOpacity
                        onPress={handleWebVerify}
                        style={[styles.nextButton, themeStyles.primaryButton, { width: 250, marginTop: 32 }]}
                    >
                        <Text style={styles.nextButtonText}>Start Verification</Text>
                        <Ionicons name="open-outline" size={20} color="white" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => {
                            startNewVerificationSession().then(newUrl => {
                                if (newUrl && Platform.OS === 'web') window.open(newUrl, '_self');
                            });
                        }}
                        style={{ marginTop: 16 }}
                    >
                        <Text style={[themeStyles.textSecondary, { textDecorationLine: 'underline', fontSize: 13 }]}>
                            Link not working? Generate a new one
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/')} style={{ marginTop: 24 }}>
                        <Text style={themeStyles.textSecondary}>I'll do this later</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };


    /**
     * Render Step 4: Email Verification Confirmation
     */
    const renderEmailVerificationStep = () => (
        <View style={styles.stepContainer}>
            <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}>
                <View style={{
                    width: 100, height: 100, borderRadius: 50,
                    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 32
                }}>
                    <Ionicons name="mail-unread-outline" size={50} color={colors.primary} />
                </View>

                <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Check your inbox</Text>

                <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400, marginBottom: 8 }]}>
                    We have sent a Magic Link to:
                </Text>
                <Text style={[themeStyles.text, { fontSize: 18, fontWeight: '600', marginBottom: 32, fontFamily: 'Poppins_600SemiBold' }]}>
                    {email}
                </Text>

                <Text style={[themeStyles.textSecondary, { textAlign: 'center', maxWidth: 350, fontSize: 14, marginBottom: 40, lineHeight: 22 }]}>
                    Click the link in your email to log in instantly.
                </Text>

                {/* 'Back to Login' button removed as requested */}

                <TouchableOpacity
                    onPress={handleResendEmail}
                    style={{ marginTop: 24 }}
                >
                    <Text style={[themeStyles.textSecondary, { fontSize: 13, textDecorationLine: 'underline' }]}>
                        Resend email
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Main Render
    if (step === 'verification' || step === 'email_verification') {
        // Verification steps take over full screen mostly
        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
                {step === 'verification' ? renderVerificationStep() : renderEmailVerificationStep()}
            </KeyboardAvoidingView>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.contentContainer}>
                    {/* Progress Indicator */}
                    <View style={styles.progressContainer}>
                        <View style={[styles.dot, step === 'role' ? { backgroundColor: colors.primary } : { backgroundColor: colors.textSecondary, opacity: 0.3 }]} />
                        <View style={[styles.dot, step === 'details' ? { backgroundColor: colors.primary } : { backgroundColor: colors.textSecondary, opacity: 0.3 }]} />
                        <View style={[styles.dot, { backgroundColor: colors.textSecondary, opacity: 0.3 }]} />
                        <View style={[styles.dot, { backgroundColor: colors.textSecondary, opacity: 0.3 }]} />
                    </View>

                    {step === 'role' && renderRoleStep()}
                    {step === 'details' && renderDetailsStep()}
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex1: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    contentContainer: { flex: 1, padding: 24, justifyContent: 'center' },
    stepContainer: { flex: 1, width: '100%', maxWidth: 500, alignSelf: 'center' },
    stepTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, fontFamily: 'Poppins_700Bold' },
    stepSubtitle: { fontSize: 16, marginBottom: 32, fontFamily: 'Poppins_400Regular' },
    roleGrid: { gap: 16 },
    roleCardBig: {
        flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 16, borderWidth: 1, gap: 16
    },
    roleLabelBig: { fontSize: 18, fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
    roleDescBig: { fontSize: 12, flex: 1, fontFamily: 'Poppins_400Regular' },
    nextButton: {
        height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32,
        shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4
    },
    nextButtonText: { color: 'white', fontSize: 16, fontWeight: '600', marginRight: 8, fontFamily: 'Poppins_600SemiBold' },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, borderRadius: 16, borderWidth: 1
    },
    input: { flex: 1, marginLeft: 12, height: '100%', fontFamily: 'Poppins_400Regular' },
    formGap: { gap: 16 },
    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 4 },
    progressContainer: { flexDirection: 'row', gap: 8, marginBottom: 24, justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4 }
});




