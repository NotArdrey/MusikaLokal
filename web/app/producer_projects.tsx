import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
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
import GuestSignInGate from "../src/components/GuestSignInGate";
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

type Tab = "browse" | "my_projects" | "applications" | "invites";

export default function ProducerProjectsScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, userRole, isGuest } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === "web" && width >= 768;
  const isProducer = userRole === "producer";

  const [tab, setTab] = useState<Tab>(isProducer ? "my_projects" : "browse");
  const [projects, setProjects] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const bg = isWebDesktop ? (isDark ? "#0F172A" : "#F1F5F9") : colors.background;
  const cardBg = isWebDesktop ? (isDark ? "#1E293B" : "#FFFFFF") : colors.surface;
  const borderCol = isWebDesktop ? (isDark ? "#334155" : "#E2E8F0") : colors.border;

  const fetchData = useCallback(async () => {
    if (!session) return;
    try {
      const { data: browseData } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "browse_projects", limit: 50 },
      });
      if (browseData?.data) setProjects(browseData.data);
      if (isProducer) {
        const { data: myData } = await supabase.functions.invoke("manage-producer-network", {
          body: { action: "list_my_projects" },
        });
        if (myData?.data) setMyProjects(myData.data);
      }
      const { data: matchData } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "list_matches", role: isProducer ? "producer" : "musician" },
      });
      if (matchData?.data) {
        setApplications(matchData.data.filter((m: any) => m.match_type === "application"));
        setInvites(matchData.data.filter((m: any) => m.match_type === "invite"));
      }
    } catch (e: any) {
      console.error("ProducerProjects fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, isProducer]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleCreateProject = async () => {
    if (!newTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Please enter a project title." });
      return;
    }
    setCreating(true);
    try {
      const { data } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "create_project", title: newTitle.trim(), description: newDescription.trim() || null, genre: newGenre.trim() || null, location: newLocation.trim() || null },
      });
      if (data?.success) {
        showTopToast({ type: "success", title: "Project Created", message: "Your project has been created as a draft." });
        setShowCreateModal(false);
        setNewTitle(""); setNewDescription(""); setNewGenre(""); setNewLocation("");
        fetchData();
      } else {
        setAlert({ type: "error", title: "Error", message: data?.error || "Failed to create project" });
      }
    } catch (e: any) {
      setAlert({ type: "error", title: "Error", message: e.message });
    } finally {
      setCreating(false);
    }
  };

  const filteredProjects = projects.filter((p) =>
    !searchQuery || p.title?.toLowerCase().includes(searchQuery.toLowerCase()) || p.genre?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderProjectCard = (item: any) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.card, { backgroundColor: cardBg, borderColor: borderCol, maxWidth: isWebDesktop ? 600 : undefined }]}
      onPress={() => router.push({ pathname: "/producer_project_details", params: { project_id: item.id } })}
    >
      {item.cover_image_url ? (
        <CachedImage uri={item.cover_image_url } style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.primary + "20" }]}>
          <Ionicons name="musical-notes" size={32} color={colors.primary} />
        </View>
      )}
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
          {item.owner_name || "Producer"} {item.genre ? `• ${item.genre}` : ""}
        </Text>
        <View style={styles.cardStats}>
          <Text style={[styles.cardStat, { color: colors.textSecondary }]}>
            {item.filled_roles || 0}/{item.total_roles || 0} roles
          </Text>
          {item.pending_applications > 0 && (
            <Text style={[styles.cardStat, { color: colors.primary }]}>{item.pending_applications} pending</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === "published" ? "#22c55e20" : "#f59e0b20" }]}>
          <Text style={{ color: item.status === "published" ? "#22c55e" : "#f59e0b", fontSize: moderateScale(11) }}>{item.status}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Header title="Producer Projects" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to browse and manage producer projects" />
        
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = isProducer
    ? [{ key: "my_projects", label: "My Projects" }, { key: "browse", label: "Browse" }, { key: "applications", label: "Applications" }, { key: "invites", label: "Invites" }]
    : [{ key: "browse", label: "Browse" }, { key: "applications", label: "My Applications" }, { key: "invites", label: "Invites" }];

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Header title="Producer Projects" onBackPress={() => router.back()} />
      <View style={[styles.tabRow, { borderBottomColor: borderCol }]}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.content} contentContainerStyle={isWebDesktop ? { alignItems: "center" } : undefined} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} />}>
        <View style={isWebDesktop ? { width: "100%", maxWidth: 800, paddingHorizontal: 16 } : { paddingHorizontal: 16 }}>
          {tab === "browse" && (
            <View style={[styles.searchBar, { backgroundColor: cardBg, borderColor: borderCol }]}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput style={[styles.searchInput, { color: colors.text }]} placeholder="Search projects..." placeholderTextColor={colors.textSecondary} value={searchQuery} onChangeText={setSearchQuery} />
            </View>
          )}
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <>
              {tab === "browse" && (filteredProjects.length > 0 ? filteredProjects.map(renderProjectCard) : <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No projects found</Text>)}
              {tab === "my_projects" && isProducer && (
                <>
                  <TouchableOpacity style={[styles.createButton, { backgroundColor: colors.primary }]} onPress={() => setShowCreateModal(true)}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.createButtonText}>Create Project</Text>
                  </TouchableOpacity>
                  {myProjects.length > 0 ? myProjects.map(renderProjectCard) : <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No projects yet</Text>}
                </>
              )}
              {tab === "applications" && (applications.length > 0 ? applications.map((m) => (
                <View key={m.match_id} style={[styles.matchCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <Text style={[styles.matchName, { color: colors.text }]}>{m.musician_name || m.producer_name}</Text>
                  <Text style={[styles.matchProject, { color: colors.textSecondary }]}>{m.project_title}</Text>
                  <Text style={[styles.matchStatus, { color: m.status === "pending" ? "#f59e0b" : "#22c55e" }]}>{m.status}</Text>
                </View>
              )) : <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No applications</Text>)}
              {tab === "invites" && (invites.length > 0 ? invites.map((m) => (
                <View key={m.match_id} style={[styles.matchCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
                  <Text style={[styles.matchName, { color: colors.text }]}>{m.musician_name || m.producer_name}</Text>
                  <Text style={[styles.matchProject, { color: colors.textSecondary }]}>{m.project_title}</Text>
                  <Text style={[styles.matchStatus, { color: m.status === "pending" ? "#f59e0b" : "#22c55e" }]}>{m.status}</Text>
                </View>
              )) : <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No invites</Text>)}
            </>
          )}
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontSize: moderateScale(17), fontWeight: "700" }}>Create Project</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity>
            </View>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]} placeholder="Project title" placeholderTextColor={colors.textSecondary} value={newTitle} onChangeText={setNewTitle} />
            <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg, minHeight: 80, textAlignVertical: "top" }]} placeholder="Describe your project..." placeholderTextColor={colors.textSecondary} value={newDescription} onChangeText={setNewDescription} multiline />
            <Text style={[styles.inputLabel, { color: colors.text }]}>Genre</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]} placeholder="e.g. Jazz, Rock" placeholderTextColor={colors.textSecondary} value={newGenre} onChangeText={setNewGenre} />
            <Text style={[styles.inputLabel, { color: colors.text }]}>Location</Text>
            <TextInput style={[styles.input, { color: colors.text, borderColor: borderCol, backgroundColor: cardBg }]} placeholder="e.g. Manila" placeholderTextColor={colors.textSecondary} value={newLocation} onChangeText={setNewLocation} />
            <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]} onPress={handleCreateProject} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create Project</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {alert && <CustomAlert visible type={alert.type} title={alert.title} message={alert.message} onClose={() => setAlert(null)} />}
      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center" as const, alignItems: "center" as const },
  modalBox: { borderRadius: 16, padding: 24, width: "90%" as any, maxWidth: 480, maxHeight: "80%" as any },
  modalHeader: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  tabRow: { flexDirection: "row", paddingHorizontal: 16, borderBottomWidth: 1 },
  tab: { paddingVertical: 12, marginRight: 20 },
  tabText: { fontSize: moderateScale(13), fontWeight: "600" },
  content: { flex: 1, paddingTop: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: moderateScale(14) },
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  cardImage: { width: "100%", height: 120 },
  cardImagePlaceholder: { width: "100%", height: 120, alignItems: "center", justifyContent: "center" },
  cardContent: { padding: 12 },
  cardTitle: { fontSize: moderateScale(15), fontWeight: "700", marginBottom: 4 },
  cardMeta: { fontSize: moderateScale(12), marginBottom: 6 },
  cardStats: { flexDirection: "row", gap: 12, marginBottom: 6 },
  cardStat: { fontSize: moderateScale(11) },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  matchCard: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  matchName: { fontSize: moderateScale(14), fontWeight: "600" },
  matchProject: { fontSize: moderateScale(12), marginTop: 2 },
  matchStatus: { fontSize: moderateScale(11), marginTop: 4, fontWeight: "500" },
  createButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 16, gap: 6 },
  createButtonText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: moderateScale(14) },
  inputLabel: { fontSize: moderateScale(13), fontWeight: "600", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  submitBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  submitBtnText: { color: "#fff", fontSize: moderateScale(15), fontWeight: "700" },
});
