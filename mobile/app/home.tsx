import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import CustomAlert from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import Navbar from "../src/components/navbar";
import { ProfileCompletionBanner } from "../src/components/ProfileCompletionBanner";
import ProductionTeamDetailsSheet from "../src/components/ProductionTeamDetailsSheet";
import RecentlyViewedSheet from "../src/components/RecentlyViewedSheet";
import SearchBottomSheet from "../src/components/SearchBottomSheet";
import Skeleton from "../src/components/Skeleton";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useTheme } from "../src/context/ThemeContext";
import {
  getGroqModelInfo,
  rerankHomeFeedWithGroq,
} from "../src/services/groqModelRouter";
import { getScreenCacheKey, peekScreenCache, readScreenCache, writeScreenCache } from "../src/utils/screenCache";

const { width, height } = Dimensions.get("window");

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scale = (size: number) => {
  const newSize = (width / 375) * size;
  return Math.max(newSize, size * 0.85); // Minimum 85% of original size
};
const verticalScale = (size: number) => {
  // Use more conservative scaling for height to prevent over-shrinking on small devices
  const baseHeight = 812;
  const ratio = height / baseHeight;
  // Clamp ratio between 0.8 and 1.2 to prevent extreme scaling
  const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
  return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor; // Reduced factor from 0.5 to 0.3 for less aggressive scaling
};

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

const debugLog = (..._args: unknown[]) => { };

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

const HOME_CACHE_TTL_MS = 60_000;
const HOME_FOCUS_REFRESH_COOLDOWN_MS = 20_000;
const HOME_AI_RERANK_COOLDOWN_MS = 5 * 60 * 1000;
const HOME_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const VIEWED_NEW_ARRIVALS_STORAGE_KEY = "viewed_new_arrivals";
const RECENTLY_VIEWED_STORAGE_KEY = "recently_viewed_items";

type HomeFeedCachePayload = {
  fetchedAt: number;
  featured: any[];
  discover: any[];
  newArrivals: any[];
  randomRecommendations: any[];
  aiRecommendations: any[];
  aiFeedProvider: string;
  aiFeedMessage: string;
  aiRerankAt?: number;
};

