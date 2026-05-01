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
import { useRequireAuth } from "../src/context/AuthContext";
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

export default function ProductionTeamScreen() {
  const { colors, isDark } = useTheme();
  const { isAuthenticated, loading: authLoading, userId } = useRequireAuth();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const routeTeamId = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;

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

  // Add member modal
  const [addMemberModalVisible, setAddMemberModalVisible] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "manager">("member");
  const [addingMember, setAddingMember] = useState(false);

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

  const fetchTeams = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.functions.invoke("manage-production", {
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
      await fetchTeamMembers(teamId);
    } catch (e: any) {
      showAlert("error", "Error", e.message || "Failed to fetch team");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchTeamMembers, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && isAuthenticated) {
        setLoading(true);
        if (routeTeamId) {
          void fetchTeamById(routeTeamId);
        } else {
          fetchTeams();
        }
      }
    }, [authLoading, fetchTeamById, fetchTeams, isAuthenticated, routeTeamId])
  );

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      showAlert("warning", "Required", "Team name is required");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-production", {
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

      const { data, error } = await supabase.functions.invoke("manage-production", {
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
      const { data, error } = await supabase.functions.invoke("manage-production", {
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
  const isCreateTeamReady = newTeamName.trim().length > 0;
  const isAddMemberReady = memberEmail.trim().length > 0;
  const openTeamDetail = (team: Team) => {
    setSelectedTeam(team);
    fetchTeamMembers(team.id);
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

  // ── Team Detail View ──
  if (selectedTeam) {
    const canManage =
      selectedTeam.member_role === "owner" ||
      selectedTeam.member_role === "manager";

    return (
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title={selectedTeam.name} />
        <ScrollView contentContainerStyle={styles.scrollContent}>
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

          {/* Back button */}
          <TouchableOpacity activeOpacity={1}
            style={[styles.backBtn, { borderColor: colors.border }]}
            onPress={closeTeamDetail}
          >
            <Text style={[styles.backBtnText, { color: colors.text }]}>Back to Teams</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Add Member Modal */}
        <RNModal
          visible={addMemberModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAddMemberModalVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
            <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: "88%", maxWidth: 420 }}>
              <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 17, color: colors.text, marginBottom: 14 }}>Add Team Member</Text>
          <View style={styles.modalContent}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Member Email</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
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
              disabled={addingMember || !isAddMemberReady}
              style={[styles.submitBtn, { backgroundColor: isAddMemberReady ? colors.primary : colors.border, opacity: addingMember ? 0.6 : 1 }]}
            >
              {addingMember ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: isAddMemberReady ? "#FFFFFF" : colors.textSecondary }]}>Add Member</Text>
              )}
            </TouchableOpacity>
          </View>
              <TouchableOpacity activeOpacity={1} onPress={() => setAddMemberModalVisible(false)} style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium" }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </RNModal>
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

  // ── Teams List View ──
  return (
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title="My Production" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No production teams yet</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Create a production team to manage members and rosters.
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

      {/* FAB to create team */}
      <TouchableOpacity activeOpacity={1}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create Team Modal */}
      <RNModal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: "88%", maxWidth: 420 }}>
            <Text style={{ fontFamily: "Poppins_600SemiBold", fontSize: 17, color: colors.text, marginBottom: 14 }}>Create Production Team</Text>
        <View style={styles.modalContent}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>Team Name *</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={newTeamName}
            onChangeText={setNewTeamName}
            placeholder="e.g. Events Pro Team"
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            value={newTeamDescription}
            onChangeText={setNewTeamDescription}
            placeholder="Brief description of the team..."
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={3}
          />

          <TouchableOpacity activeOpacity={1}
            onPress={handleCreateTeam}
            disabled={creating || !isCreateTeamReady}
            style={[styles.submitBtn, { backgroundColor: isCreateTeamReady ? colors.primary : colors.border, opacity: creating ? 0.6 : 1 }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.submitBtnText, { color: isCreateTeamReady ? "#FFFFFF" : colors.textSecondary }]}>Create Team</Text>
            )}
          </TouchableOpacity>
        </View>
            <TouchableOpacity activeOpacity={1} onPress={() => setCreateModalVisible(false)} style={{ marginTop: 8, alignItems: "center" }}>
              <Text style={{ color: colors.textSecondary, fontFamily: "Poppins_500Medium" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </RNModal>

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
  teamActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", padding: 14, borderRadius: 12, marginTop: 20, gap: 8 },
  teamActionBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  backBtn: { alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 10 },
  backBtnText: { fontFamily: "Poppins_500Medium", fontSize: 14 },

  // FAB
  fab: { position: "absolute", bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },

  // Modal
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



