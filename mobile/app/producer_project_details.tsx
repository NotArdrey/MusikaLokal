import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import Skeleton from "../src/components/Skeleton";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const scale = (size: number) => Math.max((SCREEN_WIDTH / 375) * size, size * 0.85);
const moderateScale = (size: number, factor = 0.3) => {
  const scaled = scale(size);
  return size + (scaled - size) * factor;
};

export default function ProducerProjectDetailsScreen() {
  const { colors } = useTheme();
  const { session, userId, userRole } = useAuth();
  const { project_id } = useLocalSearchParams();
  const isProducer = userRole === "producer";

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  // Apply modal
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyRoleId, setApplyRoleId] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteeId, setInviteeId] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviting, setInviting] = useState(false);

  const isOwner = project?.owner_id === userId;

  const fetchProject = useCallback(async () => {
    if (!project_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "get_project_details", project_id },
      });
      if (data?.data) setProject(data.data);
    } catch (e: any) {
      console.error("ProjectDetails fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [project_id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const handlePublish = async () => {
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "publish_project", project_id },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Published", message: "Project is now visible to musicians." });
        fetchProject();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to publish" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleArchive = async () => {
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "archive_project", project_id },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Archived", message: "Project has been archived." });
        fetchProject();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleApply = async () => {
    if (!applyRoleId) {
      setAlert({ type: "warning", title: "Select Role", message: "Please select a role to apply for." });
      return;
    }
    setApplying(true);
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: {
          action: "apply_to_project",
          project_id,
          role_id: applyRoleId,
          message: applyMessage.trim() || null,
        },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Applied!", message: "Your application has been submitted." });
        setShowApplyModal(false);
        setApplyMessage("");
        setApplyRoleId(null);
        fetchProject();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to apply" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setApplying(false);
    }
  };

  const handleReviewApplication = async (applicationId: string, decision: "accepted" | "rejected") => {
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "review_application", application_id: applicationId, decision },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: decision === "accepted" ? "Accepted" : "Rejected", message: `Application ${decision}.` });
        fetchProject();
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    }
  };

  const handleInvite = async () => {
    if (!inviteeId.trim()) {
      setAlert({ type: "warning", title: "Missing User", message: "Please enter a musician user ID." });
      return;
    }
    setInviting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: {
          action: "invite_musician",
          project_id,
          invitee_id: inviteeId.trim(),
          role_id: inviteRoleId || null,
          message: inviteMessage.trim() || null,
        },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Invited", message: "Musician has been invited." });
        setShowInviteModal(false);
        setInviteeId("");
        setInviteMessage("");
        setInviteRoleId(null);
        fetchProject();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to invite" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Project Details" onBackPress={() => router.back()} />
        <View style={styles.loadingWrap}>
          <Skeleton width={SCREEN_WIDTH - 32} height={200} style={{ borderRadius: 12, marginBottom: 16 }} />
          <Skeleton width={SCREEN_WIDTH - 32} height={40} style={{ borderRadius: 8, marginBottom: 12 }} />
          <Skeleton width={SCREEN_WIDTH * 0.6} height={20} style={{ borderRadius: 6, marginBottom: 12 }} />
        </View>
        <Navbar />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Project Details" onBackPress={() => router.back()} />
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: moderateScale(15) }}>Project not found</Text>
        </View>
        <Navbar />
      </View>
    );
  }

  const openRoles = project.roles?.filter((r: any) => r.status === "open") || [];
  const pendingApps = project.applications?.filter((a: any) => a.status === "pending") || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={project.title} onBackPress={() => router.back()} />

      <ScrollView style={styles.content}>
        {/* Cover image */}
        {project.cover_image_url ? (
          <CachedImage uri={project.cover_image_url } style={styles.coverImage} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="musical-notes" size={48} color={colors.primary} />
          </View>
        )}

        {/* Status & Meta */}
        <View style={styles.section}>
          <View style={styles.metaRow}>
            <View style={[styles.statusBadge, {
              backgroundColor: project.status === "published" ? "#22c55e20" : project.status === "archived" ? "#ef444420" : "#f59e0b20"
            }]}>
              <Text style={{
                color: project.status === "published" ? "#22c55e" : project.status === "archived" ? "#ef4444" : "#f59e0b",
                fontSize: moderateScale(12), fontWeight: "600"
              }}>
                {project.status}
              </Text>
            </View>
            {project.genre && (
              <Text style={[styles.genre, { color: colors.textSecondary }]}>{project.genre}</Text>
            )}
            {project.location && (
              <Text style={[styles.genre, { color: colors.textSecondary }]}>
                <Ionicons name="location-outline" size={12} /> {project.location}
              </Text>
            )}
          </View>
        </View>

        {/* Description */}
        {project.description && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>{project.description}</Text>
          </View>
        )}

        {/* Roles */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Roles ({project.roles?.length || 0})</Text>
          {project.roles?.map((role: any) => (
            <View key={role.id} style={[styles.roleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.roleName, { color: colors.text }]}>{role.instrument || role.title || "Role"}</Text>
                {role.description && (
                  <Text style={[styles.roleDesc, { color: colors.textSecondary }]} numberOfLines={2}>{role.description}</Text>
                )}
                <Text style={[styles.roleStatus, {
                  color: role.status === "filled" ? "#22c55e" : role.status === "open" ? colors.primary : colors.textSecondary
                }]}>
                  {role.status} {role.filled_by_name ? `• ${role.filled_by_name}` : ""}
                </Text>
              </View>
              {!isOwner && role.status === "open" && (
                <TouchableOpacity
                  style={[styles.applyRoleBtn, { borderColor: colors.primary }]}
                  onPress={() => { setApplyRoleId(role.id); setShowApplyModal(true); }}
                >
                  <Text style={{ color: colors.primary, fontSize: moderateScale(12), fontWeight: "600" }}>Apply</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        {/* Owner actions */}
        {isOwner && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions</Text>
            <View style={styles.actionRow}>
              {project.status === "draft" && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#22c55e" }]} onPress={handlePublish}>
                  <Ionicons name="rocket" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Publish</Text>
                </TouchableOpacity>
              )}
              {project.status === "published" && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef4444" }]} onPress={handleArchive}>
                  <Ionicons name="archive" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Archive</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => setShowInviteModal(true)}
              >
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Pending Applications (owner view) */}
        {isOwner && pendingApps.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Pending Applications ({pendingApps.length})
            </Text>
            {pendingApps.map((app: any) => (
              <View key={app.id} style={[styles.appCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CachedImage
                  uri={app.applicant_avatar || "https://via.placeholder.com/40" }
                  style={styles.appAvatar}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.appName, { color: colors.text }]}>{app.applicant_name}</Text>
                  <Text style={[styles.appRole, { color: colors.textSecondary }]}>
                    Applied for: {app.role_title || "Unspecified role"}
                  </Text>
                  {app.message && (
                    <Text style={[styles.appMsg, { color: colors.textSecondary }]} numberOfLines={2}>{app.message}</Text>
                  )}
                </View>
                <View style={styles.appActions}>
                  <TouchableOpacity
                    style={[styles.appActionBtn, { backgroundColor: "#22c55e" }]}
                    onPress={() => handleReviewApplication(app.id, "accepted")}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.appActionBtn, { backgroundColor: "#ef4444" }]}
                    onPress={() => handleReviewApplication(app.id, "rejected")}
                  >
                    <Ionicons name="close" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Apply Modal */}
      <Modal visible={showApplyModal} transparent animationType="slide" onRequestClose={() => setShowApplyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Apply to Project</Text>
              <TouchableOpacity onPress={() => setShowApplyModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Introduce yourself..."
              placeholderTextColor={colors.textSecondary}
              value={applyMessage}
              onChangeText={setApplyMessage}
              multiline
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: applying ? 0.6 : 1 }]}
              onPress={handleApply}
              disabled={applying}
            >
              {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Application</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invite Modal */}
      <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => setShowInviteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Invite Musician</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Musician User ID</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Enter user ID"
              placeholderTextColor={colors.textSecondary}
              value={inviteeId}
              onChangeText={setInviteeId}
            />
            {openRoles.length > 0 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.text }]}>For Role (optional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {openRoles.map((r: any) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[
                        styles.rolePill,
                        { borderColor: inviteRoleId === r.id ? colors.primary : colors.border,
                          backgroundColor: inviteRoleId === r.id ? colors.primary + "20" : "transparent" },
                      ]}
                      onPress={() => setInviteRoleId(inviteRoleId === r.id ? null : r.id)}
                    >
                      <Text style={{ color: inviteRoleId === r.id ? colors.primary : colors.textSecondary, fontSize: moderateScale(12) }}>
                        {r.instrument || r.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={[styles.inputLabel, { color: colors.text }]}>Message (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Add a personal message..."
              placeholderTextColor={colors.textSecondary}
              value={inviteMessage}
              onChangeText={setInviteMessage}
              multiline
            />
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: inviting ? 0.6 : 1 }]}
              onPress={handleInvite}
              disabled={inviting}
            >
              {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Send Invite</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {alert && (
        <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />
      )}

      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
  loadingWrap: { flex: 1, padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverImage: { width: "100%", height: 200, borderRadius: 12, marginTop: 12 },
  coverPlaceholder: { width: "100%", height: 200, borderRadius: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  section: { marginTop: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  genre: { fontSize: moderateScale(12) },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: "700", marginBottom: 12 },
  description: { fontSize: moderateScale(14), lineHeight: 22 },
  roleCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  roleName: { fontSize: moderateScale(14), fontWeight: "600" },
  roleDesc: { fontSize: moderateScale(12), marginTop: 2 },
  roleStatus: { fontSize: moderateScale(11), marginTop: 4, fontWeight: "500" },
  applyRoleBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: "#fff", fontSize: moderateScale(13), fontWeight: "600" },
  appCard: { flexDirection: "row", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8, alignItems: "center" },
  appAvatar: { width: 40, height: 40, borderRadius: 20 },
  appName: { fontSize: moderateScale(13), fontWeight: "600" },
  appRole: { fontSize: moderateScale(11), marginTop: 2 },
  appMsg: { fontSize: moderateScale(11), marginTop: 4, fontStyle: "italic" },
  appActions: { flexDirection: "column", gap: 6 },
  appActionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalContent: { padding: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" as const },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  inputLabel: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  rolePill: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
});
