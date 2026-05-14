
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { getAdminPageCacheKey, readAdminPageCache, writeAdminPageCache } from './_cache';
import {
  fetchAdminPaymentTransactions,
  normalizePaymentActionLabel,
} from './_payments';

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

type Tab = 'dashboard' | 'users' | 'reports' | 'audit' | 'posts' | 'products';

type AuditEntityFilter = 'all' | 'studio' | 'gig' | 'payment';

type AuditActionFilter =
  | 'all'
  | 'approved'
  | 'rejected'
  | 'submitted'
  | 'resubmitted'
  | 'payment_paid'
  | 'payment_partial'
  | 'payment_pending'
  | 'payment_failed'
  | 'payment_cancelled'
  | 'payment_refunded'
  | 'payment_refund_pending';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  posts: '/admin/posts',
  products: '/admin/products',
};

const AUDIT_CACHE_TTL_MS = 45_000;

interface AuditEntry {
  id: string;
  entity_type: string;
  action: string;
  performer_name?: string;
  entity_name?: string;
  rejection_reason?: string | null;
  admin_notes?: string | null;
  amount?: number;
  refund_amount?: number;
  payment_status?: string | null;
  booking_status?: string | null;
  booking_id?: string | null;
  reference?: string | null;
  created_at: string;
}

const auditEntityTypes: AuditEntityFilter[] = ['all', 'studio', 'gig', 'payment'];

