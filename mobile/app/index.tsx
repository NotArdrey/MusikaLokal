import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import VerificationModal from '../src/components/VerificationModal';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';



interface AlertState {
  visible: boolean;
  type: AlertType;
  title: string;
  message: string;
  buttons: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[];
  forceModal: boolean;
}

const isAdminRole = (role: unknown): boolean => {
  return typeof role === 'string' && role.toLowerCase() === 'admin';
};

const createEmailConfirmationRedirectUrl = () => {
  const baseUrl = Linking.createURL('/');
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}verified=true`;
};

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { session, loading: authLoading, roleResolved, userRole } = useAuth();
  const { verified, accountCreated, email: createdEmail, verification_error, verificationPendingReview, diditPendingReview, diditVerified } = useLocalSearchParams();

  const resolvePostLoginRoute = () => '/feed';

  useEffect(() => {
    if (!authLoading && session) {
      if (!roleResolved) return;

      const route = resolvePostLoginRoute();
      router.replace(route as any);
    }
  }, [authLoading, roleResolved, session, userRole]);

  // ... (existing initializeAuth is fine)

  // Check for verification success from deep link
  useEffect(() => {
    if (verified === 'true') {
      const checkPendingSignup = async () => {
        try {
          const savedState = await import('@react-native-async-storage/async-storage').then(m => m.default.getItem('signup_current_session'));
          if (savedState) {
            router.replace({ pathname: '/signup', params: { verified: 'true' } } as any);
            return;
          }
        } catch (e) {
        }
      };
      checkPendingSignup();
    }
  }, [verified]);

  // Handle verification errors redirected from signup
  useEffect(() => {
    if (verification_error) {
      let title = 'Verification Failed';
      let message = 'Your identity could not be verified. Please try again.';

      if (verification_error === 'invalid_id') {
        title = 'Invalid I.D.';
        message = 'Your I.D. was declined or does not match. Please try again with a valid government-issued I.D.';
      } else if (verification_error === 'abandoned') {
        title = 'Verification Incomplete';
        message = 'You did not complete the verification process. Please try signing up again.';
      } else if (verification_error === 'pending_review') {
        title = 'Verification Pending';
        message = 'Your verification is under manual review. Please check your email later for updates.';
      } else if (verification_error === 'timeout') {
        title = 'Verification Timeout';
        message = 'We could not confirm your verification status in time. Please try signing up again.';
      }

      showAlert('warning', title, message, [{ text: 'OK' }]);

      // Clear the param to prevent re-showing the alert
      router.setParams({ verification_error: '' });
    }
  }, [verification_error]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

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
    forceModal: false,
  });

  // Helper function to show alert
  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: AlertState['buttons'],
    forceModal = false,
  ) => {
    setAlertState({
      visible: true,
      type,
      title,
      message,
      buttons: buttons || [{ text: 'OK' }],
      forceModal,
    });
  };

  const closeAlert = () => {
    setAlertState(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCooldownSeconds]);

  const focusField = (field: 'email' | 'password') => {
    setTimeout(() => {
      if (field === 'password') {
        passwordInputRef.current?.focus();
        return;
      }

      emailInputRef.current?.focus();
    }, 0);
  };

  const showValidationAlert = (nextErrors: { email?: string; password?: string }) => {
    const issues: string[] = [];
    let primaryField: 'email' | 'password' = 'email';

    if (nextErrors.email) {
      issues.push(nextErrors.email === 'Email is required.' ? 'Enter your email address.' : nextErrors.email);
      primaryField = 'email';
    }

    if (nextErrors.password) {
      issues.push(nextErrors.password === 'Password is required.' ? 'Enter your password.' : nextErrors.password);
      if (!nextErrors.email) {
        primaryField = 'password';
      }
    }

    const title = issues.length > 1
      ? 'Complete Required Fields'
      : nextErrors.email
        ? 'Check Your Email'
        : 'Password Required';

    const message = issues.length > 1
      ? `We need a few details before you can sign in:\n• ${issues.join('\n• ')}`
      : issues[0] || 'Please review your login details and try again.';

    showAlert(
      'warning',
      title,
      message,
      [
        {
          text: 'Review fields',
          onPress: () => focusField(primaryField),
          style: 'default',
        },
      ],
      true,
    );
  };

  const showLoginError = (title: string, message: string) => {
    setLoginMessage({ type: 'error', text: message });
    showAlert('error', title, message, [{ text: 'OK', style: 'default' }], true);
  };

  // Check for Account Created success (New User)
  useEffect(() => {
    if (accountCreated === 'true') {
      if (diditPendingReview === 'true') {
        showAlert(
          'success',
          'Verification In Review',
          `Your identity verification is still being reviewed by Didit.\n\nPlease confirm the email link we sent to ${createdEmail || 'your email'}. We will update your account when Didit finishes the review.`
        );
        return;
      }

      if (verificationPendingReview === 'true') {
        showAlert(
          'success',
          'Manual Review Submitted',
          `Your requirements were submitted and your account is under manual review.\n\nWe will email ${createdEmail || 'you'} when the review is complete. If you receive an email confirmation link, confirm your email so you can sign in after approval.`
        );
        return;
      }

      if (diditVerified === 'true') {
        showAlert(
          'success',
          'Check Your Inbox',
          `Your identity has been verified.\n\nPlease confirm the email link we sent to ${createdEmail || 'your email'} before logging in.`
        );
        return;
      }

      showAlert(
        'success',
        'Check Your Inbox',
        `We have sent a verification link to ${createdEmail || 'your email'}.\n\nPlease confirm your email address to log in.`
      );
    } else if (verified === 'true') {
      showAlert(
        'success',
        'Account Ready',
        'Your email has been confirmed and your identity is verified. You can now log in.'
      );
      return;
    }
  }, [verified, accountCreated, createdEmail, verificationPendingReview, diditPendingReview, diditVerified]);

  const signInWithCredentials = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setCanResendConfirmation(false);
    try {
      // Clear any stale session first to prevent refresh token errors
      await supabase.auth.signOut({ scope: 'local' });

      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        // Handle specific error cases
        if (error.message.includes('Invalid login credentials')) {
          showLoginError('Invalid Login', 'Invalid email or password.');
        } else if (error.message.includes('Email not confirmed')) {
          setCanResendConfirmation(true);
          setLoginMessage({ type: 'error', text: 'Email not confirmed. Check your inbox or resend the confirmation email.' });
          showAlert(
            'warning',
            'Email Not Confirmed',
            'Email not confirmed. Check your inbox or resend the confirmation email.',
            [
              { text: 'Resend Email', onPress: () => void handleResendConfirmationEmail(), style: 'default' },
              { text: 'OK', style: 'cancel' },
            ],
            true,
          );
        } else if (error.message.includes('rate') || error.status === 429) {
          showLoginError('Too Many Attempts', 'Too many attempts. Please wait before trying again.');
        } else if (error.message.includes('refresh') || error.message.includes('token')) {
          // Clear storage and retry once
          await supabase.auth.signOut({ scope: 'local' });
          showLoginError('Session Expired', 'Session expired. Please try again.');
        } else {
          showLoginError('Sign In Failed', error.message);
        }
      } else {
        // Login succeeded - VALIDATE VERIFICATION STATUS
        const { data: { user }, error: getUserError } = await supabase.auth.getUser();

        if (!user) {
          console.error('Failed to retrieve user after login:', getUserError?.message || 'user is null');
          showLoginError('Verification Failed', 'Unable to verify your account. Please try again.');
        } else if (user) {
          const blockAdminAccess = async () => {
            await supabase.auth.signOut({ scope: 'local' });
            setLoginMessage({ type: 'error', text: 'Admin accounts are not supported in the mobile app.' });
            showAlert(
              'warning',
              'Unsupported Account Type',
              'Admin accounts cannot be used in the mobile app. Please use the admin dashboard.',
              [{ text: 'OK', style: 'default' }],
            );
          };

          if (isAdminRole(user.user_metadata?.role)) {
            await blockAdminAccess();
            return;
          }

          // 1. Check Metadata (Fastest)
          const metaVerified = user.user_metadata?.is_verified;

          if (metaVerified === false) {
            await supabase.auth.signOut();
            setLoginMessage({ type: 'error', text: 'Account not verified. Please complete verification.' });
            showAlert(
              'warning',
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
            .select('is_verified, id_document_expiry, role')
            .eq('id', user.id)
            .maybeSingle();


          if (isAdminRole(profile?.role)) {
            await blockAdminAccess();
            return;
          }

          // SELF-HEALING: After the email confirmation link creates a valid auth session,
          // promote the Didit-approved profile from pending to verified.
          if ((!profile || !profile.is_verified) && metaVerified) {
            const { error: upsertError } = await supabase
              .from('profiles')
              .upsert({
                id: user.id,
                email: user.email,
                full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
                role: profile?.role || user.user_metadata?.role || 'musician',
                is_verified: true,
                verification_status: 'APPROVED',
                didit_session_id: user.user_metadata?.didit_session_id
              });

            if (upsertError) {
              console.error('Failed to repair profile:', upsertError);
            } else {
              const { data: newProfile } = await supabase
                .from('profiles')
                .select('is_verified, id_document_expiry, role')
                .eq('id', user.id)
                .maybeSingle();
              profile = newProfile;
            }
          }

          if (isAdminRole(profile?.role)) {
            await blockAdminAccess();
            return;
          }

          // If profile is STILL missing OR unverified -> BLOCK
          if (!profile || !profile.is_verified) {
            await supabase.auth.signOut();

            setLoginMessage({ type: 'error', text: !profile ? 'Account setup incomplete. Verify identity.' : 'Identity verification required.' });

            showAlert(
              'warning',
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
            setLoginMessage({ type: 'error', text: 'ID expired. Please upload a new document to continue.' });
            router.replace('/identity_verification' as any);
            return;
          } else {
            const route = resolvePostLoginRoute();
            router.replace(route as any);
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
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmationEmail = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrors((prev) => ({ ...prev, email: 'Please enter a valid email address.' }));
      showAlert('warning', 'Check Your Email', 'Enter the email address you used to sign up.', [{ text: 'OK' }], true);
      return;
    }

    if (resendingConfirmation || resendCooldownSeconds > 0) {
      return;
    }

    setResendingConfirmation(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-unverified-user', {
        body: {
          action: 'resend_confirmation_email',
          email: normalizedEmail,
          redirectTo: createEmailConfirmationRedirectUrl(),
        },
      });

      if (error) {
        throw error;
      }

      if ((data as any)?.alreadyConfirmed) {
        setCanResendConfirmation(false);
        setLoginMessage({ type: 'success', text: 'Email already confirmed. You can sign in now.' });
        showAlert('success', 'Email Confirmed', 'Your email is already confirmed. You can sign in now.', [{ text: 'OK' }], true);
        return;
      }

      setResendCooldownSeconds(60);
      setCanResendConfirmation(true);
      setLoginMessage({ type: 'success', text: 'A new confirmation email has been sent.' });
      showAlert('success', 'Email Sent', 'A new confirmation link has been sent to your email.', [{ text: 'OK' }], true);
    } catch (e: any) {
      const message = e?.message || 'Could not resend the confirmation email. Please try again.';
      setLoginMessage({ type: 'error', text: message });
      showAlert('error', 'Resend Failed', message, [{ text: 'OK' }], true);
    } finally {
      setResendingConfirmation(false);
    }
  };

  const handleLogin = async () => {
    setErrors({});
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
      showValidationAlert(newErrors);
      return;
    }

    await signInWithCredentials(email, password);
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
                  ref={emailInputRef}
                  style={[styles.input, themeStyles.text]}
                  placeholder="name@email.com"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setCanResendConfirmation(false);
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
                  ref={passwordInputRef}
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
                <TouchableOpacity activeOpacity={1} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {errors.password ? (
                <Text style={styles.errorText}>{errors.password}</Text>
              ) : (
                <TouchableOpacity activeOpacity={1} onPress={() => router.push('/forget_password' as any)} style={styles.forgotPasswordButton}>
                  <Text style={[styles.forgotPasswordText, themeStyles.primaryText]}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={loading ? 1 : 0.78}
              style={[styles.loginButton, themeStyles.primaryButton, styles.shadow, { opacity: loading ? 0.6 : 1 }]}
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

            {canResendConfirmation && (
              <TouchableOpacity
                onPress={handleResendConfirmationEmail}
                disabled={resendingConfirmation || resendCooldownSeconds > 0}
                activeOpacity={resendingConfirmation || resendCooldownSeconds > 0 ? 1 : 0.78}
                style={[
                  styles.resendConfirmationButton,
                  {
                    borderColor: colors.primary,
                    opacity: resendingConfirmation || resendCooldownSeconds > 0 ? 0.65 : 1,
                  },
                ]}
              >
                {resendingConfirmation ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[styles.resendConfirmationText, { color: colors.primary }]}>
                    {resendCooldownSeconds > 0
                      ? `Resend available in ${resendCooldownSeconds}s`
                      : 'Resend confirmation email'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.signupLinkContainer}>
              <Text style={[styles.signupLinkText, themeStyles.textSecondary]}>
                Don&apos;t have an account?{' '}
              </Text>
              <TouchableOpacity
                activeOpacity={0.65}
                onPress={() => router.push('/signup' as any)}
                style={styles.signupLinkPressable}
              >
                <Text style={[styles.signupLinkHighlight, themeStyles.primaryText]}>Register here</Text>
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
        forceModal={alertState.forceModal}
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
    includeFontPadding: false,
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
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 24, // mt-6
  },
  signupLinkText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  signupLinkPressable: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  signupLinkHighlight: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
    fontFamily: 'Poppins_400Regular',
  },
  resendConfirmationButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendConfirmationText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
});
