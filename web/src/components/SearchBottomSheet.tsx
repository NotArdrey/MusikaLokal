import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    useBottomSheetTimingConfigs,
} from "@gorhom/bottom-sheet";
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from "react-native";
import { Easing } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import ListingCard from "./ListingCard";

const debugLog = (..._args: unknown[]) => {};

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Filter Constants
const GENRE_OPTIONS = [
  "All",
  "Rock",
  "Jazz",
  "Indie Pop",
  "Acoustic",
  "Electronic",
  "OPM",
  "Classical",
  "R&B",
  "Hip Hop",
];
const RATING_OPTIONS = [
  { label: "All", value: 0 },
  { label: "3+", value: 3 },
  { label: "4+", value: 4 },
  { label: "4.5+", value: 4.5 },
];
const PRICE_OPTIONS = [
  { label: "All", value: "all" },
  { label: "₱0-5K", value: "low" },
  { label: "₱5K-15K", value: "mid" },
  { label: "₱15K+", value: "high" },
];
const SORT_OPTIONS = [
  { label: "Newest", value: "newest", icon: "time-outline" },
  { label: "Top Rated", value: "rating", icon: "star-outline" },
  { label: "Price ↑", value: "price_low", icon: "arrow-up-outline" },
  { label: "Price ↓", value: "price_high", icon: "arrow-down-outline" },
];

const PAGE_SIZE = 10;

interface SearchBottomSheetProps {
  onClose?: () => void;
  onItemPress?: (listingId: string) => void;
  onChat?: (item: any) => void;
}

