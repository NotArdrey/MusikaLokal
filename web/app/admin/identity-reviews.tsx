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
type ManualReviewAssetKind = 'front' | 'back' | 'selfie';

interface IdentityMatchAccount {
  claim_id?: string | null;
  didit_session_id?: string | null;
  manual_review_id?: string | null;
  user_id?: string | null;
  original_user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  source?: string | null;
  claim_status?: string | null;
  verified_at?: string | null;
  birth_date?: string | null;
  matched_on?: string | null;
  match_type?: string | null;
  match_label?: string | null;
  front_image_url?: string | null;
  back_image_url?: string | null;
  selfie_image_url?: string | null;
}

interface ManualIdentityReviewEntry {
  id: string;
  user_id: string;
  submitted_by_email: string;
  submitted_role?: string | null;
  document_type: string;
  document_type_key?: string | null;
  document_country: string;
  source: string;
  status: string;
  didit_session_id?: string | null;
  document_fingerprint?: string | null;
  verified_full_legal_name?: string | null;
  normalized_full_legal_name?: string | null;
  birth_date?: string | null;
  review_reason?: string | null;
  matched_on?: string | null;
  metadata?: Record<string, unknown> | null;
  didit_review?: {
    status?: string | null;
    session_id?: string | null;
    action_available?: boolean;
    last_synced_at?: string | null;
    assets_available?: boolean;
    assets_error?: string | null;
  } | null;
  duplicate_reason?: string | null;
  duplicate_match_count?: number | null;
  duplicate_verified_identity_warning?: {
    same_verified_id_fingerprint?: boolean;
    same_role?: boolean;
    different_email_or_account?: boolean;
    match_count?: number;
    matched_accounts?: IdentityMatchAccount[];
  } | null;
  identity_match_warning?: {
    same_role?: boolean;
    match_count?: number;
    match_types?: string[];
    has_document_match?: boolean;
    has_name_birthdate_match?: boolean;
    review_reason?: string | null;
    matched_on?: string | null;
    matched_accounts?: IdentityMatchAccount[];
  } | null;
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
    role?: string | null;
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

const isDiditBackedReviewSource = (source?: string | null, sessionId?: string | null) => (
  Boolean(String(sessionId || '').trim()) && String(source || '').trim().toUpperCase().startsWith('DIDIT')
);

const formatDiditStatusLabel = (rawStatus?: string | null) => {
  const value = String(rawStatus || '').trim();
  const normalized = value.replace(/[\s-]+/g, '_').toUpperCase();

  if (normalized === 'PENDING_REVIEW' || normalized === 'IN_REVIEW') return 'In Review';
  if (normalized === 'APPROVED') return 'Approved';
  if (normalized === 'DECLINED') return 'Declined';
  if (normalized === 'RESUBMITTED') return 'Resubmitted';
  if (normalized === 'IN_PROGRESS') return 'In Progress';
  if (normalized === 'NOT_STARTED') return 'Not Started';
  if (normalized === 'ABANDONED') return 'Abandoned';
  if (normalized === 'EXPIRED') return 'Expired';
  if (normalized === 'KYC_EXPIRED') return 'Kyc Expired';

  return value || 'In Review';
};

const getDiditReviewInfo = (review?: ManualIdentityReviewEntry | null) => {
  if (!review || !isDiditBackedReviewSource(review.source, review.didit_session_id || review.didit_review?.session_id)) return null;

  const metadata = review.metadata || {};
  const metadataStatus = metadata['didit_status'] || metadata['source_session_status'];
  const sessionId = review.didit_review?.session_id || review.didit_session_id || null;
  const source = String(review.source || '').trim().toUpperCase();

  return {
    status: formatDiditStatusLabel(review.didit_review?.status || String(metadataStatus || review.status || 'PENDING_REVIEW')),
    session_id: sessionId,
    action_available: Boolean(review.didit_review?.action_available ?? (source === 'DIDIT_PENDING' && sessionId)),
    last_synced_at: review.didit_review?.last_synced_at || String(metadata['didit_status_synced_at'] || '') || null,
    assets_available: Boolean(review.didit_review?.assets_available),
    assets_error: review.didit_review?.assets_error || null,
  };
};

const getManualReviewAssetUrl = (review: ManualIdentityReviewEntry, asset: ManualReviewAssetKind) => {
  if (asset === 'front') return String(review.front_image_url || '').trim();
  if (asset === 'back') return String(review.back_image_url || '').trim();
  return String(review.selfie_image_url || '').trim();
};

const getManualReviewAssetTitle = (asset: ManualReviewAssetKind) => {
  if (asset === 'front') return 'Front of ID';
  if (asset === 'back') return 'Back of ID';
  return 'Selfie holding ID';
};

const getIdentityMatchAccountKey = (account: IdentityMatchAccount, index: number) => (
  String(
    account.claim_id ||
      account.didit_session_id ||
      account.manual_review_id ||
      account.user_id ||
      account.original_user_id ||
      account.email ||
      `match-${index}`,
  )
);

const getIdentityMatchAccountAssetUrl = (account: Partial<IdentityMatchAccount>, asset: ManualReviewAssetKind) => {
  if (asset === 'front') return String(account.front_image_url || '').trim();
  if (asset === 'back') return String(account.back_image_url || '').trim();
  return String(account.selfie_image_url || '').trim();
};

const formatDiditSessionLabel = (sessionId?: string | null) => {
  const value = String(sessionId || '').trim();
  if (!value) return '-';
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
};

const formatIdentityMatchType = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'NAME_BIRTHDATE') return 'Same name + birthdate';
  if (normalized === 'DOCUMENT_FINGERPRINT') return 'Same verified ID';
  return 'Possible identity match';
};

