import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import CustomAlert from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ListingCard from "../src/components/ListingCard";
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import Navbar from "../src/components/navbar";
import { ProfileCompletionBanner } from "../src/components/ProfileCompletionBanner";
import RecentlyViewedSheet from "../src/components/RecentlyViewedSheet";
import SearchBottomSheet from "../src/components/SearchBottomSheet";
import { useTheme } from "../src/context/ThemeContext";
import {
  getGeminiFlashLiteInfo,
  rerankHomeFeedWithGeminiFlashLite,
} from "../src/services/groqModelRouter";

const { width, height } = Dimensions.get("window");

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scaleWidth = Math.min(width, 600); // Clamp width to prevent massive scaling on web
const scale = (size: number) => {
  const newSize = (scaleWidth / 375) * size;
  return Math.max(newSize, size * 0.85); // Minimum 85% of original size
};
const verticalScale = (size: number) => {
  // Use more conservative scaling for height to prevent over-shrinking on small devices
  const baseHeight = 812;
  const ratio = height / baseHeight;
  // Clamp ratio between 0.8 and 1.1 to prevent extreme scaling
  const clampedRatio = Math.max(0.8, Math.min(1.1, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor; // Reduced factor from 0.5 to 0.3 for less aggressive scaling
};

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

const debugLog = (..._args: unknown[]) => {};

const clampValue = (value: number, min = 0, max = 1) => {
  return Math.max(min, Math.min(max, value));
};

const normalizeSignal = (value: unknown) => {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const uniqueNormalizedSignals = (values: unknown[]) => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = normalizeSignal(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
};

const scoreFreshness = (createdAt: unknown) => {
  if (typeof createdAt !== "string") return 0.35;

  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0.35;

  const ageDays = Math.max(0, (Date.now() - created) / (1000 * 60 * 60 * 24));
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 90) return 0.55;
  return 0.35;
};

const buildOnDeviceReason = (
  skillMatches: string[],
  genreMatches: string[],
  itemType: string,
) => {
  if (skillMatches.length > 0 && genreMatches.length > 0) {
    return `Matches your ${skillMatches[0]} skills and ${genreMatches[0]} taste.`;
  }
  if (skillMatches.length > 0) {
    return `Recommended because of your ${skillMatches[0]} background.`;
  }
  if (genreMatches.length > 0) {
    return `Popular among ${genreMatches[0]} listeners and creators.`;
  }
  if (itemType === "Gig") {
    return "Trending opportunity with strong current engagement.";
  }
  return "Strong overall quality and relevance right now.";
};

const isGroqQuotaExhaustedMessage = (message: string | null | undefined) => {
  if (!message) return false;
  return /out of api calls|rate limit|too many requests|insufficient[_ -]?quota|quota|credits|\b429\b/i.test(
    message,
  );
};

const rankForYouOnDevice = (
  candidates: any[],
  profileSignals: { skills: string[]; genres: string[] },
  limit: number,
) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const normalizedSkills = uniqueNormalizedSignals(profileSignals.skills);
  const normalizedGenres = uniqueNormalizedSignals(profileSignals.genres);
  const hasUserSignals = normalizedSkills.length > 0 || normalizedGenres.length > 0;
  const safeLimit = Math.max(1, Math.min(limit || 20, candidates.length));

  const ranked = candidates
    .map((item: any) => {
      const searchableText = normalizeSignal(
        `${item.name || ""} ${item.genre || ""} ${item.location || ""} ${item.type || ""} ${item.group_type || ""}`,
      );
      const itemGenres = uniqueNormalizedSignals(
        typeof item.genre === "string" ? item.genre.split(",") : [],
      );

      const skillMatches = normalizedSkills.filter((skill) => searchableText.includes(skill));
      const genreMatches = normalizedGenres.filter(
        (genre) => searchableText.includes(genre) || itemGenres.includes(genre),
      );

      const skillScore = normalizedSkills.length > 0
        ? clampValue(skillMatches.length / Math.min(3, normalizedSkills.length))
        : 0;
      const genreScore = normalizedGenres.length > 0
        ? clampValue(genreMatches.length / Math.min(3, normalizedGenres.length))
        : 0;
      const popularityScore = clampValue(Number(item.rating || 0) / 5);
      const freshnessScore = scoreFreshness(item.created_at);

      const blendedScore = hasUserSignals
        ? (skillScore * 0.4 + genreScore * 0.35 + popularityScore * 0.2 + freshnessScore * 0.05)
        : (popularityScore * 0.7 + freshnessScore * 0.3);

      const aiScore = Math.round(clampValue(blendedScore) * 100);

      return {
        ...item,
        similarity: aiScore / 100,
        aiReason: buildOnDeviceReason(skillMatches, genreMatches, item.type || "listing"),
      };
    })
    .sort((a, b) => {
      const similarityDelta = Number(b.similarity || 0) - Number(a.similarity || 0);
      if (similarityDelta !== 0) return similarityDelta;
      return Number(b.rating || 0) - Number(a.rating || 0);
    });

  return takeItemsWithTypeVariety(ranked, safeLimit);
};

const ResponsiveList = ({ children, style, contentContainerStyle, snapToInterval, ...props }: any) => {
  const { width } = useWindowDimensions();
  if (Platform.OS === 'web' && width >= 768) {
    return (
      <View
        style={[
          {
            width: '100%',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            gap: 16,
          },
          style,
          contentContainerStyle,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      decelerationRate="fast"
      snapToInterval={snapToInterval}
      {...props}
    >
      {children}
    </ScrollView>
  );
};

const getTypeBadgeColor = (type: string) => {
  switch (type) {
    case "Studio":
      return "#7C3AED";
    case "Gig":
      return "#10B981";
    case "Group":
      return "#3B82F6";
    case "Artist":
      return "#EC4899";
    default:
      return "#7C3AED";
  }
};

const takeItemsWithTypeVariety = (items: any[], limit: number) => {
  if (!Array.isArray(items) || limit <= 0) {
    return [];
  }

  const buckets = new Map<string, any[]>();

  items.forEach((item) => {
    const typeKey = String(item?.type || "Unknown");
    const existingBucket = buckets.get(typeKey);
    if (existingBucket) {
      existingBucket.push(item);
      return;
    }

    buckets.set(typeKey, [item]);
  });

  const orderedTypes = Array.from(buckets.keys());
  const output: any[] = [];

  while (output.length < limit) {
    let addedItem = false;

    for (const typeKey of orderedTypes) {
      const bucket = buckets.get(typeKey);
      if (!bucket || bucket.length === 0) {
        continue;
      }

      output.push(bucket.shift());
      addedItem = true;

      if (output.length >= limit) {
        break;
      }
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

const HOME_FOCUS_REFRESH_COOLDOWN_MS = 20_000;
const HOME_AI_RERANK_COOLDOWN_MS = 5 * 60 * 1000;
const HOME_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const VIEWED_NEW_ARRIVALS_STORAGE_KEY = "viewed_new_arrivals";

type HomeAiSessionCachePayload = {
  userId: string;
  updatedAt: number;
  recommendations: any[];
  aiFeedProvider: string;
  aiFeedMessage: string;
};

let homeAiSessionCache: HomeAiSessionCachePayload | null = null;

const AutoCardImage = ({
  image,
  images,
  style,
  width,
  height,
  quality = 72,
  cacheVersion,
  intervalMs = 3200,
}: {
  image?: string | null;
  images?: string[];
  style: any;
  width?: number;
  height?: number;
  quality?: number;
  cacheVersion?: string | number | Date;
  intervalMs?: number;
}) => {
  const imageList = useMemo(() => {
    const raw = [
      ...(Array.isArray(images) ? images : []),
      ...(image ? [image] : []),
    ].filter((uri) => typeof uri === "string" && uri.length > 0);

    return Array.from(new Set(raw));
  }, [image, images]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    if (imageList.length <= 1) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % imageList.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [imageList, intervalMs]);

  if (imageList.length === 0) {
    return null;
  }

  return (
    <CachedImage
      uri={imageList[activeIndex]}
      style={style}
      width={width}
      height={height}
      quality={quality}
      cacheVersion={cacheVersion}
    />
  );
};

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const pageBackground = isWebDesktop
    ? isDark
      ? "#0A1224"
      : "#E9EEF8"
    : colors.background;
  const webCardBackground = isWebDesktop
    ? isDark
      ? "#0F172A"
      : "#FFFFFF"
    : isDark
      ? "#1F2937"
      : "#FFFFFF";
  const webTextColor = isWebDesktop
    ? isDark
      ? "#E2E8F0"
      : "#0F172A"
    : colors.text;
  const webTextSecondary = isWebDesktop
    ? isDark
      ? "#94A3B8"
      : "#475569"
    : colors.textSecondary;
  const { userRole, userId, isGuest } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reopenListingId?: string }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featured, setFeatured] = useState<any[]>([]);
  const [discover, setDiscover] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]); // New Arrivals State
  const [viewedNewArrivals, setViewedNewArrivals] = useState<Set<string>>(new Set());
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]); // Upcoming Events State (for musicians)
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [userName, setUserName] = useState("Guest");
  const [timeGreeting, setTimeGreeting] = useState("Hey");
  const geminiInfo = getGeminiFlashLiteInfo();
  const geminiModelLabel = geminiInfo.modelLabel;

  // AI Recommendation Mode
  const [aiModeEnabled, setAiModeEnabled] = useState(true);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [randomRecommendations, setRandomRecommendations] = useState<any[]>([]);
  const [aiFeedProvider, setAiFeedProvider] = useState(geminiModelLabel);
  const [aiFeedMessage, setAiFeedMessage] = useState("");

  // ... refs ...
  const bottomSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const searchSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const recentlyViewedSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const restoreSearchAfterDetailsCloseRef = React.useRef(false);
  const homeRealtimeRefreshTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeDataFetchInFlightRef = React.useRef(false);
  const homeLlmRequestIdRef = React.useRef(0);
  const homeLlmRerankInFlightRef = React.useRef(false);
  const lastHomeRefreshAtRef = React.useRef(0);
  const lastHomeAiRerankAtRef = React.useRef(0);
  const lastProfileRefreshAtRef = React.useRef(0);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const [pendingReopenListingId, setPendingReopenListingId] = useState<
    string | null
  >(null);

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
    buttons?: any[];
  }>({ type: "info", title: "", message: "" });

  // Scroll State for Sticky Header
  const [isScrolled, setIsScrolled] = useState(false);

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

  // Safe handler for opening search sheet - prevents reanimated timing issues
  const openSearchSheet = useCallback(() => {
    presentModalWithRetry(searchSheetRef as any);
  }, [presentModalWithRetry]);

  // Safe handler for opening details sheet
  const openDetailsSheet = useCallback(() => {
    presentModalWithRetry(bottomSheetRef as any);
  }, [presentModalWithRetry]);

  const openListingDetails = useCallback(
    (
      listingId: string,
      options?: {
        restoreSearchOnClose?: boolean;
      },
    ) => {
      restoreSearchAfterDetailsCloseRef.current =
        options?.restoreSearchOnClose === true;
      setSelectedListingId(listingId);
      openDetailsSheet();
    },
    [openDetailsSheet],
  );

  const handleListingDetailsDismiss = useCallback(() => {
    if (!restoreSearchAfterDetailsCloseRef.current) {
      return;
    }

    restoreSearchAfterDetailsCloseRef.current = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        openSearchSheet();
      });
    });
  }, [openSearchSheet]);

  useEffect(() => {
    if (!pendingReopenListingId) return;
    if (selectedListingId !== pendingReopenListingId) return;

    let attempts = 0;
    const maxAttempts = 10;

    const presentWhenReady = () => {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.present();
        setPendingReopenListingId(null);
        return;
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(presentWhenReady, 60);
      } else {
        setPendingReopenListingId(null);
      }
    };

    const interactionTask = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          presentWhenReady();
        });
      });
    });

    return () => {
      interactionTask.cancel();
    };
  }, [pendingReopenListingId, selectedListingId]);

  // Safe handler for opening recently viewed sheet
  const openRecentlyViewedSheet = useCallback(() => {
    presentModalWithRetry(recentlyViewedSheetRef as any);
  }, [presentModalWithRetry]);

  // Effect to update featured/discover when AI recommendations become available
  useEffect(() => {
    if (aiModeEnabled && aiRecommendations.length > 0) {
      debugLog("🤖 Switching to AI recommendations");
      const diversifiedAiItems = takeItemsWithTypeVariety(aiRecommendations, 20);
      setFeatured(diversifiedAiItems.slice(0, 10));
      setDiscover(diversifiedAiItems.slice(10, 20));
    } else if (!aiModeEnabled && randomRecommendations.length > 0) {
      debugLog("🎲 Switching to random recommendations");
      const diversifiedRandomItems = takeItemsWithTypeVariety(randomRecommendations, 20);
      setFeatured(diversifiedRandomItems.slice(0, 10));
      setDiscover(diversifiedRandomItems.slice(10, 20));
    }
  }, [aiModeEnabled, aiRecommendations, randomRecommendations]);

  useEffect(() => {
    if (!userId || !homeAiSessionCache) {
      return;
    }

    if (homeAiSessionCache.userId !== userId) {
      return;
    }

    if (Date.now() - homeAiSessionCache.updatedAt > HOME_AI_RERANK_COOLDOWN_MS) {
      return;
    }

    setAiRecommendations(homeAiSessionCache.recommendations);
    setAiFeedProvider(homeAiSessionCache.aiFeedProvider || geminiModelLabel);
    setAiFeedMessage(homeAiSessionCache.aiFeedMessage || "");
    lastHomeAiRerankAtRef.current = homeAiSessionCache.updatedAt;
  }, [geminiModelLabel, userId]);

  useFocusEffect(
    useCallback(() => {
      debugLog("👁️ useFocusEffect triggered, userRole:", userRole);
      // Fetch data silently on focus if data already exists
      const isFirstLoad = featured.length === 0 && discover.length === 0;
      debugLog("🏠 isFirstLoad:", isFirstLoad);
      const shouldRefreshHome =
        isFirstLoad ||
        Date.now() - lastHomeRefreshAtRef.current >= HOME_FOCUS_REFRESH_COOLDOWN_MS;
      const shouldRefreshProfile =
        Boolean(userId) &&
        (
          lastProfileRefreshAtRef.current === 0 ||
          Date.now() - lastProfileRefreshAtRef.current >= HOME_PROFILE_CACHE_TTL_MS
        );

      if (shouldRefreshHome) {
        void fetchHomeData(isFirstLoad);
      }

      if (shouldRefreshProfile) {
        void fetchUserProfile();
      }
      fetchRecentlyViewed();
      fetchUpcomingEvents(); // Fetch upcoming events for musicians
      setTimeBasedGreeting();

      // Load which New Arrivals have already been viewed
      void AsyncStorage.getItem(VIEWED_NEW_ARRIVALS_STORAGE_KEY).then(json => {
        if (json) setViewedNewArrivals(new Set(JSON.parse(json)));
      }).catch(() => {});

      const reopenListingId = Array.isArray(params.reopenListingId)
        ? params.reopenListingId[0]
        : params.reopenListingId;

      if (reopenListingId && reopenListingId.length > 0) {
        setSelectedListingId(reopenListingId);
        setPendingReopenListingId(reopenListingId);
        setTimeout(() => {
          router.setParams({ reopenListingId: undefined as any });
        }, 250);
      }

      const restorePendingReopen = async () => {
        const storedListingId = await AsyncStorage.getItem(
          "pending_reopen_listing_id",
        );

        if (storedListingId && storedListingId.length > 0) {
          setSelectedListingId(storedListingId);
          setPendingReopenListingId(storedListingId);
          await AsyncStorage.removeItem("pending_reopen_listing_id");
        }
      };

      void restorePendingReopen();
    }, [discover.length, featured.length, params.reopenListingId, userId, userRole]),
  );

  // Handler for realtime updates - defined before useEffect that uses it
  const handleRealtimeUpdate = useCallback(() => {
    debugLog("Realtime update received - refreshing home data...");
    if (homeRealtimeRefreshTimerRef.current) return;

    homeRealtimeRefreshTimerRef.current = setTimeout(() => {
      homeRealtimeRefreshTimerRef.current = null;
      // Silent refresh to keep UI stable during realtime bursts.
      void fetchHomeData(false, { bypassCooldown: true });
    }, 450);
  }, [userRole, userId]);

  // Realtime Updates
  useEffect(() => {
    const channel = supabase.channel("public:home_updates");

    const realtimeTables = [
      "gigs",
      "studios",
      "studio_types",
      "studio_amenities",
      "studio_instruments",
      "studio_settings",
      "studio_operating_hours",
      "groups",
      "profiles",
      "gig_applications",
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
        () => handleRealtimeUpdate(),
      );
    });

    channel.subscribe();

    return () => {
      if (homeRealtimeRefreshTimerRef.current) {
        clearTimeout(homeRealtimeRefreshTimerRef.current);
        homeRealtimeRefreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [handleRealtimeUpdate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchHomeData(false, { bypassCooldown: true }),
      fetchUserProfile({ force: true }),
      fetchRecentlyViewed(),
      fetchUpcomingEvents(),
    ]);
    setRefreshing(false);
  }, [userRole, userId, isGuest]);

  const setTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setTimeGreeting("Good morning");
    else if (hour < 18) setTimeGreeting("Good afternoon");
    else setTimeGreeting("Good evening");
  };

  const [hasGroups, setHasGroups] = useState(false);

  const topItems = useMemo(() => {
    const combined = [...featured, ...discover];
    const dedupedCombined = combined.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id),
    );

    return takeItemsWithTypeVariety(dedupedCombined, 12);
  }, [featured, discover]);

  const uniqueSmartFeedItems = useMemo(() => {
    const allItems = [...featured, ...discover];
    return allItems.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id),
    );
  }, [featured, discover]);

  const aiPreviewItems = useMemo(
    () => aiRecommendations.slice(0, 4),
    [aiRecommendations],
  );

  const hasAiSimilarityMatches = useMemo(
    () => aiRecommendations.some((i: any) => i.similarity > 0.1),
    [aiRecommendations],
  );

  const fetchUserProfile = async (options?: { force?: boolean }) => {
    if (
      !options?.force &&
      lastProfileRefreshAtRef.current > 0 &&
      Date.now() - lastProfileRefreshAtRef.current < HOME_PROFILE_CACHE_TTL_MS
    ) {
      return;
    }

    try {
      let user;
      if (userId) {
        // Use userId from context first
        user = { id: userId };
      } else {
        // Fallback to auth
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        user = authUser;
      }

      if (!user) return;

      // Fetch Profile Name
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      if (data?.full_name) {
        setUserName(data.full_name.split(" ")[0]);
      }

      // Fetch Group Status (for UI warnings)
      const { count } = await supabase
        .from("groups")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      setHasGroups(count ? count > 0 : false);
      lastProfileRefreshAtRef.current = Date.now();
    } catch (e) {
      debugLog("Error fetching user profile:", e);
    }
  };

  const fetchHomeData = async (
    showLoading = true,
    options?: { bypassCooldown?: boolean },
  ) => {
    debugLog("🏠 fetchHomeData called, showLoading:", showLoading);
    if (homeDataFetchInFlightRef.current) {
      return;
    }

    if (
      !showLoading &&
      !options?.bypassCooldown &&
      lastHomeRefreshAtRef.current > 0 &&
      Date.now() - lastHomeRefreshAtRef.current < HOME_FOCUS_REFRESH_COOLDOWN_MS
    ) {
      return;
    }

    homeDataFetchInFlightRef.current = true;
    if (showLoading) setLoading(true);
    try {
      // Fetch based on Role
      // If Owner, ONLY fetch groups (musicians)
      let groups: any[] = [];
      let studios: any[] = [];
      let gigs: any[] = [];
      let soloArtists: any[] = [];

      const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
      debugLog("🏠 User role:", userRole, "isOwner:", isOwner);

      const classifyGigBucket = (gig: any): "active" | "upcoming" | "done" => {
        const eventDate = gig?.event_date ? new Date(gig.event_date) : null;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (gig?.status === "closed" || gig?.status === "cancelled") {
          return "done";
        }

        if (!eventDate || isNaN(eventDate.getTime())) {
          return "upcoming";
        }

        if (eventDate < todayStart) {
          return "done";
        }

        if (eventDate.toDateString() === now.toDateString()) {
          return "active";
        }

        return "upcoming";
      };

      // Always fetch groups (musicians)
      const { data: gData, error: gError } = await supabase
        .from("groups_with_stats")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (gError) debugLog("❌ Error fetching groups:", gError);
      groups = gData || [];
      debugLog("🏠 Groups fetched:", groups.length);

      // Fetch Solo Artists (Musicians who haven't created a group, or just all musicians)
      // We assume 'musician' role in profiles
      const { data: pData, error: pError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, avatar_url, address, created_at, role, show_gig_statuses",
        )
        .eq("role", "musician")
        .order("created_at", { ascending: false })
        .limit(20);
      if (pError) debugLog("❌ Error fetching profiles:", pError);

      const profileIds = (pData || [])
        .map((artist: any) => artist?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0);

      let profileGenresById = new Map<string, string[]>();
      let profileSkillsById = new Map<string, string[]>();

      if (profileIds.length > 0) {
        const [{ data: profileGenreRows }, { data: profileSkillRows }] = await Promise.all([
          supabase
            .from("profile_genres")
            .select("profile_id, genre")
            .in("profile_id", profileIds),
          supabase
            .from("profile_skills")
            .select("profile_id, skill")
            .in("profile_id", profileIds),
        ]);

        profileGenresById = collectProfileValues(profileGenreRows, "genre");
        profileSkillsById = collectProfileValues(profileSkillRows, "skill");
      }

      soloArtists = (pData || []).map((artist: any) => ({
        ...artist,
        genres: profileGenresById.get(artist.id) || [],
        skills: profileSkillsById.get(artist.id) || [],
      }));
      debugLog("🏠 Solo artists fetched:", soloArtists.length);

      const groupOwnerPreferenceMap = new Map<string, boolean>();
      const groupOpenApplicationsMap = new Map<string, boolean>();
      const groupGigCountsMap = new Map<string, { active: number; upcoming: number; done: number }>();
      const soloGigCountsMap = new Map<string, { active: number; upcoming: number; done: number }>();

      const groupOwnerIds = Array.from(
        new Set((groups || []).map((group: any) => group.owner_id).filter(Boolean)),
      );

      if (groupOwnerIds.length > 0) {
        const { data: ownerPrefs } = await supabase
          .from("profiles")
          .select("id, show_gig_statuses")
          .in("id", groupOwnerIds);

        (ownerPrefs || []).forEach((row: any) => {
          groupOwnerPreferenceMap.set(row.id, row.show_gig_statuses !== false);
        });
      }

      const groupIds = Array.from(
        new Set((groups || []).map((group: any) => group.id).filter(Boolean)),
      );

      if (groupIds.length > 0) {
        const { data: groupVisibilityRows } = await supabase
          .from("groups")
          .select("id, open_group_applications")
          .in("id", groupIds);

        (groupVisibilityRows || []).forEach((row: any) => {
          groupOpenApplicationsMap.set(row.id, row.open_group_applications !== false);
        });
      }

      if (groupIds.length > 0) {
        const { data: groupApplications } = await supabase
          .from("gig_applications")
          .select("group_id, gigs(event_date,status)")
          .eq("status", "accepted")
          .in("group_id", groupIds);

        (groupApplications || []).forEach((application: any) => {
          const groupId = application.group_id;
          if (!groupId) return;

          const existing = groupGigCountsMap.get(groupId) || {
            active: 0,
            upcoming: 0,
            done: 0,
          };

          const bucket = classifyGigBucket(application.gigs);
          existing[bucket] += 1;
          groupGigCountsMap.set(groupId, existing);
        });
      }

      const soloArtistIds = Array.from(
        new Set((soloArtists || []).map((artist: any) => artist.id).filter(Boolean)),
      );
      if (soloArtistIds.length > 0) {
        const { data: soloApplications } = await supabase
          .from("gig_applications")
          .select("applicant_id, gigs(event_date,status)")
          .eq("status", "accepted")
          .is("group_id", null)
          .in("applicant_id", soloArtistIds);

        (soloApplications || []).forEach((application: any) => {
          const applicantId = application.applicant_id;
          if (!applicantId) return;

          const existing = soloGigCountsMap.get(applicantId) || {
            active: 0,
            upcoming: 0,
            done: 0,
          };

          const bucket = classifyGigBucket(application.gigs);
          existing[bucket] += 1;
          soloGigCountsMap.set(applicantId, existing);
        });
      }

      // All signed-in users can see studios in Home.
      if (!isGuest) {
        const { data: sData, error: sError } = await supabase
          .from("studios_with_stats")
          .select("*")
          .eq("permit_status", "approved")
          .order("created_at", { ascending: false })
          .limit(20);
        if (sError) debugLog("Error fetching studios:", sError);
        studios = sData || [];
        debugLog("🏠 Studios fetched:", studios.length);

        // Fetch date overrides to calculate has_special_dates for each studio
        if (studios.length > 0) {
          const studioIds = studios.map((s: any) => s.id);
          const today = new Date().toISOString().split("T")[0];
          const { data: dateOverrides, error: overridesError } = await supabase
            .from("studio_date_overrides")
            .select("studio_id")
            .in("studio_id", studioIds)
            .gte("override_date", today);

          if (!overridesError && dateOverrides) {
            const studioDateOverridesMap: { [key: string]: boolean } = {};
            dateOverrides.forEach((override: any) => {
              studioDateOverridesMap[override.studio_id] = true;
            });
            // Augment studios with has_special_dates flag
            studios = studios.map((studio: any) => ({
              ...studio,
              has_special_dates: studioDateOverridesMap[studio.id] || false,
            }));
            debugLog("🏠 Studios augmented with date overrides");
          }
        }
      }

      // Gigs remain musician-facing content in Home.
      if (!isOwner && !isGuest) {
        const { data: gigData, error: gigError } = await supabase
          .from("gigs_with_stats")
          .select("*")
          .eq("status", "open") // Only show open gigs to musicians
          .eq("permit_status", "approved")
          .order("created_at", { ascending: false })
          .limit(20);
        if (gigError) debugLog("Error fetching gigs:", gigError);
        gigs = gigData || [];
        debugLog(
          `📱 Fetched ${gigs.length} open gigs for role: ${userRole}`,
        );
      } else {
        debugLog(
          `📱 Skipping gigs fetch - user is owner (role: ${userRole})`,
        );
      }

      // Normalize
      const normalize = (items: any[], type: string) =>
        items.map((item) => ({
          id: item.id,
          type,
          name: item.name || item.full_name, // Handle profile name
          image: item.images?.[0] || item.avatar_url || null, // Handle profile avatar
          images: item.images || (item.avatar_url ? [item.avatar_url] : []),
          rating: item.rating || 0, // Solo artists might not have ratings yet
          review_count: item.review_count || 0,
          completion_rate: item.completion_rate,
          // Explicitly pass rate fields
          hourly_rate: item.hourly_rate?.toString(),
          budget: item.budget?.toString(),
          rate:
            item.rate ||
            item.hourly_rate?.toString() ||
            item.budget?.toString(),
          // Studio-specific pricing fields
          rehearsal_rate: item.rehearsal_rate?.toString(),
          recording_rate: item.recording_rate?.toString(),
          // For studios, item.type contains the studio type ("Rehearsal", "Recording", "Both")
          studio_type: type === "Studio" ? item.type : null,
          location: item.location || item.address || "",
          amenities: item.amenities || [],
          experience_level: item.requirements?.experience_level || null,
          // Pass full requirements for gigs (includes slots data)
          requirements: item.requirements || null,
          // Event date for gigs
          event_date: item.event_date || null,
          embedding: item.embedding, // Profiles might have interest_vector but listing card uses embedding
          created_at: item.created_at, // Added for New Arrivals
          updated_at: item.updated_at,
          genre: item.genres?.join(", ") || item.genre || "", // For solo artists
          group_type: item.group_type || null,
          // Owner/Organizer IDs for chat functionality
          // For profiles (solo artists), the id IS the owner
          owner_id: item.owner_id || (type === "Artist" ? item.id : null),
          organizer_id: item.organizer_id || null,
          active_gigs:
            type === "Group"
              ? groupGigCountsMap.get(item.id)?.active || 0
              : type === "Artist"
                ? soloGigCountsMap.get(item.id)?.active || 0
                : 0,
          upcoming_gigs:
            type === "Group"
              ? groupGigCountsMap.get(item.id)?.upcoming || 0
              : type === "Artist"
                ? soloGigCountsMap.get(item.id)?.upcoming || 0
                : 0,
          done_gigs:
            type === "Group"
              ? groupGigCountsMap.get(item.id)?.done || 0
              : type === "Artist"
                ? soloGigCountsMap.get(item.id)?.done || 0
                : 0,
          show_gig_statuses:
            type === "Group"
              ? groupOwnerPreferenceMap.get(item.owner_id) !== false
              : type === "Artist"
                ? item.show_gig_statuses !== false
                : true,
          open_group_applications:
            type === "Group"
              ? groupOpenApplicationsMap.get(item.id) ?? item.open_group_applications !== false
              : undefined,
          // Seasonal pricing fields for studios
          has_seasonal_pricing: item.has_seasonal_pricing || false,
          has_special_dates: item.has_special_dates || false,
          lead_time_hours: item.lead_time_hours || 24,
          weekend_multiplier: item.weekend_multiplier || 1.0,
          peak_season_multiplier: item.peak_season_multiplier || 1.0,
          off_peak_multiplier: item.off_peak_multiplier || 1.0,
        }));

      const allGroups = normalize(groups, "Group");
      const allStudios = normalize(studios, "Studio");
      const allGigs = normalize(gigs, "Gig");
      const allSoloArtists = normalize(soloArtists, "Artist"); // Use 'Artist' for solo

      const allItemsList = isGuest
        ? [...allGroups, ...allSoloArtists]
        : [...allGroups, ...allSoloArtists, ...allStudios, ...allGigs];
      debugLog(
        `📊 Total items: ${allItemsList.length} (Groups: ${allGroups.length}, Solo: ${allSoloArtists.length}, Studios: ${allStudios.length}, Gigs: ${allGigs.length})`,
      );

      // === NEW ARRIVALS - Simple: Just sort by created_at and take top 10 ===
      const sortedByDate = [...allItemsList].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Newest first
      });

      debugLog(
        "🆕 Setting New Arrivals:",
        sortedByDate.length,
        "items available",
      );
      setNewArrivals(takeItemsWithTypeVariety(sortedByDate, 10));

      // === RANDOM RECOMMENDATIONS - Simple random shuffle ===
      const shuffled = [...allItemsList].sort(() => Math.random() - 0.5);
      const diversifiedRandomItems = takeItemsWithTypeVariety(shuffled, 20);
      setRandomRecommendations(diversifiedRandomItems);

      // === AI RECOMMENDATIONS - Prefer Groq reranking, fallback to local ranking ===
      if (userId) {
        try {
          const hasExistingAiFeed =
            aiRecommendations.length > 0 &&
            !/(local ranker|local matching)/i.test(aiFeedProvider || "");
          const hasRecentQuotaMessage = isGroqQuotaExhaustedMessage(aiFeedMessage);
          const hasFreshAiFeed =
            (hasExistingAiFeed || hasRecentQuotaMessage) &&
            lastHomeAiRerankAtRef.current > 0 &&
            Date.now() - lastHomeAiRerankAtRef.current < HOME_AI_RERANK_COOLDOWN_MS;

          debugLog("🤖 Building Groq For You recommendations for user:", userId);
          const [skillsResult, genresResult] = await Promise.all([
            supabase.from("profile_skills").select("skill").eq("profile_id", userId),
            supabase.from("profile_genres").select("genre").eq("profile_id", userId),
          ]);

          const profileSignals = {
            skills: (skillsResult.data || [])
              .map((row: any) => row.skill)
              .filter((value: any) => typeof value === "string" && value.trim().length > 0),
            genres: (genresResult.data || [])
              .map((row: any) => row.genre)
              .filter((value: any) => typeof value === "string" && value.trim().length > 0),
          };

          const localRankedItems = rankForYouOnDevice(
            allItemsList,
            profileSignals,
            20,
          );
          const hasProfileSignals =
            profileSignals.skills.length > 0 || profileSignals.genres.length > 0;

          if (hasFreshAiFeed) {
            setAiFeedMessage((currentMessage) => {
              if (currentMessage && currentMessage.trim().length > 0) {
                return currentMessage;
              }

              return `Using cached ${aiFeedProvider || geminiModelLabel} Home feed.`;
            });
          } else {
            // Keep feed realtime: show local ranking immediately while LLM rerank runs.
            setAiRecommendations(localRankedItems);
            setAiFeedProvider(geminiModelLabel);

            if (localRankedItems.length === 0) {
              setAiFeedMessage("No listings available for AI feed ranking yet.");
            } else if (hasProfileSignals) {
              setAiFeedMessage(`Preparing ${geminiModelLabel} feed for your profile.`);
            } else {
              setAiFeedMessage(`Preparing ${geminiModelLabel} feed.`);
            }
          }

          if (hasFreshAiFeed) {
            debugLog("Skipping Home rerank because cached AI feed is still fresh.");
          } else if (homeLlmRerankInFlightRef.current) {
            setAiFeedMessage(`${geminiModelLabel} rerank is already running for Home feed.`);
          } else {
            const llmRequestId = ++homeLlmRequestIdRef.current;
            homeLlmRerankInFlightRef.current = true;

            void (async () => {
              try {
                const llmResult = await rerankHomeFeedWithGeminiFlashLite({
                  candidates: localRankedItems,
                  profileSignals,
                  limit: 20,
                });

                if (llmRequestId !== homeLlmRequestIdRef.current) {
                  return;
                }

                if (isGroqQuotaExhaustedMessage(llmResult.message)) {
                  lastHomeAiRerankAtRef.current = Date.now();
                  setAiRecommendations([]);
                  setAiFeedProvider("Normal Feed");
                  setAiFeedMessage("Groq free-tier limit reached. Showing normal Home feed.");
                  homeAiSessionCache = {
                    userId,
                    updatedAt: lastHomeAiRerankAtRef.current,
                    recommendations: [],
                    aiFeedProvider: "Normal Feed",
                    aiFeedMessage: "Groq free-tier limit reached. Showing normal Home feed.",
                  };
                  return;
                }

                if (llmResult.aiPowered && llmResult.recommendations.length > 0) {
                  const resolvedProvider = llmResult.aiProvider || geminiModelLabel;
                  const resolvedMessage =
                    llmResult.message ||
                    `Realtime For You feed reranked by ${resolvedProvider}.`;

                  lastHomeAiRerankAtRef.current = Date.now();
                  setAiRecommendations(llmResult.recommendations);
                  setAiFeedProvider(resolvedProvider);
                  setAiFeedMessage(resolvedMessage);
                  homeAiSessionCache = {
                    userId,
                    updatedAt: lastHomeAiRerankAtRef.current,
                    recommendations: llmResult.recommendations,
                    aiFeedProvider: resolvedProvider,
                    aiFeedMessage: resolvedMessage,
                  };
                  return;
                }

                if (llmResult.message && llmResult.message.trim().length > 0) {
                  setAiFeedMessage(llmResult.message);
                }
              } finally {
                if (llmRequestId === homeLlmRequestIdRef.current) {
                  homeLlmRerankInFlightRef.current = false;
                }
              }
            })();
          }
        } catch (aiErr) {
          debugLog("🤖 Groq ranking error, using local fallback:", aiErr);
          const errorMessage = aiErr instanceof Error ? aiErr.message : String(aiErr);
          if (isGroqQuotaExhaustedMessage(errorMessage)) {
            lastHomeAiRerankAtRef.current = Date.now();
            setAiRecommendations([]);
            setAiFeedProvider("Normal Feed");
            setAiFeedMessage("Groq free-tier limit reached. Showing normal Home feed.");
            homeAiSessionCache = {
              userId,
              updatedAt: lastHomeAiRerankAtRef.current,
              recommendations: [],
              aiFeedProvider: "Normal Feed",
              aiFeedMessage: "Groq free-tier limit reached. Showing normal Home feed.",
            };
            return;
          }

          setAiRecommendations([]);
          setAiFeedProvider(geminiModelLabel);
          setAiFeedMessage("Local personalization is temporarily unavailable. Showing general picks.");
        }
      } else {
        debugLog("🤖 No user logged in - skipping AI recommendations");
        lastHomeAiRerankAtRef.current = 0;
        homeAiSessionCache = null;
        setAiRecommendations([]);
        setAiFeedProvider(geminiModelLabel);
        setAiFeedMessage("");
      }

      // Set featured/discover - AI mode uses AI recommendations if available
      // This will be toggled by the user with the switch
      // For initial load, use AI if enabled and available
      setFeatured(diversifiedRandomItems.slice(0, 10));
      setDiscover(diversifiedRandomItems.slice(10, 20));
      lastHomeRefreshAtRef.current = Date.now();

      debugLog("✅ Home data loaded successfully");
    } catch (e) {
      debugLog("❌ Error fetching home feed:", e);
    } finally {
      homeDataFetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleCardPress = async (item: any) => {
    debugLog("=== handleCardPress called ===");
    debugLog("Item:", item);
    debugLog("Item ID:", item.id);

    openListingDetails(item.id);
    debugLog("selectedListingId set to:", item.id);
    debugLog("openDetailsSheet called");

    // Mark this item as viewed in the New Arrivals set
    const isNewArrival = newArrivals.some((n: any) => n.id === item.id);
    if (isNewArrival) {
      setViewedNewArrivals(prev => {
        const next = new Set(prev);
        next.add(item.id);
        AsyncStorage.setItem(VIEWED_NEW_ARRIVALS_STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
    }

    // Defer storage work so sheet animation stays smooth
    InteractionManager.runAfterInteractions(() => {
      void saveToRecentlyViewed(item);
    });
  };

  // Handle chat action - navigate to chat screen with recipient
  const handleChat = (item: any) => {
    if (!userId) {
      setAlertConfig({
        type: "info",
        title: "Login Required",
        message: "Please login or sign up to chat with this user.",
        buttons: [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setAlertVisible(false),
          },
          { text: "Login", onPress: () => router.push("/") },
        ],
      });
      setAlertVisible(true);
      return;
    }

    // Determine the owner/organizer ID based on item type
    const recipientId = item.owner_id || item.organizer_id;
    if (!recipientId) {
      debugLog("No owner/organizer found for item:", item);
      return;
    }

    // Navigate to chat with context (use correct case - Group, Studio, Gig, Artist)
    router.push({
      pathname: "/chat",
      params: {
        recipientId,
        recipientName: item.name,
        ...(item.type === "Group" && { groupId: item.id }),
        ...(item.type === "Studio" && { studioId: item.id }),
        ...(item.type === "Gig" && { gigId: item.id }),
      },
    });
  };

  const saveToRecentlyViewed = async (item: any) => {
    try {
      debugLog("💾 saveToRecentlyViewed called with:", item.name, item.type);
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      const existingJson = await AsyncStorage.getItem("recently_viewed_items");
      let items = existingJson ? JSON.parse(existingJson) : [];
      debugLog("💾 Existing items count:", items.length);

      // Remove if already exists to avoid duplicates
      items = items.filter((i: any) => i.id !== item.id);

      // Add to front
      const normalizedItem = { ...item };
      const normalizedItemType = String(normalizedItem?.type || "").toLowerCase();
      if (
        (normalizedItemType === "studio" || normalizedItemType === "gig") &&
        !normalizedItem.permit_status
      ) {
        normalizedItem.permit_status = "approved";
      }
      items.unshift(normalizedItem);

      items = items.filter((entry: any) => {
        if (isGuest) {
          return entry.type === "Group" || entry.type === "Artist";
        }

        const entryType = String(entry?.type || "").toLowerCase();
        if (entryType === "studio" || entryType === "gig") {
          return String(entry?.permit_status || "").toLowerCase() === "approved";
        }
        return true;
      });

      // Keep only last 10
      items = items.slice(0, 10);

      await AsyncStorage.setItem(
        "recently_viewed_items",
        JSON.stringify(items),
      );
      debugLog("💾 Saved! New count:", items.length);

      // Update state
      setRecentlyViewed(items);
      debugLog("💾 State updated with", items.length, "items");
    } catch (e) {
      debugLog("Error saving to recently viewed:", e);
    }
  };

  const fetchRecentlyViewed = async () => {
    try {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      const existingJson = await AsyncStorage.getItem("recently_viewed_items");
      debugLog(
        "📚 Recently viewed from storage:",
        existingJson ? "Found" : "Empty",
      );
      if (existingJson) {
        const items = JSON.parse(existingJson);
        const visibleItems = items.filter((entry: any) => {
          if (isGuest) {
            return entry.type === "Group" || entry.type === "Artist";
          }

          const entryType = String(entry?.type || "").toLowerCase();
          if (entryType === "studio" || entryType === "gig") {
            return String(entry?.permit_status || "").toLowerCase() === "approved";
          }
          return true;
        });
        debugLog("📚 Recently viewed items count:", visibleItems.length);
        setRecentlyViewed(visibleItems.slice(0, 5)); // Show first 5
      } else {
        debugLog("📚 No recently viewed items in storage");
        setRecentlyViewed([]);
      }
    } catch (e) {
      debugLog("Error fetching recently viewed:", e);
    }
  };

  const parseLocalDate = (value: string | Date | null | undefined) => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

    if (typeof value === "string") {
      const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        const year = parseInt(dateOnlyMatch[1], 10);
        const month = parseInt(dateOnlyMatch[2], 10);
        const day = parseInt(dateOnlyMatch[3], 10);
        const localDate = new Date(year, month - 1, day);
        return isNaN(localDate.getTime()) ? null : localDate;
      }
    }

    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const extractTimeParts = (timeValue: string | null | undefined) => {
    if (!timeValue || typeof timeValue !== "string") return null;

    const isoDate = new Date(timeValue);
    if (!isNaN(isoDate.getTime()) && timeValue.includes("T")) {
      return { hours: isoDate.getHours(), minutes: isoDate.getMinutes() };
    }

    const meridiemMatch = timeValue.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i,
    );
    if (meridiemMatch) {
      let hours = parseInt(meridiemMatch[1], 10);
      const minutes = parseInt(meridiemMatch[2], 10);
      const period = meridiemMatch[3].toUpperCase();
      if (period === "PM" && hours !== 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      if (isNaN(hours) || isNaN(minutes)) return null;
      return { hours, minutes };
    }

    const twentyFourMatch = timeValue.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (twentyFourMatch) {
      const hours = parseInt(twentyFourMatch[1], 10);
      const minutes = parseInt(twentyFourMatch[2], 10);
      if (isNaN(hours) || isNaN(minutes)) return null;
      return { hours, minutes };
    }

    return null;
  };

  const formatTimeForDisplay = (timeValue: string | null | undefined) => {
    const parts = extractTimeParts(timeValue);
    if (!parts) return null;

    const period = parts.hours >= 12 ? "PM" : "AM";
    const h12 = parts.hours % 12 || 12;
    const paddedMinutes = String(parts.minutes).padStart(2, "0");
    return `${h12}:${paddedMinutes} ${period}`;
  };

  const getEventDateTime = (
    dateValue: string | Date | null | undefined,
    endTimeValue?: string | null,
    startTimeValue?: string | null,
  ) => {
    const baseDate = parseLocalDate(dateValue);
    if (!baseDate) return null;

    const combined = new Date(baseDate);
    const timeParts =
      extractTimeParts(endTimeValue || undefined) ||
      extractTimeParts(startTimeValue || undefined);

    if (timeParts) {
      combined.setHours(timeParts.hours, timeParts.minutes, 0, 0);
    } else {
      combined.setHours(23, 59, 59, 999);
    }

    return combined;
  };

  // Fetch Upcoming Events for Musicians (accepted gigs & confirmed studio bookings)
  const fetchUpcomingEvents = async () => {
    // Only fetch for musicians
    if (userRole !== "musician" || !userId) {
      setUpcomingEvents([]);
      return;
    }

    try {
      const now = new Date();
      const events: any[] = [];

      // 1. Fetch accepted gig applications
      const { data: gigApps, error: gigError } = await supabase
        .from("gig_applications")
        .select("id, gig_id, status")
        .eq("applicant_id", userId)
        .eq("status", "accepted");

      if (gigError) {
        debugLog("Error fetching gig applications:", gigError);
      } else if (gigApps) {
        const gigIds = Array.from(
          new Set(
            gigApps
              .map((app: any) => app.gig_id)
              .filter((id: any) => typeof id === "string" && id.length > 0),
          ),
        );

        let gigById: Record<string, any> = {};
        if (gigIds.length > 0) {
          const { data: baseGigs, error: baseGigsError } = await supabase
            .from("gigs")
            .select("id, name, event_date, location, budget")
            .in("id", gigIds);

          const { data: legacyGigs, error: legacyGigsError } = await supabase
            .from("gigs_legacy_projection")
            .select("id, images, requirements")
            .in("id", gigIds);

          if (baseGigsError) {
            debugLog("Error fetching base gigs for upcoming events:", baseGigsError);
          }
          if (legacyGigsError) {
            debugLog(
              "Error fetching gig legacy projection for upcoming events:",
              legacyGigsError,
            );
          }

          const baseGigMap = new Map(
            (baseGigs || []).map((gig: any) => [gig.id, gig]),
          );
          const legacyGigMap = new Map(
            (legacyGigs || []).map((gig: any) => [gig.id, gig]),
          );

          gigIds.forEach((id: string) => {
            const baseGig = baseGigMap.get(id);
            if (!baseGig) return;

            const legacyGig = legacyGigMap.get(id) || {};
            gigById[id] = {
              ...baseGig,
              images: Array.isArray(legacyGig.images) ? legacyGig.images : [],
              requirements: legacyGig.requirements || {},
            };
          });
        }

        gigApps.forEach((app: any) => {
          const gig = app.gig_id ? gigById[app.gig_id] : null;
          if (!gig?.event_date) return;

          const eventDate = parseLocalDate(gig.event_date);
          const eventDateTime = getEventDateTime(
            gig.event_date,
            gig.requirements?.event_end_time,
            gig.requirements?.event_start_time,
          );
          if (!eventDate || !eventDateTime) return;

          if (eventDateTime >= now) {
            const formattedStartTime = formatTimeForDisplay(
              gig.requirements?.event_start_time,
            );
            const formattedEndTime = formatTimeForDisplay(
              gig.requirements?.event_end_time,
            );

            events.push({
              id: app.id,
              type: "Gig",
              name: gig.name,
              date: gig.event_date,
              sortTimestamp: eventDateTime.getTime(),
              formattedDate: eventDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              time:
                formattedStartTime && formattedEndTime
                  ? `${formattedStartTime} - ${formattedEndTime}`
                  : formattedStartTime
                    ? formattedStartTime
                  : "Time TBA",
              location: gig.location || "Location TBA",
              image: gig.images?.[0] || null,
              budget: gig.budget,
              status: "Accepted",
              gigId: gig.id,
            });
          }
        });
      }

      // 2. Fetch confirmed studio bookings
      const { data: studioBookings, error: studioError } = await supabase
        .from("studio_bookings")
        .select(
          "id, studio_id, booking_date, start_time, end_time, final_price, total_price, status",
        )
        .eq("user_id", userId)
        .in("status", ["confirmed", "pending"]);

      if (studioError) {
        debugLog("Error fetching studio bookings:", studioError);
      } else if (studioBookings) {
        const seenStudioBookingSlots = new Set<string>();
        const studioIds = Array.from(
          new Set(
            studioBookings
              .map((booking: any) => booking.studio_id)
              .filter((id: any) => typeof id === "string" && id.length > 0),
          ),
        );

        let studioById: Record<string, any> = {};
        if (studioIds.length > 0) {
          const { data: baseStudios, error: baseStudiosError } = await supabase
            .from("studios")
            .select("id, name, address")
            .in("id", studioIds);

          const { data: legacyStudios, error: legacyStudiosError } = await supabase
            .from("studios_legacy_projection")
            .select("id, images")
            .in("id", studioIds);

          if (baseStudiosError) {
            debugLog(
              "Error fetching base studios for upcoming events:",
              baseStudiosError,
            );
          }
          if (legacyStudiosError) {
            debugLog(
              "Error fetching studio legacy projection for upcoming events:",
              legacyStudiosError,
            );
          }

          const baseStudioMap = new Map(
            (baseStudios || []).map((studio: any) => [studio.id, studio]),
          );
          const legacyStudioMap = new Map(
            (legacyStudios || []).map((studio: any) => [studio.id, studio]),
          );

          studioIds.forEach((id: string) => {
            const baseStudio = baseStudioMap.get(id);
            if (!baseStudio) return;

            const legacyStudio = legacyStudioMap.get(id) || {};
            studioById[id] = {
              ...baseStudio,
              images: Array.isArray(legacyStudio.images)
                ? legacyStudio.images
                : [],
            };
          });
        }

        studioBookings.forEach((booking: any) => {
          const studio = booking.studio_id ? studioById[booking.studio_id] : null;
          if (!booking.booking_date) return;

          const bookingDate = parseLocalDate(booking.booking_date);
          const bookingDateTime = getEventDateTime(
            booking.booking_date,
            booking.end_time,
            booking.start_time,
          );
          if (!bookingDate || !bookingDateTime) return;

          if (bookingDateTime >= now) {
            const formattedStartTime = formatTimeForDisplay(booking.start_time);
            const formattedEndTime = formatTimeForDisplay(booking.end_time);
            const bookingSlotKey = [
              booking.studio_id || "unknown-studio",
              bookingDate.toISOString().split("T")[0],
              formattedStartTime || booking.start_time || "TBA",
              formattedEndTime || booking.end_time || "TBA",
            ].join("|");

            if (seenStudioBookingSlots.has(bookingSlotKey)) return;
            seenStudioBookingSlots.add(bookingSlotKey);

            events.push({
              id: booking.id,
              type: "Studio",
              name: studio?.name || "Studio Booking",
              date: booking.booking_date,
              sortTimestamp: bookingDateTime.getTime(),
              formattedDate: bookingDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              time:
                formattedStartTime && formattedEndTime
                  ? `${formattedStartTime} - ${formattedEndTime}`
                  : formattedStartTime
                    ? formattedStartTime
                  : "Time TBA",
              location: studio?.address || "Address TBA",
              image: studio?.images?.[0] || null,
              price: booking.final_price || booking.total_price,
              status: booking.status === "confirmed" ? "Confirmed" : "Pending",
              studioId: studio?.id,
            });
          }
        });
      }

      // Sort by date (closest first)
      events.sort(
        (a, b) =>
          (a.sortTimestamp || new Date(a.date).getTime()) -
          (b.sortTimestamp || new Date(b.date).getTime()),
      );

      setUpcomingEvents(events.slice(0, 5)); // Show max 5 upcoming events
      debugLog(`📅 Fetched ${events.length} upcoming events for musician`);
    } catch (e) {
      debugLog("Error fetching upcoming events:", e);
    }
  };

  // 1. Immersive Hero Section
  const renderHero = () => {
    // Modern System Background (Abstract Dark/Purple)
    // Using a high-quality abstract gradient/mesh that matches the app's "premium" feel
    const heroImage =
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop";

    // Dynamic Search Text
    // Musicians -> looking for studios/gigs
    // Venue/Studio -> looking for musicians
    const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
    const searchPlaceholder = isOwner
      ? "Find musicians, bands..."
      : "Find studios, gigs, venues...";
    const searchSubPlaceholder = isOwner
      ? "Genre • Availability"
      : "Location • Rate";

    return (
      <View style={[styles.heroContainer, Platform.OS === 'web' && { height: 480, borderRadius: 24, overflow: 'hidden' }]}>
        <CachedImage
          uri={heroImage}
          style={styles.heroImage}
          width={1080}
          height={640}
          quality={70}
          cacheVersion="home-hero-v1"
        />
        <LinearGradient
          colors={[
            "rgba(0,0,0,0.3)",
            "transparent",
            "rgba(0,0,0,0.8)",
            "#111827",
          ]} // Fade into body color (assuming dark mode or just dark contrast)
          locations={[0, 0.4, 0.8, 1]}
          style={styles.heroGradient}
        />

        {/* Content within Hero */}
        <View style={styles.heroContent}>
          {/* Greeting with Stats */}
          <View>
            <Text style={styles.heroGreeting}>Welcome, {userName}!</Text>
          </View>

          {/* Glassmorphism Search Pill */}
          <BlurView intensity={60} tint="light" style={[styles.searchPill, isWebDesktop && { maxWidth: 640, alignSelf: 'flex-start' }]}>
            <TouchableOpacity activeOpacity={1}
              style={styles.searchTouch}
              onPress={openSearchSheet}
            >
              <Ionicons
                name="search"
                size={20}
                color="#FFF"
                style={{ marginRight: 8 }}
              />
              <View style={styles.searchTexts}>
                <Text style={styles.searchPlaceholder}>
                  {searchPlaceholder}
                </Text>
                <Text style={styles.searchSubPlaceholder}>
                  {searchSubPlaceholder}
                </Text>
              </View>
            </TouchableOpacity>
          </BlurView>
        </View>
      </View>
    );
  };

  // 1.5 Web SaaS Split Hero
  const renderWebHero = () => {
    const heroHeadingColor = isDark ? "#F8FAFC" : "#0F172A";
    const heroBodyColor = isDark ? "#CBD5E1" : "#334155";
    const heroPanelColor = isDark ? "rgba(15, 23, 42, 0.76)" : "rgba(255, 255, 255, 0.86)";
    const heroShadowColor = isDark ? "#020617" : "#64748B";

    return (
      <LinearGradient
        colors={
          isDark
            ? ["#0F172A", "#111827", "#1E293B"]
            : ["#FFFFFF", "#EEF2FF", "#E0F2FE"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.webHeroShell}
      >
        <View style={styles.webHeroGlowOne} />
        <View style={styles.webHeroGlowTwo} />

        <View style={styles.webHeroGrid}>
          <View style={styles.webHeroCopy}>
            <Text style={[styles.webHeroTitle, { color: heroHeadingColor }]}>
              Move faster with tools{"\n"}
              <Text style={{ color: isDark ? "#2DD4BF" : "#0F766E" }}>
                built for local music
              </Text>
            </Text>
            <Text style={[styles.webHeroDescription, { color: heroBodyColor }]}>
              Book gigs, discover spaces, and connect with artists in one streamlined workflow. Designed for daily operations, not spreadsheets.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/discover')}
              style={[
                styles.webHeroButton,
                {
                  backgroundColor: colors.primary,
                  shadowColor: colors.primary,
                },
              ]}
            >
              <Text style={styles.webHeroButtonText}>Start your next gig now</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.webHeroWidgets}>
            <View
              style={[
                styles.webHeroWidgetTop,
                {
                  backgroundColor: heroPanelColor,
                  shadowColor: heroShadowColor,
                },
              ]}
            >
              <Text style={[styles.webHeroWidgetLabel, { color: webTextSecondary }]}>Monthly Bookings</Text>
              <Text style={[styles.webHeroWidgetValue, { color: webTextColor }]}>124 <Text style={styles.webHeroWidgetDelta}>+12%</Text></Text>
              <View style={styles.webHeroBarsRow}>
                {[38, 56, 32, 82, 46].map((h, i) => (
                  <View
                    key={i}
                    style={[
                      styles.webHeroBar,
                      {
                        height: `${h}%`,
                        backgroundColor: i === 3 ? colors.primary : isDark ? "#334155" : "#CFD8EA",
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View
              style={[
                styles.webHeroWidgetBottom,
                {
                  backgroundColor: heroPanelColor,
                  shadowColor: heroShadowColor,
                },
              ]}
            >
              <Text style={[styles.webHeroWidgetLabel, { color: webTextColor, textAlign: "center" }]}>Studio Traffic</Text>
              <View style={styles.webHeroRingWrap}>
                <View
                  style={[
                    styles.webHeroRing,
                    {
                      borderColor: isDark ? "#334155" : "#CBD5E1",
                      borderBottomColor: colors.primary,
                      borderRightColor: isDark ? "#1E293B" : "#E2E8F0",
                    },
                  ]}
                />
                <View style={styles.webHeroRingCut} />
              </View>
              <Text style={[styles.webHeroWidgetHint, { color: webTextSecondary }]}>
                Keep your schedule updated to increase the number of interactions.
              </Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    );
  };
  const renderHighlightsSection = () => {
    if (topItems.length === 0) return null;

    return (
      <View style={{ marginTop: 24, paddingHorizontal: 24 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 16,
          }}
        >
          <View>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginBottom: 0 },
              ]}
            >
              Top Picks {aiModeEnabled ? "🤖" : "🎲"}
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              {aiModeEnabled
                ? "AI-personalized recommendations"
                : "Random selection"}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={1} onPress={openSearchSheet}>
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                fontSize: moderateScale(13),
              }}
            >
              See all
            </Text>
          </TouchableOpacity>
        </View>

        {/* Modern Masonry / Bento Grid Layout */}
        {topItems.length >= 3 ? (
          <View style={[styles.bentoGrid, Platform.OS === 'web' && { height: 480 }]}>
            {/* Main Highlight (Large) */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => handleCardPress(topItems[0])}
              style={styles.bentoTouchableLarge}
            >
              <View style={styles.bentoLarge}>
                <AutoCardImage
                  image={topItems[0].image}
                  images={topItems[0].images}
                  style={styles.bentoImage}
                  width={720}
                  height={560}
                  cacheVersion={topItems[0].updated_at || topItems[0].created_at || topItems[0].id}
                />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.2)", "rgba(0,0,0,0.8)"]}
                  style={styles.bentoOverlay}
                >
                  <View style={styles.bentoContent}>
                    <View
                      style={[
                        styles.glassBadge,
                        { alignSelf: "flex-start", marginBottom: 8 },
                      ]}
                    >
                      <Text style={styles.glassBadgeText}>
                        {aiModeEnabled && topItems[0].similarity
                          ? `🤖 ${(topItems[0].similarity * 100).toFixed(0)}% Match`
                          : "🔥 Highly Rated"}
                      </Text>
                    </View>
                    <Text style={styles.bentoTitleLarge} numberOfLines={2}>
                      {topItems[0].name}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 4,
                      }}
                    >
                      <Ionicons
                        name="location"
                        size={14}
                        color="rgba(255,255,255,0.8)"
                      />
                      <Text style={styles.bentoSubtitle} numberOfLines={1}>
                        {topItems[0].location}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            </TouchableOpacity>

            {/* Side Column (2 Stacked) */}
            <View style={styles.bentoColumn}>
              {topItems.slice(1, 3).map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={1}
                  onPress={() => handleCardPress(item)}
                  style={styles.bentoTouchableSmall}
                >
                  <View style={styles.bentoSmall}>
                    <AutoCardImage
                      image={item.image}
                      images={item.images}
                      style={styles.bentoImage}
                      width={480}
                      height={280}
                      cacheVersion={item.updated_at || item.created_at || item.id}
                    />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.7)"]}
                      style={styles.bentoOverlay}
                    >
                      <Text style={styles.bentoTitleSmall} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Ionicons name="star" size={10} color="#FCD34D" />
                        <Text style={styles.bentoRating}>
                          {item.rating > 0 ? item.rating.toFixed(1) : "New"}
                        </Text>
                      </View>
                    </LinearGradient>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <ResponsiveList
            contentContainerStyle={{ paddingRight: 16 }}
          >
            {topItems.map((item) => (
              <View key={item.id} style={{ marginRight: 16, marginBottom: 16 }}>
                {renderUnifiedCard(item)}
              </View>
            ))}
          </ResponsiveList>
        )}
      </View>
    );
  };

  // Handle invite action - opens the details sheet for booking/connecting
  const handleInvite = (item: any) => {
    if (!userId) {
      setAlertConfig({
        type: "info",
        title: "Login Required",
        message: "Please login or sign up to connect with this user.",
        buttons: [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setAlertVisible(false),
          },
          { text: "Login", onPress: () => router.push("/") },
        ],
      });
      setAlertVisible(true);
      return;
    }

    openListingDetails(item.id);
    // The ListingDetailsSheet will show the "Connect" tab for Groups
    // allowing venue/studio owners to send booking requests
  };

  // Unified Card Renderer
  const renderUnifiedCard = (item: any) => {
    return (
      <ListingCard
        key={item.id}
        item={item}
        onPress={handleCardPress}
        onInvite={handleInvite}
        onChat={handleChat}
        variant="horizontal"
        hasGroups={hasGroups}
        showGigSummary={false}
        style={{ width: 280 }}
      />
    );
  };

  // 3. New Arrivals Section - Custom Cards
  const renderNewArrivals = () => {
    // Don't render if no items
    if (newArrivals.length === 0) {
      return null;
    }

    // Helper to get price label - skip Groups, handle Studio-specific pricing
    const getPriceLabel = (item: any) => {
      if (item.type === "Group") return null;

      // Handle Studio pricing specifically
      if (item.type === "Studio") {
        const rehearsalRate =
          item.rehearsal_rate && item.rehearsal_rate !== "0"
            ? parseInt(item.rehearsal_rate)
            : 0;
        const recordingRate =
          item.recording_rate && item.recording_rate !== "0"
            ? parseInt(item.recording_rate)
            : 0;
        const isRecordingOnlyStudio = item.studio_type === "Recording";
        const isRehearsalOnlyStudio = item.studio_type === "Rehearsal";
        const hasRehearsalRate = rehearsalRate > 0 && !isRecordingOnlyStudio;
        const hasRecordingRate = recordingRate > 0 && !isRehearsalOnlyStudio;

        // Both rates available
        if (hasRehearsalRate && hasRecordingRate) {
          return `₱${rehearsalRate.toLocaleString()}/hr | ₱${recordingRate.toLocaleString()}/song`;
        }
        // Recording only
        if (hasRecordingRate) {
          return `₱${recordingRate.toLocaleString()}/song`;
        }
        // Rehearsal only
        if (hasRehearsalRate) {
          return `₱${rehearsalRate.toLocaleString()}/hr`;
        }
        // Fallback to hourly_rate
        if (item.hourly_rate && item.hourly_rate !== "0") {
          return `₱${parseInt(item.hourly_rate).toLocaleString()}/hr`;
        }
        return null;
      }

      if (item.hourly_rate && item.hourly_rate !== "0") {
        return `₱${parseInt(item.hourly_rate).toLocaleString()}/hr`;
      }
      if (item.budget && item.budget !== "0") {
        return `₱${parseInt(item.budget).toLocaleString()}`;
      }
      if (item.rate && item.rate !== "0") {
        return `₱${parseInt(item.rate).toLocaleString()}`;
      }
      return null;
    };

    return (
      <View style={styles.sectionContainer}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingHorizontal: 24,
            marginBottom: 16,
          }}
        >
          <View>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginBottom: 0 },
              ]}
            >
              New Arrivals
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              Fresh on MusikaLokal
            </Text>
          </View>
          <TouchableOpacity activeOpacity={1} onPress={openSearchSheet}>
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                fontSize: moderateScale(13),
              }}
            >
              See all
            </Text>
          </TouchableOpacity>
        </View>

        <ResponsiveList
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 8,
          }}
          snapToInterval={280 + 16}
        >
          {newArrivals.map((item) => {
            const priceLabel = getPriceLabel(item);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={1}
                onPress={() => handleCardPress(item)}
                style={[
                  styles.newArrivalCard,
                  isWebDesktop && { flex: 1, minWidth: 280, maxWidth: 320, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { height: 6, width: 0 } },
                  { backgroundColor: webCardBackground },
                ]}
              >
              {/* Image Section */}
              <View style={styles.newArrivalImageContainer}>
                {((item.images && item.images.length > 0) || item.image) ? (
                  <AutoCardImage
                    image={item.image}
                    images={item.images}
                    style={styles.newArrivalImage}
                    width={560}
                    height={280}
                    cacheVersion={item.updated_at || item.created_at || item.id}
                  />
                ) : (
                  <View
                    style={[
                      styles.newArrivalImagePlaceholder,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <Ionicons
                      name={
                        item.type === "Gig"
                          ? "musical-notes"
                          : item.type === "Studio"
                            ? "business"
                            : "people"
                      }
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                )}
                {/* Type Badge */}
                <View
                  style={[
                    styles.newArrivalTypeBadge,
                    { backgroundColor: getTypeBadgeColor(item.type) },
                  ]}
                >
                  <Text style={styles.newArrivalTypeBadgeText}>
                    {item.type}
                  </Text>
                </View>
                {/* NEW Dot Badge – hidden once the listing has been viewed */}
                {!viewedNewArrivals.has(item.id) && (
                  <View style={styles.newArrivalNewBadge}>
                    <View style={styles.newArrivalNewDot} />
                    <Text style={styles.newArrivalNewBadgeText}>NEW</Text>
                  </View>
                )}
              </View>

              {/* Details Section */}
              <View style={styles.newArrivalDetails}>
                <Text
                  style={[styles.newArrivalName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>

                {/* Location/Genre */}
                <View style={styles.newArrivalRow}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.newArrivalText,
                      { color: colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {item.location || item.genre || "Location TBA"}
                  </Text>
                </View>

                {/* Rating */}
                <View style={styles.newArrivalRow}>
                  <Ionicons name="star" size={14} color="#FCD34D" />
                  <Text
                    style={[
                      styles.newArrivalText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {item.rating > 0
                      ? `${item.rating.toFixed(1)} (${item.review_count || 0})`
                      : "No ratings yet"}
                  </Text>
                </View>

                {/* Price */}
                {priceLabel && (
                  <Text
                    style={[styles.newArrivalPrice, { color: colors.primary }]}
                  >
                    {priceLabel}
                  </Text>
                )}
              </View>
              </TouchableOpacity>
            );
          })}
        </ResponsiveList>
      </View>
    );
  };

  // 3.5 Upcoming Events Section (for Musicians only)
  const renderUpcomingEvents = () => {
    // Only show for musicians
    if (userRole !== "musician" || upcomingEvents.length === 0) return null;

    return (
      <View style={styles.sectionContainer}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingHorizontal: 24,
            marginBottom: 16,
          }}
        >
          <View>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginBottom: 0 },
              ]}
            >
              Upcoming Events
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              Your scheduled gigs & bookings
            </Text>
          </View>
          <TouchableOpacity activeOpacity={1} onPress={() => router.push("/bookings")}>
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                fontSize: moderateScale(13),
              }}
            >
              View all
            </Text>
          </TouchableOpacity>
        </View>

        <ResponsiveList
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 8,
          }}
          snapToInterval={280 + 16}
        >
          {upcomingEvents.map((event, index) => (
            <TouchableOpacity
              key={`${event.type}-${event.id}`}
              activeOpacity={1}
              onPress={() => {
                // Navigate to appropriate detail screen
                if (event.type === "Gig" && event.gigId) {
                  // For now, just go to bookings since musicians can't view gig details directly
                  router.push("/bookings");
                } else if (event.type === "Studio" && event.studioId) {
                  openListingDetails(event.studioId);
                }
              }}
              style={[
                styles.upcomingEventCard,
                isWebDesktop && { flex: 1, minWidth: 280, maxWidth: 320 },
                { backgroundColor: webCardBackground },
              ]}
            >
              {/* Event Image */}
              <View style={styles.upcomingEventImageContainer}>
                {event.image ? (
                  <CachedImage
                    uri={event.image}
                    style={styles.upcomingEventImage}
                    width={560}
                    height={240}
                    cacheVersion={event.updated_at || event.date || event.id}
                  />
                ) : (
                  <View
                    style={[
                      styles.upcomingEventImagePlaceholder,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <Ionicons
                      name={event.type === "Gig" ? "musical-notes" : "business"}
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                )}
                {/* Type Badge */}
                <View
                  style={[
                    styles.upcomingEventTypeBadge,
                    {
                      backgroundColor:
                        event.type === "Gig" ? "#8B5CF6" : "#10B981",
                    },
                  ]}
                >
                  <Ionicons
                    name={event.type === "Gig" ? "mic" : "business"}
                    size={12}
                    color="#FFF"
                  />
                  <Text style={styles.upcomingEventTypeBadgeText}>
                    {event.type}
                  </Text>
                </View>
              </View>

              {/* Event Details */}
              <View style={styles.upcomingEventDetails}>
                <Text
                  style={[styles.upcomingEventName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {event.name}
                </Text>

                {/* Date & Time */}
                <View style={styles.upcomingEventRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.upcomingEventText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {event.formattedDate}
                  </Text>
                </View>

                <View style={styles.upcomingEventRow}>
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.upcomingEventText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    {event.time}
                  </Text>
                </View>

                {/* Location */}
                <View style={styles.upcomingEventRow}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.upcomingEventText,
                      { color: colors.textSecondary },
                    ]}
                    numberOfLines={1}
                  >
                    {event.location}
                  </Text>
                </View>

                {/* Price/Budget & Status */}
                <View
                  style={[
                    styles.upcomingEventRow,
                    { justifyContent: "space-between", marginTop: 8 },
                  ]}
                >
                  {(event.budget || event.price) && (
                    <Text
                      style={[
                        styles.upcomingEventPrice,
                        { color: colors.primary },
                      ]}
                    >
                      ₱{(event.budget || event.price).toLocaleString()}
                    </Text>
                  )}
                  <View
                    style={[
                      styles.upcomingEventStatusBadge,
                      {
                        backgroundColor:
                          event.status === "Confirmed" ||
                          event.status === "Accepted"
                            ? "#10B98115"
                            : "#F59E0B15",
                        borderColor:
                          event.status === "Confirmed" ||
                          event.status === "Accepted"
                            ? "#10B981"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.upcomingEventStatusText,
                        {
                          color:
                            event.status === "Confirmed" ||
                            event.status === "Accepted"
                              ? "#10B981"
                              : "#F59E0B",
                        },
                      ]}
                    >
                      {event.status}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ResponsiveList>
      </View>
    );
  };

  // 4. For You - Smart Feed (Merged Featured + Discover with variety)
  const renderSmartFeed = () => {
    const uniqueItems = uniqueSmartFeedItems;

    if (uniqueItems.length === 0) {
      return (
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: webTextColor }]}>
            For You
          </Text>
          <View
            style={{
              paddingHorizontal: 24,
              paddingVertical: 40,
              alignItems: "center",
            }}
          >
            <Ionicons
              name="musical-notes-outline"
              size={48}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No recommendations yet
            </Text>
            <Text
              style={[styles.emptySubtext, { color: colors.textSecondary }]}
            >
              Start exploring to get personalized suggestions
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.sectionContainer}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingHorizontal: 24,
            marginBottom: 16,
          }}
        >
          <View>
            <Text
              style={[
                styles.sectionTitle,
                { color: colors.text, marginBottom: 0 },
              ]}
            >
              For You {aiModeEnabled ? "🤖" : "🎲"}
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              {aiModeEnabled
                ? "Personalized picks reranked in realtime"
                : "Random suggestions for comparison"}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={1} onPress={openSearchSheet}>
            <Text
              style={{
                color: colors.primary,
                fontFamily: "Poppins_600SemiBold",
                fontSize: moderateScale(13),
              }}
            >
              See all
            </Text>
          </TouchableOpacity>
        </View>

        {/* Featured Large Card - New Design */}
        {uniqueItems[0] && (
          <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => handleCardPress(uniqueItems[0])}
              style={[
                styles.featuredCard,
                isWebDesktop && { height: 480 },
                {
                  backgroundColor: webCardBackground,
                  elevation: 8,
                  shadowOpacity: 0.15,
                },
              ]}
            >
              <AutoCardImage
                image={uniqueItems[0].image}
                images={uniqueItems[0].images}
                style={styles.featuredImage}
                width={1080}
                height={720}
                cacheVersion={uniqueItems[0].updated_at || uniqueItems[0].created_at || uniqueItems[0].id}
              />
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.3)", "rgba(0,0,0,0.9)"]}
                style={styles.featuredGradient}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredBadgeText}>
                      {aiModeEnabled && uniqueItems[0].similarity
                        ? `🤖 ${(uniqueItems[0].similarity * 100).toFixed(0)}% Match`
                        : "✨ Top Recommendation"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.glassBadge,
                      { flexDirection: "row", alignItems: "center", gap: 4 },
                    ]}
                  >
                    <Ionicons name="star" size={12} color="#FCD34D" />
                    <Text style={[styles.glassBadgeText, { color: "#FFF" }]}>
                      {uniqueItems[0].rating.toFixed(1)}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: "auto" }}>
                  <Text style={styles.featuredTitle}>
                    {uniqueItems[0].name}
                  </Text>
                  <Text style={styles.featuredLocation} numberOfLines={1}>
                    {uniqueItems[0].location}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                    {uniqueItems[0].hourly_rate && (
                      <Text style={styles.featuredPrice}>
                        ₱{parseInt(uniqueItems[0].hourly_rate).toLocaleString()}
                        /hr
                      </Text>
                    )}
                    {uniqueItems[0].type && (
                      <View style={styles.tagBadge}>
                        <Text style={styles.tagText}>
                          {uniqueItems[0].type}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Horizontal Scroll for Rest */}
        <ResponsiveList
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 16,
          }} // Added paddingVertical for shadows
          snapToInterval={280 + 16}
        >
          {uniqueItems.slice(1, 11).map((item, index) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={1}
              onPress={() => handleCardPress(item)}
              style={[
                styles.forYouCard,
                isWebDesktop && { flex: 1, minWidth: 280, maxWidth: 320 },
                { backgroundColor: webCardBackground },
              ]}
            >
              {/* Image Section */}
              <View style={styles.forYouImageContainer}>
                {((item.images && item.images.length > 0) || item.image) ? (
                  <AutoCardImage
                    image={item.image}
                    images={item.images}
                    style={styles.forYouImage}
                    width={560}
                    height={280}
                    cacheVersion={item.updated_at || item.created_at || item.id}
                  />
                ) : (
                  <View
                    style={[
                      styles.forYouImagePlaceholder,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <Ionicons
                      name="musical-notes"
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                )}
                {/* Type Badge */}
                <View
                  style={[
                    styles.forYouTypeBadge,
                    {
                      backgroundColor:
                        item.type === "Gig"
                          ? "#10B981"
                          : item.type === "Group"
                            ? "#3B82F6"
                            : "#7C3AED",
                    },
                  ]}
                >
                  <Text style={styles.forYouTypeBadgeText}>{item.type}</Text>
                </View>
                {/* Recommended Badge (Simulated validation) */}
                <View
                  style={[
                    styles.glassBadge,
                    {
                      position: "absolute",
                      top: 12,
                      right: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                    },
                  ]}
                >
                  <Ionicons
                    name="star"
                    size={10}
                    color="#FCD34D"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.glassBadgeText}>
                    {item.rating > 0 ? item.rating.toFixed(1) : "New"}
                  </Text>
                </View>
              </View>

              {/* Details Section */}
              <View style={styles.forYouDetails}>
                <Text
                  style={[styles.forYouName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>

                <View style={styles.forYouRow}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[styles.forYouText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.location || item.genre || "Location TBA"}
                  </Text>
                </View>

                {/* Price - hide for Groups, handle Studio-specific pricing */}
                {item.type !== "Group" &&
                  (() => {
                    // Handle Studio pricing specifically
                    if (item.type === "Studio") {
                      const rehearsalRate =
                        item.rehearsal_rate && item.rehearsal_rate !== "0"
                          ? parseInt(item.rehearsal_rate)
                          : 0;
                      const recordingRate =
                        item.recording_rate && item.recording_rate !== "0"
                          ? parseInt(item.recording_rate)
                          : 0;
                      const isRecordingOnlyStudio =
                        item.studio_type === "Recording";
                      const isRehearsalOnlyStudio =
                        item.studio_type === "Rehearsal";
                      const hasRehearsalRate =
                        rehearsalRate > 0 && !isRecordingOnlyStudio;
                      const hasRecordingRate =
                        recordingRate > 0 && !isRehearsalOnlyStudio;

                      let priceText = null;
                      if (hasRehearsalRate && hasRecordingRate) {
                        priceText = `₱${rehearsalRate.toLocaleString()}/hr | ₱${recordingRate.toLocaleString()}/song`;
                      } else if (hasRecordingRate) {
                        priceText = `₱${recordingRate.toLocaleString()}/song`;
                      } else if (hasRehearsalRate) {
                        priceText = `₱${rehearsalRate.toLocaleString()}/hr`;
                      } else if (item.hourly_rate && item.hourly_rate !== "0") {
                        priceText = `₱${parseInt(item.hourly_rate).toLocaleString()}/hr`;
                      }

                      return priceText ? (
                        <Text
                          style={[
                            styles.forYouPrice,
                            { color: colors.primary },
                          ]}
                        >
                          {priceText}
                        </Text>
                      ) : null;
                    }

                    // Non-studio items
                    if (item.hourly_rate || item.budget || item.rate) {
                      return (
                        <Text
                          style={[
                            styles.forYouPrice,
                            { color: colors.primary },
                          ]}
                        >
                          {item.hourly_rate
                            ? `₱${parseInt(item.hourly_rate).toLocaleString()}/hr`
                            : item.budget
                              ? `₱${parseInt(item.budget).toLocaleString()}`
                              : `₱${parseInt(item.rate || "0").toLocaleString()}`}
                        </Text>
                      );
                    }
                    return null;
                  })()}
              </View>
            </TouchableOpacity>
          ))}
        </ResponsiveList>
      </View>
    );
  };

  // Helpers
  const parseColor = (c: string) => c;

  if (loading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: pageBackground },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: pageBackground }]}> 
      <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      {!isWebDesktop && (
        <View
          style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 100 }}
        >
          <Header title="MusikaLokal" transparent={!isScrolled} />
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.homeScrollContent,
          isWebDesktop && styles.homeScrollContentWeb,
        ]}
        bounces={true}
        onScroll={(e) => {
          const contentOffsetY = e.nativeEvent.contentOffset.y;
          setIsScrolled(contentOffsetY > 50);
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            progressViewOffset={insets.top + 60} // Push refresh spinner below header
          />
        }
      >
        <View style={[styles.homeContent, isWebDesktop && styles.homeContentWeb]}>
        {isWebDesktop ? renderWebHero() : renderHero()}

        <View
          style={[
            { paddingHorizontal: 24, marginTop: 16 },
            isWebDesktop && styles.profileBannerWrapWeb,
          ]}
        >
          <ProfileCompletionBanner />
        </View>

        {/* AI Recommendation Comparison Toggle */}
        <View
          style={[{
            marginHorizontal: 24,
            marginTop: 20,
            marginBottom: 8,
            padding: 16,
            borderRadius: 20,
            backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
            borderWidth: 1,
            borderColor: aiModeEnabled
              ? colors.primary
              : isDark
                ? "#374151"
                : "#E5E7EB",
          }, isWebDesktop && {
            alignSelf: 'center',
            marginHorizontal: 24,
            maxWidth: 760,
            width: '100%',
            backgroundColor: webCardBackground,
            borderColor: isDark ? '#1E293B' : '#D9E2F1',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.12,
            shadowRadius: 24,
            elevation: 8,
          }]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: aiModeEnabled
                      ? colors.primary
                      : isDark
                        ? "#374151"
                        : "#D1D5DB",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={aiModeEnabled ? "sparkles" : "shuffle"}
                    size={18}
                    color="#FFF"
                  />
                </View>
                <View>
                  <Text
                    style={{
                      fontFamily: "Poppins_600SemiBold",
                      fontSize: 14,
                      color: webTextColor,
                    }}
                  >
                    {aiModeEnabled ? "🤖 AI Recommendations" : "🎲 Random Mode"}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Poppins_400Regular",
                      fontSize: 11,
                      color: webTextSecondary,
                      marginTop: -2,
                    }}
                  >
                    {aiModeEnabled
                      ? `${aiFeedProvider}${aiRecommendations.length > 0 ? ` • ${aiRecommendations.length} matches` : ""}`
                      : "Showing random listings for comparison"}
                  </Text>
                </View>
              </View>
            </View>
            <Switch
              value={aiModeEnabled}
              onValueChange={(value) => {
                setAiModeEnabled(value);
                // Update featured/discover based on mode
                if (value && aiRecommendations.length > 0) {
                  const diversifiedAiItems = takeItemsWithTypeVariety(aiRecommendations, 20);
                  setFeatured(diversifiedAiItems.slice(0, 10));
                  setDiscover(diversifiedAiItems.slice(10, 20));
                } else {
                  const diversifiedRandomItems = takeItemsWithTypeVariety(randomRecommendations, 20);
                  setFeatured(diversifiedRandomItems.slice(0, 10));
                  setDiscover(diversifiedRandomItems.slice(10, 20));
                }
              }}
              trackColor={{
                false: isDark ? "#374151" : "#D1D5DB",
                true: colors.primary + "60",
              }}
              thumbColor={aiModeEnabled ? colors.primary : "#9CA3AF"}
            />
          </View>

          {/* AI Similarity Preview */}
          {aiModeEnabled && aiRecommendations.length > 0 && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                  borderTopColor: isDark ? "#334155" : "#DBE3F0",
              }}
            >
              <Text
                style={{
                  fontFamily: "Poppins_500Medium",
                  fontSize: 11,
                    color: webTextSecondary,
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {hasAiSimilarityMatches
                  ? `Top Matches (${aiFeedProvider})`
                  : "Locally ranked by popularity and freshness"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {aiPreviewItems.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: isDark ? "#334155" : "#E8EEF8",
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 12,
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Poppins_500Medium",
                        fontSize: 11,
                        color: webTextColor,
                      }}
                      numberOfLines={1}
                    >
                      {item.name?.substring(0, 15)}
                      {item.name?.length > 15 ? "..." : ""}
                    </Text>
                    <View
                      style={{
                        backgroundColor:
                          item.similarity > 0.1 ? colors.primary : "#6B7280",
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          fontSize: 9,
                          color: "#FFF",
                        }}
                      >
                        {item.similarity > 0.1
                          ? `${((item.similarity || 0) * 100).toFixed(0)}%`
                          : item.type}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* No AI Data Message */}
          {aiModeEnabled && aiRecommendations.length === 0 && userId && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: isDark ? "#334155" : "#DBE3F0",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name="information-circle"
                size={16}
                color={colors.textSecondary}
              />
              <Text
                style={{
                  fontFamily: "Poppins_400Regular",
                  fontSize: 11,
                  color: webTextSecondary,
                  flex: 1,
                }}
              >
                {aiFeedMessage || "Add profile skills and genres for stronger AI ranking signals."}
              </Text>
            </View>
          )}

          {aiModeEnabled && aiFeedMessage.length > 0 && aiRecommendations.length > 0 && (
            <View
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: isDark ? "#334155" : "#DBE3F0",
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Ionicons
                name="information-circle"
                size={16}
                color={colors.textSecondary}
              />
              <Text
                style={{
                  fontFamily: "Poppins_400Regular",
                  fontSize: 11,
                  color: webTextSecondary,
                  flex: 1,
                }}
              >
                {aiFeedMessage}
              </Text>
            </View>
          )}
        </View>

        {renderHighlightsSection()}

        {renderSmartFeed()}

        {renderUpcomingEvents()}

        {renderNewArrivals()}

        {/* Recently Viewed Section - Custom Cards */}
        {recentlyViewed.length > 0 && (
              <View style={styles.sectionContainer}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 24,
                    marginBottom: 12,
                  }}
                >
                  <Text style={[styles.sectionTitle, { color: webTextColor }]}>
                    Recently Viewed
                  </Text>
                  <TouchableOpacity activeOpacity={1} onPress={openRecentlyViewedSheet}>
                    <Text
                      style={{
                        color: colors.primary,
                        fontFamily: "Poppins_500Medium",
                        fontSize: moderateScale(12),
                      }}
                    >
                      See all
                    </Text>
                  </TouchableOpacity>
                </View>
                <ResponsiveList
                  contentContainerStyle={{
                    paddingLeft: 24,
                    paddingRight: 24,
                    paddingVertical: 8,
                  }}
                  snapToInterval={240 + 16}
                >
                  {recentlyViewed.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={1}
                      onPress={() => handleCardPress(item)}
                      style={[
                        styles.recentlyViewedCard,
                        isWebDesktop && { flex: 1, minWidth: 240, maxWidth: 320, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { height: 6, width: 0 } },
                        { backgroundColor: webCardBackground },
                      ]}
                    >
                      {/* Image Section */}
                      <View style={styles.recentlyViewedImageContainer}>
                        {((item.images && item.images.length > 0) || item.image) ? (
                          <AutoCardImage
                            image={item.image}
                            images={item.images}
                            style={styles.recentlyViewedImage}
                            width={480}
                            height={200}
                            cacheVersion={item.updated_at || item.created_at || item.id}
                          />
                        ) : (
                          <View
                            style={[
                              styles.recentlyViewedImagePlaceholder,
                              { backgroundColor: colors.primary + "20" },
                            ]}
                          >
                            <Ionicons
                              name={
                                item.type === "Gig"
                                  ? "musical-notes"
                                  : item.type === "Studio"
                                    ? "business"
                                    : "people"
                              }
                              size={24}
                              color={colors.primary}
                            />
                          </View>
                        )}
                        {/* Type Badge */}
                        <View
                          style={[
                            styles.recentlyViewedTypeBadge,
                            { backgroundColor: getTypeBadgeColor(item.type) },
                          ]}
                        >
                          <Text style={styles.recentlyViewedTypeBadgeText}>
                            {item.type}
                          </Text>
                        </View>
                      </View>

                      {/* Details Section */}
                      <View style={styles.recentlyViewedDetails}>
                        <Text
                          style={[
                            styles.recentlyViewedName,
                            { color: colors.text },
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        {/* Location/Genre */}
                        <View style={styles.recentlyViewedRow}>
                          <Ionicons
                            name="location-outline"
                            size={12}
                            color={colors.textSecondary}
                          />
                          <Text
                            style={[
                              styles.recentlyViewedText,
                              { color: colors.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {item.location || item.genre || "Location TBA"}
                          </Text>
                        </View>

                        {/* Rating - Compact */}
                        <View style={styles.recentlyViewedRow}>
                          <Ionicons name="star" size={12} color="#FCD34D" />
                          <Text
                            style={[
                              styles.recentlyViewedText,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {item.rating > 0 ? item.rating.toFixed(1) : "New"}
                          </Text>
                          <View style={{ flex: 1 }} />
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={colors.textSecondary}
                          />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ResponsiveList>
              </View>
            )}
        </View>
      </ScrollView>

      <Navbar />

      <ListingDetailsSheet
        ref={bottomSheetRef}
        listingId={selectedListingId}
        onDismiss={handleListingDetailsDismiss}
      />
      <SearchBottomSheet
        ref={searchSheetRef}
        onClose={() => {}}
        onItemPress={(id) => {
          debugLog("=== SearchBottomSheet onItemPress ===");
          debugLog("Item ID from search:", id);
          openListingDetails(id, { restoreSearchOnClose: true });
          debugLog("openDetailsSheet called from search");
        }}
        onChat={handleChat}
      />
      <RecentlyViewedSheet
        ref={recentlyViewedSheetRef}
        onClose={() => {}}
        onItemPress={(id) => {
          debugLog("=== RecentlyViewedSheet onItemPress ===");
          debugLog("Item ID from recently viewed:", id);
          openListingDetails(id);
          debugLog("openDetailsSheet called from recently viewed");
        }}
        onChat={handleChat}
      />

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
    width: "100%",
  },
  pageFrameWeb: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  homeScrollContent: {
    paddingBottom: 180,
  },
  homeScrollContentWeb: {
    paddingBottom: 220,
  },
  homeContent: {
    width: "100%",
    flex: 1,
  },
  homeContentWeb: {
    maxWidth: 1240,
    alignSelf: "center",
  },
  profileBannerWrapWeb: {
    marginTop: 18,
    paddingHorizontal: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // Hero
  heroContainer: {
    height:
      height < 700
        ? Math.max(height * 0.45, 340)
        : Math.max(verticalScale(350), height * 0.38),
    width: "100%",
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)", // Base darken
  },
  heroContent: {
    position: "absolute",
    bottom: height < 700 ? 16 : 40,
    left: 24, // Standardized alignment
    right: 24, // Standardized alignment
    zIndex: 10,
  },
  heroGreeting: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: Platform.OS === 'web' ? 48 : height < 700 ? moderateScale(24) : moderateScale(32),
    color: "#FFF",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: height < 700 ? moderateScale(2) : moderateScale(4),
  },
  heroSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: Platform.OS === 'web' ? 18 : height < 700 ? moderateScale(12) : moderateScale(14),
    color: "rgba(255,255,255,0.95)",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: height < 700 ? moderateScale(12) : moderateScale(20),
  },
  searchPill: {
    borderRadius: 100,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  searchTouch: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: height < 700 ? 16 : 20, // Slightly cleaner fixed padding
    paddingVertical: height < 700 ? moderateScale(12) : moderateScale(16),
  },
  searchTexts: {
    marginLeft: 8,
  },
  searchPlaceholder: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(15),
  },
  searchSubPlaceholder: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(12),
  },

  // Web Hero
  webHeroShell: {
    marginTop: 12,
    borderRadius: 32,
    minHeight: 500,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    position: "relative",
  },
  webHeroGlowOne: {
    position: "absolute",
    top: -70,
    left: -30,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(45, 212, 191, 0.18)",
  },
  webHeroGlowTwo: {
    position: "absolute",
    bottom: -110,
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: "rgba(56, 189, 248, 0.16)",
  },
  webHeroGrid: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 500,
    paddingHorizontal: 44,
    paddingVertical: 36,
  },
  webHeroCopy: {
    flex: 1,
    paddingRight: 40,
    zIndex: 2,
  },
  webHeroTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 50,
    lineHeight: 60,
    letterSpacing: -0.6,
  },
  webHeroDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 17,
    marginTop: 22,
    marginBottom: 34,
    maxWidth: 520,
    lineHeight: 28,
  },
  webHeroButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    alignSelf: "flex-start",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 7,
  },
  webHeroButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "#FFF",
  },
  webHeroWidgets: {
    flex: 1,
    position: "relative",
    minHeight: 390,
  },
  webHeroWidgetTop: {
    position: "absolute",
    top: 6,
    right: 28,
    width: 228,
    borderRadius: 24,
    padding: 22,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 8,
  },
  webHeroWidgetBottom: {
    position: "absolute",
    bottom: 0,
    left: 10,
    width: 290,
    borderRadius: 24,
    padding: 22,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  webHeroWidgetLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  webHeroWidgetValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 38,
    marginTop: 8,
  },
  webHeroWidgetDelta: {
    fontSize: 15,
    color: "#14B8A6",
    fontFamily: "Poppins_600SemiBold",
  },
  webHeroBarsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 52,
    marginTop: 20,
    gap: 6,
  },
  webHeroBar: {
    flex: 1,
    borderRadius: 6,
  },
  webHeroRingWrap: {
    width: 112,
    height: 112,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  webHeroRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 18,
  },
  webHeroRingCut: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  webHeroWidgetHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },

  // Section Commons
  sectionContainer: {
    marginTop: 32,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(20),
    marginLeft: 0, // Removed double margin
    textAlign: "left",
  },
  sectionSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(13),
    marginLeft: 0,
    marginTop: -2,
  },

  // Bento Grid Styles
  bentoGrid: {
    flexDirection: "row",
    gap: 12,
    height: Platform.OS === 'web' ? 420 : 280, // Fixed height for the bento block
  },
  bentoTouchableLarge: {
    flex: 1.5,
    borderRadius: 24,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    backgroundColor: "#FFF", // Needed for shadow
  },
  bentoTouchableSmall: {
    flex: 1,
    borderRadius: 24,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    backgroundColor: "#FFF", // Needed for shadow
  },
  bentoLarge: {
    flex: 1,
    position: "relative",
    backgroundColor: "#f3f4f6",
    borderRadius: 24, // Re-apply for safety
    overflow: "hidden",
  },
  bentoColumn: {
    flex: 1,
    flexDirection: "column",
    gap: 12,
  },
  bentoSmall: {
    flex: 1,
    position: "relative",
    backgroundColor: "#f3f4f6",
    borderRadius: 24, // Re-apply for safety
    overflow: "hidden",
  },
  bentoImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    borderRadius: 24, // Re-apply for safety
  },
  bentoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    padding: 12,
    borderRadius: 24, // Re-apply for safety
  },
  bentoContent: {
    gap: 4,
  },
  bentoTitleLarge: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
    lineHeight: 24,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  bentoTitleSmall: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 2,
  },
  bentoSubtitle: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  bentoRating: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    marginLeft: 4,
  },
  glassBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignSelf: "flex-start",
  },
  glassBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },

  // Featured Card (For You)
  featuredCard: {
    width: "100%",
    height: verticalScale(320), // Taller
    borderRadius: 32, // Parent has 32
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    position: "relative",
    backgroundColor: "#FFF", // Needed for shadow
  },
  featuredImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
    borderRadius: 32, // Match parent
  },
  featuredGradient: {
    ...StyleSheet.absoluteFillObject,
    padding: 24,
    justifyContent: "space-between",
    borderRadius: 32, // Match parent
  },
  featuredBadge: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  featuredBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
  },
  featuredTitle: {
    color: "#FFF",
    fontFamily: "Poppins_700Bold",
    fontSize: moderateScale(26), // Large Typography
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  featuredLocation: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Poppins_500Medium",
    fontSize: moderateScale(14),
  },
  featuredPrice: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  featuredRating: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginLeft: 4,
  },
  tagBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  tagText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
  },

  // Upcoming Events (for Musicians)
  upcomingEventCard: {
    width: 280,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: Platform.OS === "web" ? 0 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  upcomingEventImageContainer: {
    width: "100%",
    height: 120,
    position: "relative",
  },
  upcomingEventImage: {
    width: "100%",
    height: "100%",
  },
  upcomingEventImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingEventTypeBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  upcomingEventTypeBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  upcomingEventDetails: {
    padding: 16,
  },
  upcomingEventName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    marginBottom: 8,
  },
  upcomingEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  upcomingEventText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    flex: 1,
  },
  upcomingEventPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
  },
  upcomingEventStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
  },
  upcomingEventStatusText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },

  // New Arrivals Section
  newArrivalCard: {
    width: 280,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: Platform.OS === "web" ? 0 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  newArrivalImageContainer: {
    width: "100%",
    height: 140,
    position: "relative",
  },
  newArrivalImage: {
    width: "100%",
    height: "100%",
  },
  newArrivalImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  newArrivalTypeBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  newArrivalTypeBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  newArrivalNewBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.96)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  newArrivalNewDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  newArrivalNewBadgeText: {
    color: "#EF4444",
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
  },
  newArrivalDetails: {
    padding: 14,
  },
  newArrivalName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    marginBottom: 6,
  },
  newArrivalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  newArrivalText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  newArrivalPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    marginTop: 6,
  },

  // Recently Viewed Section
  recentlyViewedCard: {
    width: 240,
    borderRadius: 16,
    overflow: "hidden",
    marginRight: Platform.OS === "web" ? 0 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  recentlyViewedImageContainer: {
    width: "100%",
    height: 100,
    position: "relative",
  },
  recentlyViewedImage: {
    width: "100%",
    height: "100%",
  },
  recentlyViewedImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  recentlyViewedTypeBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  recentlyViewedTypeBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  recentlyViewedDetails: {
    padding: 12,
  },
  recentlyViewedName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 4,
  },
  recentlyViewedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  recentlyViewedText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    flex: 1,
  },

  // Empty states
  emptyText: {
    marginTop: 16,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  emptySubtext: {
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    textAlign: "center",
  },

  // For You Section (Custom Card)
  forYouCard: {
    width: 280,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: Platform.OS === "web" ? 0 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  forYouImageContainer: {
    width: "100%",
    height: 140,
    position: "relative",
  },
  forYouImage: {
    width: "100%",
    height: "100%",
  },
  forYouImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  forYouTypeBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  forYouTypeBadgeText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
  forYouDetails: {
    padding: 14,
  },
  forYouName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    marginBottom: 6,
  },
  forYouRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  forYouText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  forYouPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    marginTop: 6,
  },
});

