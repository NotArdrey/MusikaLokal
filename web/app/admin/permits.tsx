
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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

type Tab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit';

type PermitFilter = 'all' | 'pending_review' | 'approved' | 'rejected' | 'resubmitted';

type EntityFilter = 'all' | 'studio' | 'gig';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  permits: '/admin/permits',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
};

interface PermitItem {
  id: string;
  name: string;
  entity_type: 'studio' | 'gig';
  permit_status: string;
  business_permit_url: string | null;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  created_at: string;
  permit_reviewed_at: string | null;
  permit_rejection_reason: string | null;
}

interface OwnerDetailsEntry {
  profile: Record<string, unknown> | null;
  ownerName: string;
}

interface StudioDetailsEntry {
  listing: Record<string, unknown> | null;
  owner: Record<string, unknown> | null;
  listingName: string;
  entityType: 'studio' | 'gig';
}

const permitStatuses: PermitFilter[] = ['all', 'pending_review', 'approved', 'rejected', 'resubmitted'];

const entityTypes: EntityFilter[] = ['all', 'studio', 'gig'];

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

const formatDetailLabel = (rawKey: string) => {
  const withSpaces = rawKey.replace(/_/g, ' ').trim();
  if (!withSpaces) return 'Field';

  return withSpaces
    .split(' ')
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
};

