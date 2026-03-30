
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions, ImageBackground, Image } from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import { useTheme } from '../src/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type OnboardingStep = 'role' | 'details' | 'verification' | 'email_verification';

export default function SignupScreen() {
    const { colors, isDark } = useTheme();

    // State
    // State
    const [step, setStep] = useState<OnboardingStep>('role');
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');
    const isWebDesktop = Platform.OS === 'web' && SCREEN_WIDTH >= 768;
    const [tempSessionRef, setTempSessionRef] = useState('');
    const [sessionId, setSessionId] = useState<string>('');

    const { verified, session_id, check_verification } = useLocalSearchParams<{ verified: string; session_id: string; check_verification: string }>();

    // Form Fields
    const [selectedRole, setSelectedRole] = useState<'musician' | 'venue-owner' | 'studio-owner' | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: AlertType;
        title: string;
        message: string;
        buttons?: any[];
    }>({
        type: 'info',
        title: '',
        message: '',
    });

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
        const lowerTitle = (title || '').toLowerCase();
        let type: AlertType = 'info';
        if (lowerTitle.includes('error') || lowerTitle.includes('failed') || lowerTitle.includes('invalid') || lowerTitle.includes('timeout') || lowerTitle.includes('exists')) {
            type = 'error';
        } else if (lowerTitle.includes('success') || lowerTitle.includes('sent')) {
            type = 'success';
        } else if (lowerTitle.includes('pending') || lowerTitle.includes('processing') || lowerTitle.includes('required') || lowerTitle.includes('verification')) {
            type = 'warning';
        }
        showAlert(type, title || 'Notice', message || '', buttons);
    };

    const Alert = { alert: showAlertNative };

    const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; role?: string }>({});

    // Reset session when email changes
    React.useEffect(() => {
        setVerificationUrl('');
    }, [email]);

    // Restore state on mount if returning from verification
    useEffect(() => {
        if (verified === 'true' || check_verification === 'true') {
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
    }, [verified, check_verification]);

    // Polling System: Automatically check for verification completion
    // This bypasses any redirect issues by detecting status changes in the background
    useEffect(() => {
        let timer: any;
        if (step === 'verification' && verificationUrl && verified !== 'true' && check_verification !== 'true') {
            const poll = async () => {
                const ref = sessionId || tempSessionRef;
                if (!ref) return;
                try {
                    const { data, error } = await supabase.functions.invoke('create-didit-session', {
                        body: { action: 'get_session', session_id: ref }
                    });
                    // Skip if there's an error (FunctionsHttpError) - just retry next poll
                    if (error) return;
                    const s = data?.status || data?.verification_data?.status;
                    // If we detect a final status, manually trigger the completion flow
                    if (['Approved', 'APPROVED', 'Declined', 'DECLINED', 'Abandoned', 'ABANDONED', 'PENDING_REVIEW', 'In Review'].includes(s)) {
                        router.setParams({ check_verification: 'true' });
                    }
                } catch (e: any) {
                    // Silent catch - FunctionsHttpError or network errors are expected during polling
                    // The Didit session may not have a decision yet, which causes 404/500 errors
                    console.log('Poll error (expected during verification):', e?.message || 'unknown');
                }
            };
            timer = setInterval(poll, 500);
        }
        return () => { if (timer) clearInterval(timer); };
    }, [step, verificationUrl, verified, sessionId, tempSessionRef, check_verification]);

    // Auto-submit verification when data is ready and we are in the verification step
    useEffect(() => {
        let mounted = true;
        // Only run if we are in verification step, have all data, and came back from verification
        if (step === 'verification' && email && password && selectedRole && (verified === 'true' || check_verification === 'true')) {
            console.log('Returning from verification. Checking status...');

            const checkAndFinish = async (retries = 0) => {
                const refToCheck = sessionId || tempSessionRef;
                if (!refToCheck) {
                    if (mounted) finishAccountCreation(); // Fallback
                    return;
                }

                try {
                    // Verify the ACTUAL status from Didit/Database
                    const { data: sessionData, error: invokeError } = await supabase.functions.invoke('create-didit-session', {
                        body: { action: 'get_session', session_id: refToCheck }
                    });

                    if (invokeError) throw invokeError;

                    // Check status - supports robust checking of nested data
                    const status = sessionData?.status || sessionData?.verification_data?.status;
                    console.log(`Session Status Check (Attempt ${retries + 1}):`, status);

                    // 1. SUCCESS
                    if (status === 'Approved' || status === 'APPROVED') {
                        if (mounted) finishAccountCreation();
                        return;
                    }

                    // 2. FAILURE (Final) - Show alert and go back to signup form
                    if (['DECLINED', 'Declined', 'ABANDONED', 'Abandoned', 'In Review', 'PENDING_REVIEW'].includes(status)) {
                        setLoading(false);

                        // Clear all verification state
                        setVerificationUrl('');
                        setSessionId('');
                        setTempSessionRef('');
                        await AsyncStorage.removeItem('signup_current_session');
                        router.setParams({ verified: '', check_verification: '' });

                        // Determine the alert message based on status
                        let title = 'Verification Failed';
                        let message = 'Your identity could not be verified. Please try again.';

                        if (status === 'DECLINED' || status === 'Declined') {
                            title = 'Invalid I.D.';
                            message = 'Your I.D. was declined or does not match. Please try again with a valid government-issued I.D.';
                        } else if (status === 'ABANDONED' || status === 'Abandoned') {
                            title = 'Verification Incomplete';
                            message = 'You did not complete the verification process. Please try again.';
                        } else if (status === 'In Review' || status === 'PENDING_REVIEW') {
                            title = 'Verification Pending';
                            message = 'Your verification requires manual review. Please try again later or contact support.';
                        }

                        // Go back to signup form
                        setStep('details');

                        // Show alert AFTER going back
                        Alert.alert(title, message, [{ text: 'OK' }]);
                        return;
                    }

                    // 3. PENDING / RETRY (Created, Submitted, Processing)
                    // Note: We now handle 'In Review' and 'PENDING_REVIEW' in failure case above
                    const maxRetries = 10;
                    if (retries < maxRetries) {
                        console.log('Status not final, retrying...');
                        setTimeout(() => {
                            if (mounted) checkAndFinish(retries + 1);
                        }, 1000); // Wait 1 second between checks
                    } else {
                        // TIMEOUT - Go back to signup form with alert
                        setLoading(false);
                        setVerificationUrl('');
                        setSessionId('');
                        setTempSessionRef('');
                        await AsyncStorage.removeItem('signup_current_session');
                        router.setParams({ verified: '', check_verification: '' });

                        setStep('details');
                        Alert.alert(
                            'Verification Timeout',
                            'We could not confirm your verification status in time. Please try again.',
                            [{ text: 'OK' }]
                        );
                    }

                } catch (e: any) {
                    // Handle FunctionsHttpError gracefully
                    // FunctionsHttpError is thrown when the Edge Function returns non-2xx status
                    let errorStatus = null;
                    let errorMessage = e?.message || 'Unknown error';

                    // Try multiple ways to extract error details
                    try {
                        // Method 1: Check if error has a response body
                        if (e?.context?.body) {
                            const reader = e.context.body.getReader();
                            const result = await reader.read();
                            const text = new TextDecoder().decode(result.value);
                            const errorJson = JSON.parse(text);
                            errorStatus = errorJson?.status || errorJson?.verification_data?.status;
                        }
                    } catch { /* ignore parse errors */ }

                    try {
                        // Method 2: Check if it's a FunctionsHttpError with details in message
                        if (e?.name === 'FunctionsHttpError' && e?.message) {
                            // Sometimes the error message contains JSON
                            const jsonMatch = e.message.match(/\{.*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                errorStatus = parsed?.status || errorStatus;
                            }
                        }
                    } catch { /* ignore parse errors */ }

                    console.log('Status check error (attempt', retries + 1, '):', errorMessage);

                    // If we got a status from error, handle it
                    if (errorStatus && ['DECLINED', 'Declined', 'ABANDONED', 'Abandoned', 'In Review', 'PENDING_REVIEW'].includes(errorStatus)) {
                        setLoading(false);
                        setVerificationUrl('');
                        setSessionId('');
                        setTempSessionRef('');
                        await AsyncStorage.removeItem('signup_current_session');
                        router.setParams({ verified: '', check_verification: '' });

                        let title = 'Verification Failed';
                        let message = 'Please try again.';
                        if (errorStatus === 'DECLINED' || errorStatus === 'Declined') {
                            title = 'Invalid I.D.';
                            message = 'Your I.D. was declined. Please try again with a valid government-issued I.D.';
                        }

                        setStep('details');
                        Alert.alert(title, message, [{ text: 'OK' }]);
                        return;
                    }

                    // Retry on network/function error (FunctionsHttpError is common during initial polling)
                    if (retries < 8) {
                        console.log('Retrying status check in 2 seconds...');
                        setTimeout(() => { if (mounted) checkAndFinish(retries + 1); }, 2000);
                    } else {
                        setLoading(false);
                        Alert.alert(
                            'Connection Error',
                            'Could not connect to verification server. Please tap "I Have Verified" to try again.',
                            [{ text: 'OK' }]
                        );
                    }
                }
            };

            // Start the check loop
            checkAndFinish(0);

            return () => { mounted = false; };
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
        { value: 'musician' as const, label: 'Musical Artist', icon: 'musical-notes-outline' as const, description: 'Join bands, find gigs' },
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

        // NEUTRAL SIGNAL: Don't assume 'verified=true'. Just signal that flow returned.
        let redirectUrl = Linking.createURL('/', { queryParams: { check_verification: 'true' } });

        // WEB FIX: Explicitly use the current window location to ensure we return to this specific page
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('check_verification', 'true');
            // Remove old params if present
            currentUrl.searchParams.delete('verified');
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
        // Intercept redirect and trigger verification check
        if (event.url.includes('check_verification=true') || event.url.includes('musikalokal://')) {
            router.setParams({ check_verification: 'true' });
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
            const { data: sessionData, error: invokeError } = await supabase.functions.invoke('create-didit-session', {
                body: { action: 'get_session', session_id: refToLink }
            });

            if (invokeError) {
                console.warn('Edge Function Invoke Error:', invokeError);
            }

            if (sessionData) {
                diditData = sessionData;
                console.log('Didit Data Fetched (Keys):', Object.keys(sessionData));
                console.log('Derived Data:', JSON.stringify(sessionData.derived));

                if (sessionData?.derived?.fullName) {
                    verifiedName = sessionData.derived.fullName;
                }
            }
        } catch (e) {
            console.log('Could not fetch specific Didit data, proceeding with reference only.', e);
        }

        // Fallback for name if Didit fails
        if (!verifiedName) {
            verifiedName = email.split('@')[0] || 'Musician';
        }

        console.log('Proceeding to Supabase SignUp with Name:', verifiedName);

        try {
            // 3. Create Account
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
                        full_name: verifiedName,
                        display_name: verifiedName,
                        name: verifiedName
                    }
                }
            });

            console.log('SignUp Result:', { user: authData?.user?.id, error: authError });

            if (authError) throw authError;

            if (authData.user) {
                // FORCE CREATE PROFILE (Via Edge Function to Bypass RLS)
                // Use retry mechanism to handle race conditions with auth user propagation
                const createProfileWithRetry = async (retries = 0): Promise<boolean> => {
                    try {
                        const { data: profileData, error: profileError } = await supabase.functions.invoke('manage-profile', {
                            body: {
                                action: 'create',
                                userId: authData.user!.id,
                                email: email.trim(),
                                full_name: verifiedName,
                                display_name: verifiedName,
                                role: selectedRole,
                                is_verified: true,
                                verification_status: 'APPROVED',
                                didit_session_id: refToLink
                            }
                        });

                        if (profileError) {
                            throw profileError;
                        }
                        console.log('Profile created successfully');
                        return true;
                    } catch (profErr: any) {
                        // Silently retry up to 3 times with 1 second delay
                        if (retries < 3) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            return createProfileWithRetry(retries + 1);
                        }
                        // Silent fail - profile will be created on first login
                        return false;
                    }
                };

                await createProfileWithRetry();

                // (Magic Link block removed to ensure strict Account Confirmation flow)
                // The signUp() call above already sends the "Confirm your email" link.


                // Clear the temporary signup session
                try {
                    await AsyncStorage.removeItem('signup_current_session');
                } catch (e) {
                    console.log('Error clearing signup session:', e);
                }

                // SUCCESS: Alert and Redirect to Login
                // SUCCESS: Redirect to Login immediately
                // The Login screen will handle showing the "Email Sent" popup
                router.replace({
                    pathname: '/',
                    params: {
                        accountCreated: 'true',
                        email: email
                    }
                } as any);
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

                if (resendError) {
                    Alert.alert('Account Exists', 'This email is already registered. We tried to resend the verification link but failed. Please log in.');
                } else {
                    Alert.alert('Account Exists', 'This email is already registered. We have sent a new verification link to your inbox.');
                    setStep('email_verification');
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
            <TouchableOpacity activeOpacity={1} onPress={() => router.back()} style={styles.backLink}>
                <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
                <Text style={themeStyles.textSecondary}>Back</Text>
            </TouchableOpacity>

            <Text style={[styles.stepTitle, themeStyles.text]}>Choose your role</Text>
            <Text style={[styles.stepSubtitle, themeStyles.textSecondary]}>How will you use MusikaLokal?</Text>

            <View style={styles.roleGrid}>
                {roleOptions.map((option) => (
                    <TouchableOpacity activeOpacity={1}
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
                activeOpacity={1}
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
            <TouchableOpacity activeOpacity={1} onPress={() => setStep('role')} style={styles.backLink}>
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
                    <TouchableOpacity activeOpacity={1} onPress={() => setShowPassword(!showPassword)}>
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
                    <TouchableOpacity activeOpacity={1} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
                {errors.confirmPassword && <Text style={{ color: 'red', fontSize: 12 }}>{errors.confirmPassword}</Text>}
            </View>

            <TouchableOpacity
                onPress={handleNext}
                disabled={loading}
                activeOpacity={1}
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

        // Helper function to manually check status (used by "Click here" button)
        const manualStatusCheck = async () => {
            setLoading(true);
            const refToCheck = sessionId || tempSessionRef;
            if (!refToCheck) {
                Alert.alert('Error', 'No verification session found. Please try again.');
                setLoading(false);
                setStep('details');
                return;
            }

            try {
                const { data: sessionData } = await supabase.functions.invoke('create-didit-session', {
                    body: { action: 'get_session', session_id: refToCheck }
                });

                const status = sessionData?.status || sessionData?.verification_data?.status;
                console.log('Manual status check result:', status);

                if (status === 'Approved' || status === 'APPROVED') {
                    finishAccountCreation();
                } else if (['DECLINED', 'Declined', 'ABANDONED', 'Abandoned', 'In Review', 'PENDING_REVIEW'].includes(status)) {
                    // Failed - show alert and go back to form
                    setLoading(false);
                    setVerificationUrl('');
                    setSessionId('');
                    setTempSessionRef('');
                    await AsyncStorage.removeItem('signup_current_session');
                    router.setParams({ verified: '', check_verification: '' });

                    let title = 'Invalid I.D.';
                    let message = 'Your I.D. was declined. Please try again with a valid government-issued I.D.';
                    if (status === 'ABANDONED' || status === 'Abandoned') {
                        title = 'Verification Incomplete';
                        message = 'You did not complete the verification. Please try again.';
                    } else if (status === 'In Review' || status === 'PENDING_REVIEW') {
                        title = 'Verification Pending';
                        message = 'Your ID is under review. Please try again later.';
                    }

                    setStep('details');
                    Alert.alert(title, message, [{ text: 'OK' }]);
                } else {
                    // Still processing - let the auto-check continue
                    setLoading(false);
                    Alert.alert('Still Processing', 'Verification is still in progress. Please wait a moment.');
                }
            } catch (e: any) {
                console.warn('Manual status check error:', e?.message || e);
                setLoading(false);
                // More helpful error message for FunctionsHttpError
                const isFunctionError = e?.name === 'FunctionsHttpError' || e?.message?.includes('FunctionsHttpError');
                Alert.alert(
                    'Verification Check Failed',
                    isFunctionError
                        ? 'The verification server is processing your request. Please wait a moment and try again.'
                        : 'Could not check verification status. Please check your connection and try again.',
                    [{ text: 'OK' }]
                );
            }
        };

        // 1. Processing State (Returning from Didit)
        if (verified === 'true' || check_verification === 'true') {
            return (
                <View style={styles.stepContainer}>
                    <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }}>
                        <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 24 }} />
                        <Text style={[styles.stepTitle, themeStyles.text, { textAlign: 'center' }]}>Processing...</Text>
                        <Text style={[styles.stepSubtitle, themeStyles.textSecondary, { textAlign: 'center', maxWidth: 400 }]}>
                            Verifying your identity and creating your account.
                        </Text>

                        {!loading && (
                            <TouchableOpacity activeOpacity={1}
                                onPress={manualStatusCheck}
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
                        <TouchableOpacity activeOpacity={1} onPress={() => router.push('/')} style={{ marginLeft: 'auto' }}>
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
                            onShouldStartLoadWithRequest={(request) => {
                                // INTERCEPTOR: Prevent the broken HTML page from loading
                                // Check for the function URL OR the static storage file
                                if (request.url.includes('verification-redirect') || request.url.includes('verification-v2.html')) {
                                    // We caught the redirect! Stop loading and force success.
                                    router.setParams({ verified: 'true' });
                                    return false;
                                }
                                return true;
                            }}
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

                    <TouchableOpacity activeOpacity={1}
                        onPress={handleWebVerify}
                        style={[styles.nextButton, themeStyles.primaryButton, { width: 250, marginTop: 32 }]}
                    >
                        <Text style={styles.nextButtonText}>Start Verification</Text>
                        <Ionicons name="open-outline" size={20} color="white" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={1}
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

                    <TouchableOpacity activeOpacity={1} onPress={() => router.push('/')} style={{ marginTop: 24 }}>
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

                <TouchableOpacity activeOpacity={1}
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
        // Verification steps take over full screen mostly, but respect split layout on web
        return (
            <>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
                    <ScrollView contentContainerStyle={isWebDesktop ? styles.webScrollContent : styles.scrollContent}>
                        <ImageBackground
                            source={isWebDesktop ? { uri: 'https://images.unsplash.com/photo-1540039155732-68473638c4b0?q=80&w=2070&auto=format&fit=crop' } : undefined}
                            style={isWebDesktop ? { flex: 1, width: '100%' } : {}}
                            imageStyle={isWebDesktop ? {} : { display: 'none' }}
                        >
                        <View style={isWebDesktop ? [styles.webContainer, { backgroundColor: 'transparent' }] : styles.contentContainer}>
                            {/* Left Side Branding (Web Desktop Only) */}
                            {isWebDesktop && (
                                <View style={[styles.webLeftPanel, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                                    <View style={styles.webHeroOverlay}>
                                        <View style={[styles.logoWrapper, styles.shadow, { marginBottom: 32 }]}>
                                            <Image
                                                source={require('../assets/images/Musika-lokal-logo.png')}
                                                style={styles.logoImage}
                                                resizeMode="contain"
                                            />
                                        </View>
                                        <Text style={styles.webHeroTitle}>Join{'\n'}MusikaLokal.</Text>
                                        <Text style={styles.webHeroSubtitle}>Your journey into the local music scene starts here.</Text>
                                    </View>
                                </View>
                            )}

                            {/* Right Side Form */}
                            <View style={isWebDesktop ? [styles.webRightPanel, { backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.85)' }] : null}>
                                <View style={isWebDesktop ? styles.webFormWrapper : null}>
                                    {step === 'verification' ? renderVerificationStep() : renderEmailVerificationStep()}
                                </View>
                            </View>
                        </View>
                    </ImageBackground>
                </ScrollView>
                </KeyboardAvoidingView>
                <CustomAlert
                    visible={alertVisible}
                    type={alertConfig.type}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    buttons={alertConfig.buttons}
                    onClose={() => setAlertVisible(false)}
                />
            </>
        );
    }

    return (
        <>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
                <ScrollView contentContainerStyle={isWebDesktop ? styles.webScrollContent : styles.scrollContent}>
                    <ImageBackground
                        source={isWebDesktop ? { uri: 'https://images.unsplash.com/photo-1540039155732-68473638c4b0?q=80&w=2070&auto=format&fit=crop' } : undefined}
                        style={isWebDesktop ? { flex: 1, width: '100%' } : {}}
                        imageStyle={isWebDesktop ? {} : { display: 'none' }}
                    >
                    <View style={isWebDesktop ? [styles.webContainer, { backgroundColor: 'transparent' }] : styles.contentContainer}>
                        
                        {/* Left Side Branding (Web Desktop Only) */}
                        {isWebDesktop && (
                            <View style={[styles.webLeftPanel, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
                                <View style={styles.webHeroOverlay}>
                                    <View style={[styles.logoWrapper, styles.shadow, { marginBottom: 32 }]}>
                                        <Image
                                            source={require('../assets/images/Musika-lokal-logo.png')}
                                            style={styles.logoImage}
                                            resizeMode="contain"
                                        />
                                    </View>
                                    <Text style={styles.webHeroTitle}>Join{'\n'}MusikaLokal.</Text>
                                    <Text style={styles.webHeroSubtitle}>Your journey into the local music scene starts here.</Text>
                                </View>
                            </View>
                        )}

                        {/* Right Side Form */}
                        <View style={isWebDesktop ? [styles.webRightPanel, { backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.85)' }] : null}>
                            <View style={isWebDesktop ? styles.webFormWrapper : null}>
                                
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
                        </View>
                    </View>
                </ImageBackground>
            </ScrollView>
            </KeyboardAvoidingView>
            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    flex1: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    webScrollContent: { flexGrow: 1, height: '100%' },
    contentContainer: { flex: 1, padding: 24, justifyContent: 'center' },
    webContainer: { flex: 1, flexDirection: 'row' },
    webLeftPanel: { flex: 1, display: 'flex' },
    webHeroImage: { flex: 1, width: '100%', height: '100%' },
    webHeroOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', padding: 64, justifyContent: 'center' },
    webHeroTitle: { color: 'white', fontSize: 48, fontFamily: 'Poppins_700Bold', lineHeight: 56, marginBottom: 16 },
    webHeroSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontFamily: 'Poppins_400Regular', maxWidth: 400, lineHeight: 28 },
    webRightPanel: { flex: 1, maxWidth: 800, justifyContent: 'center', alignItems: 'center', marginHorizontal: 'auto', width: '100%', paddingVertical: 64 },
    webFormWrapper: { width: '100%', maxWidth: 500, paddingHorizontal: 32 },
    logoWrapper: { width: 64, height: 64, borderRadius: 16, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
    logoImage: { width: 40, height: 40 },
    shadow: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    stepContainer: { flex: 1, width: '100%', maxWidth: 500, alignSelf: 'center' },
    stepTitle: { fontSize: 36, fontWeight: 'bold', marginBottom: 12, fontFamily: 'Poppins_700Bold' },
    stepSubtitle: { fontSize: 18, marginBottom: 40, fontFamily: 'Poppins_400Regular' },
    roleGrid: { gap: 20 },
    roleCardBig: {
        flexDirection: 'row', alignItems: 'center', padding: 24, borderRadius: 20, borderWidth: 1, gap: 20
    },
    roleLabelBig: { fontSize: 20, fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
    roleDescBig: { fontSize: 14, flex: 1, fontFamily: 'Poppins_400Regular' },
    nextButton: {
        height: 64, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 40,
        shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4
    },
    nextButtonText: { color: 'white', fontSize: 18, fontWeight: '600', marginRight: 8, fontFamily: 'Poppins_600SemiBold' },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, height: 64, borderRadius: 20, borderWidth: 1
    },
    input: { flex: 1, marginLeft: 16, height: '100%', fontFamily: 'Poppins_400Regular', fontSize: 16 },
    formGap: { gap: 20 },
    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 4 },
    progressContainer: { flexDirection: 'row', gap: 8, marginBottom: 24, justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4 }
});




