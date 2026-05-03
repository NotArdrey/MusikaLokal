import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import InAppMediaViewer from '../../src/components/InAppMediaViewer';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { invalidateAdminPageCache } from './_cache';

const readErrorContextMessage = async (context: unknown): Promise<string | null> => {
  if (!context) return null;

  const contextAny = context as {
    clone?: () => any;
    json?: () => Promise<any>;
    text?: () => Promise<string>;
    status?: number;
    error?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const tryExtract = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === 'string' && value.trim()) return value.trim();

    if (typeof value === 'object') {
      const maybe = [value.error, value.message, value.details, value.hint].find(
        (item) => typeof item === 'string' && item.trim().length > 0,
      );
      if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
    }

    return null;
  };

  const directMessage = tryExtract(contextAny);
  if (directMessage) return directMessage;

  try {
    if (typeof contextAny.clone === 'function') {
      const parsed = await contextAny.clone().json();
      const parsedMessage = tryExtract(parsed);
      if (parsedMessage) return parsedMessage;
    } else if (typeof contextAny.json === 'function') {
      const parsed = await contextAny.json();
      const parsedMessage = tryExtract(parsed);
      if (parsedMessage) return parsedMessage;
    }
  } catch {
    // Ignore JSON parsing failures and fallback to text parsing below.
  }

  try {
    let rawText = '';

    if (typeof contextAny.clone === 'function') {
      rawText = await contextAny.clone().text();
    } else if (typeof contextAny.text === 'function') {
      rawText = await contextAny.text();
    }

    if (!rawText) return null;

    try {
      const parsed = JSON.parse(rawText);
      const parsedMessage = tryExtract(parsed);
      if (parsedMessage) return parsedMessage;
    } catch {
      // Plain text fallback
    }

    return rawText.trim() || null;
  } catch {
    return null;
  }
};

const cleanManualReviewEmailError = (rawError: string) => {
  const value = String(rawError || '').trim();
  if (!value) return '';

  const normalized = value.toLowerCase();
  if (
    normalized.includes('only send testing emails') ||
    normalized.includes('verify a domain') ||
    normalized.includes('resend is in testing mode')
  ) {
    return 'The Gmail test sender is not configured yet. Set GMAIL_MAILER_URL or GMAIL_SMTP_USER/GMAIL_SMTP_APP_PASSWORD in Supabase secrets.';
  }

  return value.replace(/;?\s*queued in email_notifications\.?$/i, '').trim();
};

type Tab = 'dashboard' | 'users' | 'reports' | 'audit' | 'posts' | 'products';

interface ManualIdentityReviewEntry {
  id: string;
  user_id: string;
  submitted_by_email: string;
  document_type: string;
  document_type_key?: string | null;
  document_country: string;
  source: string;
  status: string;
  created_at: string;
  expected_decision_by?: string | null;
  review_notes?: string | null;
  front_image_url?: string | null;
  back_image_url?: string | null;
  selfie_image_url?: string | null;
  profile?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    verification_status?: string | null;
    id_document_expiry?: string | null;
  } | null;
}

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  posts: '/admin/posts',
  products: '/admin/products',
};

const tabItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
];

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getErrorMessage = async (error: unknown, fallback: string) => {
  if (!error) return fallback;

  if (typeof error === 'string') return error;

  const err = error as {
    message?: string;
    details?: string;
    hint?: string;
    status?: number;
    context?: unknown;
  };

  const contextMessage = await readErrorContextMessage(err.context);
  const baseMessage = contextMessage || err.details || err.hint || err.message || fallback;

  if (!baseMessage) return fallback;

  const status = Number(err.status || 0);
  if (status && !baseMessage.toLowerCase().includes('status')) {
    return `${baseMessage} (status ${status})`;
  }

  return baseMessage;
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingVertical: 14,
  },
  flex1: {
    flex: 1,
  },
  inlineActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  modalActionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalButton: {
    minWidth: 108,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  modalInputCompact: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  primaryActionButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  queueBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  queueBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_700Bold',
    textTransform: 'uppercase',
  },
  queueHeaderCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  queueHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  queueHeaderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueHeaderTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: 'Poppins_700Bold',
  },
  queueHeaderSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  queueHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  queueHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  queueSearchBox: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 220,
  },
  queueSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    paddingVertical: 0,
  },
  queueToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  sectionHeading: {
    marginTop: 6,
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  sectionGap: {
    gap: 12,
  },
  smallActionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 0,
    gap: 4,
  },
  smallActionButtonFilled: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 132,
    flexGrow: 1,
    flexBasis: 0,
  },
  smallActionText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    flexShrink: 1,
    textAlign: 'center',
  },
  smallActionTextFilled: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    flexShrink: 1,
    textAlign: 'center',
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    position: 'relative',
  },
  tabsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'capitalize',
  },
});

