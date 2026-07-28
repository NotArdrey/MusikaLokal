import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Linking,
    Modal as RNModal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import ProfileAvatar from "../src/components/ProfileAvatar";
import ProductionInviteSection from "../src/components/ProductionInviteSection";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useTheme } from "../src/context/ThemeContext";
import {
    hasValidCoordinates,
    openNavigationDirections,
} from "../src/utils/navigation";
import { formatDashedNumericDate } from "../src/utils/friendlyDateTime";
import { ProductionInviteTarget } from "../src/utils/productionTeamInvites";
import { fetchActiveStaffAssignment, getStaffPermissions } from "../src/utils/staffAccess";
import { sendVenueGigInvites } from "../src/utils/venueGigInvites";

const { width: screenWidth } = Dimensions.get("window");
const PORTFOLIO_ITEM_SIZE = (screenWidth - 48 - 8) / 3; // 3 columns with gaps
const OWNER_GIG_TABS = ["About", "Applicants", "Review"];
const VIEWER_GIG_TABS = ["About", "Review"];
const ACCEPTED_GIG_STATUSES = ["accepted", "approved", "confirmed", "happening now", "completed"];
type ApplicationFilter = "All" | "Pending" | "Accepted" | "Declined" | "Recommended";
const APPLICATION_FILTERS: ApplicationFilter[] = ["All", "Pending", "Accepted", "Declined", "Recommended"];

