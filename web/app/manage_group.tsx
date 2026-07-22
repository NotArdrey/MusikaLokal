import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal as RNModal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import GigPresetDropdown, { GIG_GENRE_OPTIONS } from "../src/components/GigPresetDropdown";
import Header from "../src/components/header";
import ImageUploader from "../src/components/ImageUploader";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import ProfileAvatar from "../src/components/ProfileAvatar";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { getGroupMembersLabel, isGroupLeaderMember } from "../src/utils/groupMembers";
import { fetchGroupLinkedPlaylists } from "../src/utils/groupPlaylists";
import {
    hasValidCoordinates,
    openNavigationDirections,
} from "../src/utils/navigation";
import { formatDashedNumericDate } from "../src/utils/friendlyDateTime";

import { useLocalSearchParams } from "expo-router";

const GROUP_TABS = ["About", "Applications", "Review"];
const PLAYLIST_COVER_BUCKET = "post-media";
const PLAYLIST_COVER_FOLDER = "playlist-covers";
const PLAYLIST_GENRES = ["Pop", "Rock", "Hip-Hop", "R&B", "Jazz", "Classical", "Electronic", "OPM", "Indie", "Other"];
const PLAYLIST_COPYRIGHT_TERMS_BODY =
  "Under the Intellectual Property Code (RA 8293), protection is automatic from the moment of creation, securing creators' economic and moral rights. Unauthorized public performance, reproduction, or streaming without a license constitutes copyright infringement.";
const PLAYLIST_COPYRIGHT_ACKNOWLEDGEMENT =
  "I understand and confirm I own this music or have the required license to upload and stream it.";

