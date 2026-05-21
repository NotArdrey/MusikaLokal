import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Modal, { normalizeVisibleInput } from "../src/components/modal";
import Navbar from "../src/components/navbar";
import ProductionInviteSection from "../src/components/ProductionInviteSection";
import Skeleton from "../src/components/Skeleton";
import SmoothTabTransition from "../src/components/SmoothTabTransition";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth, useRequireAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";
import { ProductionInviteTarget, sendProductionTeamInvites } from "../src/utils/productionTeamInvites";
import { fetchActiveStaffAssignment, getStaffPermissions } from "../src/utils/staffAccess";

const IS_WEB = Platform.OS === "web";

interface Team {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  member_role: string;
  open_production_applications?: boolean;
  staff_access_level?: number | null;
  staff_can_edit?: boolean;
  staff_can_manage_bookings?: boolean;
  created_at: string;
}

interface TeamMember {
  user_id: string;
  role: string;
  full_name: string;
  avatar_url: string | null;
}

interface TeamRosterEntry {
  id: string;
  entity_kind: "musician" | "duo" | "group";
  display_name: string;
  avatar_url: string | null;
  group_type?: string | null;
  profile_id?: string | null;
  group_id?: string | null;
  profile?: any;
  group?: any;
}

const PRODUCTION_TABS: ("About" | "Members" | "Reviews")[] = ["About", "Members", "Reviews"];

const logFunctionInvokeError = (
  functionName: string,
  error: any,
  body: Record<string, unknown>,
) => {
  console.warn(`${functionName} failed`, {
    message: error?.message,
    status: error?.status || error?.context?.status,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    context: error?.context,
    body,
  });
};

