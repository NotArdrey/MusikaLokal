
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getAdminPageCacheKey, invalidateAdminPageCache, readAdminPageCache, writeAdminPageCache } from './_cache';

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

type Tab = 'dashboard' | 'users' | 'reports' | 'audit' | 'deals' | 'posts' | 'products' | 'projects';

type UserRole = 'musician' | 'studio-owner' | 'venue-owner' | 'producer' | 'admin';

type SubscriptionStatusOption = 'none' | 'active' | 'cancelled' | 'expired';

type UserFilter = 'all' | 'musicians' | 'studio-owner' | 'venue-owner' | 'producer';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  deals: '/admin/deals',
  posts: '/admin/posts',
  products: '/admin/products',
  projects: '/admin/projects',
};

const USERS_CACHE_TTL_MS = 45_000;

interface UserEntry {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_verified: boolean;
  verification_status?: string | null;
  created_at: string;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  subscription_plan_id?: string | null;
}

interface UserDetailsEntry {
  profile: Record<string, unknown> | null;
}

interface UserDetailsRequestTarget {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

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
  } | null;
}

const subscriptionStatusOptions: SubscriptionStatusOption[] = ['none', 'active', 'cancelled', 'expired'];

const userRoleOptions: UserRole[] = ['musician', 'studio-owner', 'venue-owner', 'producer', 'admin'];

const userFilters: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'musicians', label: 'musicians' },
  { value: 'studio-owner', label: 'studio owner' },
  { value: 'venue-owner', label: 'venue owner' },
  { value: 'producer', label: 'producer' },
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

const isUnsupportedActionMessage = (message: string, action: string) => {
  const normalizedMessage = String(message || '').toLowerCase();
  const normalizedAction = String(action || '').toLowerCase();

  if (!normalizedMessage) return false;
  if (normalizedAction && normalizedMessage.includes(`unsupported action: ${normalizedAction}`)) {
    return true;
  }

  return normalizedMessage.includes('unsupported action') || normalizedMessage.includes('invalid action');
};

const normalizeSubscriptionStatus = (rawStatus: unknown): SubscriptionStatusOption => {
  const normalized = String(rawStatus || '').trim().toLowerCase() as SubscriptionStatusOption;
  return subscriptionStatusOptions.includes(normalized) ? normalized : 'none';
};

const normalizeUserRole = (rawRole: unknown): UserRole => {
  const normalized = String(rawRole || '').trim().toLowerCase();

  if (normalized === 'manager' || normalized === 'musician-member') {
    return 'musician';
  }

  return userRoleOptions.includes(normalized as UserRole) ? (normalized as UserRole) : 'musician';
};

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

import { formatDetailLabel, formatDetailValue } from './_formatters';

const styles = StyleSheet.create({
  booleanToggleButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  booleanToggleButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  booleanToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
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
  detailLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
  },
  detailRow: {
    gap: 4,
  },
  detailsEmptyText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  detailsRows: {
    gap: 8,
  },
  detailsScroll: {
    maxHeight: 460,
  },
  detailsScrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  detailsSection: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  detailsSectionTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailValue: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingVertical: 14,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    textTransform: 'capitalize',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  flex1: {
    flex: 1,
  },
  formLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
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
  modalCardLarge: {
    width: '100%',
    maxWidth: 760,
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
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
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
    gap: 4,
  },
  smallActionButtonFilled: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallActionText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  smallActionTextFilled: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
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

const tabItems: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'deals', label: 'Deals', icon: 'briefcase-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
  { key: 'projects', label: 'Projects', icon: 'people-circle-outline' },
];