const formatIdentityReviewReason = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SAME_NAME_BIRTHDATE_EXISTING_APPROVED_IDENTITY') {
    return 'Same legal name and birthdate as an approved same-role identity';
  }
  if (normalized === 'MISSING_DOCUMENT_FINGERPRINT') {
    return 'Missing verified document fingerprint';
  }
  if (normalized === 'DUPLICATE_DOCUMENT_FINGERPRINT') {
    return 'Same verified ID document as an approved same-role identity';
  }
  if (normalized === 'SAME_ROLE_DUPLICATE_DOCUMENT') {
    return 'Same-role duplicate ID document';
  }
  return String(value || '').trim() || 'Pending manual identity review';
};

const normalizeIdentityMatchTypeValue = (value?: string | null, fallback = 'DOCUMENT_FINGERPRINT') => {
  const normalized = String(value || fallback || '').trim().toUpperCase();
  return normalized || fallback;
};

const normalizeDateOnly = (value: unknown) => {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
};

const getMetadataMatchArrays = (metadata: Record<string, unknown>) => {
  const approvalClaimResult = metadata['approval_claim_result'] && typeof metadata['approval_claim_result'] === 'object'
    ? metadata['approval_claim_result'] as Record<string, unknown>
    : {};
  const claimResult = metadata['claim_result'] && typeof metadata['claim_result'] === 'object'
    ? metadata['claim_result'] as Record<string, unknown>
    : {};

  return [
    metadata['duplicate_matches'],
    metadata['matches'],
    approvalClaimResult['matches'],
    claimResult['matches'],
  ].filter(Array.isArray) as Record<string, unknown>[][];
};

const mapMetadataMatchAccount = (rawMatch: Record<string, unknown>, fallbackMatchedOn: string): IdentityMatchAccount | null => {
  const rawProfile = rawMatch['profiles'] && typeof rawMatch['profiles'] === 'object'
    ? rawMatch['profiles'] as Record<string, unknown>
    : {};
  const userId = String(rawMatch['user_id'] || rawMatch['original_user_id'] || rawMatch['matched_existing_user_id'] || '').trim();
  const originalUserId = String(rawMatch['original_user_id'] || '').trim();
  const email = String(rawMatch['email'] || rawMatch['normalized_email'] || rawProfile['email'] || '').trim().toLowerCase();

  if (!userId && !email) return null;

  const matchedOn = normalizeIdentityMatchTypeValue(
    String(rawMatch['matched_on'] || rawMatch['match_type'] || fallbackMatchedOn || ''),
  );

  return {
    claim_id: String(rawMatch['claim_id'] || rawMatch['identity_document_claim_id'] || rawMatch['id'] || '').trim() || null,
    didit_session_id: String(rawMatch['didit_session_id'] || rawMatch['diditSessionId'] || rawMatch['session_id'] || '').trim() || null,
    manual_review_id: String(rawMatch['manual_review_id'] || rawMatch['manualReviewId'] || '').trim() || null,
    user_id: userId || null,
    original_user_id: originalUserId || null,
    email: email || null,
    full_name: String(rawMatch['full_name'] || rawMatch['verified_full_legal_name'] || rawProfile['full_name'] || '').trim() || null,
    role: String(rawMatch['role'] || '').trim() || null,
    source: String(rawMatch['source'] || '').trim() || null,
    claim_status: String(rawMatch['claim_status'] || rawMatch['status'] || 'APPROVED').trim() || null,
    verified_at: String(rawMatch['verified_at'] || rawMatch['created_at'] || '').trim() || null,
    birth_date: normalizeDateOnly(rawMatch['birth_date']),
    matched_on: matchedOn,
    match_type: matchedOn,
    match_label: formatIdentityMatchType(matchedOn),
    front_image_url: String(rawMatch['front_image_url'] || '').trim() || null,
    back_image_url: String(rawMatch['back_image_url'] || '').trim() || null,
    selfie_image_url: String(rawMatch['selfie_image_url'] || '').trim() || null,
  };
};

const getMetadataMatchAccounts = (review: ManualIdentityReviewEntry, fallbackMatchedOn: string) => {
  const metadata = review.metadata || {};
  const reviewEmail = String(review.profile?.email || review.submitted_by_email || '').trim().toLowerCase();
  const accounts: IdentityMatchAccount[] = [];

  for (const source of getMetadataMatchArrays(metadata)) {
    for (const rawMatch of source) {
      const account = mapMetadataMatchAccount(rawMatch, fallbackMatchedOn);
      if (!account) continue;

      const matchUserId = String(account.user_id || '').trim();
      const matchEmail = String(account.email || '').trim().toLowerCase();
      if (matchUserId === String(review.user_id || '').trim()) continue;
      if (reviewEmail && matchEmail && matchEmail === reviewEmail) continue;

      const existingIndex = accounts.findIndex((existing) => (
        String(existing.user_id || existing.email || '') === String(account.user_id || account.email || '') &&
        String(existing.matched_on || existing.match_type || '') === String(account.matched_on || account.match_type || '')
      ));
      if (existingIndex < 0) {
        accounts.push(account);
      }
    }
  }

  return accounts;
};

