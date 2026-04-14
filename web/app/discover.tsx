import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import ListingCard from '../src/components/ListingCard';
import ListingDetailsSheet from '../src/components/ListingDetailsSheet';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  // @ts-ignore
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const GENRE_OPTIONS = ['All', 'Rock', 'Jazz', 'Indie Pop', 'Acoustic', 'Electronic', 'OPM', 'Classical', 'R&B', 'Hip Hop'];
const RATING_OPTIONS = [
  { label: 'All', value: 0 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
  { label: '4.5+', value: 4.5 },
];
const PRICE_OPTIONS = [
  { label: 'All', value: 'all' as const },
  { label: 'P0-5K', value: 'low' as const },
  { label: 'P5K-15K', value: 'mid' as const },
  { label: 'P15K+', value: 'high' as const },
];
const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest' as const, icon: 'time-outline' as const },
  { label: 'Top Rated', value: 'rating' as const, icon: 'star-outline' as const },
  { label: 'Price Up', value: 'price_low' as const, icon: 'arrow-up-outline' as const },
  { label: 'Price Down', value: 'price_high' as const, icon: 'arrow-down-outline' as const },
];
const TYPE_OPTIONS = ['All', 'Musician', 'Studio', 'Gig'];
const PAGE_SIZE = 10;

