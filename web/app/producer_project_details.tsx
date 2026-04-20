import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import CachedImage from "../src/components/CachedImage";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import CustomAlert, { AlertType } from "../src/components/CustomAlert";
import { useAuth } from "../src/context/AuthContext";
import { showTopToast } from "../src/context/TopToastContext";
import { useTheme } from "../src/context/ThemeContext";

const moderateScale = (size: number, factor = 0.3) => {
  const w = Math.min(Dimensions.get("window").width, 600);
  const scaled = Math.max((w / 375) * size, size * 0.85);
  return size + (scaled - size) * factor;
};

export default function ProducerProjectDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, userRole } = useAuth();
  const { project_id } = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyRoleId, setApplyRoleId] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);

  // Musician search for invite
  const [musicianSearch, setMusicianSearch] = useState("");
  const [musicianResults, setMusicianResults] = useState<any[]>([]);
  const [searchingMusicians, setSearchingMusicians] = useState(false);
  const [selectedMusician, setSelectedMusician] = useState<any>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRoleId, setInviteRoleId] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviting, setInviting] = useState(false);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;
  const isOwner = project?.owner_id === userId;

  const fetchProject = useCallback(async () => {
    if (!project_id) return;
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "get_project_details", project_id } });
      if (data?.data) setProject(data.data);
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); }
  }, [project_id]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  const handlePublish = async () => {
    const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "publish_project", project_id } });
    if (data?.success) { showTopToast({ type: "success", title: "Published", message: "Project is now visible." }); fetchProject(); }
  };

  const handleArchive = async () => {
    const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "archive_project", project_id } });
    if (data?.success) { showTopToast({ type: "success", title: "Archived", message: "Project archived." }); fetchProject(); }
  };

  const handleApply = async () => {
    if (!applyRoleId) { setAlert({ type: "warning", title: "Select Role", message: "Please select a role." }); return; }
    setApplying(true);
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "apply_to_project", project_id, role_id: applyRoleId, cover_message: applyMessage.trim() || null } });
      if (data?.success) { showTopToast({ type: "success", title: "Applied!", message: "Application submitted." }); setShowApplyModal(false); fetchProject(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setApplying(false); }
  };

  const handleWithdrawApplication = async (applicationId: string) => {
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "withdraw_application", application_id: applicationId } });
      if (data?.success) { showTopToast({ type: "success", title: "Withdrawn", message: "Application withdrawn." }); fetchProject(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
  };

  const handleRespondToInvite = async (inviteId: string, decision: "accepted" | "rejected") => {
    try {
      const action = decision === "accepted" ? "accept_invite" : "reject_invite";
      const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action, invite_id: inviteId } });
      if (data?.success) { showTopToast({ type: "success", title: decision === "accepted" ? "Accepted" : "Declined", message: `Invite ${decision}.` }); fetchProject(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
  };

  const handleSearchMusicians = async () => {
    if (!musicianSearch.trim()) return;
    setSearchingMusicians(true);
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "search_musicians", query: musicianSearch.trim() } });
      setMusicianResults(data?.data || []);
    } catch (e) { console.error(e); }
    finally { setSearchingMusicians(false); }
  };

  const handleInvite = async () => {
    if (!selectedMusician || !inviteRoleId) { setAlert({ type: "warning", title: "Missing", message: "Select a musician and role." }); return; }
    setInviting(true);
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "invite_talent", project_id, invitee_id: selectedMusician.id, role_id: inviteRoleId, message: inviteMessage.trim() || null } });
      if (data?.success) { showTopToast({ type: "success", title: "Invited!", message: "Invitation sent." }); setShowInviteModal(false); setSelectedMusician(null); setMusicianSearch(""); setMusicianResults([]); fetchProject(); }
      else setAlert({ type: "error", title: "Error", message: data?.error || "Failed" });
    } catch (e: any) { setAlert({ type: "error", title: "Error", message: e.message }); }
    finally { setInviting(false); }
  };

  const handleReviewApplication = async (appId: string, decision: "accepted" | "rejected") => {
    const { data } = await supabase.functions.invoke("manage-producer-network", { body: { action: "review_application", application_id: appId, decision } });
    if (data?.success) { showTopToast({ type: "success", title: decision === "accepted" ? "Accepted" : "Rejected", message: `Application ${decision}.` }); fetchProject(); }
  };

  if (loading) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Project Details" onBackPress={() => router.back()} /><ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} /><Navbar /></View>;
  if (!project) return <View style={[styles.container, { backgroundColor: bg }]}><Header title="Project Details" onBackPress={() => router.back()} /><View style={styles.centered}><Text style={{ color: colors.textSecondary }}>Project not found</Text></View><Navbar /></View>;

  const openRoles = project.roles?.filter((r: any) => r.filled_slots < r.max_slots) || [];
  const pendingApps = project.applications?.filter((a: any) => a.status === "pending") || [];
  const myApplication = project.applications?.find((a: any) => a.applicant_id === userId);
  const myInvite = project.invites?.find((i: any) => i.invitee_id === userId);

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title={project.title} onBackPress={() => router.back()} />
      <ScrollView style={styles.content} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 800, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          {project.cover_image_url ? <CachedImage uri={project.cover_image_url } style={styles.cover} /> : (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.primary + "15" }]}><Ionicons name="musical-notes" size={48} color={colors.primary} /></View>
          )}
          <View style={styles.section}>
            <View style={styles.metaRow}>
              <View style={[styles.badge, { backgroundColor: project.status === "published" ? "#22c55e20" : "#f59e0b20" }]}>
                <Text style={{ color: project.status === "published" ? "#22c55e" : "#f59e0b", fontSize: moderateScale(12) }}>{project.status}</Text>
              </View>
              {project.genre && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12) }}>{project.genre}</Text>}
              {project.location && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12) }}>{project.location}</Text>}
            </View>
          </View>
          {project.description && <View style={styles.section}><Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text><Text style={{ color: colors.textSecondary, fontSize: moderateScale(14), lineHeight: 22 }}>{project.description}</Text></View>}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Roles ({project.roles?.length || 0})</Text>
            {project.roles?.map((role: any) => (
              <View key={role.id} style={[styles.roleCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: moderateScale(14), fontWeight: "600" }}>{role.instrument || role.title || "Role"}</Text>
                  <Text style={{ color: role.status === "filled" ? "#22c55e" : colors.primary, fontSize: moderateScale(11), marginTop: 4 }}>{role.status}</Text>
                </View>
                {!isOwner && role.status === "open" && (
                  <TouchableOpacity style={[styles.applyBtn, { borderColor: colors.primary }]} onPress={() => { setApplyRoleId(role.id); setShowApplyModal(true); }}>
                    <Text style={{ color: colors.primary, fontSize: moderateScale(12), fontWeight: "600" }}>Apply</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
          {isOwner && (
            <View style={[styles.section, { flexDirection: "row", gap: 10 }]}>
              {project.status === "draft" && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#22c55e" }]} onPress={handlePublish}><Text style={styles.actionBtnText}>Publish</Text></TouchableOpacity>}
              {project.status === "published" && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef4444" }]} onPress={handleArchive}><Text style={styles.actionBtnText}>Archive</Text></TouchableOpacity>}
              {openRoles.length > 0 && <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => setShowInviteModal(true)}><Text style={styles.actionBtnText}>Invite Musician</Text></TouchableOpacity>}
            </View>
          )}

          {/* Musician: Your Application */}
          {!isOwner && myApplication && (
            <View style={[styles.section, { backgroundColor: cardBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: borderCol }]}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: moderateScale(14), marginBottom: 6 }}>Your Application</Text>
              <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12) }}>Status: {myApplication.status}</Text>
              {myApplication.status === "pending" && (
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef4444", marginTop: 10 }]} onPress={() => handleWithdrawApplication(myApplication.id)}>
                  <Text style={styles.actionBtnText}>Withdraw</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Musician: Invited */}
          {!isOwner && myInvite && myInvite.status === "pending" && (
            <View style={[styles.section, { backgroundColor: cardBg, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: borderCol }]}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: moderateScale(14), marginBottom: 6 }}>You're Invited!</Text>
              {myInvite.expires_at && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(11), marginBottom: 8 }}>Expires: {new Date(myInvite.expires_at).toLocaleDateString()}</Text>}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#22c55e" }]} onPress={() => handleRespondToInvite(myInvite.id, "accepted")}><Text style={styles.actionBtnText}>Accept</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: "#ef4444" }]} onPress={() => handleRespondToInvite(myInvite.id, "rejected")}><Text style={styles.actionBtnText}>Decline</Text></TouchableOpacity>
              </View>
            </View>
          )}
          {isOwner && pendingApps.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Pending Applications ({pendingApps.length})</Text>
              {pendingApps.map((app: any) => (
                <View key={app.id} style={[styles.appCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "600" }}>{app.applicant?.full_name || app.applicant_name || "Applicant"}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: moderateScale(11) }}>{app.role_title || "Unspecified"}</Text>
                    {(app.cover_message || app.message) && <Text style={{ color: colors.textSecondary, fontSize: moderateScale(11), marginTop: 2 }} numberOfLines={2}>{app.cover_message || app.message}</Text>}
                  </View>
                  <TouchableOpacity style={[styles.reviewBtn, { backgroundColor: "#22c55e" }]} onPress={() => handleReviewApplication(app.id, "accepted")}><Ionicons name="checkmark" size={16} color="#fff" /></TouchableOpacity>
                  <TouchableOpacity style={[styles.reviewBtn, { backgroundColor: "#ef4444" }]} onPress={() => handleReviewApplication(app.id, "rejected")}><Ionicons name="close" size={16} color="#fff" /></TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      <Modal visible={showApplyModal} transparent animationType="slide" onRequestClose={() => setShowApplyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontSize: moderateScale(17), fontWeight: "700" }}>Apply to Project</Text>
              <TouchableOpacity onPress={() => setShowApplyModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), marginBottom: 8 }}>Select Role:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {openRoles.map((r: any) => (
                <TouchableOpacity key={r.id} onPress={() => setApplyRoleId(r.id)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: applyRoleId === r.id ? colors.primary : colors.inputBackground }}>
                  <Text style={{ color: applyRoleId === r.id ? "#fff" : colors.text, fontSize: moderateScale(12) }}>{r.instrument || r.title || "Role"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), marginBottom: 4 }}>Cover Message:</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg, minHeight: 80, textAlignVertical: "top" }]} placeholder="Introduce yourself..." placeholderTextColor={colors.textSecondary} value={applyMessage} onChangeText={setApplyMessage} multiline />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: applying || !applyRoleId ? 0.6 : 1 }]} onPress={handleApply} disabled={applying || !applyRoleId}>
              {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Application</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invite Musician Modal */}
      <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => setShowInviteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontSize: moderateScale(17), fontWeight: "700" }}>Invite Musician</Text>
              <TouchableOpacity onPress={() => { setShowInviteModal(false); setSelectedMusician(null); setMusicianResults([]); setMusicianSearch(""); }}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), marginBottom: 4 }}>Search by name or email:</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg, flex: 1 }]} placeholder="Name or email" placeholderTextColor={colors.textSecondary} value={musicianSearch} onChangeText={setMusicianSearch} />
              <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }} onPress={handleSearchMusicians} disabled={searchingMusicians}>
                {searchingMusicians ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
            {selectedMusician && (
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primary + "20", borderRadius: 8, padding: 8, marginBottom: 10, gap: 8 }}>
                <Text style={{ color: colors.text, flex: 1 }}>{selectedMusician.full_name}</Text>
                <TouchableOpacity onPress={() => setSelectedMusician(null)}><Ionicons name="close-circle" size={18} color={colors.textSecondary} /></TouchableOpacity>
              </View>
            )}
            {!selectedMusician && musicianResults.length > 0 && (
              <ScrollView style={{ maxHeight: 140, marginBottom: 10 }}>
                {musicianResults.map((m: any) => (
                  <TouchableOpacity key={m.id} style={{ paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderColor: borderCol }} onPress={() => { setSelectedMusician(m); setMusicianResults([]); }}>
                    <Text style={{ color: colors.text }}>{m.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <Text style={{ color: colors.textSecondary, fontSize: moderateScale(12), marginBottom: 4 }}>Select Role:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {openRoles.map((r: any) => (
                <TouchableOpacity key={r.id} onPress={() => setInviteRoleId(r.id)} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: inviteRoleId === r.id ? colors.primary : colors.inputBackground }}>
                  <Text style={{ color: inviteRoleId === r.id ? "#fff" : colors.text, fontSize: moderateScale(12) }}>{r.instrument || r.title || "Role"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg, minHeight: 60, textAlignVertical: "top" }]} placeholder="Optional message..." placeholderTextColor={colors.textSecondary} value={inviteMessage} onChangeText={setInviteMessage} multiline />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: inviting || !selectedMusician || !inviteRoleId ? 0.6 : 1 }]} onPress={handleInvite} disabled={inviting || !selectedMusician || !inviteRoleId}>
              {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Send Invite</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      <Navbar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const },
  modalBox: { borderRadius: 16, padding: 24, width: "90%" as any, maxWidth: 480, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  content: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", height: 200, borderRadius: 12, marginTop: 12 },
  coverPlaceholder: { width: "100%", height: 200, borderRadius: 12, marginTop: 12, alignItems: "center", justifyContent: "center" },
  section: { marginTop: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  sectionTitle: { fontSize: moderateScale(16), fontWeight: "700", marginBottom: 12 },
  roleCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  applyBtn: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  actionBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: "#fff", fontWeight: "600" },
  appCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8, gap: 8 },
  reviewBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  submitBtn: { alignItems: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
});
