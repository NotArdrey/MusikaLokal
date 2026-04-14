import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
    Dimensions,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import ReportModal from "../src/components/ReportModal";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { DEFAULT_AVATAR } from "../src/constants/Images";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 8;
const NUM_COLUMNS = 3;
const GRID_PADDING = 24;
const ITEM_SIZE = Math.floor(
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) /
  NUM_COLUMNS
);

const EMPTY_BOOKMARKS = {
  studios: [] as any[],
  gigs: [] as any[],
  musicians: [] as any[],
};

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const { loading: authLoading, userId: currentUserId, isGuest } = useAuth();
  const params = useLocalSearchParams<{
    userId?: string;
    returnToHome?: string;
    returnListingId?: string;
  }>();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [gigStats, setGigStats] = useState({ active: 0, upcoming: 0, done: 0 });
  const [gigTimeline, setGigTimeline] = useState<{
    active: any[];
    upcoming: any[];
    done: any[];
  }>({ active: [], upcoming: [], done: [] });
  const [bookmarkedListings, setBookmarkedListings] = useState(EMPTY_BOOKMARKS);
  const [loadingBookmarks, setLoadingBookmarks] = useState(false);
  const [gigSearchQuery, setGigSearchQuery] = useState("");
  const [updatingGigVisibility, setUpdatingGigVisibility] = useState(false);
  const [supportsGigVisibilityPreference, setSupportsGigVisibilityPreference] = useState(true);

  const isMissingShowGigStatusesColumnError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return error?.code === "42703" && message.includes("show_gig_statuses");
  };

  const filteredGigTimeline = useMemo(() => {
    const query = gigSearchQuery.trim().toLowerCase();
    if (!query) return gigTimeline;

    const match = (gig: any) => {
      const haystack = `${gig?.name || ""} ${gig?.location || ""} ${gig?.performer_label || ""}`.toLowerCase();
      return haystack.includes(query);
    };

    return {
      active: gigTimeline.active.filter(match),
      upcoming: gigTimeline.upcoming.filter(match),
      done: gigTimeline.done.filter(match),
    };
  }, [gigSearchQuery, gigTimeline]);

  const resolveBookmarkImage = (entry: any): string | null => {
    if (Array.isArray(entry?.images) && typeof entry.images[0] === "string") {
      return entry.images[0];
    }

    if (typeof entry?.image === "string" && entry.image.trim().length > 0) {
      return entry.image;
    }

    if (typeof entry?.avatar_url === "string" && entry.avatar_url.trim().length > 0) {
      return entry.avatar_url;
    }

    return null;
  };

  const fetchBookmarkedListings = async (
    viewerId: string,
    shouldLoad: boolean,
  ) => {
    if (!shouldLoad) {
      setBookmarkedListings(EMPTY_BOOKMARKS);
      setLoadingBookmarks(false);
      return;
    }

    setLoadingBookmarks(true);

    try {
      const { data: favoritesData, error: favoritesError } = await supabase
        .from("favorites")
        .select("group_id, studio_id, gig_id, created_at")
        .eq("user_id", viewerId)
        .order("created_at", { ascending: false });

      if (favoritesError) throw favoritesError;

      const favorites = favoritesData || [];
      const groupIds = favorites
        .map((entry: any) => entry.group_id)
        .filter((value: any): value is string => typeof value === "string");
      const studioIds = favorites
        .map((entry: any) => entry.studio_id)
        .filter((value: any): value is string => typeof value === "string");
      const gigIds = favorites
        .map((entry: any) => entry.gig_id)
        .filter((value: any): value is string => typeof value === "string");

      const [groupsResult, studiosResult, gigsResult] = await Promise.all([
        groupIds.length > 0
          ? supabase
            .from("groups_with_stats")
            .select("id, name, location, images, image, genre")
            .in("id", groupIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        studioIds.length > 0
          ? supabase
            .from("studios_with_stats")
            .select("id, name, address, images, image")
            .in("id", studioIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        gigIds.length > 0
          ? supabase
            .from("gigs_with_stats")
            .select("id, name, location, event_date, image, images")
            .in("id", gigIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (groupsResult.error) throw groupsResult.error;
      if (studiosResult.error) throw studiosResult.error;
      if (gigsResult.error) throw gigsResult.error;

      const groupById = new Map((groupsResult.data || []).map((entry: any) => [entry.id, entry]));
      const studioById = new Map((studiosResult.data || []).map((entry: any) => [entry.id, entry]));
      const gigById = new Map((gigsResult.data || []).map((entry: any) => [entry.id, entry]));

      const musicians = favorites
        .filter((entry: any) => !!entry.group_id)
        .map((entry: any) => groupById.get(entry.group_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Musician",
          subtitle: entry.location || entry.genre || "Musician",
          image: resolveBookmarkImage(entry),
          type: "Musician",
        }));

      const studios = favorites
        .filter((entry: any) => !!entry.studio_id)
        .map((entry: any) => studioById.get(entry.studio_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Studio",
          subtitle: entry.address || "Studio",
          image: resolveBookmarkImage(entry),
          type: "Studio",
        }));

      const gigs = favorites
        .filter((entry: any) => !!entry.gig_id)
        .map((entry: any) => gigById.get(entry.gig_id))
        .filter(Boolean)
        .map((entry: any) => ({
          id: entry.id,
          name: entry.name || "Unnamed Gig",
          subtitle:
            entry.location ||
            (entry.event_date
              ? new Date(entry.event_date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              : "Gig"),
          image: resolveBookmarkImage(entry),
          type: "Gig",
        }));

      setBookmarkedListings({
        studios: studios.slice(0, 8),
        gigs: gigs.slice(0, 8),
        musicians: musicians.slice(0, 8),
      });
    } catch (bookmarkError) {
      console.log("Error fetching bookmarks:", bookmarkError);
      setBookmarkedListings(EMPTY_BOOKMARKS);
    } finally {
      setLoadingBookmarks(false);
    }
  };

  // Refresh profile data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchProfile();
      }
    }, [params.userId, authLoading, currentUserId, isGuest]),
  );

  async function fetchProfile() {
    try {
      setLoading(true);
      // Determine target ID: param OR current user
      // Handle case where userId might be an array
      const paramUserId = Array.isArray(params.userId)
        ? params.userId[0]
        : params.userId;
      let targetId = paramUserId || currentUserId;
      console.log("👤 Profile - Param userId:", paramUserId);
      console.log("👤 Profile - Context userId:", currentUserId);

      // If still no targetId, try to get from auth directly
      if (!targetId) {
        console.log("⚠️ Profile - No userId, fetching from auth...");
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.log("❌ Profile - Auth error:", error.message);
        }
        if (user) {
          console.log("✅ Profile - Got user from auth:", user.id);
          targetId = user.id;
        }
      }

      if (!targetId) {
        if (isGuest) {
          setIsOwner(false);
          setGigStats({ active: 0, upcoming: 0, done: 0 });
          setGigTimeline({ active: [], upcoming: [], done: [] });
          setBookmarkedListings(EMPTY_BOOKMARKS);
          setLoadingBookmarks(false);
          setProfile({
            full_name: "Guest User",
            role: null,
            location: "Browse Mode",
            skills: [],
            genres: [],
            portfolio_urls: [],
          });
          return;
        }

        console.log("❌ Profile - No user ID available, redirecting to login");
        // No user logged in and no userId param - redirect to login
        router.replace("/");
        return;
      }

      console.log("🎯 Profile - Fetching profile for:", targetId);

      // Check ownership
      const ownership = currentUserId && targetId === currentUserId;
      setIsOwner(!!ownership);

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

      const { data: profileStatsData } = await supabase
        .from("profiles_with_stats")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        throw profileError ?? new Error("Profile not found");
      }

      const hasGigVisibilityPreference = Object.prototype.hasOwnProperty.call(
        profileData,
        "show_gig_statuses",
      );
      setSupportsGigVisibilityPreference(hasGigVisibilityPreference);

      if (profileData.role === "musician") {
        const { data: ownedGroups } = await supabase
          .from("groups")
          .select("id, name")
          .eq("owner_id", targetId);

        const groupIds = (ownedGroups || []).map((group: any) => group.id);
        const groupNameById = new Map(
          (ownedGroups || []).map((group: any) => [group.id, group.name || "Group"]),
        );

        const [{ data: soloApplications }, { data: groupApplications }] = await Promise.all([
          supabase
            .from("gig_applications")
            .select("applicant_id, gigs(id,name,location,budget,event_date,status)")
            .eq("status", "accepted")
            .eq("applicant_id", targetId)
            .is("group_id", null),
          groupIds.length > 0
            ? supabase
              .from("gig_applications")
              .select("group_id, gigs(id,name,location,budget,event_date,status)")
              .eq("status", "accepted")
              .in("group_id", groupIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const stats = { active: 0, upcoming: 0, done: 0 };
        const timelineBuckets: { active: any[]; upcoming: any[]; done: any[] } = {
          active: [],
          upcoming: [],
          done: [],
        };
        const seenGigIds = new Set<string>();

        [...(soloApplications || []), ...(groupApplications || [])].forEach((application: any) => {
          const gig = application.gigs;
          if (!gig?.id || seenGigIds.has(gig.id)) return;
          seenGigIds.add(gig.id);

          const bucket = classifyGigBucket(gig);
          stats[bucket] += 1;
          timelineBuckets[bucket].push({
            ...gig,
            performer_label: application.group_id
              ? `As ${groupNameById.get(application.group_id) || "Group"}`
              : "As Solo Artist",
          });
        });

        const byDateDesc = (a: any, b: any) => {
          const aTime = a?.event_date ? new Date(a.event_date).getTime() : 0;
          const bTime = b?.event_date ? new Date(b.event_date).getTime() : 0;
          return bTime - aTime;
        };

        timelineBuckets.active.sort(byDateDesc);
        timelineBuckets.upcoming.sort(byDateDesc);
        timelineBuckets.done.sort(byDateDesc);

        setGigStats(stats);
        setGigTimeline(timelineBuckets);
      } else {
        setGigStats({ active: 0, upcoming: 0, done: 0 });
        setGigTimeline({ active: [], upcoming: [], done: [] });
      }

      const [skillsResult, genresResult, portfolioResult] = await Promise.all([
        supabase
          .from("profile_skills")
          .select("skill")
          .eq("profile_id", targetId),
        supabase
          .from("profile_genres")
          .select("genre")
          .eq("profile_id", targetId),
        supabase
          .from("profile_portfolio_urls")
          .select("portfolio_url, sort_order")
          .eq("profile_id", targetId)
          .order("sort_order", { ascending: true }),
      ]);

      setProfile({
        ...(profileStatsData || {}),
        ...profileData,
        skills: (skillsResult.data || []).map((row: any) => row.skill).filter(Boolean),
        genres: (genresResult.data || []).map((row: any) => row.genre).filter(Boolean),
        portfolio_urls: (portfolioResult.data || [])
          .map((row: any) => row.portfolio_url)
          .filter(Boolean),
      });

      await fetchBookmarkedListings(targetId, !!ownership && !isGuest);
    } catch (e) {
      console.log("Error fetching profile:", e);
    } finally {
      setLoading(false);
    }
  }

  const MENU_ITEMS = [
    { label: "Edit Profile", icon: "person-outline", route: "/edit_profile" },
    { label: "Wallet", icon: "wallet-outline", route: "/wallet" },
    { label: "Identity Verification", icon: "card-outline", route: "/identity_verification" },
    { label: "Settings", icon: "settings-outline", route: "/settings" },
  ];

  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaModalVisible, setMediaModalVisible] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: "info",
    title: "",
    message: "",
  });

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const handleToggleGigVisibility = async (value: boolean) => {
    if (!isOwner || profile?.role !== "musician" || !currentUserId) return;

    const previousValue = profile?.show_gig_statuses !== false;
    setUpdatingGigVisibility(true);
    setProfile((prev: any) => ({ ...(prev || {}), show_gig_statuses: value }));

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ show_gig_statuses: value })
        .eq("id", currentUserId);

      if (error) throw error;
    } catch (e: any) {
      setProfile((prev: any) => ({ ...(prev || {}), show_gig_statuses: previousValue }));
      if (isMissingShowGigStatusesColumnError(e)) {
        setSupportsGigVisibilityPreference(false);
        setProfile((prev: any) => ({ ...(prev || {}), show_gig_statuses: true }));
        showAlert(
          "warning",
          "Setting Unavailable",
          "Gig status visibility preference is unavailable until the latest profile schema migration is applied.",
        );
        return;
      }
      showAlert("error", "Update Failed", e?.message || "Failed to update gig visibility.");
    } finally {
      setUpdatingGigVisibility(false);
    }
  };

  const handleHeaderBack = useCallback(() => {
    const shouldReturnHome =
      (Array.isArray(params.returnToHome)
        ? params.returnToHome[0]
        : params.returnToHome) === "1";
    const returnListingId = Array.isArray(params.returnListingId)
      ? params.returnListingId[0]
      : params.returnListingId;

    if (shouldReturnHome && returnListingId) {
      void AsyncStorage.setItem("pending_reopen_listing_id", returnListingId)
        .catch(() => { })
        .finally(() => {
          router.back();
        });
      return;
    }

    router.back();
  }, [params.returnListingId, params.returnToHome]);

  const openBookmarkedListing = async (itemId: string) => {
    if (!itemId) return;

    try {
      await AsyncStorage.setItem("pending_reopen_listing_id", itemId);
    } catch {
      // Continue navigation even if cache write fails.
    }

    router.push("/home");
  };

  const submitProfileReport = async (reason: string, details?: string) => {
    if (!currentUserId) {
      showAlert("warning", "Login Required", "You need to be logged in to submit a report.");
      return;
    }
    if (!profile?.id) {
      showAlert("error", "Unable to Report", "Missing profile details.");
      return;
    }

    const { error } = await supabase.functions.invoke("manage-details", {
      body: {
        action: "report",
        type: "profile",
        id: profile.id,
        userId: currentUserId,
        reason,
        details: details || null,
      },
    });

    if (error) {
      throw new Error(error.message || "Failed to submit report.");
    }
  };

  const openReportModal = () => {
    setShowReportModal(true);
  };

  // Check if URL is a video
  const isVideo = (url: string) => {
    const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  const openMediaViewer = (url: string) => {
    setSelectedMedia(url);
    setMediaModalVisible(true);
  };

  const addMediaToPortfolio = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showAlert("error", "Error", "You must be logged in.");
        return;
      }

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert("warning", "Permission needed", "Please allow access to your photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: true,
        quality: 0.5,
      });

      if (result.canceled || !result.assets[0]) return;

      const file = result.assets[0];
      setUploading(true);

      const fileExt = file.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${user.id}/portfolio/${Date.now()}.${fileExt}`;
      const mimeType =
        file.mimeType ||
        (fileExt === "mp4"
          ? "video/mp4"
          : `image/${fileExt === "jpg" ? "jpeg" : fileExt}`);

      console.log("📤 Uploading portfolio media...");
      console.log("📍 File URI:", file.uri);
      console.log("📁 File name:", fileName);

      // Create FormData for upload
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: fileName.split("/").pop(),
        type: mimeType,
      } as any);

      // Get Supabase URL and key from the client
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      // Get current session for auth
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || supabaseKey;

      // Upload directly via fetch with FormData
      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/avatars/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-upsert": "true",
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("❌ Upload failed:", errorText);
        throw new Error(errorText || "Upload failed");
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      console.log("✅ Uploaded:", urlData.publicUrl);

      const { data: lastPortfolioRow, error: portfolioFetchError } = await supabase
        .from("profile_portfolio_urls")
        .select("sort_order")
        .eq("profile_id", user.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (portfolioFetchError) {
        throw portfolioFetchError;
      }

      const nextSortOrder =
        lastPortfolioRow?.sort_order !== undefined && lastPortfolioRow?.sort_order !== null
          ? Number(lastPortfolioRow.sort_order) + 1
          : 0;

      const { error: portfolioInsertError } = await supabase
        .from("profile_portfolio_urls")
        .upsert(
          {
            profile_id: user.id,
            portfolio_url: urlData.publicUrl,
            sort_order: nextSortOrder,
          },
          { onConflict: "profile_id,portfolio_url" },
        );

      if (portfolioInsertError) {
        throw portfolioInsertError;
      }

      // Refresh profile
      fetchProfile();
      showAlert("success", "Success", "Media added to portfolio!");
    } catch (e: any) {
      console.log("Upload error:", e);
      showAlert("error", "Error", e.message || "Failed to upload media");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: colors.background }]}
      >
        <Text style={{ color: colors.textSecondary }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header
          title={isOwner ? "My Profile" : "User Profile"}
          {...(!isOwner ? { onBackPress: handleHeaderBack } : {})}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Profile Header */}
          <View style={styles.headerProfile}>
            <View style={styles.avatarWrapper}>
              <View
                style={[
                  styles.avatarContainer,
                  { borderColor: colors.surface },
                ]}
              >
                <Image
                  source={
                    profile?.avatar_url
                      ? { uri: profile.avatar_url }
                      : DEFAULT_AVATAR
                  }
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              </View>

              {isOwner && (
                <TouchableOpacity activeOpacity={1}
                  onPress={() => router.push("/edit_profile")}
                  style={[
                    styles.editIconBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="pencil" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.nameText, { color: colors.text }]}>
              {profile?.full_name || "User"}
            </Text>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>
              {profile?.role === "musician"
                ? profile?.skills?.join(", ") || "Musician"
                : profile?.role === "studio-owner"
                  ? "Studio Owner"
                  : profile?.role === "venue-owner"
                    ? "Venue Owner"
                    : profile?.role
                      ? profile.role.charAt(0).toUpperCase() +
                      profile.role.slice(1)
                      : "User"}{" "}
              • {profile?.location || "Unknown"}
            </Text>

            <View style={styles.genreRow}>
              {(profile?.genres || ["Rock", "Indie"]).map((genre: string) => (
                <View
                  key={genre}
                  style={[
                    styles.genreTag,
                    { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" },
                  ]}
                >
                  <Text
                    style={[styles.genreText, { color: colors.textSecondary }]}
                  >
                    {genre}
                  </Text>
                </View>
              ))}
            </View>

            {isOwner && profile?.role === "musician" && supportsGigVisibilityPreference && (
              <View
                style={[
                  styles.gigVisibilityCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.gigVisibilityTitle, { color: colors.text }]}>
                    Show gig status on my profile and cards
                  </Text>
                  <Text style={[styles.gigVisibilitySubtitle, { color: colors.textSecondary }]}>
                    Displays Active, Upcoming, and Done gigs to other users.
                  </Text>
                </View>
                <Switch
                  value={profile?.show_gig_statuses !== false}
                  onValueChange={handleToggleGigVisibility}
                  disabled={updatingGigVisibility}
                  trackColor={{ false: isDark ? "#374151" : "#D1D5DB", true: colors.primary + "66" }}
                  thumbColor={profile?.show_gig_statuses !== false ? colors.primary : "#9CA3AF"}
                />
              </View>
            )}

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.rating
                    ? `${Math.round(profile.rating * 20)}%`
                    : "N/A"}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Rating
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.review_count || 0}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Reviews
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.role === "musician" ? gigStats.active : "-"}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Active
                </Text>
              </View>
            </View>

            {/* Bio Section */}
            {profile?.bio && (
              <View style={styles.bioContainer}>
                <Text style={[styles.bioText, { color: colors.text }]}>
                  {profile.bio}
                </Text>
              </View>
            )}

            {profile?.role === "musician" && profile?.show_gig_statuses !== false && (
              <View style={styles.gigTimelineSection}>
                <View
                  style={[
                    styles.gigSearchWrap,
                    { backgroundColor: isDark ? "#1E293B" : "#F9FAFB", borderColor: colors.border },
                  ]}
                >
                  <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
                  <TextInput
                    value={gigSearchQuery}
                    onChangeText={setGigSearchQuery}
                    placeholder="Search gigs by name, location, or performer"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.gigSearchInput, { color: colors.text }]}
                  />
                </View>

                {([
                  { key: "active", label: "Active", color: "#10B981", icon: "flash-outline" },
                  { key: "upcoming", label: "Upcoming", color: "#3B82F6", icon: "calendar-outline" },
                  { key: "done", label: "Done", color: "#6B7280", icon: "checkmark-done-outline" },
                ] as const).map((section) => (
                  <View key={section.key} style={styles.gigTimelineBlock}>
                    <View style={styles.gigSectionHeader}>
                      <Ionicons name={section.icon as any} size={15} color={section.color} />
                      <Text style={[styles.gigSectionTitle, { color: colors.text }]}> 
                        {section.label} Gigs ({filteredGigTimeline[section.key].length})
                      </Text>
                    </View>

                    {filteredGigTimeline[section.key].length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.gigHorizontalList}
                        decelerationRate="fast"
                        nestedScrollEnabled
                        directionalLockEnabled
                        scrollEnabled
                        keyboardShouldPersistTaps="handled"
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                      >
                        {filteredGigTimeline[section.key].map((gig: any) => (
                          <View key={gig.id} style={[styles.gigTimelineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={styles.gigCardTopRow}>
                              <Text style={[styles.gigCardTitle, { color: colors.text }]} numberOfLines={1}>{gig.name || "Untitled Gig"}</Text>
                              <View style={[styles.gigStatusBadge, { backgroundColor: `${section.color}20` }]}>
                                <Text style={[styles.gigStatusBadgeText, { color: section.color }]}>{section.label.toUpperCase()}</Text>
                              </View>
                            </View>
                            <Text style={[styles.gigCardMeta, { color: colors.textSecondary }]}>{gig.performer_label}</Text>
                            <Text style={[styles.gigCardMeta, { color: colors.textSecondary }]}> 
                              {gig.event_date
                                ? new Date(gig.event_date).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                                : "Date TBA"}
                              {" • "}
                              {gig.location || "Location TBA"}
                            </Text>
                            <Text style={[styles.gigCardBudget, { color: colors.primary }]}>Budget: ₱{Number(gig.budget || 0).toLocaleString()}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={[styles.gigTimelineEmpty, { borderColor: colors.border, backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}>
                        <Text style={[styles.gigTimelineEmptyText, { color: colors.textSecondary }]}>No {section.label.toLowerCase()} gigs found.</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {profile?.role === "musician" && profile?.show_gig_statuses === false && isOwner && (
              <Text style={[styles.gigHiddenText, { color: colors.textSecondary }]}>Gig status is hidden from other users.</Text>
            )}

            {isOwner && !isGuest && (
              <View style={styles.bookmarkSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Bookmarks</Text>

                {loadingBookmarks ? (
                  <View style={[styles.bookmarkEmptyState, { borderColor: colors.border, backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}>
                    <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>Loading saved bookmarks...</Text>
                  </View>
                ) : (
                  ([
                    { key: "studios", title: "Studios", items: bookmarkedListings.studios, icon: "business-outline" },
                    { key: "gigs", title: "Gigs", items: bookmarkedListings.gigs, icon: "mic-outline" },
                    { key: "musicians", title: "Musicians", items: bookmarkedListings.musicians, icon: "people-outline" },
                  ] as const).map((section) => (
                    <View key={section.key} style={styles.bookmarkBlock}>
                      <Text style={[styles.bookmarkBlockTitle, { color: colors.text }]}> 
                        {section.title} ({section.items.length})
                      </Text>

                      {section.items.length > 0 ? (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.bookmarkHorizontalList}
                        >
                          {section.items.map((item) => (
                            <TouchableOpacity
                              key={`${section.key}-${item.id}`}
                              activeOpacity={1}
                              onPress={() => openBookmarkedListing(item.id)}
                              style={[
                                styles.bookmarkCard,
                                { backgroundColor: colors.surface, borderColor: colors.border },
                              ]}
                            >
                              {item.image ? (
                                <Image source={{ uri: item.image }} style={styles.bookmarkCardImage} />
                              ) : (
                                <View style={[styles.bookmarkCardImageFallback, { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" }]}>
                                  <Ionicons name={section.icon as any} size={20} color={colors.textSecondary} />
                                </View>
                              )}

                              <Text numberOfLines={1} style={[styles.bookmarkCardTitle, { color: colors.text }]}>
                                {item.name}
                              </Text>
                              <Text numberOfLines={1} style={[styles.bookmarkCardSubtitle, { color: colors.textSecondary }]}>
                                {item.subtitle}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      ) : (
                        <View style={[styles.bookmarkEmptyState, { borderColor: colors.border, backgroundColor: isDark ? "#1F2937" : "#F9FAFB" }]}>
                          <Text style={[styles.bookmarkEmptyText, { color: colors.textSecondary }]}>No saved {section.title.toLowerCase()} yet.</Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

          </View>

          {/* Menu Items (Owner Only) */}
          {isOwner ? (
            <View style={styles.menuContainer}>
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity activeOpacity={1}
                  key={item.label}
                  onPress={() => router.push(item.route as any)}
                  style={[styles.menuItem, { backgroundColor: colors.surface }]}
                >
                  <View style={styles.menuLeft}>
                    <View
                      style={[
                        styles.iconBox,
                        { backgroundColor: isDark ? "#1E293B" : "#F9FAFB" },
                      ]}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={colors.text}
                      />
                    </View>
                    <Text style={[styles.menuLabel, { color: colors.text }]}>
                      {item.label}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : isGuest ? (
            <View style={styles.menuContainer}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => router.push("/settings")}
                style={[styles.menuItem, { backgroundColor: colors.surface }]}
              >
                <View style={styles.menuLeft}>
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" },
                    ]}
                  >
                    <Ionicons name="settings-outline" size={20} color={colors.textSecondary} />
                  </View>
                  <View style={styles.menuTextBlock}>
                    <Text style={[styles.menuLabel, { color: colors.text }]}>Settings</Text>
                    <Text style={[styles.guestHintText, { color: colors.textSecondary }]}>Sign in first for wallet, edit profile, and other account actions.</Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          ) : (
            /* Public View Actions */
            <View style={styles.menuContainer}>
              <TouchableOpacity activeOpacity={1}
                onPress={openReportModal}
                style={[styles.menuItem, { backgroundColor: colors.surface }]}
              >
                <View style={styles.menuLeft}>
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: isDark ? "#450a0a" : "#fef2f2" },
                    ]}
                  >
                    <Ionicons name="flag-outline" size={20} color="#ef4444" />
                  </View>
                  <Text style={[styles.menuLabel, { color: "#ef4444" }]}>
                    Report User
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Media Section - Instagram Style Grid */}
          <View style={styles.mediaSection}>
            <View style={styles.mediaSectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Media
              </Text>
              {isOwner && profile?.portfolio_urls?.length > 0 && (
                <TouchableOpacity
                  onPress={addMediaToPortfolio}
                  disabled={uploading}
                  activeOpacity={1}
                  style={[
                    styles.addMediaBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {!profile?.portfolio_urls || profile.portfolio_urls.length === 0 ? (
              <View style={[styles.emptyMedia, { borderColor: colors.border }]}>
                <Ionicons
                  name="images-outline"
                  size={48}
                  color={colors.textSecondary}
                />
                <Text
                  style={[
                    styles.emptyMediaText,
                    { color: colors.textSecondary },
                  ]}
                >
                  No media yet
                </Text>
                <Text
                  style={[styles.emptyMediaSubtext, { color: colors.muted }]}
                >
                  {isOwner
                    ? "Share your best work!"
                    : "This musician hasn't added media yet"}
                </Text>
                {isOwner && (
                  <TouchableOpacity
                    onPress={addMediaToPortfolio}
                    disabled={uploading}
                    activeOpacity={1}
                    style={[
                      styles.uploadBtn,
                      {
                        backgroundColor: uploading
                          ? colors.textSecondary
                          : colors.primary,
                      },
                    ]}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={18}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.uploadBtnText}>
                      {uploading ? "Uploading..." : "Add Photos & Videos"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.mediaGrid}>
                {profile.portfolio_urls.map((url: string, i: number) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.gridItem}
                    onPress={() => openMediaViewer(url)}
                    activeOpacity={1}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.gridImage}
                      resizeMode="cover"
                    />
                    {isVideo(url) && (
                      <View style={styles.videoIndicator}>
                        <Ionicons name="play" size={24} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Media Viewer Modal */}
          <Modal
            visible={mediaModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMediaModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <TouchableOpacity activeOpacity={1}
                style={styles.modalCloseBtn}
                onPress={() => setMediaModalVisible(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>

              {selectedMedia &&
                (isVideo(selectedMedia) ? (
                  <Video
                    source={{ uri: selectedMedia }}
                    style={styles.modalMedia}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                  />
                ) : (
                  <Image
                    source={{ uri: selectedMedia }}
                    style={styles.modalMedia}
                    resizeMode="contain"
                  />
                ))}
            </View>
          </Modal>
        </ScrollView>
        <Navbar />
      </View>
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={submitProfileReport}
        targetName={profile?.full_name || profile?.name || 'this user'}
        title="Report User"
        reportType="profile"
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 220,
  },
  headerProfile: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 4,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  editIconBtn: {
    position: "absolute",
    bottom: 16,
    right: 0,
    padding: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nameText: {
    fontSize: 20,
    marginBottom: 4,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
  },
  roleText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  genreRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 24,
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  genreText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
  gigVisibilityCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  gigVisibilityTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  gigVisibilitySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: "100%",
  },
  gigTimelineSection: {
    width: "100%",
    marginTop: 14,
    gap: 14,
  },
  gigSearchWrap: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gigSearchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    paddingVertical: 0,
  },
  gigTimelineBlock: {
    gap: 8,
  },
  gigHorizontalList: {
    paddingRight: 8,
    gap: 10,
  },
  gigSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gigSectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  gigTimelineCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 4,
    width: 280,
  },
  gigCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  gigCardTitle: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  gigStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gigStatusBadgeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
  },
  gigCardMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  gigCardBudget: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    marginTop: 2,
  },
  gigTimelineEmpty: {
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  gigTimelineEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  gigHiddenText: {
    marginTop: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  bookmarkSection: {
    width: "100%",
    marginTop: 18,
    gap: 14,
  },
  bookmarkBlock: {
    gap: 8,
  },
  bookmarkBlockTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  bookmarkHorizontalList: {
    paddingRight: 8,
    gap: 10,
  },
  bookmarkCard: {
    width: 170,
    borderWidth: 1,
    borderRadius: 14,
    padding: 8,
    gap: 6,
  },
  bookmarkCardImage: {
    width: "100%",
    height: 88,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  bookmarkCardImageFallback: {
    width: "100%",
    height: 88,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bookmarkCardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  bookmarkCardSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
  },
  bookmarkEmptyState: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bookmarkEmptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  bioContainer: {
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: "100%",
  },
  bioText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  menuContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  menuItem: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 12,
    gap: 16,
  },
  menuTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
  guestHintText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
    flexShrink: 1,
    lineHeight: 18,
  },
  mediaSection: {
    marginTop: 24,
    marginBottom: 8,
  },
  mediaSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  addMediaBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    marginHorizontal: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
  },
  emptyMediaText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
  emptyMediaSubtext: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  uploadBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  uploadBtnText: {
    fontFamily: "Poppins_500Medium",
    color: "#fff",
    fontSize: 14,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
  },
  videoIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    padding: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  modalMedia: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  resumeSection: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  resumeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  resumeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  resumeTitle: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  resumeSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
  },
});