export default function Discover() {
  const { colors } = useTheme();
  const { userRole, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const effectiveWidth = contentWidth > 0 ? contentWidth : winWidth;
  const isWebDesktop = Platform.OS === 'web' && effectiveWidth >= 768;
  const gridColumns = Platform.OS === 'web' && effectiveWidth >= 1040 ? 2 : 1;

  const accentColor = colors.primary;
  const pageBackground = colors.background;
  const pageCardBackground = colors.card;
  const surfaceBackground = colors.inputBackground;
  const borderSoft = colors.border;
  const textPrimary = colors.text;
  const textSecondary = colors.textSecondary;

  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [spillover, setSpillover] = useState<any[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [minRating, setMinRating] = useState(0);
  const [priceRange, setPriceRange] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'rating' | 'price_low' | 'price_high'>('newest');

  const requestIdRef = useRef(0);
  const dataRef = useRef<any[]>([]);
  const spilloverRef = useRef<any[]>([]);
  const detailsSheetRef = useRef<any>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const presentModalWithRetry = useCallback((modalRef: { current: any }) => {
    let attempts = 0;
    const maxAttempts = 6;

    const presentWhenReady = () => {
      if (modalRef.current) {
        modalRef.current.present();
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        requestAnimationFrame(presentWhenReady);
      }
    };

    requestAnimationFrame(presentWhenReady);
  }, []);

  const openListingDetails = useCallback((listingId: string) => {
    if (!listingId) return;
    setSelectedListingId(listingId);
    presentModalWithRetry(detailsSheetRef);
  }, [presentModalWithRetry]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    spilloverRef.current = spillover;
  }, [spillover]);

  const isOwner = useMemo(() => userRole === 'venue-owner' || userRole === 'studio-owner', [userRole]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeFilter !== 'All') count++;
    if (selectedGenre !== 'All') count++;
    if (minRating > 0) count++;
    if (priceRange !== 'all') count++;
    if (sortBy !== 'newest') count++;
    return count;
  }, [activeFilter, selectedGenre, minRating, priceRange, sortBy]);

  const toggleFilters = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowFilters((prev) => !prev);
  }, []);

  const resetFilters = useCallback(() => {
    setActiveFilter('All');
    setSelectedGenre('All');
    setMinRating(0);
    setPriceRange('all');
    setSortBy('newest');
  }, []);

  const fetchSearchPage = useCallback(async (page: number, mode: 'reset' | 'append') => {
    const isReset = mode === 'reset';
    const requestId = ++requestIdRef.current;

    if (isReset) {
      setLoading(true);
      setHasMore(true);
      setCurrentPage(0);
      setSpillover([]);
    } else {
      setLoadingMore(true);
    }

    try {
      let results: any[] = [];
      let tables: string[] = [];

      if (isGuest) {
        tables = ['groups_with_stats', 'profiles'];
      } else if (isOwner) {
        tables = ['groups_with_stats'];
      } else if (activeFilter === 'All') {
        tables = ['groups_with_stats', 'studios_with_stats', 'gigs_with_stats'];
      } else if (activeFilter === 'Musician') {
        tables = ['groups_with_stats'];
      } else if (activeFilter === 'Studio') {
        tables = ['studios_with_stats'];
      } else if (activeFilter === 'Gig') {
        tables = ['gigs_with_stats'];
      }

      for (const table of tables) {
        let query: any = supabase.from(table).select('*');

        if (table === 'profiles') {
          query = query
            .select('id, full_name, avatar_url, address, created_at, role, genres, skills, show_gig_statuses')
            .eq('role', 'musician');
        }

        if (searchQuery.trim().length > 0) {
          if (table === 'profiles') {
            query = query.or(`full_name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`);
          } else {
            query = query.or(`name.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`);
          }
        }

        if (table === 'gigs_with_stats') {
          query = query.eq('status', 'open');
        }

        if (selectedGenre !== 'All' && (table === 'groups_with_stats' || table === 'gigs_with_stats')) {
          query = query.ilike('genre', `%${selectedGenre}%`);
        }

        if (minRating > 0) {
          query = query.gte('rating', minRating);
        }

        if (priceRange !== 'all') {
          const priceField = table.includes('studio') ? 'hourly_rate' : table.includes('gig') ? 'budget' : 'rate';
          if (priceRange === 'low') {
            query = query.lte(priceField, 5000);
          } else if (priceRange === 'mid') {
            query = query.gte(priceField, 5000).lte(priceField, 15000);
          } else if (priceRange === 'high') {
            query = query.gte(priceField, 15000);
          }
        }

        if (sortBy === 'rating') {
          query = query.order('rating', { ascending: false });
        } else if (sortBy === 'price_low') {
          const priceField = table.includes('studio') ? 'hourly_rate' : table.includes('gig') ? 'budget' : 'rate';
          query = query.order(priceField, { ascending: true, nullsFirst: false });
        } else if (sortBy === 'price_high') {
          const priceField = table.includes('studio') ? 'hourly_rate' : table.includes('gig') ? 'budget' : 'rate';
          query = query.order(priceField, { ascending: false, nullsFirst: false });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data: qData } = await query.range(from, to);

        const mapped = (qData || []).map((item: any) => ({
          ...item,
          type: table.includes('group') ? 'Group' : table.includes('studio') ? 'Studio' : table === 'profiles' ? 'Artist' : 'Gig',
          name: item.name || item.full_name,
          location: item.location || item.address,
          image: item.images?.[0] || item.image || item.avatar_url,
          genre: item.genre || (Array.isArray(item.genres) ? item.genres.join(', ') : ''),
          rate: (item.rate || item.hourly_rate || item.budget)?.toString(),
        }));

        results.push(...mapped);
      }

      const existingKeys = new Set<string>();
      if (!isReset) {
        dataRef.current.forEach((item: any, index: number) => {
          existingKeys.add(`${item.type || 'item'}-${item.id || index}`);
        });
      }

      const pooledMap = new Map<string, any>();
      [...spilloverRef.current, ...results].forEach((item: any, index: number) => {
        const key = `${item.type || 'item'}-${item.id || index}`;
        if (existingKeys.has(key) || pooledMap.has(key)) return;
        pooledMap.set(key, item);
      });

      const pooledResults = Array.from(pooledMap.values());
      const nextChunk = pooledResults.slice(0, PAGE_SIZE);
      const nextSpillover = pooledResults.slice(PAGE_SIZE);
      const hasNextPage = pooledResults.length >= PAGE_SIZE;

      setHasMore(hasNextPage);
      setCurrentPage(page);
      setSpillover(nextSpillover);

      if (isReset) {
        setData(nextChunk);
      } else {
        setData((prev) => [...prev, ...nextChunk]);
      }
    } catch {
      // No-op to keep current results on transient failures.
    } finally {
      if (requestId === requestIdRef.current) {
        if (isReset) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    }
  }, [activeFilter, isGuest, isOwner, minRating, priceRange, searchQuery, selectedGenre, sortBy]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSearchPage(0, 'reset');
    }, 300);
    return () => clearTimeout(timeout);
  }, [fetchSearchPage]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;

    const buffered = spilloverRef.current;
    if (buffered.length > 0) {
      const nextChunk = buffered.slice(0, PAGE_SIZE);
      const remaining = buffered.slice(PAGE_SIZE);
      setData((prev) => [...prev, ...nextChunk]);
      setSpillover(remaining);
      return;
    }

    fetchSearchPage(currentPage + 1, 'append');
  }, [currentPage, fetchSearchPage, hasMore, loading, loadingMore]);

  const renderDiscoverItem = useCallback(({ item }: { item: any }) => {
    return (
      <View style={[styles.gridItem, gridColumns > 1 && styles.gridItemWeb]}>
        <ListingCard
          item={item}
          onPress={() => {
            const listingId = item?.id != null ? String(item.id) : '';
            openListingDetails(listingId);
          }}
          variant="vertical"
          cleanMode
          showGigSummary={false}
          verticalImageHeight={isWebDesktop ? 220 : 196}
          style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
        />
      </View>
    );
  }, [gridColumns, isWebDesktop, openListingDetails]);

  const listFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 16 }}>
          <ActivityIndicator color={accentColor} />
        </View>
      );
    }

    if (!hasMore || data.length === 0) {
      return <View style={{ height: 8 }} />;
    }

    return (
      <View style={{ paddingVertical: 12 }}>
        <Text style={{ color: textSecondary, fontFamily: 'Poppins_500Medium', fontSize: 12 }}>Scroll to load more</Text>
      </View>
    );
  }, [accentColor, data.length, hasMore, loadingMore, textSecondary]);

  const renderFilterChip = useCallback((label: string, isSelected: boolean, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) => {
    return (
      <TouchableOpacity
        activeOpacity={1}
        key={label}
        onPress={onPress}
        style={[
          styles.chip,
          {
            backgroundColor: isSelected ? accentColor : surfaceBackground,
            borderColor: isSelected ? accentColor : borderSoft,
          },
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={13} color={isSelected ? '#FFFFFF' : textSecondary} style={{ marginRight: 5 }} />
        ) : null}
        <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : textPrimary }]}>{label}</Text>
      </TouchableOpacity>
    );
  }, [accentColor, borderSoft, surfaceBackground, textPrimary, textSecondary]);

  const renderListHeader = () => {
    const resultLabel = loading
      ? 'Searching...'
      : data.length === 0
        ? 'Top Results'
        : `${data.length} Result${data.length !== 1 ? 's' : ''}`;

    return (
      <>
        <View style={[styles.pageHeader, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
          <View style={styles.pageHeaderLeft}>
            <View style={[styles.pageHeaderIcon, { backgroundColor: `${accentColor}1F` }]}>
              <Ionicons name="compass" size={18} color={accentColor} />
            </View>
            <View style={styles.pageHeaderTextWrap}>
              <Text style={[styles.headerTitle, { color: textPrimary }]}>Discover</Text>
              <Text style={[styles.headerSubtitle, { color: textSecondary }]}>Find studios, open gigs, groups and artists around you.</Text>
            </View>
          </View>
          <View style={[styles.liveBadge, { backgroundColor: `${accentColor}16`, borderColor: `${accentColor}42` }]}>
            <Ionicons name="sparkles" size={12} color={accentColor} />
            <Text style={[styles.liveBadgeText, { color: accentColor }]}>Live</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, isWebDesktop && styles.webSectionCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}> 
          <View style={styles.searchRow}>
            <View style={[styles.genreSearchContainer, { backgroundColor: surfaceBackground, borderColor: borderSoft }]}> 
              <Ionicons name="search" size={20} color={textSecondary} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={isOwner ? 'Find musicians, bands...' : 'Find studios, gigs, venues...'}
                placeholderTextColor={textSecondary}
                style={[styles.searchInput, { color: textPrimary }]}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity activeOpacity={1} onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              activeOpacity={1}
              style={[
                styles.filterButton,
                {
                  backgroundColor: showFilters || activeFilterCount > 0 ? accentColor : surfaceBackground,
                  borderColor: borderSoft,
                  borderWidth: showFilters || activeFilterCount > 0 ? 0 : 1,
                },
              ]}
              onPress={toggleFilters}
            >
              <Ionicons name="options-outline" size={20} color={showFilters || activeFilterCount > 0 ? '#FFFFFF' : textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {showFilters ? (
          <View style={[styles.sectionCard, isWebDesktop && styles.webSectionCard, { backgroundColor: pageCardBackground, borderColor: borderSoft }]}>
            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { color: textPrimary }]}>Listing Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TYPE_OPTIONS.map((option) => renderFilterChip(option, activeFilter === option, () => setActiveFilter(option)))}
              </ScrollView>
            </View>

            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { color: textPrimary }]}>Genre</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {GENRE_OPTIONS.map((option) => renderFilterChip(option, selectedGenre === option, () => setSelectedGenre(option)))}
              </ScrollView>
            </View>

            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { color: textPrimary }]}>Minimum Rating</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {RATING_OPTIONS.map((option) =>
                  renderFilterChip(option.label, minRating === option.value, () => setMinRating(option.value), 'star-outline')
                )}
              </ScrollView>
            </View>

            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { color: textPrimary }]}>Price Range</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {PRICE_OPTIONS.map((option) =>
                  renderFilterChip(option.label, priceRange === option.value, () => setPriceRange(option.value), 'cash-outline')
                )}
              </ScrollView>
            </View>

            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { color: textPrimary }]}>Sort By</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SORT_OPTIONS.map((option) =>
                  renderFilterChip(option.label, sortBy === option.value, () => setSortBy(option.value), option.icon)
                )}
              </ScrollView>
            </View>

            <View style={[styles.filterActions, { borderTopColor: borderSoft }]}> 
              <TouchableOpacity
                activeOpacity={1}
                onPress={resetFilters}
                style={[styles.resetButton, { borderColor: borderSoft, backgroundColor: surfaceBackground }]}
              >
                <Text style={[styles.resetButtonText, { color: textSecondary }]}>Reset Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.resultsMetaRow}>
          <Text style={[styles.resultsLabel, { color: textSecondary }]}>{resultLabel}</Text>
          {activeFilterCount > 0 ? (
            <View style={[styles.filterCountBadge, { borderColor: `${accentColor}42`, backgroundColor: `${accentColor}16` }]}>
              <Ionicons name="options-outline" size={12} color={accentColor} />
              <Text style={[styles.filterCountText, { color: accentColor }]}> 
                {activeFilterCount} active
              </Text>
            </View>
          ) : null}
        </View>
      </>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: pageBackground }]}> 
      <View
        style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && Math.abs(nextWidth - contentWidth) > 1) {
            setContentWidth(nextWidth);
          }
        }}
      >
        <Header title="Discover" hideBackButton />

        <FlatList
          key={gridColumns > 1 ? 'discover-grid-2' : 'discover-grid-1'}
          data={loading ? [] : data}
          renderItem={renderDiscoverItem}
          keyExtractor={(item: any, index) => `${item.type || 'item'}-${item.id || index}`}
          ListHeaderComponent={renderListHeader}
          ListHeaderComponentStyle={styles.listHeader}
          ListEmptyComponent={
            loading ? (
              <View style={[styles.loadingStateCard, { borderColor: borderSoft, backgroundColor: pageCardBackground }]}> 
                <ActivityIndicator size="large" color={accentColor} />
                <Text style={[styles.loadingStateText, { color: textSecondary }]}>Finding the best matches...</Text>
              </View>
            ) : (
              <View style={[styles.emptyStateCard, { borderColor: borderSoft, backgroundColor: pageCardBackground }]}> 
                <Ionicons name="search" size={18} color={textSecondary} />
                <Text style={[styles.emptyStateText, { color: textSecondary }]}>No listings matched your search.</Text>
              </View>
            )
          }
          ListFooterComponent={listFooter}
          contentContainerStyle={[
            styles.scrollContent,
            isWebDesktop && styles.scrollContentWeb,
            { paddingBottom: 120 + insets.bottom },
          ]}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          numColumns={gridColumns}
          columnWrapperStyle={gridColumns > 1 ? styles.gridRow : undefined}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      <Navbar />

      <ListingDetailsSheet
        ref={detailsSheetRef}
        listingId={selectedListingId}
        onDismiss={() => setSelectedListingId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
  },
  pageFrameWeb: {
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  scrollContent: {
    padding: 16,
  },
  scrollContentWeb: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  listHeader: {
    marginBottom: 6,
  },
  pageHeader: {
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pageHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageHeaderTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
  },
  headerSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveBadgeText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  webSectionCard: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  genreSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins_500Medium',
    fontSize: 15,
    padding: 0,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
  },
  filterActions: {
    borderTopWidth: 1,
    marginTop: 2,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  resetButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resetButtonText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
  },
  resultsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
  },
  resultsLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  filterCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterCountText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
  },
  loadingStateCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  loadingStateText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  emptyStateCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  emptyStateText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  gridRow: {
    justifyContent: 'space-between',
    alignItems: 'stretch',
    gap: 20,
  },
  gridItem: {
    width: '100%',
    marginBottom: 24,
  },
  gridItemWeb: {
    width: '48.8%',
    minWidth: 0,
  },
});
