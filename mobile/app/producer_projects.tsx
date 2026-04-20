import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
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
import GuestSignInGate from "../src/components/GuestSignInGate";
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

type Tab = "browse" | "my_projects" | "applications" | "invites";

export default function ProducerProjectsScreen() {
  const { colors, isDark } = useTheme();
  const { session, userId, userRole, isGuest } = useAuth();
  const params = useLocalSearchParams();
  const isProducer = userRole === "producer";

  const [tab, setTab] = useState<Tab>(isProducer ? "my_projects" : "browse");
  const [projects, setProjects] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedProjectIds, setSavedProjectIds] = useState<Set<string>>(new Set());
  const [bookmarkBusyById, setBookmarkBusyById] = useState<Record<string, boolean>>({});

  // Create project modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);

  const [alert, setAlert] = useState<{ type: AlertType; title: string; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!session) return;
    try {
      // Browse published projects
      const { data: browseData } = await supabase.functions.invoke("manage-producer-network", {
        body: { action: "browse_projects", limit: 50 },
      });
      if (browseData?.data) setProjects(browseData.data);

      if (isProducer) {
        // My projects
        const { data: myData } = await supabase.functions.invoke("manage-producer-network", {
          body: { action: "list_my_projects" },
        });
        if (myData?.data) setMyProjects(myData.data);
      }

      // Matches (applications & invites)
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

  useEffect(() => {
    let cancelled = false;

    const syncSavedProjects = async () => {
      if (!userId) {
        setSavedProjectIds(new Set());
        return;
      }

      const projectIds = Array.from(
        new Set(
          [...projects, ...myProjects]
            .map((project) => project?.id)
            .filter((value): value is string => typeof value === "string" && value.length > 0),
        ),
      );

      if (projectIds.length === 0) {
        setSavedProjectIds(new Set());
        return;
      }

      try {
        const { data, error } = await supabase
          .from("favorites")
          .select("project_id")
          .eq("user_id", userId)
          .in("project_id", projectIds);

        if (error) throw error;

        if (!cancelled) {
          setSavedProjectIds(
            new Set(
              (data || [])
                .map((row: any) => row?.project_id)
                .filter((value: any): value is string => typeof value === "string" && value.length > 0),
            ),
          );
        }
      } catch {
        if (!cancelled) {
          setSavedProjectIds(new Set());
        }
      }
    };

    void syncSavedProjects();

    return () => {
      cancelled = true;
    };
  }, [myProjects, projects, userId]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleToggleProjectBookmark = useCallback(async (projectId: string, projectTitle: string, e?: any) => {
    e?.stopPropagation?.();

    if (!userId) {
      showTopToast({ type: "warning", title: "Login required", message: "Please sign in to save productions." });
      return;
    }

    if (!projectId || bookmarkBusyById[projectId]) {
      return;
    }

    const wasSaved = savedProjectIds.has(projectId);

    setBookmarkBusyById((current) => ({ ...current, [projectId]: true }));
    setSavedProjectIds((current) => {
      const next = new Set(current);
      if (wasSaved) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });

    try {
      const { data, error } = await supabase.functions.invoke("manage-details", {
        body: {
          action: "toggle_favorite",
          type: "project",
          id: projectId,
          userId,
        },
      });

      if (error) throw error;

      const nextSaved = typeof data?.is_favorited === "boolean" ? data.is_favorited : !wasSaved;
      setSavedProjectIds((current) => {
        const next = new Set(current);
        if (nextSaved) {
          next.add(projectId);
        } else {
          next.delete(projectId);
        }
        return next;
      });

      showTopToast({
        type: "success",
        title: nextSaved ? "Production saved" : "Production removed",
        message: nextSaved
          ? `${projectTitle || "Project"} was added to your saved productions.`
          : `${projectTitle || "Project"} was removed from your saved productions.`,
      });
    } catch (error: any) {
      setSavedProjectIds((current) => {
        const next = new Set(current);
        if (wasSaved) {
          next.add(projectId);
        } else {
          next.delete(projectId);
        }
        return next;
      });

      showTopToast({
        type: "error",
        title: "Save failed",
        message: error?.message || "Unable to update the saved production right now.",
      });
    } finally {
      setBookmarkBusyById((current) => {
        const next = { ...current };
        delete next[projectId];
        return next;
      });
    }
  }, [bookmarkBusyById, savedProjectIds, userId]);

  const handleCreateProject = async () => {
    if (!newTitle.trim()) {
      setAlert({ type: "warning", title: "Missing Title", message: "Please enter a project title." });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-producer-network", {
        body: {
          action: "create_project",
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          genre: newGenre.trim() || null,
          location: newLocation.trim() || null,
        },
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
    !searchQuery || p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.genre?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderProjectCard = (item: any) => {
    const isSaved = savedProjectIds.has(item.id);
    const bookmarkBusy = !!bookmarkBusyById[item.id];

    return (
    <TouchableOpacity activeOpacity={1}
      key={item.id}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
      onPress={() => router.push({ pathname: "/producer_project_details", params: { project_id: item.id } })}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[
          styles.bookmarkButton,
          { backgroundColor: isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.96)" },
        ]}
        onPress={(e) => handleToggleProjectBookmark(item.id, item.title || "Project", e)}
        disabled={bookmarkBusy}
      >
        {bookmarkBusy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? colors.primary : colors.textSecondary} />
        )}
      </TouchableOpacity>
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
          {item.owner_name || "Producer"} {item.genre ? `â€¢ ${item.genre}` : ""}
        </Text>
        <View style={styles.cardStats}>
          <Text style={[styles.cardStat, { color: colors.textSecondary }]}>
            <Ionicons name="people-outline" size={12} /> {item.filled_roles || 0}/{item.total_roles || 0} roles
          </Text>
          {item.pending_applications > 0 && (
            <Text style={[styles.cardStat, { color: colors.primary }]}>
              {item.pending_applications} pending
            </Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.status === "published" ? "#22c55e20" : "#f59e0b20" }]}>
          <Text style={{ color: item.status === "published" ? "#22c55e" : "#f59e0b", fontSize: moderateScale(11) }}>
            {item.status}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
    );
  };

  const renderMatchCard = (item: any) => (
    <TouchableOpacity activeOpacity={1}
      key={item.match_id}
      style={[styles.matchCard, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}
      onPress={() => router.push({ pathname: "/producer_project_details", params: { project_id: item.project_id } })}
    >
      <CachedImage
        uri={item.musician_avatar || "https://via.placeholder.com/40" }
        style={styles.matchAvatar}
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.matchName, { color: colors.text }]}>{item.musician_name}</Text>
        <Text style={[styles.matchProject, { color: colors.textSecondary }]} numberOfLines={1}>
          {item.project_title} {item.role_title ? `â€¢ ${item.role_title}` : ""}
        </Text>
        <Text style={[styles.matchType, { color: item.match_type === "invite" ? colors.primary : "#f59e0b" }]}>
          {item.match_type === "invite" ? "Invite" : "Application"} â€¢ {item.status}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Producer Projects" onBackPress={() => router.back()} />
        <GuestSignInGate message="Sign in to browse and manage producer projects" />
        
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = isProducer
    ? [
        { key: "my_projects", label: "My Projects" },
        { key: "browse", label: "Browse" },
        { key: "applications", label: "Applications" },
        { key: "invites", label: "Invites" },
      ]
    : [
        { key: "browse", label: "Browse" },
        { key: "applications", label: "My Applications" },
        { key: "invites", label: "Invites" },
      ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Producer Projects" onBackPress={() => router.back()} />

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomWidth: 1, borderBottomColor: isDark ? "#334155" : "#E2E8F0" }]}>
        {tabs.map((t) => (
          <TouchableOpacity activeOpacity={1}
            key={t.key}
            style={[styles.tab, tab === t.key && { borderBottomColor: colors.primary, borderBottomWidth: 2, borderBottomLeftRadius: 1, borderBottomRightRadius: 1 }]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, { color: tab === t.key ? colors.primary : colors.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Search (browse tab) */}
        {tab === "browse" && (
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: isDark ? "#334155" : "#E2E8F0" }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search projects..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        )}

        {loading ? (
          <View style={styles.loadingWrap}>
            {[1, 2, 3].map((i) => <Skeleton key={i} width={SCREEN_WIDTH - 32} height={120} style={{ marginBottom: 12, borderRadius: 12 }} />)}
          </View>
        ) : (
          <>
            {tab === "browse" && (
              filteredProjects.length > 0
                ? filteredProjects.map(renderProjectCard)
                : <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No projects found</Text>
     </View>
            )}

            {tab === "my_projects" && isProducer && (
              <>
                <TouchableOpacity activeOpacity={1}
                  style={[styles.createButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowCreateModal(true)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                  <Text style={styles.createButtonText}>Create Project</Text>
                </TouchableOpacity>
                {myProjects.length > 0
                  ? myProjects.map(renderProjectCard)
                  : <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No projects yet. Create your first project!</Text>
     </View>
                }
              </>
            )}

            {tab === "applications" && (
              applications.length > 0
                ? applications.map(renderMatchCard)
                : <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No applications yet</Text>
     </View>
            )}

            {tab === "invites" && (
              invites.length > 0
                ? invites.map(renderMatchCard)
                : <View style={{flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400}}>
       <Ionicons name="cube-outline" size={48} color={isDark ? "#334155" : "#E2E8F0"} />
       <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No invites yet</Text>
     </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create Project Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={{ color: colors.text, fontSize: moderateScale(17), fontFamily: "Poppins_700Bold" }}>Create Project</Text>
              <TouchableOpacity activeOpacity={1} onPress={() => setShowCreateModal(false)}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
            </View>
          <Text style={[styles.inputLabel, { color: colors.text }]}>Title *</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="Project title"
            placeholderTextColor={colors.textSecondary}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="Describe your project..."
            placeholderTextColor={colors.textSecondary}
            value={newDescription}
            onChangeText={setNewDescription}
            multiline
            numberOfLines={4}
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Genre</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="e.g. Jazz, Rock, Hip-Hop"
            placeholderTextColor={colors.textSecondary}
            value={newGenre}
            onChangeText={setNewGenre}
          />
          <Text style={[styles.inputLabel, { color: colors.text }]}>Location</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: isDark ? "#334155" : "#E2E8F0", backgroundColor: colors.surface }]}
            placeholder="e.g. Manila, Cebu"
            placeholderTextColor={colors.textSecondary}
            value={newLocation}
            onChangeText={setNewLocation}
          />
          <TouchableOpacity activeOpacity={1}
            style={[styles.submitButton, { backgroundColor: colors.primary, opacity: creating ? 0.6 : 1 }]}
            onPress={handleCreateProject}
            disabled={creating}
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Create Project</Text>}
          </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {alert && (
        <CustomAlert
          visible type={alert.type} title={alert.title} message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  tabText: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: moderateScale(14) },
  loadingWrap: { paddingTop: 12 },
  card: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: "hidden" },
  bookmarkButton: { position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", zIndex: 2 },
  cardImage: { width: "100%", height: 120 },
  cardImagePlaceholder: { width: "100%", height: 120, alignItems: "center", justifyContent: "center" },
  cardContent: { padding: 12 },
  cardTitle: { fontSize: moderateScale(15), fontFamily: "Poppins_700Bold", marginBottom: 4 },
  cardMeta: { fontSize: moderateScale(12), marginBottom: 6 },
  cardStats: { flexDirection: "row", gap: 12, marginBottom: 6 },
  cardStat: { fontSize: moderateScale(11) },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  matchCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  matchAvatar: { width: 44, height: 44, borderRadius: 22 },
  matchName: { fontSize: moderateScale(14), fontFamily: "Poppins_600SemiBold" },
  matchProject: { fontSize: moderateScale(12), marginTop: 2 },
  matchType: { fontSize: moderateScale(11), marginTop: 4, fontFamily: "Poppins_500Medium" },
  createButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginBottom: 16, gap: 6 },
  createButtonText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
  emptyText: { textAlign: "center", marginTop: 12, fontSize: moderateScale(15), fontFamily: "Poppins_500Medium" },
  modalContent: { padding: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  inputLabel: { fontSize: moderateScale(13), fontFamily: "Poppins_600SemiBold", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: moderateScale(14) },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  submitButton: { alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  submitButtonText: { color: "#fff", fontSize: moderateScale(15), fontFamily: "Poppins_700Bold" },
});
