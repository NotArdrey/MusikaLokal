import { Ionicons } from "@expo/vector-icons";
import {
    BottomSheetBackdrop,
    BottomSheetModal,
    useBottomSheetTimingConfigs,
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
import { Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../context/AuthContext";
import {
  RADIO_MINI_PLAYER_HEIGHT,
  RADIO_MINI_PLAYER_STACK_GAP,
  useRadioPlayerPresence,
} from "../context/RadioPlayerContext";
import { showTopToast } from "../context/TopToastContext";
import { useTheme } from "../context/ThemeContext";
import {
  buildSocialFollowKey,
  getListingSocialFollowTarget,
} from "../utils/socialFollow";
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

const getSearchResultTimestamp = (item: any) => {
  const rawValue = item?.created_at;
  if (!rawValue) return 0;

  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const interleaveSearchResultsByType = (items: any[]) => {
  if (!Array.isArray(items) || items.length <= 1) {
    return items;
  }

  const buckets = new Map<string, any[]>();

  items.forEach((item) => {
    const typeKey = String(item?.type || "Unknown");
    const bucket = buckets.get(typeKey);
    if (bucket) {
      bucket.push(item);
      return;
    }

    buckets.set(typeKey, [item]);
  });

  const orderedTypes = Array.from(buckets.keys());
  const output: any[] = [];

  while (output.length < items.length) {
    let addedItem = false;

    for (const typeKey of orderedTypes) {
      const bucket = buckets.get(typeKey);
      if (!bucket || bucket.length === 0) {
        continue;
      }

      output.push(bucket.shift());
      addedItem = true;
    }

    if (!addedItem) {
      break;
    }
  }

  return output;
};

const collectProfileValues = (rows: any[] | null | undefined, valueKey: string) => {
  const valueMap = new Map<string, string[]>();

  (rows || []).forEach((row: any) => {
    const profileId = row?.profile_id;
    const rawValue = row?.[valueKey];
    if (typeof profileId !== "string" || typeof rawValue !== "string") {
      return;
    }

    const nextValue = rawValue.trim();
    if (!nextValue) {
      return;
    }

    const existingValues = valueMap.get(profileId);
    if (existingValues) {
      existingValues.push(nextValue);
      return;
    }

    valueMap.set(profileId, [nextValue]);
  });

  return valueMap;
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
    const animationConfigs = useBottomSheetTimingConfigs({
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });

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
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [spillover, setSpillover] = useState<any[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const requestIdRef = useRef(0);
    const dataRef = useRef<any[]>([]);
    const spilloverRef = useRef<any[]>([]);
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

    const dismissSheet = useCallback(() => {
      if (ref && typeof ref !== "function") {
        ref.current?.dismiss();
      }
    }, [ref]);

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
      setActiveFilter("All");
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
            if (activeFilter === "All") {
              tables = ["groups_with_stats", "profiles", "production_teams"];
            } else if (activeFilter === "Musician") {
              tables = ["groups_with_stats", "profiles"];
            } else if (activeFilter === "Production Team") {
              tables = ["production_teams"];
            }
          } else {
            if (activeFilter === "All") {
              tables = ["groups_with_stats", "profiles", "studios_with_stats", "gigs_with_stats", "production_teams"];
            } else if (activeFilter === "Musician") {
              tables = ["groups_with_stats", "profiles"];
            } else if (activeFilter === "Studio") {
              tables = ["studios_with_stats"];
            } else if (activeFilter === "Gig") {
              tables = ["gigs_with_stats"];
            } else if (activeFilter === "Production Team") {
              tables = ["production_teams"];
            }
          }

          for (const table of tables) {
            const tablePageSize = PAGE_SIZE;

            let query = supabase.from(table).select("*");

            if (table === "profiles") {
              query = query
                .select(
                  "id, full_name, avatar_url, address, created_at, role, show_gig_statuses",
                )
                .eq("role", "musician");
            }

            if (table === "producer_projects_with_summary") {
              query = query.eq("status", "published");
            }

            if (table === "production_teams") {
              query = query.select("id, owner_id, name, description, logo_url, created_at, updated_at");
            }

            if (searchQuery.trim().length > 0) {
              if (table === "profiles") {
                query = query.or(
                  `full_name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`,
                );
              } else if (table === "producer_projects_with_summary") {
                query = query.or(
                  `title.ilike.%${searchQuery}%,genre.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`,
                );
              } else if (table === "production_teams") {
                query = query.or(
                  `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`,
                );
              } else {
                query = query.or(
                  `name.ilike.%${searchQuery}%,location.ilike.%${searchQuery}%`,
                );
              }
            }

            if (table === "gigs_with_stats") {
              query = query.eq("status", "open");
              query = query.eq("permit_status", "approved");
            }

            if (table === "studios_with_stats") {
              query = query.eq("permit_status", "approved");
            }

            if (
              selectedGenre !== "All" &&
              (table === "groups_with_stats" || table === "gigs_with_stats" || table === "producer_projects_with_summary")
            ) {
              query = query.ilike("genre", `%${selectedGenre}%`);
            }

            if (minRating > 0 && table !== "profiles" && table !== "production_teams") {
              query = query.gte("rating", minRating);
            }

            if (priceRange !== "all" && table !== "profiles" && table !== "production_teams") {
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

            if (sortBy === "rating" && table !== "profiles" && table !== "production_teams") {
              query = query.order("rating", { ascending: false });
            } else if (sortBy === "price_low" && table !== "profiles" && table !== "production_teams") {
              const priceField = table.includes("studio")
                ? "hourly_rate"
                : table.includes("gig")
                  ? "budget"
                  : "rate";
              query = query.order(priceField, {
                ascending: true,
                nullsFirst: false,
              });
            } else if (sortBy === "price_high" && table !== "profiles" && table !== "production_teams") {
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
              let profileGenresById = new Map<string, string[]>();
              let profileSkillsById = new Map<string, string[]>();
              let profileStatsById = new Map<string, { rating: number; review_count: number; completion_rate: number | null }>();
              let ownerAvatarById = new Map<string, string>();

              if (table === "profiles" && qData.length > 0) {
                const profileIds = qData
                  .map((item: any) => item?.id)
                  .filter((value: any): value is string => typeof value === "string" && value.length > 0);

                if (profileIds.length > 0) {
                  const [{ data: profileGenreRows }, { data: profileSkillRows }, { data: profileStatRows }] = await Promise.all([
                    supabase
                      .from("profile_genres")
                      .select("profile_id, genre")
                      .in("profile_id", profileIds),
                    supabase
                      .from("profile_skills")
                      .select("profile_id, skill")
                      .in("profile_id", profileIds),
                    supabase
                      .from("profiles_with_stats")
                      .select("id, rating, review_count, completion_rate")
                      .in("id", profileIds),
                  ]);

                  profileGenresById = collectProfileValues(profileGenreRows, "genre");
                  profileSkillsById = collectProfileValues(profileSkillRows, "skill");
                  profileStatsById = new Map(
                    (profileStatRows || [])
                      .filter((row: any) => typeof row?.id === "string")
                      .map((row: any) => [
                        row.id,
                        {
                          rating: Number(row?.rating || 0),
                          review_count: Number(row?.review_count || 0),
                          completion_rate: Number.isFinite(Number(row?.completion_rate))
                            ? Number(row.completion_rate)
                            : null,
                        },
                      ]),
                  );
                }
              }

              if (
                ["groups_with_stats", "studios_with_stats", "gigs_with_stats", "production_teams"].includes(table) &&
                qData.length > 0
              ) {
                const ownerIds = Array.from(
                  new Set(
                    qData
                      .map((item: any) => item?.owner_id || item?.organizer_id)
                      .filter((value: any): value is string => typeof value === "string" && value.length > 0),
                  ),
                );

                if (ownerIds.length > 0) {
                  const { data: ownerRows } = await supabase
                    .from("profiles")
                    .select("id, avatar_url")
                    .in("id", ownerIds);

                  (ownerRows || []).forEach((row: any) => {
                    if (typeof row?.id === "string" && typeof row?.avatar_url === "string" && row.avatar_url.length > 0) {
                      ownerAvatarById.set(row.id, row.avatar_url);
                    }
                  });
                }
              }

              const type = table.includes("group")
                ? "Group"
                : table.includes("studio")
                  ? "Studio"
                  : table === "profiles"
                    ? "Artist"
                    : table.includes("producer_project")
                      ? "Project"
                      : table === "production_teams"
                        ? "Production"
                        : "Gig";

              const mapped = qData.map((item: any) => ({
                ...item,
                type,
                social_follow_target_id:
                  table === "groups_with_stats"
                    ? item.id
                    : table === "profiles"
                    ? item.id
                    : typeof item.owner_id === "string" && item.owner_id.length > 0
                      ? item.owner_id
                      : typeof item.organizer_id === "string" && item.organizer_id.length > 0
                        ? item.organizer_id
                        : null,
                social_follow_target_type:
                  table === "groups_with_stats" ? "group" : "profile",
                studio_type:
                  type === "Studio"
                    ? item.type || item.studio_type || null
                    : item.studio_type || null,
                genres: table === "profiles" ? profileGenresById.get(item.id) || [] : item.genres,
                skills: table === "profiles" ? profileSkillsById.get(item.id) || [] : item.skills,
                rating:
                  table === "profiles"
                    ? profileStatsById.get(item.id)?.rating || 0
                    : Number(item.rating || 0),
                review_count:
                  table === "profiles"
                    ? profileStatsById.get(item.id)?.review_count || 0
                    : Number(item.review_count || 0),
                completion_rate:
                  table === "profiles"
                    ? profileStatsById.get(item.id)?.completion_rate ?? null
                    : item.completion_rate,
                name: item.name || item.full_name || item.title,
                location: item.location || item.address || item.description,
                image: item.images?.[0] || item.image || item.avatar_url || item.logo_url || item.cover_image_url,
                owner_avatar_url:
                  ownerAvatarById.get(item.owner_id || item.organizer_id) || null,
                genre:
                  item.genre ||
                  (table === "profiles"
                    ? (profileGenresById.get(item.id) || []).join(", ")
                    : Array.isArray(item.genres)
                      ? item.genres.join(", ")
                      : ""),
                rate: (item.rate || item.hourly_rate || item.budget || item.budget_range)?.toString(),
                show_gig_statuses: item.show_gig_statuses,
              }));

              let filteredResults =
                selectedGenre !== "All" && table === "profiles"
                  ? mapped.filter((item: any) =>
                      String(item.genre || "")
                        .toLowerCase()
                        .includes(selectedGenre.toLowerCase()),
                    )
                  : mapped;

              if (minRating > 0 && table === "profiles") {
                filteredResults = filteredResults.filter(
                  (item: any) => Number(item.rating || 0) >= minRating,
                );
              }

              results.push(...filteredResults);
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
              visibilityMap.set(row.id, row.open_group_applications === true);
            });

            results = results.map((item) =>
              item.type === "Group"
                ? {
                    ...item,
                    open_group_applications:
                      visibilityMap.get(item.id) ??
                      item.open_group_applications === true,
                  }
                : item,
            );
          }

          // Fetch active promotions for studios
          const studioIds = Array.from(
            new Set(
              results
                .filter((item) => item.type === "Studio" && item.id)
                .map((item) => item.id),
            ),
          );

          if (studioIds.length > 0) {
            const todayStr = new Date().toISOString().split("T")[0];
            const { data: studioPromos } = await supabase
              .from("studio_promotions")
              .select("studio_id")
              .in("studio_id", studioIds)
              .eq("is_active", true)
              .or(`is_permanent.eq.true,and(start_date.lte.${todayStr},end_date.gte.${todayStr})`);

            if (studioPromos) {
              const promoStudioIds = new Set(studioPromos.map((p: any) => p.studio_id));
              results = results.map((item) =>
                item.type === "Studio"
                  ? { ...item, has_active_promotion: promoStudioIds.has(item.id) }
                  : item,
              );
            }
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
          } else {
            results.sort((a, b) => {
              const timestampDelta =
                getSearchResultTimestamp(b) - getSearchResultTimestamp(a);
              if (timestampDelta !== 0) {
                return timestampDelta;
              }

              return String(a.name || "").localeCompare(String(b.name || ""));
            });
          }

          if (
            sortBy === "newest" &&
            results.some((item) => item.type === "Artist") &&
            results.some((item) => item.type === "Group")
          ) {
            results = interleaveSearchResultsByType(results);
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
        "production_teams",
        "production_team_members",
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
        const listingId = item?.id;
        if (!listingId) return;

        dismissSheet();

        InteractionManager.runAfterInteractions(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (item?.type === "Project") {
                router.push({ pathname: "/producer_project_details", params: { project_id: listingId } });
                return;
              }

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

          showTopToast({
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

          showTopToast({
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
              variant="vertical"
              style={{ width: "100%", marginBottom: 0 }}
              actionSlot={
                canFollow ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
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
    padding: 0,
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
    height: 24,
    minWidth: 70,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  followBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
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

