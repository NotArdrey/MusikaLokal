import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from '../../lib/supabase';
import CustomAlert, { AlertType } from '../../src/components/CustomAlert';
import Header from '../../src/components/header';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';

export type Tab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit';
type PermitFilter = 'all' | 'pending_review' | 'approved' | 'rejected' | 'resubmitted';
type EntityFilter = 'all' | 'studio' | 'gig';
type ReportStatus = 'pending' | 'resolved' | 'dismissed';
type ReportFilter = 'all' | ReportStatus;
type ReportEscalationStatus = 'none' | 'manual_review';
type ReportEscalationFilter = 'all' | ReportEscalationStatus;
type ReportModerationAction = 'none' | 'warn_reporter' | 'warn_target_owner' | 'warn_both' | 'manual_review';
type BookingIncidentFilter =
  | 'all'
  | 'open'
  | 'responded'
  | 'manual_review'
  | 'resolved_refund'
  | 'resolved_no_refund'
  | 'dismissed';
type BookingIncidentResolution = 'resolved_refund' | 'resolved_no_refund' | 'dismissed';
type UserRole = 'musician' | 'studio-owner' | 'venue-owner' | 'admin';
type SubscriptionStatusOption = 'none' | 'active' | 'cancelled' | 'expired' | 'past_due';
type UserFilter = 'all' | 'musicians' | 'studio-owner' | 'venue-owner';
type AuditEntityFilter = 'all' | 'studio' | 'gig';
type AuditActionFilter = 'all' | 'approved' | 'rejected' | 'submitted' | 'resubmitted';

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
  totalReports: number;
  pendingReports: number;
  escalatedReports: number;
  openIncidents: number;
  resolvedIncidents: number;
  openIncidentsInRange: number;
  resolvedIncidentsInRange: number;
  activeSubscriptions: number;
  churnRatePercent: number;
  dau: number;
  mau: number;
  newSignups24h: number;
  grossRevenue: number;
  netRevenue: number;
  pendingPayouts: number;
  avgReportResolutionHours: number;
  avgIncidentResolutionHours: number;
  paymongoSuccessRate: number;
  dbHealthy: boolean;
  apiHealthy: boolean;
  paymongoHealthy: boolean;
  subscriptionTierBasic: number;
  subscriptionTierPro: number;
  subscriptionTierOther: number;
  incidentTypeBreakdown: {
    key: string;
    label: string;
    category: 'booking' | 'profile' | 'other';
    total: number;
    open: number;
    avgResolutionHours: number;
  }[];
  peakActivitySlots: {
    label: string;
    count: number;
  }[];
  revenueTrend: {
    label: string;
    gross: number;
    net: number;
  }[];
  searchSummary: {
    users: number;
    reports: number;
    incidents: number;
    transactions: number;
    total: number;
  };
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

interface ReportEntry {
  id: string;
  reporter_id: string | null;
  reporter_name: string;
  reporter_email: string;
  target_type: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_name: string;
  moderation_action: ReportModerationAction;
  moderation_notes: string | null;
  escalation_status: ReportEscalationStatus;
  escalated_at: string | null;
  escalation_reason: string | null;
}

interface ReportDetailsEntry {
  report: Record<string, unknown> | null;
  reporter_profile: Record<string, unknown> | null;
  reviewer_profile: Record<string, unknown> | null;
  target:
    | {
      type: string;
      id: string;
      table: string | null;
      record: Record<string, unknown> | null;
      owner_profile: Record<string, unknown> | null;
    }
    | null;
}

interface BookingIncidentEntry {
  id: string;
  booking_id?: string | null;
  reporter_user_id?: string | null;
  counterparty_user_id?: string | null;
  resolved_by_user_id?: string | null;
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
  children?: React.ReactNode;
}

type AdminPanelContextValue = any;

const AdminPanelContext = createContext<AdminPanelContextValue | null>(null);

export const useAdminPanelContext = () => {
  const context = useContext(AdminPanelContext);

  if (!context) {
    throw new Error('useAdminPanelContext must be used within AdminPanel context.');
  }

  return context as AdminPanelContextValue;
};

