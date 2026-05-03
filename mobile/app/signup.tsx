
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import type { DateData } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import BottomModal from '../src/components/BottomModal';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import { showTopToast } from '../src/context/TopToastContext';
import { useTheme } from '../src/context/ThemeContext';

type OnboardingStep = 'details' | 'verification' | 'email_verification';
type SignupRole = 'musician';
type VerificationMode = 'didit' | 'manual';

type DocumentOption = {
    key: string;
    label: string;
    diditSupported: boolean;
    diditDocumentType?: 'passport' | 'id_card' | 'drivers_license';
};

type ManualUploadAsset = {
    base64: string;
    uri: string;
    mimeType: string;
    extension: string;
    fileName: string;
};

type ManualImageTarget = 'front' | 'back' | 'selfie';

const ALLOWED_SIGNUP_ROLES: SignupRole[] = ['musician'];

const PH_DOCUMENT_OPTIONS: DocumentOption[] = [
    { key: 'national_id', label: 'National ID card', diditSupported: true, diditDocumentType: 'id_card' },
    { key: 'passport', label: 'Passport', diditSupported: true, diditDocumentType: 'passport' },
    { key: 'drivers_license', label: 'Driver\'s license', diditSupported: true, diditDocumentType: 'drivers_license' },
    { key: 'health_insurance', label: 'Health Insurance Card', diditSupported: false },
    { key: 'umid', label: 'UMID', diditSupported: false },
    { key: 'postal_id', label: 'Postal ID', diditSupported: false },
    { key: 'voters_id', label: 'Voter\'s ID', diditSupported: false },
    { key: 'prc_id', label: 'PRC ID', diditSupported: false },
    { key: 'other', label: 'Other government ID', diditSupported: false },
];

const getDocumentOptionByKey = (key: string) => {
    return PH_DOCUMENT_OPTIONS.find((option) => option.key === key) ?? PH_DOCUMENT_OPTIONS[0];
};

const getLocalDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatSelectedDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;

    return parsed.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const isAllowedSignupRole = (role: unknown): role is SignupRole => {
    return typeof role === 'string' && ALLOWED_SIGNUP_ROLES.includes(role as SignupRole);
};

const isAdminRole = (role: unknown): boolean => {
    return typeof role === 'string' && role.toLowerCase() === 'admin';
};

const isSupersededVerificationStatus = (status: unknown) => {
    const normalized = String(status || '').trim().toUpperCase();
    return normalized === 'SUPERSEDED' || normalized === 'SUPERSEDED_APPROVED';
};

const createEmailConfirmationRedirectUrl = () => {
    const baseUrl = Linking.createURL('/');
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}verified=true`;
};

const DIDIT_EMAIL_FLOW_LOG_PREFIX = '[DiditEmailFlow]';
const DIDIT_EMAIL_FLOW_DEBUG_VERSION = 'supabase-auth-signup-2026-05-03';

const maskEmailForLog = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) return null;

    const [localPart, domain] = normalized.split('@');
    if (!domain) return normalized;

    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}${localPart.length > 2 ? '***' : '*'}@${domain}`;
};

const summarizeErrorForDiditEmailLog = (error: unknown) => {
    const err = error as any;
    if (!err) return null;

    return {
        name: err.name ?? null,
        message: err.message ?? String(error),
        status: err.status ?? err.statusCode ?? null,
        code: err.code ?? err.error_code ?? null,
        details: err.details ?? null,
        hint: err.hint ?? null,
        rawKeys: typeof err === 'object' ? Object.keys(err) : [],
        contextStatus: err.context?.status ?? null,
        contextStatusText: err.context?.statusText ?? null,
    };
};

const summarizeAuthUserForDiditEmailLog = (user: any) => {
    if (!user) return null;

    return {
        id: user.id ?? null,
        email: maskEmailForLog(user.email),
        aud: user.aud ?? null,
        role: user.role ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        confirmationSentAt: user.confirmation_sent_at ?? null,
        createdAt: user.created_at ?? null,
        identitiesCount: Array.isArray(user.identities) ? user.identities.length : null,
        metadata: {
            role: user.user_metadata?.role ?? null,
            isVerified: user.user_metadata?.is_verified ?? null,
            verificationStatus: user.user_metadata?.verification_status ?? null,
            diditSessionId: user.user_metadata?.didit_session_id ?? null,
        },
    };
};

const diditEmailDeliveryWasAccepted = (emailDelivery: any) => {
    return Boolean(emailDelivery?.sent || emailDelivery?.queued);
};

const getEmailDeliveryFromInvokeError = (error: any) => {
    const responseBody = error?.responseBody;

    if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
        return responseBody.emailDelivery ?? null;
    }

    if (typeof responseBody === 'string') {
        try {
            const parsed = JSON.parse(responseBody);
            return parsed?.emailDelivery ?? null;
        } catch {
            return null;
        }
    }

    return null;
};

const logDiditEmailFlow = (stage: string, payload: Record<string, unknown> = {}) => {
    console.log(`${DIDIT_EMAIL_FLOW_LOG_PREFIX} ${stage}`, {
        debugVersion: DIDIT_EMAIL_FLOW_DEBUG_VERSION,
        ...payload,
    });
};

const logDiditEmailFlowError = (stage: string, error: unknown, payload: Record<string, unknown> = {}) => {
    console.error(`${DIDIT_EMAIL_FLOW_LOG_PREFIX} ${stage}`, {
        debugVersion: DIDIT_EMAIL_FLOW_DEBUG_VERSION,
        ...payload,
        error: summarizeErrorForDiditEmailLog(error),
    });
};

