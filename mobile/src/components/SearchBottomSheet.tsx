import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import { router } from "expo-router";
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
  InteractionManager,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  RADIO_MINI_PLAYER_HEIGHT,
  RADIO_MINI_PLAYER_STACK_GAP,
  useRadioPlayerPresence,
} from "../context/RadioPlayerContext";
import { emitToast } from "../events/toastBus";
import { useTheme } from "../context/ThemeContext";
import { useSearchResultsQuery } from "../data/hooks";
import {
  buildSocialFollowKey,
  getListingSocialFollowTarget,
} from "../utils/socialFollow";
import { usePageLoadLogger } from "../utils/loadTimeLogger";
import { bottomSheetSpringConfig } from "../utils/motion";
import { NAVBAR_BOTTOM_OFFSET } from "./navbar";
import ListingCard from "./ListingCard";
import TrackedBottomSheetModal from "./TrackedBottomSheetModal";

const debugLog = (..._args: unknown[]) => {};

const isFabricEnabled = Boolean((globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager);

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  !isFabricEnabled &&
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

const getSearchResultKey = (item: any, index: number) => {
  const typeKey =
    typeof item?.type === "string" && item.type.length > 0 ? item.type : "item";
  const idKey =
    item?.id !== null && item?.id !== undefined && String(item.id).length > 0
      ? String(item.id)
      : String(index);

  return `${typeKey}-${idKey}`;
};

interface SearchBottomSheetProps {
  onClose?: () => void;
  onItemPress?: (listingId: string) => void;
  onProductionTeamPress?: (teamId: string) => void;
  onChat?: (item: any) => void;
  onFollowChanged?: () => void;
}

const SearchBottomSheet = forwardRef<BottomSheetModal, SearchBottomSheetProps>(
  function SearchBottomSheet(
    { onClose, onItemPress, onProductionTeamPress, onChat, onFollowChanged },
    ref,
  ) {
    const { colors, isDark } = useTheme();
    const { userRole, isGuest, userId } = useAuth();
    const insets = useSafeAreaInsets();
    const { activeStation } = useRadioPlayerPresence();
    const snapPoints = useMemo(() => ["90%"], []);
    const animationConfigs = useBottomSheetSpringConfigs(bottomSheetSpringConfig);

    // Filter Chips - safely handle null userRole
    const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
    const TYPE_FILTERS = useMemo(
      () =>
        isGuest
          ? []
          : isOwner
            ? ["All", "Musician", "Production Team"]
            : ["All", "Musician", "Studio", "Gig", "Production Team"],
      [isGuest, isOwner],
    );

    // Basic State
    const [activeFilter, setActiveFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [data, setData] = useState<any[]>([]);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const requestIdRef = useRef(0);
    const [followingKeys, setFollowingKeys] = useState<Set<string>>(new Set());
    const [followBusyByKey, setFollowBusyByKey] = useState<Record<string, boolean>>({});

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
      if (TYPE_FILTERS.length > 0 && activeFilter !== "All") count++;
      if (selectedGenre !== "All") count++;
      if (minRating > 0) count++;
      if (priceRange !== "all") count++;
      if (sortBy !== "newest") count++;
      return count;
    }, [TYPE_FILTERS.length, activeFilter, selectedGenre, minRating, priceRange, sortBy]);

    const searchResultsQuery = useSearchResultsQuery({
      activeFilter,
      enabled: false,
      isGuest,
      isOwner,
      minRating,
      pageSize: PAGE_SIZE,
      priceRange,
      query: searchQuery,
      selectedGenre,
      sortBy,
    });

    const queriedResults = useMemo(
      () =>
        (searchResultsQuery.data?.pages || []).flatMap((page: any) =>
          Array.isArray(page?.items) ? page.items : Array.isArray(page?.data) ? page.data : [],
        ),
      [searchResultsQuery.data],
    );

    useEffect(() => {
      setData(queriedResults);
      setLoading(searchResultsQuery.isLoading && queriedResults.length === 0);
      setLoadingMore(searchResultsQuery.isFetchingNextPage);
    }, [
      queriedResults,
      searchResultsQuery.isFetchingNextPage,
      searchResultsQuery.isLoading,
    ]);

    const visibleData = data;
    const hasMoreResults = Boolean(searchResultsQuery.hasNextPage);

    usePageLoadLogger({
      counts: {
        results: data.length,
      },
      details: {
        activeFilter,
        hasMore: hasMoreResults,
        queryLength: searchQuery.trim().length,
        selectedGenre,
        sortBy,
      },
      loading,
      page: "SearchBottomSheet",
      queries: { searchResults: searchResultsQuery },
      ready: !loading,
      enabled: isSheetOpen,
    });

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

    const dismissSheet = useCallback(() => {
      if (ref && typeof ref !== "function") {
        ref.current?.dismiss();
      }
    }, [ref]);

    const handleClose = useCallback(() => {
      setIsSheetOpen(false);
      setLoading(false);
      setLoadingMore(false);
      Keyboard.dismiss();
      onClose?.();
    }, [onClose]);

    const handleSheetChange = useCallback((index: number) => {
      const nextOpen = index >= 0;
      setIsSheetOpen(nextOpen);

      if (!nextOpen) {
        setLoading(false);
        setLoadingMore(false);
      } else if (data.length === 0) {
        setLoading(true);
      }
    }, [data.length]);

    // Toggle filter panel with animation
    const toggleFilters = useCallback(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowFilters((prev) => !prev);
    }, []);

    // Reset all filters
    const resetFilters = useCallback(() => {
      setActiveFilter("All");
      setSelectedGenre("All");
      setMinRating(0);
      setPriceRange("all");
      setSortBy("newest");
    }, []);

    // Search effect with filters
    const fetchSearchPage = useCallback(
      async (mode: "reset" | "append") => {
        const isReset = mode === "reset";
        const requestId = ++requestIdRef.current;

        if (isReset) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        try {
          if (isReset) {
            await searchResultsQuery.refetch();
          } else if (searchResultsQuery.hasNextPage) {
            await searchResultsQuery.fetchNextPage();
          }
        } finally {
          if (requestId === requestIdRef.current) {
            setLoading(false);
            setLoadingMore(false);
          }
        }
      },
      [
        searchResultsQuery.fetchNextPage,
        searchResultsQuery.hasNextPage,
        searchResultsQuery.refetch,
      ],
    );

    useEffect(() => {
      if (!isSheetOpen) {
        return;
      }

      const timeout = setTimeout(() => {
        fetchSearchPage("reset");
      }, 300);

      return () => clearTimeout(timeout);
    }, [
      activeFilter,
      fetchSearchPage,
      isGuest,
      isOwner,
      isSheetOpen,
      minRating,
      priceRange,
      searchQuery,
      selectedGenre,
      sortBy,
    ]);

    // Search invalidation is handled by the shared RootLayout query channel.

    const handleItemPress = useCallback(
      (item: any) => {
        const listingId = item?.id;
        if (!listingId) return;

        dismissSheet();

        InteractionManager.runAfterInteractions(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (item?.type === "Production") {
                if (onProductionTeamPress) {
                  onProductionTeamPress(listingId);
                  return;
                }

                router.push({ pathname: "/production_team", params: { teamId: listingId } });
                return;
              }

              onItemPress?.(listingId);
            }, 220);
          });
        });
      },
      [dismissSheet, onItemPress, onProductionTeamPress],
    );

    const clearSearch = () => setSearchQuery("");

    const getFollowTarget = useCallback(
      (item: any) => getListingSocialFollowTarget(item, userId),
      [userId],
    );

    const loadFollowingKeys = useCallback(async () => {
      if (isGuest || !userId) {
        setFollowingKeys(new Set());
        return;
      }

      try {
        const { data: followingResponse, error } = await supabase.functions.invoke("manage-social-feed", {
          body: { action: "get_following" },
        });

        if (error) {
          throw error;
        }

        const nextFollowedKeys = new Set<string>(
          (Array.isArray(followingResponse?.data) ? followingResponse.data : [])
            .map((row: any) =>
              buildSocialFollowKey(row?.followed_type, row?.followed_id),
            )
            .filter((value: string) => value.length > 0),
        );

        setFollowingKeys(nextFollowedKeys);
      } catch {
        // Keep existing follow state when lookup fails.
      }
    }, [isGuest, userId]);

    useEffect(() => {
      loadFollowingKeys();
    }, [loadFollowingKeys]);

    const handleChatPress = useCallback(
      (item: any) => {
        // Dismiss the modal first, then trigger chat
        // @ts-ignore
        dismissSheet();
        // Small delay to let modal close
        setTimeout(() => {
          onChat?.(item);
        }, 100);
      },
      [dismissSheet, onChat],
    );

    const handleFollowToggle = useCallback(
      async (item: any) => {
        const target = getFollowTarget(item);
        if (!target || isGuest) {
          return;
        }

        const targetKey = buildSocialFollowKey(target.type, target.id);

        if (!targetKey || followBusyByKey[targetKey]) {
          return;
        }

        const wasFollowing = followingKeys.has(targetKey);
        setFollowBusyByKey((prev) => ({ ...prev, [targetKey]: true }));
        setFollowingKeys((prev) => {
          const next = new Set(prev);
          if (wasFollowing) {
            next.delete(targetKey);
          } else {
            next.add(targetKey);
          }
          return next;
        });

        try {
          const { error } = await supabase.functions.invoke("manage-social-feed", {
            body: {
              action: wasFollowing ? "unfollow" : "follow",
              target_id: target.id,
              target_type: target.type,
            },
          });

          if (error) {
            throw error;
          }

          emitToast({
            type: "success",
            title: wasFollowing ? "Unfollowed" : "Following",
            message: "",
          });

          onFollowChanged?.();
        } catch (error: any) {
          setFollowingKeys((prev) => {
            const next = new Set(prev);
            if (wasFollowing) {
              next.add(targetKey);
            } else {
              next.delete(targetKey);
            }
            return next;
          });

          emitToast({
            type: "error",
            title: "Follow failed",
            message: error?.message || "Please try again.",
          });
        } finally {
          setFollowBusyByKey((prev) => {
            const next = { ...prev };
            delete next[targetKey];
            return next;
          });
        }
      },
      [followBusyByKey, followingKeys, getFollowTarget, isGuest, onFollowChanged],
    );

    const renderItem = useCallback(
      ({ item }: { item: any }) => {
        const followTarget = getFollowTarget(item);
        const followKey = followTarget
          ? buildSocialFollowKey(followTarget.type, followTarget.id)
          : "";
        const canFollow = Boolean(followKey) && !isGuest;
        const isFollowing = followKey ? followingKeys.has(followKey) : false;
        const isFollowBusy = followKey ? followBusyByKey[followKey] === true : false;

        return (
          <View style={styles.resultCardWrap}>
            <ListingCard
              item={item}
              onPress={handleItemPress}
              onChat={onChat ? handleChatPress : undefined}
              showGigSummary={false}
              variant="feed"
              style={{ width: "100%" }}
              actionSlot={
                canFollow ? (
                  <TouchableOpacity
                    activeOpacity={1}
                    disabled={isFollowBusy}
                    onPress={() => handleFollowToggle(item)}
                    style={[
                      styles.followBadgeBtn,
                      {
                        backgroundColor: isFollowing ? (isDark ? "#111827" : "#FFFFFF") : colors.primary,
                        borderColor: isFollowing ? (isDark ? "#374151" : "#CBD5E1") : colors.primary,
                        opacity: isFollowBusy ? 0.7 : 1,
                      },
                    ]}
                  >
                    {isFollowBusy ? (
                      <ActivityIndicator size="small" color={isFollowing ? colors.textSecondary : "#FFFFFF"} />
                    ) : (
                      <Text
                        style={[
                          styles.followBadgeText,
                          { color: isFollowing ? colors.textSecondary : "#FFFFFF" },
                        ]}
                      >
                        {isFollowing ? "Following" : "Follow"}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : null
              }
            />
          </View>
        );
      },
      [
        colors.primary,
        colors.textSecondary,
        followBusyByKey,
        followingKeys,
        getFollowTarget,
        handleChatPress,
        handleFollowToggle,
        handleItemPress,
        isDark,
        isGuest,
        onChat,
      ],
    );

    const keyExtractor = useCallback(
      (item: any, index: number) => getSearchResultKey(item, index),
      [],
    );

    const itemSeparator = useCallback(() => <View style={{ height: 10 }} />, []);

    const handleLoadMore = useCallback(() => {
      if (loading || loadingMore || !hasMoreResults) return;

      void searchResultsQuery.fetchNextPage();
    }, [hasMoreResults, loading, loadingMore, searchResultsQuery.fetchNextPage]);

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
          {TYPE_FILTERS.length > 0 && (
            <View style={styles.filterSection}>
              <Text style={[styles.filterLabel, { color: colors.text }]}>
                Type
              </Text>
              <View style={styles.filterRow}>
                {TYPE_FILTERS.map((filter) => (
                  <TouchableOpacity activeOpacity={1}
                    key={filter}
                    style={[
                      styles.filterChip,
                      activeFilter === filter
                        ? { backgroundColor: colors.primary }
                        : { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                    ]}
                    onPress={() => setActiveFilter(filter)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        activeFilter === filter
                          ? { color: "#FFF" }
                          : { color: isDark ? "#D1D5DB" : "#4B5563" },
                      ]}
                    >
                      {filter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

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
      activeFilter,
      colors,
      isDark,
      isOwner,
      TYPE_FILTERS,
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
              Search
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
                        ? "Find musicians and teams..."
                        : "Find musicians, studios, gigs, and teams..."
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
      <TrackedBottomSheetModal
        ref={ref}
        overlayLabel="SearchBottomSheet"
        index={0}
        snapPoints={snapPoints}
        animationConfigs={animationConfigs}
        animateOnMount={true}
        enableDynamicSizing={false}
        enableContentPanningGesture={false}
        enableOverDrag={false}
        backdropComponent={renderBackdrop}
        onChange={handleSheetChange}
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
              { paddingHorizontal: 16 },
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
      </TrackedBottomSheetModal>
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
    lineHeight: 20,
    height: 24,
    padding: 0,
    includeFontPadding: false,
    textAlignVertical: "center",
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
  resultCardWrap: {
    position: "relative",
  },
  followBadgeBtn: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  followBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: "center",
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

