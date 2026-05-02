import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import BottomModal from "../src/components/BottomModal";
import CachedImage from "../src/components/CachedImage";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import Header from "../src/components/header";
import Modal from "../src/components/modal";
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
  const [activeTab, setActiveTab] = useState<"About" | "Members" | "Reviews">("About");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [fireModalVisible, setFireModalVisible] = useState(false);
  const [memberToFire, setMemberToFire] = useState<TeamMember | null>(null);
  const [fireReason, setFireReason] = useState("");
  const [firingMember, setFiringMember] = useState(false);

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
    <BottomModal
      visible={visible}
      onClose={onClose}
      closeOnBackdropPress
    >
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
    </BottomModal>
  );

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
      setActiveTab("About");
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

    if (!newTeamDescription.trim()) {
      showAlert("warning", "Required", "Description is required");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-production", {
        body: {
          action: "create_production_team",
          name: newTeamName.trim(),
          description: newTeamDescription.trim(),
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
  const isCreateTeamReady = newTeamName.trim().length > 0 && newTeamDescription.trim().length > 0;

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
  };

  const handleRemoveMember = async () => {
    if (!selectedTeam || !memberToFire || firingMember) return;
    const reason = fireReason.trim();
    if (!reason) {
      showAlert("warning", "Reason Required", "Please provide a reason before firing this member.");
      return;
    }

    setFiringMember(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-production", {
        body: {
          action: "remove_team_member",
          team_id: selectedTeam.id,
          user_id: memberToFire.user_id,
          reason,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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
    const tabs: Array<"About" | "Members" | "Reviews"> = ["About", "Members", "Reviews"];
    const canManage =
      selectedTeam.member_role === "owner" ||
      selectedTeam.member_role === "manager";

    return (
      <>
        <View style={[styles.flex1, { backgroundColor: colors.background }]}> 
          <Header title="Manage Production" onBackPress={closeTeamDetail} />

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.detailScrollContent, { paddingBottom: contentBottomPadding }]}
          >
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

          <View style={styles.contentContainer}>
            {activeTab === "About" && (
              <View style={styles.aboutContainer}>
                <Text style={[styles.aboutText, { color: colors.textSecondary }]}> 
                  {selectedTeam.description || "No description available."}
                </Text>

                <View style={styles.statsRow}>
                  <View style={[styles.infoCard, { backgroundColor: colors.surface }]}> 
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Members</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}> 
                      {loadingMembers ? "-" : teamMembers.length}
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
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Members</Text>
                </View>

                {loadingMembers ? (
                  <View style={styles.loadingContainer}>
                    <Skeleton width="100%" height={56} borderRadius={12} />
                    <Skeleton width="100%" height={56} borderRadius={12} style={{ marginTop: 8 }} />
                  </View>
                ) : teamMembers.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No members found</Text>
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

            {activeTab === "Reviews" && (
              <View style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.primary} />
                <Text style={[styles.reviewTitle, { color: colors.text }]}>No reviews yet</Text>
                <Text style={[styles.reviewDescription, { color: colors.textSecondary }]}> 
                  Production team reviews will appear here once this section is available.
                </Text>
              </View>
            )}
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
          confirmDisabled={!fireReason.trim() || firingMember}
          loading={firingMember}
          loadingMessage="Removing member and sending notification..."
        />

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
    <View style={[styles.flex1, { backgroundColor: colors.background }]}>
      <Header title={routeTeamId ? "Manage Production" : "Production Teams"} onBackPress={routeTeamId ? () => router.back() : undefined} />
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
  statsRow: {
    flexDirection: "row",
    gap: 16,
  },
  infoCard: {
    flex: 1,
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
  modalContent: { paddingHorizontal: 4 },
  inputLabel: { fontFamily: "Poppins_500Medium", fontSize: 13, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Poppins_400Regular", fontSize: 14 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  submitBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  submitBtnText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});



