
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { getFriendlyDetailEntries, getFriendlyDetailImage } from './_formatters';

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

type ReportsSection = 'reports_list' | 'booking_incidents';

type ReportStatus = 'pending' | 'resolved' | 'dismissed';

type ReportFilter = 'all' | ReportStatus;

type ReportEscalationStatus = 'none' | 'manual_review';

type ReportEscalationFilter = 'all' | ReportEscalationStatus;

type ReportModerationAction = 'none' | 'warn_reporter' | 'warn_target_owner' | 'warn_both' | 'manual_review';

type ReportTargetAccountAction =
  | 'none'
  | 'mark_unverified'
  | 'ban_1_day'
  | 'ban_7_days'
  | 'ban_30_days'
  | 'ban_permanent'
  | 'lift_ban';

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
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  posts: '/admin/posts',
  products: '/admin/products',
};

const resolveReportsSection = (value?: string | string[]): ReportsSection => {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === 'booking_incidents' ? 'booking_incidents' : 'reports_list';
};

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
  target_account_action: ReportTargetAccountAction;
  target_account_action_expires_at: string | null;
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

interface UserDetailsEntry {
  profile: Record<string, unknown> | null;
}

interface UserDetailsReturnState {
  reportDetails: ReportDetailsEntry;
}

interface UserDetailsRequestTarget {
  id: string;
  full_name?: string | null;
  email?: string | null;
}

const reportStatuses: ReportFilter[] = ['all', 'pending', 'resolved', 'dismissed'];

const reportEscalationFilters: ReportEscalationFilter[] = ['all', 'none', 'manual_review'];

const reportModerationActions: ReportModerationAction[] = ['none', 'warn_reporter', 'warn_target_owner', 'warn_both', 'manual_review'];

const reportTargetAccountActions: ReportTargetAccountAction[] = [
  'none',
  'mark_unverified',
  'ban_1_day',
  'ban_7_days',
  'ban_30_days',
  'ban_permanent',
  'lift_ban',
];

const reportTargetAccountActionLabels: Record<ReportTargetAccountAction, string> = {
  none: 'None',
  mark_unverified: 'Mark Unverified',
  ban_1_day: 'Ban 1 Day',
  ban_7_days: 'Ban 7 Days',
  ban_30_days: 'Ban 30 Days',
  ban_permanent: 'Permanent Ban',
  lift_ban: 'Lift Ban',
};

const incidentStatuses: BookingIncidentFilter[] = [
  'all',
  'open',
  'responded',
  'manual_review',
  'resolved_refund',
  'resolved_no_refund',
  'dismissed',
];

const manageBookingsActionFallbacks: Record<string, string> = {};

const REPORTS_PAGE_SIZE = 50;
const REPORTS_CACHE_TTL_MS = 30_000;
const INCIDENTS_CACHE_TTL_MS = 30_000;