const auditActions: AuditActionFilter[] = [
  'all',
  'approved',
  'rejected',
  'submitted',
  'resubmitted',
  'payment_paid',
  'payment_partial',
  'payment_pending',
  'payment_failed',
  'payment_cancelled',
  'payment_refunded',
  'payment_refund_pending',
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

const formatCurrency = (value?: number | null) => {
  const safeValue = Number(value || 0);
  return `PHP ${safeValue.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatAuditAction = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.startsWith('payment_')) return normalizePaymentActionLabel(normalized);
  return normalized ? normalized.replace(/_/g, ' ') : '-';
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

const tabItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
];

export default function AdminAuditPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
  const hasHydratedAuditRef = useRef(false);

  const [initializingAudit, setInitializingAudit] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<(typeof auditActions)[number]>('all');
  const [auditEntityFilter, setAuditEntityFilter] = useState<(typeof auditEntityTypes)[number]>('all');
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

  const auditCacheKey = useMemo(() => getAdminPageCacheKey('audit'), []);

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'audit') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const mapAuditRows = useCallback(async (rows: any[]) => {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const performerIds = Array.from(
      new Set(
        normalizedRows
          .filter((entry: any) => !entry?.performer_name && entry?.performed_by)
          .map((entry: any) => String(entry?.performed_by || '').trim())
          .filter((id: string) => id.length > 0),
      ),
    );

    let performerMap: Record<string, string> = {};
    if (performerIds.length > 0) {
      const { data: performerRows, error: performerError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', performerIds);

      if (performerError) throw performerError;

      performerMap = (performerRows || []).reduce((acc: Record<string, string>, row: any) => {
        const id = String(row?.id || '').trim();
        if (!id) return acc;
        acc[id] = String(row?.full_name || '').trim() || 'System';
        return acc;
      }, {});
    }

    return normalizedRows.map((entry: any) => {
      const metadata = entry?.metadata && typeof entry.metadata === 'object'
        ? (entry.metadata as Record<string, unknown>)
        : null;
      const metadataEntityName = metadata && typeof metadata.entity_name === 'string'
        ? metadata.entity_name
        : null;

      return {
        ...entry,
        entity_name: String(entry?.entity_name || metadataEntityName || entry?.entity_id || 'Unknown entity'),
        performer_name: String(entry?.performer_name || performerMap[String(entry?.performed_by || '')] || 'System'),
        rejection_reason: entry?.rejection_reason || entry?.reason || null,
        admin_notes: entry?.admin_notes || entry?.notes || null,
      } as AuditEntry;
    });
  }, []);

  const fetchAudit = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setAuditLoading(true);
    }

    try {
      let rawItems: any[] = [];

      try {
        const { data, error } = await supabase.functions.invoke<any>('permit-management', {
          body: {
            action: 'fetch_audit',
            limit: 200,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        rawItems = Array.isArray(data?.items) ? data.items : [];
      } catch {
        const { data: fallbackRows, error: fallbackError } = await supabase
          .from('permit_audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);

        if (fallbackError) throw fallbackError;
        rawItems = Array.isArray(fallbackRows) ? fallbackRows : [];
      }

      const mappedPermitItems = await mapAuditRows(rawItems);
      let paymentAuditItems: AuditEntry[] = [];

      try {
        const paymentResult = await fetchAdminPaymentTransactions({
          status: 'all',
          dateRange: 'all',
          limit: 200,
        });

        paymentAuditItems = paymentResult.transactions.map((transaction) => {
          const customer = transaction.customer_name || transaction.customer_email || 'Unknown customer';
          const studio = transaction.studio_name || 'Unknown studio';
          const amountLabel = formatCurrency(transaction.amount);
          const refundLabel = transaction.refund_amount > 0
            ? ` | Refund ${formatCurrency(transaction.refund_amount)}`
            : '';

          return {
            id: `payment-${transaction.booking_id}`,
            entity_type: 'payment',
            action: transaction.action,
            performer_name: customer,
            entity_name: `${studio} - ${customer}`,
            rejection_reason: transaction.cancellation_reason || null,
            admin_notes: `${amountLabel}${refundLabel}`,
            amount: transaction.amount,
            refund_amount: transaction.refund_amount,
            payment_status: transaction.payment_status,
            booking_status: transaction.booking_status,
            booking_id: transaction.booking_id,
            reference: transaction.reference || transaction.booking_id,
            created_at: transaction.event_at || transaction.updated_at || transaction.created_at || '',
          } as AuditEntry;
        });
      } catch {
        paymentAuditItems = [];
      }

      const mappedItems = [...mappedPermitItems, ...paymentAuditItems].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      setAuditEntries(mappedItems);
      writeAdminPageCache(auditCacheKey, mappedItems);
    } catch (error) {
      if (!options?.silent) {
        const message = await getErrorMessage(error, 'Unable to fetch audit entries.');
        showAlert('error', 'Failed to load audit log', message);
        setAuditEntries([]);
      }
    } finally {
      if (!options?.silent) {
        setAuditLoading(false);
      }
    }
  }, [auditCacheKey, showAlert, mapAuditRows]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingAudit(false);
      hasHydratedAuditRef.current = false;
      return;
    }

    let isMounted = true;
    const cachedAuditEntries = readAdminPageCache<AuditEntry[]>(auditCacheKey, AUDIT_CACHE_TTL_MS);

    if (cachedAuditEntries) {
      setAuditEntries(cachedAuditEntries);
      setInitializingAudit(false);
      hasHydratedAuditRef.current = true;
    } else if (!hasHydratedAuditRef.current) {
      setInitializingAudit(true);
    } else {
      setInitializingAudit(false);
    }

    void (async () => {
      try {
        await fetchAudit({ silent: Boolean(cachedAuditEntries) });
      } finally {
        if (isMounted) {
          setInitializingAudit(false);
          hasHydratedAuditRef.current = true;
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loading, roleResolved, session, isGuest, isAdmin, auditCacheKey, fetchAudit]);

  const filteredAuditEntries = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();

    return auditEntries.filter((entry) => {
      const action = String(entry.action || '').trim().toLowerCase();
      const entityType = String(entry.entity_type || '').trim().toLowerCase();

      if (auditActionFilter !== 'all' && action !== auditActionFilter) {
        return false;
      }

      if (auditEntityFilter !== 'all' && entityType !== auditEntityFilter) {
        return false;
      }

      if (!query) return true;

      return (
        String(entry.entity_name || '').toLowerCase().includes(query) ||
        String(entry.action || '').toLowerCase().includes(query) ||
        String(entry.entity_type || '').toLowerCase().includes(query) ||
        String(entry.performer_name || '').toLowerCase().includes(query) ||
        String(entry.rejection_reason || '').toLowerCase().includes(query) ||
        String(entry.admin_notes || '').toLowerCase().includes(query) ||
        String(entry.payment_status || '').toLowerCase().includes(query) ||
        String(entry.booking_status || '').toLowerCase().includes(query) ||
        String(entry.booking_id || '').toLowerCase().includes(query) ||
        String(entry.reference || '').toLowerCase().includes(query) ||
        String(entry.amount || '').toLowerCase().includes(query) ||
        String(entry.created_at || '').toLowerCase().includes(query)
      );
    });
  }, [auditEntries, auditSearch, auditActionFilter, auditEntityFilter]);

  if (loading || !roleResolved || initializingAudit) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading audit log...</Text>
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
              const active = item.key === 'audit';
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
            value={auditSearch}
            onChangeText={setAuditSearch}
            placeholder="Search audit log"
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
            {auditActions.map((status) => {
              const active = auditActionFilter === status;
              return (
                <TouchableOpacity
                  key={status}
                  activeOpacity={1}
                  onPress={() => setAuditActionFilter(status)}
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
            {auditEntityTypes.map((entity) => {
              const active = auditEntityFilter === entity;
              return (
                <TouchableOpacity
                  key={entity}
                  activeOpacity={1}
                  onPress={() => setAuditEntityFilter(entity)}
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

          {auditLoading ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : filteredAuditEntries.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No audit entries found.</Text>
          ) : (
            <View style={styles.sectionGap}>
              {filteredAuditEntries.map((entry) => (
                <View
                  key={entry.id}
                  testID={`admin-audit-card-${entry.id}`}
                  accessibilityLabel={`admin-audit-card-${entry.id}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                > 
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{entry.entity_name || 'Unknown entity'}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Action: {formatAuditAction(entry.action)}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Type: {entry.entity_type}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>By: {entry.performer_name || 'System'}</Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>At: {formatDateTime(entry.created_at)}</Text>
                  {entry.entity_type === 'payment' && (
                    <>
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                        Payment: {entry.payment_status || '-'} | Booking: {entry.booking_status || '-'}
                      </Text>
                      {!!entry.booking_id && (
                        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Booking ID: {entry.booking_id}</Text>
                      )}
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                        Amount: {formatCurrency(entry.amount)} | Refund: {formatCurrency(entry.refund_amount)}
                      </Text>
                      {!!entry.reference && (
                        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Ref: {entry.reference}</Text>
                      )}
                    </>
                  )}
                  {!!entry.rejection_reason && (
                    <Text style={[styles.cardMeta, { color: '#EF4444' }]}>Reason: {entry.rejection_reason}</Text>
                  )}
                  {!!entry.admin_notes && (
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Notes: {entry.admin_notes}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

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

