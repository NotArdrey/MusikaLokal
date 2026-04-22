import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal as RNModal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import { useBottomBarClearance } from "../src/hooks/useBottomBarClearance";
import { useAuth, useRequireAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

interface Team {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  owner_id: string;
  member_role: string;
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
  group_type: string | null;
}

export default function ProductionTeamScreen() {
  const { colors, isDark } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const { userRole } = useAuth();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const routeTeamId = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
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
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [teamRoster, setTeamRoster] = useState<TeamRosterEntry[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Add member modal
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "manager">("member");
  const [addingMember, setAddingMember] = useState(false);

  // Add roster modal
  const [addRosterModalVisible, setAddRosterModalVisible] = useState(false);
  const [rosterMode, setRosterMode] = useState<"musician" | "group">("musician");
  const [rosterMusicianEmail, setRosterMusicianEmail] = useState("");
  const [accessibleGroups, setAccessibleGroups] = useState<any[]>([]);
  const [selectedRosterGroupId, setSelectedRosterGroupId] = useState<string | null>(null);
  const [addingRoster, setAddingRoster] = useState(false);

  // Propose deal modal
  const [proposeDealVisible, setProposeDealVisible] = useState(false);
  const [dealTitle, setDealTitle] = useState("");
  const [dealVenuePct, setDealVenuePct] = useState("60");
  const [dealProductionPct, setDealProductionPct] = useState("40");
  const [dealFixedFee, setDealFixedFee] = useState("");
  const [dealDeposit, setDealDeposit] = useState("");
  const [dealVenueEmail, setDealVenueEmail] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [proposingDeal, setProposingDeal] = useState(false);

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

  const fetchTeams = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: { action: "list_my_teams" },
      });
      if (error) throw error;
      setTeams(data?.teams || []);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch teams");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  const fetchTeamMembers = useCallback(async (teamId: string) => {
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from("production_team_members")
        .select("user_id, role, profiles(id, full_name, avatar_url)")
        .eq("team_id", teamId);

      if (error) throw error;
      setTeamMembers(
        (data || []).map((m: any) => ({
          user_id: m.user_id,
          role: m.role,
          full_name: m.profiles?.full_name || "Unknown",
          avatar_url: m.profiles?.avatar_url || null,
        }))
      );
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch members");
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  const fetchTeamRoster = useCallback(async (teamId: string) => {
    setLoadingRoster(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: { action: "list_team_roster", teamId },
      });

      if (error) throw error;
      setTeamRoster(data?.roster || []);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch team roster");
      setTeamRoster([]);
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  const fetchAccessibleGroups = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: ownedGroups, error: ownedError } = await supabase
        .from("groups_with_stats")
        .select("id, owner_id, name, images, genre, group_type")
        .eq("owner_id", userId);

      const { data: membershipRows, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      if (ownedError) throw ownedError;
      if (memberError) throw memberError;

      const memberGroupIds = Array.from(
        new Set(
          (membershipRows || [])
            .map((row: any) => row.group_id)
            .filter((id: any) => typeof id === "string" && id.length > 0),
        ),
      );

      let memberGroups: any[] = [];
      if (memberGroupIds.length > 0) {
        const { data: memberGroupData, error: memberGroupDataError } = await supabase
          .from("groups_with_stats")
          .select("id, owner_id, name, images, genre, group_type")
          .in("id", memberGroupIds);

        if (memberGroupDataError) throw memberGroupDataError;
        memberGroups = memberGroupData || [];
      }

      const uniqueGroups = [...(ownedGroups || []), ...memberGroups].filter(
        (groupItem, index, array) => array.findIndex((candidate) => candidate.id === groupItem.id) === index,
      );

      setAccessibleGroups(uniqueGroups.filter((groupItem) => ["duo", "band"].includes(groupItem.group_type)));
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch groups");
      setAccessibleGroups([]);
    }
  }, [userId]);

  const fetchTeamById = useCallback(async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from("production_teams")
        .select("id, name, description, logo_url, owner_id, created_at")
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

      setSelectedTeam({
        ...data,
        member_role: data.owner_id === userId ? "owner" : membershipData?.role || "viewer",
      });
      await Promise.all([fetchTeamMembers(teamId), fetchTeamRoster(teamId)]);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch team");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchTeamMembers, fetchTeamRoster, userId]);

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

    if (!newTeamName.trim()) {
      showAlert("warning", "Required", "Team name is required");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "create_production_team",
          name: newTeamName.trim(),
          description: newTeamDescription.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

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

  const handleAddMember = async () => {
    if (!memberEmail.trim() || !selectedTeam) {
      showAlert("warning", "Required", "Email is required");
      return;
    }
    setAddingMember(true);
    try {
      // Look up user by email
      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", memberEmail.trim().toLowerCase())
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!profileData) {
        showAlert("warning", "Not Found", "No user found with that email");
        setAddingMember(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "add_team_member",
          team_id: selectedTeam.id,
          user_id: profileData.id,
          role: memberRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setAddMemberModalVisible(false);
      setMemberEmail("");
      setMemberRole("member");
      showAlert("success", "Success", "Member added!");
      fetchTeamMembers(selectedTeam.id);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!selectedTeam) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "remove_team_member",
          team_id: selectedTeam.id,
          user_id: memberUserId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showAlert("success", "Removed", "Member removed from team");
      fetchTeamMembers(selectedTeam.id);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to remove member");
    }
  };

  const handleAddRoster = async () => {
    if (!selectedTeam) return;

    setAddingRoster(true);
    try {
      if (rosterMode === "musician") {
        if (!rosterMusicianEmail.trim()) {
          showAlert("warning", "Required", "Musician email is required");
          setAddingRoster(false);
          return;
        }

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", rosterMusicianEmail.trim().toLowerCase())
          .maybeSingle();

        if (profileErr) throw profileErr;
        if (!profileData) {
          showAlert("warning", "Not Found", "No registered musician found with that email.");
          setAddingRoster(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke("manage-deals", {
          body: {
            action: "add_team_roster_profile",
            teamId: selectedTeam.id,
            profileId: profileData.id,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        if (!selectedRosterGroupId) {
          showAlert("warning", "Required", "Select a duo or group to add.");
          setAddingRoster(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke("manage-deals", {
          body: {
            action: "add_team_roster_group",
            teamId: selectedTeam.id,
            groupId: selectedRosterGroupId,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      setAddRosterModalVisible(false);
      setRosterMode("musician");
      setRosterMusicianEmail("");
      setSelectedRosterGroupId(null);
      showAlert("success", "Success", "Production roster updated.");
      fetchTeamRoster(selectedTeam.id);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to update roster");
    } finally {
      setAddingRoster(false);
    }
  };

  const handleRemoveRosterEntry = async (entryId: string) => {
    if (!selectedTeam) return;

    try {
      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "remove_team_roster_entry",
          teamId: selectedTeam.id,
          rosterId: entryId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showAlert("success", "Removed", "Performer removed from production roster.");
      fetchTeamRoster(selectedTeam.id);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to remove performer");
    }
  };

  const handleProposeDeal = async () => {
    if (!dealTitle.trim()) {
      showAlert("warning", "Required", "Deal title is required");
      return;
    }
    if (!dealVenueEmail.trim()) {
      showAlert("warning", "Required", "Venue owner email is required");
      return;
    }
    if (Number(dealVenuePct) + Number(dealProductionPct) !== 100) {
      showAlert("error", "Error", "Revenue split must total 100%");
      return;
    }
    if (!selectedTeam) return;

    setProposingDeal(true);
    try {
      // Look up venue owner by email
      const { data: venueProfile, error: profileErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", dealVenueEmail.trim().toLowerCase())
        .maybeSingle();

      if (profileErr) throw profileErr;
      if (!venueProfile) {
        showAlert("warning", "Not Found", "No venue owner found with that email");
        setProposingDeal(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-deals", {
        body: {
          action: "create_venue_partnership_deal",
          title: dealTitle.trim(),
          production_team_id: selectedTeam.id,
          venue_owner_id: venueProfile.id,
          revenue_split_venue_pct: Number(dealVenuePct),
          revenue_split_production_pct: Number(dealProductionPct),
          fixed_fee: Number(dealFixedFee || 0),
          deposit_amount: Number(dealDeposit || 0),
          notes: dealNotes.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setProposeDealVisible(false);
      setDealTitle("");
      setDealVenueEmail("");
      setDealNotes("");
      setDealFixedFee("");
      setDealDeposit("");
      showAlert("success", "Proposed!", "Venue partnership deal proposed successfully.");
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to propose deal");
    } finally {
      setProposingDeal(false);
    }
  };

  const openTeamDetail = (team: Team) => {
    setSelectedTeam(team);
    fetchTeamMembers(team.id);
    fetchTeamRoster(team.id);
  };

  const closeTeamDetail = () => {
    if (routeTeamId) {
      router.back();
      return;
    }

    setSelectedTeam(null);
    setTeamMembers([]);
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

  // â”€â”€ Team Detail View â”€â”€
  if (selectedTeam) {
    const canManage =
      selectedTeam.member_role === "owner" ||
      selectedTeam.member_role === "manager";

    return (
      <View style={[styles.detailShell, { backgroundColor: isDark ? "rgba(2, 6, 23, 0.78)" : "rgba(15, 23, 42, 0.28)" }]}>
        <TouchableOpacity activeOpacity={1} style={styles.detailBackdrop} onPress={closeTeamDetail} />
        <View style={[styles.detailSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.detailHandle, { backgroundColor: isDark ? "#334155" : "#CBD5E1" }]} />
          <View style={styles.detailHeaderRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.detailEyebrow, { color: colors.textSecondary }]}>Production Team</Text>
              <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={1}>{selectedTeam.name}</Text>
            </View>
            <TouchableOpacity activeOpacity={1} onPress={closeTeamDetail} style={[styles.detailCloseBtn, { borderColor: colors.border, backgroundColor: colors.card }]}> 
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={[styles.detailScrollContent, { paddingBottom: contentBottomPadding }]}>
          {/* Team Info */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {selectedTeam.logo_url ? (
              <CachedImage
                uri={selectedTeam.logo_url}
                style={styles.teamLogo}
              />
            ) : (
              <View style={[styles.teamLogoPlaceholder, { backgroundColor: colors.border }]}>
                <Ionicons name="people" size={32} color={colors.textSecondary} />
              </View>
            )}
            <Text style={[styles.teamName, { color: colors.text }]}>
              {selectedTeam.name}
            </Text>
            {selectedTeam.description ? (
              <Text style={[styles.teamDesc, { color: colors.textSecondary }]}>
                {selectedTeam.description}
              </Text>
            ) : null}
            <View style={styles.roleBadgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: statusColor(selectedTeam.member_role) + "22" }]}>
                <Text style={[styles.roleBadgeText, { color: statusColor(selectedTeam.member_role) }]}>
                  {selectedTeam.member_role.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Members */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>
            {canManage && (
              <TouchableOpacity activeOpacity={1}
                onPress={() => setAddMemberModalVisible(true)}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingMembers ? (
            <View style={styles.loadingContainer}>
              <Skeleton width="100%" height={56} borderRadius={12} />
              <Skeleton width="100%" height={56} borderRadius={12} style={{ marginTop: 8 }} />
            </View>
          ) : teamMembers.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No members found
            </Text>
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
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {member.full_name}
                    </Text>
                    <Text style={[styles.memberRole, { color: statusColor(member.role) }]}>
                      {member.role}
                    </Text>
                  </View>
                  {canManage && member.role !== "owner" && member.user_id !== userId && (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => handleRemoveMember(member.user_id)}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}

          {/* Performer Roster */}
          <View style={[styles.sectionHeader, { marginTop: 20 }]}> 
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Performer Roster</Text>
            {canManage && (
              <TouchableOpacity activeOpacity={1}
                onPress={async () => {
                  setAddRosterModalVisible(true);
                  await fetchAccessibleGroups();
                }}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="albums-outline" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingRoster ? (
            <View style={styles.loadingContainer}>
              <Skeleton width="100%" height={56} borderRadius={12} />
              <Skeleton width="100%" height={56} borderRadius={12} style={{ marginTop: 8 }} />
            </View>
          ) : teamRoster.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No performers have been added yet.</Text>
          ) : (
            teamRoster.map((entry) => (
              <View
                key={entry.id}
                style={[styles.memberCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.memberRow}>
                  {entry.avatar_url ? (
                    <CachedImage uri={entry.avatar_url} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]}>
                      <Ionicons name={entry.entity_kind === "musician" ? "person" : "people"} size={18} color={colors.textSecondary} />
                    </View>
                  )}
                  <View style={styles.memberInfo}>
                    <Text style={[styles.memberName, { color: colors.text }]}>
                      {entry.display_name}
                    </Text>
                    <Text style={[styles.memberRole, { color: colors.textSecondary }]}>
                      {entry.entity_kind === "musician"
                        ? "Musician"
                        : entry.group_type === "duo"
                          ? "Duo"
                          : "Group"}
                    </Text>
                  </View>
                  {canManage && (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => handleRemoveRosterEntry(entry.id)}
                      style={styles.removeBtn}
                    >
                      <Ionicons name="close-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}

          {/* Propose a venue partnership deal */}
          {canManage && (
            <TouchableOpacity activeOpacity={1}
              style={[styles.dealsBtn, { backgroundColor: "#8B5CF6", marginTop: 20 }]}
              onPress={() => setProposeDealVisible(true)}
            >
              <Ionicons name="briefcase-outline" size={18} color="#fff" />
              <Text style={styles.dealsBtnText}>Propose Venue Deal</Text>
            </TouchableOpacity>
          )}

          {/* Navigate to deals */}
          <TouchableOpacity activeOpacity={1}
            style={[styles.dealsBtn, { backgroundColor: colors.primary, marginTop: canManage ? 10 : 20 }]}
            onPress={() => router.push("/bookings")}
          >
            <Ionicons name="briefcase-outline" size={18} color="#fff" />
            <Text style={styles.dealsBtnText}>View Deals</Text>
          </TouchableOpacity>

          </ScrollView>
        </View>

        {/* Add Member Modal */}
        {renderSheetModal({
          visible: addMemberModalVisible,
          onClose: () => setAddMemberModalVisible(false),
          title: "Add Team Member",
          subtitle: "Production Team",
          children: (
            <View style={styles.modalContent}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Member Email</Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                },
              ]}
              value={memberEmail}
              onChangeText={setMemberEmail}
              placeholder="user@example.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Role</Text>
            <View style={styles.roleSelector}>
              {(["member", "manager"] as const).map((r) => (
                <TouchableOpacity activeOpacity={1}
                  key={r}
                  onPress={() => setMemberRole(r)}
                  style={[
                    styles.roleOption,
                    {
                      backgroundColor: memberRole === r ? colors.primary : colors.card,
                      borderColor: memberRole === r ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleOptionText,
                      { color: memberRole === r ? "#fff" : colors.text },
                    ]}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity activeOpacity={1}
              onPress={handleAddMember}
              disabled={addingMember}
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: addingMember ? 0.6 : 1 }]}
            >
              {addingMember ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Add Member</Text>
              )}
            </TouchableOpacity>
            </View>
          ),
        })}

        {/* Add Roster Modal */}
        {renderSheetModal({
          visible: addRosterModalVisible,
          onClose: () => setAddRosterModalVisible(false),
          title: "Add Performer To Roster",
          subtitle: "Production Team",
          scrollable: true,
          children: (
            <View style={styles.modalContent}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Roster Type</Text>
                <View style={styles.roleSelector}>
                  {([
                    { id: "musician", label: "Musician" },
                    { id: "group", label: "Duo / Group" },
                  ] as const).map((option) => (
                    <TouchableOpacity activeOpacity={1}
                      key={option.id}
                      onPress={() => setRosterMode(option.id)}
                      style={[
                        styles.roleOption,
                        {
                          backgroundColor: rosterMode === option.id ? colors.primary : colors.card,
                          borderColor: rosterMode === option.id ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleOptionText,
                          { color: rosterMode === option.id ? "#fff" : colors.text },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {rosterMode === "musician" ? (
                  <>
                    <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Musician Email</Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.card,
                        },
                      ]}
                      value={rosterMusicianEmail}
                      onChangeText={setRosterMusicianEmail}
                      placeholder="musician@example.com"
                      placeholderTextColor={colors.textSecondary}
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </>
                ) : (
                  <>
                    <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Select Duo / Group</Text>
                    {accessibleGroups.length === 0 ? (
                      <Text style={[styles.emptyText, { color: colors.textSecondary, marginTop: 8 }]}>No eligible duo or group profiles found.</Text>
                    ) : (
                      <View style={{ gap: 10, marginTop: 8 }}>
                        {accessibleGroups.map((groupItem) => {
                          const isSelected = selectedRosterGroupId === groupItem.id;
                          return (
                            <TouchableOpacity activeOpacity={1}
                              key={groupItem.id}
                              onPress={() => setSelectedRosterGroupId(groupItem.id)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                borderWidth: 1.5,
                                borderColor: isSelected ? colors.primary : colors.border,
                                backgroundColor: isSelected
                                  ? isDark ? `${colors.primary}26` : `${colors.primary}14`
                                  : isDark ? "#374151" : "#F9FAFB",
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontFamily: "Poppins_600SemiBold", fontSize: 14 }}>
                                  {groupItem.name}
                                </Text>
                                <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 }}>
                                  {groupItem.group_type === "duo" ? "Duo" : "Group"}
                                </Text>
                              </View>
                              {isSelected && (
                                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}

                <TouchableOpacity activeOpacity={1}
                  onPress={handleAddRoster}
                  disabled={addingRoster}
                  style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: addingRoster ? 0.6 : 1, marginTop: 16 }]}
                >
                  {addingRoster ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>Add To Roster</Text>
                  )}
                </TouchableOpacity>
            </View>
          ),
        })}

        {/* Propose Deal Modal */}
        {renderSheetModal({
          visible: proposeDealVisible,
          onClose: () => setProposeDealVisible(false),
          title: "Propose Venue Partnership",
          subtitle: "Production Team",
          scrollable: true,
          children: (
            <View style={styles.modalContent}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Deal Title *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    value={dealTitle}
                    onChangeText={setDealTitle}
                    placeholder="e.g. Summer Concert Series"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Venue Owner Email *</Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    value={dealVenueEmail}
                    onChangeText={setDealVenueEmail}
                    placeholder="venue@example.com"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />

                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Venue Split %</Text>
                  <TextInput
                    value={dealVenuePct}
                    onChangeText={(v) => {
                      setDealVenuePct(v);
                      const num = Number(v);
                      if (!isNaN(num)) setDealProductionPct(String(100 - num));
                    }}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    placeholder="60"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Production Split %</Text>
                  <TextInput
                    value={dealProductionPct}
                    onChangeText={(v) => {
                      setDealProductionPct(v);
                      const num = Number(v);
                      if (!isNaN(num)) setDealVenuePct(String(100 - num));
                    }}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    placeholder="40"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Fixed Fee (₱)</Text>
                  <TextInput
                    value={dealFixedFee}
                    onChangeText={setDealFixedFee}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Deposit Amount (₱)</Text>
                  <TextInput
                    value={dealDeposit}
                    onChangeText={setDealDeposit}
                    keyboardType="numeric"
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Notes</Text>
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
                    value={dealNotes}
                    onChangeText={setDealNotes}
                    placeholder="Optional deal notes..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={3}
                  />

                  <TouchableOpacity activeOpacity={1}
                    onPress={handleProposeDeal}
                    disabled={proposingDeal}
                    style={[styles.submitBtn, { backgroundColor: "#8B5CF6", opacity: proposingDeal ? 0.6 : 1 }]}
                  >
                    {proposingDeal ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.submitBtnText}>Propose Deal</Text>
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
      </View>
    );
  }

  // â”€â”€ Teams List View â”€â”€
  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="Production Teams" onBackPress={routeTeamId ? () => router.back() : undefined} />
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
                ? "Create a team to start proposing venue partnership deals."
                : "Only production users can create a production team, but you can still open shared team links and deal details."}
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

          <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Description</Text>
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

          <TouchableOpacity activeOpacity={1}
            onPress={handleCreateTeam}
            disabled={creating}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Create Team</Text>
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
  detailShell: { flex: 1, justifyContent: "flex-end" },
  detailBackdrop: { flex: 1 },
  detailSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  detailHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  detailHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  detailEyebrow: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 20 },
  detailCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  detailScrollContent: { paddingHorizontal: 16, paddingBottom: 180 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 180 },
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
  card: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: "center", marginBottom: 20 },
  teamLogo: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  teamLogoPlaceholder: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  teamName: { fontFamily: "Poppins_600SemiBold", fontSize: 20 },
  teamDesc: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", marginTop: 4 },
  roleBadgeRow: { marginTop: 8 },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  roleBadgeText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  roleBadgeSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleBadgeSmallText: { fontFamily: "Poppins_500Medium", fontSize: 11 },

  // Members
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 16 },
  addBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 },
  addBtnText: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 13 },
  memberCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  memberRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  memberInfo: { flex: 1, marginLeft: 10 },
  memberName: { fontFamily: "Poppins_500Medium", fontSize: 14 },
  memberRole: { fontFamily: "Poppins_400Regular", fontSize: 12, textTransform: "capitalize" },
  removeBtn: { padding: 4 },

  // Buttons
  dealsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 12, marginTop: 20, gap: 8 },
  dealsBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
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
  modalContent: { paddingHorizontal: 4 },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 14 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  roleSelector: { flexDirection: "row", gap: 10 },
  roleOption: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  roleOptionText: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  submitBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  submitBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});
