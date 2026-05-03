import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import VerificationModal from '../src/components/VerificationModal';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

type IdentityProfile = {
  is_verified: boolean | null;
  verification_status: string | null;
  id_document_expiry: string | null;
  id_verified_at: string | null;
  didit_session_id: string | null;
};

const statusLabel = (status: string | null, isExpired: boolean): string => {
  if (isExpired) return 'Expired';

  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
      return 'Verified';
    case 'PENDING':
      return 'Pending';
    case 'PENDING_REVIEW':
      return 'In Review';
    case 'DECLINED':
      return 'Declined';
    case 'ABANDONED':
      return 'Not Completed';
    default:
      return 'Not Verified';
  }
};

const statusColor = (status: string | null, isExpired: boolean): string => {
  if (isExpired) return '#F59E0B';

  switch ((status || '').toUpperCase()) {
    case 'APPROVED':
      return '#10B981';
    case 'PENDING':
    case 'PENDING_REVIEW':
      return '#3B82F6';
    case 'DECLINED':
      return '#EF4444';
    default:
      return '#6B7280';
  }
};

const formatDate = (value: string | null): string => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString();
};

const identityExpiryLabel = (profile: IdentityProfile | null): string => {
  if (profile?.id_document_expiry) return formatDate(profile.id_document_expiry);
  return profile?.is_verified ? 'No expiry on file' : 'Not available';
};

const lastVerifiedLabel = (profile: IdentityProfile | null): string => {
  if (profile?.id_verified_at) return formatDate(profile.id_verified_at);
  return profile?.is_verified ? 'Verified' : 'Not available';
};

const isDateExpired = (value: string | null): boolean => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date <= new Date();
};

const toSingleParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
};