const findIdentityAccountFallback = (account: IdentityMatchAccount, fallbacks: IdentityMatchAccount[]) => {
  const accountUserId = String(account.user_id || account.original_user_id || '').trim();
  const accountEmail = String(account.email || '').trim().toLowerCase();
  const accountMatchType = String(account.matched_on || account.match_type || '').trim();

  return fallbacks.find((candidate) => {
    const candidateUserId = String(candidate.user_id || candidate.original_user_id || '').trim();
    const candidateEmail = String(candidate.email || '').trim().toLowerCase();
    const candidateMatchType = String(candidate.matched_on || candidate.match_type || '').trim();
    const sameIdentity = Boolean(accountUserId && candidateUserId && accountUserId === candidateUserId) ||
      Boolean(accountEmail && candidateEmail && accountEmail === candidateEmail);

    return sameIdentity && (!accountMatchType || !candidateMatchType || accountMatchType === candidateMatchType);
  }) || null;
};

const mergeIdentityMatchAccounts = (accounts: IdentityMatchAccount[], fallbacks: IdentityMatchAccount[]) => {
  const merged = accounts.map((account) => {
    const fallback = findIdentityAccountFallback(account, fallbacks);
    if (!fallback) return account;

    return {
      ...fallback,
      ...account,
      claim_id: account.claim_id || fallback.claim_id || null,
      didit_session_id: account.didit_session_id || fallback.didit_session_id || null,
      manual_review_id: account.manual_review_id || fallback.manual_review_id || null,
      original_user_id: account.original_user_id || fallback.original_user_id || null,
      front_image_url: account.front_image_url || fallback.front_image_url || null,
      back_image_url: account.back_image_url || fallback.back_image_url || null,
      selfie_image_url: account.selfie_image_url || fallback.selfie_image_url || null,
    };
  });

  const fallbackOnly = fallbacks.filter((fallback) => !findIdentityAccountFallback(fallback, merged));
  return [...merged, ...fallbackOnly];
};

const getIdentityMatchWarning = (review?: ManualIdentityReviewEntry | null) => {
  if (!review) return null;
  const metadata = review.metadata || {};
  const metadataMatchedOn = String(metadata['matched_on'] || '').trim();
  const metadataReviewReason = String(metadata['review_reason'] || '').trim();
  const fallbackMatchCount = Number(review.duplicate_match_count || 0);
  const fallbackMatchedOn = review.matched_on || metadataMatchedOn || 'DOCUMENT_FINGERPRINT';
  const metadataAccounts = getMetadataMatchAccounts(review, fallbackMatchedOn);

  if (review.identity_match_warning) {
    const existingAccounts = review.identity_match_warning.matched_accounts || [];
    const mergedAccounts = mergeIdentityMatchAccounts(existingAccounts, metadataAccounts);
    return {
      ...review.identity_match_warning,
      match_count: Math.max(
        Number(review.identity_match_warning.match_count || 0),
        fallbackMatchCount,
        mergedAccounts.length,
      ),
      matched_accounts: mergedAccounts,
    };
  }

  if (!review.duplicate_verified_identity_warning) {
    if (!fallbackMatchCount && !review.duplicate_reason && !review.review_reason && !metadataReviewReason) return null;

    return {
      same_role: true,
      match_count: Math.max(fallbackMatchCount, metadataAccounts.length),
      match_types: [fallbackMatchedOn].filter(Boolean) as string[],
      has_document_match: fallbackMatchedOn === 'DOCUMENT_FINGERPRINT',
      has_name_birthdate_match: fallbackMatchedOn === 'NAME_BIRTHDATE',
      review_reason: review.review_reason || metadataReviewReason || review.duplicate_reason || null,
      matched_on: fallbackMatchedOn,
      matched_accounts: metadataAccounts,
    };
  }

  const duplicateAccounts = review.duplicate_verified_identity_warning.matched_accounts || [];
  const mergedDuplicateAccounts = mergeIdentityMatchAccounts(duplicateAccounts, metadataAccounts);
  return {
    same_role: review.duplicate_verified_identity_warning.same_role,
    match_count: Math.max(
      Number(review.duplicate_verified_identity_warning.match_count || 0),
      fallbackMatchCount,
      mergedDuplicateAccounts.length,
    ),
    match_types: ['DOCUMENT_FINGERPRINT'],
    has_document_match: true,
    has_name_birthdate_match: false,
    review_reason: review.review_reason || metadataReviewReason || review.duplicate_reason || null,
    matched_on: 'DOCUMENT_FINGERPRINT',
    matched_accounts: mergedDuplicateAccounts,
  };
};