const SearchBottomSheet = forwardRef<BottomSheetModal, SearchBottomSheetProps>(
  function SearchBottomSheet({ onClose, onItemPress, onChat }, ref) {
    const { colors, isDark } = useTheme();
    const { userRole, isGuest } = useAuth();
    const snapPoints = useMemo(() => ["90%"], []);
    const animationConfigs = useBottomSheetTimingConfigs({
      duration: 320,
      easing: Easing.inOut(Easing.cubic),
    });

    // Filter Chips - safely handle null userRole
    const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
    const TYPE_FILTERS = useMemo(
      () =>
        isGuest
          ? []
          : isOwner
            ? ["All", "Musician"]
            : ["All", "Musician", "Studio", "Gig"],
      [isGuest, isOwner],
    );

    // Basic State
    const [activeFilter, setActiveFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [spillover, setSpillover] = useState<any[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const requestIdRef = useRef(0);
    const dataRef = useRef<any[]>([]);
    const spilloverRef = useRef<any[]>([]);

    // Advanced Filter State
    const [showFilters, setShowFilters] = useState(false);
    const [selectedGenre, setSelectedGenre] = useState("All");
    const [minRating, setMinRating] = useState(0);
    const [priceRange, setPriceRange] = useState<
      "all" | "low" | "mid" | "high"
    >("all");
    const [sortBy, setSortBy] = useState<
      "newest" | "rating" | "price_low" | "price_high"
    >("newest");

    // Count active filters (excluding defaults)
    const activeFilterCount = useMemo(() => {
      let count = 0;
      if (selectedGenre !== "All") count++;
      if (minRating > 0) count++;
      if (priceRange !== "all") count++;
      if (sortBy !== "newest") count++;
      return count;
    }, [selectedGenre, minRating, priceRange, sortBy]);

    useEffect(() => {
      dataRef.current = data;
    }, [data]);

    useEffect(() => {
      spilloverRef.current = spillover;
    }, [spillover]);

    const visibleData = data;
    const hasMoreResults = hasMore || spillover.length > 0;

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.4}
        />
      ),
      [],
    );

    const handleClose = useCallback(() => {
      Keyboard.dismiss();
      onClose?.();
    }, [onClose]);

    // Toggle filter panel with animation
    const toggleFilters = useCallback(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowFilters((prev) => !prev);
    }, []);

    // Reset all filters
    const resetFilters = useCallback(() => {
      setSelectedGenre("All");
      setMinRating(0);
      setPriceRange("all");
      setSortBy("newest");
    }, []);

    // Search effect with filters
    const fetchSearchPage = useCallback(
      async (page: number, mode: "reset" | "append") => {
        const isReset = mode === "reset";
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
          const fetchedCountsByTable = new Map<string, number>();

          if (isGuest) {
            tables = ["groups_with_stats", "profiles"];
          } else if (isOwner) {
            tables = ["groups_with_stats"];
          } else {
            if (activeFilter === "All") {
              tables = ["groups_with_stats", "studios_with_stats", "gigs_with_stats"];
            } else if (activeFilter === "Musician") {
              tables = ["groups_with_stats"];
            } else if (activeFilter === "Studio") {
              tables = ["studios_with_stats"];
            } else if (activeFilter === "Gig") {
              tables = ["gigs_with_stats"];
            }
          }

          for (const table of tables) {
            const tablePageSize = PAGE_SIZE;

            let query = supabase.from(table).select("*");

            if (table === "profiles") {
              query = query
                .select(
                  "id, full_name, avatar_url, address, created_at, role, genres, skills, show_gig_statuses",
                )
                .eq("role", "musician");
            }

            if (searchQuery.trim().length > 0) {
              if (table === "profiles") {
                query = query.or(
                  `full_name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`,
                );
              } else {
                query = query.or(
                  `name.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`,
                );
              }
            }

            if (table === "gigs_with_stats") {
              query = query.eq("status", "open");
            }

            if (
              selectedGenre !== "All" &&
              (table === "groups_with_stats" || table === "gigs_with_stats")
            ) {
              query = query.ilike("genre", `%${selectedGenre}%`);
            }

            if (minRating > 0) {
              query = query.gte("rating", minRating);
            }

            if (priceRange !== "all") {
              const priceField = table.includes("studio")
                ? "hourly_rate"
                : table.includes("gig")
                  ? "budget"
                  : "rate";

              if (priceRange === "low") {
                query = query.lte(priceField, 5000);
              } else if (priceRange === "mid") {
                query = query.gte(priceField, 5000).lte(priceField, 15000);
              } else if (priceRange === "high") {
                query = query.gte(priceField, 15000);
              }
            }

            if (sortBy === "rating") {
              query = query.order("rating", { ascending: false });
            } else if (sortBy === "price_low") {
              const priceField = table.includes("studio")
                ? "hourly_rate"
                : table.includes("gig")
                  ? "budget"
                  : "rate";
              query = query.order(priceField, {
                ascending: true,
                nullsFirst: false,
              });
            } else if (sortBy === "price_high") {
              const priceField = table.includes("studio")
                ? "hourly_rate"
                : table.includes("gig")
                  ? "budget"
                  : "rate";
              query = query.order(priceField, {
                ascending: false,
                nullsFirst: false,
              });
            } else {
              query = query.order("created_at", { ascending: false });
            }

            const from = page * tablePageSize;
            const to = from + tablePageSize - 1;
            const { data: qData } = await query.range(from, to);
            const fetchedCount = qData?.length || 0;
            fetchedCountsByTable.set(table, fetchedCount);

            if (qData) {
              const type = table.includes("group")
                ? "Group"
                : table.includes("studio")
                  ? "Studio"
                  : table === "profiles"
                    ? "Artist"
                    : "Gig";

              const mapped = qData.map((item: any) => ({
                ...item,
                type,
                studio_type:
                  type === "Studio"
                    ? item.type || item.studio_type || null
                    : item.studio_type || null,
                name: item.name || item.full_name,
                location: item.location || item.address,
                image: item.images?.[0] || item.image || item.avatar_url,
                genre:
                  item.genre ||
                  (Array.isArray(item.genres) ? item.genres.join(", ") : ""),
                rate: (item.rate || item.hourly_rate || item.budget)?.toString(),
                show_gig_statuses: item.show_gig_statuses,
              }));

              const genreFiltered =
                selectedGenre !== "All" && table === "profiles"
                  ? mapped.filter((item: any) =>
                      String(item.genre || "")
                        .toLowerCase()
                        .includes(selectedGenre.toLowerCase()),
                    )
                  : mapped;

              results.push(...genreFiltered);
            }
          }

          const groupIds = Array.from(
            new Set(
              results
                .filter((item) => item.type === "Group" && item.id)
                .map((item) => item.id),
            ),
          );

          if (groupIds.length > 0) {
            const { data: groupVisibilityRows } = await supabase
              .from("groups")
              .select("id, open_group_applications")
              .in("id", groupIds);

            const visibilityMap = new Map<string, boolean>();
            (groupVisibilityRows || []).forEach((row: any) => {
              visibilityMap.set(row.id, row.open_group_applications !== false);
            });

            results = results.map((item) =>
              item.type === "Group"
                ? {
                    ...item,
                    open_group_applications:
                      visibilityMap.get(item.id) ??
                      item.open_group_applications !== false,
                  }
                : item,
            );
          }

          if (sortBy === "rating") {
            results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
          } else if (sortBy === "price_low") {
            results.sort((a, b) => {
              const aPrice = parseFloat(a.rate?.replace(/,/g, "") || "0");
              const bPrice = parseFloat(b.rate?.replace(/,/g, "") || "0");
              return aPrice - bPrice;
            });
          } else if (sortBy === "price_high") {
            results.sort((a, b) => {
              const aPrice = parseFloat(a.rate?.replace(/,/g, "") || "0");
              const bPrice = parseFloat(b.rate?.replace(/,/g, "") || "0");
              return bPrice - aPrice;
            });
          }

          if (requestId !== requestIdRef.current) {
            return;
          }

          const hasNextPage = tables.some(
            (table) => (fetchedCountsByTable.get(table) || 0) === PAGE_SIZE,
          );

          const existingKeys = new Set<string>();
          if (!isReset) {
            dataRef.current.forEach((item: any, index: number) => {
              existingKeys.add(`${item.type || "item"}-${item.id || index}`);
            });
          }

          const pooledMap = new Map<string, any>();
          [...spilloverRef.current, ...results].forEach((item: any, index: number) => {
            const key = `${item.type || "item"}-${item.id || index}`;
            if (existingKeys.has(key) || pooledMap.has(key)) {
              return;
            }
            pooledMap.set(key, item);
          });

          const pooledResults = Array.from(pooledMap.values());
          const nextChunk = pooledResults.slice(0, PAGE_SIZE);
          const nextSpillover = pooledResults.slice(PAGE_SIZE);

          setHasMore(hasNextPage);
          setCurrentPage(page);
          setSpillover(nextSpillover);

          if (isReset) {
            setData(nextChunk);
          } else {
            setData((prev) => [...prev, ...nextChunk]);
          }
        } catch (e) {
          debugLog("Search error:", e);
        } finally {
          if (requestId === requestIdRef.current) {
            if (isReset) {
              setLoading(false);
            } else {
              setLoadingMore(false);
            }
          }
        }
      },
      [
        activeFilter,
        isGuest,
        isOwner,
        minRating,
        priceRange,
        searchQuery,
        selectedGenre,
        sortBy,
      ],
    );

    useEffect(() => {
      const timeout = setTimeout(() => {
        fetchSearchPage(0, "reset");
      }, 300);

      return () => clearTimeout(timeout);
    }, [fetchSearchPage, refreshTrigger]);

    // Realtime Search Updates
    useEffect(() => {
      const channel = supabase.channel("public:search_updates");

      const realtimeTables = [
        "gigs",
        "studios",
        "groups",
        "profiles",
        "studio_promotions",
        "studio_date_overrides",
        "profile_skills",
        "profile_genres",
        "group_media",
        "studio_media",
        "gig_media",
        "reviews",
      ];

      realtimeTables.forEach((table) => {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => setRefreshTrigger((prev) => prev + 1),
        );
      });

      channel.subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, []);

    const handleItemPress = useCallback(
      (item: any) => {
        // Dismiss first for smoother transition to details sheet
        // @ts-ignore
        ref?.current?.dismiss();
        setTimeout(() => {
          onItemPress?.(item.id);
        }, 120);
      },
      [onItemPress, ref],
    );

    const clearSearch = () => setSearchQuery("");

    const handleChatPress = useCallback(
      (item: any) => {
        // Dismiss the modal first, then trigger chat
        // @ts-ignore
        ref?.current?.dismiss();
        // Small delay to let modal close
        setTimeout(() => {
          onChat?.(item);
        }, 100);
      },
      [onChat, ref],
    );

    const renderItem = useCallback(
      ({ item }: { item: any }) => (
        <ListingCard
          item={item}
          onPress={handleItemPress}
          onChat={onChat ? handleChatPress : undefined}
          showGigSummary={false}
          variant="vertical"
          style={{ width: "100%" }}
        />
      ),
      [handleItemPress, handleChatPress, onChat],
    );

    const keyExtractor = useCallback(
      (item: any, index: number) => item.id?.toString?.() || String(index),
      [],
    );

    const itemSeparator = useCallback(() => <View style={{ height: 24 }} />, []);

    const handleLoadMore = useCallback(() => {
      if (loading || loadingMore || !hasMoreResults) return;

      const buffered = spilloverRef.current;
      if (buffered.length > 0) {
        const nextChunk = buffered.slice(0, PAGE_SIZE);
        const remaining = buffered.slice(PAGE_SIZE);
        setData((prev) => [...prev, ...nextChunk]);
        setSpillover(remaining);
        return;
      }

      fetchSearchPage(currentPage + 1, "append");
    }, [currentPage, fetchSearchPage, hasMoreResults, loading, loadingMore]);

    const listFooter = useMemo(() => {
      if (loadingMore) {
        return (
          <View style={styles.paginationFooter}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        );
      }

      if (!hasMoreResults || data.length === 0) {
        return <View style={styles.paginationFooterSpacer} />;
      }

      return (
        <View style={styles.paginationFooter}>
          <Text style={[styles.paginationText, { color: colors.textSecondary }]}>
            Scroll to load more
          </Text>
        </View>
      );
    }, [colors.primary, colors.textSecondary, data.length, hasMoreResults, loadingMore]);

    const resultsLabelText = useMemo(() => {
      if (data.length === 0) return "Top Results";
      if (hasMoreResults) {
        return `${data.length}+ Result${data.length !== 1 ? "s" : ""}`;
      }
      return `${data.length} Result${data.length !== 1 ? "s" : ""}`;
    }, [data.length, hasMoreResults]);

    // Filter Section Component
    const renderFilterSection = useMemo(() => {
      if (!showFilters) return null;

      return (
        <View
          style={[
            styles.filterPanel,
            {
              backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
              borderColor: isDark ? "#374151" : "#E5E7EB",
            },
          ]}
        >
          {/* Genre Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>
              Genre
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsScroll}
            >
              {GENRE_OPTIONS.map((genre) => (
                <TouchableOpacity activeOpacity={1}
                  key={genre}
                  style={[
                    styles.filterChip,
                    selectedGenre === genre
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                  ]}
                  onPress={() => setSelectedGenre(genre)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedGenre === genre
                        ? { color: "#FFF" }
                        : { color: isDark ? "#D1D5DB" : "#4B5563" },
                    ]}
                  >
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Rating Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>
              Min Rating
            </Text>
            <View style={styles.filterRow}>
              {RATING_OPTIONS.map((option) => (
                <TouchableOpacity activeOpacity={1}
                  key={option.value}
                  style={[
                    styles.filterChip,
                    minRating === option.value
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                  ]}
                  onPress={() => setMinRating(option.value)}
                >
                  {option.value > 0 && (
                    <Ionicons
                      name="star"
                      size={12}
                      color={minRating === option.value ? "#FFF" : "#FBBF24"}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.filterChipText,
                      minRating === option.value
                        ? { color: "#FFF" }
                        : { color: isDark ? "#D1D5DB" : "#4B5563" },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Price Range Filter */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>
              Price Range
            </Text>
            <View style={styles.filterRow}>
              {PRICE_OPTIONS.map((option) => (
                <TouchableOpacity activeOpacity={1}
                  key={option.value}
                  style={[
                    styles.filterChip,
                    priceRange === option.value
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                  ]}
                  onPress={() => setPriceRange(option.value as any)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      priceRange === option.value
                        ? { color: "#FFF" }
                        : { color: isDark ? "#D1D5DB" : "#4B5563" },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Sort By */}
          <View style={styles.filterSection}>
            <Text style={[styles.filterLabel, { color: colors.text }]}>
              Sort By
            </Text>
            <View style={styles.filterRow}>
              {SORT_OPTIONS.map((option) => (
                <TouchableOpacity activeOpacity={1}
                  key={option.value}
                  style={[
                    styles.filterChip,
                    sortBy === option.value
                      ? { backgroundColor: colors.primary }
                      : { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                  ]}
                  onPress={() => setSortBy(option.value as any)}
                >
                  <Ionicons
                    name={option.icon as any}
                    size={14}
                    color={
                      sortBy === option.value
                        ? "#FFF"
                        : isDark
                          ? "#D1D5DB"
                          : "#4B5563"
                    }
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      sortBy === option.value
                        ? { color: "#FFF" }
                        : { color: isDark ? "#D1D5DB" : "#4B5563" },
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Reset Button */}
          {activeFilterCount > 0 && (
            <TouchableOpacity activeOpacity={1}
              style={[styles.resetButton, { borderColor: colors.primary }]}
              onPress={resetFilters}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={[styles.resetButtonText, { color: colors.primary }]}>
                Reset Filters
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }, [
      showFilters,
      colors,
      isDark,
      selectedGenre,
      minRating,
      priceRange,
      sortBy,
      activeFilterCount,
      resetFilters,
    ]);

    // Header Component
    const renderHeader = useMemo(
      () => (
        <View style={{ backgroundColor: colors.background }}>
          <View style={styles.headerContainer}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              Discover
            </Text>

            <View style={{ flexDirection: "column", gap: 8 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={[
                    styles.searchContainer,
                    {
                      flex: 1,
                      backgroundColor: isDark ? "#374151" : "#F3F4F6",
                      borderColor: "transparent",
                    },
                  ]}
                >
                  <Ionicons
                    name="search"
                    size={20}
                    color={colors.textSecondary}
                  />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder={
                      isOwner
                        ? "Find musicians, bands..."
                        : "Find studios, gigs, venues..."
                    }
                    placeholderTextColor={colors.textSecondary}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity activeOpacity={1}
                      onPress={clearSearch}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filter Button */}
                <TouchableOpacity activeOpacity={1}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor:
                        showFilters || activeFilterCount > 0
                          ? colors.primary
                          : isDark
                            ? "#374151"
                            : "#F3F4F6",
                    },
                  ]}
                  onPress={toggleFilters}
                >
                  <Ionicons
                    name="options-outline"
                    size={20}
                    color={
                      showFilters || activeFilterCount > 0
                        ? "#FFF"
                        : colors.textSecondary
                    }
                  />
                  {activeFilterCount > 0 && (
                    <View style={styles.filterBadge}>
                      <Text style={styles.filterBadgeText}>
                        {activeFilterCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {activeFilterCount > 0 ? (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    marginLeft: 4,
                    fontFamily: "Poppins_400Regular",
                  }}
                >
                  {`${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} applied`}
                </Text>
              ) : null}
            </View>

            {/* Type Filter Chips */}
            {!isOwner && TYPE_FILTERS.length > 0 && (
              <View style={styles.chipsRow}>
                {TYPE_FILTERS.map((filter) => {
                  const isActive = filter === activeFilter;
                  return (
                    <TouchableOpacity
                      key={filter}
                      style={[
                        styles.chip,
                        isActive
                          ? { backgroundColor: colors.primary, borderWidth: 0 }
                          : {
                              backgroundColor: isDark ? "#374151" : "#F3F4F6",
                              borderWidth: 0,
                            },
                      ]}
                      onPress={() => setActiveFilter(filter)}
                      activeOpacity={1}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          isActive
                            ? { color: "#FFF" }
                            : { color: isDark ? "#D1D5DB" : "#4B5563" },
                        ]}
                      >
                        {filter}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Filter Panel */}
          {renderFilterSection}

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text
            style={[
              styles.resultsLabel,
              { color: colors.textSecondary },
              !showFilters && activeFilterCount === 0 && styles.resultsLabelCompact,
            ]}
          >
            {resultsLabelText}
          </Text>
        </View>
      ),
      [
        colors,
        isDark,
        searchQuery,
        activeFilter,
        isOwner,
        TYPE_FILTERS,
        showFilters,
        activeFilterCount,
        toggleFilters,
        renderFilterSection,
        resultsLabelText,
      ],
    );

    const ListEmptyComponent = useMemo(
      () => (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconContainer,
              { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={32}
              color={colors.textSecondary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No results found
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            {activeFilterCount > 0
              ? "Try adjusting your filters or search terms."
              : `We couldn't find anything for "${searchQuery}".\nTry adjusting your search terms.`}
          </Text>
          {activeFilterCount > 0 && (
            <TouchableOpacity activeOpacity={1}
              style={[
                styles.clearFiltersBtn,
                { backgroundColor: colors.primary },
              ]}
              onPress={resetFilters}
            >
              <Text style={styles.clearFiltersBtnText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      ),
      [colors, isDark, searchQuery, activeFilterCount, resetFilters],
    );

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        animationConfigs={animationConfigs}
        animateOnMount={true}
        enableDynamicSizing={false}
        enableContentPanningGesture={false}
        enableOverDrag={false}
        backdropComponent={renderBackdrop}
        onDismiss={handleClose}
        backgroundStyle={{
          backgroundColor: colors.background,
          borderRadius: 32,
        }}
        handleIndicatorStyle={{
          backgroundColor: isDark ? "#4B5563" : "#E5E7EB",
          width: 40,
          marginTop: 10,
        }}
        enablePanDownToClose
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        {renderHeader}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={visibleData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ItemSeparatorComponent={itemSeparator}
            ListEmptyComponent={ListEmptyComponent}
            ListFooterComponent={listFooter}
            contentContainerStyle={[
              styles.listContent,
              { paddingHorizontal: 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={40}
            windowSize={5}
            nestedScrollEnabled
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.35}
            removeClippedSubviews={Platform.OS === "android"}
          />
        )}
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  headerContainer: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
    padding: 0,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#EF4444",
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Poppins_600SemiBold",
  },
  filterPanel: {
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChipsScroll: {
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
  },
  filterChipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
    marginTop: 4,
  },
  resetButtonText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 0,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  chipText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  divider: {
    height: 1,
    width: "100%",
    opacity: 0.1,
  },
  listContent: {
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 50,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  clearFiltersBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  clearFiltersBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  resultsLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    marginHorizontal: 24,
    marginTop: 24,
  },
  resultsLabelCompact: {
    marginTop: 2,
    marginBottom: 8,
  },
  paginationFooter: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  paginationFooterSpacer: {
    height: 12,
  },
  paginationText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
});

export default SearchBottomSheet;

