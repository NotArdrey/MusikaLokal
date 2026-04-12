
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

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  permits: '/admin/permits',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
};

const DASHBOARD_CACHE_TTL_MS = 30_000;

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

const formatCurrency = (value?: number | null) => {
  const safeValue = Number(value || 0);
  return `₱${safeValue.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatHours = (value?: number | null) => {
  const safeValue = Number(value || 0);
  if (!safeValue) return 'n/a';
  return `${safeValue.toFixed(1)}h`;
};

const formatPercent = (value?: number | null) => {
  const safeValue = Number(value || 0);
  return `${safeValue.toFixed(1)}%`;
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
  actionCenterRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 12,
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
  badgeGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeRed: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
  },
  badgeTextGreen: {
    color: '#10b981',
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  badgeTextRed: {
    color: '#ef4444',
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
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
  chartLegendHorizontal: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  chartLegendVertical: {
    marginTop: 16,
    gap: 8,
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
  dataEngineRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 12,
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
  flex1: {
    flex: 1,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendText: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  panelSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 16,
  },
  panelTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 4,
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
  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pulseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  pulseSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 4,
  },
  pulseTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  pulseValueMain: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
  },
  revenueBarColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  revenueBarFill: {
    width: '100%',
    borderRadius: 10,
  },
  revenueBarLabel: {
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
  },
  revenueBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  revenueBarTrack: {
    width: '100%',
    maxWidth: 40,
    height: 100,
    borderRadius: 10,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  revenueTrendContainer: {
    minHeight: 126,
    marginBottom: 12,
    justifyContent: 'center',
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
  subscriptionStackBar: {
    height: 18,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  subscriptionStackSegment: {
    height: '100%',
  },
  subscriptionStackWrapper: {
    marginTop: 14,
    gap: 8,
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
  tableCell: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
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
  tabsRow: {
    gap: 8,
    paddingBottom: 4,
  },
  tabText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    textTransform: 'capitalize',
  },
  th: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
  },
});

const tabItems: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'permits', label: 'Permits', icon: 'document-text-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
];

export default function AdminDashboardPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
  const hasHydratedDashboardRef = useRef(false);

  const [initializingDashboard, setInitializingDashboard] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>(defaultMetrics);
  const [dashboardDateRange, setDashboardDateRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [globalSearch, setGlobalSearch] = useState('');
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');
  const [revenueFilter, setRevenueFilter] = useState<'gross' | 'net'>('net');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<'all' | 'booking' | 'profile'>('all');
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

  const dashboardCacheKey = useMemo(
    () => getAdminPageCacheKey('dashboard', {
      dateRange: dashboardDateRange,
      searchQuery: dashboardSearchQuery,
    }),
    [dashboardDateRange, dashboardSearchQuery],
  );

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'dashboard') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

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

    const nextMetrics: DashboardMetrics = {
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
    };

    setMetrics(nextMetrics);
    writeAdminPageCache(dashboardCacheKey, nextMetrics);
  }, [dashboardCacheKey]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializingDashboard(false);
      hasHydratedDashboardRef.current = false;
      return;
    }

    let isMounted = true;
    const cachedMetrics = readAdminPageCache<DashboardMetrics>(
      dashboardCacheKey,
      DASHBOARD_CACHE_TTL_MS,
    );

    if (cachedMetrics) {
      setMetrics(cachedMetrics);
      setInitializingDashboard(false);
      hasHydratedDashboardRef.current = true;
    } else if (!hasHydratedDashboardRef.current) {
      setInitializingDashboard(true);
    } else {
      setInitializingDashboard(false);
    }

    void (async () => {
      try {
        await fetchMetrics({
          dateRange: dashboardDateRange,
          searchQuery: dashboardSearchQuery,
        });
      } catch (error) {
        if (!cachedMetrics) {
          const message = await getErrorMessage(error, 'Unable to load admin metrics.');
          showAlert('error', 'Admin dashboard unavailable', message);
        }
      } finally {
        if (isMounted) {
          setInitializingDashboard(false);
          hasHydratedDashboardRef.current = true;
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [
    loading,
    roleResolved,
    session,
    isGuest,
    isAdmin,
    dashboardCacheKey,
    fetchMetrics,
    showAlert,
    dashboardDateRange,
    dashboardSearchQuery,
  ]);

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
            {tabItems.map((item) => {
              const active = item.key === 'dashboard';
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
              <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 8 }]}>Tier base tracked from live subscription records</Text>
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
                    {revenueTrendRows.map((point: any, index: number) => {
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
                dashboardIncidentRows.map((row: any) => (
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
                  metrics.peakActivitySlots.map((slot: any, index: number) => {
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
