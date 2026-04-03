import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '../../../lib/supabase';
import CustomAlert, { AlertType } from '../CustomAlert';
import Header from '../header';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

type Tab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit';
type PermitFilter = 'all' | 'pending_review' | 'approved' | 'rejected' | 'resubmitted';
type EntityFilter = 'all' | 'studio' | 'gig';
type ReportFilter = 'all' | 'pending' | 'resolved' | 'dismissed';
type BookingIncidentFilter =
  | 'all'
  | 'open'
  | 'responded'
  | 'manual_review'
  | 'resolved_refund'
  | 'resolved_no_refund'
  | 'dismissed';
type BookingIncidentResolution = 'resolved_refund' | 'resolved_no_refund' | 'dismissed';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  permits: '/admin/permits',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
};

interface DashboardMetrics {
  totalUsers: number;
  totalStudios: number;
  totalGigs: number;
  pendingPermits: number;
  approvedPermits: number;
  rejectedPermits: number;
  recentActions: number;
}

interface PermitItem {
  id: string;
  name: string;
  entity_type: 'studio' | 'gig';
  permit_status: string;
  business_permit_url: string | null;
  owner_name: string;
  owner_email: string;
  created_at: string;
  permit_reviewed_at: string | null;
  permit_rejection_reason: string | null;
}

interface UserEntry {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_verified: boolean;
  created_at: string;
}