const defaultMetrics: DashboardMetrics = {
  totalUsers: 0,
  totalStudios: 0,
  totalGigs: 0,
  pendingPermits: 0,
  approvedPermits: 0,
  rejectedPermits: 0,
  recentActions: 0,
  totalReports: 0,
  pendingReports: 0,
  escalatedReports: 0,
  openIncidents: 0,
  resolvedIncidents: 0,
  openIncidentsInRange: 0,
  resolvedIncidentsInRange: 0,
  activeSubscriptions: 0,
  churnRatePercent: 0,
  dau: 0,
  mau: 0,
  newSignups24h: 0,
  grossRevenue: 0,
  netRevenue: 0,
  pendingPayouts: 0,
  avgReportResolutionHours: 0,
  avgIncidentResolutionHours: 0,
  paymongoSuccessRate: 0,
  dbHealthy: false,
  apiHealthy: false,
  paymongoHealthy: false,
  subscriptionTierBasic: 0,
  subscriptionTierPro: 0,
  subscriptionTierOther: 0,
  incidentTypeBreakdown: [],
  peakActivitySlots: [],
  revenueTrend: [],
  searchSummary: {
    users: 0,
    reports: 0,
    incidents: 0,
    transactions: 0,
    total: 0,
  },
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

const isUnsupportedActionMessage = (message: string, action: string) => {
  const normalizedMessage = String(message || '').toLowerCase();
  const normalizedAction = String(action || '').toLowerCase();

  if (!normalizedMessage) return false;
  if (normalizedAction && normalizedMessage.includes(`unsupported action: ${normalizedAction}`)) {
    return true;
  }

  return normalizedMessage.includes('unsupported action') || normalizedMessage.includes('invalid action');
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

const formatCurrency = (value?: number | null) => {
  const safeValue = Number(value || 0);
  return `₱${safeValue.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatPercent = (value?: number | null) => {
  const safeValue = Number(value || 0);
  return `${safeValue.toFixed(1)}%`;
};

const formatHours = (value?: number | null) => {
  const safeValue = Number(value || 0);
  if (!safeValue) return 'n/a';
  return `${safeValue.toFixed(1)}h`;
};

const permitStatuses: PermitFilter[] = ['all', 'pending_review', 'approved', 'rejected', 'resubmitted'];
const entityTypes: EntityFilter[] = ['all', 'studio', 'gig'];
const reportStatuses: ReportFilter[] = ['all', 'pending', 'resolved', 'dismissed'];
const reportEscalationFilters: ReportEscalationFilter[] = ['all', 'none', 'manual_review'];
const reportModerationActions: ReportModerationAction[] = ['none', 'warn_reporter', 'warn_target_owner', 'warn_both', 'manual_review'];
const incidentStatuses: BookingIncidentFilter[] = [
  'all',
  'open',
  'responded',
  'manual_review',
  'resolved_refund',
  'resolved_no_refund',
  'dismissed',
];
const userRoleOptions: UserRole[] = ['musician', 'studio-owner', 'venue-owner', 'admin'];
const subscriptionStatusOptions: SubscriptionStatusOption[] = ['none', 'active', 'cancelled', 'expired', 'past_due'];
const userFilters: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'musicians', label: 'musicians' },
  { value: 'studio-owner', label: 'studio owner' },
  { value: 'venue-owner', label: 'venue owner' },
];
const auditEntityTypes: AuditEntityFilter[] = ['all', 'studio', 'gig'];
const auditActions: AuditActionFilter[] = ['all', 'approved', 'rejected', 'submitted', 'resubmitted'];
const REPORTS_PAGE_SIZE = 50;

const normalizeUserRole = (rawRole: unknown): UserRole => {
  const normalized = String(rawRole || '').trim().toLowerCase();

  if (normalized === 'manager' || normalized === 'musician-member') {
    return 'musician';
  }

  return userRoleOptions.includes(normalized as UserRole) ? (normalized as UserRole) : 'musician';
};

const normalizeSubscriptionStatus = (rawStatus: unknown): SubscriptionStatusOption => {
  const normalized = String(rawStatus || '').trim().toLowerCase() as SubscriptionStatusOption;
  return subscriptionStatusOptions.includes(normalized) ? normalized : 'none';
};

const toDateTimeLocalValue = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  // Convert UTC timestamp to local datetime-local compatible text.
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
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

export default function AdminPanel({ initialTab, children }: AdminPanelProps) {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [initializingDashboard, setInitializingDashboard] = useState(false);

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
  const [userFilter, setUserFilter] = useState<UserFilter>('all');

  const [reportFilter, setReportFilter] = useState<ReportFilter>('all');
  const [reportEscalationFilter, setReportEscalationFilter] = useState<ReportEscalationFilter>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [reportsOffset, setReportsOffset] = useState(0);
  const [reportsHasMore, setReportsHasMore] = useState(false);
  const [incidentFilter, setIncidentFilter] = useState<BookingIncidentFilter>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState<AuditEntityFilter>('all');
  const [auditActionFilter, setAuditActionFilter] = useState<AuditActionFilter>('all');

  const [dashboardDateRange, setDashboardDateRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [globalSearch, setGlobalSearch] = useState('');
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');
  const [revenueFilter, setRevenueFilter] = useState<'gross' | 'net'>('net');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<'all' | 'booking' | 'profile'>('all');

  const [permitsLoading, setPermitsLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const [userActionLoadingId, setUserActionLoadingId] = useState<string | null>(null);
  const [userDetailsLoadingKey, setUserDetailsLoadingKey] = useState<string | null>(null);
  const [reportActionLoadingId, setReportActionLoadingId] = useState<string | null>(null);
  const [reportViewLoadingId, setReportViewLoadingId] = useState<string | null>(null);
  const [incidentActionLoadingId, setIncidentActionLoadingId] = useState<string | null>(null);

  const [userModalVisible, setUserModalVisible] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit'>('create');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormFullName, setUserFormFullName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormRole, setUserFormRole] = useState<UserRole>('musician');
  const [userFormPassword, setUserFormPassword] = useState('');
  const [userFormIsVerified, setUserFormIsVerified] = useState(false);
  const [userFormEmailConfirmed, setUserFormEmailConfirmed] = useState(false);
  const [userFormSubscriptionStatus, setUserFormSubscriptionStatus] = useState<SubscriptionStatusOption>('none');
  const [userFormSubscriptionExpiresAt, setUserFormSubscriptionExpiresAt] = useState('');
  const [userFormSubscriptionPlanId, setUserFormSubscriptionPlanId] = useState('');
  const [userFormSubmitting, setUserFormSubmitting] = useState(false);

  const [userDetailsTarget, setUserDetailsTarget] = useState<UserDetailsEntry | null>(null);
  const [reportDetailsTarget, setReportDetailsTarget] = useState<ReportDetailsEntry | null>(null);
  const [reportModerationTarget, setReportModerationTarget] = useState<ReportEntry | null>(null);
  const [reportModerationStatus, setReportModerationStatus] = useState<ReportStatus>('resolved');
  const [reportModerationAction, setReportModerationAction] = useState<ReportModerationAction>('none');
  const [reportModerationNotes, setReportModerationNotes] = useState('');
  const [reportEscalationReason, setReportEscalationReason] = useState('');
  const [reportModerationSubmitting, setReportModerationSubmitting] = useState(false);
  const [incidentResolutionTarget, setIncidentResolutionTarget] = useState<BookingIncidentEntry | null>(null);
  const [incidentResolutionChoice, setIncidentResolutionChoice] = useState<BookingIncidentResolution>('resolved_no_refund');
  const [incidentResolutionNotes, setIncidentResolutionNotes] = useState('');
  const [incidentResolutionSubmitting, setIncidentResolutionSubmitting] = useState(false);

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

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    router.replace(adminTabRoutes[nextTab] as any);
  }, [tab]);

  useEffect(() => {
    setTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDashboardSearchQuery(globalSearch.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [globalSearch]);

  const fetchMetrics = useCallback(async (filters?: {
    dateRange?: '7d' | '30d' | 'all';
    searchQuery?: string;
  }) => {
    const dateRange = filters?.dateRange || '30d';
    const searchQuery = String(filters?.searchQuery || '').trim();

    const { data, error } = await supabase.functions.invoke<any>('permit-management', {
      body: {
        action: 'fetch_metrics',
        dateRange,
        searchQuery: searchQuery || null,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));

    const incidentTypeBreakdown = Array.isArray(data?.incidentTypeBreakdown)
      ? data.incidentTypeBreakdown.map((item: any) => ({
        key: String(item?.key || ''),
        label: String(item?.label || item?.key || 'Unspecified'),
        category: (['booking', 'profile', 'other'].includes(String(item?.category || '').toLowerCase())
          ? String(item.category).toLowerCase()
          : 'other') as 'booking' | 'profile' | 'other',
        total: Number(item?.total || 0),
        open: Number(item?.open || 0),
        avgResolutionHours: Number(item?.avgResolutionHours || 0),
      }))
      : [];

    const peakActivitySlots = Array.isArray(data?.peakActivitySlots)
      ? data.peakActivitySlots.map((item: any) => ({
        label: String(item?.label || '-'),
        count: Number(item?.count || 0),
      }))
      : [];

    const revenueTrend = Array.isArray(data?.revenueTrend)
      ? data.revenueTrend.map((item: any) => ({
        label: String(item?.label || '-'),
        gross: Number(item?.gross || 0),
        net: Number(item?.net || 0),
      }))
      : [];

    setMetrics({
      totalUsers: Number(data?.totalUsers || 0),
      totalStudios: Number(data?.totalStudios || 0),
      totalGigs: Number(data?.totalGigs || 0),
      pendingPermits: Number(data?.pendingPermits || 0),
      approvedPermits: Number(data?.approvedPermits || 0),
      rejectedPermits: Number(data?.rejectedPermits || 0),
      recentActions: Number(data?.recentActions || 0),
      totalReports: Number(data?.totalReports || 0),
      pendingReports: Number(data?.pendingReports || 0),
      escalatedReports: Number(data?.escalatedReports || 0),
      openIncidents: Number(data?.openIncidents || 0),
      resolvedIncidents: Number(data?.resolvedIncidents || 0),
      openIncidentsInRange: Number(data?.openIncidentsInRange || 0),
      resolvedIncidentsInRange: Number(data?.resolvedIncidentsInRange || 0),
      activeSubscriptions: Number(data?.activeSubscriptions || 0),
      churnRatePercent: Number(data?.churnRatePercent || 0),
      dau: Number(data?.dau || 0),
      mau: Number(data?.mau || 0),
      newSignups24h: Number(data?.newSignups24h || 0),
      grossRevenue: Number(data?.grossRevenue || 0),
      netRevenue: Number(data?.netRevenue || 0),
      pendingPayouts: Number(data?.pendingPayouts || 0),
      avgReportResolutionHours: Number(data?.avgReportResolutionHours || 0),
      avgIncidentResolutionHours: Number(data?.avgIncidentResolutionHours || 0),
      paymongoSuccessRate: Number(data?.paymongoSuccessRate || 0),
      dbHealthy: Boolean(data?.dbHealthy),
      apiHealthy: Boolean(data?.apiHealthy),
      paymongoHealthy: Boolean(data?.paymongoHealthy),
      subscriptionTierBasic: Number(data?.subscriptionTierBasic || 0),
      subscriptionTierPro: Number(data?.subscriptionTierPro || 0),
      subscriptionTierOther: Number(data?.subscriptionTierOther || 0),
      incidentTypeBreakdown,
      peakActivitySlots,
      revenueTrend,
      searchSummary: {
        users: Number(data?.searchSummary?.users || 0),
        reports: Number(data?.searchSummary?.reports || 0),
        incidents: Number(data?.searchSummary?.incidents || 0),
        transactions: Number(data?.searchSummary?.transactions || 0),
        total: Number(data?.searchSummary?.total || 0),
      },
    });
  }, []);

  const refreshMetrics = useCallback(async () => {
    await fetchMetrics({
      dateRange: dashboardDateRange,
      searchQuery: dashboardSearchQuery,
    });
  }, [fetchMetrics, dashboardDateRange, dashboardSearchQuery]);

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

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      console.log('[AdminPanel][Users] Fetch started');
      const data = await invokeAdminUsersManagement({
        action: 'fetch_users',
        limit: 300,
      });

      const items = Array.isArray(data?.items) ? data.items : [];
      setUsers(items);
      console.log('[AdminPanel][Users] Fetch success', {
        total: items.length,
      });
    } catch (error) {
      console.error('[AdminPanel][Users] Fetch failed', error);
      const message = await getErrorMessage(error, 'Unable to fetch users.');
      showAlert('error', 'Failed to load users', message);
    } finally {
      setUsersLoading(false);
    }
  }, [showAlert, invokeAdminUsersManagement]);

  useEffect(() => {
    setReportsOffset(0);
  }, [reportFilter, reportEscalationFilter]);

  const fetchReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      console.log('[AdminPanel][Reports] Fetch started', {
        statusFilter: reportFilter,
        escalationFilter: reportEscalationFilter,
        offset: reportsOffset,
      });
      const { data, error } = await supabase.functions.invoke<any>('admin-reports-management', {
        body: {
          action: 'fetch_reports',
          statusFilter: reportFilter,
          escalationFilter: reportEscalationFilter,
          limit: REPORTS_PAGE_SIZE,
          offset: reportsOffset,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      const rawItems = Array.isArray(data?.items) ? data.items : [];
      const normalizedItems: ReportEntry[] = rawItems.map((item: any) => ({
        id: String(item?.id || ''),
        reporter_id: item?.reporter_id ? String(item.reporter_id) : null,
        reporter_name: String(item?.reporter_name || 'Unknown'),
        reporter_email: String(item?.reporter_email || ''),
        target_type: String(item?.target_type || ''),
        target_id: String(item?.target_id || ''),
        reason: String(item?.reason || 'No reason provided'),
        details: item?.details ? String(item.details) : null,
        status: (String(item?.status || 'pending') as ReportStatus),
        created_at: String(item?.created_at || ''),
        reviewed_by: item?.reviewed_by ? String(item.reviewed_by) : null,
        reviewed_at: item?.reviewed_at ? String(item.reviewed_at) : null,
        reviewer_name: String(item?.reviewer_name || ''),
        moderation_action: (String(item?.moderation_action || 'none') as ReportModerationAction),
        moderation_notes: item?.moderation_notes ? String(item.moderation_notes) : null,
        escalation_status: (String(item?.escalation_status || 'none') as ReportEscalationStatus),
        escalated_at: item?.escalated_at ? String(item.escalated_at) : null,
        escalation_reason: item?.escalation_reason ? String(item.escalation_reason) : null,
      }));

      setReports(normalizedItems);
      setReportsHasMore(Boolean(data?.hasMore));
      console.log('[AdminPanel][Reports] Fetch success', {
        total: normalizedItems.length,
        hasMore: Boolean(data?.hasMore),
      });
    } catch (error) {
      console.error('[AdminPanel][Reports] Fetch failed', error);
      const message = await getErrorMessage(error, 'Unable to fetch reports.');
      showAlert('error', 'Failed to load reports', message);
      setReports([]);
      setReportsHasMore(false);
    } finally {
      setReportsLoading(false);
    }
  }, [reportFilter, reportEscalationFilter, reportsOffset, showAlert]);

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

  const fetchAudit = useCallback(async () => {
    setAuditLoading(true);
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

      const mappedItems = await mapAuditRows(rawItems);
      setAuditEntries(mappedItems);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to fetch audit entries.');
      showAlert('error', 'Failed to load audit log', message);
    } finally {
      setAuditLoading(false);
    }
  }, [showAlert, mapAuditRows]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingDashboard(false);
      return;
    }

    let isMounted = true;
    setInitializingDashboard(true);
    const init = async () => {
      try {
        await fetchMetrics({
          dateRange: '30d',
          searchQuery: '',
        });
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
  }, [loading, roleResolved, session, isGuest, isAdmin, fetchMetrics, showAlert]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin || initializingDashboard) {
      return;
    }

    if (tab !== 'dashboard') {
      return;
    }

    void (async () => {
      try {
        await refreshMetrics();
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to refresh dashboard metrics.');
        showAlert('error', 'Dashboard metrics unavailable', message);
      }
    })();
  }, [
    loading,
    roleResolved,
    session,
    isGuest,
    isAdmin,
    initializingDashboard,
    tab,
    refreshMetrics,
    showAlert,
  ]);

  useEffect(() => {
    if (!roleResolved || !isAdmin || initializingDashboard) return;

    if (tab === 'permits') {
      void fetchPermits();
      return;
    }

    if (tab === 'users') {
      console.log('[AdminPanel][Users] Page opened');
      void fetchUsers();
      return;
    }

    if (tab === 'reports') {
      console.log('[AdminPanel][Reports] Page opened');
      void fetchReports();
      void fetchIncidents();
      return;
    }

    if (tab === 'audit') {
      void fetchAudit();
    }
  }, [tab, roleResolved, isAdmin, initializingDashboard, fetchPermits, fetchUsers, fetchReports, fetchIncidents, fetchAudit]);

  const moderateReport = useCallback(
    async ({
      reportId,
      nextStatus,
      moderationAction = 'none',
      moderationNotes = '',
      escalationReason = '',
    }: {
      reportId: string;
      nextStatus: ReportStatus;
      moderationAction?: ReportModerationAction;
      moderationNotes?: string;
      escalationReason?: string;
    }) => {
      setReportActionLoadingId(reportId);
      try {
        const { data, error } = await supabase.functions.invoke<any>('admin-reports-management', {
          body: {
            action: 'update_report_status',
            reportId,
            nextStatus,
            moderationAction,
            moderationNotes: moderationNotes.trim() || null,
            escalationReason: escalationReason.trim() || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        const moderationLabel = moderationAction.replace(/_/g, ' ');
        const statusLabel = nextStatus.replace(/_/g, ' ');
        showAlert('success', 'Report updated', `Status set to ${statusLabel}. Action: ${moderationLabel}.`);
        await fetchReports();
        return true;
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to update report.');
        showAlert('error', 'Failed to update report', message);
        return false;
      } finally {
        setReportActionLoadingId(null);
      }
    },
    [fetchReports, showAlert],
  );

  const openReportModerationModal = useCallback(
    (
      targetReport: ReportEntry,
      presetStatus?: ReportStatus,
      presetAction?: ReportModerationAction,
    ) => {
      const defaultStatus: ReportStatus = targetReport.status === 'pending' ? 'resolved' : 'pending';
      setReportModerationTarget(targetReport);
      setReportModerationStatus(presetStatus || defaultStatus);
      setReportModerationAction(presetAction || 'none');
      setReportModerationNotes('');
      setReportEscalationReason('');
    },
    [],
  );

  const closeReportModerationModal = useCallback(() => {
    if (reportModerationSubmitting) return;
    setReportModerationTarget(null);
    setReportModerationStatus('resolved');
    setReportModerationAction('none');
    setReportModerationNotes('');
    setReportEscalationReason('');
  }, [reportModerationSubmitting]);

  const submitReportModeration = useCallback(async () => {
    if (!reportModerationTarget) return;

    if (reportModerationAction === 'manual_review' && reportModerationStatus !== 'pending') {
      showAlert('warning', 'Invalid moderation state', 'Manual review escalation requires pending status.');
      return;
    }

    setReportModerationSubmitting(true);
    try {
      const updated = await moderateReport({
        reportId: reportModerationTarget.id,
        nextStatus: reportModerationStatus,
        moderationAction: reportModerationAction,
        moderationNotes: reportModerationNotes,
        escalationReason: reportEscalationReason,
      });

      if (updated) {
        setReportModerationTarget(null);
        setReportModerationStatus('resolved');
        setReportModerationAction('none');
        setReportModerationNotes('');
        setReportEscalationReason('');
      }
    } finally {
      setReportModerationSubmitting(false);
    }
  }, [
    reportModerationAction,
    reportModerationNotes,
    reportModerationStatus,
    reportModerationTarget,
    reportEscalationReason,
    moderateReport,
    showAlert,
  ]);

  const openReportDetailsModal = useCallback(async (reportId: string) => {
    setReportViewLoadingId(reportId);
    try {
      let data: any = null;

      try {
        const response = await supabase.functions.invoke<any>('admin-reports-management', {
          body: {
            action: 'fetch_report_details',
            reportId,
          },
        });

        if (response.error) throw response.error;
        if (response.data?.error) throw new Error(String(response.data.error));
        data = response.data;
      } catch (primaryError) {
        const primaryMessage = await getErrorMessage(primaryError, 'Unable to load report details.');

        if (!isUnsupportedActionMessage(primaryMessage, 'fetch_report_details')) {
          throw primaryError;
        }

        try {
          data = await invokeManageBookingsAction({
            action: 'fetch_report_details',
            reportId,
          });
        } catch (secondaryError) {
          const secondaryMessage = await getErrorMessage(secondaryError, 'Unable to load report details.');

          if (!isUnsupportedActionMessage(secondaryMessage, 'fetch_report_details')) {
            throw secondaryError;
          }

          const fallbackReport = reports.find((entry) => entry.id === reportId) || null;
          if (!fallbackReport) {
            throw secondaryError;
          }

          data = {
            report: fallbackReport,
            reporter_profile: null,
            target: null,
          };
        }
      }

      const report = data?.report && typeof data.report === 'object' ? (data.report as Record<string, unknown>) : null;
      const reporterProfile = data?.reporter_profile && typeof data.reporter_profile === 'object'
        ? (data.reporter_profile as Record<string, unknown>)
        : null;

      const targetRaw = data?.target;
      const target = targetRaw && typeof targetRaw === 'object'
        ? {
          type: String(targetRaw.type || ''),
          id: String(targetRaw.id || ''),
          table: targetRaw.table ? String(targetRaw.table) : null,
          record: targetRaw.record && typeof targetRaw.record === 'object'
            ? (targetRaw.record as Record<string, unknown>)
            : null,
          owner_profile: targetRaw.owner_profile && typeof targetRaw.owner_profile === 'object'
            ? (targetRaw.owner_profile as Record<string, unknown>)
            : null,
        }
        : null;

      const reviewerProfile = data?.reviewer_profile && typeof data.reviewer_profile === 'object'
        ? (data.reviewer_profile as Record<string, unknown>)
        : null;

      setReportDetailsTarget({
        report,
        reporter_profile: reporterProfile,
        reviewer_profile: reviewerProfile,
        target,
      });
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to load report details.');
      showAlert('error', 'Failed to load report details', message);
    } finally {
      setReportViewLoadingId(null);
    }
  }, [showAlert, invokeManageBookingsAction, reports]);

  const closeReportDetailsModal = useCallback(() => {
    setReportDetailsTarget(null);
  }, []);

  const resolveIncident = useCallback(
    async (incidentId: string, resolution: BookingIncidentResolution, adminResolutionNotes = '') => {
      setIncidentActionLoadingId(incidentId);
      try {
        const { data, error } = await supabase.functions.invoke<any>('manage-bookings', {
          body: {
            action: 'admin_resolve_booking_incident',
            incident_id: incidentId,
            resolution,
            admin_notes: adminResolutionNotes.trim() || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        showAlert('success', 'Incident updated', `Incident marked as ${resolution.replace(/_/g, ' ')}.`);
        await fetchIncidents();
        return true;
      } catch (error) {
        const message = await getErrorMessage(error, 'Unable to update incident.');
        showAlert('error', 'Failed to update incident', message);
        return false;
      } finally {
        setIncidentActionLoadingId(null);
      }
    },
    [fetchIncidents, showAlert],
  );

  const openIncidentResolutionModal = useCallback(
    (incident: BookingIncidentEntry, resolution: BookingIncidentResolution) => {
      setIncidentResolutionTarget(incident);
      setIncidentResolutionChoice(resolution);
      setIncidentResolutionNotes('');
    },
    [],
  );

  const closeIncidentResolutionModal = useCallback(() => {
    if (incidentResolutionSubmitting) return;
    setIncidentResolutionTarget(null);
    setIncidentResolutionChoice('resolved_no_refund');
    setIncidentResolutionNotes('');
  }, [incidentResolutionSubmitting]);

  const submitIncidentResolution = useCallback(async () => {
    if (!incidentResolutionTarget) return;

    setIncidentResolutionSubmitting(true);
    try {
      const ok = await resolveIncident(
        incidentResolutionTarget.id,
        incidentResolutionChoice,
        incidentResolutionNotes,
      );

      if (ok) {
        setIncidentResolutionTarget(null);
        setIncidentResolutionChoice('resolved_no_refund');
        setIncidentResolutionNotes('');
      }
    } finally {
      setIncidentResolutionSubmitting(false);
    }
  }, [incidentResolutionChoice, incidentResolutionNotes, incidentResolutionTarget, resolveIncident]);

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

      // Keep the details modal usable even when backend detail actions are unavailable.
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

  const reportDetailsReporterId = String(
    reportDetailsTarget?.reporter_profile?.id ||
    reportDetailsTarget?.report?.['reporter_id'] ||
    '',
  ).trim();

  const reportDetailsOwnerId = String(
    reportDetailsTarget?.target?.owner_profile?.id ||
    ((reportDetailsTarget?.target?.type === 'profile' || reportDetailsTarget?.target?.type === 'user')
      ? reportDetailsTarget?.target?.id
      : '') ||
    '',
  ).trim();

  const reportDetailsReporterLoadingKey = 'report-details-reporter';
  const reportDetailsOwnerLoadingKey = 'report-details-owner';

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

      setUserModalVisible(false);
      setEditingUserId(null);
      resetUserForm();
      await Promise.all([fetchUsers(), refreshMetrics()]);
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
    refreshMetrics,
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

                  showAlert('success', 'User deleted', 'The user account has been removed.');
                  await Promise.all([fetchUsers(), refreshMetrics()]);
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
    [session?.user.id, showAlert, fetchUsers, refreshMetrics, invokeAdminUsersManagement],
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

      await Promise.all([fetchPermits(), refreshMetrics()]);
    } catch (error) {
      const message = await getErrorMessage(error, 'Unable to update permit status.');
      showAlert('error', 'Failed to review permit', message);
    } finally {
      setReviewSubmitting(false);
    }
  }, [reviewTarget, reviewAction, rejectReason, adminNotes, fetchPermits, refreshMetrics, showAlert]);

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

  const filteredReports = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    if (!q) return reports;

    return reports.filter((item) => {
      return (
        String(item.reason || '').toLowerCase().includes(q) ||
        String(item.details || '').toLowerCase().includes(q) ||
        String(item.reporter_name || '').toLowerCase().includes(q) ||
        String(item.reporter_email || '').toLowerCase().includes(q) ||
        String(item.reviewer_name || '').toLowerCase().includes(q) ||
        String(item.moderation_action || '').toLowerCase().includes(q) ||
        String(item.moderation_notes || '').toLowerCase().includes(q) ||
        String(item.escalation_status || '').toLowerCase().includes(q) ||
        String(item.escalation_reason || '').toLowerCase().includes(q) ||
        String(item.target_type || '').toLowerCase().includes(q) ||
        String(item.target_id || '').toLowerCase().includes(q) ||
        String(item.status || '').toLowerCase().includes(q)
      );
    });
  }, [reports, reportSearch]);

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
        String(entry.created_at || '').toLowerCase().includes(query)
      );
    });
  }, [auditEntries, auditSearch, auditActionFilter, auditEntityFilter]);

  const dashboardIncidentRows = useMemo(() => {
    if (incidentTypeFilter === 'all') return metrics.incidentTypeBreakdown;
    return metrics.incidentTypeBreakdown.filter((row) => row.category === incidentTypeFilter);
  }, [metrics.incidentTypeBreakdown, incidentTypeFilter]);

  const subscriptionTierTotal = useMemo(() => {
    return metrics.subscriptionTierBasic + metrics.subscriptionTierPro + metrics.subscriptionTierOther;
  }, [metrics.subscriptionTierBasic, metrics.subscriptionTierPro, metrics.subscriptionTierOther]);

  const basicTierPercent = useMemo(() => {
    if (!subscriptionTierTotal) return 0;
    return (metrics.subscriptionTierBasic / subscriptionTierTotal) * 100;
  }, [metrics.subscriptionTierBasic, subscriptionTierTotal]);

  const proTierPercent = useMemo(() => {
    if (!subscriptionTierTotal) return 0;
    return (metrics.subscriptionTierPro / subscriptionTierTotal) * 100;
  }, [metrics.subscriptionTierPro, subscriptionTierTotal]);

  const otherTierPercent = useMemo(() => {
    if (!subscriptionTierTotal) return 0;
    return (metrics.subscriptionTierOther / subscriptionTierTotal) * 100;
  }, [metrics.subscriptionTierOther, subscriptionTierTotal]);

  const peakActivityMaxCount = useMemo(() => {
    if (!metrics.peakActivitySlots.length) return 1;
    return Math.max(...metrics.peakActivitySlots.map((slot) => Number(slot.count || 0)), 1);
  }, [metrics.peakActivitySlots]);

  const selectedRevenueValue = useMemo(() => {
    return revenueFilter === 'gross' ? metrics.grossRevenue : metrics.netRevenue;
  }, [metrics.grossRevenue, metrics.netRevenue, revenueFilter]);

  const revenueTrendRows = useMemo(() => {
    return metrics.revenueTrend.map((row) => ({
      ...row,
      value: revenueFilter === 'gross' ? Number(row.gross || 0) : Number(row.net || 0),
    }));
  }, [metrics.revenueTrend, revenueFilter]);

  const revenueTrendMax = useMemo(() => {
    if (!revenueTrendRows.length) return 1;
    return Math.max(...revenueTrendRows.map((row) => Number(row.value || 0)), 1);
  }, [revenueTrendRows]);

  const dashboardDateRangeLabel = useMemo(() => {
    if (dashboardDateRange === '7d') return 'Last 7 Days';
    if (dashboardDateRange === '30d') return 'Last 30 Days';
    return 'All Time';
  }, [dashboardDateRange]);

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

  const useExternalSections = Boolean(children);

  const adminPanelContextValue: AdminPanelContextValue = {
    colors,
    isDark,
    session,
    styles,
    metrics,
    permitStatuses,
    entityTypes,
    userFilters,
    reportStatuses,
    reportEscalationFilters,
    incidentStatuses,
    auditActions,
    auditEntityTypes,
    REPORTS_PAGE_SIZE,
    formatDateTime,
    formatCurrency,
    formatPercent,
    formatHours,
    globalSearch,
    setGlobalSearch,
    dashboardDateRange,
    setDashboardDateRange,
    dashboardSearchQuery,
    dashboardDateRangeLabel,
    revenueFilter,
    setRevenueFilter,
    incidentTypeFilter,
    setIncidentTypeFilter,
    selectedRevenueValue,
    revenueTrendRows,
    revenueTrendMax,
    subscriptionTierTotal,
    basicTierPercent,
    proTierPercent,
    otherTierPercent,
    dashboardIncidentRows,
    peakActivityMaxCount,
    permitSearch,
    setPermitSearch,
    permitFilter,
    setPermitFilter,
    entityFilter,
    setEntityFilter,
    permitsLoading,
    filteredPermits,
    openReviewModal,
    userSearch,
    setUserSearch,
    userFilter,
    setUserFilter,
    usersLoading,
    filteredUsers,
    openCreateUserModal,
    openEditUserModal,
    openUserDetailsModal,
    userDetailsLoadingKey,
    userActionLoadingId,
    deleteUser,
    reportSearch,
    setReportSearch,
    reportFilter,
    setReportFilter,
    reportEscalationFilter,
    setReportEscalationFilter,
    reportsLoading,
    reportsOffset,
    setReportsOffset,
    reportsHasMore,
    filteredReports,
    reportActionLoadingId,
    reportViewLoadingId,
    openReportDetailsModal,
    openReportModerationModal,
    moderateReport,
    incidentFilter,
    setIncidentFilter,
    incidentsLoading,
    incidents,
    incidentActionLoadingId,
    incidentActionable,
    openIncidentResolutionModal,
    auditSearch,
    setAuditSearch,
    auditActionFilter,
    setAuditActionFilter,
    auditEntityFilter,
    setAuditEntityFilter,
    auditLoading,
    filteredAuditEntries,
  };

  if (loading || !roleResolved || initializingDashboard) {
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

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
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

        {useExternalSections && (
          <AdminPanelContext.Provider value={adminPanelContextValue}>
            {children}
          </AdminPanelContext.Provider>
        )}

        {!useExternalSections && tab === 'dashboard' && (
          <View style={styles.sectionGap}>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8, zIndex: 10, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 200 }}>
                <TextInput
                  value={globalSearch}
                  onChangeText={setGlobalSearch}
                  placeholder="Global search (users, transactions, reports)..."
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.searchInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      paddingVertical: 8,
                    },
                  ]}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
                {(['7d', '30d', 'all'] as const).map((r) => {
                  const isActive = dashboardDateRange === r;
                  const labels = { '7d': 'Last 7 Days', '30d': 'Last 30 Days', 'all': 'All Time' };
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setDashboardDateRange(r)}
                      style={[styles.filterChip, { backgroundColor: isActive ? colors.primary : colors.card, borderColor: isActive ? colors.primary : colors.border }]}
                    >
                      <Text style={[styles.filterChipText, { color: isActive ? '#fff' : colors.textSecondary }]}>{labels[r]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {dashboardSearchQuery.length >= 2 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Search Matches ({dashboardDateRangeLabel})</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Users: {metrics.searchSummary.users}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reports: {metrics.searchSummary.reports}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Incidents: {metrics.searchSummary.incidents}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Transactions: {metrics.searchSummary.transactions}</Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Total matches: {metrics.searchSummary.total}</Text>
              </View>
            )}

            <View style={styles.pulseGrid}>
              <View style={[styles.pulseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.pulseHeader}>
                  <Text style={[styles.pulseTitle, { color: colors.textSecondary }]}>Users & Engagement</Text>
                  <Ionicons name="people-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.pulseRow}>
                  <Text style={[styles.pulseValueMain, { color: colors.text }]}>{metrics.totalUsers}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={styles.badgeGreen}><Text style={styles.badgeTextGreen}>+{metrics.newSignups24h} new signups (24h)</Text></View>
                </View>
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 8 }]}>DAU: {metrics.dau} | MAU: {metrics.mau}</Text>
              </View>

              <View style={[styles.pulseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.pulseHeader}>
                  <Text style={[styles.pulseTitle, { color: colors.textSecondary }]}>Subscriptions Health</Text>
                  <Ionicons name="star-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.pulseRow}>
                  <Text style={[styles.pulseValueMain, { color: colors.text }]}>{metrics.activeSubscriptions}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={styles.badgeGreen}><Text style={styles.badgeTextGreen}>Active subscribers</Text></View>
                  <View style={styles.badgeRed}><Text style={styles.badgeTextRed}>Churn {formatPercent(metrics.churnRatePercent)}</Text></View>
                </View>
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 8 }]}>Tier base tracked from active profiles</Text>
              </View>

              <View style={[styles.pulseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.pulseHeader}>
                  <Text style={[styles.pulseTitle, { color: colors.textSecondary }]}>Financial Overview</Text>
                  <Ionicons name="wallet-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.pulseRow}>
                  <Text style={[styles.pulseValueMain, { color: '#10b981' }]}>{formatCurrency(selectedRevenueValue)}</Text>
                </View>
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 12 }]}>Pending Payouts: {formatCurrency(metrics.pendingPayouts)}</Text>
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 2 }]}>Gross: {formatCurrency(metrics.grossRevenue)} | Net: {formatCurrency(metrics.netRevenue)}</Text>
              </View>

              <View style={[styles.pulseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.pulseHeader}>
                  <Text style={[styles.pulseTitle, { color: colors.textSecondary }]}>System Status</Text>
                  <Ionicons name="server-outline" size={20} color={metrics.dbHealthy && metrics.apiHealthy ? '#10b981' : '#ef4444'} />
                </View>
                <View style={styles.pulseRow}>
                  <Text style={[styles.pulseValueMain, { color: colors.text, fontSize: 18 }]}>Live Checks</Text>
                </View>
                <View style={{ marginTop: 12, gap: 6 }}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: metrics.dbHealthy ? '#10b981' : '#ef4444' }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Database: {metrics.dbHealthy ? 'Operational' : 'Issue detected'}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: metrics.apiHealthy ? '#10b981' : '#ef4444' }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>API: {metrics.apiHealthy ? 'Operational' : 'Issue detected'}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: metrics.paymongoHealthy ? '#10b981' : '#f59e0b' }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>PayMongo health: {formatPercent(metrics.paymongoSuccessRate)}</Text>
                  </View>
                </View>
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 8 }]}>Avg report resolve: {formatHours(metrics.avgReportResolutionHours)}</Text>
              </View>
            </View>

            <View style={styles.dataEngineRow}>
              <View style={[styles.dataEnginePanel, styles.dataEnginePanelLeft, { backgroundColor: colors.card, borderColor: colors.border, flex: Platform.OS === 'web' ? 5 : 1 }]}>
                <View style={[styles.pulseHeader, { marginBottom: 12, flexWrap: 'wrap', gap: 10 }]}>
                  <View>
                    <Text style={[styles.panelTitle, { color: colors.text }]}>Revenue Growth</Text>
                    <Text style={[styles.panelSubtitle, { color: colors.textSecondary, marginBottom: 0 }]}>{dashboardDateRangeLabel} real payment aggregates</Text>
                  </View>
                  <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                    <TouchableOpacity onPress={() => setRevenueFilter('gross')} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: revenueFilter === 'gross' ? colors.primary : 'transparent' }}>
                      <Text style={{ fontSize: 11, color: revenueFilter === 'gross' ? '#fff' : colors.textSecondary }}>Gross</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRevenueFilter('net')} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: revenueFilter === 'net' ? colors.primary : 'transparent' }}>
                      <Text style={{ fontSize: 11, color: revenueFilter === 'net' ? '#fff' : colors.textSecondary }}>Net</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.pulseValueMain, { color: '#10b981', marginBottom: 12 }]}>{formatCurrency(selectedRevenueValue)}</Text>

                <View style={styles.revenueTrendContainer}>
                  {revenueTrendRows.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 8 }]}>No revenue trend data yet for this date range.</Text>
                  ) : (
                    <View style={styles.revenueBarsRow}>
                      {revenueTrendRows.map((point, index) => {
                        const barHeight = Math.max(8, Math.round((point.value / revenueTrendMax) * 96));
                        const barColor = revenueFilter === 'gross' ? colors.primary : '#0ea5e9';

                        return (
                          <View key={`${point.label}-${index}`} style={styles.revenueBarColumn}>
                            <View style={[styles.revenueBarTrack, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                              <View style={[styles.revenueBarFill, { height: barHeight, backgroundColor: barColor }]} />
                            </View>
                            <Text numberOfLines={1} style={[styles.revenueBarLabel, { color: colors.textSecondary }]}>{point.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
                <View style={styles.chartLegendHorizontal}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Gross: {formatCurrency(metrics.grossRevenue)}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#0ea5e9' }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Net: {formatCurrency(metrics.netRevenue)}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.dataEnginePanel, styles.dataEnginePanelRight, { backgroundColor: colors.card, borderColor: colors.border, flex: Platform.OS === 'web' ? 3 : 1 }]}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>Subscription Tier Split</Text>
                <Text style={[styles.panelSubtitle, { color: colors.textSecondary, marginBottom: -10 }]}>Active subscriptions by plan ({dashboardDateRangeLabel})</Text>
                <View style={styles.subscriptionStackWrapper}>
                  {subscriptionTierTotal === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 8 }]}>No active subscriptions in this date range.</Text>
                  ) : (
                    <View style={[styles.subscriptionStackBar, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                      {metrics.subscriptionTierBasic > 0 && (
                        <View style={[styles.subscriptionStackSegment, { flex: basicTierPercent, backgroundColor: colors.primary }]} />
                      )}
                      {metrics.subscriptionTierPro > 0 && (
                        <View style={[styles.subscriptionStackSegment, { flex: proTierPercent, backgroundColor: '#6366f1' }]} />
                      )}
                      {metrics.subscriptionTierOther > 0 && (
                        <View style={[styles.subscriptionStackSegment, { flex: otherTierPercent, backgroundColor: '#f59e0b' }]} />
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.chartLegendVertical}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Basic: {metrics.subscriptionTierBasic} ({formatPercent(basicTierPercent)})</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]}>Pro: {metrics.subscriptionTierPro} ({formatPercent(proTierPercent)})</Text>
                  </View>
                  {metrics.subscriptionTierOther > 0 && (
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                      <Text style={[styles.legendText, { color: colors.textSecondary }]}>Other: {metrics.subscriptionTierOther} ({formatPercent(otherTierPercent)})</Text>
                    </View>
                  )}
                  <Text style={[styles.legendText, { color: colors.textSecondary, marginTop: 6 }]}>Total tracked: {subscriptionTierTotal}</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionCenterRow}>
              <View style={[styles.actionCenterPanel, styles.actionCenterPanelLeft, { backgroundColor: colors.card, borderColor: colors.border, flex: Platform.OS === 'web' ? 5 : 1 }]}>
                <View style={[styles.pulseHeader, { marginBottom: 16, flexWrap: 'wrap', gap: 10 }]}>
                  <View>
                    <Text style={[styles.panelTitle, { color: colors.text, marginBottom: 0 }]}>Incident Resolution</Text>
                    <Text style={[styles.panelSubtitle, { color: colors.textSecondary, marginBottom: 0 }]}>Open: {metrics.openIncidentsInRange} | Resolved: {metrics.resolvedIncidentsInRange} | Avg: {formatHours(metrics.avgIncidentResolutionHours)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                    {(['all', 'booking', 'profile'] as const).map((typeKey) => (
                      <TouchableOpacity
                        key={typeKey}
                        onPress={() => setIncidentTypeFilter(typeKey)}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: incidentTypeFilter === typeKey ? colors.primary : 'transparent' }}
                      >
                        <Text style={{ fontSize: 11, color: incidentTypeFilter === typeKey ? '#fff' : colors.textSecondary, textTransform: 'capitalize' }}>{typeKey}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.tableHeader}>
                  <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary }]}>Incident Type</Text>
                  <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary }]}>Volume</Text>
                  <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, textAlign: 'right' }]}>Avg Resolution</Text>
                </View>

                {dashboardIncidentRows.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 12 }]}>No incident records for this filter and date range.</Text>
                ) : (
                  dashboardIncidentRows.map((row) => (
                    <View key={row.key} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.tableCell, { color: colors.text }]}>{row.label}</Text>
                      <Text style={[styles.tableCell, { color: colors.textSecondary }]}>{row.total} total ({row.open} open)</Text>
                      <Text style={[styles.tableCell, { color: colors.textSecondary, textAlign: 'right' }]}>{formatHours(row.avgResolutionHours)}</Text>
                    </View>
                  ))
                )}
              </View>

              <View style={[styles.actionCenterPanel, styles.actionCenterPanelRight, { backgroundColor: colors.card, borderColor: colors.border, flex: Platform.OS === 'web' ? 3 : 1 }]}>
                <View style={[styles.pulseHeader, { marginBottom: 16, alignItems: 'flex-start' }]}>
                  <View>
                    <Text style={[styles.panelTitle, { color: colors.text, marginBottom: 0 }]}>Peak Activity Times</Text>
                    <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 4 }]}>{dashboardDateRangeLabel} booking density</Text>
                  </View>
                </View>

                <View style={{ gap: 14 }}>
                  {metrics.peakActivitySlots.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 8 }]}>No booking activity data yet for this date range.</Text>
                  ) : (
                    metrics.peakActivitySlots.map((slot, index) => {
                      const widthPercent = Math.max(8, Math.round((slot.count / peakActivityMaxCount) * 100));
                      const badgeLabel = index === 0 ? 'Highest' : index === 1 ? 'High' : 'Medium';
                      const badgeColor = index === 0 ? '#10b981' : index === 1 ? '#38bdf8' : '#f59e0b';

                      return (
                        <View key={`${slot.label}-${index}`}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins_500Medium' }}>{slot.label}</Text>
                            <View style={[styles.badgeGreen, { backgroundColor: `${badgeColor}26` }]}>
                              <Text style={[styles.badgeTextGreen, { color: badgeColor }]}>{badgeLabel} ({slot.count})</Text>
                            </View>
                          </View>
                          <View style={{ height: 8, backgroundColor: isDark ? '#334155' : '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                            <View style={{ width: `${widthPercent}%`, height: '100%', backgroundColor: badgeColor }} />
                          </View>
                        </View>
                      );
                    })
                  )}

                  <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 4 }]}>Use peak windows to plan moderation and support staffing.</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {!useExternalSections && tab === 'permits' && (
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

        {!useExternalSections && tab === 'users' && (
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
                )})}
              </View>
            )}
          </View>
        )}

        {!useExternalSections && tab === 'reports' && (
          <View style={styles.sectionGap}>
            <TextInput
              value={reportSearch}
              onChangeText={setReportSearch}
              placeholder="Search reports"
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {reportEscalationFilters.map((escalation) => {
                const active = reportEscalationFilter === escalation;
                return (
                  <TouchableOpacity
                    key={escalation}
                    activeOpacity={1}
                    onPress={() => setReportEscalationFilter(escalation)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {escalation.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.reportsPagerRow}>
              <TouchableOpacity
                activeOpacity={1}
                disabled={reportsLoading || reportsOffset <= 0}
                onPress={() => setReportsOffset((prev) => Math.max(0, prev - REPORTS_PAGE_SIZE))}
                style={[
                  styles.reportsPagerButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark ? '#0A1A32' : '#F8FAFC',
                    opacity: reportsOffset <= 0 ? 0.45 : 1,
                  },
                ]}
              >
                <Ionicons name="chevron-back-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.reportsPagerButtonText, { color: colors.textSecondary }]}>Prev</Text>
              </TouchableOpacity>

              <Text style={[styles.reportsPagerLabel, { color: colors.textSecondary }]}>Page {Math.floor(reportsOffset / REPORTS_PAGE_SIZE) + 1}</Text>

              <TouchableOpacity
                activeOpacity={1}
                disabled={reportsLoading || !reportsHasMore}
                onPress={() => setReportsOffset((prev) => prev + REPORTS_PAGE_SIZE)}
                style={[
                  styles.reportsPagerButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: isDark ? '#0A1A32' : '#F8FAFC',
                    opacity: reportsHasMore ? 1 : 0.45,
                  },
                ]}
              >
                <Text style={[styles.reportsPagerButtonText, { color: colors.textSecondary }]}>Next</Text>
                <Ionicons name="chevron-forward-outline" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {reportsLoading ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredReports.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No reports found.</Text>
            ) : (
              <View style={styles.sectionGap}>
                {filteredReports.map((report) => {
                  const reporterId = String(report.reporter_id || '').trim();
                  const reportReporterLoadingKey = `report-card-${report.id}-reporter`;

                  return (
                  <View key={report.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{report.reason}</Text>
                    {report.details ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{report.details}</Text>
                    ) : null}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Status: {report.status}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Escalation: {String(report.escalation_status || 'none').replace(/_/g, ' ')}</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reporter: {report.reporter_name || 'Unknown'} ({report.reporter_email || 'no email'})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Target: {report.target_type} ({report.target_id})</Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Created: {formatDateTime(report.created_at)}</Text>
                    {report.reviewed_at ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Reviewed: {formatDateTime(report.reviewed_at)} {report.reviewer_name ? `by ${report.reviewer_name}` : ''}</Text>
                    ) : null}
                    {report.moderation_action && report.moderation_action !== 'none' ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Action: {report.moderation_action.replace(/_/g, ' ')}</Text>
                    ) : null}
                    {report.moderation_notes ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Notes: {report.moderation_notes}</Text>
                    ) : null}
                    {report.escalation_reason ? (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Escalation reason: {report.escalation_reason}</Text>
                    ) : null}

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={reportViewLoadingId === report.id}
                        onPress={() => void openReportDetailsModal(report.id)}
                        style={[styles.smallActionButton, { borderColor: colors.border }]}
                      >
                        {reportViewLoadingId === report.id ? (
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
                        disabled={!reporterId || userDetailsLoadingKey === reportReporterLoadingKey}
                        onPress={() => {
                          if (!reporterId) return;
                          void openUserDetailsModal({
                            id: reporterId,
                            full_name: report.reporter_name,
                            email: report.reporter_email,
                          }, reportReporterLoadingKey);
                        }}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: reporterId ? 1 : 0.5 }]}
                      >
                        {userDetailsLoadingKey === reportReporterLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="person-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>View Reporter</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={reportActionLoadingId === report.id}
                        onPress={() => openReportModerationModal(report)}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                      >
                        <Ionicons name="construct-outline" size={14} color={colors.text} />
                        <Text style={[styles.smallActionText, { color: colors.text }]}>Moderate</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.cardActionsRow}>
                      {report.status === 'pending' ? (
                        <>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={reportActionLoadingId === report.id}
                          onPress={() => void moderateReport({ reportId: report.id, nextStatus: 'resolved' })}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Resolve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={reportActionLoadingId === report.id}
                          onPress={() => void moderateReport({ reportId: report.id, nextStatus: 'dismissed' })}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#64748B', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Dismiss</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={reportActionLoadingId === report.id}
                          onPress={() => openReportModerationModal(report, 'pending', 'manual_review')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#DC2626', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Escalate</Text>
                        </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={reportActionLoadingId === report.id}
                          onPress={() => void moderateReport({ reportId: report.id, nextStatus: 'pending' })}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#0EA5E9', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Reopen</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )})}
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
                {incidents.map((incident) => {
                  const reporterId = String(incident.reporter_user_id || '').trim();
                  const counterpartyId = String(incident.counterparty_user_id || '').trim();
                  const incidentReporterLoadingKey = `incident-card-${incident.id}-reporter`;
                  const incidentCounterpartyLoadingKey = `incident-card-${incident.id}-counterparty`;

                  return (
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

                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={!reporterId || userDetailsLoadingKey === incidentReporterLoadingKey}
                        onPress={() => {
                          if (!reporterId) return;
                          void openUserDetailsModal({
                            id: reporterId,
                            full_name: incident.reporter_name,
                            email: incident.reporter_email,
                          }, incidentReporterLoadingKey);
                        }}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: reporterId ? 1 : 0.5 }]}
                      >
                        {userDetailsLoadingKey === incidentReporterLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="person-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>View Reporter</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={1}
                        disabled={!counterpartyId || userDetailsLoadingKey === incidentCounterpartyLoadingKey}
                        onPress={() => {
                          if (!counterpartyId) return;
                          void openUserDetailsModal({
                            id: counterpartyId,
                            full_name: incident.counterparty_name,
                            email: incident.counterparty_email,
                          }, incidentCounterpartyLoadingKey);
                        }}
                        style={[styles.smallActionButton, { borderColor: colors.border, opacity: counterpartyId ? 1 : 0.5 }]}
                      >
                        {userDetailsLoadingKey === incidentCounterpartyLoadingKey ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <>
                            <Ionicons name="people-outline" size={14} color={colors.text} />
                            <Text style={[styles.smallActionText, { color: colors.text }]}>View Counterparty</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>

                    {incidentActionable(String(incident.status || '')) && (
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={incidentActionLoadingId === incident.id}
                          onPress={() => openIncidentResolutionModal(incident, 'resolved_no_refund')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Resolve No Refund</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={incidentActionLoadingId === incident.id}
                          onPress={() => openIncidentResolutionModal(incident, 'resolved_refund')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#D97706', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Resolve Refund</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={1}
                          disabled={incidentActionLoadingId === incident.id}
                          onPress={() => openIncidentResolutionModal(incident, 'dismissed')}
                          style={[styles.smallActionButtonFilled, { backgroundColor: '#64748B', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                        >
                          <Text style={styles.smallActionTextFilled}>Dismiss</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )})}
              </View>
            )}
          </View>
        )}

        {!useExternalSections && tab === 'audit' && (
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

      <Modal visible={!!reportDetailsTarget} transparent animationType="fade" onRequestClose={closeReportDetailsModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Report Details</Text>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailsSection('Report', reportDetailsTarget?.report || null, 'Report details are unavailable.')}

              {renderDetailsSection(
                'Reporter',
                reportDetailsTarget?.reporter_profile || (reportDetailsTarget?.report
                  ? {
                    reporter_id: reportDetailsTarget.report['reporter_id'],
                    reporter_name: reportDetailsTarget.report['reporter_name'],
                    reporter_email: reportDetailsTarget.report['reporter_email'],
                  }
                  : null),
                'Reporter profile details are unavailable.',
              )}

              {renderDetailsSection(
                'Reviewer',
                reportDetailsTarget?.reviewer_profile || (reportDetailsTarget?.report
                  ? {
                    reviewed_by: reportDetailsTarget.report['reviewed_by'],
                    reviewer_name: reportDetailsTarget.report['reviewer_name'],
                    reviewed_at: reportDetailsTarget.report['reviewed_at'],
                  }
                  : null),
                'Reviewer details are unavailable.',
              )}

              {renderDetailsSection(
                'Target Reference',
                reportDetailsTarget?.target
                  ? {
                    target_type: reportDetailsTarget.target.type,
                    target_id: reportDetailsTarget.target.id,
                    source_table: reportDetailsTarget.target.table,
                  }
                  : null,
                'Target reference details are unavailable.',
              )}

              {renderDetailsSection(
                'Target Record',
                reportDetailsTarget?.target?.record || null,
                'Target record details are unavailable.',
              )}

              {renderDetailsSection(
                'Target Owner / Organizer',
                reportDetailsTarget?.target?.owner_profile || null,
                'Target owner or organizer details are unavailable.',
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                disabled={!reportDetailsReporterId || userDetailsLoadingKey === reportDetailsReporterLoadingKey}
                onPress={() => {
                  if (!reportDetailsReporterId) return;

                  const reporterFullName = String(
                    reportDetailsTarget?.reporter_profile?.full_name ||
                    reportDetailsTarget?.report?.['reporter_name'] ||
                    '',
                  );
                  const reporterEmail = String(
                    reportDetailsTarget?.reporter_profile?.email ||
                    reportDetailsTarget?.report?.['reporter_email'] ||
                    '',
                  );

                  closeReportDetailsModal();

                  void openUserDetailsModal({
                    id: reportDetailsReporterId,
                    full_name: reporterFullName,
                    email: reporterEmail,
                  }, reportDetailsReporterLoadingKey);
                }}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE',
                    opacity: reportDetailsReporterId ? 1 : 0.5,
                  },
                ]}
              >
                {userDetailsLoadingKey === reportDetailsReporterLoadingKey ? (
                  <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#1E3A8A'} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: isDark ? '#FFFFFF' : '#1E3A8A' }]}>View Reporter</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                disabled={!reportDetailsOwnerId || userDetailsLoadingKey === reportDetailsOwnerLoadingKey}
                onPress={() => {
                  if (!reportDetailsOwnerId) return;

                  const ownerFullName = String(reportDetailsTarget?.target?.owner_profile?.full_name || '');
                  const ownerEmail = String(reportDetailsTarget?.target?.owner_profile?.email || '');

                  closeReportDetailsModal();

                  void openUserDetailsModal({
                    id: reportDetailsOwnerId,
                    full_name: ownerFullName,
                    email: ownerEmail,
                  }, reportDetailsOwnerLoadingKey);
                }}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: isDark ? '#065F46' : '#D1FAE5',
                    opacity: reportDetailsOwnerId ? 1 : 0.5,
                  },
                ]}
              >
                {userDetailsLoadingKey === reportDetailsOwnerLoadingKey ? (
                  <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#065F46'} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: isDark ? '#FFFFFF' : '#065F46' }]}>View Target Owner</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={closeReportDetailsModal}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!reportModerationTarget} transparent animationType="fade" onRequestClose={closeReportModerationModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Moderate Report</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {reportModerationTarget?.reason || 'Select moderation outcome and action.'}
            </Text>

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {(['pending', 'resolved', 'dismissed'] as ReportStatus[]).map((status) => {
                const active = reportModerationStatus === status;
                return (
                  <TouchableOpacity
                    key={status}
                    activeOpacity={1}
                    onPress={() => setReportModerationStatus(status)}
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

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Moderation Action</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {reportModerationActions.map((action) => {
                const active = reportModerationAction === action;
                return (
                  <TouchableOpacity
                    key={action}
                    activeOpacity={1}
                    onPress={() => {
                      setReportModerationAction(action);
                      if (action === 'manual_review') {
                        setReportModerationStatus('pending');
                      }
                    }}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {action.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              value={reportModerationNotes}
              onChangeText={setReportModerationNotes}
              placeholder="Moderation notes (optional)"
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

            {reportModerationAction === 'manual_review' && (
              <TextInput
                value={reportEscalationReason}
                onChangeText={setReportEscalationReason}
                placeholder="Escalation reason (recommended)"
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

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeReportModerationModal}
                disabled={reportModerationSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void submitReportModeration()}
                disabled={reportModerationSubmitting}
                style={[styles.modalButton, { backgroundColor: colors.primary, opacity: reportModerationSubmitting ? 0.6 : 1 }]}
              >
                {reportModerationSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!incidentResolutionTarget} transparent animationType="fade" onRequestClose={closeIncidentResolutionModal}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Resolve Incident</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {incidentResolutionTarget
                ? `${String(incidentResolutionTarget.issue_type || 'issue').replace(/_/g, ' ')} - ${incidentResolutionChoice.replace(/_/g, ' ')}`
                : 'Choose resolution notes.'}
            </Text>

            <TextInput
              value={incidentResolutionNotes}
              onChangeText={setIncidentResolutionNotes}
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
                onPress={closeIncidentResolutionModal}
                disabled={incidentResolutionSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={1}
                onPress={() => void submitIncidentResolution()}
                disabled={incidentResolutionSubmitting}
                style={[styles.modalButton, { backgroundColor: colors.primary, opacity: incidentResolutionSubmitting ? 0.6 : 1 }]}
              >
                {incidentResolutionSubmitting ? (
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
  inlineActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  secondaryActionButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secondaryActionText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  reportsPagerRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportsPagerButton: {
    minWidth: 104,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  reportsPagerButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
  reportsPagerLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
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
  modalCardLarge: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
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
  detailsRows: {
    gap: 8,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  detailsEmptyText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  modalDescription: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  formLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
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
  modalInputCompact: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  booleanToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
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
  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pulseCard: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  pulseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pulseTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  pulseValueMain: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
  },
  pulseSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 4,
  },
  badgeGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeTextGreen: {
    color: '#10b981',
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  badgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeTextRed: {
    color: '#ef4444',
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  mockSparklineContainer: {
    position: 'absolute',
    bottom: -10,
    right: 0,
    width: '100%',
    height: 40,
    opacity: 0.15,
  },
  mockSparklineLine: {
    position: 'absolute',
    bottom: 20,
    left: '20%',
    width: '60%',
    height: 2,
    backgroundColor: '#10b981',
    transform: [{ rotate: '-15deg' }],
  },
  mockSparklineDot: {
    position: 'absolute',
    bottom: 28,
    right: '25%',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  dataEngineRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 12,
  },
  dataEnginePanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    minHeight: 220,
  },
  dataEnginePanelLeft: {
    flex: Platform.OS === 'web' ? 2 : 1,
  },
  dataEnginePanelRight: {
    flex: Platform.OS === 'web' ? 1 : 1,
  },
  actionCenterRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 12,
  },
  actionCenterPanel: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    minHeight: 250,
  },
  actionCenterPanelLeft: {
    flex: Platform.OS === 'web' ? 7 : 1,
  },
  actionCenterPanelRight: {
    flex: Platform.OS === 'web' ? 5 : 1,
  },
  panelTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
  },
  panelSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 16,
  },
  revenueTrendContainer: {
    minHeight: 126,
    marginBottom: 12,
    justifyContent: 'center',
  },
  revenueBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  revenueBarColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  revenueBarTrack: {
    width: '100%',
    maxWidth: 40,
    height: 100,
    borderRadius: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  revenueBarFill: {
    width: '100%',
    borderRadius: 10,
  },
  revenueBarLabel: {
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
  subscriptionStackWrapper: {
    marginTop: 14,
    gap: 8,
  },
  subscriptionStackBar: {
    height: 18,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  subscriptionStackSegment: {
    height: '100%',
  },
  chartLegendHorizontal: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  chartLegendVertical: {
    marginTop: 16,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  donutChartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.2)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  th: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  urgentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  emptyIncidents: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