export default function GroupDetailsScreen() {
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
  const { isSystemLocked, showLockAlert } = useAuth();
  const { id, tab, refresh } = useLocalSearchParams<{ id?: string | string[]; tab?: string | string[]; refresh?: string | string[] }>();
  const requestedTab = Array.isArray(tab) ? tab[0] : tab;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(
    GROUP_TABS.includes(requestedTab || "") ? requestedTab || "About" : "About",
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalButtonText, setModalButtonText] = useState("");
  const [modalAction, setModalAction] = useState<(() => Promise<void>) | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showGigStatuses, setShowGigStatuses] = useState(true);
  const [updatingGigVisibility, setUpdatingGigVisibility] = useState(false);
  const [openGroupApplications, setOpenGroupApplications] = useState(true);
  const [updatingGroupApplications, setUpdatingGroupApplications] = useState(false);

  const [group, setGroup] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [groupPlaylists, setGroupPlaylists] = useState<any[]>([]);
  const [loadingGroupPlaylists, setLoadingGroupPlaylists] = useState(false);
  const [groupPlaylistModalVisible, setGroupPlaylistModalVisible] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistGenre, setPlaylistGenre] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [playlistCoverImages, setPlaylistCoverImages] = useState<string[]>([]);
  const [creatingGroupPlaylist, setCreatingGroupPlaylist] = useState(false);
  const [playlistCopyrightTermsAccepted, setPlaylistCopyrightTermsAccepted] = useState(false);
  const [playlistCopyrightTermsVisible, setPlaylistCopyrightTermsVisible] = useState(false);
  const [playlistCopyrightTermsDraftAccepted, setPlaylistCopyrightTermsDraftAccepted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (requestedTab && GROUP_TABS.includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);
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

  const openPlaylistCopyrightTermsModal = () => {
    setPlaylistCopyrightTermsDraftAccepted(playlistCopyrightTermsAccepted);
    setPlaylistCopyrightTermsVisible(true);
  };

  const confirmPlaylistCopyrightTerms = () => {
    setPlaylistCopyrightTermsAccepted(true);
    setPlaylistCopyrightTermsVisible(false);
  };

  const togglePlaylistCopyrightTerms = () => {
    if (playlistCopyrightTermsAccepted) {
      setPlaylistCopyrightTermsAccepted(false);
      return;
    }

    openPlaylistCopyrightTermsModal();
  };

  const handleNavigateToGroup = async () => {
    try {
      await openNavigationDirections({
        latitude: group?.latitude,
        longitude: group?.longitude,
        label: group?.location || group?.name || "Group location",
      });
    } catch (error) {
      console.log("[manage_group] Navigation error:", error);
      showAlert(
        "warning",
        "Navigation Unavailable",
        "This group does not have pinned coordinates yet.",
      );
    }
  };

  const handleCreateGroupPlaylist = () => {
    const groupId = String(group?.id || (Array.isArray(id) ? id[0] : id) || "").trim();
    if (!groupId) {
      showAlert("warning", "Group Unavailable", "Open this group again before uploading a group playlist.");
      return;
    }

    setPlaylistTitle("");
    setPlaylistDescription("");
    setPlaylistGenre("");
    setPlaylistVisibility("public");
    setPlaylistCoverImages([]);
    setPlaylistCopyrightTermsAccepted(false);
    setPlaylistCopyrightTermsDraftAccepted(false);
    setPlaylistCopyrightTermsVisible(false);
    setGroupPlaylistModalVisible(true);
  };

  const closeGroupPlaylistModal = () => {
    if (creatingGroupPlaylist) return;
    setGroupPlaylistModalVisible(false);
  };

  const handleSubmitGroupPlaylist = async () => {
    const groupId = String(group?.id || (Array.isArray(id) ? id[0] : id) || "").trim();
    if (!groupId) {
      showAlert("warning", "Group Unavailable", "Open this group again before uploading a group playlist.");
      return;
    }

    if (!playlistTitle.trim()) {
      showAlert("warning", "Missing Title", "Enter a playlist title before creating it.");
      return;
    }

    if (!playlistCopyrightTermsAccepted) {
      openPlaylistCopyrightTermsModal();
      return;
    }

    setCreatingGroupPlaylist(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-playlists", {
        body: {
          action: "create_playlist",
          title: playlistTitle.trim(),
          description: playlistDescription.trim(),
          genre: playlistGenre,
          cover_image_url: playlistCoverImages[0] || null,
          visibility: playlistVisibility,
          owner_group_id: groupId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to create group playlist.");

      const playlistRows = await fetchGroupLinkedPlaylists(groupId);
      setGroupPlaylists(playlistRows);
      setGroupPlaylistModalVisible(false);
      showAlert("success", "Playlist Created", "Your group playlist has been added.");
    } catch (error: any) {
      showAlert("error", "Playlist Failed", error?.message || "Unable to create group playlist.");
    } finally {
      setCreatingGroupPlaylist(false);
    }
  };

  const handlePlaylistPress = (playlistId: string) => {
    if (!playlistId) return;

    router.push({
      pathname: "/playlist_details",
      params: { playlist_id: playlistId },
    });
  };

  // Role-based access control
  useEffect(() => {
    checkAuthorization();
  }, []);

  useEffect(() => {
    if (!authorized || !currentUserId || !id) return;
    fetchData(currentUserId);
  }, [authorized, currentUserId, id]);

  useEffect(() => {
    let isActive = true;

    if (!group?.id) {
      setGroupPlaylists([]);
      setLoadingGroupPlaylists(false);
      return () => {
        isActive = false;
      };
    }

    setLoadingGroupPlaylists(true);
    fetchGroupLinkedPlaylists(group.id)
      .then((playlistRows) => {
        if (!isActive) return;
        setGroupPlaylists(playlistRows);
      })
      .catch((playlistError) => {
        if (!isActive) return;
        console.log("[manage_group] Failed to fetch group playlists:", playlistError);
        setGroupPlaylists([]);
      })
      .finally(() => {
        if (!isActive) return;
        setLoadingGroupPlaylists(false);
      });

    return () => {
      isActive = false;
    };
  }, [group?.id, refresh]);

  useEffect(() => {
    if (!authorized || !currentUserId) return;
    fetchVisibilityPreference(currentUserId);
  }, [authorized, currentUserId]);

  const fetchVisibilityPreference = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("show_gig_statuses")
        .eq("id", userId)
        .single();

      if (error) throw error;
      setShowGigStatuses(data?.show_gig_statuses !== false);
    } catch (e) {
      console.log("[manage_group] Failed to fetch visibility preference:", e);
    }
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

      if (profile?.role !== "musician") {
        showAlert("error", "Unauthorized", "Only musicians can access this page.");
        router.replace("/feed");
        return;
      }

      setCurrentUserId(user.id);
      setAuthorized(true);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/feed");
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchData = async (userId: string) => {
    setLoading(true);
    setGroup(null);
    setGroupMembers([]);
    setApplications([]);
    setReviews([]);
    try {
      // Ensure id is a string, not an array
      const groupId = Array.isArray(id) ? id[0] : id;
      if (!groupId) {
        showAlert("error", "Error", "Invalid group ID");
        router.replace("/feed");
        return;
      }

      console.log(`[manage_group] Fetching data for groupId: ${groupId}, userId: ${userId}`);

      // Base query + legacy projection merge
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .eq('owner_id', userId)
        .single();

      const { data: legacyGroup, error: legacyGroupError } = await supabase
        .from('groups_legacy_projection')
        .select('members, images')
        .eq('id', groupId)
        .single();

      const { data: groupMediaRows, error: groupMediaError } = await supabase
        .from('group_media')
        .select('media_url, sort_order, created_at')
        .eq('group_id', groupId)
        .eq('media_type', 'image')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (groupError) {
        console.log('[manage_group] Failed to fetch group details:', groupError.message);
        // if (groupError.message?.includes("non-2xx")) {
        //   console.log('[manage_group] Full error object:', JSON.stringify(groupError));
        // }
        throw groupError;
      }
      if (legacyGroupError) {
        throw legacyGroupError;
      }

      if (groupMediaError) {
        console.log('[manage_group] Failed to fetch group_media, using legacy images fallback:', groupMediaError);
      }

      const mediaImages = (groupMediaRows || [])
        .map((row: any) => row.media_url)
        .filter((url: any) => typeof url === 'string' && url.trim().length > 0);

      setGroup({
        ...groupData,
        members: legacyGroup?.members || [],
        images:
          mediaImages.length > 0
            ? mediaImages
            : (Array.isArray(legacyGroup?.images) ? legacyGroup.images : []),
      });
      setOpenGroupApplications(groupData?.open_group_applications !== false);

      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("group_members")
          .select("user_id, role, profiles:user_id(full_name, avatar_url)")
          .eq("group_id", groupId);

        if (memberError) {
          console.log("[manage_group] Failed to fetch group_members:", memberError);
          setGroupMembers([]);
        } else {
          const legacyMembers = Array.isArray(legacyGroup?.members)
            ? legacyGroup.members
            : [];
          const mappedMembers = (memberRows || []).map((row: any) => ({
            user_id: row.user_id,
            name: row.profiles?.full_name || "Member",
            avatar_url: row.profiles?.avatar_url,
            instrument:
              legacyMembers.find(
                (member: any) => member?.user_id && member.user_id === row.user_id,
              )?.instrument || "",
            role:
              row.user_id === groupData?.owner_id
                ? "Leader"
                : row.role === "admin"
                  ? "Admin"
                  : "Member",
            membershipState: "active",
            source: "group_members",
          }));
          setGroupMembers(mappedMembers);
        }
      } catch (memberErr) {
        console.log("[manage_group] Exception fetching group_members:", memberErr);
        setGroupMembers([]);
      }

      // Fetch Group Applications (Sent)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No active session");

        const { data: appData, error: appError } =
          await supabase.functions.invoke("gig-applications", {
            body: {
              action: "fetch_group_applications",
              groupId: groupId,
              userId,
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

        console.log('[manage_group] Debug appData:', JSON.stringify(appData, null, 2));

        if (appError) {
          console.log('[manage_group] Failed to fetch applications:', appError);
        } else {
          if (appData && !Array.isArray(appData) && appData.error) {
            console.log('[manage_group] Edge Function returned error:', appData);
          } else {
            setApplications(appData || []);
          }
        }
      } catch (appErr) {
        console.log('[manage_group] Exception fetching applications:', appErr);
      }

      // Direct query to reviews table
      try {
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url)')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (reviewError) {
          console.log('[manage_group] Failed to fetch reviews:', reviewError);
        } else {
          setReviews(reviewData || []);
        }
      } catch (reviewErr) {
        console.log('[manage_group] Exception fetching reviews:', reviewErr);
      }

    } catch (e: any) {
      console.log("[manage_group] Critical error fetching data (masked):", e.message || "Unknown error");
      let errorMsg = "Failed to load group data";
      if (e.message?.includes("non-2xx")) {
        errorMsg += `\n\nServer Error (500). Please check edge function logs.`;
      }
      // Alert.alert("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const confirmLeaderDecision = (app: any, decision: "approved" | "rejected") => {
    setModalTitle(
      decision === "approved" ? "Approve Member Application" : "Reject Member Application",
    );
    setModalMessage(
      decision === "approved"
        ? `Approve ${app.applicant?.full_name || "this member"}'s application to ${app.gig?.name || "this gig"}?`
        : `Reject ${app.applicant?.full_name || "this member"}'s application to ${app.gig?.name || "this gig"}?`,
    );
    setModalButtonText(decision === "approved" ? "Approve" : "Reject");
    setModalAction(() => async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error } = await supabase.functions.invoke("gig-applications", {
          body: {
            action: "update_leader_approval",
            applicationId: app.id,
            decision,
            userId: user.id,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setApplications((prev) =>
          prev.map((a) => (a.id === app.id ? { ...a, ...data } : a)),
        );
        setModalVisible(false);
      } catch (e: any) {
        showAlert("error", "Update Failed", e?.message || "Failed to update leader decision.");
      }
    });
    setModalVisible(true);
  };

  const handleToggleGigVisibility = async (value: boolean) => {
    if (!currentUserId || updatingGigVisibility) return;

    const previous = showGigStatuses;
    setShowGigStatuses(value);
    setUpdatingGigVisibility(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ show_gig_statuses: value })
        .eq("id", currentUserId);

      if (error) throw error;

      showAlert(
        "success",
        "Visibility Updated",
        value
          ? "Your Active, Upcoming, and Done gigs are now visible to users."
          : "Your Active, Upcoming, and Done gigs are now hidden from users.",
      );
    } catch (e: any) {
      setShowGigStatuses(previous);
      showAlert(
        "error",
        "Update Failed",
        e?.message || "Could not update gig visibility.",
      );
    } finally {
      setUpdatingGigVisibility(false);
    }
  };

  const handleToggleGroupApplications = async (value: boolean) => {
    if (!currentUserId || !group?.id || updatingGroupApplications) return;

    const previous = openGroupApplications;
    setOpenGroupApplications(value);
    setUpdatingGroupApplications(true);

    try {
      const { error } = await supabase
        .from("groups")
        .update({ open_group_applications: value })
        .eq("id", group.id)
        .eq("owner_id", currentUserId);

      if (error) throw error;

      setGroup((prev: any) =>
        prev ? { ...prev, open_group_applications: value } : prev,
      );

      showAlert(
        "success",
        "Applications Setting Updated",
        value
          ? "Your group is now open for member applications."
          : "Your group is now closed for member applications.",
      );
    } catch (e: any) {
      setOpenGroupApplications(previous);
      showAlert(
        "error",
        "Update Failed",
        e?.message || "Could not update group applications setting.",
      );
    } finally {
      setUpdatingGroupApplications(false);
    }
  };

  const tabs = GROUP_TABS;
  const hasSyncedMembers = groupMembers.length > 0;
  const displayMembers = hasSyncedMembers ? groupMembers : group?.members || [];
  const displayMemberCount = hasSyncedMembers
    ? groupMembers.length
    : group?.members?.length || 0;

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

  if (loading && !group) {
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
          Loading group details...
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: pageBackground }]}>
        <View style={[styles.pageFrame, isWebDesktop && styles.pageFrameWeb]}>
        <Header title="Manage Group" />

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
                  uri:
                    (group?.images && group.images[0]) || group?.image || null,
                }}
                style={[styles.headerImage, { backgroundColor: colors.border }]}
                resizeMode="cover"
              />
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {group?.name || "Loading..."}
            </Text>
            <Text
              style={[styles.headerLocation, { color: colors.textSecondary }]}
            >
              {group?.genre || "Genre N/A"} •{" "}
              {group?.location || "Location N/A"}
            </Text>
            {hasValidCoordinates(group?.latitude, group?.longitude) && (
              <TouchableOpacity activeOpacity={1}
                style={[styles.navigateButton, { backgroundColor: colors.primary }]}
                onPress={handleNavigateToGroup}
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
                    {group?.description || "No description available."}
                  </Text>
                </View>

                <View
                  style={[
                    styles.visibilityCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.visibilityTextWrap}>
                    <Text style={[styles.visibilityTitle, { color: colors.text }]}>
                      Show gig status publicly
                    </Text>
                    <Text
                      style={[
                        styles.visibilitySubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Controls Active, Upcoming, and Done badges on your group and musician cards.
                    </Text>
                  </View>
                  <Switch
                    value={showGigStatuses}
                    onValueChange={handleToggleGigVisibility}
                    disabled={updatingGigVisibility}
                    trackColor={{ false: isDark ? "#374151" : "#D1D5DB", true: colors.primary + "66" }}
                    thumbColor={showGigStatuses ? colors.primary : "#9CA3AF"}
                  />
                </View>

                <View
                  style={[
                    styles.visibilityCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.visibilityTextWrap}>
                    <Text style={[styles.visibilityTitle, { color: colors.text }]}>
                      Open applications to this group
                    </Text>
                    <Text
                      style={[
                        styles.visibilitySubtitle,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Shows an Open Applications badge on your group cards in Home and Discover.
                    </Text>
                  </View>
                  <Switch
                    value={openGroupApplications}
                    onValueChange={handleToggleGroupApplications}
                    disabled={updatingGroupApplications}
                    trackColor={{ false: isDark ? "#374151" : "#D1D5DB", true: colors.primary + "66" }}
                    thumbColor={openGroupApplications ? colors.primary : "#9CA3AF"}
                  />
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                        {getGroupMembersLabel(group?.group_type)}
                    </Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {displayMemberCount}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Genre
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 14,
                      }}
                    >
                      {group?.genre || "N/A"}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: 16 }}>
                  <View
                    style={[
                      styles.infoCard,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        styles.infoLabel,
                        { color: colors.textSecondary },
                      ]}
                    >
                      Group Type
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: "Poppins_500Medium",
                        fontSize: 14,
                        textTransform: "capitalize",
                      }}
                    >
                      {group?.group_type || "N/A"}
                    </Text>
                  </View>
                </View>

                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        Group Playlists
                      </Text>
                      {groupPlaylists.length > 0 ? (
                        <View
                          style={{
                            backgroundColor: colors.primary + "18",
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 999,
                          }}
                        >
                          <Text style={{ color: colors.primary, fontSize: 10, fontFamily: "Poppins_600SemiBold" }}>
                            {groupPlaylists.length}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      activeOpacity={1}
                      disabled={loadingGroupPlaylists}
                      onPress={handleCreateGroupPlaylist}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: loadingGroupPlaylists ? colors.border : colors.primary,
                        opacity: loadingGroupPlaylists ? 0.65 : 1,
                      }}
                    >
                      <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                      <Text style={{ color: "#fff", fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                        Upload Group Playlist
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {loadingGroupPlaylists ? (
                    <View
                      style={[
                        styles.infoCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderWidth: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        },
                      ]}
                    >
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular" }}>
                        Loading playlists...
                      </Text>
                    </View>
                  ) : groupPlaylists.length > 0 ? (
                    <View style={{ gap: 10 }}>
                      {groupPlaylists.map((playlist: any) => {
                        const playlistId = String(playlist?.playlist_id || playlist?.id || "").trim();
                        if (!playlistId) return null;
                        const itemCount = Number(playlist?.track_count || playlist?.item_count || 0);

                        return (
                          <TouchableOpacity
                            key={playlistId}
                            activeOpacity={1}
                            onPress={() => handlePlaylistPress(playlistId)}
                            style={{
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                              padding: 14,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <View
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 12,
                                backgroundColor: colors.primary + "18",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ionicons name="musical-notes-outline" size={18} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                numberOfLines={1}
                                style={{ color: colors.text, fontSize: 14, fontFamily: "Poppins_600SemiBold" }}
                              >
                                {playlist.title || "Untitled Playlist"}
                              </Text>
                              {playlist.genre ? (
                                <Text style={{ marginTop: 2, color: colors.textSecondary, fontSize: 12 }}>
                                  {playlist.genre}
                                </Text>
                              ) : null}
                              <Text style={{ marginTop: 3, color: colors.textSecondary, fontSize: 11 }}>
                                {itemCount} track{itemCount === 1 ? "" : "s"}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.infoCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderWidth: 1,
                        },
                      ]}
                    >
                      <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 }}>
                        Upload a group playlist or link playlists from Edit Group to feature them here.
                      </Text>
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
                    {getGroupMembersLabel(group?.group_type)} & Roles
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: "Poppins_400Regular",
                      fontSize: 12,
                      marginBottom: 10,
                    }}
                  >
                    Source: {hasSyncedMembers ? "group_members (synced)" : "groups.members (legacy fallback)"}
                  </Text>
                  {displayMembers && displayMembers.length > 0 ? (
                    displayMembers.map((member: any, index: number) => {
                      const memberName =
                        typeof member === "string"
                          ? member
                          : member?.name || member?.full_name || "Member";
                      const memberInstrument =
                        typeof member === "string"
                          ? ""
                          : member?.instrument || "";
                      const memberRole =
                        typeof member === "string"
                          ? ""
                          : isGroupLeaderMember(member, group?.owner_id)
                            ? "Leader"
                            : member?.role || "";
                      const membershipState =
                        typeof member === "string"
                          ? ""
                          : member?.membershipState ||
                            (member?.source === "group_members" ? "active" : "legacy");
                      return (
                        <View
                          key={index}
                          style={[
                            styles.memberRow,
                            { borderColor: colors.border },
                          ]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.memberName,
                                { color: colors.text },
                              ]}
                            >
                              {memberName}
                            </Text>
                            {(memberInstrument || memberRole) && (
                              <Text
                                style={[
                                  styles.memberMeta,
                                  { color: colors.textSecondary },
                                ]}
                              >
                                {memberInstrument}
                                {memberInstrument && memberRole ? " • " : ""}
                                {memberRole}
                              </Text>
                            )}
                            {!!membershipState && (
                              <View style={{ marginTop: 6, alignSelf: "flex-start" }}>
                                <Text
                                  style={[
                                    styles.memberState,
                                    {
                                      color:
                                        membershipState === "active"
                                          ? "#10B981"
                                          : colors.textSecondary,
                                      borderColor:
                                        membershipState === "active"
                                          ? "#10B981"
                                          : colors.border,
                                    },
                                  ]}
                                >
                                  {membershipState === "active"
                                    ? "Active Member"
                                    : "Legacy Member"}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={{ color: colors.textSecondary }}>
                      No members listed.
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
                    Gallery
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.galleryContainer}
                  >
                    {group?.images && group.images.length > 0 ? (
                      group.images.map((img: string, i: number) => (
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
              </View>
            )}

            {activeTab === "Applications" && (
              <View style={styles.aboutContainer}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Sent Applications
                </Text>

                {applications.length === 0 ? (
                  <Text style={{ color: colors.textSecondary }}>
                    No applications sent yet.
                  </Text>
                ) : (
                  applications.map((app) => {
                    const rawStatus = String(app?.status || "pending");
                    const normalizedStatus = rawStatus.toLowerCase();
                    const statusColor =
                      normalizedStatus === "approved" ||
                      normalizedStatus === "accepted"
                        ? "green"
                        : normalizedStatus === "pending" ||
                            normalizedStatus === "applied"
                          ? "orange"
                          : "red";

                    return (
                      <View
                        key={app.id}
                        style={[
                          styles.setupCard,
                          { backgroundColor: colors.surface, marginBottom: 12 },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginBottom: 8,
                          }}
                        >
                          <Text
                            style={[styles.setupTitle, { color: colors.text }]}
                          >
                            {app.gig?.name || "Unknown Gig"}
                          </Text>
                          <Text
                            style={{
                              color: statusColor,
                              fontWeight: "bold",
                            }}
                          >
                            {rawStatus.toUpperCase()}
                          </Text>
                        </View>
                        <Text
                          style={{ color: colors.textSecondary, marginBottom: 4 }}
                        >
                          {app.gig?.location || "Location N/A"}
                        </Text>
                        <Text
                          style={{ color: colors.textSecondary, marginBottom: 8 }}
                        >
                          Payout: ₱{Number(app.gig?.budget || 0).toLocaleString()}
                        </Text>
                        <Text style={{ color: colors.textSecondary }}>
                          Applied on:{" "}
                          {app.created_at
                            ? formatDashedNumericDate(app.created_at)
                            : "N/A"}
                        </Text>
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
                    {group?.rating?.toFixed(1) || "0.0"}
                  </Text>
                  <View style={styles.starsRow}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={i}
                        name={
                          i < Math.round(group?.rating || 0)
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
                    Based on {group?.review_count || 0} reviews
                  </Text>
                </View>

                {reviews.length > 0 ? (
                  reviews.map((review) => (
                    <View
                      key={review.id}
                      style={[
                        styles.reviewCard,
                        { backgroundColor: colors.surface, marginBottom: 12 },
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
                  <Text style={{ color: colors.textSecondary }}>
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
        title={modalTitle}
        message={modalMessage}
        buttonText={modalButtonText}
        danger={modalButtonText === "Reject"}
        onConfirm={() => {
          if (modalAction) {
            modalAction();
          }
        }}
      />
      <RNModal
        visible={groupPlaylistModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeGroupPlaylistModal}
      >
        <View style={styles.playlistPopupOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeGroupPlaylistModal}
            style={styles.playlistPopupBackdrop}
          />
          <View style={[styles.playlistPopupCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.playlistPopupHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.playlistPopupTitle, { color: colors.text }]}>Upload Group Playlist</Text>
                <Text style={[styles.playlistPopupSubtitle, { color: colors.textSecondary }]}>
                  Create a playlist for {group?.name || "this group"}.
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={1}
                onPress={closeGroupPlaylistModal}
                style={[styles.playlistPopupCloseButton, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.playlistPopupBody}
              contentContainerStyle={styles.playlistPopupBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={[styles.playlistPopupLabel, { color: colors.text }]}>Album Cover</Text>
              {currentUserId ? (
                <ImageUploader
                  images={playlistCoverImages}
                  onImagesChange={(images) => setPlaylistCoverImages(images.slice(0, 1))}
                  maxImages={1}
                  bucketName={PLAYLIST_COVER_BUCKET}
                  userId={currentUserId}
                  folder={PLAYLIST_COVER_FOLDER}
                />
              ) : null}

              <Text style={[styles.playlistPopupLabel, { color: colors.text }]}>Title *</Text>
              <TextInput
                value={playlistTitle}
                onChangeText={setPlaylistTitle}
                placeholder="Playlist title"
                placeholderTextColor={colors.textSecondary}
                maxLength={100}
                style={[styles.playlistPopupInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              />

              <Text style={[styles.playlistPopupLabel, { color: colors.text }]}>Description</Text>
              <TextInput
                value={playlistDescription}
                onChangeText={setPlaylistDescription}
                placeholder="Describe your playlist"
                placeholderTextColor={colors.textSecondary}
                maxLength={500}
                multiline
                style={[
                  styles.playlistPopupInput,
                  styles.playlistPopupTextArea,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.card },
                ]}
              />

              <Text style={[styles.playlistPopupLabel, { color: colors.text }]}>Genre</Text>
              <GigPresetDropdown options={GIG_GENRE_OPTIONS} selectedValues={playlistGenre ? [playlistGenre] : []} onSelect={setPlaylistGenre} placeholder="Choose a genre" />
              <TextInput value={playlistGenre} onChangeText={setPlaylistGenre} placeholder="Enter another genre..." placeholderTextColor={colors.textSecondary} style={[styles.playlistPopupInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.playlistChipRow}>
                {PLAYLIST_GENRES.map((genreOption) => {
                  const selected = playlistGenre === genreOption;
                  return (
                    <TouchableOpacity
                      key={genreOption}
                      activeOpacity={1}
                      onPress={() => setPlaylistGenre(selected ? "" : genreOption)}
                      style={[
                        styles.playlistChip,
                        {
                          backgroundColor: selected ? colors.primary : "transparent",
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? "#FFFFFF" : colors.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                        {genreOption}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.playlistPopupLabel, { color: colors.text }]}>Visibility</Text>
              <View style={styles.playlistVisibilityRow}>
                {(["public", "private", "unlisted"] as const).map((visibilityOption) => {
                  const selected = playlistVisibility === visibilityOption;
                  return (
                    <TouchableOpacity
                      key={visibilityOption}
                      activeOpacity={1}
                      onPress={() => setPlaylistVisibility(visibilityOption)}
                      style={[
                        styles.playlistVisibilityButton,
                        {
                          backgroundColor: selected ? colors.primary : "transparent",
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? "#FFFFFF" : colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 12, textTransform: "capitalize" }}>
                        {visibilityOption}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.playlistTermsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={togglePlaylistCopyrightTerms}
                  style={styles.playlistTermsCheckboxButton}
                >
                  <Ionicons
                    name={playlistCopyrightTermsAccepted ? "checkbox" : "square-outline"}
                    size={22}
                    color={playlistCopyrightTermsAccepted ? colors.primary : colors.textSecondary}
                  />
                </TouchableOpacity>
                <Text style={[styles.playlistTermsText, { color: colors.textSecondary }]}>
                  I acknowledge the playlist copyright terms under RA 8293.{" "}
                  <Text style={[styles.playlistTermsLink, { color: colors.primary }]} onPress={openPlaylistCopyrightTermsModal}>
                    View terms
                  </Text>
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={creatingGroupPlaylist || !playlistTitle.trim() ? 1 : 0.78}
                disabled={creatingGroupPlaylist || !playlistTitle.trim()}
                onPress={handleSubmitGroupPlaylist}
                style={[
                  styles.playlistSubmitButton,
                  {
                    backgroundColor: playlistTitle.trim() ? colors.primary : colors.border,
                    opacity: creatingGroupPlaylist || !playlistTitle.trim() ? 0.62 : 1,
                  },
                ]}
              >
                {creatingGroupPlaylist ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.playlistSubmitText}>Create Group Playlist</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </RNModal>
      <RNModal
        visible={playlistCopyrightTermsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPlaylistCopyrightTermsVisible(false)}
      >
        <View style={styles.playlistTermsOverlay}>
          <View style={[styles.playlistTermsModalCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.playlistTermsModalTitle, { color: colors.text }]}>Copyright Terms</Text>
            <Text style={[styles.playlistTermsModalBody, { color: colors.textSecondary }]}>
              {PLAYLIST_COPYRIGHT_TERMS_BODY}
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setPlaylistCopyrightTermsDraftAccepted((accepted) => !accepted)}
              style={[styles.playlistTermsModalCheckRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Ionicons
                name={playlistCopyrightTermsDraftAccepted ? "checkbox" : "square-outline"}
                size={22}
                color={playlistCopyrightTermsDraftAccepted ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.playlistTermsModalCheckText, { color: colors.text }]}>
                {PLAYLIST_COPYRIGHT_ACKNOWLEDGEMENT}
              </Text>
            </TouchableOpacity>
            <View style={styles.playlistTermsModalActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPlaylistCopyrightTermsVisible(false)}
                style={[styles.playlistTermsModalButton, { borderColor: colors.border }]}
              >
                <Text style={[styles.playlistTermsModalButtonText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={playlistCopyrightTermsDraftAccepted ? 0.85 : 1}
                disabled={!playlistCopyrightTermsDraftAccepted}
                onPress={confirmPlaylistCopyrightTerms}
                style={[
                  styles.playlistTermsModalButton,
                  styles.playlistTermsModalPrimaryButton,
                  {
                    backgroundColor: playlistCopyrightTermsDraftAccepted ? colors.primary : colors.border,
                    opacity: playlistCopyrightTermsDraftAccepted ? 1 : 0.65,
                  },
                ]}
              >
                <Text style={styles.playlistTermsModalPrimaryText}>Agree</Text>
              </TouchableOpacity>
            </View>
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
  visibilityCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  visibilityTextWrap: {
    flex: 1,
  },
  visibilityTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  visibilitySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
  },
  infoLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: "Poppins_600SemiBold",
  },
  infoValue: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  memberRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  memberName: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  memberMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  availabilityCard: {
    padding: 16,
    borderRadius: 16,
  },
  availabilityItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  availabilityTitle: {
    fontFamily: "Poppins_500Medium",
  },
  availabilitySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  memberState: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "white",
    shadowColor: "black",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  completionCard: {
    padding: 16,
    borderRadius: 16,
  },
  completionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  completionValue: {
    fontSize: 24,
    fontFamily: "Poppins_600SemiBold",
  },
  progressBarContainer: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#10b981",
    borderRadius: 6,
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
  actionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnText: {
    color: "#FFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },
  invitationCard: {
    padding: 16,
    borderRadius: 24,
  },
  invitationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  invitationImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  invitationTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  invitationSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  starRatingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  invitationDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  invitationDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
  },
  invitationPrice: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
  },
  invitationMessage: {
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
  setupCard: {
    padding: 16,
    borderRadius: 16,
  },
  setupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
  },
  editLink: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  stagePlotContainer: {
    height: 192,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  stagePlotText: {
    fontSize: 12,
    marginTop: 8,
    fontFamily: "Poppins_400Regular",
  },
  inputListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  channelNumber: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    marginRight: 12,
  },
  inputName: {
    fontFamily: "Poppins_500Medium",
  },
  inputDetails: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  hospitalityCard: {
    padding: 16,
    borderRadius: 16,
  },
  featuredVideoContainer: {
    padding: 16,
    borderRadius: 16,
  },
  featuredVideo: {
    height: 192,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    marginBottom: 12,
  },
  playIconOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  videoTitle: {
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
    marginBottom: 4,
  },
  videoViews: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  pressCard: {
    width: 256,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 16,
  },
  pressMetric: {
    fontSize: 30,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
  },
  pressLabel: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  pressSource: {
    fontSize: 12,
    marginTop: 8,
    color: "#9CA3AF",
  },
  audioDemoItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  trackTitle: {
    fontFamily: "Poppins_500Medium",
  },
  trackDuration: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
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
  playlistPopupOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  playlistPopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  playlistPopupCard: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "88%",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 34,
  },
  playlistPopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  playlistPopupTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  playlistPopupSubtitle: {
    marginTop: 2,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  playlistPopupCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  playlistPopupBody: {
    flexGrow: 0,
  },
  playlistPopupBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
  },
  playlistPopupLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    marginTop: 14,
    marginBottom: 7,
  },
  playlistPopupInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  playlistPopupTextArea: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  playlistChipRow: {
    gap: 8,
    paddingRight: 20,
    paddingBottom: 2,
  },
  playlistChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  playlistVisibilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  playlistVisibilityButton: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  playlistTermsCard: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    gap: 10,
  },
  playlistTermsCheckboxButton: {
    paddingTop: 1,
  },
  playlistTermsText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  playlistTermsLink: {
    fontFamily: "Poppins_700Bold",
  },
  playlistTermsOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  playlistTermsModalCard: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  playlistTermsModalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
  },
  playlistTermsModalBody: {
    marginTop: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  playlistTermsModalCheckRow: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  playlistTermsModalCheckText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  playlistTermsModalActions: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  playlistTermsModalButton: {
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playlistTermsModalPrimaryButton: {
    borderWidth: 0,
  },
  playlistTermsModalButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  playlistTermsModalPrimaryText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
  },
  playlistSubmitButton: {
    marginTop: 24,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistSubmitText: {
    color: "#FFFFFF",
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
  },
});
