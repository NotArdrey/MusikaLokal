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
import { formatDetailLabel, formatDetailValue } from './_formatters';

type Tab = 'dashboard' | 'permits' | 'users' | 'reports' | 'audit' | 'deals' | 'posts' | 'products' | 'projects';

type DealType = 'all' | 'venue_partnership' | 'studio_recording';
type DealStatus = 'all' | 'proposed' | 'countered' | 'accepted' | 'rejected' | 'cancelled' | 'settled' | 'disputed';
type PenaltyFilter = 'all' | 'late_cancellation' | 'no_show';

const adminTabRoutes: Record<Tab, string> = {
  dashboard: '/admin',
  permits: '/admin/permits',
  users: '/admin/users',
  reports: '/admin/reports',
  audit: '/admin/audit',
  deals: '/admin/deals',
  posts: '/admin/posts',
  products: '/admin/products',
  projects: '/admin/projects',
};

const DEALS_CACHE_TTL_MS = 30_000;

interface VenuePartnershipDeal {
  id: string;
  venue_owner_id: string;
  production_team_id: string;
  gig_id: string | null;
  title: string;
  status: string;
  proposed_by_user_id: string;
  accepted_term_version_id: string | null;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  production_team_name: string;
  venue_owner_name: string;
  gig_name: string | null;
  current_venue_pct: number | null;
  current_production_pct: number | null;
  current_fixed_fee: number | null;
  current_deposit: number | null;
  current_event_date: string | null;
  current_version: number | null;
  event_count: number;
  last_activity_at: string | null;
}

interface StudioRecordingDeal {
  id: string;
  studio_id: string;
  counterparty_id: string;
  title: string;
  status: string;
  proposed_by_user_id: string;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  studio_name: string;
  counterparty_name: string;
  package_count: number;
}

interface PenaltyEvent {
  id: string;
  booking_id: string;
  penalty_type: string;
  penalty_amount: number;
  refund_amount: number;
  booking_total: number;
  penalized_user_id: string;
  beneficiary_user_id: string | null;
  notes: string | null;
  created_at: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  studio_name: string;
  penalized_user_name: string;
  beneficiary_user_name: string | null;
}

interface SettlementHold {
  id: string;
  booking_id: string | null;
  issue_type: string;
  status: string;
  settlement_hold: boolean;
  penalty_event_id: string | null;
  reporter_notes: string | null;
  created_at: string;
}

const tabItems: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart-outline' },
  { key: 'permits', label: 'Permits', icon: 'document-text-outline' },
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'reports', label: 'Reports', icon: 'shield-checkmark-outline' },
  { key: 'audit', label: 'Audit', icon: 'time-outline' },
  { key: 'deals', label: 'Deals', icon: 'briefcase-outline' },
  { key: 'posts', label: 'Posts', icon: 'newspaper-outline' },
  { key: 'products', label: 'Products', icon: 'bag-handle-outline' },
  { key: 'projects', label: 'Projects', icon: 'people-circle-outline' },
];

const dealTypes: DealType[] = ['all', 'venue_partnership', 'studio_recording'];
const dealStatuses: DealStatus[] = ['all', 'proposed', 'countered', 'accepted', 'rejected', 'cancelled', 'settled', 'disputed'];
const penaltyTypes: PenaltyFilter[] = ['all', 'late_cancellation', 'no_show'];

