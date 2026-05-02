import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import GroupLinkedPlaylistsSection from "../src/components/GroupLinkedPlaylistsSection";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
import Navbar from "../src/components/navbar";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { getGroupMembersLabel, isGroupLeaderMember } from "../src/utils/groupMembers";
import { fetchGroupLinkedPlaylists } from "../src/utils/groupPlaylists";
import {
    hasValidCoordinates,
    openNavigationDirections,
} from "../src/utils/navigation";
import { formatFriendlyDateTime } from "../src/utils/friendlyDateTime";

import { useLocalSearchParams } from "expo-router";

export default function GroupDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isSystemLocked, showLockAlert } = useAuth();
  const { id } = useLocalSearchParams();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("About");
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [modalButtonText, setModalButtonText] = useState("");
  const [modalAction, setModalAction] = useState<(() => Promise<void>) | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showGigStatuses, setShowGigStatuses] = useState(true);
  const [supportsGigVisibilityPreference, setSupportsGigVisibilityPreference] = useState(true);
  const [updatingGigVisibility, setUpdatingGigVisibility] = useState(false);
  const [openGroupApplications, setOpenGroupApplications] = useState(true);
  const [updatingGroupApplications, setUpdatingGroupApplications] = useState(false);

  const [group, setGroup] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [groupPlaylists, setGroupPlaylists] = useState<any[]>([]);
  const [loadingGroupPlaylists, setLoadingGroupPlaylists] = useState(false);
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

  const showAlert = (
    type: AlertType,
    title: string,
    message: string,
    buttons?: any[],
  ) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const isMissingRelationError = (error: any, relationName: string) => {
    const message = String(error?.message || "").toLowerCase();
    return error?.code === "42P01" && message.includes(relationName.toLowerCase());
  };

  const isMissingShowGigStatusesColumnError = (error: any) => {
    const message = String(error?.message || "").toLowerCase();
    return error?.code === "42703" && message.includes("show_gig_statuses");
  };

  const handleNavigateToGroup = async () => {
    try {
      await openNavigationDirections({
        latitude: group?.latitude,
        longitude: group?.longitude,
        label: group?.location || group?.name || "Group location",
      });
    } catch (error) {
      showAlert(
        "warning",
        "Navigation Unavailable",
        "This group does not have pinned coordinates yet.",
      );
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
    if (!authorized || !currentUserId || !supportsGigVisibilityPreference) return;
    fetchVisibilityPreference(currentUserId);
  }, [authorized, currentUserId, supportsGigVisibilityPreference]);

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
        setGroupPlaylists([]);
      })
      .finally(() => {
        if (!isActive) return;
        setLoadingGroupPlaylists(false);
      });

    return () => {
      isActive = false;
    };
  }, [group?.id]);

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
      if (isMissingShowGigStatusesColumnError(e)) {
        setSupportsGigVisibilityPreference(false);
        setShowGigStatuses(true);
        return;
      }
    }
  };

  const fetchApplicationsFallback = async (groupId: string) => {
    const { data, error } = await supabase
      .from("gig_applications")
      .select("id, status, created_at, gig_id, gig:gigs(name, location, budget)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
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
        showAlert("warning", "Unauthorized", "Only musicians can access this page.");
        router.replace("/home");
        return;
      }

      setCurrentUserId(user.id);
      setAuthorized(true);
    } catch (e) {
      console.error("Authorization check failed:", e);
      router.replace("/home");
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
        showAlert("warning", "Invalid Group", "Invalid group ID. Please try again.");
        router.replace("/home");
        return;
      }


      // Base query + legacy projection merge
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .eq('owner_id', userId)
        .single();

      let legacyMembers: any[] = [];
      let legacyImages: string[] = [];

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
        // if (groupError.message?.includes("non-2xx")) {
        //   undefined;
        // }
        throw groupError;
      }

      if (!legacyGroupError && legacyGroup) {
        legacyMembers = Array.isArray(legacyGroup.members) ? legacyGroup.members : [];
        legacyImages = Array.isArray(legacyGroup.images) ? legacyGroup.images : [];
      } else if (legacyGroupError && isMissingRelationError(legacyGroupError, 'groups_legacy_projection')) {
        const [{ data: rosterRows, error: rosterError }, { data: fallbackMediaRows, error: fallbackMediaError }] = await Promise.all([
          supabase
            .from('group_roster_members')
            .select('user_id, member_name, member_role, instrument, avatar_url, sort_order, raw_member')
            .eq('group_id', groupId)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase
            .from('group_media')
            .select('media_url, sort_order, created_at')
            .eq('group_id', groupId)
            .eq('media_type', 'image')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: true }),
        ]);

        if (!rosterError) {
          legacyMembers = (rosterRows || []).map((row: any) => {
            if (row?.raw_member && typeof row.raw_member === 'object') {
              return row.raw_member;
            }
            return {
              name: row?.member_name || 'Unknown',
              role: row?.member_role || undefined,
              user_id: row?.user_id || undefined,
              avatar_url: row?.avatar_url || undefined,
              instrument: row?.instrument || '',
            };
          });
        }

        if (!fallbackMediaError) {
          legacyImages = (fallbackMediaRows || [])
            .map((row: any) => row.media_url)
            .filter((url: any) => typeof url === 'string' && url.trim().length > 0);
        }
      } else if (legacyGroupError) {
        throw legacyGroupError;
      }

      if (groupMediaError) {
      }

      const mediaImages = (groupMediaRows || [])
        .map((row: any) => row.media_url)
        .filter((url: any) => typeof url === 'string' && url.trim().length > 0);

      setGroup({
        ...groupData,
        members: legacyMembers,
        images:
          mediaImages.length > 0
            ? mediaImages
            : legacyImages,
      });
      setOpenGroupApplications(groupData?.open_group_applications !== false);

      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("group_members")
          .select("user_id, role, profiles:user_id(full_name, avatar_url)")
          .eq("group_id", groupId);

        if (memberError) {
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
              row.role === "owner" || row.user_id === groupData?.owner_id
                ? "Leader"
                : "Member",
            membershipState: "active",
            source: "group_members",
          }));
          setGroupMembers(mappedMembers);
        }
      } catch (memberErr) {
        setGroupMembers([]);
      }

      // Fetch Group Applications (Sent) directly to avoid edge-function drift.
      try {
        const apps = await fetchApplicationsFallback(groupId);
        setApplications(apps);
      } catch (appErr) {
        setApplications([]);
      }

      // Direct query to reviews table
      try {
        const { data: reviewData, error: reviewError } = await supabase
          .from('reviews')
          .select('*, author:profiles!reviews_author_id_fkey(id, full_name, avatar_url)')
          .eq('group_id', groupId)
          .order('created_at', { ascending: false });
        if (reviewError) {
        } else {
          setReviews(reviewData || []);
        }
      } catch (reviewErr) {
      }

    } catch (e: any) {
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

        const { data: appRow, error: appFetchError } = await supabase
          .from("gig_applications")
          .select("id, group_id, group:groups!group_id(owner_id)")
          .eq("id", app.id)
          .maybeSingle();

        if (appFetchError) throw appFetchError;
        if (!appRow) throw new Error("Application not found.");
        const appGroup = Array.isArray(appRow.group) ? appRow.group[0] : appRow.group;
        if (appGroup?.owner_id !== user.id) {
          throw new Error("You are not authorized to update this application.");
        }

        const { data, error } = await supabase
          .from("gig_applications")
          .update({
            leader_approval_status: decision,
            leader_reviewed_at: new Date().toISOString(),
          })
          .eq("id", app.id)
          .eq("group_id", appRow.group_id)
          .select("id, leader_approval_status, leader_reviewed_at")
          .single();

        if (error) throw error;

        setApplications((prev) =>
          prev.map((a) => (a.id === app.id ? { ...a, ...data } : a)),
        );
        setModalVisible(false);
      } catch (e: any) {
        showAlert("warning", "Update Failed", e?.message || "Failed to update leader decision.");
      }
    });
    setModalVisible(true);
  };

  const handleToggleGigVisibility = async (value: boolean) => {
    if (!currentUserId || updatingGigVisibility || !supportsGigVisibilityPreference) return;

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
      if (isMissingShowGigStatusesColumnError(e)) {
        setSupportsGigVisibilityPreference(false);
        setShowGigStatuses(true);
        return;
      }
      setShowGigStatuses(previous);
      showAlert(
        "warning",
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
        "warning",
        "Update Failed",
        e?.message || "Could not update group applications setting.",
      );
    } finally {
      setUpdatingGroupApplications(false);
    }
  };

  const tabs = ["About", "Applications", "Review"];
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

  if (loading && !group) {
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
          Loading group details...
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title="Manage Group" />

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
              {group?.genre || "Genre N/A"} |{" "}
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

          <View style={styles.contentContainer}>
            {activeTab === "About" && (
              <View style={styles.aboutContainer}>
                <View>
                  <Text
                    style={[styles.aboutText, { color: colors.textSecondary }]}
                  >
                    {group?.description || "No description available."}
                  </Text>
                </View>

                {supportsGigVisibilityPreference && (
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
                )}

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
                      Shows an Open Applications badge on your group cards in Home and Search.
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
                                {memberInstrument && memberRole ? " | " : ""}
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

                <GroupLinkedPlaylistsSection
                  colors={colors}
                  isDark={isDark}
                  playlists={groupPlaylists}
                  loading={loadingGroupPlaylists}
                  onPlaylistPress={handlePlaylistPress}
                  title="Featured Playlists"
                  emptyMessage="Link playlists from Edit Group to feature them on this profile."
                />

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
                            ? formatFriendlyDateTime(app.created_at)
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
                  <Text style={{ color: colors.textSecondary }}>
                    No reviews yet.
                  </Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>

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
});
