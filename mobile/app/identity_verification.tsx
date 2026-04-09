import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import VerificationModal from '../src/components/VerificationModal';
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

const isDateExpired = (value: string | null): boolean => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date <= new Date();
};

export default function IdentityVerificationScreen() {
  const { colors, isDark } = useTheme();
  const { userId, session, isGuest, checkIdentityStatus } = useAuth();

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
      const { data, error } = await supabase.functions.invoke('create-didit-session', {
        body: {
          userId,
          redirect_url: 'musikalokal://verification-callback',
        },
      });

      if (error) throw error;
      if (!data?.success || !data?.verificationUrl) {
        throw new Error(data?.error || 'Failed to start identity verification.');
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
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Identity Verification" />
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Sign in required</Text>
          <Text style={[styles.emptyMessage, { color: colors.textSecondary }]}>Please sign in to manage your identity verification status.</Text>
          <TouchableOpacity activeOpacity={1} onPress={() => router.replace('/')} style={[styles.actionButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.actionButtonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Identity Verification" />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Status</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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

                  <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>ID Expiry Date</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(profile?.id_document_expiry || null)}</Text>
                  </View>

                  <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Verified</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>{formatDate(profile?.id_verified_at || null)}</Text>
                  </View>

                  <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                    This flow is only for identity documents. It does not change email verification.
                  </Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.sectionContainer}>
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
        </ScrollView>

        <View style={styles.navbarContainer}>
          <Navbar />
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
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