const formatCurrency = (value?: number | null) => {
  const safeValue = Number(value || 0);
  return `₱${safeValue.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const statusColor = (status: string): string => {
  switch (status) {
    case 'accepted':
    case 'settled':
      return '#10b981';
    case 'proposed':
    case 'countered':
      return '#f59e0b';
    case 'rejected':
    case 'cancelled':
    case 'disputed':
      return '#ef4444';
    default:
      return '#6b7280';
  }
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    flex: 1,
  },
  detailValue: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
    textAlign: 'right',
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
  metricRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 12,
    flexWrap: 'wrap',
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flex: Platform.OS === 'web' ? 1 : undefined,
    minWidth: Platform.OS === 'web' ? 140 : undefined,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
  },
  metricLabel: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
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
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
    textTransform: 'capitalize',
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

export default function AdminDealsPage() {
  const { colors, isDark } = useTheme();
  const { session, loading, isGuest, isAdmin, roleResolved } = useAuth();
  const { width } = useWindowDimensions();
  const hasHydratedRef = useRef(false);

  const [initializing, setInitializing] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dealTypeFilter, setDealTypeFilter] = useState<DealType>('all');
  const [dealStatusFilter, setDealStatusFilter] = useState<DealStatus>('all');
  const [penaltyFilter, setPenaltyFilter] = useState<PenaltyFilter>('all');
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);

  const [venueDeals, setVenueDeals] = useState<VenuePartnershipDeal[]>([]);
  const [recordingDeals, setRecordingDeals] = useState<StudioRecordingDeal[]>([]);
  const [penalties, setPenalties] = useState<PenaltyEvent[]>([]);
  const [settlementHolds, setSettlementHolds] = useState<SettlementHold[]>([]);

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

  const dealsCacheKey = useMemo(() => getAdminPageCacheKey('deals'), []);

  const handleTabChange = useCallback((nextTab: Tab) => {
    if (nextTab === 'deals') return;
    router.replace(adminTabRoutes[nextTab] as any);
  }, []);

  const fetchDeals = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setDataLoading(true);

    try {
      // Fetch venue partnership deals
      const { data: vpData, error: vpError } = await supabase
        .from('venue_partnership_deals_with_summary')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (vpError) throw vpError;
      setVenueDeals((vpData || []) as VenuePartnershipDeal[]);

      // Fetch studio recording deals
      const { data: srData, error: srError } = await supabase
        .from('studio_recording_deals_with_summary')
        .select('id, studio_id, counterparty_id, title, status, proposed_by_user_id, valid_from, valid_until, notes, accepted_at, created_at, updated_at, studio_name, studio_hourly_rate, studio_owner_name, counterparty_name, package_count')
        .order('created_at', { ascending: false })
        .limit(200);

      if (srError) throw srError;
      setRecordingDeals((srData || []) as StudioRecordingDeal[]);

      // Fetch penalty events
      const { data: peData, error: peError } = await supabase
        .from('booking_penalty_events_with_summary')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (peError) throw peError;
      setPenalties((peData || []) as PenaltyEvent[]);

      // Fetch settlement holds (incidents with settlement_hold = true)
      const { data: shData, error: shError } = await supabase
        .from('booking_incidents')
        .select('id, booking_id, issue_type, status, settlement_hold, penalty_event_id, reporter_notes, created_at')
        .eq('settlement_hold', true)
        .order('created_at', { ascending: false })
        .limit(100);

      if (shError) throw shError;
      setSettlementHolds((shData || []) as SettlementHold[]);

      writeAdminPageCache(dealsCacheKey, {
        venueDeals: vpData || [],
        recordingDeals: srData || [],
        penalties: peData || [],
        settlementHolds: shData || [],
      });
    } catch (error: any) {
      if (!options?.silent) {
        const message = error?.message || error?.details || 'Unable to load deals data.';
        showAlert('error', 'Failed to load deals', message);
      }
    } finally {
      if (!options?.silent) setDataLoading(false);
    }
  }, [dealsCacheKey, showAlert]);

  useEffect(() => {
    if (loading || !roleResolved || !session || isGuest || !isAdmin) {
      setInitializing(false);
      hasHydratedRef.current = false;
      return;
    }

    let isMounted = true;
    const cached = readAdminPageCache<{
      venueDeals: VenuePartnershipDeal[];
      recordingDeals: StudioRecordingDeal[];
      penalties: PenaltyEvent[];
      settlementHolds: SettlementHold[];
    }>(dealsCacheKey, DEALS_CACHE_TTL_MS);

    if (cached) {
      setVenueDeals(cached.venueDeals || []);
      setRecordingDeals(cached.recordingDeals || []);
      setPenalties(cached.penalties || []);
      setSettlementHolds(cached.settlementHolds || []);
      setInitializing(false);
      hasHydratedRef.current = true;
    } else if (!hasHydratedRef.current) {
      setInitializing(true);
    } else {
      setInitializing(false);
    }

    void (async () => {
      try {
        await fetchDeals({ silent: Boolean(cached) });
      } finally {
        if (isMounted) {
          setInitializing(false);
          hasHydratedRef.current = true;
        }
      }
    })();

    return () => { isMounted = false; };
  }, [loading, roleResolved, session, isGuest, isAdmin, dealsCacheKey, fetchDeals]);

  // Filtered venue deals
  const filteredVenueDeals = useMemo(() => {
    if (dealTypeFilter === 'studio_recording') return [];
    const query = search.trim().toLowerCase();

    return venueDeals.filter((d) => {
      if (dealStatusFilter !== 'all' && d.status !== dealStatusFilter) return false;
      if (!query) return true;
      return (
        d.title.toLowerCase().includes(query) ||
        d.production_team_name.toLowerCase().includes(query) ||
        d.venue_owner_name.toLowerCase().includes(query) ||
        (d.gig_name || '').toLowerCase().includes(query)
      );
    });
  }, [venueDeals, dealTypeFilter, dealStatusFilter, search]);

  // Filtered recording deals
  const filteredRecordingDeals = useMemo(() => {
    if (dealTypeFilter === 'venue_partnership') return [];
    const query = search.trim().toLowerCase();

    return recordingDeals.filter((d) => {
      if (dealStatusFilter !== 'all' && d.status !== dealStatusFilter) return false;
      if (!query) return true;
      return (
        d.title.toLowerCase().includes(query) ||
        d.studio_name.toLowerCase().includes(query) ||
        d.counterparty_name.toLowerCase().includes(query)
      );
    });
  }, [recordingDeals, dealTypeFilter, dealStatusFilter, search]);

  // Filtered penalties
  const filteredPenalties = useMemo(() => {
    const query = search.trim().toLowerCase();

    return penalties.filter((p) => {
      if (penaltyFilter !== 'all' && p.penalty_type !== penaltyFilter) return false;
      if (!query) return true;
      return (
        p.studio_name.toLowerCase().includes(query) ||
        p.penalized_user_name.toLowerCase().includes(query) ||
        (p.beneficiary_user_name || '').toLowerCase().includes(query) ||
        (p.notes || '').toLowerCase().includes(query)
      );
    });
  }, [penalties, penaltyFilter, search]);

  // Metrics
  const metrics = useMemo(() => {
    const totalVenue = venueDeals.length;
    const totalRecording = recordingDeals.length;
    const activeVenue = venueDeals.filter((d) => ['proposed', 'countered', 'accepted'].includes(d.status)).length;
    const activeRecording = recordingDeals.filter((d) => ['proposed', 'accepted'].includes(d.status)).length;
    const disputedDeals = venueDeals.filter((d) => d.status === 'disputed').length;
    const totalPenalties = penalties.length;
    const totalPenaltyAmount = penalties.reduce((sum, p) => sum + (p.penalty_amount || 0), 0);
    const totalRefundAmount = penalties.reduce((sum, p) => sum + (p.refund_amount || 0), 0);
    const activeHolds = settlementHolds.filter((h) => !['resolved_refund', 'resolved_no_refund', 'dismissed'].includes(h.status)).length;

    return {
      totalVenue,
      totalRecording,
      activeVenue,
      activeRecording,
      disputedDeals,
      totalPenalties,
      totalPenaltyAmount,
      totalRefundAmount,
      activeHolds,
    };
  }, [venueDeals, recordingDeals, penalties, settlementHolds]);

  if (loading || !roleResolved || initializing) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading deals...</Text>
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
        {/* Tab navigation */}
        {showInlineTabNav && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {tabItems.map((item) => {
              const active = item.key === 'deals';
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
                  <Ionicons name={item.icon as any} size={16} color={active ? '#FFFFFF' : colors.textSecondary} />
                  <Text style={[styles.tabText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Metrics overview */}
        <View style={styles.metricRow}>
          {[
            { label: 'Venue Partnerships', value: metrics.totalVenue, sub: `${metrics.activeVenue} active` },
            { label: 'Recording Deals', value: metrics.totalRecording, sub: `${metrics.activeRecording} active` },
            { label: 'Disputed', value: metrics.disputedDeals, sub: '' },
            { label: 'Penalties', value: metrics.totalPenalties, sub: formatCurrency(metrics.totalPenaltyAmount) },
            { label: 'Refunds Issued', value: '', sub: formatCurrency(metrics.totalRefundAmount) },
            { label: 'Settlement Holds', value: metrics.activeHolds, sub: 'active' },
          ].map((m, idx) => (
            <View
              key={idx}
              style={[styles.metricCard, { backgroundColor: isDark ? '#1E293B' : '#FAFAFA', borderColor: colors.border }]}
            >
              <Text style={[styles.metricValue, { color: colors.text }]}>{m.value}</Text>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
              {m.sub ? <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.sub}</Text> : null}
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={styles.sectionGap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search deals, studios, users..."
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

          {/* Deal type filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {dealTypes.map((t) => {
              const active = dealTypeFilter === t;
              return (
                <TouchableOpacity
                  key={t}
                  activeOpacity={1}
                  onPress={() => setDealTypeFilter(t)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {t === 'all' ? 'All Types' : t === 'venue_partnership' ? 'Venue' : 'Recording'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Status filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {dealStatuses.map((s) => {
              const active = dealStatusFilter === s;
              return (
                <TouchableOpacity
                  key={s}
                  activeOpacity={1}
                  onPress={() => setDealStatusFilter(s)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {s === 'all' ? 'All Status' : s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Venue Partnership Deals */}
        {(dealTypeFilter === 'all' || dealTypeFilter === 'venue_partnership') && (
          <View style={styles.sectionGap}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Venue Partnership Deals ({filteredVenueDeals.length})
            </Text>

            {dataLoading && filteredVenueDeals.length === 0 ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredVenueDeals.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No venue deals found.</Text>
            ) : (
              filteredVenueDeals.map((deal) => {
                const expanded = expandedDealId === `vp-${deal.id}`;
                return (
                  <TouchableOpacity
                    key={deal.id}
                    activeOpacity={0.8}
                    onPress={() => setExpandedDealId(expanded ? null : `vp-${deal.id}`)}
                    style={[styles.card, { borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
                  >
                    <View style={styles.cardRow}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {deal.title}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor(deal.status) }]}>
                        <Text style={styles.statusBadgeText}>{deal.status}</Text>
                      </View>
                    </View>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      Venue: {deal.venue_owner_name} | Team: {deal.production_team_name}
                    </Text>
                    {deal.gig_name && (
                      <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                        Gig: {deal.gig_name}
                      </Text>
                    )}
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      Created: {formatDate(deal.created_at)} | Events: {deal.event_count}
                    </Text>

                    {expanded && (
                      <View style={{ gap: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Venue Split</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.current_venue_pct != null ? `${deal.current_venue_pct}%` : '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Production Split</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.current_production_pct != null ? `${deal.current_production_pct}%` : '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Fixed Fee</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.current_fixed_fee != null ? formatCurrency(deal.current_fixed_fee) : '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Deposit</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.current_deposit != null ? formatCurrency(deal.current_deposit) : '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Event Date</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.current_event_date || '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Term Version</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            v{deal.current_version || '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Settled At</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.settled_at ? formatDate(deal.settled_at) : 'Not settled'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Activity</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.last_activity_at ? formatDate(deal.last_activity_at) : '-'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Studio Recording Deals */}
        {(dealTypeFilter === 'all' || dealTypeFilter === 'studio_recording') && (
          <View style={styles.sectionGap}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Studio Recording Deals ({filteredRecordingDeals.length})
            </Text>

            {dataLoading && filteredRecordingDeals.length === 0 ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : filteredRecordingDeals.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recording deals found.</Text>
            ) : (
              filteredRecordingDeals.map((deal) => {
                const expanded = expandedDealId === `sr-${deal.id}`;
                return (
                  <TouchableOpacity
                    key={deal.id}
                    activeOpacity={0.8}
                    onPress={() => setExpandedDealId(expanded ? null : `sr-${deal.id}`)}
                    style={[styles.card, { borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
                  >
                    <View style={styles.cardRow}>
                      <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                        {deal.title}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusColor(deal.status) }]}>
                        <Text style={styles.statusBadgeText}>{deal.status}</Text>
                      </View>
                    </View>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      Studio: {deal.studio_name} | Counterparty: {deal.counterparty_name}
                    </Text>
                    <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                      Packages: {deal.package_count} | Created: {formatDate(deal.created_at)}
                    </Text>

                    {expanded && (
                      <View style={{ gap: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Valid From</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.valid_from || '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Valid Until</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.valid_until || '-'}
                          </Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Accepted At</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>
                            {deal.accepted_at ? formatDate(deal.accepted_at) : 'Not accepted'}
                          </Text>
                        </View>
                        {deal.notes && (
                          <View style={styles.detailRow}>
                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Notes</Text>
                            <Text style={[styles.detailValue, { color: colors.text }]}>{deal.notes}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Penalty Events */}
        <View style={styles.sectionGap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Booking Penalties ({filteredPenalties.length})
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {penaltyTypes.map((t) => {
              const active = penaltyFilter === t;
              return (
                <TouchableOpacity
                  key={t}
                  activeOpacity={1}
                  onPress={() => setPenaltyFilter(t)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: active ? colors.primary : (isDark ? '#1E293B' : '#FFFFFF'),
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
                    {t === 'all' ? 'All' : t === 'late_cancellation' ? 'Late Cancel' : 'No-Show'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {filteredPenalties.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No penalty events found.</Text>
          ) : (
            filteredPenalties.map((pe) => (
              <View
                key={pe.id}
                style={[styles.card, { borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
              >
                <View style={styles.cardRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    {pe.studio_name} - {pe.session_type}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: pe.penalty_type === 'no_show' ? '#ef4444' : '#f59e0b' }]}>
                    <Text style={styles.statusBadgeText}>
                      {pe.penalty_type === 'no_show' ? 'No-Show' : 'Late Cancel'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  Penalized: {pe.penalized_user_name} | Beneficiary: {pe.beneficiary_user_name || '-'}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  Penalty: {formatCurrency(pe.penalty_amount)} | Refund: {formatCurrency(pe.refund_amount)} | Total: {formatCurrency(pe.booking_total)}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  Booking: {pe.booking_date} {pe.start_time}-{pe.end_time} | Event: {formatDate(pe.created_at)}
                </Text>
                {pe.notes && (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    Notes: {pe.notes}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Settlement Holds */}
        <View style={styles.sectionGap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Settlement Holds ({settlementHolds.length})
          </Text>

          {settlementHolds.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No active settlement holds.</Text>
          ) : (
            settlementHolds.map((hold) => (
              <View
                key={hold.id}
                style={[styles.card, { borderColor: colors.border, backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}
              >
                <View style={styles.cardRow}>
                  <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                    Incident: {hold.issue_type}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(hold.status) }]}>
                    <Text style={styles.statusBadgeText}>{hold.status}</Text>
                  </View>
                </View>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                  Booking: {hold.booking_id || '-'} | Created: {formatDate(hold.created_at)}
                </Text>
                {hold.reporter_notes && (
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    Notes: {hold.reporter_notes}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Refresh button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => fetchDeals()}
          disabled={dataLoading}
          style={[
            styles.filterChip,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              alignSelf: 'center',
              paddingHorizontal: 24,
              paddingVertical: 12,
            },
          ]}
        >
          {dataLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.filterChipText, { color: '#FFFFFF', fontSize: 14 }]}>Refresh Data</Text>
          )}
        </TouchableOpacity>
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