const isE2EManualIdentityReview = (review?: ManualIdentityReviewEntry | null) => {
  if (!review) return false;
  const fingerprint = String(review.document_fingerprint || '').trim().toLowerCase();
  const submittedEmail = String(review.submitted_by_email || '').trim().toLowerCase();
  return fingerprint.startsWith('e2e-') || submittedEmail.startsWith('e2e+');
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
  duplicateWarningBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  duplicateWarningTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duplicateWarningTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_700Bold',
  },
  duplicateWarningText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  diditReviewBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
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
  overrideConfirmRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  overrideConfirmText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_500Medium',
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
  const [duplicateOverrideConfirmed, setDuplicateOverrideConfirmed] = useState(false);
  const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);
  const [manualReviewAssetLoading, setManualReviewAssetLoading] = useState<{ reviewId: string; asset: ManualReviewAssetKind } | null>(null);
  const [identityMatchAssetLoading, setIdentityMatchAssetLoading] = useState<{ key: string; asset: ManualReviewAssetKind } | null>(null);
  const [identityMatchAssetCache, setIdentityMatchAssetCache] = useState<Record<string, Partial<IdentityMatchAccount>>>({});
  const [manualReviewTarget, setManualReviewTarget] = useState<ManualIdentityReviewEntry | null>(null);
  const [identityMatchPreview, setIdentityMatchPreview] = useState<ManualIdentityReviewEntry | null>(null);
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

  const openManualReviewAsset = useCallback(async (review: ManualIdentityReviewEntry, asset: ManualReviewAssetKind) => {
    const title = getManualReviewAssetTitle(asset);
    const existingUrl = getManualReviewAssetUrl(review, asset);

    if (existingUrl) {
      setManualReviewMediaPreview({ uri: existingUrl, title });
      return;
    }

    const diditSessionId = review.didit_session_id || review.didit_review?.session_id || null;
    if (!isDiditBackedReviewSource(review.source, diditSessionId)) {
      showAlert('warning', 'File unavailable', 'No uploaded file was found for this item.');
      return;
    }

    setManualReviewAssetLoading({ reviewId: review.id, asset });

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_manual_identity_review_assets',
        reviewId: review.id,
      });
      const loadedItem = (data?.item || {}) as Partial<ManualIdentityReviewEntry>;
      const mergedReview = {
        ...review,
        ...loadedItem,
        didit_review: {
          ...(review.didit_review || {}),
          ...(loadedItem.didit_review || {}),
        },
      };
      const loadedUrl = getManualReviewAssetUrl(mergedReview as ManualIdentityReviewEntry, asset);

      setManualReviews((previousReviews) => previousReviews.map((item) => (
        item.id === review.id
          ? {
              ...item,
              ...loadedItem,
              didit_review: {
                ...(item.didit_review || {}),
                ...(loadedItem.didit_review || {}),
              },
            }
          : item
      )));

      if (!loadedUrl) {
        showAlert('warning', 'File unavailable', 'No uploaded file was found for this item.');
        return;
      }

      setManualReviewMediaPreview({ uri: loadedUrl, title });
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load the selected identity file.');
      showAlert('error', 'Failed to load file', message);
    } finally {
      setManualReviewAssetLoading((current) => (
        current?.reviewId === review.id && current.asset === asset ? null : current
      ));
    }
  }, [invokeAdminUsersManagement, showAlert]);

  const openIdentityMatchAccountAsset = useCallback(async (
    account: IdentityMatchAccount,
    index: number,
    asset: ManualReviewAssetKind,
  ) => {
    const accountKey = getIdentityMatchAccountKey(account, index);
    const cachedAccount = identityMatchAssetCache[accountKey] || {};
    const accountWithCache = { ...account, ...cachedAccount };
    const title = `${accountWithCache.full_name || accountWithCache.email || 'Matched account'} - ${getManualReviewAssetTitle(asset)}`;
    const existingUrl = getIdentityMatchAccountAssetUrl(accountWithCache, asset);

    if (existingUrl) {
      setManualReviewMediaPreview({ uri: existingUrl, title });
      return;
    }

    const claimId = String(account.claim_id || '').trim();
    const diditSessionId = String(account.didit_session_id || '').trim();
    const manualReviewId = String(account.manual_review_id || '').trim();

    if (!claimId && !diditSessionId && !manualReviewId) {
      showAlert('warning', 'File unavailable', 'This matched account does not have a saved identity claim or Didit session to load files from.');
      return;
    }

    setIdentityMatchAssetLoading({ key: accountKey, asset });

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_identity_match_assets',
        claimId: claimId || undefined,
        diditSessionId: diditSessionId || undefined,
        manualReviewId: manualReviewId || undefined,
      });
      const loadedItem = (data?.item || {}) as Partial<IdentityMatchAccount>;
      const mergedAccount = { ...accountWithCache, ...loadedItem };
      const loadedUrl = getIdentityMatchAccountAssetUrl(mergedAccount, asset);

      setIdentityMatchAssetCache((previousCache) => ({
        ...previousCache,
        [accountKey]: {
          ...(previousCache[accountKey] || {}),
          ...loadedItem,
        },
      }));

      if (!loadedUrl) {
        showAlert('warning', 'File unavailable', 'No uploaded file was found for this matched account.');
        return;
      }

      setManualReviewMediaPreview({ uri: loadedUrl, title });
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load the selected identity file.');
      showAlert('error', 'Failed to load file', message);
    } finally {
      setIdentityMatchAssetLoading((current) => (
        current?.key === accountKey && current.asset === asset ? null : current
      ));
    }
  }, [identityMatchAssetCache, invokeAdminUsersManagement, showAlert]);

  const openManualReviewDecisionModal = useCallback((targetReview: ManualIdentityReviewEntry, decision: 'APPROVED' | 'DECLINED') => {
    setManualReviewTarget(targetReview);
    setManualReviewDecision(decision);
    setManualReviewNotes('');
    setDuplicateOverrideConfirmed(false);
    setManualReviewModalVisible(true);
  }, []);

  const closeManualReviewDecisionModal = useCallback(() => {
    if (manualReviewSubmitting) return;
    setManualReviewModalVisible(false);
    setManualReviewTarget(null);
    setManualReviewNotes('');
    setDuplicateOverrideConfirmed(false);
    setManualReviewDecision('APPROVED');
  }, [manualReviewSubmitting]);

  const submitManualReviewDecision = useCallback(async () => {
    if (!manualReviewTarget?.id) {
      showAlert('warning', 'Missing review', 'Select a review before submitting a decision.');
      return;
    }

    const e2eDuplicateOverride = manualReviewDecision === 'APPROVED' && isE2EManualIdentityReview(manualReviewTarget);
    const effectiveDuplicateOverrideConfirmed = duplicateOverrideConfirmed || e2eDuplicateOverride;
    const requiresDuplicateOverride = manualReviewDecision === 'APPROVED' && Boolean(getIdentityMatchWarning(manualReviewTarget));
    if (requiresDuplicateOverride && (!effectiveDuplicateOverrideConfirmed || !manualReviewNotes.trim())) {
      showAlert('warning', 'Duplicate override required', 'Confirm the duplicate override and add admin notes before approving this review.');
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
        duplicateOverrideConfirmed: effectiveDuplicateOverrideConfirmed,
      });

      const reviewedItem = data?.item || {};
      const emailSent = Boolean(reviewedItem.decision_email_sent);
      const emailQueued = Boolean(reviewedItem.decision_email_queued);
      const emailError = String(reviewedItem.decision_email_error || '').trim();
      const diditSync = reviewedItem.didit_status_sync as { synced?: boolean; status?: string | null } | null | undefined;
      console.log('manual identity review email result', {
        reviewId: manualReviewTarget.id,
        decision: manualReviewDecision,
        sent: emailSent,
        queued: emailQueued,
        provider: reviewedItem.decision_email_provider || null,
        error: emailError || null,
        diditStatus: diditSync?.status || null,
      });
      const cleanEmailError = cleanManualReviewEmailError(emailError);
      const diditMessage = diditSync?.synced
        ? ` Didit was updated to ${formatDiditStatusLabel(diditSync.status)}.`
        : '';
      const emailMessage = emailSent
        ? `The decision was saved and the email notification was sent automatically.${diditMessage}`
        : emailQueued
          ? `The decision was saved.${diditMessage} The email is queued for later delivery. ${cleanEmailError || 'Check the Gmail sender secrets or account limit.'}`
          : `The decision was saved.${diditMessage} The email notification was not sent. ${cleanEmailError || 'Check the email provider configuration.'}`;

      showAlert(
        emailSent ? 'success' : 'warning',
        manualReviewDecision === 'APPROVED' ? 'Identity approved' : 'Identity declined',
        emailMessage,
      );

      setManualReviewModalVisible(false);
      setManualReviewTarget(null);
      setManualReviewNotes('');
      setDuplicateOverrideConfirmed(false);
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
    duplicateOverrideConfirmed,
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
        review.didit_session_id,
        getDiditReviewInfo(review)?.status,
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

  const manualReviewDiditInfo = getDiditReviewInfo(manualReviewTarget);
  const manualReviewMatchWarning = getIdentityMatchWarning(manualReviewTarget);
  const identityPreviewWarning = getIdentityMatchWarning(identityMatchPreview);
  const identityPreviewAccounts = identityPreviewWarning?.matched_accounts || [];
  const identityPreviewLoadingAsset = identityMatchPreview && manualReviewAssetLoading?.reviewId === identityMatchPreview.id
    ? manualReviewAssetLoading.asset
    : null;

  return (
    <View
      testID="admin-identity-reviews-page"
      accessibilityLabel="admin-identity-reviews-page"
      style={[styles.flex1, { backgroundColor: colors.background }]}
    >
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
                    Review manual uploads and Didit pending checks from signup.
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
                  testID="admin-identity-reviews-search-input"
                  accessibilityLabel="admin-identity-reviews-search-input"
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
                testID="admin-identity-reviews-refresh-button"
                accessibilityLabel="admin-identity-reviews-refresh-button"
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
                const loadingAsset = manualReviewAssetLoading?.reviewId === review.id ? manualReviewAssetLoading.asset : null;
                const identityMatchWarning = getIdentityMatchWarning(review);
                const matchedAccounts = identityMatchWarning?.matched_accounts || [];
                const reviewReason = review.review_reason || String(review.metadata?.['review_reason'] || '') || review.duplicate_reason || null;
                const matchTypeLabels = (identityMatchWarning?.match_types || [identityMatchWarning?.matched_on])
                  .filter(Boolean)
                  .map((matchType) => formatIdentityMatchType(String(matchType)));

                return (
                  <View
                    key={review.id}
                    testID={`admin-identity-review-card-${review.id}`}
                    accessibilityLabel={`admin-identity-review-card-${review.id}`}
                    style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{profileName}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{profileEmail}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Role: {review.profile?.role || review.submitted_role || '-'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Document: {review.document_type} ({review.document_country || 'PHL'})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>ID expires: {review.profile?.id_document_expiry || '-'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Source: {String(review.source || 'MANUAL_UPLOAD').replace(/_/g, ' ')}</Text>
                    {reviewReason ? (
                      <Text style={[styles.cardMeta, { color: isDark ? '#FBBF24' : '#D97706' }]}>
                        Review reason: {formatIdentityReviewReason(reviewReason)}
                      </Text>
                    ) : null}
                    {(identityMatchWarning?.match_count || review.duplicate_match_count) ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                        Matching same-role account(s): {Number(identityMatchWarning?.match_count || review.duplicate_match_count || 0)}
                      </Text>
                    ) : null}
                    {identityMatchWarning ? (
                      <View style={[styles.duplicateWarningBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.10)' : '#FFFBEB', borderColor: isDark ? '#FBBF24' : '#F59E0B' }]}>
                        <View style={styles.duplicateWarningTitleRow}>
                          <Ionicons name="warning-outline" size={16} color={isDark ? '#FBBF24' : '#D97706'} />
                          <Text style={[styles.duplicateWarningTitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>Possible same-role identity match</Text>
                        </View>
                        <Text style={[styles.duplicateWarningText, { color: isDark ? '#F8FAFC' : '#92400E' }]}>
                          Match type: {matchTypeLabels.length > 0 ? matchTypeLabels.join(', ') : 'Possible identity match'}
                        </Text>
                        <Text style={[styles.duplicateWarningText, { color: isDark ? '#F8FAFC' : '#92400E' }]}>
                          Matched account{Number(identityMatchWarning.match_count || 0) === 1 ? '' : 's'}: {Number(identityMatchWarning.match_count || matchedAccounts.length)}
                        </Text>
                        {matchedAccounts.slice(0, 3).map((account) => (
                          <Text key={String(account.user_id || account.email)} style={[styles.duplicateWarningText, { color: isDark ? '#F8FAFC' : '#92400E' }]}>
                            {account.email || account.user_id || 'Unknown account'} · {account.role || 'same role'}
                          </Text>
                        ))}
                        {identityMatchWarning.match_count || matchedAccounts.length > 0 ? (
                          <TouchableOpacity
                            testID={`admin-identity-review-match-${review.id}`}
                            accessibilityLabel={`admin-identity-review-match-${review.id}`}
                            activeOpacity={1}
                            onPress={() => setIdentityMatchPreview(review)}
                            style={[styles.smallActionButton, { borderColor: isDark ? '#FBBF24' : '#D97706', marginTop: 4, minWidth: 0, flexGrow: 0, flexBasis: 'auto' }]}
                          >
                            <Ionicons name="eye-outline" size={14} color={isDark ? '#FBBF24' : '#B45309'} />
                            <Text style={[styles.smallActionText, { color: isDark ? '#FBBF24' : '#B45309' }]}>View Match</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Submitted: {formatDateTime(review.created_at)}</Text>
                    {review.expected_decision_by ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Expected by: {formatDateTime(review.expected_decision_by)}</Text>
                    ) : null}

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        testID={`admin-identity-review-front-${review.id}`}
                        accessibilityLabel={`admin-identity-review-front-${review.id}`}
                        activeOpacity={1}
                        disabled={Boolean(loadingAsset)}
                        onPress={() => void openManualReviewAsset(review, 'front')}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: loadingAsset ? 0.65 : 1 }]}
                      >
                        {loadingAsset === 'front' ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <Ionicons name="image-outline" size={14} color={colors.text} />
                        )}
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Front</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID={`admin-identity-review-back-${review.id}`}
                        accessibilityLabel={`admin-identity-review-back-${review.id}`}
                        activeOpacity={1}
                        disabled={Boolean(loadingAsset)}
                        onPress={() => void openManualReviewAsset(review, 'back')}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: loadingAsset ? 0.65 : 1 }]}
                      >
                        {loadingAsset === 'back' ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <Ionicons name="images-outline" size={14} color={colors.text} />
                        )}
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Back</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID={`admin-identity-review-selfie-${review.id}`}
                        accessibilityLabel={`admin-identity-review-selfie-${review.id}`}
                        activeOpacity={1}
                        disabled={Boolean(loadingAsset)}
                        onPress={() => void openManualReviewAsset(review, 'selfie')}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: loadingAsset ? 0.65 : 1 }]}
                      >
                        {loadingAsset === 'selfie' ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <Ionicons name="person-circle-outline" size={14} color={colors.text} />
                        )}
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Selfie</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID={`admin-identity-review-approve-${review.id}`}
                        accessibilityLabel={`admin-identity-review-approve-${review.id}`}
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
                        testID={`admin-identity-review-decline-${review.id}`}
                        accessibilityLabel={`admin-identity-review-decline-${review.id}`}
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
          <View
            testID="admin-identity-review-decision-modal"
            accessibilityLabel="admin-identity-review-decision-modal"
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Review Identity Submission</Text>

            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Decision: {manualReviewDecision === 'APPROVED' ? 'Approve' : 'Decline'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              User: {manualReviewTarget?.profile?.full_name || manualReviewTarget?.submitted_by_email || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Role: {manualReviewTarget?.profile?.role || manualReviewTarget?.submitted_role || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              ID expires: {manualReviewTarget?.profile?.id_document_expiry || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Document: {manualReviewTarget?.document_type || '-'}
            </Text>
            {manualReviewDiditInfo ? (
              <View style={[styles.diditReviewBox, { backgroundColor: isDark ? '#172554' : '#EFF6FF', borderColor: '#3B82F6' }]}>
                <View style={styles.duplicateWarningTitleRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#2563EB" />
                  <Text style={[styles.duplicateWarningTitle, { color: isDark ? '#BFDBFE' : '#1D4ED8' }]}>Didit Review Sync</Text>
                </View>
                <Text style={[styles.duplicateWarningText, { color: isDark ? '#DBEAFE' : '#1E40AF' }]}>
                  Didit status: {manualReviewDiditInfo.status}
                </Text>
                {manualReviewDiditInfo.action_available ? (
                  <Text style={[styles.duplicateWarningText, { color: isDark ? '#DBEAFE' : '#1E40AF' }]}>
                    This decision will update Didit to {manualReviewDecision === 'APPROVED' ? 'Approved' : 'Declined'}.
                  </Text>
                ) : null}
                <Text style={[styles.duplicateWarningText, { color: isDark ? '#DBEAFE' : '#1E40AF' }]}>
                  Session: {formatDiditSessionLabel(manualReviewDiditInfo.session_id)}
                </Text>
                <Text style={[styles.duplicateWarningText, { color: isDark ? '#DBEAFE' : '#1E40AF' }]}>
                  Didit files: {manualReviewDiditInfo.assets_available ? 'Ready' : 'Unavailable'}
                </Text>
              </View>
            ) : null}
            {(manualReviewTarget?.review_reason || manualReviewTarget?.duplicate_reason) ? (
              <Text style={[styles.cardMeta, { color: isDark ? '#FBBF24' : '#D97706' }]}>
                {formatIdentityReviewReason(manualReviewTarget.review_reason || manualReviewTarget.duplicate_reason)}
              </Text>
            ) : null}
            {manualReviewMatchWarning ? (
              <View style={[styles.duplicateWarningBox, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.10)' : '#FFFBEB', borderColor: isDark ? '#FBBF24' : '#F59E0B' }]}>
                <View style={styles.duplicateWarningTitleRow}>
                  <Ionicons name="warning-outline" size={16} color={isDark ? '#FBBF24' : '#D97706'} />
                  <Text style={[styles.duplicateWarningTitle, { color: isDark ? '#FBBF24' : '#B45309' }]}>Possible same-role identity match</Text>
                </View>
                <Text style={[styles.duplicateWarningText, { color: isDark ? '#F8FAFC' : '#92400E' }]}>
                  Match type: {(manualReviewMatchWarning.match_types || [manualReviewMatchWarning.matched_on]).filter(Boolean).map((matchType) => formatIdentityMatchType(String(matchType))).join(', ') || 'Possible identity match'}.
                </Text>
                {manualReviewMatchWarning ? (
                  <TouchableOpacity
                    testID="admin-identity-review-modal-view-match"
                    accessibilityLabel="admin-identity-review-modal-view-match"
                    activeOpacity={1}
                    onPress={() => setIdentityMatchPreview(manualReviewTarget)}
                    style={[styles.smallActionButton, { borderColor: isDark ? '#FBBF24' : '#D97706', marginTop: 4, minWidth: 0, flexGrow: 0, flexBasis: 'auto' }]}
                  >
                    <Ionicons name="eye-outline" size={14} color={isDark ? '#FBBF24' : '#B45309'} />
                    <Text style={[styles.smallActionText, { color: isDark ? '#FBBF24' : '#B45309' }]}>View Match</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {manualReviewDecision === 'APPROVED' && manualReviewMatchWarning ? (
              <TouchableOpacity
                testID="admin-identity-review-duplicate-override"
                accessibilityLabel="admin-identity-review-duplicate-override"
                activeOpacity={1}
                onPress={() => setDuplicateOverrideConfirmed((current) => !current)}
                style={[styles.overrideConfirmRow, { borderColor: duplicateOverrideConfirmed ? (isDark ? '#FBBF24' : '#D97706') : colors.border }]}
              >
                <Ionicons
                  name={duplicateOverrideConfirmed ? 'checkbox-outline' : 'square-outline'}
                  size={20}
                  color={duplicateOverrideConfirmed ? (isDark ? '#FBBF24' : '#D97706') : colors.textSecondary}
                />
                <Text style={[styles.overrideConfirmText, { color: colors.text }]}>
                  I reviewed the matched account context and want to approve this matched identity case.
                </Text>
              </TouchableOpacity>
            ) : null}

            <TextInput
              testID="admin-identity-review-notes-input"
              accessibilityLabel="admin-identity-review-notes-input"
              value={manualReviewNotes}
              onChangeText={setManualReviewNotes}
              multiline
              numberOfLines={4}
              placeholder={manualReviewDecision === 'APPROVED' && manualReviewMatchWarning ? 'Required notes for matched identity approval' : 'Optional admin notes'}
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
                testID="admin-identity-review-cancel-button"
                accessibilityLabel="admin-identity-review-cancel-button"
                activeOpacity={1}
                onPress={closeManualReviewDecisionModal}
                disabled={manualReviewSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="admin-identity-review-confirm-button"
                accessibilityLabel="admin-identity-review-confirm-button"
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

      <Modal visible={Boolean(identityMatchPreview)} transparent animationType="fade" onRequestClose={() => setIdentityMatchPreview(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Possible Identity Match</Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Applicant: {identityMatchPreview?.profile?.full_name || identityMatchPreview?.submitted_by_email || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Role: {identityMatchPreview?.profile?.role || identityMatchPreview?.submitted_role || '-'}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Review reason: {formatIdentityReviewReason(identityPreviewWarning?.review_reason || identityMatchPreview?.review_reason || identityMatchPreview?.duplicate_reason)}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              Match type: {(identityPreviewWarning?.match_types || [identityPreviewWarning?.matched_on]).filter(Boolean).map((matchType) => formatIdentityMatchType(String(matchType))).join(', ') || 'Possible identity match'}
            </Text>

            {identityMatchPreview ? (
              <View style={[styles.duplicateWarningBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
                <Text style={[styles.duplicateWarningTitle, { color: colors.text }]}>Applicant ID and selfie</Text>
                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    activeOpacity={1}
                    disabled={Boolean(identityPreviewLoadingAsset)}
                    onPress={() => void openManualReviewAsset(identityMatchPreview, 'front')}
                    style={[styles.smallActionButton, { borderColor: colors.border, opacity: identityPreviewLoadingAsset ? 0.65 : 1 }]}
                  >
                    {identityPreviewLoadingAsset === 'front' ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name="image-outline" size={14} color={colors.text} />
                    )}
                    <Text style={[styles.smallActionText, { color: colors.text }]}>Front</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={1}
                    disabled={Boolean(identityPreviewLoadingAsset)}
                    onPress={() => void openManualReviewAsset(identityMatchPreview, 'back')}
                    style={[styles.smallActionButton, { borderColor: colors.border, opacity: identityPreviewLoadingAsset ? 0.65 : 1 }]}
                  >
                    {identityPreviewLoadingAsset === 'back' ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name="images-outline" size={14} color={colors.text} />
                    )}
                    <Text style={[styles.smallActionText, { color: colors.text }]}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={1}
                    disabled={Boolean(identityPreviewLoadingAsset)}
                    onPress={() => void openManualReviewAsset(identityMatchPreview, 'selfie')}
                    style={[styles.smallActionButton, { borderColor: colors.border, opacity: identityPreviewLoadingAsset ? 0.65 : 1 }]}
                  >
                    {identityPreviewLoadingAsset === 'selfie' ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Ionicons name="person-circle-outline" size={14} color={colors.text} />
                    )}
                    <Text style={[styles.smallActionText, { color: colors.text }]}>Selfie</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: width < 600 ? 360 : 420 }} showsVerticalScrollIndicator={false}>
              <View style={styles.sectionGap}>
                {identityPreviewAccounts.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    This review only has a saved match count. The matched account details were not stored with the original duplicate signal.
                  </Text>
                ) : identityPreviewAccounts.map((account, index) => {
                  const accountKey = getIdentityMatchAccountKey(account, index);
                  const displayAccount = { ...account, ...(identityMatchAssetCache[accountKey] || {}) };
                  const loadingMatchAsset = identityMatchAssetLoading?.key === accountKey ? identityMatchAssetLoading.asset : null;
                  const canLoadMatchAssets = Boolean(
                    displayAccount.claim_id ||
                      displayAccount.didit_session_id ||
                      displayAccount.manual_review_id ||
                      getIdentityMatchAccountAssetUrl(displayAccount, 'front') ||
                      getIdentityMatchAccountAssetUrl(displayAccount, 'back') ||
                      getIdentityMatchAccountAssetUrl(displayAccount, 'selfie'),
                  );

                  return (
                    <View key={accountKey} style={[styles.duplicateWarningBox, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC', borderColor: colors.border }]}>
                      <Text style={[styles.duplicateWarningTitle, { color: colors.text }]}>
                        {displayAccount.full_name || displayAccount.email || 'Approved account'}
                      </Text>
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Email: {displayAccount.email || '-'}</Text>
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Role: {displayAccount.role || '-'}</Text>
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Claim status: {String(displayAccount.claim_status || 'APPROVED').replace(/_/g, ' ')}</Text>
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Verified: {formatDateTime(displayAccount.verified_at)}</Text>
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Source: {String(displayAccount.source || '-').replace(/_/g, ' ')}</Text>
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Match: {displayAccount.match_label || formatIdentityMatchType(displayAccount.matched_on || displayAccount.match_type)}</Text>
                      {displayAccount.birth_date ? (
                        <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>Birthdate: {displayAccount.birth_date}</Text>
                      ) : null}
                      <Text style={[styles.duplicateWarningText, { color: colors.textSecondary }]}>User ID: {displayAccount.user_id || '-'}</Text>

                      {canLoadMatchAssets ? (
                        <View style={styles.cardActionsRow}>
                          <TouchableOpacity
                            activeOpacity={1}
                            disabled={Boolean(loadingMatchAsset)}
                            onPress={() => void openIdentityMatchAccountAsset(displayAccount as IdentityMatchAccount, index, 'front')}
                            style={[styles.smallActionButton, { borderColor: colors.border, opacity: loadingMatchAsset ? 0.65 : 1 }]}
                          >
                            {loadingMatchAsset === 'front' ? (
                              <ActivityIndicator size="small" color={colors.text} />
                            ) : (
                              <Ionicons name="image-outline" size={14} color={colors.text} />
                            )}
                            <Text style={[styles.smallActionText, { color: colors.text }]}>Front</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={1}
                            disabled={Boolean(loadingMatchAsset)}
                            onPress={() => void openIdentityMatchAccountAsset(displayAccount as IdentityMatchAccount, index, 'back')}
                            style={[styles.smallActionButton, { borderColor: colors.border, opacity: loadingMatchAsset ? 0.65 : 1 }]}
                          >
                            {loadingMatchAsset === 'back' ? (
                              <ActivityIndicator size="small" color={colors.text} />
                            ) : (
                              <Ionicons name="images-outline" size={14} color={colors.text} />
                            )}
                            <Text style={[styles.smallActionText, { color: colors.text }]}>Back</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={1}
                            disabled={Boolean(loadingMatchAsset)}
                            onPress={() => void openIdentityMatchAccountAsset(displayAccount as IdentityMatchAccount, index, 'selfie')}
                            style={[styles.smallActionButton, { borderColor: colors.border, opacity: loadingMatchAsset ? 0.65 : 1 }]}
                          >
                            {loadingMatchAsset === 'selfie' ? (
                              <ActivityIndicator size="small" color={colors.text} />
                            ) : (
                              <Ionicons name="person-circle-outline" size={14} color={colors.text} />
                            )}
                            <Text style={[styles.smallActionText, { color: colors.text }]}>Selfie</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setIdentityMatchPreview(null)}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
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