export default function ProductionTeamScreen() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const detailPageBackground = isWebDesktop
    ? isDark
      ? "#0A1224"
      : "#E9EEF8"
    : colors.background;
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const { userRole } = useAuth();
  const params = useLocalSearchParams<{ teamId?: string; tab?: string }>();
  const routeTeamId = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
  const routeTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const requestedTab = PRODUCTION_TABS.includes(routeTab as any)
    ? routeTab as "About" | "Members" | "Reviews"
    : "About";
  const isProducer = userRole === "producer";

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create team modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Team detail view
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [activeTab, setActiveTab] = useState<"About" | "Members" | "Reviews">(requestedTab);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamRoster, setTeamRoster] = useState<TeamRosterEntry[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [rosterActionId, setRosterActionId] = useState<string | null>(null);
  const [fireModalVisible, setFireModalVisible] = useState(false);
  const [memberToFire, setMemberToFire] = useState<TeamMember | null>(null);
  const [fireReason, setFireReason] = useState("");
  const [firingMember, setFiringMember] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [selectedInviteTargets, setSelectedInviteTargets] = useState<ProductionInviteTarget[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [updatingApplications, setUpdatingApplications] = useState(false);

  // Alert
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
  }>({ type: "info", title: "", message: "" });

  const showAlert = (type: AlertType, title: string, message: string) => {
    setAlertConfig({ type, title, message });
    setAlertVisible(true);
  };

  const invokeProduction = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-production", {
      body,
    });

    if (error) {
      logFunctionInvokeError("manage-production", error, body);
      throw error;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data;
  }, []);

  const renderSheetModal = ({
    visible,
    onClose,
    title,
    subtitle,
    children,
    scrollable = false,
  }: {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    scrollable?: boolean;
  }) => (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.sheetBackdrop}
        />
        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View
            style={[
              styles.sheetHandle,
              { backgroundColor: isDark ? "#4B5563" : "#E5E7EB" },
            ]}
          />
          <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.sheetHeaderCopy}>
              {subtitle ? (
                <Text style={[styles.sheetEyebrow, { color: colors.textSecondary }]}>
                  {subtitle}
                </Text>
              ) : null}
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              style={[
                styles.sheetCloseButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {scrollable ? (
            <ScrollView
              style={styles.sheetBody}
              contentContainerStyle={styles.sheetBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          ) : (
            <View style={styles.sheetBodyContent}>{children}</View>
          )}
        </View>
      </View>
    </RNModal>
  );

  const renderPopupModal = ({
    visible,
    onClose,
    title,
    subtitle,
    children,
  }: {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
  }) => (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.popupOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.popupBackdrop}
        />
        <View
          style={[
            styles.popupContainer,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={[styles.popupHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.popupHeaderCopy}>
              {subtitle ? (
                <Text style={[styles.popupEyebrow, { color: colors.textSecondary }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
              <Text style={[styles.popupTitle, { color: colors.text }]}>{title}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              style={[
                styles.popupCloseButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.popupBody}
            contentContainerStyle={styles.popupBodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );

  const fetchTeams = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await invokeProduction({ action: "list_my_teams" });
      setTeams(data?.teams || []);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch teams");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [invokeProduction, userId]);

  const fetchTeamMembers = useCallback(async (teamId: string) => {
    setLoadingMembers(true);
    try {
      const [membersResult, rosterResult] = await Promise.all([
        supabase
          .from("production_team_members")
          .select("user_id, role, profiles(id, full_name, avatar_url)")
          .eq("team_id", teamId),
        invokeProduction({
          action: "list_team_roster",
          team_id: teamId,
        }),
      ]);

      if (membersResult.error) throw membersResult.error;
      setTeamMembers(
        (membersResult.data || []).map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          full_name: m.profiles?.full_name || "Unknown",
          avatar_url: m.profiles?.avatar_url || null,
        }))
      );
      setTeamRoster((rosterResult?.roster || []) as TeamRosterEntry[]);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch members");
    } finally {
      setLoadingMembers(false);
    }
  }, [invokeProduction]);

  const fetchTeamById = useCallback(async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from("production_teams")
        .select("*")
        .eq("id", teamId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        showAlert("warning", "Not Found", "Production team not found.");
        setSelectedTeam(null);
        return;
      }

      const { data: membershipData } = await supabase
        .from("production_team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle();

      const staffAssignment = userRole === "staff" && userId
        ? await fetchActiveStaffAssignment(supabase, userId)
        : null;
      const isAssignedStaff =
        staffAssignment?.entity_type === "production" &&
        staffAssignment.production_team_id === teamId;
      const staffPermissions = isAssignedStaff
        ? getStaffPermissions(staffAssignment?.access_level)
        : null;

      setSelectedTeam({
        ...data,
        member_role: data.owner_id === userId
          ? "owner"
          : membershipData?.role || (isAssignedStaff ? `staff-level-${staffAssignment?.access_level}` : "viewer"),
        staff_access_level: isAssignedStaff ? staffAssignment?.access_level || null : null,
        staff_can_edit: Boolean(staffPermissions?.canEditListing),
        staff_can_manage_bookings: Boolean(staffPermissions?.canManageBookings),
        open_production_applications:
          typeof data.open_production_applications === "boolean"
            ? data.open_production_applications
            : undefined,
      });
      setActiveTab(requestedTab);
      await fetchTeamMembers(teamId);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch team");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchTeamMembers, requestedTab, userId, userRole]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && isAuthenticated) {
        setLoading(true);
        if (routeTeamId) {
          fetchTeamById(routeTeamId);
        } else {
          fetchTeams();
        }
      }
    }, [authLoading, isAuthenticated, fetchTeamById, fetchTeams, routeTeamId])
  );

  const handleCreateTeam = async () => {
    if (!isProducer) {
      showAlert("warning", "Production Only", "Only production users can create a production team.");
      return;
    }

    const teamName = normalizeVisibleInput(newTeamName);
    const teamDescription = normalizeVisibleInput(newTeamDescription);
    if (!teamName) {
      showAlert("warning", "Required", "Team name is required");
      return;
    }

    if (!teamDescription) {
      showAlert("warning", "Required", "Description is required");
      return;
    }

    setCreating(true);
    try {
      await invokeProduction({
        action: "create_production_team",
        name: teamName,
        description: teamDescription,
      });

      setCreateModalVisible(false);
      setNewTeamName("");
      setNewTeamDescription("");
      showAlert("success", "Success", "Production team created!");
      fetchTeams();
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to create team");
    } finally {
      setCreating(false);
    }
  };
  const isCreateTeamReady =
    normalizeVisibleInput(newTeamName).length > 0 &&
    normalizeVisibleInput(newTeamDescription).length > 0;
  const isInviteSubmitDisabled = sendingInvites || selectedInviteTargets.length === 0;
  const isCreateTeamSubmitDisabled = creating || !isCreateTeamReady;

  const openFireMemberModal = (member: TeamMember) => {
    setMemberToFire(member);
    setFireReason("");
    setFireModalVisible(true);
  };

  const closeFireMemberModal = () => {
    if (firingMember) return;
    setFireModalVisible(false);
    setMemberToFire(null);
    setFireReason("");
    setInviteModalVisible(false);
    setInviteMessage("");
    setSelectedInviteTargets([]);
  };

  const handleRemoveMember = async () => {
    if (!selectedTeam || !memberToFire || firingMember) return;
    const reason = normalizeVisibleInput(fireReason);
    if (!reason) {
      showAlert("warning", "Reason Required", "Please provide a reason before firing this member.");
      return;
    }

    setFiringMember(true);
    try {
      const data = await invokeProduction({
        action: "remove_team_member",
        team_id: selectedTeam.id,
        user_id: memberToFire.user_id,
        reason,
      });
      const firedMemberName = memberToFire.full_name || "Member";
      setFireModalVisible(false);
      setMemberToFire(null);
      setFireReason("");
      showAlert(
        data?.notification_sent === false ? "warning" : "success",
        "Member Fired",
        data?.notification_sent === false
          ? `${firedMemberName} was removed, but the notification could not be sent.`
          : `${firedMemberName} was removed and notified.`,
      );
      fetchTeamMembers(selectedTeam.id);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to remove member");
    } finally {
      setFiringMember(false);
    }
  };

  const handleRemoveRosterEntry = async (entry: TeamRosterEntry) => {
    if (!selectedTeam || rosterActionId) return;

    setRosterActionId(entry.id);
    try {
      const data = await invokeProduction({
        action: "remove_team_roster_entry",
        team_id: selectedTeam.id,
        roster_id: entry.id,
      });

      setTeamRoster((data?.roster || []) as TeamRosterEntry[]);
      showAlert("success", "Roster Updated", `${entry.display_name || "Performer"} was removed from the production roster.`);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to remove roster entry");
    } finally {
      setRosterActionId(null);
    }
  };

  const closeInviteMemberModal = () => {
    if (sendingInvites) return;
    setInviteModalVisible(false);
    setInviteMessage("");
    setSelectedInviteTargets([]);
  };

  const handleSendMemberInvites = async () => {
    if (!selectedTeam || sendingInvites) return;

    if (!userId) {
      showAlert("warning", "Sign In Required", "Sign in again before sending invites.");
      return;
    }

    if (selectedInviteTargets.length === 0) {
      showAlert("warning", "No Talent Selected", "Select at least one musician, duo, or group to invite.");
      return;
    }

    setSendingInvites(true);
    try {
      const inviteSummary = await sendProductionTeamInvites({
        currentUserId: userId,
        teamId: selectedTeam.id,
        teamName: selectedTeam.name,
        teamLogoUrl: selectedTeam.logo_url,
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
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to send invites");
    } finally {
      setSendingInvites(false);
    }
  };

  const handleToggleProductionApplications = async (value: boolean) => {
    if (!selectedTeam || updatingApplications) return;
    if (typeof selectedTeam.open_production_applications !== "boolean") return;

    const previous = selectedTeam.open_production_applications;
    setSelectedTeam((prev) =>
      prev ? { ...prev, open_production_applications: value } : prev,
    );
    setTeams((prev) =>
      prev.map((team) =>
        team.id === selectedTeam.id
          ? { ...team, open_production_applications: value }
          : team,
      ),
    );
    setUpdatingApplications(true);

    try {
      const data = await invokeProduction({
        action: "update_production_team",
        team_id: selectedTeam.id,
        name: selectedTeam.name,
        description: selectedTeam.description,
        logo_url: selectedTeam.logo_url,
        open_production_applications: value,
      });

      if (!data?.success) throw new Error(data?.error || "Could not update applications setting.");

      showAlert(
        "success",
        "Applications Setting Updated",
        value
          ? "Your production team is now open for applications."
          : "Your production team is now closed for applications.",
      );
    } catch (e: any) {
      setSelectedTeam((prev) =>
        prev ? { ...prev, open_production_applications: previous } : prev,
      );
      setTeams((prev) =>
        prev.map((team) =>
          team.id === selectedTeam.id
            ? { ...team, open_production_applications: previous }
            : team,
        ),
      );
      showAlert("error", "Update Failed", e.message || "Could not update applications setting.");
    } finally {
      setUpdatingApplications(false);
    }
  };

  const openTeamDetail = (team: Team) => {
    setActiveTab("About");
    setSelectedTeam(team);
    fetchTeamMembers(team.id);
  };

  const closeTeamDetail = () => {
    if (routeTeamId) {
      router.back();
      return;
    }

    setActiveTab("About");
    setSelectedTeam(null);
    setTeamMembers([]);
    setTeamRoster([]);
    setFireModalVisible(false);
    setMemberToFire(null);
    setFireReason("");
  };

  const statusColor = (role: string) => {
    switch (role) {
      case "owner":
        return "#F59E0B";
      case "manager":
        return "#3B82F6";
      default:
        return colors.textSecondary;
    }
  };

  // Team detail view
  if (selectedTeam) {
    const tabs = PRODUCTION_TABS;
    const selectedStaffPermissions = selectedTeam.staff_access_level
      ? getStaffPermissions(selectedTeam.staff_access_level)
      : null;
    const canManage =
      selectedTeam.member_role === "owner" ||
      selectedTeam.member_role === "manager" ||
      Boolean(selectedStaffPermissions?.canEditListing);

    return (
      <>
        <View style={[styles.flex1, { backgroundColor: detailPageBackground }]}>
          <Header title="Manage Production" cardStyle onBackPress={closeTeamDetail} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.detailScrollContent, { paddingBottom: contentBottomPadding }]}
          >
          <View style={styles.contentFrame}>
          <View style={styles.headerContainer}>
            <View
              style={[
                styles.headerImageContainer,
                {
                  shadowColor: colors.primary,
                },
              ]}
            >
              {selectedTeam.logo_url ? (
                <CachedImage uri={selectedTeam.logo_url} style={styles.headerImage} />
              ) : (
                <View style={[styles.headerImage, styles.headerImagePlaceholder, { backgroundColor: colors.border }]}>
                  <Ionicons name="people-outline" size={44} color={colors.textSecondary} />
                </View>
              )}
            </View>

            <Text style={[styles.headerTitle, { color: colors.text }]}>{selectedTeam.name}</Text>
            <Text style={[styles.headerSubTitle, { color: colors.textSecondary }]}>
              {selectedTeam.member_role.toUpperCase()} - Production Team
            </Text>
          </View>

          <View style={[styles.tabsContainer, { backgroundColor: colors.inputBackground }]}>
            {tabs.map((tab) => (
              <TouchableOpacity
                activeOpacity={1}
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: activeTab === tab ? colors.surface : "transparent",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: activeTab === tab ? 2 : 0 },
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
                      fontFamily: activeTab === tab ? "Poppins_600SemiBold" : "Poppins_500Medium",
                      color: activeTab === tab ? colors.primary : colors.textSecondary,
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
                <Text style={[styles.aboutText, { color: colors.textSecondary }]}>
                  {selectedTeam.description || "No description available."}
                </Text>

                {canManage && typeof selectedTeam.open_production_applications === "boolean" ? (
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
                        Open applications to this production team
                      </Text>
                      <Text
                        style={[
                          styles.visibilitySubtitle,
                          { color: colors.textSecondary },
                        ]}
                      >
                        Shows an Open Applications badge on your production team cards in Search.
                      </Text>
                    </View>
                    <Switch
                      value={selectedTeam.open_production_applications !== false}
                      onValueChange={handleToggleProductionApplications}
                      disabled={updatingApplications}
                      trackColor={{ false: isDark ? "#374151" : "#D1D5DB", true: colors.primary + "66" }}
                      thumbColor={selectedTeam.open_production_applications !== false ? colors.primary : "#9CA3AF"}
                    />
                  </View>
                ) : null}

                <View style={styles.statsRow}>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Team Members</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {loadingMembers ? "-" : teamMembers.length}
                    </Text>
                  </View>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Roster</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {loadingMembers ? "-" : teamRoster.length}
                    </Text>
                  </View>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Role</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {selectedTeam.member_role}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {activeTab === "Members" && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Roster & Members</Text>
                  {canManage ? (
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => setInviteModalVisible(true)}
                      style={[styles.inviteBtn, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="person-add-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.inviteBtnText}>Invite</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {loadingMembers ? (
                  <View style={styles.loadingContainer}>
                    <Skeleton width="100%" height={56} borderRadius={12} />
                    <Skeleton width="100%" height={56} borderRadius={12} style={{ marginTop: 8 }} />
                  </View>
                ) : (
                  <>
                    <View style={styles.subsectionHeader}>
                      <Text style={[styles.subsectionTitle, { color: colors.textSecondary }]}>Production Roster</Text>
                      <Text style={[styles.subsectionCount, { color: colors.textSecondary }]}>{teamRoster.length}</Text>
                    </View>

                    {teamRoster.length === 0 ? (
                      <Text style={[styles.emptyInlineText, { color: colors.textSecondary }]}>No musicians, duos, or groups on the roster yet</Text>
                    ) : (
                      teamRoster.map((entry) => {
                        const isGroupEntry = entry.entity_kind === "duo" || entry.entity_kind === "group";
                        const entryType =
                          entry.entity_kind === "musician"
                            ? "Solo Musician"
                            : entry.entity_kind === "duo"
                              ? "Duo"
                              : "Group";
                        const isBusy = rosterActionId === entry.id;

                        return (
                          <View
                            key={entry.id}
                            style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                          >
                            <View style={styles.memberRow}>
                              {entry.avatar_url ? (
                                <CachedImage uri={entry.avatar_url} style={styles.avatar} />
                              ) : (
                                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                                  <Ionicons name={isGroupEntry ? "people" : "person"} size={18} color={colors.textSecondary} />
                                </View>
                              )}
                              <View style={styles.memberInfo}>
                                <Text style={[styles.memberName, { color: colors.text }]}>{entry.display_name}</Text>
                                <Text style={[styles.memberRole, { color: colors.primary }]}>{entryType}</Text>
                              </View>
                              {canManage ? (
                                <TouchableOpacity
                                  activeOpacity={1}
                                  disabled={Boolean(rosterActionId)}
                                  onPress={() => handleRemoveRosterEntry(entry)}
                                  style={[styles.removeBtn, { opacity: isBusy ? 0.5 : 1 }]}
                                >
                                  {isBusy ? (
                                    <ActivityIndicator size="small" color="#EF4444" />
                                  ) : (
                                    <Ionicons name="close-circle" size={22} color="#EF4444" />
                                  )}
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        );
                      })
                    )}

                    <View style={[styles.subsectionHeader, styles.memberSubsectionSpacing]}>
                      <Text style={[styles.subsectionTitle, { color: colors.textSecondary }]}>Team Access</Text>
                      <Text style={[styles.subsectionCount, { color: colors.textSecondary }]}>{teamMembers.length}</Text>
                    </View>

                    {teamMembers.length === 0 ? (
                      <Text style={[styles.emptyInlineText, { color: colors.textSecondary }]}>No team members found</Text>
                    ) : (
                      teamMembers.map((member) => (
                        <View
                          key={member.user_id}
                          style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        >
                          <View style={styles.memberRow}>
                            {member.avatar_url ? (
                              <CachedImage uri={member.avatar_url} style={styles.avatar} />
                            ) : (
                              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                                <Ionicons name="person" size={18} color={colors.textSecondary} />
                              </View>
                            )}
                            <View style={styles.memberInfo}>
                              <Text style={[styles.memberName, { color: colors.text }]}>{member.full_name}</Text>
                              <Text style={[styles.memberRole, { color: statusColor(member.role) }]}>{member.role}</Text>
                            </View>
                            {canManage && member.role !== "owner" && member.user_id !== userId && (
                              <TouchableOpacity
                                activeOpacity={1}
                                onPress={() => openFireMemberModal(member)}
                                style={styles.removeBtn}
                              >
                                <Ionicons name="close-circle" size={22} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      ))
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === "Reviews" && (
              <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary} />
                <Text style={[styles.reviewTitle, { color: colors.text }]}>No reviews yet</Text>
                <Text style={[styles.reviewDescription, { color: colors.textSecondary }]}>
                  Production team reviews will appear here once this section is available.
                </Text>
              </View>
            )}
          </SmoothTabTransition>

          </View>
          </ScrollView>
          <Navbar />
        </View>

        <Modal
          visible={fireModalVisible}
          onClose={closeFireMemberModal}
          title="Fire Member"
          message={
            firingMember
              ? "Removing member and sending notification..."
              : `Tell ${memberToFire?.full_name || "this member"} why they are being removed from ${selectedTeam.name}. This reason will be sent to their notifications.`
          }
          buttonText={firingMember ? "Firing..." : "Fire Member"}
          onConfirm={handleRemoveMember}
          danger
          showInput
          inputPlaceholder="Reason for firing"
          inputValue={fireReason}
          onInputChange={setFireReason}
          confirmDisabled={firingMember}
          loading={firingMember}
          loadingMessage="Removing member and sending notification..."
        />

        {renderPopupModal({
          visible: inviteModalVisible,
          onClose: closeInviteMemberModal,
          title: "Invite Members",
          subtitle: selectedTeam.name,
          children: (
            <View style={styles.modalContent}>
              <ProductionInviteSection
                currentUserId={userId}
                productionTeamId={selectedTeam.id}
                selectedTargets={selectedInviteTargets}
                onSelectedTargetsChange={setSelectedInviteTargets}
                inviteMessage={inviteMessage}
                onInviteMessageChange={setInviteMessage}
                disabled={sendingInvites}
                compact
              />

              <TouchableOpacity
                activeOpacity={isInviteSubmitDisabled ? 1 : 0.78}
                onPress={handleSendMemberInvites}
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
          ),
        })}

        <CustomAlert
          visible={alertVisible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          onClose={() => setAlertVisible(false)}
        />
      </>
    );
  }

  // ── Teams List View ──
  return (
    <View style={[styles.flex1, { backgroundColor: routeTeamId ? detailPageBackground : colors.background }]}>
      <Header
        title={routeTeamId ? "Manage Production" : "Production Teams"}
        cardStyle={Boolean(routeTeamId)}
        onBackPress={routeTeamId ? () => router.back() : undefined}
      />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchTeams();
            }}
          />
        }
      >
        <View style={styles.contentFrame}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <Skeleton width="100%" height={80} borderRadius={14} />
            <Skeleton width="100%" height={80} borderRadius={14} style={{ marginTop: 12 }} />
          </View>
        ) : teams.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={56} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{isProducer ? "No Production Teams" : "No Teams Yet"}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isProducer
                ? "Create a production team to manage members and rosters."
                : "Only production users can create a production team, but you can still open shared team links."}
            </Text>
          </View>
        ) : (
          teams.map((team) => (
            <TouchableOpacity activeOpacity={1}
              key={team.id}
              onPress={() => openTeamDetail(team)}
              style={[styles.teamCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.teamCardRow}>
                {team.logo_url ? (
                  <CachedImage uri={team.logo_url} style={styles.teamCardLogo} />
                ) : (
                  <View style={[styles.teamCardLogoPlaceholder, { backgroundColor: colors.border }]}>
                    <Ionicons name="people" size={22} color={colors.textSecondary} />
                  </View>
                )}
                <View style={styles.teamCardInfo}>
                  <Text style={[styles.teamCardName, { color: colors.text }]}>{team.name}</Text>
                  <View style={styles.teamCardMeta}>
                    <View style={[styles.roleBadgeSmall, { backgroundColor: statusColor(team.member_role) + "22" }]}>
                      <Text style={[styles.roleBadgeSmallText, { color: statusColor(team.member_role) }]}>
                        {team.member_role}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          ))
        )}
        </View>
      </ScrollView>

      {isProducer ? (
        <TouchableOpacity activeOpacity={1}
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => setCreateModalVisible(true)}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Create Team Modal */}
      {renderSheetModal({
        visible: createModalVisible,
        onClose: () => setCreateModalVisible(false),
        title: "Create Production Team",
        subtitle: "Production Team",
        children: (
          <View style={styles.modalContent}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>Team Name *</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
            value={newTeamName}
            onChangeText={setNewTeamName}
            placeholder="e.g. Events Pro Team"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Description *</Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.card,
              },
            ]}
            value={newTeamDescription}
            onChangeText={setNewTeamDescription}
            placeholder="Brief description of the team..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity activeOpacity={isCreateTeamSubmitDisabled ? 1 : 0.78}
            onPress={handleCreateTeam}
            disabled={isCreateTeamSubmitDisabled}
            style={[styles.submitBtn, { backgroundColor: isCreateTeamReady ? colors.primary : colors.border, opacity: isCreateTeamSubmitDisabled ? 0.6 : 1 }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.submitBtnText, { color: isCreateTeamReady ? "#FFFFFF" : colors.textSecondary }]}>Create Team</Text>
            )}
          </TouchableOpacity>
          </View>
        ),
      })}

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertVisible(false)}
      />
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  contentFrame: {
    width: '100%',
    maxWidth: IS_WEB ? 1080 : undefined,
    alignSelf: 'center',
  },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 180 },
  detailScrollContent: { paddingBottom: 180 },
  loadingContainer: { marginTop: 8 },
  emptyContainer: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 18, marginTop: 16 },
  emptyText: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", marginTop: 8, paddingHorizontal: 32 },

  // Team list
  teamCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  teamCardRow: { flexDirection: "row", alignItems: "center" },
  teamCardLogo: { width: 44, height: 44, borderRadius: 22 },
  teamCardLogoPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  teamCardInfo: { flex: 1, marginLeft: 12 },
  teamCardName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  teamCardMeta: { flexDirection: "row", marginTop: 2 },

  // Team detail
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
    elevation: 10,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },
  headerImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 24,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
  },
  headerSubTitle: {
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
  },
  roleBadgeSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleBadgeSmallText: { fontFamily: "Poppins_500Medium", fontSize: 11 },
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
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  visibilityTextWrap: { flex: 1 },
  visibilityTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    marginBottom: 6,
  },
  visibilitySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  infoCard: {
    flex: 1,
    minWidth: 96,
    borderRadius: 16,
    padding: 16,
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
    fontFamily: "Poppins_700Bold",
  },

  // Members
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  subsectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  memberSubsectionSpacing: { marginTop: 18 },
  subsectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 },
  subsectionCount: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  emptyInlineText: { fontFamily: "Poppins_400Regular", fontSize: 13, marginBottom: 10 },
  inviteBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  inviteBtnText: { color: "#FFFFFF", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  memberCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  memberRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  memberInfo: { flex: 1, marginLeft: 10 },
  memberName: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  memberRole: { fontFamily: "Poppins_400Regular", fontSize: 12, textTransform: "capitalize" },
  removeBtn: { padding: 4 },

  // Buttons
  reviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: "center",
  },
  reviewTitle: {
    marginTop: 10,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  reviewDescription: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  backBtn: { alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  backBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14 },

  // FAB
  fab: { position: "absolute", bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },

  // Modal
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheetBackdrop: { flex: 1 },
  sheetContainer: {
    maxHeight: "88%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  sheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  sheetHeaderCopy: {
    flex: 1,
    paddingRight: 16,
  },
  sheetEyebrow: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  sheetTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  sheetCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sheetBody: {
    flexGrow: 0,
  },
  sheetBodyContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  popupOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: "rgba(2,6,23,0.72)",
  },
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  popupContainer: {
    width: IS_WEB ? 460 : "100%",
    maxWidth: "100%",
    maxHeight: IS_WEB ? 620 : "86%",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  popupHeaderCopy: {
    flex: 1,
    paddingRight: 14,
  },
  popupEyebrow: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  popupTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 18,
  },
  popupCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  popupBody: {
    flexGrow: 0,
  },
  popupBodyContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  modalContent: { paddingHorizontal: 4 },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 14 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  submitBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});
