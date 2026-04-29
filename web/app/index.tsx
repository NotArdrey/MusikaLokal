import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import AuthMusicHero from '../src/components/AuthMusicHero';
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
}

type TempLoginRole = 'musician' | 'producer' | 'studio-owner' | 'venue-owner';

type TempLoginOption = {
  label: string;
  details: string;
  email: string;
  expectedRole: TempLoginRole;
  destinationLabel: string;
};

const TEMP_LOGIN_PASSWORD = 'pass123';
const TEMP_LOGIN_OPTIONS: TempLoginOption[] = [
  {
    label: 'Login as Gabriel dela Cruz',
    details: 'Musician | musician@test.com',
    email: 'musician@test.com',
    expectedRole: 'musician',
    destinationLabel: 'My Group',
  },
  {
    label: 'Login as Jonathan Santos',
    details: 'Producer | producer1@test.com',
    email: 'producer1@test.com',
    expectedRole: 'producer',
    destinationLabel: 'My Production',
  },
  {
    label: 'Login as OneRoots Records',
    details: 'Studio owner | studio@test.com',
    email: 'studio@test.com',
    expectedRole: 'studio-owner',
    destinationLabel: 'My Studio',
  },
  {
    label: 'Login as Marco Reyes',
    details: 'Venue owner | manager@test.com',
    email: 'manager@test.com',
    expectedRole: 'venue-owner',
    destinationLabel: 'My Venue',
  },
] as const;