export default function AdminUsersPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
  const hasHydratedUsersRef = useRef(false);

  const [initializingUsers, setInitializingUsers] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [userActionLoadingId, setUserActionLoadingId] = useState<string | null>(null);
  const [userDetailsLoadingKey, setUserDetailsLoadingKey] = useState<string | null>(null);

  const [userModalVisible, setUserModalVisible] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormFullName, setUserFormFullName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormRole, setUserFormRole] = useState<UserRole>('musician');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormIsVerified, setUserFormIsVerified] = useState(false);
  const [userFormEmailConfirmed, setUserFormEmailConfirmed] = useState(false);
  const [userFormSubscriptionStatus, setUserFormSubscriptionStatus] = useState<(typeof subscriptionStatusOptions)[number]>('none');
  const [userFormSubscriptionExpiresAt, setUserFormSubscriptionExpiresAt] = useState('');
  const [userFormSubscriptionPlanId, setUserFormSubscriptionPlanId] = useState('');
  const [userFormSubmitting, setUserFormSubmitting] = useState(false);
  const [userDetailsTarget, setUserDetailsTarget] = useState<UserDetailsEntry | null>(null);
  const [manualReviews, setManualReviews] = useState<ManualIdentityReviewEntry[]>([]);
  const [manualReviewsLoading, setManualReviewsLoading] = useState(false);
  const [manualReviewActionLoadingId, setManualReviewActionLoadingId] = useState<string | null>(null);
  const [manualReviewModalVisible, setManualReviewModalVisible] = useState(false);
  const [manualReviewDecision, setManualReviewDecision] = useState<'APPROVED' | 'DECLINED'>('APPROVED');
  const [manualReviewNotes, setManualReviewNotes] = useState('');
  const [manualReviewSubmitting, setManualReviewSubmitting] = useState(false);
  const [manualReviewTarget, setManualReviewTarget] = useState<ManualIdentityReviewEntry | null>(null);

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

  const usersCacheKey = useMemo(() => getAdminPageCacheKey('users'), []);

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'users') return;
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

  const invokeManageBookingsAction = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke<any>('manage-bookings', {
      body: payload,
    });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));

    return data;
  }, []);

  const fetchUsers = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setUsersLoading(true);
    }

    try {
      const data = await invokeAdminUsersManagement({
        action: 'fetch_users',
        limit: 300,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      setUsers(items);
      writeAdminPageCache(usersCacheKey, items);
    } catch (error) {
      if (!options?.silent) {
        const message = await getErrorMessage(error, 'Unable to fetch users.');
        showAlert('error', 'Failed to load users', message);
      }
    } finally {
      if (!options?.silent) {
        setUsersLoading(false);
      }
    }
  }, [showAlert, usersCacheKey, invokeAdminUsersManagement]);

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
        const message = await getErrorMessage(error, 'Unable to fetch manual identity reviews.');
        showAlert('error', 'Failed to load manual reviews', message);
      }
    } finally {
      if (!options?.silent) {
        setManualReviewsLoading(false);
      }
    }
  }, [invokeAdminUsersManagement, showAlert]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingUsers(false);
      hasHydratedUsersRef.current = false;
      return;
    }

    let isMounted = true;
    const cachedUsers = readAdminPageCache<UserEntry[]>(usersCacheKey, USERS_CACHE_TTL_MS);

    if (cachedUsers) {
      setUsers(cachedUsers);
      setInitializingUsers(false);
      hasHydratedUsersRef.current = true;
    } else if (!hasHydratedUsersRef.current) {
      setInitializingUsers(true);
    } else {
      setInitializingUsers(false);
    }

    void (async () => {
      try {
        await Promise.all([
          fetchUsers({ silent: Boolean(cachedUsers) }),
          fetchManualReviews({ silent: true }),
        ]);
      } finally {
        if (isMounted) {
          setInitializingUsers(false);
          hasHydratedUsersRef.current = true;
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loading, roleResolved, session, isGuest, isAdmin, usersCacheKey, fetchUsers, fetchManualReviews]);

  const resetUserForm = useCallback(() => {
    setUserFormFullName('');
    setUserFormEmail('');
    setUserFormRole('musician');
    setUserFormPassword('');
    setUserFormIsVerified(false);
    setUserFormEmailConfirmed(false);
    setUserFormSubscriptionStatus('none');
    setUserFormSubscriptionExpiresAt('');
    setUserFormSubscriptionPlanId('');
  }, []);

  const openCreateUserModal = useCallback(() => {
    setUserModalMode('create');
    setEditingUserId(null);
    resetUserForm();
    setUserModalVisible(true);
  }, [resetUserForm]);

  const openEditUserModal = useCallback((targetUser: UserEntry) => {
    setUserModalMode('edit');
    setEditingUserId(targetUser.id);
    setUserFormFullName(targetUser.full_name || '');
    setUserFormEmail(targetUser.email || '');
    setUserFormRole(normalizeUserRole(targetUser.role));
    setUserFormPassword('');
    setUserFormIsVerified(Boolean(targetUser.is_verified));
    setUserFormEmailConfirmed(false);
    setUserFormSubscriptionStatus(normalizeSubscriptionStatus(targetUser.subscription_status));
    setUserFormSubscriptionExpiresAt(toDateTimeLocalValue(targetUser.subscription_expires_at));
    setUserFormSubscriptionPlanId(String(targetUser.subscription_plan_id || '').trim());
    setUserModalVisible(true);
  }, []);

  const openUserDetailsModal = useCallback(async (targetUser: UserDetailsRequestTarget, loadingKey?: string) => {
    const requestLoadingKey = loadingKey || targetUser.id;
    setUserDetailsLoadingKey(requestLoadingKey);
    try {
      let data: any = null;

      try {
        data = await invokeAdminUsersManagement({
          action: 'fetch_user_details',
          userId: targetUser.id,
        });
      } catch (primaryError) {
        const primaryMessage = await getErrorMessage(primaryError, 'Unable to load user details.');

        if (!isUnsupportedActionMessage(primaryMessage, 'fetch_user_details')) {
          throw primaryError;
        }

        try {
          data = await invokeManageBookingsAction({
            action: 'fetch_user_details',
            userId: targetUser.id,
          });
        } catch (secondaryError) {
          const secondaryMessage = await getErrorMessage(secondaryError, 'Unable to load user details.');

          if (!isUnsupportedActionMessage(secondaryMessage, 'fetch_user_details')) {
            throw secondaryError;
          }

          data = {
            item: {
              id: targetUser.id,
              full_name: targetUser.full_name || null,
              email: targetUser.email || null,
            },
          };
        }
      }

      const profile = data?.item && typeof data.item === 'object'
        ? (data.item as Record<string, unknown>)
        : data?.profile && typeof data.profile === 'object'
          ? (data.profile as Record<string, unknown>)
          : data?.user && typeof data.user === 'object'
            ? (data.user as Record<string, unknown>)
            : Array.isArray(data?.items) && data.items.length > 0 && typeof data.items[0] === 'object'
              ? (data.items[0] as Record<string, unknown>)
              : {
                id: targetUser.id,
                full_name: targetUser.full_name || null,
                email: targetUser.email || null,
              };

      setUserDetailsTarget({
        profile,
      });
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load user details.');
      showAlert('error', 'Failed to load user details', message);

      setUserDetailsTarget({
        profile: {
          id: targetUser.id,
          full_name: targetUser.full_name || null,
          email: targetUser.email || null,
        },
      });
    } finally {
      setUserDetailsLoadingKey((prev) => (prev === requestLoadingKey ? null : prev));
    }
  }, [invokeAdminUsersManagement, showAlert, invokeManageBookingsAction]);

  const closeUserModal = useCallback(() => {
    if (userFormSubmitting) return;
    setUserModalVisible(false);
    setEditingUserId(null);
  }, [userFormSubmitting]);

  const closeUserDetailsModal = useCallback(() => {
    setUserDetailsTarget(null);
  }, []);

  const openManualReviewAsset = useCallback((url?: string | null) => {
    const normalized = String(url || '').trim();
    if (!normalized) {
      showAlert('warning', 'File unavailable', 'No uploaded file was found for this item.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(normalized, '_blank', 'noopener,noreferrer');
      return;
    }

    showAlert('info', 'Web only', 'Open this file from the web admin panel.');
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
      await invokeAdminUsersManagement({
        action: 'review_manual_identity',
        reviewId: manualReviewTarget.id,
        decision: manualReviewDecision,
        reviewNotes: manualReviewNotes.trim() || null,
      });

      showAlert(
        'success',
        manualReviewDecision === 'APPROVED' ? 'Identity approved' : 'Identity declined',
        'The decision was saved and an email notification was sent automatically.',
      );

      setManualReviewModalVisible(false);
      setManualReviewTarget(null);
      setManualReviewNotes('');
      setManualReviewDecision('APPROVED');

      invalidateAdminPageCache();
      await Promise.all([
        fetchUsers({ silent: true }),
        fetchManualReviews(),
      ]);
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
    fetchUsers,
    fetchManualReviews,
  ]);

  const submitUserForm = useCallback(async () => {
    const email = userFormEmail.trim().toLowerCase();
    const fullName = userFormFullName.trim();
    const shouldClearSubscription = userFormSubscriptionStatus === 'none';
    const subscriptionPlanId = shouldClearSubscription ? null : (userFormSubscriptionPlanId.trim() || null);
    let subscriptionExpiresAt: string | null = null;

    if (!shouldClearSubscription) {
      const rawExpiry = userFormSubscriptionExpiresAt.trim();
      if (rawExpiry) {
        const parsedExpiry = new Date(rawExpiry);
        if (Number.isNaN(parsedExpiry.getTime())) {
          showAlert('warning', 'Invalid expiration date', 'Use a valid date/time for subscription expiration.');
          return;
        }

        subscriptionExpiresAt = parsedExpiry.toISOString();
      }
    }

    if (!email) {
      showAlert('warning', 'Email required', 'Please provide an email address.');
      return;
    }

    if (userModalMode === 'create' && userFormPassword.trim().length < 8) {
      showAlert('warning', 'Weak password', 'Password must be at least 8 characters long.');
      return;
    }

    setUserFormSubmitting(true);
    try {
      if (userModalMode === 'create') {
        await invokeAdminUsersManagement({
          action: 'create_user',
          email,
          password: userFormPassword,
          fullName,
          role: userFormRole,
          isVerified: userFormIsVerified,
          emailConfirmed: userFormEmailConfirmed,
        });

        showAlert('success', 'User created', 'The account was created successfully.');
      } else {
        if (!editingUserId) {
          throw new Error('Missing user id for update.');
        }

        await invokeAdminUsersManagement({
          action: 'update_user',
          userId: editingUserId,
          email,
          fullName,
          role: userFormRole,
          isVerified: userFormIsVerified,
          subscriptionStatus: shouldClearSubscription ? null : userFormSubscriptionStatus,
          subscriptionExpiresAt,
          subscriptionPlanId,
        });

        showAlert('success', 'User updated', 'User details have been updated.');
      }

      invalidateAdminPageCache();
      setUserModalVisible(false);
      setEditingUserId(null);
      resetUserForm();
      await Promise.all([
        fetchUsers(),
        fetchManualReviews({ silent: true }),
      ]);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to save user changes.');
      showAlert('error', 'Failed to save user', message);
    } finally {
      setUserFormSubmitting(false);
    }
  }, [
    userFormEmail,
    userFormFullName,
    userModalMode,
    userFormPassword,
    userFormRole,
    userFormIsVerified,
    userFormEmailConfirmed,
    userFormSubscriptionStatus,
    userFormSubscriptionExpiresAt,
    userFormSubscriptionPlanId,
    editingUserId,
    showAlert,
    resetUserForm,
    fetchUsers,
    fetchManualReviews,
    invokeAdminUsersManagement,
  ]);

  const deleteUser = useCallback(
    (targetUser: UserEntry) => {
      if (targetUser.id === session?.user.id) {
        showAlert('warning', 'Action blocked', 'You cannot delete your own account from this panel.');
        return;
      }

      Alert.alert(
        'Delete user',
        `Are you sure you want to delete ${targetUser.full_name || targetUser.email}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setUserActionLoadingId(targetUser.id);
                try {
                  await invokeAdminUsersManagement({
                    action: 'delete_user',
                    userId: targetUser.id,
                  });

                  invalidateAdminPageCache();
                  showAlert('success', 'User deleted', 'The user account has been removed.');
                  await Promise.all([
                    fetchUsers(),
                    fetchManualReviews({ silent: true }),
                  ]);
                } catch (error) {
                  const message = await getErrorMessage(error, 'Unable to delete this user.');
                  showAlert('error', 'Failed to delete user', message);
                } finally {
                  setUserActionLoadingId(null);
                }
              })();
            },
          },
        ],
      );
    },
    [session?.user.id, showAlert, fetchUsers, fetchManualReviews, invokeAdminUsersManagement],
  );

  const filteredUsers = useMemo(() => {
    const roleFiltered = users.filter((item) => {
      const role = String(item.role || '').trim().toLowerCase();

      if (userFilter === 'all') return true;
      if (userFilter === 'musicians') {
        return role === 'musician' || role === 'musician-member' || role === 'manager';
      }

      return role === userFilter;
    });

    const q = userSearch.trim().toLowerCase();
    if (!q) return roleFiltered;

    return roleFiltered.filter((item) => {
      return (
        String(item.full_name || '').toLowerCase().includes(q) ||
        String(item.email || '').toLowerCase().includes(q) ||
        String(item.role || '').toLowerCase().includes(q)
      );
    });
  }, [users, userSearch, userFilter]);

  const renderDetailsSection = useCallback((title: string, details: Record<string, unknown> | null, emptyText: string) => {
    const hiddenDetailKeys = new Set(['auth', 'interest_vector', 'interestVector']);
    const entries = Object.entries(details || {})
      .filter(([key]) => !hiddenDetailKeys.has(key))
      .sort(([a], [b]) => a.localeCompare(b));

    return (
      <View
        style={[
          styles.detailsSection,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.detailsSectionTitle, { color: colors.text }]}>{title}</Text>
        {entries.length === 0 ? (
          <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
        ) : (
          <View style={styles.detailsRows}>
            {entries.map(([key, value]) => (
              <View key={`${title}-${key}`} style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{formatDetailLabel(key)}</Text>
                <Text selectable style={[styles.detailValue, { color: colors.text }]}>
                  {formatDetailValue(value)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }, [colors.border, colors.inputBackground, colors.text, colors.textSecondary]);

  if (loading || !roleResolved || initializingUsers) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading users...</Text>
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
          <TextInput
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Search users"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
              },
            ]}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {userFilters.map((filter) => {
              const active = userFilter === filter.value;
              return (
                <TouchableOpacity
                  key={filter.value}
                  activeOpacity={1}
                  onPress={() => setUserFilter(filter.value)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.inlineActionsRow}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={openCreateUserModal}
              style={[styles.primaryActionButton, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
              <Text style={styles.primaryActionText}>Add User</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionGap}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Manual Identity Reviews</Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Pending reviews are expected to be resolved within 5-7 business days.</Text>

            {manualReviewsLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : manualReviews.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No pending manual identity reviews.</Text>
            ) : (
              <View style={styles.sectionGap}>
                {manualReviews.map((review) => {
                  const profileName = review.profile?.full_name || review.submitted_by_email || 'Unknown user';
                  const profileEmail = review.profile?.email || review.submitted_by_email || '-';
                  const isReviewBusy = manualReviewActionLoadingId === review.id;

                  return (
                    <View key={review.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>{profileName}</Text>
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{profileEmail}</Text>
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Document: {review.document_type} ({review.document_country || 'PHL'})</Text>
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Source: {String(review.source || 'MANUAL_UPLOAD').replace(/_/g, ' ')}</Text>
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Submitted: {formatDateTime(review.created_at)}</Text>
                      {review.expected_decision_by ? (
                        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Expected by: {formatDateTime(review.expected_decision_by)}</Text>
                      ) : null}

                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => openManualReviewAsset(review.front_image_url)}
                          style={[styles.smallActionButton, { borderColor: colors.border }]}
                        >
                          <Ionicons name="image-outline" size={14} color={colors.text} />
                          <Text style={[styles.smallActionText, { color: colors.text }]}>Front</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => openManualReviewAsset(review.back_image_url)}
                          style={[styles.smallActionButton, { borderColor: colors.border }]}
                        >
                          <Ionicons name="images-outline" size={14} color={colors.text} />
                          <Text style={[styles.smallActionText, { color: colors.text }]}>Back</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => openManualReviewAsset(review.selfie_image_url)}
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

          {usersLoading ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : filteredUsers.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No users found.</Text>
          ) : (
            <View style={styles.sectionGap}>
              {filteredUsers.map((user) => {
                const userViewLoadingKey = `user-card-${user.id}`;

                return (
                  <View key={user.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{user.full_name || 'Unknown'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{user.email}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Role: {user.role}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Verified: {user.is_verified ? 'Yes' : 'No'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Verification Status: {String(user.verification_status || 'PENDING').replace(/_/g, ' ')}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Subscription: {String(user.subscription_status || 'none').replace(/_/g, ' ')}</Text>
                    {user.subscription_expires_at ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Subscription Expires: {formatDateTime(user.subscription_expires_at)}</Text>
                    ) : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Joined: {formatDateTime(user.created_at)}</Text>

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={userDetailsLoadingKey === userViewLoadingKey}
                        onPress={() => void openUserDetailsModal(user, userViewLoadingKey)}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        {userDetailsLoadingKey === userViewLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="eye-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>View</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => openEditUserModal(user)}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        <Ionicons name="create-outline" size={14} color={colors.text} />
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={userActionLoadingId === user.id || user.id === session.user.id}
                        onPress={() => deleteUser(user)}
                        style={[
                          styles.smallActionButtonFilled,
                          {
                            backgroundColor: '#DC2626',
                            opacity: userActionLoadingId === user.id || user.id === session.user.id ? 0.6 : 1,
                          },
                        ]}
                      >
                        {userActionLoadingId === user.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.smallActionTextFilled}>
                            {user.id === session.user.id ? 'Current Admin' : 'Delete'}
                          </Text>
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

      <Modal visible={userModalVisible} transparent animationType="fade" onRequestClose={closeUserModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {userModalMode === 'create' ? 'Create User' : 'Edit User'}
            </Text>

            <TextInput
              value={userFormFullName}
              onChangeText={setUserFormFullName}
              placeholder="Full name (optional)"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.modalInputCompact,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                },
              ]}
            />

            <TextInput
              value={userFormEmail}
              onChangeText={setUserFormEmail}
              placeholder="Email address"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor={colors.textSecondary}
              style={[
                styles.modalInputCompact,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                },
              ]}
            />

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {userRoleOptions.map((role) => {
                const active = userFormRole === role;
                return (
                  <TouchableOpacity
                    key={role}
                    activeOpacity={1}
                    onPress={() => setUserFormRole(role)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {role}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {userModalMode === 'edit' && (
              <>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Subscription Status</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {subscriptionStatusOptions.map((status) => {
                    const active = userFormSubscriptionStatus === status;
                    return (
                      <TouchableOpacity
                        key={status}
                        activeOpacity={1}
                        onPress={() => setUserFormSubscriptionStatus(status)}
                        style={[
                          styles.filterChip,
                          {
                            backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                            borderColor: active ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                          {status.replace(/_/g, ' ')}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TextInput
                  value={userFormSubscriptionExpiresAt}
                  onChangeText={setUserFormSubscriptionExpiresAt}
                  placeholder="Subscription expires (optional, e.g. 2026-12-31T23:59)"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.modalInputCompact,
                    {
                      color: colors.text,
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                />

                <TextInput
                  value={userFormSubscriptionPlanId}
                  onChangeText={setUserFormSubscriptionPlanId}
                  placeholder="Subscription plan ID (optional)"
                  autoCapitalize="none"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.modalInputCompact,
                    {
                      color: colors.text,
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                />
              </>
            )}

            {userModalMode === 'create' && (
              <TextInput
                value={userFormPassword}
                onChangeText={setUserFormPassword}
                placeholder="Password (minimum 8 characters)"
                secureTextEntry
                autoCapitalize="none"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.modalInputCompact,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                  },
                ]}
              />
            )}

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Verified</Text>
            <View style={styles.booleanToggleRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setUserFormIsVerified(true)}
                style={[
                  styles.booleanToggleButton,
                  {
                    backgroundColor: userFormIsVerified ? '#16A34A' : (isDark ? '#1E293B' : '#FFFFFF'),
                    borderColor: userFormIsVerified ? '#16A34A' : colors.border,
                  },
                ]}
              >
                <Text style={[styles.booleanToggleButtonText, { color: userFormIsVerified ? '#FFFFFF' : colors.textSecondary }]}>Yes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setUserFormIsVerified(false)}
                style={[
                  styles.booleanToggleButton,
                  {
                    backgroundColor: !userFormIsVerified ? '#DC2626' : (isDark ? '#1E293B' : '#FFFFFF'),
                    borderColor: !userFormIsVerified ? '#DC2626' : colors.border,
                  },
                ]}
              >
                <Text style={[styles.booleanToggleButtonText, { color: !userFormIsVerified ? '#FFFFFF' : colors.textSecondary }]}>No</Text>
              </TouchableOpacity>
            </View>

            {userModalMode === 'create' && (
              <>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Email Confirmed</Text>
                <View style={styles.booleanToggleRow}>
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setUserFormEmailConfirmed(true)}
                    style={[
                      styles.booleanToggleButton,
                      {
                        backgroundColor: userFormEmailConfirmed ? '#16A34A' : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: userFormEmailConfirmed ? '#16A34A' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.booleanToggleButtonText, { color: userFormEmailConfirmed ? '#FFFFFF' : colors.textSecondary }]}>Yes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setUserFormEmailConfirmed(false)}
                    style={[
                      styles.booleanToggleButton,
                      {
                        backgroundColor: !userFormEmailConfirmed ? '#DC2626' : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: !userFormEmailConfirmed ? '#DC2626' : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.booleanToggleButtonText, { color: !userFormEmailConfirmed ? '#FFFFFF' : colors.textSecondary }]}>No</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeUserModal}
                disabled={userFormSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void submitUserForm()}
                disabled={userFormSubmitting}
                style={[styles.modalButton, { backgroundColor: colors.primary, opacity: userFormSubmitting ? 0.6 : 1 }]}
              >
                {userFormSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>{userModalMode === 'create' ? 'Create User' : 'Save Changes'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!userDetailsTarget} transparent animationType="fade" onRequestClose={closeUserDetailsModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>User Details</Text>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailsSection('Profile', userDetailsTarget?.profile || null, 'Profile details are unavailable.')}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeUserDetailsModal}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