export default function GigDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && viewportWidth >= 768;
  const pageBackground = isWebDesktop
    ? isDark
      ? "#0A1224"
      : "#E9EEF8"
    : colors.background;
  const pageCardBackground = isWebDesktop
    ? isDark
      ? "#0F172A"
      : "#FFFFFF"
    : colors.card;
  const borderSoft = isWebDesktop
    ? isDark
      ? "#1E2C48"
      : "#D8E3F2"
    : colors.border;
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [gig, setGig] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [applicationFilter, setApplicationFilter] = useState<ApplicationFilter>("All");
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [selectedInviteTargets, setSelectedInviteTargets] = useState<ProductionInviteTarget[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [groupPreviewVisible, setGroupPreviewVisible] = useState(false);
  const [groupPreview, setGroupPreview] = useState<any>(null);
  const [groupPreviewLoading, setGroupPreviewLoading] = useState(false);

  useEffect(() => {
    const availableTabs = canManageGig ? OWNER_GIG_TABS : VIEWER_GIG_TABS;
    if (requestedTab && availableTabs.includes(requestedTab)) {
      setActiveTab(requestedTab);
      return;
    }
    setActiveTab((currentTab) => (
      availableTabs.includes(currentTab) ? currentTab : "About"
    ));
  }, [canManageGig, requestedTab]);
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
      console.log("[manage_gig] Navigation error:", error);
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

      setCurrentUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      const gigId = getRouteGigId();
      if (!gigId) {
        Alert.alert("Error", "Invalid gig ID");
        router.replace("/feed");
        return;
      }

      const { data: ownedGig, error: ownedGigError } = await supabase
        .from("gigs")
        .select("id")
        .eq("id", gigId)
        .eq("organizer_id", user.id)
        .maybeSingle();

      if (ownedGigError) throw ownedGigError;

      let canManageAssignedGig = !!ownedGig?.id && profile?.role === "venue-owner";

      if (!canManageAssignedGig && profile?.role === "staff") {
        const assignment = await fetchActiveStaffAssignment(supabase, user.id);
        const permissions = getStaffPermissions(assignment?.access_level);
        canManageAssignedGig =
          assignment?.entity_type === "venue" &&
          assignment.gig_id === gigId &&
          permissions.canManageBookings;
      }

      const canViewAcceptedGig = canManageAssignedGig ? true : await hasAcceptedGigAccess(user.id, gigId);

      if (!canManageAssignedGig && !canViewAcceptedGig) {
        Alert.alert("Unauthorized", "You can only view gigs you manage or have been accepted for.");
        router.replace("/feed");
        return;
      }

      setCanManageGig(canManageAssignedGig);
      setAuthorized(true);
      fetchData(user.id, canManageAssignedGig);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/feed");
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
        router.replace("/feed");
        return;
      }

      console.log(`[manage_gig] Fetching data for gigId: ${gigId}, userId: ${userId}`);

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

      if (gigError) {
        console.log('[manage_gig] Failed to fetch gig details:', gigError.message);
        throw gigError;
      }
      if (!gigData) throw new Error("Gig not found");
      if (requirementsError) throw requirementsError;
      if (mediaError) throw mediaError;

      // Legacy projection is fallback-only; do not fail page load if this read errors.
      if (legacyGigError) {
        console.log('[manage_gig] Legacy projection unavailable, using direct 3NF rows only.');
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
            console.log('[manage_gig] Edge function failed for applications, trying direct query fallback.');
            const fallbackApps = await fetchApplicationsFallback(gigId);
            setApplications(fallbackApps);
          } else {
            setApplications(appData || []);
          }
        } catch (appErr) {
          console.log('[manage_gig] Exception fetching applications; using empty list fallback:', appErr);
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
          console.log('[manage_gig] Failed to fetch reviews:', reviewError);
        } else {
          setReviews(reviewData || []);
        }
      } catch (reviewErr) {
        console.log('[manage_gig] Exception fetching reviews:', reviewErr);
      }

    } catch (e: any) {
      console.log("[manage_gig] Critical error fetching data (masked):", e.message || "Unknown error");
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
        console.log("Error updating application:", e);
        Alert.alert("Error", "Failed to update application status");
      }
    });
    setModalVisible(true);
  };

  const getApplicationStatusMeta = (status: unknown) => {
    const normalizedStatus = String(status || "pending").trim().toLowerCase();

    if (normalizedStatus === "accepted" || normalizedStatus === "approved") {
      return { label: "Accepted", color: "#10B981", backgroundColor: "#10B98115" };
    }

    if (normalizedStatus === "pending") {
      return { label: "Pending", color: colors.primary, backgroundColor: colors.primary + "15" };
    }

    if (normalizedStatus === "completed") {
      return { label: "Completed", color: "#2563EB", backgroundColor: "#2563EB15" };
    }

    if (normalizedStatus === "fired") {
      return { label: "Fired", color: "#EF4444", backgroundColor: "#EF444415" };
    }

    if (normalizedStatus === "resigned") {
      return { label: "Resigned", color: "#F97316", backgroundColor: "#F9731615" };
    }

    if (normalizedStatus === "cancelled" || normalizedStatus === "canceled") {
      return { label: "Cancelled", color: "#EF4444", backgroundColor: "#EF444415" };
    }

    if (normalizedStatus === "rejected" || normalizedStatus === "declined") {
      return { label: "Declined", color: "#EF4444", backgroundColor: "#EF444415" };
    }

    return {
      label: normalizedStatus
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      color: colors.textSecondary,
      backgroundColor: colors.textSecondary + "15",
    };
  };

  const closeInviteModal = () => {
    if (sendingInvites) return;
    setInviteModalVisible(false);
    setInviteMessage("");
    setSelectedInviteTargets([]);
  };

  const handleSendVenueInvites = async () => {
    if (!currentUserId || !gig?.id || !canManageGig || sendingInvites) {
      return;
    }

    if (selectedInviteTargets.length === 0) {
      showAlert("warning", "No Talent Selected", "Select at least one musician, duo, or group to invite.");
      return;
    }

    setSendingInvites(true);
    try {
      const inviteSummary = await sendVenueGigInvites({
        currentUserId,
        gigId: gig.id,
        gigName: gig.name,
        gigImage: Array.isArray(gig.images) ? gig.images[0] || null : null,
        inviteMessage,
        inviteTargets: selectedInviteTargets,
      });

      if (inviteSummary.sentCount === 0 && inviteSummary.failedCount > 0) {
        const failureMessage =
          inviteSummary.failures.map((failure) => failure.error).find(Boolean) ||
          "No invites were sent. Please try again.";
        throw new Error(failureMessage);
      }

      setInviteModalVisible(false);
      setInviteMessage("");
      setSelectedInviteTargets([]);
      showAlert(
        inviteSummary.failedCount > 0 ? "warning" : "success",
        inviteSummary.failedCount > 0 ? "Invites Partially Sent" : "Invites Sent",
        inviteSummary.failedCount > 0
          ? `${inviteSummary.sentCount} invite(s) sent, ${inviteSummary.failedCount} failed.`
          : `${inviteSummary.sentCount} invite(s) sent.`,
      );
    } catch (error: any) {
      showAlert("error", "Invite Failed", error?.message || "Failed to send invites.");
    } finally {
      setSendingInvites(false);
    }
  };

  const tabs = canManageGig ? OWNER_GIG_TABS : VIEWER_GIG_TABS;
  const isInviteSubmitDisabled = sendingInvites || selectedInviteTargets.length === 0;
  const countableApplications = applications;
  const applicationCounts = useMemo(
    () => countableApplications.reduce(
      (counts, app) => {
        const status = String(app?.status || "pending").trim().toLowerCase();
        counts.total += 1;
        if (status === "pending") counts.pending += 1;
        if (status === "accepted" || status === "approved") counts.accepted += 1;
        if (status === "rejected" || status === "declined") counts.declined += 1;
        if (app?.ai_recommendation?.recommendation_status === "recommended") counts.recommended += 1;
        return counts;
      },
      { total: 0, pending: 0, accepted: 0, declined: 0, recommended: 0 },
    ),
    [countableApplications],
  );
  const visibleApplications = useMemo(
    () => countableApplications.filter((app) => {
      const status = String(app?.status || "pending").trim().toLowerCase();
      if (applicationFilter === "Pending") return status === "pending";
      if (applicationFilter === "Accepted") return status === "accepted" || status === "approved";
      if (applicationFilter === "Declined") return status === "rejected" || status === "declined";
      if (applicationFilter === "Recommended") return app?.ai_recommendation?.recommendation_status === "recommended";
      return true;
    }),
    [applicationFilter, countableApplications],
  );

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

  const closeGroupPreview = () => {
    setGroupPreviewVisible(false);
    setGroupPreview(null);
    setGroupPreviewLoading(false);
  };

  const openGroupPreview = async (app: any) => {
    const fallbackGroup = app?.group;
    const groupId = fallbackGroup?.id || app?.group_id;

    if (!groupId) {
      Alert.alert("Error", "Unable to view group details");
      return;
    }

    setGroupPreview(fallbackGroup || { id: groupId });
    setGroupPreviewVisible(true);
    setGroupPreviewLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke("manage-details", {
        body: { action: "fetch", type: "group", id: groupId, userId: user?.id },
      });

      if (error) throw error;
      setGroupPreview({ ...(fallbackGroup || {}), ...(data || {}) });
    } catch (error) {
      console.log("[manage_gig] Failed to load group preview:", error);
      setGroupPreview(fallbackGroup || { id: groupId });
    } finally {
      setGroupPreviewLoading(false);
    }
  };

  // Show loading while checking authorization
  if (checkingAuth) {
    return (
      <View
        style={[
          styles.flex1,
          styles.centerContainer,
          { backgroundColor: pageBackground },
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
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header title={canManageGig ? "Manage Gig" : "View Gig"} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            isWebDesktop && styles.scrollContentWeb,
          ]}
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
                ? formatDashedNumericDate(gig.event_date)
                : "Date TBA"}
              {gig?.requirements?.event_start_time &&
                gig?.requirements?.event_end_time
                ? ` � ${gig.requirements.event_start_time} - ${gig.requirements.event_end_time}`
                : ""}
              {" � "}
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

          {/* Segmented Control Tabs */}
          <View
            style={[
              styles.tabsContainer,
              { backgroundColor: colors.inputBackground },
            ]}
          >
            {tabs.map((tab) => (
              <TouchableOpacity activeOpacity={1}
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tab,
                  {
                    backgroundColor:
                      activeTab === tab ? colors.surface : "transparent",
                    shadowColor: "#000",
                    shadowOffset: {
                      width: 0,
                      height: activeTab === tab ? 2 : 0,
                    },
                    shadowOpacity: activeTab === tab ? 0.05 : 0,
                    shadowRadius: 4,
                    elevation: activeTab === tab ? 2 : 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    {
                      fontFamily:
                        activeTab === tab
                          ? "Poppins_600SemiBold"
                          : "Poppins_500Medium",
                      color:
                        activeTab === tab
                          ? colors.primary
                          : colors.textSecondary,
                    },
                  ]}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <SmoothTabTransition activeKey={activeTab} style={styles.contentContainer}>
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
                        Equipment supplied by organizer
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
                            No equipment supplied
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
                        Experience Level
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Poppins_500Medium",
                          color: colors.text,
                        }}
                      >
                        {gig?.requirements?.experience_level || "Not specified"}
                      </Text>
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
                        ?{(gig?.budget || 0).toLocaleString()}
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
                    Gig Gallery
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
                      onPress={async () => {
                        try {
                          const supported = await Linking.canOpenURL(
                            gig.contract_url,
                          );
                          if (supported) {
                            await Linking.openURL(gig.contract_url);
                          } else {
                            Alert.alert(
                              "Error",
                              "Unable to open contract document",
                            );
                          }
                        } catch (error) {
                          Alert.alert(
                            "Error",
                            "Failed to open contract document",
                          );
                        }
                      }}
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
              </View>
            )}

            {activeTab === "Applicants" && (
              <View style={styles.applicantsContainer}>
                <View style={styles.applicantsHeader}>
                  <Text
                    style={[
                      styles.applicantsTitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    APPLICANTS ({applicationCounts.total})
                  </Text>
                  {canManageGig ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TouchableOpacity
                        activeOpacity={1}
                        testID="configure-ai-recommendations"
                        onPress={() => router.push({
                          pathname: "/edit_gig",
                          params: { id: gig?.id, returnTab: "Applicants", focusSection: "ai" },
                        })}
                        style={[styles.inviteBtn, { backgroundColor: colors.inputBackground }]}
                      >
                        <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
                        <Text style={[styles.inviteBtnText, { color: colors.primary }]}>AI Filter</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={() => setInviteModalVisible(true)}
                        style={[styles.inviteBtn, { backgroundColor: colors.primary }]}
                      >
                        <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.inviteBtnText}>Invite</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, marginBottom: 10 }}>
                  {applicationCounts.pending} pending • {applicationCounts.accepted} accepted • {applicationCounts.declined} declined
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
                  {APPLICATION_FILTERS.map((filter) => {
                    const count = filter === "All"
                      ? applicationCounts.total
                      : filter === "Pending"
                        ? applicationCounts.pending
                        : filter === "Accepted"
                          ? applicationCounts.accepted
                          : filter === "Declined"
                            ? applicationCounts.declined
                            : applicationCounts.recommended;
                    const selected = applicationFilter === filter;
                    return (
                      <TouchableOpacity
                        key={filter}
                        testID={`applicant-filter-${filter.toLowerCase()}`}
                        onPress={() => setApplicationFilter(filter)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primary + "18" : colors.surface,
                          borderRadius: 999,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                        }}
                      >
                        <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 11 }}>
                          {filter} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {visibleApplications.length === 0 ? (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      textAlign: "center",
                      marginTop: 20,
                    }}
                  >
                    No applications match this filter.
                  </Text>
                ) : (
                  visibleApplications.map((app) => {
                    const statusMeta = getApplicationStatusMeta(app.status);
                    const aiRecommendation = app.ai_recommendation;
                    const aiPortfolioReview = app.ai_portfolio_review;
                    const faceSimilarity = aiPortfolioReview?.face_similarity || null;
                    const groupFaceSimilarities = Array.isArray(aiPortfolioReview?.group_face_similarity)
                      ? aiPortfolioReview.group_face_similarity
                      : [];
                    const videoCopyrightStatus = String(app.video_copyright_status || "not_screened");
                    const videoCopyrightMeta = app.video_copyright_metadata || {};
                    const videoCopyrightColor = videoCopyrightStatus === "approved" || videoCopyrightStatus === "not_required"
                      ? "#10B981"
                      : videoCopyrightStatus === "declined"
                        ? "#EF4444"
                        : videoCopyrightStatus === "pending_review"
                          ? "#F59E0B"
                          : colors.textSecondary;
                    const videoCopyrightLabel = videoCopyrightStatus === "not_required"
                      ? "No released-recording match"
                      : videoCopyrightStatus === "pending_review"
                        ? "Ownership review pending"
                        : videoCopyrightStatus === "approved"
                          ? "Ownership/permission approved"
                          : videoCopyrightStatus === "declined"
                            ? "Ownership/permission declined"
                            : "Legacy video — not screened";
                    const isAccepted = ["accepted", "approved"].includes(String(app.status || "").toLowerCase());
                    const consentStatus = String(app.feature_consent_status || "not_requested").toLowerCase();
                    const priorApplicationCounts = app.prior_application_counts || null;
                    const hasPriorApplicationCounts =
                      Number.isInteger(priorApplicationCounts?.this_gig) &&
                      Number.isInteger(priorApplicationCounts?.owner_gigs);
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
                            uri:
                              app.group?.images?.[0] ||
                              app.applicant?.avatar_url ||
                              "https://i.pravatar.cc/100",
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
                              {app.group?.name ||
                                app.applicant?.full_name ||
                                "Unknown Applicant"}
                            </Text>
                            <View
                              style={[
                                styles.statusBadge,
                                {
                                  backgroundColor: statusMeta.backgroundColor,
                                  borderWidth: 1,
                                  borderColor: statusMeta.color,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  fontFamily: "Poppins_600SemiBold",
                                  fontSize: 11,
                                  color: statusMeta.color,
                                }}
                              >
                                {statusMeta.label}
                              </Text>
                            </View>
                            {aiRecommendation?.is_verified ? (
                              <View style={[styles.statusBadge, { backgroundColor: "#10B98115", borderWidth: 1, borderColor: "#10B981" }]}>
                                <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 11, color: "#10B981" }}>Verified</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              fontSize: 12,
                              color: colors.textSecondary,
                            }}
                          >
                            {app.group?.genre ||
                              app.applicant?.genres?.join(", ") ||
                              "Musician"}
                            {(app.group?.location || app.applicant?.location) &&
                              ` � ${app.group?.location || app.applicant?.location}`}
                          </Text>
                        </View>
                      </View>

                      {hasPriorApplicationCounts ? (
                        <View
                          testID={`prior-application-counts-${app.id}`}
                          style={{
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.border,
                            borderWidth: 1,
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 12,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 9,
                          }}
                        >
                          <Ionicons name="repeat-outline" size={20} color={colors.primary} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 12 }}>
                              Applied {priorApplicationCounts.owner_gigs + 1}{" "}
                              {priorApplicationCounts.owner_gigs === 0 ? "time" : "times"} to your gigs
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 2 }}>
                              {priorApplicationCounts.this_gig + 1} total to this gig • {priorApplicationCounts.owner_gigs} earlier before this application
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {app.video_url ? (
                        <View
                          testID={`video-copyright-${app.id}`}
                          style={{ backgroundColor: colors.inputBackground, borderColor: videoCopyrightColor, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                            <Ionicons name="shield-checkmark-outline" size={17} color={videoCopyrightColor} />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 13, flex: 1 }}>Performance video rights</Text>
                            <Text style={{ color: videoCopyrightColor, fontFamily: "Poppins_600SemiBold", fontSize: 10, textTransform: "uppercase" }}>{videoCopyrightLabel}</Text>
                          </View>
                          {videoCopyrightMeta.copyright_title ? (
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15, marginTop: 6 }}>
                              Match: {videoCopyrightMeta.copyright_title}{videoCopyrightMeta.copyright_artist_label ? ` by ${videoCopyrightMeta.copyright_artist_label}` : ""}
                            </Text>
                          ) : null}
                          {videoCopyrightMeta.internal_match_playlist_title ? (
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15, marginTop: 6 }}>
                              Playlist recording: {videoCopyrightMeta.internal_match_playlist_title}{videoCopyrightMeta.internal_match_playlist_artist ? ` by ${videoCopyrightMeta.internal_match_playlist_artist}` : ""} ({String(videoCopyrightMeta.internal_match_similarity_score || "strong")} match)
                            </Text>
                          ) : null}
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14, marginTop: 5 }}>
                            {app.video_copyright_acknowledged ? "Applicant confirmed ownership, license, or permission. " : "No current rights acknowledgment is recorded. "}Fingerprint screening is a review signal, not a legal copyright decision.
                          </Text>
                        </View>
                      ) : null}

                      {aiRecommendation ? (
                        <View
                          testID={`ai-recommendation-${app.id}`}
                          style={{
                            backgroundColor: aiRecommendation.recommendation_status === "recommended" ? "#10B98112" : colors.inputBackground,
                            borderColor: aiRecommendation.recommendation_status === "recommended" ? "#10B981" : colors.border,
                            borderWidth: 1,
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 12,
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                            <Ionicons name="sparkles" size={17} color={aiRecommendation.recommendation_status === "recommended" ? "#10B981" : colors.primary} />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 13, flex: 1 }}>
                              AI Filter Review
                            </Text>
                            <Text style={{ color: aiRecommendation.recommendation_status === "recommended" ? "#10B981" : colors.primary, fontFamily: "Poppins_700Bold", fontSize: 14 }}>
                              {aiRecommendation.score == null ? "—" : `${Math.round(Number(aiRecommendation.score))}%`}
                            </Text>
                          </View>
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17, marginTop: 6 }}>
                            {aiRecommendation.explanation}
                          </Text>
                          {Array.isArray(aiRecommendation.matched_criteria) && aiRecommendation.matched_criteria.length > 0 ? (
                            <Text style={{ color: "#10B981", fontFamily: "Poppins_500Medium", fontSize: 10, marginTop: 7 }}>
                              Requirements met: {aiRecommendation.matched_criteria.join(", ")}
                            </Text>
                          ) : null}
                          {Array.isArray(aiRecommendation.missing_criteria) && aiRecommendation.missing_criteria.length > 0 ? (
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10, marginTop: 3 }}>
                              Review: {aiRecommendation.missing_criteria.join(", ")}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      {app.ai_portfolio_review_consent === true ? (
                        <View
                          testID={`ai-portfolio-review-${app.id}`}
                          style={{ backgroundColor: colors.inputBackground, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                            <Ionicons name="document-text-outline" size={17} color={colors.primary} />
                            <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 13, flex: 1 }}>AI portfolio evidence</Text>
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 10, textTransform: "uppercase" }}>
                              {String(aiPortfolioReview?.status || "queued").replace("_", " ")}
                            </Text>
                          </View>
                          {!aiPortfolioReview || ["queued", "processing"].includes(String(aiPortfolioReview.status)) ? (
                            <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17, marginTop: 7 }}>
                              Reviewing consented CV text, video audio, and available portfolio images. Refresh shortly.
                            </Text>
                          ) : (
                            <>
                              <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 11, lineHeight: 17, marginTop: 7 }}>
                                {aiPortfolioReview.overall_summary || "The automated evidence review is unavailable. Review the original files directly."}
                              </Text>
                              {faceSimilarity?.status && groupFaceSimilarities.length === 0 ? (() => {
                                const faceStatus = String(faceSimilarity.status);
                                const faceColor = faceStatus === "likely_same_person" ? "#10B981" : faceStatus === "likely_different_person" ? "#EF4444" : "#F59E0B";
                                const faceLabel = faceStatus === "likely_same_person" ? "Likely visually consistent" : faceStatus === "likely_different_person" ? "Possible mismatch" : faceStatus === "unclear" ? "Unclear" : "Not run";
                                return (
                                  <View style={{ marginTop: 9, padding: 10, borderWidth: 1, borderColor: faceColor, borderRadius: 10 }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                                      <Ionicons name="person-circle-outline" size={16} color={faceColor} />
                                      <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 11, flex: 1 }}>Advisory face similarity</Text>
                                      <Text style={{ color: faceColor, fontFamily: "Poppins_600SemiBold", fontSize: 9, textTransform: "uppercase" }}>{faceLabel}</Text>
                                    </View>
                                    <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15, marginTop: 5 }}>{faceSimilarity.summary}</Text>
                                    <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14, marginTop: 4 }}>Not identity verification. Compare the original profile photo and video yourself; never decide from this signal alone.</Text>
                                  </View>
                                );
                              })() : null}
                              {groupFaceSimilarities.map((memberResult: any) => {
                                const faceStatus = String(memberResult?.status || "unclear");
                                const faceColor = faceStatus === "likely_same_person" ? "#10B981" : faceStatus === "likely_different_person" ? "#EF4444" : "#F59E0B";
                                const faceLabel = faceStatus === "likely_same_person" ? "Likely visually consistent" : faceStatus === "likely_different_person" ? "Possible mismatch" : faceStatus === "unclear" ? "Unclear" : "Not run";
                                return (
                                  <View key={String(memberResult?.profile_id || memberResult?.display_name)} style={{ marginTop: 9, padding: 10, borderWidth: 1, borderColor: faceColor, borderRadius: 10 }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                                      <Ionicons name="people-circle-outline" size={16} color={faceColor} />
                                      <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 11, flex: 1 }}>{memberResult?.display_name || "Group member"}</Text>
                                      <Text style={{ color: faceColor, fontFamily: "Poppins_600SemiBold", fontSize: 9, textTransform: "uppercase" }}>{faceLabel}</Text>
                                    </View>
                                    <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15, marginTop: 5 }}>{memberResult?.summary || "No comparison explanation was available."}</Text>
                                    <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14, marginTop: 4 }}>Advisory group-member similarity only. Inspect the member profile and original video yourself.</Text>
                                  </View>
                                );
                              })}
                              {(Array.isArray(aiPortfolioReview.evidence) ? aiPortfolioReview.evidence : []).map((criterion: any, criterionIndex: number) => {
                                const result = String(criterion?.result || "unclear");
                                const resultColor = result === "supported" ? "#10B981" : result === "not_supported" ? "#EF4444" : "#F59E0B";
                                return (
                                  <View key={`${criterion?.criterion || "criterion"}-${criterionIndex}`} style={{ marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border }}>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                                      <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 11, flex: 1 }}>
                                        {String(criterion?.criterion || "Requirement").replace(/_/g, " ")}
                                      </Text>
                                      <Text style={{ color: resultColor, fontFamily: "Poppins_600SemiBold", fontSize: 10, textTransform: "uppercase" }}>
                                        {result.replace("_", " ")} · {Math.round(Number(criterion?.confidence || 0) * 100)}%
                                      </Text>
                                    </View>
                                    {(Array.isArray(criterion?.evidence) ? criterion.evidence : []).slice(0, 3).map((entry: any, evidenceIndex: number) => (
                                      <Text key={evidenceIndex} style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 10, lineHeight: 15, marginTop: 4 }}>
                                        • {entry?.observation}
                                        {entry?.timestamp_seconds != null && Number.isFinite(Number(entry.timestamp_seconds)) ? ` (${Math.floor(Number(entry.timestamp_seconds) / 60)}:${String(Math.floor(Number(entry.timestamp_seconds) % 60)).padStart(2, "0")})` : ""}
                                      </Text>
                                    ))}
                                  </View>
                                );
                              })}
                              <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 9, lineHeight: 14, marginTop: 9 }}>
                                Advisory only—not identity verification, a talent score, or a hiring decision. Inspect the original CV and performance video.
                              </Text>
                            </>
                          )}
                        </View>
                      ) : null}

                      {isAccepted ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 }}>
                          <Ionicons
                            name={consentStatus === "accepted" ? "eye-outline" : consentStatus === "pending" ? "time-outline" : "eye-off-outline"}
                            size={16}
                            color={consentStatus === "accepted" ? "#10B981" : colors.textSecondary}
                          />
                          <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium", fontSize: 11 }}>
                            Feature consent: {consentStatus === "accepted" ? "Allowed" : consentStatus === "pending" ? "Waiting for applicant" : "Private"}
                          </Text>
                        </View>
                      ) : null}

                      {/* Skills/Instruments */}
                      {app.applicant?.skills &&
                        app.applicant.skills.length > 0 && (
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
                              {app.applicant.skills
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
                              {app.applicant.skills.length > 5 && (
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
                                    +{app.applicant.skills.length - 5}
                                  </Text>
                                </View>
                              )}
                            </View>
                          </View>
                        )}

                      {/* Group Members */}
                      {app.group?.members && app.group.members.length > 0 && (
                        <View style={{ marginBottom: 12 }}>
                          <Text
                            style={{
                              fontFamily: "Poppins_500Medium",
                              fontSize: 12,
                              color: colors.textSecondary,
                              marginBottom: 6,
                            }}
                          >
                            Group Members ({app.group.members.length})
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Poppins_400Regular",
                              fontSize: 13,
                              color: colors.text,
                            }}
                          >
                            {app.group.members
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
                          onPress={async () => {
                            try {
                              const supported = await Linking.canOpenURL(
                                app.video_url,
                              );
                              if (supported) {
                                await Linking.openURL(app.video_url);
                              } else {
                                Alert.alert(
                                  "Error",
                                  "Unable to open video link",
                                );
                              }
                            } catch (error) {
                              Alert.alert("Error", "Failed to open video");
                            }
                          }}
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
                            onPress={async () => {
                              try {
                                const supported = await Linking.canOpenURL(
                                  app.cv_url,
                                );
                                if (supported) {
                                  await Linking.openURL(app.cv_url);
                                } else {
                                  Alert.alert(
                                    "Error",
                                    "Unable to open CV/Resume",
                                  );
                                }
                              } catch (error) {
                                Alert.alert(
                                  "Error",
                                  "Failed to open CV/Resume",
                                );
                              }
                            }}
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
                      {app.applicant?.portfolio_urls &&
                        app.applicant.portfolio_urls.length > 0 && (
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
                              {app.applicant.portfolio_urls.map(
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
                                      onPress={async () => {
                                        try {
                                          const supported =
                                            await Linking.canOpenURL(url);
                                          if (supported) {
                                            await Linking.openURL(url);
                                          }
                                        } catch (error) {
                                          Alert.alert(
                                            "Error",
                                            "Failed to open link",
                                          );
                                        }
                                      }}
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
                      {app.applicant?.portfolio_urls &&
                        app.applicant.portfolio_urls.filter(
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
                            {app.applicant.portfolio_urls
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
                                  onPress={async () => {
                                    try {
                                      const supported =
                                        await Linking.canOpenURL(url);
                                      if (supported) {
                                        await Linking.openURL(url);
                                      }
                                    } catch (error) {
                                      Alert.alert(
                                        "Error",
                                        "Failed to open link",
                                      );
                                    }
                                  }}
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
                          console.log("?? View Profile pressed");
                          console.log("?? app.group:", app.group);
                          console.log("?? app.applicant:", app.applicant);
                          console.log("?? app.applicant_id:", app.applicant_id);

                          if (app.group?.id) {
                            openGroupPreview(app);
                          } else if (app.applicant?.id) {
                            console.log(
                              "?? Navigating to profile with applicant.id:",
                              app.applicant.id,
                            );
                            router.push({
                              pathname: "/profile",
                              params: { userId: app.applicant.id },
                            });
                          } else if (app.applicant_id) {
                            console.log(
                              "?? Navigating to profile with applicant_id:",
                              app.applicant_id,
                            );
                            router.push({
                              pathname: "/profile",
                              params: { userId: app.applicant_id },
                            });
                          } else {
                            console.log("? No ID available for navigation");
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
                          View Full {app.group ? "Group" : "Profile"}
                        </Text>
                      </TouchableOpacity>

                      {/* Action Buttons */}
                      {canManageGig && String(app.status || "").toLowerCase() === "pending" && (
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
                          <ProfileAvatar
                            uri={review.author?.avatar_url}
                            style={[
                              styles.userAvatar,
                              { backgroundColor: colors.border },
                            ]}
                            backgroundColor={isDark ? "#374151" : "#E5E7EB"}
                            iconColor={colors.textSecondary}
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
                          {formatDashedNumericDate(review.created_at)}
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
                        {review.content || review.comment || "No written review."}
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

        </View>
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
      <RNModal
        transparent
        visible={inviteModalVisible}
        animationType="fade"
        onRequestClose={closeInviteModal}
      >
        <View style={styles.invitePopupOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeInviteModal}
            style={styles.invitePopupBackdrop}
          />
          <View
            style={[
              styles.invitePopupContainer,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={[styles.invitePopupHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.invitePopupHeaderCopy}>
                <Text style={[styles.invitePopupEyebrow, { color: colors.textSecondary }]} numberOfLines={1}>
                  {gig?.name || "Gig"}
                </Text>
                <Text style={[styles.invitePopupTitle, { color: colors.text }]}>Invite Performers</Text>
              </View>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeInviteModal}
                style={[
                  styles.invitePopupCloseButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.invitePopupBody}
              contentContainerStyle={styles.invitePopupBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalContent}>
                <ProductionInviteSection
                  currentUserId={currentUserId}
                  selectedTargets={selectedInviteTargets}
                  onSelectedTargetsChange={setSelectedInviteTargets}
                  inviteMessage={inviteMessage}
                  onInviteMessageChange={setInviteMessage}
                  disabled={sendingInvites}
                  searchPlaceholder="Search musician, duo, or group"
                  messagePlaceholder="Add optional gig details for the invite"
                  compact
                />

                <TouchableOpacity
                  activeOpacity={isInviteSubmitDisabled ? 1 : 0.78}
                  onPress={handleSendVenueInvites}
                  disabled={isInviteSubmitDisabled}
                  style={[
                    styles.submitBtn,
                    {
                      backgroundColor:
                        selectedInviteTargets.length > 0 ? colors.primary : colors.border,
                      opacity: isInviteSubmitDisabled ? 0.6 : 1,
                    },
                  ]}
                >
                  {sendingInvites ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text
                      style={[
                        styles.submitBtnText,
                        {
                          color:
                            selectedInviteTargets.length > 0
                              ? "#FFFFFF"
                              : colors.textSecondary,
                        },
                      ]}
                    >
                      Send Invite{selectedInviteTargets.length === 1 ? "" : "s"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </RNModal>
      <RNModal
        transparent
        visible={groupPreviewVisible}
        animationType="fade"
        onRequestClose={closeGroupPreview}
      >
        <View style={styles.groupPreviewOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeGroupPreview}
            style={StyleSheet.absoluteFillObject}
          />
          <View
            style={[
              styles.groupPreviewModal,
              { backgroundColor: colors.background, borderColor: borderSoft },
            ]}
          >
            <View style={[styles.groupPreviewHeader, { borderBottomColor: borderSoft }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.groupPreviewEyebrow, { color: colors.textSecondary }]}>
                  Group Applicant
                </Text>
                <Text style={[styles.groupPreviewTitle, { color: colors.text }]} numberOfLines={1}>
                  {groupPreview?.name || "Group Details"}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeGroupPreview}
                style={[styles.groupPreviewClose, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.groupPreviewBody}
              showsVerticalScrollIndicator={false}
            >
              {groupPreviewLoading && !groupPreview?.name ? (
                <View style={styles.groupPreviewLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, marginTop: 8 }}>
                    Loading group...
                  </Text>
                </View>
              ) : (
                <>
                  <Image
                    source={{
                      uri:
                        groupPreview?.images?.[0] ||
                        groupPreview?.image ||
                        "https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&h=400&fit=crop",
                    }}
                    style={[styles.groupPreviewImage, { backgroundColor: colors.border }]}
                    resizeMode="cover"
                  />

                  <View style={styles.groupPreviewMetaGrid}>
                    <View style={[styles.groupPreviewMetaItem, { backgroundColor: colors.surface }]}>
                      <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
                      <Text style={[styles.groupPreviewMetaText, { color: colors.text }]} numberOfLines={1}>
                        {groupPreview?.genre || "Genre not listed"}
                      </Text>
                    </View>
                    <View style={[styles.groupPreviewMetaItem, { backgroundColor: colors.surface }]}>
                      <Ionicons name="location-outline" size={16} color={colors.primary} />
                      <Text style={[styles.groupPreviewMetaText, { color: colors.text }]} numberOfLines={1}>
                        {groupPreview?.location || "Location not listed"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.groupPreviewSection}>
                    <Text style={[styles.groupPreviewSectionTitle, { color: colors.text }]}>
                      About
                    </Text>
                    <Text style={[styles.groupPreviewText, { color: colors.textSecondary }]}>
                      {groupPreview?.description || "No group description provided."}
                    </Text>
                  </View>

                  {Array.isArray(groupPreview?.members) && groupPreview.members.length > 0 ? (
                    <View style={styles.groupPreviewSection}>
                      <Text style={[styles.groupPreviewSectionTitle, { color: colors.text }]}>
                        Members ({groupPreview.members.length})
                      </Text>
                      <View style={{ gap: 10 }}>
                        {groupPreview.members.map((member: any, index: number) => {
                          const memberName = typeof member === "string" ? member : member?.name || "Member";
                          const memberInstrument = typeof member === "string" ? "" : member?.instrument || "";

                          return (
                            <View key={`${memberName}-${index}`} style={styles.groupPreviewMemberRow}>
                              <View style={[styles.groupPreviewMemberAvatar, { backgroundColor: colors.primary + "22" }]}>
                                <Text style={{ color: colors.primary, fontFamily: "Poppins_700Bold" }}>
                                  {memberName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.groupPreviewMemberName, { color: colors.text }]}>
                                  {memberName}
                                </Text>
                                {memberInstrument ? (
                                  <Text style={[styles.groupPreviewMemberInstrument, { color: colors.textSecondary }]}>
                                    {memberInstrument}
                                  </Text>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </RNModal>
      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  pageFrame: {
    flex: 1,
    width: "100%",
  },
  pageFrameWeb: {
    maxWidth: 1240,
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  centerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 180,
  },
  scrollContentWeb: {
    maxWidth: 1120,
    width: "100%",
    alignSelf: "center",
    paddingTop: 10,
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
    padding: 4,
    borderRadius: 16,
    flexDirection: "row",
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
  applicantsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  applicantsTitle: {
    fontSize: 13,
    letterSpacing: 0.5,
    fontFamily: "Poppins_600SemiBold",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteBtnText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
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
  invitePopupOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  invitePopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  invitePopupContainer: {
    width: Platform.OS === "web" ? 460 : "100%",
    maxWidth: "100%",
    maxHeight: Platform.OS === "web" ? 620 : "86%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 20,
  },
  invitePopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  invitePopupHeaderCopy: {
    flex: 1,
    paddingRight: 14,
  },
  invitePopupEyebrow: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  invitePopupTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  invitePopupCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  invitePopupBody: {
    flexGrow: 0,
  },
  invitePopupBodyContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  modalContent: {
    paddingHorizontal: 4,
  },
  submitBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
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
  groupPreviewOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  groupPreviewModal: {
    width: Platform.OS === "web" ? 520 : "100%",
    maxWidth: "100%",
    maxHeight: "84%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 20,
  },
  groupPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  groupPreviewEyebrow: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  groupPreviewTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  groupPreviewClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginLeft: 12,
  },
  groupPreviewBody: {
    padding: 18,
    paddingBottom: 22,
  },
  groupPreviewLoading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  groupPreviewImage: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginBottom: 14,
  },
  groupPreviewMetaGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  groupPreviewMetaItem: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupPreviewMetaText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
  },
  groupPreviewSection: {
    marginTop: 4,
    marginBottom: 14,
  },
  groupPreviewSectionTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    marginBottom: 8,
  },
  groupPreviewText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  groupPreviewMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupPreviewMemberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  groupPreviewMemberName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  groupPreviewMemberInstrument: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 1,
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

