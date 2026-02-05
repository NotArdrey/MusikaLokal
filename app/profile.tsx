import { Ionicons } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import Header from "../src/components/header";
import Navbar from "../src/components/navbar";
import { DEFAULT_AVATAR } from "../src/constants/Images";
import { useAuth } from "../src/context/AuthContext";
import { useTheme } from "../src/context/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;
const NUM_COLUMNS = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * (NUM_COLUMNS + 1)) / NUM_COLUMNS;

export default function ProfileScreen() {
  const { colors, isDark } = useTheme();
  const { session, loading: authLoading, userId: currentUserId } = useAuth();
  const params = useLocalSearchParams<{ userId?: string }>();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  // Refresh profile data every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!authLoading) {
        fetchProfile();
      }
    }, [params.userId, authLoading, currentUserId]),
  );

  async function fetchProfile() {
    try {
      // Determine target ID: param OR current user
      // Handle case where userId might be an array
      const paramUserId = Array.isArray(params.userId)
        ? params.userId[0]
        : params.userId;
      let targetId = paramUserId || currentUserId;
      console.log("👤 Profile - Param userId:", paramUserId);
      console.log("👤 Profile - Context userId:", currentUserId);

      // If still no targetId, try to get from auth directly
      if (!targetId) {
        console.log("⚠️ Profile - No userId, fetching from auth...");
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) {
          console.log("❌ Profile - Auth error:", error.message);
        }
        if (user) {
          console.log("✅ Profile - Got user from auth:", user.id);
          targetId = user.id;
        }
      }

      if (!targetId) {
        console.log("❌ Profile - No user ID available, redirecting to login");
        // No user logged in and no userId param - redirect to login
        router.replace("/");
        return;
      }

      console.log("🎯 Profile - Fetching profile for:", targetId);

      // Check ownership
      const ownership = currentUserId && targetId === currentUserId;
      setIsOwner(!!ownership);

      // Fetch profile data
      const { data, error } = await supabase.functions.invoke(
        "manage-profile",
        {
          body: { action: "fetch", userId: targetId },
        },
      );
      if (error) throw error;
      setProfile(data);
    } catch (e) {
      console.log("Error fetching profile:", e);
    } finally {
      setLoading(false);
    }
  }

  const MENU_ITEMS = [
    { label: "Edit Profile", icon: "person-outline", route: "/edit_profile" },
    { label: "Wallet", icon: "wallet-outline", route: "/wallet" },
    { label: "Settings", icon: "settings-outline", route: "/settings" },
  ];

  const [uploading, setUploading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaModalVisible, setMediaModalVisible] = useState(false);

  // Check if URL is a video
  const isVideo = (url: string) => {
    const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    return videoExtensions.some((ext) => url.toLowerCase().includes(ext));
  };

  const openMediaViewer = (url: string) => {
    setSelectedMedia(url);
    setMediaModalVisible(true);
  };

  const addMediaToPortfolio = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in.");
        return;
      }

      const permissionResult =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission needed", "Please allow access to your photos.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: true,
        quality: 0.5,
      });

      if (result.canceled || !result.assets[0]) return;

      const file = result.assets[0];
      setUploading(true);

      const fileExt = file.uri.split(".").pop()?.toLowerCase() || "jpg";
      const fileName = `${user.id}/portfolio/${Date.now()}.${fileExt}`;
      const mimeType =
        file.mimeType ||
        (fileExt === "mp4"
          ? "video/mp4"
          : `image/${fileExt === "jpg" ? "jpeg" : fileExt}`);

      console.log("📤 Uploading portfolio media...");
      console.log("📍 File URI:", file.uri);
      console.log("📁 File name:", fileName);

      // Create FormData for upload
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: fileName.split("/").pop(),
        type: mimeType,
      } as any);

      // Get Supabase URL and key from the client
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      // Get current session for auth
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || supabaseKey;

      // Upload directly via fetch with FormData
      const uploadResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/avatars/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "x-upsert": "true",
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("❌ Upload failed:", errorText);
        throw new Error(errorText || "Upload failed");
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      console.log("✅ Uploaded:", urlData.publicUrl);

      // Add URL to portfolio_urls via Edge Function
      await supabase.functions.invoke("manage-profile", {
        body: {
          action: "add_media",
          userId: user.id,
          mediaUrl: urlData.publicUrl,
        },
      });

      // Refresh profile
      fetchProfile();
      Alert.alert("Success", "Media added to portfolio!");
    } catch (e: any) {
      console.log("Upload error:", e);
      Alert.alert("Error", e.message || "Failed to upload media");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View
        style={[styles.centerContainer, { backgroundColor: colors.background }]}
      >
        <Text style={{ color: colors.textSecondary }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.flex1, { backgroundColor: colors.background }]}>
        <Header title={isOwner ? "My Profile" : "User Profile"} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Profile Header */}
          <View style={styles.headerProfile}>
            <View style={styles.avatarWrapper}>
              <View
                style={[
                  styles.avatarContainer,
                  { borderColor: colors.surface },
                ]}
              >
                <Image
                  source={
                    profile?.avatar_url
                      ? { uri: profile.avatar_url }
                      : DEFAULT_AVATAR
                  }
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              </View>

              {isOwner && (
                <TouchableOpacity
                  onPress={() => router.push("/edit_profile")}
                  style={[
                    styles.editIconBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="pencil" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.nameText, { color: colors.text }]}>
              {profile?.full_name || "User"}
            </Text>
            <Text style={[styles.roleText, { color: colors.textSecondary }]}>
              {profile?.role === "musician"
                ? profile?.skills?.join(", ") || "Musician"
                : profile?.role === "studio-owner"
                  ? "Studio Owner"
                  : profile?.role === "venue-owner"
                    ? "Venue Owner"
                    : profile?.role
                      ? profile.role.charAt(0).toUpperCase() +
                      profile.role.slice(1)
                      : "User"}{" "}
              • {profile?.location || "Unknown"}
            </Text>

            <View style={styles.genreRow}>
              {(profile?.genres || ["Rock", "Indie"]).map((genre: string) => (
                <View
                  key={genre}
                  style={[
                    styles.genreTag,
                    { backgroundColor: isDark ? "#1E293B" : "#F3F4F6" },
                  ]}
                >
                  <Text
                    style={[styles.genreText, { color: colors.textSecondary }]}
                  >
                    {genre}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.rating
                    ? `${Math.round(profile.rating * 20)}%`
                    : "N/A"}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Rating
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {profile?.review_count || 0}
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Reviews
                </Text>
              </View>
              <View
                style={[styles.statDivider, { backgroundColor: colors.border }]}
              />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  -
                </Text>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Active
                </Text>
              </View>
            </View>
          </View>

          {/* Menu Items (Owner Only) */}
          {isOwner ? (
            <View style={styles.menuContainer}>
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={() => router.push(item.route as any)}
                  style={[styles.menuItem, { backgroundColor: colors.surface }]}
                >
                  <View style={styles.menuLeft}>
                    <View
                      style={[
                        styles.iconBox,
                        { backgroundColor: isDark ? "#1E293B" : "#F9FAFB" },
                      ]}
                    >
                      <Ionicons
                        name={item.icon as any}
                        size={20}
                        color={colors.text}
                      />
                    </View>
                    <Text style={[styles.menuLabel, { color: colors.text }]}>
                      {item.label}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* Public View Actions */
            <View style={styles.menuContainer}>
              <TouchableOpacity
                onPress={() =>
                  router.push(
                    "/report?type=profile&name=Jared%20Lopez%20Bagtas" as any,
                  )
                }
                style={[styles.menuItem, { backgroundColor: colors.surface }]}
              >
                <View style={styles.menuLeft}>
                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: isDark ? "#450a0a" : "#fef2f2" },
                    ]}
                  >
                    <Ionicons name="flag-outline" size={20} color="#ef4444" />
                  </View>
                  <Text style={[styles.menuLabel, { color: "#ef4444" }]}>
                    Report User
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Resume/CV Section - Only show if resume exists */}
          {profile?.resume_url && (
            <View style={styles.resumeSection}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: colors.text, marginBottom: 12 },
                ]}
              >
                Resume / CV
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL(profile.resume_url)}
                style={[
                  styles.resumeCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.resumeIconBox,
                    { backgroundColor: isDark ? "#1E293B" : "#FEF2F2" },
                  ]}
                >
                  <Ionicons name="document-text" size={28} color="#EF4444" />
                </View>
                <View style={styles.resumeInfo}>
                  <Text style={[styles.resumeTitle, { color: colors.text }]}>
                    View Resume
                  </Text>
                  <Text
                    style={[
                      styles.resumeSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Tap to open PDF
                  </Text>
                </View>
                <Ionicons
                  name="open-outline"
                  size={20}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Media Section - Instagram Style Grid */}
          <View style={styles.mediaSection}>
            <View style={styles.mediaSectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Media & Portfolio
              </Text>
              {isOwner && profile?.portfolio_urls?.length > 0 && (
                <TouchableOpacity
                  onPress={addMediaToPortfolio}
                  disabled={uploading}
                  activeOpacity={0.8}
                  style={[
                    styles.addMediaBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {!profile?.portfolio_urls || profile.portfolio_urls.length === 0 ? (
              <View style={[styles.emptyMedia, { borderColor: colors.border }]}>
                <Ionicons
                  name="images-outline"
                  size={48}
                  color={colors.textSecondary}
                />
                <Text
                  style={[
                    styles.emptyMediaText,
                    { color: colors.textSecondary },
                  ]}
                >
                  No media yet
                </Text>
                <Text
                  style={[styles.emptyMediaSubtext, { color: colors.muted }]}
                >
                  {isOwner
                    ? "Share your best work!"
                    : "This musician hasn't added media yet"}
                </Text>
                {isOwner && (
                  <TouchableOpacity
                    onPress={addMediaToPortfolio}
                    disabled={uploading}
                    activeOpacity={0.8}
                    style={[
                      styles.uploadBtn,
                      {
                        backgroundColor: uploading
                          ? colors.textSecondary
                          : colors.primary,
                      },
                    ]}
                  >
                    <Ionicons
                      name="cloud-upload-outline"
                      size={18}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.uploadBtnText}>
                      {uploading ? "Uploading..." : "Add Photos & Videos"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.mediaGrid}>
                {profile.portfolio_urls.map((url: string, i: number) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.gridItem}
                    onPress={() => openMediaViewer(url)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.gridImage}
                      resizeMode="cover"
                    />
                    {isVideo(url) && (
                      <View style={styles.videoIndicator}>
                        <Ionicons name="play" size={24} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Media Viewer Modal */}
          <Modal
            visible={mediaModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMediaModalVisible(false)}
          >
            <View style={styles.modalContainer}>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setMediaModalVisible(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>

              {selectedMedia &&
                (isVideo(selectedMedia) ? (
                  <Video
                    source={{ uri: selectedMedia }}
                    style={styles.modalMedia}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay
                  />
                ) : (
                  <Image
                    source={{ uri: selectedMedia }}
                    style={styles.modalMedia}
                    resizeMode="contain"
                  />
                ))}
            </View>
          </Modal>
        </ScrollView>
        <Navbar />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingBottom: 150,
  },
  headerProfile: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarContainer: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 4,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  editIconBtn: {
    position: "absolute",
    bottom: 16,
    right: 0,
    padding: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  nameText: {
    fontSize: 20,
    marginBottom: 4,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
  },
  roleText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  genreRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 24,
  },
  genreTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  genreText: {
    fontSize: 12,
    fontFamily: "Poppins_500Medium",
  },
  statsContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
  },
  statLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
  },
  statDivider: {
    width: 1,
    height: "100%",
  },
  menuContainer: {
    paddingHorizontal: 24,
    gap: 12,
  },
  menuItem: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 15,
  },
  mediaSection: {
    marginTop: 24,
  },
  mediaSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  addMediaBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyMedia: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    marginHorizontal: 24,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 16,
  },
  emptyMediaText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
  emptyMediaSubtext: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    paddingHorizontal: 32,
  },
  uploadBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  uploadBtnText: {
    fontFamily: "Poppins_500Medium",
    color: "#fff",
    fontSize: 14,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: GRID_GAP / 2,
    position: "relative",
  },
  gridImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1a1a1a",
  },
  videoIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    padding: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  modalMedia: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  resumeSection: {
    marginTop: 24,
    paddingHorizontal: 24,
  },
  resumeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  resumeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  resumeTitle: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  resumeSubtitle: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
  },
});