export default function AdminIdentityReviewsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();

  const [initializingReviews, setInitializingReviews] = useState(false);
  const [manualReviews, setManualReviews] = useState<ManualIdentityReviewEntry[]>([]);
  const [manualReviewSearch, setManualReviewSearch] = useState('');
  const [manualReviewsLoading, setManualReviewsLoading] = useState(false);
  const [manualReviewActionLoadingId, setManualReviewActionLoadingId] = useState<string | null>(null);
  const [manualReviewModalVisible, setManualReviewModalVisible] = useState(false);
  const [manualReviewDecision, setManualReviewDecision] = useState<'APPROVED' | 'DECLINED'>('APPROVED');
  const [manualReviewNotes, setManualReviewNotes] = useState('');
  const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);
  const [manualReviewTarget, setManualReviewTarget] = useState<ManualIdentityReviewEntry | null>(null);
  const [manualReviewMediaPreview, setManualReviewMediaPreview] = useState<{ uri: string; title: string } | null>(null);
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showInlineTabNav = !(Platform.OS === 'web' && width >= 768);

  const showAlert = useCallback((type: AlertType, title: string, message: string) => {
    setAlertState({ visible: true, type, title, message });
  }, []);

  const handleTabChange = useCallback((nextTab: Tab) => {
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const invokeAdminUsersManagement = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke<any>('admin-users-management', {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      return data;
    },
    [],
  );

  const fetchManualReviews = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setManualReviewsLoading(true);
    }

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_manual_identity_reviews',
        limit: 150,
        status: 'PENDING_REVIEW',
      });

      const items = Array.isArray(data?.items) ? (data.items as ManualIdentityReviewEntry[]) : [];
      setManualReviews(items);
    } catch (error) {
      if (!options?.silent) {
        const message = await getErrorMessage(error, 'Unable to fetch identity queue.');
        showAlert('error', 'Failed to load identity queue', message);
      }
    } finally {
      if (!options?.silent) {
        setManualReviewsLoading(false);
      }
    }
  }, [invokeAdminUsersManagement, showAlert]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingReviews(false);
      return;
    }

    let isMounted = true;
    setInitializingReviews(true);

    void (async () => {
      try {
        await fetchManualReviews({ silent: true });
      } finally {
        if (isMounted) {
          setInitializingReviews(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loading, roleResolved, session, isGuest, isAdmin, fetchManualReviews]);

  const openManualReviewAsset = useCallback((url?: string | null, title = 'Uploaded file') => {
    const normalized = String(url || '').trim();
    if (!normalized) {
      showAlert('warning', 'File unavailable', 'No uploaded file was found for this item.');
      return;
    }

    setManualReviewMediaPreview({ uri: normalized, title });
  }, [showAlert]);

  const openManualReviewDecisionModal = useCallback((targetReview: ManualIdentityReviewEntry, decision: 'APPROVED' | 'DECLINED') => {
    setManualReviewTarget(targetReview);
    setManualReviewDecision(decision);
    setManualReviewNotes('');
    setManualReviewModalVisible(true);
  }, []);

  const closeManualReviewDecisionModal = useCallback(() => {
    if (manualReviewSubmitting) return;
    setManualReviewModalVisible(false);
    setManualReviewTarget(null);
    setManualReviewNotes('');
    setManualReviewDecision('APPROVED');
  }, [manualReviewSubmitting]);

  const submitManualReviewDecision = useCallback(async () => {
    if (!manualReviewTarget?.id) {
      showAlert('warning', 'Missing review', 'Select a review before submitting a decision.');
      return;
    }

    setManualReviewSubmitting(true);
    setManualReviewActionLoadingId(manualReviewTarget.id);

    try {
      const data = await invokeAdminUsersManagement({
        action: 'review_manual_identity',
        reviewId: manualReviewTarget.id,
        decision: manualReviewDecision,
        reviewNotes: manualReviewNotes.trim() || null,
      });

      const reviewedItem = data?.item || {};
      const emailSent = Boolean(reviewedItem.decision_email_sent);
      const emailQueued = Boolean(reviewedItem.decision_email_queued);
      const emailError = String(reviewedItem.decision_email_error || '').trim();
      console.log('manual identity review email result', {
        reviewId: manualReviewTarget.id,
        decision: manualReviewDecision,
        sent: emailSent,
        queued: emailQueued,
        provider: reviewedItem.decision_email_provider || null,
        error: emailError || null,
      });
      const cleanEmailError = cleanManualReviewEmailError(emailError);
      const emailMessage = emailSent
        ? 'The decision was saved and the email notification was sent automatically.'
        : emailQueued
          ? `The decision was saved. The email is queued for later delivery. ${cleanEmailError || 'Check the Gmail sender secrets or account limit.'}`
          : `The decision was saved, but the email notification was not sent. ${cleanEmailError || 'Check the email provider configuration.'}`;

      showAlert(
        emailSent ? 'success' : 'warning',
        manualReviewDecision === 'APPROVED' ? 'Identity approved' : 'Identity declined',
        emailMessage,
      );

      setManualReviewModalVisible(false);
      setManualReviewTarget(null);
      setManualReviewNotes('');
      setManualReviewDecision('APPROVED');

      invalidateAdminPageCache();
      await fetchManualReviews();
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to save manual identity decision.');
      showAlert('error', 'Failed to save decision', message);
    } finally {
      setManualReviewSubmitting(false);
      setManualReviewActionLoadingId(null);
    }
  }, [
    manualReviewTarget,
    manualReviewDecision,
    manualReviewNotes,
    invokeAdminUsersManagement,
    showAlert,
    fetchManualReviews,
  ]);

  const filteredManualReviews = useMemo(() => {
    const q = manualReviewSearch.trim().toLowerCase();
    if (!q) return manualReviews;

    return manualReviews.filter((review) => {
      const searchableText = [
        review.profile?.full_name,
        review.profile?.email,
        review.submitted_by_email,
        review.document_type,
        review.document_country,
        review.source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(q);
    });
  }, [manualReviews, manualReviewSearch]);

  if (loading || !roleResolved || initializingReviews) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading identity reviews...</Text>
      </View>
    );
  }

  if (!session || isGuest || !isAdmin) {
    return null;
  }

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Admin" hideBackButton />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {showInlineTabNav && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {tabItems.map((item) => {
              const active = item.key === 'users';
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={1}
                  onPress={() => handleTabChange(item.key)}
                  style={[
                    styles.tabButton,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#F3F4F6'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={16}
                    color={active ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.sectionGap}>
          <View style={[styles.queueHeaderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.queueHeaderTop}>
              <View style={styles.queueHeaderTitleRow}>
                <View style={[styles.queueHeaderIcon, { backgroundColor: `${colors.primary}1A` }]}>
                  <Ionicons name="id-card-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.queueHeaderCopy}>
                  <Text style={[styles.queueHeaderTitle, { color: colors.text }]}>Identity Reviews</Text>
                  <Text style={[styles.queueHeaderSubtitle, { color: colors.textSecondary }]}>
                    Review unsupported ID uploads from signup and save the final decision.
                  </Text>
                </View>
              </View>

              <View style={[styles.queueBadge, { backgroundColor: `${colors.primary}1A` }]}>
                <Text style={[styles.queueBadgeText, { color: colors.primary }]}>
                  {manualReviews.length} pending
                </Text>
              </View>
            </View>

            <View style={styles.queueToolbar}>
              <View
                style={[
                  styles.queueSearchBox,
                  {
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                  },
                ]}
              >
                <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                <TextInput
                  value={manualReviewSearch}
                  onChangeText={setManualReviewSearch}
                  placeholder="Search identity reviews"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.queueSearchInput,
                    {
                      color: colors.text,
                    },
                  ]}
                />
              </View>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void fetchManualReviews()}
                disabled={manualReviewsLoading}
                style={[styles.primaryActionButton, { backgroundColor: colors.primary, opacity: manualReviewsLoading ? 0.7 : 1 }]}
              >
                <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </View>

          {manualReviewsLoading ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : filteredManualReviews.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No identity reviews found.</Text>
          ) : (
            <View style={styles.sectionGap}>
              {filteredManualReviews.map((review) => {
                const profileName = review.profile?.full_name || review.submitted_by_email || 'Unknown user';
                const profileEmail = review.profile?.email || review.submitted_by_email || '-';
                const isReviewBusy = manualReviewActionLoadingId === review.id;

                return (
                  <View key={review.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{profileName}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{profileEmail}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Document: {review.document_type} ({review.document_country || 'PHL'})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>ID expires: {review.profile?.id_document_expiry || '-'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Source: {String(review.source || 'MANUAL_UPLOAD').replace(/_/g, ' ')}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Submitted: {formatDateTime(review.created_at)}</Text>
                    {review.expected_decision_by ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Expected by: {formatDateTime(review.expected_decision_by)}</Text>
                    ) : null}

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => openManualReviewAsset(review.front_image_url, 'Front of ID')}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        <Ionicons name="image-outline" size={14} color={colors.text} />
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Front</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => openManualReviewAsset(review.back_image_url, 'Back of ID')}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        <Ionicons name="images-outline" size={14} color={colors.text} />
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Back</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => openManualReviewAsset(review.selfie_image_url, 'Selfie holding ID')}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        <Ionicons name="person-circle-outline" size={14} color={colors.text} />
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Selfie</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={isReviewBusy}
                        onPress={() => openManualReviewDecisionModal(review, 'APPROVED')}
                        style={[
                          styles.smallActionButtonFilled,
                          { backgroundColor: '#16A34A', opacity: isReviewBusy ? 0.6 : 1 },
                        ]}
                      >
                        {isReviewBusy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.smallActionTextFilled}>Approve</Text>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={isReviewBusy}
                        onPress={() => openManualReviewDecisionModal(review, 'DECLINED')}
                        style={[
                          styles.smallActionButtonFilled,
                          { backgroundColor: '#DC2626', opacity: isReviewBusy ? 0.6 : 1 },
                        ]}
                      >
                        {isReviewBusy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.smallActionTextFilled}>Decline</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={manualReviewModalVisible} transparent animationType="fade" onRequestClose={closeManualReviewDecisionModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Review Identity Submission</Text>

            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Decision: {manualReviewDecision === 'APPROVED' ? 'Approve' : 'Decline'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              User: {manualReviewTarget?.profile?.full_name || manualReviewTarget?.submitted_by_email || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              ID expires: {manualReviewTarget?.profile?.id_document_expiry || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Document: {manualReviewTarget?.document_type || '-'}
            </Text>

            <TextInput
              value={manualReviewNotes}
              onChangeText={setManualReviewNotes}
              multiline
              numberOfLines={4}
              placeholder="Optional admin notes"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.modalInputCompact,
                {
                  minHeight: 96,
                  color: colors.text,
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                  textAlignVertical: 'top',
                },
              ]}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeManualReviewDecisionModal}
                disabled={manualReviewSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void submitManualReviewDecision()}
                disabled={manualReviewSubmitting}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: manualReviewDecision === 'APPROVED' ? '#16A34A' : '#DC2626',
                    opacity: manualReviewSubmitting ? 0.6 : 1,
                  },
                ]}
              >
                {manualReviewSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Confirm {manualReviewDecision === 'APPROVED' ? 'Approval' : 'Decline'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <InAppMediaViewer
        visible={Boolean(manualReviewMediaPreview)}
        uri={manualReviewMediaPreview?.uri || null}
        title={manualReviewMediaPreview?.title || 'Uploaded file'}
        onClose={() => setManualReviewMediaPreview(null)}
      />

      <CustomAlert
        visible={alertState.visible}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        onClose={() => setAlertState((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}