export default function IdentityVerificationScreen() {
  const { colors, isDark } = useTheme();
  const { userId, session, isGuest, checkIdentityStatus } = useAuth();
  const callbackParams = useLocalSearchParams<{
    verification_return?: string | string[];
    status?: string | string[];
    message?: string | string[];
  }>();
  const handledCallbackRef = useRef<string | null>(null);
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width >= 768;
  const pageBackground = isWebDesktop
    ? isDark
      ? '#0A1224'
      : '#E9EEF8'
    : colors.background;
  const pageCardBackground = isWebDesktop
    ? isDark
      ? '#0F172A'
      : '#FFFFFF'
    : colors.card;
  const surfaceBackground = isWebDesktop
    ? isDark
      ? '#13213A'
      : '#F4F7FE'
    : colors.surface;
  const borderSoft = isWebDesktop
    ? isDark
      ? '#1E2C48'
      : '#D8E3F2'
    : colors.border;

  const [loading, setLoading] = useState(true);
  const [startingVerification, setStartingVerification] = useState(false);
  const [profile, setProfile] = useState<IdentityProfile | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState('');
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

  const showAlert = useCallback((type: AlertType, title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  }, []);

  const handleBackToProfile = useCallback(() => {
    router.replace('/profile');
  }, []);

  const refreshStatusAndRedirectIfVerified = useCallback(async () => {
    if (!userId || !session || isGuest) {
      return false;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('is_verified, verification_status, id_document_expiry, id_verified_at, didit_session_id')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    const latestProfile = (data as IdentityProfile | null) || null;
    setProfile(latestProfile);
    await checkIdentityStatus();

    const isVerifiedAndValid = latestProfile?.is_verified === true && !isDateExpired(latestProfile?.id_document_expiry || null);
    if (isVerifiedAndValid) {
      router.replace('/home');
      return true;
    }

    return false;
  }, [userId, session, isGuest, checkIdentityStatus]);

  const fetchIdentityStatus = useCallback(async () => {
    if (!userId || !session || isGuest) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_verified, verification_status, id_document_expiry, id_verified_at, didit_session_id')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      setProfile((data as IdentityProfile | null) || null);
      await checkIdentityStatus();
    } catch (e: any) {
      showAlert('error', 'Unable to Load Status', e?.message || 'Could not load your identity verification details.');
    } finally {
      setLoading(false);
    }
  }, [userId, session, isGuest, checkIdentityStatus, showAlert]);

  useFocusEffect(
    useCallback(() => {
      void fetchIdentityStatus();
    }, [fetchIdentityStatus]),
  );

  useEffect(() => {
    if (!userId || !session || isGuest) return;

    const channel = supabase
      .channel(`identity-status:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          void fetchIdentityStatus();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, session, isGuest, fetchIdentityStatus]);

  const callbackReturn = toSingleParam(callbackParams.verification_return);
  const callbackStatus = toSingleParam(callbackParams.status).toUpperCase();
  const callbackMessage = toSingleParam(callbackParams.message);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!session || isGuest) return;

    const hasCallbackParams = Boolean(callbackReturn || callbackStatus || callbackMessage);
    if (!hasCallbackParams) return;

    const callbackKey = `${callbackReturn}|${callbackStatus}|${callbackMessage}`;
    if (handledCallbackRef.current === callbackKey) return;
    handledCallbackRef.current = callbackKey;

    const processCallback = async () => {
      try {
        const redirected = await refreshStatusAndRedirectIfVerified();
        if (redirected) return;

        if (callbackStatus === 'DECLINED' || callbackStatus === 'ABANDONED') {
          showAlert(
            'warning',
            'Verification Not Approved',
            callbackMessage || 'The submitted ID was not approved. Please upload a valid ID and try again.',
          );
          return;
        }

        showAlert(
          'info',
          'Verification Submitted',
          callbackMessage || 'Verification return received. Your status will update automatically once processing is complete.',
        );
      } catch (e: any) {
        showAlert('error', 'Unable to Refresh Status', e?.message || 'Could not refresh your verification status.');
      }
    };

    void processCallback();
  }, [session, isGuest, callbackReturn, callbackStatus, callbackMessage, refreshStatusAndRedirectIfVerified, showAlert]);

  const expired = useMemo(() => isDateExpired(profile?.id_document_expiry || null), [profile?.id_document_expiry]);
  const normalizedStatus = (profile?.verification_status || '').toUpperCase();
  const canStartVerification = normalizedStatus !== 'PENDING_REVIEW' && !startingVerification;

  const handleStartVerification = async () => {
    if (!userId) {
      router.replace('/');
      return;
    }

    setStartingVerification(true);

    try {
      const redirectUrl =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? `${window.location.origin}/identity_verification?verification_return=1`
          : 'musikalokal://verification-callback';

      const { data, error } = await supabase.functions.invoke('create-didit-session', {
        body: {
          userId,
          redirect_url: redirectUrl,
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.verificationUrl) {
        throw new Error(data?.error || 'Failed to start identity verification.');
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.assign(data.verificationUrl);
        return;
      }

      setVerificationUrl(data.verificationUrl);
      setShowVerificationModal(true);
    } catch (e: any) {
      showAlert('error', 'Verification Start Failed', e?.message || 'Could not start the verification flow. Please try again.');
    } finally {
      setStartingVerification(false);
    }
  };

  const handleVerificationSuccess = () => {
    setShowVerificationModal(false);
    setVerificationUrl('');

    void refreshStatusAndRedirectIfVerified()
      .then((redirected) => {
        if (redirected) return;
        showAlert(
          'success',
          'Verification Submitted',
          'Your verification was submitted successfully. Status will update automatically once processing is complete.',
        );
        void fetchIdentityStatus();
      })
      .catch((e: any) => {
        showAlert('error', 'Unable to Refresh Status', e?.message || 'Could not refresh your verification status.');
      });
  };

  const handleVerificationClose = () => {
    setShowVerificationModal(false);
    setVerificationUrl('');
    void fetchIdentityStatus();
  };

  if (!session || isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
          <Header title="Identity Verification" onBackPress={handleBackToProfile} />
          <GuestSignInGate message="Sign in to manage your identity verification status." />
          <Navbar />
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
          <Header title="Identity Verification" onBackPress={handleBackToProfile} />

          <ScrollView
            contentContainerStyle={[styles.scrollContent, isWebDesktop && styles.scrollContentWeb]}
            showsVerticalScrollIndicator={false}
          >
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Status</Text>
              <View
                style={[
                  styles.card,
                  isWebDesktop && styles.webSectionCard,
                  { backgroundColor: pageCardBackground, borderColor: borderSoft },
                ]}
              >
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Checking verification status...</Text>
                </View>
              ) : (
                <>
                  <View style={styles.statusRow}>
                    <View style={styles.statusLabelWrap}>
                      <Ionicons name="card-outline" size={18} color={colors.text} />
                      <Text style={[styles.statusLabel, { color: colors.text }]}>Identity Status</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: `${statusColor(profile?.verification_status || null, expired)}1A` }]}>
                      <Text style={[styles.badgeText, { color: statusColor(profile?.verification_status || null, expired) }]}> 
                        {statusLabel(profile?.verification_status || null, expired)}
                      </Text>
                    </View>
                  </View>

                    <View style={[styles.detailRow, { borderTopColor: borderSoft }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>ID Expiry Date</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{identityExpiryLabel(profile)}</Text>
                  </View>

                    <View style={[styles.detailRow, { borderTopColor: borderSoft }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Verified</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{lastVerifiedLabel(profile)}</Text>
                  </View>

                  <Text style={[styles.hintText, { color: colors.textSecondary }]}> 
                    This flow is only for identity documents. It does not change email verification.
                  </Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.sectionContainer}>
              <View
                style={[
                  styles.actionPanel,
                  isWebDesktop && styles.webSectionCard,
                  { backgroundColor: pageCardBackground, borderColor: borderSoft },
                ]}
              >
            <TouchableOpacity
              activeOpacity={1}
              disabled={!canStartVerification}
              onPress={handleStartVerification}
              style={[
                styles.actionButton,
                {
                  backgroundColor: canStartVerification ? colors.primary : isDark ? '#374151' : '#D1D5DB',
                },
              ]}
            >
              {startingVerification ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {normalizedStatus === 'PENDING_REVIEW'
                    ? 'Verification In Review'
                    : profile?.is_verified && !expired
                      ? 'Reverify Identity'
                      : 'Start Identity Verification'}
                </Text>
              )}
            </TouchableOpacity>

            {normalizedStatus === 'PENDING_REVIEW' && (
              <Text style={[styles.pendingReviewHint, { color: colors.textSecondary }]}>Your last submission is currently under manual review. You can start a new attempt after review completion.</Text>
            )}
              </View>
          </View>
          </ScrollView>

          <View style={styles.navbarContainer}>
            <Navbar />
          </View>
        </View>
      </View>

      <VerificationModal
        visible={showVerificationModal}
        url={verificationUrl}
        onClose={handleVerificationClose}
        onSuccess={handleVerificationSuccess}
      />

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
  container: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
    width: '100%',
  },
  pageFrameWeb: {
    maxWidth: 1240,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
  },
  scrollContentWeb: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'center',
    paddingTop: 12,
  },
  webSectionCard: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statusLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    marginLeft: 8,
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontFamily: 'Poppins_400Regular',
  },
  detailValue: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  hintText: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  actionButton: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    minHeight: 52,
  },
  actionPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  pendingReviewHint: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    marginBottom: 8,
    fontFamily: 'Poppins_700Bold',
  },
  emptyMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
  },
  navbarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
