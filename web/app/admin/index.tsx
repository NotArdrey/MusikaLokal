import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetTimingConfigs,
} from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import type {
  AdminPaymentStatusFilter,
  AdminPaymentTransaction,
  AdminPaymentTotals,
} from './_payments';
import {
  downloadPaymentTransactionsExcel,
  downloadPaymentTransactionsPdf,
  fetchAdminPaymentTransactions,
  getPaymentStatusColor,
  normalizePaymentActionLabel,
  PAYMENT_STATUS_FILTERS,
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

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  posts: '/admin/posts',
  products: '/admin/products',
};

const DASHBOARD_CACHE_TTL_MS = 30_000;

type DashboardDateRange = '7d' | '30d' | 'all';
type RevenueFilter = 'gross' | 'net';
type IncidentTypeFilter = 'all' | 'booking' | 'profile';
type WithdrawalStatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

const DASHBOARD_DATE_RANGE_LABELS: Record<DashboardDateRange, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  all: 'All Time',
};

const WITHDRAWAL_STATUS_FILTERS: { key: WithdrawalStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

interface DashboardMetrics {
  generatedAt: string | null;
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
  dau: number;
  mau: number;
  newSignups24h: number;
  grossRevenue: number;
  netRevenue: number;
  allTimePlatformNet: number;
  platformWithdrawn: number;
  platformAvailable: number;
  providerEarnings: number;
  pendingPayouts: number;
  avgReportResolutionHours: number;
  avgIncidentResolutionHours: number;
  paymongoSuccessRate: number;
  paymentMetricsAvailable: boolean;
  paymentAttempts: number;
  paidPaymentEvents: number;
  failedPaymentEvents: number;
  paymongoLinkedPaymentEvents: number;
  paymongoLinkedPaymentRate: number;
  dbHealthy: boolean;
  apiHealthy: boolean;
  paymongoHealthy: boolean;
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

interface AdminWithdrawalEntry {
  id: string;
  amount: number;
  net_amount: number;
  status: WithdrawalStatusFilter;
  payout_type: string;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_bank_name: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string | null;
  processed_at: string | null;
  source_type?: 'provider' | 'platform';
  user?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
}

interface WithdrawalTotals {
  count: number;
  totalAmount: number;
  totalNetAmount: number;
  completedAmount: number;
  pendingAmount: number;
  mockCount: number;
  platformCount: number;
}

const defaultMetrics: DashboardMetrics = {
  generatedAt: null,
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
  dau: 0,
  mau: 0,
  newSignups24h: 0,
  grossRevenue: 0,
  netRevenue: 0,
  allTimePlatformNet: 0,
  platformWithdrawn: 0,
  platformAvailable: 0,
  providerEarnings: 0,
  pendingPayouts: 0,
  avgReportResolutionHours: 0,
  avgIncidentResolutionHours: 0,
  paymongoSuccessRate: 0,
  paymentMetricsAvailable: false,
  paymentAttempts: 0,
  paidPaymentEvents: 0,
  failedPaymentEvents: 0,
  paymongoLinkedPaymentEvents: 0,
  paymongoLinkedPaymentRate: 0,
  dbHealthy: false,
  apiHealthy: false,
  paymongoHealthy: false,
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

const defaultWithdrawalTotals: WithdrawalTotals = {
  count: 0,
  totalAmount: 0,
  totalNetAmount: 0,
  completedAmount: 0,
  pendingAmount: 0,
  mockCount: 0,
  platformCount: 0,
};

const defaultPaymentTotals: AdminPaymentTotals = {
  count: 0,
  grossAmount: 0,
  refundedAmount: 0,
  netAmount: 0,
  paidCount: 0,
  partialCount: 0,
  pendingCount: 0,
  failedCount: 0,
  cancelledCount: 0,
  refundedCount: 0,
};

const ADMIN_WITHDRAW_QUICK_AMOUNTS = [100, 500, 1000];

const sanitizeCurrencyInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  const [wholePart, ...decimalParts] = cleaned.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '');

  if (decimalParts.length === 0) {
    return whole;
  }

  const decimal = decimalParts.join('').slice(0, 2);
  return `${whole || '0'}.${decimal}`;
};

const parseCurrencyInputAmount = (value: string) => {
  const normalized = sanitizeCurrencyInput(value);
  if (!normalized) return Number.NaN;

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const formatCurrencyInputAmount = (value?: number | null) => {
  const amount = Math.max(Number(value || 0), 0);
  if (!Number.isFinite(amount)) return '';

  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
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

const formatMetricCount = (value?: number | null) => {
  const safeValue = Math.max(0, Math.round(Number(value || 0)));
  return safeValue.toLocaleString('en-PH');
};

const formatMetricTimestamp = (value?: string | null) => {
  if (!value) return null;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return null;

  return timestamp.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'n/a';

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return 'n/a';

  return timestamp.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatWithdrawalStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const maskAccountNumber = (value?: string | null) => {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (!normalized) return 'No account';
  return `****${normalized.slice(-4)}`;
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

const useToggleProgress = (isActive: boolean, duration = 220) => {
  const progress = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: isActive ? 1 : 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [duration, isActive, progress]);

  return progress;
};

function SmoothFilterChip({
  isActive,
  label,
  onPress,
  activeColor,
  inactiveBackground,
  inactiveBorder,
  inactiveText,
}: {
  isActive: boolean;
  label: string;
  onPress: () => void;
  activeColor: string;
  inactiveBackground: string;
  inactiveBorder: string;
  inactiveText: string;
}) {
  const progress = useToggleProgress(isActive);
  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveBackground, activeColor],
  });
  const borderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveBorder, activeColor],
  });
  const color = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveText, '#FFFFFF'],
  });

  return (
    <TouchableOpacity activeOpacity={0.88} disabled={isActive} onPress={onPress} style={styles.filterTouchable}>
      <Animated.View style={[styles.filterChip, { backgroundColor, borderColor }]}>
        <Animated.Text style={[styles.filterChipText, { color }]}>{label}</Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function SmoothSegmentButton({
  isActive,
  label,
  onPress,
  activeColor,
  inactiveText,
  textTransform,
}: {
  isActive: boolean;
  label: string;
  onPress: () => void;
  activeColor: string;
  inactiveText: string;
  textTransform?: 'capitalize' | 'none';
}) {
  const progress = useToggleProgress(isActive, 200);
  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 0, 0, 0)', activeColor],
  });
  const color = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveText, '#FFFFFF'],
  });

  return (
    <TouchableOpacity activeOpacity={0.88} disabled={isActive} onPress={onPress}>
      <Animated.View style={[styles.segmentButton, { backgroundColor }]}>
        <Animated.Text style={[styles.segmentButtonText, { color, textTransform: textTransform || 'none' }]}>
          {label}
        </Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function AnimatedRevenueBar({
  height,
  revenueFilter,
  grossColor,
  netColor,
}: {
  height: number;
  revenueFilter: RevenueFilter;
  grossColor: string;
  netColor: string;
}) {
  const heightAnim = useRef(new Animated.Value(height)).current;
  const colorAnim = useRef(new Animated.Value(revenueFilter === 'gross' ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: height,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [height, heightAnim]);

  useEffect(() => {
    Animated.timing(colorAnim, {
      toValue: revenueFilter === 'gross' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [colorAnim, revenueFilter]);

  const backgroundColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [grossColor, netColor],
  });

  return <Animated.View style={[styles.revenueBarFill, { height: heightAnim, backgroundColor }]} />;
}

function AnimatedProgressFill({ percent, color }: { percent: number; color: string }) {
  const widthAnim = useRef(new Animated.Value(percent)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: percent,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [percent, widthAnim]);

  const width = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return <Animated.View style={{ width, height: '100%', backgroundColor: color }} />;
}

function AnimatedMetricText({
  value,
  formatter,
  style,
}: {
  value: number;
  formatter: (value: number) => string;
  style: any;
}) {
  const valueAnim = useRef(new Animated.Value(value)).current;
  const formatterRef = useRef(formatter);
  const [displayValue, setDisplayValue] = useState(formatter(value));

  useEffect(() => {
    formatterRef.current = formatter;
  }, [formatter]);

  useEffect(() => {
    const listenerId = valueAnim.addListener(({ value: nextValue }) => {
      setDisplayValue(formatterRef.current(nextValue));
    });

    return () => valueAnim.removeListener(listenerId);
  }, [valueAnim]);

  useEffect(() => {
    Animated.timing(valueAnim, {
      toValue: value,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, valueAnim]);

  return <Text style={style}>{displayValue}</Text>;
}

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
  badgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
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
  dashboardActionButton: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dashboardActionText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  adminWithdrawSheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    paddingTop: 4,
  },
  adminWithdrawHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 22,
  },
  adminWithdrawTitle: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
  },
  adminWithdrawSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  adminWithdrawCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminWithdrawSection: {
    gap: 8,
    marginBottom: 18,
  },
  adminWithdrawLabel: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
  },
  adminWithdrawInputWrap: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  adminWithdrawCurrency: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    marginRight: 8,
  },
  adminWithdrawInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    outlineStyle: 'none' as any,
  },
  adminWithdrawHint: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
  },
  adminWithdrawQuickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  adminWithdrawQuickButton: {
    flexGrow: 1,
    minWidth: 150,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  adminWithdrawQuickText: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
  },
  adminWithdrawNote: {
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    marginBottom: 40,
  },
  adminWithdrawNoteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  adminWithdrawSubmitButton: {
    minHeight: 50,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  adminWithdrawSubmitText: {
    fontSize: 14,
    fontFamily: 'Poppins_700Bold',
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
  dashboardMetricsStack: {
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
  filterTouchable: {
    borderRadius: 999,
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
  liveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveStatusPill: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveStatusText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  miniActionButton: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  miniActionText: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
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
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  segmentButtonText: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
  },
  segmentControl: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
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
  withdrawalActionsCell: {
    flex: 1.15,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  withdrawalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  withdrawalContextText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 12,
  },
  withdrawalExplainer: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  withdrawalExplainerText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  withdrawalExplainerTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 2,
  },
  withdrawalSignalCard: {
    flex: 1,
    minWidth: 150,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  withdrawalSignalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  withdrawalSignalLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    marginBottom: 3,
  },
  withdrawalSignalValue: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
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

export default function AdminDashboardPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
  const hasHydratedDashboardRef = useRef(false);
  const latestMetricsRequestRef = useRef(0);
  const adminWithdrawSheetRef = useRef<BottomSheetModal>(null);
  const dashboardContentOpacity = useRef(new Animated.Value(1)).current;

  const [initializingDashboard, setInitializingDashboard] = useState(false);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [metrics, setMetrics] = useState<DashboardMetrics>(defaultMetrics);
  const [dashboardDateRange, setDashboardDateRange] = useState<DashboardDateRange>('30d');
  const [globalSearch, setGlobalSearch] = useState('');
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');
  const [revenueFilter, setRevenueFilter] = useState<RevenueFilter>('net');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<IncidentTypeFilter>('all');
  const [paymentTransactions, setPaymentTransactions] = useState<AdminPaymentTransaction[]>([]);
  const [paymentTotals, setPaymentTotals] = useState<AdminPaymentTotals>(defaultPaymentTotals);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<AdminPaymentStatusFilter>('all');
  const [paymentTransactionsLoading, setPaymentTransactionsLoading] = useState(false);
  const [paymentExporting, setPaymentExporting] = useState(false);
  const [paymentPdfExporting, setPaymentPdfExporting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalEntry[]>([]);
  const [withdrawalTotals, setWithdrawalTotals] = useState<WithdrawalTotals>(defaultWithdrawalTotals);
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<WithdrawalStatusFilter>('all');
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [adminWithdrawAmount, setAdminWithdrawAmount] = useState('');
  const [adminWithdrawSubmitting, setAdminWithdrawSubmitting] = useState(false);
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

  const adminWithdrawAnimationConfigs = useBottomSheetTimingConfigs({
    duration: 240,
    easing: Easing.out(Easing.cubic),
  });

  const adminWithdrawSnapPoints = useMemo(() => ['72%'], []);

  const renderAdminWithdrawBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

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

  useEffect(() => {
    Animated.timing(dashboardContentOpacity, {
      toValue: dashboardRefreshing ? 0.72 : 1,
      duration: dashboardRefreshing ? 120 : 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [dashboardContentOpacity, dashboardRefreshing]);

  const fetchMetrics = useCallback(async (filters?: {
    dateRange?: DashboardDateRange;
    searchQuery?: string;
  }) => {
    const dateRange: DashboardDateRange = filters?.dateRange || '30d';
    const searchQuery = String(filters?.searchQuery || '').trim();
    const cacheKey = getAdminPageCacheKey('dashboard', {
      dateRange,
      searchQuery,
    });

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
      generatedAt: typeof data?.generatedAt === 'string' ? data.generatedAt : new Date().toISOString(),
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
      dau: Number(data?.dau || 0),
      mau: Number(data?.mau || 0),
      newSignups24h: Number(data?.newSignups24h || 0),
      grossRevenue: Number(data?.grossRevenue || 0),
      netRevenue: Number(data?.netRevenue || 0),
      allTimePlatformNet: Number(data?.allTimePlatformNet || data?.netRevenue || 0),
      platformWithdrawn: Number(data?.platformWithdrawn || 0),
      platformAvailable: Number(data?.platformAvailable ?? data?.netRevenue ?? 0),
      providerEarnings: Number(data?.providerEarnings || 0),
      pendingPayouts: Number(data?.pendingPayouts || 0),
      avgReportResolutionHours: Number(data?.avgReportResolutionHours || 0),
      avgIncidentResolutionHours: Number(data?.avgIncidentResolutionHours || 0),
      paymongoSuccessRate: Number(data?.paymongoSuccessRate || 0),
      paymentMetricsAvailable: Object.prototype.hasOwnProperty.call(data || {}, 'paymentAttempts'),
      paymentAttempts: Number(data?.paymentAttempts || 0),
      paidPaymentEvents: Number(data?.paidPaymentEvents || 0),
      failedPaymentEvents: Number(data?.failedPaymentEvents || 0),
      paymongoLinkedPaymentEvents: Number(data?.paymongoLinkedPaymentEvents || 0),
      paymongoLinkedPaymentRate: Number(data?.paymongoLinkedPaymentRate ?? 100),
      dbHealthy: Boolean(data?.dbHealthy),
      apiHealthy: Boolean(data?.apiHealthy),
      paymongoHealthy: Boolean(data?.paymongoHealthy),
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

    writeAdminPageCache(cacheKey, nextMetrics);
    return nextMetrics;
  }, []);

  const fetchAdminWithdrawals = useCallback(async (filters?: {
    status?: WithdrawalStatusFilter;
    searchQuery?: string;
  }) => {
    const status = filters?.status || 'all';
    const searchQuery = String(filters?.searchQuery || '').trim();

    const { data, error } = await supabase.functions.invoke<any>('permit-management', {
      body: {
        action: 'admin_fetch_withdrawals',
        status,
        searchQuery: searchQuery || null,
        limit: 8,
      },
    });

    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));

    const nextWithdrawals = Array.isArray(data?.withdrawals)
      ? data.withdrawals.map((item: any) => {
        const owner = Array.isArray(item?.user) ? item.user[0] : item?.user;
        const normalizedStatus = String(item?.status || 'pending').trim().toLowerCase();

        return {
          id: String(item?.id || ''),
          amount: Number(item?.amount || 0),
          net_amount: Number(item?.net_amount || item?.amount || 0),
          status: (WITHDRAWAL_STATUS_FILTERS.some((filter) => filter.key === normalizedStatus)
            ? normalizedStatus
            : 'pending') as WithdrawalStatusFilter,
          payout_type: String(item?.payout_type || 'bank'),
          payout_account_name: item?.payout_account_name || null,
          payout_account_number: item?.payout_account_number || null,
          payout_bank_name: item?.payout_bank_name || null,
          reference_number: item?.reference_number || null,
          notes: item?.notes || null,
          created_at: item?.created_at || null,
          processed_at: item?.processed_at || null,
          source_type: item?.source_type === 'platform' ? 'platform' : 'provider',
          user: owner ? {
            id: owner.id,
            full_name: owner.full_name || null,
            email: owner.email || null,
            role: owner.role || null,
          } : null,
        } satisfies AdminWithdrawalEntry;
      })
      : [];

    const totalsPayload = data?.totals || {};
    const nextTotals: WithdrawalTotals = {
      count: Number(totalsPayload?.count || 0),
      totalAmount: Number(totalsPayload?.totalAmount || 0),
      totalNetAmount: Number(totalsPayload?.totalNetAmount || 0),
      completedAmount: Number(totalsPayload?.completedAmount || 0),
      pendingAmount: Number(totalsPayload?.pendingAmount || 0),
      mockCount: Number(totalsPayload?.mockCount || 0),
      platformCount: Number(totalsPayload?.platformCount || 0),
    };

    return { withdrawals: nextWithdrawals, totals: nextTotals };
  }, []);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      latestMetricsRequestRef.current += 1;
      setInitializingDashboard(false);
      setDashboardRefreshing(false);
      hasHydratedDashboardRef.current = false;
      return;
    }

    let isMounted = true;
    const requestId = latestMetricsRequestRef.current + 1;
    latestMetricsRequestRef.current = requestId;
    const cachedMetrics = readAdminPageCache<DashboardMetrics>(
      dashboardCacheKey,
      DASHBOARD_CACHE_TTL_MS,
    );

    if (cachedMetrics) {
      setMetrics(cachedMetrics);
      setInitializingDashboard(false);
      hasHydratedDashboardRef.current = true;
      setDashboardRefreshing(true);
    } else if (!hasHydratedDashboardRef.current) {
      setInitializingDashboard(true);
      setDashboardRefreshing(false);
    } else {
      setInitializingDashboard(false);
      setDashboardRefreshing(true);
    }

    void (async () => {
      try {
        const nextMetrics = await fetchMetrics({
          dateRange: dashboardDateRange,
          searchQuery: dashboardSearchQuery,
        });
        if (isMounted && latestMetricsRequestRef.current === requestId) {
          setMetrics(nextMetrics);
        }
      } catch (error) {
        if (isMounted && latestMetricsRequestRef.current === requestId && !cachedMetrics) {
          const message = await getErrorMessage(error, 'Unable to load admin metrics.');
          showAlert('error', 'Admin dashboard unavailable', message);
        }
      } finally {
        if (isMounted && latestMetricsRequestRef.current === requestId) {
          setInitializingDashboard(false);
          setDashboardRefreshing(false);
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

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setPaymentTransactions([]);
      setPaymentTotals(defaultPaymentTotals);
      setPaymentTransactionsLoading(false);
      return;
    }

    let isMounted = true;
    setPaymentTransactionsLoading(true);

    void (async () => {
      try {
        const result = await fetchAdminPaymentTransactions({
          status: paymentStatusFilter,
          searchQuery: dashboardSearchQuery,
          dateRange: dashboardDateRange,
          limit: 8,
        });

        if (!isMounted) return;
        setPaymentTransactions(result.transactions);
        setPaymentTotals(result.totals);
      } catch (error) {
        if (!isMounted) return;
        const message = await getErrorMessage(error, 'Unable to load payment transactions.');
        showAlert('error', 'Payment monitor unavailable', message);
      } finally {
        if (isMounted) {
          setPaymentTransactionsLoading(false);
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
    showAlert,
    paymentStatusFilter,
    dashboardDateRange,
    dashboardSearchQuery,
  ]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setWithdrawals([]);
      setWithdrawalTotals(defaultWithdrawalTotals);
      setWithdrawalsLoading(false);
      return;
    }

    let isMounted = true;
    setWithdrawalsLoading(true);

    void (async () => {
      try {
        const result = await fetchAdminWithdrawals({
          status: withdrawalStatusFilter,
          searchQuery: dashboardSearchQuery,
        });

        if (!isMounted) return;
        setWithdrawals(result.withdrawals);
        setWithdrawalTotals(result.totals);
      } catch (error) {
        if (!isMounted) return;
        const message = await getErrorMessage(error, 'Unable to load withdrawals.');
        showAlert('error', 'Withdrawal monitor unavailable', message);
      } finally {
        if (isMounted) {
          setWithdrawalsLoading(false);
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
    fetchAdminWithdrawals,
    showAlert,
    withdrawalStatusFilter,
    dashboardSearchQuery,
  ]);

  const handleShowAllPayments = useCallback(() => {
    setPaymentStatusFilter('all');
    setGlobalSearch('');
  }, []);

  const handleExportPaymentTransactions = useCallback(async () => {
    if (paymentExporting || paymentPdfExporting) return;

    try {
      setPaymentExporting(true);

      const result = await fetchAdminPaymentTransactions({
        status: paymentStatusFilter,
        searchQuery: dashboardSearchQuery,
        dateRange: dashboardDateRange,
        limit: 1000,
      });

      if (result.transactions.length === 0) {
        showAlert('info', 'No Payments to Export', 'No payment transactions match the current filters.');
        return;
      }

      const statusLabel = PAYMENT_STATUS_FILTERS.find((filter) => filter.key === paymentStatusFilter)?.label || 'All';
      const downloaded = downloadPaymentTransactionsExcel(result.transactions, {
        dateRangeLabel: DASHBOARD_DATE_RANGE_LABELS[dashboardDateRange],
        statusLabel,
      });

      if (!downloaded) {
        showAlert('info', 'Export Available on Web', 'Open the admin dashboard in a browser to download the Excel file.');
        return;
      }

      showAlert('success', 'Excel Export Ready', `${result.transactions.length} payment transaction(s) exported.`);
    } catch (error) {
      void getErrorMessage(error, 'Unable to export payment transactions.').then((message) => {
        showAlert('error', 'Export Failed', message);
      });
    } finally {
      setPaymentExporting(false);
    }
  }, [
    dashboardDateRange,
    dashboardSearchQuery,
    paymentExporting,
    paymentPdfExporting,
    paymentStatusFilter,
    showAlert,
  ]);

  const handleExportPaymentTransactionsPdf = useCallback(async () => {
    if (paymentExporting || paymentPdfExporting) return;

    try {
      setPaymentPdfExporting(true);

      const result = await fetchAdminPaymentTransactions({
        status: paymentStatusFilter,
        searchQuery: dashboardSearchQuery,
        dateRange: dashboardDateRange,
        limit: 1000,
      });

      if (result.transactions.length === 0) {
        showAlert('info', 'No Payments to Export', 'No payment transactions match the current filters.');
        return;
      }

      const statusLabel = PAYMENT_STATUS_FILTERS.find((filter) => filter.key === paymentStatusFilter)?.label || 'All';
      const downloaded = downloadPaymentTransactionsPdf(result.transactions, {
        dateRangeLabel: DASHBOARD_DATE_RANGE_LABELS[dashboardDateRange],
        statusLabel,
      });

      if (!downloaded) {
        showAlert('info', 'Export Available on Web', 'Open the admin dashboard in a browser to download the PDF file.');
        return;
      }

      showAlert('success', 'PDF Export Ready', `${result.transactions.length} payment transaction(s) exported.`);
    } catch (error) {
      void getErrorMessage(error, 'Unable to export payment transactions.').then((message) => {
        showAlert('error', 'Export Failed', message);
      });
    } finally {
      setPaymentPdfExporting(false);
    }
  }, [
    dashboardDateRange,
    dashboardSearchQuery,
    paymentExporting,
    paymentPdfExporting,
    paymentStatusFilter,
    showAlert,
  ]);

  const handlePaymentDetails = useCallback((transaction: AdminPaymentTransaction) => {
    const customer = transaction.customer_name || transaction.customer_email || 'Unknown customer';
    const studio = transaction.studio_name || 'Unknown studio';
    const reference = transaction.reference || transaction.payment_intent_id || transaction.checkout_session_id || 'No reference';

    showAlert(
      'info',
      'Payment Details',
      `${studio}\nCustomer: ${customer}\nAction: ${normalizePaymentActionLabel(transaction.action)}\nBooking value: ${formatCurrency(transaction.booking_value_amount)}\nCollected: ${formatCurrency(transaction.amount)}\nRefund: ${formatCurrency(transaction.refund_amount)}\nNet collected: ${formatCurrency(transaction.net_amount)}\nRef: ${reference}`,
    );
  }, [showAlert]);

  const handleShowAllWithdrawals = useCallback(() => {
    setWithdrawalStatusFilter('all');
    setGlobalSearch('');
  }, []);

  const handleAdminWithdrawShortcut = useCallback(() => {
    setAdminWithdrawAmount('');
    adminWithdrawSheetRef.current?.present();
  }, []);

  const dismissAdminWithdrawSheet = useCallback(() => {
    adminWithdrawSheetRef.current?.dismiss();
  }, []);

  const handleAdminWithdrawAmountChange = useCallback((value: string) => {
    setAdminWithdrawAmount(sanitizeCurrencyInput(value));
  }, []);

  const adminWithdrawAvailable = Math.max(Number(metrics.platformAvailable ?? metrics.netRevenue ?? 0), 0);
  const parsedAdminWithdrawAmount = parseCurrencyInputAmount(adminWithdrawAmount);
  const isAdminWithdrawReady =
    Number.isFinite(parsedAdminWithdrawAmount) &&
    parsedAdminWithdrawAmount >= 100 &&
    parsedAdminWithdrawAmount <= adminWithdrawAvailable;

  const handleAdminWithdrawSubmit = useCallback(async () => {
    if (adminWithdrawSubmitting) return;

    const amount = parseCurrencyInputAmount(adminWithdrawAmount);
    if (!Number.isFinite(amount) || amount < 100 || amount > adminWithdrawAvailable) {
      showAlert('error', 'Invalid Amount', 'Enter an amount within the available platform net.');
      return;
    }

    try {
      setAdminWithdrawSubmitting(true);

      const { data, error } = await supabase.functions.invoke<any>('permit-management', {
        body: {
          action: 'admin_record_platform_withdrawal',
          amount,
          notes: 'Manual platform withdrawal from admin dashboard. No external payout provider was used.',
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      const [nextMetrics, nextWithdrawals] = await Promise.all([
        fetchMetrics({
          dateRange: dashboardDateRange,
          searchQuery: dashboardSearchQuery,
        }),
        fetchAdminWithdrawals({
          status: withdrawalStatusFilter,
          searchQuery: dashboardSearchQuery,
        }),
      ]);

      setMetrics(nextMetrics);
      setWithdrawals(nextWithdrawals.withdrawals);
      setWithdrawalTotals(nextWithdrawals.totals);
      setAdminWithdrawAmount('');
      dismissAdminWithdrawSheet();

      showAlert(
        'success',
        'Platform Withdrawal Recorded',
        `${data?.reference || 'Manual cashout'} was saved to the database and linked to the current paid booking snapshot. No external transfer was sent.`,
      );
    } catch (error) {
      void getErrorMessage(error, 'Unable to record platform withdrawal.').then((message) => {
        showAlert('error', 'Withdrawal Failed', message);
      });
    } finally {
      setAdminWithdrawSubmitting(false);
    }
  }, [
    adminWithdrawAmount,
    adminWithdrawAvailable,
    adminWithdrawSubmitting,
    dashboardDateRange,
    dashboardSearchQuery,
    dismissAdminWithdrawSheet,
    fetchAdminWithdrawals,
    fetchMetrics,
    showAlert,
    withdrawalStatusFilter,
  ]);

  const handleWithdrawalDetails = useCallback((withdrawal: AdminWithdrawalEntry) => {
    const destination = withdrawal.source_type === 'platform'
      ? 'Internal ledger'
      : withdrawal.payout_type === 'bank'
      ? (withdrawal.payout_bank_name || 'Bank')
      : withdrawal.payout_type.toUpperCase();
    const owner = withdrawal.source_type === 'platform'
      ? 'Platform'
      : withdrawal.user?.full_name || withdrawal.user?.email || 'Unknown user';
    const account = maskAccountNumber(withdrawal.payout_account_number);
    const reference = withdrawal.reference_number || 'No reference';

    showAlert(
      'info',
      'Withdrawal Details',
      `${owner}\n${destination} ${account}\nStatus: ${formatWithdrawalStatus(withdrawal.status)}\nNet: ${formatCurrency(withdrawal.net_amount)}\nRef: ${reference}${withdrawal.source_type === 'platform' ? '\nManual record only; no external transfer was sent.' : ''}`,
    );
  }, [showAlert]);

  const handleCopyWithdrawalReference = useCallback(async (reference?: string | null) => {
    const value = String(reference || '').trim();
    if (!value) {
      showAlert('info', 'No Reference', 'This withdrawal has no reference number yet.');
      return;
    }

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        showAlert('success', 'Reference Copied', value);
        return;
      }

      showAlert('info', 'Reference', value);
    } catch {
      showAlert('info', 'Reference', value);
    }
  }, [showAlert]);

  const dashboardIncidentRows = useMemo(() => {
    if (incidentTypeFilter === 'all') return metrics.incidentTypeBreakdown;
    return metrics.incidentTypeBreakdown.filter((row) => row.category === incidentTypeFilter);
  }, [metrics.incidentTypeBreakdown, incidentTypeFilter]);

  const peakActivityMaxCount = useMemo(() => {
    if (!metrics.peakActivitySlots.length) return 1;
    return Math.max(...metrics.peakActivitySlots.map((slot) => Number(slot.count || 0)), 1);
  }, [metrics.peakActivitySlots]);

  const selectedRevenueValue = useMemo(() => {
    return revenueFilter === 'gross' ? metrics.grossRevenue : metrics.netRevenue;
  }, [metrics.grossRevenue, metrics.netRevenue, revenueFilter]);

  const selectedRevenueLabel = revenueFilter === 'gross'
    ? 'Gross booking revenue'
    : 'Platform net revenue';

  const showWithdrawalRevenueContext =
    withdrawalTotals.count === 0 && (metrics.grossRevenue > 0 || metrics.providerEarnings > 0);

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
    return DASHBOARD_DATE_RANGE_LABELS[dashboardDateRange];
  }, [dashboardDateRange]);

  const metricsUpdatedLabel = useMemo(() => {
    return formatMetricTimestamp(metrics.generatedAt);
  }, [metrics.generatedAt]);

  const liveStatusLabel = dashboardRefreshing
    ? 'Syncing live data'
    : metricsUpdatedLabel
      ? `Live DB | ${metricsUpdatedLabel}`
      : 'Live DB';

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
    <View
      testID="admin-dashboard-page"
      accessibilityLabel="admin-dashboard-page"
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
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.sectionGap}>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8, zIndex: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <TextInput
                testID="admin-dashboard-global-search-input"
                accessibilityLabel="admin-dashboard-global-search-input"
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
              {(Object.keys(DASHBOARD_DATE_RANGE_LABELS) as DashboardDateRange[]).map((range) => (
                <SmoothFilterChip
                  key={range}
                  isActive={dashboardDateRange === range}
                  label={DASHBOARD_DATE_RANGE_LABELS[range]}
                  onPress={() => setDashboardDateRange(range)}
                  activeColor={colors.primary}
                  inactiveBackground={colors.card}
                  inactiveBorder={colors.border}
                  inactiveText={colors.textSecondary}
                />
              ))}
            </ScrollView>
            <View
              style={[
                styles.liveStatusPill,
                {
                  backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={[styles.liveStatusDot, { backgroundColor: dashboardRefreshing ? colors.primary : '#10b981' }]} />
              <Text style={[styles.liveStatusText, { color: dashboardRefreshing ? colors.primary : colors.textSecondary }]}>
                {liveStatusLabel}
              </Text>
            </View>
          </View>

          <Animated.View style={[styles.dashboardMetricsStack, { opacity: dashboardContentOpacity }]}>
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
                <AnimatedMetricText
                  value={metrics.totalUsers}
                  formatter={formatMetricCount}
                  style={[styles.pulseValueMain, { color: colors.text }]}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={[styles.badgeGreen, styles.badgeInline]}>
                  <Text style={styles.badgeTextGreen}>+</Text>
                  <AnimatedMetricText
                    value={metrics.newSignups24h}
                    formatter={formatMetricCount}
                    style={styles.badgeTextGreen}
                  />
                  <Text style={styles.badgeTextGreen}>new signups (24h)</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 0 }]}>DAU:</Text>
                <AnimatedMetricText
                  value={metrics.dau}
                  formatter={formatMetricCount}
                  style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 0 }]}
                />
                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 0 }]}>| MAU:</Text>
                <AnimatedMetricText
                  value={metrics.mau}
                  formatter={formatMetricCount}
                  style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 0 }]}
                />
              </View>
            </View>

            <View style={[styles.pulseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.pulseHeader}>
                <Text style={[styles.pulseTitle, { color: colors.textSecondary }]}>Financial Overview</Text>
                <Ionicons name="wallet-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.pulseRow}>
                <AnimatedMetricText
                  value={selectedRevenueValue}
                  formatter={formatCurrency}
                  style={[styles.pulseValueMain, { color: '#10b981' }]}
                />
              </View>
              <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 2 }]}>{selectedRevenueLabel}</Text>
              <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 12 }]}>Provider earnings: {formatCurrency(metrics.providerEarnings)}</Text>
              <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 2 }]}>Pending payouts: {formatCurrency(metrics.pendingPayouts)}</Text>
              <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 2 }]}>Platform withdrawn: {formatCurrency(metrics.platformWithdrawn)}</Text>
              <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 2 }]}>Gross: {formatCurrency(metrics.grossRevenue)} | Platform net: {formatCurrency(metrics.netRevenue)}</Text>
            </View>

          </View>

          <View
            testID="admin-payment-transactions-section"
            accessibilityLabel="admin-payment-transactions-section"
            style={[styles.dataEnginePanel, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.pulseHeader, { marginBottom: 16, flexWrap: 'wrap', gap: 10 }]}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.text, marginBottom: 0 }]}>Payment Transactions</Text>
                <Text style={[styles.panelSubtitle, { color: colors.textSecondary, marginBottom: 0 }]}>
                  Gross: {formatCurrency(paymentTotals.grossAmount)} | Refunds: {formatCurrency(paymentTotals.refundedAmount)} | Collected: {formatCurrency(paymentTotals.netAmount)}
                </Text>
              </View>
              <View style={styles.withdrawalButtonRow}>
                <TouchableOpacity
                  testID="admin-payment-transactions-export-button"
                  accessibilityLabel="admin-payment-transactions-export-button"
                  activeOpacity={paymentExporting || paymentPdfExporting ? 1 : 0.88}
                  disabled={paymentExporting || paymentPdfExporting}
                  onPress={() => void handleExportPaymentTransactions()}
                  style={[
                    styles.dashboardActionButton,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                      opacity: paymentExporting ? 0.7 : 1,
                    },
                  ]}
                >
                  {paymentExporting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="download-outline" size={15} color="#FFFFFF" />
                  )}
                  <Text style={[styles.dashboardActionText, { color: '#FFFFFF' }]}>Export Excel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="admin-payment-transactions-export-pdf-button"
                  accessibilityLabel="admin-payment-transactions-export-pdf-button"
                  activeOpacity={paymentExporting || paymentPdfExporting ? 1 : 0.88}
                  disabled={paymentExporting || paymentPdfExporting}
                  onPress={() => void handleExportPaymentTransactionsPdf()}
                  style={[
                    styles.dashboardActionButton,
                    {
                      backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF',
                      borderColor: colors.primary,
                      opacity: paymentPdfExporting ? 0.7 : 1,
                    },
                  ]}
                >
                  {paymentPdfExporting ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                  )}
                  <Text style={[styles.dashboardActionText, { color: colors.primary }]}>Export PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="admin-payment-transactions-view-all-button"
                  accessibilityLabel="admin-payment-transactions-view-all-button"
                  activeOpacity={0.88}
                  onPress={handleShowAllPayments}
                  style={[
                    styles.dashboardActionButton,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="albums-outline" size={15} color={colors.primary} />
                  <Text style={[styles.dashboardActionText, { color: colors.primary }]}>View All</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {PAYMENT_STATUS_FILTERS.map((filter) => (
                <SmoothFilterChip
                  key={filter.key}
                  isActive={paymentStatusFilter === filter.key}
                  label={filter.label}
                  onPress={() => setPaymentStatusFilter(filter.key)}
                  activeColor={colors.primary}
                  inactiveBackground={colors.card}
                  inactiveBorder={colors.border}
                  inactiveText={colors.textSecondary}
                />
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <View style={[styles.badgeGreen, styles.badgeInline, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }]}>
                <Text style={styles.badgeTextGreen}>{formatMetricCount(paymentTotals.count)} records</Text>
              </View>
              <View style={[styles.badgeGreen, styles.badgeInline, { backgroundColor: isDark ? '#172554' : '#EFF6FF' }]}>
                <Text style={[styles.badgeTextGreen, { color: '#0ea5e9' }]}>{formatMetricCount(paymentTotals.refundedCount)} refund events</Text>
              </View>
              <View style={[styles.badgeGreen, styles.badgeInline, { backgroundColor: isDark ? '#450A0A' : '#FEF2F2' }]}>
                <Text style={[styles.badgeTextGreen, { color: '#ef4444' }]}>{formatMetricCount(paymentTotals.cancelledCount)} cancelled</Text>
              </View>
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, flex: 1.4 }]}>Customer</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, flex: 1.4 }]}>Studio</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary }]}>Action</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, textAlign: 'right' }]}>Collected</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, textAlign: 'right', flex: 1.1 }]}>Details</Text>
            </View>

            {paymentTransactionsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 18 }} />
            ) : paymentTransactions.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 12 }]}>
                No payment transactions match this filter.
              </Text>
            ) : (
              paymentTransactions.map((transaction) => {
                const statusColor = getPaymentStatusColor(transaction);
                const customerLabel = transaction.customer_name || transaction.customer_email || 'Unknown customer';
                const studioLabel = transaction.studio_name || 'Unknown studio';

                return (
                  <View
                    key={transaction.id}
                    testID={`admin-payment-transaction-row-${transaction.booking_id}`}
                    accessibilityLabel={`admin-payment-transaction-row-${transaction.booking_id}`}
                    style={[styles.tableRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.tableCell, { flex: 1.4 }]}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>{customerLabel}</Text>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>{formatDateTime(transaction.event_at)}</Text>
                    </View>
                    <View style={[styles.tableCell, { flex: 1.4 }]}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>{studioLabel}</Text>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>{transaction.reference || 'No reference'}</Text>
                    </View>
                    <View style={[styles.tableCell, { justifyContent: 'center' }]}>
                      <View style={[styles.badgeGreen, { alignSelf: 'flex-start', backgroundColor: `${statusColor}26` }]}>
                        <Text style={[styles.badgeTextGreen, { color: statusColor }]}>{normalizePaymentActionLabel(transaction.action)}</Text>
                      </View>
                    </View>
                    <View style={[styles.tableCell, { justifyContent: 'center' }]}>
                      <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins_600SemiBold', textAlign: 'right' }}>
                        {formatCurrency(transaction.net_amount)}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'right' }}>
                        {transaction.booking_value_amount > transaction.amount
                          ? `Booking ${formatCurrency(transaction.booking_value_amount)}`
                          : `Refund ${formatCurrency(transaction.refund_amount)}`}
                      </Text>
                    </View>
                    <View style={[styles.tableCell, styles.withdrawalActionsCell, { flex: 1.1 }]}>
                      <TouchableOpacity
                        testID={`admin-payment-transaction-details-${transaction.booking_id}`}
                        accessibilityLabel={`admin-payment-transaction-details-${transaction.booking_id}`}
                        activeOpacity={0.88}
                        onPress={() => handlePaymentDetails(transaction)}
                        style={[styles.miniActionButton, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}
                      >
                        <Ionicons name="document-text-outline" size={13} color={colors.primary} />
                        <Text style={[styles.miniActionText, { color: colors.primary }]}>Details</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View
            testID="admin-withdrawals-section"
            accessibilityLabel="admin-withdrawals-section"
            style={[styles.dataEnginePanel, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.pulseHeader, { marginBottom: 16, flexWrap: 'wrap', gap: 10 }]}>
              <View>
                <Text style={[styles.panelTitle, { color: colors.text, marginBottom: 0 }]}>Withdrawal Monitor</Text>
                <Text style={[styles.panelSubtitle, { color: colors.textSecondary, marginBottom: 0 }]}>
                  Completed: {formatCurrency(withdrawalTotals.completedAmount)} | Pending: {formatCurrency(withdrawalTotals.pendingAmount)} | Platform records: {formatMetricCount(withdrawalTotals.platformCount)}
                </Text>
              </View>
              <View style={styles.withdrawalButtonRow}>
                <TouchableOpacity
                  testID="admin-platform-withdrawal-open-button"
                  accessibilityLabel="admin-platform-withdrawal-open-button"
                  activeOpacity={0.88}
                  onPress={handleAdminWithdrawShortcut}
                  style={[
                    styles.dashboardActionButton,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <Ionicons name="arrow-down-circle-outline" size={15} color="#FFFFFF" />
                  <Text style={[styles.dashboardActionText, { color: '#FFFFFF' }]}>Withdraw</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="admin-withdrawals-view-all-button"
                  accessibilityLabel="admin-withdrawals-view-all-button"
                  activeOpacity={0.88}
                  onPress={handleShowAllWithdrawals}
                  style={[
                    styles.dashboardActionButton,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Ionicons name="albums-outline" size={15} color={colors.primary} />
                  <Text style={[styles.dashboardActionText, { color: colors.primary }]}>View All</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View
              style={[
                styles.withdrawalExplainer,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.withdrawalExplainerTitle, { color: colors.text }]}>
                  Revenue and withdrawals are separate.
                </Text>
                <Text style={[styles.withdrawalExplainerText, { color: colors.textSecondary }]}>
                  Revenue is counted from paid bookings. Platform withdrawals are manual database records linked to the current payment snapshot; they do not send money outside the app.
                </Text>
              </View>
            </View>

            <View style={styles.withdrawalSignalGrid}>
              <View style={[styles.withdrawalSignalCard, { backgroundColor: isDark ? '#102A22' : '#ECFDF5', borderColor: isDark ? '#14532D' : '#BBF7D0' }]}>
                <Text style={[styles.withdrawalSignalLabel, { color: isDark ? '#86EFAC' : '#047857' }]}>Paid Booking Revenue</Text>
                <Text style={[styles.withdrawalSignalValue, { color: isDark ? '#D1FAE5' : '#065F46' }]}>{formatCurrency(metrics.grossRevenue)}</Text>
              </View>
              <View style={[styles.withdrawalSignalCard, { backgroundColor: isDark ? '#172554' : '#EFF6FF', borderColor: isDark ? '#1D4ED8' : '#BFDBFE' }]}>
                <Text style={[styles.withdrawalSignalLabel, { color: isDark ? '#93C5FD' : '#0369A1' }]}>Provider Earnings</Text>
                <Text style={[styles.withdrawalSignalValue, { color: isDark ? '#DBEAFE' : '#0C4A6E' }]}>{formatCurrency(metrics.providerEarnings)}</Text>
              </View>
              <View style={[styles.withdrawalSignalCard, { backgroundColor: isDark ? '#312E81' : '#EEF2FF', borderColor: isDark ? '#4F46E5' : '#C7D2FE' }]}>
                <Text style={[styles.withdrawalSignalLabel, { color: isDark ? '#C4B5FD' : '#4338CA' }]}>Cashout Requests</Text>
                <Text style={[styles.withdrawalSignalValue, { color: isDark ? '#EDE9FE' : '#312E81' }]}>{formatMetricCount(withdrawalTotals.count)}</Text>
              </View>
            </View>

            {showWithdrawalRevenueContext && (
              <Text style={[styles.withdrawalContextText, { color: colors.textSecondary }]}>
                No provider has submitted a withdrawal request for this view yet. The revenue total is from booking payments, not cashout records.
              </Text>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
              {WITHDRAWAL_STATUS_FILTERS.map((filter) => (
                <SmoothFilterChip
                  key={filter.key}
                  isActive={withdrawalStatusFilter === filter.key}
                  label={filter.label}
                  onPress={() => setWithdrawalStatusFilter(filter.key)}
                  activeColor={colors.primary}
                  inactiveBackground={colors.card}
                  inactiveBorder={colors.border}
                  inactiveText={colors.textSecondary}
                />
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <View style={[styles.badgeGreen, styles.badgeInline, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }]}>
                <Text style={styles.badgeTextGreen}>{formatMetricCount(withdrawalTotals.count)} records</Text>
              </View>
              <View style={[styles.badgeGreen, styles.badgeInline, { backgroundColor: isDark ? '#172554' : '#EFF6FF' }]}>
                <Text style={[styles.badgeTextGreen, { color: '#0ea5e9' }]}>Requested {formatCurrency(withdrawalTotals.totalAmount)}</Text>
              </View>
              <View style={[styles.badgeGreen, styles.badgeInline, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}>
                <Text style={[styles.badgeTextGreen, { color: colors.primary }]}>Net {formatCurrency(withdrawalTotals.totalNetAmount)}</Text>
              </View>
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, flex: 1.3 }]}>Owner</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, flex: 1.5 }]}>Destination</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary }]}>Status</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, textAlign: 'right' }]}>Net Amount</Text>
              <Text style={[styles.tableCell, styles.th, { color: colors.textSecondary, textAlign: 'right', flex: 1.15 }]}>Actions</Text>
            </View>

            {withdrawalsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ paddingVertical: 18 }} />
            ) : withdrawals.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 12 }]}>
                No withdrawal requests match this filter. Cashouts will appear here after providers submit a withdrawal from their wallet.
              </Text>
            ) : (
              withdrawals.map((withdrawal) => {
                const destinationLabel = withdrawal.payout_type === 'bank'
                  ? (withdrawal.payout_bank_name || 'Bank')
                  : withdrawal.payout_type.toUpperCase();
                const ownerLabel = withdrawal.user?.full_name || withdrawal.user?.email || 'Unknown user';
                const statusColor = withdrawal.status === 'completed'
                  ? '#10b981'
                  : withdrawal.status === 'failed' || withdrawal.status === 'cancelled'
                    ? '#ef4444'
                    : '#f59e0b';

                return (
                  <View
                    key={withdrawal.id}
                    testID={`admin-withdrawal-row-${withdrawal.id}`}
                    accessibilityLabel={`admin-withdrawal-row-${withdrawal.id}`}
                    style={[styles.tableRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.tableCell, { flex: 1.3 }]}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>{ownerLabel}</Text>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>{formatDateTime(withdrawal.created_at)}</Text>
                    </View>
                    <View style={[styles.tableCell, { flex: 1.5 }]}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>
                        {destinationLabel} {maskAccountNumber(withdrawal.payout_account_number)}
                      </Text>
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular' }}>
                        {withdrawal.reference_number || 'No reference'}
                      </Text>
                    </View>
                    <View style={[styles.tableCell, { justifyContent: 'center' }]}>
                      <View style={[styles.badgeGreen, { alignSelf: 'flex-start', backgroundColor: `${statusColor}26` }]}>
                        <Text style={[styles.badgeTextGreen, { color: statusColor }]}>{formatWithdrawalStatus(withdrawal.status)}</Text>
                      </View>
                    </View>
                    <View style={[styles.tableCell, { justifyContent: 'center' }]}>
                      <Text style={{ color: colors.text, fontSize: 12, fontFamily: 'Poppins_600SemiBold', textAlign: 'right' }}>
                        {formatCurrency(withdrawal.net_amount)}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', textAlign: 'right' }}>
                        {formatDateTime(withdrawal.processed_at)}
                      </Text>
                    </View>
                    <View style={[styles.tableCell, styles.withdrawalActionsCell]}>
                      <TouchableOpacity
                        testID={`admin-withdrawal-details-${withdrawal.id}`}
                        accessibilityLabel={`admin-withdrawal-details-${withdrawal.id}`}
                        activeOpacity={0.88}
                        onPress={() => handleWithdrawalDetails(withdrawal)}
                        style={[styles.miniActionButton, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}
                      >
                        <Ionicons name="document-text-outline" size={13} color={colors.primary} />
                        <Text style={[styles.miniActionText, { color: colors.primary }]}>Details</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`admin-withdrawal-copy-${withdrawal.id}`}
                        accessibilityLabel={`admin-withdrawal-copy-${withdrawal.id}`}
                        activeOpacity={0.88}
                        onPress={() => handleCopyWithdrawalReference(withdrawal.reference_number)}
                        style={[styles.miniActionButton, { borderColor: colors.border, backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}
                      >
                        <Ionicons name="copy-outline" size={13} color={colors.primary} />
                        <Text style={[styles.miniActionText, { color: colors.primary }]}>Copy</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.dataEngineRow}>
            <View style={[styles.dataEnginePanel, styles.dataEnginePanelLeft, { backgroundColor: colors.card, borderColor: colors.border, flex: Platform.OS === 'web' ? 5 : 1 }]}>
              <View style={[styles.pulseHeader, { marginBottom: 12, flexWrap: 'wrap', gap: 10 }]}>
                <View>
                  <Text style={[styles.panelTitle, { color: colors.text }]}>Revenue Growth</Text>
                  <Text style={[styles.panelSubtitle, { color: colors.textSecondary, marginBottom: 0 }]}>{dashboardDateRangeLabel} gross vs platform net</Text>
                </View>
                <View style={[styles.segmentControl, { borderColor: colors.border }]}>
                  <SmoothSegmentButton
                    isActive={revenueFilter === 'gross'}
                    label="Gross"
                    onPress={() => setRevenueFilter('gross')}
                    activeColor={colors.primary}
                    inactiveText={colors.textSecondary}
                  />
                  <SmoothSegmentButton
                    isActive={revenueFilter === 'net'}
                    label="Platform Net"
                    onPress={() => setRevenueFilter('net')}
                    activeColor={colors.primary}
                    inactiveText={colors.textSecondary}
                  />
                </View>
              </View>

              <AnimatedMetricText
                value={selectedRevenueValue}
                formatter={formatCurrency}
                style={[styles.pulseValueMain, { color: '#10b981', marginBottom: 12 }]}
              />

              <View style={styles.revenueTrendContainer}>
                {revenueTrendRows.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary, textAlign: 'left', paddingVertical: 8 }]}>No revenue trend data yet for this date range.</Text>
                ) : (
                  <View style={styles.revenueBarsRow}>
                    {revenueTrendRows.map((point: any, index: number) => {
                      const barHeight = Math.max(8, Math.round((point.value / revenueTrendMax) * 96));

                      return (
                        <View key={`${point.label}-${index}`} style={styles.revenueBarColumn}>
                          <View style={[styles.revenueBarTrack, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                            <AnimatedRevenueBar
                              height={barHeight}
                              revenueFilter={revenueFilter}
                              grossColor={colors.primary}
                              netColor="#0ea5e9"
                            />
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
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>Platform net: {formatCurrency(metrics.netRevenue)}</Text>
                </View>
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
                <View style={[styles.segmentControl, { borderColor: colors.border }]}>
                  {(['all', 'booking', 'profile'] as IncidentTypeFilter[]).map((typeKey) => (
                    <SmoothSegmentButton
                      key={typeKey}
                      isActive={incidentTypeFilter === typeKey}
                      label={typeKey}
                      onPress={() => setIncidentTypeFilter(typeKey)}
                      activeColor={colors.primary}
                      inactiveText={colors.textSecondary}
                      textTransform="capitalize"
                    />
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
                          <AnimatedProgressFill percent={widthPercent} color={badgeColor} />
                        </View>
                      </View>
                    );
                  })
                )}

                <Text style={[styles.pulseSubtitle, { color: colors.textSecondary, marginTop: 4 }]}>Use peak windows to plan moderation and support staffing.</Text>
              </View>
            </View>
          </View>
          </Animated.View>
        </View>
      </ScrollView>

      <BottomSheetModal
        ref={adminWithdrawSheetRef}
        index={0}
        snapPoints={adminWithdrawSnapPoints}
        animationConfigs={adminWithdrawAnimationConfigs}
        animateOnMount
        enableDynamicSizing={false}
        enableContentPanningGesture={false}
        enableOverDrag={false}
        enablePanDownToClose
        backdropComponent={renderAdminWithdrawBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? '#4B5563' : '#CBD5E1',
          width: 42,
        }}
      >
        <BottomSheetScrollView
          testID="admin-platform-withdrawal-modal"
          accessibilityLabel="admin-platform-withdrawal-modal"
          contentContainerStyle={styles.adminWithdrawSheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.adminWithdrawHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.adminWithdrawTitle, { color: colors.text }]}>Withdraw Funds</Text>
              <Text style={[styles.adminWithdrawSubtitle, { color: colors.textSecondary }]}>
                Available manual platform net: {formatCurrency(adminWithdrawAvailable)}
              </Text>
            </View>
            <TouchableOpacity
              testID="admin-platform-withdrawal-close-button"
              accessibilityLabel="admin-platform-withdrawal-close-button"
              activeOpacity={0.8}
              onPress={dismissAdminWithdrawSheet}
              style={[styles.adminWithdrawCloseButton, { backgroundColor: colors.card }]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.adminWithdrawSection}>
            <Text style={[styles.adminWithdrawLabel, { color: colors.text }]}>Amount to Withdraw</Text>
            <View style={[styles.adminWithdrawInputWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.adminWithdrawCurrency, { color: colors.textSecondary }]}>₱</Text>
              <TextInput
                testID="admin-platform-withdrawal-amount-input"
                accessibilityLabel="admin-platform-withdrawal-amount-input"
                value={adminWithdrawAmount}
                onChangeText={handleAdminWithdrawAmountChange}
                inputMode="decimal"
                keyboardType="decimal-pad"
                placeholder="Enter custom amount"
                placeholderTextColor={colors.textSecondary}
                selectTextOnFocus
                style={[styles.adminWithdrawInput, { color: colors.text }]}
              />
            </View>
            <Text style={[styles.adminWithdrawHint, { color: colors.textSecondary }]}>
              {adminWithdrawAvailable >= 100
                ? `Enter any amount from PHP 100 up to ${formatCurrency(adminWithdrawAvailable)}.`
                : 'No platform net is available to withdraw yet.'}
            </Text>
          </View>

          <View style={styles.adminWithdrawQuickGrid}>
            {[...ADMIN_WITHDRAW_QUICK_AMOUNTS, adminWithdrawAvailable].map((amount, index) => {
              const isMax = index === ADMIN_WITHDRAW_QUICK_AMOUNTS.length;
              const normalizedAmount = Math.max(Number(amount || 0), 0);
              const isActive =
                Number.isFinite(parsedAdminWithdrawAmount) &&
                Math.abs(parsedAdminWithdrawAmount - normalizedAmount) < 0.005 &&
                normalizedAmount > 0;
              return (
                <TouchableOpacity
                  testID={isMax ? 'admin-platform-withdrawal-quick-max' : `admin-platform-withdrawal-quick-${normalizedAmount}`}
                  accessibilityLabel={isMax ? 'admin-platform-withdrawal-quick-max' : `admin-platform-withdrawal-quick-${normalizedAmount}`}
                  key={isMax ? 'max' : String(amount)}
                  activeOpacity={0.8}
                  onPress={() => setAdminWithdrawAmount(formatCurrencyInputAmount(normalizedAmount))}
                  style={[
                    styles.adminWithdrawQuickButton,
                    {
                      backgroundColor: isActive ? colors.primary : colors.card,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.adminWithdrawQuickText, { color: isActive ? '#FFFFFF' : colors.text }]}>
                    {isMax ? 'Max' : `PHP ${normalizedAmount.toLocaleString()}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.adminWithdrawNote, { backgroundColor: isDark ? '#172033' : '#EFF6FF' }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.adminWithdrawNoteText, { color: isDark ? colors.textSecondary : '#1E40AF' }]}>
              This records an internal database withdrawal and links it to the current paid booking snapshot. No external payout provider is used.
            </Text>
          </View>

          <TouchableOpacity
            testID="admin-platform-withdrawal-submit-button"
            accessibilityLabel="admin-platform-withdrawal-submit-button"
            activeOpacity={isAdminWithdrawReady ? 0.82 : 1}
            disabled={adminWithdrawSubmitting || !isAdminWithdrawReady}
            onPress={handleAdminWithdrawSubmit}
            style={[
              styles.adminWithdrawSubmitButton,
              {
                backgroundColor: isAdminWithdrawReady ? colors.primary : colors.border,
                opacity: isAdminWithdrawReady ? 1 : 0.6,
              },
            ]}
          >
            {adminWithdrawSubmitting
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Ionicons name="arrow-down-circle" size={20} color={isAdminWithdrawReady ? '#FFFFFF' : colors.textSecondary} />}
            <Text style={[styles.adminWithdrawSubmitText, { color: isAdminWithdrawReady ? '#FFFFFF' : colors.textSecondary }]}>
              {adminWithdrawSubmitting ? 'Recording...' : 'Confirm Withdrawal'}
            </Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheetModal>

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