const formatDetailValue = (value: unknown) => {
  if (value === null || value === undefined) return '-';

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  const text = String(value).trim();
  return text || '-';
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  cardStatusChip: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    textTransform: 'capitalize',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  cardTypeChip: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
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
  modalDescription: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 82,
    textAlignVertical: 'top',
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  reasonText: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Poppins_500Medium',
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
  { key: 'permits', label: 'Permits', icon: 'document-text-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
];

export default function AdminPermitsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();

  const [initializingPermits, setInitializingPermits] = useState(false);
  const [permitsLoading, setPermitsLoading] = useState(false);
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [permitSearch, setPermitSearch] = useState('');
  const [permitFilter, setPermitFilter] = useState<(typeof permitStatuses)[number]>('all');
  const [entityFilter, setEntityFilter] = useState<(typeof entityTypes)[number]>('all');
  const [ownerDetailsLoadingKey, setOwnerDetailsLoadingKey] = useState<string | null>(null);
  const [studioDetailsLoadingKey, setStudioDetailsLoadingKey] = useState<string | null>(null);
  const [ownerDetailsTarget, setOwnerDetailsTarget] = useState<OwnerDetailsEntry | null>(null);
  const [studioDetailsTarget, setStudioDetailsTarget] = useState<StudioDetailsEntry | null>(null);
  const [reviewTarget, setReviewTarget] = useState<PermitItem | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
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
    if (nextTab === 'permits') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const fetchPermits = useCallback(async () => {
    setPermitsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<any>('permit-management', {
        body: {
          action: 'fetch_queue',
          entityType: entityFilter,
          permitStatus: permitFilter,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setPermits(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to fetch permits.');
      showAlert('error', 'Failed to load permits', message);
    } finally {
      setPermitsLoading(false);
    }
  }, [entityFilter, permitFilter, showAlert]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingPermits(false);
      return;
    }

    let isMounted = true;
    setInitializingPermits(true);

    void (async () => {
      try {
        await fetchPermits();
      } finally {
        if (isMounted) setInitializingPermits(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loading, roleResolved, session, isGuest, isAdmin, fetchPermits]);

  const openReviewModal = useCallback((item: PermitItem, action: 'approve' | 'reject') => {
    setReviewTarget(item);
    setReviewAction(action);
    setRejectReason('');
    setAdminNotes('');
  }, []);

  const closeReviewModal = useCallback(() => {
    if (reviewSubmitting) return;
    setReviewTarget(null);
    setReviewAction(null);
    setRejectReason('');
    setAdminNotes('');
  }, [reviewSubmitting]);

  const closeOwnerDetailsModal = useCallback(() => {
    setOwnerDetailsTarget(null);
  }, []);

  const closeStudioDetailsModal = useCallback(() => {
    setStudioDetailsTarget(null);
  }, []);

  const openOwnerDetailsModal = useCallback(async (item: PermitItem, loadingKey?: string) => {
    const ownerId = String(item.owner_id || '').trim();
    if (!ownerId) {
      showAlert('warning', 'Owner unavailable', 'This permit record has no owner reference.');
      return;
    }

    const requestLoadingKey = loadingKey || `owner-${ownerId}`;
    setOwnerDetailsLoadingKey(requestLoadingKey);

    try {
      const { data, error } = await supabase.functions.invoke<any>('permit-management', {
        body: {
          action: 'fetch_owner_details',
          userId: ownerId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      const profile = data?.item && typeof data.item === 'object'
        ? (data.item as Record<string, unknown>)
        : {
          id: ownerId,
          full_name: item.owner_name || null,
          email: item.owner_email || null,
        };

      setOwnerDetailsTarget({
        profile,
        ownerName: item.owner_name || 'Owner',
      });
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load owner details.');
      showAlert('error', 'Failed to load owner details', message);
      setOwnerDetailsTarget({
        profile: {
          id: ownerId,
          full_name: item.owner_name || null,
          email: item.owner_email || null,
        },
        ownerName: item.owner_name || 'Owner',
      });
    } finally {
      setOwnerDetailsLoadingKey((prev) => (prev === requestLoadingKey ? null : prev));
    }
  }, [showAlert]);

  const openStudioDetailsModal = useCallback(async (item: PermitItem, loadingKey?: string) => {
    const requestLoadingKey = loadingKey || `studio-${item.id}`;
    setStudioDetailsLoadingKey(requestLoadingKey);

    const entityLabel = item.entity_type === 'gig' ? 'gig' : 'studio';

    try {
      const { data, error } = await supabase.functions.invoke<any>('permit-management', {
        body: {
          action: 'fetch_listing_details',
          entityType: item.entity_type,
          entityId: item.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      const listing = data?.item && typeof data.item === 'object'
        ? (data.item as Record<string, unknown>)
        : null;

      const owner = data?.owner && typeof data.owner === 'object'
        ? (data.owner as Record<string, unknown>)
        : null;

      setStudioDetailsTarget({
        listing,
        owner,
        listingName: item.name || (item.entity_type === 'gig' ? 'Gig' : 'Studio'),
        entityType: item.entity_type,
      });
    } catch (error) {
      const message = await getErrorMessage(error, `Unable to load ${entityLabel} details.`);
      showAlert('error', `Failed to load ${entityLabel} details`, message);
    } finally {
      setStudioDetailsLoadingKey((prev) => (prev === requestLoadingKey ? null : prev));
    }
  }, [showAlert]);

  const renderDetailsSection = useCallback((
    title: string,
    rawData: Record<string, unknown> | null | undefined,
    emptyMessage: string,
  ) => {
    const rows = rawData && typeof rawData === 'object'
      ? Object.entries(rawData)
      : [];

    return (
      <View style={[styles.detailsSection, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}> 
        <Text style={[styles.detailsSectionTitle, { color: colors.text }]}>{title}</Text>

        {rows.length === 0 ? (
          <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>{emptyMessage}</Text>
        ) : (
          <View style={styles.detailsRows}>
            {rows.map(([key, value]) => (
              <View key={`${title}-${key}`} style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{formatDetailLabel(key)}</Text>
                <Text style={[styles.detailValue, { color: colors.text }]}>{formatDetailValue(value)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }, [colors.border, colors.text, colors.textSecondary, isDark]);

  const submitReview = useCallback(async () => {
    if (!reviewTarget || !reviewAction) return;

    if (reviewAction === 'reject' && !rejectReason.trim()) {
      showAlert('warning', 'Reason required', 'Please provide a rejection reason.');
      return;
    }

    setReviewSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke<any>('permit-management', {
        body: {
          action: 'review_permit',
          entityType: reviewTarget.entity_type,
          entityId: reviewTarget.id,
          reviewAction,
          rejectionReason: reviewAction === 'reject' ? rejectReason.trim() : '',
          adminNotes: adminNotes.trim(),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      const actionLabel = reviewAction === 'approve' ? 'approved' : 'rejected';
      closeReviewModal();
      showAlert('success', 'Permit updated', `${reviewTarget.name} has been ${actionLabel}.`);
      await fetchPermits();
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to update permit status.');
      showAlert('error', 'Failed to review permit', message);
    } finally {
      setReviewSubmitting(false);
    }
  }, [reviewTarget, reviewAction, rejectReason, adminNotes, closeReviewModal, fetchPermits, showAlert]);

  const filteredPermits = useMemo(() => {
    const q = permitSearch.trim().toLowerCase();
    if (!q) return permits;

    return permits.filter((item) => {
      return (
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.owner_name || '').toLowerCase().includes(q) ||
        String(item.owner_email || '').toLowerCase().includes(q)
      );
    });
  }, [permits, permitSearch]);

  if (loading || !roleResolved || initializingPermits) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading permits...</Text>
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
              const active = item.key === 'permits';
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
            value={permitSearch}
            onChangeText={setPermitSearch}
            placeholder="Search permit by listing, owner, email"
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
            {permitStatuses.map((status) => {
              const active = permitFilter === status;
              return (
                <TouchableOpacity
                  key={status}
                  activeOpacity={1}
                  onPress={() => setPermitFilter(status)}
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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {entityTypes.map((entity) => {
              const active = entityFilter === entity;
              return (
                <TouchableOpacity
                  key={entity}
                  activeOpacity={1}
                  onPress={() => setEntityFilter(entity)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {entity}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {permitsLoading ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : filteredPermits.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No permits found.</Text>
          ) : (
            <View style={styles.sectionGap}>
              {filteredPermits.map((item) => {
                const status = String(item.permit_status || 'pending_review').replace(/_/g, ' ');
                const canReview = ['pending', 'pending_review', 'resubmitted'].includes(item.permit_status);
                const ownerLoadingKey = `permit-owner-${item.entity_type}-${item.id}`;
                const studioLoadingKey = `permit-studio-${item.entity_type}-${item.id}`;
                const listingActionLabel = item.entity_type === 'gig' ? 'View Gig' : 'View Studio';
                return (
                  <View key={`${item.entity_type}-${item.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <View style={styles.cardHeaderRow}>
                      <Text style={[styles.cardTypeChip, { color: colors.primary }]}>{item.entity_type}</Text>
                      <Text style={[styles.cardStatusChip, { color: colors.textSecondary }]}>{status}</Text>
                    </View>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Owner: {item.owner_name} ({item.owner_email})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Created: {formatDateTime(item.created_at)}</Text>
                    {item.permit_reviewed_at && (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reviewed: {formatDateTime(item.permit_reviewed_at)}</Text>
                    )}
                    {item.permit_rejection_reason && (
                      <Text style={[styles.reasonText, { color: '#EF4444' }]}>Reason: {item.permit_rejection_reason}</Text>
                    )}

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={!item.owner_id || ownerDetailsLoadingKey === ownerLoadingKey}
                        onPress={() => {
                          if (!item.owner_id) return;
                          void openOwnerDetailsModal(item, ownerLoadingKey);
                        }}
                        style={[
                          styles.smallActionButton,
                          {
                            borderColor: colors.border,
                            opacity: item.owner_id ? 1 : 0.5,
                          },
                        ]}
                      >
                        {ownerDetailsLoadingKey === ownerLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="person-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>View Owner</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={studioDetailsLoadingKey === studioLoadingKey}
                        onPress={() => {
                          void openStudioDetailsModal(item, studioLoadingKey);
                        }}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        {studioDetailsLoadingKey === studioLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons
                              name={item.entity_type === 'gig' ? 'musical-notes-outline' : 'business-outline'}
                              size={14}
                              color={colors.text}
                            />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>{listingActionLabel}</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {!!item.business_permit_url && (
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={() => {
                            if (item.business_permit_url) {
                              void Linking.openURL(item.business_permit_url);
                            }
                          }}
                          style={[styles.smallActionButton, { borderColor: colors.border }]}
                        >
                          <Ionicons name="eye-outline" size={14} color={colors.text} />
                          <Text style={[styles.smallActionText, { color: colors.text }]}>View Permit</Text>
                        </TouchableOpacity>
                      )}

                      {canReview && (
                        <>
                          <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => openReviewModal(item, 'approve')}
                            style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A' }]}
                          >
                            <Text style={styles.smallActionTextFilled}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            activeOpacity={1}
                            onPress={() => openReviewModal(item, 'reject')}
                            style={[styles.smallActionButtonFilled, { backgroundColor: '#DC2626' }]}
                          >
                            <Text style={styles.smallActionTextFilled}>Reject</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!ownerDetailsTarget} transparent animationType="fade" onRequestClose={closeOwnerDetailsModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Owner Details</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>{ownerDetailsTarget?.ownerName || 'Owner'}</Text>

            <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsScrollContent}>
              {renderDetailsSection('Profile', ownerDetailsTarget?.profile || null, 'Owner details are unavailable.')}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeOwnerDetailsModal}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!studioDetailsTarget} transparent animationType="fade" onRequestClose={closeStudioDetailsModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {(studioDetailsTarget?.entityType === 'gig' ? 'Gig' : 'Studio')} Details
            </Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {studioDetailsTarget?.listingName || (studioDetailsTarget?.entityType === 'gig' ? 'Gig' : 'Studio')}
            </Text>

            <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsScrollContent}>
              {renderDetailsSection(
                studioDetailsTarget?.entityType === 'gig' ? 'Gig' : 'Studio',
                studioDetailsTarget?.listing || null,
                `${studioDetailsTarget?.entityType === 'gig' ? 'Gig' : 'Studio'} details are unavailable.`,
              )}
              {renderDetailsSection('Owner', studioDetailsTarget?.owner || null, 'Owner details are unavailable.')}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeStudioDetailsModal}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!reviewTarget && !!reviewAction} transparent animationType="fade" onRequestClose={closeReviewModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >

          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {reviewAction === 'approve' ? 'Approve Permit' : 'Reject Permit'}
            </Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {reviewTarget?.name || 'Listing'}
            </Text>

            {reviewAction === 'reject' && (
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Rejection reason (required)"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[
                  styles.modalInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.inputBorder,
                  },
                ]}
              />
            )}

            <TextInput
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder="Admin notes (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  backgroundColor: colors.inputBackground,
                  borderColor: colors.inputBorder,
                },
              ]}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeReviewModal}
                disabled={reviewSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void submitReview()}
                disabled={reviewSubmitting}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: reviewAction === 'approve' ? '#16A34A' : '#DC2626',
                    opacity: reviewSubmitting ? 0.6 : 1,
                  },
                ]}
              >
                {reviewSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
