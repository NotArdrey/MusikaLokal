import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
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
import CustomAlert from "../src/components/CustomAlert";
import Header from "../src/components/header";
import ListingCard from "../src/components/ListingCard";
import ListingDetailsSheet from "../src/components/ListingDetailsSheet";
import Navbar from "../src/components/navbar";
import { ProfileCompletionBanner } from "../src/components/ProfileCompletionBanner";
import RecentlyViewedSheet from "../src/components/RecentlyViewedSheet";
import SearchBottomSheet from "../src/components/SearchBottomSheet";
import { useTheme } from "../src/context/ThemeContext";

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

import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../src/context/AuthContext";

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { userRole, userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featured, setFeatured] = useState<any[]>([]);
  const [discover, setDiscover] = useState<any[]>([]);
  const [newArrivals, setNewArrivals] = useState<any[]>([]); // New Arrivals State
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]); // Upcoming Events State (for musicians)
  const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
  const [userName, setUserName] = useState("Guest");
  const [timeGreeting, setTimeGreeting] = useState("Hey");

  // ... refs ...
  const bottomSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const searchSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const recentlyViewedSheetRef =
    React.useRef<import("@gorhom/bottom-sheet").BottomSheetModal>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(
    null,
  );

  // Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
    buttons?: any[];
  }>({ type: "info", title: "", message: "" });

  // Safe handler for opening search sheet - prevents reanimated timing issues
  const openSearchSheet = useCallback(() => {
    requestAnimationFrame(() => {
      if (searchSheetRef.current) {
        searchSheetRef.current.present();
      }
    });
  }, []);

  // Safe handler for opening details sheet
  const openDetailsSheet = useCallback(() => {
    requestAnimationFrame(() => {
      if (bottomSheetRef.current) {
        bottomSheetRef.current.present();
      }
    });
  }, []);

  // Safe handler for opening recently viewed sheet
  const openRecentlyViewedSheet = useCallback(() => {
    requestAnimationFrame(() => {
      if (recentlyViewedSheetRef.current) {
        recentlyViewedSheetRef.current.present();
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Fetch data silently on focus if data already exists
      const isFirstLoad = featured.length === 0 && discover.length === 0;
      fetchHomeData(isFirstLoad);
      fetchUserProfile();
      fetchRecentlyViewed();
      fetchUpcomingEvents(); // Fetch upcoming events for musicians
      setTimeBasedGreeting();
    }, [userRole, userId]),
  );

  // Handler for realtime updates - defined before useEffect that uses it
  const handleRealtimeUpdate = useCallback(() => {
    console.log("Realtime update received - refreshing home data...");
    // Debounce or just call it? Basic call for now.
    // False to silent refresh
    fetchHomeData(false);
  }, [userRole, userId]);

  // Realtime Updates
  useEffect(() => {
    const channel = supabase
      .channel("public:home_updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gigs" },
        () => handleRealtimeUpdate(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "studios" },
        () => handleRealtimeUpdate(),
      )
      // Assuming 'groups' or 'profiles' is the underlying table. Using 'groups' based on views.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        () => handleRealtimeUpdate(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleRealtimeUpdate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchHomeData(false),
      fetchUserProfile(),
      fetchRecentlyViewed(),
      fetchUpcomingEvents(),
    ]);
    setRefreshing(false);
  }, [userRole, userId]);

  const setTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) setTimeGreeting("Good morning");
    else if (hour < 18) setTimeGreeting("Good afternoon");
    else setTimeGreeting("Good evening");
  };

  const [hasGroups, setHasGroups] = useState(false);

  const fetchUserProfile = async () => {
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
    } catch (e) {
      console.log("Error fetching user profile:", e);
    }
  };

  const fetchHomeData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // Fetch based on Role
      // If Owner, ONLY fetch groups (musicians)
      let groups: any[] = [];
      let studios: any[] = [];
      let gigs: any[] = [];
      let soloArtists: any[] = [];

      const isOwner = userRole === "venue-owner" || userRole === "studio-owner";

      // Always fetch groups (musicians)
      const { data: gData } = await supabase
        .from("groups_with_stats")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      groups = gData || [];

      // Fetch Solo Artists (Musicians who haven't created a group, or just all musicians)
      // We assume 'musician' role in profiles
      const { data: pData } = await supabase
        .from("profiles")
        .select(
          "id, full_name, avatar_url, address, created_at, role, skills, genres",
        )
        .eq("role", "musician")
        .limit(20);

      // Filter out profiles that might be owners of the groups already fetched?
      // For now, just show them as Solo Artists.
      soloArtists = pData || [];

      // Musicians and Guests can see studios and gigs, but owners cannot
      if (!isOwner) {
        const { data: sData, error: sError } = await supabase
          .from("studios_with_stats")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        if (sError) console.log("Error fetching studios:", sError);
        studios = sData || [];
        const { data: gigData, error: gigError } = await supabase
          .from("gigs_with_stats")
          .select("*")
          .eq("status", "open") // Only show open gigs to musicians
          .order("created_at", { ascending: false })
          .limit(20);
        if (gigError) console.log("Error fetching gigs:", gigError);
        gigs = gigData || [];
        console.log(
          `📱 Fetched ${gigs.length} open gigs for role: ${userRole}`,
        );
      } else {
        console.log(
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
          // Explicitly pass rate fields
          hourly_rate: item.hourly_rate?.toString(),
          budget: item.budget?.toString(),
          rate:
            item.rate ||
            item.hourly_rate?.toString() ||
            item.budget?.toString(),
          location: item.location || item.address || "",
          amenities: item.amenities || [],
          experience_level: item.requirements?.experience_level || null,
          embedding: item.embedding, // Profiles might have interest_vector but listing card uses embedding
          created_at: item.created_at, // Added for New Arrivals
          genre: item.genres?.join(", ") || item.genre || "", // For solo artists
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

      const allItemsList = [
        ...allGroups,
        ...allSoloArtists,
        ...allStudios,
        ...allGigs,
      ];
      console.log(
        `📊 Total items: ${allItemsList.length} (Groups: ${allGroups.length}, Solo: ${allSoloArtists.length}, Studios: ${allStudios.length}, Gigs: ${allGigs.length})`,
      );

      // Filter New Arrivals (Sort by created_at desc)
      const sortedByDate = [...allItemsList].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });

      // Standard Period: 14 days for new arrivals
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const recentArrivals = sortedByDate.filter((item) => {
        const itemDate = new Date(item.created_at || 0);
        return itemDate >= fourteenDaysAgo;
      });

      console.log(
        `🆕 New Arrivals (last 14 days): ${recentArrivals.length} items`,
      );
      if (recentArrivals.length > 0) {
        console.log(
          "📋 New Arrivals preview:",
          recentArrivals.slice(0, 3).map((i) => `${i.type}: ${i.name}`),
        );
      }

      setNewArrivals(recentArrivals.slice(0, 10));

      // AI Personalization
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let sortedItems = [...allItemsList];
      let usedPersonalization = false;

      if (user) {
        // Fetch Profile Vector
        const { data: profile } = await supabase
          .from("profiles")
          .select("interest_vector")
          .eq("id", user.id)
          .single();

        if (profile && profile.interest_vector) {
          usedPersonalization = true;
          const dot = (a: number[], b: number[]) =>
            a.reduce((acc, cur, i) => acc + cur * b[i], 0);
          const pVec =
            typeof profile.interest_vector === "string"
              ? JSON.parse(profile.interest_vector)
              : profile.interest_vector;

          if (pVec && Array.isArray(pVec)) {
            sortedItems.sort((a, b) => {
              if (!a.embedding || !b.embedding) return 0; // Handle missing embeddings for solo artists if any
              const aVec =
                typeof a.embedding === "string"
                  ? JSON.parse(a.embedding)
                  : a.embedding;
              const bVec =
                typeof b.embedding === "string"
                  ? JSON.parse(b.embedding)
                  : b.embedding;
              if (!aVec) return 1;
              if (!bVec) return -1;
              return dot(pVec, bVec) - dot(pVec, aVec); // Descending
            });
          }
        }
      }

      if (!usedPersonalization) {
        sortedItems.sort(() => 0.5 - Math.random());
      }

      setFeatured(sortedItems.slice(0, 10)); // Top 10 Personalized
      setDiscover(sortedItems.slice(10, 20)); // Next 10
    } catch (e) {
      console.log("Error fetching home feed:", e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleCardPress = async (item: any) => {
    console.log("=== handleCardPress called ===");
    console.log("Item:", item);
    console.log("Item ID:", item.id);

    setSelectedListingId(item.id);
    console.log("selectedListingId set to:", item.id);

    // Use safe handler with requestAnimationFrame for proper timing
    setTimeout(() => {
      openDetailsSheet();
      console.log("openDetailsSheet called");
    }, 100);

        // Save to recently viewed
        await saveToRecentlyViewed(item);
    };

    // Handle chat action - navigate to chat screen with recipient
    const handleChat = (item: any) => {
        if (!userId) {
            setAlertConfig({
                type: 'info',
                title: 'Login Required',
                message: 'Please login or sign up to chat with this user.',
                buttons: [
                    { text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false) },
                    { text: 'Login', onPress: () => router.push('/') }
                ]
            });
            setAlertVisible(true);
            return;
        }

        // Determine the owner/organizer ID based on item type
        const recipientId = item.owner_id || item.organizer_id;
        if (!recipientId) {
            console.log('No owner/organizer found for item:', item);
            return;
        }

        // Navigate to chat with context
        router.push({
            pathname: '/chat',
            params: {
                recipientId,
                recipientName: item.name,
                ...(item.type === 'group' && { groupId: item.id }),
                ...(item.type === 'studio' && { studioId: item.id }),
                ...(item.type === 'gig' && { gigId: item.id }),
            }
        });
    };
    // Save to recently viewed
    await saveToRecentlyViewed(item);
  };

  const saveToRecentlyViewed = async (item: any) => {
    try {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      const existingJson = await AsyncStorage.getItem("recently_viewed_items");
      let items = existingJson ? JSON.parse(existingJson) : [];

      // Remove if already exists to avoid duplicates
      items = items.filter((i: any) => i.id !== item.id);

      // Add to front
      items.unshift(item);

      // Keep only last 10
      items = items.slice(0, 10);

      await AsyncStorage.setItem(
        "recently_viewed_items",
        JSON.stringify(items),
      );

      // Update state
      setRecentlyViewed(items);
    } catch (e) {
      console.log("Error saving to recently viewed:", e);
    }
  };

  const fetchRecentlyViewed = async () => {
    try {
      const AsyncStorage =
        require("@react-native-async-storage/async-storage").default;
      const existingJson = await AsyncStorage.getItem("recently_viewed_items");
      if (existingJson) {
        const items = JSON.parse(existingJson);
        setRecentlyViewed(items.slice(0, 5)); // Show first 5
      }
    } catch (e) {
      console.log("Error fetching recently viewed:", e);
    }
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
        .select(
          "*, gig:gig_id(id, name, event_date, images, location, budget, requirements)",
        )
        .eq("applicant_id", userId)
        .eq("status", "accepted");

      if (gigError) {
        console.log("Error fetching gig applications:", gigError);
      } else if (gigApps) {
        gigApps.forEach((app: any) => {
          const gig = app.gig;
          if (!gig?.event_date) return;

          const eventDate = new Date(gig.event_date);
          if (eventDate >= now) {
            events.push({
              id: app.id,
              type: "Gig",
              name: gig.name,
              date: gig.event_date,
              formattedDate: eventDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              time:
                gig.requirements?.event_start_time &&
                gig.requirements?.event_end_time
                  ? `${gig.requirements.event_start_time} - ${gig.requirements.event_end_time}`
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
        .select("*, studio:studio_id(id, name, images, address)")
        .eq("user_id", userId)
        .in("status", ["confirmed", "pending"]);

      if (studioError) {
        console.log("Error fetching studio bookings:", studioError);
      } else if (studioBookings) {
        studioBookings.forEach((booking: any) => {
          const studio = booking.studio;
          if (!booking.booking_date) return;

          const bookingDate = new Date(booking.booking_date);
          if (bookingDate >= now) {
            events.push({
              id: booking.id,
              type: "Studio",
              name: studio?.name || "Studio Booking",
              date: booking.booking_date,
              formattedDate: bookingDate.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              time:
                booking.start_time && booking.end_time
                  ? `${booking.start_time} - ${booking.end_time}`
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
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      setUpcomingEvents(events.slice(0, 5)); // Show max 5 upcoming events
      console.log(`📅 Fetched ${events.length} upcoming events for musician`);
    } catch (e) {
      console.log("Error fetching upcoming events:", e);
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
      <View style={styles.heroContainer}>
        <Image
          source={{ uri: heroImage }}
          style={styles.heroImage}
          resizeMode="cover"
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

        {/* Header Component Overlay */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
          }}
        >
          <Header title="MusikaLokal" transparent />
        </View>

        {/* Content within Hero */}
        <View style={styles.heroContent}>
          {/* Greeting with Stats */}
          <View>
            <Text style={styles.heroGreeting}>Welcome, {userName}!</Text>
          </View>

          {/* Glassmorphism Search Pill */}
          <BlurView intensity={60} tint="light" style={styles.searchPill}>
            <TouchableOpacity
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

  // 2. Promotional Carousel & Top Picks (Redesigned as "Relevant")
  const renderHighlightsSection = () => {
    const topItems = [...featured, ...discover].slice(0, 12);
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
              Top Picks
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              Curated just for you
            </Text>
          </View>
          <TouchableOpacity onPress={openSearchSheet}>
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
          <View style={styles.bentoGrid}>
            {/* Main Highlight (Large) */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => handleCardPress(topItems[0])}
              style={styles.bentoTouchableLarge}
            >
              <View style={styles.bentoLarge}>
                <Image
                  source={{ uri: topItems[0].image }}
                  style={styles.bentoImage}
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
                      <Text style={styles.glassBadgeText}>🔥 Highly Rated</Text>
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
                  activeOpacity={0.9}
                  onPress={() => handleCardPress(item)}
                  style={styles.bentoTouchableSmall}
                >
                  <View style={styles.bentoSmall}>
                    <Image
                      source={{ uri: item.image }}
                      style={styles.bentoImage}
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 16 }}
          >
            {topItems.map((item) => (
              <View key={item.id} style={{ width: 200 }}>
                {renderUnifiedCard(item)}
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    );
  };

  // Handle invite action - opens the details sheet for booking/connecting
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

    setSelectedListingId(item.id);
    // Use safe handler with requestAnimationFrame
    setTimeout(() => openDetailsSheet(), 50);
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
            />
        );
    };
  // Unified Card Renderer
  const renderUnifiedCard = (item: any) => {
    return (
      <ListingCard
        key={item.id}
        item={item}
        onPress={handleCardPress}
        onInvite={handleInvite}
        variant="horizontal"
        hasGroups={hasGroups}
      />
    );
  };

  // 3. New Arrivals Section
  const renderNewArrivals = () => {
    if (newArrivals.length === 0) return null;

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
          <TouchableOpacity onPress={openSearchSheet}>
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
            paddingVertical: 16,
          }}
          decelerationRate="fast"
          snapToInterval={Math.min(width * 0.75, 280) + 16}
        >
          {newArrivals.map((item) => (
            <View key={item.id} style={{ marginRight: 16 }}>
              {renderUnifiedCard(item)}
            </View>
          ))}
        </ScrollView>
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
          <TouchableOpacity onPress={() => router.push("/bookings")}>
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
          {upcomingEvents.map((event, index) => (
            <TouchableOpacity
              key={`${event.type}-${event.id}`}
              activeOpacity={0.9}
              onPress={() => {
                // Navigate to appropriate detail screen
                if (event.type === "Gig" && event.gigId) {
                  // For now, just go to bookings since musicians can't view gig details directly
                  router.push("/bookings");
                } else if (event.type === "Studio" && event.studioId) {
                  setSelectedListingId(event.studioId);
                  setTimeout(() => openDetailsSheet(), 100);
                }
              }}
              style={[
                styles.upcomingEventCard,
                { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" },
              ]}
            >
              {/* Event Image */}
              <View style={styles.upcomingEventImageContainer}>
                {event.image ? (
                  <Image
                    source={{ uri: event.image }}
                    style={styles.upcomingEventImage}
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
        </ScrollView>
      </View>
    );
  };

  // 4. For You - Smart Feed (Merged Featured + Discover with variety)
  const renderSmartFeed = () => {
    const allItems = [...featured, ...discover];
    const uniqueItems = allItems.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id),
    );

    if (uniqueItems.length === 0) {
      return (
        <View style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
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
              For You
            </Text>
            <Text
              style={[styles.sectionSubtitle, { color: colors.textSecondary }]}
            >
              Personalized picks based on your taste
            </Text>
          </View>
          <TouchableOpacity onPress={openSearchSheet}>
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
              activeOpacity={0.95}
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
              <Image
                source={{ uri: uniqueItems[0].image }}
                style={styles.featuredImage}
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
                      ✨ Top Recommendation
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingVertical: 16,
          }} // Added paddingVertical for shadows
          decelerationRate="fast"
          snapToInterval={Math.min(width * 0.75, 280) + 16}
        >
          {uniqueItems.slice(1, 11).map((item, index) => (
            <View key={item.id} style={{ marginRight: 16 }}>
              {renderUnifiedCard(item)}
            </View>
          ))}
        </ScrollView>
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
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 180 }}
        bounces={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {renderHero()}

        <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
          <ProfileCompletionBanner />
        </View>

        {renderHighlightsSection()}

        {renderUpcomingEvents()}

        {renderNewArrivals()}

        {renderSmartFeed()}

        {/* Recently Viewed Section */}
        {recentlyViewed.length > 0 && (
          <View style={styles.sectionContainer}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 24,
              }}
            >
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Recently Viewed
              </Text>
              <TouchableOpacity onPress={openRecentlyViewedSheet}>
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
                paddingVertical: 16,
              }} // Added paddingVertical
              decelerationRate="fast"
              snapToInterval={Math.min(width * 0.8, 300) + 16}
            >
              {recentlyViewed.map((item) => (
                <View key={item.id} style={{ marginRight: 16 }}>
                  {renderUnifiedCard(item)}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <Navbar />

      <ListingDetailsSheet ref={bottomSheetRef} listingId={selectedListingId} />
      <SearchBottomSheet
        ref={searchSheetRef}
        onClose={() => {}}
        hasGroups={hasGroups}
        onItemPress={(id) => {
          console.log("=== SearchBottomSheet onItemPress ===");
          console.log("Item ID from search:", id);
          setSelectedListingId(id);
          setTimeout(() => {
            openDetailsSheet();
            console.log("openDetailsSheet called from search");
          }, 150);
        }}
      />
      <RecentlyViewedSheet
        ref={recentlyViewedSheetRef}
        onClose={() => recentlyViewedSheetRef.current?.dismiss()}
        onItemPress={(id) => {
          console.log("=== RecentlyViewedSheet onItemPress ===");
          console.log("Item ID from recently viewed:", id);
          setSelectedListingId(id);
          setTimeout(() => {
            openDetailsSheet();
            console.log("openDetailsSheet called from recently viewed");
          }, 150);
        }}
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
    bottom: height < 700 ? 16 : 40,
    left: 24, // Standardized alignment
    right: 24, // Standardized alignment
    zIndex: 10,
  },
  heroGreeting: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: height < 700 ? moderateScale(24) : moderateScale(32),
    color: "#FFF",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: height < 700 ? moderateScale(2) : moderateScale(4),
  },
  heroSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: height < 700 ? moderateScale(12) : moderateScale(14),
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
    marginRight: 16,
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
});