type HomeProfileCachePayload = {
  fetchedAt: number;
  userName: string;
  hasGroups: boolean;
};

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
  const { userRole, userId, isGuest, roleResolved } = useAuth();
  const insets = useSafeAreaInsets();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const params = useLocalSearchParams<{ reopenListingId?: string }>();

  const homeCacheBaseParams = useMemo(
    () => ({
      userId: userId || "guest",
      isGuest,
    }),
    [userId, isGuest],
  );

  const homeCacheKey = useMemo(
    () => getScreenCacheKey("mobile-home-feed", {
      ...homeCacheBaseParams,
      userRole: userRole || "guest",
    }),
    [homeCacheBaseParams, userRole],
  );

  const homeFallbackCacheKey = useMemo(
    () => getScreenCacheKey("mobile-home-feed", homeCacheBaseParams),
    [homeCacheBaseParams],
  );

  const homeProfileCacheKey = useMemo(
    () => getScreenCacheKey("mobile-home-profile", {
      userId: userId || "guest",
      isGuest,
    }),
    [userId, isGuest],
  );

  const initialHomeFeedSnapshot = useMemo(
    () =>
      peekScreenCache<HomeFeedCachePayload>(homeCacheKey, HOME_CACHE_TTL_MS) ??
      peekScreenCache<HomeFeedCachePayload>(homeFallbackCacheKey, HOME_CACHE_TTL_MS),
    [homeCacheKey, homeFallbackCacheKey],
  );

  const initialHomeProfileSnapshot = useMemo(
    () => peekScreenCache<HomeProfileCachePayload>(homeProfileCacheKey, HOME_PROFILE_CACHE_TTL_MS),
    [homeProfileCacheKey],
  );

  const [loading, setLoading] = useState(() => initialHomeFeedSnapshot == null);
  const [refreshing, setRefreshing] = useState(false);
  const [featured, setFeatured] = useState<any[]>(() =>
    Array.isArray(initialHomeFeedSnapshot?.featured) ? initialHomeFeedSnapshot.featured : [],
  );
  const [discover, setDiscover] = useState<any[]>(() =>
    Array.isArray(initialHomeFeedSnapshot?.discover) ? initialHomeFeedSnapshot.discover : [],
  );
  const [newArrivals, setNewArrivals] = useState<any[]>(() =>
    Array.isArray(initialHomeFeedSnapshot?.newArrivals) ? initialHomeFeedSnapshot.newArrivals : [],
  ); // New Arrivals State
  const [viewedNewArrivals, setViewedNewArrivals] = useState<Set<string>>(new Set());
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [userName, setUserName] = useState(() => initialHomeProfileSnapshot?.userName || "Guest");
  const [timeGreeting, setTimeGreeting] = useState("Hey");
  const groqInfo = getGroqModelInfo();
  const groqModelLabel = groqInfo.modelLabel;
  const groqConfigured = groqInfo.configured;
  const groqModelSource = groqInfo.modelSource;
  const groqApiKeySource = groqInfo.apiKeySource;
  const groqApiKeySignature = groqInfo.apiKeySignature;

  // AI Recommendation Mode
  const aiModeEnabled = true;
  const strictLlmModeForAiPages = true;
  const showForYouAiCard = false;
  const [aiRecommendations, setAiRecommendations] = useState<any[]>(() =>
    Array.isArray(initialHomeFeedSnapshot?.aiRecommendations) ? initialHomeFeedSnapshot.aiRecommendations : [],
  );
  const [randomRecommendations, setRandomRecommendations] = useState<any[]>(() =>
    Array.isArray(initialHomeFeedSnapshot?.randomRecommendations) ? initialHomeFeedSnapshot.randomRecommendations : [],
  );
  const [aiFeedProvider, setAiFeedProvider] = useState(
    () => initialHomeFeedSnapshot?.aiFeedProvider || groqModelLabel,
  );
  const [aiFeedMessage, setAiFeedMessage] = useState(
    () => initialHomeFeedSnapshot?.aiFeedMessage || "",
  );
  const [isHomeLlmRerankPending, setIsHomeLlmRerankPending] = useState(false);

  const homeAiStatusLabel = useMemo(() => {
    if (!userId) return "AI status: Sign in required";

    const providerText = aiFeedProvider || groqModelLabel;
    const hasResults = aiRecommendations.length > 0;

    if (isHomeLlmRerankPending) {
      return `AI status: Fetching ${groqModelLabel} picks...`;
    }

    if (hasResults) {
      return `AI status: Working (${providerText})`;
    }

    if (!groqConfigured) {
      return "AI status: Groq API key not configured";
    }

    if (aiFeedMessage && aiFeedMessage.trim().length > 0) {
      return `AI status: ${aiFeedMessage}`;
    }

    return "AI status: Initializing...";
  }, [
    aiFeedProvider,
    aiFeedMessage,
    aiRecommendations.length,
    groqConfigured,
    groqModelLabel,
    isHomeLlmRerankPending,
    userId,
  ]);

  // ... refs ...
  const bottomSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const productionTeamSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const searchSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const recentlyViewedSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const restoreSearchAfterDetailsCloseRef = React.useRef(false);
  const restoreSearchAfterProductionCloseRef = React.useRef(false);
  const homeRealtimeRefreshTimerRef =
    React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeDataFetchInFlightRef = React.useRef(false);
  const hasHydratedHomeCacheRef = React.useRef(Boolean(initialHomeFeedSnapshot));
  const homeLlmRequestIdRef = React.useRef(0);
  const homeLlmRerankInFlightRef = React.useRef(false);
  const lastHomeAiRerankAtRef = React.useRef(initialHomeFeedSnapshot?.aiRerankAt || 0);
  const lastHomeRefreshAtRef = React.useRef(initialHomeFeedSnapshot?.fetchedAt || 0);
  const lastProfileRefreshAtRef = React.useRef(initialHomeProfileSnapshot?.fetchedAt || 0);
  const viewedNewArrivalsLoadedRef = React.useRef(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );
  const [selectedProductionTeamId, setSelectedProductionTeamId] = useState<string | null>(
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

  const applyHomeFeedSnapshot = useCallback((snapshot: HomeFeedCachePayload) => {
    setFeatured(Array.isArray(snapshot.featured) ? snapshot.featured : []);
    setDiscover(Array.isArray(snapshot.discover) ? snapshot.discover : []);
    setNewArrivals(Array.isArray(snapshot.newArrivals) ? snapshot.newArrivals : []);
    setRandomRecommendations(Array.isArray(snapshot.randomRecommendations) ? snapshot.randomRecommendations : []);
    setAiRecommendations(Array.isArray(snapshot.aiRecommendations) ? snapshot.aiRecommendations : []);
    setAiFeedProvider(snapshot.aiFeedProvider || groqModelLabel);
    setAiFeedMessage(snapshot.aiFeedMessage || "");
    lastHomeAiRerankAtRef.current = snapshot.aiRerankAt || 0;
    lastHomeRefreshAtRef.current = snapshot.fetchedAt || Date.now();
    hasHydratedHomeCacheRef.current = true;
  }, [groqModelLabel]);

  const loadViewedNewArrivals = useCallback(async () => {
    if (viewedNewArrivalsLoadedRef.current) {
      return;
    }

    try {
      const json = await AsyncStorage.getItem(VIEWED_NEW_ARRIVALS_STORAGE_KEY);
      if (json) {
        setViewedNewArrivals(new Set(JSON.parse(json)));
      }
    } catch {
      // Ignore local storage read failures.
    } finally {
      viewedNewArrivalsLoadedRef.current = true;
    }
  }, []);

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

  const openProductionTeamSheet = useCallback(() => {
    presentModalWithRetry(productionTeamSheetRef as any);
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

  const openProductionTeamDetails = useCallback(
    (
      teamId: string,
      options?: {
        restoreSearchOnClose?: boolean;
      },
    ) => {
      if (!teamId) return;

      restoreSearchAfterProductionCloseRef.current =
        options?.restoreSearchOnClose === true;
      setSelectedProductionTeamId(teamId);
      openProductionTeamSheet();
    },
    [openProductionTeamSheet],
  );

  const handleProductionTeamDetailsDismiss = useCallback(() => {
    const shouldRestoreSearch = restoreSearchAfterProductionCloseRef.current;

    restoreSearchAfterProductionCloseRef.current = false;
    setSelectedProductionTeamId(null);

    if (!shouldRestoreSearch) {
      return;
    }

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
    if (aiRecommendations.length > 0) {
      debugLog("Switching to AI recommendations");
      const diversifiedAiItems = takeItemsWithTypeVariety(aiRecommendations, 20);
      setFeatured(diversifiedAiItems.slice(0, 10));
      setDiscover(diversifiedAiItems.slice(10, 20));
    } else if (randomRecommendations.length > 0) {
      debugLog("Switching to random recommendations");
      const diversifiedRandomItems = takeItemsWithTypeVariety(randomRecommendations, 20);
      setFeatured(diversifiedRandomItems.slice(0, 10));
      setDiscover(diversifiedRandomItems.slice(10, 20));
    }
  }, [aiRecommendations, randomRecommendations]);

  useEffect(() => {
    if (!userId) return;

    const providerText = aiFeedProvider || groqModelLabel;
    const aiFeedActive = aiRecommendations.length > 0;

  }, [
    aiFeedProvider,
    aiFeedMessage,
    aiRecommendations.length,
    groqApiKeySignature,
    groqApiKeySource,
    groqConfigured,
    groqModelLabel,
    groqModelSource,
    isHomeLlmRerankPending,
    userId,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (initialHomeFeedSnapshot) {
      applyHomeFeedSnapshot(initialHomeFeedSnapshot);
      setLoading(false);
    }

    if (initialHomeProfileSnapshot) {
      setUserName(initialHomeProfileSnapshot.userName || "Guest");
      setHasGroups(Boolean(initialHomeProfileSnapshot.hasGroups));
      lastProfileRefreshAtRef.current = initialHomeProfileSnapshot.fetchedAt || Date.now();
    } else if (isGuest) {
      setUserName("Guest");
      setHasGroups(false);
    }

    hasHydratedHomeCacheRef.current = Boolean(initialHomeFeedSnapshot);
    lastHomeAiRerankAtRef.current = initialHomeFeedSnapshot?.aiRerankAt || 0;
    lastHomeRefreshAtRef.current = initialHomeFeedSnapshot?.fetchedAt || 0;
    lastProfileRefreshAtRef.current = initialHomeProfileSnapshot?.fetchedAt || lastProfileRefreshAtRef.current;

    void (async () => {
      const [cachedHomeFeed, cachedFallbackHomeFeed, cachedProfile] = await Promise.all([
        readScreenCache<HomeFeedCachePayload>(homeCacheKey, HOME_CACHE_TTL_MS),
        readScreenCache<HomeFeedCachePayload>(homeFallbackCacheKey, HOME_CACHE_TTL_MS),
        readScreenCache<HomeProfileCachePayload>(homeProfileCacheKey, HOME_PROFILE_CACHE_TTL_MS),
      ]);
      const resolvedHomeFeed = cachedHomeFeed ?? cachedFallbackHomeFeed;

      if (cancelled) {
        return;
      }

      if (resolvedHomeFeed) {
        applyHomeFeedSnapshot(resolvedHomeFeed);
        setLoading(false);
      }

      if (cachedProfile) {
        setUserName(cachedProfile.userName || "Guest");
        setHasGroups(Boolean(cachedProfile.hasGroups));
        lastProfileRefreshAtRef.current = cachedProfile.fetchedAt || Date.now();
      } else if (isGuest) {
        setUserName("Guest");
        setHasGroups(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyHomeFeedSnapshot,
    homeCacheKey,
    homeFallbackCacheKey,
    homeProfileCacheKey,
    initialHomeFeedSnapshot,
    initialHomeProfileSnapshot,
    isGuest,
  ]);

  useEffect(() => {
    if (
      featured.length === 0 &&
      discover.length === 0 &&
      newArrivals.length === 0 &&
      randomRecommendations.length === 0 &&
      aiRecommendations.length === 0
    ) {
      return;
    }

    const payload: HomeFeedCachePayload = {
      fetchedAt: lastHomeRefreshAtRef.current || Date.now(),
      featured,
      discover,
      newArrivals,
      randomRecommendations,
      aiRecommendations,
      aiFeedProvider,
      aiFeedMessage,
      aiRerankAt: lastHomeAiRerankAtRef.current || 0,
    };

    void Promise.all([
      writeScreenCache(homeCacheKey, payload),
      writeScreenCache(homeFallbackCacheKey, payload),
    ]);
  }, [
    aiFeedMessage,
    aiFeedProvider,
    aiRecommendations,
    discover,
    featured,
    homeCacheKey,
    homeFallbackCacheKey,
    newArrivals,
    randomRecommendations,
  ]);

  useFocusEffect(
    useCallback(() => {
      debugLog("useFocusEffect triggered, userRole:", userRole);
      const isFirstLoad =
        featured.length === 0 &&
        discover.length === 0 &&
        !hasHydratedHomeCacheRef.current;
      debugLog("isFirstLoad:", isFirstLoad);

      const shouldRefreshHome =
        isFirstLoad ||
        Date.now() - lastHomeRefreshAtRef.current >= HOME_FOCUS_REFRESH_COOLDOWN_MS;
      const shouldRefreshProfile =
        Boolean(userId) && (
          lastProfileRefreshAtRef.current === 0 ||
          Date.now() - lastProfileRefreshAtRef.current >= HOME_PROFILE_CACHE_TTL_MS
        );

      if (shouldRefreshHome) {
        void fetchHomeData(isFirstLoad, { bypassCooldown: isFirstLoad });
      }

      if (shouldRefreshProfile) {
        void fetchUserProfile();
      } else if (isGuest) {
        setUserName("Guest");
        setHasGroups(false);
      }

      void fetchRecentlyViewed();
      void loadViewedNewArrivals();
      setTimeBasedGreeting();

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
    }, [discover.length, featured.length, isGuest, loadViewedNewArrivals, params.reopenListingId, roleResolved, userId, userRole]),
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
  }, [roleResolved, userId, userRole]);

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
    ]);
    setRefreshing(false);
  }, [isGuest, roleResolved, userId, userRole]);

  const setTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setTimeGreeting("Good morning");
    else if (hour < 18) setTimeGreeting("Good afternoon");
    else setTimeGreeting("Good evening");
  };

  const [hasGroups, setHasGroups] = useState(() => Boolean(initialHomeProfileSnapshot?.hasGroups));

  const topItems = useMemo(() => {
    const combined = [...featured, ...discover];
    const dedupedCombined = combined.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id),
    );

    if (dedupedCombined.length > 0) {
      return takeItemsWithTypeVariety(dedupedCombined, 12);
    }

    const dedupedRandom = randomRecommendations.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id),
    );
    return takeItemsWithTypeVariety(dedupedRandom, 12);
  }, [featured, discover, randomRecommendations]);

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

      if (!user) {
        setUserName("Guest");
        setHasGroups(false);
        return;
      }

      const profileNameResponse = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const groupCountResponse = await supabase
        .from("groups")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);

      const nextUserName = profileNameResponse.data?.full_name
        ? profileNameResponse.data.full_name.split(" ")[0]
        : "Guest";
      const nextHasGroups = groupCountResponse.count ? groupCountResponse.count > 0 : false;

      setUserName(nextUserName);
      setHasGroups(nextHasGroups);
      lastProfileRefreshAtRef.current = Date.now();

      await writeScreenCache<HomeProfileCachePayload>(homeProfileCacheKey, {
        fetchedAt: lastProfileRefreshAtRef.current,
        userName: nextUserName,
        hasGroups: nextHasGroups,
      });
    } catch (e) {
      debugLog("Error fetching user profile:", e);
    }
  };

  const fetchHomeData = async (
    showLoading = true,
    options?: { bypassCooldown?: boolean },
  ) => {
    debugLog("fetchHomeData called, showLoading:", showLoading);
    if (Boolean(userId) && !isGuest && !roleResolved) {
      debugLog("Skipping home fetch while user role is still resolving");
      return;
    }

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
    const hasVisibleFeed =
      featured.length > 0 ||
      discover.length > 0 ||
      newArrivals.length > 0 ||
      randomRecommendations.length > 0 ||
      aiRecommendations.length > 0;

    if (showLoading && !hasVisibleFeed) setLoading(true);
    try {
      // Fetch based on Role
      // If Owner, ONLY fetch groups (musicians)
      let groups: any[] = [];
      let studios: any[] = [];
      let gigs: any[] = [];
      let soloArtists: any[] = [];

      const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
      const isProducer = userRole === "producer";
      debugLog("User role:", userRole, "isOwner:", isOwner, "isProducer:", isProducer);

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
      if (gError) debugLog("Error fetching groups:", gError);
      groups = gData || [];
      debugLog("Groups fetched:", groups.length);

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
      if (pError) debugLog("Error fetching profiles:", pError);

      const profileIds = (pData || [])
        .map((artist: any) => artist?.id)
        .filter((value: any): value is string => typeof value === "string" && value.length > 0);

      let profileGenresById = new Map<string, string[]>();
      let profileSkillsById = new Map<string, string[]>();
      let profileStatsById = new Map<string, { rating: number; review_count: number; completion_rate: number | null }>();

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
                completion_rate: row?.completion_rate !== null &&
                  row?.completion_rate !== undefined &&
                  row?.completion_rate !== "" &&
                  Number.isFinite(Number(row?.completion_rate))
                  ? Number(row.completion_rate)
                  : null,
              },
            ]),
        );
      }

      soloArtists = (pData || []).map((artist: any) => ({
        ...artist,
        genres: profileGenresById.get(artist.id) || [],
        skills: profileSkillsById.get(artist.id) || [],
        rating: profileStatsById.get(artist.id)?.rating || 0,
        review_count: profileStatsById.get(artist.id)?.review_count || 0,
        completion_rate: profileStatsById.get(artist.id)?.completion_rate ?? null,
      }));
      debugLog("Solo artists fetched:", soloArtists.length);

      const groupOwnerPreferenceMap = new Map<string, boolean>();
      const groupOwnerAvatarMap = new Map<string, string>();
      const groupOpenApplicationsMap = new Map<string, boolean>();
      const groupGigCountsMap = new Map<string, { active: number; upcoming: number; done: number }>();
      const soloGigCountsMap = new Map<string, { active: number; upcoming: number; done: number }>();

      const groupOwnerIds = Array.from(
        new Set((groups || []).map((group: any) => group.owner_id).filter(Boolean)),
      );

      if (groupOwnerIds.length > 0) {
        const { data: ownerPrefs } = await supabase
          .from("profiles")
          .select("id, show_gig_statuses, avatar_url")
          .in("id", groupOwnerIds);

        (ownerPrefs || []).forEach((row: any) => {
          groupOwnerPreferenceMap.set(row.id, row.show_gig_statuses !== false);
          if (typeof row?.avatar_url === "string" && row.avatar_url.length > 0) {
            groupOwnerAvatarMap.set(row.id, row.avatar_url);
          }
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
          groupOpenApplicationsMap.set(row.id, row.open_group_applications === true);
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
        debugLog("Studios fetched:", studios.length);

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
            debugLog("Studios augmented with date overrides");
          }

          // Fetch active promotions for studios
          const todayStr = new Date().toISOString().split("T")[0];
          const { data: studioPromos } = await supabase
            .from("studio_promotions")
            .select("studio_id")
            .in("studio_id", studioIds)
            .eq("is_active", true)
            .or(`is_permanent.eq.true,and(start_date.lte.${todayStr},end_date.gte.${todayStr})`);

          if (studioPromos) {
            const promoStudioIds = new Set(studioPromos.map((p: any) => p.studio_id));
            studios = studios.map((studio: any) => ({
              ...studio,
              has_active_promotion: promoStudioIds.has(studio.id),
            }));
            debugLog("Studios augmented with promotion flags");
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
        debugLog(`Fetched ${gigs.length} open gigs for role: ${userRole}`);
      } else {
        debugLog(`Skipping gigs fetch - user is owner (role: ${userRole})`);
      }

      // Normalize
      const normalize = (items: any[], type: string) =>
        items.map((item) => ({
          id: item.id,
          type,
          name: item.name || item.full_name, // Handle profile name
          image: item.images?.[0] || item.avatar_url || null, // Handle profile avatar
          images: item.images || (item.avatar_url ? [item.avatar_url] : []),
          owner_avatar_url:
            type === "Group"
              ? groupOwnerAvatarMap.get(item.owner_id) || null
              : null,
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
              ? groupOpenApplicationsMap.get(item.id) ?? item.open_group_applications === true
              : undefined,
          // Seasonal pricing fields for studios
          has_seasonal_pricing: item.has_seasonal_pricing || false,
          has_special_dates: item.has_special_dates || false,
          has_active_promotion: item.has_active_promotion || false,
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
        `Total items: ${allItemsList.length} (Groups: ${allGroups.length}, Solo: ${allSoloArtists.length}, Studios: ${allStudios.length}, Gigs: ${allGigs.length})`,
      );

      // === NEW ARRIVALS - Simple: Just sort by created_at and take top 10 ===
      const sortedByDate = [...allItemsList].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Newest first
      });

      debugLog("Setting New Arrivals:", sortedByDate.length, "items available");
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

          debugLog("Building Groq For You recommendations for user:", userId);
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

              return `Using cached ${aiFeedProvider || groqModelLabel} Home feed.`;
            });
          } else if (!hasExistingAiFeed) {
            setAiRecommendations([]);
            setAiFeedProvider(groqModelLabel);

            if (localRankedItems.length === 0) {
              setAiFeedMessage("No listings available for AI feed ranking yet.");
            } else if (homeLlmRerankInFlightRef.current) {
              setAiFeedMessage(`${groqModelLabel} rerank is already running for Home feed.`);
            } else if (hasProfileSignals) {
              setAiFeedMessage(`Preparing ${groqModelLabel} feed for your profile.`);
            } else {
              setAiFeedMessage(`Preparing ${groqModelLabel} feed.`);
            }
          }

          if (hasFreshAiFeed) {
            debugLog("Skipping Home rerank because cached AI feed is still fresh.");
          } else if (homeLlmRerankInFlightRef.current) {
            setAiFeedMessage(`${groqModelLabel} rerank is already running for Home feed.`);
          } else {
            const llmRequestId = ++homeLlmRequestIdRef.current;
            homeLlmRerankInFlightRef.current = true;
            setIsHomeLlmRerankPending(true);

            void (async () => {
              try {
                const llmResult = await rerankHomeFeedWithGroq({
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
                  return;
                }

                if (llmResult.aiPowered && llmResult.recommendations.length > 0) {
                  lastHomeAiRerankAtRef.current = Date.now();
                  setAiRecommendations(llmResult.recommendations);
                  setAiFeedProvider(llmResult.aiProvider || groqModelLabel);
                  setAiFeedMessage(
                    llmResult.message ||
                    `Realtime For You feed reranked by ${groqModelLabel}.`,
                  );
                  return;
                }

                if (strictLlmModeForAiPages) {
                  if (!hasExistingAiFeed) {
                    setAiRecommendations([]);
                    setAiFeedProvider(groqModelLabel);
                  }
                  setAiFeedMessage(
                    llmResult.message ||
                    (hasExistingAiFeed
                      ? `Keeping the previous ${groqModelLabel} feed while Home refresh retries.`
                      : `${groqModelLabel} is required for Home AI mode on this build.`),
                  );
                  return;
                }

                if (llmResult.message && llmResult.message.trim().length > 0) {
                  setAiFeedMessage(llmResult.message);
                }
              } finally {
                if (llmRequestId === homeLlmRequestIdRef.current) {
                  homeLlmRerankInFlightRef.current = false;
                  setIsHomeLlmRerankPending(false);
                }
              }
            })();
          }
        } catch (aiErr) {
          debugLog("Groq ranking error:", aiErr);
          const errorMessage = aiErr instanceof Error ? aiErr.message : String(aiErr);
          if (isGroqQuotaExhaustedMessage(errorMessage)) {
            lastHomeAiRerankAtRef.current = Date.now();
            setAiRecommendations([]);
            setAiFeedProvider("Normal Feed");
            setAiFeedMessage("Groq free-tier limit reached. Showing normal Home feed.");
            return;
          }

          const hasExistingAiFeed =
            aiRecommendations.length > 0 &&
            !/(local ranker|local matching)/i.test(aiFeedProvider || "");

          if (!hasExistingAiFeed) {
            setAiRecommendations([]);
            setAiFeedProvider(groqModelLabel);
          }
          setAiFeedMessage(
            strictLlmModeForAiPages
              ? hasExistingAiFeed
                ? `Keeping the previous ${groqModelLabel} feed while Home refresh retries.`
                : `${groqModelLabel} is unavailable for Home AI mode right now.`
              : "Local personalization is temporarily unavailable. Showing general picks.",
          );
        }
      } else {
        debugLog("No user logged in - skipping AI recommendations");
        lastHomeAiRerankAtRef.current = 0;
        setAiRecommendations([]);
        setAiFeedProvider(groqModelLabel);
        setAiFeedMessage("");
      }

      // Seed featured/discover with fallback random results while AI feed initializes.
      setFeatured(diversifiedRandomItems.slice(0, 10));
      setDiscover(diversifiedRandomItems.slice(10, 20));
      lastHomeRefreshAtRef.current = Date.now();
      hasHydratedHomeCacheRef.current = true;

      debugLog("Home data loaded successfully");
    } catch (e) {
      debugLog("Error fetching home feed:", e);
    } finally {
      homeDataFetchInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleCardPress = async (item: any) => {
    debugLog("=== handleCardPress called ===");
    debugLog("Item:", item);
    debugLog("Item ID:", item.id);

    if (item?.type === "Production") {
      openProductionTeamDetails(item.id);
      debugLog("selectedProductionTeamId set to:", item.id);
      debugLog("openProductionTeamSheet called");
    } else {
      openListingDetails(item.id);
      debugLog("selectedListingId set to:", item.id);
      debugLog("openDetailsSheet called");
    }

    // Mark this item as viewed in the New Arrivals set
    const isNewArrival = newArrivals.some((n: any) => n.id === item.id);
    if (isNewArrival) {
      setViewedNewArrivals(prev => {
        const next = new Set(prev);
        next.add(item.id);
        AsyncStorage.setItem(VIEWED_NEW_ARRIVALS_STORAGE_KEY, JSON.stringify([...next])).catch(() => { });
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
      debugLog("saveToRecentlyViewed called with:", item.name, item.type);
      const existingJson = await AsyncStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
      let items = existingJson ? JSON.parse(existingJson) : [];
      debugLog("Existing items count:", items.length);

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

      await AsyncStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, JSON.stringify(items));
      debugLog("Saved. New count:", items.length);

      // Update state
      setRecentlyViewed(items);
      debugLog("State updated with", items.length, "items");
    } catch (e) {
      debugLog("Error saving to recently viewed:", e);
    }
  };

  const fetchRecentlyViewed = async () => {
    try {
      const existingJson = await AsyncStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
      debugLog(
        "Recently viewed from storage:",
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
        debugLog("Recently viewed items count:", visibleItems.length);
        setRecentlyViewed(visibleItems.slice(0, 5)); // Show first 5
      } else {
        debugLog("No recently viewed items in storage");
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

  // 1. Immersive Hero Section
  const renderHero = () => {
    // Musician / Live Performance Hero Image
    // Using a moody, neon-lit stage/guitar image to match the music vibe
    const heroImage =
      "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=2560&auto=format&fit=crop";

    // Dynamic Search Text
    const isOwner = userRole === "venue-owner" || userRole === "studio-owner";
    const searchPlaceholder = isOwner
      ? "Find musicians, bands..."
      : "Search studios and gigs...";

    return (
      <View style={styles.heroContainer}>
        <CachedImage
          uri={heroImage}
          style={styles.heroImage}
          width={1080}
          height={640}
          quality={80}
          cacheVersion="home-hero-v3"
        />
        <LinearGradient
          colors={[
            "rgba(15, 23, 42, 0.2)",
            "rgba(15, 23, 42, 0.6)",
            "#0F172A",
          ]} 
          style={styles.heroGradient}
        />

        {/* Content within Hero */}
        <View style={styles.heroContent}>
          <Text style={styles.heroGreeting}>Hey {userName}</Text>
          <Text style={styles.heroSubtitle}>Ready to make some noise?</Text>

          <TouchableOpacity 
            activeOpacity={1}
            style={styles.modernSearchCard}
            onPress={openSearchSheet}
          >
            <View style={styles.modernSearchLeft}>
              <View style={styles.modernSearchIconWrapper}>
                <Ionicons name="search" size={20} color="#FFF" />
              </View>
              <View style={styles.modernSearchTexts}>
                <Text style={styles.modernSearchPlaceholder}>{searchPlaceholder}</Text>
                <Text style={styles.modernSearchSub}>Tap to explore by location or rate</Text>
              </View>
            </View>
            <View style={styles.modernSearchFilterBtn}>
              <Ionicons name="options-outline" size={20} color="#0F172A" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // 2. Top Picks Section - Same card design as New Arrivals
  const renderHighlightsSection = () => {
    if (topItems.length === 0) return null;

    // Helper to get price label - same logic as New Arrivals
    const getTopPickPrice = (item: any) => {
      if (item.type === "Group") return null;

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

        if (hasRehearsalRate && hasRecordingRate) {
          return `₱${rehearsalRate.toLocaleString()}/hr | ₱${recordingRate.toLocaleString()}/song`;
        }
        if (hasRecordingRate) {
          return `₱${recordingRate.toLocaleString()}/song`;
        }
        if (hasRehearsalRate) {
          return `₱${rehearsalRate.toLocaleString()}/hr`;
        }
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
      <View style={[styles.sectionContainer, { marginTop: 20 }]}> 
        {/* Header */}
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
              Top Picks
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              AI-powered recommendations
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 8,
          }}
          decelerationRate="fast"
          snapToInterval={280 + 16}
        >
          {topItems.map((item) => {
            const priceLabel = getTopPickPrice(item);
            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={1}
                onPress={() => handleCardPress(item)}
                style={[
                  styles.newArrivalCard,
                  { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
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
                              : item.type === "Artist"
                                ? "person"
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
                  {/* AI Match Badge (top right) */}
                  {item.similarity && item.similarity > 0.1 && (
                    <View
                      style={[
                        styles.newArrivalNewBadge,
                        { backgroundColor: "rgba(16,185,129,0.95)" },
                      ]}
                    >
                      <Ionicons name="sparkles" size={10} color="#FFF" />
                      <Text
                        style={[
                          styles.newArrivalNewBadgeText,
                          { color: "#FFF" },
                        ]}
                      >
                        {Math.round(item.similarity * 100)}%
                      </Text>
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
                  {/* Promo Badge */}
                  {item.type === "Studio" && item.has_active_promotion && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Ionicons name="pricetag" size={10} color="#10B981" />
                      <Text style={{ fontSize: 11, fontFamily: "Poppins_500Medium", color: "#10B981" }}>
                        Promo available
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 8,
          }}
          decelerationRate="fast"
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
                  { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
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
                  {/* Promo Badge */}
                  {item.type === "Studio" && item.has_active_promotion && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <Ionicons name="pricetag" size={10} color="#10B981" />
                      <Text style={{ fontSize: 11, fontFamily: "Poppins_500Medium", color: "#10B981" }}>
                        Promo available
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // 4. For You - Smart Feed (Merged Featured + Discover with variety)
  const renderSmartFeed = () => {
    const uniqueItems = uniqueSmartFeedItems;

    if (uniqueItems.length === 0) {
      return (
        <View style={styles.sectionContainer}>
          <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              For You
            </Text>
          </View>
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
            alignItems: "center",
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
              For You
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              TikTok-style feed tuned to your profile
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
                {
                  backgroundColor: isDark ? "#1F2937" : "#FFFFFF",
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
                        ? `AI ${(uniqueItems[0].similarity * 100).toFixed(0)}% Match`
                        : "Top Recommendation"}
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
                  {uniqueItems[0].aiReason ? (
                    <Text style={styles.featuredReason} numberOfLines={2}>
                      {uniqueItems[0].aiReason}
                    </Text>
                  ) : null}
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
                    {uniqueItems[0].type === "Studio" && uniqueItems[0].has_active_promotion && (
                      <View style={[styles.tagBadge, { backgroundColor: "rgba(16,185,129,0.8)", borderColor: "rgba(16,185,129,0.9)" }]}>
                        <Text style={styles.tagText}>Promo</Text>
                      </View>
                    )}
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Horizontal Scroll for Rest */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 16,
          }} // Added paddingVertical for shadows
          decelerationRate="fast"
          snapToInterval={280 + 16}
        >
          {uniqueItems.slice(1, 11).map((item, index) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={1}
              onPress={() => handleCardPress(item)}
              style={[
                styles.forYouCard,
                { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
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

                {item.aiReason ? (
                  <View style={styles.forYouReasonRow}>
                    <Ionicons
                      name="sparkles-outline"
                      size={12}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.forYouReasonText,
                        { color: colors.textSecondary },
                      ]}
                      numberOfLines={2}
                    >
                      {item.aiReason}
                    </Text>
                  </View>
                ) : null}

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
                {/* Promo Badge */}
                {item.type === "Studio" && item.has_active_promotion && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                    <Ionicons name="pricetag" size={10} color="#10B981" />
                    <Text style={{ fontSize: 11, fontFamily: "Poppins_500Medium", color: "#10B981" }}>
                      Promo available
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  // Helpers
  const parseColor = (c: string) => c;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle="light-content"
          translucent
          backgroundColor="transparent"
        />
        
        {/* Mock Header space */}
        <View style={{ position: "absolute", top: insets.top + 8, left: 16, zIndex: 100 }}>
           <Skeleton width={180} height={32} borderRadius={8} />
        </View>

        <View>
          {/* Hero Skeleton */}
          <Skeleton 
             width="100%" 
             height={height < 700 ? Math.max(height * 0.45, 340) : height * 0.42} 
             borderRadius={0} 
          />
          {/* Overlay elements mock inside hero */}
          <View style={{ position: 'absolute', bottom: 24, left: 24, right: 24 }}>
             <Skeleton width="60%" height={36} style={{ marginBottom: 20 }} />
             <Skeleton width="100%" height={56} borderRadius={100} />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        >
          {/* Highlight/Featured Mocks */}
          <View style={{ marginTop: 32, paddingHorizontal: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
               <Skeleton width={120} height={24} />
               <Skeleton width={60} height={20} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3].map((_, i) => (
                <View key={i} style={{ marginRight: 20 }}>
                  <Skeleton width={width * 0.7} height={moderateScale(320)} borderRadius={24} />
                </View>
              ))}
            </ScrollView>
          </View>
          
          {/* Another row Mock */}
          <View style={{ marginTop: 32, paddingHorizontal: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
               <Skeleton width={140} height={24} />
               <Skeleton width={60} height={20} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3].map((_, i) => (
                <View key={i} style={{ marginRight: 20 }}>
                  <Skeleton width={width * 0.65} height={moderateScale(240)} borderRadius={20} />
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
        <Navbar />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />

      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 100 }}
      >
        <Header title="MusikaLokal" transparent={!isScrolled} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
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
        {renderHero()}

        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <ProfileCompletionBanner />
        </View>

        {userId && (
          <View
            style={{
              marginHorizontal: 24,
              marginTop: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: isDark ? "#1F2937" : "#EFF6FF",
              borderWidth: 1,
              borderColor: isDark ? "#374151" : "#BFDBFE",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons
              name={homeAiStatusLabel.includes("Working") ? "checkmark-circle" : "information-circle"}
              size={16}
              color={homeAiStatusLabel.includes("Working") ? "#10B981" : colors.primary}
            />
            <Text
              style={{
                flex: 1,
                color: colors.text,
                fontFamily: "Poppins_500Medium",
                fontSize: 12,
              }}
            >
              {homeAiStatusLabel}
            </Text>
          </View>
        )}

        {/* AI Recommendation Comparison Toggle */}
        {showForYouAiCard && userId && (
          <View
            style={{
              marginHorizontal: 24,
              marginTop: 20,
              marginBottom: 8,
              padding: 16,
              borderRadius: 20,
              backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
              borderWidth: 1,
              borderColor: colors.primary,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
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
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="sparkles"
                      size={18}
                      color="#FFF"
                    />
                  </View>
                  <View>
                    <Text
                      style={{
                        fontFamily: "Poppins_600SemiBold",
                        fontSize: 14,
                        color: colors.text,
                      }}
                    >
                      For You AI
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Poppins_400Regular",
                        fontSize: 11,
                        color: colors.textSecondary,
                        marginTop: -2,
                      }}
                    >
                      {`Engine: ${aiFeedProvider}${aiRecommendations.length > 0 ? ` | ${aiRecommendations.length} picks` : ""}`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {aiFeedMessage ? (
              <View
                style={{
                  marginTop: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={14}
                  color={colors.textSecondary}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Poppins_400Regular",
                    fontSize: 11,
                    color: colors.textSecondary,
                  }}
                >
                  {aiFeedMessage}
                </Text>
              </View>
            ) : null}

            {/* AI Similarity Preview */}
            {aiRecommendations.length > 0 && (
              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: isDark ? "#374151" : "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins_500Medium",
                    fontSize: 11,
                    color: colors.textSecondary,
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  {hasAiSimilarityMatches
                    ? "Top Matches This Session"
                    : "Fresh recommendations for your profile"}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {aiPreviewItems.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: isDark ? "#374151" : "#E5E7EB",
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
                          color: colors.text,
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
                  borderTopColor: isDark ? "#374151" : "#E5E7EB",
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
                    color: colors.textSecondary,
                    flex: 1,
                  }}
                >
                  Add skills and genres in your profile, then browse listings to
                  improve your For You feed quality.
                </Text>
              </View>
            )}
          </View>
        )}

        {renderHighlightsSection()}

        {renderNewArrivals()}

        {renderSmartFeed()}

        {/* Phase 2: Quick Access Modules */}
        {!isGuest && (
          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text, paddingHorizontal: 24, marginBottom: 12 }]}>Explore More</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
              {([
                { label: "Discover", icon: "compass-outline" as const, route: "/home", color: "#3b82f6" },
                { label: "Shop", icon: "bag-handle-outline" as const, route: "/shop", color: "#22c55e" },
                { label: "Orders", icon: "receipt-outline" as const, route: "/orders", color: "#eab308" },
                { label: "Seller Hub", icon: "storefront-outline" as const, route: "/seller_hub", color: "#ec4899" },
              ] as const).map((mod) => (
                <TouchableOpacity activeOpacity={1}
                  key={mod.label}
                  style={[styles.quickAccessCard, { backgroundColor: mod.color + "14" }]}
                  onPress={() => router.push(mod.route as any)}
                >
                  <View style={[styles.quickAccessIcon, { backgroundColor: mod.color + "22" }]}>
                    <Ionicons name={mod.icon} size={22} color={mod.color} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: moderateScale(12), fontWeight: "600", marginTop: 6 }}>{mod.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

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
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingLeft: 24,
                paddingRight: 24,
                paddingVertical: 8,
              }}
              decelerationRate="fast"
              snapToInterval={240 + 16}
            >
              {recentlyViewed.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={1}
                  onPress={() => handleCardPress(item)}
                  style={[
                    styles.recentlyViewedCard,
                    { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
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
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <Navbar />

      <ListingDetailsSheet
        ref={bottomSheetRef}
        listingId={selectedListingId}
        onDismiss={handleListingDetailsDismiss}
      />
      <ProductionTeamDetailsSheet
        ref={productionTeamSheetRef}
        teamId={selectedProductionTeamId}
        onDismiss={handleProductionTeamDetailsDismiss}
      />
      <SearchBottomSheet
        ref={searchSheetRef}
        onClose={() => { }}
        onItemPress={(id) => {
          debugLog("=== SearchBottomSheet onItemPress ===");
          debugLog("Item ID from search:", id);
          openListingDetails(id, { restoreSearchOnClose: true });
          debugLog("openDetailsSheet called from search");
        }}
        onProductionTeamPress={(teamId) => {
          debugLog("=== SearchBottomSheet onProductionTeamPress ===");
          debugLog("Team ID from search:", teamId);
          openProductionTeamDetails(teamId, { restoreSearchOnClose: true });
          debugLog("openProductionTeamSheet called from search");
        }}
        onChat={handleChat}
      />
      <RecentlyViewedSheet
        ref={recentlyViewedSheetRef}
        onClose={() => { }}
        onItemPress={(id) => {
          debugLog("=== RecentlyViewedSheet onItemPress ===");
          debugLog("Item ID from recently viewed:", id);
          openListingDetails(id);
          debugLog("openDetailsSheet called from recently viewed");
        }}
        onProductionTeamPress={(teamId) => {
          debugLog("=== RecentlyViewedSheet onProductionTeamPress ===");
          debugLog("Team ID from recently viewed:", teamId);
          openProductionTeamDetails(teamId);
          debugLog("openProductionTeamSheet called from recently viewed");
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    bottom: height < 700 ? 12 : 24,
    left: 24, // Standardized alignment
    right: 24, // Standardized alignment
    zIndex: 10,
  },
  heroGreeting: {
    fontFamily: "Poppins_700Bold",
    fontSize: height < 700 ? moderateScale(28) : moderateScale(34),
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: height < 700 ? moderateScale(14) : moderateScale(16),
    color: "#94A3B8",
    marginBottom: height < 700 ? 16 : 24,
  },
  modernSearchCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1E293B",
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modernSearchLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  modernSearchIconWrapper: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: 16,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  modernSearchTexts: {
    flex: 1,
    justifyContent: "center",
  },
  modernSearchPlaceholder: {
    color: "#F8FAFC",
    fontFamily: "Poppins_600SemiBold",
    fontSize: moderateScale(14),
    marginBottom: 2,
  },
  modernSearchSub: {
    color: "#94A3B8",
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(12),
  },
  modernSearchFilterBtn: {
    width: moderateScale(44),
    height: moderateScale(44),
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
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
    height: 280, // Fixed height for the bento block
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
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: "center",
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
  featuredReason: {
    color: "rgba(255,255,255,0.92)",
    fontFamily: "Poppins_400Regular",
    fontSize: moderateScale(12),
    marginTop: 4,
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
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: "center",
    textTransform: "uppercase",
  },

  // New Arrivals Section
  newArrivalCard: {
    width: 280,
    borderRadius: 20,
    overflow: "hidden",
    marginRight: 16,
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
    marginRight: 16,
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
    marginRight: 16,
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
  forYouReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    marginBottom: 6,
  },
  forYouText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    flex: 1,
  },
  forYouReasonText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  forYouPrice: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    marginTop: 6,
  },
  quickAccessCard: {
    width: 90,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 10,
  },
  quickAccessIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});