interface ReportEntry {
  id: string;
  reporter_name: string;
  reporter_email: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

interface BookingIncidentEntry {
  id: string;
  issue_type: string;
  status: string;
  reporter_notes: string | null;
  counterparty_notes: string | null;
  resolution: string | null;
  created_at: string;
  response_deadline_at: string | null;
  reporter_name: string;
  reporter_email: string;
  counterparty_name: string;
  counterparty_email: string;
  studio_name: string | null;
  booking_date: string | null;
  booking_start_time: string | null;
  booking_end_time: string | null;
}

interface AuditEntry {
  id: string;
  entity_type: string;
  action: string;
  performer_name?: string;
  entity_name?: string;
  rejection_reason?: string | null;
  admin_notes?: string | null;
  created_at: string;
}

interface AlertState {
  visible: boolean;
  type: AlertType;
  title: string;
  message: string;
}

interface AdminPanelProps {
  initialTab: Tab;
}

const defaultMetrics: DashboardMetrics = {
  totalUsers: 0,
  totalStudios: 0,
  totalGigs: 0,
  pendingPermits: 0,
  approvedPermits: 0,
  rejectedPermits: 0,
  recentActions: 0,
};

const readErrorContextMessage = async (context: unknown): Promise<string | null> => {
  if (!context) return null;

  // Response-like context from FunctionsHttpError
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

const permitStatuses: PermitFilter[] = ['all', 'pending_review', 'approved', 'rejected', 'resubmitted'];
const entityTypes: EntityFilter[] = ['all', 'studio', 'gig'];
const reportStatuses: ReportFilter[] = ['all', 'pending', 'resolved', 'dismissed'];
const incidentStatuses: BookingIncidentFilter[] = [
  'all',
  'open',
  'responded',
  'manual_review',
  'resolved_refund',
  'resolved_no_refund',
  'dismissed',
];

export default function AdminPanel({ initialTab }: AdminPanelProps) {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, userRole } = useAuth();
  const { width } = useWindowDimensions();

  const [resolvedRole, setResolvedRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [initializingDashboard, setInitializingDashboard] = useState(true);

  const [metrics, setMetrics] = useState<DashboardMetrics>(defaultMetrics);
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [incidents, setIncidents] = useState<BookingIncidentEntry[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);

  const [permitFilter, setPermitFilter] = useState<PermitFilter>('all');
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [permitSearch, setPermitSearch] = useState('');

  const [userSearch, setUserSearch] = useState('');

  const [reportFilter, setReportFilter] = useState<ReportFilter>('all');
  const [incidentFilter, setIncidentFilter] = useState<BookingIncidentFilter>('all');

  const [permitsLoading, setPermitsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const [reportActionLoadingId, setReportActionLoadingId] = useState<string | null>(null);
  const [incidentActionLoadingId, setIncidentActionLoadingId] = useState<string | null>(null);

  const [reviewTarget, setReviewTarget] = useState<PermitItem | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const [alertState, setAlertState] = useState<AlertState>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showInlineTabNav = !(Platform.OS === 'web' && width >= 768);

  const showAlert = useCallback((type: AlertType, title: string, message: string) => {
    setAlertState({ visible: true, type, title, message });
  }, []);

  const isAdmin = useMemo(() => resolvedRole === 'admin', [resolvedRole]);

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    router.replace(adminTabRoutes[nextTab] as any);
  }, [tab]);

  useEffect(() => {
    setTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  useEffect(() => {
    let isActive = true;

    const resolveRole = async () => {
      if (loading) return;

      if (!session || isGuest) {
        if (isActive) {
          setResolvedRole(null);
          setCheckingRole(false);
        }
        return;
      }

      if (userRole) {
        if (isActive) {
          setResolvedRole(userRole);
          setCheckingRole(false);
        }
        return;
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        if (isActive) {
          setResolvedRole(data?.role ?? null);
        }
      } catch {
        if (isActive) {
          setResolvedRole(null);
        }
      } finally {
        if (isActive) {
          setCheckingRole(false);
        }
      }
    };

    resolveRole();

    return () => {
      isActive = false;
    };
  }, [loading, session, isGuest, userRole]);

  useEffect(() => {
    if (loading || checkingRole) return;

    if (!session && !isGuest) {
      router.replace('/');
      return;
    }

    if (isGuest || resolvedRole !== 'admin') {
      router.replace('/home');
    }
  }, [loading, checkingRole, session, isGuest, resolvedRole]);

  const fetchMetrics = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<any>('permit-management', {
      body: { action: 'fetch_metrics' },
    });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));

    setMetrics({
      totalUsers: Number(data?.totalUsers || 0),
      totalStudios: Number(data?.totalStudios || 0),
      totalGigs: Number(data?.totalGigs || 0),
      pendingPermits: Number(data?.pendingPermits || 0),
      approvedPermits: Number(data?.approvedPermits || 0),
      rejectedPermits: Number(data?.rejectedPermits || 0),
      recentActions: Number(data?.recentActions || 0),
    });
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

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, is_verified, created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setUsers((data || []) as UserEntry[]);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to fetch users.');
      showAlert('error', 'Failed to load users', message);
    } finally {
      setUsersLoading(false);
    }
  }, [showAlert]);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<any>('admin-reports-management', {
        body: {
          action: 'fetch_reports',
          statusFilter: reportFilter,
          limit: 100,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setReports(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to fetch reports.');
      showAlert('error', 'Failed to load reports', message);
    } finally {
      setReportsLoading(false);
    }
  }, [reportFilter, showAlert]);

  const fetchIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<any>('manage-bookings', {
        body: {
          action: 'admin_fetch_booking_incidents',
          statusFilter: incidentFilter,
          limit: 100,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setIncidents(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to fetch incidents.');
      showAlert('error', 'Failed to load incidents', message);
    } finally {
      setIncidentsLoading(false);
    }
  }, [incidentFilter, showAlert]);

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<any>('permit-management', {
        body: {
          action: 'fetch_audit',
          limit: 100,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setAuditEntries(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to fetch audit entries.');
      showAlert('error', 'Failed to load audit log', message);
    } finally {
      setAuditLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (checkingRole || loading || !session || isGuest || !isAdmin) return;

    let isMounted = true;
    const init = async () => {
      try {
        await fetchMetrics();
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to load admin metrics.');
        showAlert('error', 'Admin dashboard unavailable', message);
      } finally {
        if (isMounted) setInitializingDashboard(false);
      }
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [checkingRole, loading, session, isGuest, isAdmin, fetchMetrics, showAlert]);

  useEffect(() => {
    if (!isAdmin || initializingDashboard) return;

    if (tab === 'permits') {
      void fetchPermits();
      return;
    }

    if (tab === 'users') {
      void fetchUsers();
      return;
    }

    if (tab === 'reports') {
      void fetchReports();
      void fetchIncidents();
      return;
    }

    if (tab === 'audit') {
      void fetchAudit();
    }
  }, [tab, isAdmin, initializingDashboard, fetchPermits, fetchUsers, fetchReports, fetchIncidents, fetchAudit]);

  const updateReportStatus = useCallback(
    async (reportId: string, nextStatus: 'resolved' | 'dismissed') => {
      setReportActionLoadingId(reportId);
      try {
        const { data, error } = await supabase.functions.invoke<any>('admin-reports-management', {
          body: {
            action: 'update_report_status',
            reportId,
            nextStatus,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        showAlert('success', 'Report updated', `Report marked as ${nextStatus}.`);
        await fetchReports();
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to update report.');
        showAlert('error', 'Failed to update report', message);
      } finally {
        setReportActionLoadingId(null);
      }
    },
    [fetchReports, showAlert],
  );

  const resolveIncident = useCallback(
    async (incidentId: string, resolution: BookingIncidentResolution) => {
      setIncidentActionLoadingId(incidentId);
      try {
        const { data, error } = await supabase.functions.invoke<any>('manage-bookings', {
          body: {
            action: 'admin_resolve_booking_incident',
            incident_id: incidentId,
            resolution,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        showAlert('success', 'Incident updated', `Incident marked as ${resolution.replace(/_/g, ' ')}.`);
        await fetchIncidents();
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to update incident.');
        showAlert('error', 'Failed to update incident', message);
      } finally {
        setIncidentActionLoadingId(null);
      }
    },
    [fetchIncidents, showAlert],
  );

  const openReviewModal = useCallback((item: PermitItem, action: 'approve' | 'reject') => {
    setReviewTarget(item);
    setReviewAction(action);
    setRejectReason('');
    setAdminNotes('');
  }, []);

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

      setReviewTarget(null);
      setReviewAction(null);
      setRejectReason('');
      setAdminNotes('');

      const actionLabel = reviewAction === 'approve' ? 'approved' : 'rejected';
      showAlert('success', 'Permit updated', `${reviewTarget.name} has been ${actionLabel}.`);

      await Promise.all([fetchPermits(), fetchMetrics()]);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to update permit status.');
      showAlert('error', 'Failed to review permit', message);
    } finally {
      setReviewSubmitting(false);
    }
  }, [reviewTarget, reviewAction, rejectReason, adminNotes, fetchPermits, fetchMetrics, showAlert]);

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

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;

    return users.filter((item) => {
      return (
        String(item.full_name || '').toLowerCase().includes(q) ||
        String(item.email || '').toLowerCase().includes(q) ||
        String(item.role || '').toLowerCase().includes(q)
      );
    });
  }, [users, userSearch]);

  const incidentActionable = useCallback((status: string) => {
    return ['open', 'responded', 'manual_review'].includes(status);
  }, []);

  const closeReviewModal = useCallback(() => {
    if (reviewSubmitting) return;
    setReviewTarget(null);
    setReviewAction(null);
    setRejectReason('');
    setAdminNotes('');
  }, [reviewSubmitting]);

  if (loading || checkingRole || initializingDashboard) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading admin dashboard...</Text>
      </View>
    );
  }

  if (!session || isGuest || !isAdmin) {
    return null;
  }

  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Admin" hideBackButton />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {showInlineTabNav && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {[
              { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
              { key: 'permits', label: 'Permits', icon: 'document-text-outline' },
              { key: 'users', label: 'Users', icon: 'people-outline' },
              { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
              { key: 'audit', label: 'Audit', icon: 'time-outline' },
            ].map((item) => {
              const active = tab === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={1}
                  onPress={() => handleTabChange(item.key as Tab)}
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
                  {item.key === 'permits' && metrics.pendingPermits > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{metrics.pendingPermits}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {tab === 'dashboard' && (
          <View style={styles.sectionGap}>
            <View style={styles.metricsGrid}>
              {[
                { label: 'Total Users', value: metrics.totalUsers, icon: 'people-outline' },
                { label: 'Studios', value: metrics.totalStudios, icon: 'mic-outline' },
                { label: 'Gigs', value: metrics.totalGigs, icon: 'musical-notes-outline' },
                { label: 'Audit Actions', value: metrics.recentActions, icon: 'time-outline' },
              ].map((stat) => (
                <View key={stat.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                  <Ionicons name={stat.icon as any} size={18} color={colors.primary} />
                  <Text style={[styles.metricValue, { color: colors.text }]}>{stat.value.toLocaleString()}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.metricsGrid}>
              {[
                { label: 'Pending Review', value: metrics.pendingPermits, filter: 'pending_review' as PermitFilter },
                { label: 'Approved', value: metrics.approvedPermits, filter: 'approved' as PermitFilter },
                { label: 'Rejected', value: metrics.rejectedPermits, filter: 'rejected' as PermitFilter },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  activeOpacity={1}
                  onPress={() => {
                    setPermitFilter(item.filter);
                    handleTabChange('permits');
                  }}
                  style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[styles.metricValue, { color: colors.text }]}>{item.value}</Text>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {tab === 'permits' && (
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
        )}

        {tab === 'users' && (
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

            {usersLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredUsers.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No users found.</Text>
            ) : (
              <View style={styles.sectionGap}>
                {filteredUsers.map((user) => (
                  <View key={user.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{user.full_name || 'Unknown'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{user.email}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Role: {user.role}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Verified: {user.is_verified ? 'Yes' : 'No'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Joined: {formatDateTime(user.created_at)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === 'reports' && (
          <View style={styles.sectionGap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {reportStatuses.map((status) => {
                const active = reportFilter === status;
                return (
                  <TouchableOpacity
                    key={status}
                    activeOpacity={1}
                    onPress={() => setReportFilter(status)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {status}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {reportsLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : reports.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No reports found.</Text>
            ) : (
              <View style={styles.sectionGap}>
                {reports.map((report) => (
                  <View key={report.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{report.reason}</Text>
                    {report.details ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{report.details}</Text>
                    ) : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Status: {report.status}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reporter: {report.reporter_name || 'Unknown'} ({report.reporter_email || 'no email'})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Target: {report.target_type} ({report.target_id})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Created: {formatDateTime(report.created_at)}</Text>

                    {report.status === 'pending' && (
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={reportActionLoadingId === report.id}
                          onPress={() => void updateReportStatus(report.id, 'resolved')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Resolve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={reportActionLoadingId === report.id}
                          onPress={() => void updateReportStatus(report.id, 'dismissed')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#64748B', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionHeading, { color: colors.text }]}>Booking Incident Queue</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {incidentStatuses.map((status) => {
                const active = incidentFilter === status;
                return (
                  <TouchableOpacity
                    key={status}
                    activeOpacity={1}
                    onPress={() => setIncidentFilter(status)}
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

            {incidentsLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : incidents.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No incidents found.</Text>
            ) : (
              <View style={styles.sectionGap}>
                {incidents.map((incident) => (
                  <View key={incident.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{String(incident.issue_type || 'issue').replace(/_/g, ' ')}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Status: {String(incident.status || '').replace(/_/g, ' ')}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Studio: {incident.studio_name || 'Unknown studio'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Booking: {incident.booking_date || '-'} {incident.booking_start_time ? String(incident.booking_start_time).slice(0, 5) : ''}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reporter: {incident.reporter_name} ({incident.reporter_email || 'no email'})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Counterparty: {incident.counterparty_name} ({incident.counterparty_email || 'no email'})</Text>
                    {incident.reporter_notes ? <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reporter note: {incident.reporter_notes}</Text> : null}
                    {incident.counterparty_notes ? <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Counterparty note: {incident.counterparty_notes}</Text> : null}
                    {incident.resolution ? <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Resolution: {incident.resolution}</Text> : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Created: {formatDateTime(incident.created_at)}</Text>
                    {incident.response_deadline_at ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Deadline: {formatDateTime(incident.response_deadline_at)}</Text>
                    ) : null}

                    {incidentActionable(String(incident.status || '')) && (
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={incidentActionLoadingId === incident.id}
                          onPress={() => void resolveIncident(incident.id, 'resolved_no_refund')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Resolve No Refund</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={incidentActionLoadingId === incident.id}
                          onPress={() => void resolveIncident(incident.id, 'resolved_refund')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#D97706', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Resolve Refund</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={incidentActionLoadingId === incident.id}
                          onPress={() => void resolveIncident(incident.id, 'dismissed')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#64748B', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {tab === 'audit' && (
          <View style={styles.sectionGap}>
            {auditLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : auditEntries.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No audit entries found.</Text>
            ) : (
              <View style={styles.sectionGap}>
                {auditEntries.map((entry) => (
                  <View key={entry.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{entry.entity_name || 'Unknown entity'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Action: {entry.action}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Type: {entry.entity_type}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>By: {entry.performer_name || 'System'}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>At: {formatDateTime(entry.created_at)}</Text>
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
        )}
      </ScrollView>

      <Modal visible={!!reviewTarget && !!reviewAction} transparent animationType="fade" onRequestClose={closeReviewModal}>
        <View style={styles.modalBackdrop}>
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

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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
  tabsRow: {
    gap: 8,
    paddingBottom: 4,
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
  tabText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'capitalize',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
  },
  sectionGap: {
    gap: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 152,
    flexGrow: 1,
    gap: 4,
  },
  metricValue: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    lineHeight: 28,
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
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
  inlineLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingVertical: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTypeChip: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
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
  cardMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  reasonText: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Poppins_500Medium',
  },
  cardActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  sectionHeading: {
    marginTop: 6,
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
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
  modalActionsRow: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
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
});