const getDetailsSectionIcon = (title: string) => {
  const normalized = title.toLowerCase();
  if (normalized.includes('account') || normalized.includes('owner') || normalized.includes('reporter')) return 'person-circle-outline';
  if (normalized.includes('report')) return 'flag-outline';
  if (normalized.includes('review')) return 'shield-checkmark-outline';
  if (normalized.includes('content') || normalized.includes('item')) return 'document-text-outline';
  return 'information-circle-outline';
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
    alignItems: 'stretch',
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
    flexBasis: 132,
    flexShrink: 0,
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailsEmptyText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  detailsRows: {
    gap: 8,
  },
  detailsScroll: {
    maxHeight: 520,
  },
  detailsScrollContent: {
    gap: 12,
    paddingBottom: 4,
  },
  detailsSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  detailsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  detailsSectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  detailsSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsSectionImage: {
    width: 112,
    height: 112,
    borderRadius: 18,
    borderWidth: 1,
  },
  detailsSectionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailsSectionMeta: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    marginTop: 1,
  },
  detailHighlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailHighlightCard: {
    flexGrow: 1,
    flexBasis: 190,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  detailHighlightLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailHighlightValue: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Poppins_600SemiBold',
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  desktopContent: {
    flex: 1,
    minWidth: 0,
  },
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
  },
  desktopScrollContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 16,
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
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterRow: {
    gap: 8,
    paddingVertical: 2,
  },
  filterRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  formLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
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
    maxWidth: 860,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  detailsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailsModalIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsModalCopy: {
    flex: 1,
    minWidth: 0,
  },
  modalDescription: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
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
  sectionHeading: {
    marginTop: 6,
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  sidebarCard: {
    width: 248,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  sidebarNavButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sidebarNavButtonMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  sidebarNavButtonText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  sidebarSubmenu: {
    gap: 8,
    paddingLeft: 12,
    paddingTop: 2,
  },
  sidebarSubmenuButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sidebarSubmenuButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
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

const tabItems: { key: Tab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
];

export default function AdminReportsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();

  const [initializingReports, setInitializingReports] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [reportFilter, setReportFilter] = useState<ReportFilter>('all');
  const [reportEscalationFilter, setReportEscalationFilter] = useState<(typeof reportEscalationFilters)[number]>('all');
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidents, setIncidents] = useState<BookingIncidentEntry[]>([]);
  const [incidentFilter, setIncidentFilter] = useState<(typeof incidentStatuses)[number]>('all');
  const [reportViewLoadingId, setReportViewLoadingId] = useState<string | null>(null);
  const [reportActionLoadingId, setReportActionLoadingId] = useState<string | null>(null);
  const [incidentActionLoadingId, setIncidentActionLoadingId] = useState<string | null>(null);
  const [userDetailsLoadingKey, setUserDetailsLoadingKey] = useState<string | null>(null);

  const [userDetailsTarget, setUserDetailsTarget] = useState<UserDetailsEntry | null>(null);
  const [userDetailsReturnState, setUserDetailsReturnState] = useState<UserDetailsReturnState | null>(null);
  const [reportDetailsTarget, setReportDetailsTarget] = useState<ReportDetailsEntry | null>(null);
  const [reportModerationTarget, setReportModerationTarget] = useState<ReportEntry | null>(null);
  const [reportModerationStatus, setReportModerationStatus] = useState<ReportStatus>('resolved');
  const [reportModerationAction, setReportModerationAction] = useState<ReportModerationAction>('none');
  const [reportTargetAccountAction, setReportTargetAccountAction] = useState<ReportTargetAccountAction>('none');
  const [reportModerationNotes, setReportModerationNotes] = useState('');
  const [reportEscalationReason, setReportEscalationReason] = useState('');
  const [reportModerationSubmitting, setReportModerationSubmitting] = useState(false);
  const [incidentResolutionTarget, setIncidentResolutionTarget] = useState<BookingIncidentEntry | null>(null);
  const [incidentResolutionChoice, setIncidentResolutionChoice] = useState<BookingIncidentResolution>('resolved_no_refund');
  const [incidentResolutionNotes, setIncidentResolutionNotes] = useState('');
  const [incidentResolutionSubmitting, setIncidentResolutionSubmitting] = useState(false);

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

  const showSidebarLayout = Platform.OS === 'web' && width >= 768;
  const showInlineTabNav = !showSidebarLayout;
  const activeReportsSection = useMemo(() => resolveReportsSection(section), [section]);
  const hasInitializedRef = useRef(false);

  const showAlert = useCallback((type: AlertType, title: string, message: string) => {
    setAlertState({ visible: true, type, title, message });
  }, []);

  const reportsCacheKey = useMemo(
    () => getAdminPageCacheKey('reports', {
      reportFilter,
      reportEscalationFilter,
    }),
    [reportFilter, reportEscalationFilter],
  );

  const incidentsCacheKey = useMemo(
    () => getAdminPageCacheKey('booking-incidents', { incidentFilter }),
    [incidentFilter],
  );

  const updateReportFilter = useCallback((nextFilter: ReportFilter) => {
    setReportFilter(nextFilter);
  }, []);

  const updateReportEscalationFilter = useCallback((nextFilter: (typeof reportEscalationFilters)[number]) => {
    setReportEscalationFilter(nextFilter);
  }, []);

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'reports') return;
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
    const invokeAction = async (requestPayload: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke<any>('manage-bookings', {
        body: requestPayload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      return data;
    };

    const action = String(payload?.action || '');

    try {
      return await invokeAction(payload);
    } catch (primaryError) {
      const fallbackAction = manageBookingsActionFallbacks[action];
      if (!fallbackAction) {
        throw primaryError;
      }

      const primaryMessage = await getErrorMessage(primaryError, 'Unable to process request.');
      if (!isUnsupportedActionMessage(primaryMessage, action)) {
        throw primaryError;
      }

      return invokeAction({
        ...payload,
        action: fallbackAction,
      });
    }
  }, []);

  const fetchReports = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setReportsLoading(true);
    }

    try {
      const { data, error } = await supabase.functions.invoke<any>('admin-reports-management', {
        body: {
          action: 'fetch_reports',
          statusFilter: reportFilter,
          escalationFilter: reportEscalationFilter,
          limit: REPORTS_PAGE_SIZE,
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
        target_account_action: (String(item?.target_account_action || 'none') as ReportTargetAccountAction),
        target_account_action_expires_at: item?.target_account_action_expires_at
          ? String(item.target_account_action_expires_at)
          : null,
        escalation_status: (String(item?.escalation_status || 'none') as ReportEscalationStatus),
        escalated_at: item?.escalated_at ? String(item.escalated_at) : null,
        escalation_reason: item?.escalation_reason ? String(item.escalation_reason) : null,
      }));

      setReports(normalizedItems);
      writeAdminPageCache(reportsCacheKey, {
        items: normalizedItems,
      });
    } catch (error) {
      if (!options?.silent) {
        const message = await getErrorMessage(error, 'Unable to fetch reports.');
        showAlert('error', 'Failed to load reports', message);
        setReports([]);
      }
    } finally {
      if (!options?.silent) {
        setReportsLoading(false);
      }
    }
  }, [reportFilter, reportEscalationFilter, reportsCacheKey, showAlert]);

  const fetchIncidents = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIncidentsLoading(true);
    }

    try {
      const { data, error } = await supabase.rpc('admin_fetch_booking_incidents', {
        p_status_filter: incidentFilter,
        p_limit: 100,
      });

      if (error) throw error;

      const nextIncidents = Array.isArray(data) ? data : [];
      setIncidents(nextIncidents);
      writeAdminPageCache(incidentsCacheKey, nextIncidents);
    } catch (error) {
      if (!options?.silent) {
        const message = await getErrorMessage(error, 'Unable to fetch incidents.');
        showAlert('error', 'Failed to load incidents', message);
        setIncidents([]);
      }
    } finally {
      if (!options?.silent) {
        setIncidentsLoading(false);
      }
    }
  }, [incidentFilter, incidentsCacheKey, showAlert]);

  const isAccessReady = !loading && roleResolved && !!session && !isGuest && isAdmin;

  useEffect(() => {
    if (!isAccessReady || !hasInitializedRef.current) return;

    const cachedReports = readAdminPageCache<{ items: ReportEntry[] }>(
      reportsCacheKey,
      REPORTS_CACHE_TTL_MS,
    );

    if (cachedReports) {
      setReports(cachedReports.items);
    }

    void fetchReports({ silent: Boolean(cachedReports) });
  }, [isAccessReady, reportsCacheKey, fetchReports]);

  useEffect(() => {
    if (!isAccessReady || !hasInitializedRef.current) return;

    const cachedIncidents = readAdminPageCache<BookingIncidentEntry[]>(
      incidentsCacheKey,
      INCIDENTS_CACHE_TTL_MS,
    );

    if (cachedIncidents) {
      setIncidents(cachedIncidents);
    }

    void fetchIncidents({ silent: Boolean(cachedIncidents) });
  }, [isAccessReady, incidentsCacheKey, fetchIncidents]);

  useEffect(() => {
    if (!isAccessReady) {
      hasInitializedRef.current = false;
      setInitializingReports(false);
      return;
    }

    if (hasInitializedRef.current) {
      return;
    }

    let isMounted = true;
    const cachedReports = readAdminPageCache<{ items: ReportEntry[] }>(
      reportsCacheKey,
      REPORTS_CACHE_TTL_MS,
    );
    const cachedIncidents = readAdminPageCache<BookingIncidentEntry[]>(
      incidentsCacheKey,
      INCIDENTS_CACHE_TTL_MS,
    );

    if (cachedReports) {
      setReports(cachedReports.items);
    }

    if (cachedIncidents) {
      setIncidents(cachedIncidents);
    }

    if (cachedReports || cachedIncidents) {
      setInitializingReports(false);
      hasInitializedRef.current = true;
    } else {
      setInitializingReports(true);
    }

    void (async () => {
      try {
        await Promise.all([
          fetchReports({ silent: Boolean(cachedReports) }),
          fetchIncidents({ silent: Boolean(cachedIncidents) }),
        ]);
      } finally {
        if (isMounted) {
          setInitializingReports(false);
          hasInitializedRef.current = true;
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAccessReady, reportsCacheKey, incidentsCacheKey, fetchReports, fetchIncidents]);

  const moderateReport = useCallback(
    async ({
      reportId,
      nextStatus,
      moderationAction = 'none',
      targetAccountAction = 'none',
      moderationNotes = '',
      escalationReason = '',
    }: {
      reportId: string;
      nextStatus: ReportStatus;
      moderationAction?: ReportModerationAction;
      targetAccountAction?: ReportTargetAccountAction;
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
            targetAccountAction,
            moderationNotes: moderationNotes.trim() || null,
            escalationReason: escalationReason.trim() || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        const moderationLabel = moderationAction.replace(/_/g, ' ');
        const statusLabel = nextStatus.replace(/_/g, ' ');
        const accountActionLabel =
          targetAccountAction === 'none'
            ? ''
            : ` ${reportTargetAccountActionLabels[targetAccountAction]} applied to the reported account.`;
        invalidateAdminPageCache();
        showAlert('success', 'Report updated', `Status set to ${statusLabel}. Action: ${moderationLabel}.${accountActionLabel}`);
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
      setReportTargetAccountAction('none');
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
    setReportTargetAccountAction('none');
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
        targetAccountAction: reportTargetAccountAction,
        moderationNotes: reportModerationNotes,
        escalationReason: reportEscalationReason,
      });

      if (updated) {
        setReportModerationTarget(null);
        setReportModerationStatus('resolved');
        setReportModerationAction('none');
        setReportTargetAccountAction('none');
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
    reportTargetAccountAction,
    reportEscalationReason,
    moderateReport,
    showAlert,
  ]);

  const openReportDetailsModal = useCallback(async (reportId: string) => {
    setReportViewLoadingId(reportId);
    setUserDetailsReturnState(null);
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
    setUserDetailsReturnState(null);
    setReportDetailsTarget(null);
  }, []);

  const resolveIncident = useCallback(
    async (incidentId: string, resolution: BookingIncidentResolution, adminResolutionNotes = '') => {
      setIncidentActionLoadingId(incidentId);
      try {
        const { data, error } = await supabase.functions.invoke<any>('admin-reports-management', {
          body: {
            action: 'admin_resolve_booking_incident',
            incident_id: incidentId,
            resolution,
            admin_notes: adminResolutionNotes.trim() || null,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(String(data.error));

        invalidateAdminPageCache();
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

  const closeUserDetailsModal = useCallback(() => {
    setUserDetailsTarget(null);
    if (userDetailsReturnState?.reportDetails) {
      setReportDetailsTarget(userDetailsReturnState.reportDetails);
    }
    setUserDetailsReturnState(null);
  }, [userDetailsReturnState]);

  const openUserDetailsFromReportDetails = useCallback((targetUser: UserDetailsRequestTarget, loadingKey: string) => {
    if (!reportDetailsTarget) return;

    setUserDetailsReturnState({ reportDetails: reportDetailsTarget });
    setReportDetailsTarget(null);
    void openUserDetailsModal(targetUser, loadingKey);
  }, [openUserDetailsModal, reportDetailsTarget]);

  const reportDetailsTargetType = String(reportDetailsTarget?.target?.type || '').trim().toLowerCase();
  const reportDetailsTargetRecord = reportDetailsTarget?.target?.record || null;
  const reportDetailsTargetName = String(
    reportDetailsTargetRecord?.['title'] ||
    reportDetailsTargetRecord?.['name'] ||
    reportDetailsTargetRecord?.['full_name'] ||
    reportDetailsTargetRecord?.['display_name'] ||
    '',
  ).trim();
  const reportDetailsReporterId = String(
    reportDetailsTarget?.reporter_profile?.id ||
    reportDetailsTarget?.report?.['reporter_id'] ||
    '',
  ).trim();

  const reportDetailsOwnerId = String(
    reportDetailsTarget?.target?.owner_profile?.id ||
    reportDetailsTargetRecord?.['owner_id'] ||
    reportDetailsTargetRecord?.['organizer_id'] ||
    reportDetailsTargetRecord?.['user_id'] ||
    ((reportDetailsTarget?.target?.type === 'profile' || reportDetailsTarget?.target?.type === 'user')
      ? reportDetailsTarget?.target?.id
      : '') ||
    '',
  ).trim();

  const reportDetailsOwnerFullName = String(
    reportDetailsTarget?.target?.owner_profile?.full_name ||
    reportDetailsTargetRecord?.['full_name'] ||
    '',
  ).trim();

  const reportDetailsOwnerEmail = String(
    reportDetailsTarget?.target?.owner_profile?.email ||
    reportDetailsTargetRecord?.['email'] ||
    '',
  ).trim();

  const reportDetailsLinkedAccountTitle =
    reportDetailsTargetType === 'group'
      ? 'Group Owner'
      : reportDetailsTargetType === 'gig'
        ? 'Organizer'
        : reportDetailsTargetType === 'studio' || reportDetailsTargetType === 'venue'
          ? 'Owner'
          : reportDetailsTargetType === 'profile' || reportDetailsTargetType === 'user'
            ? 'Reported Account'
            : 'Linked Account';

  const reportDetailsLinkedAccountButtonLabel =
    reportDetailsTargetType === 'group'
      ? 'View Group Owner'
      : reportDetailsTargetType === 'gig'
        ? 'View Organizer'
        : reportDetailsTargetType === 'studio' || reportDetailsTargetType === 'venue'
          ? 'View Owner'
          : reportDetailsTargetType === 'profile' || reportDetailsTargetType === 'user'
            ? 'View Reported Account'
            : 'View Linked Account';

  const reportDetailsReporterLoadingKey = 'report-details-reporter';
  const reportDetailsOwnerLoadingKey = 'report-details-owner';

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
        String(item.target_account_action || '').toLowerCase().includes(q) ||
        String(item.moderation_notes || '').toLowerCase().includes(q) ||
        String(item.escalation_status || '').toLowerCase().includes(q) ||
        String(item.escalation_reason || '').toLowerCase().includes(q) ||
        String(item.target_type || '').toLowerCase().includes(q) ||
        String(item.target_id || '').toLowerCase().includes(q) ||
        String(item.status || '').toLowerCase().includes(q)
      );
    });
  }, [reports, reportSearch]);

  const incidentActionable = useCallback((status: string) => {
    return ['open', 'responded', 'manual_review'].includes(status);
  }, []);

  const renderDetailsSection = useCallback((title: string, details: Record<string, unknown> | null, emptyText: string) => {
    const entries = getFriendlyDetailEntries(details);
    const imageUrl = getFriendlyDetailImage(details);
    const highlightEntries = entries.slice(0, 2);
    const supportingEntries = entries.slice(2);
    const sectionIcon = getDetailsSectionIcon(title);

    return (
      <View
        style={[
          styles.detailsSection,
          {
            backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.detailsSectionHeader}>
          <View style={[styles.detailsSectionIcon, { backgroundColor: `${colors.primary}18` }]}>
            <Ionicons name={sectionIcon as any} size={18} color={colors.primary} />
          </View>
          <View style={styles.detailsSectionHeaderCopy}>
            <Text style={[styles.detailsSectionTitle, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.detailsSectionMeta, { color: colors.textSecondary }]}>
              {entries.length > 0 ? `${entries.length} visible details` : 'Nothing to review yet'}
            </Text>
          </View>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              resizeMode="cover"
              style={[styles.detailsSectionImage, { borderColor: colors.border }]}
            />
          ) : null}
        </View>
        {entries.length === 0 ? (
          <Text style={[styles.detailsEmptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
        ) : (
          <>
            <View style={styles.detailHighlightGrid}>
              {highlightEntries.map((entry) => (
                <View
                  key={`${title}-${entry.key}-highlight`}
                  style={[
                    styles.detailHighlightCard,
                    {
                      backgroundColor: isDark ? '#111827' : '#F8FAFC',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.detailHighlightLabel, { color: colors.textSecondary }]}>{entry.label}</Text>
                  <Text selectable style={[styles.detailHighlightValue, { color: colors.text }]}>
                    {entry.value}
                  </Text>
                </View>
              ))}
            </View>

            {supportingEntries.length > 0 && (
              <View style={styles.detailsRows}>
                {supportingEntries.map((entry) => (
                  <View
                    key={`${title}-${entry.key}`}
                    style={[
                      styles.detailRow,
                      {
                        backgroundColor: isDark ? '#111827' : '#F8FAFC',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{entry.label}</Text>
                    <Text selectable style={[styles.detailValue, { color: colors.text }]}>
                      {entry.value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    );
  }, [colors.border, colors.primary, colors.text, colors.textSecondary, isDark]);

  const renderReportsManagementSection = () => (
    <View style={styles.sectionGap}>
      <TextInput
        testID="admin-reports-search-input"
        accessibilityLabel="admin-reports-search-input"
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

      <View style={styles.filterGroup}>
        <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Report Status</Text>
        <View style={[styles.filterRow, styles.filterRowWrap]}>
          {reportStatuses.map((status) => {
            const active = reportFilter === status;
            return (
              <TouchableOpacity
                key={status}
                activeOpacity={1}
                onPress={() => updateReportFilter(status)}
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
        </View>
      </View>

      <View style={styles.filterGroup}>
        <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Escalation</Text>
        <View style={[styles.filterRow, styles.filterRowWrap]}>
          {reportEscalationFilters.map((escalation) => {
            const active = reportEscalationFilter === escalation;
            return (
              <TouchableOpacity
                key={escalation}
                activeOpacity={1}
                onPress={() => updateReportEscalationFilter(escalation)}
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
        </View>
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
            return (
              <View
                key={report.id}
                testID={`admin-report-card-${report.id}`}
                accessibilityLabel={`admin-report-card-${report.id}`}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
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
                {report.target_account_action && report.target_account_action !== 'none' ? (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    Account action: {reportTargetAccountActionLabels[report.target_account_action]}
                    {report.target_account_action_expires_at ? ` until ${formatDateTime(report.target_account_action_expires_at)}` : ''}
                  </Text>
                ) : null}
                {report.moderation_notes ? (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Notes: {report.moderation_notes}</Text>
                ) : null}
                {report.escalation_reason ? (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>Escalation reason: {report.escalation_reason}</Text>
                ) : null}

                <View style={styles.cardActionsRow}>
                  <TouchableOpacity
                    testID={`admin-report-view-${report.id}`}
                    accessibilityLabel={`admin-report-view-${report.id}`}
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
                </View>

                <View style={styles.cardActionsRow}>
                  {report.status === 'pending' ? (
                    <>
                      <TouchableOpacity
                        testID={`admin-report-resolve-${report.id}`}
                        accessibilityLabel={`admin-report-resolve-${report.id}`}
                        activeOpacity={1}
                        disabled={reportActionLoadingId === report.id}
                        onPress={() => openReportModerationModal(report, 'resolved')}
                        style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                      >
                        <Text style={styles.smallActionTextFilled}>Resolve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`admin-report-dismiss-${report.id}`}
                        accessibilityLabel={`admin-report-dismiss-${report.id}`}
                        activeOpacity={1}
                        disabled={reportActionLoadingId === report.id}
                        onPress={() => void moderateReport({ reportId: report.id, nextStatus: 'dismissed' })}
                        style={[styles.smallActionButtonFilled, { backgroundColor: '#64748B', opacity: reportActionLoadingId === report.id ? 0.6 : 1 }]}
                      >
                        <Text style={styles.smallActionTextFilled}>Dismiss</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        testID={`admin-report-escalate-${report.id}`}
                        accessibilityLabel={`admin-report-escalate-${report.id}`}
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
                      testID={`admin-report-reopen-${report.id}`}
                      accessibilityLabel={`admin-report-reopen-${report.id}`}
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
            );
          })}
        </View>
      )}
    </View>
  );

  const renderIncidentQueueSection = () => (
    <View
      testID="admin-incidents-section"
      accessibilityLabel="admin-incidents-section"
      style={styles.sectionGap}
    >
      <View style={styles.filterGroup}>
        <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Incident Status</Text>
        <View style={[styles.filterRow, styles.filterRowWrap]}>
          {incidentStatuses.map((status) => {
            const active = incidentFilter === status;
            return (
              <TouchableOpacity
                testID={`admin-incidents-filter-${status}`}
                accessibilityLabel={`admin-incidents-filter-${status}`}
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
        </View>
      </View>

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
              <View
                key={incident.id}
                testID={`admin-incident-card-${incident.id}`}
                accessibilityLabel={`admin-incident-card-${incident.id}`}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
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
                    testID={`admin-incident-reporter-${incident.id}`}
                    accessibilityLabel={`admin-incident-reporter-${incident.id}`}
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
                    testID={`admin-incident-counterparty-${incident.id}`}
                    accessibilityLabel={`admin-incident-counterparty-${incident.id}`}
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
                      testID={`admin-incident-resolve-no-refund-${incident.id}`}
                      accessibilityLabel={`admin-incident-resolve-no-refund-${incident.id}`}
                      activeOpacity={1}
                      disabled={incidentActionLoadingId === incident.id}
                      onPress={() => openIncidentResolutionModal(incident, 'resolved_no_refund')}
                      style={[styles.smallActionButtonFilled, { backgroundColor: '#16A34A', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                    >
                      <Text style={styles.smallActionTextFilled}>Resolve No Refund</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`admin-incident-resolve-refund-${incident.id}`}
                      accessibilityLabel={`admin-incident-resolve-refund-${incident.id}`}
                      activeOpacity={1}
                      disabled={incidentActionLoadingId === incident.id}
                      onPress={() => openIncidentResolutionModal(incident, 'resolved_refund')}
                      style={[styles.smallActionButtonFilled, { backgroundColor: '#D97706', opacity: incidentActionLoadingId === incident.id ? 0.6 : 1 }]}
                    >
                      <Text style={styles.smallActionTextFilled}>Resolve Refund</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID={`admin-incident-dismiss-${incident.id}`}
                      accessibilityLabel={`admin-incident-dismiss-${incident.id}`}
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
            );
          })}
        </View>
      )}
    </View>
  );

  if (loading || !roleResolved || initializingReports) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading reports...</Text>
      </View>
    );
  }

  if (!session || isGuest || !isAdmin) {
    return null;
  }

  return (
    <View
      testID="admin-reports-page"
      accessibilityLabel="admin-reports-page"
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
              const active = item.key === 'reports';
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

        {showSidebarLayout ? (
          activeReportsSection === 'booking_incidents'
            ? renderIncidentQueueSection()
            : renderReportsManagementSection()
        ) : (
          <View style={styles.sectionGap}>
            {renderReportsManagementSection()}
            {renderIncidentQueueSection()}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!userDetailsTarget} transparent animationType="fade" onRequestClose={closeUserDetailsModal}>
        <View style={styles.modalBackdrop}>
          <View
            testID="admin-user-details-modal"
            accessibilityLabel="admin-user-details-modal"
            style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.detailsModalHeader}>
              <View style={[styles.detailsModalIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.detailsModalCopy}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>User Summary</Text>
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  A clean account overview for admin review.
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailsSection('Account', userDetailsTarget?.profile || null, 'Account details are unavailable.')}
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
          <View
            testID="admin-report-details-modal"
            accessibilityLabel="admin-report-details-modal"
            style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.detailsModalHeader}>
              <View style={[styles.detailsModalIcon, { backgroundColor: `${colors.primary}18` }]}>
                <Ionicons name="flag-outline" size={23} color={colors.primary} />
              </View>
              <View style={styles.detailsModalCopy}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Report Summary</Text>
                <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
                  Reporter, reported content, and linked account in one readable view.
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {renderDetailsSection('Report Overview', reportDetailsTarget?.report || null, 'Report details are unavailable.')}

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
                'Reported Item',
                reportDetailsTarget?.target
                  ? {
                    target_type: reportDetailsTarget.target.type,
                    target_name: reportDetailsTargetName,
                    target_id: reportDetailsTarget.target.id,
                    source_table: reportDetailsTarget.target.table,
                  }
                  : null,
                'Reported item details are unavailable.',
              )}

              {renderDetailsSection(
                'Reported Content',
                reportDetailsTarget?.target?.record || null,
                'Reported content details are unavailable.',
              )}

              {renderDetailsSection(
                reportDetailsLinkedAccountTitle,
                reportDetailsTarget?.target?.owner_profile || null,
                `${reportDetailsLinkedAccountTitle} details are unavailable.`,
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                testID="admin-report-details-reporter-button"
                accessibilityLabel="admin-report-details-reporter-button"
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

                  openUserDetailsFromReportDetails({
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
                testID="admin-report-details-owner-button"
                accessibilityLabel="admin-report-details-owner-button"
                activeOpacity={1}
                disabled={userDetailsLoadingKey === reportDetailsOwnerLoadingKey}
                onPress={() => {
                  if (!reportDetailsOwnerId) {
                    showAlert(
                      'warning',
                      'Linked account unavailable',
                      `This report does not have a linked ${reportDetailsLinkedAccountTitle.toLowerCase()} record to open.`,
                    );
                    return;
                  }

                  openUserDetailsFromReportDetails({
                    id: reportDetailsOwnerId,
                    full_name: reportDetailsOwnerFullName,
                    email: reportDetailsOwnerEmail,
                  }, reportDetailsOwnerLoadingKey);
                }}
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: isDark ? '#065F46' : '#D1FAE5',
                    opacity: userDetailsLoadingKey === reportDetailsOwnerLoadingKey ? 0.7 : 1,
                  },
                ]}
              >
                {userDetailsLoadingKey === reportDetailsOwnerLoadingKey ? (
                  <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#065F46'} />
                ) : (
                  <Text style={[styles.modalButtonText, { color: isDark ? '#FFFFFF' : '#065F46' }]}>{reportDetailsLinkedAccountButtonLabel}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                testID="admin-report-details-close-button"
                accessibilityLabel="admin-report-details-close-button"
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
          <View
            testID="admin-report-moderation-modal"
            accessibilityLabel="admin-report-moderation-modal"
            style={[styles.modalCardLarge, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
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
                    testID={`admin-report-moderation-status-${status}`}
                    accessibilityLabel={`admin-report-moderation-status-${status}`}
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
                    testID={`admin-report-moderation-action-${action}`}
                    accessibilityLabel={`admin-report-moderation-action-${action}`}
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

            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Reported Account Action</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {reportTargetAccountActions.map((accountAction) => {
                const active = reportTargetAccountAction === accountAction;
                return (
                  <TouchableOpacity
                    testID={`admin-report-account-action-${accountAction}`}
                    accessibilityLabel={`admin-report-account-action-${accountAction}`}
                    key={accountAction}
                    activeOpacity={1}
                    onPress={() => setReportTargetAccountAction(accountAction)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                      {reportTargetAccountActionLabels[accountAction]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TextInput
              testID="admin-report-moderation-notes-input"
              accessibilityLabel="admin-report-moderation-notes-input"
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
                testID="admin-report-escalation-reason-input"
                accessibilityLabel="admin-report-escalation-reason-input"
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
                testID="admin-report-moderation-cancel-button"
                accessibilityLabel="admin-report-moderation-cancel-button"
                activeOpacity={1}
                onPress={closeReportModerationModal}
                disabled={reportModerationSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="admin-report-moderation-apply-button"
                accessibilityLabel="admin-report-moderation-apply-button"
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
          <View
            testID="admin-incident-resolution-modal"
            accessibilityLabel="admin-incident-resolution-modal"
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>Resolve Incident</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>
              {incidentResolutionTarget
                ? `${String(incidentResolutionTarget.issue_type || 'issue').replace(/_/g, ' ')} - ${incidentResolutionChoice.replace(/_/g, ' ')}`
                : 'Choose resolution notes.'}
            </Text>

            <TextInput
              testID="admin-incident-resolution-notes-input"
              accessibilityLabel="admin-incident-resolution-notes-input"
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
                testID="admin-incident-resolution-cancel-button"
                accessibilityLabel="admin-incident-resolution-cancel-button"
                activeOpacity={1}
                onPress={closeIncidentResolutionModal}
                disabled={incidentResolutionSubmitting}
                style={[styles.modalButton, { backgroundColor: isDark ? '#334155' : '#E5E7EB' }]}
              >
                <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                testID="admin-incident-resolution-confirm-button"
                accessibilityLabel="admin-incident-resolution-confirm-button"
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