export default function SignupScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();

    // State
    // State
    const [step, setStep] = useState<OnboardingStep>('details');
    const [userId, setUserId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [verificationUrl, setVerificationUrl] = useState('');
    const [tempSessionRef, setTempSessionRef] = useState('');
    const [sessionId, setSessionId] = useState<string>('');
    const [verificationMode, setVerificationMode] = useState<VerificationMode>('didit');
    const [selectedDocumentKey, setSelectedDocumentKey] = useState<string>(PH_DOCUMENT_OPTIONS[0].key);
    const [documentModalVisible, setDocumentModalVisible] = useState(false);
    const [manualFrontImage, setManualFrontImage] = useState<ManualUploadAsset | null>(null);
    const [manualBackImage, setManualBackImage] = useState<ManualUploadAsset | null>(null);
    const [manualSelfieImage, setManualSelfieImage] = useState<ManualUploadAsset | null>(null);
    const [manualFullName, setManualFullName] = useState('');
    const [manualIdExpiration, setManualIdExpiration] = useState('');
    const [manualExpirationCalendarVisible, setManualExpirationCalendarVisible] = useState(false);

    const { verified, session_id, check_verification } = useLocalSearchParams<{ verified: string; session_id: string; check_verification: string }>();

    // Form Fields
    const [selectedRole, setSelectedRole] = useState<SignupRole>('musician');
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

    const isSimpleTopToastButtons = (buttons?: any[]) => {
        if (!buttons || buttons.length === 0) return true;
        if (buttons.length !== 1) return false;

        const onlyButton = buttons[0];
        const normalizedText = String(onlyButton?.text ?? 'OK').trim().toLowerCase();
        const hasNoCallback = !onlyButton?.onPress;
        const isNeutralStyle =
            !onlyButton?.style || onlyButton.style === 'default' || onlyButton.style === 'cancel';

        return (
            hasNoCallback &&
            isNeutralStyle &&
            (normalizedText === 'ok' || normalizedText === 'close' || normalizedText === 'got it')
        );
    };

    const resolveAlertType = (title: string): AlertType => {
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('error') || lowerTitle.includes('failed') || lowerTitle.includes('invalid') || lowerTitle.includes('timeout') || lowerTitle.includes('exists')) {
            return 'error';
        }
        if (lowerTitle.includes('success') || lowerTitle.includes('sent')) {
            return 'success';
        }
        if (lowerTitle.includes('pending') || lowerTitle.includes('processing') || lowerTitle.includes('required') || lowerTitle.includes('verification')) {
            return 'warning';
        }
        return 'info';
    };

    const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
        const normalizedTitle = title || 'Notice';
        const normalizedMessage = message || '';
        const type = resolveAlertType(normalizedTitle);

        if ((type === 'success' || type === 'info') && isSimpleTopToastButtons(buttons)) {
            showTopToast({
                type,
                title: normalizedTitle,
                message: normalizedMessage.trim() ? normalizedMessage : normalizedTitle,
            });
            return;
        }

        showAlert(type, normalizedTitle, normalizedMessage, buttons);
    };

    const Alert = { alert: showAlertNative };

    const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; role?: string; document?: string }>({});
    const selectedDocumentOption = useMemo(() => getDocumentOptionByKey(selectedDocumentKey), [selectedDocumentKey]);
    const safeContentPadding = useMemo(() => ({
        paddingTop: Math.max(24, insets.top + 16),
        paddingBottom: Math.max(24, insets.bottom + 24),
    }), [insets.bottom, insets.top]);
    const safeManualFlowPadding = useMemo(() => ({
        paddingTop: Math.max(16, insets.top + 16),
        paddingBottom: Math.max(28, insets.bottom + 28),
    }), [insets.bottom, insets.top]);
    const safeVerificationHeaderPadding = useMemo(() => ({
        paddingTop: Math.max(16, insets.top + 16),
    }), [insets.top]);
    const safeModalPadding = useMemo(() => ({
        paddingBottom: Math.max(24, insets.bottom + 24),
    }), [insets.bottom]);

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
                        const {
                            email: sEmail,
                            password: sPassword,
                            selectedRole: sRole,
                            tempRef,
                            sSessionId,
                            verificationMode: sVerificationMode,
                            selectedDocumentKey: sSelectedDocumentKey,
                        } = JSON.parse(savedState);
                        if (sEmail) setEmail(sEmail);
                        if (sPassword) setPassword(sPassword);
                        if (isAllowedSignupRole(sRole)) {
                            setSelectedRole(sRole);
                        }
                        if (sVerificationMode === 'didit' || sVerificationMode === 'manual') {
                            setVerificationMode(sVerificationMode);
                        }
                        if (sSelectedDocumentKey) {
                            setSelectedDocumentKey(getDocumentOptionByKey(String(sSelectedDocumentKey)).key);
                        }
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
    }, [verified, check_verification, session_id]);

    // Polling System: Automatically check for verification completion
    // This bypasses any redirect issues by detecting status changes in the background
    useEffect(() => {
        let timer: any;
        if (
            verificationMode === 'didit' &&
            step === 'verification' &&
            verificationUrl &&
            verified !== 'true' &&
            check_verification !== 'true'
        ) {
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
                    if (['Approved', 'APPROVED', 'Declined', 'DECLINED', 'Abandoned', 'ABANDONED', 'PENDING_REVIEW', 'In Review', 'SUPERSEDED', 'SUPERSEDED_APPROVED'].includes(s)) {
                        router.setParams({ check_verification: 'true' });
                    }
                } catch (e: any) {
                    // Silent catch - FunctionsHttpError or network errors are expected during polling
                    // The Didit session may not have a decision yet, which causes 404/500 errors
                }
            };
            timer = setInterval(poll, 500);
        }
        return () => { if (timer) clearInterval(timer); };
    }, [step, verificationUrl, verified, sessionId, tempSessionRef, check_verification, verificationMode]);

    // Auto-submit verification when data is ready and we are in the verification step
    useEffect(() => {
        let mounted = true;
        // Only run if we are in verification step, have all data, and came back from verification
        if (
            verificationMode === 'didit' &&
            step === 'verification' &&
            email &&
            password &&
            selectedRole &&
            (verified === 'true' || check_verification === 'true')
        ) {

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

                    // 1. SUCCESS
                    if (status === 'Approved' || status === 'APPROVED') {
                        if (mounted) finishAccountCreation();
                        return;
                    }

                    if (status === 'In Review' || status === 'PENDING_REVIEW') {
                        if (mounted) {
                            await finishAccountCreationPendingReview(refToCheck);
                        }
                        return;
                    }

                    // 2. FAILURE (Final) - Show alert and go back to signup form
                    if (['DECLINED', 'Declined', 'ABANDONED', 'Abandoned'].includes(status) || isSupersededVerificationStatus(status)) {
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
                        } else if (isSupersededVerificationStatus(status)) {
                            title = 'Verification Link Replaced';
                            message = 'This verification attempt was replaced by a newer one. Please start verification again.';
                        }

                        // Go back to signup form
                        setStep('details');

                        // Show alert AFTER going back
                        Alert.alert(title, message, [{ text: 'OK' }]);
                        return;
                    }

                    // 3. PENDING / RETRY (Created, Submitted, Processing)
                    const maxRetries = 10;
                    if (retries < maxRetries) {
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


                    // If we got a status from error, handle it
                    if (errorStatus && ['In Review', 'PENDING_REVIEW'].includes(errorStatus)) {
                        await finishAccountCreationPendingReview(refToCheck);
                        return;
                    }

                    if (errorStatus && (['DECLINED', 'Declined', 'ABANDONED', 'Abandoned'].includes(errorStatus) || isSupersededVerificationStatus(errorStatus))) {
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
                        } else if (isSupersededVerificationStatus(errorStatus)) {
                            title = 'Verification Link Replaced';
                            message = 'This verification attempt was replaced by a newer one. Please start verification again.';
                        }

                        setStep('details');
                        Alert.alert(title, message, [{ text: 'OK' }]);
                        return;
                    }

                    // Retry on network/function error (FunctionsHttpError is common during initial polling)
                    if (retries < 8) {
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
    }, [step, email, password, selectedRole, verified, check_verification, verificationMode]);

    const [permission, requestPermission] = useCameraPermissions();

    // Auto-start verification session for Mobile when entering verification step
    useEffect(() => {
        let mounted = true;
        if (
            verificationMode === 'didit' &&
            Platform.OS !== 'web' &&
            step === 'verification' &&
            !verificationUrl &&
            verified !== 'true'
        ) {
            // Check permissions first
            if (!permission?.granted) {
                requestPermission().then(response => {
                    if (response.granted && mounted) {
                        // Permissions granted, start session
                        const timer = setTimeout(() => {
                            if (mounted) {
                                startNewVerificationSession().catch(e => undefined);
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
                        startNewVerificationSession().catch(e => undefined);
                    }
                }, 100);
                return () => { clearTimeout(timer); mounted = false; };
            }
        }
        return () => { mounted = false; };
    }, [step, verificationUrl, verified, permission, verificationMode]);


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
    const todayDateString = useMemo(() => getLocalDateInputValue(), []);
    const manualExpirationDateLabel = manualIdExpiration ? formatSelectedDate(manualIdExpiration) : 'Choose date';
    const manualExpirationCalendarCurrent = manualIdExpiration && manualIdExpiration >= todayDateString
        ? manualIdExpiration
        : todayDateString;
    const manualExpirationMarkedDates = useMemo(() => {
        if (!manualIdExpiration) return {};

        return {
            [manualIdExpiration]: {
                selected: true,
                selectedColor: colors.primary,
                selectedTextColor: '#FFFFFF',
            },
        };
    }, [colors.primary, manualIdExpiration]);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isDetailsStepReady =
        isAllowedSignupRole(selectedRole) &&
        emailRegex.test(email.trim()) &&
        password.length >= 6 &&
        password === confirmPassword &&
        Boolean(selectedDocumentOption?.key);
    const isManualReviewReady = !selectedDocumentOption.diditSupported &&
        Boolean(manualFrontImage) &&
        Boolean(manualBackImage) &&
        Boolean(manualSelfieImage) &&
        Boolean(manualFullName.trim()) &&
        Boolean(manualIdExpiration.trim());

    const handleDocumentSelect = (documentKey: string) => {
        setSelectedDocumentKey(documentKey);
        setDocumentModalVisible(false);
        if (errors.document) {
            setErrors((prev) => ({ ...prev, document: undefined }));
        }
    };

    const handleManualExpirationSelect = (day: DateData) => {
        if (day.dateString < todayDateString) {
            Alert.alert('Expired ID', 'Please choose an ID expiration date that is today or later.');
            return;
        }

        setManualIdExpiration(day.dateString);
        setManualExpirationCalendarVisible(false);
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
                email,
                password,
                selectedRole,
                tempRef,
                verificationMode,
                selectedDocumentKey,
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
                    document_type: selectedDocumentOption?.diditDocumentType || 'id_card',
                    redirect_url: redirectUrl // Tells the edge function where to eventually send the user
                }
            });

            if (error) throw error;
            if (!data?.verificationUrl) throw new Error('No verification URL returned');

            // Save the ACTUAL Didit Session ID
            const createdSessionId = data.sessionId || data.id;
            if (createdSessionId) {
                setSessionId(createdSessionId);
                // Update storage with the real ID
                try {
                    await AsyncStorage.setItem('signup_current_session', JSON.stringify({
                        email,
                        password,
                        selectedRole,
                        tempRef,
                        verificationMode,
                        selectedDocumentKey,
                        sSessionId: createdSessionId,
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

    const saveManualImage = (target: ManualImageTarget, asset: ManualUploadAsset) => {
        if (target === 'front') {
            setManualFrontImage(asset);
            return;
        }

        if (target === 'back') {
            setManualBackImage(asset);
            return;
        }

        setManualSelfieImage(asset);
    };

    const normalizeManualImageAsset = (asset: ImagePicker.ImagePickerAsset, target: ManualImageTarget): ManualUploadAsset | null => {
        if (!asset.base64) {
            return null;
        }

        const uri = asset.uri || '';
        const inferredExtension = uri.split('.').pop()?.toLowerCase() || 'jpg';
        const extension = inferredExtension === 'jpeg' ? 'jpg' : inferredExtension;
        const mimeType = asset.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`;

        return {
            base64: asset.base64,
            uri,
            mimeType,
            extension,
            fileName: (asset as any)?.fileName || `${target}.${extension}`,
        };
    };

    const pickManualImage = async (target: ManualImageTarget) => {
        try {
            if (Platform.OS !== 'web') {
                const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (permissionResult.status !== 'granted') {
                    Alert.alert('Permission Required', 'Please allow photo access to upload your ID images.');
                    return;
                }
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
                base64: true,
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const asset = result.assets[0];
            const normalized = normalizeManualImageAsset(asset, target);
            if (!normalized) {
                Alert.alert('Upload Failed', 'Could not read the selected image. Please try another file.');
                return;
            }

            saveManualImage(target, normalized);
        } catch (err: any) {
            console.error('Manual image picker error:', err);
            Alert.alert('Upload Failed', err?.message || 'Unable to select image.');
        }
    };

    const captureManualImage = async (target: ManualImageTarget) => {
        try {
            if (Platform.OS === 'web') {
                await pickManualImage(target);
                return;
            }

            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (permissionResult.status !== 'granted') {
                Alert.alert('Permission Required', 'Please allow camera access to capture your ID images.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
                base64: true,
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const normalized = normalizeManualImageAsset(result.assets[0], target);
            if (!normalized) {
                Alert.alert('Capture Failed', 'Could not read the captured image. Please try again.');
                return;
            }

            saveManualImage(target, normalized);
        } catch (err: any) {
            console.error('Manual camera capture error:', err);
            Alert.alert('Capture Failed', err?.message || 'Unable to capture image.');
        }
    };

    const finishAccountCreationPendingReview = async (refToLink?: string) => {
        if (!email || !password || !selectedRole) {
            Alert.alert('Session Reset', 'Please re-enter your details to continue signup.');
            setStep('details');
            return;
        }

        if (!isAllowedSignupRole(selectedRole) || isAdminRole(selectedRole)) {
            Alert.alert('Unsupported Account Type', 'Only musician accounts can be registered right now.');
            setStep('details');
            return;
        }

        setLoading(true);

        const fallbackName = email.split('@')[0] || 'Musician';

        try {
            const emailRedirectTo = createEmailConfirmationRedirectUrl();
            const { error: pendingSignupError } = await supabase.functions.invoke('create-unverified-user', {
                body: {
                    email: email.trim(),
                    password,
                    role: selectedRole,
                    fullName: fallbackName,
                    isVerified: false,
                    verificationStatus: 'PENDING_REVIEW',
                    diditSessionId: refToLink || null,
                    selectedDocumentType: selectedDocumentOption.label,
                    verificationMode: 'didit',
                    redirectTo: emailRedirectTo,
                },
            });

            if (pendingSignupError) {
                console.error('create-unverified-user didit pending failed', {
                    message: pendingSignupError.message,
                    status: (pendingSignupError as any).status,
                    code: (pendingSignupError as any).code,
                    details: (pendingSignupError as any).details,
                    hint: (pendingSignupError as any).hint,
                    context: (pendingSignupError as any).context,
                });
                throw pendingSignupError;
            }

            try {
                await AsyncStorage.removeItem('signup_current_session');
            } catch {
            }

            setVerificationUrl('');
            setSessionId('');
            setTempSessionRef('');
            router.setParams({ verified: '', check_verification: '' });

            router.replace({
                pathname: '/',
                params: {
                    accountCreated: 'true',
                    email,
                    diditPendingReview: 'true',
                },
            } as any);
        } catch (authErr: any) {
            Alert.alert('Creation Failed', authErr?.message || 'Unable to create your account right now.');
        } finally {
            setLoading(false);
        }
    };

    const submitManualReviewSignup = async () => {
        if (selectedDocumentOption.diditSupported) {
            Alert.alert('Supported ID', 'This document is supported by Didit. Please continue with automatic verification.');
            return;
        }

        if (!manualFrontImage) {
            Alert.alert('Upload Required', 'Please upload the front photo of your ID to continue.');
            return;
        }

        if (!manualBackImage) {
            Alert.alert('Upload Required', 'Please upload the back photo of your ID to continue.');
            return;
        }

        if (!manualSelfieImage) {
            Alert.alert('Upload Required', 'Please upload a selfie holding your ID to continue.');
            return;
        }

        const enteredFullName = manualFullName.trim();
        const enteredIdExpiration = manualIdExpiration.trim();
        const expirationDate = new Date(`${enteredIdExpiration}T00:00:00Z`);

        if (!enteredFullName) {
            Alert.alert('Name Required', 'Please enter the full name shown on your ID.');
            return;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(enteredIdExpiration) || Number.isNaN(expirationDate.getTime()) || expirationDate.toISOString().slice(0, 10) !== enteredIdExpiration) {
            Alert.alert('Invalid Expiration Date', 'Please enter the ID expiration date in YYYY-MM-DD format.');
            return;
        }

        if (enteredIdExpiration < getLocalDateInputValue()) {
            Alert.alert('Expired ID', 'Please choose an ID expiration date that is today or later.');
            return;
        }

        if (!email || !password || !selectedRole) {
            Alert.alert('Session Reset', 'Please go back and complete your signup details first.');
            setStep('details');
            return;
        }

        setLoading(true);

        try {
            const { error: manualSubmitError } = await supabase.functions.invoke('manual-identity-review', {
                body: {
                    action: 'submit_manual_review_signup',
                    email: email.trim(),
                    password,
                    role: selectedRole,
                    fullName: enteredFullName,
                    idDocumentExpiry: enteredIdExpiration,
                    documentType: selectedDocumentOption.label,
                    documentTypeKey: selectedDocumentOption.key,
                    documentCountry: 'PHL',
                    frontImage: manualFrontImage,
                    backImage: manualBackImage,
                    selfieImage: manualSelfieImage,
                },
            });

            if (manualSubmitError) {
                console.error('manual-identity-review failed', {
                    message: manualSubmitError.message,
                    status: (manualSubmitError as any).status,
                    code: (manualSubmitError as any).code,
                    details: (manualSubmitError as any).details,
                    hint: (manualSubmitError as any).hint,
                    context: (manualSubmitError as any).context,
                });
                throw manualSubmitError;
            }

            try {
                await AsyncStorage.removeItem('signup_current_session');
            } catch (storageError) {
            }

            router.replace({
                pathname: '/',
                params: {
                    accountCreated: 'true',
                    email,
                    verificationPendingReview: 'true',
                },
            } as any);
        } catch (authErr: any) {
            if (authErr?.message?.includes('already registered') || authErr?.status === 422) {
                Alert.alert('Account Exists', 'This email is already registered. Please log in to continue.');
                return;
            }

            Alert.alert('Manual Review Failed', authErr?.message || 'Unable to submit your manual review request.');
        } finally {
            setLoading(false);
        }
    };

    const handleNext = async () => {
        setErrors({});
        const newErrors: any = {};

        if (!isAllowedSignupRole(selectedRole)) {
            setErrors({ role: 'Please select a valid account type.' });
            Alert.alert('Unsupported Account Type', 'Only musician accounts can be registered right now.');
            setStep('details');
            return;
        }

        // Basic Validation
        if (!email) newErrors.email = 'Required';
        else if (!emailRegex.test(email)) newErrors.email = 'Invalid email';

        if (!password) {
            newErrors.password = 'Required';
        } else if (password.length < 6) {
            newErrors.password = 'Min 6 characters';
        }

        if (!selectedDocumentOption?.key) {
            newErrors.document = 'Please select an ID type';
        }

        if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            const issues = Object.entries(newErrors).map(([field, message]) => {
                const label =
                    field === 'confirmPassword'
                        ? 'Confirm password'
                        : field.charAt(0).toUpperCase() + field.slice(1);
                return `${label}: ${message}`;
            });
            Alert.alert(
                'Required Fields',
                `Please fix the following before continuing:\n- ${issues.join('\n- ')}`,
            );
            return;
        }

        setLoading(true);

        try {
            // Check if profile exists (optional, nice to have to prevent dupe emails early)
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, is_verified, role, verification_status')
                .eq('email', email.trim())
                .maybeSingle();

            if (isAdminRole(profile?.role)) {
                Alert.alert('Unsupported Account Type', 'Admin accounts cannot be used in the mobile app.');
                setLoading(false);
                return;
            }

            if (profile) {
                const existingStatus = String((profile as any).verification_status || '').trim().toUpperCase();
                const canRetryVerification = ['DECLINED', 'ABANDONED'].includes(existingStatus);

                if (profile.is_verified) {
                    Alert.alert('Account Exists', 'This email is already registered and verified. Please login.', [{ text: 'Login', onPress: () => router.push('/') }]);
                    setLoading(false);
                    return;
                }

                if (!canRetryVerification) {
                    Alert.alert('Account Exists', 'This email is already registered. Please login to continue verification.', [{ text: 'Login', onPress: () => router.push('/') }]);
                    setLoading(false);
                    return;
                }
            }

            if (selectedDocumentOption.diditSupported) {
                setVerificationMode('didit');
                setManualFrontImage(null);
                setManualBackImage(null);
                setManualSelfieImage(null);
            } else {
                setVerificationMode('manual');
                setVerificationUrl('');
                setSessionId('');
                setTempSessionRef('');
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
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'missing_signup_state',
                hasEmail: Boolean(email),
                hasPassword: Boolean(password),
                hasSelectedRole: Boolean(selectedRole),
                platform: Platform.OS,
            });
            Alert.alert('Session Reset', 'Please re-enter your details to finish creating your account.', [{
                text: 'OK', onPress: () => {
                    router.setParams({ verified: '' });
                    setStep('details');
                }
            }]);
            return;
        }

        if (!isAllowedSignupRole(selectedRole) || isAdminRole(selectedRole)) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'unsupported_role',
                selectedRole,
                platform: Platform.OS,
            });
            Alert.alert('Unsupported Account Type', 'Only musician accounts can be registered right now.');
            setStep('details');
            return;
        }

        // 2. Security Check: Validate the verification result on the server
        const refToLink = sessionId || tempSessionRef || verificationUrl.split('reference=')[1]?.split('&')[0];

        logDiditEmailFlow('finishAccountCreation.start', {
            email: maskEmailForLog(email),
            selectedRole,
            verificationMode,
            documentType: selectedDocumentOption.label,
            documentTypeKey: selectedDocumentOption.key,
            diditSessionId: refToLink ?? null,
            sessionIdState: sessionId || null,
            tempSessionRefState: tempSessionRef || null,
            hasVerificationUrl: Boolean(verificationUrl),
            platform: Platform.OS,
        });

        if (!refToLink) {
            logDiditEmailFlow('finishAccountCreation.blocked', {
                reason: 'missing_didit_session',
                email: maskEmailForLog(email),
                sessionIdState: sessionId || null,
                tempSessionRefState: tempSessionRef || null,
                verificationUrlContainsReference: verificationUrl.includes('reference='),
                platform: Platform.OS,
            });
            Alert.alert('Verification Error', 'No verification session found. Please try confirming your identity again.');
            return;
        }

        setLoading(true);

        // Fetch Didit Data via Edge Function
        let verifiedName = '';
        let verifiedNameSource: 'didit' | 'email_fallback' = 'email_fallback';
        try {
            logDiditEmailFlow('didit.getSession.start', {
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                platform: Platform.OS,
            });

            const { data: sessionData, error: invokeError } = await supabase.functions.invoke('create-didit-session', {
                body: { action: 'get_session', session_id: refToLink }
            });

            if (invokeError) {
                logDiditEmailFlowError('didit.getSession.invokeError', invokeError, {
                    diditSessionId: refToLink,
                    email: maskEmailForLog(email),
                    platform: Platform.OS,
                });
            }

            if (sessionData) {
                const diditSessionForLog = sessionData as any;
                logDiditEmailFlow('didit.getSession.result', {
                    diditSessionId: refToLink,
                    email: maskEmailForLog(email),
                    sessionKeys: typeof sessionData === 'object' ? Object.keys(sessionData as Record<string, unknown>) : [],
                    status: diditSessionForLog.status ?? null,
                    decision: diditSessionForLog.decision ?? null,
                    verificationStatus: diditSessionForLog.verification_status ?? null,
                    hasDerivedFullName: Boolean(diditSessionForLog.derived?.fullName),
                    platform: Platform.OS,
                });

                if (sessionData?.derived?.fullName) {
                    verifiedName = sessionData.derived.fullName;
                    verifiedNameSource = 'didit';
                }
            }
        } catch (e: any) {
            logDiditEmailFlowError('didit.getSession.exception', e, {
                diditSessionId: refToLink,
                email: maskEmailForLog(email),
                platform: Platform.OS,
            });
        }

        // Fallback for name if Didit fails
        if (!verifiedName) {
            verifiedName = email.split('@')[0] || 'Musician';
        }

        logDiditEmailFlow('verifiedName.resolved', {
            email: maskEmailForLog(email),
            source: verifiedNameSource,
            hasVerifiedName: Boolean(verifiedName),
            platform: Platform.OS,
        });

        try {
            // 3. Create the auth user/profile through the signup Edge Function.
            // Direct supabase.auth.signUp() hard-fails when the project SMTP
            // provider rejects confirmation email delivery.
            const emailRedirectTo = createEmailConfirmationRedirectUrl();
            logDiditEmailFlow('auth.edgeSignup.start', {
                email: maskEmailForLog(email),
                selectedRole,
                verificationMode,
                diditSessionId: refToLink,
                documentType: selectedDocumentOption.label,
                documentTypeKey: selectedDocumentOption.key,
                redirectTo: emailRedirectTo,
                payloadPreview: {
                    role: selectedRole,
                    verification_status: 'APPROVED',
                    is_verified: true,
                    didit_session_id: refToLink,
                    selected_document_type: selectedDocumentOption.label,
                    verification_mode: verificationMode,
                    hasFullName: Boolean(verifiedName),
                },
                platform: Platform.OS,
            });

            const { data: signupData, error: signupError } = await supabase.functions.invoke('create-unverified-user', {
                body: {
                    email: email.trim(),
                    password,
                    role: selectedRole,
                    fullName: verifiedName,
                    isVerified: true,
                    verificationStatus: 'APPROVED',
                    diditSessionId: refToLink,
                    selectedDocumentType: selectedDocumentOption.label,
                    verificationMode,
                    redirectTo: emailRedirectTo,
                },
            });

            const signupUser = (signupData as any)?.user;
            const emailDelivery = (signupData as any)?.emailDelivery;

            logDiditEmailFlow('auth.edgeSignup.result', {
                email: maskEmailForLog(email),
                diditSessionId: refToLink,
                hasError: Boolean(signupError),
                error: summarizeErrorForDiditEmailLog(signupError),
                user: summarizeAuthUserForDiditEmailLog(signupUser),
                emailDelivery: emailDelivery
                    ? {
                        sent: Boolean(emailDelivery.sent),
                        queued: Boolean(emailDelivery.queued),
                        provider: emailDelivery.provider ?? null,
                        hasError: Boolean(emailDelivery.error),
                        hasSupabaseAuthError: Boolean(emailDelivery.supabaseAuthError),
                        hasResendError: Boolean(emailDelivery.resendError),
                    }
                    : null,
                platform: Platform.OS,
            });

            if (signupError) {
                logDiditEmailFlowError('auth.edgeSignup.error', signupError, {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    redirectTo: emailRedirectTo,
                    platform: Platform.OS,
                });
                throw signupError;
            }

            if (signupUser) {
                logDiditEmailFlow('profile.create.final', {
                    profileCreated: true,
                    source: 'create-unverified-user',
                    userId: signupUser.id,
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    platform: Platform.OS,
                });

                // Clear the temporary signup session
                try {
                    logDiditEmailFlow('signupSession.cleanup.start', {
                        storageKey: 'signup_current_session',
                        email: maskEmailForLog(email),
                        platform: Platform.OS,
                    });
                    await AsyncStorage.removeItem('signup_current_session');
                } catch (e) {
                    logDiditEmailFlowError('signupSession.cleanup.error', e, {
                        storageKey: 'signup_current_session',
                        email: maskEmailForLog(email),
                        platform: Platform.OS,
                    });
                }

                // SUCCESS: Alert and Redirect to Login
                // SUCCESS: Redirect to Login immediately
                // The Login screen will handle showing the "Email Sent" popup
                logDiditEmailFlow('redirect.login.start', {
                    accountCreated: true,
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    platform: Platform.OS,
                });
                router.replace({
                    pathname: '/',
                    params: {
                        accountCreated: 'true',
                        email: email,
                        diditVerified: 'true',
                    }
                } as any);
            } else {
                logDiditEmailFlow('auth.edgeSignup.noUser', {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    emailDeliveryAccepted: diditEmailDeliveryWasAccepted(emailDelivery),
                    platform: Platform.OS,
                });
            }

        } catch (authErr: any) {
            logDiditEmailFlowError('finishAccountCreation.catch', authErr, {
                email: maskEmailForLog(email),
                diditSessionId: refToLink,
                platform: Platform.OS,
            });
            // Handle "User already registered" specifically
            if (authErr?.message?.includes('already registered') || authErr?.status === 422) {
                logDiditEmailFlow('auth.signUp.accountAlreadyRegistered', {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    status: authErr?.status ?? null,
                    platform: Platform.OS,
                });

                const resendRedirectTo = createEmailConfirmationRedirectUrl();
                logDiditEmailFlow('auth.resendExisting.start', {
                    email: maskEmailForLog(email),
                    diditSessionId: refToLink,
                    redirectTo: resendRedirectTo,
                    provider: 'create-unverified-user',
                    platform: Platform.OS,
                });

                const { data: resendData, error: resendError } = await supabase.functions.invoke('create-unverified-user', {
                    body: {
                        action: 'resend_confirmation_email',
                        email: email.trim(),
                        redirectTo: resendRedirectTo,
                    },
                });

                const emailDelivery = (resendData as any)?.emailDelivery;
                const errorEmailDelivery = getEmailDeliveryFromInvokeError(resendError);
                if (resendError && !diditEmailDeliveryWasAccepted(errorEmailDelivery)) {
                    logDiditEmailFlowError('auth.resendExisting.error', resendError, {
                        email: maskEmailForLog(email),
                        diditSessionId: refToLink,
                        redirectTo: resendRedirectTo,
                        platform: Platform.OS,
                    });
                    Alert.alert('Account Exists', 'This email is already registered. We tried to resend the verification link but failed. Please log in.');
                } else {
                    logDiditEmailFlow('auth.resendExisting.success', {
                        email: maskEmailForLog(email),
                        diditSessionId: refToLink,
                        redirectTo: resendRedirectTo,
                        emailDelivery: (emailDelivery ?? errorEmailDelivery)
                            ? {
                                sent: Boolean((emailDelivery ?? errorEmailDelivery).sent),
                                queued: Boolean((emailDelivery ?? errorEmailDelivery).queued),
                                provider: (emailDelivery ?? errorEmailDelivery).provider ?? null,
                            }
                            : null,
                        platform: Platform.OS,
                    });
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
        if (!email) {
            logDiditEmailFlow('auth.resendManual.blocked', {
                reason: 'missing_email',
                platform: Platform.OS,
            });
            return;
        }

        const emailRedirectTo = createEmailConfirmationRedirectUrl();
        logDiditEmailFlow('auth.resendManual.start', {
            email: maskEmailForLog(email),
            redirectTo: emailRedirectTo,
            type: 'signup',
            platform: Platform.OS,
        });

        try {
            const { data, error } = await supabase.functions.invoke('create-unverified-user', {
                body: {
                    action: 'resend_confirmation_email',
                    email: email.trim(),
                    redirectTo: emailRedirectTo,
                },
            });
            const emailDelivery = (data as any)?.emailDelivery;
            const errorEmailDelivery = getEmailDeliveryFromInvokeError(error);
            logDiditEmailFlow('auth.resendManual.result', {
                email: maskEmailForLog(email),
                hasError: Boolean(error),
                error: summarizeErrorForDiditEmailLog(error),
                emailDelivery: (emailDelivery ?? errorEmailDelivery)
                    ? {
                        sent: Boolean((emailDelivery ?? errorEmailDelivery).sent),
                        queued: Boolean((emailDelivery ?? errorEmailDelivery).queued),
                        provider: (emailDelivery ?? errorEmailDelivery).provider ?? null,
                    }
                    : null,
                redirectTo: emailRedirectTo,
                platform: Platform.OS,
            });

            if (error && !diditEmailDeliveryWasAccepted(errorEmailDelivery)) {
                logDiditEmailFlowError('auth.resendManual.error', error, {
                    email: maskEmailForLog(email),
                    redirectTo: emailRedirectTo,
                    platform: Platform.OS,
                });
                throw error;
            }
            Alert.alert('Email Sent', 'A new verification link has been sent to your email.');
        } catch (e: any) {
            logDiditEmailFlowError('auth.resendManual.catch', e, {
                email: maskEmailForLog(email),
                redirectTo: emailRedirectTo,
                platform: Platform.OS,
            });
            Alert.alert('Error', e.message);
        }
    };

    /**
     * Render Step 2: Details
     */
    const renderDetailsStep = () => (
        <View style={styles.stepContainer}>
            <TouchableOpacity activeOpacity={1} onPress={() => router.back()} style={styles.backLink}>
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

                <View style={styles.documentSectionContainer}>
                    <Text style={[styles.documentSectionTitle, themeStyles.text]}>Select your ID type (Philippines)</Text>
                    <Text style={[styles.documentSectionSubtitle, themeStyles.textSecondary]}>
                        Supported IDs continue with Didit. Unsupported IDs can be uploaded manually for admin review (5-7 business days).
                    </Text>

                    <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => setDocumentModalVisible(true)}
                        style={[styles.documentSelectButton, themeStyles.inputContainer, errors.document ? { borderColor: 'red' } : null]}
                    >
                        <Ionicons name="id-card-outline" size={20} color={colors.textSecondary} />
                        <View style={styles.documentSelectCopy}>
                            <Text style={[styles.documentSelectValue, themeStyles.text]}>{selectedDocumentOption.label}</Text>
                            <Text
                                style={[
                                    styles.documentSelectionMeta,
                                    { color: selectedDocumentOption.diditSupported ? '#16A34A' : '#D97706' },
                                ]}
                            >
                                {selectedDocumentOption.diditSupported ? 'Auto verification' : 'Manual review'}
                            </Text>
                        </View>
                        <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {errors.document ? <Text style={{ color: 'red', fontSize: 12 }}>{errors.document}</Text> : null}
                </View>
            </View>

            <TouchableOpacity
                onPress={handleNext}
                disabled={loading || !isDetailsStepReady}
                activeOpacity={1}
                style={[
                    styles.nextButton,
                    { backgroundColor: isDetailsStepReady ? colors.primary : (isDark ? '#374151' : '#E5E7EB') },
                    !isDetailsStepReady ? styles.nextButtonDisabled : null,
                ]}
            >
                {loading ? <ActivityIndicator color="white" /> : <Text style={[styles.nextButtonText, { color: isDetailsStepReady ? "white" : colors.textSecondary }]}>Next</Text>}
            </TouchableOpacity>

            <BottomModal
                visible={documentModalVisible}
                onClose={() => setDocumentModalVisible(false)}
                closeOnBackdropPress
            >
                    <View style={[styles.documentModalSheet, safeModalPadding, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View
                            style={[
                                styles.documentModalHandle,
                                { backgroundColor: isDark ? "#4B5563" : "#E5E7EB" },
                            ]}
                        />
                        <View style={[styles.documentModalHeader, { borderBottomColor: colors.border }]}>
                            <View style={styles.documentModalHeaderCopy}>
                                <Text style={[styles.documentModalTitle, themeStyles.text]}>Select ID type</Text>
                                <Text style={[styles.documentModalSubtitle, themeStyles.textSecondary]}>
                                    Choose the government ID you will use for verification.
                                </Text>
                            </View>
                            <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => setDocumentModalVisible(false)}
                                style={[
                                    styles.documentModalCloseButton,
                                    { backgroundColor: colors.card, borderColor: colors.border },
                                ]}
                            >
                                <Ionicons name="close" size={18} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            style={styles.documentModalBody}
                            contentContainerStyle={styles.documentModalList}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="always"
                        >
                            {PH_DOCUMENT_OPTIONS.map((option) => {
                                const selected = selectedDocumentKey === option.key;
                                return (
                                    <TouchableOpacity
                                        key={option.key}
                                        activeOpacity={1}
                                        onPress={() => handleDocumentSelect(option.key)}
                                        style={[
                                            styles.documentModalOption,
                                            {
                                                backgroundColor: selected ? (isDark ? 'rgba(37, 99, 235, 0.16)' : 'rgba(37, 99, 235, 0.08)') : (isDark ? '#111827' : '#F9FAFB'),
                                                borderColor: selected ? colors.primary : (isDark ? '#374151' : '#E5E7EB'),
                                            },
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.documentModalOptionIcon,
                                                { backgroundColor: option.diditSupported ? 'rgba(22, 163, 74, 0.10)' : 'rgba(217, 119, 6, 0.10)' },
                                            ]}
                                        >
                                            <Ionicons
                                                name={option.diditSupported ? 'shield-checkmark-outline' : 'document-text-outline'}
                                                size={18}
                                                color={option.diditSupported ? '#16A34A' : '#D97706'}
                                            />
                                        </View>
                                        <View style={styles.documentModalOptionCopy}>
                                            <Text style={[styles.documentModalOptionTitle, themeStyles.text]}>{option.label}</Text>
                                            <Text
                                                style={[
                                                    styles.documentModalOptionMeta,
                                                    { color: option.diditSupported ? '#16A34A' : '#D97706' },
                                                ]}
                                            >
                                                {option.diditSupported ? 'Auto verification' : 'Manual review'}
                                            </Text>
                                        </View>
                                        <View style={styles.documentModalOptionCheck}>
                                            {selected ? <Ionicons name="checkmark-circle" size={24} color={colors.primary} /> : null}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
            </BottomModal>
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

                if (status === 'Approved' || status === 'APPROVED') {
                    finishAccountCreation();
                } else if (status === 'In Review' || status === 'PENDING_REVIEW') {
                    await finishAccountCreationPendingReview(refToCheck);
                    return;
                } else if (['DECLINED', 'Declined', 'ABANDONED', 'Abandoned'].includes(status) || isSupersededVerificationStatus(status)) {
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
                    } else if (isSupersededVerificationStatus(status)) {
                        title = 'Verification Link Replaced';
                        message = 'This verification attempt was replaced by a newer one. Please start verification again.';
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

        if (verificationMode === 'manual') {
            const renderManualAsset = (
                label: string,
                asset: ManualUploadAsset | null,
                target: ManualImageTarget,
                icon: keyof typeof Ionicons.glyphMap = 'image-outline',
            ) => (
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => void pickManualImage(target)}
                    style={[styles.manualUploadCard, themeStyles.inputContainer]}
                >
                    <View style={[styles.manualUploadIcon, { backgroundColor: isDark ? '#111827' : '#EEF2FF' }]}>
                        <Ionicons name={icon as any} size={20} color={colors.primary} />
                    </View>

                    <View style={styles.manualUploadCopy}>
                        <View style={styles.manualUploadTitleRow}>
                            <Text style={[styles.manualUploadTitle, themeStyles.text]}>{label}</Text>
                        </View>

                        {asset ? (
                            <View style={styles.manualPreviewRow}>
                                <Image source={{ uri: asset.uri }} style={styles.manualPreviewImage} resizeMode="cover" />
                                <View style={styles.manualPreviewCopy}>
                                    <Text numberOfLines={1} style={[styles.manualUploadFileName, themeStyles.text]}>{asset.fileName}</Text>
                                    <Text style={[styles.manualUploadSubtitle, themeStyles.textSecondary]}>Use camera or gallery to replace</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[styles.manualUploadPlaceholder, themeStyles.textSecondary]}>Capture or upload document image</Text>
                        )}
                    </View>

                    <View style={styles.manualUploadActionGroup}>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => void captureManualImage(target)}
                            style={[styles.manualUploadAction, { backgroundColor: colors.primary }]}
                            accessibilityLabel={`Capture ${label}`}
                        >
                            <Ionicons name="camera-outline" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => void pickManualImage(target)}
                            style={[styles.manualUploadAction, { backgroundColor: asset ? (isDark ? '#334155' : '#F3F4F6') : colors.primary }]}
                            accessibilityLabel={`Upload ${label}`}
                        >
                            <Ionicons name={asset ? 'swap-horizontal-outline' : 'cloud-upload-outline'} size={16} color={asset ? colors.text : '#FFFFFF'} />
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            );

            return (
                <View style={styles.stepContainer}>
                    <ScrollView contentContainerStyle={[styles.manualFlowContainer, safeManualFlowPadding]} showsVerticalScrollIndicator={false}>
                        <TouchableOpacity activeOpacity={1} onPress={() => setStep('details')} style={styles.backLink}>
                            <Ionicons name="arrow-back" size={20} color={colors.textSecondary} />
                            <Text style={themeStyles.textSecondary}>Back</Text>
                        </TouchableOpacity>

                        <View style={[styles.manualReviewIntroCard, themeStyles.card]}>
                            <View style={[styles.manualReviewIntroIcon, { backgroundColor: `${colors.primary}1A` }]}>
                                <Ionicons name="id-card-outline" size={26} color={colors.primary} />
                            </View>
                            <View style={styles.manualReviewIntroCopy}>
                                <Text style={[styles.stepTitle, themeStyles.text, styles.manualReviewTitle]}>Manual ID review</Text>
                                <Text style={[styles.stepSubtitle, themeStyles.textSecondary, styles.manualReviewSubtitle]}>
                                    {selectedDocumentOption.label} is not currently supported by Didit in the Philippines. Upload your ID below and our team will review within 5-7 business days.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.manualInfoFields}>
                            <View style={styles.manualInfoField}>
                                <Text style={[styles.manualInfoFieldLabel, themeStyles.textSecondary]}>Full name on ID</Text>
                                <View style={[styles.manualInfoControl, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                    <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.manualInfoIcon} />
                                    <TextInput
                                        value={manualFullName}
                                        onChangeText={setManualFullName}
                                        placeholder="Juan Dela Cruz"
                                        placeholderTextColor={colors.textSecondary}
                                        autoCapitalize="words"
                                        style={[styles.manualInfoInput, themeStyles.text]}
                                    />
                                </View>
                            </View>

                            <View style={styles.manualInfoField}>
                                <Text style={[styles.manualInfoFieldLabel, themeStyles.textSecondary]}>ID expiration date</Text>
                                <View style={[styles.manualInfoControl, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} style={styles.manualInfoIcon} />
                                    <TouchableOpacity
                                        activeOpacity={1}
                                        onPress={() => setManualExpirationCalendarVisible(true)}
                                        style={styles.manualInfoDateButton}
                                        accessibilityRole="button"
                                    >
                                        <Text
                                            numberOfLines={1}
                                            style={[
                                                styles.manualInfoDateText,
                                                { color: manualIdExpiration ? colors.text : colors.textSecondary },
                                            ]}
                                        >
                                            {manualExpirationDateLabel}
                                        </Text>
                                    </TouchableOpacity>
                                    <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
                                </View>
                            </View>
                        </View>

                        <View style={styles.manualUploadList}>
                            {renderManualAsset('Front of ID', manualFrontImage, 'front', 'card-outline')}
                            {renderManualAsset('Back of ID', manualBackImage, 'back', 'albums-outline')}
                            {renderManualAsset('Selfie holding ID', manualSelfieImage, 'selfie', 'person-circle-outline')}
                        </View>

                        <View style={[styles.manualFlowHintCard, themeStyles.inputContainer]}>
                            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} />
                            <Text style={[styles.manualFlowHint, themeStyles.textSecondary]}>
                                Admin will approve or reject your submission, and we will automatically email you once the decision is made.
                            </Text>
                        </View>

                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => void submitManualReviewSignup()}
                            disabled={loading || !isManualReviewReady}
                            style={[
                                styles.nextButton,
                                { backgroundColor: isManualReviewReady ? colors.primary : (isDark ? '#374151' : '#E5E7EB'), marginTop: 8 },
                                !isManualReviewReady ? styles.nextButtonDisabled : null,
                            ]}
                        >
                            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.nextButtonText, { color: isManualReviewReady ? "white" : colors.textSecondary }]}>Submit for Manual Review</Text>}
                        </TouchableOpacity>
                    </ScrollView>

                    <BottomModal
                        visible={manualExpirationCalendarVisible}
                        onClose={() => setManualExpirationCalendarVisible(false)}
                        closeOnBackdropPress
                    >
                        <View style={[styles.documentModalSheet, styles.manualCalendarSheet, safeModalPadding, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <View
                                style={[
                                    styles.documentModalHandle,
                                    { backgroundColor: isDark ? "#4B5563" : "#E5E7EB" },
                                ]}
                            />
                            <View style={[styles.documentModalHeader, { borderBottomColor: colors.border }]}>
                                <View style={styles.documentModalHeaderCopy}>
                                    <Text style={[styles.documentModalTitle, themeStyles.text]}>ID expiration date</Text>
                                    <Text style={[styles.documentModalSubtitle, themeStyles.textSecondary]}>
                                        Select the date printed on your ID.
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    activeOpacity={1}
                                    onPress={() => setManualExpirationCalendarVisible(false)}
                                    style={[
                                        styles.documentModalCloseButton,
                                        { backgroundColor: colors.card, borderColor: colors.border },
                                    ]}
                                >
                                    <Ionicons name="close" size={18} color={colors.text} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.manualCalendarContainer}>
                                <Calendar
                                    current={manualExpirationCalendarCurrent}
                                    minDate={todayDateString}
                                    onDayPress={handleManualExpirationSelect}
                                    markedDates={manualExpirationMarkedDates}
                                    enableSwipeMonths
                                    theme={{
                                        calendarBackground: colors.background,
                                        textSectionTitleColor: colors.textSecondary,
                                        dayTextColor: colors.text,
                                        monthTextColor: colors.text,
                                        todayTextColor: colors.primary,
                                        selectedDayBackgroundColor: colors.primary,
                                        selectedDayTextColor: '#FFFFFF',
                                        arrowColor: colors.primary,
                                    }}
                                />
                            </View>
                        </View>
                    </BottomModal>
                </View>
            );
        }

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
                    <View style={[{ padding: 16, flexDirection: 'row', alignItems: 'center' }, safeVerificationHeaderPadding]}>
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
                        <Text style={themeStyles.textSecondary}>{"I'll do this later"}</Text>
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
                    We have sent a confirmation link to:
                </Text>
                <Text style={[themeStyles.text, { fontSize: 18, fontWeight: '600', marginBottom: 32, fontFamily: 'Poppins_600SemiBold' }]}>
                    {email}
                </Text>

                <Text style={[themeStyles.textSecondary, { textAlign: 'center', maxWidth: 350, fontSize: 14, marginBottom: 40, lineHeight: 22 }]}>
                    Confirm your email, then return to MusikaLokal to log in.
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
        // Verification steps take over full screen mostly
        return (
            <>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.flex1, themeStyles.container]}>
                    {step === 'verification' ? renderVerificationStep() : renderEmailVerificationStep()}
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
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={[styles.contentContainer, safeContentPadding]}>
                        {step === 'details' && renderDetailsStep()}
                    </View>
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
        height: 56,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        shadowColor: "#4F46E5",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    nextButtonDisabled: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
    nextButtonText: { color: 'white', fontSize: 16, fontWeight: '600', fontFamily: 'Poppins_600SemiBold' },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56, borderRadius: 16, borderWidth: 1
    },
    input: {
        flex: 1,
        marginLeft: 12,
        height: '100%',
        fontFamily: 'Poppins_400Regular',
        includeFontPadding: false,
        textAlignVertical: 'center',
        paddingVertical: 0,
    },
    formGap: { gap: 16 },
    backLink: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 4 },
    documentSectionContainer: { gap: 8, marginTop: 4 },
    documentSectionTitle: { fontSize: 14, fontFamily: 'Poppins_600SemiBold' },
    documentSectionSubtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
    documentSelectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 62,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 9,
        gap: 12,
    },
    documentSelectCopy: { flex: 1, gap: 2 },
    documentSelectValue: { fontSize: 14, lineHeight: 18, fontFamily: 'Poppins_600SemiBold' },
    documentSelectionMeta: { fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase' },
    documentModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    documentModalBackdrop: { flex: 1 },
    documentModalSheet: {
        maxHeight: '88%',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderWidth: 1,
        borderBottomWidth: 0,
        overflow: 'hidden',
    },
    documentModalHandle: {
        width: 40,
        height: 5,
        borderRadius: 999,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 10,
    },
    documentModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 14,
        borderBottomWidth: 1,
    },
    documentModalHeaderCopy: { flex: 1, gap: 4, paddingRight: 16 },
    documentModalTitle: { fontSize: 18, fontFamily: 'Poppins_600SemiBold' },
    documentModalSubtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
    documentModalCloseButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    documentModalBody: { flexGrow: 0 },
    documentModalList: { gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
    documentModalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 60,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 9,
        gap: 10,
    },
    documentModalOptionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    documentModalOptionCopy: { flex: 1, gap: 2 },
    documentModalOptionTitle: { fontSize: 14, lineHeight: 18, fontFamily: 'Poppins_600SemiBold' },
    documentModalOptionMeta: { fontSize: 11, lineHeight: 14, fontFamily: 'Poppins_700Bold', textTransform: 'uppercase' },
    documentModalOptionCheck: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    manualFlowContainer: { paddingHorizontal: 20, paddingBottom: 28, gap: 16 },
    manualReviewIntroCard: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    manualReviewIntroIcon: {
        width: 52,
        height: 52,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manualReviewIntroCopy: { flex: 1 },
    manualReviewTitle: { fontSize: 24, marginBottom: 6 },
    manualReviewSubtitle: { fontSize: 14, lineHeight: 21, marginBottom: 0 },
    manualInfoFields: { gap: 14 },
    manualInfoField: { gap: 6 },
    manualInfoControl: {
        height: 52,
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    manualInfoIcon: { width: 20, textAlign: 'center' },
    manualInfoFieldLabel: { fontSize: 12, lineHeight: 16, fontFamily: 'Poppins_500Medium', marginLeft: 2 },
    manualInfoInput: {
        flex: 1,
        height: '100%',
        fontSize: 14,
        lineHeight: 18,
        fontFamily: 'Poppins_500Medium',
        includeFontPadding: false,
        paddingVertical: 0,
        paddingHorizontal: 0,
        margin: 0,
        textAlignVertical: 'center',
    },
    manualInfoDateButton: {
        flex: 1,
        height: '100%',
        justifyContent: 'center',
    },
    manualInfoDateText: {
        fontSize: 14,
        lineHeight: 18,
        fontFamily: 'Poppins_500Medium',
    },
    manualCalendarSheet: {
        maxHeight: '78%',
    },
    manualCalendarContainer: {
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 18,
    },
    manualUploadList: { gap: 12 },
    manualUploadCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 12,
    },
    manualUploadIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manualUploadCopy: { flex: 1, gap: 8, minWidth: 0 },
    manualUploadTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    manualUploadTitle: { fontSize: 14, lineHeight: 19, fontFamily: 'Poppins_600SemiBold' },
    manualUploadSubtitle: { fontSize: 11, lineHeight: 15, fontFamily: 'Poppins_400Regular' },
    manualPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
    manualPreviewImage: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#D1D5DB' },
    manualPreviewCopy: { flex: 1, minWidth: 0 },
    manualUploadFileName: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_500Medium' },
    manualUploadPlaceholder: { fontSize: 12, lineHeight: 17, fontFamily: 'Poppins_400Regular' },
    manualUploadAction: {
        width: 34,
        height: 34,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    manualUploadActionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    manualFlowHintCard: {
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    manualFlowHint: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Poppins_400Regular' },
});