const formatTempRoleLabel = (role: string | null | undefined) => {
  if (role === 'studio-owner') return 'Studio Owner';
  if (role === 'venue-owner') return 'Venue Owner';
  if (role === 'producer') return 'Producer';
  if (role === 'musician') return 'Musician';
  if (!role) return 'Unknown';
  return role;
};

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const { session, loading: authLoading, roleResolved, setGuestMode, userRole } = useAuth();
  const { verified, accountCreated, email: createdEmail, verification_error, verificationPendingReview } = useLocalSearchParams();
  const { width } = Dimensions.get('window');
  const isWebDesktop = Platform.OS === 'web' && width >= 768;

  const resolvePostLoginRoute = (role: unknown) => {
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';
    return normalizedRole === 'admin' ? '/admin' : '/home';
  };

  useEffect(() => {
    if (!authLoading && session) {
      if (!roleResolved) return;

      const route = resolvePostLoginRoute(
        userRole ||
        session.user?.user_metadata?.role ||
        session.user?.app_metadata?.role,
      );
      router.replace(route as any);
    }
  }, [authLoading, roleResolved, session, userRole]);

  const isSchemaQueryError = (errorLike: unknown) => {
    const error = errorLike as { message?: string; details?: string; hint?: string; code?: string } | null;
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();

    return (
      error?.code === '42P17' ||
      text.includes('database error querying schema') ||
      text.includes('infinite recursion detected in policy')
    );
  };

  const schemaErrorLoginMessage =
    'Database schema/policies are out of sync. Apply the latest Supabase migrations, then try logging in again.';

  // ... (existing initializeAuth is fine)

  // Check for verification success from deep link
  useEffect(() => {
    if (verified === 'true') {
      const checkPendingSignup = async () => {
        try {
          const savedState = await import('@react-native-async-storage/async-storage').then(m => m.default.getItem('signup_current_session'));
          if (savedState) {
            console.log('Pending signup detected, redirecting to signup flow...');
            router.replace({ pathname: '/signup', params: { verified: 'true' } } as any);
            return;
          }
        } catch (e) {
          console.log('Error checking pending signup:', e);
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

  const openTemporaryLoginValidation = async (option: TempLoginOption) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, is_verified')
        .eq('email', option.email)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!profile) {
        showAlert(
          'warning',
          'Test Account Missing',
          `${option.label} is not available in this environment.`,
          [{ text: 'OK', style: 'default' }],
        );
        return;
      }

      const actualRole = typeof profile.role === 'string' ? profile.role.trim().toLowerCase() : null;
      if (actualRole !== option.expectedRole) {
        showAlert(
          'warning',
          'Test Account Mismatch',
          `${option.label} is configured as ${formatTempRoleLabel(actualRole)} instead of ${formatTempRoleLabel(option.expectedRole)}.`,
          [{ text: 'OK', style: 'default' }],
        );
        return;
      }

      const identityVerified = profile.is_verified === true;
      const issues: string[] = [];

      if (!identityVerified) {
        issues.push('Identity verification is incomplete.');
      }

      const summary = [
        option.label,
        option.email,
        '',
        `Role: ${formatTempRoleLabel(actualRole)}`,
        `Identity: ${identityVerified ? 'Verified' : 'Needs verification'}`,
        `Expected destination: ${option.destinationLabel}`,
      ].join('\n');

      const message = issues.length > 0
        ? `${summary}\n\nCurrent issues:\n- ${issues.join('\n- ')}\n\nContinue anyway?`
        : `${summary}\n\nContinue with this test account?`;

      showAlert(
        issues.length > 0 ? 'warning' : 'info',
        'Temporary Login Validation',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: issues.length > 0 ? 'Continue Anyway' : 'Continue',
            onPress: () => {
              void signInWithCredentials(option.email, TEMP_LOGIN_PASSWORD);
            },
            style: 'default',
          },
        ],
      );
    } catch (error) {
      console.log('Temporary login validation failed:', error);
      showAlert(
        'error',
        'Validation Error',
        'Unable to validate this temporary login right now. Please try again.',
        [{ text: 'OK', style: 'default' }],
      );
    }
  };

  // Check for Account Created success (New User)
  useEffect(() => {
    if (accountCreated === 'true') {
      if (verificationPendingReview === 'true') {
        showAlert(
          'success',
          'Manual Review Submitted',
          `Your requirements were submitted and your account is under manual review.\n\nWe will email ${createdEmail || 'you'} when the review is complete. If you receive an email confirmation link, confirm your email so you can sign in after approval.`
        );
        return;
      }

      showAlert(
        'success',
        'Check Your Inbox',
        `We have sent a verification link to ${createdEmail || 'your email'}.\n\nPlease confirm your email address to log in.`
      );
    } else if (verified === 'true') {
      // Only show this 'Identity Verified' alert if we are NOT coming from a fresh signup creation
      // (which handles its own flow via accountCreated)
      showAlert(
        'success',
        'Verification Successful! 🎉',
        'Your identity has been verified. You can now log in.'
      );
    }
  }, [verified, accountCreated, createdEmail, verificationPendingReview]);

  const signInWithCredentials = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    try {
      // Clear any stale session first to prevent refresh token errors
      console.log('Clearing any existing session...');
      await supabase.auth.signOut({ scope: 'local' });

      console.log('Attempting login for:', loginEmail);
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
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
        } else if (isSchemaQueryError(error)) {
          setLoginMessage({ type: 'error', text: schemaErrorLoginMessage });
        } else {
          setLoginMessage({ type: 'error', text: error.message });
        }
      } else {
        // Login succeeded - VALIDATE VERIFICATION STATUS
        console.log('Auth success. Validating verification status...');
        const { data: { user }, error: getUserError } = await supabase.auth.getUser();

        if (!user) {
          console.error('Failed to retrieve user after login:', getUserError?.message || 'user is null');
          setLoginMessage({ type: 'error', text: 'Unable to verify your account. Please try again.' });
        } else if (user) {
          // 1. Check Metadata (Fastest)
          const metaVerified = user.user_metadata?.is_verified;
          console.log('Metadata check:', { metaVerified });

          if (metaVerified === false) {
            console.log('Blocked by metadata check.');
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

          console.log('Profile check:', { profile, profileError });

          if (profileError) {
            if (isSchemaQueryError(profileError)) {
              await supabase.auth.signOut({ scope: 'local' });
              setLoginMessage({ type: 'error', text: schemaErrorLoginMessage });
              showAlert('error', 'Database Setup Required', schemaErrorLoginMessage);
              return;
            }

            console.error('Profile check failed:', profileError);
          }

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
              if (isSchemaQueryError(upsertError)) {
                await supabase.auth.signOut({ scope: 'local' });
                setLoginMessage({ type: 'error', text: schemaErrorLoginMessage });
                showAlert('error', 'Database Setup Required', schemaErrorLoginMessage);
                return;
              }
            } else {
              console.log('Profile repaired successfully. Re-fetching...');
              const { data: newProfile } = await supabase
                .from('profiles')
                .select('is_verified, id_document_expiry, role')
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
            const route = resolvePostLoginRoute(
              profile?.role ||
              user.user_metadata?.role ||
              user.app_metadata?.role,
            );
            console.log('Verification passed. Redirecting to:', route);
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
      console.log(e);
    } finally {
      setLoading(false);
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
      return;
    }

    await signInWithCredentials(email, password);
  };

  const handleTemporaryLogin = async (option: TempLoginOption) => {
    setEmail(option.email);
    setPassword(TEMP_LOGIN_PASSWORD);
    setErrors({});
    setLoginMessage(null);

    await openTemporaryLoginValidation(option);
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

  const handleContinueAsGuest = async () => {
    await supabase.auth.signOut({ scope: 'local' });
    await setGuestMode(true);
    router.replace('/home' as any);
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
      <ScrollView contentContainerStyle={isWebDesktop ? styles.webScrollContent : styles.scrollContent}>
        <View style={isWebDesktop ? styles.webContainer : styles.contentContainer}>
          {/* Left Side Branding (Web Desktop Only) */}
          {isWebDesktop && (
            <View style={styles.webLeftPanel}>
              <AuthMusicHero
                title={`Welcome back\nto MusikaLokal.`}
                subtitle="Discover, connect, and collaborate with the local music scene."
              />
            </View>
          )}

          {/* Right Side Form */}
          <View style={isWebDesktop ? [styles.webRightPanel, { backgroundColor: isDark ? 'rgba(31, 41, 55, 0.85)' : 'rgba(255, 255, 255, 0.85)' }] : null}>
            <View style={isWebDesktop ? styles.webFormWrapper : null}>
              {/* Logo Section (Mobile Only) */}
              {!isWebDesktop && (
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
              )}

              {/* Form Section */}
              <View style={styles.formContainer}>

                {isWebDesktop && (
                  <View style={{ marginBottom: 32 }}>
                    <Text style={[styles.appName, themeStyles.text, { textAlign: 'left', fontSize: 36, marginBottom: 8 }]}>Sign In</Text>
                    <Text style={[themeStyles.textSecondary, { fontFamily: 'Poppins_400Regular', fontSize: 18 }]}>Please enter your details to continue.</Text>
                  </View>
                )}


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
                  activeOpacity={1}
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

                <View style={styles.tempLoginSection}>
                  <Text style={[styles.tempLoginLabel, themeStyles.textSecondary]}>
                    Temporary test logins
                  </Text>
                  <View style={styles.tempLoginButtonList}>
                    {TEMP_LOGIN_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.email}
                        onPress={() => handleTemporaryLogin(option)}
                        disabled={loading}
                        activeOpacity={1}
                        style={[
                          styles.tempLoginButton,
                          { borderColor: colors.border, opacity: loading ? 0.6 : 1 },
                        ]}
                      >
                        <Text style={[styles.tempLoginButtonText, themeStyles.primaryText]}>
                          {option.label}
                        </Text>
                        <Text style={[styles.tempLoginButtonDetails, themeStyles.textSecondary]}>
                          {option.details}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleContinueAsGuest}
                  activeOpacity={1}
                  style={[styles.guestButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.guestButtonText, { color: colors.text }]}>Continue as Guest</Text>
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
                    Don&apos;t have an account?{' '}
                  </Text>
                  <TouchableOpacity activeOpacity={1} onPress={() => router.push('/signup' as any)}>
                    <Text style={[styles.signupLinkHighlight, themeStyles.primaryText]}>
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
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
  webScrollContent: {
    flexGrow: 1,
    height: '100%',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 32, // px-8
    justifyContent: 'center',
    paddingVertical: 48, // py-12
  },
  webContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  webLeftPanel: {
    flex: 1,
    display: 'flex',
  },
  webHeroImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webHeroOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 64,
    justifyContent: 'center',
  },
  webHeroTitle: {
    color: 'white',
    fontSize: 48,
    fontFamily: 'Poppins_700Bold',
    lineHeight: 56,
    marginBottom: 16,
  },
  webHeroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontFamily: 'Poppins_400Regular',
    maxWidth: 400,
    lineHeight: 28,
  },
  webRightPanel: {
    flex: 1,
    maxWidth: 800,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 64,
  },
  webFormWrapper: {
    width: '100%',
    maxWidth: 500,
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
    marginBottom: 8,
    fontSize: 14,
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    marginLeft: 16,
    height: '100%',
    fontFamily: 'Poppins_400Regular',
    fontSize: 16,
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
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    color: 'white',
    fontSize: 18,
  },
  tempLoginSection: {
    gap: 10,
  },
  tempLoginLabel: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tempLoginButtonList: {
    gap: 10,
  },
  tempLoginButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  tempLoginButtonText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    textAlign: 'center',
  },
  tempLoginButtonDetails: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  guestButton: {
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 8,
  },
  guestButtonText: {
    fontFamily: 'Poppins_500Medium',
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
