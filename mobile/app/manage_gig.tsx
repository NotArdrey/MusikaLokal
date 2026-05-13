import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import InAppMediaViewer, { isInAppMediaUrl } from "../src/components/InAppMediaViewer";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import SlidingTabBar from "../src/components/SlidingTabBar";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useTheme } from "../src/context/ThemeContext";
import {
    hasValidCoordinates,
    openNavigationDirections,
} from "../src/utils/navigation";
import { formatFriendlyDateTime } from "../src/utils/friendlyDateTime";
import { getSmoothTabIndex, setSmoothTab } from "../src/utils/smoothTabs";

const { width: screenWidth } = Dimensions.get("window");
const PORTFOLIO_ITEM_SIZE = (screenWidth - 48 - 8) / 3; // 3 columns with gaps
const OWNER_GIG_TABS = ["About", "Applicants", "Review"];
const VIEWER_GIG_TABS = ["About", "Review"];
const ACCEPTED_GIG_STATUSES = ["accepted", "approved", "confirmed", "happening now", "completed"];

import { useLocalSearchParams } from "expo-router";

export default function GigDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { id, tab } = useLocalSearchParams<{ id?: string | string[]; tab?: string | string[] }>();
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const [activeTab, setActiveTab] = useState(
    OWNER_GIG_TABS.includes(requestedTab || "") ? requestedTab || "About" : "About",
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalButtonText, setModalButtonText] = useState("");
  const [modalAction, setModalAction] = useState<() => Promise<void> | void>(
    () => { },
  );

  const [authorized, setAuthorized] = useState(false);
  const [canManageGig, setCanManageGig] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [gig, setGig] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertVisible, setAlertVisible] = useState(false);
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
  const [mediaViewerUrl, setMediaViewerUrl] = useState<string | null>(null);
  const [mediaViewerTitle, setMediaViewerTitle] = useState("Media");

  useEffect(() => {
    const availableTabs = canManageGig ? OWNER_GIG_TABS : VIEWER_GIG_TABS;
    if (requestedTab && availableTabs.includes(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
      return;
    }
    if (!availableTabs.includes(activeTab)) {
      setActiveTab("About");
    }
  }, [activeTab, canManageGig, requestedTab]);

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
    const lowerTitle = (title || "").toLowerCase();
    let type: AlertType = "info";
    if (
      lowerTitle.includes("error") ||
      lowerTitle.includes("failed") ||
      lowerTitle.includes("unauthorized") ||
      lowerTitle.includes("invalid")
    ) {
      type = "error";
    } else if (lowerTitle.includes("success")) {
      type = "success";
    } else if (
      lowerTitle.includes("warning") ||
      lowerTitle.includes("decline") ||
      lowerTitle.includes("required")
    ) {
      type = "warning";
    }
    showAlert(type, title || "Notice", message || "", buttons);
  };

  const openMediaOrExternal = async (url: string, title = "Media") => {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) return;

    if (isInAppMediaUrl(normalizedUrl)) {
      setMediaViewerTitle(title);
      setMediaViewerUrl(normalizedUrl);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(normalizedUrl);
      if (supported) {
        await Linking.openURL(normalizedUrl);
      } else {
        Alert.alert("Error", "Unable to open link");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to open link");
    }
  };

  const Alert = { alert: showAlertNative };

  const fetchApplicationsFallback = async (gigId: string) => {
    const { data, error } = await supabase
      .from("gig_applications")
      .select("id, status, created_at, group_id, applicant_id")
      .eq("gig_id", gigId)
      .or("leader_approval_status.is.null,leader_approval_status.eq.approved")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const handleNavigateToGig = async () => {
    try {
      await openNavigationDirections({
        latitude: gig?.latitude,
        longitude: gig?.longitude,
        label: gig?.location || gig?.name || "Gig location",
      });
    } catch (error) {
      showAlert(
        "warning",
        "Navigation Unavailable",
        "This gig does not have pinned coordinates yet.",
      );
    }
  };

  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, []);

  const getRouteGigId = () => {
    const gigId = Array.isArray(id) ? id[0] : id;
    return typeof gigId === "string" && gigId.length > 0 ? gigId : null;
  };

  const hasAcceptedGigAccess = async (userId: string, gigId: string) => {
    const { data: soloApplication, error: soloError } = await supabase
      .from("gig_applications")
      .select("id")
      .eq("gig_id", gigId)
      .eq("applicant_id", userId)
      .is("group_id", null)
      .in("status", ACCEPTED_GIG_STATUSES)
      .limit(1)
      .maybeSingle();

    if (soloError) throw soloError;
    if (soloApplication?.id) return true;

    const { data: groupMembershipRows, error: membershipError } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);

    if (membershipError) throw membershipError;

    const joinedGroupIds = Array.from(
      new Set(
        (groupMembershipRows || [])
          .map((row: any) => row?.group_id)
          .filter((value: any): value is string => typeof value === "string" && value.length > 0),
      ),
    );

    if (joinedGroupIds.length === 0) return false;

    const { data: groupApplication, error: groupError } = await supabase
      .from("gig_applications")
      .select("id")
      .eq("gig_id", gigId)
      .in("group_id", joinedGroupIds)
      .in("status", ACCEPTED_GIG_STATUSES)
      .limit(1)
      .maybeSingle();

    if (groupError) throw groupError;
    return !!groupApplication?.id;
  };

  const checkAuthorization = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const gigId = getRouteGigId();
      if (!gigId) {
        Alert.alert("Error", "Invalid gig ID");
        router.replace("/home");
        return;
      }

      const { data: ownedGig, error: ownedGigError } = await supabase
        .from("gigs")
        .select("id")
        .eq("id", gigId)
        .eq("organizer_id", user.id)
        .maybeSingle();

      if (ownedGigError) throw ownedGigError;

      const ownsGig = !!ownedGig?.id && profile?.role === "venue-owner";
      const canViewAcceptedGig = ownsGig ? true : await hasAcceptedGigAccess(user.id, gigId);

      if (!ownsGig && !canViewAcceptedGig) {
        Alert.alert("Unauthorized", "You can only view gigs you manage or have been accepted for.");
        router.replace("/home");
        return;
      }

      setCanManageGig(ownsGig);
      setAuthorized(true);
      fetchData(user.id, ownsGig);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchData = async (userId: string, canManage = canManageGig) => {
    setLoading(true);
    try {
      // Ensure id is a string, not an array
      const gigId = getRouteGigId();
      if (!gigId) {
        Alert.alert("Error", "Invalid gig ID");
        router.replace("/home");
        return;
      }


      // Load 3NF sources first so newly created gigs are visible immediately.
      const [
        { data: gigData, error: gigError },
        { data: requirementRows, error: requirementsError },
        { data: mediaRows, error: mediaError },
        { data: legacyGig, error: legacyGigError },
      ] = await Promise.all([
        supabase
          .from('gigs')
          .select('*')
          .eq('id', gigId)
          .maybeSingle(),
        supabase
          .from('gig_requirements')
          .select('requirement_key, requirement_value')
          .eq('gig_id', gigId),
        supabase
          .from('gig_media')
          .select('media_url, media_type, sort_order, created_at')
          .eq('gig_id', gigId)
          .eq('media_type', 'image')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('gigs_legacy_projection')
          .select('requirements, images, documents')
          .eq('id', gigId)
          .single(),
      ]);

      if (gigError) throw gigError;
      if (!gigData) throw new Error("Gig not found");
      if (canManage && gigData.organizer_id !== userId) throw new Error("Unauthorized");
      if (requirementsError) throw requirementsError;
      if (mediaError) throw mediaError;

      // Legacy projection is fallback-only; do not fail page load if this read errors.
      if (legacyGigError) {
      }

      const requirementsFromRows = (requirementRows || []).reduce((acc: Record<string, any>, row: any) => {
        if (!row?.requirement_key) return acc;
        acc[row.requirement_key] = row.requirement_value;
        return acc;
      }, {});

      const imagesFromRows = (mediaRows || [])
        .map((row: any) => row?.media_url)
        .filter((url: any) => typeof url === 'string' && url.length > 0);

      setGig({
        ...gigData,
        requirements:
          Object.keys(requirementsFromRows).length > 0
            ? requirementsFromRows
            : (legacyGig?.requirements || {}),
        images: imagesFromRows.length > 0 ? imagesFromRows : (legacyGig?.images || []),
        documents: legacyGig?.documents || [],
      });

      if (canManage) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error("No active session");

          const { data: appData, error: appError } =
            await supabase.functions.invoke("gig-applications", {
              body: { action: "fetch_gig_applications", gigId: gigId, userId },
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            });
          if (appError) {
            const fallbackApps = await fetchApplicationsFallback(gigId);
            setApplications(fallbackApps);
          } else {
            setApplications(appData || []);
          }
        } catch (appErr) {
          setApplications([]);
        }
      } else {
        setApplications([]);
      }

      // Direct query to reviews table
      try {
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url)')
          .eq('gig_id', gigId)
          .order('created_at', { ascending: false });
        if (reviewError) {
        } else {
          setReviews(reviewData || []);
        }
      } catch (reviewErr) {
      }

    } catch (e: any) {
      let errorMsg = "Failed to load gig data";
      if (e.message?.includes("non-2xx")) {
        errorMsg += `\n\nServer Error (500). Please check edge function logs.`;
      }
      // Alert.alert("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const confirmAction = (applicationId: string, status: string) => {
    setModalTitle(
      status === "accepted" ? "Accept Application" : "Decline Application",
    );
    setModalMessage(
      `Are you sure you want to ${status === "accepted" ? "accept" : "decline"} this application?`,
    );
    setModalButtonText(status === "accepted" ? "Accept" : "Decline");
    setModalAction(() => async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!user || !session) return;

        const { error } = await supabase.functions.invoke("gig-applications", {
          body: {
            action: "update_application_status",
            applicationId,
            status,
            userId: user.id,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (error) throw error;

        setApplications(
          applications.map((a) =>
            a.id === applicationId ? { ...a, status } : a,
          ),
        );
        setModalVisible(false);
      } catch (e) {
        Alert.alert("Error", "Failed to update application status");
      }
    });
    setModalVisible(true);
  };

  const tabs = canManageGig ? OWNER_GIG_TABS : VIEWER_GIG_TABS;

  const formatMusicianType = (requirements?: any) => {
    const slots = requirements?.slots || {};
    const soloNeeded = Number(slots?.solo?.needed || 0);
    const duoNeeded = Number(slots?.duo?.needed || 0);
    const bandNeeded = Number(slots?.band?.needed || 0);

    if (duoNeeded > 0 && soloNeeded === 0 && bandNeeded === 0) return "Duo";
    if (soloNeeded > 0 && duoNeeded === 0 && bandNeeded === 0) return "Solo";
    if (bandNeeded > 0 && soloNeeded === 0 && duoNeeded === 0) return "Group";
    if (soloNeeded > 0 && (duoNeeded > 0 || bandNeeded > 0)) return "Both";
    if (duoNeeded > 0 || bandNeeded > 0) return "Group";

    const type = requirements?.musician_type;
    if (!type) return "Not specified";
    return String(type).charAt(0).toUpperCase() + String(type).slice(1);
  };

  const formatStatusLabel = (value?: unknown) => {
    const raw = typeof value === "string" ? value : "";
    if (!raw.trim()) return "Not submitted";
    return raw
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getEventSchedules = (sourceGig?: any) => {
    const schedules = sourceGig?.requirements?.event_schedules;
    if (Array.isArray(schedules) && schedules.length > 0) {
      return schedules
        .map((schedule: any, index: number) => ({
          id: schedule?.id || `${schedule?.date || sourceGig?.event_date || "schedule"}-${index}`,
          date: schedule?.date || sourceGig?.event_date,
          start: schedule?.start || schedule?.start_time || sourceGig?.requirements?.event_start_time,
          end: schedule?.end || schedule?.end_time || sourceGig?.requirements?.event_end_time,
        }))
        .filter((schedule: any) => schedule.date || schedule.start || schedule.end);
    }

    if (
      sourceGig?.event_date ||
      sourceGig?.requirements?.event_start_time ||
      sourceGig?.requirements?.event_end_time
    ) {
      return [{
        id: "primary-schedule",
        date: sourceGig?.event_date,
        start: sourceGig?.requirements?.event_start_time,
        end: sourceGig?.requirements?.event_end_time,
      }];
    }

    return [];
  };

  const getSlotGroups = (requirements?: any) => {
    const slots = requirements?.slots || {};
    const groups = [
      { key: "solo", label: "Solo", data: slots.solo },
      { key: "duo", label: "Duo", data: slots.duo },
      { key: "band", label: "Group", data: slots.band },
    ];

    return groups
      .map((group) => ({
        ...group,
        needed: Number(group.data?.needed || 0),
        roles: Array.isArray(group.data?.roles) ? group.data.roles : [],
        genres: Array.isArray(group.data?.preferred_genres)
          ? group.data.preferred_genres
          : [],
        instruments: Array.isArray(group.data?.preferred_instruments)
          ? group.data.preferred_instruments
          : [],
        groupTypes: Array.isArray(group.data?.preferred_group_types)
          ? group.data.preferred_group_types
          : [],
      }))
      .filter((group) => group.needed > 0);
  };

  const eventSchedules = getEventSchedules(gig);
  const slotGroups = getSlotGroups(gig?.requirements);

  // Show loading while checking authorization
  if (checkingAuth) {
    return (
      <View
        style={[
          styles.flex1,
          styles.centerContainer,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            marginTop: 16,
            color: colors.textSecondary,
            fontFamily: "Poppins_400Regular",
          }}
        >
          Checking permissions...
        </Text>
      </View>
    );
  }

  // Don't render if not authorized
  if (!authorized) {
    return null;
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title={canManageGig ? "Manage Gig" : "View Gig"} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        >
          {/* Header Image & Info */}
          <View style={styles.headerContainer}>
            <View
              style={[
                styles.headerImageContainer,
                {
                  shadowColor: colors.primary,
                },
              ]}
            >
              <Image
                source={{
                  uri: (gig?.images && gig.images[0]) || gig?.image || null,
                }}
                style={[styles.headerImage, { backgroundColor: colors.border }]}
                resizeMode="cover"
              />

            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {gig?.name || "Loading..."}
            </Text>
            <Text
              style={[styles.headerLocation, { color: colors.textSecondary }]}
            >
              {gig?.event_date
                ? formatFriendlyDateTime(gig.event_date, { forceDateOnly: true })
                : "Date TBA"}
              {gig?.requirements?.event_start_time &&
                gig?.requirements?.event_end_time
                ? ` at ${gig.requirements.event_start_time} - ${gig.requirements.event_end_time}`
                : ""}
              {" - "}
              {gig?.location || "Location N/A"}
            </Text>
            {hasValidCoordinates(gig?.latitude, gig?.longitude) && (
              <TouchableOpacity activeOpacity={1}
                style={[styles.navigateButton, { backgroundColor: colors.primary }]}
                onPress={handleNavigateToGig}
              >
                <Ionicons name="navigate-outline" size={16} color="#FFF" />
                <Text style={styles.navigateButtonText}>Navigate</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tabs */}
          <SlidingTabBar
            activeColor={colors.primary}
            activeKey={activeTab}
            borderColor={colors.border}
            indicatorColor={colors.primary}
            indicatorWidthRatio={0.34}
            onChange={(tab) => setSmoothTab(setActiveTab, tab)}
            style={styles.tabsContainer}
            tabs={tabs.map((tab) => ({ key: tab, label: tab }))}
            textStyle={styles.tabText}
          />

          <SmoothTabTransition
            activeKey={activeTab}
            activeIndex={getSmoothTabIndex(tabs, activeTab)}
            renderOutgoing={false}
            style={styles.contentContainer}
          >
            {activeTab === "About" && (
              <View style={styles.aboutContainer}>
                <View>
                  <Text
                    style={[styles.aboutText, { color: colors.textSecondary }]}
                  >
                    {gig?.description || "No description available."}
                  </Text>
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Schedule
                  </Text>
                  {eventSchedules.length > 0 ? (
                    <View style={styles.detailList}>
                      {eventSchedules.map((schedule: any) => (
                        <View
                          key={schedule.id}
                          style={[
                            styles.detailCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.detailCardTitle, { color: colors.text }]}>
                              {schedule.date
                                ? formatFriendlyDateTime(schedule.date, { forceDateOnly: true })
                                : "Date TBA"}
                            </Text>
                            <Text style={[styles.detailCardText, { color: colors.textSecondary }]}>
                              {schedule.start && schedule.end
                                ? `${schedule.start} - ${schedule.end}`
                                : "Time TBA"}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No schedule set.
                    </Text>
                  )}
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Needs
                  </Text>

                  <View style={{ gap: 12 }}>
                    <View>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                          marginBottom: 6,
                        }}
                      >
                        Genres
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {gig?.requirements?.genres?.length ? (
                          gig.requirements.genres.map(
                            (genre: string, idx: number) => (
                              <View
                                key={idx}
                                style={[
                                  styles.skillTag,
                                  { backgroundColor: colors.inputBackground },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Poppins_500Medium",
                                    fontSize: 12,
                                    color: colors.text,
                                  }}
                                >
                                  {genre}
                                </Text>
                              </View>
                            ),
                          )
                        ) : (
                          <Text style={{ color: colors.textSecondary }}>
                            No specific genres
                          </Text>
                        )}
                      </View>
                    </View>

                    <View>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                          marginBottom: 6,
                        }}
                      >
                        Provided equipments
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {gig?.requirements?.instruments?.length ? (
                          gig.requirements.instruments.map(
                            (instrument: string, idx: number) => (
                              <View
                                key={idx}
                                style={[
                                  styles.skillTag,
                                  { backgroundColor: colors.inputBackground },
                                ]}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Poppins_500Medium",
                                    fontSize: 12,
                                    color: colors.text,
                                  }}
                                >
                                  {instrument}
                                </Text>
                              </View>
                            ),
                          )
                        ) : (
                          <Text style={{ color: colors.textSecondary }}>
                            No provided equipments
                          </Text>
                        )}
                      </View>
                    </View>

                    <View>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                          marginBottom: 6,
                        }}
                      >
                        Musician Type
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.text,
                        }}
                      >
                        {formatMusicianType(gig?.requirements)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Slot Details
                  </Text>
                  {slotGroups.length > 0 ? (
                    <View style={styles.detailList}>
                      {slotGroups.map((slotGroup) => (
                        <View
                          key={slotGroup.key}
                          style={[
                            styles.slotDetailCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <View style={styles.slotDetailHeader}>
                            <Text style={[styles.slotDetailTitle, { color: colors.text }]}>
                              {slotGroup.label}
                            </Text>
                            <Text style={[styles.slotDetailCount, { color: colors.primary }]}>
                              {slotGroup.needed} needed
                            </Text>
                          </View>
                          {slotGroup.roles.length > 0 ? (
                            <Text style={[styles.detailCardText, { color: colors.textSecondary }]}>
                              Roles: {slotGroup.roles.join(", ")}
                            </Text>
                          ) : null}
                          {slotGroup.groupTypes.length > 0 ? (
                            <Text style={[styles.detailCardText, { color: colors.textSecondary }]}>
                              Preferred group types: {slotGroup.groupTypes.join(", ")}
                            </Text>
                          ) : null}
                          {slotGroup.genres.length > 0 ? (
                            <Text style={[styles.detailCardText, { color: colors.textSecondary }]}>
                              Preferred genres: {slotGroup.genres.join(", ")}
                            </Text>
                          ) : null}
                          {slotGroup.instruments.length > 0 ? (
                            <Text style={[styles.detailCardText, { color: colors.textSecondary }]}>
                              Preferred instruments: {slotGroup.instruments.join(", ")}
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No slot details configured.
                    </Text>
                  )}
                </View>

                {/* The Offer Card */}
                <View
                  style={[
                    styles.offerCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  <View style={styles.offerHeader}>
                    <Ionicons
                      name="cash-outline"
                      size={24}
                      color={colors.primary}
                    />
                    <Text style={[styles.offerTitle, { color: colors.text }]}>The Offer</Text>
                  </View>
                  <View
                    style={[
                      styles.offerInfo,
                      { borderColor: colors.border, borderBottomWidth: 0 },
                    ]}
                  >
                    <View>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.textSecondary,
                        }}
                      >
                        Payout
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Poppins_600SemiBold",
                          color: colors.text,
                          fontSize: 16,
                        }}
                      >
                        Total Payout
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={[styles.payoutAmount, { color: colors.primary }]}
                      >
                        ₱{(gig?.budget || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Venue Gallery
                  </Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryContainer}
                  >
                    {gig?.images && gig.images.length > 0 ? (
                      gig.images.map((img: string, i: number) => (
                        <Image
                          key={i}
                          source={{ uri: img }}
                          style={styles.galleryImage}
                        />
                      ))
                    ) : (
                      <Text style={{ color: colors.textSecondary }}>
                        No images uploaded.
                      </Text>
                    )}
                  </ScrollView>
                </View>

                {/* Contract Section */}
                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Contract
                  </Text>
                  {gig?.contract_url ? (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => openMediaOrExternal(gig.contract_url, "Contract")}
                      style={[
                        styles.contractCard,
                        {
                          backgroundColor: isDark ? "#1F2937" : "#F3F4F6",
                          borderColor: isDark ? "#374151" : "#E5E7EB",
                        },
                      ]}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          flex: 1,
                        }}
                      >
                        <View
                          style={[
                            styles.contractIcon,
                            { backgroundColor: colors.primary },
                          ]}
                        >
                          <Ionicons
                            name="document-text"
                            size={24}
                            color="#fff"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.contractTitle,
                              { color: colors.text },
                            ]}
                          >
                            Gig Contract
                          </Text>
                          <Text
                            style={[
                              styles.contractSubtitle,
                              { color: colors.textSecondary },
                            ]}
                          >
                            Musicians will see this before applying
                          </Text>
                        </View>
                        <Ionicons
                          name="open-outline"
                          size={20}
                          color={colors.primary}
                        />
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.noContractCard,
                        {
                          backgroundColor: isDark ? "#1F2937" : "#F9FAFB",
                          borderColor: isDark ? "#374151" : "#E5E7EB",
                        },
                      ]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={32}
                        color={colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.noContractText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        No contract uploaded
                      </Text>
                      <TouchableOpacity activeOpacity={1}
                        onPress={() =>
                          router.push({
                            pathname: "/edit_gig",
                            params: { id: gig?.id, returnTab: "About" },
                          })
                        }
                        style={{ marginTop: 8 }}
                      >
                        <Text
                          style={{
                            color: colors.primary,
                            fontFamily: "Poppins_500Medium",
                            fontSize: 13,
                          }}
                        >
                          Add Contract
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <View>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.text, marginBottom: 12 },
                    ]}
                  >
                    Business Permit
                  </Text>
                  <View
                    style={[
                      styles.documentMetaCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={styles.documentMetaRow}>
                      <View style={[styles.contractIcon, { backgroundColor: colors.primary }]}>
                        <Ionicons name="shield-checkmark-outline" size={24} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.contractTitle, { color: colors.text }]}>
                          {formatStatusLabel(gig?.permit_status)}
                        </Text>
                        {gig?.permit_rejection_reason ? (
                          <Text style={[styles.contractSubtitle, { color: colors.textSecondary }]}>
                            {gig.permit_rejection_reason}
                          </Text>
                        ) : (
                          <Text style={[styles.contractSubtitle, { color: colors.textSecondary }]}>
                            Permit status from the gig profile.
                          </Text>
                        )}
                      </View>
                    </View>
                    {gig?.business_permit_url ? (
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => openMediaOrExternal(gig.business_permit_url, "Business Permit")}
                        style={[
                          styles.mediaButton,
                          { borderColor: colors.primary, marginBottom: 0, marginTop: 12 },
                        ]}
                      >
                        <Ionicons name="open-outline" size={18} color={colors.primary} />
                        <Text style={[styles.mediaButtonText, { color: colors.primary }]}>
                          View Business Permit
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {activeTab === "Applicants" && (
              <View style={styles.applicantsContainer}>
                <Text
                  style={[
                    styles.applicantsTitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  APPLICANTS LIST
                </Text>

                {applications.length === 0 ? (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      textAlign: "center",
                      marginTop: 20,
                    }}
                  >
                    No applications yet.
                  </Text>
                ) : (
                  applications.map((app) => {
                    const rosterProfile = app.production_roster?.roster_profile;
                    const rosterGroup = app.production_roster?.roster_group;
                    const displayGroup = app.group || rosterGroup;
                    const displayApplicant = rosterProfile || app.applicant;
                    const displayName =
                      displayGroup?.name ||
                      displayApplicant?.full_name ||
                      "Unknown Applicant";
                    const displayGenres =
                      displayGroup?.genre ||
                      displayApplicant?.genres?.join(", ") ||
                      (app.production_team?.name ? "Production submission" : "Musician");
                    const displayLocation =
                      displayGroup?.location || displayApplicant?.location;
                    const displaySkills = displayApplicant?.skills || [];
                    const displayPortfolio = displayApplicant?.portfolio_urls || [];
                    const displayAvatar =
                      displayGroup?.images?.[0] ||
                      displayApplicant?.avatar_url ||
                      app.production_team?.logo_url ||
                      "https://i.pravatar.cc/100";

                    return (
                    <View
                      key={app.id}
                      style={[
                        styles.applicantCard,
                        { backgroundColor: colors.surface, marginBottom: 16 },
                      ]}
                    >
                      {/* Applicant Header */}
                      <View style={styles.applicantHeader}>
                        <Image
                          source={{
                            uri: displayAvatar,
                          }}
                          style={styles.applicantImage}
                        />
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "Poppins_600SemiBold",
                                fontSize: 16,
                                color: colors.text,
                              }}
                            >
                              {displayName}
                            </Text>
                            <View
                              style={[
                                styles.statusBadge,
                                {
                                  backgroundColor:
                                    app.status === "pending"
                                      ? colors.primary + "15"
                                      : app.status === "accepted"
                                        ? "#10B98115"
                                        : app.status === "approved"
                                          ? "#10B98115"
                                          : "#EF444415",
                                  borderWidth: 1,
                                  borderColor:
                                    app.status === "pending"
                                      ? colors.primary
                                      : app.status === "accepted" ||
                                        app.status === "approved"
                                        ? "#10B981"
                                        : "#EF4444",
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontFamily: "Poppins_600SemiBold",
                                  fontSize: 11,
                                  color:
                                    app.status === "pending"
                                      ? colors.primary
                                      : app.status === "accepted" ||
                                        app.status === "approved"
                                        ? "#10B981"
                                        : "#EF4444",
                                }}
                              >
                                {app.status === "accepted" ||
                                  app.status === "approved"
                                  ? "Accepted"
                                  : app.status === "rejected"
                                    ? "Declined"
                                    : "Pending"}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              fontSize: 12,
                              color: colors.textSecondary,
                            }}
                          >
                            {displayGenres}
                            {displayLocation && ` • ${displayLocation}`}
                          </Text>
                          {app.production_team?.name && (
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                fontSize: 11,
                                color: colors.primary,
                                marginTop: 4,
                              }}
                            >
                              Submitted via {app.production_team.name}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Skills/Instruments */}
                      {displaySkills.length > 0 && (
                          <View style={{ marginBottom: 12 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                fontSize: 12,
                                color: colors.textSecondary,
                                marginBottom: 6,
                              }}
                            >
                              Skills
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 6,
                              }}
                            >
                              {displaySkills
                                .slice(0, 5)
                                .map((skill: string, idx: number) => (
                                  <View
                                    key={idx}
                                    style={[
                                      styles.skillTag,
                                      {
                                        backgroundColor: colors.inputBackground,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={{
                                        fontFamily: "Poppins_500Medium",
                                        fontSize: 11,
                                        color: colors.text,
                                      }}
                                    >
                                      {skill}
                                    </Text>
                                  </View>
                                ))}
                              {displaySkills.length > 5 && (
                                <View
                                  style={[
                                    styles.skillTag,
                                    { backgroundColor: colors.primary + "20" },
                                  ]}
                                >
                                  <Text
                                    style={{
                                      fontFamily: "Poppins_500Medium",
                                      fontSize: 11,
                                      color: colors.primary,
                                    }}
                                  >
                                    +{displaySkills.length - 5}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )}

                      {/* Group Members */}
                      {displayGroup?.members && displayGroup.members.length > 0 && (
                        <View style={{ marginBottom: 12 }}>
                          <Text
                            style={{
                              fontFamily: "Poppins_500Medium",
                              fontSize: 12,
                              color: colors.textSecondary,
                              marginBottom: 6,
                            }}
                          >
                            Group Members ({displayGroup.members.length})
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              fontSize: 13,
                              color: colors.text,
                            }}
                          >
                            {displayGroup.members
                              .map((m: any) =>
                                typeof m === "string" ? m : m.name,
                              )
                              .join(", ")}
                          </Text>
                        </View>
                      )}

                      {/* Pitch Message */}
                      <View style={{ marginBottom: 12 }}>
                        <Text
                          style={{
                            fontFamily: "Poppins_500Medium",
                            fontSize: 12,
                            color: colors.textSecondary,
                            marginBottom: 6,
                          }}
                        >
                          Pitch Message
                        </Text>
                        <View
                          style={[
                            styles.pitchBox,
                            { backgroundColor: colors.inputBackground },
                          ]}
                        >
                          <Ionicons
                            name="chatbubble-outline"
                            size={16}
                            color={colors.textSecondary}
                            style={{ marginRight: 8 }}
                          />
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              fontSize: 13,
                              color: colors.text,
                              flex: 1,
                              lineHeight: 20,
                            }}
                          >
                            {app.pitch_message || "No pitch message provided."}
                          </Text>
                        </View>
                      </View>

                      {/* Demo Video */}
                      {app.video_url && (
                        <TouchableOpacity activeOpacity={1}
                          onPress={() => openMediaOrExternal(app.video_url, "Demo Video")}
                          style={[
                            styles.mediaButton,
                            {
                              backgroundColor: colors.primary + "15",
                              borderColor: colors.primary,
                            },
                          ]}
                        >
                          <Ionicons
                            name="videocam"
                            size={18}
                            color={colors.primary}
                          />
                          <Text
                            style={{
                              fontFamily: "Poppins_500Medium",
                              fontSize: 13,
                              color: colors.primary,
                              marginLeft: 8,
                            }}
                          >
                            Watch Demo Video
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* CV/Resume */}
                      {app.cv_url && (
                        <View style={{ marginBottom: 12 }}>
                          <Text
                            style={{
                              fontFamily: "Poppins_500Medium",
                              fontSize: 12,
                              color: colors.textSecondary,
                              marginBottom: 8,
                            }}
                          >
                            CV / Resume
                          </Text>
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => openMediaOrExternal(app.cv_url, "CV / Resume")}
                            style={[
                              styles.cvButton,
                              {
                                backgroundColor: colors.primary + "15",
                                borderColor: colors.primary,
                              },
                            ]}
                          >
                            <Ionicons
                              name="document-text"
                              size={18}
                              color={colors.primary}
                            />
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                fontSize: 13,
                                color: colors.primary,
                                marginLeft: 8,
                                flex: 1,
                              }}
                            >
                              View CV/Resume
                            </Text>
                            <Ionicons
                              name="open-outline"
                              size={16}
                              color={colors.primary}
                            />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Portfolio/Music - Instagram Style Grid */}
                      {displayPortfolio.length > 0 && (
                          <View style={{ marginBottom: 12 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                fontSize: 12,
                                color: colors.textSecondary,
                                marginBottom: 12,
                              }}
                            >
                              Music & Portfolio
                            </Text>
                            <View style={styles.portfolioGrid}>
                              {displayPortfolio.map(
                                (url: string, idx: number) => {
                                  const isImage =
                                    /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                                  const isVideo =
                                    /\.(mp4|mov|webm)$/i.test(url) ||
                                    url.includes("youtube") ||
                                    url.includes("vimeo");
                                  const isSpotify = url.includes("spotify");
                                  const isSoundCloud =
                                    url.includes("soundcloud");

                                  return (
                                    <TouchableOpacity activeOpacity={1}
                                      key={idx}
                                      onPress={() => openMediaOrExternal(url, isVideo ? "Portfolio Video" : "Portfolio Media")}
                                      style={[
                                        styles.portfolioGridItem,
                                        {
                                          backgroundColor:
                                            colors.inputBackground,
                                        },
                                      ]}
                                    >
                                      {isImage ? (
                                        <Image
                                          source={{ uri: url }}
                                          style={styles.portfolioImage}
                                          resizeMode="cover"
                                        />
                                      ) : (
                                        <View
                                          style={styles.portfolioPlaceholder}
                                        >
                                          <View
                                            style={[
                                              styles.portfolioIconCircle,
                                              {
                                                backgroundColor:
                                                  colors.primary + "20",
                                              },
                                            ]}
                                          >
                                            <Ionicons
                                              name={
                                                isVideo
                                                  ? "play"
                                                  : isSpotify
                                                    ? "musical-notes"
                                                    : isSoundCloud
                                                      ? "cloud"
                                                      : "link"
                                              }
                                              size={24}
                                              color={colors.primary}
                                            />
                                          </View>
                                          <Text
                                            style={{
                                              fontFamily: "Poppins_500Medium",
                                              fontSize: 10,
                                              color: colors.textSecondary,
                                              marginTop: 6,
                                              textAlign: "center",
                                            }}
                                            numberOfLines={1}
                                          >
                                            {isVideo
                                              ? "Video"
                                              : isSpotify
                                                ? "Spotify"
                                                : isSoundCloud
                                                  ? "SoundCloud"
                                                  : "Link"}
                                          </Text>
                                        </View>
                                      )}
                                      {isVideo && (
                                        <View
                                          style={styles.portfolioPlayOverlay}
                                        >
                                          <Ionicons
                                            name="play-circle"
                                            size={32}
                                            color="#fff"
                                          />
                                        </View>
                                      )}
                                    </TouchableOpacity>
                                  );
                                },
                              )}
                            </View>
                          </View>
                        )}

                      {/* Legacy Portfolio Links (for non-media URLs) */}
                      {displayPortfolio.filter(
                          (url: string) =>
                            !/\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)$/i.test(
                              url,
                            ) &&
                            !url.includes("youtube") &&
                            !url.includes("vimeo") &&
                            !url.includes("spotify") &&
                            !url.includes("soundcloud"),
                        ).length > 0 && (
                          <View style={{ marginBottom: 12 }}>
                            <Text
                              style={{
                                fontFamily: "Poppins_500Medium",
                                fontSize: 12,
                                color: colors.textSecondary,
                                marginBottom: 8,
                              }}
                            >
                              Other Links
                            </Text>
                            {displayPortfolio
                              .filter(
                                (url: string) =>
                                  !/\.(jpg|jpeg|png|gif|webp|mp4|mov|webm)$/i.test(
                                    url,
                                  ) &&
                                  !url.includes("youtube") &&
                                  !url.includes("vimeo") &&
                                  !url.includes("spotify") &&
                                  !url.includes("soundcloud"),
                              )
                              .slice(0, 3)
                              .map((url: string, idx: number) => (
                                <TouchableOpacity activeOpacity={1}
                                  key={idx}
                                  onPress={() => openMediaOrExternal(url, "Portfolio Link")}
                                  style={[
                                    styles.portfolioLink,
                                    { backgroundColor: colors.inputBackground },
                                  ]}
                                >
                                  <Ionicons
                                    name="link"
                                    size={16}
                                    color={colors.primary}
                                  />
                                  <Text
                                    style={{
                                      fontFamily: "Poppins_400Regular",
                                      fontSize: 12,
                                      color: colors.primary,
                                      flex: 1,
                                      marginLeft: 8,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {url.replace(/https?:\/\/(www\.)?/, "")}
                                  </Text>
                                  <Ionicons
                                    name="open-outline"
                                    size={14}
                                    color={colors.textSecondary}
                                  />
                                </TouchableOpacity>
                              ))}
                          </View>
                        )}

                      {/* View Full Profile Button */}
                      <TouchableOpacity activeOpacity={1}
                        onPress={() => {
                          if (displayGroup?.id) {
                            router.push({
                              pathname: "/group_details",
                              params: { id: displayGroup.id },
                            });
                          } else if (displayApplicant?.id) {
                            router.push({
                              pathname: "/profile",
                              params: { userId: displayApplicant.id },
                            });
                          } else if (app.applicant_id) {
                            router.push({
                              pathname: "/profile",
                              params: { userId: app.applicant_id },
                            });
                          } else {
                            Alert.alert("Error", "Unable to view profile");
                          }
                        }}
                        style={[
                          styles.viewProfileBtn,
                          { borderColor: colors.border },
                        ]}
                      >
                        <Ionicons
                          name="person-circle-outline"
                          size={18}
                          color={colors.text}
                        />
                        <Text
                          style={{
                            fontFamily: "Poppins_500Medium",
                            fontSize: 13,
                            color: colors.text,
                            marginLeft: 8,
                          }}
                        >
                          View Full {displayGroup ? "Group" : "Profile"}
                        </Text>
                      </TouchableOpacity>

                      {/* Action Buttons */}
                      {canManageGig && app.status === "pending" && (
                        <View style={[styles.actionButtons, { marginTop: 12 }]}>
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => confirmAction(app.id, "rejected")}
                            style={[
                              styles.declineButton,
                              { borderColor: colors.border },
                            ]}
                          >
                            <Text
                              style={{
                                fontFamily: "Poppins_600SemiBold",
                                color: colors.text,
                              }}
                            >
                              Decline
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity activeOpacity={1}
                            onPress={() => confirmAction(app.id, "accepted")}
                            style={[
                              styles.acceptButton,
                              { backgroundColor: colors.primary },
                            ]}
                          >
                            <Text
                              style={{
                                fontFamily: "Poppins_600SemiBold",
                                color: "#FFF",
                              }}
                            >
                              Accept
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    );
                  })
                )}
              </View>
            )}

            {activeTab === "Review" && (
              <View>
                <View style={styles.reviewHeader}>
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {gig?.rating?.toFixed(1) || "0.0"}
                  </Text>
                  <View style={styles.starsRow}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={i}
                        name={
                          i < Math.round(gig?.rating || 0)
                            ? "star"
                            : "star-outline"
                        }
                        size={20}
                        color={colors.primary}
                      />
                    ))}
                  </View>
                  <Text
                    style={{
                      fontFamily: "Poppins_400Regular",
                      color: colors.textSecondary,
                    }}
                  >
                    Based on {gig?.review_count || 0} reviews
                  </Text>
                </View>

                {reviews.length > 0 ? (
                  reviews.map((review) => (
                    <View
                      key={review.id}
                      style={[
                        styles.reviewCard,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <View style={styles.reviewUserHeader}>
                        <View style={styles.userInfo}>
                          <Image
                            source={{ uri: review.author?.avatar_url || null }}
                            style={[
                              styles.userAvatar,
                              { backgroundColor: colors.border },
                            ]}
                          />
                          <Text
                            style={{
                              fontFamily: "Poppins_600SemiBold",
                              color: colors.text,
                            }}
                          >
                            {review.author?.full_name || "User"}
                          </Text>
                        </View>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.textSecondary,
                            fontFamily: "Poppins_400Regular",
                          }}
                        >
                          {formatFriendlyDateTime(review.created_at)}
                        </Text>
                      </View>
                      <View style={[styles.starsRow, { marginBottom: 8 }]}>
                        {[...Array(5)].map((_, i) => (
                          <Ionicons
                            key={i}
                            name={i < review.rating ? "star" : "star-outline"}
                            size={14}
                            color={colors.primary}
                          />
                        ))}
                      </View>
                      <Text
                        style={[
                          styles.reviewText,
                          { color: colors.textSecondary },
                        ]}
                      >
                        {review.comment}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text
                    style={{ color: colors.textSecondary, textAlign: "center" }}
                  >
                    No reviews yet.
                  </Text>
                )}
              </View>
            )}
          </SmoothTabTransition>
        </ScrollView>

        <Navbar />
      </View>
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onConfirm={modalAction}
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
        danger={modalButtonText === "Decline"}
      />
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
      <InAppMediaViewer
        visible={!!mediaViewerUrl}
        uri={mediaViewerUrl}
        title={mediaViewerTitle}
        onClose={() => setMediaViewerUrl(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 180,
  },
  headerContainer: {
    paddingHorizontal: 24,
    marginTop: 16,
    alignItems: "center",
  },
  headerImageContainer: {
    width: "100%",
    height: 192,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 16,
    position: "relative",
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },

  headerTitle: {
    fontSize: 24,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
  },
  headerLocation: {
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
  },
  navigateButton: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  navigateButtonText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  tabsContainer: {
    marginHorizontal: 24,
    marginTop: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabText: {
    fontSize: 13,
  },
  contentContainer: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  aboutContainer: {
    gap: 24,
  },
  aboutText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Poppins_400Regular",
  },
  offerCard: {
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
  },
  offerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  offerTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
  },
  offerInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    paddingBottom: 16,
    marginBottom: 16,
  },
  payoutAmount: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  detailList: {
    gap: 12,
  },
  detailCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  detailCardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  detailCardText: {
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  slotDetailCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  slotDetailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  slotDetailTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
  },
  slotDetailCount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  galleryContainer: {
    gap: 12,
  },
  galleryImage: {
    width: 160,
    height: 112,
    borderRadius: 12,
    marginRight: 12,
  },
  infoContainer: {
    gap: 24,
  },
  capacityContainer: {
    flexDirection: "row",
    gap: 16,
  },
  capacityCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  techSpecsCard: {
    padding: 16,
    borderRadius: 16,
  },
  techSpecsTitle: {
    fontSize: 18,
    marginBottom: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  techSpecItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  techSpecInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  techSpecIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  applicantsContainer: {
    gap: 16,
  },
  applicantsTitle: {
    fontSize: 13,
    letterSpacing: 0.5,
    fontFamily: "Poppins_600SemiBold",
  },
  applicantCard: {
    padding: 16,
    borderRadius: 24,
  },
  applicantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  applicantImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  starRatingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  applicantMessage: {
    marginBottom: 16,
    fontStyle: "italic",
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  ratingText: {
    fontSize: 48,
    marginBottom: 8,
    fontFamily: "Poppins_600SemiBold",
  },
  starsRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
  },
  reviewCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reviewUserHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reviewText: {
    lineHeight: 20,
  },
  contractCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  contractIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  contractTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 2,
  },
  contractSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  noContractCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  noContractText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
    marginTop: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  skillTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pitchBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 12,
  },
  mediaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  mediaButtonText: {
    marginLeft: 8,
    fontFamily: "Poppins_600SemiBold",
  },
  documentMetaCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  documentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  portfolioLink: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  viewProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  // CV/Resume Button Style
  cvButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  // Instagram-style Portfolio Grid
  portfolioGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  portfolioGridItem: {
    width: PORTFOLIO_ITEM_SIZE,
    height: PORTFOLIO_ITEM_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  portfolioImage: {
    width: "100%",
    height: "100%",
  },
  portfolioPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  portfolioIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  portfolioPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
});

